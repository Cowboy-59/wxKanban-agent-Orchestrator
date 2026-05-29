#!/usr/bin/env node
/**
 * install-cockpit-extension.mjs — Spec 042 FR-009/FR-010.
 *
 * Installs/updates the VS Code Dev Cockpit extension from the .vsix bundled in
 * the kit. Runs in TWO places so the extension lands on both a fresh download
 * and an upgrade:
 *   1. `.vscode/tasks.json` folderOpen task — fires when the consumer opens the
 *      extracted kit in VS Code (the new-download path; nothing else runs
 *      init.mjs automatically).
 *   2. `scripts/init.mjs` — imports installCockpitExtension() so manual init and
 *      `upgrade-kit.mjs` (which re-runs init.mjs) keep installing it too.
 *
 * Idempotent + version-aware: installs only when VS Code doesn't already have
 * the bundled version, so repeated folder opens are a no-op. NEVER throws out
 * of installCockpitExtension — `code` may be absent or the consumer may not use
 * VS Code at all. Set WXKANBAN_NO_COCKPIT_INSTALL=1 to skip entirely.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const COCKPIT_EXTENSION_ID = 'wxperts.wxkanban-dev-cockpit';

export function findBundledVsix(root) {
  const extDir = path.join(root, 'vscode-extension');
  if (!fs.existsSync(extDir)) return null;
  const vsix = fs.readdirSync(extDir).filter((f) => f.endsWith('.vsix')).sort();
  if (vsix.length === 0) return null;
  const file = vsix[vsix.length - 1];
  const m = file.match(/-(\d+\.\d+\.\d+)\.vsix$/);
  return { path: path.join(extDir, file), version: m ? m[1] : null };
}

function runCode(args) {
  const isWin = process.platform === 'win32';
  // On Windows `code` is a .cmd, which Node can only spawn via the shell. Pass
  // ONE command string (not an args array) so we avoid the DEP0190 warning that
  // `shell:true` + args array emits on every run. Non-Windows uses no shell.
  const res = isWin
    ? spawnSync(['code.cmd', ...args.map((a) => `"${a}"`)].join(' '), { encoding: 'utf8', shell: true, timeout: 60_000 })
    : spawnSync('code', args, { encoding: 'utf8', shell: false, timeout: 60_000 });
  return { ok: res.status === 0 && !res.error, stdout: res.stdout || '' };
}

function installedCockpitVersion() {
  const res = runCode(['--list-extensions', '--show-versions']);
  if (!res.ok) return undefined; // `code` not available
  const line = res.stdout.split(/\r?\n/).find((l) => l.startsWith(`${COCKPIT_EXTENSION_ID}@`));
  return line ? line.split('@')[1]?.trim() : null; // null = not installed
}

/**
 * Best-effort install/update. `root` is the kit root (defaults to cwd).
 * Returns one of: 'skipped-disabled' | 'no-vsix' | 'no-code' | 'unchanged' |
 * 'installed' | 'install-failed'.
 */
export function installCockpitExtension(root = process.cwd()) {
  if (process.env.WXKANBAN_NO_COCKPIT_INSTALL) return 'skipped-disabled';

  const bundled = findBundledVsix(root);
  if (!bundled) return 'no-vsix';

  const installed = installedCockpitVersion();
  if (installed === undefined) {
    console.log('[cockpit] VS Code `code` CLI not found on PATH; skipping Dev Cockpit install.');
    console.log(`[cockpit]   To install manually: code --install-extension "${bundled.path}"`);
    return 'no-code';
  }
  if (installed && bundled.version && installed === bundled.version) {
    console.log(`[cockpit] Dev Cockpit ${installed} already installed — no change.`);
    return 'unchanged';
  }

  console.log(`[cockpit] Installing Dev Cockpit extension (${installed ?? 'none'} → ${bundled.version ?? 'bundled'})…`);
  const res = runCode(['--install-extension', bundled.path, '--force']);
  if (res.ok) {
    console.log('[cockpit] ✓ Dev Cockpit installed. Reload the VS Code window (Developer: Reload Window) to activate it.');
    return 'installed';
  }
  console.log('[cockpit] Dev Cockpit install did not complete; continuing. Install manually with:');
  console.log(`[cockpit]   code --install-extension "${bundled.path}"`);
  return 'install-failed';
}

// CLI entry — used by the .vscode/tasks.json folderOpen task.
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    installCockpitExtension(process.cwd());
  } catch (err) {
    console.log(`[cockpit] install skipped (${err?.message ?? err}).`);
  }
}
