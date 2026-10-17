// Impact Boundary, possible data loss, and the impactMode decision (SCOPE-137 FR-006, FR-007).
//
// The engine finds what a change reaches; this decides what that means. One
// rule for every entry point (the AI-edit hook, the Cockpit, unattended runs,
// /buildscope), so they can never disagree about whether to ask:
//
//   | Situation            | notify | boundaries (default) | always |
//   | No impact            |   —    |          —           |   —    |
//   | Impact, no boundary  | notify |        notify        |  ask   |
//   | Impact Boundary      | notify |         ask          |  ask   |
//   | Possible data loss   |  stop  |         stop         |  stop  |
//
// Pure apart from readImpactMode; callers supply file contents.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractSchemaDecls } from './data.mjs';
import { FENCE_END_RE, FENCE_RE } from './scopes.mjs';

// [SCOPE 137 / T008] BEGIN — impactMode setting and the decision rule (FR-007)
export const IMPACT_MODES = ['notify', 'boundaries', 'always'];
export const DEFAULT_IMPACT_MODE = 'boundaries';

/**
 * The project's impactMode from .wxai/project.json. Missing → boundaries. An
 * unknown value also falls back to boundaries, with a warning — never to notify,
 * which would silently stop asking.
 */
export function readImpactMode(root) {
  let raw;
  try {
    raw = JSON.parse(readFileSync(join(root, '.wxai', 'project.json'), 'utf8'))?.impactMode;
  } catch {
    return { mode: DEFAULT_IMPACT_MODE, source: 'default' };
  }
  if (raw === undefined || raw === null) return { mode: DEFAULT_IMPACT_MODE, source: 'default' };
  if (IMPACT_MODES.includes(raw)) return { mode: raw, source: 'project.json' };
  return {
    mode: DEFAULT_IMPACT_MODE,
    source: 'default',
    warning: `impactMode "${raw}" is not one of ${IMPACT_MODES.join(', ')}; using ${DEFAULT_IMPACT_MODE}`,
  };
}

/** 'stop' | 'ask' | 'notify' | 'none' — the same answer for every entry point. */
export function decide(mode, { hasImpact, boundary, dataLoss }) {
  if (dataLoss) return 'stop';
  if (!hasImpact && !boundary) return 'none';
  if (mode === 'notify') return 'notify';
  if (mode === 'always') return 'ask';
  return boundary ? 'ask' : 'notify';
}
// [SCOPE 137 / T008] END

// [SCOPE 137 / T008] BEGIN — Possible data loss in changed content (FR-006, SC-5)
// \x60 is a backtick, written escaped so fence and template parsers do not trip on it.
const IDENT = '["\\x60\\[]?([\\w.]+)["\\x60\\]]?';
const NOT_A_COLUMN = /^(CONSTRAINT|DEFAULT|NOT|INDEX|IDENTITY|EXPRESSION|PRIMARY|FOREIGN|CHECK|UNIQUE|KEY)$/i;

/** Remove comments so a commented-out DROP is not a finding. Line comments only at line start (URLs keep their //). */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/^\s*(--|\/\/|#).*$/gm, '');
}

const lineAt = (src, index) => src.slice(0, index).split('\n').length;

/**
 * Statements that can lose data, found in one text: SQL (migrations, or SQL in
 * code strings) and the usual ORM mass operations. Each finding:
 * { kind, table, column?, line, text }.
 */
export function dataLossIn(src) {
  const text = stripComments(src);
  const out = [];
  const add = (kind, index, detail) => {
    const snippet = text.slice(index, index + 160).split(/;|\n\s*\n/)[0].replace(/\s+/g, ' ').trim().slice(0, 120);
    out.push({ kind, ...detail, line: lineAt(text, index), text: snippet });
  };
  // Statement by statement, so "no WHERE" means none in the same statement.
  let start = 0;
  for (const stmt of text.split(';')) {
    const at = (re) => {
      re.lastIndex = 0;
      return re.exec(stmt);
    };
    let m;
    if ((m = at(new RegExp(`\\bDROP\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?${IDENT}`, 'i')))) {
      add('drop-table', start + m.index, { table: m[1] });
    }
    if ((m = at(/\b(?:DROP\s+(?:SCHEMA|DATABASE)|dropDatabase\s*\()\s*(?:IF\s+EXISTS\s+)?["'\x60[]?([\w.]*)/i))) {
      add('drop-schema', start + m.index, { table: m[1] || null });
    }
    if ((m = at(new RegExp(`\\bTRUNCATE\\s+(?:TABLE\\s+)?${IDENT}`, 'i')))) {
      add('truncate', start + m.index, { table: m[1] });
    }
    const alter = at(new RegExp(`\\bALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(?:ONLY\\s+)?${IDENT}`, 'i'));
    if (alter) {
      const table = alter[1];
      const body = stmt.slice(alter.index + alter[0].length);
      const dropRe = /\bDROP\s+(?:COLUMN\s+)?(?:IF\s+EXISTS\s+)?["\x60[]?(\w+)/gi;
      let d;
      while ((d = dropRe.exec(body)) !== null) {
        if (NOT_A_COLUMN.test(d[1])) continue;
        add('drop-column', start + alter.index + alter[0].length + d.index, { table, column: d[1] });
      }
      const typeRe = /\bALTER\s+(?:COLUMN\s+)?["\x60[]?(\w+)["\x60\]]?\s+(?:SET\s+DATA\s+)?TYPE\b/gi;
      while ((d = typeRe.exec(body)) !== null) {
        add('column-type', start + alter.index + alter[0].length + d.index, { table, column: d[1] });
      }
    }
    if ((m = at(new RegExp(`\\bDELETE\\s+FROM\\s+${IDENT}`, 'i'))) && !/\bWHERE\b/i.test(stmt.slice(m.index))) {
      add('mass-delete', start + m.index, { table: m[1] });
    }
    if ((m = at(new RegExp(`\\bUPDATE\\s+${IDENT}\\s+SET\\b`, 'i'))) && !/\bWHERE\b/i.test(stmt.slice(m.index))) {
      add('mass-update', start + m.index, { table: m[1] });
    }
    // Drizzle: db.delete(table) / db.update(table).set(...) with no .where( in the statement.
    // The receiver must look like a database handle, or Map.delete(key) would be a finding.
    const DB = String.raw`\b(?:db|tx|trx|database|\w+Db|\w+DB)\s*\.`;
    if ((m = at(new RegExp(`${DB}delete\\(\\s*(\\w+)\\s*\\)`))) && !/\.where\(/.test(stmt.slice(m.index))) {
      add('mass-delete', start + m.index, { table: m[1] });
    }
    if ((m = at(new RegExp(`${DB}update\\(\\s*(\\w+)\\s*\\)\\s*\\.set\\(`))) && !/\.where\(/.test(stmt.slice(m.index))) {
      add('mass-update', start + m.index, { table: m[1] });
    }
    // MongoDB and Prisma: deleteMany with no filter or an empty one; dropping a collection.
    if ((m = at(/(?:\.(\w+))?\.deleteMany\(\s*(?:\{\s*\})?\s*\)/))) add('mass-delete', start + m.index, { table: m[1] ?? null });
    if ((m = at(/\bdropCollection\(\s*['"]?(\w*)/))) add('drop-table', start + m.index, { table: m[1] || null });
    if ((m = at(/(?:\bdb\.(\w+)|\.collection\(\s*['"](\w+)['"]\s*\))\.drop\(\s*\)/))) add('drop-table', start + m.index, { table: m[1] ?? m[2] });
    // Rails and Django: whole-model deletes.
    if ((m = at(/\b([A-Z]\w+)\.(?:delete_all|destroy_all)\b/))) add('mass-delete', start + m.index, { table: m[1] });
    if ((m = at(/\b(\w+)\.objects\.all\(\)\.delete\(\)/))) add('mass-delete', start + m.index, { table: m[1] });
    start += stmt.length + 1;
  }
  return out;
}

/** Drizzle columns per table: Map(sqlTable -> Set(sqlColumn)). */
function schemaColumns(src) {
  const tables = new Map();
  // \x7b is an opening brace, escaped so brace-counting tools (auditfences) stay balanced.
  const declRe = /export\s+const\s+\w+\s*=\s*(?:pg|mysql|sqlite)Table\(\s*['"]([A-Za-z0-9_]+)['"]\s*,\s*\x7b/g;
  let m;
  while ((m = declRe.exec(src)) !== null) {
    // The column object: from its brace to the matching close.
    let depth = 1;
    let i = m.index + m[0].length;
    for (; i < src.length && depth > 0; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') depth--;
    }
    const body = src.slice(m.index + m[0].length, i - 1);
    const cols = new Set();
    // Only the object's own keys: lines at the top nesting level of the column object.
    let level = 0;
    for (const line of body.split('\n')) {
      if (level === 0) {
        const c = /^\s*["']?(\w+)["']?\s*:\s*\w+\(\s*(?:["'\x60](\w+)["'\x60])?/.exec(line);
        if (c) cols.add(c[2] ?? c[1]);
      }
      for (const ch of line) {
        if (ch === '{' || ch === '(' || ch === '[') level++;
        else if (ch === '}' || ch === ')' || ch === ']') level--;
      }
    }
    tables.set(m[1], cols);
  }
  return tables;
}

/** Tables and columns declared before the change and gone after it (a Drizzle schema edit). */
export function schemaRemovals(oldSrc, newSrc) {
  if (!oldSrc || !/Table\(/.test(oldSrc)) return [];
  const out = [];
  const before = new Set(extractSchemaDecls(oldSrc).map((d) => d.sql));
  const after = new Set(extractSchemaDecls(newSrc ?? '').map((d) => d.sql));
  for (const t of before) if (!after.has(t)) out.push({ kind: 'drop-table', table: t, line: null, text: `table ${t} removed from the schema` });
  const oldCols = schemaColumns(oldSrc);
  const newCols = schemaColumns(newSrc ?? '');
  for (const [t, cols] of oldCols) {
    if (!newCols.has(t)) continue; // the whole table is already reported
    for (const c of cols) if (!newCols.get(t).has(c)) out.push({ kind: 'drop-column', table: t, column: c, line: null, text: `column ${t}.${c} removed from the schema` });
  }
  return out;
}

/**
 * Possible data loss a change introduces: findings in the new content that were
 * not already in the old (an untouched cleanup script is not news on every
 * edit), plus tables and columns removed from a schema.
 */
export function dataLossChanges({ file, oldSrc = '', newSrc = '' }) {
  const key = (f) => `${f.kind}|${f.table}|${f.column ?? ''}|${f.text}`;
  const existing = new Set(dataLossIn(oldSrc).map(key));
  return [
    ...dataLossIn(newSrc).filter((f) => !existing.has(key(f))),
    ...schemaRemovals(oldSrc, newSrc),
  ].map((f) => ({ file, ...f }));
}
// [SCOPE 137 / T008] END

// [SCOPE 137 / T008] BEGIN — Impact Boundary classification (FR-006)
/** Scopes whose fences enclose any of the given 1-based line ranges. */
export function scopesAtLines(src, ranges) {
  const lines = src.split('\n');
  const open = [];
  const hits = new Set();
  const inRange = (n) => ranges.some(([a, b]) => n >= a && n <= b);
  for (let i = 0; i < lines.length; i++) {
    FENCE_RE.lastIndex = 0;
    const begin = FENCE_RE.exec(lines[i]);
    if (begin) open.push(begin[1]);
    if (inRange(i + 1)) for (const s of open) hits.add(s);
    if (FENCE_END_RE.test(lines[i])) open.pop();
  }
  return [...hits];
}

const pad = (s) => String(s).replace(/^SCOPE-/i, '').padStart(3, '0');

/**
 * Is this change an Impact Boundary?
 *  - it reaches another scope's code (fences);
 *  - it touches a shared table: a table the changed code uses that another scope's code also uses;
 *  - it would undo a human test sign-off — supplied by the caller (`signoffs`), because the only
 *    tool that knows, report_change_impact, also withdraws them; without it the check is reported
 *    as not done, never as passed.
 * `ownScopes` are the scopes the change belongs to: the fences around the changed lines when known,
 * else every fence in the changed files, else the project's active scope.
 */
export function classifyImpact({ links, ownScopes, scopesByFile, dataLoss = [], signoffs = null, mode = DEFAULT_IMPACT_MODE, affected = 0 }) {
  const own = new Set(ownScopes.map(pad));
  const reasons = [];

  const reached = new Map();
  for (const l of links) {
    if (l.type !== 'scope' || l.direction !== 'dependent') continue;
    const s = pad(String(l.to).replace(/^scope:/, ''));
    if (!own.has(s)) reached.set(s, l.files ?? []);
  }
  for (const [scope, files] of reached) {
    reasons.push({ kind: 'other-scope', scope, files, detail: `reaches SCOPE-${scope} code (${files.length} file${files.length === 1 ? '' : 's'})` });
  }

  const shared = new Map(); // table -> Set(scope)
  for (const l of links) {
    if (l.type !== 'table' || l.direction !== 'dependent') continue;
    const table = String(l.via ?? '').replace(/^table:/, '');
    for (const s of scopesByFile.get(l.to) ?? []) {
      if (own.has(pad(s))) continue;
      if (!shared.has(table)) shared.set(table, new Set());
      shared.get(table).add(pad(s));
    }
  }
  for (const [table, scopes] of shared) {
    reasons.push({ kind: 'shared-table', table, scopes: [...scopes], detail: `table ${table} is also used by SCOPE-${[...scopes].join(', SCOPE-')}` });
  }

  let signoff = { checked: false, reason: 'needs a read-only sign-off check; report_change_impact withdraws sign-offs, so it is not called here' };
  if (Array.isArray(signoffs)) {
    signoff = { checked: true, count: signoffs.length };
    for (const s of signoffs) reasons.push({ kind: 'signoff', item: s, detail: `would undo the human sign-off on ${s.title ?? s.id ?? s}` });
  }

  const boundary = reasons.length > 0;
  const hasImpact = affected > 0 || boundary;
  return {
    mode,
    decision: decide(mode, { hasImpact, boundary, dataLoss: dataLoss.length > 0 }),
    boundary,
    reasons,
    dataLoss,
    ownScopes: [...own],
    signoff,
  };
}
// [SCOPE 137 / T008] END
