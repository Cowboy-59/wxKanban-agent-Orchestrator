#!/usr/bin/env node
//
// Apply a scope's pending DDL to its test clone — so a migration's first execution is
// never against production.
//
// WHY THIS EXISTS
// Under SCOPE-117 schema changes are applied to production BY HAND and there is no
// migration ledger. That leaves no rehearsal surface at all: the local .env DATABASE_URL
// points at production and the hosted MCP shares the same RDS. The recurring 42P01
// production 500s trace directly to DDL whose first execution was against prod.
//
// A wxktest_ clone gives that SQL somewhere to fail harmlessly first.
//
// WHY IT CLASSIFIES RATHER THAN JUST RUNNING
// The clone is copied from live `public`. If part of a migration is already applied to
// production, those objects arrive in the clone already present, and re-running the
// statement raises "already exists". That is not a failure — it is the answer to "which
// parts of this migration are already live?", which SCOPE-117's workflow otherwise has
// no way to ask. So statements are classified, not merely executed.
//
// Usage:
//   node apply-ddl.mjs --schema wxktest_119_ab12 --scope 119
//   node apply-ddl.mjs --schema wxktest_119_ab12 --file src/db/migrations/0059_x.sql
//   node apply-ddl.mjs --schema wxktest_119_ab12 --scope 119 --dry-run
//
// Exit codes: 0 ok · 1 a statement genuinely failed · 2 refused (safety guard)

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';

// [SCOPE 120 / T004] BEGIN — Argument handling and the schema-prefix boundary
const PREFIX = 'wxktest_';
const MIGRATIONS_DIR = 'src/db/migrations';

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
 * The authorization boundary for this tool is the schema prefix, not the statement.
 * Inside a wxktest_ schema any DDL may run freely, with no per-statement approval.
 * Outside it, nothing may run at all.
 */
function assertCloneSchema(name) {
  if (!name) refuse('--schema is required');
  if (!name.startsWith(PREFIX)) {
    refuse(`"${name}" does not start with "${PREFIX}" — DDL is only ever applied inside a test clone`);
  }
  if (!/^[a-z0-9_]+$/.test(name)) refuse(`"${name}" is not a safe identifier`);
  return name;
}
// [SCOPE 120 / T004] END

// [SCOPE 120 / T004] BEGIN — Locate a scope's migration files
/**
 * Convention in this repo is `NNNN_scopeNNN_name.sql`. Matching on the scope token rather
 * than a ledger is deliberate — there is no ledger, which is the whole problem.
 */
function findScopeMigrations(scope) {
  const token = `_scope${String(scope).padStart(3, '0')}_`;
  let entries;
  try {
    entries = readdirSync(MIGRATIONS_DIR);
  } catch {
    refuse(`cannot read ${MIGRATIONS_DIR}`);
  }
  return entries
    .filter((f) => f.endsWith('.sql') && f.includes(token))
    .sort()
    .map((f) => join(MIGRATIONS_DIR, f));
}
// [SCOPE 120 / T004] END

// [SCOPE 120 / T004] BEGIN — Split SQL into statements without breaking on quotes or bodies
/**
 * A naive split on ';' corrupts dollar-quoted function bodies and any semicolon inside a
 * string literal or comment. Today's migrations contain neither, but a migration that did
 * would be silently mangled — and the failure would look like bad SQL rather than a bad
 * splitter, which is an expensive thing to debug at 2am.
 */
function splitStatements(sql) {
  const out = [];
  let buf = '';
  let i = 0;
  let inLine = false;
  let inBlock = false;
  let inSingle = false;
  let inDouble = false;
  let dollarTag = null;

  while (i < sql.length) {
    const ch = sql[i];
    const next2 = sql.slice(i, i + 2);

    if (inLine) {
      buf += ch;
      if (ch === '\n') inLine = false;
      i += 1;
      continue;
    }
    if (inBlock) {
      buf += ch;
      if (next2 === '*/') { buf += '/'; i += 2; inBlock = false; continue; }
      i += 1;
      continue;
    }
    if (dollarTag) {
      if (sql.startsWith(dollarTag, i)) { buf += dollarTag; i += dollarTag.length; dollarTag = null; continue; }
      buf += ch; i += 1; continue;
    }
    if (inSingle) {
      buf += ch;
      if (ch === "'") inSingle = sql[i + 1] === "'" ? (buf += sql[i + 1], i += 1, true) : false;
      i += 1;
      continue;
    }
    if (inDouble) {
      buf += ch;
      if (ch === '"') inDouble = false;
      i += 1;
      continue;
    }

    if (next2 === '--') { inLine = true; buf += next2; i += 2; continue; }
    if (next2 === '/*') { inBlock = true; buf += next2; i += 2; continue; }
    if (ch === "'") { inSingle = true; buf += ch; i += 1; continue; }
    if (ch === '"') { inDouble = true; buf += ch; i += 1; continue; }

    const dollar = /^\$[A-Za-z_0-9]*\$/.exec(sql.slice(i));
    if (dollar) { dollarTag = dollar[0]; buf += dollarTag; i += dollarTag.length; continue; }

    if (ch === ';') { out.push(buf.trim()); buf = ''; i += 1; continue; }

    buf += ch;
    i += 1;
  }
  if (buf.trim()) out.push(buf.trim());

  // A statement of only comments/whitespace is not a statement.
  return out.filter((s) => s.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').trim().length > 0);
}
// [SCOPE 120 / T004] END

// [SCOPE 120 / T004] BEGIN — Refuse any statement that explicitly escapes the clone
/**
 * search_path routes UNQUALIFIED objects into the clone. A statement that writes
 * `public.` explicitly ignores search_path entirely and would hit production. Reading
 * from public is fine (extensions and functions live there); creating, altering,
 * dropping or truncating there is not.
 */
const ESCAPES_CLONE =
  /\b(CREATE|ALTER|DROP|TRUNCATE)\b[\s\S]{0,80}?\bpublic\s*\.\s*["a-z_]/i;

function assertStaysInClone(stmt, index) {
  if (ESCAPES_CLONE.test(stmt)) {
    refuse(
      `statement ${index + 1} targets "public." explicitly, which bypasses search_path and ` +
        `would write to PRODUCTION:\n  ${stmt.slice(0, 160)}`,
    );
  }
}
// [SCOPE 120 / T004] END

// [SCOPE 120 / T004] BEGIN — Apply and classify
/** Postgres codes that mean "this object is already here", i.e. already live in prod. */
const ALREADY_EXISTS = new Set(['42P07', '42710', '42701', '42P16']);

/**
 * `IF NOT EXISTS` does NOT raise — it succeeds and emits a NOTICE. So error codes alone
 * classify every idempotent no-op as "applied", and the report cheerfully claims a
 * migration ran when nothing happened. Since every migration in this repo is written
 * idempotently (SCOPE-117 requires it, so hand-applying twice is safe), that error-code
 * path would almost never fire and the summary would be wrong almost every time.
 *
 * The notice is the only signal that distinguishes "created it" from "it was already
 * there" — and that distinction IS the answer to "which parts of this migration are
 * already live in production?", which is the question this tool exists to answer.
 */
const SKIPPED_NOTICE = /already exists, skipping|skipping add column/i;

async function applyFile(client, path, dryRun) {
  const sql = readFileSync(path, 'utf8');
  const statements = splitStatements(sql);
  statements.forEach(assertStaysInClone);

  console.log(`\n[ddl] ${path} — ${statements.length} statement(s)`);
  const result = { path, applied: 0, alreadyPresent: 0, failed: [] };

  let notices = [];
  const onNotice = (n) => notices.push(n.message ?? '');
  client.on('notice', onNotice);

  try {
    for (const [i, stmt] of statements.entries()) {
      const label = stmt.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim().slice(0, 90);
      if (dryRun) {
        console.log(`  [dry] ${i + 1}. ${label}`);
        continue;
      }
      notices = [];
      try {
        await client.query(stmt);
        if (notices.some((m) => SKIPPED_NOTICE.test(m))) {
          result.alreadyPresent += 1;
          console.log(`  ➖ ${i + 1}. already live — ${label}`);
        } else {
          result.applied += 1;
          console.log(`  ✅ ${i + 1}. ${label}`);
        }
      } catch (err) {
        if (ALREADY_EXISTS.has(err.code)) {
          result.alreadyPresent += 1;
          console.log(`  ➖ ${i + 1}. already live (${err.code}) — ${label}`);
        } else {
          result.failed.push({ index: i + 1, code: err.code, message: err.message, statement: label });
          console.error(`  ❌ ${i + 1}. ${err.code} ${err.message}`);
          console.error(`       ${label}`);
        }
      }
    }
  } finally {
    client.removeListener('notice', onNotice);
  }
  return result;
}

async function connect(schema) {
  const raw =
    val('url') ??
    (() => {
      try {
        const env = readFileSync('.env', 'utf8');
        const pick = (k) => {
          const m = env.match(new RegExp(`^${k}=(.*)$`, 'm'));
          return m ? m[1].trim().replace(/^["']|["']$/g, '') : null;
        };
        return pick('TEST_DATABASE_URL') ?? pick('DATABASE_URL');
      } catch {
        return process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? null;
      }
    })();
  if (!raw) refuse('no DATABASE_URL / TEST_DATABASE_URL found');

  const u = new URL(raw);
  u.searchParams.delete('sslmode');
  u.searchParams.delete('ssl');
  const client = new pg.Client({ connectionString: u.toString(), ssl: { rejectUnauthorized: false } });
  await client.connect();
  await client.query(`SET search_path TO ${ident(schema)}, public`);

  // Never take the caller's word for it. If search_path did not take — a schema that does
  // not exist resolves silently to public — this is production and the run must stop.
  const cur = await client.query('SELECT current_schema() AS s');
  if (cur.rows[0]?.s !== schema) {
    refuse(`current_schema() is "${cur.rows[0]?.s}" but --schema said "${schema}" — refusing to apply DDL`);
  }
  return client;
}
// [SCOPE 120 / T004] END

// [SCOPE 120 / T004] BEGIN — Entry point
const schema = assertCloneSchema(val('schema'));
const scope = val('scope');
const single = val('file');
const dryRun = has('dry-run');

const files = single ? [single] : scope ? findScopeMigrations(scope) : [];
if (files.length === 0) {
  console.log(`[ddl] no migration files found for ${single ?? `scope ${scope}`} — nothing to apply`);
  console.log(JSON.stringify({ schema, files: 0, applied: 0, alreadyPresent: 0, failed: 0 }));
  process.exit(0);
}

const client = await connect(schema);
try {
  console.log(`[ddl] target schema ${schema} (verified via current_schema())`);
  const results = [];
  for (const f of files) results.push(await applyFile(client, f, dryRun));

  const applied = results.reduce((a, r) => a + r.applied, 0);
  const already = results.reduce((a, r) => a + r.alreadyPresent, 0);
  const failed = results.flatMap((r) => r.failed);

  console.log('');
  console.log(`[ddl] ${files.length} file(s): ${applied} applied, ${already} already present, ${failed.length} failed`);
  if (already > 0 && failed.length === 0) {
    console.log('[ddl] "already present" means those objects are ALREADY LIVE in production.');
  }
  console.log(JSON.stringify({ schema, files: files.length, applied, alreadyPresent: already, failed: failed.length }));

  if (failed.length > 0) process.exitCode = 1;
} finally {
  await client.end();
}
// [SCOPE 120 / T004] END
