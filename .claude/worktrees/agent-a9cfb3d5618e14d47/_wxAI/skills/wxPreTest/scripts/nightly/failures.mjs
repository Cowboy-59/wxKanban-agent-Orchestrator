// Nightly Testing: failures (SCOPE-140 FR-008) and cleanup (FR-009).
//
// Failures: each failing item is run once more. Passing the second time makes it flaky, listed
// apart. Failing twice makes it a real failure: it gets a diagnosis (with the SPEC-137 change that
// reached it, where there is one), a proposed fix as a patch file, and exactly one wxKanban task
// across nights. The run never commits, merges, pushes, deploys, or edits a test: a proposed patch
// that touches a test file, or removes an assertion, is refused and reported instead.
//
// Cleanup: per project, remove all test data (default), keep it on failure only (the next run
// removes it), or always keep. Only what carries this run's id is touched, and the removal is
// verified.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

// [SCOPE 140 / T008] BEGIN — Re-run once; flaky versus real failures (FR-008)
/** Run an item; on failure run it once more. Returns { status: 'pass'|'flaky'|'fail', attempts }. */
export async function runWithRetry(runItem, item) {
  const first = await runItem(item, 1);
  if (first.status === 'pass') return { ...first, status: 'pass', attempts: [first] };
  if (first.status === 'skip' || first.status === 'blocked') return { ...first, attempts: [first] };
  const second = await runItem(item, 2);
  if (second.status === 'pass') return { ...second, status: 'flaky', attempts: [first, second] };
  return { ...second, status: 'fail', attempts: [first, second] };
}
// [SCOPE 140 / T008] END

// [SCOPE 140 / T008] BEGIN — A proposed patch may not touch tests or remove assertions
const TEST_PATH = /(^|\/)(tests?|__tests__|e2e|spec)\/|\.(test|spec)\.[cm]?[jt]sx?$|_test\.(go|py)$|Tests?\.cs$/i;
const ASSERTION = /\b(expect|assert|should|toBe|toEqual|toMatch|toThrow|toHaveBeenCalled|Assert\.)/;

/** Files a unified diff changes. */
export function patchFiles(diff) {
  const files = new Set();
  for (const line of String(diff).split(/\r?\n/)) {
    const m = /^\+\+\+ b\/(.+)$/.exec(line) ?? /^--- a\/(.+)$/.exec(line);
    if (m && m[1] !== '/dev/null') files.add(m[1].trim());
  }
  return [...files];
}

/**
 * Why a proposed patch is refused, or null when it may be offered. It may change application code
 * only: any test file, and any removed assertion anywhere, refuses it (wxPreTest's repair rule).
 */
export function patchRefusal(diff) {
  const tests = patchFiles(diff).filter((f) => TEST_PATH.test(f));
  if (tests.length) return `the patch edits test file(s) ${tests.join(', ')}; the nightly run never edits tests`;
  const removed = String(diff).split(/\r?\n/).filter((l) => l.startsWith('-') && !l.startsWith('---') && ASSERTION.test(l));
  if (removed.length) return `the patch removes ${removed.length} assertion line(s); a fix may never weaken an assertion`;
  if (!patchFiles(diff).length) return 'the patch changes no file';
  return null;
}
// [SCOPE 140 / T008] END

// [SCOPE 140 / T008] BEGIN — Diagnosis, patch file and one task per failure across nights (FR-008)
export const TASKS_FILE = join('.wxai', 'nightly', 'tasks.json');

/** A stable signature: the item and the first line of the error, numbers and ids removed. */
export function failureSignature(itemKey, error) {
  const first = String(error ?? '').split(/\r?\n/).find((l) => l.trim()) ?? '';
  const norm = first.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '<id>').replace(/\b(?=[0-9a-f]*\d)[0-9a-f]{4,}\b/gi, '<id>').replace(/\d+/g, '<n>').trim().slice(0, 160);
  return `${itemKey}::${norm}`;
}

export function readTaskMap(root) {
  try {
    return JSON.parse(readFileSync(join(root, TASKS_FILE), 'utf8'));
  } catch {
    return {};
  }
}

function writeTaskMap(root, map) {
  const file = join(root, TASKS_FILE);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(map, null, 2) + '\n');
}

/** The diagnosis text for a real failure: what failed, both attempts, and the change that reached it. */
export function diagnosis(item, result, { impactReason = null, changeCommits = [] } = {}) {
  return [
    `Item ${item.itemKey}: ${item.title}`,
    `Failed twice (attempt 1: ${short(result.attempts?.[0]?.error)}; attempt 2: ${short(result.attempts?.[1]?.error)}).`,
    impactReason ? `Selected because ${impactReason}.` : 'Selected by rotation; no change since the last run reached it.',
    changeCommits.length ? `Changes since the last run that reached it: ${changeCommits.join(', ')}.` : null,
    result.evidence ? `Evidence: ${short(result.evidence, 400)}` : null,
  ].filter(Boolean).join('\n');
}

const short = (s, n = 200) => String(s ?? 'no message').split('\n')[0].slice(0, n);

/**
 * Open (or find) the one task for this failure. `createTask` is project.create_task. A failure seen
 * on an earlier night returns its existing task and creates nothing.
 */
export async function taskForFailure(root, { item, result, diagnosisText, patchPath = null, patchNote = null, createTask, runId }) {
  const map = readTaskMap(root);
  const sig = failureSignature(item.itemKey, result.attempts?.[1]?.error ?? result.error);
  if (map[sig]?.taskId) {
    map[sig].lastSeen = new Date().toISOString();
    map[sig].nights = (map[sig].nights ?? 1) + 1;
    writeTaskMap(root, map);
    return { taskId: map[sig].taskId, created: false };
  }
  const description = [
    diagnosisText,
    patchPath ? `Proposed fix (not applied): ${patchPath}` : null,
    patchNote,
    `Found by the nightly run ${runId}. The run commits nothing; review the patch before applying it.`,
  ].filter(Boolean).join('\n\n');
  const out = await createTask({ title: `Nightly failure: ${item.itemKey} ${item.title}`.slice(0, 200), descriptionMarkdown: description, priority: 'high' });
  const taskId = out?.task?.id ?? out?.id ?? null;
  map[sig] = { taskId, itemKey: item.itemKey, firstSeen: new Date().toISOString(), lastSeen: new Date().toISOString(), nights: 1 };
  writeTaskMap(root, map);
  return { taskId, created: true };
}

/** Write a proposed patch under the run folder, or the reason it was refused. */
export function savePatch(runDir, item, diff) {
  const refused = diff ? patchRefusal(diff) : 'no patch was proposed';
  if (refused) return { path: null, note: `No patch offered: ${refused}.` };
  const path = join(runDir, 'patches', `${item.itemKey.replace(/[^\w.-]/g, '_')}.patch`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, diff.endsWith('\n') ? diff : diff + '\n');
  return { path, note: null };
}
// [SCOPE 140 / T008] END

// [SCOPE 140 / T009] BEGIN — The cleanup choice, run-id tagging, and verified removal (FR-009)
export const CLEANUP_CHOICES = ['remove', 'keep-on-failure', 'keep'];

/** Whether this run's data is removed now. */
export function shouldRemove(choice, { green }) {
  if (!CLEANUP_CHOICES.includes(choice ?? 'remove')) throw new Error(`nightly.cleanup must be one of ${CLEANUP_CHOICES.join(', ')}`);
  const c = choice ?? 'remove';
  return c === 'remove' || (c === 'keep-on-failure' && green);
}

const run = (cmd, args, env = {}) => spawnSync(cmd, args, { encoding: 'utf8', windowsHide: true, env: { ...process.env, ...env }, shell: false });

/**
 * Remove one run's data and verify. Two forms:
 *   docker: remove the run's labelled container, then confirm no container carries the label;
 *   commands: the adapter's cleanup command and its verify command, each given NIGHTLY_RUN_ID;
 *             the verify command prints the number of rows still tagged with the run id.
 * Returns { removed, leftovers, detail }.
 */
export function removeRunData(runId, cleanup, { exec = run } = {}) {
  if (cleanup.kind === 'docker') {
    exec('docker', ['rm', '-f', cleanup.container]);
    const left = exec('docker', ['ps', '-aq', '--filter', `label=wxkanban.nightly.run=${runId}`]);
    const ids = String(left.stdout ?? '').split(/\s+/).filter(Boolean);
    return { removed: ids.length === 0, leftovers: ids.length, detail: ids.length ? `${ids.length} container(s) still labelled with the run id` : 'the run\'s database container is gone' };
  }
  if (!cleanup.command || !cleanup.verifyCommand) return { removed: false, leftovers: null, detail: 'no cleanup command is configured for this stack (nightly.cleanupCommand and nightly.cleanupVerifyCommand)' };
  const env = { NIGHTLY_RUN_ID: runId };
  const done = exec(cleanup.command[0], cleanup.command.slice(1), env);
  if (done.status !== 0) return { removed: false, leftovers: null, detail: `the cleanup command failed (exit ${done.status})` };
  const check = exec(cleanup.verifyCommand[0], cleanup.verifyCommand.slice(1), env);
  const n = Number(String(check.stdout ?? '').trim().split(/\s+/).pop());
  if (check.status !== 0 || !Number.isFinite(n)) return { removed: false, leftovers: null, detail: 'the verify command did not report a count' };
  return { removed: n === 0, leftovers: n, detail: n === 0 ? 'no rows tagged with the run id remain' : `${n} row(s) tagged with the run id remain` };
}

/** Runs whose data was kept on failure: the next run removes them first. */
export const KEPT_FILE = join('.wxai', 'nightly', 'kept.json');

export function readKept(root) {
  try {
    return JSON.parse(readFileSync(join(root, KEPT_FILE), 'utf8'));
  } catch {
    return [];
  }
}

export function writeKept(root, kept) {
  const file = join(root, KEPT_FILE);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(kept, null, 2) + '\n');
}

/** Remove what earlier runs kept on failure. Returns the outcome per run; failures stay listed. */
export function removeKept(root, choice, opts = {}) {
  const kept = readKept(root);
  if (!kept.length) return [];
  const outcomes = [];
  const still = [];
  for (const k of kept) {
    if (choice === 'keep') {
      still.push(k);
      continue;
    }
    const r = removeRunData(k.runId, k.cleanup, opts);
    outcomes.push({ runId: k.runId, ...r });
    if (!r.removed) still.push(k);
  }
  writeKept(root, still);
  return outcomes;
}

export const keptExists = (root) => existsSync(join(root, KEPT_FILE));
// [SCOPE 140 / T009] END
