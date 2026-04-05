#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

const root = process.cwd();
const envPath = path.join(root, '.env');
const pidPath = path.join(root, '.mcp-server.pid');
const logsDir = path.join(root, 'logs');
const logPath = path.join(logsDir, 'mcp-server.log');
const mcpEntry = path.join(root, 'mcp-server', 'dist', 'index.js');

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
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    env[key] = value;
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
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const env = loadEnv(envPath);
  validate(env);

  if (!fs.existsSync(mcpEntry)) {
    throw new Error('MCP server build missing at mcp-server/dist/index.js. Run: cd mcp-server && npm install && npm run build');
  }

  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

  if (fs.existsSync(pidPath)) {
    const pid = Number(fs.readFileSync(pidPath, 'utf8').trim());
    if (Number.isFinite(pid) && isRunning(pid)) {
      console.log('MCP already running with PID:', pid);
      process.exit(0);
    }
  }

  const outFd = fs.openSync(logPath, 'a');
  const child = spawn(process.execPath, [mcpEntry], {
    cwd: root,
    env,
    detached: true,
    stdio: ['ignore', outFd, outFd],
  });

  fs.writeFileSync(pidPath, String(child.pid));
  child.unref();

  console.log('MCP started. PID:', child.pid);
  console.log('Log:', logPath);
  console.log('Run health check: node scripts/mcp-health-check.mjs');
}

main().catch((err) => {
  console.error('Setup failed:', err.message);
  process.exit(1);
});
