/**
 * Live smoke test for SPEC-058 against the hosted MCP (after deploy).
 * Confirms cockpit_summary carries the new claim fields, then exercises
 * checkout -> (re-read) -> checkin on a scope, leaving state clean.
 *
 * Run:  npx tsx scripts/smoke-spec058.ts [specNumber]   (default 058)
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PROJECT_ID = 'ba924193-0335-4080-9fa6-33cd6b81300a';
const SPEC = process.argv.find((a) => /^\d{3}$/.test(a)) ?? '058';

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

async function summaryClaim(tok: string): Promise<void> {
  const s = await call(tok, 'project.cockpit_summary', { projectid: PROJECT_ID });
  const sc = (s.scopes ?? []).find((x: any) => x.specNumber === SPEC);
  const nums = (s.scopes ?? []).map((x: any) => x.specNumber).join(',');
  console.log(`  cockpit_summary: scopes=${(s.scopes ?? []).length} [${nums}] | ${SPEC} present=${!!sc} claimedBy=${sc?.claimedBy ? sc.claimedBy.name : 'null'} | viewerUserId=${s.viewerUserId ?? 'null'} claimsEnabled=${s.claimsEnabled}`);
}

async function main(): Promise<void> {
  const tok = token();
  console.log(`Smoke SPEC-058 on scope ${SPEC} @ mcp.wxperts.com`);
  console.log('1) before:');
  await summaryClaim(tok);

  console.log('2) checkout_scope:');
  const co = await call(tok, 'project.checkout_scope', { projectId: PROJECT_ID, specNumber: SPEC });
  console.log(`   -> ok=${co.ok} status=${co.status} branch=${co.branchName ?? '-'} claimedBy=${co.claimedBy?.name ?? '-'}`);

  console.log('3) after checkout:');
  await summaryClaim(tok);

  console.log('4) checkin_scope:');
  const ci = await call(tok, 'project.checkin_scope', { projectId: PROJECT_ID, specNumber: SPEC });
  console.log(`   -> ok=${ci.ok} status=${ci.status}`);

  console.log('5) after checkin:');
  await summaryClaim(tok);
}

main().catch((e) => {
  console.error('SMOKE FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
});
