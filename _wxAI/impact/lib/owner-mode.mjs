// The owner-set impactMode, fetched from wxKanban and cached (SCOPE-137 Amendment A, FR-007a).
//
// The project owner sets impactMode in the wxKanban app. The hook keeps a copy in
// .wxai/impact-mode.json and refreshes it at most once an hour, with a short timeout, so an
// edit never waits on the network for long. A failed refresh keeps the last known value and is
// not retried for an hour. readOwnerImpactMode (lib/classify.mjs) reads the cache.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { mcpCall, mcpConnection, projectIdFor } from './agreement.mjs';
import { IMPACT_MODES, OWNER_MODE_FILE } from './classify.mjs';

// [SCOPE 137 / T019] BEGIN — Refresh the cached owner-set impactMode, at most hourly (FR-007a)
export const OWNER_MODE_TTL_MS = 60 * 60 * 1000;
export const OWNER_MODE_TIMEOUT_MS = 1500;

function readCache(root) {
  try {
    return JSON.parse(readFileSync(join(root, OWNER_MODE_FILE), 'utf8'));
  } catch {
    return null;
  }
}

function writeCache(root, value) {
  try {
    const file = join(root, OWNER_MODE_FILE);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
  } catch {
    // a cache that cannot be written only means the next edit asks again
  }
}

/**
 * Refresh the cache when it is older than an hour. Returns what happened: 'fresh' (no call
 * made), 'updated', 'failed' (the last value kept) or 'unconfigured' (no project or token).
 * `deps` lets tests replace the connection and the call.
 */
export async function refreshOwnerImpactMode(root, deps = {}) {
  const now = deps.now ?? Date.now();
  const cached = readCache(root);
  const fetchedAt = Date.parse(cached?.fetchedAt ?? '');
  if (Number.isFinite(fetchedAt) && now - fetchedAt < OWNER_MODE_TTL_MS) return 'fresh';

  const projectId = projectIdFor(root);
  const conn = deps.conn !== undefined ? deps.conn : mcpConnection(root);
  if (!projectId || !conn) return 'unconfigured';
  try {
    const call = deps.mcpCall ?? mcpCall;
    const out = await call(conn, 'project.cockpit_summary', { projectId, impactModeOnly: true }, { timeoutMs: OWNER_MODE_TIMEOUT_MS });
    const owner = out?.impactMode;
    writeCache(root, IMPACT_MODES.includes(owner?.mode)
      ? { mode: owner.mode, previous: owner.previous ?? null, setBy: owner.setBy ?? null, setAt: owner.setAt ?? null, fetchedAt: new Date(now).toISOString() }
      : { mode: null, fetchedAt: new Date(now).toISOString() });
    return 'updated';
  } catch (e) {
    writeCache(root, { ...(cached ?? { mode: null }), fetchedAt: new Date(now).toISOString(), lastError: e instanceof Error ? e.message : String(e) });
    return 'failed';
  }
}
// [SCOPE 137 / T019] END
