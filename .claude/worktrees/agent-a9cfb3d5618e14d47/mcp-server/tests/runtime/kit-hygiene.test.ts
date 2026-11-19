import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createServer } from 'net';
import {
  readRuntimeState,
  writeServiceEntry,
  removeServiceEntry,
  isPidAlive,
  isPortFree,
  findFreePort,
  resolveParentPid,
  startParentWatcher,
  PortRangeExhaustedError,
  RUNTIME_STATE_PATH,
  RUNTIME_STATE_SCHEMA_VERSION,
  DEFAULT_PORT_SCAN_RANGE,
} from '../../src/runtime/kit-hygiene.js';

let workdir: string;

beforeAll(() => {
  workdir = mkdtempSync(join(tmpdir(), 'mcp-kit-hygiene-'));
});

afterAll(() => {
  rmSync(workdir, { recursive: true, force: true });
});

beforeEach(() => {
  const file = join(workdir, RUNTIME_STATE_PATH);
  if (existsSync(file)) rmSync(file, { force: true });
});

describe('MCP kit-hygiene — state-file', () => {
  it('reads null when file absent', () => {
    expect(readRuntimeState(workdir)).toBeNull();
  });

  it('writes and reads back an mcp entry', () => {
    writeServiceEntry(
      'mcp',
      {
        port: 3002,
        pid: 123,
        parentpid: 1,
        startedAt: '2026-05-13T00:00:00.000Z',
        cmd: 'node mcp-server/dist/index-http.js',
      },
      workdir,
    );
    const state = readRuntimeState(workdir);
    expect(state).not.toBeNull();
    expect(state!.schemaVersion).toBe(RUNTIME_STATE_SCHEMA_VERSION);
    expect(state!.services.mcp?.port).toBe(3002);
  });

  it('removeServiceEntry deletes the file when last service removed', () => {
    writeServiceEntry(
      'mcp',
      { port: 3002, pid: 1, parentpid: 1, startedAt: 'x', cmd: 'x' },
      workdir,
    );
    removeServiceEntry('mcp', workdir);
    expect(existsSync(join(workdir, RUNTIME_STATE_PATH))).toBe(false);
  });

  it('preserves gateway entry when mcp is removed', () => {
    writeServiceEntry(
      'mcp',
      { port: 3002, pid: 1, parentpid: 1, startedAt: 'x', cmd: 'x' },
      workdir,
    );
    writeServiceEntry(
      'gateway',
      { port: 3003, pid: 2, parentpid: 1, startedAt: 'x', cmd: 'x' },
      workdir,
    );
    removeServiceEntry('mcp', workdir);
    const state = readRuntimeState(workdir);
    expect(state!.services.mcp).toBeUndefined();
    expect(state!.services.gateway).toBeDefined();
  });

  it('rejects unknown schemaVersion', () => {
    const dir = join(workdir, '.wxai');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(workdir, RUNTIME_STATE_PATH),
      JSON.stringify({ schemaVersion: 999, services: {} }),
    );
    expect(readRuntimeState(workdir)).toBeNull();
  });
});

describe('MCP kit-hygiene — port autoselect', () => {
  it('isPortFree returns true on a free port', async () => {
    expect(await isPortFree(42100)).toBe(true);
  });

  it('findFreePort returns preferred when free', async () => {
    expect(await findFreePort(42200, 5)).toBe(42200);
  });

  it('findFreePort scans forward past a bound port', async () => {
    const busy = createServer();
    await new Promise<void>((resolve) => busy.listen(42300, '127.0.0.1', resolve));
    try {
      const chosen = await findFreePort(42300, 5);
      expect(chosen).toBeGreaterThan(42300);
    } finally {
      await new Promise<void>((resolve) => busy.close(() => resolve()));
    }
  });

  it('findFreePort throws when the whole range is busy', async () => {
    const blockers: import('net').Server[] = [];
    for (let i = 0; i < 3; i++) {
      const s = createServer();
      await new Promise<void>((r) => s.listen(42400 + i, '127.0.0.1', r));
      blockers.push(s);
    }
    try {
      await expect(findFreePort(42400, 3)).rejects.toBeInstanceOf(PortRangeExhaustedError);
    } finally {
      for (const s of blockers) {
        await new Promise<void>((r) => s.close(() => r()));
      }
    }
  });

  it('DEFAULT_PORT_SCAN_RANGE is 50', () => {
    expect(DEFAULT_PORT_SCAN_RANGE).toBe(50);
  });
});

describe('MCP kit-hygiene — isPidAlive', () => {
  it('returns true for current process', () => {
    expect(isPidAlive(process.pid)).toBe(true);
  });

  it('returns false for dead PID', () => {
    expect(isPidAlive(999_999)).toBe(false);
  });
});

describe('MCP kit-hygiene — parent-watcher', () => {
  it('does not fire while parent is alive', async () => {
    let fired = false;
    const w = startParentWatcher(process.pid, () => { fired = true; }, {
      intervalMs: 50,
      missThreshold: 2,
    });
    await new Promise((r) => setTimeout(r, 200));
    w.stop();
    expect(fired).toBe(false);
  });

  it('fires after 2 misses against a dead PID', async () => {
    let fired = false;
    const w = startParentWatcher(999_999, () => { fired = true; }, {
      intervalMs: 25,
      missThreshold: 2,
    });
    await new Promise((r) => setTimeout(r, 200));
    w.stop();
    expect(fired).toBe(true);
  });

  it('resolveParentPid honors KIT_PARENT_PID', () => {
    const prev = process.env.KIT_PARENT_PID;
    process.env.KIT_PARENT_PID = '54321';
    expect(resolveParentPid()).toBe(54321);
    if (prev !== undefined) process.env.KIT_PARENT_PID = prev;
    else delete process.env.KIT_PARENT_PID;
  });
});
