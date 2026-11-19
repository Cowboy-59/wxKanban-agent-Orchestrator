#!/usr/bin/env node
//
// Clone lifecycle + isolation proof for /preTest.
//
// WHY THIS EXISTS
// SCOPE-111 Amendment B gave us `clone-test-schema.mjs`, which can build a faithful
// disposable schema. Nothing ever called it as part of a gate. This wraps it with the
// three things a gate needs and a bare clone script does not:
//
//   1. A REFUSAL when the clone is not faithful. The clone script reports
//      `faithful: false` and exits non-zero, but a caller that ignores that would run
//      tests against a schema missing foreign keys — which passes tests production
//      would reject. Worse than no clone, because it manufactures confidence.
//
//   2. A PROOF that writes cannot reach production. DATABASE_URL on this machine is
//      production. `SET search_path` is a convention; a convention that silently falls
//      back to `public` destroys the database. So we assert it, per run, before any
//      other write happens.
//
//   3. A LIFECYCLE. A green run deliberately leaves its clone standing so the operator
//      can boot the app against it and look — that is the entire point of the gate. Left
//      unmanaged, clones accumulate. Each scope keeps exactly one: creating drops its
//      predecessor first.
//
// Usage:
//   node clone-guard.mjs --scope 119 --create
//   node clone-guard.mjs --scope 119 --verify wxktest_119_ab12
//   node clone-guard.mjs --scope 119 --teardown
//   node clone-guard.mjs --list
//
// Exit codes: 0 ok · 1 failed · 2 refused (safety guard)

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

// [SCOPE 120 / T002] BEGIN — Shared guards, connection resolution and identifier quoting
const PREFIX = 'wxktest_';

/** The clone engine from SCOPE-111 Amendment B, reused where it stands. */
const CLONE_SCRIPT = fileURLToPath(
  new URL('../../wxCreateTestPlan/scripts/clone-test-schema.mjs', import.meta.url),
);

const args = process.argv.slice(2);
const has = (f) => args.includes(`--${f}`);
const val = (f, d = null) => {
  const i = args.indexOf(`--${f}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d;
};

function refuse(msg) {
  console.error(`REFUSED: ${msg}`);
  process.exit(2);
}

const ident = (s) => `"${String(s).replace(/"/g, '""')}"`;

/**
 * Every name this script will touch must carry the prefix. Checked on every path —
 * create, verify and teardown — so no argument can steer an operation at `public`.
 */
function assertCloneName(name) {
  if (!name) refuse('no schema name given');
  if (!name.startsWith(PREFIX)) {
    refuse(`"${name}" does not start with "${PREFIX}" — refusing to touch a schema this tool did not create`);
  }
  if (name === 'public') refuse('"public" is the source schema');
  if (!/^[a-z0-9_]+$/.test(name)) refuse(`"${name}" is not a safe identifier`);
  return name;
}

function resolveUrl() {
  const explicit = val('url');
  if (explicit) return explicit;
  try {
    const env = readFileSync('.env', 'utf8');
    const pick = (k) => {
      const m = env.match(new RegExp(`^${k}=(.*)$`, 'm'));
      return m ? m[1].trim().replace(/^["']|["']$/g, '') : null;
    };
    // Falling back to DATABASE_URL is deliberate: isolation here is BY SCHEMA, which is
    // the whole design. The isolation proof below is what makes that safe, not the URL.
    return pick('TEST_DATABASE_URL') ?? pick('DATABASE_URL');
  } catch {
    return process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? null;
  }
}

async function connect(searchPath = null) {
  const raw = resolveUrl();
  if (!raw) refuse('no DATABASE_URL / TEST_DATABASE_URL found');
  const u = new URL(raw);
  // pg 8.12+ reads sslmode=require as verify-full; SSL is set explicitly instead.
  u.searchParams.delete('sslmode');
  u.searchParams.delete('ssl');
  const client = new pg.Client({
    connectionString: u.toString(),
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  if (searchPath) {
    await client.query(`SET search_path TO ${ident(searchPath)}, public`);
  }
  return { client, host: u.hostname, database: u.pathname.replace(/^\//, '') };
}
// [SCOPE 120 / T002] END

// [SCOPE 120 / T003] BEGIN — Prove writes cannot reach production, before any other write
/**
 * Two assertions, both blocking.
 *
 * `current_schema()` is the cheap one: it catches a search_path that never took.
 *
 * The canary is the one that matters. current_schema() can be right while an
 * unqualified CREATE still lands somewhere unexpected, so we actually write an object
 * and prove `public` cannot see it. This is the difference between believing the
 * isolation holds and having observed it hold, on this connection, this run.
 *
 * The canary name is checked in `public` FIRST. Without that, a stray leftover table
 * would make a perfectly isolated run look like a leak.
 */
async function assertIsolated(client, expectedSchema) {
  assertCloneName(expectedSchema);

  const cur = await client.query('SELECT current_schema() AS s');
  const actual = cur.rows[0]?.s;
  if (!actual || !String(actual).startsWith(PREFIX)) {
    refuse(
      `current_schema() is "${actual}" — expected a "${PREFIX}" schema. ` +
        `Writes would land outside the clone. DATABASE_URL here is PRODUCTION.`,
    );
  }
  if (actual !== expectedSchema) {
    refuse(`current_schema() is "${actual}" but the run expects "${expectedSchema}"`);
  }

  const CANARY = 'pretest_canary_probe';

  const preexisting = await client.query(`SELECT to_regclass($1) AS r`, [`public.${CANARY}`]);
  if (preexisting.rows[0]?.r) {
    refuse(
      `"public.${CANARY}" already exists — cannot distinguish a leak from leftover debris. ` +
        `Remove it and re-run.`,
    );
  }

  await client.query(`CREATE TABLE ${ident(CANARY)} (id int primary key)`);
  await client.query(`INSERT INTO ${ident(CANARY)} VALUES (1)`);

  const inClone = await client.query(`SELECT to_regclass($1) AS r`, [`${expectedSchema}.${CANARY}`]);
  const inPublic = await client.query(`SELECT to_regclass($1) AS r`, [`public.${CANARY}`]);

  // Drop before judging, so a failed assertion never leaves the probe behind.
  await client.query(`DROP TABLE ${ident(CANARY)}`);

  if (!inClone.rows[0]?.r) {
    refuse(`canary did not land in "${expectedSchema}" — search_path is not what it appears`);
  }
  if (inPublic.rows[0]?.r) {
    refuse(`canary IS VISIBLE from public — writes are reaching PRODUCTION. Run aborted.`);
  }

  console.log(`[guard] isolation proven: current_schema()=${actual}, canary invisible from public`);
  return true;
}
// [SCOPE 120 / T003] END

// [SCOPE 120 / T008] BEGIN — One clone per scope: enumerate, and drop a scope's predecessor
async function listClones(client) {
  const r = await client.query(
    `SELECT nspname,
            (SELECT count(*)::int FROM pg_tables WHERE schemaname = nspname) AS tables
       FROM pg_namespace WHERE nspname LIKE $1 ORDER BY nspname`,
    [`${PREFIX}%`],
  );
  if (r.rowCount === 0) {
    console.log('[guard] no test schemas present');
    return [];
  }
  for (const row of r.rows) console.log(`  ${row.nspname}  (${row.tables} tables)`);
  return r.rows.map((x) => x.nspname);
}

/**
 * A green run leaves its clone standing on purpose — the operator needs to boot the app
 * against it. So cleanup happens at the START of the next run for the same scope rather
 * than at the end of this one. Each scope therefore keeps exactly one clone.
 */
async function dropForScope(client, scope) {
  const pattern = `${PREFIX}${scope}_%`;
  const r = await client.query(
    `SELECT nspname FROM pg_namespace WHERE nspname LIKE $1`,
    [pattern],
  );
  for (const { nspname } of r.rows) {
    assertCloneName(nspname);
    await client.query(`DROP SCHEMA ${ident(nspname)} CASCADE`);
    console.log(`[guard] dropped predecessor ${nspname}`);
  }
  return r.rowCount;
}
// [SCOPE 120 / T008] END

// [SCOPE 120 / T002] BEGIN — Create a clone and refuse the run unless it is faithful
/**
 * Shells out to the SCOPE-111 clone engine and reads its verdict. That script prints a
 * single JSON line as its last output; anything else on stdout is progress reporting.
 *
 * `faithful` is not advisory. INCLUDING ALL does not copy foreign keys — they are
 * reflected in a second pass and counted — so an unfaithful clone is one whose
 * constraints silently differ from production. Tests against it would pass where
 * production rejects.
 */
function runCloneScript(name) {
  const res = spawnSync(process.execPath, [CLONE_SCRIPT, '--create', '--name', name], {
    encoding: 'utf8',
  });
  if (res.stdout) process.stdout.write(res.stdout);
  if (res.stderr) process.stderr.write(res.stderr);

  const jsonLine = (res.stdout ?? '')
    .split(/\r?\n/)
    .reverse()
    .find((l) => l.trim().startsWith('{'));

  if (!jsonLine) {
    refuse('clone engine produced no result line — cannot confirm the clone is faithful');
  }

  let verdict;
  try {
    verdict = JSON.parse(jsonLine);
  } catch {
    refuse(`clone engine result was not parseable JSON: ${jsonLine}`);
  }

  if (verdict.faithful !== true) {
    refuse(
      `clone "${verdict.schema}" is NOT faithful ` +
        `(${verdict.tables} tables, ${verdict.foreignKeys} FKs) — refusing to test against it`,
    );
  }
  return verdict;
}

async function createForScope(client, scope) {
  await dropForScope(client, scope);

  // Deterministic-ish, readable, and unique per run without needing a clock source.
  const suffix = process.pid.toString(36) + Math.floor(process.uptime() * 1000).toString(36);
  const name = assertCloneName(`${PREFIX}${scope}_${suffix}`);

  const verdict = runCloneScript(name);
  console.log(`[guard] clone ready: ${verdict.schema} (${verdict.tables} tables, ${verdict.foreignKeys} FKs)`);
  return verdict;
}
// [SCOPE 120 / T002] END

// [SCOPE 120 / T002] BEGIN — Command dispatch
const scope = val('scope');
const { client, host, database } = await connect();
try {
  console.log(`[guard] connected ${host}/${database}`);

  if (has('list')) {
    await listClones(client);
  } else if (has('teardown')) {
    if (!scope) refuse('--teardown requires --scope');
    const n = await dropForScope(client, scope);
    if (n === 0) console.log(`[guard] no clone present for scope ${scope}`);
  } else if (has('verify')) {
    const target = assertCloneName(val('verify'));
    await client.query(`SET search_path TO ${ident(target)}, public`);
    await assertIsolated(client, target);
    console.log(JSON.stringify({ schema: target, isolated: true }));
  } else if (has('create')) {
    if (!scope) refuse('--create requires --scope');
    const verdict = await createForScope(client, scope);

    // Prove isolation immediately, on a connection configured exactly as the test run
    // will configure its own. A clone that cannot be safely written to is not ready.
    await client.query(`SET search_path TO ${ident(verdict.schema)}, public`);
    await assertIsolated(client, verdict.schema);

    console.log('');
    console.log(JSON.stringify({ ...verdict, isolated: true }));
    console.log(`[guard] run tests with:  SET search_path TO ${verdict.schema}, public;`);
    console.log(`[guard] tear down with:  node clone-guard.mjs --scope ${scope} --teardown`);
  } else {
    console.log('Usage: --scope N --create | --scope N --verify <schema> | --scope N --teardown | --list');
    process.exitCode = 1;
  }
} finally {
  await client.end();
}
// [SCOPE 120 / T002] END
