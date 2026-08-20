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
import os from 'node:os';
import path from 'node:path';
import tls from 'node:tls';
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

// Trust the OS certificate store in addition to Node's bundled CA list, so the
// upgrade reaches wxKanban behind a corporate TLS-inspection proxy (Cisco
// Secure Access, Zscaler, …) instead of failing the handshake and falling back
// to GitHub. In-process equivalent of --use-system-ca (Node 24+); feature-
// detected, never throws. See BUG-REPORT-kit-dbpush-tls-and-packaging.md.
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

// Post-extract cleanup of files the new kit RENAMED or REMOVED. The upgrade
// overlays the archive (it never deletes), so stale files linger without this.
// Run AFTER extraction so the replacements are already in place.
// (1) Renamed/removed in the from-PDF cutover: the source-based wxConversion
// analyst skill and the interim wxConversion*FromPDF docs/dirs (the from-PDF
// flow is now plain /wxConversion + /wxConversionScope).
// Module-level so the pre-upgrade snapshot (T003) can cover deletions too — a
// file this removes is as gone as one the extract overwrites.
const STALE_RENAMED = [
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
  '.claude/skills/wxConversion',
  '.claude/skills/wxConversionScope',
  'wxkanban-agent/templates/skills/wxConversionFromPDF',
  'wxkanban-agent/templates/skills/wxConversionScopeFromPDF',
];

// (2) Raw TypeScript source — only prune once the kit actually ships the
// compiled bundle (dist/cli.cjs present after extract).
const STALE_SOURCE_TREES = [
  'wxkanban-agent/core',
  'wxkanban-agent/services',
  'wxkanban-agent/workers',
  'wxkanban-agent/adapters',
  'wxkanban-agent/apps/command-gateway/src',
  'wxkanban-agent/dbpush.ts',
];

function cleanupStaleAfterExtract({ dryRun = false } = {}) {
  const renamed = STALE_RENAMED;

  // Until distribution flips to dist-only this stays a no-op, so it's safe to ship now.
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

  // [SPEC 121 / T008] Deletions are reported through the T007 change manifest
  // rather than announced here and forgotten. `dryRun` lists without removing.
  const removed = [];
  for (const rel of [...renamed, ...sourceTrees]) {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) continue;
    if (dryRun) {
      removed.push(rel);
      continue;
    }
    try {
      fs.rmSync(abs, { recursive: true, force: true });
      removed.push(rel);
    } catch (err) {
      log('warn', `  could not remove ${rel}: ${err.message}`);
    }
  }
  if (removed.length > 0 && distPresent) {
    log('info', 'Stale cleanup included raw source — the kit now runs from dist/');
  }
  return removed;
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

// ─── [SPEC 121 / T003] Pre-upgrade snapshot ──────────────────────────────────
//
// The upgrade overlays an archive onto a live project. Until T001/T002 land, it
// cannot tell a pristine kit file from one the consumer edited, so it overwrites
// both. The snapshot does not prevent that — it makes it recoverable, which is
// the difference between an annoyance and the lost work reported from eight
// projects. Unconditional and on every path: an upgrade that proceeds without
// one is exactly the upgrade people lost files to.

const SNAPSHOT_PREFIX = 'kit-upgrade-snapshot-';
const SNAPSHOT_RETAIN = 2;

/**
 * Every path the archive carries, so the snapshot covers what will actually be
 * written rather than a hand-maintained guess that drifts from the archive.
 * Returns null when the listing fails — the caller treats that as fatal.
 */
function listArchiveEntries(archivePath) {
  const isZip = archivePath.endsWith('.zip');

  if (isZip && process.platform === 'win32') {
    const ps = spawnSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command',
        'Add-Type -AssemblyName System.IO.Compression.FileSystem; ' +
        `$z=[IO.Compression.ZipFile]::OpenRead('${archivePath}'); ` +
        'try { $z.Entries | ForEach-Object { $_.FullName } } finally { $z.Dispose() }'],
      { encoding: 'utf8', windowsHide: true }
    );
    if (ps.status !== 0) return null;
    return ps.stdout.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  }

  const tarBin = resolveTarBinary();
  const result = spawnSync(tarBin, isZip ? ['-tf', archivePath] : ['-tzf', archivePath], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status !== 0) return null;
  return result.stdout.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
}

function snapshotBeforeUpgrade(archivePath) {
  const entries = listArchiveEntries(archivePath);
  if (!entries || entries.length === 0) {
    die(
      'Could not read the upgrade archive to snapshot the files it would overwrite.\n' +
      '  Refusing to extract unprotected — this upgrade overwrites project files in place.\n' +
      '  Back up the project and re-run, or report this archive as unreadable.'
    );
  }

  // Deletions count as writes. The dist-only prune only fires when the compiled
  // bundle is present, which the archive listing tells us before we extract.
  const archiveHasDist = entries.some(e => e.replace(/\\/g, '/') === 'wxkanban-agent/dist/cli.cjs');
  const targets = new Set();
  for (const entry of entries) {
    const rel = entry.replace(/\\/g, '/');
    if (!rel || rel.endsWith('/')) continue; // directory entry
    targets.add(rel);
  }
  for (const rel of STALE_RENAMED) targets.add(rel);
  if (archiveHasDist || fs.existsSync(path.join(root, 'wxkanban-agent', 'dist', 'cli.cjs'))) {
    for (const rel of STALE_SOURCE_TREES) targets.add(rel);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(root, '.wxai', `${SNAPSHOT_PREFIX}${stamp}`);

  let saved = 0;
  try {
    fs.mkdirSync(dir, { recursive: true });
    for (const rel of targets) {
      const abs = path.join(root, rel);
      if (!fs.existsSync(abs)) continue; // new file — nothing of the consumer's to lose
      const dest = path.join(dir, rel);
      if (fs.statSync(abs).isDirectory()) {
        fs.cpSync(abs, dest, { recursive: true });
      } else {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(abs, dest);
      }
      saved++;
    }
  } catch (err) {
    die(
      `Pre-upgrade snapshot failed: ${err.message}\n` +
      '  Aborting before anything is written. Nothing has been changed.\n' +
      '  Free up disk space or fix permissions on .wxai/ and re-run.'
    );
  }

  log('ok', `Snapshot saved (${saved} existing path(s))`);
  log('info', `  ${dir}`);
  return { dir, saved };
}

/** Keep the current snapshot plus one previous; older ones are pruned. */
function pruneSnapshots(keepDir) {
  const base = path.join(root, '.wxai');
  let dirs;
  try {
    dirs = fs.readdirSync(base, { withFileTypes: true })
      .filter(e => e.isDirectory() && e.name.startsWith(SNAPSHOT_PREFIX))
      .map(e => e.name)
      .sort()
      .reverse();
  } catch {
    return;
  }
  for (const name of dirs.slice(SNAPSHOT_RETAIN)) {
    const abs = path.join(base, name);
    if (abs === keepDir) continue;
    try {
      fs.rmSync(abs, { recursive: true, force: true });
    } catch {
      /* a snapshot we cannot prune is not worth failing an upgrade over */
    }
  }
}

// ─── [SPEC 121 / T005] Merge package.json instead of overwriting it ───────────
//
// The archive carries the kit's own package.json. The loss it causes is latent:
// node_modules survives an overwrite, so typecheck, tests and build all stay
// green until some later `npm install` prunes the tree and the project breaks
// pointing at the wrong change. Merge from the snapshot copy taken before
// extraction, so every consumer key survives.
//
// THE KIT HALF DOES NOT COME FROM THE PROJECT ROOT. It used to, and that was
// only ever true on the no-manifest overwrite path — the FIRST upgrade after
// SPEC-121 shipped. On every upgrade after that, reconcileStaging classifies a
// customized package.json as `modified` and deliberately does NOT write the
// kit's copy to the root; it leaves a `package.json.kit-new` sidecar instead.
// So `before` and the root file were the same bytes, the merge found nothing of
// the kit's to apply, and returned null without a word. Kit-owned dependency
// bumps and newly shipped scripts stopped arriving, silently, for every consumer
// past their first upgrade. The kit's copy exists only inside the staging tree,
// which is why `kitDir` is passed and why the call now happens before staging is
// removed. `root` stays the default so the overwrite path is unchanged.

function mergePackageJson(snapshotDir, kitDir = root) {
  const beforePath = path.join(snapshotDir, 'package.json');
  const livePath = path.join(root, 'package.json');
  const kitPath = path.join(kitDir, 'package.json');
  // Absent from the snapshot ⇒ the archive did not carry it ⇒ nothing was overwritten.
  if (!fs.existsSync(beforePath) || !fs.existsSync(livePath) || !fs.existsSync(kitPath)) return null;

  let before;
  let kit;
  try {
    before = JSON.parse(fs.readFileSync(beforePath, 'utf8'));
    kit = JSON.parse(fs.readFileSync(kitPath, 'utf8'));
  } catch (err) {
    log('warn', `package.json merge skipped — could not parse: ${err.message}`);
    log('warn', `  your original is preserved at ${beforePath}`);
    return null;
  }

  const notes = [];
  const merged = { ...before }; // every consumer key survives verbatim

  for (const key of Object.keys(kit)) {
    if (!(key in merged)) merged[key] = kit[key];
  }

  // Scripts: fill in what the kit adds, never silently replace one of theirs.
  merged.scripts = { ...(before.scripts || {}) };
  for (const [name, cmd] of Object.entries(kit.scripts || {})) {
    if (!(name in merged.scripts)) {
      merged.scripts[name] = cmd;
      notes.push(`+ script "${name}"`);
    } else if (merged.scripts[name] !== cmd) {
      notes.push(`! script "${name}" kept yours (kit ships a different one)`);
    }
  }

  // Dependencies: kit-owned entries track the kit; a consumer-declared entry the
  // kit does not know about is never dropped. That includes `file:` workspace
  // deps, whose loss is what breaks the build a day later.
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
    if (!before[field] && !kit[field]) continue;
    const out = { ...(before[field] || {}) };
    for (const [name, range] of Object.entries(kit[field] || {})) {
      if (!(name in out)) {
        out[name] = range;
        notes.push(`+ ${field} ${name}@${range}`);
      } else if (out[name] !== range) {
        notes.push(`~ ${field} ${name} ${out[name]} → ${range} (kit-owned)`);
        out[name] = range;
      }
    }
    merged[field] = out;
  }

  const kitText = JSON.stringify(kit);
  if (JSON.stringify(merged) === kitText) return null; // nothing of theirs to restore

  fs.writeFileSync(livePath, JSON.stringify(merged, null, 2) + '\n', 'utf8');
  log('ok', 'package.json merged — your scripts and dependencies are preserved');
  for (const note of notes.slice(0, 12)) log('info', `  ${note}`);
  if (notes.length > 12) log('info', `  …and ${notes.length - 12} more`);

  reconcileLockfile(snapshotDir);
  return { notes };
}

/**
 * A merged manifest and the kit's lockfile disagree, and `npm ci` fails closed on
 * that — which is precisely the clean-clone build the regression test asserts.
 * Restore the consumer's lock and re-derive it against the merged manifest.
 */
function reconcileLockfile(snapshotDir) {
  const beforeLock = path.join(snapshotDir, 'package-lock.json');
  const liveLock = path.join(root, 'package-lock.json');
  if (fs.existsSync(beforeLock)) {
    try {
      fs.copyFileSync(beforeLock, liveLock);
    } catch (err) {
      log('warn', `could not restore package-lock.json: ${err.message}`);
    }
  }
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npmCmd, ['install', '--package-lock-only', '--no-audit', '--no-fund'], {
    cwd: root,
    stdio: 'ignore',
    windowsHide: true,
  });
  if (result.status === 0) {
    log('ok', 'package-lock.json re-derived from the merged manifest');
  } else {
    log('warn', 'package-lock.json is out of sync with the merged package.json');
    log('warn', '  run `npm install` before your next `npm ci`');
  }
}

// [SPEC 121 / T004] `destination` defaults to the project root — the historic
// behavior, still used when there is no manifest to compare against. With a
// manifest, main() extracts to a staging directory instead and reconciles, which
// is the only way to be selective: neither Expand-Archive nor tar can be told
// "skip the files this consumer edited".
function extractArchive(archivePath, destination = root) {
  const ext = archivePath.endsWith('.zip') ? 'zip' : 'tar.gz';
  log('info', `Extracting ${ext} archive${destination === root ? ' over project root' : ' to staging'}`);
  fs.mkdirSync(destination, { recursive: true });

  if (ext === 'zip' && process.platform === 'win32') {
    // bsdtar misreads drive-letter paths (e.g. E:\...) in -C as remote hosts.
    // PowerShell's Expand-Archive handles Windows paths correctly.
    // windowsHide: powershell.exe is a console program; launched from a console-less
    // parent it gets a fresh, visible window. Inherited stdio still carries output.
    const ps = spawnSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command',
        `Expand-Archive -LiteralPath '${archivePath}' -DestinationPath '${destination}' -Force`],
      { stdio: 'inherit', windowsHide: true }
    );
    if (ps.status !== 0) {
      throw new Error('Extraction failed (Expand-Archive)');
    }
  } else {
    // tar.gz on any platform, and zip on Unix.
    // Use cwd instead of -C to avoid drive-letter parsing issues on Windows.
    const tarBin = resolveTarBinary();
    const args = ext === 'tar.gz' ? ['-xzf', archivePath] : ['-xf', archivePath];
    const result = spawnSync(tarBin, args, { cwd: destination, stdio: 'inherit', windowsHide: true });
    if (result.status !== 0) {
      throw new Error(`Extraction failed (tar=${tarBin})`);
    }
  }

  log('ok', 'Extraction complete');
}

// ─── [SPEC 121 / T001] Kit manifest ──────────────────────────────────────────
//
// Records the SHA-256 of every file the kit DELIVERED, as delivered. Without it
// the upgrader cannot tell a file the consumer edited from one it shipped, so it
// treats both the same and overwrites. Note this stores the kit's hash even for
// files reconcile chose not to overwrite — the point is "what the kit shipped",
// so a file the consumer edited stays classified `modified` on every later
// upgrade instead of silently reverting to pristine.

const MANIFEST_PATH = () => path.join(root, '.wxai', 'kit-manifest.json');

function sha256Sync(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function readKitManifest() {
  try {
    const raw = JSON.parse(fs.readFileSync(MANIFEST_PATH(), 'utf8'));
    return raw && typeof raw.files === 'object' ? raw : null;
  } catch {
    return null; // absent or unreadable — caller falls back to unguarded extract
  }
}

function writeKitManifest(stagingDir, version) {
  const files = {};
  for (const rel of walkRelative(stagingDir)) {
    try {
      files[rel] = sha256Sync(path.join(stagingDir, rel));
    } catch {
      /* unreadable file in staging — omit rather than record a wrong hash */
    }
  }
  try {
    fs.mkdirSync(path.dirname(MANIFEST_PATH()), { recursive: true });
    fs.writeFileSync(
      MANIFEST_PATH(),
      JSON.stringify({ kitVersion: version, generatedAt: new Date().toISOString(), files }, null, 2) + '\n',
      'utf8'
    );
    log('ok', `Kit manifest written (${Object.keys(files).length} files) — the next upgrade can protect your edits`);
  } catch (err) {
    log('warn', `could not write kit manifest: ${err.message}`);
    log('warn', '  the next upgrade will fall back to an unguarded extract');
  }
}

/** Every file under `dir`, as root-relative POSIX paths. */
function walkRelative(dir, prefix = '', acc = []) {
  let entries;
  try {
    entries = fs.readdirSync(path.join(dir, prefix), { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const entry of entries) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      walkRelative(dir, rel, acc);
    } else {
      acc.push(rel);
    }
  }
  return acc;
}

// ─── [SPEC 121 / T002] Comparator ────────────────────────────────────────────
//
// Classifies each incoming file against the live tree and the manifest:
//   new          — nothing there; safe to write
//   pristine     — live matches what the kit shipped; safe to overwrite
//   unchanged    — live already matches the incoming file; nothing to do
//   modified     — live differs from what the kit shipped; the consumer edited it
//   project-only — on disk, never shipped by the kit; not ours to touch

function classifyFile(rel, stagingDir, manifest) {
  const live = path.join(root, rel);
  if (!fs.existsSync(live)) return 'new';

  let liveHash;
  try {
    liveHash = sha256Sync(live);
  } catch {
    return 'modified'; // unreadable ⇒ treat as precious, never clobber
  }

  let incomingHash;
  try {
    incomingHash = sha256Sync(path.join(stagingDir, rel));
  } catch {
    return 'modified';
  }
  if (liveHash === incomingHash) return 'unchanged';

  const shipped = manifest.files[rel];
  if (!shipped) return 'project-only';
  return liveHash === shipped ? 'pristine' : 'modified';
}

// ─── [SPEC 121 / T006] Customizable trees ────────────────────────────────────
//
// ONE declared list. These are the trees consumers are expected to edit — the
// conversion scripts and the rules the AI reads — so a difference there is
// treated as the consumer's work even when the manifest is missing or stale,
// rather than as drift to be corrected. Outside these trees a modified file is
// still preserved; membership here only means "assume edited when unsure".
//
// Open question from spec 121 deliberately left open: whether `.claude/skills/`
// joins wholesale. A reporter asked for the broader list. Adding a tree here is
// safe (more preservation); removing one is not, so the narrow list ships until
// that is decided.
const PRESERVE_TREES = [
  /^\.claude\/[^/]+\/scripts\//,
  /^_wxAI\/rules\//,
];

const isPreserveTree = (rel) => PRESERVE_TREES.some((re) => re.test(rel));

// ─── [SPEC 121 / T004] Reconcile staging into the project ────────────────────

function reconcileStaging(stagingDir, manifest, { dryRun = false } = {}) {
  const counts = { new: 0, pristine: 0, unchanged: 0, modified: 0, 'project-only': 0 };
  const preserved = [];
  const kitNew = [];
  const replaced = [];

  for (const rel of walkRelative(stagingDir)) {
    let verdict = classifyFile(rel, stagingDir, manifest);

    // [SPEC 121 / T006] In a customizable tree, a file that differs from the
    // incoming one is the consumer's until proven otherwise.
    if (verdict === 'pristine' && isPreserveTree(rel) && !manifest.files[rel]) {
      verdict = 'modified';
    }

    counts[verdict]++;

    if (verdict === 'unchanged') continue;

    if (verdict === 'modified' || verdict === 'project-only') {
      // Not overwritten. Leave the new version alongside so the update is still
      // reachable — a silently withheld update is its own kind of wrong.
      preserved.push(rel);
      if (!dryRun) {
        const sidecar = path.join(root, `${rel}.kit-new`);
        try {
          fs.mkdirSync(path.dirname(sidecar), { recursive: true });
          fs.copyFileSync(path.join(stagingDir, rel), sidecar);
          kitNew.push(`${rel}.kit-new`);
        } catch {
          /* best effort — never fail an upgrade over a sidecar */
        }
      } else {
        kitNew.push(`${rel}.kit-new`);
      }
      continue;
    }

    replaced.push(rel);
    if (dryRun) continue;

    const dest = path.join(root, rel);
    try {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(path.join(stagingDir, rel), dest);
    } catch (err) {
      log('warn', `could not write ${rel}: ${err.message}`);
    }
  }

  log('ok',
    `${dryRun ? 'Would reconcile' : 'Reconciled'}: ${counts.new} new, ${counts.pristine} updated, ` +
    `${counts.unchanged} already current, ${counts.modified + counts['project-only']} preserved`);

  return { counts, preserved, kitNew, replaced };
}

// ─── [SPEC 121 / T007+T008+T009] Change manifest ─────────────────────────────
//
// The ONE place an at-risk warning is produced. Both the normal path and the
// GitHub fallback call this, so the asymmetry the reporters found — fallback
// gated on --confirm-overwrite and naming four files, normal path with no gate
// at all — cannot silently come back.
//
// Counts print even when zero. An absence of warnings should be something the
// run states, not something the reader infers from silence.

function reportChanges({ preserved = [], kitNew = [], deleted = [], replaced = [], dryRun = false, acknowledged = false }) {
  const atRisk = preserved.length + deleted.length;

  console.log('');
  log('info', `${colors.bold}${dryRun ? 'Dry run — change manifest' : 'Change manifest'}${colors.reset}`);
  log('info', `  updated in place : ${replaced.length}`);
  log('info', `  preserved (yours): ${preserved.length}`);
  log('info', `  .kit-new written : ${kitNew.length}`);
  log('info', `  stale deletions  : ${deleted.length}`);

  for (const rel of preserved) {
    log('warn', `  KEPT   ${rel}${isPreserveTree(rel) ? '  [customizable tree]' : ''}`);
    log('info', `         new version → ${rel}.kit-new`);
  }
  for (const rel of deleted) {
    log('warn', `  DELETED ${rel}  (recoverable from the snapshot above)`);
  }

  if (atRisk === 0) {
    log('ok', '  Nothing of yours was touched.');
    return 0;
  }

  console.log('');
  if (acknowledged) {
    log('warn', `proceeded over ${atRisk} at-risk file(s) (--yes)`);
    return 0;
  }

  log('warn', `${atRisk} file(s) need your review before this upgrade is finished.`);
  log('info', '  Review each .kit-new, merge what you want, then delete the sidecar.');
  log('info', '  Re-run with --yes to accept this without the non-zero exit.');
  return 2;
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
  // init.mjs hides its OWN children, but the upgrade path spawns init.mjs itself —
  // without this the upgrade still flashes a window even though init.mjs is clean.
  const result = spawnSync('node', [path.join(here, 'init.mjs')], {
    stdio: 'inherit',
    cwd: root,
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(`init.mjs exited with code ${result.status}`);
  }
}

async function main() {
  trustSystemCertificates();
  const args = process.argv.slice(2);
  const allowDowngrade = args.includes('--allow-downgrade');
  const confirmOverwrite = args.includes('--confirm-overwrite');
  const dryRun = args.includes('--dry-run');           // [SPEC 121 / T010]
  const assumeYes = args.includes('--yes');            // [SPEC 121 / T007]
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
    // [SPEC 121 / T009] The fallback archive is NOT stripped server-side, so it
    // carries the customizable templates too. That extra risk is what this gate
    // is for — the per-file at-risk reporting both paths share happens after the
    // comparison, in reportChanges().
    if (!confirmOverwrite) {
      die(
        'GitHub fallback would extract a full kit archive that includes templates the kit author may have changed. ' +
        'Re-run with --confirm-overwrite if you accept that CLAUDE.md / AI.md / ProjectOverview.md / README.md may be overwritten, ' +
        'or fix wxKanban connectivity and retry. Use --dry-run to see exactly which of your files are at risk first.'
      );
    }
    download = await downloadFromGitHub({ targetVersion });
  }

  // [SPEC 121 / T010] A dry run answers the only question worth asking before an
  // upgrade — "what of mine does this touch?" — using the real comparison, and
  // writes nothing into the project. Staging goes to the OS temp dir so even
  // .wxai/ is left alone, and it exits non-zero exactly where a real run would
  // have stopped, so it works as a scripted pre-upgrade check.
  const manifest = readKitManifest();

  if (dryRun) {
    const tmpStaging = fs.mkdtempSync(path.join(os.tmpdir(), 'wxkanban-kit-dry-'));
    try {
      extractArchive(download.archivePath, tmpStaging);
      if (!manifest) {
        log('warn', 'No kit manifest — a real run would overwrite everything and rely on the snapshot.');
        log('info', `  ${walkRelative(tmpStaging).length} file(s) would be written.`);
        console.log('');
        log('info', 'Dry run complete. Nothing was changed.');
        process.exitCode = 2;
        return;
      }
      const changes = reconcileStaging(tmpStaging, manifest, { dryRun: true });
      const deleted = cleanupStaleAfterExtract({ dryRun: true });
      const code = reportChanges({ ...changes, deleted, dryRun: true, acknowledged: assumeYes });
      console.log('');
      log('info', 'Dry run complete. Nothing was changed.');
      process.exitCode = code;
      return;
    } finally {
      try { fs.rmSync(tmpStaging, { recursive: true, force: true }); } catch { /* ignore */ }
      try { fs.unlinkSync(download.archivePath); } catch { /* ignore */ }
    }
  }

  // [SPEC 121 / T003] Snapshot before the first write, on every download path.
  // die()s rather than continuing unprotected.
  const snapshot = snapshotBeforeUpgrade(download.archivePath);

  // [SPEC 121 / T002+T004] With a manifest we can tell an edited file from a
  // pristine one, so extract to staging and copy selectively. Without one — the
  // first upgrade after this ships, for every existing consumer — there is no
  // baseline to compare against, so fall back to the historic overwrite. T003's
  // snapshot is what protects that run, and the manifest written below makes
  // every subsequent upgrade guarded.
  const stagingDir = path.join(root, '.wxai', `kit-staging-${Date.now()}`);
  let changes = { preserved: [], kitNew: [], replaced: [] };

  try {
    if (manifest) {
      extractArchive(download.archivePath, stagingDir);
      changes = reconcileStaging(stagingDir, manifest);
    } else {
      log('warn', 'No kit manifest found — this upgrade cannot tell your edits from stock files.');
      log('warn', '  Falling back to a full overwrite. Your snapshot above is the safety net.');
      log('warn', '  A manifest is written at the end, so the NEXT upgrade will preserve your edits.');
      extractArchive(download.archivePath, stagingDir);
      const written = [];
      for (const rel of walkRelative(stagingDir)) {
        const dest = path.join(root, rel);
        try {
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.copyFileSync(path.join(stagingDir, rel), dest);
          written.push(rel);
        } catch (err) {
          log('warn', `could not write ${rel}: ${err.message}`);
        }
      }
      changes = { preserved: [], kitNew: [], replaced: written };
    }

    // [SPEC 121 / T001] Record what this kit shipped, as shipped.
    writeKitManifest(stagingDir, download.toVersion);

    // [SPEC 121 / T005] Put the consumer's half of package.json back before
    // anything installs against the archive's copy. Inside the try, because the
    // kit's own package.json exists only in stagingDir on the reconcile path and
    // the finally below removes it.
    mergePackageJson(snapshot.dir, stagingDir);
  } finally {
    try { fs.rmSync(stagingDir, { recursive: true, force: true }); } catch { /* ignore */ }
    try { fs.unlinkSync(download.archivePath); } catch { /* ignore */ }
  }

  // Remove files the new kit renamed/removed (overlay-extract never deletes).
  const deleted = cleanupStaleAfterExtract();

  updateProjectConfigVersion(download.toVersion);

  console.log('');
  runInit();

  pruneSnapshots(snapshot.dir);

  console.log('');
  log('ok', `${colors.bold}Upgrade complete${colors.reset}`);
  log('ok', `${download.fromVersion || 'unknown'} → ${download.toVersion} via ${download.source}`);
  log('info', `Pre-upgrade snapshot: ${snapshot.dir}`);
  log('info', '  Anything of yours this upgrade overwrote can be restored from there.');

  // [SPEC 121 / T007] Never finish silently over at-risk files. Exit code 2 says
  // "upgraded, and there is something for you to look at" — distinct from the 1
  // a failure returns.
  process.exitCode = reportChanges({ ...changes, deleted, acknowledged: assumeYes });
  console.log('');
}

main().catch(err => {
  console.log('');
  log('err', err.message);
  process.exitCode = 1;
});
