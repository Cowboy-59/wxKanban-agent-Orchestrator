// [SCOPE 019 / R15] Surface a pending kit update in the Cockpit. The kit's
// ensureKitUpToDate() (core/orchestrator/kit-update-check.ts) writes the result
// of its server version check to .wxai/kit-update-check.json at session start.
// We read that cache file only — no network call from the extension — and, when
// a newer release is available (and this is not the author/source repo), show a
// one-click "Kit update available → Install" row that runs the upgrade in a
// terminal (notify + confirm).
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { hasUncommittedChanges } from './gitStatus.js'; // [SCOPE 083 / T009]
import { storeToken } from './auth.js'; // [SCOPE 083 / T008]

export interface KitUpdateStatus {
  /** workspace root that holds the .wxai cache (null when none is open). */
  root: string | null;
  /** true when a newer kit release is available AND this isn't the author repo. */
  updateAvailable: boolean;
  currentVersion: string | null;
  latestVersion: string | null;
  releaseUrl: string | null;
  /** [SCOPE 083 / T010] What the kit's last check actually did. */
  outcome: 'checked' | 'failed' | 'author-repo';
  /** Why the last check failed; null unless outcome is 'failed'. */
  lastError: string | null;
}

interface CacheShape {
  checkedAt?: number;
  upgradeAvailable?: boolean;
  authorRepo?: boolean;
  currentVersion?: string | null;
  latestVersion?: string | null;
  releaseUrl?: string | null;
  /** [SCOPE 083 / T010] Absent in caches written before the amendment. */
  outcome?: 'checked' | 'failed' | 'author-repo';
  lastError?: string | null;
}

/** First workspace folder that looks like a wxKanban kit install. */
function findRoot(): string | null {
  for (const f of vscode.workspace.workspaceFolders ?? []) {
    if (fs.existsSync(path.join(f.uri.fsPath, '.wxkanban-project.json'))) return f.uri.fsPath;
  }
  return null;
}

// [SCOPE 083 / T017] BEGIN — judge "behind" against the LOCAL kit (FR-013)
// The cache's upgradeAvailable came from the server's projectkits.kitversion, which never
// moved after an upgrade (feedback 6d76a9fb), so an already-current kit read as "behind"
// and the unattended start re-ran the full upgrade on every activation (83738c5e). The
// local .wxkanban-project.json is what the upgrader itself writes; it is the truth.
// Exported so a feedback report records the same kit version the update check judges by
// (SPEC-148 FR-014) — [SCOPE 148 / T007]
export function readLocalKitVersion(root: string): string | null {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(root, '.wxkanban-project.json'), 'utf8')) as {
      kitVersion?: unknown;
      version?: unknown;
    };
    const v = cfg.kitVersion ?? cfg.version;
    return typeof v === 'string' && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

/** Same rule as the kit's check-kit-version.mjs, so the two never disagree. */
function compareSemver(a: string, b: string): number {
  const norm = (s: string) => s.replace(/^v/i, '').split('.').map((p) => parseInt(p, 10));
  const aP = norm(a);
  const bP = norm(b);
  if (aP.some(Number.isNaN) || bP.some(Number.isNaN)) return a.localeCompare(b);
  for (let i = 0; i < Math.max(aP.length, bP.length); i++) {
    const d = (aP[i] ?? 0) - (bP[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}
// [SCOPE 083 / T017] END

/** Read-only: report whether the cached version check found a newer release. */
export function checkKitUpdate(): KitUpdateStatus {
  const root = findRoot();
  const status: KitUpdateStatus = {
    root, updateAvailable: false, currentVersion: null, latestVersion: null, releaseUrl: null,
    outcome: 'checked', lastError: null,
  };
  if (!root) return status;
  try {
    const cache = JSON.parse(
      fs.readFileSync(path.join(root, '.wxai', 'kit-update-check.json'), 'utf8'),
    ) as CacheShape;
    // [SCOPE 083 / T017] FR-013 — the local version wins over the cached server record; the
    // cached flag is only the fallback when either version is unknown.
    const local = readLocalKitVersion(root);
    status.currentVersion = local ?? cache.currentVersion ?? null;
    status.latestVersion = cache.latestVersion ?? null;
    status.releaseUrl = cache.releaseUrl ?? null;
    const newer =
      local && status.latestVersion ? compareSemver(status.latestVersion, local) > 0 : cache.upgradeAvailable === true;
    status.updateAvailable = cache.upgradeAvailable === true && cache.authorRepo !== true && newer;
    // [SCOPE 083 / T010] A cache written before the amendment has
    // no `outcome`. Reading its absence as 'checked' preserves exactly the
    // behaviour this reader had, so an older kit paired with a newer Cockpit is
    // not suddenly reported as failing.
    status.outcome = cache.outcome ?? (cache.authorRepo === true ? 'author-repo' : 'checked');
    status.lastError = status.outcome === 'failed' ? (cache.lastError ?? 'reason not recorded') : null;
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

// [SCOPE 083 / T010] BEGIN — re-run the version check by hand, in the open
// scripts/check-kit-version.mjs is the consumer-facing checker and is the path
// that kept working while the cached check was reporting a hollow negative
// (field report b54b281e) — so a failed check hands the operator the tool that
// answers the question, with whatever error it hits visible on screen.
export function runKitVersionCheck(root: string): void {
  const term = vscode.window.createTerminal({ name: 'wxKanban Kit Version Check', cwd: root });
  term.show();
  term.sendText('node scripts/check-kit-version.mjs');
}
// [SCOPE 083 / T010] END

// [SCOPE 083 / T006] BEGIN — Cockpit-owned install state + unattended start
//
// Amendment A. Until now the Cockpit was purely passive: it read the cache the
// KIT wrote and waited for a click. That left two holes — a workspace with no
// kit at all had no path forward, and a Cockpit that auto-updated from the
// Marketplace (SCOPE-086) could run ahead of the kit with nothing to close the
// gap. The Cockpit now resolves its own state and starts the install itself.
//
// Consent model: unattended *start*, never unattended *application*. Everything
// that writes to the working tree runs in a visible terminal the user watches.

/** Where this workspace stands with respect to having a current kit. */
export type KitInstallState =
  /** Nothing to do — no workspace, up to date, or a guard says stay out. */
  | { kind: 'ok'; reason?: string }
  /** No kit here at all; bootstrap can establish one. */
  | { kind: 'no-kit' }
  /** Kit present but behind the published release. */
  | { kind: 'behind'; root: string; currentVersion: string | null; latestVersion: string | null }
  /** Behind, but a guard blocks the unattended start; user can still click. */
  | { kind: 'blocked'; root: string; reason: string }
  /** [SCOPE 083 / T010] The kit's check could not run. We do not
   *  know whether an update exists, and must not imply we do. */
  | { kind: 'check-failed'; root: string; reason: string };

const LAST_VERSION_KEY = 'wxkanban.cockpit.lastVersion';

/** True when the operator has opted out of all update behaviour. */
function optedOut(): boolean {
  const v = process.env['WXKANBAN_NO_KIT_UPDATE_CHECK'];
  return typeof v === 'string' && v !== '' && v !== '0' && v.toLowerCase() !== 'false';
}

/** Any workspace folder open at all (bootstrap target when no kit is found). */
function firstWorkspaceFolder(): string | null {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null;
}

/**
 * Resolve the workspace into exactly one state. Pure and read-only — safe to
 * call on every activation and from the tree provider.
 */
export function resolveKitInstallState(): KitInstallState {
  if (optedOut()) return { kind: 'ok', reason: 'opted out via WXKANBAN_NO_KIT_UPDATE_CHECK' };
  if (!firstWorkspaceFolder()) return { kind: 'ok', reason: 'no folder open' };

  const status = checkKitUpdate();

  // No `.wxkanban-project.json` anywhere ⇒ this workspace has no kit.
  if (!status.root) return { kind: 'no-kit' };

  // [SCOPE 083 / T010] Tested BEFORE the "current" branch below.
  // A failed check also has updateAvailable=false, so without this it reported
  // "kit is current" — asserting a fact nobody established. That is the field
  // defect (b54b281e): the operator reads a confident negative and stops asking.
  if (status.outcome === 'failed') {
    return {
      kind: 'check-failed',
      root: status.root,
      reason: status.lastError ?? 'reason not recorded',
    };
  }

  // checkKitUpdate() already folds in the author-repo exclusion, so an author
  // repo lands here as "not available" and never auto-starts anything.
  if (!status.updateAvailable) return { kind: 'ok', reason: 'kit is current' };

  if (hasUncommittedChanges(status.root)) {
    return {
      kind: 'blocked',
      root: status.root,
      reason: 'uncommitted changes in the working tree',
    };
  }

  return {
    kind: 'behind',
    root: status.root,
    currentVersion: status.currentVersion,
    latestVersion: status.latestVersion,
  };
}

/**
 * Did the Cockpit itself just update? Compares the running extension version
 * against the last one we recorded, then records the current one.
 *
 * Returns false on a genuinely first run (nothing stored yet) — a fresh install
 * is not an "update", and treating it as one would fire the upgrade path at the
 * least welcome moment.
 */
export async function consumeCockpitVersionChange(
  context: vscode.ExtensionContext,
): Promise<boolean> {
  const current = String(context.extension.packageJSON.version ?? '');
  const previous = context.globalState.get<string>(LAST_VERSION_KEY);
  if (current && current !== previous) {
    await context.globalState.update(LAST_VERSION_KEY, current);
    return previous !== undefined && previous !== '';
  }
  return false;
}

/**
 * The Amendment A entry point, called once per activation.
 *
 * States B and C converge on the same visible upgrade terminal. State A
 * (no kit) is only ever offered — bootstrapping downloads an archive and
 * unpacks it over the folder, which is too consequential to start unasked.
 */
export async function ensureKitInstalled(context: vscode.ExtensionContext): Promise<void> {
  try {
    const cockpitUpdated = await consumeCockpitVersionChange(context);
    const state = resolveKitInstallState();

    if (state.kind === 'no-kit') {
      const pick = await vscode.window.showInformationMessage(
        'wxKanban: no kit found in this folder. Install one?',
        'Install kit',
        'Not now',
      );
      if (pick === 'Install kit') await bootstrapKit(context);
      return;
    }

    if (state.kind === 'behind') {
      // Unattended start. The banner names why so it is never a surprise.
      void vscode.window.showInformationMessage(
        cockpitUpdated
          ? `wxKanban: Cockpit updated — bringing the kit to ${state.latestVersion ?? 'latest'}.`
          : `wxKanban: installing kit update ${state.currentVersion ?? '?'} → ${state.latestVersion ?? 'latest'}.`,
      );
      runKitUpgrade(state.root);
      return;
    }

    if (state.kind === 'blocked') {
      // Never silent: say what stopped it, leave the click-to-install row.
      void vscode.window.showWarningMessage(
        `wxKanban: a kit update is available but was not started automatically (${state.reason}). ` +
          'Commit or stash, then use "Kit update available — Install".',
      );
    }

    // [SCOPE 083 / T010] No toast here — an offline or
    // token-less workspace would raise one every activation, and nagging is how
    // a warning gets tuned out. The tree row carries it, which is where the
    // operator looks when they want to know.
  } catch {
    // Best-effort by design: activation must never fail because of this.
  }
}

/**
 * Bootstrap a kit into a folder that has none.
 *
 * Split deliberately: the *download* happens quietly in the extension (a read
 * into a temp file, nothing touched in the workspace), and everything that
 * WRITES to the folder — unpacking and `init.mjs` — runs in a visible terminal.
 *
 * `scripts/init.mjs` already installs dependencies, writes and gitignores
 * `.mcp.json`, starts the gateway, and installs the Cockpit, and it is
 * PID-guarded (SCOPE-095). None of that is reimplemented here.
 */
export async function bootstrapKit(context: vscode.ExtensionContext): Promise<void> {
  const root = firstWorkspaceFolder();
  if (!root) {
    void vscode.window.showWarningMessage('wxKanban: open a folder first.');
    return;
  }

  const projectId = await vscode.window.showInputBox({
    title: 'wxKanban project ID',
    prompt: 'Paste the project ID this folder should be connected to',
    ignoreFocusOut: true,
    validateInput: (v) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.trim())
        ? null
        : 'Expected a UUID.',
  });
  if (!projectId?.trim()) return;

  const token = await vscode.window.showInputBox({
    title: 'wxKanban API token',
    prompt: `Paste a project-scoped wxKanban API token for project ${projectId.trim()}`,
    password: true,
    ignoreFocusOut: true,
  });
  if (!token?.trim()) return;

  await storeToken(context.secrets, projectId.trim(), token.trim());

  const apiUrl = resolveApiUrl();
  const url = `${apiUrl}/api/projects/${projectId.trim()}/kit/download?platform=unix`;
  const archive = path.join(os.tmpdir(), `wxkanban-kit-${Date.now()}.tar.gz`);

  try {
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'wxKanban: downloading kit…' },
      async () => {
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token.trim()}` } });
        if (!res.ok) {
          throw new Error(
            res.status === 401 || res.status === 403
              ? `the server rejected the token (HTTP ${res.status}). Check it is scoped to this project.`
              : `HTTP ${res.status}`,
          );
        }
        fs.writeFileSync(archive, Buffer.from(await res.arrayBuffer()));
      },
    );
  } catch (err) {
    void vscode.window.showErrorMessage(
      `wxKanban: kit download failed — ${err instanceof Error ? err.message : String(err)}`,
    );
    return;
  }

  // Everything below writes to the user's folder, so it runs where they can see it.
  const term = vscode.window.createTerminal({ name: 'wxKanban Kit Install', cwd: root });
  term.show();
  term.sendText(`tar -xzf "${archive}" -C "${root}"`);
  term.sendText('node scripts/init.mjs');
}

/**
 * App API base URL for the kit endpoints. Mirrors the kit's own precedence
 * (`resolveApiUrl` in core/orchestrator/kit-update-check.ts) but defaults to
 * production rather than localhost — a bootstrapping user has no .env yet, and
 * localhost would be wrong for every one of them.
 *
 * Note this is the APP api, not `mcpBaseUrl` (mcp.wxperts.com) from
 * projectContext — the kit endpoints live on the application server.
 */
function resolveApiUrl(): string {
  const configured = vscode.workspace
    .getConfiguration('wxkanban.cockpit')
    .get<string>('apiUrl');
  return (
    process.env['WXKANBAN_API_URL'] ||
    (configured && configured.trim()) ||
    'https://wxkanban.wxperts.com'
  ).replace(/\/+$/, '');
}
// [SCOPE 083 / T006] END
