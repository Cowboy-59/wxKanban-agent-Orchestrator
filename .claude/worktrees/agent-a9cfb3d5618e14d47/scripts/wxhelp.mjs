#!/usr/bin/env node

/**
 * Shell-safe project help wrapper.
 *
 * Why this exists:
 * - In PowerShell, bare `help` maps to Get-Help.
 * - This wrapper always requests MCP `project.help`.
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
const MCP_SERVER_DIR = join(ROOT_DIR, 'mcp-server');
const MCP_ENV_FILE = join(MCP_SERVER_DIR, '.env');
const ROOT_ENV_FILE = join(ROOT_DIR, '.env');

function loadEnv() {
  const env = { ...process.env };
  const envFile = existsSync(MCP_ENV_FILE) ? MCP_ENV_FILE : ROOT_ENV_FILE;
  if (!existsSync(envFile)) return env;

  const lines = readFileSync(envFile, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx > 0) {
      const key = trimmed.substring(0, idx).trim();
      const value = trimmed.substring(idx + 1).trim();
      if (env[key] === undefined || env[key] === '') env[key] = value;
    }
  }
  return env;
}

async function main() {
  const env = loadEnv();
  const port = parseInt(env.MCP_HTTP_PORT || process.env.MCP_HTTP_PORT || '3002', 10);

  const response = await fetch(`http://localhost:${port}/call`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      tool: 'project.help',
      args: { mode: 'all' },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error(`MCP help failed (HTTP ${response.status}).`);
    console.error(`Detail: ${detail || 'no response body'}`);
    console.error('Start MCP first: node scripts/setup-mcp.mjs');
    process.exit(1);
  }

  const result = await response.json();
  const text = Array.isArray(result?.content)
    ? result.content.find((c) => c?.type === 'text')?.text
    : null;

  if (!text) {
    console.error('MCP help returned an unexpected payload.');
    process.exit(1);
  }

  process.stdout.write(`${text}\n`);
}

main().catch((error) => {
  console.error(`wxhelp failed: ${error instanceof Error ? error.message : String(error)}`);
  console.error('PowerShell note: use `node scripts/wxhelp.mjs` instead of bare `help --all`.');
  process.exit(1);
});
