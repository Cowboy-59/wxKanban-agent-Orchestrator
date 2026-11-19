// [SCOPE 075 / T5] BEGIN — portfolio analysis report (build/extend/share) generator.
// Reads the company's capabilityindex (across all its projects), detects cross-project overlaps,
// asks the LLM for a build/extend/share recommendation per overlap (fail-open), renders markdown
// → PDF, and upserts a per-project PortfolioAnalysis doc. On-demand / admin-triggered.
import { pool } from "~/db/client.js";
import { generateOnce } from "~/server/ai/llm-provider.js";
import { MarkdownPdfRenderer } from "~/server/services/MarkdownPdfRenderer.js";
import { ProjectDocumentService } from "~/server/services/ProjectDocumentService.js";
import { createLogger } from "~/server/lib/logger.js";

const logger = createLogger("portfolio-analysis-generator");
const DOCTYPE = "PortfolioAnalysis";

interface CapRow {
  owner: string;
  sourceref: string;
  capabilitytype: string;
  name: string;
  projectid: string;
  projectname: string;
}

interface Overlap {
  name: string;
  capabilityType: string;
  occurrences: { projectName: string; owner: string }[];
}

interface Recommendation {
  name: string;
  recommendation: string; // new app | shared workflow | feature in existing
  rationale: string;
}

const REC_SYSTEM =
  "You advise whether duplicated capabilities across a company's projects should become a new app, " +
  "a shared company workflow, or a feature in an existing app. Output ONLY a JSON array — no prose, no fences.";

async function loadCompanyCaps(companyId: string): Promise<CapRow[]> {
  const { rows } = await pool.query(
    `SELECT ci.owner, ci.sourceref, ci.capabilitytype, ci.name, cp.id AS projectid, cp.name AS projectname
     FROM capabilityindex ci
     JOIN companyprojects cp ON cp.id = ci.projectid
     WHERE cp.companyid = $1`,
    [companyId],
  );
  return rows as CapRow[];
}

function detectOverlaps(caps: CapRow[]): Overlap[] {
  const byKey = new Map<string, CapRow[]>();
  for (const c of caps) {
    const key = `${c.capabilitytype}|${c.name.toLowerCase().trim()}`;
    (byKey.get(key) ?? byKey.set(key, []).get(key)!).push(c);
  }
  const overlaps: Overlap[] = [];
  for (const group of byKey.values()) {
    const projects = new Set(group.map((g) => g.projectid));
    if (projects.size >= 2) {
      overlaps.push({
        name: group[0].name,
        capabilityType: group[0].capabilitytype,
        occurrences: group.map((g) => ({ projectName: g.projectname, owner: g.owner })),
      });
    }
  }
  return overlaps.sort((a, b) => b.occurrences.length - a.occurrences.length || a.name.localeCompare(b.name));
}

async function recommend(overlaps: Overlap[]): Promise<Map<string, Recommendation>> {
  const out = new Map<string, Recommendation>();
  if (overlaps.length === 0) return out;
  try {
    const list = overlaps
      .slice(0, 30)
      .map((o) => `- ${o.name} (${o.capabilityType}) in ${o.occurrences.length} projects: ${o.occurrences.map((x) => x.projectName).join(", ")}`)
      .join("\n");
    const raw = await generateOnce(
      `Duplicated capabilities across a company's projects:\n${list}\n\n` +
        `For each, recommend one of: "new app", "shared workflow", "feature in existing". ` +
        `Return JSON array: [{"name":"<capability name>","recommendation":"<one of the three>","rationale":"<one line>"}]`,
      { systemPrompt: REC_SYSTEM, temperature: 0.2, maxTokens: 1500 },
    );
    const json = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const arr = JSON.parse(json) as Recommendation[];
    for (const r of Array.isArray(arr) ? arr : []) {
      if (r && typeof r.name === "string") out.set(r.name.toLowerCase().trim(), r);
    }
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "portfolio recommendation failed (swallowed — overlaps still reported)");
  }
  return out;
}

function renderMarkdown(projectCount: number, capCount: number, overlaps: Overlap[], recs: Map<string, Recommendation>): string {
  const lines: string[] = ["# Portfolio Capability Analysis", ""];
  lines.push(`Across **${projectCount}** projects, **${capCount}** indexed capabilities, **${overlaps.length}** cross-project overlaps.`, "");
  lines.push("> Advisory. Recommendations are for humans to act on — nothing is changed automatically.", "");

  lines.push("## Cross-project overlaps — build / extend / share", "");
  if (overlaps.length === 0) {
    lines.push("_No capability appears in more than one project. No consolidation opportunities detected._");
  } else {
    for (const o of overlaps) {
      const rec = recs.get(o.name.toLowerCase().trim());
      lines.push(`### ${o.name} _(${o.capabilityType})_`);
      lines.push(`Appears in ${o.occurrences.length}: ${o.occurrences.map((x) => `${x.projectName} (${x.owner})`).join(", ")}`);
      if (rec) lines.push("", `**Recommendation: ${rec.recommendation}** — ${rec.rationale}`);
      lines.push("");
    }
  }
  return lines.join("\n");
}

/** Generate the PortfolioAnalysis report (markdown + PDF) for a company, stored on `projectId`. */
export async function generatePortfolioAnalysis(
  companyId: string,
  projectId: string,
  createdById: string | null,
): Promise<{ overlaps: number; capabilities: number }> {
  const caps = await loadCompanyCaps(companyId);
  const projectCount = new Set(caps.map((c) => c.projectid)).size;
  const overlaps = detectOverlaps(caps);
  const recs = await recommend(overlaps);
  const markdown = renderMarkdown(projectCount, caps.length, overlaps, recs);
  const pdf = await MarkdownPdfRenderer.renderToPdf(markdown, "Portfolio Capability Analysis");
  await ProjectDocumentService.upsertDocumentWithPdf(projectId, DOCTYPE, "Portfolio Capability Analysis", markdown, pdf, createdById);
  logger.info({ companyId, projectId, overlaps: overlaps.length, capabilities: caps.length }, "portfolio analysis generated");
  return { overlaps: overlaps.length, capabilities: caps.length };
}
// [SCOPE 075 / T5] END
