/**
 * Mark SPEC-058 tasks done in the DB as implementation progresses.
 * Matches incomplete tasks under scope 058 by a stable title prefix (DB titles
 * are the original create_specs text, so match on the unchanging leading words),
 * then flips them to done via project.update_task_status.
 *
 * Pass the prefixes to mark done as args, e.g.:
 *   npx tsx scripts/mark-spec058-done.ts "Add \`claimedbyid\`" "Apply the migration"
 *   npx tsx scripts/mark-spec058-done.ts --dry-run "Add \`claimedbyid\`"
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PROJECT_ID = 'ba924193-0335-4080-9fa6-33cd6b81300a';
const SPEC_NUMBER = '058';
const DRY_RUN = process.argv.includes('--dry-run');
const statusArg = process.argv.find((a) => a.startsWith('--status='));
const STATUS = statusArg ? statusArg.split('=')[1] : 'done';
const PREFIXES = process.argv.slice(2).filter((a) => a !== '--dry-run' && !a.startsWith('--status='));

function token(): string {
  const env = readFileSync(resolve('.env'), 'utf8');
  for (const line of env.split('\n')) {
    if (line.trimStart().startsWith('#')) continue;
    const m = line.match(/^\s*WXKANBAN_API_TOKEN\s*=\s*(.+)\s*$/);
    if (m) return m[1].trim();
  }
  throw new Error('WXKANBAN_API_TOKEN not found');
}

async function call(tok: string, tool: string, args: unknown): Promise<any> {
  const res = await fetch('https://mcp.wxperts.com/call', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
    body: JSON.stringify({ tool, args }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${tool} HTTP ${res.status}: ${text.slice(0, 300)}`);
  const env = JSON.parse(text);
  const inner = env?.content?.[0]?.text;
  return typeof inner === 'string' ? JSON.parse(inner) : env;
}

async function main(): Promise<void> {
  if (!PREFIXES.length) throw new Error('Pass one or more title prefixes to mark done.');
  const tok = token();
  const summary = await call(tok, 'project.cockpit_summary', { projectid: PROJECT_ID });
  const scope = (summary?.scopes ?? []).find((s: any) => s.specNumber === SPEC_NUMBER);
  if (!scope) throw new Error(`Spec ${SPEC_NUMBER} not found`);
  for (const prefix of PREFIXES) {
    const match = (scope.tasks ?? []).find((t: any) => (t.title ?? '').startsWith(prefix));
    if (!match) {
      console.log(`  no incomplete task matches prefix "${prefix}" (already done or not found)`);
      continue;
    }
    if (DRY_RUN) {
      console.log(`  would set ${STATUS}: ${match.id} — ${match.title.slice(0, 70)}`);
      continue;
    }
    await call(tok, 'project.update_task_status', { taskId: match.id, status: STATUS });
    console.log(`  ${STATUS}: ${match.id} — ${match.title.slice(0, 70)}`);
  }
}

main().catch((e) => {
  console.error('FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
});
