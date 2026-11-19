// Approvals for AI edits at an Impact Boundary (SCOPE-137 FR-008).
//
// The hook denies an edit that crosses a boundary and stores the change as
// PENDING, under the hash of the exact new content. When the developer says yes
// in chat, approve.mjs turns that pending change into an APPROVAL bound to the
// same files and hash. The retried edit carries the same hash, finds the
// approval, and consumes it. Approvals are single-use and short-lived, so a
// yes never carries over to a different change, a different file, or later.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

// [SCOPE 137 / T009] BEGIN — Pending changes and single-use approvals (FR-008)
export const PENDING_FILE = join('.wxai', 'impact-pending.json');
export const APPROVALS_FILE = join('.wxai', 'impact-approvals.json');
/** An approval not used within this time is void: the developer agreed to a change about to be retried, not to one later. */
export const APPROVAL_TTL_MS = 30 * 60 * 1000;
const PENDING_KEEP = 20;

function readList(root, rel) {
  const file = join(root, rel);
  if (!existsSync(file)) return [];
  try {
    const v = JSON.parse(readFileSync(file, 'utf8'));
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function writeList(root, rel, list) {
  const file = join(root, rel);
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(list, null, 2) + '\n');
  renameSync(tmp, file);
}

const sameFiles = (a, b) => a.length === b.length && [...a].sort().every((f, i) => f === [...b].sort()[i]);

/**
 * The part of a report an approval record needs later, without the cache stats
 * and the full link list. Kept so approve.mjs records exactly what was shown.
 */
export function compactReport(report) {
  return {
    changedFiles: report.changedFiles,
    broad: report.broad,
    summary: { affected: report.summary.affected },
    links: report.links
      .filter((l) => l.direction === 'dependent')
      .slice(0, 500)
      .map(({ type, direction, from, to, via, confidence }) => ({ type, direction, from, to, via, confidence })),
    scopes: report.scopes,
    classification: report.classification,
  };
}

/** Remember a change the hook stopped, so its approval can be recorded against exactly it. */
export function savePending(root, { hash, files, report, reason }) {
  const list = readList(root, PENDING_FILE).filter((p) => p.hash !== hash);
  list.push({ hash, files, report: compactReport(report), reason, createdAt: new Date().toISOString() });
  writeList(root, PENDING_FILE, list.slice(-PENDING_KEEP));
}

export function readPending(root, hash) {
  return readList(root, PENDING_FILE).find((p) => p.hash === hash) ?? null;
}

/** Record the developer's yes for one pending change. */
export function grantApproval(root, { hash, files, actor, quote, dataLoss = false, now = Date.now() }) {
  const live = readList(root, APPROVALS_FILE).filter((a) => now - Date.parse(a.grantedAt) < APPROVAL_TTL_MS);
  live.push({ hash, files, actor, quote, dataLoss, grantedAt: new Date(now).toISOString() });
  writeList(root, APPROVALS_FILE, live);
}

/**
 * Use the approval for exactly this change: same files, same hash, not expired.
 * It is removed as it is used, so it cannot allow a second edit. Null when none.
 */
export function consumeApproval(root, { hash, files, now = Date.now() }) {
  const list = readList(root, APPROVALS_FILE).filter((a) => now - Date.parse(a.grantedAt) < APPROVAL_TTL_MS);
  const i = list.findIndex((a) => a.hash === hash && sameFiles(a.files, files));
  if (i < 0) {
    writeList(root, APPROVALS_FILE, list);
    return null;
  }
  const [approval] = list.splice(i, 1);
  writeList(root, APPROVALS_FILE, list);
  const pending = readList(root, PENDING_FILE).filter((p) => p.hash !== hash);
  writeList(root, PENDING_FILE, pending);
  return approval;
}
// [SCOPE 137 / T009] END
