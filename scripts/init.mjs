#!/usr/bin/env node
/**
 * init.mjs — one-shot kit install/startup.
 *
 * Behavior:
 *   - If the kit content is missing (wxkanban-agent/ not present), prompts
 *     the user to pick tar.gz or zip, downloads the latest GitHub release,
 *     and extracts it into the current directory.
 *   - Ensures root + agent deps are installed (runs `npm install` where
 *     node_modules is missing).
 *   - Starts the MCP server via setup-mcp.mjs (detached, PID tracked).
 *   - Starts the Orchestrator HTTP Gateway (detached, PID tracked).
 *   - Polls both /health endpoints for up to 15s; reports status.
 *
 * Idempotent: already-running services are left alone; existing
 * node_modules are not reinstalled.
 *
 * Usage: node scripts/init.mjs
 */

import fs from 'fs';
import path from 'path';
import { spawn, spawnSync } from 'child_process';
import { createWriteStream } from 'fs';
import { fileURLToPath } from 'url';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import readline from 'readline';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const logsDir = path.join(root, 'logs');
const gwEntry = path.join(root, 'wxkanban-agent', 'apps', 'command-gateway', 'bin', 'wxai-http.mjs');
const gwPidPath = path.join(root, '.orchestrator-gateway.pid');
const gwLogPath = path.join(logsDir, 'orchestrator-gateway.log');
const healthScript = path.join(here, 'orchestrator-health-check.mjs');

const GH_OWNER = 'Cowboy-59';
const GH_REPO = 'wxKanban-agent-Orchestrator';

function isRunning(pid) { try { process.kill(pid, 0); return true; } catch { return false; } }

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, answer => { rl.close(); resolve(answer.trim()); }));
}

async function maybeDownloadKit() {
  const hasAgent = fs.existsSync(path.join(root, 'wxkanban-agent'));
  const hasMcp = fs.existsSync(path.join(root, 'mcp-server'));
  if (hasAgent && hasMcp) return;

  console.log('\nKit content not detected in the current directory.');
  console.log('Choose archive format:');
  console.log('  A) tar.gz  (Unix / Mac)');
  console.log('  B) zip     (Windows)');
  const ans = (await prompt('Pick [A/B] (default A): ')).toUpperCase() || 'A';
  const format = ans.startsWith('B') ? 'zip' : 'tar.gz';

  console.log(`\nFetching latest release metadata from GitHub…`);
  const relResp = await fetch(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'wxkanban-kit-init' },
  });
  if (!relResp.ok) {
    console.error(`GitHub API returned ${relResp.status}. Cannot download kit automatically.`);
    console.error('Download manually from:');
    console.error(`  https://github.com/${GH_OWNER}/${GH_REPO}/releases/latest`);
    process.exit(1);
  }
  const release = await relResp.json();
  const assetName = format === 'zip' ? 'kit.zip' : 'kit.tar.gz';
  const asset = release.assets?.find(a => a.name === assetName);
  if (!asset) {
    console.error(`Release ${release.tag_name} has no asset named ${assetName}.`);
    process.exit(1);
  }

  const archivePath = path.join(root, assetName);
  console.log(`Downloading ${assetName} (${release.tag_name})…`);
  const dlResp = await fetch(asset.browser_download_url, {
    headers: { 'User-Agent': 'wxkanban-kit-init' },
    redirect: 'follow',
  });
  if (!dlResp.ok || !dlResp.body) {
    console.error(`Download failed: HTTP ${dlResp.status}`);
    process.exit(1);
  }
  await pipeline(Readable.fromWeb(dlResp.body), createWriteStream(archivePath));
  console.log(`  saved to ${archivePath}`);

  console.log(`Extracting…`);
  if (format === 'tar.gz') {
    const r = spawnSync('tar', ['-xzf', archivePath, '-C', root], { stdio: 'inherit' });
    if (r.status !== 0) {
      console.error('tar extraction failed. Make sure `tar` is on PATH.');
      process.exit(1);
    }
  } else {
    // Windows: use built-in tar (available on Win10+) which also handles zip.
    const r = spawnSync('tar', ['-xf', archivePath, '-C', root], { stdio: 'inherit' });
    if (r.status !== 0) {
      console.error('zip extraction failed. Make sure `tar` or another extractor is available.');
      console.error('On Windows, right-click the .zip and choose "Extract All…" then run scripts/init.mjs from the extracted folder.');
      process.exit(1);
    }
  }
  fs.unlinkSync(archivePath);
  console.log(`  extracted into ${root}`);
}

function ensureDeps() {
  const rootPkg = path.join(root, 'package.json');
  const rootMods = path.join(root, 'node_modules');
  if (fs.existsSync(rootPkg) && !fs.existsSync(rootMods)) {
    console.log('\nInstalling root dependencies (tsx, express)…');
    const r = spawnSync('npm', ['install', '--omit=dev', '--no-audit', '--no-fund'], {
      cwd: root, stdio: 'inherit', shell: process.platform === 'win32',
    });
    if (r.status !== 0) { console.error('npm install (root) failed.'); process.exit(1); }
  }

  const agentPkg = path.join(root, 'wxkanban-agent', 'package.json');
  const agentMods = path.join(root, 'wxkanban-agent', 'node_modules');
  if (fs.existsSync(agentPkg) && !fs.existsSync(agentMods)) {
    console.log('Installing wxkanban-agent dependencies…');
    const r = spawnSync('npm', ['install', '--omit=dev', '--no-audit', '--no-fund'], {
      cwd: path.join(root, 'wxkanban-agent'), stdio: 'inherit', shell: process.platform === 'win32',
    });
    if (r.status !== 0) { console.error('npm install (wxkanban-agent) failed.'); process.exit(1); }
  }

  // mcp-server: install deps AND build if dist is missing.
  const mcpRoot = path.join(root, 'mcp-server');
  const mcpPkg = path.join(mcpRoot, 'package.json');
  const mcpMods = path.join(mcpRoot, 'node_modules');
  const mcpDist = path.join(mcpRoot, 'dist', 'index.js');
  if (fs.existsSync(mcpPkg) && !fs.existsSync(mcpMods)) {
    console.log('Installing mcp-server dependencies…');
    const r = spawnSync('npm', ['install', '--omit=dev', '--no-audit', '--no-fund'], {
      cwd: mcpRoot, stdio: 'inherit', shell: process.platform === 'win32',
    });
    if (r.status !== 0) { console.error('npm install (mcp-server) failed.'); process.exit(1); }
  }
  if (fs.existsSync(mcpPkg) && !fs.existsSync(mcpDist)) {
    console.log('Building mcp-server (dist/ missing)…');
    const r = spawnSync('npm', ['run', 'build'], {
      cwd: mcpRoot, stdio: 'inherit', shell: process.platform === 'win32',
    });
    if (r.status !== 0) { console.error('npm run build (mcp-server) failed.'); process.exit(1); }
  }
}

function loadEnv(envPath) {
  if (!fs.existsSync(envPath)) return { ...process.env };
  const env = { ...process.env };
  for (const raw of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i <= 0) continue;
    env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return env;
}

// Spec 019 R16 AC1-2 — identity check now lives in scripts/setup-mcp.mjs as
// the single source of truth (assertProjectIdentityOrKill), so it runs both
// when init.mjs invokes setup-mcp and when setup-mcp is run standalone. The
// previous ensureMcpIsForThisProject duplicate was removed because it only
// fired when a local .mcp-server.pid existed, missing the fresh-clone case.

async function startMcp() {
  console.log('\nStarting MCP server…');
  const r = spawnSync(process.execPath, [path.join(here, 'setup-mcp.mjs')], {
    cwd: root, stdio: 'inherit',
  });
  if (r.status !== 0) { console.error('MCP startup failed.'); process.exitCode = 1; throw new Error('mcp-startup-failed'); }
}

function startGateway() {
  console.log('\nStarting Orchestrator HTTP Gateway…');
  if (!fs.existsSync(gwEntry)) { console.error(`Missing: ${gwEntry}`); process.exit(1); }
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

  if (fs.existsSync(gwPidPath)) {
    const pid = Number(fs.readFileSync(gwPidPath, 'utf8').trim());
    if (Number.isFinite(pid) && isRunning(pid)) {
      console.log(`  already running (PID ${pid})`);
      return;
    }
  }

  const env = loadEnv(path.join(root, '.env'));
  const outFd = fs.openSync(gwLogPath, 'a');
  const child = spawn(process.execPath, [gwEntry], {
    cwd: root, env, detached: true, stdio: ['ignore', outFd, outFd],
  });
  fs.writeFileSync(gwPidPath, String(child.pid));
  child.unref();
  console.log(`  started (PID ${child.pid}). Log: ${gwLogPath}`);
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitForHealth() {
  console.log('\nWaiting for services to respond…');
  const maxAttempts = 10;
  for (let i = 1; i <= maxAttempts; i++) {
    await sleep(1500);
    // On the final attempt, inherit stdio so the user sees the full probe
    // output (success or failure). Otherwise run silently and loop.
    const inherit = i === maxAttempts;
    const r = spawnSync(process.execPath, [healthScript], { stdio: inherit ? 'inherit' : 'pipe' });
    if (r.status === 0) {
      if (!inherit) {
        // Print the success output once on the first healthy attempt.
        const r2 = spawnSync(process.execPath, [healthScript], { stdio: 'inherit' });
        process.exitCode = r2.status ?? 0;
        return;
      }
      process.exitCode = 0;
      return;
    }
    process.stdout.write(`  attempt ${i}/${maxAttempts} not yet…\r`);
  }
  console.log('\nServices did not become healthy in time. See logs/ for details.');
  process.exitCode = 1;
}

async function main() {
  console.log('wxKanban kit init');
  console.log('═════════════════');
  await maybeDownloadKit();
  ensureDeps();
  await startMcp();
  startGateway();
  await waitForHealth();
}

main().catch(err => { console.error('init failed:', err); process.exitCode = 1; });
