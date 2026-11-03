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
// Where it sends (T025): env WXAI_AGENTRUNS_URL / WXAI_AGENTRUNS_TOKEN / WXAI_PROJECT_ID when set,
// otherwise this machine's token store (~/.wxai/agentrun-tokens.json, written by kit:configure; see
// token-store.mjs), found by the project folder. Never a project file. With no URL or no token nothing
// is sent (exit 0). No line this prints ever contains the token.
//
// Run by forward-hook.mjs, detached, on Stop and SessionStart (install.mjs).

import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { findForRoot, DEFAULT_AGENTRUNS_URL } from './token-store.mjs';

export const LOG_REL = join('decisions', 'agentrun-log.jsonl');
export const FORWARDED_REL = join('decisions', 'agentrun-forwarded.txt');
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
      last = { ok: false, status: res.status };
      if (res.status < 500 && res.status !== 429) return last; // permanent for this record
    } catch {
      last = { ok: false, status: 0 }; // the error text is not kept: it is never logged with a token near it
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

/** @returns {Promise<{skipped?: string, sent: number, rejected: number, failed: number, pending: number}>} */
export async function forward({ root, url, token, projectid, retries = 3, baseDelayMs = 500, storeFile } = {}) {
  if (url === undefined) {
    const t = resolveTarget(root, { storeFile });
    url = t.url;
    token = token ?? t.token;
    projectid = projectid ?? t.projectid;
  }
  if (!url) return { skipped: 'No agent-runs URL or project token on this machine; run kit:configure. Nothing forwarded.', sent: 0, rejected: 0, failed: 0, pending: 0 };
  const release = takeLock(root);
  if (!release) return { skipped: 'Another forward is running for this project.', sent: 0, rejected: 0, failed: 0, pending: 0 };
  try {
    const logFile = join(root, LOG_REL);
    const doneFile = join(root, FORWARDED_REL);
    const done = readIds(doneFile);
    const records = [];
    if (existsSync(logFile)) {
      for (const l of readFileSync(logFile, 'utf8').split('\n')) {
        if (!l.trim()) continue;
        try { const r = JSON.parse(l); if (r?.id && !done.has(r.id)) records.push(r); } catch { /* skip */ }
      }
    }
    const fill = projectid || null;
    let sent = 0, rejected = 0, failed = 0;
    for (const r of records) {
      const body = r.projectid || !fill ? r : { ...r, projectid: fill };
      const res = await post(url, token, body, { retries, baseDelayMs });
      if (res.ok) {
        mkdirSync(dirname(doneFile), { recursive: true });
        appendFileSync(doneFile, r.id + '\n', 'utf8');
        sent++;
      } else if (res.status >= 400 && res.status < 500 && res.status !== 429) rejected++;
      else failed++;
    }
    return { sent, rejected, failed, pending: rejected + failed };
  } finally {
    release();
  }
}

async function main(argv) {
  const i = argv.indexOf('--root');
  const root = resolve(i >= 0 && argv[i + 1] ? argv[i + 1] : process.cwd());
  const d = argv.indexOf('--delay');
  const delay = d >= 0 ? Number(argv[d + 1]) : 0;
  if (Number.isFinite(delay) && delay > 0) await sleep(Math.min(delay, 30_000));
  const r = await forward({ root });
  process.stdout.write((r.skipped ?? `Forwarded ${r.sent}; rejected ${r.rejected}; failed ${r.failed}.`) + '\n');
  process.exit(0);
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('_wxAI/routing/forward.mjs')) main(process.argv.slice(2));
