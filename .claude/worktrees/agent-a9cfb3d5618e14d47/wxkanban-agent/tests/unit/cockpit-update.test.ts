// Spec 042 / T038 + SCOPE-086 — opportunistic cockpit self-heal, Marketplace-only.
//
// The kit no longer bundles or ships a `.vsix`. Install and update both come from
// the VS Code Marketplace: a gallery-managed copy auto-updates itself, so
// ensureCockpitUpToDate's only job is the FIRST install when the extension is
// absent. Verifies it:
//   (a) installs by Marketplace extension ID (spawnSync --install-extension --force)
//       when the cockpit is not installed.
//   (b) is a no-op (no install) when the cockpit is already installed.
//   (c) prints a visible manual-install message when the auto-install cannot run.
//   (d) does nothing when disabled by WXKANBAN_NO_COCKPIT_UPDATE.
//   (e) throttles to once per process.
// child_process is mocked; no .vsix fixtures are needed anymore.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const COCKPIT_ID = 'wxperts.wxkanban-dev-cockpit';
const spawnMock = vi.fn();
const spawnSyncMock = vi.fn();

vi.mock('child_process', () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
  spawnSync: (...args: unknown[]) => spawnSyncMock(...args),
}));

// A spawn() result whose .on('error') and .unref() are harmless no-ops.
function fakeChild(): { on: () => unknown; unref: () => undefined } {
  return { on: () => fakeChild(), unref: () => undefined };
}

// spawnSync result for `code --list-extensions` — plain extension IDs, one per line.
function listExtensions(present: boolean) {
  const lines = present ? ['acme.other', COCKPIT_ID] : ['acme.other', 'ms-python.python'];
  return { error: undefined, status: 0, stdout: lines.join('\n') + '\n' };
}

function installArg(call: unknown[]): string {
  return String(call[0]) + JSON.stringify(call[1] ?? '');
}
function findInstallCall(): unknown[] | undefined {
  return spawnSyncMock.mock.calls.find((c) => installArg(c).includes('--install-extension'));
}

// Drive the `code` CLI: `present` controls what --list-extensions reports;
// `installOk` controls whether the --install-extension gallery call succeeds.
function mockCode({ present, installOk = true }: { present: boolean; installOk?: boolean }) {
  spawnSyncMock.mockImplementation((...args: unknown[]) => {
    const s = installArg(args);
    if (s.includes('--list-extensions')) return listExtensions(present);
    if (s.includes('--install-extension')) {
      return installOk ? { error: undefined, status: 0 } : { error: new Error('no code'), status: null };
    }
    return { error: undefined, status: 0 };
  });
}

beforeEach(() => {
  spawnMock.mockReset();
  spawnSyncMock.mockReset();
  spawnMock.mockReturnValue(fakeChild());
  delete process.env.WXKANBAN_NO_COCKPIT_UPDATE;
  delete process.env.WXKANBAN_NO_COCKPIT_REFRESH;
  vi.resetModules(); // reset the once-per-process throttle for each test
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function load() {
  return await import('../../core/orchestrator/cockpit-refresh');
}

describe('ensureCockpitUpToDate (Marketplace-only)', () => {
  it('installs by Marketplace extension ID when the cockpit is not installed', async () => {
    mockCode({ present: false });
    const { ensureCockpitUpToDate } = await load();
    ensureCockpitUpToDate();
    expect(spawnMock).not.toHaveBeenCalled(); // no detached sideload
    const call = findInstallCall();
    expect(call).toBeTruthy();
    const s = installArg(call!);
    expect(s).toContain(COCKPIT_ID); // gallery ID…
    expect(s).toContain('--force');
    expect(s).not.toContain('.vsix'); // …never a bundled .vsix
  });

  it('is a no-op when the cockpit is already installed (gallery auto-updates it)', async () => {
    mockCode({ present: true });
    const { ensureCockpitUpToDate } = await load();
    ensureCockpitUpToDate();
    expect(findInstallCall()).toBeUndefined(); // steady state → no install spawned
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('prints a visible manual-install message when auto-install fails (FR-002)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockCode({ present: false, installOk: false });
    const { ensureCockpitUpToDate } = await load();
    ensureCockpitUpToDate();
    const printed = errSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(printed).toContain('Could not auto-install');
    expect(printed).toContain(`--install-extension ${COCKPIT_ID}`);
    expect(printed).not.toContain('.vsix'); // no offline-vsix path anymore
  });

  it('does nothing when disabled by WXKANBAN_NO_COCKPIT_UPDATE', async () => {
    process.env.WXKANBAN_NO_COCKPIT_UPDATE = '1';
    mockCode({ present: false });
    const { ensureCockpitUpToDate } = await load();
    ensureCockpitUpToDate();
    expect(spawnSyncMock).not.toHaveBeenCalled();
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('throttles to once per process', async () => {
    mockCode({ present: false });
    const { ensureCockpitUpToDate } = await load();
    ensureCockpitUpToDate();
    ensureCockpitUpToDate();
    const installCalls = spawnSyncMock.mock.calls.filter((c) => installArg(c).includes('--install-extension'));
    expect(installCalls).toHaveLength(1); // second call short-circuits
  });
});
