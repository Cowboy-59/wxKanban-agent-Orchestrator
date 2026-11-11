#!/usr/bin/env node
// Forward local run records to the server (SPEC-143 T006, T025, FR-003/FR-014). Plain Node ESM, no dependencies.
//
//   node _wxAI/routing/forward.mjs [--root <dir>] [--delay <ms>]
//
// Reads decisions/agentrun-log.jsonl and POSTs every record whose id is not yet in
// decisions/agentrun-forwarded.txt to POST /api/consultant-hub/agent-runs. An accepted record (2xx, or
// 409 = already there) has its id appended to the forwarded file, so it is never sent twice. Network
// errors, 429 and 5xx are retried with backoff and otherwise left for the next session; any other 4xx
// rejects that record for this run (it stays unforwarded) and is counted, so a record the server cannot
// take never blocks the rest.
//
// Project resolution (SPEC-143 T033, FR-022): a record carrying a taskid is sent as-is — the server
// resolves its project from the task. A record with neither a taskid nor its own projectid takes this
// machine's token-bound project when one is stored; with no task, no projectid and no token project,
// it is never even posted — it is held, counted separately from rejected/failed, and tried again next
// run (nothing here can resolve it on its own; an operator giving it a task or a token does).
//
// Where it sends (T025): env WXAI_AGENTRUNS_URL / WXAI_AGENTRUNS_TOKEN / WXAI_PROJECT_ID when set,
// otherwise this machine's token store (~/.wxai/agentrun-tokens.json, written by kit:configure; see
// token-store.mjs), found by the project folder. Never a project file. With no URL or no token nothing
// is sent (exit 0). No line this prints ever contains the token.
//
// Run by forward-hook.mjs, detached, on Stop and SessionStart (install.mjs).

import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { findForRoot, DEFAULT_AGENTRUNS_URL } from './token-store.mjs';
import { logEvent } from './log.mjs';

export const LOG_REL = join('decisions', 'agentrun-log.jsonl');
export const FORWARDED_REL = join('decisions', 'agentrun-forwarded.txt');
export const REJECTED_REL = join('decisions', 'agentrun-rejected.jsonl');
export const LOCK_REL = join('decisions', 'agentrun-forward.lock');
/** A lock older than this is from a forward that died; it is taken over. */
const STALE_LOCK_MS = 10 * 60 * 1000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readIds(file) {
  return existsSync(file) ? new Set(readFileSync(file, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean)) : new Set();
}

async function post(url, token, body, { retries, baseDelayMs }) {
  let last = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt) await sleep(baseDelayMs * 2 ** (attempt - 1));
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
      });
      if (res.ok || res.status === 409) return { ok: true, status: res.status };
      // [SCOPE 143 / T034] BEGIN — a generic, token-free reason for the rejected ledger and audit log (FR-023)
      let reason = `HTTP ${res.status}`;
      try {
        const j = await res.json();
        if (j && typeof j.error === 'string') reason = j.error;
      } catch { /* non-JSON or empty body: keep the generic reason */ }
      last = { ok: false, status: res.status, reason };
      // [SCOPE 143 / T034] END
      if (res.status < 500 && res.status !== 429) return last; // permanent for this record
    } catch {
      last = { ok: false, status: 0, reason: 'network error' }; // the error text is not kept: it is never logged with a token near it
    }
  }
  return last;
}

// [SCOPE 143 / T025] BEGIN — where to send: env first, then this machine's token store (FR-003, FR-018)
/** { url, token, projectid, source } — source is 'env', 'store' or null when nothing is configured. */
export function resolveTarget(root, { env = process.env, storeFile } = {}) {
  if (env.WXAI_AGENTRUNS_URL) {
    return { url: env.WXAI_AGENTRUNS_URL, token: env.WXAI_AGENTRUNS_TOKEN || null, projectid: env.WXAI_PROJECT_ID || null, source: 'env' };
  }
  const entry = storeFile ? findForRoot(root, storeFile) : findForRoot(root);
  if (entry) return { url: entry.url || DEFAULT_AGENTRUNS_URL, token: entry.token, projectid: entry.projectid, source: 'store' };
  return { url: null, token: null, projectid: null, source: null };
}
// [SCOPE 143 / T025] END

// [SCOPE 143 / T025] BEGIN — one forward at a time per project (Stop and SessionStart can overlap)
function takeLock(root) {
  const file = join(root, LOCK_REL);
  mkdirSync(dirname(file), { recursive: true });
  try {
    writeFileSync(file, String(process.pid), { flag: 'wx' });
    return () => rmSync(file, { force: true });
  } catch {
    try {
      if (Date.now() - statSync(file).mtimeMs > STALE_LOCK_MS) {
        writeFileSync(file, String(process.pid));
        return () => rmSync(file, { force: true });
      }
    } catch { /* vanished between the two checks: let the other forward finish */ }
    return null;
  }
}
// [SCOPE 143 / T025] END

// [SCOPE 143 / T034] BEGIN — a permanently-rejected id is never retried except by the T038 re-send script (FR-023)
function readRejectedIds(file) {
  if (!existsSync(file)) return new Set();
  const ids = new Set();
  for (const l of readFileSync(file, 'utf8').split('\n')) {
    if (!l.trim()) continue;
    try { const r = JSON.parse(l); if (r?.id) ids.add(r.id); } catch { /* skip */ }
  }
  return ids;
}
// [SCOPE 143 / T034] END

/** Records in the log, minus those already forwarded or permanently rejected, split by what this run can do with them. */
function loadPending(root) {
  const logFile = join(root, LOG_REL);
  const doneFile = join(root, FORWARDED_REL);
  const rejectedFile = join(root, REJECTED_REL);
  const done = readIds(doneFile);
  const rejected = readRejectedIds(rejectedFile);
  const records = [];
  if (existsSync(logFile)) {
    for (const l of readFileSync(logFile, 'utf8').split('\n')) {
      if (!l.trim()) continue;
      try { const r = JSON.parse(l); if (r?.id && !done.has(r.id) && !rejected.has(r.id)) records.push(r); } catch { /* skip */ }
    }
  }
  return { records, doneFile, rejectedFile, rejectedCount: rejected.size };
}

// [SCOPE 143 / T033] BEGIN — a record with neither a project nor a task is held, never sent (FR-022)
/** @returns {{sendable: object[], held: number}} */
function splitHeld(records, fill) {
  const sendable = [];
  let held = 0;
  for (const r of records) {
    if (r.taskid || r.projectid || fill) sendable.push(r);
    else held++;
  }
  return { sendable, held };
}

/**
 * Read-only: how many records are waiting and how many of them are held, with no network call.
 * Used by kit:status (`forward.mjs --stats`) to surface "held" without risking a send.
 */
export function readPendingStats(root, { storeFile } = {}) {
  const { projectid } = resolveTarget(root, { storeFile });
  const { records, rejectedCount } = loadPending(root);
  const { held } = splitHeld(records, projectid || null);
  return { pending: records.length, held, rejected: rejectedCount };
}
// [SCOPE 143 / T033] END

/** @returns {Promise<{skipped?: string, sent: number, rejected: number, failed: number, held: number, pending: number, rejectedTotal: number}>} */
export async function forward({ root, url, token, projectid, retries = 3, baseDelayMs = 500, storeFile } = {}) {
  if (url === undefined) {
    const t = resolveTarget(root, { storeFile });
    url = t.url;
    token = token ?? t.token;
    projectid = projectid ?? t.projectid;
  }
  if (!url) return { skipped: 'No agent-runs URL or project token on this machine; run kit:configure. Nothing forwarded.', sent: 0, rejected: 0, failed: 0, held: 0, pending: 0, rejectedTotal: readPendingStats(root, { storeFile }).rejected };
  const release = takeLock(root);
  if (!release) return { skipped: 'Another forward is running for this project.', sent: 0, rejected: 0, failed: 0, held: 0, pending: 0, rejectedTotal: readPendingStats(root, { storeFile }).rejected };
  try {
    const { records, doneFile, rejectedFile, rejectedCount: alreadyRejected } = loadPending(root);
    const fill = projectid || null;
    // [SCOPE 143 / T033] BEGIN — a taskid-bearing record is sent as-is; the server resolves its
    // project. Only a record with neither a taskid nor its own projectid takes the token's project,
    // and only when there is one; otherwise it is held, never posted (FR-022).
    const { sendable, held } = splitHeld(records, fill);
    let sent = 0, rejected = 0, failed = 0;
    for (const r of sendable) {
      const body = r.taskid || r.projectid || !fill ? r : { ...r, projectid: fill };
      // [SCOPE 143 / T033] END
      const res = await post(url, token, body, { retries, baseDelayMs });
      if (res.ok) {
        mkdirSync(dirname(doneFile), { recursive: true });
        appendFileSync(doneFile, r.id + '\n', 'utf8');
        sent++;
      } else if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        // [SCOPE 143 / T034] BEGIN — permanent 4xx: ledger it so it is never retried except by the
        // T038 re-send script, and record it in the routing audit log (SOC2 CC7.2, FR-023)
        rejected++;
        mkdirSync(dirname(rejectedFile), { recursive: true });
        appendFileSync(rejectedFile, JSON.stringify({ id: r.id, status: res.status, reason: res.reason ?? null, rejectedat: new Date().toISOString() }) + '\n', 'utf8');
        try {
          logEvent(root, { event: 'agentrun-rejected', command: 'agent-runs', reason: `HTTP ${res.status}: ${res.reason ?? 'rejected'}` });
        } catch { /* the audit log must never block forwarding */ }
        // [SCOPE 143 / T034] END
      } else failed++;
    }
    return { sent, rejected, failed, held, pending: failed + held, rejectedTotal: alreadyRejected + rejected };
  } finally {
    release();
  }
}

// [SCOPE 143 / T033] BEGIN — `--stats` reads pending/held counts with no network call, for kit:status
async function main(argv) {
  const i = argv.indexOf('--root');
  const root = resolve(i >= 0 && argv[i + 1] ? argv[i + 1] : process.cwd());
  if (argv.includes('--stats')) {
    process.stdout.write(JSON.stringify(readPendingStats(root)) + '\n');
    process.exit(0);
  }
  const d = argv.indexOf('--delay');
  const delay = d >= 0 ? Number(argv[d + 1]) : 0;
  if (Number.isFinite(delay) && delay > 0) await sleep(Math.min(delay, 30_000));
  const r = await forward({ root });
  process.stdout.write((r.skipped ?? `Forwarded ${r.sent}; rejected ${r.rejected} (${r.rejectedTotal} total); failed ${r.failed}; held ${r.held}.`) + '\n');
  process.exit(0);
}
// [SCOPE 143 / T033] END

if (process.argv[1]?.replace(/\\/g, '/').endsWith('_wxAI/routing/forward.mjs')) main(process.argv.slice(2));
