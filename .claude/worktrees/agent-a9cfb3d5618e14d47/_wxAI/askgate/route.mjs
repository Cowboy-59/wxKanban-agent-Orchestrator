#!/usr/bin/env node
// Blocker routing for the Ask Gate (SPEC-142 FR-010, T010).
//
// Given a gate outcome of class 'blocker' (contract C4), pick one of three routes:
//   1. queue            a --create run is active: append to the decision queue, park the unit.
//                       If a bridge session is also live, the question goes to the room too.
//   2. room-and-developer  no --create run, but a bridge session is live: post to the room AND
//                       let the question through to the developer.
//   3. pass-through     neither: the question reaches the developer unchanged, one log line.
//
// An owner answer to a queued item becomes a ledger entry by calling the ledger CLI
// (approved_by: owner). This file never writes decisions/ledger.yaml itself.
//
// Plain Node ESM, no dependencies, no console output except the CLI's JSON result.

import { existsSync, readFileSync, writeFileSync, mkdirSync, appendFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

export const STATE_REL = join('docs', 'GOD-State.json');
export const DECISIONS_MD_REL = join('docs', 'GOD-Decisions.md');
export const LOCK_REL = join('.wxai', 'remote-session.lock');
export const OUTBOX_REL = join('.wxai', 'room-outbox.jsonl');
export const GATE_LOG_REL = join('decisions', 'gate-log.jsonl');

// ---------- detection (pure, injectable) ----------

// [SCOPE 142 / T010] BEGIN — Blocker routing: decision queue, bridge room, or pass-throu…
export function readState(root) {
  const p = join(root, STATE_REL);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}
// [SCOPE 142 / T010] END

// A --create run is active when GOD-State.json says mode "create" and the run is not finished.
// [SCOPE 142 / T010] BEGIN — Blocker routing: decision queue, bridge room, or pass-throu…
export function detectCreateRun(root) {
  const state = readState(root);
  if (!state || state.mode !== 'create') return { active: false, state: null };
  if (state.phase === 'done') return { active: false, state };
  return { active: true, state };
}
// [SCOPE 142 / T010] END

// [SCOPE 142 / T010] BEGIN — Blocker routing: decision queue, bridge room, or pass-throu…
function defaultPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err && err.code === 'EPERM';
  }
}
// [SCOPE 142 / T010] END

// The Remote Session Bridge holds .wxai/remote-session.lock = { pid, owner, since } while it runs
// (wxkanban-agent/apps/remote-bridge/src/agent-mode.ts). A lock whose pid is gone is stale.
// [SCOPE 142 / T010] BEGIN — Blocker routing: decision queue, bridge room, or pass-throu…
export function detectLiveSession(root, pidAlive = defaultPidAlive) {
  const p = join(root, LOCK_REL);
  if (!existsSync(p)) return { live: false };
  try {
    const held = JSON.parse(readFileSync(p, 'utf8'));
    if (typeof held.pid === 'number' && pidAlive(held.pid)) return { live: true, owner: held.owner ?? null, pid: held.pid };
  } catch {
    /* unreadable lock counts as not live */
  }
  return { live: false };
}
// [SCOPE 142 / T010] END

// Pure decision. createActive / liveSession are booleans.
// [SCOPE 142 / T010] BEGIN — Blocker routing: decision queue, bridge room, or pass-throu…
export function decideRoute({ createActive, liveSession }) {
// [SCOPE 142 / T010] END
  if (createActive) return { route: 'queue', alsoRoom: !!liveSession, passThrough: false };
  if (liveSession) return { route: 'room-and-developer', alsoRoom: true, passThrough: true };
  return { route: 'pass-through', alsoRoom: false, passThrough: true };
}

// ---------- queue item ----------

// [SCOPE 142 / T010] BEGIN — Blocker routing: decision queue, bridge room, or pass-throu…
export function nextDqId(queue) {
  let max = 0;
  for (const it of Array.isArray(queue) ? queue : []) {
    const m = /^DQ-(\d+)$/.exec(String(it && it.id));
    if (m) max = Math.max(max, Number(m[1]));
  }
  return 'DQ-' + String(max + 1).padStart(2, '0');
}
// [SCOPE 142 / T010] END

// [SCOPE 142 / T010] BEGIN — Blocker routing: decision queue, bridge room, or pass-throu…
export function buildQueueItem(id, ctx, nowIso) {
  return {
    id,
    kind: 'parked',
    at: nowIso,
    unit: ctx.unit ?? null,
    command: ctx.command ?? null,
    question: ctx.question,
    recommendation: ctx.recommendation ?? 'none given',
    why: ctx.why ?? 'High-risk: classified as a blocker by the Ask Gate',
    blocks: Array.isArray(ctx.blocks) ? ctx.blocks : ctx.unit ? [ctx.unit] : [],
    resumeAt: ctx.resumeAt ?? 'implement',
    status: 'open',
    ...(ctx.dataLoss ? { dataLoss: true } : {}),
  };
}
// [SCOPE 142 / T010] END

// Mark the unit parked: scopes[].implement = 'parked' for the unit and every unit it blocks.
// [SCOPE 142 / T010] BEGIN — Blocker routing: decision queue, bridge room, or pass-throu…
export function parkUnits(state, blocks) {
  const parked = [];
  for (const s of Array.isArray(state.scopes) ? state.scopes : []) {
    if (blocks.includes(s.key)) {
      s.implement = 'parked';
      s.helper = null;
      parked.push(s.key);
    }
  }
  return parked;
}
// [SCOPE 142 / T010] END

// [SCOPE 142 / T010] BEGIN — Blocker routing: decision queue, bridge room, or pass-throu…
function writeJson(path, obj) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}
// [SCOPE 142 / T010] END

// Best-effort mirror into docs/GOD-Decisions.md: one row under "## Parked". If the section is
// missing the file is left alone; G.O.D. regenerates the live view from decisionQueue.
// [SCOPE 142 / T010] BEGIN — Blocker routing: decision queue, bridge room, or pass-throu…
export function mirrorToDecisionsMd(root, item) {
  const p = join(root, DECISIONS_MD_REL);
  if (!existsSync(p)) return false;
  const lines = readFileSync(p, 'utf8').split('\n');
  const h = lines.findIndex((l) => l.startsWith('## Parked'));
  if (h < 0) return false;
  let i = h + 1;
  while (i < lines.length && !lines[i].startsWith('|---')) i++;
  if (i >= lines.length) return false;
  i++;
  while (i < lines.length && lines[i].startsWith('|')) i++;
  const cell = (s) => String(s ?? '').replace(/\|/g, '/').replace(/\r?\n/g, ' ');
  const row = `| ${item.id} | ${cell(item.unit)} | ${cell(item.command)} | ${cell(item.question)} | ${cell(item.recommendation)} | ${cell(item.why)} | ${cell((item.blocks || []).join(', '))} |`;
  lines.splice(i, 0, row);
  writeFileSync(p, lines.join('\n'), 'utf8');
  return true;
}
// [SCOPE 142 / T010] END

// ---------- room posting (narrow injected interface) ----------
//
// postToRoom(text) -> Promise<boolean>. The real Remote Session Bridge exposes no CLI or file
// interface for an outside process to post, so the default poster appends one JSON line to
// .wxai/room-outbox.jsonl. The Remote Session Bridge drains that file (wxkanban-agent/apps/
// remote-bridge/src/outbox.ts, every 2 s while connected) and posts each line to the room, so
// postedToRoom stays false here: the line is queued, delivery is confirmed by the bridge.
// [SCOPE 142 / T010] BEGIN — Blocker routing: decision queue, bridge room, or pass-throu…
export function makeOutboxPoster(root, nowIso = () => new Date().toISOString()) {
  return async (text) => {
    const p = join(root, OUTBOX_REL);
    mkdirSync(dirname(p), { recursive: true });
    appendFileSync(p, JSON.stringify({ time: nowIso(), text }) + '\n', 'utf8');
    return false; // queued for the bridge, not confirmed delivered
  };
}
// [SCOPE 142 / T010] END

// [SCOPE 142 / T010] BEGIN — Blocker routing: decision queue, bridge room, or pass-throu…
export function roomText(question, dqId) {
  const head = dqId ? `Decision needed (${dqId})` : 'Decision needed';
  return `${head}: ${question}`;
}
// [SCOPE 142 / T010] END

// ---------- logging ----------

// [SCOPE 142 / T010] BEGIN — Blocker routing: decision queue, bridge room, or pass-throu…
async function defaultLog(root, event) {
  const mod = join(HERE, 'log.mjs');
  if (existsSync(mod)) {
    const m = await import(pathToFileURL(mod).href);
    if (typeof m.logOutcome === 'function') return m.logOutcome(root, event);
  }
  // log.mjs not present yet: append the same C4 line ourselves (append only).
  const p = join(root, GATE_LOG_REL);
  mkdirSync(dirname(p), { recursive: true });
  appendFileSync(p, JSON.stringify(event) + '\n', 'utf8');
}
// [SCOPE 142 / T010] END

// ---------- the router ----------

// outcome: C4 gate outcome. ctx: { question, unit, command, recommendation, why, blocks,
// resumeAt, session, intercept, dataLoss }. deps: { now, pidAlive, postToRoom, log }.
// [SCOPE 142 / T010] BEGIN — Blocker routing: decision queue, bridge room, or pass-throu…
export async function routeBlocker(root, outcome, ctx, deps = {}) {
// [SCOPE 142 / T010] END
  const now = deps.now ?? (() => new Date().toISOString());
  if (!outcome || outcome.class !== 'blocker') {
    return { route: 'not-a-blocker', handled: false, passThrough: true };
  }
  const log = deps.log ?? defaultLog;
  const create = detectCreateRun(root);
  const session = detectLiveSession(root, deps.pidAlive);
  const decision = decideRoute({ createActive: create.active, liveSession: session.live });
  const result = { ...decision, dqId: null, parked: [], postedToRoom: false, roomQueued: false };

  if (decision.route === 'queue') {
    const state = create.state;
    state.decisionQueue = Array.isArray(state.decisionQueue) ? state.decisionQueue : [];
    const dqId = nextDqId(state.decisionQueue);
    const item = buildQueueItem(dqId, ctx, now());
    state.decisionQueue.push(item);
    result.parked = parkUnits(state, item.blocks);
    writeJson(join(root, STATE_REL), state);
    mirrorToDecisionsMd(root, item);
    result.dqId = dqId;
  }

  if (decision.alsoRoom) {
    const post = deps.postToRoom ?? makeOutboxPoster(root, now);
    try {
      result.postedToRoom = await post(roomText(ctx.question, result.dqId));
      result.roomQueued = true;
    } catch (err) {
      result.roomError = String(err && err.message ? err.message : err);
    }
  }

  await log(root, {
    time: now(),
    session: ctx.session ?? null,
    intercept: ctx.intercept ?? 'god',
    question: ctx.question,
    outcome: decision.route === 'queue' ? 'queued' : 'passed-through',
    class: 'blocker',
    ledgerId: null,
    score: outcome.score ?? null,
    route: decision.route,
    dqId: result.dqId,
    postedToRoom: result.postedToRoom,
  });
  return result;
}

// ---------- owner answer -> ledger ----------

// [SCOPE 142 / T010] BEGIN — Blocker routing: decision queue, bridge room, or pass-throu…
export function buildLedgerEntry(item, answer, rationale, dateIso) {
  return {
    scope: item.unit ?? 'unscoped',
    question: item.question,
    decision: answer,
    rationale: rationale || 'Owner answer to a parked G.O.D. question',
    kind: 'Agreed',
    evidence: 'confirmed',
    source: `docs/GOD-Decisions.md#${item.id}`,
    date: dateIso.slice(0, 10),
    supersedes: null,
  };
}
// [SCOPE 142 / T010] END

// [SCOPE 142 / T010] BEGIN — Blocker routing: decision queue, bridge room, or pass-throu…
// MODIFIED-BY: [SCOPE 144 / T010] — approved_by is the Room Approver's name when the bridge passes one
function defaultRunLedger(root, entryFile, approvedBy = 'owner') {
  const script = join(HERE, 'ledger.mjs');
  const out = execFileSync(process.execPath, [script, 'append', '--file', entryFile, '--approved-by', approvedBy, '--root', root], {
    encoding: 'utf8',
  });
  return out;
}
// [SCOPE 142 / T010] END

// Records an owner's answer for a queued item. Calls the ledger CLI; never writes the ledger.
// viaAllRecommended: true when the owner said "all recommended" - refused for data-loss items.
// approvedBy: the Room Approver's name (SPEC-144 FR-008), passed by the bridge; default "owner".
// [SCOPE 142 / T010] BEGIN — Blocker routing: decision queue, bridge room, or pass-throu…
// MODIFIED-BY: [SCOPE 144 / T010] — opts.approvedBy becomes the ledger entry's approved_by
export async function applyOwnerAnswer(root, dqId, answer, opts = {}, deps = {}) {
// [SCOPE 142 / T010] END
  const now = deps.now ?? (() => new Date().toISOString());
  const runLedger = deps.runLedger ?? defaultRunLedger;
  const state = readState(root);
  if (!state || !Array.isArray(state.decisionQueue)) return { ok: false, error: 'no decision queue' };
  const item = state.decisionQueue.find((i) => i.id === dqId);
  if (!item) return { ok: false, error: `no queue item ${dqId}` };
  if (item.status === 'answered-by-kain') return { ok: false, error: `${dqId} was answered by KAIN; review ${item.krId} instead (approve, change or reject)` };
  if (item.status !== 'open') return { ok: false, error: `${dqId} is already ${item.status}` };
  if (!answer || !String(answer).trim()) return { ok: false, error: 'empty answer' };
  if (item.dataLoss && opts.viaAllRecommended) {
    return { ok: false, error: `${dqId} is a data-loss item: "all recommended" never covers it; answer it by its own number` };
  }
  const approvedBy = typeof opts.approvedBy === 'string' && opts.approvedBy.trim() ? opts.approvedBy.trim() : 'owner';
  const dir = mkdtempSync(join(tmpdir(), 'askgate-route-'));
  const file = join(dir, 'entry.json');
  let output;
  try {
    writeFileSync(file, JSON.stringify(buildLedgerEntry(item, String(answer).trim(), opts.rationale, now())), 'utf8');
    output = runLedger(root, file, approvedBy);
  } catch (err) {
    return { ok: false, error: 'ledger append failed: ' + String(err && err.message ? err.message : err) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  const m = /D-\d{4}/.exec(String(output ?? ''));
  item.status = 'answered';
  item.answer = String(answer).trim();
  item.ledgerId = m ? m[0] : null;
  item.approvedBy = approvedBy;
  writeJson(join(root, STATE_REL), state);
  return { ok: true, dqId, ledgerId: item.ledgerId, approvedBy, releases: item.blocks ?? [], resumeAt: item.resumeAt ?? null };
}

/**
 * KAIN answered a queued item, acting as the owner (Amendment A, FR-022). The unit is released so
 * the work goes on, the answer joins the owner's review list, and the ledger is untouched: a KAIN
 * answer never answers a later question until the owner approves it. Only the bridge calls this,
 * because only the bridge knows that KAIN, not the owner, wrote the message (FR-021).
 */
// [SCOPE 142 / T024] BEGIN — KAIN reply list and the review script (FR-022, FR-023)
export async function applyKainAnswer(root, dqId, answer, { by = 'KAIN', now = () => new Date().toISOString() } = {}) {
  const state = readState(root);
  if (!state || !Array.isArray(state.decisionQueue)) return { ok: false, error: 'no decision queue' };
  const item = state.decisionQueue.find((i) => i.id === dqId);
  if (!item) return { ok: false, error: `no queue item ${dqId}` };
  if (item.status !== 'open') return { ok: false, error: `${dqId} is already ${item.status}` };
  if (!answer || !String(answer).trim()) return { ok: false, error: 'empty answer' };
  if (item.dataLoss) return { ok: false, error: `${dqId} is a data-loss item: only the owner answers it` };
  const { recordKainReply } = await import(pathToFileURL(join(HERE, 'kain.mjs')).href);
  const reply = recordKainReply(root, { dq: dqId, by, unit: item.unit, blocks: item.blocks, question: item.question, answer: String(answer), time: now() });
  item.status = 'answered-by-kain';
  item.answer = reply.answer;
  item.krId = reply.id;
  writeJson(join(root, STATE_REL), state);
  return { ok: true, dqId, krId: reply.id, ledgerId: null, releases: item.blocks ?? [], resumeAt: item.resumeAt ?? null };
}
// [SCOPE 142 / T024] END

// ---------- CLI ----------

// [SCOPE 142 / T010] BEGIN — Blocker routing: decision queue, bridge room, or pass-throu…
function parseArgs(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) o[k] = true;
      else {
        o[k] = next;
        i++;
      }
    } else o._.push(a);
  }
  return o;
}
// [SCOPE 142 / T010] END

// [SCOPE 142 / T010] BEGIN — Blocker routing: decision queue, bridge room, or pass-throu…
// MODIFIED-BY: [SCOPE 144 / T010] — answer takes --approved-by <name>
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];
  const root = resolve(typeof args.root === 'string' ? args.root : process.cwd());
  let result;
  if (cmd === 'detect') {
    const c = detectCreateRun(root);
    const s = detectLiveSession(root);
    result = { createActive: c.active, liveSession: s.live, ...decideRoute({ createActive: c.active, liveSession: s.live }) };
  } else if (cmd === 'route') {
    if (!args.question) throw new Error('--question is required');
    const ctx = {
      question: String(args.question),
      unit: args.unit,
      command: args.command,
      recommendation: args.recommendation,
      why: args.why,
      blocks: typeof args.blocks === 'string' ? args.blocks.split(',').filter(Boolean) : undefined,
      resumeAt: args.resumeAt,
      session: args.session,
      dataLoss: !!args.dataLoss,
    };
    result = await routeBlocker(root, { outcome: 'queued', class: args.class ?? 'blocker', ledgerId: null, score: null, reason: 'cli' }, ctx);
  } else if (cmd === 'answer') {
    if (!args.dq || !args.answer) throw new Error('--dq and --answer are required');
    // --by names a supervising agent (the bridge passes it for a [KAIN] post); absent means the owner.
    // --approved-by names the Room Approver who answered (SPEC-144 FR-008); absent means "owner".
    result = typeof args.by === 'string' && args.by !== 'owner'
      ? await applyKainAnswer(root, String(args.dq), String(args.answer), { by: args.by })
      : await applyOwnerAnswer(root, String(args.dq), String(args.answer), {
        rationale: typeof args.rationale === 'string' ? args.rationale : undefined,
        viaAllRecommended: !!args.allRecommended,
        approvedBy: typeof args['approved-by'] === 'string' ? args['approved-by'] : undefined,
      });
  } else {
    throw new Error('usage: route.mjs detect|route|answer [--root <dir>] ...');
  }
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  if (result && result.ok === false) process.exitCode = 1;
}
// [SCOPE 142 / T010] END

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((err) => {
    process.stderr.write(String(err && err.message ? err.message : err) + '\n');
    process.exitCode = 2;
  });
}
