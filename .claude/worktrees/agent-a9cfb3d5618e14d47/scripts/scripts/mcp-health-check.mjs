#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const envPath = path.join(root, '.env');
const pidPath = path.join(root, '.mcp-server.pid');

function parseEnv(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return out;
}

const env = parseEnv(envPath);
const required = ['WXKANBAN_PROJECT_ID', 'DATABASE_URL_ENCRYPTED', 'WXKANBAN_API_TOKEN', 'API_KEY'];
const missing = required.filter((k) => !env[k]);

console.log('MCP Kit Health Check');
console.log('--------------------');
for (const key of required) {
  console.log(key + ':', env[key] ? 'OK' : 'MISSING');
}

if (missing.length > 0) {
  console.error('Missing required values:', missing.join(', '));
  process.exit(1);
}

if (!fs.existsSync(pidPath)) {
  console.error('MCP not running (.mcp-server.pid missing)');
  process.exit(1);
}

const pid = Number(fs.readFileSync(pidPath, 'utf8').trim());
try {
  process.kill(pid, 0);
  console.log('MCP process running with PID:', pid);
  console.log('Health check passed.');
} catch {
  console.error('PID file exists but process is not running:', pid);
  process.exit(1);
}
