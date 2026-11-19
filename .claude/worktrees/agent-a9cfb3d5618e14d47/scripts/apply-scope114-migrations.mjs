#!/usr/bin/env node
/**
 * Apply SCOPE-114 migrations 0057 + 0058 to a target database.
 *
 * Hand-authored applier because `drizzle-kit` cannot be used in this repo: its meta
 * snapshots stop at 0009 while migrations run past 0056, so it has nothing to diff and
 * blocks on an interactive rename prompt. Migrations 0051+ are all hand-authored.
 *
 *   node scripts/apply-scope114-migrations.mjs --url "<postgres url>" [--dry-run]
 *
 * 0057 creates the global `designsystems` catalog table; 0058 adds nullable `tokens` +
 * `designsystemslug` to BOTH `themetemplates` and `projectthemes`. Both are strictly
 * additive and idempotent, so re-running is safe — but they run in ONE transaction
 * anyway, because a half-applied pair would leave the catalog table present while the
 * project tier still cannot carry rich tokens, which is precisely the broken state
 * SCOPE-114 is designed to avoid.
 */
import { readFileSync } from 'node:fs';
import { Client } from 'pg';

const argv = process.argv.slice(2);
const arg = (n) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const dryRun = argv.includes('--dry-run');
const url = arg('url') || process.env.DATABASE_URL;
if (!url) {
  console.error('apply-scope114-migrations: no --url and no DATABASE_URL');
  process.exit(1);
}

const FILES = [
  'src/db/migrations/0057_scope114_design_systems.sql',
  'src/db/migrations/0058_scope114_rich_tokens.sql',
];

const label = url.replace(/(:\/\/[^:]+:)[^@]+@/, '$1***@');
console.log(`apply-scope114-migrations: target ${label}`);
for (const f of FILES) {
  console.log(`  file: ${f} (${readFileSync(f, 'utf8').split('\n').length} lines)`);
}

// Mirrors src/db/client.ts exactly. pg 8.12+ reads `sslmode=require` as verify-full,
// which overrides the ssl option and fails on this server's self-signed chain — so the
// parameter is stripped and TLS is configured here instead.
const dbUrl = url.replace(/([?&])sslmode=[^&]*/g, '$1').replace(/[?&]$/, '');
const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
await client.connect();

// What we expect afterwards — asserted, not assumed.
const EXPECT_TABLE = 'designsystems';
const EXPECT_COL = [
  ['designsystems', 'slug'], ['designsystems', 'tokens'], ['designsystems', 'theme'],
  ['designsystems', 'sourcebrand'], ['designsystems', 'nativemode'],
  ['designsystems', 'synthesizedmode'], ['designsystems', 'showcasehtml'],
  ['designsystems', 'analysis'], ['designsystems', 'fontstack'],
  ['designsystems', 'fontimporturl'], ['designsystems', 'sortorder'],
  // The load-bearing pair, on BOTH tiers.
  ['themetemplates', 'tokens'], ['themetemplates', 'designsystemslug'],
  ['projectthemes', 'tokens'], ['projectthemes', 'designsystemslug'],
];
const EXPECT_IDX = [
  'uq_designsystems_slug', 'idx_designsystems_sortorder', 'idx_designsystems_nativemode',
  'idx_themetemplates_designsystemslug', 'idx_projectthemes_designsystemslug',
];
const EXPECT_CHK = ['chk_designsystems_nativemode', 'chk_designsystems_synthesizedmode'];

// Deliberately sequential: a single pg Client cannot run concurrent queries, and
// Promise.all over one client can interleave — which would make the verification
// itself untrustworthy. The verification is the entire value of this script.
const has = async (q, p) => (await client.query(q, p)).rowCount > 0;
const tableExists = (t) =>
  has('SELECT 1 FROM information_schema.tables WHERE table_name = $1', [t]);
const colExists = (t, c) =>
  has('SELECT 1 FROM information_schema.columns WHERE table_name=$1 AND column_name=$2', [t, c]);
const idxExists = (n) => has('SELECT 1 FROM pg_indexes WHERE indexname = $1', [n]);
const chkExists = (n) => has('SELECT 1 FROM pg_constraint WHERE conname = $1', [n]);

async function survey() {
  const col = {};
  for (const [t, c] of EXPECT_COL) col[`${t}.${c}`] = await colExists(t, c);
  const idx = {};
  for (const n of EXPECT_IDX) idx[n] = await idxExists(n);
  const chk = {};
  for (const n of EXPECT_CHK) chk[n] = await chkExists(n);
  return { table: await tableExists(EXPECT_TABLE), col, idx, chk };
}
const count = (o) => Object.values(o).filter(Boolean).length;

const before = await survey();
console.log('  before:',
  `table ${before.table ? 'yes' : 'no'}`,
  `cols ${count(before.col)}/${EXPECT_COL.length}`,
  `idx ${count(before.idx)}/${EXPECT_IDX.length}`,
  `checks ${count(before.chk)}/${EXPECT_CHK.length}`);

// Existing rows that must keep working untouched, so the report can state plainly that
// this changed structure only and no row's behaviour depended on the new columns.
for (const t of ['themetemplates', 'projectthemes']) {
  try {
    const r = await client.query(`SELECT COUNT(*)::int AS n FROM ${t}`);
    console.log(`  existing ${t} rows (all keep working with both columns NULL): ${r.rows[0].n}`);
  } catch { console.log(`  existing ${t} rows: n/a`); }
}

if (dryRun) {
  console.log('  --dry-run: nothing applied.');
  await client.end();
  process.exit(0);
}

try {
  await client.query('BEGIN');
  for (const f of FILES) await client.query(readFileSync(f, 'utf8'));
  await client.query('COMMIT');
  console.log('  applied (both files, single transaction, committed)');
} catch (err) {
  await client.query('ROLLBACK');
  console.error('  FAILED — rolled back, database unchanged:', err.message);
  await client.end();
  process.exit(1);
}

const after = await survey();
const missingCol = Object.entries(after.col).filter(([, v]) => !v).map(([k]) => k);
const missingIdx = EXPECT_IDX.filter((n) => !after.idx[n]);
const missingChk = EXPECT_CHK.filter((n) => !after.chk[n]);

console.log('  after :',
  `table ${after.table ? 'yes' : 'no'}`,
  `cols ${count(after.col)}/${EXPECT_COL.length}`,
  `idx ${count(after.idx)}/${EXPECT_IDX.length}`,
  `checks ${count(after.chk)}/${EXPECT_CHK.length}`);

// Prove the CHECK constraints actually reject bad values rather than merely existing
// under the right name. A constraint present with a wrong predicate passes a name
// check and is still wrong.
const chkProblems = [];
for (const [col, bad] of [['nativemode', 'sideways'], ['synthesizedmode', 'maybe']]) {
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO designsystems (id, slug, name, nativemode, synthesizedmode, tags, tokens, theme)
       VALUES (gen_random_uuid(), $1, 'probe', $2, $3, '[]'::jsonb, '{}'::jsonb, '{}'::jsonb)`,
      [`__probe_${col}`, col === 'nativemode' ? bad : 'light', col === 'synthesizedmode' ? bad : 'none'],
    );
    await client.query('ROLLBACK');
    chkProblems.push(`${col}: accepted invalid value "${bad}"`);
    console.log(`    chk ${col} -> ACCEPTED "${bad}"  [WRONG]`);
  } catch {
    await client.query('ROLLBACK');
    console.log(`    chk ${col} -> rejected "${bad}"  [ok]`);
  }
}

// The catalog must be empty at this point; T009's seed script is what fills it.
const rows = await client.query('SELECT COUNT(*)::int AS n FROM designsystems');
console.log(`  designsystems rows: ${rows.rows[0].n} (seed via scripts/seed-design-systems.ts)`);

const ok = after.table && !missingCol.length && !missingIdx.length && !missingChk.length
  && !chkProblems.length;
if (!ok) {
  console.error('  VERIFY FAILED:', JSON.stringify({ missingCol, missingIdx, missingChk, chkProblems }));
}
console.log(ok ? '  VERIFIED: 0057 + 0058 fully applied' : '  VERIFY FAILED');
await client.end();
process.exit(ok ? 0 : 1);
