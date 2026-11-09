// [SCOPE 154 / T003] BEGIN — startup list from the server devplan (FR-002)
//
// On run start, Autopilot reads the server's own devplan document (SCOPE-081
// devplan-generator.ts) rather than re-deriving build order itself — the devplan is already the
// authoritative, foundation-up ordering of every scope. It is then filtered to scopes that are
// not yet done, using `project.scope_stage` (SCOPE-123) as the source of truth for "done" rather
// than the devplan's own emoji, since the devplan can be stale between runs. No devplan document
// found means no run starts at all (FR-002): Autopilot never guesses an order of its own.
//
// Both MCP calls are raw POSTs to `/mcp` with the bound per-run token, mirroring
// `triage-fingerprint.ts`'s `listFeedback()` — the server's `/mcp` transport is stateless and
// configured for plain JSON (`enableJsonResponse: true`), never SSE, so a response is always one
// directly-parsable `{jsonrpc, id, result: {content: [{type:'text', text}]}}` envelope.

export interface AutopilotMcpSource {
  mcpUrl: string;
  mcpToken: string;
  projectId: string;
}

/** One `tools/call` POST to `/mcp`, parsed the way every tool on this server answers. */
async function callMcpTool(
  src: AutopilotMcpSource,
  name: string,
  args: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  const res = await fetchImpl(`${src.mcpUrl.replace(/\/$/, "")}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${src.mcpToken}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`${name} failed (${res.status}): ${body.slice(0, 200)}`);
  const env = JSON.parse(body) as { result?: { content?: Array<{ text?: string }> }; error?: { message?: string } };
  if (env.error) throw new Error(`${name} failed: ${env.error.message ?? "unknown error"}`);
  const text = env.result?.content?.[0]?.text;
  if (!text) throw new Error(`${name} returned no content`);
  return JSON.parse(text);
}

// [SCOPE 154 / T004] The skip cascade (autopilot-skip.ts) classifies each dependent as
// "skipped" or "partly worked" via the same project.scope_stage call this module already makes
// per startup-list scope — exported so bridge.ts can pass it in as runSkipCascade's `stageOf`.
export async function fetchScopeStage(src: AutopilotMcpSource, scopeNum: string, fetchImpl: typeof fetch = fetch): Promise<string | undefined> {
  const report = (await callMcpTool(
    src,
    "project.scope_stage",
    { projectId: src.projectId, specNumber: scopeNum },
    fetchImpl,
  )) as { found?: boolean; scope?: { stage?: string } };
  return report.found && report.scope ? report.scope.stage : undefined;
}

interface DevplanDocument {
  title?: unknown;
  bodyMarkdown?: unknown;
}

/** The server's devplan document body, or null when no devplan has ever been generated. */
export async function fetchDevplanMarkdown(src: AutopilotMcpSource, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  const payload = (await callMcpTool(
    src,
    "project.list_open_items",
    { projectId: src.projectId, category: "documents", documentBody: "full", maxItems: 100 },
    fetchImpl,
  )) as { documents?: DevplanDocument[] };
  const docs = Array.isArray(payload.documents) ? payload.documents : [];
  const devplan = docs.find((d) => d.title === "Development Plan");
  return typeof devplan?.bodyMarkdown === "string" ? devplan.bodyMarkdown : null;
}

/**
 * Every `SCOPE-NNN` row's number and title, in the document's own order — which is already
 * build order (devplan-generator.ts emits "### Phase 0", "### Phase 1", ... ascending,
 * foundation-up, each phase's table in build order). De-duplicated by number, keeping the
 * first occurrence, since a scope may legitimately be mentioned again in prose later.
 */
export function parseDevplanScopeOrder(markdown: string): Array<{ num: string; title: string }> {
  const seen = new Set<string>();
  const out: Array<{ num: string; title: string }> = [];
  const rowRe = /\|\s*SCOPE-(\d+)\s*\|\s*([^|]+?)\s*\|/g;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(markdown)) !== null) {
    const num = m[1];
    if (seen.has(num)) continue;
    seen.add(num);
    out.push({ num, title: m[2].trim() });
  }
  return out;
}

export interface StartupScope {
  num: string;
  title: string;
  stage: string;
}

/**
 * Fetch the devplan, parse its build order, and filter out every scope `project.scope_stage`
 * reports as already in `Release` or inactive — what remains is what Autopilot would work,
 * in the order it would work it. Returns `null` when no devplan document exists at all
 * (FR-002: no server devplan available → the caller does not start the run).
 */
export async function buildStartupList(src: AutopilotMcpSource, fetchImpl: typeof fetch = fetch): Promise<StartupScope[] | null> {
  const markdown = await fetchDevplanMarkdown(src, fetchImpl);
  if (!markdown) return null;
  const ordered = parseDevplanScopeOrder(markdown);
  const result: StartupScope[] = [];
  for (const scope of ordered) {
    const report = (await callMcpTool(
      src,
      "project.scope_stage",
      { projectId: src.projectId, specNumber: scope.num },
      fetchImpl,
    )) as { found?: boolean; scope?: { stage?: string; inactive?: boolean } };
    if (!report.found || !report.scope) continue;
    if (report.scope.stage === "Release" || report.scope.inactive === true) continue;
    result.push({ num: scope.num, title: scope.title, stage: String(report.scope.stage ?? "Design") });
  }
  return result;
}

/** The room/K.A.I.N. post for a non-empty startup list (FR-002). The owner's "go" is the approval. */
export function formatStartupList(scopes: StartupScope[]): string {
  const lines = [
    `Autopilot startup — ${scopes.length} scope${scopes.length === 1 ? "" : "s"} from the dev plan, in build order:`,
    "",
    ...scopes.map((s, i) => `${i + 1}. SCOPE-${s.num} — ${s.title} (${s.stage})`),
    "",
    'Reply "go" to start working this list. Nothing starts without it.',
    'Reply "go debug" instead to also see every step each scope\'s session takes; "verbose" / "concise" switch that on or off mid-run.', // [SCOPE 154 / T015] FR-017
  ];
  return lines.join("\n");
}

/** Posted instead of a list when the devplan itself is missing (FR-002: do not start the run). */
export const NO_DEVPLAN_MESSAGE =
  "Autopilot can't start: no server dev plan was found for this project. Run the dev-plan command first, then try again.";

/** Posted when the devplan exists but every scope in it is already done or inactive. */
export const NOTHING_TO_DO_MESSAGE = "Autopilot startup: every scope in the dev plan is already in Release or inactive. Nothing to run.";
// [SCOPE 154 / T003] END
