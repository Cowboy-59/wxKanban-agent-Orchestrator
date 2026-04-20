#!/usr/bin/env node
/**
 * init.mjs — one-shot kit install/startup.
 *
 * 1. Starts the MCP server (via setup-mcp.mjs; detached, PID tracked).
 * 2. Starts the Orchestrator HTTP Gateway (detached, PID tracked).
 * 3. Waits briefly for both to be listening.
 * 4. Runs scripts/orchestrator-health-check.mjs and reports the result.
 *
 * Idempotent: if a service is already running (PID file points at a live
 * process) it is left alone.
 *
 * Usage: node scripts/init.mjs
 */

import fs from 'fs';
import path from 'path';
import { spawn, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const logsDir = path.join(root, 'logs');
const gwEntry = path.join(root, 'wxkanban-agent', 'apps', 'command-gateway', 'bin', 'wxai-http.mjs');
const gwPidPath = path.join(root, '.orchestrator-gateway.pid');
const gwLogPath = path.join(logsDir, 'orchestrator-gateway.log');
const healthScript = path.join(here, 'orchestrator-health-check.mjs');

function isRunning(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function loadEnv(envPath) {
  if (!fs.existsSync(envPath)) return { ...process.env };
  const env = { ...process.env };
  for (const raw of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i <= 0) continue;
    env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return env;
}

function startMcp() {
  console.log('\n[1/3] Starting MCP server…');
  const result = spawnSync(process.execPath, [path.join(here, 'setup-mcp.mjs')], {
    cwd: root,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    console.error('MCP startup failed. See output above.');
    process.exit(1);
  }
}

function startOrchestratorGateway() {
  console.log('\n[2/3] Starting Orchestrator HTTP Gateway…');
  if (!fs.existsSync(gwEntry)) {
    console.error(`Gateway entry missing: ${gwEntry}`);
    process.exit(1);
  }
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

  if (fs.existsSync(gwPidPath)) {
    const pid = Number(fs.readFileSync(gwPidPath, 'utf8').trim());
    if (Number.isFinite(pid) && isRunning(pid)) {
      console.log(`  already running (PID ${pid})`);
      return;
    }
  }

  const env = loadEnv(path.join(root, '.env'));
  const outFd = fs.openSync(gwLogPath, 'a');
  const child = spawn(process.execPath, [gwEntry], {
    cwd: root,
    env,
    detached: true,
    stdio: ['ignore', outFd, outFd],
  });
  fs.writeFileSync(gwPidPath, String(child.pid));
  child.unref();
  console.log(`  started (PID ${child.pid}). Log: ${gwLogPath}`);
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runHealthCheck() {
  console.log('\n[3/3] Health check (after 2s settle)…');
  await sleep(2000);
  const result = spawnSync(process.execPath, [healthScript], { stdio: 'inherit' });
  process.exit(result.status ?? 1);
}

async function main() {
  console.log('wxKanban kit init');
  console.log('═════════════════');
  startMcp();
  startOrchestratorGateway();
  await runHealthCheck();
}

main().catch((err) => {
  console.error('init failed:', err);
  process.exit(1);
});
