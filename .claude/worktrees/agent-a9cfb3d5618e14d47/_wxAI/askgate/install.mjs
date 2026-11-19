#!/usr/bin/env node
// Install the Ask Gate hooks into a project's .claude/settings.json (SPEC-142 FR-005, FR-002, FR-006).
//
//   node _wxAI/askgate/install.mjs              install or update (idempotent)
//   node _wxAI/askgate/install.mjs --check      report only; exit 1 when missing or stale
//   node _wxAI/askgate/install.mjs --uninstall  remove them, leaving every other hook alone
//   --root <dir>                                another project (default: the current one)
//
// Three entries, each found by its script path:
//   PreToolUse  ^AskUserQuestion$                          _wxAI/askgate/hook-tool.mjs
//   PreToolUse  ^(Edit|Write|MultiEdit|NotebookEdit|Bash)$ _wxAI/askgate/hook-ledger-guard.mjs
//   Stop                                                   _wxAI/askgate/hook-stop.mjs
// Only entries whose command contains _wxAI/askgate/ are touched. The SCOPE-137 Change Impact entry
// (_wxAI/impact/hook.mjs) and every other hook and setting are left exactly as they are. A reinstall
// leaves exactly one of each.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export const KIT_DIR = '_wxAI/askgate/';
export const STATE_IGNORE = '.wxai/askgate-stop-turns.json';

const command = (script) => `node "\${CLAUDE_PROJECT_DIR}/${KIT_DIR}${script}"`;

/** The entries the kit owns, by hook event. */
// [SCOPE 142 / T008] BEGIN — Ask Gate PreToolUse hook on AskUserQuestion, installed besi…
export function askGateEntries() {
  return {
    PreToolUse: [
      { matcher: '^AskUserQuestion$', hooks: [{ type: 'command', command: command('hook-tool.mjs'), timeout: 15, statusMessage: 'Checking the Decision Ledger...' }] },
      { matcher: '^(Edit|Write|MultiEdit|NotebookEdit|Bash)$', hooks: [{ type: 'command', command: command('hook-ledger-guard.mjs'), timeout: 10, statusMessage: 'Checking for ledger writes...' }] },
    ],
    Stop: [
      { hooks: [{ type: 'command', command: command('hook-stop.mjs'), timeout: 15, statusMessage: 'Checking for a question the ledger answers...' }] },
    ],
  };
}
// [SCOPE 142 / T008] END

export const SCRIPTS = ['hook-tool.mjs', 'hook-ledger-guard.mjs', 'hook-stop.mjs'];

const ownsEntry = (entry) => (entry?.hooks ?? []).some((h) => typeof h?.command === 'string' && h.command.replace(/\\/g, '/').includes(KIT_DIR));

// [SCOPE 142 / T008] BEGIN — Ask Gate PreToolUse hook on AskUserQuestion, installed besi…
function readSettingsFile(file) {
  if (!existsSync(file)) return {};
  const text = readFileSync(file, 'utf8');
  if (!text.trim()) return {};
  return JSON.parse(text); // a malformed settings file is the developer's to fix; never overwrite it
}
// [SCOPE 142 / T008] END

// [SCOPE 142 / T008] BEGIN — Ask Gate PreToolUse hook on AskUserQuestion, installed besi…
function writeSettingsFile(file, settings) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(settings, null, 2) + '\n');
  renameSync(tmp, file);
}
// [SCOPE 142 / T008] END

/** 'current' | 'stale' | 'missing' */
// [SCOPE 142 / T008] BEGIN — Ask Gate PreToolUse hook on AskUserQuestion, installed besi…
export function askGateStatus(settings) {
  const want = askGateEntries();
  let found = 0;
  let current = true;
  for (const [event, entries] of Object.entries(want)) {
    const mine = (settings?.hooks?.[event] ?? []).filter(ownsEntry);
    found += mine.length;
    if (mine.length !== entries.length || entries.some((e, i) => JSON.stringify(mine[i]) !== JSON.stringify(e))) current = false;
  }
  if (!found) return 'missing';
  return current ? 'current' : 'stale';
}
// [SCOPE 142 / T008] END

// [SCOPE 142 / T008] BEGIN — Ask Gate PreToolUse hook on AskUserQuestion, installed besi…
export function withAskGate(settings) {
  const next = { ...settings, hooks: { ...(settings.hooks ?? {}) } };
  for (const [event, entries] of Object.entries(askGateEntries())) {
    const others = (next.hooks[event] ?? []).filter((e) => !ownsEntry(e));
    next.hooks[event] = [...others, ...entries];
  }
  return next;
}
// [SCOPE 142 / T008] END

// [SCOPE 142 / T008] BEGIN — Ask Gate PreToolUse hook on AskUserQuestion, installed besi…
export function withoutAskGate(settings) {
  if (!settings.hooks) return settings;
  const next = { ...settings, hooks: { ...settings.hooks } };
  for (const event of Object.keys(askGateEntries())) {
    if (!next.hooks[event]) continue;
    const others = next.hooks[event].filter((e) => !ownsEntry(e));
    if (others.length) next.hooks[event] = others;
    else delete next.hooks[event];
  }
  if (!Object.keys(next.hooks).length) delete next.hooks;
  return next;
}
// [SCOPE 142 / T008] END

/** The Stop hook's per-session guard state is per-developer; keep it out of commits. */
// [SCOPE 142 / T008] BEGIN — Ask Gate PreToolUse hook on AskUserQuestion, installed besi…
export function ensureIgnored(root) {
  const file = join(root, '.gitignore');
  const text = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const have = new Set(text.split(/\r?\n/).map((l) => l.trim().replace(/^\*\*\//, '')));
  if (have.has(STATE_IGNORE) || have.has('.wxai/') || have.has('.wxai')) return [];
  const sep = text.length && !text.endsWith('\n') ? '\n' : '';
  writeFileSync(file, `${text}${sep}# wxKanban Ask Gate: per-developer state (SPEC-142)\n${STATE_IGNORE}\n`);
  return [STATE_IGNORE];
}
// [SCOPE 142 / T008] END

// [SCOPE 142 / T008] BEGIN — Ask Gate PreToolUse hook on AskUserQuestion, installed besi…
export function installAskGate(root, { mode = 'install' } = {}) {
// [SCOPE 142 / T008] END
  const file = join(root, '.claude', 'settings.json');
  const settings = readSettingsFile(file);
  const status = askGateStatus(settings);
  const missingScripts = SCRIPTS.filter((s) => !existsSync(join(root, KIT_DIR, s)));
  if (mode === 'check') return { status, changed: false, file, missingScripts };
  if (mode === 'uninstall') {
    if (status === 'missing') return { status, changed: false, file, missingScripts };
    writeSettingsFile(file, withoutAskGate(settings));
    return { status: 'missing', changed: true, file, missingScripts };
  }
  const ignored = ensureIgnored(root);
  if (status === 'current') return { status, changed: ignored.length > 0, file, ignored, missingScripts };
  writeSettingsFile(file, withAskGate(settings));
  return { status: 'current', changed: true, file, ignored, missingScripts };
}

// [SCOPE 142 / T008] BEGIN — Ask Gate PreToolUse hook on AskUserQuestion, installed besi…
function main(argv) {
  const i = argv.indexOf('--root');
  const root = resolve(i >= 0 && argv[i + 1] ? argv[i + 1] : process.cwd());
  const mode = argv.includes('--uninstall') ? 'uninstall' : argv.includes('--check') ? 'check' : 'install';
  let result;
  try {
    result = installAskGate(root, { mode });
  } catch (e) {
    process.stderr.write(`Ask Gate hooks: could not read ${join(root, '.claude', 'settings.json')} (${e instanceof Error ? e.message : e}). Fix the file; nothing was changed.\n`);
    process.exit(2);
  }
  const verb = mode === 'check' ? `are ${result.status}` : result.changed ? (mode === 'uninstall' ? 'removed' : 'installed') : `already ${result.status}`;
  process.stdout.write(`Ask Gate hooks ${verb} (${result.file})\n`);
  if (mode !== 'uninstall' && result.missingScripts.length) {
    process.stderr.write(`Warning: these hook scripts are not in ${join(root, KIT_DIR)}: ${result.missingScripts.join(', ')}. Install the kit files, or each call will report a hook error.\n`);
  }
  process.exit(mode === 'check' && result.status !== 'current' ? 1 : 0);
}
// [SCOPE 142 / T008] END

if (process.argv[1]?.replace(/\\/g, '/').endsWith('_wxAI/askgate/install.mjs')) main(process.argv.slice(2));
