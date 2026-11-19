#!/usr/bin/env node

/**
 * MCP Server Health Check
 *
 * Checks whether the wxKanban MCP HTTP server is running and healthy.
 *
 * Usage:
 *   node scripts/mcp-health-check.mjs
 *   node scripts/mcp-health-check.mjs --json
 *   node scripts/mcp-health-check.mjs --restart-on-fail
 *
 * Exit codes:
 *   0 — server is running and healthy
 *   1 — server is down or unhealthy
 */

import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import { execSync, spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
const MCP_SERVER_DIR = join(ROOT_DIR, 'mcp-server');
const MCP_ENV_FILE = join(MCP_SERVER_DIR, '.env');
const PID_FILE = join(ROOT_DIR, '.mcp-server.pid');
const MCP_FILE = join(MCP_SERVER_DIR, 'dist', 'index-http.js');

const args = process.argv.slice(2);
const JSON_MODE = args.includes('--json');
const RESTART_ON_FAIL = args.includes('--restart-on-fail');

// ─── Colours ────────────────────────────────────────────────────────────────
const c = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};
const colored = (color, text) => JSON_MODE ? text : `${color}${text}${c.reset}`;

// ─── Env loading ─────────────────────────────────────────────────────────────
function loadEnvFile(filePath) {
  const vars = {};
  if (!existsSync(filePath)) return vars;
  const lines = readFileSync(filePath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.substring(0, eqIdx).trim();
      const val = trimmed.substring(eqIdx + 1).trim();
      vars[key] = val;
    }
  }
  return vars;
}

const env = existsSync(MCP_ENV_FILE)
  ? loadEnvFile(MCP_ENV_FILE)
  : loadEnvFile(join(ROOT_DIR, '.env'));

// [SCOPE 027 / T014] BEGIN — mcp-health-check resolves via runtime-state
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

function resolveMcpPort() {
  const runtimeFile = join(ROOT_DIR, '.wxai', 'kit-runtime.json');
  if (existsSync(runtimeFile)) {
    try {
      const parsed = JSON.parse(readFileSync(runtimeFile, 'utf8'));
      const mcp = parsed?.services?.mcp;
      if (mcp && typeof mcp.port === 'number' && isPidAliveSafe(mcp.pid)) {
        return mcp.port;
      }
    } catch { /* fall through */ }
  }
  return parseInt(
    env['MCP_HTTP_PORT'] || process.env['MCP_HTTP_PORT'] || '3002',
    10,
  );
}

const MCP_PORT = resolveMcpPort();
// [SCOPE 027 / T014] END

// ─── Results collector ───────────────────────────────────────────────────────
const results = {
  timestamp: new Date().toISOString(),
  port: MCP_PORT,
  checks: [],
  healthy: false,
};

function check(name, pass, detail = '') {
  results.checks.push({ name, pass, detail });
  if (!JSON_MODE) {
    const icon = pass ? colored(c.green, '✓') : colored(c.red, '✗');
    const label = pass ? colored(c.green, name) : colored(c.red, name);
    console.log(`  ${icon}  ${label}${detail ? `  ${colored(c.cyan, detail)}` : ''}`);
  }
}

function warn(name, detail = '') {
  results.checks.push({ name, pass: 'warn', detail });
  if (!JSON_MODE) {
    console.log(`  ${colored(c.yellow, '!')}  ${colored(c.yellow, name)}${detail ? `  ${colored(c.cyan, detail)}` : ''}`);
  }
}

// ─── HTTP health probe ───────────────────────────────────────────────────────
function httpGet(url, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      let body = '';
      res.on('data', (d) => (body += d));
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
  });
}

function httpPost(url, payload, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = http.request(
      url,
      {
        method: 'POST',
        timeout: timeoutMs,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let responseBody = '';
        res.on('data', (d) => (responseBody += d));
        res.on('end', () => resolve({ status: res.statusCode, body: responseBody }));
      }
    );

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
    req.write(body);
    req.end();
  });
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  if (!JSON_MODE) {
    console.log(`\n${colored(c.bold, 'wxKanban MCP Server — Health Check')}`);
    console.log(`  ${colored(c.cyan, `Target:`)} http://localhost:${MCP_PORT}\n`);
  }

  // 1. Required env vars
  const hasEncrypted =
    !!(env['DATABASE_URL_ENCRYPTED'] || process.env['DATABASE_URL_ENCRYPTED']);
  const hasDirectUrl =
    !!(env['WXKANBAN_MCP_DATABASE_URL'] || process.env['WXKANBAN_MCP_DATABASE_URL']);
  const hasApiToken =
    !!(env['WXKANBAN_API_TOKEN'] || process.env['WXKANBAN_API_TOKEN']);

  if (hasDirectUrl) {
    check('DB URL env var', true, 'WXKANBAN_MCP_DATABASE_URL present');
  } else if (hasEncrypted && hasApiToken) {
    check('DB URL env var', true, 'DATABASE_URL_ENCRYPTED + WXKANBAN_API_TOKEN present');
  } else if (hasEncrypted && !hasApiToken) {
    check('DB URL env var', false, 'DATABASE_URL_ENCRYPTED found but WXKANBAN_API_TOKEN missing');
  } else {
    check('DB URL env var', false, 'Neither WXKANBAN_MCP_DATABASE_URL nor DATABASE_URL_ENCRYPTED found');
  }

  // 2. MCP server dist file
  check('MCP dist file', existsSync(MCP_FILE), MCP_FILE);

  // 3. mcp-server node_modules
  const sdkPath = join(MCP_SERVER_DIR, 'node_modules', '@modelcontextprotocol', 'sdk');
  check('@modelcontextprotocol/sdk installed', existsSync(sdkPath), sdkPath);

  // 4. PID file
  let pid = null;
  if (existsSync(PID_FILE)) {
    pid = readFileSync(PID_FILE, 'utf8').trim();
    // Verify the PID is actually alive (Windows: tasklist, Unix: kill -0)
    let alive = false;
    try {
      if (process.platform === 'win32') {
        const result = spawnSync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH']);
        alive = result.stdout.toString().includes(`"${pid}"`);
      } else {
        process.kill(parseInt(pid), 0);
        alive = true;
      }
    } catch {
      alive = false;
    }
    if (alive) {
      check('PID file', true, `pid ${pid} alive`);
    } else {
      warn('PID file stale', `pid ${pid} not running — server may have crashed`);
      pid = null;
    }
  } else {
    warn('PID file', 'not found — server may not have been started via setup-mcp.mjs');
  }

  // 5. HTTP /health endpoint
  let httpOk = false;
  let httpDetail = '';
  try {
    const { status, body } = await httpGet(`http://localhost:${MCP_PORT}/health`);
    if (status === 200) {
      httpOk = true;
      try {
        const parsed = JSON.parse(body);
        httpDetail = `status=${parsed.status || 'ok'}`;
      } catch {
        httpDetail = `HTTP ${status}`;
      }
    } else {
      httpDetail = `HTTP ${status}`;
    }
  } catch (err) {
    httpDetail = err.message || 'connection refused';
  }
  check('HTTP /health endpoint', httpOk, httpDetail);

  // 6. Optional: MCP endpoint check
  let mcpOk = false;
  let mcpDetail = '';
  try {
    const { status } = await httpGet(`http://localhost:${MCP_PORT}/mcp`);
    mcpOk = status < 500;
    mcpDetail = `HTTP ${status}`;
  } catch (err) {
    mcpDetail = err.message || 'connection refused';
  }
  check('MCP /mcp endpoint', mcpOk, mcpDetail);

  // 7. Active MCP tool-call readiness
  let readinessOk = false;
  let readinessDetail = '';
  try {
    const { status, body } = await httpPost(
      `http://localhost:${MCP_PORT}/call`,
      { tool: 'project.help', args: {} },
      6000,
    );

    if (status === 200) {
      const parsed = JSON.parse(body);
      const hasContent = !!parsed && typeof parsed === 'object' && Array.isArray(parsed.content);
      readinessOk = hasContent;
      readinessDetail = hasContent ? 'project.help returned content[]' : 'project.help returned unexpected payload';
    } else {
      readinessDetail = `HTTP ${status}`;
    }
  } catch (err) {
    readinessDetail = err.message || 'tool-call readiness failed';
  }
  check('MCP readiness (project.help)', readinessOk, readinessDetail);

  // ─── Summary ────────────────────────────────────────────────────────────────
  const failed = results.checks.filter((c) => c.pass === false);
  results.healthy = httpOk && readinessOk && failed.length === 0;

  if (!JSON_MODE) {
    console.log('');
    if (results.healthy) {
      console.log(colored(c.green, `  ✓  MCP server is healthy on port ${MCP_PORT}`));
    } else {
      console.log(colored(c.red, `  ✗  MCP server is NOT healthy`));
      if (failed.length > 0) {
        console.log(colored(c.yellow, `     Failed checks: ${failed.map((f) => f.name).join(', ')}`));
      }
    }
    console.log('');
  } else {
    console.log(JSON.stringify(results, null, 2));
  }

  // ─── Restart on failure ──────────────────────────────────────────────────
  if (!results.healthy && RESTART_ON_FAIL) {
    if (!JSON_MODE) console.log(colored(c.yellow, '  Attempting restart via setup-mcp.mjs...'));
    const setupScript = join(ROOT_DIR, 'scripts', 'setup-mcp.mjs');
    if (existsSync(setupScript)) {
      try {
        execSync(`node "${setupScript}"`, { stdio: 'inherit', cwd: ROOT_DIR, shell: false });
      } catch (err) {
        if (!JSON_MODE) console.error(colored(c.red, `  Restart failed: ${err.message}`));
        process.exit(1);
      }
    } else {
      if (!JSON_MODE) console.error(colored(c.red, `  setup-mcp.mjs not found at ${setupScript}`));
    }
  }

  process.exit(results.healthy ? 0 : 1);
}

main().catch((err) => {
  console.error('Health check error:', err.message);
  process.exit(1);
});
