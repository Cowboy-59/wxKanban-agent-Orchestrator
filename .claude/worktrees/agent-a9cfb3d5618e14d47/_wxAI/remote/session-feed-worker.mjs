#!/usr/bin/env node
// [SCOPE 155 / T002] BEGIN — session-feed worker (FR-002, SCOPE-132 Amendment G piece A)
//
// Started DETACHED by session-feed-hook.mjs, never inside the hook's own time budget. Reads the
// Stop hook's transcript JSONL, takes the last assistant turn's text, masks it (first pass — a
// second pass happens before upload, per T003), caps it, and appends one line to
// .wxai/session-feed.jsonl, capping that file at 200 lines (oldest dropped first).
//
// Must never throw uncaught, never touch .remember/ files, and never read or write anything but
// the given transcript path and .wxai/session-feed.jsonl.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const FEED_REL = join('.wxai', 'session-feed.jsonl');
const MAX_LINES = 200;
const MAX_CHARS = 500;

function parseLines(path) {
  const out = [];
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* a half-written last line */ }
  }
  return out;
}

function lastAssistantText(lines) {
  for (let i = lines.length - 1; i >= 0; i--) {
    const r = lines[i];
    if (r?.type !== 'assistant' || r.isSidechain || r.isMeta) continue;
    const c = r.message?.content;
    if (!Array.isArray(c)) continue;
    const text = c.filter((p) => p?.type === 'text').map((p) => p.text ?? '').join('\n').trim();
    if (text) return text;
  }
  return null;
}

function appendCapped(root, line) {
  const file = join(root, FEED_REL);
  mkdirSync(dirname(file), { recursive: true });
  const existing = existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter((l) => l.trim()) : [];
  const next = [...existing, JSON.stringify(line)].slice(-MAX_LINES);
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, next.join('\n') + '\n', 'utf8');
  renameSync(tmp, file);
}

function run(p) {
  if (!p.transcriptPath || !existsSync(p.transcriptPath)) return;
  const text = lastAssistantText(parseLines(p.transcriptPath));
  if (!text) return;
  const truncated = text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS - 1)}…` : text;

  const redactPath = join(p.root, 'wxkanban-agent', 'dist', 'redact.cjs');
  let masked = truncated;
  if (existsSync(redactPath)) {
    try {
      const { redactSecrets } = require(redactPath);
      masked = redactSecrets(truncated).text;
    } catch { /* masking must never block the feed; fall through unmasked below is worse, so drop instead */ return; }
  } else {
    return; // never write unmasked content when the masking bundle cannot be found
  }

  appendCapped(p.root, { ts: new Date().toISOString(), text: masked });
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('_wxAI/remote/session-feed-worker.mjs') && process.argv[2]) {
  try {
    run(JSON.parse(Buffer.from(process.argv[2], 'base64').toString('utf8')));
  } catch { /* a feed failure must never surface to the developer */ }
}
// [SCOPE 155 / T002] END
