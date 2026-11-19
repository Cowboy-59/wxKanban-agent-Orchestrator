#!/usr/bin/env node
/**
 * check-kit-version.mjs — Check whether a newer wxKanban orchestrator kit is
 * available, by comparing the locally installed kit version against the
 * wxKanban server's `GET /api/projects/:id/kit/latest-version` endpoint
 * (spec 019 R15 AC8).
 *
 * The script also runs two local *drift* checks so a matching version-stamp
 * never falsely reports "up to date" when the working tree has actually
 * moved past the released bits:
 *
 *   1. **Dirty kit working tree** — `git status --porcelain` against the kit
 *      paths (wxkanban-agent, mcp-server, _wxAI, scripts, .vscode,
 *      package.json, package-lock.json). Any rows = local kit has
 *      uncommitted changes.
 *   2. **Unreleased commits** — if `.wxkanban-project.json.kitReleaseSha`
 *      was recorded at install/upgrade time, `git log <sha>..HEAD --
 *      <kit-paths>` flags any commits touching the kit since that SHA.
 *
 * Both checks degrade silently when git is not available (tarball installs,
 * no .git dir, etc.) — they never error.
 *
 * Usage:
 *   node scripts/check-kit-version.mjs
 *   node scripts/check-kit-version.mjs --json
 *   node scripts/check-kit-version.mjs --force
 *   node scripts/check-kit-version.mjs --force --source /path/to/wxKanban
 *   node scripts/check-kit-version.mjs --force --yes
 *   node scripts/check-kit-version.mjs --no-git-checks
 *
 * Flags:
 *   --json             Machine-readable output.
 *   --force            Treat the kit as out-of-date even if the server says
 *                      it is current, and invoke upgrade-kit.mjs with --force.
 *                      Useful when the local copy is corrupt, missing files,
 *                      or the version comparison is wrong.
 *   --source <path>    Forwarded to upgrade-kit.mjs when --force is set.
 *                      Falls back to env WXKANBAN_KIT_SOURCE.
 *   --yes              Forwarded to upgrade-kit.mjs (skip confirm prompt).
 *   --skip-setup       Forwarded to upgrade-kit.mjs.
 *   --no-git-checks    Skip the local dirty-tree + unreleased-commits drift
 *                      checks. Use when you only want the server compare.
 *
 * Exit codes:
 *   0 — kit version matches latest AND no local drift detected
 *   1 — upgrade available, --force triggered an upgrade, or local drift
 *       detected (dirty tree or unreleased commits in kit paths)
 *   2 — could not determine status (network error, missing config, etc.)
 *   3 — --force was set, upgrade was attempted, and it failed
 */

import { existsSync, readFileSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import http from 'http';
import https from 'https';
import tls from 'tls';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONSUMER_ROOT = resolve(__dirname, '..');

// ─── Args ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const JSON_MODE      = args.includes('--json');
const FORCE          = args.includes('--force');
const YES            = args.includes('--yes');
const SKIP_SETUP     = args.includes('--skip-setup');
const NO_GIT_CHECKS  = args.includes('--no-git-checks');

// Paths the kit owns. Matches KIT_DIRS + KIT_FILES in upgrade-kit.mjs.
const KIT_PATHS = [
  'wxkanban-agent',
  'mcp-server',
  '_wxAI',
  'scripts',
  '.vscode',
  'package.json',
  'package-lock.json',
];

const sourceIdx = args.indexOf('--source');
const SOURCE_ARG = sourceIdx !== -1 ? args[sourceIdx + 1] : null;
const SOURCE_PATH = SOURCE_ARG
  ? resolve(SOURCE_ARG)
  : process.env['WXKANBAN_KIT_SOURCE']
    ? resolve(process.env['WXKANBAN_KIT_SOURCE'])
    : null;

// ─── Colours ─────────────────────────────────────────────────────────────────
const c = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  cyan: '\x1b[36m', green: '\x1b[32m',
  yellow: '\x1b[33m', red: '\x1b[31m', magenta: '\x1b[35m',
};
const col = (color, text) => JSON_MODE ? text : `${color}${text}${c.reset}`;

function log(tag, color, msg) {
  if (JSON_MODE) return;
  console.log(`${col(color, `[${tag}]`)} ${msg}`);
}

function emit(payload, exitCode) {
  if (JSON_MODE) console.log(JSON.stringify(payload, null, 2));
  // Set the exit code and return rather than calling process.exit(): a hard exit
  // while TLS sockets are still tearing down crashes libuv on Windows/Node 24
  // (Assertion !(handle->flags & UV_HANDLE_CLOSING), exit -1073740791). Letting
  // the event loop drain naturally exits with the same code, without the crash.
  process.exitCode = exitCode;
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
// kitVersion stamp in .wxkanban-project.json for legacy installs.
function readKitVersion(root) {
  const pkg = readJson(join(root, 'wxkanban-agent', 'package.json'));
  if (pkg && typeof pkg.version === 'string' && pkg.version) return pkg.version;
  const cfg = readJson(join(root, '.wxkanban-project.json'));
  return cfg && typeof cfg.kitVersion === 'string' ? cfg.kitVersion : null;
}

function loadEnvFile(filePath) {
  const vars = {};
  if (!existsSync(filePath)) return vars;
  const lines = readFileSync(filePath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.substring(0, eqIdx).trim();
      let val = trimmed.substring(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      vars[key] = val;
    }
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

// ─── Git helpers (degrade silently when git/.git unavailable) ────────────────
function runGit(gitArgs, cwd = CONSUMER_ROOT) {
  try {
    const result = spawnSync('git', gitArgs, {
      cwd,
      encoding: 'utf8',
      windowsHide: true,
    });
    if (result.error || result.status !== 0) return null;
    return result.stdout ?? '';
  } catch {
    return null;
  }
}

function isGitRepo() {
  if (NO_GIT_CHECKS) return false;
  const out = runGit(['rev-parse', '--is-inside-work-tree']);
  return out !== null && out.trim() === 'true';
}

function getDirtyKitPaths() {
  // Restrict the status to the kit pathspec. -- separates paths from refs.
  const out = runGit(['status', '--porcelain', '--', ...KIT_PATHS]);
  if (out === null) return null; // git unavailable
  const lines = out.split('\n').map((l) => l.trim()).filter(Boolean);
  return lines; // empty array = clean
}

function getCommitsSinceSha(sha) {
  if (!sha) return null;
  // Verify the SHA exists locally — if not, the kit was installed from a
  // different repo and the comparison isn't meaningful here.
  const verify = runGit(['cat-file', '-e', `${sha}^{commit}`]);
  if (verify === null) return null;
  const out = runGit(['log', '--oneline', `${sha}..HEAD`, '--', ...KIT_PATHS]);
  if (out === null) return null;
  return out.split('\n').map((l) => l.trim()).filter(Boolean);
}

// ─── Corporate TLS trust (Node 24+) ─────────────────────────────────────────
// Behind a TLS-inspection proxy (Cisco Secure Access, Zscaler, etc.) the server
// cert chains to a corporate root that lives in the OS trust store but NOT in
// Node's bundled Mozilla CA list — so a request fails with
// UNABLE_TO_GET_ISSUER_CERT_LOCALLY, which the check reports as "unreachable".
// Merging the system store into Node's defaults in-process is the equivalent of
// the `--use-system-ca` flag, so no NODE_OPTIONS is needed. Feature-detected;
// silently no-ops on Node < 24 and never throws.
function trustSystemCertificates() {
  try {
    if (typeof tls.setDefaultCACertificates !== 'function' ||
        typeof tls.getCACertificates !== 'function') {
      return;
    }
    const bundled = tls.getCACertificates('bundled');
    const system = tls.getCACertificates('system');
    if (Array.isArray(system) && system.length > 0) {
      tls.setDefaultCACertificates([...bundled, ...system]);
    }
  } catch {
    // Never block the version check on CA wiring.
  }
}

function httpJsonGet(url, headers, timeoutMs = 8000) {
  return new Promise((resolveP, rejectP) => {
    const lib = url.startsWith('https:') ? https : http;
    // agent:false → no keep-alive pooling, so the socket closes promptly and the
    // event loop can drain (we no longer call process.exit(), which crashed
    // libuv on Windows/Node 24 mid-teardown).
    const req = lib.get(url, { timeout: timeoutMs, headers, agent: false }, (res) => {
      let body = '';
      res.on('data', (d) => (body += d));
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(body); } catch { /* ignore */ }
        resolveP({ status: res.statusCode, body, parsed });
      });
    });
    req.on('error', rejectP);
    req.on('timeout', () => { req.destroy(); rejectP(new Error('request timed out')); });
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  // Trust the OS cert store before any network call (corporate TLS inspection).
  trustSystemCertificates();

  if (!JSON_MODE) {
    console.log(`\n${col(c.bold + c.magenta, 'wxKanban Kit — Version Check')}\n`);
  }

  // 1. Local project config
  const consumerConfigPath = join(CONSUMER_ROOT, '.wxkanban-project.json');
  const consumerConfig = readJson(consumerConfigPath);
  if (!consumerConfig) {
    log('error', c.red, `.wxkanban-project.json not found in ${CONSUMER_ROOT}`);
    return emit({ error: 'missing-project-config', path: consumerConfigPath }, 2);
  }
  const projectId = consumerConfig.projectId;
  if (!projectId) {
    return emit({ error: 'missing-projectId-in-config' }, 2);
  }

  // Live version comes from wxkanban-agent/package.json (source of truth).
  // The .wxkanban-project.json.kitVersion is the audit stamp from the last
  // upgrade-kit.mjs run — keep both, warn if they diverge.
  const currentVersion = readKitVersion(CONSUMER_ROOT);
  const stampedVersion = consumerConfig.kitVersion ?? null;
  const stampDivergent =
    !!stampedVersion && !!currentVersion && stampedVersion !== currentVersion;

  // 2. Env / auth
  const envBag = {
    ...loadEnvFile(join(CONSUMER_ROOT, '.env')),
    ...loadEnvFile(join(CONSUMER_ROOT, 'mcp-server', '.env')),
  };
  const aiSettings = readJson(join(CONSUMER_ROOT, 'ai-settings.json'));
  const apiUrl   = resolveApiUrl(envBag);
  const apiToken = resolveApiToken(envBag, aiSettings);

  if (!apiToken && !FORCE) {
    log('error', c.red, 'WXKANBAN_API_TOKEN is not set — cannot reach server.');
    log('hint',  c.dim, 'Set WXKANBAN_API_TOKEN in .env, or pass --force to upgrade without a check.');
    return emit({
      error: 'missing-api-token',
      currentVersion,
      apiUrl,
    }, 2);
  }

  log('local',  c.cyan, `Current kit version : ${col(c.bold, currentVersion ?? '(unknown)')}  ${col(c.dim, '(from wxkanban-agent/package.json)')}`);
  if (stampDivergent) {
    log('warn', c.yellow,
      `Stamp divergence: .wxkanban-project.json.kitVersion=${stampedVersion} ≠ live ${currentVersion}. Run upgrade-kit.mjs to re-stamp.`);
  }
  log('server', c.cyan, `API URL             : ${apiUrl}`);

  // 3. Hit latest-version endpoint (skipped if --force and no token)
  let serverResult = null;
  let serverError = null;
  if (apiToken) {
    const url = `${apiUrl}/api/projects/${projectId}/kit/latest-version`;
    try {
      const { status, parsed, body } = await httpJsonGet(url, {
        Authorization: `Bearer ${apiToken}`,
        Accept: 'application/json',
        Connection: 'close',
      });
      if (status === 200 && parsed) {
        serverResult = parsed;
      } else {
        serverError = `HTTP ${status}: ${body?.slice(0, 200) ?? ''}`;
      }
    } catch (err) {
      // Surface the underlying cause code (e.g. UNABLE_TO_GET_ISSUER_CERT_LOCALLY
      // for a corporate TLS-inspection root) so the "unreachable" line is
      // self-diagnosing instead of an opaque "fetch failed".
      const code = err?.cause?.code || err?.code;
      serverError = code
        ? `${code}${err.message ? ` — ${err.message}` : ''}`
        : (err.message || String(err));
    }
  }

  if (serverResult) {
    log('latest', c.green, `Server latest        : ${col(c.bold, serverResult.latestVersion)}`);
    if (serverResult.publishedAt) {
      log('latest', c.dim, `Published            : ${serverResult.publishedAt}`);
    }
  } else if (serverError) {
    log('warn', c.yellow, `Could not reach server: ${serverError}`);
  }

  // 4. Local drift checks (kit-author safety net — see header doc)
  const drift = { available: false, dirty: null, unreleased: null, recordedSha: null };
  if (!NO_GIT_CHECKS && isGitRepo()) {
    drift.available = true;
    drift.dirty = getDirtyKitPaths();
    drift.recordedSha = consumerConfig.kitReleaseSha ?? null;
    drift.unreleased = getCommitsSinceSha(drift.recordedSha);

    if (drift.dirty && drift.dirty.length > 0) {
      log('drift', c.yellow,
        `Kit working tree is dirty (${drift.dirty.length} uncommitted change${drift.dirty.length === 1 ? '' : 's'} under kit paths).`);
      if (!JSON_MODE) {
        for (const line of drift.dirty.slice(0, 10)) {
          console.log(`         ${col(c.dim, line)}`);
        }
        if (drift.dirty.length > 10) {
          console.log(`         ${col(c.dim, `… and ${drift.dirty.length - 10} more`)}`);
        }
      }
    }
    if (drift.unreleased && drift.unreleased.length > 0) {
      log('drift', c.yellow,
        `${drift.unreleased.length} commit${drift.unreleased.length === 1 ? '' : 's'} touching kit paths since recorded release SHA ${drift.recordedSha.slice(0, 8)}.`);
      if (!JSON_MODE) {
        for (const line of drift.unreleased.slice(0, 10)) {
          console.log(`         ${col(c.dim, line)}`);
        }
        if (drift.unreleased.length > 10) {
          console.log(`         ${col(c.dim, `… and ${drift.unreleased.length - 10} more`)}`);
        }
      }
    }
    if (!drift.recordedSha) {
      log('drift', c.dim,
        '(no kitReleaseSha recorded in .wxkanban-project.json — unreleased-commits check skipped. Next upgrade-kit.mjs run will record it.)');
    }
  }

  const hasDrift =
    (drift.dirty && drift.dirty.length > 0) ||
    (drift.unreleased && drift.unreleased.length > 0);

  // 5. Decide
  const upgradeAvailable =
    !!(serverResult && serverResult.upgradeAvailable === true) ||
    (serverResult && currentVersion && serverResult.latestVersion !== currentVersion);

  if (!FORCE) {
    if (!serverResult) {
      return emit({
        ok: false,
        currentVersion,
        drift,
        error: serverError ?? 'unknown',
      }, 2);
    }
    if (upgradeAvailable) {
      log('upgrade', c.yellow,
        `Upgrade available: ${currentVersion ?? '(unknown)'} → ${serverResult.latestVersion}`);
      if (!JSON_MODE) {
        if (serverResult.releaseUrl) {
          console.log(`  ${col(c.dim, `Release notes (new commands / skills ship here): ${serverResult.releaseUrl}`)}`);
        }
        console.log(`\n  Run: ${col(c.cyan, 'node scripts/upgrade-kit.mjs --source <path>')}`);
        console.log(`  Or:  ${col(c.cyan, 'node scripts/check-kit-version.mjs --force')}\n`);
      }
      return emit({ ok: true, upgradeAvailable: true, drift, currentVersion, ...serverResult }, 1);
    }
    if (hasDrift) {
      log('warn', c.yellow,
        `Version stamp matches latest (${currentVersion}), BUT local kit has drifted from the released bits. Treating as out-of-date.`);
      if (!JSON_MODE) {
        console.log(`\n  Either: commit + cut a new release, or restore the kit from the source.`);
        console.log(`  Force restore: ${col(c.cyan, 'node scripts/check-kit-version.mjs --force --source <path>')}\n`);
      }
      return emit({ ok: true, upgradeAvailable: false, drift, currentVersion, ...serverResult }, 1);
    }
    log('ok', c.green, `Kit is up to date (${currentVersion}).`);
    return emit({ ok: true, upgradeAvailable: false, drift, currentVersion, ...serverResult }, 0);
  }

  // ─── --force path ─────────────────────────────────────────────────────────
  log('force', c.magenta,
    serverResult
      ? `--force set — will re-install kit regardless of version match.`
      : `--force set — proceeding without server check.`);

  if (!SOURCE_PATH) {
    log('error', c.red,
      'No --source path and WXKANBAN_KIT_SOURCE is not set.');
    if (!JSON_MODE) {
      console.log(`\n  Usage: node scripts/check-kit-version.mjs --force --source /path/to/wxKanban\n`);
    }
    return emit({
      error: 'missing-source-for-force',
      currentVersion,
      hint: 'Pass --source <path> or set WXKANBAN_KIT_SOURCE',
    }, 2);
  }

  // Delegate to upgrade-kit.mjs --force
  const upgradeScript = join(CONSUMER_ROOT, 'scripts', 'upgrade-kit.mjs');
  if (!existsSync(upgradeScript)) {
    return emit({ error: 'upgrade-script-missing', path: upgradeScript }, 2);
  }

  const upgradeArgs = [upgradeScript, '--source', SOURCE_PATH, '--force'];
  if (YES) upgradeArgs.push('--yes');
  if (SKIP_SETUP) upgradeArgs.push('--skip-setup');

  log('exec', c.cyan, `node ${upgradeArgs.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ')}`);

  const child = spawnSync(process.execPath, upgradeArgs, {
    cwd: CONSUMER_ROOT,
    stdio: JSON_MODE ? 'pipe' : 'inherit',
  });

  if (child.status === 0) {
    return emit({
      ok: true,
      forced: true,
      currentVersion,
      latestVersion: serverResult?.latestVersion ?? null,
      drift,
    }, 1);
  }

  return emit({
    ok: false,
    forced: true,
    drift,
    upgradeExitCode: child.status,
    stderr: child.stderr ? String(child.stderr) : null,
  }, 3);
}

main().catch((err) => {
  if (JSON_MODE) {
    console.log(JSON.stringify({ error: err.message || String(err) }, null, 2));
  } else {
    console.error(`[error] ${err.message || err}`);
  }
  process.exitCode = 2;
});
