#!/usr/bin/env node
// Install the Change Impact PreToolUse hook into a project's .claude/settings.json (SCOPE-137 FR-008).
//
//   node _wxAI/impact/install-hook.mjs              install or update (idempotent)
//   node _wxAI/impact/install-hook.mjs --check      report only; exit 1 when missing or stale
//   node _wxAI/impact/install-hook.mjs --uninstall  remove it, leaving every other hook alone
//   --root <dir>                                     another project (default: the current one)
//
// Only the one entry this kit owns is touched — it is found by the script path in its
// command — so a project's own hooks and settings are never rewritten.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

// [SCOPE 137 / T009] BEGIN — Install, check or remove the Change Impact hook entry (FR-008)
// MODIFIED-BY: [SCOPE 137 / T016] — installing also makes the project .gitignore cover the per-developer state (approvals, pending changes)
export const HOOK_SCRIPT = '_wxAI/impact/hook.mjs';
export const HOOK_MATCHER = '^(Edit|Write|MultiEdit|NotebookEdit)$';

/** The entry the kit owns. Data loss is checked before anything slow, so a timeout cannot let it through. */
export function hookEntry() {
  return {
    matcher: HOOK_MATCHER,
    hooks: [
      {
        type: 'command',
        command: `node "\${CLAUDE_PROJECT_DIR}/${HOOK_SCRIPT}"`,
        timeout: 60,
        statusMessage: 'Checking change impact...',
      },
    ],
  };
}

const ownsEntry = (entry) => (entry?.hooks ?? []).some((h) => typeof h?.command === 'string' && h.command.includes(HOOK_SCRIPT));

function readSettings(file) {
  if (!existsSync(file)) return {};
  const text = readFileSync(file, 'utf8');
  if (!text.trim()) return {};
  return JSON.parse(text); // a malformed settings file is the developer's to fix; never overwrite it
}

function writeSettings(file, settings) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(settings, null, 2) + '\n');
  renameSync(tmp, file);
}

/** 'current' | 'stale' | 'missing' */
export function hookStatus(settings) {
  const entries = settings?.hooks?.PreToolUse ?? [];
  const mine = entries.filter(ownsEntry);
  if (!mine.length) return 'missing';
  return mine.length === 1 && JSON.stringify(mine[0]) === JSON.stringify(hookEntry()) ? 'current' : 'stale';
}

export function withHook(settings) {
  const next = { ...settings, hooks: { ...(settings.hooks ?? {}) } };
  const others = (next.hooks.PreToolUse ?? []).filter((e) => !ownsEntry(e));
  next.hooks.PreToolUse = [...others, hookEntry()];
  return next;
}

export function withoutHook(settings) {
  if (!settings.hooks?.PreToolUse) return settings;
  const next = { ...settings, hooks: { ...settings.hooks } };
  const others = next.hooks.PreToolUse.filter((e) => !ownsEntry(e));
  if (others.length) next.hooks.PreToolUse = others;
  else delete next.hooks.PreToolUse;
  if (!Object.keys(next.hooks).length) delete next.hooks;
  return next;
}

/**
 * Files the hook and unattended runs keep per developer. An approval or a pending change in a
 * commit would let someone else's edit through, so the project's .gitignore must cover them.
 */
export const IGNORED_STATE = [
  '.wxai/impact.json',
  '.wxai/impact-summary.md',
  '.wxai/impact-index/',
  '.wxai/impact-queue.jsonl',
  '.wxai/impact-queue.rejected.jsonl',
  '.wxai/impact-pending.json',
  '.wxai/impact-approvals.json',
  '.wxai/impact-crossings.jsonl',
  '.wxai/impact-crossings.checkpoint',
  '.wxai/impact-unattended.json',
];

/** Append whatever of IGNORED_STATE the project's .gitignore lacks. Never rewrites a line. */
export function ensureIgnored(root) {
  const file = join(root, '.gitignore');
  const text = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const have = new Set(text.split(/\r?\n/).map((l) => l.trim().replace(/^\*\*\//, '')));
  const missing = IGNORED_STATE.filter((p) => !have.has(p));
  if (!missing.length) return [];
  const sep = text.length && !text.endsWith('\n') ? '\n' : '';
  writeFileSync(file, `${text}${sep}# wxKanban Change Impact — per-developer state (SCOPE-137); never commit approvals\n${missing.join('\n')}\n`);
  return missing;
}

export function installHook(root, { mode = 'install' } = {}) {
  const file = join(root, '.claude', 'settings.json');
  const settings = readSettings(file);
  const status = hookStatus(settings);
  if (mode === 'check') return { status, changed: false, file };
  if (mode === 'uninstall') {
    if (status === 'missing') return { status, changed: false, file };
    writeSettings(file, withoutHook(settings));
    return { status: 'missing', changed: true, file };
  }
  const ignored = ensureIgnored(root);
  if (status === 'current') return { status, changed: ignored.length > 0, file, ignored };
  writeSettings(file, withHook(settings));
  return { status: 'current', changed: true, file, ignored };
}

function main(argv) {
  const i = argv.indexOf('--root');
  const root = resolve(i >= 0 && argv[i + 1] ? argv[i + 1] : process.cwd());
  const mode = argv.includes('--uninstall') ? 'uninstall' : argv.includes('--check') ? 'check' : 'install';
  let result;
  try {
    result = installHook(root, { mode });
  } catch (e) {
    process.stderr.write(`Change Impact hook: could not read ${join(root, '.claude', 'settings.json')} (${e instanceof Error ? e.message : e}). Fix the file; nothing was changed.\n`);
    process.exit(2);
  }
  const verb = mode === 'check' ? `is ${result.status}` : result.changed ? (mode === 'uninstall' ? 'removed' : 'installed') : `already ${result.status}`;
  process.stdout.write(`Change Impact hook ${verb} (${result.file})\n`);
  process.exit(mode === 'check' && result.status !== 'current' ? 1 : 0);
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('_wxAI/impact/install-hook.mjs')) main(process.argv.slice(2));
// [SCOPE 137 / T009] END
