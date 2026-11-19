// [SCOPE 043 / T017] BEGIN — materialize accepted-to-scope feedback seeds
// When a wxperts dev opens the wxKanban (feedback-sink) project, the kit pulls
// scope seeds the SysAdmin accepted-to-scope (project.list_scope_seeds), assigns
// a collision-safe NNN by scanning BOTH specs/ and specs/Project-Scope/ (FR-014),
// writes a draft specs/Project-Scope/NNN-<shortname>.md from the seed, and
// reports the number back (project.record_scope_materialized) so the feedback row
// gains durable traceability (FR-015). The hosted server cannot read/write the
// dev's working tree, so numbering + the file write happen here.
import * as fs from "fs";
import * as path from "path";
import { McpClient, getDefaultMcpClient, resolveProjectId } from "../../http/mcp-client";

export interface ScopeSeed {
  title: string;
  shortname: string;
  body: string;
  sourceFeedbackId: string;
}

export interface MaterializeResult {
  feedbackId: string;
  scopeNumber: string | null;
  file: string | null;
  status: "written" | "skipped-exists" | "error";
  error?: string;
}

// Unwrap the MCP wire envelope ({ content: [{ text }] }) into the inner JSON.
function unwrap<T>(data: unknown): T {
  const d = data as { content?: Array<{ text?: string }> } | T;
  const text = (d as { content?: Array<{ text?: string }> })?.content?.[0]?.text;
  return (text ? JSON.parse(text) : d) as T;
}

// Highest scope number already used across BOTH specs/ and specs/Project-Scope/.
// Any entry whose name begins with three digits counts (dir or .md file).
function scanMaxScopeNumber(projectRoot: string): number {
  const dirs = [path.join(projectRoot, "specs"), path.join(projectRoot, "specs", "Project-Scope")];
  let max = 0;
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      const m = name.match(/^(\d{3})/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
  }
  return max;
}

// Next free NNN, accounting for numbers already assigned earlier in this run.
function nextFreeScopeNumber(projectRoot: string, taken: Set<number>): string {
  let n = Math.max(scanMaxScopeNumber(projectRoot), ...(taken.size ? [...taken] : [0])) + 1;
  while (taken.has(n)) n++;
  taken.add(n);
  return String(n).padStart(3, "0");
}

function sanitizeShortName(seed: ScopeSeed): string {
  const base = (seed.shortname || seed.title || "feedback-scope")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return base || "feedback-scope";
}

// A minimal Scope-of-Project draft — buildscope refines it. The customer's own
// words are the problem statement; the source feedback id is recorded for FR-015.
export function renderScopeSeedFile(nnn: string, seed: ScopeSeed): string {
  return [
    `# Scope ${nnn}: ${seed.title}`,
    "",
    "> **Draft seed** — generated from accepted user feedback. Refine with `buildscope --edit " +
      nnn +
      "` before implementation.",
    "",
    "## Business Problem",
    "",
    seed.body?.trim() || "_(no body captured)_",
    "",
    "## Scope Boundary",
    "",
    "_To be defined via buildscope._",
    "",
    "## Constraints & Notes",
    "",
    `- Seeded from feedback \`${seed.sourceFeedbackId}\` ("${seed.title}").`,
    "",
  ].join("\n");
}

/**
 * Pull pending scope seeds for the sink project and materialize each to a draft
 * scope file. Idempotent and collision-safe: an existing target file is never
 * overwritten (the seed is reported as skipped), and numbers assigned in this
 * run are not reused. Returns a per-seed summary.
 */
export async function materializeScopeSeeds(opts: {
  projectRoot?: string;
  client?: McpClient;
}): Promise<MaterializeResult[]> {
  const projectRoot = opts.projectRoot ?? process.cwd();
  const client = opts.client ?? getDefaultMcpClient(projectRoot);
  const projectId = resolveProjectId({ projectRoot });
  if (!projectId) {
    throw new Error("materialize-seeds: no projectId resolved for this workspace.");
  }

  const listed = await client.callTool<unknown>("project.list_scope_seeds", { projectId });
  if (!listed.ok) {
    throw new Error(`list_scope_seeds failed (${listed.status}): ${listed.error ?? "unknown"}`);
  }
  const { seeds } = unwrap<{ seeds: Array<{ feedbackId: string; seed: ScopeSeed }> }>(listed.data);
  if (!seeds?.length) return [];

  const scopeDir = path.join(projectRoot, "specs", "Project-Scope");
  fs.mkdirSync(scopeDir, { recursive: true });

  const taken = new Set<number>();
  const results: MaterializeResult[] = [];

  for (const { feedbackId, seed } of seeds) {
    try {
      const nnn = nextFreeScopeNumber(projectRoot, taken);
      const file = path.join(scopeDir, `${nnn}-${sanitizeShortName(seed)}.md`);
      if (fs.existsSync(file)) {
        // FR-014: never clobber. Surface the conflict; release the number.
        taken.delete(parseInt(nnn, 10));
        results.push({ feedbackId, scopeNumber: null, file, status: "skipped-exists" });
        continue;
      }
      fs.writeFileSync(file, renderScopeSeedFile(nnn, seed), "utf-8");

      const recorded = await client.callTool<unknown>("project.record_scope_materialized", {
        projectId,
        feedbackId,
        scopeNumber: nnn,
      });
      if (!recorded.ok) {
        results.push({
          feedbackId,
          scopeNumber: nnn,
          file,
          status: "error",
          error: `record_scope_materialized failed (${recorded.status}): ${recorded.error ?? "unknown"}`,
        });
        continue;
      }
      results.push({
        feedbackId,
        scopeNumber: nnn,
        file: path.relative(projectRoot, file),
        status: "written",
      });
    } catch (err) {
      results.push({
        feedbackId,
        scopeNumber: null,
        file: null,
        status: "error",
        error: (err as Error).message,
      });
    }
  }

  return results;
}
// [SCOPE 043 / T017] END
