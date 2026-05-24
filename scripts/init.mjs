#!/usr/bin/env node
/**
 * wxKanban Kit — one-shot install (hosted MCP / spec 028 v1.1.0+).
 *
 * Replaces the pre-v1.1.0 init.mjs that spawned a local mcp-server. After spec
 * 019 Decision #1 / spec 028, the MCP runs only on wxKanban-operated
 * infrastructure at https://mcp.wxperts.com. This script:
 *
 *   1. Loads .env (and .wxai/project.json's `kit` block for fallback values).
 *   2. Verifies WXKANBAN_MCP_BASE_URL is reachable via GET /health.
 *   3. Verifies WXKANBAN_API_TOKEN authenticates (POST /call with a sentinel).
 *   4. Starts the Orchestrator HTTP Gateway (detached, PID-tracked).
 *   5. Runs orchestrator-health-check.mjs and exits with its result.
 *
 * Drop-in for the orchestrator repo's `scripts/init.mjs`. Replaces the
 * pre-v1.1.0 script that called setup-mcp.mjs and crashed when no Postgres
 * route existed from the consumer's machine (BUG-20).
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const root = process.cwd();
const envPath = path.join(root, '.env');
const projectJsonPath = path.join(root, '.wxai', 'project.json');
const gwPidPath = path.join(root, '.orchestrator-gateway.pid');
const logsDir = path.join(root, 'logs');
const gwLogPath = path.join(logsDir, 'orchestrator-gateway.log');
// The gateway HTTP server lives at apps/command-gateway/src/http.ts. The
// `wxai-http.mjs` shim launches it via tsx. Do NOT confuse with `wxai.mjs`,
// which is the *CLI* dispatcher and routes every argument through the policy
// stage gate — `wxai.mjs gateway:start` always rejects because `gateway:start`
// is not a Capability (BUG: pre-fix init.mjs spawned that and the gateway
// never bound :3003, then orchestrator-health-check.mjs reported the install
// as failed on an otherwise-healthy v1.1.0 kit).
const gwEntry = path.join(root, 'wxkanban-agent', 'apps', 'command-gateway', 'src', 'http.ts');
const gwBin = path.join(root, 'wxkanban-agent', 'apps', 'command-gateway', 'bin', 'wxai-http.mjs');
const healthCheckScript = path.join(root, 'scripts', 'orchestrator-health-check.mjs');

const DEFAULT_MCP_BASE_URL = 'https://mcp.wxperts.com';

function parseEnvFile(filePath) {
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

function readKitBlock() {
  if (!fs.existsSync(projectJsonPath)) return {};
  try {
    const j = JSON.parse(fs.readFileSync(projectJsonPath, 'utf8'));
    return j.kit ?? {};
  } catch {
    return {};
  }
}

function loadConfig() {
  const fromEnvFile = parseEnvFile(envPath);
  const kit = readKitBlock();
  return {
    mcpBaseUrl:
      process.env.WXKANBAN_MCP_BASE_URL ||
      process.env.MCP_BASE_URL ||
      fromEnvFile.WXKANBAN_MCP_BASE_URL ||
      fromEnvFile.MCP_BASE_URL ||
      kit.mcpBaseUrl ||
      DEFAULT_MCP_BASE_URL,
    apiToken:
      process.env.WXKANBAN_API_TOKEN ||
      fromEnvFile.WXKANBAN_API_TOKEN ||
      kit.apiToken ||
      '',
    projectId:
      process.env.WXKANBAN_PROJECT_ID ||
      fromEnvFile.WXKANBAN_PROJECT_ID ||
      kit.projectId ||
      '',
    fromEnvFile,
  };
}

function fmt(s) {
  return s ? `${s.slice(0, 4)}…${s.slice(-4)}` : '(missing)';
}

function bail(msg, exit = 1) {
  console.error(`\n[init] ${msg}`);
  process.exit(exit);
}

async function checkHostedMcp(baseUrl) {
  const url = `${baseUrl.replace(/\/$/, '')}/health`;
  console.log(`[init] hosted MCP /health  →  ${url}`);
  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  } catch (err) {
    bail(`hosted MCP unreachable: ${err.message}\n` +
         `  • Confirm outbound HTTPS to ${baseUrl} is allowed by your network.\n` +
         `  • To target staging: WXKANBAN_MCP_BASE_URL=https://staging.mcp.wxperts.com`);
  }
  if (!res.ok) {
    bail(`hosted MCP returned HTTP ${res.status}`);
  }
  const body = await res.json().catch(() => ({}));
  console.log(`[init] hosted MCP OK       → status=${body.status} version=${body.version} dbConnected=${body.dbConnected}`);
}

async function checkToken(baseUrl, token, projectId) {
  const url = `${baseUrl.replace(/\/$/, '')}/call`;
  console.log(`[init] token validation    →  POST /call sentinel`);
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-WxKanban-Project-Id': projectId,
        'User-Agent': 'wxkanban-agent/init',
      },
      body: JSON.stringify({ tool: 'project.list_open_items', args: { projectid: projectId, limit: 1 } }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    bail(`token validation request failed: ${err.message}`);
  }
  if (res.status === 401) {
    bail(`token rejected (HTTP 401). Ask your wxKanban admin to mint a new one,\n` +
         `  then run:  node wxkanban-agent/bin/wxkanban-agent kit-configure \\\n` +
         `              --token <wxk_..._>  --project-id ${projectId}  --mcp-url ${baseUrl}`);
  }
  if (res.status === 403) {
    bail(`token does not have access to project ${projectId} (HTTP 403).`);
  }
  if (!res.ok) {
    bail(`token validation returned HTTP ${res.status}`);
  }
  console.log(`[init] token OK            → project ${projectId} reachable`);
}

function isRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function startGateway(cfg) {
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

  if (fs.existsSync(gwPidPath)) {
    const pid = Number(fs.readFileSync(gwPidPath, 'utf8').trim());
    if (Number.isFinite(pid) && isRunning(pid)) {
      console.log(`[init] gateway already running PID=${pid}`);
      return;
    }
  }

  const entry = fs.existsSync(gwBin) ? gwBin : gwEntry;
  if (!fs.existsSync(entry)) {
    bail(`orchestrator gateway entrypoint not found at ${entry}\n` +
         `  Did you extract the kit fully? Try: ls wxkanban-agent/apps/command-gateway/`);
  }

  const outFd = fs.openSync(gwLogPath, 'a');
  const env = {
    ...process.env,
    WXKANBAN_MCP_BASE_URL: cfg.mcpBaseUrl,
    WXKANBAN_API_TOKEN: cfg.apiToken,
    WXKANBAN_PROJECT_ID: cfg.projectId,
  };
  // wxai-http.mjs / http.ts take no positional args — they bind the HTTP
  // server on GATEWAY_HTTP_PORT (default 3003). DO NOT pass `gateway:start`;
  // that's a non-existent CLI command and would be rejected by the policy.
  const child = spawn(process.execPath, [entry], {
    cwd: root,
    env,
    detached: true,
    stdio: ['ignore', outFd, outFd],
  });
  fs.writeFileSync(gwPidPath, String(child.pid));
  child.unref();
  console.log(`[init] gateway started     → PID=${child.pid}  log=${gwLogPath}`);
}

async function runHealthCheck() {
  if (!fs.existsSync(healthCheckScript)) {
    console.log(`[init] (no health-check script at ${healthCheckScript}; skipping)`);
    return 0;
  }
  return await new Promise((resolve) => {
    const c = spawn(process.execPath, [healthCheckScript], { cwd: root, stdio: 'inherit' });
    c.on('exit', (code) => resolve(code ?? 1));
  });
}

// Auto-install dependencies if missing. The kit ships without node_modules
// because they're platform-specific (esbuild, bcrypt, etc.); consumers must
// install for their own platform. Detect by probing for `tsx` — every
// downstream script (wxai-http.mjs, gateway startup) needs it.
async function ensureDepsInstalled() {
  const tsxPath = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  if (fs.existsSync(tsxPath)) return;
  console.log('[init] dependencies missing  → running `npm install` at kit root…');
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const code = await new Promise((resolve) => {
    const c = spawn(npmCmd, ['install', '--no-audit', '--no-fund'], {
      cwd: root,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    c.on('exit', (rc) => resolve(rc ?? 1));
    c.on('error', (err) => {
      console.error(`[init] failed to spawn npm: ${err.message}`);
      console.error('[init] is npm in PATH? (try: which npm / where.exe npm)');
      resolve(1);
    });
  });
  if (code !== 0) {
    bail(`npm install failed (exit ${code}). Fix the error above and re-run scripts/init.mjs.`);
  }
  if (!fs.existsSync(tsxPath)) {
    bail(`npm install succeeded but tsx is still missing at ${tsxPath}. Inspect package.json for the tsx dep.`);
  }
  console.log('[init] ✓ dependencies installed');
}

async function main() {
  console.log('\nwxKanban kit — install\n──────────────────────');

  await ensureDepsInstalled();

  const cfg = loadConfig();
  console.log(`[init] config: mcpBaseUrl=${cfg.mcpBaseUrl}  token=${fmt(cfg.apiToken)}  projectId=${cfg.projectId || '(missing)'}`);

  if (!cfg.apiToken || !cfg.projectId) {
    bail(
      `kit is not configured.\n\n` +
      `Run kit-configure first:\n\n` +
      `  node wxkanban-agent/bin/wxkanban-agent kit-configure \\\n` +
      `    --token wxk_live_<64hex> \\\n` +
      `    --project-id <project-uuid> \\\n` +
      `    --mcp-url https://mcp.wxperts.com\n\n` +
      `(Ask a wxKanban admin to mint the token at wxkanban.wxperts.com → Admin → Projects.)`
    );
  }

  await checkHostedMcp(cfg.mcpBaseUrl);
  await checkToken(cfg.mcpBaseUrl, cfg.apiToken, cfg.projectId);

  startGateway(cfg);

  // Give the gateway a beat to bind, then probe.
  await sleep(1500);
  const hc = await runHealthCheck();
  if (hc === 0) {
    console.log('\n[init] ✓ kit ready');
    process.exit(0);
  } else {
    console.error('\n[init] ✗ health check failed — see logs/orchestrator-gateway.log');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\n[init] unexpected error:', err);
  process.exit(1);
});
