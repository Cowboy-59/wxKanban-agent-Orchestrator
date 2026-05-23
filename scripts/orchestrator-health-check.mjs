#!/usr/bin/env node
/**
 * orchestrator-health-check.mjs
 *
 * Probes the kit's runtime surface:
 *   - Hosted MCP (default https://mcp.wxperts.com/health, per spec 028 v1.1.0+).
 *     The MCP runs only on wxKanban-operated infrastructure; consumers don't
 *     spawn a local one anymore (spec 019 Decision #1).
 *   - Orchestrator HTTP Gateway (default http://localhost:3003/health). Only
 *     required for stages that need local command dispatch (Implementation
 *     and later). In Design the kit's commands (buildscope, createspecs,
 *     dbpush, pipeline-agent) talk to the hosted MCP directly, so a missing
 *     gateway is informational rather than fatal.
 *
 * Exit codes:
 *   0 — MCP reachable, AND either the gateway is reachable OR the project
 *       is in a stage that doesn't need it.
 *   1 — MCP unreachable, or gateway unreachable in a stage that needs it.
 *
 * Usage:
 *   node scripts/orchestrator-health-check.mjs
 *   MCP_HTTP_URL=https://staging.mcp.wxperts.com \
 *     GATEWAY_HTTP_URL=http://localhost:3003 \
 *     node scripts/orchestrator-health-check.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

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

const envFromFile = parseEnvFile(path.join(process.cwd(), '.env'));
const projectJson = readProjectJson();

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

const GATEWAY_URL = process.env.GATEWAY_HTTP_URL || 'http://localhost:3003';

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

async function probe(label, url) {
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

async function main() {
  console.log('wxKanban kit health check');
  console.log('─────────────────────────');
  console.log(`  stage: ${lifecycleStage} (gateway ${gatewayRequired ? 'required' : 'optional'})`);
  const [mcpOk, gwOk] = await Promise.all([
    probe('Hosted MCP',        MCP_URL),
    probe('Orchestrator gateway', GATEWAY_URL),
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
    console.log('    node wxkanban-agent/apps/command-gateway/bin/wxai-http.mjs');
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

main().catch((err) => {
  console.error('unexpected failure:', err);
  process.exitCode = 2;
});
