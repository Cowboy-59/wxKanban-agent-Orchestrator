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
//   - ACTIVE / WAITING RULE: take the timestamps of the run's transcript lines in order. Each gap
//     between two consecutive lines of at most 2 minutes counts as active time; a longer gap counts
//     as waiting time. So activeseconds + waitingseconds equals wall time (last minus first line)
//     to the second. Values are integer seconds (C1 amendment B).
//   - Idempotent: the id is a UUID derived from session id + agent id (or turn index), and an id
//     already in the log is never written again.
//   - No prompt text, code or file contents are stored: only ids, a command name, numbers, times.
//   - difficulty and taskid stay null here; G.O.D. fills them later through the tier resolver.
//   - Never uses Claude Code telemetry (it carries the user's email and org ids).

import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';

export const LOG_REL = join('decisions', 'agentrun-log.jsonl');
export const ACTIVE_GAP_MS = 2 * 60 * 1000;
const LABEL = /^[A-Za-z0-9._:/@-]{1,100}$/;

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
    if (!Number.isNaN(t)) stamps.push(t);
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
  let active = 0;
  let waiting = 0;
  for (let i = 1; i < stamps.length; i++) {
    const gap = Math.max(0, stamps[i] - stamps[i - 1]);
    if (gap <= ACTIVE_GAP_MS) active += gap; else waiting += gap;
  }
  const start = stamps.length ? Math.min(...stamps) : null;
  const end = stamps.length ? Math.max(...stamps) : null;
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
    taskid: null,
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

export function buildSubagentRecord({ sessionId, agentId, agentType, transcriptPath, projectid }) {
  if (!transcriptPath || !existsSync(transcriptPath)) return null;
  const command = typeof agentType === 'string' && LABEL.test(agentType) ? agentType : null;
  return toRecord(summarize(parseLines(transcriptPath)), {
    id: deterministicId(`${sessionId}|subagent|${agentId}`), kind: 'subagent', command, projectid,
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
export function buildSessionRecords({ sessionId, transcriptPath, projectid }) {
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
      id: deterministicId(`${sessionId}|turn|${i}`), kind: t.command ? 'command' : 'session', command: t.command, projectid,
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

function withLock(root, fn) {
  const lock = join(root, 'decisions', '.agentrun-log.lock');
  mkdirSync(dirname(lock), { recursive: true });
  const until = Date.now() + 8000;
  for (;;) {
    try { mkdirSync(lock); break; } catch {
      try { if (Date.now() - statSync(lock).mtimeMs > 10000) rmSync(lock, { recursive: true, force: true }); } catch { /* gone */ }
      if (Date.now() > until) break; // give up waiting; the id check below still protects most races
      sleepMs(50);
    }
  }
  try { return fn(); } finally { rmSync(lock, { recursive: true, force: true }); }
}

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
  const event = p.event;
  let records = [];
  if (event === 'SubagentStop') {
    const r = buildSubagentRecord({ sessionId: p.sessionId, agentId: p.agentId, agentType: p.agentType, transcriptPath: p.agentTranscriptPath, projectid });
    if (r) records = [r];
  } else if (event === 'PostToolUse') {
    // Backstop for a missed SubagentStop: derive the sidecar transcript path. Completed agents only.
    if (p.status === 'completed' && p.agentId && p.transcriptPath && p.sessionId) {
      const path = join(dirname(p.transcriptPath), p.sessionId, 'subagents', `agent-${p.agentId}.jsonl`);
      const r = buildSubagentRecord({ sessionId: p.sessionId, agentId: p.agentId, agentType: p.agentType, transcriptPath: path, projectid });
      if (r) records = [r];
    }
  } else if (event === 'Stop') {
    records = buildSessionRecords({ sessionId: p.sessionId, transcriptPath: p.transcriptPath, projectid });
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
