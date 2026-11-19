#!/usr/bin/env node
// [SCOPE 111 / Amendment B] Clone the live schema into a disposable TEST SCHEMA.
//
// WHY THIS EXISTS
// The CRUD/execute gate needs somewhere real to write. A separate database on a
// separate host is the textbook answer, but it is not always available — and the
// wxCreateTestPlan skill previously hard-stopped when it wasn't. A Postgres
// SCHEMA gives genuine isolation without a second host: unqualified writes land
// in the clone via `search_path`, and production tables are never touched.
//
// WHY IT IS DONE IN SQL
// `pg_dump`/`psql` are not guaranteed to be on PATH (they are not on the
// wxKanban dev machine), so shelling out to dump-and-restore is not an option.
// Everything here goes over the ordinary node-postgres connection.
//
// WHY IT TAKES SEVERAL PASSES
// Postgres has no `CREATE SCHEMA x LIKE y`. `CREATE TABLE (LIKE src INCLUDING
// ALL)` copies columns, defaults, not-null, indexes and CHECK constraints — but
// NOT foreign keys. For this project that omission would be fatal: the
// executor rule is a composite FK plus a check constraint, so a clone without
// FKs would let a test pass that production would reject. FKs are therefore
// reflected from pg_constraint and re-emitted schema-qualified in a second pass,
// after every table exists.
//
// Usage:
//   node clone-test-schema.mjs --create [--name wxktest_run1] [--url $TEST_DATABASE_URL]
//   node clone-test-schema.mjs --drop --name wxktest_run1
//   node clone-test-schema.mjs --list
//
// Exit codes: 0 ok · 1 failed · 2 refused (safety guard)

import { readFileSync } from 'node:fs';
import pg from 'pg';

const args = process.argv.slice(2);
const has = (f) => args.includes(`--${f}`);
const val = (f, d = null) => {
  const i = args.indexOf(`--${f}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d;
};

/**
 * Every clone name carries this prefix, and every destructive operation checks
 * it. A drop can therefore never reach `public` or any real schema, no matter
 * what is passed in.
 */
const PREFIX = 'wxktest_';
const SOURCE_SCHEMA = val('source', 'public');

function refuse(msg) {
  console.error(`REFUSED: ${msg}`);
  process.exit(2);
}

function assertCloneName(name) {
  if (!name) refuse('no schema name given');
  if (!name.startsWith(PREFIX)) {
    refuse(`"${name}" does not start with "${PREFIX}" — refusing to touch a schema this script did not create`);
  }
  if (name === SOURCE_SCHEMA || name === 'public') {
    refuse(`"${name}" is the source schema`);
  }
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
    // Prefer an explicit test URL; fall back to the app URL because the clone
    // is isolated BY SCHEMA — that is the whole point of this script.
    return pick('TEST_DATABASE_URL') ?? pick('DATABASE_URL');
  } catch {
    return process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? null;
  }
}

async function connect() {
  const raw = resolveUrl();
  if (!raw) refuse('no DATABASE_URL / TEST_DATABASE_URL found');
  const u = new URL(raw);
  // pg 8.12+ treats sslmode=require as verify-full; SSL is set explicitly below.
  u.searchParams.delete('sslmode');
  u.searchParams.delete('ssl');
  const client = new pg.Client({
    connectionString: u.toString(),
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  return { client, host: u.hostname, database: u.pathname.replace(/^\//, '') };
}

const ident = (s) => `"${String(s).replace(/"/g, '""')}"`;

async function createClone(client, target) {
  const exists = await client.query(
    'SELECT 1 FROM pg_namespace WHERE nspname = $1',
    [target],
  );
  // Never reuse a dirty schema — a half-populated clone produces results that
  // look real and are not.
  if (exists.rowCount) refuse(`schema "${target}" already exists — drop it first`);

  const tables = await client.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = $1 ORDER BY tablename`,
    [SOURCE_SCHEMA],
  );
  if (tables.rowCount === 0) refuse(`source schema "${SOURCE_SCHEMA}" has no tables`);

  console.log(`[clone] source ${SOURCE_SCHEMA} → ${target} (${tables.rowCount} tables)`);
  await client.query('BEGIN');
  try {
    await client.query(`CREATE SCHEMA ${ident(target)}`);

    // Pass 1 — structure. INCLUDING ALL brings defaults, not-null, indexes,
    // identity/generated columns and CHECK constraints. Not foreign keys.
    for (const { tablename } of tables.rows) {
      await client.query(
        `CREATE TABLE ${ident(target)}.${ident(tablename)} ` +
          `(LIKE ${ident(SOURCE_SCHEMA)}.${ident(tablename)} INCLUDING ALL)`,
      );
    }
    console.log(`[clone] pass 1: ${tables.rowCount} tables created (structure + indexes + checks)`);

    // Pass 2 — foreign keys, now that every table exists. pg_get_constraintdef
    // renders the definition; the referenced schema is rewritten to the clone so
    // a child row cannot accidentally point at production.
    const fks = await client.query(
      `SELECT c.conname, t.relname AS tablename, pg_get_constraintdef(c.oid) AS def
         FROM pg_constraint c
         JOIN pg_class t ON t.oid = c.conrelid
         JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE c.contype = 'f' AND n.nspname = $1`,
      [SOURCE_SCHEMA],
    );

    let added = 0;
    let skipped = 0;
    for (const fk of fks.rows) {
      // "FOREIGN KEY (a) REFERENCES tbl(b) ON DELETE CASCADE" — qualify the
      // target so it resolves inside the clone regardless of search_path.
      const def = fk.def.replace(
        /REFERENCES\s+(?:"?[\w]+"?\.)?"?([\w]+)"?/i,
        (_m, refTable) => `REFERENCES ${ident(target)}.${ident(refTable)}`,
      );
      try {
        await client.query(
          `ALTER TABLE ${ident(target)}.${ident(fk.tablename)} ` +
            `ADD CONSTRAINT ${ident(fk.conname)} ${def}`,
        );
        added += 1;
      } catch (err) {
        // A composite FK targeting a unique INDEX (not a constraint) can fail
        // to re-attach. Report it — a silently missing FK is exactly the kind of
        // gap that makes a clone lie.
        skipped += 1;
        console.warn(`[clone] WARNING: could not recreate FK ${fk.conname} on ${fk.tablename}: ${err.message}`);
      }
    }
    console.log(`[clone] pass 2: ${added} foreign keys recreated${skipped ? `, ${skipped} SKIPPED (see warnings)` : ''}`);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }

  // Verification is not optional: a clone that quietly lost constraints would
  // let tests pass that production rejects.
  const check = await client.query(
    `SELECT
       (SELECT count(*)::int FROM pg_tables WHERE schemaname = $1) AS tables,
       (SELECT count(*)::int FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
          JOIN pg_namespace n ON n.oid=t.relnamespace
         WHERE n.nspname = $1 AND c.contype='f') AS fks,
       (SELECT count(*)::int FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
          JOIN pg_namespace n ON n.oid=t.relnamespace
         WHERE n.nspname = $1 AND c.contype='c') AS checks,
       (SELECT count(*)::int FROM pg_indexes WHERE schemaname = $1) AS indexes`,
    [target],
  );
  const src = await client.query(
    `SELECT
       (SELECT count(*)::int FROM pg_tables WHERE schemaname = $1) AS tables,
       (SELECT count(*)::int FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
          JOIN pg_namespace n ON n.oid=t.relnamespace
         WHERE n.nspname = $1 AND c.contype='f') AS fks,
       (SELECT count(*)::int FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
          JOIN pg_namespace n ON n.oid=t.relnamespace
         WHERE n.nspname = $1 AND c.contype='c') AS checks,
       (SELECT count(*)::int FROM pg_indexes WHERE schemaname = $1) AS indexes`,
    [SOURCE_SCHEMA],
  );

  const c = check.rows[0];
  const s = src.rows[0];
  console.log('[clone] verification  clone / source');
  console.log(`  tables   ${c.tables} / ${s.tables}${c.tables === s.tables ? '' : '   <-- MISMATCH'}`);
  console.log(`  fkeys    ${c.fks} / ${s.fks}${c.fks === s.fks ? '' : '   <-- MISMATCH'}`);
  console.log(`  checks   ${c.checks} / ${s.checks}`);
  console.log(`  indexes  ${c.indexes} / ${s.indexes}`);

  const faithful = c.tables === s.tables && c.fks === s.fks;
  console.log('');
  console.log(JSON.stringify({ schema: target, faithful, tables: c.tables, foreignKeys: c.fks }));

  if (!faithful) {
    console.error('[clone] Clone is NOT faithful — do not run CRUD tests against it.');
    process.exitCode = 1;
  } else {
    console.log(`[clone] Ready. Run tests with:  SET search_path TO ${target}, public;`);
    console.log(`[clone] Tear down with:         node clone-test-schema.mjs --drop --name ${target}`);
  }
}

async function dropClone(client, target) {
  assertCloneName(target);
  const exists = await client.query('SELECT 1 FROM pg_namespace WHERE nspname = $1', [target]);
  if (!exists.rowCount) {
    console.log(`[clone] "${target}" does not exist — nothing to drop`);
    return;
  }
  await client.query(`DROP SCHEMA ${ident(target)} CASCADE`);
  console.log(`[clone] dropped ${target}`);
}

async function listClones(client) {
  const r = await client.query(
    `SELECT nspname,
            (SELECT count(*)::int FROM pg_tables WHERE schemaname = nspname) AS tables
       FROM pg_namespace WHERE nspname LIKE $1 ORDER BY nspname`,
    [`${PREFIX}%`],
  );
  if (r.rowCount === 0) {
    console.log('[clone] no test schemas present');
    return;
  }
  for (const row of r.rows) console.log(`  ${row.nspname}  (${row.tables} tables)`);
}

const { client, host, database } = await connect();
try {
  console.log(`[clone] connected ${host}/${database}`);

  if (has('list')) {
    await listClones(client);
  } else if (has('drop')) {
    await dropClone(client, val('name'));
  } else if (has('create')) {
    const name = assertCloneName(
      val('name') ?? `${PREFIX}${Date.now().toString(36)}`,
    );
    await createClone(client, name);
  } else {
    console.log('Usage: --create [--name wxktest_x] | --drop --name wxktest_x | --list');
    process.exitCode = 1;
  }
} finally {
  await client.end();
}
