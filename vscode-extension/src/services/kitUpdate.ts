// [SCOPE 019 / R15] Surface a pending kit update in the Cockpit. The kit's
// ensureKitUpToDate() (core/orchestrator/kit-update-check.ts) writes the result
// of its server version check to .wxai/kit-update-check.json at session start.
// We read that cache file only — no network call from the extension — and, when
// a newer release is available (and this is not the author/source repo), show a
// one-click "Kit update available → Install" row that runs the upgrade in a
// terminal (notify + confirm).
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface KitUpdateStatus {
  /** workspace root that holds the .wxai cache (null when none is open). */
  root: string | null;
  /** true when a newer kit release is available AND this isn't the author repo. */
  updateAvailable: boolean;
  currentVersion: string | null;
  latestVersion: string | null;
  releaseUrl: string | null;
}

interface CacheShape {
  checkedAt?: number;
  upgradeAvailable?: boolean;
  authorRepo?: boolean;
  currentVersion?: string | null;
  latestVersion?: string | null;
  releaseUrl?: string | null;
}

/** First workspace folder that looks like a wxKanban kit install. */
function findRoot(): string | null {
  for (const f of vscode.workspace.workspaceFolders ?? []) {
    if (fs.existsSync(path.join(f.uri.fsPath, '.wxkanban-project.json'))) return f.uri.fsPath;
  }
  return null;
}

/** Read-only: report whether the cached version check found a newer release. */
export function checkKitUpdate(): KitUpdateStatus {
  const root = findRoot();
  const status: KitUpdateStatus = {
    root, updateAvailable: false, currentVersion: null, latestVersion: null, releaseUrl: null,
  };
  if (!root) return status;
  try {
    const cache = JSON.parse(
      fs.readFileSync(path.join(root, '.wxai', 'kit-update-check.json'), 'utf8'),
    ) as CacheShape;
    status.currentVersion = cache.currentVersion ?? null;
    status.latestVersion = cache.latestVersion ?? null;
    status.releaseUrl = cache.releaseUrl ?? null;
    status.updateAvailable = cache.upgradeAvailable === true && cache.authorRepo !== true;
  } catch {
    // No cache yet (kit hasn't run its check) or unreadable — treat as no update.
  }
  return status;
}

/** Run the consumer kit upgrade in a visible integrated terminal (the "confirm").
 * Bare `upgrade-kit.mjs` is the consumer-facing script (shipped from the
 * orchestrator): it downloads the latest release from the server, verifies it,
 * and applies it in place. The user watches it run in the terminal. */
export function runKitUpgrade(root: string): void {
  const term = vscode.window.createTerminal({ name: 'wxKanban Kit Upgrade', cwd: root });
  term.show();
  term.sendText('node scripts/upgrade-kit.mjs');
}
