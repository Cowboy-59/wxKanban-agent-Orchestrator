#!/usr/bin/env node
// Install the SPEC-143 FR-020 kit session defaults into a project's Claude Code settings.
//
//   node _wxAI/kit/install-session-defaults.mjs              install or update (idempotent)
//   node _wxAI/kit/install-session-defaults.mjs --check      report only; exit 1 when either key is unset
//   node _wxAI/kit/install-session-defaults.mjs --uninstall  remove the two keys this script set
//   --root <dir>                                             another project (default: the current one)
//
// Two keys, in <root>/.claude/settings.json, each only when unset anywhere it could already be
// chosen (that file, <root>/.claude/settings.local.json, or the user's own ~/.claude/settings.json):
//   env.CLAUDE_CODE_DISABLE_1M_CONTEXT = "1"   forces the 200k context window (sessions otherwise
//                                               default to 1M; a measured day found 61% of weighted
//                                               cost on turns above 200k)
//   model = "sonnet"                           the alias, so it always tracks the current release
//
// This is a different file and a different act from the one FR-005/FR-009 protect: the models:
// section of decisions/settings.yaml, the project's own tier policy, which hook-settings-guard.mjs
// denies an agent from touching at any time, including this one. That is why this script lives
// outside _wxAI/routing/ entirely.
//
// Never overwrites an existing choice. Touches only these two keys; every other key in the file is
// left exactly as it was. Prints what it did; never silent.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

export const ENV_KEY = 'CLAUDE_CODE_DISABLE_1M_CONTEXT';
export const ENV_VALUE = '1';
export const MODEL_VALUE = 'sonnet';

const settingsFile = (root) => join(root, '.claude', 'settings.json');
const settingsLocalFile = (root) => join(root, '.claude', 'settings.local.json');
const userSettingsFile = () => join(homedir(), '.claude', 'settings.json');

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

function write(file, settings) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(settings, null, 2) + '\n');
  renameSync(tmp, file);
}

/** Where (if anywhere) a key is already chosen, outside the file this script writes. */
function alreadyChosen(root, projectSettings, has) {
  if (has(projectSettings)) return { file: settingsFile(root), value: has(projectSettings) };
  const local = read(settingsLocalFile(root));
  if (local && has(local)) return { file: settingsLocalFile(root), value: has(local) };
  const user = read(userSettingsFile());
  if (user && has(user)) return { file: userSettingsFile(), value: has(user) };
  return null;
}

const hasModel = (s) => (typeof s?.model === 'string' && s.model.trim() ? s.model : undefined);
const hasEnvKey = (s) => (typeof s?.env?.[ENV_KEY] === 'string' && s.env[ENV_KEY].trim() ? s.env[ENV_KEY] : undefined);

/**
 * installSessionDefaults(root, { mode }) -> { file, changed, model: {...}, env: {...} }
 * Each of model/env is { action: 'set' | 'kept' | 'skipped', detail }.
 *   'set'     — this script wrote the key (mode install only).
 *   'kept'    — already set in the project file itself; left alone.
 *   'skipped' — already chosen elsewhere (settings.local.json or the user's own settings.json);
 *               left unset here too, so that other choice is not silently shadowed.
 */
export function installSessionDefaults(root, { mode = 'install' } = {}) {
  const file = settingsFile(root);
  const existing = read(file);
  if (existing === undefined) {
    throw new Error(`${file} is not valid JSON. Fix the file; nothing was changed.`);
  }

  const modelHere = hasModel(existing);
  const modelElsewhere = modelHere ? null : alreadyChosen(root, existing, hasModel);
  const envHere = hasEnvKey(existing);
  const envElsewhere = envHere ? null : alreadyChosen(root, existing, hasEnvKey);

  const plan = {
    model: modelHere
      ? { action: 'kept', detail: `already "${modelHere}" in ${file}` }
      : modelElsewhere
        ? { action: 'skipped', detail: `already "${modelElsewhere.value}" in ${modelElsewhere.file}` }
        : { action: 'set', detail: `"${MODEL_VALUE}" (was unset)` },
    env: envHere
      ? { action: 'kept', detail: `already "${envHere}" in ${file}` }
      : envElsewhere
        ? { action: 'skipped', detail: `already "${envElsewhere.value}" in ${envElsewhere.file}` }
        : { action: 'set', detail: `"${ENV_VALUE}" (was unset)` },
  };

  if (mode === 'check') {
    const satisfied = plan.model.action !== 'set' ? Boolean(modelHere || modelElsewhere) : false;
    const envSatisfied = plan.env.action !== 'set' ? Boolean(envHere || envElsewhere) : false;
    return { file, changed: false, ...plan, current: satisfied || plan.model.action === 'kept', envCurrent: envSatisfied || plan.env.action === 'kept' };
  }

  if (mode === 'uninstall') {
    if (!('model' in existing) && !existing.env?.[ENV_KEY]) return { file, changed: false, ...plan };
    const next = { ...existing };
    if (next.model === MODEL_VALUE) delete next.model;
    if (next.env?.[ENV_KEY] === ENV_VALUE) {
      next.env = { ...next.env };
      delete next.env[ENV_KEY];
      if (!Object.keys(next.env).length) delete next.env;
    }
    write(file, next);
    return { file, changed: true, ...plan };
  }

  // install
  const toSet = { model: plan.model.action === 'set', env: plan.env.action === 'set' };
  if (!toSet.model && !toSet.env) return { file, changed: false, ...plan };
  const next = { ...existing };
  if (toSet.model) next.model = MODEL_VALUE;
  if (toSet.env) next.env = { ...(next.env ?? {}), [ENV_KEY]: ENV_VALUE };
  write(file, next);
  return { file, changed: true, ...plan };
}

function describe(key, result) {
  const label = key === 'model' ? 'model' : `env.${ENV_KEY}`;
  const r = result[key];
  const verb = r.action === 'set' ? 'set to' : r.action === 'kept' ? 'kept —' : 'left unset —';
  return `  ${label}: ${verb} ${r.detail}`;
}

function main(argv) {
  const i = argv.indexOf('--root');
  const root = resolve(i >= 0 && argv[i + 1] ? argv[i + 1] : process.cwd());
  const mode = argv.includes('--uninstall') ? 'uninstall' : argv.includes('--check') ? 'check' : 'install';
  let result;
  try {
    result = installSessionDefaults(root, { mode });
  } catch (e) {
    process.stderr.write(`Session defaults: ${e instanceof Error ? e.message : e}\n`);
    process.exit(2);
  }
  if (mode === 'check') {
    process.stdout.write(`Session defaults (${result.file}):\n${describe('model', result)}\n${describe('env', result)}\n`);
    process.exit(result.current && result.envCurrent ? 0 : 1);
    return;
  }
  const verb = mode === 'uninstall' ? (result.changed ? 'removed' : 'nothing to remove') : result.changed ? 'updated' : 'already set';
  process.stdout.write(`Session defaults ${verb} (${result.file}):\n${describe('model', result)}\n${describe('env', result)}\n`);
  if (mode === 'install' && result.changed) {
    process.stdout.write(`To undo: remove "model" and env.${ENV_KEY} from ${result.file}.\n`);
  }
  process.exit(0);
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('_wxAI/kit/install-session-defaults.mjs')) main(process.argv.slice(2));
