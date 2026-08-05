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
import tls from 'node:tls';
// Spec 042 — single source of truth for the Dev Cockpit install (also run by
// the .vscode/tasks.json folderOpen task so a fresh download installs it too).
import { installCockpitExtension } from './install-cockpit-extension.mjs';

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
         `              --token <token>  --project-id ${projectId}  --mcp-url ${baseUrl}`);
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
  // windowsHide (CREATE_NO_WINDOW) is REQUIRED here, not cosmetic. This is a
  // detached, long-lived console process (node.exe) started from VS Code's task
  // runner, which owns no console of its own — so Windows hands the child a
  // fresh, VISIBLE console window that then lingers for the life of the gateway.
  // The folderOpen task runs this on EVERY project open, so the windows stack up
  // across a multi-project estate. Field report: feedback e8849e53 / 8a2b439a
  // (window titled with the node.exe path, exactly process.execPath).
  // `detached` STAYS — it is what survives the launching task exiting.
  const child = spawn(process.execPath, [entry], {
    cwd: root,
    env,
    detached: true,
    stdio: ['ignore', outFd, outFd],
    windowsHide: true,
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
    // windowsHide: stdio is inherited, so output still flows to the task
    // terminal; this only stops Windows allocating a NEW console when the parent
    // has none (VS Code task runner / extension host). See feedback e8849e53.
    const c = spawn(process.execPath, [healthCheckScript], { cwd: root, stdio: 'inherit', windowsHide: true });
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
      // shell:true runs npm.cmd through cmd.exe — a console program. Without
      // windowsHide a console-less parent gets a new visible window. Inherited
      // stdio still carries the output. See feedback e8849e53.
      windowsHide: true,
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
  // Best-effort: clear advisories pulled in transitively. Never blocks startup —
  // a transient or unfixable advisory must not wedge a fresh install.
  console.log('[init] running `npm audit fix`…');
  await new Promise((resolve) => {
    const c = spawn(npmCmd, ['audit', 'fix'], {
      cwd: root,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      windowsHide: true, // see the npm install spawn above
    });
    c.on('exit', () => resolve());
    c.on('error', (err) => {
      console.error(`[init] npm audit fix skipped: ${err.message}`);
      resolve();
    });
  });
}

// Trust the OS cert store so install runs behind a corporate TLS-inspection
// proxy (Cisco Secure Access, Zscaler, …) without a NODE_OPTIONS=--use-system-ca
// prefix. init.mjs is spawned by upgrade-kit as its own process, so it needs the
// in-process trust independently (this is what caused the init /health + /call
// fetches to fail and retry). Feature-detected (Node 24+); no-ops on older Node,
// never throws. See BUG-REPORT-kit-dbpush-tls-and-packaging.md.
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

// Remove files that newer kit versions RENAMED or REMOVED. init.mjs runs after
// every extract (upgrade-kit calls runInit()), and it's the FRESHLY-EXTRACTED
// copy that runs — so unlike upgrade-kit's own cleanup, this also fires on the
// bootstrap upgrade INTO the version that ships it. Idempotent; safe to re-run.
function cleanupStaleKitFiles() {
  const renamed = [
    '_wxAI/skills/wxConversion-analyst.md',
    'wxkanban-agent/templates/skills/wxConversion-analyst.md',
    '_wxAI/commands/wxConversionFromPDF.md',
    '_wxAI/commands/wxConversionScopeFromPDF.md',
    '.claude/commands/wxConversionFromPDF.md',
    '.claude/commands/wxConversionScopeFromPDF.md',
    '_wxAI/skills/wxConversionFromPDF',
    '_wxAI/skills/wxConversionScopeFromPDF',
    '.claude/skills/wxConversionFromPDF',
    '.claude/skills/wxConversionScopeFromPDF',
    // earlier handler mistakenly used .claude/skills/<name>; correct home is .claude/<name>
    '.claude/skills/wxConversion',
    '.claude/skills/wxConversionScope',
    'wxkanban-agent/templates/skills/wxConversionFromPDF',
    'wxkanban-agent/templates/skills/wxConversionScopeFromPDF',
  ];
  // Raw TS source — only once the kit actually ships the compiled bundle.
  const distPresent = fs.existsSync(path.join(root, 'wxkanban-agent', 'dist', 'cli.cjs'));
  const sourceTrees = distPresent
    ? [
        'wxkanban-agent/core',
        'wxkanban-agent/services',
        'wxkanban-agent/workers',
        'wxkanban-agent/adapters',
        'wxkanban-agent/apps/command-gateway/src',
        'wxkanban-agent/dbpush.ts',
      ]
    : [];
  let removed = 0;
  for (const rel of [...renamed, ...sourceTrees]) {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) continue;
    try {
      fs.rmSync(abs, { recursive: true, force: true });
      console.log(`[init] removed stale ${rel}`);
      removed++;
    } catch (err) {
      console.log(`[init] could not remove ${rel}: ${err?.message ?? err}`);
    }
  }
  if (removed > 0) console.log(`[init] stale-file cleanup: ${removed} path(s) removed`);
}

// Register the hosted MCP with Claude Code so its tools (project.get_command_prompt,
// buildscope, etc.) actually load. Claude Code reads project-scoped MCP servers from
// `.mcp.json` at the repo root (NOT .claude/settings.json). The hosted server speaks
// the MCP Streamable HTTP transport (POST /mcp — stateless and proxy-safe, so it
// survives TLS-inspection / SSE-buffering proxies) and authenticates via a bearer
// header — project scope is derived from the token, so no project-id header is needed.
// The token is written literally (Claude Code does not load .env), so the file is a
// per-project secret and must be gitignored. Other servers already present are kept.
// NOTE: the legacy SSE transport at /sse still exists server-side as a fallback but is
// no longer registered here — it is not proxy-safe and does not carry write scope.
function writeClaudeMcpRegistration(cfg) {
  const mcpJsonPath = path.join(root, '.mcp.json');
  const url = `${cfg.mcpBaseUrl.replace(/\/$/, '')}/mcp`;
  const entry = { type: 'http', url, headers: { Authorization: `Bearer ${cfg.apiToken}` } };

  let doc = {};
  if (fs.existsSync(mcpJsonPath)) {
    try {
      doc = JSON.parse(fs.readFileSync(mcpJsonPath, 'utf8')) || {};
    } catch {
      console.log('[init] .mcp.json was unparseable — rewriting it');
      doc = {};
    }
  }
  if (!doc.mcpServers || typeof doc.mcpServers !== 'object') doc.mcpServers = {};

  const prev = doc.mcpServers.wxkanban;
  const unchanged =
    prev && prev.type === entry.type && prev.url === entry.url &&
    prev.headers?.Authorization === entry.headers.Authorization;

  doc.mcpServers.wxkanban = entry;

  // shadcn-ui MCP — registered automatically because the kit shipped ONLY `wxkanban`,
  // so nobody outside the wxKanban repo ever had it. A customer reported /wxDesigner
  // behaving as though an external MCP were a prerequisite; it is not, but the honest
  // fix is to actually supply the one that is free rather than only document a fallback.
  //
  // It costs nothing: a stdio server fetched by npx, no account, no sign-up. Note this
  // is the LOOKUP service for the component catalog — the shadcn components themselves
  // are already installed in the project under src/client/components/ui/, so a failure
  // here degrades convenience, never the component library.
  //
  // Deliberately NO GITHUB_PERSONAL_ACCESS_TOKEN. That is a personal secret and must
  // never ship in a generated file. Without one the server uses GitHub's unauthenticated
  // rate limit (60 req/hr rather than 5000), which is ample for interactive design work.
  // A developer wanting the higher ceiling adds their own token to this entry — which is
  // exactly why an entry that already exists is never overwritten.
  //
  // Windows needs `cmd /c` because npx is a .cmd shim and cannot be spawned directly.
  const addedShadcn = !doc.mcpServers['shadcn-ui'];
  if (addedShadcn) {
    doc.mcpServers['shadcn-ui'] =
      process.platform === 'win32'
        ? { type: 'stdio', command: 'cmd', args: ['/c', 'npx', '-y', '@jpisnice/shadcn-ui-mcp-server'] }
        : { type: 'stdio', command: 'npx', args: ['-y', '@jpisnice/shadcn-ui-mcp-server'] };
  }

  const tmp = `${mcpJsonPath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(doc, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, mcpJsonPath);
  ensureGitignored('.mcp.json');

  if (addedShadcn) {
    console.log('[init] ✓ registered shadcn-ui MCP (free, no account) → .mcp.json');
  }

  if (unchanged) {
    console.log('[init] Claude Code MCP already registered (.mcp.json)');
  } else {
    console.log(`[init] ✓ registered hosted MCP with Claude Code → .mcp.json (${url})`);
    console.log('[init]   Restart Claude Code, then approve "wxkanban" via /mcp (project MCP servers need one-time approval).');
  }
}

// Ensure a path is gitignored (.mcp.json carries the bearer token).
function ensureGitignored(rel) {
  const giPath = path.join(root, '.gitignore');
  const content = fs.existsSync(giPath) ? fs.readFileSync(giPath, 'utf8') : '';
  if (content.split(/\r?\n/).map((l) => l.trim()).includes(rel)) return;
  const sep = content.length && !content.endsWith('\n') ? '\n' : '';
  fs.appendFileSync(giPath, `${sep}# wxKanban MCP registration (contains a project API token)\n${rel}\n`);
  console.log(`[init] added ${rel} to .gitignore`);
}

async function main() {
  trustSystemCertificates();
  console.log('\nwxKanban kit — install\n──────────────────────');

  cleanupStaleKitFiles();

  await ensureDepsInstalled();

  const cfg = loadConfig();
  console.log(`[init] config: mcpBaseUrl=${cfg.mcpBaseUrl}  token=${fmt(cfg.apiToken)}  projectId=${cfg.projectId || '(missing)'}`);

  if (!cfg.apiToken || !cfg.projectId) {
    bail(
      `kit is not configured.\n\n` +
      `Run kit-configure first:\n\n` +
      `  node wxkanban-agent/bin/wxkanban-agent kit-configure \\\n` +
      `    --token <token minted at wxkanban.wxperts.com → Admin → Projects → API tokens> \\\n` +
      `    --project-id <project-uuid> \\\n` +
      `    --mcp-url https://mcp.wxperts.com\n\n` +
      `(Ask a wxKanban admin to mint the token at wxkanban.wxperts.com → Admin → Projects.)`
    );
  }

  await checkHostedMcp(cfg.mcpBaseUrl);
  await checkToken(cfg.mcpBaseUrl, cfg.apiToken, cfg.projectId);

  // Register the hosted MCP with Claude Code (.mcp.json) so MCP-delivered commands
  // load. Best-effort: a write failure must not block the rest of the install.
  try {
    writeClaudeMcpRegistration(cfg);
  } catch (err) {
    console.log(`[init] Claude Code MCP registration skipped (${err?.message ?? err}).`);
  }

  startGateway(cfg);

  // Spec 042 — install/update the Dev Cockpit VS Code extension (best-effort).
  try {
    installCockpitExtension(root);
  } catch (err) {
    console.log(`[init] Dev Cockpit install skipped (${err?.message ?? err}).`);
  }

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
