#!/usr/bin/env node
// Per-command model tier in the kit command files (SPEC-143 FR-016, T019; spike-command-tier.md).
//
//   node _wxAI/routing/apply-command-tiers.mjs            dry run: print the planned changes
//   node _wxAI/routing/apply-command-tiers.mjs --write    apply them
//   --force        replace a model: line that already names a different model
//   --only <name>  one command
//   --root <dir>   another project (default: the current one)
//
// Reads the `commands` map of _wxAI/routing/tiers.default.json and sets ONE line, `model: <alias>`
// (easy -> haiku, moderate -> sonnet, heavy -> opus), in the YAML frontmatter of
// _wxAI/commands/<name>.md and its mirror .claude/commands/<name>.md. Aliases, not full ids, so the
// files survive model upgrades. The frontmatter model applies to that command's turn only, when the
// user types the slash command; the session model resumes on the next prompt.
//
// Rules: only the model: line changes; a file with no frontmatter gets one holding only model:;
// the body is never touched; both mirrors get the same bytes, so a pair that differs, or a command
// with only one of the two files, is refused; a different existing model: is refused unless
// --force; a command with no file is skipped. A command with no tier keeps no model: line, which
// is the same as `inherit`. Nothing here writes a settings file or sets a session-wide model.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { kitDefaults } from './tiers.mjs';

export const TIER_ALIAS = Object.freeze({ easy: 'haiku', moderate: 'sonnet', heavy: 'opus' });
export const MIRRORS = Object.freeze(['_wxAI/commands', '.claude/commands']);

const FRONT_RE = /^---(\r?\n)([\s\S]*?)(?:\r?\n)?^---[ \t]*(\r?\n|$)/m;

function frontmatter(text) {
  const m = FRONT_RE.exec(text);
  return m && m.index === 0 ? m : null;
}

/**
 * Set `model: <alias>` in the frontmatter of one command file's text.
 * Returns { text, action: 'unchanged'|'add'|'update'|'insert-frontmatter'|'refused', from, reason }.
 */
export function applyFrontmatterModel(text, alias, { force = false } = {}) {
  const src = String(text);
  const bom = src.startsWith('﻿') ? '﻿' : '';
  const body0 = src.slice(bom.length);
  const eol = /\r\n/.test(body0) ? '\r\n' : '\n';
  const m = frontmatter(body0);
  if (!m) {
    return { text: `${bom}---${eol}model: ${alias}${eol}---${eol}${body0}`, action: 'insert-frontmatter', from: null, reason: 'no frontmatter; added one holding only model:' };
  }
  const front = m[2];
  const rest = body0.slice(m[0].length);
  const closing = m[0].slice(m[0].lastIndexOf('---'));
  const lines = front.split(/\r?\n/);
  const at = lines.findIndex((l) => /^model\s*:/.test(l));
  if (at >= 0) {
    const current = lines[at].replace(/^model\s*:\s*/, '').replace(/\s+#.*$/, '').trim().replace(/^["']|["']$/g, '');
    if (current === alias) return { text: src, action: 'unchanged', from: current, reason: 'already set' };
    if (!force) return { text: src, action: 'refused', from: current, reason: `already has model: ${current}; pass --force to replace it` };
    lines[at] = `model: ${alias}`;
    return { text: `${bom}---${m[1]}${lines.join(eol)}${eol}${closing}${rest}`, action: 'update', from: current, reason: `replaced model: ${current}` };
  }
  const kept = front === '' ? [] : lines;
  return { text: `${bom}---${m[1]}${[...kept, `model: ${alias}`].join(eol)}${eol}${closing}${rest}`, action: 'add', from: null, reason: 'added model: to the frontmatter' };
}

/** The body of a command file: everything after the frontmatter (the whole text when there is none). */
export function commandBody(text) {
  const src = String(text).replace(/^﻿/, '');
  const m = frontmatter(src);
  return m ? src.slice(m[0].length) : src;
}

export function planCommandTiers({ root, force = false, only = null } = {}) {
  const base = resolve(root ?? process.cwd());
  const { commands } = kitDefaults();
  const plan = [];
  for (const [command, tier] of Object.entries(commands)) {
    if (only && command !== only) continue;
    const alias = TIER_ALIAS[tier];
    const files = MIRRORS.map((d) => join(base, d, `${command}.md`));
    const present = files.filter((f) => existsSync(f));
    const entry = { command, tier, alias, files, action: 'skipped', from: null, reason: '', newText: null };
    if (!present.length) {
      plan.push({ ...entry, reason: 'no command file in either mirror' });
      continue;
    }
    if (present.length !== files.length) {
      plan.push({ ...entry, action: 'refused', reason: `only ${present.map((f) => f.slice(base.length + 1)).join(', ')} exists; the mirror is missing` });
      continue;
    }
    const texts = files.map((f) => readFileSync(f, 'utf8'));
    if (texts[0] !== texts[1]) {
      plan.push({ ...entry, action: 'refused', reason: 'the two mirrors differ; make them identical first' });
      continue;
    }
    const r = applyFrontmatterModel(texts[0], alias, { force });
    plan.push({ ...entry, action: r.action, from: r.from, reason: r.reason, newText: r.action === 'refused' || r.action === 'unchanged' ? null : r.text });
  }
  return plan;
}

export function applyCommandTiers({ root, force = false, only = null, write = false } = {}) {
  const plan = planCommandTiers({ root, force, only });
  if (write) {
    for (const p of plan) {
      if (p.newText === null) continue;
      for (const f of p.files) writeFileSync(f, p.newText);
      p.written = true;
    }
  }
  return plan;
}

function main(argv) {
  const arg = (flag) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const root = resolve(arg('--root') ?? process.cwd());
  const write = argv.includes('--write');
  let plan;
  try {
    plan = applyCommandTiers({ root, force: argv.includes('--force'), only: arg('--only') ?? null, write });
  } catch (e) {
    process.stderr.write(`apply-command-tiers: ${e instanceof Error ? e.message : e}\n`);
    process.exit(2);
  }
  process.stdout.write(`${write ? 'Applied' : 'Dry run (pass --write to apply)'}: per-command model tiers from _wxAI/routing/tiers.default.json\n`);
  for (const p of plan) {
    const what = p.newText !== null ? `${p.action} model: ${p.alias}${p.from ? ` (was ${p.from})` : ''}` : p.action;
    process.stdout.write(`  ${p.command.padEnd(12)} ${p.tier.padEnd(9)} ${what.padEnd(34)} ${p.reason}\n`);
    if (p.newText !== null) for (const f of p.files) process.stdout.write(`      ${write ? 'wrote' : 'would write'} ${f.slice(root.length + 1).replace(/\\/g, '/')}\n`);
  }
  process.exit(plan.some((p) => p.action === 'refused') ? 1 : 0);
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('_wxAI/routing/apply-command-tiers.mjs')) main(process.argv.slice(2));
