#!/usr/bin/env node
/**
 * upgrade-kit.mjs — Update the wxKanban orchestrator kit from a local source.
 *
 * Usage:
 *   node scripts/upgrade-kit.mjs --source /path/to/wxKanban
 *   node scripts/upgrade-kit.mjs --source /path/to/wxKanban --dry-run
 *   node scripts/upgrade-kit.mjs --source /path/to/wxKanban --yes
 *   node scripts/upgrade-kit.mjs --source /path/to/wxKanban --skip-setup
 *   node scripts/upgrade-kit.mjs --source /path/to/wxKanban --force
 *   node scripts/upgrade-kit.mjs --from-server                 (download latest release)
 *   node scripts/upgrade-kit.mjs --from-server --version v1.7.17
 *
 * Sources (pick one):
 *   --source <path>   Copy the kit from a local wxKanban checkout.
 *   --from-server     Download the latest (or --version) release from the
 *                     wxKanban server (GET /api/projects/:id/kit/download).
 *                     Needs WXKANBAN_API_TOKEN (+ optionally WXKANBAN_API_URL)
 *                     and a projectId in .wxkanban-project.json.
 *
 * Exit codes:
 *   0 — upgrade succeeded (or dry-run completed)
 *   1 — upgrade failed or was aborted
 */

import { existsSync, readFileSync, writeFileSync, cpSync, rmSync, statSync, readdirSync, mkdtempSync, mkdirSync, createWriteStream } from 'fs';
import { join, dirname, resolve } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { execSync, spawnSync } from 'child_process';
import http from 'http';
import https from 'https';
import tls from 'tls';
import readline from 'readline';
import { syncClaudeCommands } from './install-claude-commands.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONSUMER_ROOT = resolve(__dirname, '..');

// ─── Colours ─────────────────────────────────────────────────────────────────
const c = {
  reset: '\x1b[0m', bold: '\x1b[1m',
  cyan: '\x1b[36m', green: '\x1b[32m',
  yellow: '\x1b[33m', red: '\x1b[31m',
  magenta: '\x1b[35m', dim: '\x1b[2m',
};
const col = (color, text) => `${color}${text}${c.reset}`;

function log(tag, color, msg) {
  console.log(`${col(color, `[${tag}]`)} ${msg}`);
}

// ─── Args ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN   = args.includes('--dry-run');
const YES       = args.includes('--yes');
const SKIP_SETUP = args.includes('--skip-setup');
const FORCE     = args.includes('--force');
const NO_RESCUE_TOKENS = args.includes('--no-rescue-tokens');

// --from-server downloads the latest kit release from the wxKanban server
// (GET /api/projects/:id/kit/download) instead of copying from a local --source
// clone. This is the path a consumer with no source checkout uses — it makes the
// "confirm apply" surfaced by ensureKitUpToDate actually actionable. An optional
// --version pins a specific release tag.
const FROM_SERVER = args.includes('--from-server');
const versionIdx = args.indexOf('--version');
const VERSION_ARG = versionIdx !== -1 ? args[versionIdx + 1] : null;

const sourceIdx = args.indexOf('--source');
let SOURCE_PATH = sourceIdx !== -1
  ? resolve(args[sourceIdx + 1])
  : process.env['WXKANBAN_KIT_SOURCE']
    ? resolve(process.env['WXKANBAN_KIT_SOURCE'])
    : null;

// Temp dir holding a downloaded+extracted kit; cleaned up on exit (covers the
// early process.exit paths: dry-run, already-current, user abort).
let SERVER_TMP_DIR = null;
process.on('exit', () => cleanupServerTmp());

// ─── Kit directories / files copied from source (R15) ────────────────────────
// Excludes: .wxkanban-project.json, ai-settings.json, .env,
//           CLAUDE.md, AI.md, ProjectOverview.md, README.md
// `shared/` carries the @wxkanban/preflight (and types) workspace packages that
// wxkanban-agent + mcp-server import via `file:` deps. It MUST ship alongside
// package.json (which now declares `@wxkanban/preflight: file:shared/preflight`)
// or the post-copy `npm install` fails to resolve the file: target. See
// Bug-reports/BUG-REPORT-kit-dbpush-tls-and-packaging.md (Issue 3).
const KIT_DIRS  = ['wxkanban-agent', 'mcp-server', '_wxAI', 'scripts', '.vscode', 'shared'];
const KIT_FILES = ['package.json', 'package-lock.json'];

// `.claude/<skill>/` subdirectories ship with the kit (wxICA, diagnose, etc.).
// We deliberately copy *subdirectories only* so the consumer's own top-level
// `.claude/` files (settings.json, settings.local.json, mcp.json, …) are
// preserved. Discovered dynamically so a new skill added to the kit ships
// automatically without editing this script.
const CLAUDE_ROOT = '.claude';
function dirHasAnyFile(dirPath) {
  try {
    for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
      if (entry.isFile()) return true;
      if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.git') {
        if (dirHasAnyFile(join(dirPath, entry.name))) return true;
      }
    }
  } catch {
    // ignore
  }
  return false;
}
function listClaudeSkillDirs(root) {
  const claudeDir = join(root, CLAUDE_ROOT);
  if (!existsSync(claudeDir)) return [];
  try {
    return readdirSync(claudeDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name !== 'node_modules' && e.name !== '.git')
      .filter((e) => dirHasAnyFile(join(claudeDir, e.name)))
      .map((e) => `${CLAUDE_ROOT}/${e.name}`);
  } catch {
    return [];
  }
}

// Never copy node_modules or .git trees
function copyFilter(src) {
  const name = src.split(/[\\/]/).pop();
  return name !== 'node_modules' && name !== '.git';
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function readJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

// Read the kit's live version. Source of truth: wxkanban-agent/package.json
// (matches what the server reports — see commit 7f61e6a). Falls back to the
// kitVersion stamp in .wxkanban-project.json so an older consumer still
// reports *something*.
function readKitVersion(root) {
  const pkg = readJson(join(root, 'wxkanban-agent', 'package.json'));
  if (pkg && typeof pkg.version === 'string' && pkg.version) return pkg.version;
  const cfg = readJson(join(root, '.wxkanban-project.json'));
  return cfg && typeof cfg.kitVersion === 'string' ? cfg.kitVersion : null;
}

function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

// ─── Server-download helpers (--from-server) ─────────────────────────────────
// Small self-contained copies of the config/TLS logic in check-kit-version.mjs
// (that file is a script with no exports). Kept minimal on purpose.
function loadEnvFile(filePath) {
  const vars = {};
  if (!existsSync(filePath)) return vars;
  for (const line of readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    vars[key] = val;
  }
  return vars;
}

function resolveApiUrl(envBag) {
  return (
    process.env['WXKANBAN_API_URL'] ||
    envBag['WXKANBAN_API_URL'] ||
    'http://localhost:3001'
  ).replace(/\/+$/, '');
}

function resolveApiToken(envBag, aiSettings) {
  if (process.env['WXKANBAN_API_TOKEN']) return process.env['WXKANBAN_API_TOKEN'];
  if (envBag['WXKANBAN_API_TOKEN']) return envBag['WXKANBAN_API_TOKEN'];
  const tok = aiSettings?.mcpServers?.wxkanban?.env?.WXKANBAN_API_TOKEN;
  if (tok && tok !== 'your_api_key_here') return tok;
  return null;
}

// Merge the OS trust store into Node's defaults (equivalent to --use-system-ca)
// so the download works behind a corporate TLS-inspection proxy. No-ops on
// Node < 24; never throws.
function trustSystemCertificates() {
  try {
    if (typeof tls.setDefaultCACertificates !== 'function' ||
        typeof tls.getCACertificates !== 'function') return;
    const bundled = tls.getCACertificates('bundled');
    const system = tls.getCACertificates('system');
    if (Array.isArray(system) && system.length > 0) {
      tls.setDefaultCACertificates([...bundled, ...system]);
    }
  } catch { /* never block on CA wiring */ }
}

// Stream a URL to destFile, following redirects. Rejects on non-2xx.
function downloadToFile(url, headers, destFile, redirects = 5) {
  return new Promise((resolveP, rejectP) => {
    const lib = url.startsWith('https:') ? https : http;
    const req = lib.get(url, { headers, agent: false, timeout: 60000 }, (res) => {
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        if (redirects <= 0) return rejectP(new Error('too many redirects'));
        const next = new URL(res.headers.location, url).toString();
        // GitHub asset redirects to S3, which rejects a forwarded Authorization
        // header — drop auth on the redirect hop.
        const { Authorization, ...rest } = headers;
        return resolveP(downloadToFile(next, rest, destFile, redirects - 1));
      }
      if (status < 200 || status >= 300) {
        let body = '';
        res.on('data', (d) => (body += d));
        res.on('end', () => rejectP(new Error(`HTTP ${status}: ${body.slice(0, 200)}`)));
        return;
      }
      const out = createWriteStream(destFile);
      res.pipe(out);
      out.on('finish', () => out.close(() => resolveP(destFile)));
      out.on('error', rejectP);
    });
    req.on('error', rejectP);
    req.on('timeout', () => { req.destroy(); rejectP(new Error('download timed out')); });
  });
}

// Locate the kit root inside an extracted archive: the dir that directly
// contains wxkanban-agent/package.json (the archive root itself, or a single
// top-level wrapper dir).
function findKitRoot(extractDir) {
  if (existsSync(join(extractDir, 'wxkanban-agent', 'package.json'))) return extractDir;
  for (const entry of readdirSync(extractDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const candidate = join(extractDir, entry.name);
    if (existsSync(join(candidate, 'wxkanban-agent', 'package.json'))) return candidate;
  }
  return null;
}

// Download + extract the latest (or --version) kit release. Returns the source
// path (extracted kit root) for the normal copy pipeline to consume, or exits.
async function downloadKitFromServer() {
  const consumerConfig = readJson(join(CONSUMER_ROOT, '.wxkanban-project.json'));
  const projectId = consumerConfig?.projectId;
  if (!projectId) {
    log('error', c.red, '.wxkanban-project.json is missing or has no projectId — cannot download from server.');
    process.exit(1);
  }

  const envBag = {
    ...loadEnvFile(join(CONSUMER_ROOT, '.env')),
    ...loadEnvFile(join(CONSUMER_ROOT, 'mcp-server', '.env')),
  };
  const aiSettings = readJson(join(CONSUMER_ROOT, 'ai-settings.json'));
  const apiUrl = resolveApiUrl(envBag);
  const apiToken = resolveApiToken(envBag, aiSettings);
  if (!apiToken) {
    log('error', c.red, 'WXKANBAN_API_TOKEN is not set — cannot download the kit from the server.');
    log('hint', c.dim, 'Set WXKANBAN_API_TOKEN in .env, or use --source <path> for a local upgrade.');
    process.exit(1);
  }

  trustSystemCertificates();

  // Force tar.gz (platform=unix) — `tar -xzf` extracts it on Windows (bsdtar),
  // macOS, and Linux alike. `?platform=windows` would return a zip that GNU tar
  // can't read.
  const qs = new URLSearchParams({ platform: 'unix' });
  if (VERSION_ARG) qs.set('version', VERSION_ARG);
  const url = `${apiUrl}/api/projects/${projectId}/kit/download?${qs.toString()}`;

  SERVER_TMP_DIR = mkdtempSync(join(tmpdir(), 'wxkanban-kit-'));
  const archivePath = join(SERVER_TMP_DIR, 'kit.tar.gz');
  const extractDir = join(SERVER_TMP_DIR, 'extract');

  log('download', c.cyan, `Fetching kit from ${apiUrl} (${VERSION_ARG ?? 'latest'})...`);
  await downloadToFile(url, { Authorization: `Bearer ${apiToken}`, Accept: 'application/gzip' }, archivePath);
  log('download', c.green, `Downloaded ${statSync(archivePath).size} bytes.`);

  mkdirSync(extractDir, { recursive: true });
  execSync(`tar -xzf "${archivePath}" -C "${extractDir}"`, { stdio: 'inherit', shell: true });

  const kitRoot = findKitRoot(extractDir);
  if (!kitRoot) {
    log('error', c.red, 'Downloaded archive does not contain wxkanban-agent/package.json. Aborting.');
    process.exit(1);
  }
  log('extract', c.green, `Kit extracted → ${kitRoot}`);
  return kitRoot;
}

function cleanupServerTmp() {
  if (SERVER_TMP_DIR && existsSync(SERVER_TMP_DIR)) {
    try { rmSync(SERVER_TMP_DIR, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
}

function run(cmd, cwd = CONSUMER_ROOT) {
  log('run', c.dim, `${cmd}  ${col(c.dim, `(in ${cwd})`)}` );
  if (!DRY_RUN) execSync(cmd, { cwd, stdio: 'inherit', shell: true });
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${col(c.bold + c.magenta, 'wxKanban Kit Upgrade')}\n`);

  // Download-from-server resolves SOURCE_PATH to a freshly extracted kit, so the
  // rest of the pipeline treats it exactly like a local --source.
  if (FROM_SERVER && !SOURCE_PATH) {
    SOURCE_PATH = await downloadKitFromServer();
  }

  if (!SOURCE_PATH) {
    log('error', c.red, 'No source path provided.');
    console.log(`\n  Usage: node scripts/upgrade-kit.mjs --source /path/to/wxKanban`);
    console.log(`     or: node scripts/upgrade-kit.mjs --from-server   ${col(c.dim, '(download the latest release)')}`);
    console.log(`  Or set env var: WXKANBAN_KIT_SOURCE=/path/to/wxKanban\n`);
    process.exit(1);
  }

  if (!existsSync(SOURCE_PATH)) {
    log('error', c.red, `Source path does not exist: ${SOURCE_PATH}`);
    process.exit(1);
  }

  // ─── Read versions ───────────────────────────────────────────────────────
  const consumerConfigPath = join(CONSUMER_ROOT, '.wxkanban-project.json');

  const consumerConfig = readJson(consumerConfigPath);

  if (!consumerConfig) {
    log('error', c.red, `.wxkanban-project.json not found in ${CONSUMER_ROOT}`);
    log('error', c.red, 'This does not look like a kit install. Aborting.');
    process.exit(1);
  }

  if (!existsSync(join(SOURCE_PATH, 'wxkanban-agent', 'package.json'))) {
    log('error', c.red, `wxkanban-agent/package.json not found in ${SOURCE_PATH}`);
    log('error', c.red, 'Source does not look like a valid kit. Aborting.');
    process.exit(1);
  }

  // Live version comes from wxkanban-agent/package.json on BOTH sides; the
  // .wxkanban-project.json stamp is just an audit record of the last upgrade.
  const currentVersion = readKitVersion(CONSUMER_ROOT) ?? '(unknown)';
  const sourceVersion  = readKitVersion(SOURCE_PATH)   ?? '(unknown)';

  log('version', c.cyan,  `Current kit version : ${col(c.bold, currentVersion)}`);
  log('version', c.green, `Source kit version  : ${col(c.bold, sourceVersion)}`);

  if (currentVersion === sourceVersion) {
    if (!FORCE) {
      log('info', c.yellow, `Already on version ${sourceVersion}. No upgrade needed.`);
      console.log(`  Pass --force to copy anyway.\n`);
      process.exit(0);
    }
    log('force', c.magenta, `Same version (${sourceVersion}) — proceeding because --force was set.`);
  }

  // ─── Show what will be copied ────────────────────────────────────────────
  const claudeSkillDirs = listClaudeSkillDirs(SOURCE_PATH);

  console.log(`\n${col(c.bold, '  Kit directories to replace:')}`);
  for (const dir of KIT_DIRS) {
    const srcExists = existsSync(join(SOURCE_PATH, dir));
    const tag = srcExists ? col(c.green, '✓') : col(c.yellow, '— (not in source, skipped)');
    console.log(`    ${tag}  ${dir}/`);
  }
  console.log(`\n${col(c.bold, '  Claude Code skill directories (.claude/<skill>/) to replace:')}`);
  if (claudeSkillDirs.length === 0) {
    console.log(`    ${col(c.dim, '—  (none found in source)')}`);
  } else {
    for (const dir of claudeSkillDirs) {
      console.log(`    ${col(c.green, '✓')}  ${dir}/`);
    }
  }
  console.log(`\n${col(c.bold, '  Slash commands synced into .claude/commands/ (so / commands work):')}`);
  console.log(`    ${col(c.green, '✓')}  from _wxAI/commands/  ${col(c.dim, '(copied; foreign files left intact)')}`);
  console.log(`\n${col(c.bold, '  Root files to replace:')}`);
  for (const file of KIT_FILES) {
    const srcExists = existsSync(join(SOURCE_PATH, file));
    const tag = srcExists ? col(c.green, '✓') : col(c.yellow, '— (not in source, skipped)');
    console.log(`    ${tag}  ${file}`);
  }
  console.log(`\n${col(c.bold, '  Preserved (will NOT be touched):')}`);
  for (const f of ['.wxkanban-project.json', 'ai-settings.json', '.env', 'CLAUDE.md', 'AI.md', 'ProjectOverview.md', 'README.md', '.claude/settings.json', '.claude/settings.local.json', '.claude/mcp.json']) {
    console.log(`    ${col(c.dim, '–')}  ${f}`);
  }

  if (DRY_RUN) {
    console.log(`\n${col(c.yellow, '  Dry run — no files were changed.')}\n`);
    process.exit(0);
  }

  // ─── Confirm ─────────────────────────────────────────────────────────────
  if (!YES) {
    console.log('');
    const answer = await ask(`  Upgrade from ${col(c.bold, currentVersion)} → ${col(c.bold, sourceVersion)}? [y/N] `);
    if (answer !== 'y' && answer !== 'yes') {
      log('abort', c.yellow, 'Upgrade cancelled.');
      process.exit(0);
    }
  }

  console.log('');

  // ─── Copy kit dirs ────────────────────────────────────────────────────────
  for (const dir of KIT_DIRS) {
    const src = join(SOURCE_PATH, dir);
    const dst = join(CONSUMER_ROOT, dir);
    if (!existsSync(src)) {
      log('skip', c.yellow, `${dir}/ not found in source — skipping`);
      continue;
    }
    log('copy', c.cyan, `${dir}/`);
    if (existsSync(dst)) rmSync(dst, { recursive: true, force: true });
    cpSync(src, dst, { recursive: true, filter: copyFilter });
  }

  // ─── Copy .claude/<skill>/ subdirectories ────────────────────────────────
  // (Top-level .claude/ files like settings.json are deliberately preserved.)
  const claudeSkills = listClaudeSkillDirs(SOURCE_PATH);
  for (const dir of claudeSkills) {
    const src = join(SOURCE_PATH, dir);
    const dst = join(CONSUMER_ROOT, dir);
    log('copy', c.cyan, `${dir}/`);
    if (existsSync(dst)) rmSync(dst, { recursive: true, force: true });
    cpSync(src, dst, { recursive: true, filter: copyFilter });
  }

  // ─── Copy root files ──────────────────────────────────────────────────────
  for (const file of KIT_FILES) {
    const src = join(SOURCE_PATH, file);
    const dst = join(CONSUMER_ROOT, file);
    if (!existsSync(src)) {
      log('skip', c.yellow, `${file} not found in source — skipping`);
      continue;
    }
    log('copy', c.cyan, file);
    cpSync(src, dst);
  }

  // ─── Refresh the bundled Dev Cockpit .vsix ────────────────────────────────
  // KIT_DIRS deliberately excludes vscode-extension/ (its source + node_modules
  // are consumer-irrelevant), but ensureCockpitUpToDate() force-installs the
  // newest .vsix it finds under <root>/vscode-extension/. Without refreshing that
  // artifact here, a consumer's cockpit would stay pinned at the version shipped
  // in the FIRST install — so copy just the .vsix across on every upgrade, which
  // is what lets the cockpit self-update actually advance.
  const srcVsixDir = join(SOURCE_PATH, 'vscode-extension');
  if (existsSync(srcVsixDir)) {
    const vsixFiles = readdirSync(srcVsixDir).filter((f) => f.endsWith('.vsix'));
    if (vsixFiles.length > 0) {
      const dstVsixDir = join(CONSUMER_ROOT, 'vscode-extension');
      mkdirSync(dstVsixDir, { recursive: true });
      for (const f of vsixFiles) {
        log('cockpit', c.cyan, `vscode-extension/${f}`);
        cpSync(join(srcVsixDir, f), join(dstVsixDir, f));
      }
    }
  }

  // ─── Install slash commands into .claude/commands/ ────────────────────────
  // The kit ships commands in _wxAI/commands/, but Claude Code reads `/` commands
  // from .claude/commands/. Copy them across so they actually work (idempotent —
  // only missing/changed files are written; foreign files are left untouched).
  log('commands', c.cyan, 'Syncing slash commands → .claude/commands/');
  const cmdSync = syncClaudeCommands(CONSUMER_ROOT);
  if (cmdSync.error) {
    log('commands', c.yellow, cmdSync.error);
  } else {
    const changed = cmdSync.installed.length + cmdSync.updated.length;
    log('commands', c.green, changed
      ? `${changed} command(s) synced (${cmdSync.upToDate.length} already current)`
      : `all ${cmdSync.total} commands already current`);
    if (cmdSync.standardMissing.length) {
      log('commands', c.yellow, `standard commands still unavailable: ${cmdSync.standardMissing.join(', ')}`);
    }
  }

  // ─── Session defaults (SPEC-143 FR-020) ────────────────────────────────────
  // Best effort, never fatal to the upgrade: only sets a key the installer finds
  // unset everywhere it could already be chosen. See _wxAI/kit/install-session-defaults.mjs.
  const sessionDefaultsInstaller = join(CONSUMER_ROOT, '_wxAI', 'kit', 'install-session-defaults.mjs');
  if (existsSync(sessionDefaultsInstaller)) {
    const sd = spawnSync(process.execPath, [sessionDefaultsInstaller, '--root', CONSUMER_ROOT], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 15_000,
    });
    if (sd.status === 0) {
      log('session', c.green, (sd.stdout || 'session defaults set').trim().split(/\r?\n/).join(' | '));
    } else {
      log('session', c.yellow, `session defaults NOT set — ${(sd.stderr || sd.error?.message || 'unknown error').trim()}`);
    }
  }

  // ─── rescue-tokens skill (SPEC-153 FR-006) ─────────────────────────────────
  // Best effort, never fatal to the upgrade: installs the rescue-tokens skill + its
  // SessionStart hook into the operator's global ~/.claude/ profile. See
  // _wxAI/kit/install-rescue-tokens.mjs. --no-rescue-tokens skips it entirely.
  if (NO_RESCUE_TOKENS) {
    log('rescue', c.yellow, 'rescue-tokens: skipped (--no-rescue-tokens)');
  } else {
    const rescueTokensInstaller = join(CONSUMER_ROOT, '_wxAI', 'kit', 'install-rescue-tokens.mjs');
    if (existsSync(rescueTokensInstaller)) {
      const rt = spawnSync(process.execPath, [rescueTokensInstaller, '--root', CONSUMER_ROOT], {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 15_000,
      });
      if (rt.status === 0) {
        log('rescue', c.green, (rt.stdout || 'rescue-tokens set').trim().split(/\r?\n/).join(' | '));
      } else {
        log('rescue', c.yellow, `rescue-tokens NOT set — ${(rt.stderr || rt.error?.message || 'unknown error').trim()}`);
      }
    }
  }

  // ─── npm install ──────────────────────────────────────────────────────────
  log('deps', c.yellow, 'Running npm install in project root...');
  run('npm install');

  const mcpServerDir = join(CONSUMER_ROOT, 'mcp-server');
  if (existsSync(join(mcpServerDir, 'package.json'))) {
    log('deps', c.yellow, 'Running npm install in mcp-server/...');
    run('npm install', mcpServerDir);

    log('build', c.yellow, 'Building MCP server...');
    run('npm run build:http', mcpServerDir);
  }

  const agentDir = join(CONSUMER_ROOT, 'wxkanban-agent');
  if (existsSync(join(agentDir, 'package.json'))) {
    log('deps', c.yellow, 'Running npm install in wxkanban-agent/...');
    run('npm install', agentDir);
  }

  // ─── Capture source repo HEAD SHA (for check-kit-version drift detection) ─
  let sourceSha = null;
  try {
    const result = execSync('git rev-parse HEAD', {
      cwd: SOURCE_PATH,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    });
    const trimmed = result.trim();
    if (/^[0-9a-f]{7,40}$/i.test(trimmed)) sourceSha = trimmed;
  } catch {
    // Source isn't a git checkout — skip; drift detection just won't have a baseline.
  }

  // ─── Update kitVersion in .wxkanban-project.json ─────────────────────────
  consumerConfig.kitVersion = sourceVersion;
  consumerConfig.upgradedAt = new Date().toISOString();
  consumerConfig.upgradedFrom = currentVersion;
  if (sourceSha) consumerConfig.kitReleaseSha = sourceSha;
  writeFileSync(consumerConfigPath, JSON.stringify(consumerConfig, null, 2) + '\n', 'utf8');
  log('config', c.green, `.wxkanban-project.json updated → kitVersion: ${sourceVersion}${sourceSha ? `, kitReleaseSha: ${sourceSha.slice(0, 8)}` : ''}`);

  // ─── Re-run MCP setup ─────────────────────────────────────────────────────
  if (!SKIP_SETUP) {
    const setupScript = join(CONSUMER_ROOT, 'scripts', 'setup-mcp.mjs');
    if (existsSync(setupScript)) {
      log('setup', c.yellow, 'Running setup-mcp.mjs...');
      run(`node "${setupScript}"`);
    } else {
      log('setup', c.yellow, 'setup-mcp.mjs not found — skipping MCP restart');
    }

    const healthScript = join(CONSUMER_ROOT, 'scripts', 'mcp-health-check.mjs');
    if (existsSync(healthScript)) {
      log('health', c.yellow, 'Running mcp-health-check.mjs...');
      run(`node "${healthScript}"`);
    }
  }

  // ─── Done ─────────────────────────────────────────────────────────────────
  cleanupServerTmp();

  console.log('');
  log('done', c.green, col(c.bold, `Kit upgraded ${currentVersion} → ${sourceVersion}`));
  console.log(`\n  To verify the full install:\n  ${col(c.cyan, 'npx tsx wxkanban-agent/scripts/verify-install.ts')}\n`);
}

main().catch((err) => {
  cleanupServerTmp();
  log('error', c.red, err.message);
  process.exit(1);
});
