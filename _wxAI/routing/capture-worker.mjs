#!/usr/bin/env node
// Agent run capture worker (SPEC-143 FR-003, contract C1). Plain Node ESM, no dependencies.
//
// Started DETACHED by capture-hook.mjs, never inside a hook's own time limit. It reads a Claude Code
// transcript (JSONL), builds C1 run records and appends them to decisions/agentrun-log.jsonl.
//
// Data sources (proven by the T001 spike, specs/143-agent-model-routing-metering/spike-hooks.md):
//   - one subagent  : its own agent transcript (SubagentStop.agent_transcript_path)  -> kind "subagent"
//   - one main turn : the session transcript, split at each real user prompt        -> kind "session",
//                     or kind "command" when the prompt that opened the turn was a slash command.
//   The main transcript excludes subagent messages, so nothing is counted twice.
//
// Rules:
//   - Tokens come from lines with type "assistant": message.usage.{input_tokens, output_tokens,
//     cache_read_input_tokens, cache_creation_input_tokens}, deduplicated by message.id (one reply is
//     written as several lines that repeat the same usage). "<synthetic>" messages are skipped.
//   - model = the model that served the most output tokens in the run, read from message.model only
//     (never from anything the model says about itself). Tokens of all models in a run are summed
//     into the one record (a run with two models is rare; the dominant one is named).
//   - ACTIVE / WAITING RULE (SPEC-143 T036, FR-025, Amendment C): take the timestamps of the run's
//     transcript lines in order. A gap counts as waiting only when it follows an assistant line that
//     called the AskUserQuestion tool — the model is blocked on a person's answer (a question, or an
//     approval gate, which in this CLI is also asked through AskUserQuestion). Every other gap counts
//     as active, however long — a long-running tool call or subagent is still the agent working, not
//     waiting. So activeseconds + waitingseconds equals wall time (last minus first line) to the
//     second. Values are integer seconds. (Superseded the at-most-2-minutes rule from Amendment B,
//     which wrongly counted a long tool call as waiting.)
//   - Idempotent: the id is a UUID derived from session id + agent id (or turn index), and an id
//     already in the log is never written again.
//   - No prompt text, code or file contents are stored: only ids, a command name, numbers, times.
//   - difficulty stays null here; G.O.D. fills it later through the tier resolver.
//   - taskid (SPEC-143 T037, FR-026): read from the active-task side channel by session id —
//     the /implement (and G.O.D.) slash command sets it just before launching a subagent for a
//     known task and clears it when that task finishes; a session with no active task gets null.
//   - Never uses Claude Code telemetry (it carries the user's email and org ids).

import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { getActiveTask } from './active-task.mjs';

export const LOG_REL = join('decisions', 'agentrun-log.jsonl');
/** The only tool whose pending reply counts as waiting on a person (FR-025, Amendment C). */
export const WAITING_TOOL = 'AskUserQuestion';
const LABEL = /^[A-Za-z0-9._:/@-]{1,100}$/;

// [SCOPE 143 / T036] BEGIN — a line is "asking a person" when it called the waiting tool (FR-025)
function asksPerson(line) {
  if (line?.type !== 'assistant') return false;
  const content = line.message?.content;
  return Array.isArray(content) && content.some((b) => b?.type === 'tool_use' && b.name === WAITING_TOOL);
}
// [SCOPE 143 / T036] END

/** Deterministic UUID (version 8 layout) from a string key. */
export function deterministicId(key) {
  const h = createHash('sha256').update(key).digest();
  h[6] = (h[6] & 0x0f) | 0x80;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

export function parseLines(path) {
  const out = [];
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* a half-written last line */ }
  }
  return out;
}

/** Summarize a list of transcript lines: per-model tokens, wall/active/waiting, times. */
export function summarize(lines) {
  const byMsg = new Map();
  const stamps = [];
  for (const r of lines) {
    const t = r?.timestamp ? Date.parse(r.timestamp) : NaN;
    if (!Number.isNaN(t)) stamps.push({ t, asksPerson: asksPerson(r) });
    if (r?.type !== 'assistant' || !r.message?.usage || r.message.model === '<synthetic>') continue;
    byMsg.set(r.message.id ?? r.uuid, { model: r.message.model, u: r.message.usage });
  }
  const models = {};
  for (const { model, u } of byMsg.values()) {
    const m = (models[model] ??= { requests: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
    m.requests++;
    m.input += u.input_tokens ?? 0;
    m.output += u.output_tokens ?? 0;
    m.cacheRead += u.cache_read_input_tokens ?? 0;
    m.cacheWrite += u.cache_creation_input_tokens ?? 0;
  }
  // [SCOPE 143 / T036] BEGIN — a gap is waiting only when it follows a question to a person (FR-025)
  let active = 0;
  let waiting = 0;
  for (let i = 1; i < stamps.length; i++) {
    const gap = Math.max(0, stamps[i].t - stamps[i - 1].t);
    if (stamps[i - 1].asksPerson) waiting += gap; else active += gap;
  }
  // [SCOPE 143 / T036] END
  const times = stamps.map((s) => s.t);
  const start = times.length ? Math.min(...times) : null;
  const end = times.length ? Math.max(...times) : null;
  return { models, start, end, activems: active, waitingms: waiting };
}

function toRecord(sum, extra) {
  const names = Object.keys(sum.models);
  if (!names.length || sum.start === null) return null; // nothing was served: no record
  const model = names.reduce((a, b) => (sum.models[b].output > sum.models[a].output ? b : a));
  const all = Object.values(sum.models);
  const total = (k) => all.reduce((n, m) => n + m[k], 0);
  const claude = /^claude-/.test(model);
  return {
    id: extra.id,
    projectid: extra.projectid ?? null,
    aispecsessionid: null,
    taskid: extra.taskid ?? null,
    command: extra.command ?? null,
    kind: extra.kind,
    difficulty: null,
    model: LABEL.test(model) ? model : null,
    provider: claude ? 'anthropic-subscription' : null,
    route: claude ? 'official' : null,
    inputtokens: total('input'),
    outputtokens: total('output'),
    cachereadtokens: total('cacheRead'),
    cachewritetokens: total('cacheWrite'),
    activeseconds: Math.round(sum.activems / 1000),
    waitingseconds: Math.round(sum.waitingms / 1000),
    escalated: false,
    comparisonid: null,
    starttime: new Date(sum.start).toISOString(),
    endtime: new Date(sum.end).toISOString(),
  };
}

export function buildSubagentRecord({ sessionId, agentId, agentType, transcriptPath, projectid, taskid }) {
  if (!transcriptPath || !existsSync(transcriptPath)) return null;
  const command = typeof agentType === 'string' && LABEL.test(agentType) ? agentType : null;
  return toRecord(summarize(parseLines(transcriptPath)), {
    id: deterministicId(`${sessionId}|subagent|${agentId}`), kind: 'subagent', command, projectid, taskid,
  });
}

function turnStart(r) {
  if (r?.type !== 'user' || r.isMeta || r.isSidechain || r.isCompactSummary) return null;
  const c = r.message?.content;
  let text = null;
  if (typeof c === 'string') text = c;
  else if (Array.isArray(c) && !c.some((p) => p?.type === 'tool_result')) {
    text = c.filter((p) => p?.type === 'text').map((p) => p.text ?? '').join('\n');
  }
  if (text === null || text.startsWith('<local-command-')) return null;
  const m = /<command-name>\s*\/?([^<\s]+)\s*<\/command-name>/.exec(text);
  const name = m && LABEL.test(m[1]) ? m[1] : null;
  return { command: name };
}

/** One record per main-session turn (a turn starts at a real user prompt). */
export function buildSessionRecords({ sessionId, transcriptPath, projectid, taskid }) {
  if (!transcriptPath || !existsSync(transcriptPath)) return [];
  const turns = [];
  for (const r of parseLines(transcriptPath)) {
    if (r?.isSidechain) continue;
    const s = turnStart(r);
    if (s) turns.push({ command: s.command, lines: [r] });
    else if (turns.length) turns[turns.length - 1].lines.push(r);
  }
  const out = [];
  turns.forEach((t, i) => {
    const rec = toRecord(summarize(t.lines), {
      id: deterministicId(`${sessionId}|turn|${i}`), kind: t.command ? 'command' : 'session', command: t.command, projectid, taskid,
    });
    if (rec) out.push(rec);
  });
  return out;
}

export function readProjectId(root) {
  const env = process.env.WXAI_PROJECT_ID;
  if (env && /^[0-9a-f-]{36}$/i.test(env)) return env;
  try {
    const p = JSON.parse(readFileSync(join(root, '.wxai', 'project.json'), 'utf8'));
    const v = p.projectId ?? p.projectid ?? null;
    return typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v) ? v : null;
  } catch { return null; }
}

function sleepMs(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }

// [SCOPE 143 / T039] BEGIN — pid-liveness lock so two writers never run fn() at once (FR-028)
//
// The prior lock gave up waiting after 8s and proceeded WITHOUT the lock, and treated any holder
// older than 10s as "stale" and force-removed it — both let a second writer start fn() while the
// first was still inside it, which is exactly the interleaved/lost-line failure FR-028 forbids.
// Fix: a lock is only ever reclaimed once its owning pid is verifiably dead (process.kill(pid, 0)
// throws ESRCH), never on a fixed timer. A holder that is merely slow keeps the lock no matter how
// long it runs. There is no give-up path: a waiter blocks until it owns the lock.
function isLockStale(lock) {
  let pid;
  try { pid = Number(readFileSync(join(lock, 'pid'), 'utf8')); } catch { return false; } // mid-creation; not stale
  if (!pid) return false;
  try { process.kill(pid, 0); return false; } catch { return true; } // ESRCH: owner is dead
}

function withLock(root, fn) {
  const lock = join(root, 'decisions', '.agentrun-log.lock');
  mkdirSync(dirname(lock), { recursive: true });
  for (;;) {
    try {
      mkdirSync(lock);
      writeFileSync(join(lock, 'pid'), String(process.pid), 'utf8');
      break;
    } catch {
      if (isLockStale(lock)) { try { rmSync(lock, { recursive: true, force: true }); } catch { /* raced with the real owner finishing */ } continue; }
      sleepMs(50);
    }
  }
  try { return fn(); } finally { rmSync(lock, { recursive: true, force: true }); }
}
// [SCOPE 143 / T039] END

/** Append records whose id is not yet in the log. Returns the records actually written. */
export function appendRecords(root, records) {
  if (!records.length) return [];
  return withLock(root, () => {
    const file = join(root, LOG_REL);
    mkdirSync(dirname(file), { recursive: true });
    const seen = new Set();
    if (existsSync(file)) {
      for (const l of readFileSync(file, 'utf8').split('\n')) {
        if (!l.trim()) continue;
        try { seen.add(JSON.parse(l).id); } catch { /* skip */ }
      }
    }
    const fresh = records.filter((r) => !seen.has(r.id));
    if (fresh.length) appendFileSync(file, fresh.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
    return fresh;
  });
}

/** Handle one hook payload (already reduced to the fields below by capture-hook.mjs). */
export function capture(p) {
  const root = p.root;
  const projectid = readProjectId(root);
  const taskid = getActiveTask(root, p.sessionId); // SPEC-143 T037, FR-026
  const event = p.event;
  let records = [];
  if (event === 'SubagentStop') {
    const r = buildSubagentRecord({ sessionId: p.sessionId, agentId: p.agentId, agentType: p.agentType, transcriptPath: p.agentTranscriptPath, projectid, taskid });
    if (r) records = [r];
  } else if (event === 'PostToolUse') {
    // Backstop for a missed SubagentStop: derive the sidecar transcript path. Completed agents only.
    if (p.status === 'completed' && p.agentId && p.transcriptPath && p.sessionId) {
      const path = join(dirname(p.transcriptPath), p.sessionId, 'subagents', `agent-${p.agentId}.jsonl`);
      const r = buildSubagentRecord({ sessionId: p.sessionId, agentId: p.agentId, agentType: p.agentType, transcriptPath: path, projectid, taskid });
      if (r) records = [r];
    }
  } else if (event === 'Stop') {
    records = buildSessionRecords({ sessionId: p.sessionId, transcriptPath: p.transcriptPath, projectid, taskid });
  }
  return appendRecords(root, records);
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('_wxAI/routing/capture-worker.mjs') && process.argv[2]) {
  try {
    const p = JSON.parse(Buffer.from(process.argv[2], 'base64').toString('utf8'));
    sleepMs(p.delayMs ?? 1000); // let the CLI finish flushing the transcript
    capture(p);
  } catch { /* a capture failure must never surface to the developer */ }
}
