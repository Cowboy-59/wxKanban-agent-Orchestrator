#!/usr/bin/env node
// Comparison mode (SPEC-143 T013, FR-010).
//
// Same task, two Claude models, two separate worktrees. This module only PLANS and RECORDS: it
// never spawns an agent and never runs git. The plan lists the git commands for G.O.D. to run, and
// G.O.D. runs the two agents. A third model then reviews both diffs.
//
// Anthropic only (FR-007, Amendment A): both sides must be Claude models on the official client.
// A side naming another model, provider or route is refused and the refusal is logged (policy.mjs).
//
//   node compare.mjs plan   --task <id> --current <model>[:official] --candidate <model>[:official] [--root <dir>] [--class easy|moderate|heavy]
//   node compare.mjs record --file outcomes.json [--root <dir>]
//
// outcomes.json: { comparisonid, taskid, difficulty, command, runs: [ { variant: "current"|"candidate",
//   model, route, provider, firstpass, inputtokens, outputtokens, cachereadtokens, cachewritetokens,
//   activeseconds, waitingseconds, starttime, endtime } ] }
//
// Records carry two fields beyond C1: variant and firstpass (needed by propose.mjs), plus
// neverbilled: true. Comparison runs never become time entries (FR-010).
//
// Internal projects only: decisions/settings.yaml `project: { kind: client }` refuses.
// Plain Node ESM, no dependencies.

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { logEvent } from './log.mjs';
import { checkRoute, SUBSCRIPTION_PROVIDER } from './policy.mjs';
import { RUN_LOG_REL } from './report-lib.mjs';

export function uuidv7(now = Date.now()) {
  const b = randomBytes(16);
  const ts = BigInt(now);
  for (let i = 0; i < 6; i++) b[i] = Number((ts >> BigInt(8 * (5 - i))) & 0xffn);
  b[6] = (b[6] & 0x0f) | 0x70;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// Reads `project: { kind: client }` or the block form `project:\n  kind: client`. Default internal.
export function projectKind(root) {
  const p = join(root, 'decisions', 'settings.yaml');
  if (!existsSync(p)) return 'internal';
  const text = readFileSync(p, 'utf8');
  const inline = /^project:\s*\{[^}]*\bkind:\s*["']?(\w+)["']?/m.exec(text);
  if (inline) return inline[1].toLowerCase();
  const block = /^project:\s*\r?\n((?:[ \t]+.*\r?\n?)+)/m.exec(text);
  if (block) {
    const k = /^[ \t]+kind:\s*["']?(\w+)["']?/m.exec(block[1]);
    if (k) return k[1].toLowerCase();
  }
  return 'internal';
}

function parseRoute(spec) {
  const [model, route] = String(spec ?? '').split(':');
  if (!model) throw new Error('a route is <model>[:official]');
  return { model, route: route || 'official' };
}

/** The first side that is not a Claude model on the official client, as a refusal; else null. */
function refuseNonClaude({ root, taskid, difficulty, sides }) {
  for (const s of sides) {
    const out = checkRoute({ provider: s.provider ?? SUBSCRIPTION_PROVIDER, route: s.route ?? 'official', model: s.model, difficulty, command: 'compare', taskid, root });
    if (!out.allowed) return { ok: false, refused: true, reason: `Comparison refused: ${out.reason}.`, fallbackModel: out.fallbackModel };
  }
  return null;
}

export function planComparison({ root, taskid, current, candidate, difficulty, id }) {
  if (!taskid) throw new Error('--task is required');
  const kind = projectKind(root);
  if (kind === 'client') {
    logEvent(root, { event: 'refusal', taskid, command: 'compare', reason: 'comparison mode is for internal projects only; this project is marked client', evidence: 'decisions/settings.yaml project.kind = client' });
    return { ok: false, refused: true, reason: 'Comparison mode is for internal projects only. This project is marked client in decisions/settings.yaml.' };
  }
  const cur = parseRoute(current);
  const cand = parseRoute(candidate);
  const refused = refuseNonClaude({ root, taskid, difficulty, sides: [cur, cand] });
  if (refused) return refused;
  const comparisonid = id ?? uuidv7();
  const short = comparisonid.replace(/-/g, '').slice(-8);
  const parent = dirname(root);
  const name = basename(root);
  const worktrees = [
    { variant: 'current', ...cur, branch: `cmp/${short}-current`, path: join(parent, `${name}-cmp-${short}-current`) },
    { variant: 'candidate', ...cand, branch: `cmp/${short}-candidate`, path: join(parent, `${name}-cmp-${short}-candidate`) },
  ];
  const commands = [];
  for (const w of worktrees) commands.push(`git -C "${root}" worktree add -b ${w.branch} "${w.path}" HEAD`);
  const cleanup = [];
  for (const w of worktrees) cleanup.push(`git -C "${root}" worktree remove --force "${w.path}"`, `git -C "${root}" branch -D ${w.branch}`);
  logEvent(root, { event: 'comparison', taskid, command: 'compare', from: cur.model, to: cand.model, reason: 'comparison planned', evidence: { comparisonid, difficulty: difficulty ?? null } });
  return {
    ok: true,
    comparisonid,
    taskid,
    difficulty: difficulty ?? null,
    worktrees,
    commands,
    cleanup,
    steps: [
      'Run the commands above (G.O.D. does this, compare.mjs does not).',
      'Run the task once in each worktree with the stated model and route, same spec, same starting commit.',
      'Have a third model review both diffs; first pass = accepted with no rework.',
      'Write the outcomes JSON and run: node compare.mjs record --file <outcomes.json>',
      'Run the cleanup commands. Comparison runs are never billed.',
    ],
  };
}

const nullable = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function recordOutcomes({ root, outcomes, now = () => new Date().toISOString() }) {
  if (projectKind(root) === 'client') {
    logEvent(root, { event: 'refusal', taskid: outcomes && outcomes.taskid, command: 'compare', reason: 'comparison records refused: project is marked client' });
    return { ok: false, refused: true, reason: 'Project is marked client.' };
  }
  if (!outcomes || !outcomes.comparisonid || !Array.isArray(outcomes.runs) || outcomes.runs.length !== 2) {
    throw new Error('outcomes need comparisonid and exactly two runs');
  }
  const variants = outcomes.runs.map((r) => r.variant).sort().join(',');
  if (variants !== 'candidate,current') throw new Error('the two runs must be one "current" and one "candidate"');
  const refused = refuseNonClaude({ root, taskid: outcomes.taskid ?? null, difficulty: outcomes.difficulty, sides: outcomes.runs });
  if (refused) return refused;
  const written = [];
  const file = join(root, RUN_LOG_REL);
  mkdirSync(dirname(file), { recursive: true });
  for (const r of outcomes.runs) {
    const rec = {
      id: uuidv7(),
      projectid: outcomes.projectid ?? null,
      aispecsessionid: null,
      taskid: outcomes.taskid ?? null,
      command: outcomes.command ?? 'compare',
      kind: 'subagent',
      difficulty: outcomes.difficulty ?? null,
      model: r.model,
      provider: r.provider ?? 'anthropic-subscription',
      route: r.route ?? 'official',
      inputtokens: nullable(r.inputtokens),
      outputtokens: nullable(r.outputtokens),
      cachereadtokens: nullable(r.cachereadtokens),
      cachewritetokens: nullable(r.cachewritetokens),
      activeseconds: nullable(r.activeseconds),
      waitingseconds: nullable(r.waitingseconds),
      escalated: false,
      comparisonid: outcomes.comparisonid,
      starttime: r.starttime ?? null,
      endtime: r.endtime ?? now(),
      variant: r.variant,
      firstpass: typeof r.firstpass === 'boolean' ? r.firstpass : null,
      neverbilled: true,
    };
    appendFileSync(file, JSON.stringify(rec) + '\n', 'utf8');
    written.push(rec.id);
  }
  const cur = outcomes.runs.find((r) => r.variant === 'current');
  const cand = outcomes.runs.find((r) => r.variant === 'candidate');
  logEvent(root, {
    event: 'comparison',
    taskid: outcomes.taskid ?? null,
    command: 'compare',
    from: cur.model,
    to: cand.model,
    reason: 'comparison recorded',
    evidence: { comparisonid: outcomes.comparisonid, currentFirstPass: cur.firstpass ?? null, candidateFirstPass: cand.firstpass ?? null },
  });
  return { ok: true, comparisonid: outcomes.comparisonid, recordIds: written };
}

function parseArgs(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) o[a.slice(2)] = true;
      else {
        o[a.slice(2)] = next;
        i++;
      }
    } else o._.push(a);
  }
  return o;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const a = parseArgs(process.argv.slice(2));
    const root = resolve(typeof a.root === 'string' ? a.root : process.cwd());
    let result;
    if (a._[0] === 'plan') {
      result = planComparison({ root, taskid: a.task, current: a.current, candidate: a.candidate, difficulty: a.class });
    } else if (a._[0] === 'record') {
      result = recordOutcomes({ root, outcomes: JSON.parse(readFileSync(String(a.file), 'utf8')) });
    } else {
      throw new Error('usage: compare.mjs plan|record ...');
    }
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    if (!result.ok) process.exitCode = 1;
  } catch (err) {
    process.stderr.write(String(err && err.message ? err.message : err) + '\n');
    process.exitCode = 2;
  }
}
