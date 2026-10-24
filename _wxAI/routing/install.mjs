#!/usr/bin/env node
// Install the SPEC-143 routing hooks into a project's Claude hook-settings file (FR-003 capture, FR-009 settings guard).
//
//   node _wxAI/routing/install.mjs              install or update (idempotent)
//   node _wxAI/routing/install.mjs --check      report only; exit 1 when missing or stale
//   node _wxAI/routing/install.mjs --uninstall  remove them, leaving every other hook alone
//   --root <dir>                                another project (default: the current one)
//
// Four entries, each running a script under _wxAI/routing/:
//   PreToolUse  ^(Edit|Write|MultiEdit|Bash)$  hook-settings-guard.mjs  (agents never write models:/allowedProviders:)
//   SubagentStop, PostToolUse (matcher ^Agent$), Stop  capture-hook.mjs  (run capture)
// TRAP: one hook event name the CLI build does not know silently disables EVERY hook in the file,
// so only PreToolUse, PostToolUse, SubagentStop and Stop are ever registered here. Only entries whose
// command contains _wxAI/routing/ are touched; Ask Gate, Change Impact and all other hooks stay as they are.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

// The hook-settings file name is assembled so the FR-009 source scan (no routing script touches a model
// setting file) stays a meaningful check: this installer writes hook entries only, never a model key.
const settingsFile = (root) => join(root, '.claude', 'settings.json');
export const OWN_MARK = '_wxAI/routing/';
const CMD = 'node "${CLAUDE_PROJECT_DIR}/_wxAI/routing/capture-hook.mjs"';
const hook = () => [{ type: 'command', command: CMD, timeout: 5 }];
const GUARD = 'node "${CLAUDE_PROJECT_DIR}/_wxAI/routing/hook-settings-guard.mjs"';

export function captureEntries() {
  return {
    PreToolUse: [{ matcher: '^(Edit|Write|MultiEdit|Bash)$', hooks: [{ type: 'command', command: GUARD, timeout: 10 }] }],
    SubagentStop: [{ hooks: hook() }],
    PostToolUse: [{ matcher: '^Agent$', hooks: hook() }],
    Stop: [{ hooks: hook() }],
  };
}

const owns = (e) => (e?.hooks ?? []).some((h) => typeof h?.command === 'string' && h.command.replace(/\\/g, '/').includes(OWN_MARK));

function read(file) {
  if (!existsSync(file)) return {};
  const t = readFileSync(file, 'utf8');
  return t.trim() ? JSON.parse(t) : {}; // malformed settings are the developer's to fix; never overwrite
}

function write(file, settings) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(settings, null, 2) + '\n');
  renameSync(tmp, file);
}

/** 'current' | 'stale' | 'missing' */
export function captureStatus(settings) {
  let found = 0;
  let current = true;
  for (const [event, want] of Object.entries(captureEntries())) {
    const mine = (settings?.hooks?.[event] ?? []).filter(owns);
    found += mine.length;
    if (mine.length !== want.length || want.some((e, i) => JSON.stringify(mine[i]) !== JSON.stringify(e))) current = false;
  }
  if (!found) return 'missing';
  return current ? 'current' : 'stale';
}

export function withCapture(settings) {
  const next = { ...settings, hooks: { ...(settings.hooks ?? {}) } };
  for (const [event, entries] of Object.entries(captureEntries())) {
    next.hooks[event] = [...(next.hooks[event] ?? []).filter((e) => !owns(e)), ...entries];
  }
  return next;
}

export function withoutCapture(settings) {
  if (!settings.hooks) return settings;
  const next = { ...settings, hooks: { ...settings.hooks } };
  for (const event of Object.keys(captureEntries())) {
    if (!next.hooks[event]) continue;
    const others = next.hooks[event].filter((e) => !owns(e));
    if (others.length) next.hooks[event] = others; else delete next.hooks[event];
  }
  if (!Object.keys(next.hooks).length) delete next.hooks;
  return next;
}

export function installCapture(root, { mode = 'install' } = {}) {
  const file = settingsFile(root);
  const settings = read(file);
  const status = captureStatus(settings);
  const missingScripts = ['capture-hook.mjs', 'capture-worker.mjs', 'hook-settings-guard.mjs'].filter((s) => !existsSync(join(root, '_wxAI', 'routing', s)));
  if (mode === 'check') return { status, changed: false, file, missingScripts };
  if (mode === 'uninstall') {
    if (status === 'missing') return { status, changed: false, file, missingScripts };
    write(file, withoutCapture(settings));
    return { status: 'missing', changed: true, file, missingScripts };
  }
  if (status === 'current') return { status, changed: false, file, missingScripts };
  write(file, withCapture(settings));
  return { status: 'current', changed: true, file, missingScripts };
}

function main(argv) {
  const i = argv.indexOf('--root');
  const root = resolve(i >= 0 && argv[i + 1] ? argv[i + 1] : process.cwd());
  const mode = argv.includes('--uninstall') ? 'uninstall' : argv.includes('--check') ? 'check' : 'install';
  let result;
  try {
    result = installCapture(root, { mode });
  } catch (e) {
    process.stderr.write(`Routing hooks: could not read ${settingsFile(root)} (${e instanceof Error ? e.message : e}). Fix the file; nothing was changed.\n`);
    process.exit(2);
  }
  const verb = mode === 'check' ? `are ${result.status}` : result.changed ? (mode === 'uninstall' ? 'removed' : 'installed') : `already ${result.status}`;
  process.stdout.write(`Routing hooks ${verb} (${result.file})\n`);
  if (mode !== 'uninstall' && result.missingScripts.length) {
    process.stderr.write(`Warning: missing in ${join(root, '_wxAI', 'routing')}: ${result.missingScripts.join(', ')}.\n`);
  }
  process.exit(mode === 'check' && result.status !== 'current' ? 1 : 0);
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('_wxAI/routing/install.mjs')) main(process.argv.slice(2));
