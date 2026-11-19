/**
 * One-off createSpecs for SCOPE-063 (Customer-Facing Bug-Trapping).
 *
 * The MCP project.create_specs tool is not exposed in the Claude session toolset
 * and the wxkanban-agent CLI createspecs path is broken
 * (feedback_orchestrator_cli_broken), so this replicates its create_specs path
 * directly against the hosted MCP — which owns the authoritative
 * projectspecifications/projecttasks column mapping. Mirrors scripts/push-spec058.ts.
 *
 * Idempotent: aborts if specNumber 063 already exists in the project.
 *
 * Run:  npx tsx scripts/push-spec063.ts            (real push)
 *       npx tsx scripts/push-spec063.ts --dry-run  (check only, no write)
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PROJECT_ID = 'ba924193-0335-4080-9fa6-33cd6b81300a';
const SPEC_NUMBER = '063';
const FEATURE_NAME = 'Customer-Facing Bug-Trapping — Install & Per-Project Triage';
const SCOPE_DOC = resolve('specs/Project-Scope/063-customer-bug-trapping.md');
const DRY_RUN = process.argv.includes('--dry-run');

// Task breakdown derived from SCOPE-063 build sequence + FRs.
const TASKS: Array<{ id: string; title: string; status: string }> = [
  { id: 'T001', title: 'Schema delta: add suggestedsolution, suggestedsolutionrationale, suggestedat, linkedtaskid to feedbacksubmissions (+ mcp-server mirror) and generate/apply migration (FR-010)', status: 'todo' },
  { id: 'T002', title: 'Refactor ErrorCaptureService.capture() to accept ctx.projectId defaulting to SINK_PROJECT_ID; per-fingerprint rate key becomes ${projectId}:${fp} (FR-003)', status: 'todo' },
  { id: 'T003', title: 'authenticateProjectIngest middleware: bearer-only validate against mcpapitokens, assert token.projectid === :id, never 5xx (FR-001)', status: 'todo' },
  { id: 'T004', title: 'POST /api/projects/:id/errors ingest route: per-IP + per-token rate limit, 32KB cap, no Origin check, fail-open (FR-001, FR-002)', status: 'todo' },
  { id: 'T005', title: 'bugTrappingScopeTemplate.ts — renderBugTrappingScope({projectName, ingestEndpoint}) customer-facing 061 adaptation with stable seed marker (FR-005)', status: 'todo' },
  { id: 'T006', title: 'POST /api/projects/:id/bug-trapping/install: ScopeService.createScope + getOrCreateToken, idempotency via marker, return endpoint + one-time token (FR-004)', status: 'todo' },
  { id: 'T007', title: 'ProjectBugReportService: project-scoped list/detail/status/note/create-task; projectid filter on every query + per-row recheck on every mutation (FR-006, FR-007, FR-009)', status: 'todo' },
  { id: 'T008', title: 'BugSuggestionService: generateOnce via LLM_PROVIDER, strict-JSON safeParse, fail-open, soft throttle + force override (FR-008)', status: 'todo' },
  { id: 'T009', title: 'projectBugReports routes (GET list/detail, PATCH status, POST note/suggest/create-task) + projectInCompany guard + mount in app.ts (FR-006..009)', status: 'todo' },
  { id: 'T010', title: 'BugReportsTabView.tsx (project-scoped clone of SysAdmin Feedback + AI panel + install empty-state/dialog) and wire bugreports tab into ProjectWorkspacePage (Seam C client)', status: 'todo' },
  { id: 'T011', title: 'Tests: cross-tenant isolation, ingest token-mismatch 403, fail-open on bad payload, idempotent install, AI-suggest fail-open (Success Criteria)', status: 'todo' },
];

function loadEnv(): { token: string; base: string } {
  const env = readFileSync(resolve('.env'), 'utf8');
  const get = (k: string): string | undefined => {
    for (const line of env.split('\n')) {
      const m = line.match(new RegExp(`^\\s*${k}\\s*=\\s*(.+)\\s*$`));
      if (m && !line.trimStart().startsWith('#')) return m[1].trim();
    }
    return undefined;
  };
  const token = process.env.WXKANBAN_API_TOKEN ?? get('WXKANBAN_API_TOKEN');
  if (!token) throw new Error('WXKANBAN_API_TOKEN not found in env or .env');
  const base = process.env.MCP_BASE_URL ?? 'https://mcp.wxperts.com';
  return { token, base };
}

async function call(base: string, token: string, tool: string, args: unknown): Promise<any> {
  const res = await fetch(`${base}/call`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ tool, args }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${tool} -> HTTP ${res.status}: ${text.slice(0, 500)}`);
  let env: any;
  try { env = JSON.parse(text); } catch { return text; }
  const inner = env?.content?.[0]?.text;
  if (typeof inner === 'string') {
    try { return JSON.parse(inner); } catch { return inner; }
  }
  return env;
}

async function main(): Promise<void> {
  const { token, base } = loadEnv();
  const specBody = readFileSync(SCOPE_DOC, 'utf8');

  console.log(`MCP base: ${base}`);
  console.log(`Project:  ${PROJECT_ID}`);
  console.log(`Spec:     ${SPEC_NUMBER} — ${FEATURE_NAME}`);
  console.log(`Tasks:    ${TASKS.length}`);

  // Idempotency pre-check (mirrors dbpush Phase 2): is spec 063 already present?
  const summary = await call(base, token, 'project.cockpit_summary', { projectid: PROJECT_ID });
  const existing: string[] = (summary?.scopes ?? []).map((s: any) => s.specNumber);
  if (existing.includes(SPEC_NUMBER)) {
    console.log(`\nSpec ${SPEC_NUMBER} already exists in the project — NOT pushing (idempotent abort).`);
    return;
  }
  console.log(`Spec ${SPEC_NUMBER} not present yet — OK to create. (${existing.length} scopes currently in project.)`);

  const tasks = TASKS.map((t) => ({
    title: t.title.length > 255 ? t.title.slice(0, 252) + '…' : t.title,
    description: t.title,
    priority: 'high',
    status: 'todo' as const,
  }));

  if (DRY_RUN) {
    console.log('\n--dry-run: would call project.create_specs with:');
    console.log(JSON.stringify({ specNumber: SPEC_NUMBER, featureName: FEATURE_NAME, phase: 'design', priority: 'high', taskCount: tasks.length, scopeContentChars: specBody.length }, null, 2));
    console.log('\nTasks:');
    TASKS.forEach((t) => console.log(`  ${t.id} ${t.title.slice(0, 100)}`));
    return;
  }

  const result = await call(base, token, 'project.create_specs', {
    projectId: PROJECT_ID,
    specNumber: SPEC_NUMBER,
    featureName: FEATURE_NAME,
    scopeContent: specBody,
    phase: 'design',
    priority: 'high',
    tasks,
    generateLifecycle: false,
  });
  console.log('\nproject.create_specs result:');
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error('\nPUSH FAILED:', err instanceof Error ? err.message : err);
  process.exit(1);
});
