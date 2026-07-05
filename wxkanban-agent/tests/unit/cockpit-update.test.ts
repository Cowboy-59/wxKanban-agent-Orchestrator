// Spec 042 / T038 — opportunistic cockpit self-heal at refresh time (FR-012).
//
// Verifies ensureCockpitUpToDate:
//   (a) compareVersions orders plain x.y.z correctly.
//   (b) findBundledVsix picks the highest-versioned .vsix in the override dir.
//   (c) installs (spawn --install-extension --force) when the installed cockpit
//       is older than the bundled .vsix.
//   (d) is a no-op (no install spawn) when installed >= bundled.
//   (e) installs when the extension is not installed at all.
//   (f) does nothing when disabled by WXKANBAN_NO_COCKPIT_UPDATE.
//   (g) throttles to once per process (second call never re-checks).
// child_process is mocked; a real temp dir holds the fake .vsix fixtures.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const COCKPIT_ID = 'wxperts.wxkanban-dev-cockpit';
const spawnMock = vi.fn();
const spawnSyncMock = vi.fn();

vi.mock('child_process', () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
  spawnSync: (...args: unknown[]) => spawnSyncMock(...args),
}));

// [SCOPE 042 / T038] BEGIN — test helpers (child_process fakes)
// A spawn() result whose .on('error') and .unref() are harmless no-ops.
function fakeChild() {
  return { on: () => fakeChild(), unref: () => undefined };
}

// spawnSync result for `code --list-extensions --show-versions`.
function installed(version: string | null) {
  const line = version === null ? 'ms-python.python@1.0.0' : `wxperts.wxkanban-dev-cockpit@${version}`;
  return { error: undefined, status: 0, stdout: `acme.other@2.1.0\n${line}\n` };
}
// [SCOPE 042 / T038] END

let vsixDir: string;

beforeEach(() => {
  spawnMock.mockReset();
  spawnSyncMock.mockReset();
  spawnMock.mockReturnValue(fakeChild());
  vsixDir = mkdtempSync(join(tmpdir(), 'wxk-vsix-'));
  process.env.WXKANBAN_COCKPIT_VSIX_DIR = vsixDir;
  delete process.env.WXKANBAN_NO_COCKPIT_UPDATE;
  delete process.env.WXKANBAN_NO_COCKPIT_REFRESH;
  delete process.env.WXKANBAN_COCKPIT_SOURCE;
  vi.resetModules(); // reset the once-per-process throttle for each test
});

afterEach(() => {
  rmSync(vsixDir, { recursive: true, force: true });
  delete process.env.WXKANBAN_COCKPIT_VSIX_DIR;
});

// [SCOPE 042 / T038] BEGIN — test helpers (vsix fixture + module loader)
function writeVsix(version: string) {
  writeFileSync(join(vsixDir, `wxkanban-dev-cockpit-${version}.vsix`), 'fake');
}

async function load() {
  return await import('../../core/orchestrator/cockpit-refresh');
}
// [SCOPE 042 / T038] END

describe('compareVersions', () => {
  it('orders plain x.y.z numerically', async () => {
    const { compareVersions } = await load();
    expect(compareVersions('0.1.10', '0.1.9')).toBeGreaterThan(0); // not lexical
    expect(compareVersions('0.1.2', '0.1.10')).toBeLessThan(0);
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.2', '1.2.0')).toBe(0);
  });
});

describe('findBundledVsix', () => {
  it('picks the highest-versioned vsix in the override dir', async () => {
    writeVsix('0.1.2');
    writeVsix('0.1.10');
    writeVsix('0.1.8');
    const { findBundledVsix } = await load();
    expect(findBundledVsix()?.version).toBe('0.1.10');
  });

  it('prefers the override dir over the repo copy', async () => {
    writeVsix('9.9.9'); // higher than the repo's bundled vsix
    const { findBundledVsix } = await load();
    expect(findBundledVsix()?.version).toBe('9.9.9');
    expect(findBundledVsix()?.vsixPath).toContain(vsixDir);
  });

  it('falls back to a later candidate dir when the override has no match', async () => {
    // Override dir is empty → resolver continues to cwd/vscode-extension,
    // which (in the dogfood repo) holds the real bundled .vsix.
    const { findBundledVsix } = await load();
    const found = findBundledVsix();
    expect(found).not.toBeNull();
    expect(found?.vsixPath).toMatch(/wxkanban-dev-cockpit-.*\.vsix$/);
  });
});

// SCOPE-086 / T001 + T004 — self-update is now gallery-first: install/update by
// Marketplace extension ID via spawnSync (the gallery copy auto-updates), with
// the bundled .vsix only as a fallback. The old detached `spawn(--install
// -extension <vsix>)` sideload path is gone.
function installArg(call: unknown[]): string {
  return String(call[0]) + JSON.stringify(call[1] ?? '');
}
function findInstallCall(): unknown[] | undefined {
  return spawnSyncMock.mock.calls.find((c) => installArg(c).includes('--install-extension'));
}

describe('ensureCockpitUpToDate', () => {
  it('installs from the Marketplace gallery (by extension ID) when the installed cockpit is older', async () => {
    writeVsix('0.1.10');
    spawnSyncMock.mockReturnValue(installed('0.1.8')); // list reports 0.1.8; gallery install then succeeds (status 0)
    const { ensureCockpitUpToDate } = await load();
    ensureCockpitUpToDate();
    expect(spawnMock).not.toHaveBeenCalled(); // no detached sideload anymore
    const call = findInstallCall();
    expect(call).toBeTruthy();
    const s = installArg(call!);
    expect(s).toContain('wxperts.wxkanban-dev-cockpit'); // gallery ID, not a .vsix path
    expect(s).toContain('--force');
    expect(s).not.toContain('.vsix'); // gallery succeeded → no fallback
  });

  it('is a no-op when installed is equal or newer', async () => {
    writeVsix('0.1.10');
    spawnSyncMock.mockReturnValue(installed('0.1.10'));
    const { ensureCockpitUpToDate } = await load();
    ensureCockpitUpToDate();
    expect(spawnMock).not.toHaveBeenCalled();
    expect(findInstallCall()).toBeUndefined(); // steady state → no install spawned
  });

  it('does not downgrade when installed is newer', async () => {
    writeVsix('0.1.8');
    spawnSyncMock.mockReturnValue(installed('0.1.10'));
    const { ensureCockpitUpToDate } = await load();
    ensureCockpitUpToDate();
    expect(spawnMock).not.toHaveBeenCalled();
    expect(findInstallCall()).toBeUndefined();
  });

  it('installs from the gallery when the extension is not installed at all', async () => {
    writeVsix('0.1.10');
    spawnSyncMock.mockReturnValue(installed(null));
    const { ensureCockpitUpToDate } = await load();
    ensureCockpitUpToDate();
    expect(spawnMock).not.toHaveBeenCalled();
    const call = findInstallCall();
    expect(call).toBeTruthy();
    expect(installArg(call!)).toContain('wxperts.wxkanban-dev-cockpit');
  });

  it('falls back to the bundled .vsix when the gallery install cannot run', async () => {
    writeVsix('0.1.10');
    spawnSyncMock.mockImplementation((...args: unknown[]) => {
      const s = String(args[0]) + JSON.stringify(args[1] ?? '');
      if (s.includes('--list-extensions')) return installed('0.1.8');
      if (s.includes('wxperts.wxkanban-dev-cockpit') && !s.includes('.vsix')) {
        return { error: new Error('gallery unreachable'), status: null }; // gallery fails
      }
      return { error: undefined, status: 0 }; // bundled .vsix install succeeds
    });
    const { ensureCockpitUpToDate } = await load();
    ensureCockpitUpToDate();
    const vsixCall = spawnSyncMock.mock.calls.find((c) => installArg(c).includes('.vsix'));
    expect(vsixCall).toBeTruthy(); // fell back to the bundled vsix
  });

  it('honors WXKANBAN_COCKPIT_SOURCE=vsix (skips the gallery, uses the bundled vsix)', async () => {
    writeVsix('0.1.10');
    process.env.WXKANBAN_COCKPIT_SOURCE = 'vsix';
    spawnSyncMock.mockImplementation((...args: unknown[]) => {
      if (installArg(args).includes('--list-extensions')) return installed('0.1.8');
      return { error: undefined, status: 0 };
    });
    const { ensureCockpitUpToDate } = await load();
    ensureCockpitUpToDate();
    const galleryCall = spawnSyncMock.mock.calls.find((c) => {
      const s = installArg(c);
      return s.includes('--install-extension') && s.includes(COCKPIT_ID) && !s.includes('.vsix');
    });
    expect(galleryCall).toBeUndefined(); // gallery skipped when pinned to vsix
    expect(spawnSyncMock.mock.calls.find((c) => installArg(c).includes('.vsix'))).toBeTruthy();
  });

  it('honors WXKANBAN_COCKPIT_SOURCE=gallery (never falls back to the vsix)', async () => {
    writeVsix('0.1.10');
    process.env.WXKANBAN_COCKPIT_SOURCE = 'gallery';
    spawnSyncMock.mockImplementation((...args: unknown[]) => {
      if (installArg(args).includes('--list-extensions')) return installed('0.1.8');
      return { error: new Error('gallery down'), status: null }; // gallery fails
    });
    const { ensureCockpitUpToDate } = await load();
    ensureCockpitUpToDate();
    expect(spawnSyncMock.mock.calls.find((c) => installArg(c).includes('.vsix'))).toBeUndefined();
  });

  it('prints a visible manual-install message when auto-install fails (FR-002 / T006)', async () => {
    writeVsix('0.1.10');
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    spawnSyncMock.mockImplementation((...args: unknown[]) => {
      if (installArg(args).includes('--list-extensions')) return installed('0.1.8');
      return { error: new Error('no code'), status: null }; // gallery + vsix both fail
    });
    const { ensureCockpitUpToDate } = await load();
    ensureCockpitUpToDate();
    const printed = errSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(printed).toContain('Could not auto-install');
    expect(printed).toContain(`--install-extension ${COCKPIT_ID}`);
    errSpy.mockRestore();
  });

  it('does nothing when disabled by WXKANBAN_NO_COCKPIT_UPDATE', async () => {
    writeVsix('0.1.10');
    spawnSyncMock.mockReturnValue(installed('0.1.0'));
    process.env.WXKANBAN_NO_COCKPIT_UPDATE = '1';
    const { ensureCockpitUpToDate } = await load();
    ensureCockpitUpToDate();
    expect(spawnSyncMock).not.toHaveBeenCalled();
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('throttles to once per process', async () => {
    writeVsix('0.1.10');
    spawnSyncMock.mockReturnValue(installed('0.1.0'));
    const { ensureCockpitUpToDate } = await load();
    ensureCockpitUpToDate();
    ensureCockpitUpToDate();
    const installCalls = spawnSyncMock.mock.calls.filter((c) => installArg(c).includes('--install-extension'));
    expect(installCalls).toHaveLength(1); // second call short-circuits
  });
});
