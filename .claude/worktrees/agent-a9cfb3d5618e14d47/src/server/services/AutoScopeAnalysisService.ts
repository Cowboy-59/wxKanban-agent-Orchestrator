// [SCOPE 077 / T003] BEGIN — automated semantic scope analysis (app-server LLM, fail-open).
// The automatic counterpart to SCOPE-060's on-demand /analyzescope. Reads a scope + the
// deterministic context already computed by SCOPE-074 (common-process candidates) and SCOPE-073
// (structural warnings), and uses the app's llm-provider to derive the scope's true dependencies,
// reuse recommendations, and gaps. Fail-open (mirrors SCOPE-063 BugSuggestionService): any error
// returns null and is swallowed — never blocks the originating operation. Runs in the app server
// (NOT the kit/MCP — kit-is-a-workflow-engine keeps AI out of the kit). Customer-LLM via SCOPE-076
// is honored through the llm-provider per-call override when configured.
import { and, eq, gt, isNull, lt, or } from "drizzle-orm";
import { generateOnce } from "~/server/ai/llm-provider.js";
import { createLogger } from "~/server/lib/logger.js";
import { db } from "~/db/client.js";
import { projectspecifications } from "~/db/schema/projectspecification.js";
import { projectdocuments } from "~/db/schema/projectdocuments.js";
import { indexScopeFromContent } from "~/server/services/PortfolioCapabilityService.js"; // [SCOPE 075 / T3]

const logger = createLogger("auto-scope-analysis");

const AUTO_DOCTYPE = "AutoScopeAnalysis";
// Only analyze a scope once its edits have settled (debounce) and re-analyze only when the
// scope changed after its last analysis. Caps LLM calls per sweep.
const DEBOUNCE_MS = 30_000;

export interface ReuseRecommendation {
  /** the capability this scope describes that already exists elsewhere */
  capability: string;
  /** the owning unit (e.g. "SCOPE-043") */
  owner: string;
  /** one line: why it's a match + what to reuse */
  rationale: string;
}

export interface AutoScopeAnalysis {
  /** derived dependency refs (e.g. ["SCOPE-042", "SPEC-028"]) — the scope's true Depends On */
  derivedDependsOn: string[];
  /** processes that already exist and should be reused, not rebuilt */
  reuse: ReuseRecommendation[];
  /** what's missing/wrong relative to the current system */
  gaps: string[];
}

export interface AutoScopeAnalysisInput {
  scopeNumber: number;
  scopeTitle?: string;
  /** the scope doc markdown (truncated before the LLM call) */
  scopeContent: string;
  /** SCOPE-074 common-process candidates, pre-formatted as text (optional) */
  commonProcessCandidates?: string;
  /** SCOPE-073 structural warnings for this scope, pre-formatted as text (optional) */
  structuralWarnings?: string;
}

const SYSTEM_PROMPT =
  "You are a principal software architect auditing one scope against an existing system. " +
  "You derive a scope's true dependencies, spot capabilities that already exist (so they aren't rebuilt), " +
  "and flag gaps. Output ONLY a compact JSON object — no prose, no markdown fences.";

/**
 * Best-effort semantic analysis of a single scope. Returns null on any failure (never throws).
 * The caller assembles the deterministic context (074 candidates / 073 warnings) and persists
 * + writes back the result; this method only does the LLM reasoning.
 */
export async function analyzeScope(input: AutoScopeAnalysisInput): Promise<AutoScopeAnalysis | null> {
  try {
    const userPrompt =
      `SCOPE-${String(input.scopeNumber).padStart(3, "0")}${input.scopeTitle ? ` — ${input.scopeTitle}` : ""}\n\n` +
      `Scope document (truncated):\n${input.scopeContent.slice(0, 8000)}\n\n` +
      (input.commonProcessCandidates
        ? `Existing capabilities that look similar (from the semantic index):\n${input.commonProcessCandidates.slice(0, 2000)}\n\n`
        : "") +
      (input.structuralWarnings
        ? `Known structural warnings for this scope:\n${input.structuralWarnings.slice(0, 1500)}\n\n`
        : "") +
      `Return JSON exactly: {` +
      `"derivedDependsOn":["SCOPE-NNN or SPEC-NNN it truly depends on; honor the SCOPE vs SPEC namespace"],` +
      `"reuse":[{"capability":"<what this scope describes that already exists>","owner":"SCOPE-NNN","rationale":"<one line>"}],` +
      `"gaps":["<what is missing or wrong vs the current system>"]}`;

    const raw = await generateOnce(userPrompt, { systemPrompt: SYSTEM_PROMPT, temperature: 0.2, maxTokens: 1200 });
    const json = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const parsed = JSON.parse(json) as Partial<AutoScopeAnalysis>;

    return {
      derivedDependsOn: cleanStrings(parsed.derivedDependsOn).slice(0, 40),
      reuse: Array.isArray(parsed.reuse)
        ? parsed.reuse
            .filter((r): r is ReuseRecommendation => !!r && typeof r.capability === "string" && typeof r.owner === "string")
            .map((r) => ({
              capability: String(r.capability).slice(0, 200),
              owner: String(r.owner).slice(0, 40),
              rationale: String(r.rationale ?? "").slice(0, 300),
            }))
            .slice(0, 40)
      : [],
      gaps: cleanStrings(parsed.gaps).slice(0, 40),
    };
  } catch (err) {
    logger.warn({ scope: input.scopeNumber, err: (err as Error).message }, "auto scope analysis failed (swallowed)");
    return null;
  }
}

function cleanStrings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).map((x) => (x as string).trim().slice(0, 400)) : [];
}

/** Render the analysis as the AutoScopeAnalysis projectdocuments markdown (pure). */
export function formatAnalysisMarkdown(scopeNumber: number, analysis: AutoScopeAnalysis): string {
  const n = String(scopeNumber).padStart(3, "0");
  const lines: string[] = [`# Auto Scope Analysis — SCOPE-${n}`, ""];
  lines.push("> Automated, non-blocking. Authoritative findings + severities belong to `/analyzescope` (SCOPE-060).", "");

  lines.push("## Derived dependencies", "");
  lines.push(analysis.derivedDependsOn.length ? analysis.derivedDependsOn.map((d) => `- ${d}`).join("\n") : "_none derived_");
  lines.push("");

  lines.push("## Reuse recommendations", "");
  lines.push(
    analysis.reuse.length
      ? analysis.reuse.map((r) => `- **${r.capability}** → reuse **${r.owner}** — ${r.rationale}`).join("\n")
      : "_no existing capability matched — appears net-new_",
  );
  lines.push("");

  lines.push("## Gaps / issues vs the current system", "");
  lines.push(analysis.gaps.length ? analysis.gaps.map((g) => `- ${g}`).join("\n") : "_none flagged_");
  lines.push("");
  return lines.join("\n");
}
// [SCOPE 077 / T003] END

// [SCOPE 077 / T001-7] BEGIN — debounced sweep: find settled, stale scopes; analyze; persist.
// Driven by the background job (jobs/autoScopeAnalysisJobs.ts). Reads scope content + the
// project's scopeflow warnings directly from the shared DB (app DB == hosted MCP DB).
// Non-blocking / fail-open per scope. Returns the count analyzed.
function extractWarningsForScope(scopeflowMarkdown: string | undefined, scopeNumber: number): string | undefined {
  if (!scopeflowMarkdown) return undefined;
  const n = String(scopeNumber).padStart(3, "0");
  const lines = scopeflowMarkdown.split(/\r?\n/).filter((l) => l.includes(`SCOPE-${n}`) && /warn|cycle|missing|collision|reciprocal/i.test(l));
  return lines.length ? lines.join("\n") : undefined;
}

async function persistAnalysis(projectId: string, specId: string, scopeNumber: number, analysis: AutoScopeAnalysis): Promise<void> {
  const content = formatAnalysisMarkdown(scopeNumber, analysis);
  const [existing] = await db
    .select({ id: projectdocuments.id })
    .from(projectdocuments)
    .where(and(eq(projectdocuments.projectid, projectId), eq(projectdocuments.specid, specId), eq(projectdocuments.doctype, AUTO_DOCTYPE)))
    .limit(1);
  if (existing) {
    await db.update(projectdocuments).set({ content, updatedat: new Date() }).where(eq(projectdocuments.id, existing.id));
  } else {
    await db.insert(projectdocuments).values({
      projectid: projectId,
      specid: specId,
      doctype: AUTO_DOCTYPE,
      title: `Auto Scope Analysis — SCOPE-${String(scopeNumber).padStart(3, "0")}`,
      content,
      isgenerated: true,
    });
  }
}

export async function runAutoScopeAnalysisSweep(maxScopes = 3): Promise<{ analyzed: number }> {
  const cutoff = new Date(Date.now() - DEBOUNCE_MS);
  // specs whose content settled (updatedat < cutoff) and changed since their last AutoScopeAnalysis doc
  const due = await db
    .select({
      id: projectspecifications.id,
      projectid: projectspecifications.projectid,
      specnumber: projectspecifications.specnumber,
      title: projectspecifications.title,
      content: projectspecifications.content,
      updatedat: projectspecifications.updatedat,
      docupdatedat: projectdocuments.updatedat,
    })
    .from(projectspecifications)
    .leftJoin(
      projectdocuments,
      and(
        eq(projectdocuments.specid, projectspecifications.id),
        eq(projectdocuments.doctype, AUTO_DOCTYPE),
      ),
    )
    .where(
      and(
        lt(projectspecifications.updatedat, cutoff),
        or(isNull(projectdocuments.updatedat), gt(projectspecifications.updatedat, projectdocuments.updatedat)),
      ),
    )
    .orderBy(projectspecifications.updatedat)
    .limit(maxScopes);

  let analyzed = 0;
  for (const spec of due) {
    const scopeNumber = parseInt(spec.specnumber, 10);
    if (Number.isNaN(scopeNumber)) continue;
    try {
      const [flowDoc] = await db
        .select({ content: projectdocuments.content })
        .from(projectdocuments)
        .where(and(eq(projectdocuments.projectid, spec.projectid), eq(projectdocuments.doctype, "scopeflow"), isNull(projectdocuments.specid)))
        .limit(1);
      const analysis = await analyzeScope({
        scopeNumber,
        scopeTitle: spec.title,
        scopeContent: spec.content,
        structuralWarnings: extractWarningsForScope(flowDoc?.content, scopeNumber),
      });
      if (analysis) {
        await persistAnalysis(spec.projectid, spec.id, scopeNumber, analysis);
        analyzed += 1;
      }
      // [SCOPE 075 / T3] owned-surface producer: (re)index this scope's capabilities (fail-open)
      await indexScopeFromContent(spec.projectid, scopeNumber, spec.content);
    } catch (err) {
      logger.warn({ scope: scopeNumber, err: (err as Error).message }, "auto scope analysis sweep item failed (swallowed)");
    }
  }
  if (analyzed) logger.info({ analyzed }, "auto scope analysis sweep complete");
  return { analyzed };
}
// [SCOPE 077 / T001-7] END
