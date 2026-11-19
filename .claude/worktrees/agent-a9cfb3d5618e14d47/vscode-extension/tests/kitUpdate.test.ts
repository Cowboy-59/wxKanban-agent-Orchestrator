// [SCOPE 083 Amendment A / FR-006] The kit→Cockpit handoff, tested with REAL
// bytes written by the kit rather than a hand-typed approximation.
//
// Field report b54b281e: the kit wrote a failed check with the same shape as
// "you are current", and the Cockpit faithfully reported "kit is current". Both
// sides were individually correct; the CONTRACT between them carried no way to
// tell the two apart. That is what these tests pin down.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { __state } from './stubs/vscode.js';
import { checkKitUpdate, resolveKitInstallState } from '../src/services/kitUpdate.js';

let tmp: string;

/** Make the stubbed workspace point at a folder the Cockpit will treat as a kit. */
function useWorkspace(root: string, asKit = true): void {
  if (asKit) {
    fs.writeFileSync(path.join(root, '.wxkanban-project.json'), JSON.stringify({ projectId: 'p' }));
  }
  __state.folders = [{ uri: { fsPath: root } }];
}

function writeCache(root: string, cache: Record<string, unknown>): void {
  fs.mkdirSync(path.join(root, '.wxai'), { recursive: true });
  fs.writeFileSync(path.join(root, '.wxai', 'kit-update-check.json'), JSON.stringify(cache, null, 2));
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-kitupdate-'));
  delete process.env['WXKANBAN_NO_KIT_UPDATE_CHECK'];
});

afterEach(() => {
  __state.folders = [];
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('cache contract — a failed check is not "up to date"', () => {
  it('surfaces a failed check as check-failed, carrying the reason', () => {
    useWorkspace(tmp);
    writeCache(tmp, {
      checkedAt: Date.now(),
      upgradeAvailable: false,
      authorRepo: false,
      currentVersion: null,
      latestVersion: null,
      releaseUrl: null,
      outcome: 'failed',
      lastError: 'could not reach the server (ECONNREFUSED)',
    });

    const status = checkKitUpdate();
    expect(status.outcome).toBe('failed');
    expect(status.lastError).toMatch(/ECONNREFUSED/);

    const state = resolveKitInstallState();
    expect(state.kind).toBe('check-failed');
    if (state.kind === 'check-failed') {
      expect(state.reason).toMatch(/ECONNREFUSED/);
    }
  });

  it('still reports a genuine up-to-date result as ok', () => {
    useWorkspace(tmp);
    writeCache(tmp, {
      checkedAt: Date.now(),
      upgradeAvailable: false,
      authorRepo: false,
      currentVersion: '1.7.62',
      latestVersion: '1.7.62',
      releaseUrl: null,
      outcome: 'checked',
      lastError: null,
    });

    const state = resolveKitInstallState();
    expect(state.kind).toBe('ok');
  });

  it('distinguishes the two records that used to be byte-identical', () => {
    // The heart of the defect. Both of these have upgradeAvailable:false and
    // null versions; before the amendment they were the same bytes.
    const common = {
      checkedAt: Date.now(), upgradeAvailable: false, authorRepo: false,
      currentVersion: null, latestVersion: null, releaseUrl: null,
    };

    useWorkspace(tmp);
    writeCache(tmp, { ...common, outcome: 'failed', lastError: 'no API token configured' });
    expect(resolveKitInstallState().kind).toBe('check-failed');

    writeCache(tmp, { ...common, outcome: 'checked', lastError: null });
    expect(resolveKitInstallState().kind).toBe('ok');
  });
});

describe('backward compatibility', () => {
  it('reads a pre-amendment cache (no outcome field) exactly as before', () => {
    // An older kit paired with a newer Cockpit must not start reporting
    // failures it cannot actually observe.
    useWorkspace(tmp);
    writeCache(tmp, {
      checkedAt: Date.now(),
      upgradeAvailable: true,
      authorRepo: false,
      currentVersion: '1.7.61',
      latestVersion: '1.7.62',
      releaseUrl: 'https://example.invalid',
    });

    const status = checkKitUpdate();
    expect(status.outcome).toBe('checked');
    expect(status.updateAvailable).toBe(true);
    expect(resolveKitInstallState().kind).not.toBe('check-failed');
  });

  it('reads a pre-amendment author-repo cache as author-repo, not as failed', () => {
    useWorkspace(tmp);
    writeCache(tmp, {
      checkedAt: Date.now(),
      upgradeAvailable: false,
      authorRepo: true,
      currentVersion: null,
      latestVersion: null,
      releaseUrl: null,
    });

    expect(checkKitUpdate().outcome).toBe('author-repo');
    expect(resolveKitInstallState().kind).toBe('ok');
  });

  it('treats a missing cache as "nothing known", not as a failure', () => {
    // The kit may simply not have run yet. That is not an error to shout about.
    useWorkspace(tmp);
    const state = resolveKitInstallState();
    expect(state.kind).not.toBe('check-failed');
  });
});

describe('real bytes from the kit', () => {
  it('consumes a cache produced by the kit itself, end to end', async () => {
    // No hand-typed JSON: run the kit's own writer and read what it left. If the
    // two sides ever drift on a field name or a value, this fails.
    const cwdBefore = process.cwd();
    process.chdir(tmp);
    try {
      fs.writeFileSync(path.join(tmp, '.wxkanban-project.json'), JSON.stringify({ projectId: 'p' }));
      const kitModule = path.resolve(
        cwdBefore, '..', 'wxkanban-agent', 'core', 'orchestrator', 'kit-update-check.ts',
      );
      const mod = await import(/* @vite-ignore */ kitModule);
      // No token configured in this temp dir → the kit records a failed check.
      mod.ensureKitUpToDate();
      await new Promise((r) => setTimeout(r, 100));
    } finally {
      process.chdir(cwdBefore);
    }

    const written = path.join(tmp, '.wxai', 'kit-update-check.json');
    expect(fs.existsSync(written)).toBe(true);

    useWorkspace(tmp);
    const state = resolveKitInstallState();
    expect(state.kind).toBe('check-failed');
    if (state.kind === 'check-failed') {
      expect(state.reason).toMatch(/token/i);
    }
  });
});

// [SCOPE 083 Amendment B / FR-013] Field report 83738c5e: the server never updated its
// recorded version after an upgrade, the cache carried its stale upgradeAvailable, and the
// unattended start re-ran the full upgrade over an already-current kit on every activation.
describe('local version decides — FR-013', () => {
  function useKitAt(root: string, kitVersion: string): void {
    fs.writeFileSync(path.join(root, '.wxkanban-project.json'), JSON.stringify({ projectId: 'p', kitVersion }));
    __state.folders = [{ uri: { fsPath: root } }];
  }
  // Exactly what the customer's cache held after upgrading to 1.7.74.
  const staleCache = {
    checkedAt: Date.now(),
    upgradeAvailable: true,
    authorRepo: false,
    currentVersion: '1.7.61',
    latestVersion: 'v1.7.74',
    releaseUrl: null,
    outcome: 'checked',
    lastError: null,
  };

  it('does not start an upgrade over a kit that already has the latest release', () => {
    useKitAt(tmp, '1.7.74');
    writeCache(tmp, staleCache);

    const status = checkKitUpdate();
    expect(status.updateAvailable).toBe(false);
    expect(status.currentVersion).toBe('1.7.74');
    expect(resolveKitInstallState().kind).toBe('ok');
  });

  it('still reports behind when the local kit genuinely is', () => {
    useKitAt(tmp, '1.7.70');
    writeCache(tmp, staleCache);

    expect(checkKitUpdate().updateAvailable).toBe(true);
    expect(resolveKitInstallState().kind).toBe('behind');
  });
});
