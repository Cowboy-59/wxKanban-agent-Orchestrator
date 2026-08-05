#!/usr/bin/env node
/**
 * install-cockpit-extension.mjs — SCOPE-086 (Marketplace-only).
 *
 * Installs the VS Code Dev Cockpit from the public VS Code Marketplace
 * (wxperts.wxkanban-dev-cockpit). The kit no longer bundles or ships a `.vsix`;
 * a gallery-managed copy auto-updates itself through VS Code. Runs in TWO places
 * so the extension lands on both a fresh download and an upgrade:
 *   1. `.vscode/tasks.json` folderOpen task — fires when the consumer opens the
 *      extracted kit in VS Code (the new-download path; nothing else runs
 *      init.mjs automatically).
 *   2. `scripts/init.mjs` — imports installCockpitExtension() so manual init and
 *      `upgrade-kit.mjs` (which re-runs init.mjs) keep installing it too.
 *
 * Idempotent: installs only when the extension is not already present, so
 * repeated folder opens are a no-op. NEVER throws out of installCockpitExtension
 * — `code` may be absent or the consumer may not use VS Code at all. Set
 * WXKANBAN_NO_COCKPIT_INSTALL=1 to skip entirely.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const COCKPIT_EXTENSION_ID = 'wxperts.wxkanban-dev-cockpit';

function runCode(args) {
  const isWin = process.platform === 'win32';
  // On Windows `code` is a .cmd, which Node can only spawn via the shell. Pass
  // ONE command string (not an args array) so we avoid the DEP0190 warning that
  // `shell:true` + args array emits on every run. Non-Windows uses no shell.
  // windowsHide on BOTH branches: this runs from the .vscode/tasks.json
  // folderOpen chain (init.mjs), whose parent owns no console, so a console
  // child — cmd.exe here — is handed a new visible window on every project
  // open. stdout is captured via the pipe, not a window. Feedback e8849e53.
  const res = isWin
    ? spawnSync(['code.cmd', ...args.map((a) => `"${a}"`)].join(' '), { encoding: 'utf8', shell: true, timeout: 120_000, windowsHide: true })
    : spawnSync('code', args, { encoding: 'utf8', shell: false, timeout: 120_000, windowsHide: true });
  return { ok: res.status === 0 && !res.error, stdout: res.stdout || '' };
}

// SCOPE-086 FR-002 — visible manual-install help when `code` isn't on PATH.
// Prints a boxed banner and writes INSTALL-DEV-COCKPIT.txt at the kit root so the
// step is discoverable, not a swallowed log line. Best-effort; never throws.
function writeManualInstallHelp(root) {
  const lines = [
    'wxKanban Dev Cockpit — one manual step needed',
    '',
    "VS Code's code command was not found on your PATH, so the Dev Cockpit",
    'extension could not be installed automatically from the Marketplace.',
    '',
    'To finish installing it, either:',
    '  1. In VS Code: open the Extensions panel, search "wxKanban Dev Cockpit",',
    '     and click Install.',
    '  2. Or add the code command to PATH first (Command Palette ->',
    '     Shell Command: Install code command in PATH), then run:',
    `        code --install-extension ${COCKPIT_EXTENSION_ID}`,
    '',
    'Then reload: Command Palette -> Developer: Reload Window.',
  ];
  const bar = '='.repeat(66);
  console.log('\n' + bar + '\n' + lines.map((l) => (l ? '  ' + l : '')).join('\n') + '\n' + bar + '\n');
  try {
    fs.writeFileSync(path.join(root, 'INSTALL-DEV-COCKPIT.txt'), lines.join('\n') + '\n', 'utf8');
    console.log('[cockpit] Wrote INSTALL-DEV-COCKPIT.txt at the kit root with these steps.');
  } catch { /* best-effort */ }
}

// Is the cockpit already installed? Returns true / false, or undefined when
// `code` is unavailable (can't tell — and can't install).
function isCockpitInstalled() {
  const res = runCode(['--list-extensions']);
  if (!res.ok) return undefined;
  return res.stdout.split(/\r?\n/).some((l) => l.trim().toLowerCase() === COCKPIT_EXTENSION_ID);
}

/**
 * Best-effort install from the Marketplace. `root` is the kit root (defaults to
 * cwd). Returns one of: 'skipped-disabled' | 'no-code' | 'unchanged' |
 * 'installed' | 'install-failed'.
 */
export function installCockpitExtension(root = process.cwd()) {
  if (process.env.WXKANBAN_NO_COCKPIT_INSTALL) return 'skipped-disabled';

  const installed = isCockpitInstalled();
  if (installed === undefined) {
    // SCOPE-086 FR-002 — `code` not on PATH. Do NOT fail silently: print a boxed
    // banner AND drop a marker file at the kit root so the customer has a clear,
    // visible next step instead of just a missing extension.
    writeManualInstallHelp(root);
    return 'no-code';
  }
  if (installed) {
    // A gallery-managed copy auto-updates itself — nothing to chase here.
    console.log('[cockpit] Dev Cockpit already installed — no change (the Marketplace keeps it current).');
    return 'unchanged';
  }

  console.log('[cockpit] Installing Dev Cockpit from the VS Code Marketplace…');
  const res = runCode(['--install-extension', COCKPIT_EXTENSION_ID, '--force']);
  if (res.ok) {
    console.log('[cockpit] ✓ Dev Cockpit installed. Reload the VS Code window (Developer: Reload Window) to activate it.');
    return 'installed';
  }
  console.log('[cockpit] Dev Cockpit install did not complete; continuing. Install manually with:');
  console.log(`[cockpit]   code --install-extension ${COCKPIT_EXTENSION_ID}`);
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
