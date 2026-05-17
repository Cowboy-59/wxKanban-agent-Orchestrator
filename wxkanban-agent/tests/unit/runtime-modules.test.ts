import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createServer } from "net";
import {
  readRuntimeState,
  writeServiceEntry,
  removeServiceEntry,
  isPidAlive,
  RUNTIME_STATE_PATH,
  RUNTIME_STATE_SCHEMA_VERSION,
} from "../../core/runtime/state-file";
import {
  isPortFree,
  findFreePort,
  bindWithAutoselect,
  PortRangeExhaustedError,
  DEFAULT_PORT_SCAN_RANGE,
} from "../../core/runtime/port-autoselect";
import {
  startParentWatcher,
  resolveParentPid,
} from "../../core/runtime/parent-watcher";

let workdir: string;

beforeAll(() => {
  workdir = mkdtempSync(join(tmpdir(), "runtime-modules-"));
});

afterAll(() => {
  rmSync(workdir, { recursive: true, force: true });
});

beforeEach(() => {
  const file = join(workdir, RUNTIME_STATE_PATH);
  if (existsSync(file)) rmSync(file, { force: true });
});

describe("state-file — FR-003 / FR-004 / FR-011", () => {
  it("returns null when the runtime-state file is absent", () => {
    expect(readRuntimeState(workdir)).toBeNull();
  });

  it("writes and reads back a service entry", () => {
    writeServiceEntry(
      "mcp",
      {
        port: 3002,
        pid: 12345,
        parentpid: 6789,
        startedAt: "2026-05-13T14:23:10.000Z",
        cmd: "node mcp-server/dist/index-http.js",
      },
      workdir,
    );
    const state = readRuntimeState(workdir);
    expect(state).not.toBeNull();
    expect(state!.schemaVersion).toBe(RUNTIME_STATE_SCHEMA_VERSION);
    expect(state!.services.mcp?.port).toBe(3002);
    expect(state!.services.mcp?.pid).toBe(12345);
  });

  it("writes are atomic — tmp file does not linger", () => {
    writeServiceEntry(
      "gateway",
      {
        port: 3003,
        pid: 99,
        parentpid: 1,
        startedAt: "2026-05-13T00:00:00.000Z",
        cmd: "gateway",
      },
      workdir,
    );
    const dir = join(workdir, ".wxai");
    const remnant = require("fs").readdirSync(dir).find((f: string) => f.includes(".tmp."));
    expect(remnant).toBeUndefined();
  });

  it("preserves other services' entries on partial write", () => {
    writeServiceEntry(
      "mcp",
      { port: 3002, pid: 11, parentpid: 1, startedAt: "x", cmd: "x" },
      workdir,
    );
    writeServiceEntry(
      "gateway",
      { port: 3003, pid: 22, parentpid: 1, startedAt: "x", cmd: "x" },
      workdir,
    );
    const state = readRuntimeState(workdir);
    expect(state!.services.mcp).toBeDefined();
    expect(state!.services.gateway).toBeDefined();
  });

  it("removeServiceEntry deletes the file when the last service is removed", () => {
    writeServiceEntry(
      "mcp",
      { port: 3002, pid: 11, parentpid: 1, startedAt: "x", cmd: "x" },
      workdir,
    );
    removeServiceEntry("mcp", workdir);
    expect(existsSync(join(workdir, RUNTIME_STATE_PATH))).toBe(false);
  });

  it("removeServiceEntry preserves the file when other services remain", () => {
    writeServiceEntry(
      "mcp",
      { port: 3002, pid: 11, parentpid: 1, startedAt: "x", cmd: "x" },
      workdir,
    );
    writeServiceEntry(
      "gateway",
      { port: 3003, pid: 22, parentpid: 1, startedAt: "x", cmd: "x" },
      workdir,
    );
    removeServiceEntry("mcp", workdir);
    const state = readRuntimeState(workdir);
    expect(state!.services.mcp).toBeUndefined();
    expect(state!.services.gateway).toBeDefined();
  });

  it("rejects malformed JSON gracefully", () => {
    const file = join(workdir, RUNTIME_STATE_PATH);
    require("fs").mkdirSync(join(workdir, ".wxai"), { recursive: true });
    writeFileSync(file, "{ not valid json");
    expect(readRuntimeState(workdir)).toBeNull();
  });

  it("rejects unknown schemaVersion", () => {
    const file = join(workdir, RUNTIME_STATE_PATH);
    require("fs").mkdirSync(join(workdir, ".wxai"), { recursive: true });
    writeFileSync(file, JSON.stringify({ schemaVersion: 999, services: {} }));
    expect(readRuntimeState(workdir)).toBeNull();
  });
});

describe("isPidAlive", () => {
  it("returns true for the current process", () => {
    expect(isPidAlive(process.pid)).toBe(true);
  });

  it("returns false for an impossible PID", () => {
    expect(isPidAlive(0)).toBe(false);
    expect(isPidAlive(-1)).toBe(false);
  });

  it("returns false for a very-likely-dead PID", () => {
    expect(isPidAlive(999_999)).toBe(false);
  });
});

describe("port-autoselect — FR-002", () => {
  it("isPortFree returns true when the port is free", async () => {
    const port = 41100;
    expect(await isPortFree(port)).toBe(true);
  });

  it("findFreePort returns the preferred port when free", async () => {
    const port = 41200;
    const chosen = await findFreePort(port, 10);
    expect(chosen).toBe(port);
  });

  it("findFreePort scans forward when the preferred port is busy", async () => {
    const busy = createServer();
    await new Promise<void>((resolve) => busy.listen(41300, "127.0.0.1", resolve));
    try {
      const chosen = await findFreePort(41300, 10);
      expect(chosen).toBeGreaterThan(41300);
      expect(chosen).toBeLessThan(41310);
    } finally {
      await new Promise<void>((resolve) => busy.close(() => resolve()));
    }
  });

  it("findFreePort throws PortRangeExhaustedError when no port is free", async () => {
    const blockers: import("net").Server[] = [];
    const start = 41400;
    for (let i = 0; i < 5; i++) {
      const s = createServer();
      await new Promise<void>((resolve) => s.listen(start + i, "127.0.0.1", resolve));
      blockers.push(s);
    }
    try {
      await expect(findFreePort(start, 5)).rejects.toBeInstanceOf(PortRangeExhaustedError);
    } finally {
      for (const s of blockers) {
        await new Promise<void>((resolve) => s.close(() => resolve()));
      }
    }
  });

  it("DEFAULT_PORT_SCAN_RANGE is 50 (FR-002)", () => {
    expect(DEFAULT_PORT_SCAN_RANGE).toBe(50);
  });

  it("bindWithAutoselect binds a server and reports the port", async () => {
    const result = await bindWithAutoselect({
      preferredPort: 41500,
      scanRange: 5,
      buildServer: () => createServer(),
      onListen: () => undefined,
    });
    expect(result.port).toBe(41500);
    await new Promise<void>((resolve) => result.server.close(() => resolve()));
  });
});

describe("parent-watcher — FR-005 / FR-006", () => {
  it("does not fire while parent is alive", async () => {
    let fired = false;
    const w = startParentWatcher(process.pid, () => { fired = true; }, {
      intervalMs: 50,
      missThreshold: 2,
    });
    await new Promise((r) => setTimeout(r, 200));
    w.stop();
    expect(fired).toBe(false);
  });

  it("fires after 2 consecutive misses against a dead PID", async () => {
    let fired = false;
    const w = startParentWatcher(999_999, () => { fired = true; }, {
      intervalMs: 25,
      missThreshold: 2,
    });
    await new Promise((r) => setTimeout(r, 200));
    w.stop();
    expect(fired).toBe(true);
  });

  it("stop() halts the watcher", async () => {
    let fired = false;
    const w = startParentWatcher(999_999, () => { fired = true; }, {
      intervalMs: 50,
      missThreshold: 5,
    });
    w.stop();
    await new Promise((r) => setTimeout(r, 200));
    expect(fired).toBe(false);
  });

  it("resolveParentPid returns process.ppid when KIT_PARENT_PID is unset", () => {
    const prev = process.env["KIT_PARENT_PID"];
    delete process.env["KIT_PARENT_PID"];
    expect(resolveParentPid()).toBe(process.ppid);
    if (prev !== undefined) process.env["KIT_PARENT_PID"] = prev;
  });

  it("resolveParentPid honors KIT_PARENT_PID when set", () => {
    const prev = process.env["KIT_PARENT_PID"];
    process.env["KIT_PARENT_PID"] = "12345";
    expect(resolveParentPid()).toBe(12345);
    if (prev !== undefined) process.env["KIT_PARENT_PID"] = prev;
    else delete process.env["KIT_PARENT_PID"];
  });
});

// Re-export to avoid unused-import lint when the test file is read by tooling.
void readFileSync;
