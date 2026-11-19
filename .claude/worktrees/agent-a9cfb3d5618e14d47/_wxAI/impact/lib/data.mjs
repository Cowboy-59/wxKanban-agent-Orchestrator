// Data links for the Change Impact engine (SCOPE-137 FR-002 (4)–(6)).
//
// Two pieces of code that share a table never import each other, so the import
// graph alone misses the coupling a database creates. This module finds:
//   (4) code → table, read or write — Drizzle calls (Confirmed) and raw SQL (Likely)
//   (5) table → table through foreign keys (Confirmed)
//   (6) migration → tables (reused from graph.mjs, Confirmed)
// It also builds the per-table reader/writer index that the Impact Boundary
// rule ("a shared table") needs (FR-006).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// [SCOPE 137 / T005] BEGIN — Data links (FR-002 (4)–(5)): table declarations and foreign keys
// MODIFIED-BY: [SCOPE 137 / T003] — extraction split out (pure, cached per file); builder accepts facts
const TABLE_DECL_RE = /export\s+const\s+(\w+)\s*=\s*(?:pg|mysql|sqlite)Table\(\s*['"]([A-Za-z0-9_]+)['"]/g;
const FK_RE = /\.references\(\s*\(\)\s*=>\s*(\w+)\.\w+/g;

/** Table declarations in one source text: [{ js, sql, refs: [jsName] }] (pure; cached per file). */
export function extractSchemaDecls(src) {
  if (!/Table\(/.test(src)) return [];
  const decls = [];
  TABLE_DECL_RE.lastIndex = 0;
  let m;
  while ((m = TABLE_DECL_RE.exec(src)) !== null) decls.push({ js: m[1], sql: m[2], at: m.index });
  return decls.map((d, i) => {
    const segment = src.slice(d.at, decls[i + 1]?.at ?? src.length);
    const refs = [];
    FK_RE.lastIndex = 0;
    let f;
    while ((f = FK_RE.exec(segment)) !== null) refs.push(f[1]);
    return { js: d.js, sql: d.sql, refs };
  });
}

/**
 * Scan source files for Drizzle table declarations.
 * Returns { tables: Map(jsName -> { sql, file }), fks: [{ from, to, file }] } where
 * from/to are SQL table names. A foreign key belongs to the declaration it sits in.
 */
export function scanSchema(root, files, facts = null) {
  const tables = new Map();
  const pending = []; // [{ fromSql, refJs, file }] resolved once every table is known
  for (const file of files) {
    let decls = facts?.get(file)?.schema;
    if (!decls) {
      let src;
      try {
        src = readFileSync(join(root, file), 'utf8');
      } catch {
        continue;
      }
      decls = extractSchemaDecls(src);
    }
    for (const d of decls) {
      if (!tables.has(d.js)) tables.set(d.js, { sql: d.sql, file });
      for (const refJs of d.refs) pending.push({ fromSql: d.sql, refJs, file });
    }
  }
  const fks = [];
  const seen = new Set();
  for (const p of pending) {
    const to = tables.get(p.refJs)?.sql;
    if (!to || to === p.fromSql) continue;
    const key = `${p.fromSql}>${to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    fks.push({ from: p.fromSql, to, file: p.file });
  }
  return { tables, fks };
}
// [SCOPE 137 / T005] END

// [SCOPE 137 / T005] BEGIN — Data links (FR-002 (4)): code → table usage, read or write
// MODIFIED-BY: [SCOPE 137 / T007] — MongoDB collections read and written (FR-005)
// MODIFIED-BY: [SCOPE 137 / T003] — extraction split out (pure, cached per file); builder accepts facts
const DRIZZLE_WRITE_RE = /\.(insert|update|delete)\(\s*(\w+)\s*\)/g;
const DRIZZLE_READ_RE = /\.(?:from|innerJoin|leftJoin|rightJoin|fullJoin|join)\(\s*(\w+)\b/g;
const DRIZZLE_QUERY_RE = /\.query\.(\w+)\./g;
const RAW_WRITE_RE = /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+["`]?([a-z0-9_]+)["`]?/gi;
const RAW_READ_RE = /\b(?:FROM|JOIN)\s+["`]?([a-z0-9_]+)["`]?/gi;
const RAW_CONTEXT_RE = /sql`|\.unsafe\(|\.query\(\s*[`'"]|\.execute\(\s*sql`/;

/**
 * Table tokens in one source text (pure; cached per file):
 * { w: [js], r: [js] } from Drizzle calls, { rw: [name], rr: [name] } from raw SQL.
 * Names are resolved against the schema later, so the cache never goes stale on a schema change.
 */
export function extractTableTokens(src) {
  const tokens = { w: [], r: [], rw: [], rr: [], cw: [], cr: [] };
  // MongoDB collections (T007, FR-005): db.collection('users').insertOne(...) and reads.
  if (src.includes('.collection(')) {
    for (const m of src.matchAll(/\.collection\(\s*['"](\w+)['"]\s*\)\s*\.(\w+)/g)) {
      (/^(insert|update|delete|replace|findOneAnd(?:Update|Delete|Replace)|bulkWrite)/.test(m[2]) ? tokens.cw : tokens.cr).push(m[1].toLowerCase());
    }
  }
  for (const [re, bucket] of [[DRIZZLE_WRITE_RE, 'w'], [DRIZZLE_READ_RE, 'r'], [DRIZZLE_QUERY_RE, 'r']]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src)) !== null) tokens[bucket].push(re === DRIZZLE_WRITE_RE ? m[2] : m[1]);
  }
  if (RAW_CONTEXT_RE.test(src)) {
    for (const [re, bucket] of [[RAW_WRITE_RE, 'rw'], [RAW_READ_RE, 'rr']]) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(src)) !== null) tokens[bucket].push(m[1].toLowerCase());
    }
  }
  for (const k of Object.keys(tokens)) tokens[k] = [...new Set(tokens[k])];
  return tokens;
}

/**
 * Which tables each file reads and writes.
 * Returns Map(file -> [{ table, access: 'read'|'write', confidence }]).
 * Drizzle calls name a table object and are Confirmed; raw SQL is matched as text
 * against known table names only, and is Likely.
 */
export function scanTableUsage(root, files, schema, facts = null) {
  const jsToSql = new Map([...schema.tables].map(([js, t]) => [js, t.sql]));
  const sqlNames = new Set([...schema.tables.values()].map((t) => t.sql));
  const usage = new Map();
  for (const file of files) {
    let tokens = facts?.get(file)?.tables;
    if (!tokens) {
      let src;
      try {
        src = readFileSync(join(root, file), 'utf8');
      } catch {
        continue;
      }
      tokens = extractTableTokens(src);
    }
    const found = new Map(); // key table|access -> entry
    const add = (table, access, confidence) => {
      const key = `${table}|${access}`;
      const prev = found.get(key);
      if (!prev || (prev.confidence === 'Likely' && confidence === 'Confirmed')) found.set(key, { table, access, confidence });
    };
    for (const js of tokens.w) if (jsToSql.has(js)) add(jsToSql.get(js), 'write', 'Confirmed');
    for (const js of tokens.r) if (jsToSql.has(js)) add(jsToSql.get(js), 'read', 'Confirmed');
    for (const name of tokens.rw) if (sqlNames.has(name)) add(name, 'write', 'Likely');
    for (const name of tokens.rr) if (sqlNames.has(name)) add(name, 'read', 'Likely');
    // MongoDB has no schema to check names against; a named collection is itself the evidence (Likely).
    for (const name of tokens.cw ?? []) add(`collection:${name}`, 'write', 'Likely');
    for (const name of tokens.cr ?? []) add(`collection:${name}`, 'read', 'Likely');
    if (found.size) usage.set(file, [...found.values()]);
  }
  return usage;
}
// [SCOPE 137 / T005] END

// [SCOPE 137 / T005] BEGIN — Data links (FR-006 groundwork): per-table readers and writers
/** Invert usage into Map(table -> { readers: Set(file), writers: Set(file) }). */
export function tableIndex(usage) {
  const index = new Map();
  for (const [file, entries] of usage) {
    for (const e of entries) {
      if (!index.has(e.table)) index.set(e.table, { readers: new Set(), writers: new Set() });
      index.get(e.table)[e.access === 'write' ? 'writers' : 'readers'].add(file);
    }
  }
  return index;
}
// [SCOPE 137 / T005] END

// [SCOPE 137 / T005] BEGIN — Data links (FR-002 (4)–(6)): links reached from a change set
/**
 * Data links for a change set:
 *  - a changed file that WRITES a table reaches every other file that reads or
 *    writes it (the coupling the import graph cannot see);
 *  - a changed file that DECLARES a table (schema) reaches every file using it;
 *  - a changed migration reaches every file using the tables it alters;
 *  - an affected table reaches the tables whose foreign keys point at it.
 * Forward links (what the changed file itself reads/writes) are reported as
 * direction 'dependency'.
 */
export function dataLinks({ changedFiles, schema, usage, migrationTablesByFile }) {
  const index = tableIndex(usage);
  const declaredIn = new Map();
  for (const t of schema.tables.values()) {
    if (!declaredIn.has(t.file)) declaredIn.set(t.file, new Set());
    declaredIn.get(t.file).add(t.sql);
  }
  const links = [];
  const seen = new Set();
  const push = (l) => {
    const key = `${l.type}|${l.direction}|${l.from}|${l.to}|${l.via ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    links.push(l);
  };
  // A reached link is Confirmed only when both ends are: the origin's relation to
  // the table and the reached file's own use of it (Drizzle Confirmed, raw SQL Likely).
  const reachUsers = (from, table, originConfidence, why) => {
    const entry = index.get(table);
    if (!entry) return;
    for (const f of new Set([...entry.readers, ...entry.writers])) {
      if (f === from) continue;
      const access = entry.writers.has(f) ? 'write' : 'read';
      const own = (usage.get(f) ?? []).filter((e) => e.table === table);
      const ownConfirmed = own.some((e) => e.confidence === 'Confirmed');
      const confidence = originConfidence === 'Confirmed' && ownConfirmed ? 'Confirmed' : 'Likely';
      push({ type: 'table', direction: 'dependent', from, to: f, via: `table:${table}`, access, confidence, why });
    }
  };

  const affectedTables = new Map(); // table -> origin file
  for (const file of changedFiles) {
    for (const e of usage.get(file) ?? []) {
      push({ type: 'table', direction: 'dependency', from: file, to: `table:${e.table}`, access: e.access, confidence: e.confidence });
      if (e.access === 'write') reachUsers(file, e.table, e.confidence, `writes ${e.table}`);
    }
    for (const table of declaredIn.get(file) ?? []) {
      affectedTables.set(table, file);
      reachUsers(file, table, 'Confirmed', `declares ${table}`);
    }
    for (const table of migrationTablesByFile.get(file) ?? []) {
      affectedTables.set(table, file);
      reachUsers(file, table, 'Confirmed', `migration alters ${table}`);
    }
  }
  for (const [table, origin] of affectedTables) {
    for (const fk of schema.fks) {
      if (fk.to !== table) continue;
      push({ type: 'foreign-key', direction: 'dependent', from: origin, to: `table:${fk.from}`, via: `table:${table}`, confidence: 'Confirmed', why: `${fk.from} references ${table}` });
      reachUsers(origin, fk.from, 'Confirmed', `${fk.from} references ${table}`);
    }
  }
  return links;
}
// [SCOPE 137 / T005] END
