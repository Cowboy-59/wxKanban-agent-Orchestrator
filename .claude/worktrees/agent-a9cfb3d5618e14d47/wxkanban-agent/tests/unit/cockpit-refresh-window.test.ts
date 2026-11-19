// Spec 042 / T021 — the refresh ping must be INVISIBLE.
//
// Field report (feedback e8849e53): on Windows an empty console window opened on
// top of the editor, once per dbpush/implement. Every spawn site here runs a
// console program through cmd.exe (`code.cmd` needs the shell), and a console
// child of a console-LESS parent — VS Code's extension host, a service — is given
// a fresh, visible console window unless windowsHide sets CREATE_NO_WINDOW.
//
// These tests pin windowsHide on all four sites, and pin `detached` ON for the
// ping: a bench run of the option matrix (Windows 10, console-owning parent)
// showed detached alone was clean and trading it for windowsHide was worse, so
// the two are kept together rather than swapped.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const spawnMock = vi.fn();
const spawnSyncMock = vi.fn();

vi.mock('child_process', () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
  spawnSync: (...args: unknown[]) => spawnSyncMock(...args),
}));

function fakeChild(): { on: () => unknown; unref: () => undefined } {
  return { on: () => fakeChild(), unref: () => undefined };
}

const realPlatform = process.platform;
function setPlatform(platform: string): void {
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });
}

// The options object is the LAST argument of spawn() in both branches.
function spawnOptions(): Record<string, unknown> {
  const call = spawnMock.mock.calls[0];
  return call[call.length - 1] as Record<string, unknown>;
}

beforeEach(() => {
  spawnMock.mockReset();
  spawnSyncMock.mockReset();
  spawnMock.mockReturnValue(fakeChild());
  spawnSyncMock.mockReturnValue({ error: undefined, status: 0, stdout: '' }); // `code --version` probe
  delete process.env.WXKANBAN_NO_COCKPIT_REFRESH;
  delete process.env.WXKANBAN_CODE_BIN;
  vi.resetModules();
});

afterEach(() => {
  setPlatform(realPlatform);
  vi.restoreAllMocks();
});

async function load() {
  return await import('../../core/orchestrator/cockpit-refresh');
}

describe('emitCockpitRefresh spawn options', () => {
  it('hides the console on Windows without giving up detached', async () => {
    setPlatform('win32');
    const { emitCockpitRefresh } = await load();
    emitCockpitRefresh();

    expect(spawnMock).toHaveBeenCalledTimes(1);
    const opts = spawnOptions();
    expect(opts.shell).toBe(true); // code.cmd needs the shell…
    expect(opts.windowsHide).toBe(true); // …so the console it would get must be hidden
    expect(opts.detached).toBe(true); // measured clean — keep it, do not trade it for windowsHide
    expect(opts.stdio).toBe('ignore');
  });

  it('passes the URI as one command string on Windows (no DEP0190 args array)', async () => {
    setPlatform('win32');
    const { emitCockpitRefresh } = await load();
    emitCockpitRefresh();

    const [first, second] = spawnMock.mock.calls[0];
    expect(typeof first).toBe('string');
    expect(String(first)).toContain('vscode://wxperts.wxkanban-dev-cockpit/refresh');
    expect(Array.isArray(second)).toBe(false); // options object, not an args array
  });

  it('keeps detached on POSIX, where there is no console to pop', async () => {
    setPlatform('linux');
    const { emitCockpitRefresh } = await load();
    emitCockpitRefresh();

    const opts = spawnOptions();
    expect(opts.shell).toBe(false);
    expect(opts.detached).toBe(true);
    expect(opts.windowsHide).toBe(true); // inert off-Windows, but harmless and consistent
  });

  it('spawns nothing at all when WXKANBAN_NO_COCKPIT_REFRESH is set', async () => {
    setPlatform('win32');
    process.env.WXKANBAN_NO_COCKPIT_REFRESH = '1';
    const { emitCockpitRefresh } = await load();
    emitCockpitRefresh();
    expect(spawnMock).not.toHaveBeenCalled();
  });
});

describe('cockpit probe/install spawnSync options', () => {
  it('hides the window on every Windows spawnSync site', async () => {
    setPlatform('win32');
    // Report the cockpit as absent so the install path runs too.
    spawnSyncMock.mockImplementation((...args: unknown[]) => {
      const line = String(args[0]) + JSON.stringify(args[1] ?? '');
      if (line.includes('--list-extensions')) return { error: undefined, status: 0, stdout: 'acme.other\n' };
      return { error: undefined, status: 0, stdout: '' };
    });
    const { ensureCockpitUpToDate } = await load();
    ensureCockpitUpToDate();

    expect(spawnSyncMock.mock.calls.length).toBeGreaterThan(0);
    for (const call of spawnSyncMock.mock.calls) {
      const opts = call[call.length - 1] as Record<string, unknown>;
      expect(opts.windowsHide).toBe(true);
    }
  });
});
