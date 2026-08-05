#!/usr/bin/env node

import { spawn } from 'child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, openSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
const KIT_DIR = join(ROOT_DIR, 'wxkanban-agent');
const GATEWAY_ENTRY = join(KIT_DIR, 'apps', 'command-gateway', 'src', 'http.ts');
// Run the gateway with the kit's bundled tsx (fast, reliable) rather than `npx
// ts-node` — ts-node is not always installed in the kit and npx cold-start can
// exceed the registration window. tsx resolves the gateway's imports relative to
// the entry file, so cwd is free to be the project root (see spawn below).
const TSX_ENTRY = [
  join(KIT_DIR, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
  join(ROOT_DIR, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
].find((p) => existsSync(p));
const RUNTIME_STATE_FILE = join(ROOT_DIR, '.wxai', 'kit-runtime.json');
const LOG_DIR = join(ROOT_DIR, 'logs');
const LOG_FILE = join(LOG_DIR, 'gateway.log');

const colors = {
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
};

function log(prefix, color, message) {
  console.log(`${color}[${prefix}]${colors.reset} ${message}`);
}

// [SCOPE 027 / T012] BEGIN — setup-gateway spawn + KIT_PARENT_PID
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

function cleanupStaleGatewayEntry() {
  if (!existsSync(RUNTIME_STATE_FILE)) return;
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(RUNTIME_STATE_FILE, 'utf8'));
  } catch {
    return;
  }
  if (!parsed || parsed.schemaVersion !== 1 || !parsed.services) return;
  const gateway = parsed.services.gateway;
  if (!gateway || isPidAliveSafe(gateway.pid)) return;

  delete parsed.services.gateway;
  if (Object.keys(parsed.services).length === 0) {
    try { rmSync(RUNTIME_STATE_FILE); } catch { /* best effort */ }
    log('gateway', colors.yellow, `removed stale runtime-state file (gateway pid ${gateway.pid} dead)`);
    return;
  }
  writeFileSync(RUNTIME_STATE_FILE, JSON.stringify(parsed, null, 2));
  log('gateway', colors.yellow, `cleared stale gateway entry from runtime-state (dead pid ${gateway.pid})`);
}

function ensureLogsDirectory() {
  if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
}

function gatewayRunning() {
  if (!existsSync(RUNTIME_STATE_FILE)) return null;
  try {
    const parsed = JSON.parse(readFileSync(RUNTIME_STATE_FILE, 'utf8'));
    const entry = parsed?.services?.gateway;
    if (entry && isPidAliveSafe(entry.pid)) return entry;
  } catch { /* ignore */ }
  return null;
}

async function startGateway() {
  if (!existsSync(KIT_DIR) || !existsSync(GATEWAY_ENTRY)) {
    log('gateway', colors.yellow, 'wxkanban-agent kit not found — skipping gateway start');
    return true;
  }

  const existing = gatewayRunning();
  if (existing) {
    log('gateway', colors.yellow, `gateway already running (pid=${existing.pid} port=${existing.port})`);
    return true;
  }

  cleanupStaleGatewayEntry();
  ensureLogsDirectory();

  if (!TSX_ENTRY) {
    log('gateway', colors.red, 'tsx not found in wxkanban-agent/ or project node_modules — run npm install');
    return false;
  }

  const logFd = openSync(LOG_FILE, 'a');
  const env = {
    ...process.env,
    // A standalone `kit:start:gateway` is a persistent daemon — it has no
    // long-lived editor parent to watch. Skip the parent-watcher so the gateway
    // does not self-terminate when this short-lived launcher exits.
    MCP_SKIP_PARENT_WATCHER: 'true',
  };
  if (!env.GATEWAY_HTTP_PORT) env.GATEWAY_HTTP_PORT = '3003';

  const child = spawn(
    process.execPath,
    [TSX_ENTRY, GATEWAY_ENTRY],
    {
      // cwd = project root so the gateway writes its runtime-state entry and reads
      // project config (.wxai/, .wxkanban-project.json) at the right location.
      // tsx resolves the entry's imports relative to the file, not cwd.
      cwd: ROOT_DIR,
      detached: true,
      stdio: ['ignore', logFd, logFd],
      env,
      // No shell: we exec node.exe directly (its path may contain spaces, which
      // shell:true would mis-split), and tsx/entry paths are passed as argv.
      shell: false,
    },
  );
  child.unref();

  // Poll for registration instead of a single fixed wait — cold starts vary.
  let runningEntry = null;
  for (let i = 0; i < 60; i++) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    runningEntry = gatewayRunning();
    if (runningEntry) break;
  }
  if (!runningEntry) {
    log('gateway', colors.red, 'gateway failed to record a runtime-state entry within 15s');
    log('gateway', colors.cyan, `check logs: ${LOG_FILE}`);
    return false;
  }
  log('gateway', colors.green, `gateway started (pid=${runningEntry.pid} port=${runningEntry.port})`);
  log('gateway', colors.cyan, `log file: ${LOG_FILE}`);
  return true;
}
// [SCOPE 027 / T012] END

async function main() {
  console.log(`\n${colors.bold}${colors.magenta}wxKanban Gateway Setup${colors.reset}\n`);
  const ok = await startGateway();
  if (!ok) process.exitCode = 1;
}

main().catch((error) => {
  log('error', colors.red, error.message);
  process.exitCode = 1;
});
