#!/usr/bin/env node
/**
 * Spec 028 / T026 — kit:start router.
 *
 * Routes between the hosted MCP path and the legacy local-MCP path:
 *   hosted  : MCP_BASE_URL=https://...    → setup-gateway only
 *   legacy  : MCP_BASE_URL unset/http://* → setup-mcp + setup-gateway
 *
 * The legacy path is preserved verbatim from spec 027; this script only
 * adds the branching layer. To pin the legacy path explicitly, use
 * `kit:start:legacy`.
 */
import { spawnSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PROJECT_JSON = join(ROOT, '.wxai', 'project.json');
const WXKANBAN_PROJECT_JSON = join(ROOT, '.wxkanban-project.json');

// MCP is hosted-only (spec 028). Resolution MUST match
// wxkanban-agent/core/context/runtime-state.ts resolveMcpBaseUrl so the launcher,
// the status script and the kit runtime all agree: env override → .wxai/project.json
// kit.mcpBaseUrl → .wxkanban-project.json mcpBaseUrl → hosted default. The only way
// to take the legacy local-MCP path is to explicitly point at an http:// URL.
const HOSTED_MCP_BASE_URL = 'https://mcp.wxperts.com';

function readJsonField(path, pick) {
  if (!existsSync(path)) return null;
  try {
    const v = pick(JSON.parse(readFileSync(path, 'utf-8')));
    return typeof v === 'string' && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

function resolveMcpBaseUrl() {
  const env =
    process.env.WXKANBAN_MCP_BASE_URL ||
    process.env.MCP_BASE_URL ||
    process.env.MCP_HTTP_URL;
  if (env && env.length > 0) return env;

  return (
    readJsonField(PROJECT_JSON, (j) => j?.kit?.mcpBaseUrl) ??
    readJsonField(WXKANBAN_PROJECT_JSON, (j) => j?.mcpBaseUrl) ??
    HOSTED_MCP_BASE_URL
  );
}

// shell:true runs a .cmd shim through cmd.exe — a console program. Launched from a
// console-less parent (the VS Code task runner), Windows hands it a fresh, VISIBLE
// console window. windowsHide suppresses that; inherited stdio still carries the
// output. Same reasoning as init.mjs's npm spawn — see feedback e8849e53 / 8a2b439a.
function run(cmd, args) {
  const r = spawnSync(cmd, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    windowsHide: true,
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

// Best-effort run: log a warning on non-zero exit instead of aborting kit:start.
function runSoft(cmd, args, label) {
  const r = spawnSync(cmd, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    windowsHide: true,
  });
  if (r.status !== 0) {
    console.warn(`[kit:start] ${label} exited with code ${r.status ?? 1} — continuing (non-fatal).`);
  }
}

// One-time dependency bootstrap for a freshly downloaded kit.
//
// On the first run we install dependencies and patch known vulnerabilities, then
// stamp `depsBootstrapped` into .wxkanban-project.json. That file is preserved by
// scripts/upgrade-kit.mjs (it is NOT in KIT_FILES), so kit *updates* see the stamp
// and skip this — the bootstrap runs once per fresh install, never on upgrade.
function bootstrapDependencies() {
  let cfg = {};
  if (existsSync(WXKANBAN_PROJECT_JSON)) {
    try {
      cfg = JSON.parse(readFileSync(WXKANBAN_PROJECT_JSON, 'utf-8')) ?? {};
    } catch {
      cfg = {};
    }
  }

  if (cfg.depsBootstrapped) return; // already done on a previous fresh install

  console.log('[kit:start] First run on a new kit download — installing dependencies...');
  run('npm', ['install']);

  console.log('[kit:start] Patching known vulnerabilities (npm audit fix)...');
  runSoft('npm', ['audit', 'fix'], 'npm audit fix');

  cfg.depsBootstrapped = true;
  cfg.depsBootstrappedAt = new Date().toISOString();
  try {
    writeFileSync(WXKANBAN_PROJECT_JSON, JSON.stringify(cfg, null, 2) + '\n', 'utf-8');
    console.log('[kit:start] Dependency bootstrap complete — stamped depsBootstrapped (skipped on future runs/updates).');
  } catch (err) {
    console.warn(`[kit:start] Could not persist depsBootstrapped flag: ${err.message}. Bootstrap may re-run next time.`);
  }
}

bootstrapDependencies();

const baseUrl = resolveMcpBaseUrl();
const hosted = /^https:\/\//i.test(baseUrl);

// [SCOPE 121 / T015] BEGIN — do not invoke setup-mcp.mjs when it is not on disk
// setup-mcp.mjs was deleted from the kit at v1.1.0 (hosted-MCP cutover) but this branch kept
// spawning it, so an explicit local-MCP override took kit:start down with MODULE_NOT_FOUND instead
// of starting the gateway. wxKanban's own tree still has the script, so the presence check keeps the
// legacy path working here while the kit — which ships no such file — degrades to a warning.
if (hosted) {
  console.log(`[kit:start] Hosted MCP at ${baseUrl}; skipping local MCP spawn.`);
} else {
  const legacyMcp = join('scripts', 'setup-mcp.mjs');
  if (existsSync(legacyMcp)) {
    console.log(`[kit:start] Explicit local MCP override (${baseUrl}); using legacy local MCP path.`);
    run('node', [legacyMcp]);
  } else {
    console.warn(
      `[kit:start] Local MCP override requested (${baseUrl}), but the legacy local-MCP path was ` +
        'removed in kit v1.1.0 and setup-mcp.mjs is not present. Starting the gateway only — ' +
        'point WXKANBAN_MCP_BASE_URL at the hosted MCP to silence this.',
    );
  }
}
run('node', [join('scripts', 'setup-gateway.mjs')]);
// [SCOPE 121 / T015] END
