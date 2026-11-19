#!/usr/bin/env node

import { existsSync, readFileSync, rmSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { setTimeout as sleep } from 'timers/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
const RUNTIME_STATE_FILE = join(ROOT_DIR, '.wxai', 'kit-runtime.json');
const LEGACY_PID_FILE = join(ROOT_DIR, '.mcp-server.pid');

const SHUTDOWN_GRACE_MS = parseInt(process.env.KIT_SHUTDOWN_GRACE_MS || '5000', 10);
const POLL_INTERVAL_MS = 200;

// [SCOPE 027 / T013] BEGIN — kit-stop.mjs with legacy fallback
function isPidAliveSafe(pid) {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    if (err && err.code === 'EPERM') return true;
    return false;
  }
}

function killAndWait(pid, label) {
  if (!isPidAliveSafe(pid)) {
    console.log(`kit:stop ${label}: pid ${pid} not alive`);
    return Promise.resolve();
  }
  console.log(`kit:stop ${label}: SIGTERM pid ${pid}`);
  try {
    process.kill(pid, 'SIGTERM');
  } catch { /* already gone */ }
  return waitForExit(pid, SHUTDOWN_GRACE_MS).then((gone) => {
    if (gone) {
      console.log(`kit:stop ${label}: pid ${pid} exited cleanly`);
      return;
    }
    console.log(`kit:stop ${label}: SIGKILL pid ${pid} (graceful window elapsed)`);
    try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ }
  });
}

async function waitForExit(pid, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!isPidAliveSafe(pid)) return true;
    await sleep(POLL_INTERVAL_MS);
  }
  return !isPidAliveSafe(pid);
}

async function stopFromRuntimeState() {
  if (!existsSync(RUNTIME_STATE_FILE)) return false;
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(RUNTIME_STATE_FILE, 'utf8'));
  } catch {
    console.log('kit:stop: runtime-state file malformed, ignoring');
    return false;
  }
  if (!parsed || parsed.schemaVersion !== 1 || !parsed.services) return false;

  const entries = Object.entries(parsed.services);
  if (entries.length === 0) {
    try { rmSync(RUNTIME_STATE_FILE); } catch { /* ignore */ }
    return true;
  }
  for (const [name, entry] of entries) {
    if (entry && typeof entry.pid === 'number') {
      await killAndWait(entry.pid, name);
    }
  }
  try { rmSync(RUNTIME_STATE_FILE); } catch { /* best effort */ }
  return true;
}

async function stopFromLegacyPidFile() {
  if (!existsSync(LEGACY_PID_FILE)) return false;
  const raw = readFileSync(LEGACY_PID_FILE, 'utf8').trim();
  const pid = parseInt(raw, 10);
  if (!Number.isFinite(pid)) {
    try { rmSync(LEGACY_PID_FILE); } catch { /* ignore */ }
    return true;
  }
  await killAndWait(pid, 'mcp (legacy)');
  try { rmSync(LEGACY_PID_FILE); } catch { /* best effort */ }
  return true;
}

async function main() {
  const usedRuntime = await stopFromRuntimeState();
  const usedLegacy = await stopFromLegacyPidFile();
  if (!usedRuntime && !usedLegacy) {
    console.log('kit:stop: nothing to stop (no runtime-state file, no legacy pid file)');
  }
}
// [SCOPE 027 / T013] END

main().catch((err) => {
  console.error(`kit:stop: ${err.message}`);
  process.exitCode = 1;
});
