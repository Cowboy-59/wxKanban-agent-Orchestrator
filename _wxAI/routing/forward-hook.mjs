#!/usr/bin/env node
// [SCOPE 143 / T025] BEGIN — Stop / SessionStart hook entry that forwards agent runs, detached (FR-003)
// Forward hook entry (SPEC-143 T025, FR-003). Registered for Stop (session end) and SessionStart
// (catch-up for anything a dead network left behind). Reads and discards the hook JSON, starts
// forward.mjs DETACHED and exits at once, so the session never waits on the network. Never prints,
// always exits 0. On Stop the forward waits a few seconds first, so the capture worker started by the
// same Stop event has written its record. Plain Node ESM, no dependencies.

import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const STOP_DELAY_MS = 5000;

const chunks = [];
process.stdin.on('data', (c) => chunks.push(c));
process.stdin.on('end', () => {
  try {
    let input = {};
    try { input = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { /* no input: still forward */ }
    const event = input.hook_event_name;
    if (event && !['Stop', 'SessionStart'].includes(event)) return;
    const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
    const script = join(dirname(fileURLToPath(import.meta.url)), 'forward.mjs');
    const args = [script, '--root', root, ...(event === 'Stop' ? ['--delay', String(STOP_DELAY_MS)] : [])];
    // Detached and unref'd: on Windows a non-detached child dies with the hook's process job.
    const child = spawn(process.execPath, args, { detached: true, stdio: 'ignore', windowsHide: true, cwd: root });
    child.unref();
  } catch { /* forwarding must never break a session */ }
});
// [SCOPE 143 / T025] END
