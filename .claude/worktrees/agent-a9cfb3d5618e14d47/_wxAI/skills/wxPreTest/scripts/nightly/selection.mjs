// Nightly Testing: what to test tonight (SCOPE-140 FR-003) and how long it will take (FR-004).
//
// Selection: every item the changes since the last run reached comes first, with no cap, in risk
// order; rotation fills the remaining slots, least recently tested first. An item whose code is not
// recorded (no subjects) cannot be judged for impact, so it is reached only by rotation and is
// counted as unmapped in the summary, never silently passed.
//
// Estimate: the mean of each item's last five durations; a first run uses a default per item and
// says so. On a dedicated UAT environment the run is never split. On the developer-machine
// fallback, a set estimated over the limit (10 hours, or less when the night ends sooner) is split:
// impacted items first, the rest carried to the next night with the reason.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

// [SCOPE 140 / T003] BEGIN — Per-item history, and impact-first selection with rotation (FR-003)
export const HISTORY_FILE = join('.wxai', 'nightly', 'history.json');
export const DEFAULT_ROTATION_SLOTS = 5;
const RISK = { HIGH: 0, MEDIUM: 1, LOW: 2 };

export function readHistory(root) {
  try {
    return JSON.parse(readFileSync(join(root, HISTORY_FILE), 'utf8'));
  } catch {
    return { items: {}, lastRun: null, cycle: { startedAt: null, covered: [] }, carry: [] };
  }
}

export function writeHistory(root, history) {
  const file = join(root, HISTORY_FILE);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(history, null, 2) + '\n');
}

/**
 * The night's selection.
 *   items:   [{ id, itemKey, title, riskTier, subjects: [{ sourcePath }] }]
 *   changed: files changed since the last run (null when unknown: every mapped item is impacted)
 *   reached: files those changes reach, from the SPEC-137 engine (null when too broad to list)
 *   boundary: files whose change crossed an Impact Boundary
 * Returns { impacted, rotation, carried, unmapped, reasons } with every selected item once.
 */
export function selectItems({ items, changed, reached, boundary = [], history, slots = DEFAULT_ROTATION_SLOTS }) {
  const changedSet = changed ? new Set(changed) : null;
  const reachedSet = reached ? new Set(reached) : null;
  const boundarySet = new Set(boundary);
  const reasons = {};
  const score = (item) => {
    const paths = (item.subjects ?? []).map((s) => s.sourcePath);
    if (!paths.length) return null;
    if (changedSet === null || reachedSet === null) return 3; // too broad to list: everything mapped is impacted
    if (paths.some((p) => boundarySet.has(p))) return 0;
    if (paths.some((p) => changedSet.has(p))) return 1;
    if (paths.some((p) => reachedSet.has(p))) return 2;
    return null;
  };
  const carriedKeys = new Set(history?.carry ?? []);
  const impacted = [];
  const unmapped = [];
  const rest = [];
  for (const item of items) {
    const s = score(item);
    if (!(item.subjects ?? []).length) unmapped.push(item);
    if (s !== null) {
      impacted.push({ item, s });
      reasons[item.itemKey] = ['crossed an Impact Boundary', 'its code changed', 'reached by a change', 'the change was too broad to list'][s];
    } else if (carriedKeys.has(item.itemKey)) {
      impacted.push({ item, s: -1 });
      reasons[item.itemKey] = 'carried from the last night';
    } else {
      rest.push(item);
    }
  }
  impacted.sort((a, b) => a.s - b.s || (RISK[a.item.riskTier] ?? 3) - (RISK[b.item.riskTier] ?? 3) || a.item.itemKey.localeCompare(b.item.itemKey));
  const last = (item) => history?.items?.[item.itemKey]?.lastRunAt ?? '';
  rest.sort((a, b) => last(a).localeCompare(last(b)) || a.itemKey.localeCompare(b.itemKey));
  const rotation = rest.slice(0, Math.max(0, slots));
  for (const item of rotation) reasons[item.itemKey] = last(item) ? `rotation: last tested ${last(item).slice(0, 10)}` : 'rotation: never tested';
  return { impacted: impacted.map((x) => x.item), rotation, unmapped, reasons };
}

/** Coverage over the cycle: a cycle ends once every item has run, and a new one begins. */
export function updateCoverage(history, allKeys, ranKeys, now = new Date()) {
  const cycle = history.cycle?.startedAt ? history.cycle : { startedAt: now.toISOString(), covered: [] };
  const covered = new Set([...(cycle.covered ?? []), ...ranKeys].filter((k) => allKeys.includes(k)));
  const complete = allKeys.length > 0 && covered.size >= allKeys.length;
  history.cycle = complete ? { startedAt: now.toISOString(), covered: [], lastCompletedAt: now.toISOString() } : { ...cycle, covered: [...covered] };
  return { covered: covered.size, total: allKeys.length, complete };
}
// [SCOPE 140 / T003] END

// [SCOPE 140 / T004] BEGIN — Time estimate, run length and the split on the fallback (FR-004)
export const DEFAULT_ITEM_MS = 2 * 60 * 1000;
export const RUN_OVERHEAD_MS = 10 * 60 * 1000;
export const FALLBACK_LIMIT_MS = 10 * 60 * 60 * 1000;

export function estimate(items, history) {
  let usedDefaults = 0;
  const perItem = {};
  for (const item of items) {
    const d = (history?.items?.[item.itemKey]?.durations ?? []).slice(-5);
    if (d.length) perItem[item.itemKey] = Math.round(d.reduce((a, b) => a + b, 0) / d.length);
    else {
      perItem[item.itemKey] = DEFAULT_ITEM_MS;
      usedDefaults++;
    }
  }
  const totalMs = RUN_OVERHEAD_MS + Object.values(perItem).reduce((a, b) => a + b, 0);
  return { totalMs, perItem, usedDefaults, note: usedDefaults ? `${usedDefaults} item(s) have no history yet; a default of ${DEFAULT_ITEM_MS / 60000} min each was used` : null };
}

/** Milliseconds from `now` until the next end time (HH:MM, local), at most a day away. */
export function msUntil(endTime, now = new Date()) {
  const [h, m] = String(endTime ?? '06:00').split(':').map(Number);
  const end = new Date(now);
  end.setHours(h, m || 0, 0, 0);
  if (end <= now) end.setDate(end.getDate() + 1);
  return end - now;
}

/**
 * Split the ordered selection for the night. environment 'uat' never splits. 'fallback' fits the
 * items into min(10 h, time until the end of the night) in order, impacted first, and carries the
 * rest with the reason.
 */
export function planNight(ordered, est, { environment = 'uat', endTime = '06:00', limitMs = FALLBACK_LIMIT_MS, now = new Date() } = {}) {
  if (environment === 'uat') return { run: ordered, carried: [], budgetMs: null, split: false };
  const budgetMs = Math.min(limitMs, msUntil(endTime, now));
  let used = RUN_OVERHEAD_MS;
  const run = [];
  const carried = [];
  for (const item of ordered) {
    const d = est.perItem[item.itemKey] ?? DEFAULT_ITEM_MS;
    if (used + d <= budgetMs || run.length === 0) {
      run.push(item);
      used += d;
    } else carried.push({ itemKey: item.itemKey, reason: `did not fit the night (${Math.round(budgetMs / 60000)} min budget); runs first next night` });
  }
  return { run, carried, budgetMs, split: carried.length > 0 };
}

/** Record what ran: durations (last 10 kept), last run time and result, and what carries over. */
export function recordResults(history, results, { carried = [], commit = null, now = new Date() } = {}) {
  history.items ??= {};
  for (const r of results) {
    const h = (history.items[r.itemKey] ??= { durations: [] });
    if (typeof r.durationMs === 'number') h.durations = [...(h.durations ?? []), r.durationMs].slice(-10);
    h.lastRunAt = now.toISOString();
    h.lastResult = r.status;
  }
  history.carry = carried.map((c) => c.itemKey);
  history.lastRun = { at: now.toISOString(), commit };
  return history;
}
// [SCOPE 140 / T004] END

// [SCOPE 140 / T004] BEGIN — No overlap: one run at a time, a later one waits and says so (FR-004)
export const LOCK_FILE = join('.wxai', 'nightly', 'run.lock');

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e?.code === 'EPERM';
  }
};

/** Take the lock, or report who holds it. A lock whose process is gone is stale and is taken over. */
export function tryLock(root, runId, { pid = process.pid, now = new Date(), isAlive = alive } = {}) {
  const file = join(root, LOCK_FILE);
  if (existsSync(file)) {
    let held = null;
    try {
      held = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      held = null;
    }
    if (held && held.runId !== runId && isAlive(held.pid)) return { ok: false, heldBy: held };
  }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ runId, pid, startedAt: now.toISOString() }) + '\n');
  return { ok: true };
}

/** Wait for a running run to finish (never overlap it). Returns how long it waited. */
export async function waitForLock(root, runId, { pollMs = 60_000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), ...opts } = {}) {
  const started = Date.now();
  let heldBy = null;
  for (;;) {
    const r = tryLock(root, runId, opts);
    if (r.ok) return { waitedMs: Date.now() - started, waitedFor: heldBy?.runId ?? null };
    heldBy = r.heldBy;
    await sleep(pollMs);
  }
}

export function releaseLock(root, runId) {
  const file = join(root, LOCK_FILE);
  try {
    if (JSON.parse(readFileSync(file, 'utf8')).runId === runId) writeFileSync(file, '');
  } catch {
    // nothing to release
  }
}
// [SCOPE 140 / T004] END
