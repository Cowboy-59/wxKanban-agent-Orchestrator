/**
 * One-off dbpush for SPEC-058 (Scope Branch Check-out / Check-in).
 *
 * The wxkanban-agent dbpush CLI is broken (feedback_orchestrator_cli_broken),
 * so this replicates its create_specs path directly against the hosted MCP —
 * which owns the authoritative projectspecifications/projecttasks column
 * mapping (safer than hand-SQL given the app-vs-MCP schema divergence).
 *
 * Mirrors wxkanban-agent/dbpush.ts: new spec -> project.create_specs with
 * { projectId, specNumber, featureName, scopeContent, phase, priority, tasks }.
 * Idempotent: aborts if specNumber 058 already exists in the project.
 *
 * Run:  npx tsx scripts/push-spec058.ts          (real push)
 *       npx tsx scripts/push-spec058.ts --dry-run (check only, no write)
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PROJECT_ID = 'ba924193-0335-4080-9fa6-33cd6b81300a';
const SPEC_NUMBER = '058';
const FEATURE_NAME = 'Scope Branch Check-out / Check-in';
const SPEC_DIR = resolve('specs/058-scope-branch-checkout');
const DRY_RUN = process.argv.includes('--dry-run');

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

/** Parse the tasks.md markdown table rows (| Tnnn | task | FR | priority | status |). */
function parseTasks(md: string): Array<{ id: string; title: string; status: string }> {
  return md
    .split('\n')
    .filter((l) => /^\|\s*T\d{3}\s*\|/.test(l))
    .map((l) => {
      const cols = l.split('|').map((c) => c.trim());
      // cols[0] is empty (leading pipe). cols = ['', 'T001', 'task', 'FR', 'priority', 'status', '']
      return { id: cols[1], title: cols[2], status: (cols[5] ?? 'todo').toLowerCase() };
    });
}

function normalizeStatus(s: string): 'todo' | 'in_progress' | 'blocked' | 'done' {
  if (/done|completed|finished|shipped|closed/.test(s)) return 'done';
  if (/in[_ ]?progress|wip|active|doing/.test(s)) return 'in_progress';
  if (/blocked|stalled|waiting/.test(s)) return 'blocked';
  return 'todo';
}

async function main(): Promise<void> {
  const { token, base } = loadEnv();
  const specBody = readFileSync(resolve(SPEC_DIR, 'spec.md'), 'utf8');
  const tasksMd = readFileSync(resolve(SPEC_DIR, 'tasks.md'), 'utf8');
  const parsed = parseTasks(tasksMd);

  console.log(`MCP base: ${base}`);
  console.log(`Project:  ${PROJECT_ID}`);
  console.log(`Spec:     ${SPEC_NUMBER} — ${FEATURE_NAME}`);
  console.log(`Parsed ${parsed.length} tasks from tasks.md`);

  // Idempotency pre-check (mirrors dbpush Phase 2): is spec 058 already present?
  const summary = await call(base, token, 'project.cockpit_summary', { projectid: PROJECT_ID });
  const existing: string[] = (summary?.scopes ?? []).map((s: any) => s.specNumber);
  if (existing.includes(SPEC_NUMBER)) {
    console.log(`\nSpec ${SPEC_NUMBER} already exists in the project — NOT pushing (idempotent abort).`);
    return;
  }
  console.log(`Spec ${SPEC_NUMBER} not present yet — OK to create. (${existing.length} scopes currently in project.)`);

  const tasks = parsed.map((t) => ({
    title: t.title.length > 255 ? t.title.slice(0, 252) + '…' : t.title,
    description: t.title,
    priority: 'medium',
    status: normalizeStatus(t.status),
  }));

  if (DRY_RUN) {
    console.log('\n--dry-run: would call project.create_specs with:');
    console.log(JSON.stringify({ specNumber: SPEC_NUMBER, featureName: FEATURE_NAME, phase: 'design', priority: 'high', taskCount: tasks.length, scopeContentChars: specBody.length }, null, 2));
    console.log('\nTasks:');
    tasks.forEach((t, i) => console.log(`  ${parsed[i].id} [${t.status}] ${t.title.slice(0, 90)}`));
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
