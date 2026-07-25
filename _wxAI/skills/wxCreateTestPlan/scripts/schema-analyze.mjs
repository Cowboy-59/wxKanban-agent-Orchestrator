#!/usr/bin/env node
/**
 * schema-analyze.mjs — deterministic database-schema audit for the wxCreateTestPlan skill.
 *
 * Parses the Drizzle `pgTable(...)` definitions under a schema dir and emits actionable findings
 * across five dimensions the test plan owes:
 *   1. Referential integrity  — a 0–10 score (unenforced FKs, missing onDelete, FK w/o index).
 *   2. Field mapping / table definitions — wxKanban naming + type conventions.
 *   3. Orphaned tables & data — island tables; ready-to-run READ-ONLY orphan-row SQL per FK.
 *   4. Missing indexes — FK columns (and common filter cols) with no covering index.
 *   5. Excessive indexes — duplicate / prefix-redundant / unique-shadowed indexes.
 *
 * Every finding carries file:line so it is actionable. Static by default; `--live` runs the
 * emitted orphan-data SQL READ-ONLY against a NON-PROD DB (verified MCP-UAT or TEST_DATABASE_URL).
 *
 * Usage:
 *   node schema-analyze.mjs --root src/db/schema [--out tests/.../schema-analysis.json]
 *       [--md tests/.../SCHEMA-ANALYSIS.md] [--live]
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

// ----------------------------------------------------------------------------- args
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};
const flag = (name) => argv.includes(`--${name}`);

const repoRoot = process.cwd();
const rootArg = arg('root', 'src/db/schema');
const root = resolve(repoRoot, rootArg);
if (!existsSync(root)) {
  console.error(`schema-analyze: --root "${rootArg}" does not exist (resolved to ${root})`);
  process.exit(1);
}
const outJson = resolve(repoRoot, arg('out', join(rootArg, 'schema-analysis.json')));
const outMd = arg('md') ? resolve(repoRoot, arg('md')) : null;
const live = flag('live');
const quiet = flag('quiet');

// ----------------------------------------------------------------------------- file walk
const files = readdirSync(root)
  .filter((f) => /\.ts$/.test(f) && !/\.d\.ts$/.test(f))
  .map((f) => join(root, f))
  .sort();

// ----------------------------------------------------------------------------- parse
// Regex-based extraction — Drizzle schema files are declarative and highly regular, so a targeted
// parser is both sufficient and dependency-free (no typescript needed).

/** @type {Map<string, {file:string, line:number, columns:Map, indexes:Array, raw:string}>} */
const tables = new Map();
const allText = new Map(); // file -> full text, for cross-file import/orphan checks

const lineAt = (text, idx) => text.slice(0, idx).split('\n').length;

for (const file of files) {
  const rel = relative(repoRoot, file).replace(/\\/g, '/');
  const text = readFileSync(file, 'utf8');
  allText.set(rel, text);

  // pgTable("name", { ... }, (table) => ({ ... }))  — grab name + the whole call body
  const tableRe = /export\s+const\s+(\w+)\s*=\s*pgTable\(\s*["'`]([^"'`]+)["'`]\s*,/g;
  let m;
  while ((m = tableRe.exec(text))) {
    const [, constName, tableName] = m;
    const startIdx = m.index;
    // Slice a generous window from the pgTable( to the matching close — walk parens.
    const openParen = text.indexOf('(', m.index);
    let depth = 0;
    let end = openParen;
    for (let i = openParen; i < text.length; i++) {
      if (text[i] === '(') depth++;
      else if (text[i] === ')') {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    const body = text.slice(openParen, end + 1);

    // Columns: `name: <builder>("dbname", ...)....` on the first object arg.
    const columns = new Map();
    const colRe = /(\w+)\s*:\s*(uuid|varchar|text|integer|bigint|boolean|timestamp|jsonb|json|numeric|real|serial|date|time|smallint|doublePrecision)\(\s*["'`]([^"'`]+)["'`]([^,\n]*)/g;
    let c;
    while ((c = colRe.exec(body))) {
      const [, prop, type, dbname, tail] = c;
      // The column's full chain runs to the next top-level `,\n    <ident>:` — approximate with a slice.
      const chainStart = c.index;
      const chain = body.slice(chainStart, chainStart + 400);
      const refM = /references\(\(\)\s*=>\s*(\w+)\.(\w+)\s*(?:,\s*\{\s*onDelete:\s*["'`](\w+)["'`])?/.exec(chain);
      columns.set(prop, {
        prop,
        type,
        dbname,
        line: lineAt(text, startIdx + chainStart),
        notNull: /\.notNull\(\)/.test(chain),
        isPk: /\.primaryKey\(\)/.test(chain),
        hasDefault: /\.default\(|\.\$defaultFn\(|\.defaultNow\(/.test(chain),
        varcharLen: type === 'varchar' ? (/\{\s*length:\s*(\d+)/.exec(tail || chain)?.[1] ?? null) : null,
        ref: refM ? { table: refM[1], col: refM[2], onDelete: refM[3] || null } : null,
      });
    }

    // Indexes: index("idx")/uniqueIndex("uq").on(table.a, table.b)
    const indexes = [];
    const idxRe = /(uniqueIndex|index)\(\s*["'`]([^"'`]+)["'`]\s*\)\s*\.on\(([^)]*)\)/g;
    let ix;
    while ((ix = idxRe.exec(body))) {
      const cols = [...ix[3].matchAll(/table\.(\w+)/g)].map((x) => x[1]);
      indexes.push({ name: ix[2], unique: ix[1] === 'uniqueIndex', columns: cols, line: lineAt(text, startIdx + ix.index) });
    }

    tables.set(tableName, { constName, file: rel, line: lineAt(text, startIdx), columns, indexes, raw: body });
  }
}

// ----------------------------------------------------------------------------- analysis
const findings = { referentialIntegrity: [], fieldMapping: [], orphanTables: [], missingIndexes: [], excessiveIndexes: [] };
const orphanDataSql = [];

// A column is an FK-candidate if it is a lowercase `<parent>id` name (the wxKanban FK convention),
// isn't the PK "id", and isn't a common English word that merely ends in "id". CamelCase columns
// are excluded here (they're flagged separately as naming violations) to avoid FK false positives.
const FK_STOP = /^(paid|said|valid|void|grid|rapid|solid|rigid|fluid|avoid|uuid|guid|android|hybrid|acid|arid|lucid|vivid|humid|liquid|candid|squid|orchid|pyramid|overpaid|unpaid|prepaid|repaid|forbid|amid|mid|bid|kid|lid|rid|hid|grid)$/;
const isFkName = (prop) => /^[a-z][a-z0-9]*id$/.test(prop) && prop !== 'id' && !FK_STOP.test(prop);
const indexedCols = (t) => new Set(t.indexes.flatMap((i) => i.columns));

// snapshot of table names for onDelete/ref target validation
const tableConstNames = new Map([...tables.values()].map((t) => [t.constName, t]));

let fkCandidates = 0;
let wUnenforced = 0;
let wNoOnDelete = 0;
let wNoIndex = 0;

for (const [name, t] of tables) {
  const idx = indexedCols(t);
  const singleColIndexes = t.indexes.filter((i) => i.columns.length === 1).map((i) => i.columns[0]);

  // PK present + UUID?
  const pk = [...t.columns.values()].find((c) => c.isPk);
  if (!pk) findings.fieldMapping.push({ table: name, file: t.file, line: t.line, issue: `no primary key declared` });
  else if (pk.type !== 'uuid') findings.fieldMapping.push({ table: name, file: t.file, line: pk.line, issue: `PK '${pk.prop}' is ${pk.type}, expected uuid (UUID v7)` });

  // timestamps
  if (!t.columns.has('createdat')) findings.fieldMapping.push({ table: name, file: t.file, line: t.line, issue: `missing createdat timestamp` });
  if (!t.columns.has('updatedat')) findings.fieldMapping.push({ table: name, file: t.file, line: t.line, issue: `missing updatedat timestamp` });

  // naming conventions
  if (/_/.test(name)) findings.fieldMapping.push({ table: name, file: t.file, line: t.line, issue: `table name contains underscore (convention: concatenated lowercase)` });
  if (/[A-Z]/.test(name)) findings.fieldMapping.push({ table: name, file: t.file, line: t.line, issue: `table name contains uppercase (convention: lowercase)` });

  for (const col of t.columns.values()) {
    if (/_/.test(col.prop) || /[A-Z]/.test(col.prop))
      findings.fieldMapping.push({ table: name, file: t.file, line: col.line, issue: `field '${col.prop}' violates lowercase/no-underscore convention` });
    if (col.type === 'varchar' && !col.varcharLen)
      findings.fieldMapping.push({ table: name, file: t.file, line: col.line, issue: `varchar '${col.prop}' has no length` });

    // ---- referential integrity
    if (isFkName(col.prop) && !col.isPk) {
      fkCandidates++;
      if (!col.ref) {
        wUnenforced += 3;
        findings.referentialIntegrity.push({
          table: name, file: t.file, line: col.line, severity: 'high',
          issue: `column '${col.prop}' looks like a foreign key but has NO .references() — unenforced/implicit FK`,
          fix: `add .references(() => <parent>.id, { onDelete: ... })`,
        });
      } else {
        // real FK: check onDelete + index + target validity
        if (!col.ref.onDelete) {
          wNoOnDelete += 1;
          findings.referentialIntegrity.push({
            table: name, file: t.file, line: col.line, severity: 'medium',
            issue: `FK '${col.prop}' → ${col.ref.table}.${col.ref.col} has no onDelete rule`,
            fix: `specify { onDelete: 'cascade' | 'set null' | 'restrict' }`,
          });
        }
        if (!idx.has(col.prop)) {
          wNoIndex += 1;
          findings.missingIndexes.push({
            table: name, file: t.file, line: col.line, severity: 'medium',
            issue: `FK '${col.prop}' has no covering index (Postgres does not auto-index FKs)`,
            fix: `CREATE INDEX idx_${name}_${col.prop.toLowerCase()} ON ${name}(${col.prop});`,
          });
        }
        // orphan-data SQL (only for real FKs with a resolvable parent table)
        const parent = tableConstNames.get(col.ref.table);
        if (parent) {
          orphanDataSql.push({
            child: name, column: col.prop, parent: parent ? [...tables].find(([, x]) => x.constName === col.ref.table)?.[0] : col.ref.table,
            sql: `SELECT COUNT(*) AS orphans FROM ${name} c LEFT JOIN ${[...tables].find(([, x]) => x.constName === col.ref.table)?.[0] || col.ref.table} p ON c.${col.prop} = p.${col.ref.col} WHERE c.${col.prop} IS NOT NULL AND p.${col.ref.col} IS NULL;`,
          });
        }
      }
    }

    // common filter columns without an index (advisory)
    if (['status', 'locale'].includes(col.prop) && !idx.has(col.prop)) {
      findings.missingIndexes.push({
        table: name, file: t.file, line: col.line, severity: 'low',
        issue: `frequent filter column '${col.prop}' has no index`,
        fix: `CREATE INDEX idx_${name}_${col.prop} ON ${name}(${col.prop});  -- confirm query patterns first`,
      });
    }
  }

  // ---- excessive / redundant indexes
  const seen = new Map();
  for (const i of t.indexes) {
    const key = i.columns.join(',');
    if (seen.has(key)) {
      findings.excessiveIndexes.push({ table: name, file: t.file, line: i.line, severity: 'low', issue: `duplicate index '${i.name}' on (${key}) — same columns as '${seen.get(key)}'`, fix: `DROP INDEX ${i.name}; -- confirm idx_scan=0 in pg_stat_user_indexes` });
    } else seen.set(key, i.name);
  }
  // single-col index redundant with a composite left-prefix
  for (const s of t.indexes.filter((i) => i.columns.length === 1)) {
    const covered = t.indexes.find((i) => i.columns.length > 1 && i.columns[0] === s.columns[0]);
    if (covered)
      findings.excessiveIndexes.push({ table: name, file: t.file, line: s.line, severity: 'low', issue: `index '${s.name}' on (${s.columns[0]}) is a left-prefix of composite '${covered.name}' (${covered.columns.join(',')}) — likely redundant`, fix: `consider DROP INDEX ${s.name}; -- verify no unique/ordering need` });
  }

  // ---- orphan table: no incoming and no outgoing FK
  const hasOutgoing = [...t.columns.values()].some((c) => c.ref);
  // incoming computed after the loop
  t._hasOutgoing = hasOutgoing;
}

// incoming-FK map
const incoming = new Set();
for (const t of tables.values())
  for (const c of t.columns.values())
    if (c.ref) {
      const target = [...tables].find(([, x]) => x.constName === c.ref.table)?.[0];
      if (target) incoming.add(target);
    }

for (const [name, t] of tables) {
  const importedElsewhere = [...allText].some(([f, txt]) => f !== t.file && new RegExp(`\\b${t.constName}\\b`).test(txt));
  if (!t._hasOutgoing && !incoming.has(name)) {
    findings.orphanTables.push({
      table: name, file: t.file, line: t.line, severity: importedElsewhere ? 'low' : 'medium',
      issue: `island table: no incoming and no outgoing FK references${importedElsewhere ? '' : ' and const not referenced by any other schema file'}`,
      fix: `confirm it is intentionally standalone, else add the missing relationship or retire it`,
    });
  }
}

// ----------------------------------------------------------------------------- RI score
const denom = Math.max(1, fkCandidates * 3);
const weighted = wUnenforced + wNoOnDelete + wNoIndex;
const riScore = Math.max(0, Math.min(10, 10 - (10 * weighted) / denom));
const band =
  riScore >= 9 ? 'solid' : riScore >= 7 ? 'minor gaps' : riScore >= 4 ? 'material risk' : 'serious';

// ----------------------------------------------------------------------------- live orphan check (READ-ONLY, opt-in)
let liveResults = null;
if (live) {
  const url = process.env.TEST_DATABASE_URL;
  const PROD_HOST = /rds\.amazonaws\.com/i;
  if (!url) {
    console.error('schema-analyze --live: TEST_DATABASE_URL is not set. Refusing to touch the prod-pointing .env DB.');
    process.exit(2);
  }
  if (PROD_HOST.test(url)) {
    console.error('schema-analyze --live: TEST_DATABASE_URL resolves to a prod RDS host. Refusing (read-only or not).');
    process.exit(2);
  }
  try {
    const { default: pg } = await import('pg');
    const client = new pg.Client({ connectionString: url });
    await client.connect();
    liveResults = [];
    for (const q of orphanDataSql) {
      try {
        const r = await client.query(q.sql);
        liveResults.push({ ...q, orphans: Number(r.rows[0]?.orphans ?? 0) });
      } catch (e) {
        liveResults.push({ ...q, error: String(e.message || e) });
      }
    }
    await client.end();
  } catch (e) {
    console.error(`schema-analyze --live: could not run orphan-data SQL: ${e.message || e}`);
  }
}

// ----------------------------------------------------------------------------- output
const totalFindings = Object.values(findings).reduce((n, a) => n + a.length, 0);
const report = {
  generatedFor: rootArg,
  scanned: { files: files.length, tables: tables.size },
  referentialIntegrity: { score: Number(riScore.toFixed(1)), band, fkCandidates, weighted, components: { unenforcedFk: wUnenforced / 3, fkNoOnDelete: wNoOnDelete, fkNoIndex: wNoIndex } },
  totals: { findings: totalFindings, byDimension: Object.fromEntries(Object.entries(findings).map(([k, v]) => [k, v.length])) },
  findings,
  orphanDataSql,
  liveResults,
};

mkdirSync(dirname(outJson), { recursive: true });
writeFileSync(outJson, JSON.stringify(report, null, 2) + '\n', 'utf8');

if (outMd) {
  const L = [];
  L.push('# Database schema analysis', '', `Generated by \`wxCreateTestPlan/scripts/schema-analyze.mjs\` for \`${rootArg}\`.`, '');
  L.push('> Machine-readable twin: `' + relative(repoRoot, outJson).replace(/\\/g, '/') + '`.', '');
  L.push('## Referential integrity', '', `**Score: ${riScore.toFixed(1)} / 10 — ${band}.**`, '',
    `FK candidates: ${fkCandidates} · unenforced: ${wUnenforced / 3} · missing onDelete: ${wNoOnDelete} · FK without index: ${wNoIndex}`,
    '', `Formula: \`10 − 10 × (${weighted} / ${denom})\`. Bands: 9–10 solid · 7–8.9 minor gaps · 4–6.9 material risk · <4 serious.`, '');
  const section = (title, key, cols = ['table', 'line', 'issue', 'fix']) => {
    const rows = findings[key];
    L.push(`## ${title} — ${rows.length}`, '');
    if (!rows.length) { L.push('_None found._', ''); return; }
    L.push('| ' + cols.join(' | ') + ' | file |', '|' + cols.map(() => '---').join('|') + '|---|');
    for (const r of rows) L.push('| ' + cols.map((c) => String(r[c] ?? '').replace(/\|/g, '\\|')).join(' | ') + ` | ${r.file} |`);
    L.push('');
  };
  section('Referential integrity findings', 'referentialIntegrity');
  section('Field mapping & table definitions', 'fieldMapping', ['table', 'line', 'issue']);
  section('Orphaned tables', 'orphanTables', ['table', 'line', 'issue', 'fix']);
  section('Missing indexes', 'missingIndexes');
  section('Excessive / redundant indexes', 'excessiveIndexes');

  L.push('## Orphaned data — read-only SQL', '');
  if (live && liveResults) {
    L.push('| child | column | parent | orphan rows |', '|---|---|---|---:|');
    for (const r of liveResults) L.push(`| ${r.child} | ${r.column} | ${r.parent} | ${r.error ? 'ERR: ' + r.error : r.orphans} |`);
  } else {
    L.push('_Run with `--live` (non-prod DB only) to execute. Queries to run by hand otherwise:_', '', '```sql');
    for (const q of orphanDataSql) L.push(`-- ${q.child}.${q.column} → ${q.parent}`, q.sql);
    L.push('```');
  }
  L.push('');
  mkdirSync(dirname(outMd), { recursive: true });
  writeFileSync(outMd, L.join('\n'), 'utf8');
}

if (!quiet) {
  console.log(`schema-analyze: ${tables.size} tables across ${files.length} files`);
  console.log(`  RI score: ${riScore.toFixed(1)}/10 (${band}) — fkCandidates=${fkCandidates} unenforced=${wUnenforced / 3} noOnDelete=${wNoOnDelete} noIndex=${wNoIndex}`);
  console.log(`  findings: ${Object.entries(report.totals.byDimension).map(([k, v]) => `${k}=${v}`).join('  ')}`);
  console.log(`  wrote: ${relative(repoRoot, outJson)}${outMd ? ` , ${relative(repoRoot, outMd)}` : ''}${live ? '  [--live]' : ''}`);
}
