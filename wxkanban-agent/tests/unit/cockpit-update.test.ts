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

describe('ensureCockpitUpToDate', () => {
  it('installs --force when the installed cockpit is older', async () => {
    writeVsix('0.1.10');
    spawnSyncMock.mockReturnValue(installed('0.1.8'));
    const { ensureCockpitUpToDate } = await load();
    ensureCockpitUpToDate();
    expect(spawnMock).toHaveBeenCalledTimes(1);
    const arg = String(spawnMock.mock.calls[0][0]) + JSON.stringify(spawnMock.mock.calls[0][1] ?? '');
    expect(arg).toContain('--install-extension');
    expect(arg).toContain('--force');
  });

  it('is a no-op when installed is equal or newer', async () => {
    writeVsix('0.1.10');
    spawnSyncMock.mockReturnValue(installed('0.1.10'));
    const { ensureCockpitUpToDate } = await load();
    ensureCockpitUpToDate();
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('does not downgrade when installed is newer', async () => {
    writeVsix('0.1.8');
    spawnSyncMock.mockReturnValue(installed('0.1.10'));
    const { ensureCockpitUpToDate } = await load();
    ensureCockpitUpToDate();
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('installs when the extension is not installed at all', async () => {
    writeVsix('0.1.10');
    spawnSyncMock.mockReturnValue(installed(null));
    const { ensureCockpitUpToDate } = await load();
    ensureCockpitUpToDate();
    expect(spawnMock).toHaveBeenCalledTimes(1);
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
    expect(spawnSyncMock).toHaveBeenCalledTimes(1); // second call short-circuits
  });
});
