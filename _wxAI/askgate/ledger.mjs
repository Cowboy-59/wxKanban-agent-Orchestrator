#!/usr/bin/env node
// Decision Ledger (SPEC-142, contract C1): decisions/ledger.yaml, append-only.
//
//   node _wxAI/askgate/ledger.mjs append --file <entry.json> --approved-by <who> [--root <dir>]
//   node _wxAI/askgate/ledger.mjs check [--root <dir>]
//   node _wxAI/askgate/ledger.mjs check --global [--global-file <path>]
//
// This script is the ONLY writer of the ledger. It appends; it never edits or removes. A change
// is a new entry whose `supersedes` names the old id. Plain Node, no dependencies.
//
// YAML: a small restricted subset for this one list shape. Entries are written with the
// free-text fields as double-quoted JSON strings (always one line), so a round trip is exact.

import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, statSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

export const KINDS = ['Agreed', 'Added', 'Changed', 'Declined', 'Parked'];
export const EVIDENCE = ['confirmed', 'likely', 'assumed', 'unknown', 'conflicting'];
export const FIELDS = ['id', 'scope', 'question', 'decision', 'rationale', 'kind', 'evidence', 'source', 'approved_by', 'date', 'supersedes'];
const REQUIRED_TEXT = ['scope', 'question', 'decision'];
const ID_RE = /^D-\d{4,}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HEADER = '# Decision ledger (SPEC-142). Append-only: written only by `node _wxAI/askgate/ledger.mjs append`. Never edit by hand.\n';

// [SCOPE 142 / T002] BEGIN — Ledger format and the owner-path ledger script (FR-001, FR-…
export function ledgerPath(root) {
  return join(resolve(root ?? process.cwd()), 'decisions', 'ledger.yaml');
}
// [SCOPE 142 / T002] END

// ---- reading -------------------------------------------------------------------------------

// [SCOPE 142 / T002] BEGIN — Ledger format and the owner-path ledger script (FR-001, FR-…
function parseValue(raw, lineNo) {
  const v = raw.trim();
  if (v === '' || v === 'null' || v === '~') return null;
  if (v[0] === '"') {
    // find the closing quote, honoring backslash escapes
    let i = 1;
    while (i < v.length && v[i] !== '"') i += v[i] === '\\' ? 2 : 1;
    if (i >= v.length) throw new Error(`line ${lineNo}: unterminated double-quoted string (multi-line values are not supported)`);
    const rest = v.slice(i + 1).trim();
    if (rest && !rest.startsWith('#')) throw new Error(`line ${lineNo}: unexpected text after the quoted string`);
    try {
      return JSON.parse(v.slice(0, i + 1));
    } catch {
      throw new Error(`line ${lineNo}: invalid escape in the quoted string`);
    }
  }
  if (v[0] === "'") {
    const m = /^'((?:[^']|'')*)'\s*(#.*)?$/.exec(v);
    if (!m) throw new Error(`line ${lineNo}: invalid single-quoted string`);
    return m[1].replace(/''/g, "'");
  }
  if (v[0] === '|' || v[0] === '>') throw new Error(`line ${lineNo}: block scalars are not supported`);
  return v.replace(/\s+#.*$/, '').trim();
}
// [SCOPE 142 / T002] END

/** Parse ledger text. Throws on anything outside the restricted subset. */
// [SCOPE 142 / T002] BEGIN — Ledger format and the owner-path ledger script (FR-001, FR-…
export function parseLedgerText(text) {
  const entries = [];
  let current = null;
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  for (let n = 0; n < lines.length; n++) {
    const line = lines[n];
    const lineNo = n + 1;
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (line.trim() === '[]') continue;
    const start = /^-\s+([A-Za-z_]+):(?:\s+(.*)|\s*)$/.exec(line);
    if (start) {
      current = {};
      entries.push(current);
      current[start[1]] = parseValue(start[2] ?? '', lineNo);
      continue;
    }
    const cont = /^\s+([A-Za-z_]+):(?:\s+(.*)|\s*)$/.exec(line);
    if (cont && current) {
      if (cont[1] in current) throw new Error(`line ${lineNo}: duplicate key "${cont[1]}" in one entry`);
      current[cont[1]] = parseValue(cont[2] ?? '', lineNo);
      continue;
    }
    throw new Error(`line ${lineNo}: not part of the ledger format: ${line.slice(0, 60)}`);
  }
  return entries;
}
// [SCOPE 142 / T002] END

/** All entries of root/decisions/ledger.yaml, in file order. A missing file is an empty ledger. */
// [SCOPE 142 / T002] BEGIN — Ledger format and the owner-path ledger script (FR-001, FR-…
export function readLedger(root) {
  const file = ledgerPath(root);
  if (!existsSync(file)) return [];
  return parseLedgerText(readFileSync(file, 'utf8'));
}
// [SCOPE 142 / T002] END

// ---- validation ----------------------------------------------------------------------------

/** Problems with one entry, as strings. [] means the entry is well formed. */
/** Supervising agents. Their answers are reviewed by the owner and never approve a decision (Amendment A). */
export const AGENT_APPROVERS = ['kain'];

// [SCOPE 142 / T002] BEGIN — Ledger format and the owner-path ledger script (FR-001, FR-…
// MODIFIED-BY: [SCOPE 142 / T024] — an agent (KAIN) is never an approver
export function validateEntry(e) {
  const errs = [];
  if (!e || typeof e !== 'object') return ['not an object'];
  for (const k of Object.keys(e)) if (!FIELDS.includes(k)) errs.push(`unknown field "${k}"`);
  if (typeof e.id !== 'string' || !ID_RE.test(e.id)) errs.push(`id must look like D-0001 (got ${JSON.stringify(e.id)})`);
  for (const k of REQUIRED_TEXT) if (typeof e[k] !== 'string' || !e[k].trim()) errs.push(`${k} is required`);
  if (e.rationale != null && typeof e.rationale !== 'string') errs.push('rationale must be text');
  if (e.source != null && typeof e.source !== 'string') errs.push('source must be text');
  if (!KINDS.includes(e.kind)) errs.push(`kind must be one of ${KINDS.join(', ')} (got ${JSON.stringify(e.kind)})`);
  if (!EVIDENCE.includes(e.evidence)) errs.push(`evidence must be one of ${EVIDENCE.join(', ')} (got ${JSON.stringify(e.evidence)})`);
  if (typeof e.approved_by !== 'string' || !e.approved_by.trim()) errs.push('approved_by is required and must not be empty');
  else if (AGENT_APPROVERS.includes(e.approved_by.trim().toLowerCase())) errs.push(`approved_by cannot be ${e.approved_by}: an agent's answer goes to the owner's review list (decisions/kain-replies.yaml), never the ledger`);
  if (typeof e.date !== 'string' || !DATE_RE.test(e.date)) errs.push(`date must be YYYY-MM-DD (got ${JSON.stringify(e.date)})`);
  if (e.supersedes != null && (typeof e.supersedes !== 'string' || !ID_RE.test(e.supersedes))) errs.push('supersedes must be an earlier id or null');
  return errs;
}
// [SCOPE 142 / T002] END

/** Whole-file problems: per-entry schema, duplicate ids, dangling or forward supersedes. */
// [SCOPE 142 / T002] BEGIN — Ledger format and the owner-path ledger script (FR-001, FR-…
export function checkEntries(entries) {
  const errors = [];
  const seen = new Map();
  entries.forEach((e, i) => {
    const label = e?.id ?? `entry ${i + 1}`;
    for (const m of validateEntry(e)) errors.push(`${label}: ${m}`);
    if (e?.id) {
      if (seen.has(e.id)) errors.push(`${e.id}: duplicate id`);
      else seen.set(e.id, i);
    }
  });
  entries.forEach((e, i) => {
    if (!e?.supersedes) return;
    const at = seen.get(e.supersedes);
    if (at === undefined) errors.push(`${e.id}: supersedes ${e.supersedes}, which is not in the ledger`);
    else if (at >= i) errors.push(`${e.id}: supersedes ${e.supersedes}, which is not earlier in the file`);
  });
  return errors;
}
// [SCOPE 142 / T002] END

// [SCOPE 142 / T002] BEGIN — Ledger format and the owner-path ledger script (FR-001, FR-…
export function checkLedger(root) {
  let entries;
  try {
    entries = readLedger(root);
  } catch (e) {
    return { ok: false, count: 0, errors: [`cannot read ${ledgerPath(root)}: ${e.message}`] };
  }
  const errors = checkEntries(entries);
  return { ok: errors.length === 0, count: entries.length, errors };
}
// [SCOPE 142 / T002] END

// ---- answer eligibility (FR-008) -----------------------------------------------------------

/** Agreed/Added/Changed, owner-approved, not superseded by a later entry, evidence not unknown. */
// [SCOPE 142 / T002] BEGIN — Ledger format and the owner-path ledger script (FR-001, FR-…
export function isAnswerEligible(entry, allEntries) {
  if (!entry || !['Agreed', 'Added', 'Changed'].includes(entry.kind)) return false;
  if (typeof entry.approved_by !== 'string' || !entry.approved_by.trim()) return false;
  if (entry.evidence === 'unknown') return false;
  const list = allEntries ?? [];
  return !list.some((o) => o && o.supersedes === entry.id);
}
// [SCOPE 142 / T002] END

// ---- writing -------------------------------------------------------------------------------

const q = (s) => JSON.stringify(String(s ?? ''));

// [SCOPE 142 / T002] BEGIN — Ledger format and the owner-path ledger script (FR-001, FR-…
export function serializeEntry(e) {
  return [
    `- id: ${e.id}`,
    `  scope: ${q(e.scope)}`,
    `  question: ${q(e.question)}`,
    `  decision: ${q(e.decision)}`,
    `  rationale: ${q(e.rationale ?? '')}`,
    `  kind: ${e.kind}`,
    `  evidence: ${e.evidence}`,
    `  source: ${q(e.source ?? '')}`,
    `  approved_by: ${q(e.approved_by)}`,
    `  date: ${e.date}`,
    `  supersedes: ${e.supersedes ? e.supersedes : 'null'}`,
    '',
  ].join('\n');
}
// [SCOPE 142 / T002] END

// [SCOPE 142 / T002] BEGIN — Ledger format and the owner-path ledger script (FR-001, FR-…
function nextId(entries) {
  let max = 0;
  for (const e of entries) {
    const m = /^D-(\d+)$/.exec(e?.id ?? '');
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `D-${String(max + 1).padStart(4, '0')}`;
}
// [SCOPE 142 / T002] END

const norm = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

// [SCOPE 142 / T002] BEGIN — Ledger format and the owner-path ledger script (FR-001, FR-…
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
// [SCOPE 142 / T002] END

/** Parallel agents may append at once: serialize with a lock file (stale after 10 s). */
// [SCOPE 142 / T002] BEGIN — Ledger format and the owner-path ledger script (FR-001, FR-…
function withLock(file, fn) {
  const lock = `${file}.lock`;
  const deadline = Date.now() + 3000;
  for (;;) {
    try {
      closeSync(openSync(lock, 'wx'));
      break;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      try {
        if (Date.now() - statSync(lock).mtimeMs > 10000) unlinkSync(lock);
      } catch {
        // someone else released it
      }
      if (Date.now() > deadline) throw new Error('the ledger is locked by another writer; try again');
      sleepSync(25);
    }
  }
  try {
    return fn();
  } finally {
    try {
      unlinkSync(lock);
    } catch {
      // already gone
    }
  }
}
// [SCOPE 142 / T002] END

/**
 * Append one entry. Returns the entry as written. Throws (and writes nothing) when the entry is
 * refused: empty approvedBy, duplicate id or content, unknown kind/evidence, dangling supersedes.
 * Existing bytes are never touched.
 */
// [SCOPE 142 / T002] BEGIN — Ledger format and the owner-path ledger script (FR-001, FR-…
export function appendEntry(root, entry, approvedBy) {
  if (typeof approvedBy !== 'string' || !approvedBy.trim()) throw new Error('refused: approved_by must not be empty');
  const file = ledgerPath(root);
  mkdirSync(dirname(file), { recursive: true });
  return withLock(file, () => {
    const existing = readLedger(root);
    const problems = checkEntries(existing);
    if (problems.length) throw new Error(`refused: the ledger already fails check (${problems[0]})`);
    const built = {
      id: entry?.id ?? nextId(existing),
      scope: entry?.scope,
      question: entry?.question,
      decision: entry?.decision,
      rationale: entry?.rationale ?? '',
      kind: entry?.kind,
      evidence: entry?.evidence,
      source: entry?.source ?? '',
      approved_by: approvedBy.trim(),
      date: entry?.date ?? new Date().toISOString().slice(0, 10),
      supersedes: entry?.supersedes ?? null,
    };
    for (const k of Object.keys(entry ?? {})) if (!FIELDS.includes(k)) throw new Error(`refused: unknown field "${k}"`);
    const errs = validateEntry(built);
    if (errs.length) throw new Error(`refused: ${errs.join('; ')}`);
    if (existing.some((e) => e.id === built.id)) throw new Error(`refused: duplicate id ${built.id}`);
    if (built.supersedes && !existing.some((e) => e.id === built.supersedes)) throw new Error(`refused: supersedes ${built.supersedes}, which is not in the ledger`);
    const same = existing.find((e) => e.kind === built.kind && norm(e.scope) === norm(built.scope) && norm(e.question) === norm(built.question) && norm(e.decision) === norm(built.decision));
    if (same) throw new Error(`refused: duplicate of ${same.id} (same scope, question, decision and kind)`);

    let prefix = '';
    if (!existsSync(file) || statSync(file).size === 0) prefix = HEADER;
    else if (!readFileSync(file, 'utf8').endsWith('\n')) prefix = '\n';
    appendFileSync(file, prefix + serializeEntry(built), 'utf8');
    return built;
  });
}
// [SCOPE 142 / T002] END

// ---- check --global ------------------------------------------------------------------------

const PATTERNS = [
  ['email', /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g],
  ['scope-or-spec-number', /\b(?:SCOPE|SPEC)[- ]?\d{2,4}\b/gi],
  ['file path', /(?:\b[A-Za-z]:[\\/][^\s"'`)]+|(?<![\w:/])~\/[^\s"'`)]+|(?<![\w/])\/(?:home|Users|etc|var|usr|opt|mnt)\/[^\s"'`)]+|\b[\w.-]+(?:[\\/][\w.-]+)+\.(?:tsx?|jsx?|mjs|cjs|md|json|ya?ml|sql|css|py|cs|ps1|sh|env)\b)/g],
];

/** Lines of a global-tier text that name a project, a path or a person. */
// [SCOPE 142 / T002] BEGIN — Ledger format and the owner-path ledger script (FR-001, FR-…
export function scanGlobalText(text) {
  const findings = [];
  text.split(/\r?\n/).forEach((line, i) => {
    for (const [kind, re] of PATTERNS) {
      for (const m of line.matchAll(re)) {
        if (kind === 'file path' && /^https?:/i.test(line.slice(Math.max(0, m.index - 8), m.index))) continue;
        findings.push({ line: i + 1, kind, match: m[0] });
      }
    }
  });
  return findings;
}
// [SCOPE 142 / T002] END

// [SCOPE 142 / T002] BEGIN — Ledger format and the owner-path ledger script (FR-001, FR-…
export function defaultGlobalFile() {
  return join(homedir(), '.wxai', 'god-learnings.md');
}
// [SCOPE 142 / T002] END

// ---- CLI -----------------------------------------------------------------------------------

// [SCOPE 142 / T002] BEGIN — Ledger format and the owner-path ledger script (FR-001, FR-…
function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) out[key] = true;
      else {
        out[key] = next;
        i++;
      }
    } else out._.push(a);
  }
  return out;
}
// [SCOPE 142 / T002] END

// [SCOPE 142 / T002] BEGIN — Ledger format and the owner-path ledger script (FR-001, FR-…
function runCli(argv) {
  const args = parseArgs(argv);
  const cmd = args._[0];
  const root = resolve(typeof args.root === 'string' ? args.root : process.cwd());
  const out = (s) => process.stdout.write(`${s}\n`);
  const err = (s) => process.stderr.write(`${s}\n`);

  if (cmd === 'append') {
    if (typeof args.file !== 'string') return err('usage: append --file <entry.json> --approved-by <who> [--root <dir>]'), 2;
    const who = typeof args['approved-by'] === 'string' ? args['approved-by'] : '';
    let entry;
    try {
      entry = JSON.parse(readFileSync(resolve(args.file), 'utf8').replace(/^\uFEFF/, ''));
    } catch (e) {
      return err(`cannot read entry file: ${e.message}`), 2;
    }
    try {
      const written = appendEntry(root, entry, who);
      out(JSON.stringify({ ok: true, id: written.id, file: ledgerPath(root) }));
      return 0;
    } catch (e) {
      return err(e.message), 1;
    }
  }

  if (cmd === 'check' && args.global) {
    const file = typeof args['global-file'] === 'string' ? resolve(args['global-file']) : defaultGlobalFile();
    if (!existsSync(file)) return out(`global tier: ${file} does not exist; nothing to scan.`), 0;
    const findings = scanGlobalText(readFileSync(file, 'utf8'));
    if (!findings.length) return out(`global tier clean: no file paths, SCOPE-/SPEC- numbers or emails in ${file}`), 0;
    err(`global tier has ${findings.length} finding(s) in ${file}:`);
    for (const f of findings) err(`  line ${f.line}: ${f.kind}: ${f.match}`);
    return 1;
  }

  if (cmd === 'check') {
    const r = checkLedger(root);
    // FR-025: KAIN replies awaiting the owner's review, always listed (0 included).
    const pending = existsSync(join(root, 'decisions', 'kain-replies.yaml'))
      ? parseLedgerText(readFileSync(join(root, 'decisions', 'kain-replies.yaml'), 'utf8')).filter((x) => x.status === 'pending')
      : [];
    out(`KAIN replies awaiting your review: ${pending.length}${pending.length ? ` (${pending.map((x) => x.id).join(', ')}; run kain.mjs list)` : ''}`);
    if (r.ok) return out(`ledger ok: ${r.count} entr${r.count === 1 ? 'y' : 'ies'} in ${ledgerPath(root)}`), 0;
    err(`ledger FAILED check (${r.errors.length} problem${r.errors.length === 1 ? '' : 's'}):`);
    for (const m of r.errors) err(`  ${m}`);
    return 1;
  }

  err('usage: ledger.mjs append|check [--global] ...');
  return 2;
}
// [SCOPE 142 / T002] END

if (process.argv[1]?.replace(/\\/g, '/').endsWith('_wxAI/askgate/ledger.mjs')) {
  process.exitCode = runCli(process.argv.slice(2));
}

export { runCli as _runCli };
