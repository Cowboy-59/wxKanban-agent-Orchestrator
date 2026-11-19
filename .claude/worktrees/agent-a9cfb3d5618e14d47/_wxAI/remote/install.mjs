#!/usr/bin/env node
// [SCOPE 155 / T002] BEGIN — install the session-feed Stop hook (FR-002, SCOPE-132 Amendment G piece A)
//
//   node _wxAI/remote/install.mjs              install or update (idempotent)
//   node _wxAI/remote/install.mjs --check      report only; exit 1 when missing or stale
//   node _wxAI/remote/install.mjs --uninstall  remove it, leaving every other hook alone
//   --root <dir>                               another project (default: the current one)
//
// One entry, Stop, running session-feed-hook.mjs. Mirrors _wxAI/routing/install.mjs's merge-by-
// "owns"-marker pattern so re-running is always safe and every other hook stays untouched.
// Same trap as that installer: one hook event name the CLI build does not know silently disables
// EVERY hook in the file, so only the already-registered event names are ever used here.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const settingsFile = (root) => join(root, '.claude', 'settings.json');
export const OWN_MARK = '_wxAI/remote/session-feed-hook.mjs';
const CMD = 'node "${CLAUDE_PROJECT_DIR}/_wxAI/remote/session-feed-hook.mjs"';

export function feedEntries() {
  return {
    Stop: [{ hooks: [{ type: 'command', command: CMD, timeout: 5 }] }],
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
export function feedStatus(settings) {
  let found = 0;
  let current = true;
  for (const [event, want] of Object.entries(feedEntries())) {
    const mine = (settings?.hooks?.[event] ?? []).filter(owns);
    found += mine.length;
    if (mine.length !== want.length || want.some((e, i) => JSON.stringify(mine[i]) !== JSON.stringify(e))) current = false;
  }
  if (!found) return 'missing';
  return current ? 'current' : 'stale';
}

export function withFeed(settings) {
  const next = { ...settings, hooks: { ...(settings.hooks ?? {}) } };
  for (const [event, entries] of Object.entries(feedEntries())) {
    next.hooks[event] = [...(next.hooks[event] ?? []).filter((e) => !owns(e)), ...entries];
  }
  return next;
}

export function withoutFeed(settings) {
  if (!settings.hooks) return settings;
  const next = { ...settings, hooks: { ...settings.hooks } };
  for (const event of Object.keys(feedEntries())) {
    if (!next.hooks[event]) continue;
    const others = next.hooks[event].filter((e) => !owns(e));
    if (others.length) next.hooks[event] = others; else delete next.hooks[event];
  }
  if (!Object.keys(next.hooks).length) delete next.hooks;
  return next;
}

export function installFeed(root, { mode = 'install' } = {}) {
  const file = settingsFile(root);
  const settings = read(file);
  const status = feedStatus(settings);
  const missingScripts = ['session-feed-hook.mjs', 'session-feed-worker.mjs'].filter((s) => !existsSync(join(root, '_wxAI', 'remote', s)));
  if (mode === 'check') return { status, changed: false, file, missingScripts };
  if (mode === 'uninstall') {
    if (status === 'missing') return { status, changed: false, file, missingScripts };
    write(file, withoutFeed(settings));
    return { status: 'missing', changed: true, file, missingScripts };
  }
  if (status === 'current') return { status, changed: false, file, missingScripts };
  write(file, withFeed(settings));
  return { status: 'current', changed: true, file, missingScripts };
}

function main(argv) {
  const i = argv.indexOf('--root');
  const root = resolve(i >= 0 && argv[i + 1] ? argv[i + 1] : process.cwd());
  const mode = argv.includes('--uninstall') ? 'uninstall' : argv.includes('--check') ? 'check' : 'install';
  let result;
  try {
    result = installFeed(root, { mode });
  } catch (e) {
    process.stderr.write(`Session-feed hook: could not read ${settingsFile(root)} (${e instanceof Error ? e.message : e}). Fix the file; nothing was changed.\n`);
    process.exit(2);
  }
  const verb = mode === 'check' ? `are ${result.status}` : result.changed ? (mode === 'uninstall' ? 'removed' : 'installed') : `already ${result.status}`;
  process.stdout.write(`Session-feed hook ${verb} (${result.file})\n`);
  if (mode !== 'uninstall' && result.missingScripts.length) {
    process.stderr.write(`Warning: missing in ${join(root, '_wxAI', 'remote')}: ${result.missingScripts.join(', ')}.\n`);
  }
  process.exit(mode === 'check' && result.status !== 'current' ? 1 : 0);
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('_wxAI/remote/install.mjs')) main(process.argv.slice(2));
// [SCOPE 155 / T002] END
