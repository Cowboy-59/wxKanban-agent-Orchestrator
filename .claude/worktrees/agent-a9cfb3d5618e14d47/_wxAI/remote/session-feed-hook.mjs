#!/usr/bin/env node
// [SCOPE 155 / T002] BEGIN — session-feed Stop hook entry (FR-002, SCOPE-132 Amendment G piece A)
//
// Registered for Stop only. Reads the hook JSON from stdin, checks three cheap, synchronous
// preconditions, and either exits 0 doing nothing or spawns a DETACHED worker to do the slower
// work (transcript parse + mask + file-cap write) and exits 0 immediately. Never blocks, never
// prints, never throws uncaught. Plain Node ESM, no dependencies, no bundler.
//
// Skip (write nothing, spawn nothing) when any of:
//   1. WXAI_REMOTE=1          — this process IS the project agent's own turn; never feed itself.
//   2. sharing is off         — .vscode/settings.json "wxkanban.projectAgent.shareStatus" (default
//                                true: there is no live bridge from the Cockpit's own setting store
//                                to a file this plain-Node hook can read outside VS Code, so the
//                                workspace settings file is read directly, leniently parsed).
//   3. no project agent running — .wxai/remote-session.lock not held by a live "project agent" pid
//                                (mirrors agent-mode.ts/handoff-writer.ts's own lock check).
// Only when all three pass does a turn's content leave this fast path at all.

import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

function readShareStatus(root) {
  try {
    const raw = readFileSync(join(root, '.vscode', 'settings.json'), 'utf8');
    const v = JSON.parse(raw)?.['wxkanban.projectAgent.shareStatus'];
    return v !== false; // default on; anything but an explicit false means on
  } catch {
    return true; // missing or unparsable file: default on
  }
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err?.code === 'EPERM';
  }
}

function projectAgentLive(root) {
  const path = join(root, '.wxai', 'remote-session.lock');
  if (!existsSync(path)) return false;
  try {
    const held = JSON.parse(readFileSync(path, 'utf8'));
    return typeof held.pid === 'number' && held.owner === 'project agent' && pidAlive(held.pid);
  } catch {
    return false;
  }
}

const chunks = [];
process.stdin.on('data', (c) => chunks.push(c));
process.stdin.on('end', () => {
  try {
    const i = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (i.hook_event_name !== 'Stop') return;
    if (process.env.WXAI_REMOTE === '1') return;
    const root = process.env.CLAUDE_PROJECT_DIR || i.cwd || process.cwd();
    if (!readShareStatus(root)) return;
    if (!projectAgentLive(root)) return;

    const payload = {
      root,
      sessionId: i.session_id,
      transcriptPath: i.transcript_path,
    };
    const worker = join(dirname(fileURLToPath(import.meta.url)), 'session-feed-worker.mjs');
    const child = spawn(process.execPath, [worker, Buffer.from(JSON.stringify(payload)).toString('base64')], {
      detached: true, stdio: 'ignore', windowsHide: true,
    });
    child.unref();
  } catch { /* a feed failure must never break a session */ }
});
// [SCOPE 155 / T002] END
