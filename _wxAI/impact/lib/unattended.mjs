// Unattended runs (SCOPE-137 FR-009).
//
// A run with nobody at the keyboard cannot be asked. At an Impact Boundary it
// logs the crossing and continues; every crossing is listed at the next
// checkpoint. Possible data loss still stops — a person decides that, on the
// phone under the Remote Session Bridge.
//
// Two ways a run is unattended:
//   - the environment says so: WXAI_UNATTENDED=1 (the Remote Session Bridge also sets
//     WXAI_REMOTE=1; CI and other non-interactive runs set WXAI_UNATTENDED themselves);
//   - a marker written by `unattended.mjs start` (wxG-O-D --create). The marker binds to the
//     first session that uses it and expires, so a run that crashed cannot leave a later,
//     attended session silently skipping its questions.

import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

// [SCOPE 137 / T010] BEGIN — Is this run unattended? Environment or a session-bound marker (FR-009)
// MODIFIED-BY: [SCOPE 136 / T053] — attended marker (wxG-O-D --impact-bypass), one session owns the marker on start and stop (SPEC-136 FR-045)
export const MARKER_FILE = join('.wxai', 'impact-unattended.json');
export const CROSSINGS_FILE = join('.wxai', 'impact-crossings.jsonl');
export const CHECKPOINT_FILE = join('.wxai', 'impact-crossings.checkpoint');
export const MARKER_TTL_MS = 12 * 60 * 60 * 1000;

function writeJson(file, value) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n');
  renameSync(tmp, file);
}

function readMarker(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** A live marker bound to a session other than `sessionId`, or null. */
function heldByOther(file, sessionId, now) {
  if (!sessionId || !existsSync(file)) return null;
  const m = readMarker(file);
  if (!m || !(Date.parse(m.expiresAt) > now)) return null;
  return m.sessionId && m.sessionId !== sessionId ? m : null;
}

/**
 * Write the marker. `attended: true` is the impact bypass with the developer present (SPEC-136
 * FR-045): boundaries are logged and continue, but questions still reach the person. Refuses
 * (returns { refused }) while a live marker is bound to another session.
 */
export function startUnattended(root, { by, attended = false, sessionId = null, now = Date.now() }) {
  const file = join(root, MARKER_FILE);
  const other = heldByOther(file, sessionId, now);
  if (other) return { refused: true, holder: other };
  const marker = { by, startedAt: new Date(now).toISOString(), expiresAt: new Date(now + MARKER_TTL_MS).toISOString(), sessionId: null, ...(attended ? { attended: true } : {}) };
  writeJson(file, marker);
  return marker;
}

/** Remove the marker. With a session id, a live marker bound to another session is left in place. */
export function stopUnattended(root, { sessionId = null, now = Date.now() } = {}) {
  const file = join(root, MARKER_FILE);
  const had = existsSync(file);
  if (had && heldByOther(file, sessionId, now)) return false;
  rmSync(file, { force: true });
  return had;
}

/**
 * { unattended, remote, attended, by, note? } for one hook call. `attended` is true only for an
 * impact-bypass marker: the developer is present. A marker is honored only
 * for the session it bound to (the first that used it) and only until it expires.
 */
export function unattendedState(root, sessionId = null, { env = process.env, now = Date.now() } = {}) {
  if (env.WXAI_UNATTENDED === '1') {
    return { unattended: true, remote: env.WXAI_REMOTE === '1', by: env.WXAI_REMOTE === '1' ? 'remote-bridge' : 'environment' };
  }
  const file = join(root, MARKER_FILE);
  if (!existsSync(file)) return { unattended: false, remote: false, by: null };
  let marker;
  try {
    marker = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return { unattended: false, remote: false, by: null, note: 'unreadable unattended marker ignored' };
  }
  if (!(Date.parse(marker.expiresAt) > now)) {
    return { unattended: false, remote: false, by: null, note: `the unattended marker from ${marker.by} expired; asking as usual` };
  }
  if (marker.sessionId && sessionId && marker.sessionId !== sessionId) {
    return { unattended: false, remote: false, by: null, note: `the unattended marker belongs to another session (${marker.by}); asking as usual` };
  }
  if (!marker.sessionId && sessionId) writeJson(file, { ...marker, sessionId });
  return { unattended: true, remote: false, attended: marker.attended === true, by: marker.by };
}
// [SCOPE 137 / T010] END

// [SCOPE 137 / T010] BEGIN — Crossings log and the checkpoint list (FR-009, SC-4)
// MODIFIED-BY: [SCOPE 136 / T053] — crossingsOffset and crossingsSince: a run lists only its own crossings (SPEC-136 FR-045)
/** Append one crossing (or a data-loss stop) for the next checkpoint. */
export function logCrossingLine(root, entry) {
  const file = join(root, CROSSINGS_FILE);
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n');
}

function readLines(root) {
  const file = join(root, CROSSINGS_FILE);
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').split('\n').filter((l) => l.trim()).map((l) => {
    try {
      return JSON.parse(l);
    } catch {
      return { at: null, kind: 'unreadable', raw: l.slice(0, 200) };
    }
  });
}

/**
 * Everything logged since the last checkpoint. With `advance`, the checkpoint
 * moves past them, so each crossing is listed exactly once. Nothing is deleted.
 */
export function crossingsSinceCheckpoint(root, { advance = false } = {}) {
  const all = readLines(root);
  const file = join(root, CHECKPOINT_FILE);
  const seen = existsSync(file) ? Number(readFileSync(file, 'utf8').trim()) || 0 : 0;
  const fresh = all.slice(Math.min(seen, all.length));
  if (advance) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, String(all.length) + '\n');
  }
  return fresh;
}

/** Lines in the crossings log now: a run records this at its start and lists from it. */
export function crossingsOffset(root) {
  return readLines(root).length;
}

/** Everything logged from `offset` on, whatever the shared checkpoint pointer says. */
export function crossingsSince(root, offset) {
  const n = Math.max(0, Number(offset) || 0);
  return readLines(root).slice(n);
}

/** The plain-text list a checkpoint shows. Says "0" outright rather than showing nothing. */
export function renderCrossings(entries, { since = 'the last checkpoint' } = {}) {
  if (!entries.length) return `Change Impact since ${since}: 0 crossings, 0 stops.`;
  const stops = entries.filter((e) => e.kind === 'stop');
  const crossings = entries.filter((e) => e.kind !== 'stop');
  const lines = [`Change Impact since ${since}: ${crossings.length} crossing(s), ${stops.length} stop(s) for possible data loss.`];
  for (const e of entries) {
    const what = e.kind === 'stop' ? 'STOPPED (possible data loss)' : 'crossed, continued';
    lines.push(`- ${e.at ?? '?'} ${(e.files ?? []).join(', ')}: ${what}${e.affected !== undefined ? `, ${e.affected} affected` : ''}`);
    for (const r of e.reasons ?? []) lines.push(`    - ${r}`);
  }
  return lines.join('\n');
}
// [SCOPE 137 / T010] END
