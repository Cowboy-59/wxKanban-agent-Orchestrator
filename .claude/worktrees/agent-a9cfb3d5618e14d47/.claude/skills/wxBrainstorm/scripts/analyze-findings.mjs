#!/usr/bin/env node
// analyze-findings.mjs: the findings helper for /wxBrainstorm --analyze (SPEC-156).
//
//   node analyze-findings.mjs merge --out <data.json> --label <label> --date <YYYY-MM-DD>
//        --groups "<Group A>,<Group B>" [--db-checked] <findings.json> [<findings.json> ...]
//   node analyze-findings.mjs compare --previous <old.json> --current <new.json> [--out <file>]
//   node analyze-findings.mjs decide --file <data.json> --fingerprint <fp>
//        --decision keep|not-needed|parked --by <who> [--reason "<why>"] [--scope SCOPE-NNN]
//   node analyze-findings.mjs check <data.json>
//   node analyze-findings.mjs close <data.json>
//   node analyze-findings.mjs cross-app --app <label>=<data.json> --app <label>=<data.json> ...
//   node analyze-findings.mjs guard <file>
//
// Contract: specs/156-brainstorm-analyze-mode/contracts/analyze-findings.md. Plain Node with no
// dependencies, so it runs in any kit consumer repo. Every subcommand prints JSON. Exit codes:
// 0 ok, 1 bad input, 2 refused by a guard or blocked by check.
// The helper writes only the file named by --out / --file. It never writes into an app folder
// it was only asked to read (cross-app, check, guard).

// [SCOPE 156 / T008] BEGIN — Findings helper: record, merge, fingerprint, evidence hash, guards (FR-006, FR-008, FR-009, FR-011, FR-012)
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const LISTS = ['must-fix', 'gap', 'optional'];
export const CONFIDENCE = ['Confirmed', 'Likely', 'Assumed', 'Unknown', 'Conflicting'];
export const DECISIONS = ['keep', 'not-needed', 'parked'];
export const UNPLACED = 'Unplaced';
const DB_ANALYZER = 'wxdbanalyze';
const ROW_VALUE_KEYS = new Set(['sample', 'samples', 'values', 'rows', 'row', 'example', 'examples']);
const GUARD_SKIP_KEYS = new Set(['fingerprint', 'evidenceHash', 'keys']);

export const collapse = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
export const normPath = (p) => String(p ?? '').replace(/\\/g, '/').replace(/^\.\//, '');
export const sha256 = (s) => createHash('sha256').update(String(s), 'utf8').digest('hex');

export function anchorOf(raw) {
  const a = collapse(raw.anchor);
  if (a) return a;
  return collapse(raw.snippet).slice(0, 120);
}

export function fingerprintOf(analyzer, rule, path, anchor) {
  return sha256(`${analyzer}|${rule}|${normPath(path)}|${anchor}`);
}

export function evidenceHashOf(message, snippet) {
  return sha256(collapse(`${collapse(message)} | ${collapse(snippet)}`));
}

// One analyzer finding -> the FR-006 record. wxDBAnalyze keeps names and counts only (FR-011);
// every finding loses any row-value key an analyzer returned.
export function normalizeFinding(analyzer, raw, groups = []) {
  if (!raw || typeof raw !== 'object') throw new Error(`${analyzer}: a finding is not an object`);
  const rule = collapse(raw.rule);
  if (!rule) throw new Error(`${analyzer}: a finding has no rule`);
  const isDb = analyzer.toLowerCase() === DB_ANALYZER;
  let path;
  let anchor;
  let snippet;
  let message;
  let location;
  if (isDb) {
    const table = collapse(raw.table);
    const column = collapse(raw.column);
    const count = Number.isFinite(Number(raw.count)) ? Number(raw.count) : null;
    path = `db:${table}`;
    anchor = column ? `${table}.${column}` : table;
    snippet = '';
    message = `${collapse(raw.message) || rule}${count === null ? '' : ` (count: ${count})`}`;
    location = anchor;
  } else {
    path = normPath(raw.path);
    anchor = anchorOf(raw);
    snippet = collapse(raw.snippet);
    message = collapse(raw.message);
    location = path ? (Number.isInteger(raw.line) ? `${path}:${raw.line}` : path) : '';
  }
  const list = LISTS.includes(raw.list) ? raw.list : 'gap';
  const confidence = CONFIDENCE.includes(raw.confidence) ? raw.confidence : 'Assumed';
  const feature = groups.includes(raw.feature) ? raw.feature : UNPLACED;
  return {
    key: `${rule}|${path}|${anchor}`,
    keyFp: fingerprintOf(analyzer, rule, path, anchor),
    rule,
    path,
    anchor,
    feature,
    list,
    analyzer,
    location,
    evidence: snippet ? `${message} | ${snippet}` : message,
    evidenceHash: evidenceHashOf(message, snippet),
    confidence,
  };
}

const LIST_RANK = { 'must-fix': 0, gap: 1, optional: 2 };

// Same rule|path|anchor from several analyzers -> one record crediting all of them (FR-006).
export function mergeFindings(files, groups = []) {
  const byKey = new Map();
  for (const f of files) {
    const analyzer = collapse(f.analyzer);
    if (!analyzer) throw new Error('a findings file has no analyzer');
    for (const raw of Array.isArray(f.findings) ? f.findings : []) {
      const n = normalizeFinding(analyzer, raw, groups);
      const cur = byKey.get(n.key);
      if (!cur) {
        byKey.set(n.key, { ...n, analyzers: [analyzer], keys: [n.keyFp] });
        continue;
      }
      if (!cur.analyzers.includes(analyzer)) cur.analyzers.push(analyzer);
      if (!cur.keys.includes(n.keyFp)) cur.keys.push(n.keyFp);
      if (LIST_RANK[n.list] < LIST_RANK[cur.list]) cur.list = n.list;
      if (cur.feature === UNPLACED && n.feature !== UNPLACED) cur.feature = n.feature;
      if (cur.confidence !== n.confidence) cur.confidence = cur.confidence === 'Confirmed' || n.confidence === 'Confirmed' ? 'Confirmed' : 'Conflicting';
    }
  }
  return [...byKey.values()].map((m) => {
    const analyzers = [...m.analyzers].sort();
    return {
      fingerprint: fingerprintOf(analyzers[0], m.rule, m.path, m.anchor),
      evidenceHash: m.evidenceHash,
      keys: [...m.keys].sort(),
      feature: m.feature,
      list: m.list,
      analyzers,
      rule: m.rule,
      location: m.location,
      evidence: m.evidence,
      confidence: m.confidence,
      status: 'new',
      decision: null,
      reason: null,
      decidedAt: null,
      decidedBy: null,
      scope: null,
    };
  });
}

export function buildSitting({ label, date, groups = [], databaseChecked = false, files }) {
  if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(String(label ?? ''))) {
    throw new Error('label must be a short lowercase slug the owner set (a-z, 0-9, -), never a customer name');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date ?? ''))) throw new Error('date must be YYYY-MM-DD');
  const analyzers = files.map((f) => ({
    id: collapse(f.analyzer),
    class: f.class ?? null,
    model: f.model ?? null,
    checked: f.checked !== false,
    notCheckedReason: f.checked === false ? collapse(f.notCheckedReason) || 'no reason given' : null,
  }));
  return {
    label,
    sittingDate: date,
    analyzers,
    databaseChecked: databaseChecked === true,
    featureGroups: [...groups],
    findings: mergeFindings(files.filter((f) => f.checked !== false), groups),
    sittingClosed: false,
  };
}

// --- write guards (FR-008, FR-011) -----------------------------------------------------------
const REDACTION = /\[REDACTED[^\]]*\]|\$\{[^}]*\}/g;
const CREDENTIAL_PATTERNS = [
  ['credential', /\b(?:password|passwd|pwd|secret|token|api[_-]?key)\s*[:=]\s*(?:["'][^"'\s]{4,}["']|[^\s"'&;,()]*\d[^\s"'&;,()]*)/i],
  ['credential', /\bbearer\s+[A-Za-z0-9._~+/-]{16,}/i],
  ['credential', /\bAKIA[0-9A-Z]{16}\b/],
  ['credential', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['credential', /\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:[^\s@/]+@/i],
  ['credential', /\b(?:sk-|ghp_|gho_|xox[abpr]-)[A-Za-z0-9_-]{20,}/],
];
const PERSONAL_PATTERNS = [
  ['personal-data', /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b/],
  ['personal-data', /(?:\+\d{1,3}[\s.-]?)?\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/],
  ['personal-data', /\b\d{3}-\d{2}-\d{4}\b/],
];

export function scanText(text) {
  const t = String(text).replace(REDACTION, ' ');
  for (const [kind, re] of [...CREDENTIAL_PATTERNS, ...PERSONAL_PATTERNS]) if (re.test(t)) return kind;
  return null;
}

export function guard(value) {
  const problems = [];
  const walk = (v, path) => {
    if (typeof v === 'string') {
      const kind = scanText(v);
      if (kind) problems.push({ path: path || '(root)', kind });
      return;
    }
    if (Array.isArray(v)) {
      v.forEach((x, i) => walk(x, `${path}[${i}]`));
      return;
    }
    if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) {
        const p = path ? `${path}.${k}` : k;
        if (ROW_VALUE_KEYS.has(k.toLowerCase())) {
          problems.push({ path: p, kind: 'row-value' });
          continue;
        }
        if (GUARD_SKIP_KEYS.has(k)) continue;
        walk(x, p);
      }
    }
  };
  walk(value, '');
  return { ok: problems.length === 0, problems };
}

// --- re-run comparison (FR-009) ---------------------------------------------------------------
export function compare(previous, current) {
  const prevByKey = new Map();
  for (const p of previous.findings ?? []) for (const k of p.keys ?? [p.fingerprint]) prevByKey.set(k, p);
  const matched = new Set();
  const counts = { new: 0, stillOpen: 0, fixed: 0, previouslyDeclined: 0, resurfaced: 0 };
  const findings = (current.findings ?? []).map((c) => {
    const p = (c.keys ?? [c.fingerprint]).map((k) => prevByKey.get(k)).find(Boolean);
    if (!p) {
      counts.new += 1;
      return { ...c, status: 'new' };
    }
    matched.add(p);
    if (p.decision === 'not-needed') {
      const resurface = p.evidenceHash !== c.evidenceHash;
      counts.previouslyDeclined += 1;
      if (resurface) {
        counts.resurfaced += 1;
        return { ...c, status: 'previously-declined', resurface: true, decision: null, reason: null, decidedAt: null, decidedBy: null, previous: pick(p) };
      }
      return { ...c, status: 'previously-declined', resurface: false, decision: p.decision, reason: p.reason, decidedAt: p.decidedAt, decidedBy: p.decidedBy, scope: p.scope ?? null };
    }
    counts.stillOpen += 1;
    return { ...c, status: 'still-open', scope: p.scope ?? null, previous: pick(p) };
  });
  for (const p of previous.findings ?? []) {
    if (matched.has(p) || p.status === 'fixed') continue;
    counts.fixed += 1;
    findings.push({ ...p, status: 'fixed' });
  }
  return { data: { ...current, previousSitting: previous.sittingDate ?? null, findings }, counts };
}

function pick(p) {
  return { decision: p.decision ?? null, reason: p.reason ?? null, decidedAt: p.decidedAt ?? null, decidedBy: p.decidedBy ?? null };
}

// --- decisions, check and close (FR-007, FR-008, SOC 2 CC7.1 / CC7.2) -------------------------
export function decide(data, { fingerprint, decision, by, reason = null, scope = null, now = new Date() }) {
  if (!DECISIONS.includes(decision)) throw new Error(`decision must be one of ${DECISIONS.join(', ')}`);
  if (!collapse(by)) throw new Error('--by (who decided) is required');
  if (decision === 'not-needed' && !collapse(reason)) throw new Error('a not-needed decision needs a reason');
  const f = (data.findings ?? []).find((x) => x.fingerprint === fingerprint);
  if (!f) throw new Error(`no finding with fingerprint ${fingerprint}`);
  f.decision = decision;
  f.reason = collapse(reason) || null;
  f.decidedAt = now.toISOString();
  f.decidedBy = collapse(by);
  if (scope) f.scope = collapse(scope);
  return f;
}

export function check(data) {
  const undecided = [];
  const invalid = [];
  for (const f of data.findings ?? []) {
    if (f.status === 'fixed') continue;
    if (f.decision === null || f.decision === undefined) {
      undecided.push(f.fingerprint);
      continue;
    }
    if (!DECISIONS.includes(f.decision)) invalid.push({ fingerprint: f.fingerprint, problem: 'unknown decision' });
    else if (!f.decidedAt || !f.decidedBy) invalid.push({ fingerprint: f.fingerprint, problem: 'decision has no date or no decider' });
    else if (f.decision === 'not-needed' && !f.reason) invalid.push({ fingerprint: f.fingerprint, problem: 'declined without a reason' });
  }
  for (const a of data.analyzers ?? []) {
    if (a.checked === false && !a.notCheckedReason) invalid.push({ analyzer: a.id, problem: 'not checked without a reason' });
  }
  return { closable: undecided.length === 0 && invalid.length === 0, undecided, invalid };
}

// --- cross-app pass (FR-012) ------------------------------------------------------------------
export function crossApp(apps) {
  const groups = new Map();
  for (const { label, data } of apps) {
    for (const f of data.findings ?? []) {
      if (f.status === 'fixed') continue;
      for (const analyzer of f.analyzers ?? []) {
        const k = `${analyzer}|${f.rule}`;
        if (!groups.has(k)) groups.set(k, { analyzer, rule: f.rule, apps: new Set(), findings: [] });
        const g = groups.get(k);
        g.apps.add(label);
        g.findings.push({ app: label, fingerprint: f.fingerprint, location: f.location, list: f.list });
      }
    }
  }
  const proposals = [...groups.values()]
    .filter((g) => g.apps.size >= 2)
    .map((g) => ({ analyzer: g.analyzer, rule: g.rule, apps: [...g.apps].sort(), findings: g.findings }))
    .sort((a, b) => b.apps.length - a.apps.length || a.rule.localeCompare(b.rule));
  return { proposals };
}

// --- CLI --------------------------------------------------------------------------------------
function parseArgs(argv) {
  const opts = { _: [], app: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) {
      opts._.push(a);
      continue;
    }
    const name = a.slice(2);
    if (name === 'db-checked') {
      opts.dbChecked = true;
      continue;
    }
    const v = argv[i + 1];
    if (v === undefined || v.startsWith('--')) throw new Error(`--${name} needs a value`);
    i += 1;
    if (name === 'app') opts.app.push(v);
    else opts[name] = v;
  }
  return opts;
}

const readJson = (p) => JSON.parse(readFileSync(resolve(p), 'utf8'));

function writeGuarded(path, data) {
  const g = guard(data);
  if (!g.ok) return { refused: g.problems };
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(resolve(path), `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  return { written: path };
}

export function run(argv) {
  const [cmd, ...rest] = argv;
  const o = parseArgs(rest);
  switch (cmd) {
    case 'merge': {
      if (!o.out) throw new Error('merge needs --out');
      if (!o._.length) throw new Error('merge needs at least one findings file');
      const groups = (o.groups ?? '').split(',').map(collapse).filter(Boolean);
      const data = buildSitting({ label: o.label, date: o.date, groups, databaseChecked: o.dbChecked === true, files: o._.map(readJson) });
      const w = writeGuarded(o.out, data);
      if (w.refused) return { code: 2, out: { refused: w.refused } };
      return { code: 0, out: { written: o.out, findings: data.findings.length, analyzers: data.analyzers.length } };
    }
    case 'compare': {
      if (!o.previous || !o.current) throw new Error('compare needs --previous and --current');
      const { data, counts } = compare(readJson(o.previous), readJson(o.current));
      if (o.out) {
        const w = writeGuarded(o.out, data);
        if (w.refused) return { code: 2, out: { refused: w.refused } };
      }
      return { code: 0, out: { ...counts, written: o.out ?? null } };
    }
    case 'decide': {
      if (!o.file) throw new Error('decide needs --file');
      const data = readJson(o.file);
      if (data.sittingClosed === true) throw new Error('the sitting is closed');
      const f = decide(data, { fingerprint: o.fingerprint, decision: o.decision, by: o.by, reason: o.reason, scope: o.scope });
      const w = writeGuarded(o.file, data);
      if (w.refused) return { code: 2, out: { refused: w.refused } };
      return { code: 0, out: { fingerprint: f.fingerprint, decision: f.decision, decidedAt: f.decidedAt, decidedBy: f.decidedBy } };
    }
    case 'check': {
      if (!o._[0]) throw new Error('check needs a data file');
      const r = check(readJson(o._[0]));
      return { code: r.closable ? 0 : 2, out: r };
    }
    case 'close': {
      if (!o._[0]) throw new Error('close needs a data file');
      const data = readJson(o._[0]);
      const r = check(data);
      if (!r.closable) return { code: 2, out: { closed: false, ...r } };
      data.sittingClosed = true;
      const w = writeGuarded(o._[0], data);
      if (w.refused) return { code: 2, out: { refused: w.refused } };
      return { code: 0, out: { closed: true } };
    }
    case 'cross-app': {
      if (o.app.length < 2) throw new Error('cross-app needs two or more --app <label>=<data.json>');
      const apps = o.app.map((s) => {
        const eq = s.indexOf('=');
        if (eq < 1) throw new Error(`--app must be <label>=<data.json> (got ${s})`);
        return { label: s.slice(0, eq), data: readJson(s.slice(eq + 1)) };
      });
      return { code: 0, out: crossApp(apps) };
    }
    case 'guard': {
      if (!o._[0]) throw new Error('guard needs a file');
      const text = readFileSync(resolve(o._[0]), 'utf8');
      let value;
      try {
        value = JSON.parse(text);
      } catch {
        value = text;
      }
      const r = guard(value);
      return { code: r.ok ? 0 : 2, out: r };
    }
    default:
      throw new Error('usage: analyze-findings.mjs merge|compare|decide|check|close|cross-app|guard ...');
  }
}

const isMain = process.argv[1] && existsSync(process.argv[1]) && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  try {
    const { code, out } = run(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
    process.exit(code);
  } catch (err) {
    process.stdout.write(`${JSON.stringify({ error: err instanceof Error ? err.message : String(err) })}\n`);
    process.exit(1);
  }
}
// [SCOPE 156 / T008] END
