#!/usr/bin/env node
/**
 * orchestrator-health-check.mjs
 *
 * Pings both services that the kit's .vscode/tasks.json auto-starts:
 *   - MCP server (default http://localhost:3002/health)
 *   - Orchestrator HTTP Gateway (default http://localhost:3003/health)
 *
 * Exits 0 if both are reachable with status 'ok', 1 otherwise.
 *
 * Usage:
 *   node scripts/orchestrator-health-check.mjs
 *   MCP_HTTP_URL=http://localhost:3002 GATEWAY_HTTP_URL=http://localhost:3003 \
 *     node scripts/orchestrator-health-check.mjs
 */

const MCP_URL = process.env.MCP_HTTP_URL || 'http://localhost:3002';
const GATEWAY_URL = process.env.GATEWAY_HTTP_URL || 'http://localhost:3003';
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
  const [mcpOk, gwOk] = await Promise.all([
    probe('MCP server',         MCP_URL),
    probe('Orchestrator gateway', GATEWAY_URL),
  ]);
  console.log('');
  if (mcpOk && gwOk) {
    console.log('✓ All services healthy.');
    // Setting exitCode (rather than calling process.exit) lets Node drain the
    // event loop naturally — prevents UV_HANDLE_CLOSING on Windows when
    // undici sockets are still closing.
    process.exitCode = 0;
    return;
  }

  console.log('✗ One or more services not reachable.');
  console.log('');
  console.log('To start them manually:');
  console.log('  MCP:          node scripts/setup-mcp.mjs');
  console.log('  Orchestrator: node wxkanban-agent/apps/command-gateway/bin/wxai-http.mjs');
  console.log('');
  console.log('If you opened this folder in VSCode, both start automatically via .vscode/tasks.json.');
  process.exitCode = 1;
}

main().catch((err) => {
  console.error('unexpected failure:', err);
  process.exitCode = 2;
});
