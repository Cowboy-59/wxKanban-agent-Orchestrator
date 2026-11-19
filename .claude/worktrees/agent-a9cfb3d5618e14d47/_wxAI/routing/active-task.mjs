#!/usr/bin/env node
// Active-task side channel (SPEC-143 T037, FR-026). Plain Node ESM, no dependencies.
//
// The /implement and G.O.D. slash commands know, as plain text, which task id a subagent
// they are about to launch is working on -- but Claude Code's own hook payloads never carry
// a task id (capture-hook.mjs's reduced JSON has no such field). This file is the side
// channel: the main session records "this session is currently on task X" just before
// launching a subagent, capture-worker.mjs reads it back by session id when building that
// subagent's (or the main session's own) C1 record, and the command clears it when the task
// finishes. Entries older than STALE_MS are ignored and pruned on the next write, so a session
// that crashes without clearing never misattributes a later, unrelated task.
//
// No prompt text, code or file contents are stored: only a session id and a task id.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const STATE_REL = join('decisions', 'active-task.json');
const STALE_MS = 24 * 60 * 60 * 1000; // 24h: generous for a long implement run, never crosses into a later one
const LABEL = /^[A-Za-z0-9._:/@-]{1,100}$/;

function statePath(root) { return join(root, STATE_REL); }

function readState(root) {
  try {
    const raw = JSON.parse(readFileSync(statePath(root), 'utf8'));
    return raw && typeof raw === 'object' ? raw : {};
  } catch { return {}; }
}

function writeState(root, state) {
  const now = Date.now();
  const pruned = {};
  for (const [sessionId, entry] of Object.entries(state)) {
    if (entry && typeof entry.setAt === 'number' && now - entry.setAt < STALE_MS) pruned[sessionId] = entry;
  }
  const file = statePath(root);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(pruned), 'utf8');
}

// [SCOPE 143 / T037] BEGIN — active-task side channel: set/clear/read by session id (FR-026)
/** Record that `sessionId` is currently working on `taskid` (call before launching a subagent). */
export function setActiveTask(root, sessionId, taskid) {
  if (!sessionId || !taskid || !LABEL.test(taskid)) return;
  const state = readState(root);
  state[sessionId] = { taskid, setAt: Date.now() };
  writeState(root, state);
}

/** Clear `sessionId`'s active task (call when the task finishes, whether it succeeds or fails). */
export function clearActiveTask(root, sessionId) {
  if (!sessionId) return;
  const state = readState(root);
  if (state[sessionId]) {
    delete state[sessionId];
    writeState(root, state);
  }
}

/** The task id `sessionId` is currently on, or null if none is set or it has gone stale. */
export function getActiveTask(root, sessionId) {
  if (!sessionId) return null;
  const entry = readState(root)[sessionId];
  if (!entry || typeof entry.setAt !== 'number' || Date.now() - entry.setAt >= STALE_MS) return null;
  return typeof entry.taskid === 'string' && LABEL.test(entry.taskid) ? entry.taskid : null;
}
// [SCOPE 143 / T037] END

// [SCOPE 143 / T037] BEGIN — CLI: --set/--clear/--get, used by /implement and /wxG-O-D (FR-026)
if (process.argv[1]?.replace(/\\/g, '/').endsWith('_wxAI/routing/active-task.mjs')) {
  const args = process.argv.slice(2);
  const arg = (name) => { const i = args.indexOf(name); return i === -1 ? null : args[i + 1] ?? null; };
  const root = arg('--root') ?? process.cwd();
  const sessionId = arg('--session');
  if (args.includes('--clear')) {
    clearActiveTask(root, sessionId);
  } else if (args.includes('--get')) {
    const taskid = getActiveTask(root, sessionId);
    process.stdout.write(`${taskid ?? ''}\n`);
  } else {
    const taskid = arg('--set');
    if (taskid) setActiveTask(root, sessionId, taskid);
  }
}
// [SCOPE 143 / T037] END
