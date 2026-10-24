#!/usr/bin/env node
// Forward local run records to the server (SPEC-143 T006, FR-003/FR-014). Plain Node ESM, no dependencies.
//
//   node _wxAI/routing/forward.mjs [--root <dir>]
//
// Reads decisions/agentrun-log.jsonl and POSTs every record whose id is not yet in
// decisions/agentrun-forwarded.txt to env WXAI_AGENTRUNS_URL (POST /api/consultant-hub/agent-runs),
// with the bearer token in env WXAI_AGENTRUNS_TOKEN. An accepted record (2xx, or 409 = already there)
// has its id appended to the forwarded file. Network errors, 429 and 5xx are retried with backoff;
// any other 4xx rejects that record for this run (it stays unforwarded) and is counted, so a record the
// server cannot take (for example no project id or difficulty yet) never blocks the rest.
// WXAI_PROJECT_ID, when set, fills a null projectid. With the URL unset nothing happens (exit 0).

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export const LOG_REL = join('decisions', 'agentrun-log.jsonl');
export const FORWARDED_REL = join('decisions', 'agentrun-forwarded.txt');

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
    } catch (e) {
      last = { ok: false, status: 0, error: e instanceof Error ? e.message : String(e) };
    }
  }
  return last;
}

/** @returns {Promise<{skipped?: string, sent: number, rejected: number, failed: number, pending: number}>} */
export async function forward({ root, url = process.env.WXAI_AGENTRUNS_URL, token = process.env.WXAI_AGENTRUNS_TOKEN, retries = 3, baseDelayMs = 500 } = {}) {
  if (!url) return { skipped: 'WXAI_AGENTRUNS_URL is not set; nothing forwarded.', sent: 0, rejected: 0, failed: 0, pending: 0 };
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
  const projectid = process.env.WXAI_PROJECT_ID || null;
  let sent = 0, rejected = 0, failed = 0;
  for (const r of records) {
    const body = r.projectid || !projectid ? r : { ...r, projectid };
    const res = await post(url, token, body, { retries, baseDelayMs });
    if (res.ok) {
      mkdirSync(dirname(doneFile), { recursive: true });
      appendFileSync(doneFile, r.id + '\n', 'utf8');
      sent++;
    } else if (res.status >= 400 && res.status < 500 && res.status !== 429) rejected++;
    else failed++;
  }
  return { sent, rejected, failed, pending: rejected + failed };
}

async function main(argv) {
  const i = argv.indexOf('--root');
  const root = resolve(i >= 0 && argv[i + 1] ? argv[i + 1] : process.cwd());
  const r = await forward({ root });
  process.stdout.write((r.skipped ?? `Forwarded ${r.sent}; rejected ${r.rejected}; failed ${r.failed}.`) + '\n');
  process.exit(0);
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('_wxAI/routing/forward.mjs')) main(process.argv.slice(2));
