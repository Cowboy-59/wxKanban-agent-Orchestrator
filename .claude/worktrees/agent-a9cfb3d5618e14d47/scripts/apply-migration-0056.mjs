#!/usr/bin/env node
/**
 * Apply migration 0056 (SCOPE-111 Amendment C) to a target database.
 *
 * Hand-authored applier because `drizzle-kit` cannot be used in this repo: its
 * meta snapshots stop at 0009 while migrations run past 0055, so it has nothing
 * to diff and blocks on an interactive rename prompt. Migrations 0051–0056 are
 * all hand-authored for the same reason.
 *
 *   node scripts/apply-migration-0056.mjs --url "<postgres url>" [--dry-run]
 *
 * The whole file runs in ONE transaction: 0056 adopts three foreign keys after
 * nulling orphans, and a half-applied constraint set is worse than none.
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
  console.error('apply-migration-0056: no --url and no DATABASE_URL');
  process.exit(1);
}

const FILE = 'src/db/migrations/0056_scope111c_referential_integrity.sql';
const sql = readFileSync(FILE, 'utf8');

const label = url.replace(/(:\/\/[^:]+:)[^@]+@/, '$1***@');
console.log(`apply-migration-0056: target ${label}`);
console.log(`  file: ${FILE} (${sql.split('\n').length} lines)`);

// Mirrors src/db/client.ts exactly. pg 8.12+ reads `sslmode=require` as
// verify-full, which overrides the ssl option and fails on this server's
// self-signed chain — so the parameter is stripped and TLS is configured here.
const dbUrl = url.replace(/([?&])sslmode=[^&]*/g, '$1').replace(/[?&]$/, '');
const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
await client.connect();

// What we expect to exist afterwards — asserted, not assumed.
const EXPECT_FK = [
  'fk_testplanitems_parentitem',
  'fk_testplanitems_lastrun',
  'fk_testruns_currentitem',
];
const EXPECT_COL = [
  ['testcycles', 'updatedat'],
  ['testruns', 'updatedat'],
  ['testsignoffs', 'updatedat'],
  ['testretests', 'updatedat'],
];
const EXPECT_IDX = [
  'idx_testplans_generatedby', 'idx_testcycles_promotedby', 'idx_testplanitems_task',
  'idx_testplanitems_parent', 'idx_testplanitems_lastrun', 'idx_testruns_testplan',
  'idx_testruns_spec', 'idx_testruns_currentitem', 'idx_testruns_triggeredby',
  'idx_testrunresults_bugreport', 'idx_testsignoffs_signedby', 'idx_testsignoffs_run',
  'idx_testretests_reachedsubject', 'idx_testretests_dismissedby',
];
const EXPECT_DROPPED = ['idx_testplanitems_plan', 'idx_testitemsubjects_item'];

// Deliberately sequential. A single pg Client cannot run concurrent queries —
// Promise.all over one client is deprecated and can interleave, which would make
// the post-apply verification itself untrustworthy. The verification is the
// entire value of this script, so it is the last place to cut corners.
const snapshot = async (pairs) => {
  const out = {};
  for (const [key, fn] of pairs) out[key] = await fn();
  return out;
};
const has = async (q, p) => (await client.query(q, p)).rowCount > 0;
const fkExists = (n) => has('SELECT 1 FROM pg_constraint WHERE conname = $1', [n]);
const idxExists = (n) => has('SELECT 1 FROM pg_indexes WHERE indexname = $1', [n]);
const colExists = (t, c) =>
  has('SELECT 1 FROM information_schema.columns WHERE table_name=$1 AND column_name=$2', [t, c]);

const survey = async () => ({
  fk: await snapshot(EXPECT_FK.map((n) => [n, () => fkExists(n)])),
  idx: await snapshot(EXPECT_IDX.map((n) => [n, () => idxExists(n)])),
  dropped: await snapshot(EXPECT_DROPPED.map((n) => [n, () => idxExists(n)])),
  col: await snapshot(EXPECT_COL.map(([t, c]) => [`${t}.${c}`, () => colExists(t, c)])),
});
const before = await survey();
console.log('  before:',
  `FKs ${Object.values(before.fk).filter(Boolean).length}/3`,
  `cols ${Object.values(before.col).filter(Boolean).length}/4`,
  `idx ${Object.values(before.idx).filter(Boolean).length}/14`,
  `to-drop-present ${Object.values(before.dropped).filter(Boolean).length}/2`);

// Count the orphans the migration is about to null, so the report is honest
// about whether it changed data rather than only structure.
const orphans = {};
for (const [t, c, p] of [
  ['testplanitems', 'parentitemid', 'testplanitems'],
  ['testplanitems', 'lastrunid', 'testruns'],
  ['testruns', 'currentitemid', 'testplanitems'],
]) {
  try {
    const r = await client.query(
      `SELECT COUNT(*)::int AS n FROM ${t} WHERE ${c} IS NOT NULL AND ${c} NOT IN (SELECT id FROM ${p})`,
    );
    orphans[`${t}.${c}`] = r.rows[0].n;
  } catch { orphans[`${t}.${c}`] = 'n/a'; }
}
console.log('  orphans to be nulled:', JSON.stringify(orphans));

if (dryRun) {
  console.log('  --dry-run: nothing applied.');
  await client.end();
  process.exit(0);
}

try {
  await client.query('BEGIN');
  await client.query(sql);
  await client.query('COMMIT');
  console.log('  applied (single transaction, committed)');
} catch (err) {
  await client.query('ROLLBACK');
  console.error('  FAILED — rolled back, database unchanged:', err.message);
  await client.end();
  process.exit(1);
}

const after = await survey();

const missingFk = EXPECT_FK.filter((n) => !after.fk[n]);
const missingCol = Object.entries(after.col).filter(([, v]) => !v).map(([k]) => k);
const missingIdx = EXPECT_IDX.filter((n) => !after.idx[n]);
const stillThere = EXPECT_DROPPED.filter((n) => after.dropped[n]);

console.log('  after :',
  `FKs ${Object.values(after.fk).filter(Boolean).length}/3`,
  `cols ${Object.values(after.col).filter(Boolean).length}/4`,
  `idx ${Object.values(after.idx).filter(Boolean).length}/14`,
  `redundant-dropped ${2 - stillThere.length}/2`);

// Verify each new FK's actual DELETE RULE, not merely that a constraint by that
// name exists. The onDelete choice is the whole design decision here — cascade
// for a variant of a deleted item, set null for the two denormalised pointers so
// deleting a run cannot delete the items it ran. A constraint present with the
// wrong rule would pass a name check and still be wrong.
//
// Read from the catalog rather than probed with an insert: a probe row needs a
// valid cycleid and projectid, so it fails on those constraints first and
// "passes" on the wrong evidence.
const RULE = { c: 'cascade', n: 'set null', a: 'no action', r: 'restrict', d: 'set default' };
const EXPECT_RULE = {
  fk_testplanitems_parentitem: 'cascade',
  fk_testplanitems_lastrun: 'set null',
  fk_testruns_currentitem: 'set null',
};
const ruleProblems = [];
for (const [name, want] of Object.entries(EXPECT_RULE)) {
  const r = await client.query(
    `SELECT confdeltype, confrelid::regclass::text AS target
       FROM pg_constraint WHERE conname = $1 AND contype = 'f'`,
    [name],
  );
  if (!r.rowCount) { ruleProblems.push(`${name}: ABSENT`); continue; }
  const got = RULE[r.rows[0].confdeltype] ?? r.rows[0].confdeltype;
  const mark = got === want ? 'ok' : `WRONG (wanted ${want})`;
  console.log(`    ${name} -> ${r.rows[0].target} ON DELETE ${got}  [${mark}]`);
  if (got !== want) ruleProblems.push(`${name}: ${got} != ${want}`);
}

const ok =
  !missingFk.length && !missingCol.length && !missingIdx.length && !stillThere.length &&
  !ruleProblems.length;
if (!ok) {
  console.error('  VERIFY FAILED:',
    JSON.stringify({ missingFk, missingCol, missingIdx, stillThere, ruleProblems }));
}
console.log(ok ? '  VERIFIED: 0056 fully applied' : '  VERIFY FAILED');
await client.end();
process.exit(ok ? 0 : 1);
