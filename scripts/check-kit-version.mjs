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

async function main() {
  const config = readProjectConfig();
  if (!config?.projectId) {
    console.log(`${colors.dim}check-kit-version: no .wxkanban-project.json — skipping${colors.reset}`);
    process.exit(0);
  }

  const env = readEnvFile();
  const apiToken = process.env.WXKANBAN_API_TOKEN || env.WXKANBAN_API_TOKEN;
  if (!apiToken) {
    console.log(`${colors.dim}check-kit-version: no WXKANBAN_API_TOKEN — skipping${colors.reset}`);
    process.exit(0);
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
    console.log(`${colors.dim}check-kit-version: ${apiUrl} unreachable (${err.message}) — skipping${colors.reset}`);
    process.exit(0);
  }

  if (!response.ok) {
    console.log(`${colors.dim}check-kit-version: HTTP ${response.status} from ${apiUrl} — skipping${colors.reset}`);
    process.exit(0);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    console.log(`${colors.dim}check-kit-version: response was not JSON — skipping${colors.reset}`);
    process.exit(0);
  }

  const latestVersion = payload.latestVersion;
  const releaseUrl = payload.releaseUrl;
  if (!latestVersion) {
    console.log(`${colors.dim}check-kit-version: response missing latestVersion — skipping${colors.reset}`);
    process.exit(0);
  }

  // The server's own upgradeAvailable flag uses projectkits.kitversion which
  // can lag the consumer's actual installed version (e.g. consumer extracted
  // manually). Trust the local config's currentVersion as the source of truth.
  const upgradeAvailable = compareSemver(latestVersion, currentVersion) > 0;

  if (!upgradeAvailable) {
    console.log(`${colors.green}wxKanban kit ${currentVersion} — up to date${colors.reset}`);
    process.exit(0);
  }

  printUpgradeNotice({ currentVersion, latestVersion, releaseUrl });
  process.exit(0);
}

main().catch(err => {
  console.log(`${colors.dim}check-kit-version: ${err.message} — skipping${colors.reset}`);
  process.exit(0);
});
