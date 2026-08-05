#!/usr/bin/env node

import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
const RUNTIME_STATE_FILE = join(ROOT_DIR, '.wxai', 'kit-runtime.json');

const args = process.argv.slice(2);
const JSON_MODE = args.includes('--json') || args.includes('--format=json');
const STRICT = args.includes('--strict');

// MCP is hosted-only (spec 028) — it is NOT a locally-tracked service. The only
// local service the kit runs is the gateway; MCP is reported via a hosted /health
// probe (see resolveMcpBaseUrl + probeHostedMcp), mirroring kit-start's router.
const EXPECTED_SERVICES = ['gateway'];
const HOSTED_MCP_BASE_URL = 'https://mcp.wxperts.com';

// [SCOPE 027 / T017] BEGIN — kit:status npm-script entry
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

// Resolution mirrors wxkanban-agent/core/context/runtime-state.ts resolveMcpBaseUrl:
// env override → .wxai/project.json kit.mcpBaseUrl → .wxkanban-project.json
// mcpBaseUrl → hosted default. Never a local port.
function resolveMcpBaseUrl() {
  const env =
    process.env.WXKANBAN_MCP_BASE_URL ||
    process.env.MCP_BASE_URL ||
    process.env.MCP_HTTP_URL;
  if (env && env.length > 0) return env;

  try {
    const p = join(ROOT_DIR, '.wxai', 'project.json');
    if (existsSync(p)) {
      const v = JSON.parse(readFileSync(p, 'utf8'))?.kit?.mcpBaseUrl;
      if (typeof v === 'string' && v.length > 0) return v;
    }
  } catch { /* ignore */ }

  try {
    const p = join(ROOT_DIR, '.wxkanban-project.json');
    if (existsSync(p)) {
      const v = JSON.parse(readFileSync(p, 'utf8'))?.mcpBaseUrl;
      if (typeof v === 'string' && v.length > 0) return v;
    }
  } catch { /* ignore */ }

  return HOSTED_MCP_BASE_URL;
}

async function probeHostedMcp(baseUrl) {
  const url = `${baseUrl.replace(/\/$/, '')}/health`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return { ok: false, baseUrl, error: `HTTP ${res.status}` };
    const body = await res.json().catch(() => ({}));
    return {
      ok: true,
      baseUrl,
      version: body?.version ?? null,
      dbConnected: body?.dbConnected ?? null,
    };
  } catch (err) {
    return { ok: false, baseUrl, error: err?.name === 'AbortError' ? 'timeout' : err.message };
  } finally {
    clearTimeout(timer);
  }
}

function formatUptime(uptimeSec) {
  if (uptimeSec < 60) return `${uptimeSec}s`;
  const m = Math.floor(uptimeSec / 60);
  const s = uptimeSec % 60;
  if (m < 60) return `${m}m${s}s`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  return `${h}h${remM}m${s}s`;
}

function buildReport(state) {
  const now = Date.now();
  const report = {
    schemaVersion: state.schemaVersion,
    services: {},
    summary: { healthy: 0, stale: 0, missing: 0 },
  };
  for (const name of EXPECTED_SERVICES) {
    const entry = state.services[name];
    if (!entry) {
      report.services[name] = {
        port: null, pid: null, parentpid: null,
        alive: false, parentAlive: false, uptimeSec: null,
        health: 'missing',
      };
      report.summary.missing++;
      continue;
    }
    const alive = isPidAliveSafe(entry.pid);
    const parentAlive = isPidAliveSafe(entry.parentpid);
    const startedAtMs = Date.parse(entry.startedAt);
    const uptimeSec = Number.isFinite(startedAtMs)
      ? Math.max(0, Math.floor((now - startedAtMs) / 1000))
      : null;
    report.services[name] = {
      port: entry.port, pid: entry.pid, parentpid: entry.parentpid,
      alive, parentAlive, uptimeSec,
      health: alive ? 'alive' : 'stale',
    };
    if (alive) report.summary.healthy++;
    else report.summary.stale++;
  }
  return report;
}

function renderText(report, mcp) {
  const lines = [];
  lines.push(
    mcp.ok
      ? `mcp        HOSTED ${mcp.baseUrl} (ok${mcp.version ? ` v${mcp.version}` : ''}${mcp.dbConnected === true ? ', db' : ''})`
      : `mcp        HOSTED ${mcp.baseUrl} (UNREACHABLE — ${mcp.error})`,
  );
  for (const name of EXPECTED_SERVICES) {
    const s = report.services[name];
    if (s.health === 'missing') {
      lines.push(`${name.padEnd(10)} NOT RUNNING`);
      continue;
    }
    if (s.health === 'stale') {
      lines.push(`${name.padEnd(10)} port=${s.port} pid=${s.pid} (STALE — pid not alive)`);
      continue;
    }
    const parentTag = s.parentAlive ? 'parent alive' : 'parent gone';
    const uptime = s.uptimeSec !== null ? formatUptime(s.uptimeSec) : '?';
    lines.push(`${name.padEnd(10)} port=${s.port} pid=${s.pid} (alive, ${parentTag}) up=${uptime}`);
  }
  lines.push('');
  lines.push(
    `${report.summary.healthy} healthy, ${report.summary.stale} stale, ${report.summary.missing} missing, mcp ${mcp.ok ? 'ok' : 'unreachable'}`,
  );
  return lines.join('\n');
}

async function main() {
  const mcp = await probeHostedMcp(resolveMcpBaseUrl());

  if (!existsSync(RUNTIME_STATE_FILE)) {
    if (JSON_MODE) {
      console.log(JSON.stringify({
        schemaVersion: null,
        services: {},
        mcp,
        summary: { healthy: 0, stale: 0, missing: EXPECTED_SERVICES.length },
        error: 'runtime-state file missing or unreadable',
      }, null, 2));
    } else {
      console.log('kit:status: runtime-state file not found (.wxai/kit-runtime.json)');
      console.log(`mcp (hosted): ${mcp.ok ? 'ok' : `UNREACHABLE — ${mcp.error}`} ${mcp.baseUrl}`);
      console.log('Run `npm run kit:start` to start the gateway.');
    }
    process.exit(2);
  }

  let parsed;
  try {
    parsed = JSON.parse(readFileSync(RUNTIME_STATE_FILE, 'utf8'));
  } catch (err) {
    if (JSON_MODE) {
      console.log(JSON.stringify({ error: `malformed runtime-state file: ${err.message}`, mcp }, null, 2));
    } else {
      console.error(`kit:status: cannot parse ${RUNTIME_STATE_FILE}: ${err.message}`);
    }
    process.exit(2);
  }

  if (parsed.schemaVersion !== 1) {
    if (JSON_MODE) {
      console.log(JSON.stringify({ error: `unknown schemaVersion: ${parsed.schemaVersion}`, mcp }, null, 2));
    } else {
      console.error(`kit:status: unknown schemaVersion ${parsed.schemaVersion} (expected 1)`);
    }
    process.exit(2);
  }

  const report = buildReport(parsed);
  console.log(JSON_MODE ? JSON.stringify({ ...report, mcp }, null, 2) : renderText(report, mcp));

  const localErrors = STRICT
    ? report.summary.stale + report.summary.missing
    : report.summary.missing;
  const errorCount = localErrors + (mcp.ok ? 0 : 1);
  process.exit(errorCount > 0 ? 1 : 0);
}
// [SCOPE 027 / T017] END

main();
