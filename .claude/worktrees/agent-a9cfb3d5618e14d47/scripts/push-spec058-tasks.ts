/**
 * dbpush delta for SPEC-058: add the tasks introduced AFTER the initial
 * create_specs push (T018–T023 — the FR-007 git-hook trap + FR-008 editor
 * read-only). The original 17 (T001–T017) are already in the DB; create_specs
 * is one-shot, so new tasks on an existing spec go via project.create_task.
 *
 * Idempotent: skips any task whose title already exists under spec 058.
 *
 * Run:  npx tsx scripts/push-spec058-tasks.ts            (real)
 *       npx tsx scripts/push-spec058-tasks.ts --dry-run  (check only)
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PROJECT_ID = 'ba924193-0335-4080-9fa6-33cd6b81300a';
const SPEC_ID = 'cef21256-2346-40ee-940a-6dd520163fa2';
const SPEC_NUMBER = '058';
const ADD_IDS = new Set(['T018', 'T019', 'T020', 'T021', 'T022', 'T023']);
const SPEC_DIR = resolve('specs/058-scope-branch-checkout');
const DRY_RUN = process.argv.includes('--dry-run');

function loadEnv(): { token: string; base: string } {
  const env = readFileSync(resolve('.env'), 'utf8');
  const get = (k: string): string | undefined => {
    for (const line of env.split('\n')) {
      if (line.trimStart().startsWith('#')) continue;
      const m = line.match(new RegExp(`^\\s*${k}\\s*=\\s*(.+)\\s*$`));
      if (m) return m[1].trim();
    }
    return undefined;
  };
  const token = process.env.WXKANBAN_API_TOKEN ?? get('WXKANBAN_API_TOKEN');
  if (!token) throw new Error('WXKANBAN_API_TOKEN not found');
  return { token, base: process.env.MCP_BASE_URL ?? 'https://mcp.wxperts.com' };
}

async function call(base: string, token: string, tool: string, args: unknown): Promise<any> {
  const res = await fetch(`${base}/call`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ tool, args }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${tool} -> HTTP ${res.status}: ${text.slice(0, 500)}`);
  const env = JSON.parse(text);
  const inner = env?.content?.[0]?.text;
  return typeof inner === 'string' ? JSON.parse(inner) : env;
}

function parseAddTasks(md: string): Array<{ id: string; title: string; priority: string }> {
  return md
    .split('\n')
    .filter((l) => /^\|\s*T\d{3}\s*\|/.test(l))
    .map((l) => {
      const cols = l.split('|').map((c) => c.trim());
      return { id: cols[1], title: cols[2], priority: (cols[4] || 'medium').toLowerCase() };
    })
    .filter((t) => ADD_IDS.has(t.id));
}

function prio(p: string): 'low' | 'medium' | 'high' | 'critical' {
  return (['low', 'medium', 'high', 'critical'] as const).includes(p as any) ? (p as any) : 'medium';
}

async function main(): Promise<void> {
  const { token, base } = loadEnv();
  const tasksMd = readFileSync(resolve(SPEC_DIR, 'tasks.md'), 'utf8');
  const adds = parseAddTasks(tasksMd);
  console.log(`MCP ${base} | spec ${SPEC_NUMBER} (${SPEC_ID}) | ${adds.length} candidate tasks`);

  const summary = await call(base, token, 'project.cockpit_summary', { projectid: PROJECT_ID });
  const scope = (summary?.scopes ?? []).find((s: any) => s.specNumber === SPEC_NUMBER);
  if (!scope) throw new Error(`Spec ${SPEC_NUMBER} not found in project — run push-spec058 first.`);
  const existingTitles = new Set<string>((scope.tasks ?? []).map((t: any) => t.title));

  for (const t of adds) {
    const title = t.title.length > 255 ? t.title.slice(0, 252) + '…' : t.title;
    if (existingTitles.has(title)) {
      console.log(`  skip ${t.id} (already present)`);
      continue;
    }
    if (DRY_RUN) {
      console.log(`  would create ${t.id} [${prio(t.priority)}] ${title.slice(0, 80)}`);
      continue;
    }
    const r = await call(base, token, 'project.create_task', {
      projectId: PROJECT_ID,
      specId: SPEC_ID,
      title,
      descriptionMarkdown: t.title,
      status: 'todo',
      priority: prio(t.priority),
    });
    console.log(`  created ${t.id} -> task ${r?.task?.id ?? '?'}`);
  }
  console.log('Done.');
}

main().catch((e) => {
  console.error('FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
});
