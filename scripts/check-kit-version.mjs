#!/usr/bin/env node
/**
 * check-kit-version.mjs — spec 019 R15 AC7+AC8.
 *
 * Runs as a folderOpen task in .vscode/tasks.json. Compares the kit version
 * recorded in .wxkanban-project.json against the latest available release
 * (via wxKanban's /api/projects/:id/kit/latest-version endpoint). Prints an
 * up-to-date or upgrade-available notice. Always exits 0 — never blocks
 * workspace open.
 *
 * Usage:
 *   node scripts/check-kit-version.mjs
 *
 * Configuration (priority order):
 *   1. process.env.WXKANBAN_API_URL    — env override (CI / dev)
 *   2. .wxkanban-project.json wxkanbanApiUrl field
 *   3. https://wxkanban.wxperts.com    — hardcoded default
 */

import fs from 'node:fs';
import path from 'node:path';
import tls from 'node:tls';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const DEFAULT_API_URL = 'https://wxkanban.wxperts.com';

const colors = {
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  reset: '\x1b[0m',
};

function readProjectConfig() {
  const configPath = path.join(root, '.wxkanban-project.json');
  if (!fs.existsSync(configPath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (err) {
    console.error(`${colors.red}check-kit-version: .wxkanban-project.json is not valid JSON: ${err.message}${colors.reset}`);
    return null;
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

function compareSemver(a, b) {
  const norm = s => String(s).replace(/^v/, '').split('.').map(p => parseInt(p, 10));
  const aP = norm(a);
  const bP = norm(b);
  if (aP.some(Number.isNaN) || bP.some(Number.isNaN)) return String(a).localeCompare(String(b));
  const len = Math.max(aP.length, bP.length);
  for (let i = 0; i < len; i++) {
    const ai = aP[i] ?? 0;
    const bi = bP[i] ?? 0;
    if (ai !== bi) return ai - bi;
  }
  return 0;
}

function printUpgradeNotice({ currentVersion, latestVersion, releaseUrl }) {
  const bar = '═'.repeat(70);
  console.log('');
  console.log(`${colors.cyan}${colors.bold}╔${bar}╗${colors.reset}`);
  console.log(`${colors.cyan}${colors.bold}║${colors.reset}  ${colors.yellow}${colors.bold}wxKanban kit upgrade available${colors.reset}` + ' '.repeat(70 - 32) + `${colors.cyan}${colors.bold}║${colors.reset}`);
  console.log(`${colors.cyan}${colors.bold}╠${bar}╣${colors.reset}`);
  console.log(`${colors.cyan}${colors.bold}║${colors.reset}  Current:    ${colors.dim}${currentVersion}${colors.reset}` + ' '.repeat(Math.max(0, 70 - 14 - currentVersion.length)) + `${colors.cyan}${colors.bold}║${colors.reset}`);
  console.log(`${colors.cyan}${colors.bold}║${colors.reset}  Available:  ${colors.green}${colors.bold}${latestVersion}${colors.reset}` + ' '.repeat(Math.max(0, 70 - 14 - latestVersion.length)) + `${colors.cyan}${colors.bold}║${colors.reset}`);
  console.log(`${colors.cyan}${colors.bold}║${colors.reset}` + ' '.repeat(70) + `${colors.cyan}${colors.bold}║${colors.reset}`);
  console.log(`${colors.cyan}${colors.bold}║${colors.reset}  ${colors.bold}To upgrade:${colors.reset}` + ' '.repeat(70 - 13) + `${colors.cyan}${colors.bold}║${colors.reset}`);
  console.log(`${colors.cyan}${colors.bold}║${colors.reset}    ${colors.green}node scripts/upgrade-kit.mjs${colors.reset}` + ' '.repeat(70 - 32) + `${colors.cyan}${colors.bold}║${colors.reset}`);
  console.log(`${colors.cyan}${colors.bold}║${colors.reset}` + ' '.repeat(70) + `${colors.cyan}${colors.bold}║${colors.reset}`);
  if (releaseUrl) {
    const truncated = releaseUrl.length > 64 ? releaseUrl.slice(0, 61) + '...' : releaseUrl;
    console.log(`${colors.cyan}${colors.bold}║${colors.reset}  ${colors.dim}Release notes: ${truncated}${colors.reset}` + ' '.repeat(Math.max(0, 70 - 17 - truncated.length)) + `${colors.cyan}${colors.bold}║${colors.reset}`);
  }
  console.log(`${colors.cyan}${colors.bold}╚${bar}╝${colors.reset}`);
  console.log('');
}

// Trust the OS certificate store in addition to Node's bundled CA list, so the
// check works behind a corporate TLS-inspection proxy (Cisco Secure Access,
// Zscaler, …) whose root CA is in the OS store but not Node's bundled list.
// In-process equivalent of --use-system-ca (Node 24+); feature-detected, never
// throws. See BUG-REPORT-kit-dbpush-tls-and-packaging.md.
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
  const config = readProjectConfig();
  if (!config?.projectId) {
    console.log(`${colors.dim}check-kit-version: no .wxkanban-project.json — skipping${colors.reset}`);
    return;
  }

  const env = readEnvFile();
  const apiToken = process.env.WXKANBAN_API_TOKEN || env.WXKANBAN_API_TOKEN;
  if (!apiToken) {
    console.log(`${colors.dim}check-kit-version: no WXKANBAN_API_TOKEN — skipping${colors.reset}`);
    return;
  }

  const apiUrl = resolveApiUrl(config);
  const currentVersion = config.kitVersion || config.version || 'unknown';
  const endpoint = `${apiUrl}/api/projects/${encodeURIComponent(config.projectId)}/kit/latest-version`;

  let response;
  try {
    response = await fetch(endpoint, {
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Accept': 'application/json',
      },
    });
  } catch (err) {
    const code = err?.cause?.code ?? err?.code;
    console.log(`${colors.dim}check-kit-version: ${apiUrl} unreachable (${code ? code + ': ' : ''}${err.message}) — skipping${colors.reset}`);
    return;
  }

  if (!response.ok) {
    console.log(`${colors.dim}check-kit-version: HTTP ${response.status} from ${apiUrl} — skipping${colors.reset}`);
    return;
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    console.log(`${colors.dim}check-kit-version: response was not JSON — skipping${colors.reset}`);
    return;
  }

  const latestVersion = payload.latestVersion;
  const releaseUrl = payload.releaseUrl;
  if (!latestVersion) {
    console.log(`${colors.dim}check-kit-version: response missing latestVersion — skipping${colors.reset}`);
    return;
  }

  // The server's own upgradeAvailable flag uses projectkits.kitversion which
  // can lag the consumer's actual installed version (e.g. consumer extracted
  // manually). Trust the local config's currentVersion as the source of truth.
  const upgradeAvailable = compareSemver(latestVersion, currentVersion) > 0;

  if (!upgradeAvailable) {
    console.log(`${colors.green}wxKanban kit ${currentVersion} — up to date${colors.reset}`);
    return;
  }

  printUpgradeNotice({ currentVersion, latestVersion, releaseUrl });
  return;
}

main().catch(err => {
  console.log(`${colors.dim}check-kit-version: ${err.message} — skipping${colors.reset}`);
  return;
});
