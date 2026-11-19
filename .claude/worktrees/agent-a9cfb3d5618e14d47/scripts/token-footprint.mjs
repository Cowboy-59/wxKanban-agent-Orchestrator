#!/usr/bin/env node
// [SCOPE 093 / T011] Token-footprint measurement surface (FR-013, FR-014).
//
// Reports the approximate editor-AI token cost that wxKanban controls:
//   • Per-session preamble  — the fixed footprint loaded every session (CLAUDE.md + the
//     MEMORY.md index when present). On-demand reference/rule modules are listed separately
//     and marked "not loaded unless triggered" — they cost 0 tokens until their trigger fires.
//   • Per-flow estimate     — the served command-prompt cost of a flow (buildscope → createSpecs
//     → implement), summed from mcp-server/src/prompts/*.md.
//
// Measurement is deliberately approximate (chars ÷ 4, the standard English heuristic) — success
// targets in SCOPE-093 carry margin to tolerate that. Deterministic, no model call.
//
// Usage:
//   node scripts/token-footprint.mjs              # print the current footprint
//   node scripts/token-footprint.mjs --baseline   # snapshot current numbers to compare against
//   node scripts/token-footprint.mjs --json        # machine-readable output
//
// Before/after (FR-014): run --baseline before a change, then a plain run after — it prints the
// delta against the snapshot so a saving's effect is attributable to the change that caused it.

import { readFileSync, existsSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const BASELINE_PATH = join(ROOT, '.token-footprint-baseline.json');

/** Approximate token count of a UTF-8 string: ~4 characters per token (English). */
function tokens(text) {
  return Math.round(text.length / 4);
}

/** Token count of a file, or null if it does not exist. */
function fileTokens(path) {
  if (!existsSync(path)) return null;
  return tokens(readFileSync(path, 'utf8'));
}

/** All *.md files in a directory as { name, tokens }, or [] if the dir is absent. */
function moduleTokens(dir) {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs)
    .filter((f) => f.endsWith('.md'))
    .map((f) => ({ name: `${dir}/${f}`, tokens: fileTokens(join(abs, f)) ?? 0 }))
    .sort((a, b) => b.tokens - a.tokens);
}

/**
 * Locate the per-user auto-memory index (MEMORY.md). It lives outside the repo under
 * ~/.claude/projects/<slug>/memory/. Best-effort: return its tokens or null if not found.
 */
function memoryIndexTokens() {
  const base = join(homedir(), '.claude', 'projects');
  if (!existsSync(base)) return null;
  for (const slug of readdirSync(base)) {
    const candidate = join(base, slug, 'memory', 'MEMORY.md');
    if (existsSync(candidate)) return fileTokens(candidate);
  }
  return null;
}

function collect() {
  // Fixed per-session preamble (always loaded).
  const claudeMd = fileTokens(join(ROOT, 'CLAUDE.md')) ?? 0;
  const memoryIndex = memoryIndexTokens();

  // On-demand modules (loaded only when their trigger fires → 0 until then).
  const reference = moduleTokens('_wxAI/reference');
  const rules = moduleTokens('_wxAI/rules');

  // Per-flow command-prompt cost. buildscope/createSpecs are served from the MCP prompt registry
  // source; implement has no runtime prompt, so its cost is the command-doc methodology. Each stage
  // resolves against a candidate list so the measure survives a prompt moving location.
  const flowStages = [
    { stage: 'buildscope', candidates: ['mcp-server/src/prompts/buildscope.md'] },
    { stage: 'createSpecs', candidates: ['mcp-server/src/prompts/createspecs.md'] },
    { stage: 'implement', candidates: ['mcp-server/src/prompts/implement.md', '_wxAI/commands/wxAI-implement.md'] },
  ];
  const flow = flowStages.map(({ stage, candidates }) => {
    const src = candidates.find((c) => existsSync(join(ROOT, c))) ?? candidates[candidates.length - 1];
    return { stage, source: src, tokens: fileTokens(join(ROOT, src)) ?? 0 };
  });

  const preamble = claudeMd + (memoryIndex ?? 0);
  const flowTotal = flow.reduce((s, x) => s + x.tokens, 0);

  return {
    preamble: { claudeMd, memoryIndex, total: preamble },
    onDemand: { reference, rules },
    flow: { stages: flow, total: flowTotal },
  };
}

function fmt(n) {
  return n === null ? 'n/a' : n.toLocaleString('en-US');
}

function printHuman(cur, base) {
  const delta = (now, was) =>
    was == null || now == null ? '' : `  (${now - was >= 0 ? '+' : ''}${fmt(now - was)} vs baseline)`;

  console.log('\nwxKanban token footprint  (≈ chars ÷ 4 — approximate)\n');

  console.log('PER-SESSION PREAMBLE  (loaded every session)');
  console.log(`  CLAUDE.md .................. ${fmt(cur.preamble.claudeMd)}${base ? delta(cur.preamble.claudeMd, base.preamble.claudeMd) : ''}`);
  console.log(`  MEMORY.md index ............ ${fmt(cur.preamble.memoryIndex)}${cur.preamble.memoryIndex == null ? '  (not found — per-user, outside repo)' : ''}`);
  console.log(`  ── preamble total .......... ${fmt(cur.preamble.total)}${base ? delta(cur.preamble.total, base.preamble.total) : ''}`);

  console.log('\nON-DEMAND MODULES  (0 tokens until their trigger fires)');
  for (const m of [...cur.onDemand.reference, ...cur.onDemand.rules]) {
    console.log(`  ${m.name} ${'.'.repeat(Math.max(2, 40 - m.name.length))} ${fmt(m.tokens)}`);
  }

  console.log('\nPER-FLOW ESTIMATE  (buildscope → createSpecs → implement command prompts)');
  for (const s of cur.flow.stages) {
    console.log(`  ${s.stage} ${'.'.repeat(Math.max(2, 26 - s.stage.length))} ${fmt(s.tokens)}  [${s.source}]`);
  }
  console.log(`  ── flow total .............. ${fmt(cur.flow.total)}${base ? delta(cur.flow.total, base.flow.total) : ''}`);

  if (base) {
    console.log(`\nCompared against baseline snapshot taken at ${base.takenAt}.`);
  } else {
    console.log('\n(No baseline. Run with --baseline to snapshot these numbers for before/after.)');
  }
  console.log('');
}

// ---- main ----
const args = process.argv.slice(2);
const current = collect();

if (args.includes('--baseline')) {
  const snapshot = { takenAt: new Date().toISOString(), ...current };
  writeFileSync(BASELINE_PATH, JSON.stringify(snapshot, null, 2));
  console.log(`Baseline written to ${basename(BASELINE_PATH)} (preamble ≈ ${fmt(current.preamble.total)} tokens, flow ≈ ${fmt(current.flow.total)} tokens).`);
} else if (args.includes('--json')) {
  console.log(JSON.stringify(current, null, 2));
} else {
  const base = existsSync(BASELINE_PATH) ? JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) : null;
  printHuman(current, base);
}
