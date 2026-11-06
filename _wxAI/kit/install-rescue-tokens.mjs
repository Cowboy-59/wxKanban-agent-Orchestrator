#!/usr/bin/env node
// Install the rescue-tokens skill (SPEC-153 / SCOPE-154) into a kit consumer's global
// Claude Code profile: the skill files under ~/.claude/skills/rescue-tokens/, plus one
// SessionStart hook entry in ~/.claude/settings.json so it activates every session.
//
//   node _wxAI/kit/install-rescue-tokens.mjs              install or update (idempotent)
//   node _wxAI/kit/install-rescue-tokens.mjs --check      report only; exit 1 when action is needed
//   node _wxAI/kit/install-rescue-tokens.mjs --uninstall  remove only what this script itself added
//   --root <dir>                                          kit project to copy the skill from
//                                                          (default: the current one)
//
// Source of truth for the skill files is this kit's own <root>/_wxAI/skills/rescue-tokens/
// (kept byte-identical to .claude/skills/ and wxkanban-agent/templates/skills/ by
// check-skill-mirrors.mts). Destination is always the user's global profile — rescue-tokens is
// meant to be active for every kit-consumer project on the machine, not per-project.
//
// Never silently overwrites a user's own copy of the skill files, and never touches a
// hand-authored SessionStart hook that already mentions rescue-tokens under different wording.
// Prints what it did; never silent.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

export const SKILL_NAME = 'rescue-tokens';
export const HOOK_MATCHER = 'startup|resume';
export const HOOK_COMMAND =
  "echo 'Run the rescue-tokens skill now: watch token/context pressure, rate-limit risk, wrong-model routing, and runaway verbosity, and act per its red-flag matrix.'";
export const HOOK_STATUS_MESSAGE = 'Checking rescue-tokens red-flags';
const MARKER_FILE = '.wxkanban-kit-install.json';
const SKILL_FILES = ['SKILL.md', 'README.md'];

const kitSkillDir = (root) => join(root, '_wxAI', 'skills', SKILL_NAME);
const userSkillDir = () => join(homedir(), '.claude', 'skills', SKILL_NAME);
const userSettingsFile = () => join(homedir(), '.claude', 'settings.json');

// [SCOPE 153 / T002] BEGIN — — Build install-rescue-tokens.mjs installer
function read(file) {
  if (!existsSync(file)) return {};
  const t = readFileSync(file, 'utf8');
  if (!t.trim()) return {};
  try {
    return JSON.parse(t);
  } catch {
    return undefined; // malformed; caller decides what to do
  }
}
// [SCOPE 153 / T002] END

// [SCOPE 153 / T002] BEGIN — — Build install-rescue-tokens.mjs installer
function write(file, data) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  renameSync(tmp, file);
}
// [SCOPE 153 / T002] END

// [SCOPE 153 / T002] BEGIN — — Build install-rescue-tokens.mjs installer
function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}
// [SCOPE 153 / T002] END

// [SCOPE 153 / T002] BEGIN — — Build install-rescue-tokens.mjs installer
function mentionsRescueTokens(command) {
  return typeof command === 'string' && /rescue-tokens/i.test(command);
}
// [SCOPE 153 / T002] END

// [SCOPE 153 / T002] BEGIN — — Build install-rescue-tokens.mjs installer
function isOurHookEntry(entry) {
  return (
    entry?.matcher === HOOK_MATCHER &&
    Array.isArray(entry.hooks) &&
    entry.hooks.length === 1 &&
    entry.hooks[0]?.command === HOOK_COMMAND
  );
}
// [SCOPE 153 / T002] END

/**
 * planHook(settings) -> { action: 'set' | 'kept', detail }
 *   'set'  — no existing SessionStart entry mentions rescue-tokens; install mode will add ours.
 *   'kept' — an entry (ours, or hand-authored under different wording) already mentions it.
 */
// [SCOPE 153 / T002] BEGIN — — Build install-rescue-tokens.mjs installer
function planHook(settings) {
  const sessionStart = settings?.hooks?.SessionStart;
  if (!Array.isArray(sessionStart)) return { action: 'set', detail: 'no SessionStart hooks yet' };
  const ours = sessionStart.find(isOurHookEntry);
  if (ours) return { action: 'kept', detail: `already installed in ${userSettingsFile()}` };
  const other = sessionStart.find((entry) => Array.isArray(entry?.hooks) && entry.hooks.some((h) => mentionsRescueTokens(h?.command)));
  if (other) return { action: 'kept', detail: `a different rescue-tokens hook already exists in ${userSettingsFile()} — left untouched` };
  return { action: 'set', detail: 'no existing rescue-tokens hook' };
}
// [SCOPE 153 / T002] END

// [SCOPE 153 / T002] BEGIN — — Build install-rescue-tokens.mjs installer
function installHookInto(settings) {
  const next = { ...settings, hooks: { ...(settings.hooks ?? {}) } };
  const sessionStart = Array.isArray(next.hooks.SessionStart) ? [...next.hooks.SessionStart] : [];
  sessionStart.push({
    matcher: HOOK_MATCHER,
    hooks: [{ type: 'command', command: HOOK_COMMAND, timeout: 5, statusMessage: HOOK_STATUS_MESSAGE }],
  });
  next.hooks.SessionStart = sessionStart;
  return next;
}
// [SCOPE 153 / T002] END

// [SCOPE 153 / T002] BEGIN — — Build install-rescue-tokens.mjs installer
function uninstallHookFrom(settings) {
  const sessionStart = settings?.hooks?.SessionStart;
  if (!Array.isArray(sessionStart) || !sessionStart.some(isOurHookEntry)) return { settings, removed: false };
  const next = { ...settings, hooks: { ...settings.hooks, SessionStart: sessionStart.filter((entry) => !isOurHookEntry(entry)) } };
  if (!next.hooks.SessionStart.length) delete next.hooks.SessionStart;
  if (!Object.keys(next.hooks).length) delete next.hooks;
  return { settings: next, removed: true };
}
// [SCOPE 153 / T002] END

/** planFile(srcPath, destPath) -> { action: 'set' | 'kept' | 'skipped', detail, srcText } */
// [SCOPE 153 / T002] BEGIN — — Build install-rescue-tokens.mjs installer
function planFile(srcPath, destPath) {
  const srcText = readFileSync(srcPath, 'utf8');
  if (!existsSync(destPath)) return { action: 'set', detail: `installing (was missing)`, srcText };
  const destText = readFileSync(destPath, 'utf8');
  if (destText === srcText) return { action: 'kept', detail: 'already installed, identical', srcText };
  return { action: 'skipped', detail: `differs from the kit's copy — not overwritten (user-modified?)`, srcText };
}
// [SCOPE 153 / T002] END

// [SCOPE 153 / T002] BEGIN — — Build install-rescue-tokens.mjs installer
function readMarker(destDir) {
  const marker = read(join(destDir, MARKER_FILE));
  return marker && typeof marker === 'object' ? marker : null;
}
// [SCOPE 153 / T002] END

/**
 * installRescueTokens(root, { mode }) -> { skillDir, settingsFile, hook, files, changed }
 * mode: 'install' (default) | 'check' | 'uninstall'
 */
// [SCOPE 153 / T002] BEGIN — — Build install-rescue-tokens.mjs installer
export function installRescueTokens(root, { mode = 'install' } = {}) {
  const srcDir = kitSkillDir(root);
  const destDir = userSkillDir();
  const settingsPath = userSettingsFile();
  const existingSettings = read(settingsPath);
  if (existingSettings === undefined) {
    throw new Error(`${settingsPath} is not valid JSON. Fix the file; nothing was changed.`);
  }

  const hookPlan = planHook(existingSettings);
  const filePlans = {};
  for (const name of SKILL_FILES) {
    const srcPath = join(srcDir, name);
    if (!existsSync(srcPath)) {
      filePlans[name] = { action: 'kept', detail: `not shipped by this kit at ${srcPath}` };
      continue;
    }
    filePlans[name] = planFile(srcPath, join(destDir, name));
  }

  if (mode === 'check') {
    const hookSatisfied = hookPlan.action !== 'set';
    const filesSatisfied = SKILL_FILES.every((n) => filePlans[n].action !== 'set');
    return { skillDir: destDir, settingsFile: settingsPath, hook: hookPlan, files: filePlans, changed: false, satisfied: hookSatisfied && filesSatisfied };
  }

  if (mode === 'uninstall') {
    let changed = false;
    const marker = readMarker(destDir);
    for (const name of SKILL_FILES) {
      const destPath = join(destDir, name);
      if (!existsSync(destPath)) continue;
      const recordedHash = marker?.files?.[name];
      const currentHash = sha256(readFileSync(destPath, 'utf8'));
      if (recordedHash && recordedHash === currentHash) {
        rmSync(destPath);
        filePlans[name] = { action: 'set', detail: 'removed (unchanged since install)' };
        changed = true;
      } else {
        filePlans[name] = { action: 'kept', detail: marker ? 'left — modified since install' : 'left — no install record for it' };
      }
    }
    const markerPath = join(destDir, MARKER_FILE);
    if (existsSync(markerPath)) {
      rmSync(markerPath);
      changed = true;
    }
    if (existsSync(destDir) && readdirSync(destDir).length === 0) rmSync(destDir, { recursive: true });

    const { settings: nextSettings, removed } = uninstallHookFrom(existingSettings);
    if (removed) {
      write(settingsPath, nextSettings);
      changed = true;
      hookPlan.action = 'set';
      hookPlan.detail = 'removed';
    } else {
      hookPlan.detail = hookPlan.action === 'kept' ? `${hookPlan.detail} (not ours to remove)` : 'nothing to remove';
    }
    return { skillDir: destDir, settingsFile: settingsPath, hook: hookPlan, files: filePlans, changed };
  }

  // install
  let changed = false;
  const markerFiles = { ...(readMarker(destDir)?.files ?? {}) };
  for (const name of SKILL_FILES) {
    const plan = filePlans[name];
    if (plan.action !== 'set' || plan.srcText === undefined) continue;
    const destPath = join(destDir, name);
    mkdirSync(destDir, { recursive: true });
    writeFileSync(destPath, plan.srcText);
    markerFiles[name] = sha256(plan.srcText);
    changed = true;
  }
  if (changed) {
    write(join(destDir, MARKER_FILE), { installedBy: 'wxkanban-kit', skill: SKILL_NAME, files: markerFiles });
  }

  if (hookPlan.action === 'set') {
    write(settingsPath, installHookInto(existingSettings));
    changed = true;
  }

  return { skillDir: destDir, settingsFile: settingsPath, hook: hookPlan, files: filePlans, changed };
}
// [SCOPE 153 / T002] END

// [SCOPE 153 / T002] BEGIN — — Build install-rescue-tokens.mjs installer
function describeFile(name, plans) {
  const r = plans[name];
  const verb = r.action === 'set' ? 'installed —' : r.action === 'kept' ? 'kept —' : 'skipped —';
  return `  ${name}: ${verb} ${r.detail}`;
}
// [SCOPE 153 / T002] END

// [SCOPE 153 / T002] BEGIN — — Build install-rescue-tokens.mjs installer
function main(argv) {
  const i = argv.indexOf('--root');
  const root = resolve(i >= 0 && argv[i + 1] ? argv[i + 1] : process.cwd());
  const mode = argv.includes('--uninstall') ? 'uninstall' : argv.includes('--check') ? 'check' : 'install';
  let result;
  try {
    result = installRescueTokens(root, { mode });
  } catch (e) {
    process.stderr.write(`rescue-tokens install: ${e instanceof Error ? e.message : e}\n`);
    process.exit(2);
    return;
  }

  const lines = [
    `  hook (${result.settingsFile}): ${result.hook.action === 'set' ? (mode === 'uninstall' ? 'removed' : 'installed') : 'kept'} — ${result.hook.detail}`,
    ...Object.keys(result.files).map((n) => describeFile(n, result.files)),
  ];

  if (mode === 'check') {
    process.stdout.write(`rescue-tokens (${result.skillDir}):\n${lines.join('\n')}\n`);
    process.exit(result.satisfied ? 0 : 1);
    return;
  }

  const verb = mode === 'uninstall' ? (result.changed ? 'removed' : 'nothing to remove') : result.changed ? 'updated' : 'already installed';
  process.stdout.write(`rescue-tokens ${verb}:\n${lines.join('\n')}\n`);
  if (mode === 'install' && result.changed) {
    process.stdout.write(`To undo: node _wxAI/kit/install-rescue-tokens.mjs --uninstall\n`);
  }
  process.exit(0);
}
// [SCOPE 153 / T002] END

if (process.argv[1]?.replace(/\\/g, '/').endsWith('_wxAI/kit/install-rescue-tokens.mjs')) main(process.argv.slice(2));
