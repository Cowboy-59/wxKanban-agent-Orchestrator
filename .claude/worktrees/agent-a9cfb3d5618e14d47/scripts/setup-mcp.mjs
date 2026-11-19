#!/usr/bin/env node

// Spec 028 / T025 — Deprecation notice + hosted-MCP fast path.
//
// Hosted MCP (mcp.wxperts.com) replaces this script's reason for existing.
// When MCP_BASE_URL points at an https:// endpoint, we skip everything below
// and exit 0 — no local MCP spawn, no port wrangling, no DB checks.
//
// Aliases will be removed in a future kit minor; the deprecation warning
// prints on every run so consumers know to migrate.
console.warn(
  '\n[deprecated] scripts/setup-mcp.mjs spawns a local MCP server, which is no longer the default.\n' +
  '             Spec 028 introduced the hosted MCP at https://mcp.wxperts.com — see\n' +
  '             wxkanban-agent/docs/hosted-mcp-migration.md to switch. This script will be\n' +
  '             removed in a future kit release.\n',
);

const HOSTED_MCP_RE = /^https:\/\//i;
if (HOSTED_MCP_RE.test(process.env.MCP_BASE_URL ?? '')) {
  console.log(`[setup-mcp] Hosted MCP detected (${process.env.MCP_BASE_URL}); skipping local spawn.`);
  process.exit(0);
}

import { spawn, execSync } from 'child_process';
import { createRequire } from 'module';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import net from 'net';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
const MCP_SERVER_DIR = join(ROOT_DIR, 'mcp-server');
const MCP_FILE = join(MCP_SERVER_DIR, 'dist', 'index-http.js');
const MCP_ENV_FILE = join(MCP_SERVER_DIR, '.env');
const ROOT_ENV_FILE = join(ROOT_DIR, '.env');
const PID_FILE = join(ROOT_DIR, '.mcp-server.pid');
const LOG_FILE = join(ROOT_DIR, 'logs', 'mcp-server.log');
const RUNTIME_STATE_FILE = join(ROOT_DIR, '.wxai', 'kit-runtime.json');
const PROJECT_CONFIG_FILE = join(ROOT_DIR, '.wxkanban-project.json');
const requireFromMcp = createRequire(join(MCP_SERVER_DIR, 'package.json'));

// [SCOPE 019 / R18] BEGIN — MCP port lifecycle helpers
// Implements R18 AC#2 (pre-flight bind + auto-shift) and AC#3 (mcpHttpUrl sync).
// Bug source: TCI-ExpenseManager BugReport.md 2026-05-14 (Bugs 3 + 4).
async function tryBindPort(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, '127.0.0.1');
  });
}

async function findFreePort(preferred, scanEnd = 3099) {
  if (await tryBindPort(preferred)) return preferred;
  const scanStart = preferred + 1;
  for (let port = scanStart; port <= scanEnd; port++) {
    if (await tryBindPort(port)) return port;
  }
  throw new Error(`No free port in range ${preferred}..${scanEnd}`);
}

function updateEnvFilePort(filePath, port) {
  const portLine = `MCP_HTTP_PORT=${port}`;
  if (!existsSync(filePath)) {
    writeFileSync(filePath, `${portLine}\n`, 'utf8');
    return;
  }
  const content = readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  let found = false;
  const updated = lines.map((line) => {
    if (/^\s*MCP_HTTP_PORT\s*=/.test(line)) {
      found = true;
      return portLine;
    }
    return line;
  });
  if (!found) updated.push(portLine);
  writeFileSync(filePath, updated.join('\n'), 'utf8');
}

function syncProjectConfigPort(port) {
  if (!existsSync(PROJECT_CONFIG_FILE)) return;
  try {
    const cfg = JSON.parse(readFileSync(PROJECT_CONFIG_FILE, 'utf8'));
    const url = `http://localhost:${port}`;
    if (cfg.mcpHttpUrl !== url || cfg.mcpHttpPort !== port) {
      cfg.mcpHttpUrl = url;
      cfg.mcpHttpPort = port;
      writeFileSync(PROJECT_CONFIG_FILE, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
      log('mcp', colors.cyan, `Synced .wxkanban-project.json mcpHttpUrl → ${url}`);
    }
  } catch (err) {
    log('mcp', colors.yellow, `Could not sync .wxkanban-project.json: ${err.message}`);
  }
}
// [SCOPE 019 / R18] END

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

function ensureLogsDirectory() {
  const logsDir = join(ROOT_DIR, 'logs');
  if (!existsSync(logsDir)) {
    mkdirSync(logsDir, { recursive: true });
  }
}

function appendLog(message) {
  ensureLogsDirectory();
  const currentLog = existsSync(LOG_FILE) ? readFileSync(LOG_FILE, 'utf8') : '';
  writeFileSync(LOG_FILE, `${currentLog}[${new Date().toISOString()}] ${message}\n`, 'utf8');
}

function getRecentLogLines(maxLines = 30) {
  if (!existsSync(LOG_FILE)) return '';
  const lines = readFileSync(LOG_FILE, 'utf8').split(/\r?\n/).filter(Boolean);
  return lines.slice(-maxLines).join('\n');
}

function parseEnvFile(filePath) {
  const parsed = {};
  if (!existsSync(filePath)) {
    return parsed;
  }

  const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const idx = trimmed.indexOf('=');
    if (idx <= 0) continue;

    const key = trimmed.substring(0, idx).trim();
    let value = trimmed.substring(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }

  return parsed;
}

function loadEnv() {
  // Deterministic precedence: process env > root .env > mcp-server/.env
  const mcpFileEnv = parseEnvFile(MCP_ENV_FILE);
  const rootFileEnv = parseEnvFile(ROOT_ENV_FILE);
  const env = {
    ...mcpFileEnv,
    ...rootFileEnv,
    ...process.env,
  };

  if (!env.MCP_HTTP_PORT && env.HTTP_PORT) {
    env.MCP_HTTP_PORT = env.HTTP_PORT;
  }
  if (!env.HTTP_PORT && env.MCP_HTTP_PORT) {
    env.HTTP_PORT = env.MCP_HTTP_PORT;
  }
  if (!env.MCP_HTTP_PORT) {
    env.MCP_HTTP_PORT = '3002';
    env.HTTP_PORT = '3002';
  }

  if (env.WXKANBAN_PROJECT_ID && !env.PROJECT_ID) {
    env.PROJECT_ID = env.WXKANBAN_PROJECT_ID;
  }
  if (env.PROJECT_ID && !env.WXKANBAN_PROJECT_ID) {
    env.WXKANBAN_PROJECT_ID = env.PROJECT_ID;
  }

  if (!env.API_KEY) {
    env.API_KEY = 'wxkanban-mcp-local-dev-key';
    log('env', colors.yellow, 'API_KEY missing; using local default for development startup');
  }

  const hasCentralDb = Boolean(
    env.WXKANBAN_MCP_DATABASE_URL ||
    (env.DATABASE_URL_ENCRYPTED && env.WXKANBAN_API_TOKEN) ||
    env.DATABASE_URL
  );

  if (!hasCentralDb) {
    throw new Error(
      'No MCP database configuration found. Set WXKANBAN_MCP_DATABASE_URL, or DATABASE_URL_ENCRYPTED + WXKANBAN_API_TOKEN.'
    );
  }

  return env;
}

function verifyRuntimeDependency(packageName) {
  try {
    requireFromMcp.resolve(packageName);
    return true;
  } catch {
    return false;
  }
}

function isRunning() {
  if (!existsSync(PID_FILE)) return false;
  try {
    const pid = parseInt(readFileSync(PID_FILE, 'utf8').trim(), 10);
    process.kill(pid, 0);
    return pid;
  } catch {
    if (existsSync(PID_FILE)) rmSync(PID_FILE);
    return false;
  }
}

// [SCOPE 027 / T011] BEGIN — setup-mcp KIT_PARENT_PID + stale-entry cleanup
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

function cleanupStaleMcpEntry() {
  if (!existsSync(RUNTIME_STATE_FILE)) return;
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(RUNTIME_STATE_FILE, 'utf8'));
  } catch {
    return;
  }
  if (!parsed || parsed.schemaVersion !== 1 || !parsed.services) return;
  const mcp = parsed.services.mcp;
  if (!mcp || isPidAliveSafe(mcp.pid)) return;

  delete parsed.services.mcp;
  if (Object.keys(parsed.services).length === 0) {
    try { rmSync(RUNTIME_STATE_FILE); } catch { /* best effort */ }
    log('mcp', colors.yellow, `removed stale runtime-state file (mcp pid ${mcp.pid} dead)`);
    return;
  }
  writeFileSync(RUNTIME_STATE_FILE, JSON.stringify(parsed, null, 2));
  log('mcp', colors.yellow, `cleared stale mcp entry from runtime-state (dead pid ${mcp.pid})`);
}
// [SCOPE 027 / T011] END

function checkNodeVersion() {
  const major = parseInt(process.version.slice(1).split('.')[0], 10);
  if (major < 20) {
    log('error', colors.red, `Node.js 20+ required. Current: ${process.version}`);
    process.exit(1);
  }
}

function ensureDependenciesAndBuild() {
  if (!existsSync(MCP_SERVER_DIR)) {
    log('error', colors.red, `mcp-server directory not found: ${MCP_SERVER_DIR}`);
    return false;
  }

  const mcpNodeModules = join(MCP_SERVER_DIR, 'node_modules');
  // [SCOPE 027 / T011] BEGIN — verify Windows shims exist, not just node_modules root
  // (fixes TCI-ExpenseManager bugreport Bug 1: partial npm install from WSL leaves
  // node_modules present but missing .cmd shims; previous check skipped re-install)
  const tscShim = process.platform === 'win32'
    ? join(mcpNodeModules, '.bin', 'tsc.cmd')
    : join(mcpNodeModules, '.bin', 'tsc');
  if (!existsSync(mcpNodeModules) || !existsSync(tscShim)) {
    log('deps', colors.yellow, existsSync(mcpNodeModules)
      ? 'mcp-server node_modules exists but build shims missing; re-running npm install...'
      : 'Installing mcp-server dependencies...');
    try {
      execSync('npm install', { cwd: MCP_SERVER_DIR, stdio: 'inherit', shell: true });
    } catch (error) {
      log('error', colors.red, `npm install failed: ${error.message}`);
      return false;
    }
  }
  // [SCOPE 027 / T011] END

  if (!verifyRuntimeDependency('@modelcontextprotocol/sdk/server/index.js')) {
    log('deps', colors.yellow, 'Installing missing runtime dependency: @modelcontextprotocol/sdk');
    try {
      execSync('npm install @modelcontextprotocol/sdk', { cwd: MCP_SERVER_DIR, stdio: 'inherit', shell: true });
    } catch (error) {
      log('error', colors.red, `Failed to install @modelcontextprotocol/sdk: ${error.message}`);
      return false;
    }
  }

  if (!verifyRuntimeDependency('@modelcontextprotocol/sdk/server/index.js')) {
    appendLog('ERROR: @modelcontextprotocol/sdk/server/index.js is not resolvable after npm install');
    log('error', colors.red, '@modelcontextprotocol/sdk/server/index.js is not resolvable after install');
    return false;
  }

  log('build', colors.yellow, 'Building MCP HTTP entrypoint...');
  try {
    execSync('npm run build', { cwd: MCP_SERVER_DIR, stdio: 'inherit', shell: true });
  } catch (error) {
    log('error', colors.red, `build failed: ${error.message}`);
    return false;
  }

  if (!existsSync(MCP_FILE)) {
    log('error', colors.red, `MCP entrypoint still missing: ${MCP_FILE}`);
    return false;
  }

  log('deps', colors.green, '@modelcontextprotocol/sdk runtime import resolved ✓');
  log('build', colors.green, `MCP entrypoint ready: ${MCP_FILE}`);
  return true;
}

async function waitForMcpReadiness(env, timeoutMs = 10000) {
  const port = parseInt(env.MCP_HTTP_PORT || process.env.MCP_HTTP_PORT || '3002', 10);
  const deadline = Date.now() + timeoutMs;
  let lastError = 'unknown readiness failure';

  while (Date.now() < deadline) {
    try {
      const healthResp = await fetch(`http://localhost:${port}/health`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      if (!healthResp.ok) {
        lastError = `/health returned HTTP ${healthResp.status}`;
        await new Promise((resolve) => setTimeout(resolve, 600));
        continue;
      }

      const callResp = await fetch(`http://localhost:${port}/call`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ tool: 'project.help', args: {} }),
      });

      if (!callResp.ok) {
        lastError = `/call returned HTTP ${callResp.status}`;
        await new Promise((resolve) => setTimeout(resolve, 600));
        continue;
      }

      const body = await callResp.json();
      const hasContent = !!body && typeof body === 'object' && Array.isArray(body.content);
      if (!hasContent) {
        lastError = 'project.help response did not include content[]';
        await new Promise((resolve) => setTimeout(resolve, 600));
        continue;
      }

      return { ok: true, detail: `project.help readiness passed on port ${port}` };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      await new Promise((resolve) => setTimeout(resolve, 600));
    }
  }

  return { ok: false, detail: lastError };
}

// R16 AC1: Verify the MCP currently answering on :3002 belongs to THIS project.
// Returns { matched: true } on identity match, { matched: false } on mismatch
// (after killing the stale PID + removing the pid file) or on any failure to
// parse mcp_health (fail-safe → force re-spawn). Probe is unconditional: it
// runs whether or not we have a local .mcp-server.pid file, so a foreign MCP
// that arrived before our first init is still caught.
async function assertProjectIdentityOrKill(env, reasonTag) {
  const port = parseInt(env.MCP_HTTP_PORT || process.env.MCP_HTTP_PORT || '3002', 10);
  const expectedProjectId = env.WXKANBAN_PROJECT_ID;
  if (!expectedProjectId) {
    log('mcp', colors.yellow,
      `R16 identity check skipped (${reasonTag}): WXKANBAN_PROJECT_ID is not set in env`);
    return { matched: false };
  }
  try {
    const resp = await fetch(`http://localhost:${port}/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: 'project.mcp_health', args: {} }),
    });
    const body = await resp.json();
    const text = body?.content?.[0]?.text;
    const health = typeof text === 'string' ? JSON.parse(text) : null;
    const runningProjectId = health?.projectContext?.projectId;
    if (runningProjectId && runningProjectId !== expectedProjectId) {
      log('mcp', colors.red,
        `R16 identity mismatch (${reasonTag}): running=${runningProjectId} expected=${expectedProjectId}. Killing stale MCP.`);
      const stalePid = isRunning();
      if (stalePid) {
        try { process.kill(stalePid, 'SIGKILL'); } catch { /* already gone */ }
      }
      if (existsSync(PID_FILE)) rmSync(PID_FILE);
      return { matched: false };
    }
    return { matched: true };
  } catch (err) {
    log('mcp', colors.yellow,
      `R16 identity check failed to parse mcp_health (${reasonTag}): ${err?.message ?? err}`);
    return { matched: false };
  }
}

async function startServer() {
  const initialEnv = loadEnv();
  const alreadyReady = await waitForMcpReadiness(initialEnv, 2500);
  if (alreadyReady.ok) {
    const identity = await assertProjectIdentityOrKill(initialEnv, 'readiness-path');
    if (identity.matched) {
      log('mcp', colors.green, `MCP HTTP endpoint already ready (${alreadyReady.detail})`);
      if (!existsSync(PID_FILE)) {
        appendLog('INFO: setup-mcp detected healthy MCP endpoint without PID file; skipping spawn');
      }
      return true;
    }
    // identity mismatch → fall through to spawn path with correct env
  } else {
    const currentPid = isRunning();
    if (currentPid) {
      const identity = await assertProjectIdentityOrKill(initialEnv, 'pidfile-path');
      if (identity.matched) {
        log('mcp', colors.yellow, `MCP server is already running (PID: ${currentPid})`);
        return true;
      }
      // identity mismatch → assertProjectIdentityOrKill already killed + removed pid file
    }
  }

  ensureLogsDirectory();
  cleanupStaleMcpEntry();
  const spawnEnv = loadEnv();
  // [SCOPE 027 / T011] BEGIN — setup-mcp KIT_PARENT_PID + stale-entry cleanup
  spawnEnv.KIT_PARENT_PID = String(process.pid);
  // [SCOPE 027 / T011] END

  // [SCOPE 019 / R18] AC#2 — pre-flight bind; auto-shift to next free port on collision
  const requestedPort = parseInt(spawnEnv.MCP_HTTP_PORT, 10);
  const portFree = await tryBindPort(requestedPort);
  if (!portFree) {
    try {
      const newPort = await findFreePort(requestedPort + 1);
      log('mcp', colors.yellow,
        `Port ${requestedPort} is in use; shifting MCP to free port ${newPort}`);
      appendLog(`INFO: setup-mcp port shift ${requestedPort} → ${newPort} (EADDRINUSE pre-flight)`);
      spawnEnv.MCP_HTTP_PORT = String(newPort);
      spawnEnv.HTTP_PORT = String(newPort);
      updateEnvFilePort(ROOT_ENV_FILE, newPort);
      syncProjectConfigPort(newPort);
    } catch (err) {
      log('error', colors.red, `No free MCP port available: ${err.message}`);
      appendLog(`ERROR: setup-mcp port allocation failed: ${err.message}`);
      return false;
    }
  }

  const child = spawn('node', [MCP_FILE], {
    cwd: MCP_SERVER_DIR,
    detached: true,
    stdio: 'ignore',
    env: spawnEnv,
    shell: false,
  });

  writeFileSync(PID_FILE, String(child.pid));

  child.on('error', (error) => {
    appendLog(`ERROR: MCP server failed to start: ${error.message}`);
    if (existsSync(PID_FILE)) rmSync(PID_FILE);
  });
  child.on('exit', (code) => {
    appendLog(`ERROR: MCP server exited with code ${code}`);
    if (existsSync(PID_FILE)) rmSync(PID_FILE);
  });
  child.unref();

  await new Promise((resolve) => setTimeout(resolve, 3000));

  if (!isRunning()) {
    // R16 AC1: a healthy MCP on :3002 after our spawn died is almost certainly
    // a foreign listener that shadowed our child (EADDRINUSE). Require an
    // identity match before adopting it; otherwise fail loud per R16 AC5.
    const recoveredReadiness = await waitForMcpReadiness(spawnEnv, 2500);
    if (recoveredReadiness.ok) {
      const identity = await assertProjectIdentityOrKill(spawnEnv, 'post-spawn-recovery');
      if (identity.matched) {
        log('mcp', colors.yellow, `Detected existing healthy MCP endpoint after spawn attempt (${recoveredReadiness.detail})`);
        appendLog('INFO: setup-mcp spawn exited but MCP endpoint is healthy and identity matches');
        return true;
      }
      log('mcp', colors.red,
        `Spawn failed and the listener on :${spawnEnv.MCP_HTTP_PORT} belongs to a different project. Free the port (kill that PID) or set MCP_HTTP_PORT for this project, then re-run.`);
      appendLog('ERROR: setup-mcp spawn exited and post-spawn listener identity mismatch');
      return false;
    }

    appendLog('ERROR: setup-mcp detected that MCP server exited before passing startup verification');
    const recentLogs = getRecentLogLines(20);
    log('error', colors.red, 'MCP server failed startup verification. Check logs/mcp-server.log');
    if (recentLogs) {
      console.error(`\nRecent MCP logs:\n${recentLogs}\n`);
    }
    return false;
  }

  const readiness = await waitForMcpReadiness(spawnEnv);
  if (!readiness.ok) {
    appendLog(`ERROR: MCP readiness probe failed: ${readiness.detail}`);
    const recentLogs = getRecentLogLines(20);
    log('error', colors.red, `MCP process is alive but not ready: ${readiness.detail}`);
    if (recentLogs) {
      console.error(`\nRecent MCP logs:\n${recentLogs}\n`);
    }
    return false;
  }

  log('mcp', colors.green, `MCP server started successfully (PID: ${child.pid})`);
  log('mcp', colors.green, readiness.detail);
  log('mcp', colors.cyan, `Log file: ${LOG_FILE}`);
  // [SCOPE 019 / R18] AC#3 — sync mcpHttpUrl to actually-bound port (auto-heal manual drift)
  syncProjectConfigPort(parseInt(spawnEnv.MCP_HTTP_PORT, 10));
  return true;
}

async function checkOrchestrator() {
  const orchestratorDir = join(ROOT_DIR, 'wxkanban-agent');
  const cliEntry = join(orchestratorDir, 'apps', 'command-gateway', 'src', 'cli.ts');

  if (!existsSync(orchestratorDir) || !existsSync(cliEntry)) {
    log('orch', colors.yellow, 'Orchestrator kit not found — skipping');
    return;
  }

  // Read lifecycle stage from .wxai/project.json or .wxkanban-project.json
  let stage = 'Design';
  const wxaiPath = join(ROOT_DIR, '.wxai', 'project.json');
  if (existsSync(wxaiPath)) {
    try {
      const wxai = JSON.parse(readFileSync(wxaiPath, 'utf-8'));
      if (wxai.lifecycleStage) stage = wxai.lifecycleStage;
    } catch {
      // Use default
    }
  }

  // Determine available commands by stage
  const stageCommands = {
    'Design': ['buildscope', 'createspecs'],
    'Implementation': ['implement', 'createtesttasks'],
    'QA Testing': ['runqa'],
    'Human Testing': ['runhuman'],
    'Beta': ['prepareRelease'],
    'Release': ['finalizeRelease'],
  };
  const crossCutting = ['dbpush', 'pipeline-agent'];
  const commands = [...(stageCommands[stage] || []), ...crossCutting];

  console.log('');
  log('orch', colors.green, 'Orchestrator kit detected');
  log('orch', colors.cyan, `Lifecycle stage: ${colors.bold}${stage}${colors.reset}`);
  console.log('');
  console.log(`${colors.bold}  Available commands for ${stage} stage:${colors.reset}`);
  for (const cmd of commands) {
    const isCrossCutting = crossCutting.includes(cmd);
    const tag = isCrossCutting ? `${colors.cyan}(cross-cutting)${colors.reset}` : `${colors.green}(stage-gated)${colors.reset}`;
    console.log(`    ${colors.bold}${cmd}${colors.reset}  ${tag}`);
  }
  console.log('');
  console.log(`  Run: ${colors.cyan}npx tsx wxkanban-agent/apps/command-gateway/src/cli.ts <command>${colors.reset}`);
  console.log(`  Help: ${colors.cyan}npx tsx wxkanban-agent/apps/command-gateway/src/cli.ts --help${colors.reset}`);
  console.log('');
}

async function main() {
  console.log(`\n${colors.bold}${colors.magenta}wxKanban MCP Setup${colors.reset}\n`);
  checkNodeVersion();
  if (!ensureDependenciesAndBuild()) {
    process.exitCode = 1;
    return;
  }
  const started = await startServer();
  if (!started) {
    process.exitCode = 1;
    return;
  }
  await checkOrchestrator();
}

main().catch((error) => {
  appendLog(`ERROR: Unexpected setup error: ${error.message}`);
  log('error', colors.red, error.message);
  process.exitCode = 1;
});