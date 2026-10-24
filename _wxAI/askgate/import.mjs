#!/usr/bin/env node
// /wxLedger import (SPEC-142 FR-004): propose ledger entries from a closed brainstorm record.
//
//   node _wxAI/askgate/import.mjs <record.md> [--root <dir>] [--scope <name>]            PRINT only
//   node _wxAI/askgate/import.mjs <record.md> --approve <who> [--root <dir>]            write
//
// Reads the record's Decisions table (columns: # | Item | Decision | Kind | To scope? | Date) and
// proposes one entry per row. Nothing is written unless --approve names who approved it; each
// entry then goes through ledger.mjs appendEntry (so every ledger rule still applies).
//   - Kind comes from the row; evidence is `confirmed`, except Parked rows which are `unknown`.
//   - scope comes from SCOPE-/SPEC- in the "To scope?" cell, else --scope, else the record name.
//   - A row that is already in the ledger (same scope, question, decision, kind) is skipped.

import { existsSync, readFileSync } from 'node:fs';
import { basename, relative, resolve } from 'node:path';
import { KINDS, appendEntry } from './ledger.mjs';

// [SCOPE 142 / T004] BEGIN — /wxLedger command: check, check --global, search, import (F…
function splitRow(line) {
  const cells = [];
  let cur = '';
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '\\' && line[i + 1] === '|') {
      cur += '|';
      i++;
    } else if (line[i] === '|') {
      cells.push(cur);
      cur = '';
    } else cur += line[i];
  }
  cells.push(cur);
  if (cells[0].trim() === '') cells.shift();
  if (cells.length && cells.at(-1).trim() === '') cells.pop();
  return cells.map((c) => c.trim());
}
// [SCOPE 142 / T004] END

/** Rows of the "## Decisions" table. Blank lines inside the table do not end it. */
// [SCOPE 142 / T004] BEGIN — /wxLedger command: check, check --global, search, import (F…
export function parseDecisionRows(markdown) {
  const lines = markdown.replace(/^﻿/, '').split(/\r?\n/);
  const start = lines.findIndex((l) => /^##\s+Decisions\s*$/i.test(l.trim()));
  if (start < 0) return { rows: [], problems: ['no "## Decisions" section'] };
  const rows = [];
  const problems = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (/^##\s/.test(line)) break;
    if (!line.startsWith('|')) continue;
    const cells = splitRow(line);
    if (cells[0] === '#' || /^:?-{2,}:?$/.test(cells[0])) continue;
    if (cells.length < 6) {
      problems.push(`row "${cells[0] ?? line.slice(0, 20)}" has ${cells.length} columns, expected 6`);
      continue;
    }
    rows.push({ num: cells[0], item: cells[1], decision: cells[2], kind: cells[3], toScope: cells[4], date: cells[5] });
  }
  return { rows, problems };
}
// [SCOPE 142 / T004] END

/** One row to one proposed entry (without id/approved_by), or an error string. */
// [SCOPE 142 / T004] BEGIN — /wxLedger command: check, check --global, search, import (F…
export function proposeEntry(row, { recordPath, scopeFallback }) {
// [SCOPE 142 / T004] END
  const kind = KINDS.find((k) => k.toLowerCase() === row.kind.replace(/[*_`]/g, '').trim().split(/\s+/)[0]?.toLowerCase());
  if (!kind) return { error: `row ${row.num}: unknown kind "${row.kind}"` };
  const tag = /\b(?:SCOPE|SPEC)-\d{2,4}\b/.exec(row.toScope);
  const date = /\d{4}-\d{2}-\d{2}/.exec(row.date)?.[0];
  if (!date) return { error: `row ${row.num}: no date in "${row.date}"` };
  return {
    entry: {
      scope: tag ? tag[0] : scopeFallback,
      question: row.item,
      decision: row.decision,
      rationale: '',
      kind,
      evidence: kind === 'Parked' ? 'unknown' : 'confirmed',
      source: `${recordPath}#${row.num}`,
      date,
      supersedes: null,
    },
  };
}

// [SCOPE 142 / T004] BEGIN — /wxLedger command: check, check --global, search, import (F…
function parseArgs(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) a[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    else a._.push(argv[i]);
  }
  return a;
}
// [SCOPE 142 / T004] END

// [SCOPE 142 / T004] BEGIN — /wxLedger command: check, check --global, search, import (F…
function main(argv) {
  const args = parseArgs(argv);
  const recordArg = args._[0];
  const out = (s) => process.stdout.write(`${s}\n`);
  const err = (s) => process.stderr.write(`${s}\n`);
  if (!recordArg) return err('usage: import.mjs <record.md> [--approve <who>] [--root <dir>] [--scope <name>]'), 2;
  const root = resolve(typeof args.root === 'string' ? args.root : process.cwd());
  const file = resolve(root, recordArg);
  if (!existsSync(file)) return err(`record not found: ${file}`), 2;
  const recordPath = relative(root, file).replace(/\\/g, '/');
  const { rows, problems } = parseDecisionRows(readFileSync(file, 'utf8'));
  const scopeFallback = typeof args.scope === 'string' ? args.scope : basename(file, '.md');

  const proposals = [];
  const errors = [...problems];
  for (const row of rows) {
    const p = proposeEntry(row, { recordPath, scopeFallback });
    if (p.error) errors.push(p.error);
    else proposals.push(p.entry);
  }

  out(`Proposed ledger entries from ${recordPath}: ${proposals.length} of ${rows.length} decision row(s)`);
  proposals.forEach((e, i) => out(`  ${String(i + 1).padStart(2)}. [${e.kind}/${e.evidence}] ${e.scope} | ${e.question} -> ${e.decision.length > 90 ? `${e.decision.slice(0, 87)}...` : e.decision}  (${e.source})`));
  for (const m of errors) err(`  not proposed: ${m}`);

  const who = typeof args.approve === 'string' ? args.approve.trim() : '';
  if (args.approve !== undefined && !who) return err('--approve needs the approver\'s name (for example --approve owner)'), 2;
  if (!who) {
    out('\nNothing written. To write these, the owner approves, then run again with --approve <who>.');
    return errors.length ? 1 : 0;
  }

  let written = 0;
  let skipped = 0;
  for (const e of proposals) {
    try {
      const w = appendEntry(root, e, who);
      written++;
      out(`  wrote ${w.id}: ${e.question}`);
    } catch (ex) {
      skipped++;
      err(`  skipped "${e.question}": ${ex.message}`);
    }
  }
  out(`\nWritten ${written}, skipped ${skipped}, approved by ${who}.`);
  return errors.length || skipped ? 1 : 0;
}
// [SCOPE 142 / T004] END

if (process.argv[1]?.replace(/\\/g, '/').endsWith('_wxAI/askgate/import.mjs')) process.exitCode = main(process.argv.slice(2));
