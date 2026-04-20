#!/usr/bin/env node
// setup-mcp.mjs — start the MCP Project Hub.
//
// Spec 019 R16: reads the MCP entrypoint from .wxkanban-project.json so the
// declared transport (HTTP :3002 by default) is honored, and polls /health
// after spawn to confirm the child actually bound the port before reporting
// success. Silent failures that wrote a PID file for a dead child are
// classified as bugs and fixed here.

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

const root = process.cwd();
const envPath = path.join(root, '.env');
const configPath = path.join(root, '.wxkanban-project.json');
const pidPath = path.join(root, '.mcp-server.pid');
const logsDir = path.join(root, 'logs');
const logPath = path.join(logsDir, 'mcp-server.log');

const HEALTH_PROBE_URL = process.env.MCP_HTTP_URL || 'http://localhost:3002';
const HEALTH_MAX_ATTEMPTS = 10;
const HEALTH_BACKOFF_MS = 1500;

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error('.env not found at project root');
  }
  const env = { ...process.env };
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return env;
}

function validate(env) {
  const required = ['WXKANBAN_PROJECT_ID', 'DATABASE_URL_ENCRYPTED', 'WXKANBAN_API_TOKEN', 'API_KEY'];
  const missing = required.filter((k) => !env[k]);
  if (missing.length > 0) {
    throw new Error('Missing required MCP parameters: ' + missing.join(', '));
  }
}

function isRunning(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

// Spec 019 R16 AC3 — resolve the MCP entrypoint from .wxkanban-project.json,
// falling back to the legacy stdio default only when the declared file is
// missing. This fixes the hardcoded-stdio bug.
function resolveMcpEntry() {
  const defaultEntry = path.join(root, 'mcp-server', 'dist', 'index.js');
  const httpEntry = path.join(root, 'mcp-server', 'dist', 'index-http.js');

  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (typeof config.mcpServer === 'string' && config.mcpServer.trim()) {
        const declared = path.resolve(root, config.mcpServer);
        if (fs.existsSync(declared)) {
          return { entry: declared, source: `.wxkanban-project.json (${config.mcpServer})` };
        }
        console.warn(`setup-mcp: .wxkanban-project.json declares mcpServer=${config.mcpServer} but that file does not exist — falling back.`);
      }
    } catch (err) {
      console.warn(`setup-mcp: could not read .wxkanban-project.json (${err.message}) — falling back.`);
    }
  }

  // Prefer HTTP transport if the build exists; only fall back to stdio if not.
  if (fs.existsSync(httpEntry)) return { entry: httpEntry, source: 'default (index-http.js)' };
  if (fs.existsSync(defaultEntry)) return { entry: defaultEntry, source: 'default (index.js)' };
  throw new Error('No MCP server build found. Run: cd mcp-server && npm install && npm run build');
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Spec 019 R16 AC4 — poll /health to confirm the child actually bound the port
// before writing the PID file or reporting success.
async function waitForPortBind() {
  for (let i = 1; i <= HEALTH_MAX_ATTEMPTS; i++) {
    await sleep(HEALTH_BACKOFF_MS);
    try {
      const response = await fetch(`${HEALTH_PROBE_URL}/health`, {
        headers: { Connection: 'close' },
      });
      if (response.ok) {
        const body = await response.json().catch(() => ({}));
        if (body?.status === 'ok') return true;
      }
    } catch {
      // connection refused / timeout / DNS — keep probing
    }
    if (i < HEALTH_MAX_ATTEMPTS) process.stdout.write(`  waiting for MCP to bind ${HEALTH_PROBE_URL} … attempt ${i}/${HEALTH_MAX_ATTEMPTS}\r`);
  }
  return false;
}

function tailLog(n = 30) {
  if (!fs.existsSync(logPath)) return '(log file not created)';
  const content = fs.readFileSync(logPath, 'utf8');
  const lines = content.split(/\r?\n/);
  return lines.slice(Math.max(0, lines.length - n)).join('\n');
}

async function main() {
  const env = loadEnv(envPath);
  validate(env);

  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

  if (fs.existsSync(pidPath)) {
    const pid = Number(fs.readFileSync(pidPath, 'utf8').trim());
    if (Number.isFinite(pid) && isRunning(pid)) {
      // NOTE: we do NOT verify projectId here — that's init.mjs's job (R16 AC1-2).
      // setup-mcp is a lower-level spawn tool; it just reports "a PID is alive."
      console.log('MCP already running with PID:', pid);
      return;
    }
  }

  const { entry, source } = resolveMcpEntry();
  console.log(`Starting MCP from ${source}:`);
  console.log(`  ${entry}`);

  const outFd = fs.openSync(logPath, 'a');
  const child = spawn(process.execPath, [entry], {
    cwd: root,
    env,
    detached: true,
    stdio: ['ignore', outFd, outFd],
  });

  const healthy = await waitForPortBind();
  if (!healthy) {
    console.error(`\nMCP did not respond at ${HEALTH_PROBE_URL}/health within ~${(HEALTH_MAX_ATTEMPTS * HEALTH_BACKOFF_MS) / 1000}s.`);
    console.error('Child may have crashed or launched the wrong transport. Last log lines:');
    console.error('─'.repeat(60));
    console.error(tailLog(30));
    console.error('─'.repeat(60));
    try { process.kill(child.pid, 'SIGTERM'); } catch { /* best effort */ }
    process.exitCode = 1;
    return;
  }

  fs.writeFileSync(pidPath, String(child.pid));
  child.unref();
  console.log(`\nMCP started and healthy. PID: ${child.pid}`);
  console.log(`Log: ${logPath}`);
}

main().catch((err) => {
  console.error('Setup failed:', err.message);
  process.exitCode = 1;
});
