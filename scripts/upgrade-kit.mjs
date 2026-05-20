#!/usr/bin/env node
/**
 * upgrade-kit.mjs — spec 019 R15 AC5+AC6.
 *
 * Preserve-mode kit upgrade. Stops services, downloads the upgrade archive
 * from wxKanban's /api/projects/:id/kit/upgrade endpoint, verifies SHA-256
 * against the response header, extracts in place, updates only the version
 * fields in .wxkanban-project.json, and re-runs init.mjs.
 *
 * Per-project files (.wxkanban-project.json, ai-settings.json, .env) and
 * customizable templates (CLAUDE.md, AI.md, ProjectOverview.md, README.md)
 * are stripped from the archive server-side, so extraction is safe.
 *
 * Usage:
 *   node scripts/upgrade-kit.mjs            # upgrade to latest
 *   node scripts/upgrade-kit.mjs v0.1.11    # upgrade to specific version
 *   node scripts/upgrade-kit.mjs --allow-downgrade v0.1.9
 *
 * Configuration (priority order, same as check-kit-version.mjs):
 *   1. process.env.WXKANBAN_API_URL
 *   2. .wxkanban-project.json wxkanbanApiUrl field
 *   3. https://wxkanban.wxperts.com (default)
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const DEFAULT_API_URL = 'https://wxkanban.wxperts.com';
const GH_OWNER = 'Cowboy-59';
const GH_REPO = 'wxKanban-agent-Orchestrator';

const colors = {
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  reset: '\x1b[0m',
};

function log(level, msg) {
  const c = level === 'err' ? colors.red : level === 'warn' ? colors.yellow : level === 'ok' ? colors.green : colors.cyan;
  console.log(`${c}[upgrade-kit]${colors.reset} ${msg}`);
}

function die(msg) {
  log('err', msg);
  process.exit(1);
}

function readProjectConfig() {
  const configPath = path.join(root, '.wxkanban-project.json');
  if (!fs.existsSync(configPath)) die('.wxkanban-project.json not found at project root — is this a kit install?');
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (err) {
    die(`.wxkanban-project.json is not valid JSON: ${err.message}`);
  }
}

function readEnvFile() {
  const envPath = path.join(root, '.env');
  if (!fs.existsSync(envPath)) return {};
  const env = {};
  for (const raw of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i <= 0) continue;
    env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return env;
}

function resolveApiUrl(config) {
  if (process.env.WXKANBAN_API_URL) return process.env.WXKANBAN_API_URL.replace(/\/+$/, '');
  if (config?.wxkanbanApiUrl) return String(config.wxkanbanApiUrl).replace(/\/+$/, '');
  return DEFAULT_API_URL;
}

function isRunning(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function stopService(pidFileName, label) {
  const pidFile = path.join(root, pidFileName);
  if (!fs.existsSync(pidFile)) return;
  const pid = Number(fs.readFileSync(pidFile, 'utf8').trim());
  if (Number.isFinite(pid) && isRunning(pid)) {
    try {
      process.kill(pid, 'SIGTERM');
      log('info', `Stopped ${label} (PID ${pid})`);
    } catch (err) {
      log('warn', `Could not stop ${label} PID ${pid}: ${err.message}`);
    }
  }
  try { fs.unlinkSync(pidFile); } catch { /* ignore */ }
}

// [SPEC 019 R15 AC#5 / SPEC 028 T054] v1.1.0 legacy cleanup.
// Pre-v1.1.0 kits shipped a local mcp-server/ that tried to open a Postgres
// connection from the consumer (BUG-20). After spec 028, the MCP runs at
// mcp.wxperts.com and the kit is HTTPS-only. When a consumer upgrades across
// the v1.1.0 boundary, remove the now-dead files so the upgraded kit is clean.
function isPreV110(currentVersion) {
  if (!currentVersion || currentVersion === 'unknown') return true; // safest assumption
  const m = String(currentVersion).match(/^v?(\d+)\.(\d+)/);
  if (!m) return false;
  const major = Number(m[1]);
  const minor = Number(m[2]);
  return major < 1 || (major === 1 && minor < 1);
}

function cleanupLegacyMcpIfNeeded(currentVersion) {
  if (!isPreV110(currentVersion)) return;
  log('info', `Pre-v1.1.0 install detected (${currentVersion}); removing legacy local-MCP files`);
  const targets = [
    'mcp-server',
    'scripts/setup-mcp.mjs',
    'scripts/mcp-health-check.mjs',
    '.mcp-server.pid',
  ];
  let removed = 0;
  for (const rel of targets) {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) continue;
    try {
      fs.rmSync(abs, { recursive: true, force: true });
      log('ok', `  removed ${rel}`);
      removed++;
    } catch (err) {
      log('warn', `  could not remove ${rel}: ${err.message}`);
    }
  }
  if (removed > 0) {
    log('ok', `Legacy cleanup complete: ${removed} path(s) removed`);
  }
}

function platform() {
  return process.platform === 'win32' ? 'windows' : 'unix';
}

function archiveExtForPlatform() {
  return platform() === 'windows' ? 'zip' : 'tar.gz';
}

async function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(filePath)) {
    hash.update(chunk);
  }
  return hash.digest('hex');
}

async function downloadFromWxKanban({ apiUrl, apiToken, projectId, currentVersion, targetVersion, allowDowngrade }) {
  const params = new URLSearchParams({ platform: platform(), fromVersion: currentVersion });
  if (targetVersion) params.set('version', targetVersion);
  if (allowDowngrade) params.set('allowDowngrade', 'true');
  const endpoint = `${apiUrl}/api/projects/${encodeURIComponent(projectId)}/kit/upgrade?${params}`;
  log('info', `Requesting upgrade archive from ${apiUrl}`);

  const response = await fetch(endpoint, {
    headers: {
      'Authorization': `Bearer ${apiToken}`,
      'Accept': 'application/octet-stream',
    },
    redirect: 'follow',
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status} from wxKanban: ${text.slice(0, 300)}`);
  }

  const expectedSha = response.headers.get('X-Kit-Sha256');
  const toVersion = response.headers.get('X-Kit-Version');
  const fromVersion = response.headers.get('X-Kit-FromVersion');
  const mode = response.headers.get('X-Kit-Mode');
  if (mode !== 'upgrade') throw new Error(`Expected X-Kit-Mode: upgrade, got: ${mode}`);
  if (!expectedSha) throw new Error('Response missing X-Kit-Sha256 header');
  if (!toVersion) throw new Error('Response missing X-Kit-Version header');

  const ext = archiveExtForPlatform();
  const tmpPath = path.join(root, `.kit-upgrade-${toVersion}-${crypto.randomBytes(4).toString('hex')}.${ext}`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(tmpPath));

  const actualSha = await sha256File(tmpPath);
  if (actualSha !== expectedSha) {
    fs.unlinkSync(tmpPath);
    throw new Error(`SHA-256 mismatch: server=${expectedSha} actual=${actualSha}`);
  }
  log('ok', `Downloaded + verified ${toVersion} (${(fs.statSync(tmpPath).size / 1024).toFixed(1)} KB)`);
  return { archivePath: tmpPath, fromVersion, toVersion, source: 'wxkanban' };
}

async function downloadFromGitHub({ targetVersion }) {
  log('warn', 'wxKanban unreachable; falling back to direct GitHub download (no audit event recorded server-side)');

  const ext = archiveExtForPlatform();
  const assetName = ext === 'zip' ? 'kit.zip' : 'kit.tar.gz';
  const tag = targetVersion || 'latest';
  const url = tag === 'latest'
    ? `https://github.com/${GH_OWNER}/${GH_REPO}/releases/latest/download/${assetName}`
    : `https://github.com/${GH_OWNER}/${GH_REPO}/releases/download/${tag}/${assetName}`;

  log('info', `Downloading from ${url}`);
  const response = await fetch(url, {
    headers: { 'User-Agent': 'wxkanban-upgrade-kit' },
    redirect: 'follow',
  });
  if (!response.ok) throw new Error(`GitHub download failed: HTTP ${response.status}`);

  const tmpPath = path.join(root, `.kit-upgrade-fallback-${crypto.randomBytes(4).toString('hex')}.${ext}`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(tmpPath));

  const checksumUrl = `${url}.sha256`;
  const sumResp = await fetch(checksumUrl);
  if (sumResp.ok) {
    const expectedSha = (await sumResp.text()).trim().split(/\s+/)[0];
    const actualSha = await sha256File(tmpPath);
    if (actualSha !== expectedSha) {
      fs.unlinkSync(tmpPath);
      throw new Error(`SHA-256 mismatch: github=${expectedSha} actual=${actualSha}`);
    }
    log('ok', `Downloaded + verified from GitHub (${(fs.statSync(tmpPath).size / 1024).toFixed(1)} KB)`);
  } else {
    log('warn', `No .sha256 sidecar at ${checksumUrl} — skipping integrity check`);
  }

  // GitHub fallback DOES include per-project files + customizable templates.
  // Since we can't strip server-side, the user must manually back up before
  // we extract — or trust that they've already done so. Bail with explicit
  // warning and require --confirm-overwrite to proceed.
  return { archivePath: tmpPath, fromVersion: 'unknown', toVersion: tag, source: 'github' };
}

function resolveTarBinary() {
  if (process.platform === 'win32') {
    const winTar = 'C:\\Windows\\System32\\tar.exe';
    if (fs.existsSync(winTar)) return winTar;
  }
  return 'tar';
}

function extractArchive(archivePath) {
  const ext = archivePath.endsWith('.zip') ? 'zip' : 'tar.gz';
  log('info', `Extracting ${ext} archive over project root`);

  if (ext === 'zip' && process.platform === 'win32') {
    // bsdtar misreads drive-letter paths (e.g. E:\...) in -C as remote hosts.
    // PowerShell's Expand-Archive handles Windows paths correctly.
    const ps = spawnSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command',
        `Expand-Archive -LiteralPath '${archivePath}' -DestinationPath '${root}' -Force`],
      { stdio: 'inherit' }
    );
    if (ps.status !== 0) {
      throw new Error('Extraction failed (Expand-Archive)');
    }
  } else {
    // tar.gz on any platform, and zip on Unix.
    // Use cwd instead of -C to avoid drive-letter parsing issues on Windows.
    const tarBin = resolveTarBinary();
    const args = ext === 'tar.gz' ? ['-xzf', archivePath] : ['-xf', archivePath];
    const result = spawnSync(tarBin, args, { cwd: root, stdio: 'inherit' });
    if (result.status !== 0) {
      throw new Error(`Extraction failed (tar=${tarBin})`);
    }
  }

  log('ok', 'Extraction complete');
}

function updateProjectConfigVersion(toVersion) {
  const configPath = path.join(root, '.wxkanban-project.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  // Per AC5: only update the two version fields, preserve everything else.
  config.version = toVersion;
  config.kitVersion = toVersion;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
  log('ok', `.wxkanban-project.json version → ${toVersion}`);
}

function runInit() {
  log('info', 'Re-running init.mjs to install platform-correct deps + restart services');
  const result = spawnSync('node', [path.join(here, 'init.mjs')], { stdio: 'inherit', cwd: root });
  if (result.status !== 0) {
    throw new Error(`init.mjs exited with code ${result.status}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const allowDowngrade = args.includes('--allow-downgrade');
  const confirmOverwrite = args.includes('--confirm-overwrite');
  const targetVersion = args.find(a => !a.startsWith('--')) || undefined;

  console.log('');
  log('info', `${colors.bold}wxKanban kit upgrade${colors.reset}`);
  console.log('');

  const config = readProjectConfig();
  const env = readEnvFile();
  const projectId = config.projectId;
  if (!projectId) die('.wxkanban-project.json missing projectId');

  const apiToken = process.env.WXKANBAN_API_TOKEN || env.WXKANBAN_API_TOKEN;
  if (!apiToken) die('WXKANBAN_API_TOKEN not found in env or .env');

  const apiUrl = resolveApiUrl(config);
  const currentVersion = config.kitVersion || config.version || 'unknown';
  log('info', `Project: ${projectId}`);
  log('info', `Current version: ${currentVersion}`);
  log('info', `Target: ${targetVersion || 'latest'}`);
  log('info', `wxKanban: ${apiUrl}`);
  console.log('');

  log('info', 'Stopping services');
  stopService('.mcp-server.pid', 'MCP server');
  stopService('.orchestrator-gateway.pid', 'orchestrator gateway');

  // [SPEC 019 R15 AC#5] v1.1.0 cutover — remove legacy local-MCP files when upgrading
  // from a pre-v1.1.0 kit. Hosted MCP (spec 028) means no consumer-side mcp-server/.
  cleanupLegacyMcpIfNeeded(currentVersion);

  let download;
  try {
    download = await downloadFromWxKanban({ apiUrl, apiToken, projectId, currentVersion, targetVersion, allowDowngrade });
  } catch (err) {
    if (/HTTP 4\d\d/.test(err.message)) {
      // 4xx is a client error from wxKanban (refused upgrade, no auth, etc.) — don't fall back, surface it.
      die(err.message);
    }
    log('warn', `wxKanban request failed: ${err.message}`);
    if (!confirmOverwrite) {
      die(
        'GitHub fallback would extract a full kit archive that includes templates the kit author may have changed. ' +
        'Re-run with --confirm-overwrite if you accept that .CLAUDE.md / AI.md / ProjectOverview.md / README.md may be overwritten, ' +
        'or fix wxKanban connectivity and retry.'
      );
    }
    download = await downloadFromGitHub({ targetVersion });
  }

  try {
    extractArchive(download.archivePath);
  } finally {
    try { fs.unlinkSync(download.archivePath); } catch { /* ignore */ }
  }

  updateProjectConfigVersion(download.toVersion);

  console.log('');
  runInit();

  console.log('');
  log('ok', `${colors.bold}Upgrade complete${colors.reset}`);
  log('ok', `${download.fromVersion || 'unknown'} → ${download.toVersion} via ${download.source}`);
  console.log('');
}

main().catch(err => {
  console.log('');
  log('err', err.message);
  process.exit(1);
});
