#!/usr/bin/env node
/**
 * orchestrator-health-check.mjs
 *
 * Probes the kit's runtime surface:
 *   - Hosted MCP (default https://mcp.wxperts.com/health, per spec 028 v1.1.0+).
 *     The MCP runs only on wxKanban-operated infrastructure; consumers don't
 *     spawn a local one anymore (spec 019 Decision #1).
 *   - Orchestrator HTTP Gateway. The port is assigned per-project at startup
 *     and recorded in .wxai/kit-runtime.json (services.gateway.port); this
 *     check resolves that live port rather than assuming a constant; with no
 *     recorded port it reports "no gateway running". Only required for stages that
 *     need local command dispatch (Implementation and later). In Design the
 *     kit's commands (buildscope, createspecs, dbpush, pipeline-agent) talk to
 *     the hosted MCP directly, so a missing gateway is informational rather
 *     than fatal.
 *
 * Exit codes:
 *   0 — MCP reachable, AND either the gateway is reachable OR the project
 *       is in a stage that doesn't need it.
 *   1 — MCP unreachable, or gateway unreachable in a stage that needs it.
 *
 * Usage:
 *   node scripts/orchestrator-health-check.mjs
 *   # GATEWAY_HTTP_URL overrides the runtime-resolved port only if you need to:
 *   MCP_HTTP_URL=https://staging.mcp.wxperts.com \
 *     GATEWAY_HTTP_URL=http://localhost:3865 \
 *     node scripts/orchestrator-health-check.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import tls from 'node:tls';
import { fileURLToPath } from 'node:url';

function parseEnvFile(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  for (const raw of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return out;
}

function readProjectJson() {
  const p = path.join(process.cwd(), '.wxai', 'project.json');
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return {};
  }
}

// The gateway port is assigned per-project at start and recorded in
// .wxai/kit-runtime.json (services.gateway: { port, pid, projectId, … }). It is
// NOT a fixed default — assuming :3003 probes the wrong process whenever this
// project's gateway bound a different port. Always resolve from runtime.
export function readGatewayRuntime(cwd = process.cwd()) {
  const p = path.join(cwd, '.wxai', 'kit-runtime.json');
  if (!fs.existsSync(p)) return null;
  try {
    const rt = JSON.parse(fs.readFileSync(p, 'utf8'));
    const g = rt?.services?.gateway;
    if (!g?.port) return null;
    return { port: g.port, pid: g.pid ?? null, projectId: g.projectId ?? null };
  } catch {
    return null;
  }
}

// Back-compat helper (tests + resolveGatewayUrl callers use the bare port).
export function readGatewayPort(cwd = process.cwd()) {
  return readGatewayRuntime(cwd)?.port ?? null;
}

// A recorded gateway pid that is no longer alive means the runtime file is stale
// (the gateway crashed or was killed without cleanup) — probing its port would
// find nothing, or worse a neighbouring project's gateway that reused the port.
// Signal 0 tests existence without touching the process; EPERM means it exists
// but is owned by another user (still alive). Returns null when the pid is
// unknown, so the caller falls back to a plain probe rather than over-asserting.
export function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err?.code === 'EPERM';
  }
}

// Resolve order: explicit override env, then the live port from
// .wxai/kit-runtime.json. With neither there is no gateway to probe, so return
// null and report "no gateway running" rather than guess :3003, which belongs
// to whichever project bound it (SCOPE-068 FR-001/FR-009, feedback ecacc0c6).
export function resolveGatewayUrl(envOverride, gatewayPort) {
  if (envOverride) return envOverride;
  if (gatewayPort) return `http://localhost:${gatewayPort}`;
  return null;
}

const envFromFile = parseEnvFile(path.join(process.cwd(), '.env'));
const projectJson = readProjectJson();
const gatewayRuntime = readGatewayRuntime();
const gatewayPort = gatewayRuntime?.port ?? null;
const gatewayPid = gatewayRuntime?.pid ?? null;
const gatewayLive = pidAlive(gatewayPid); // true | false | null(unknown)
// Identity: assert the gateway we reach is THIS project's, not a neighbour that
// reused the port. Expected id = what our own gateway recorded at startup.
const expectGatewayProjectId = gatewayRuntime?.projectId ?? null;

// v1.1.0+: the MCP is hosted. Falling back to localhost:3002 is wrong because
// that port is guaranteed to be unbound on a v1.1.0 install. Resolve from
// (in order): explicit override env, kit env from .env, .wxai/project.json
// kit block, then the production default.
const MCP_URL =
  process.env.MCP_HTTP_URL ||
  process.env.WXKANBAN_MCP_BASE_URL ||
  envFromFile.WXKANBAN_MCP_BASE_URL ||
  envFromFile.MCP_BASE_URL ||
  projectJson?.kit?.mcpBaseUrl ||
  'https://mcp.wxperts.com';

const GATEWAY_URL = resolveGatewayUrl(process.env.GATEWAY_HTTP_URL, gatewayPort);

// Gateway is only required for stages that dispatch local commands. In Design
// the kit talks to the hosted MCP directly, so an absent gateway is a warning,
// not a failure. The set mirrors core/policy/capabilities.ts: cross-cutting
// commands work in every stage, but Implementation+ also need the local
// gateway to drive `implement`, `runqa`, etc.
const GATEWAY_OPTIONAL_STAGES = new Set(['Design']);
const lifecycleStage =
  process.env.WXKANBAN_LIFECYCLE_STAGE ||
  projectJson?.lifecycleStage ||
  'Design';
const gatewayRequired = !GATEWAY_OPTIONAL_STAGES.has(lifecycleStage);

const TIMEOUT_MS = 3000;

async function probe(label, url, expectProjectId = null) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    // Connection: close so undici doesn't keep sockets in the keep-alive pool
    // past the response — which on Windows triggers UV_HANDLE_CLOSING during
    // process teardown and leaks a non-zero exit.
    const response = await fetch(`${url}/health`, {
      signal: controller.signal,
      headers: { Connection: 'close' },
    });
    const body = await response.json().catch(() => ({}));
    if (response.ok && (body?.status === 'ok')) {
      // Identity guard: a healthy response from a DIFFERENT project's gateway (a
      // neighbour that reused this port) must not be reported as ours.
      if (expectProjectId && body.projectId && body.projectId !== expectProjectId) {
        console.log(`  ✗ ${label.padEnd(18)} ${url}  identity mismatch — reached a different project's gateway (${String(body.projectId).slice(0, 8)}… ≠ this project ${String(expectProjectId).slice(0, 8)}…); the port was likely reused by another kit project`);
        return false;
      }
      const meta = [body.service, body.transport, body.port ? `port ${body.port}` : null]
        .filter(Boolean)
        .join(' · ');
      console.log(`  ✓ ${label.padEnd(18)} ${url}  ${meta}`);
      return true;
    }
    console.log(`  ✗ ${label.padEnd(18)} ${url}  HTTP ${response.status} — ${JSON.stringify(body).slice(0, 80)}`);
    return false;
  } catch (err) {
    const msg = err?.name === 'AbortError' ? `timeout after ${TIMEOUT_MS}ms` : err?.message ?? String(err);
    console.log(`  ✗ ${label.padEnd(18)} ${url}  ${msg}`);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// Trust the OS cert store so the health check works behind a corporate TLS-
// inspection proxy without a NODE_OPTIONS flag (runs as its own process,
// spawned by init.mjs). Feature-detected (Node 24+); never throws.
function trustSystemCertificates() {
  try {
    if (typeof tls.setDefaultCACertificates !== 'function' ||
        typeof tls.getCACertificates !== 'function') return;
    const system = tls.getCACertificates('system');
    if (Array.isArray(system) && system.length > 0) {
      tls.setDefaultCACertificates([...tls.getCACertificates('bundled'), ...system]);
    }
  } catch {
    /* fall back to default trust silently */
  }
}

async function main() {
  trustSystemCertificates();
  console.log('wxKanban kit health check');
  console.log('─────────────────────────');
  console.log(`  stage: ${lifecycleStage} (gateway ${gatewayRequired ? 'required' : 'optional'})`);
  const checkGateway = async () => {
    if (!GATEWAY_URL) {
      console.log(`  ✗ ${'Orchestrator gateway'.padEnd(18)} no gateway running for this project (nothing recorded in .wxai/kit-runtime.json)`);
      return false;
    }
    // If we recorded a gateway pid and it is provably dead, the runtime entry is
    // stale — report "not running" instead of probing a port that is either
    // silent or owned by another project.
    if (gatewayRuntime && gatewayLive === false) {
      console.log(`  ✗ ${'Orchestrator gateway'.padEnd(18)} recorded pid ${gatewayPid} is not running (stale .wxai/kit-runtime.json)`);
      return false;
    }
    return probe('Orchestrator gateway', GATEWAY_URL, expectGatewayProjectId);
  };
  const [mcpOk, gwOk] = await Promise.all([
    probe('Hosted MCP', MCP_URL),
    checkGateway(),
  ]);
  console.log('');

  if (!mcpOk) {
    console.log('✗ Hosted MCP not reachable.');
    console.log('');
    console.log('  • Confirm outbound HTTPS to ' + MCP_URL + ' is allowed by your network.');
    console.log('  • Re-run install:   node scripts/init.mjs');
    console.log('  • Staging target:   WXKANBAN_MCP_BASE_URL=https://staging.mcp.wxperts.com');
    // Setting exitCode (rather than calling process.exit) lets Node drain the
    // event loop naturally — prevents UV_HANDLE_CLOSING on Windows when
    // undici sockets are still closing.
    process.exitCode = 1;
    return;
  }

  if (!gwOk && gatewayRequired) {
    console.log('✗ Orchestrator gateway not reachable (required in stage ' + lifecycleStage + ').');
    console.log('');
    console.log('  Start it manually:');
    console.log('    npm run kit:start');
    console.log('  Or re-run install:');
    console.log('    node scripts/init.mjs');
    process.exitCode = 1;
    return;
  }

  if (!gwOk) {
    console.log('✓ Hosted MCP healthy.');
    console.log('  (Gateway not running — not required in stage ' + lifecycleStage + '. Design-stage');
    console.log('   commands talk to the hosted MCP directly.)');
  } else {
    console.log('✓ All services healthy.');
  }
  process.exitCode = 0;
}

// Only probe when run as a script — importing the module (e.g. from tests to
// exercise resolveGatewayUrl/readGatewayPort) must not fire a network check.
const isMainModule = path.resolve(process.argv[1] ?? '') === path.resolve(fileURLToPath(import.meta.url));
if (isMainModule) {
  main().catch((err) => {
    console.error('unexpected failure:', err);
    process.exitCode = 2;
  });
}
