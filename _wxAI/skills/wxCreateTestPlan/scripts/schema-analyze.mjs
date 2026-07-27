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
    // Slice from the pgTable( to the matching close by walking parens — but count
    // ONLY parens that are actually code.
    //
    // A naive walk counts them inside comments and string literals too, so a
    // single unbalanced paren in prose ("...on its own line after references(.")
    // means depth never returns to zero, `end` stays at the opening paren, and the
    // body comes out as the one-character string "(". The table then parses as
    // having no columns at all — which the audit reports as "no primary key
    // declared", "missing createdat", and "island table", while the real table is
    // simply absent from every other check. It is the most dangerous failure shape
    // available: a table disappears from the audit and the report still looks
    // healthy. So skip comments and strings while counting.
    const openParen = text.indexOf('(', m.index);
    let depth = 0;
    let end = -1;
    for (let i = openParen; i < text.length; i++) {
      const ch = text[i];
      const next = text[i + 1];

      if (ch === '/' && next === '/') {
        const nl = text.indexOf('\n', i);
        i = nl === -1 ? text.length : nl;
        continue;
      }
      if (ch === '/' && next === '*') {
        const close = text.indexOf('*/', i + 2);
        i = close === -1 ? text.length : close + 1;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') {
        for (let j = i + 1; j < text.length; j++) {
          if (text[j] === '\\') { j++; continue; }
          if (text[j] === ch) { i = j; break; }
          if (j === text.length - 1) i = j;
        }
        continue;
      }

      if (ch === '(') depth++;
      else if (ch === ')') {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end === -1) {
      // Genuinely unbalanced source. Say so rather than emitting a table with no
      // columns, which reads as a schema defect instead of a parser failure.
      console.error(
        `schema-analyze: could not find the end of pgTable("${tableName}") in ${rel} — table SKIPPED, not analysed`,
      );
      continue;
    }
    const body = text.slice(openParen, end + 1);

    // Columns: `name: <builder>("dbname", ...)....` on the first object arg.
    const columns = new Map();
    const colRe = /(\w+)\s*:\s*(uuid|varchar|text|integer|bigint|boolean|timestamp|jsonb|json|numeric|real|serial|date|time|smallint|doublePrecision)\(\s*["'`]([^"'`]+)["'`]([^,\n]*)/g;
    // Two passes. The first only locates every column declaration; the second
    // reads each one within a window bounded by the NEXT declaration.
    //
    // This bound is load-bearing. The window used to be a flat 400 characters
    // from the column's own start, which spills freely into the columns that
    // follow — so a column absorbed a later column's .references() and was
    // reported as a foreign key to a table it has nothing to do with
    // ("FK 'commitsha' → userprofiles.id", "FK 'password' → companies.id").
    // Bounding each column to its own declaration is what makes col.ref mean
    // what it says.
    const colMatches = [];
    let c;
    while ((c = colRe.exec(body))) colMatches.push(c);

    for (let ci = 0; ci < colMatches.length; ci++) {
      const c = colMatches[ci];
      const [, prop, type, dbname, tail] = c;
      const chainStart = c.index;
      const chainEnd = ci + 1 < colMatches.length ? colMatches[ci + 1].index : body.length;
      const chain = body.slice(chainStart, chainEnd);
      // Matching .references() is fiddlier than it looks, and getting it wrong is
      // expensive in both directions — a missed match invents an "unenforced FK",
      // a missed onDelete invents a "no onDelete rule". Three forms all appear in
      // this codebase and all must match:
      //
      //   .references(() => t.id, { onDelete: "cascade" })            one line
      //   .references(\n  () => t.id,\n  { onDelete: "set null" },\n) argument on its own line
      //   .references((): AnyPgColumn => t.id, { onDelete: "cascade" }) self-reference
      //
      // Hence: allow whitespace after `references(`; allow a return-type
      // annotation between the empty parameter list and the arrow; and capture the
      // onDelete VALUE as [^"'`]+ rather than \w+ — "set null" contains a space,
      // so \w+ silently failed on every set-null FK in the repository while
      // "cascade" matched, which read as "only set-null FKs lack a rule".
      // onDelete is also matched anywhere inside the options object, since it may
      // follow onUpdate or sit on its own line.
      const refM =
        /references\(\s*\(\s*\)\s*(?::[^=]*)?=>\s*(\w+)\.(\w+)\s*(?:,\s*\{[^}]*onDelete:\s*["'`]([^"'`]+)["'`])?/.exec(
          chain,
        );
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

    // Composite foreign keys, declared in the table-extras callback rather than
    // on the column:
    //
    //   foreignKey({ columns: [table.itemid, table.itemexecutor],
    //                foreignColumns: [other.id, other.executor] }).onDelete("cascade")
    //
    // Every column named here IS enforced. Without this pass each one reads as an
    // "unenforced/implicit FK", which is the opposite of the truth — a composite FK
    // is a stronger guarantee than a single-column one, not a weaker one.
    const compositeFkCols = new Map();
    const cfkRe = /foreignKey\(\s*\{([\s\S]*?)\}\s*\)(?:\s*\.onDelete\(\s*["'`]([^"'`]+)["'`]\s*\))?/g;
    let cf;
    while ((cf = cfkRe.exec(body))) {
      const cfg = cf[1];
      const onDelete = cf[2] || null;
      const own = /columns:\s*\[([^\]]*)\]/.exec(cfg);
      const foreign = /foreignColumns:\s*\[([^\]]*)\]/.exec(cfg);
      if (!own) continue;
      const ownCols = [...own[1].matchAll(/table\.(\w+)/g)].map((x) => x[1]);
      const foreignRef = foreign ? /(\w+)\.(\w+)/.exec(foreign[1]) : null;
      for (const p of ownCols) {
        compositeFkCols.set(p, {
          table: foreignRef?.[1] ?? null,
          col: foreignRef?.[2] ?? null,
          onDelete,
          composite: true,
          members: ownCols,
        });
      }
    }
    for (const [prop, ref] of compositeFkCols) {
      const existing = columns.get(prop);
      if (existing && !existing.ref) existing.ref = ref;
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
// The name test alone is not enough. Every primary key in this schema is UUID v7,
// so a real foreign key is necessarily a `uuid` column — whereas a varchar column
// whose name happens to end in "id" is a text key and can never reference one.
// Two live examples: testplanitems.requirementid holds 'FR-005', and
// testitemsubjects.unitid holds 'express-route:POST /auth/signin'. Demanding the
// uuid type as well is what keeps those out of the referential-integrity score
// instead of permanently depressing it with findings that can never be actioned.
const isFkCandidate = (col) => isFkName(col.prop) && col.type === 'uuid';
const indexedCols = (t) => new Set(t.indexes.flatMap((i) => i.columns));
// An FK is only covered by an index that LEADS with its column. Postgres can use
// the leading column of a composite for a single-column lookup, but not a column
// buried in second position — so counting every member of every composite as
// "indexed" silently excuses genuinely uncovered foreign keys.
const leadingIndexCols = (t) => new Set(t.indexes.map((i) => i.columns[0]).filter(Boolean));

// snapshot of table names for onDelete/ref target validation
const tableConstNames = new Map([...tables.values()].map((t) => [t.constName, t]));

let fkCandidates = 0;
let wUnenforced = 0;
let wNoOnDelete = 0;
let wNoIndex = 0;

for (const [name, t] of tables) {
  const idx = indexedCols(t);
  const leadIdx = leadingIndexCols(t);
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

    // A varchar column named like a foreign key is a text key, not a broken FK.
    // Reported as advisory so it is still visible, but kept out of the RI score.
    if (isFkName(col.prop) && !col.isPk && col.type !== 'uuid' && !col.ref) {
      findings.fieldMapping.push({
        table: name, file: t.file, line: col.line,
        issue: `advisory: '${col.prop}' is named like a foreign key but is ${col.type}, not uuid — treated as a text key, not scored against referential integrity`,
      });
    }

    // ---- referential integrity
    //
    // Two independent questions, and they must NOT share a gate:
    //
    //   * "is this a DECLARED foreign key?" — answered by col.ref alone. Every
    //     declared FK is checked for an onDelete rule and a covering index no
    //     matter what the column is called.
    //   * "is this an UNDECLARED foreign key?" — answered by the name-plus-uuid
    //     heuristic, which is all we have to go on when there is no .references().
    //
    // Gating both behind the name heuristic (as this did originally) means a
    // declared FK on a column not ending in "id" is never checked at all.
    // complianceoverride.overriddenby is exactly that: a real FK to
    // userprofiles.id with no onDelete rule, invisible to the audit because of
    // its name.
    if ((isFkCandidate(col) || col.ref) && !col.isPk) {
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
        // A composite FK is covered as a TUPLE, not column by column. Checking its
        // members individually both misreports and misadvises: an index on
        // testsignoffs.itemexecutor alone would be useless (it holds two distinct
        // values), and the member that matters is already covered by an index
        // leading with itemid. So the tuple is checked once, against the first
        // member, and the remaining members are skipped.
        if (col.ref.composite) {
          const members = col.ref.members ?? [col.prop];
          if (col.prop === members[0]) {
            const covered = t.indexes.some((i) =>
              members.every((mc, mi) => i.columns[mi] === mc),
            );
            // Falls back to the leading-column test: a cascade driven by a highly
            // selective leading column does not need the full tuple indexed.
            if (!covered && !leadIdx.has(members[0])) {
              wNoIndex += 1;
              findings.missingIndexes.push({
                table: name, file: t.file, line: col.line, severity: 'medium',
                issue: `composite FK (${members.join(', ')}) has no covering index (Postgres does not auto-index FKs)`,
                fix: `CREATE INDEX idx_${name}_${members.join('_').toLowerCase()} ON ${name}(${members.join(', ')});`,
              });
            }
          }
        } else if (!leadIdx.has(col.prop)) {
          wNoIndex += 1;
          findings.missingIndexes.push({
            table: name, file: t.file, line: col.line, severity: 'medium',
            issue: `FK '${col.prop}' has no covering index (Postgres does not auto-index FKs)`,
            fix: `CREATE INDEX idx_${name}_${col.prop.toLowerCase()} ON ${name}(${col.prop});`,
          });
        }
        // orphan-data SQL (only for real FKs with a resolvable parent table)
        //
        // Skipped for composite FKs: the correct check is a multi-column join, and
        // pairing one member against the parent's first column would emit valid
        // SQL that answers the wrong question (comparing itemexecutor to id). A
        // missing check is recoverable; a confidently wrong one is not.
        const parent = col.ref.composite ? null : tableConstNames.get(col.ref.table);
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
