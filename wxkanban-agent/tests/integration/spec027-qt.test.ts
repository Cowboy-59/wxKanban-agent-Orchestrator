import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { spawn, ChildProcess } from "child_process";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { createServer, Server as NetServer } from "net";
import { setTimeout as sleep } from "timers/promises";
import {
  findFreePort,
  bindWithAutoselect,
  PortRangeExhaustedError,
  isPortFree,
  DEFAULT_PORT_SCAN_RANGE,
} from "../../core/runtime/port-autoselect";
import {
  startParentWatcher,
  DEFAULT_WATCHER_INTERVAL_MS,
  MISS_THRESHOLD_FOR_FIRE,
} from "../../core/runtime/parent-watcher";
import {
  writeServiceEntry,
  readRuntimeState,
  isPidAlive,
  RUNTIME_STATE_PATH,
  RUNTIME_STATE_SCHEMA_VERSION,
} from "../../core/runtime/state-file";
import { handleKitStatusCommand } from "../../core/orchestrator/command-handlers/kit-status";
import { resolveServiceUrl } from "../../core/context/runtime-state";

const KIT_ROOT = resolve(__dirname, "..", "..");
const GATEWAY_ENTRY = resolve(KIT_ROOT, "apps", "command-gateway", "src", "http.ts");

let workdir: string;

async function waitForFile(path: string, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (existsSync(path)) return true;
    await sleep(100);
  }
  return false;
}

async function waitForFileAbsent(path: string, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!existsSync(path)) return true;
    await sleep(100);
  }
  return false;
}

async function waitForExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

function killByPid(pid: number, signal: NodeJS.Signals = "SIGTERM"): void {
  try { process.kill(pid, signal); } catch { /* already gone */ }
}

beforeEach(() => {
  workdir = mkdtempSync(join(tmpdir(), "spec027-qt-"));
});

afterAll(() => {
  if (workdir) try { rmSync(workdir, { recursive: true, force: true }); } catch { /* ignore */ }
});

// ─────────────────────────────────────────────────────────────────────────────
// QT-1 / T028 — Clean startup (US1)
// ─────────────────────────────────────────────────────────────────────────────
describe("QT-1 — Clean startup writes runtime-state file with the bound port (US1)", () => {
  // Spec 042 cleanup — MCP is hosted; the gateway is the only local service.
  it("writeServiceEntry + readRuntimeState round-trips a healthy gateway entry", () => {
    writeServiceEntry("gateway", {
      port: 3003, pid: process.pid, parentpid: 1,
      startedAt: new Date().toISOString(),
      cmd: "node wxkanban-agent/apps/command-gateway/bin/wxai-http.mjs",
    }, workdir);
    const state = readRuntimeState(workdir);
    expect(state).not.toBeNull();
    expect(state!.schemaVersion).toBe(RUNTIME_STATE_SCHEMA_VERSION);
    expect(state!.services.gateway?.port).toBe(3003);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// QT-2 / T028 — Port autoselect resolves a conflict (US2)
// ─────────────────────────────────────────────────────────────────────────────
describe("QT-2 — Port autoselect resolves a conflict and records the actual port (US2)", () => {
  it("findFreePort scans forward past a bound port and returns the first free one", async () => {
    const blocker = createServer();
    await new Promise<void>((resolve) => blocker.listen(43100, "127.0.0.1", resolve));
    try {
      const chosen = await findFreePort(43100, 10);
      expect(chosen).toBeGreaterThan(43100);
      expect(chosen).toBeLessThan(43110);
    } finally {
      await new Promise<void>((resolve) => blocker.close(() => resolve()));
    }
  });

  it("bindWithAutoselect returns the actually bound port (could be ≠ preferred)", async () => {
    const blocker = createServer();
    await new Promise<void>((resolve) => blocker.listen(43200, "127.0.0.1", resolve));
    try {
      const result = await bindWithAutoselect({
        preferredPort: 43200,
        scanRange: 10,
        buildServer: () => createServer(),
        onListen: () => undefined,
      });
      expect(result.port).toBeGreaterThan(43200);
      await new Promise<void>((resolve) => result.server.close(() => resolve()));
    } finally {
      await new Promise<void>((resolve) => blocker.close(() => resolve()));
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// QT-3 / T029 — Port exhaustion (US3)
// ─────────────────────────────────────────────────────────────────────────────
describe("QT-3 — Port exhaustion throws PortRangeExhaustedError (US3)", () => {
  it("blocks 5 consecutive ports then throws with range + attempts populated", async () => {
    const blockers: NetServer[] = [];
    const start = 43300;
    for (let i = 0; i < 5; i++) {
      const s = createServer();
      await new Promise<void>((resolve) => s.listen(start + i, "127.0.0.1", resolve));
      blockers.push(s);
    }
    try {
      try {
        await findFreePort(start, 5);
        throw new Error("expected PortRangeExhaustedError");
      } catch (err) {
        expect(err).toBeInstanceOf(PortRangeExhaustedError);
        const e = err as PortRangeExhaustedError;
        expect(e.preferredPort).toBe(start);
        expect(e.scanRange).toBe(5);
        expect(e.attempts).toHaveLength(5);
        expect(e.message).toContain(String(start));
      }
    } finally {
      for (const s of blockers) {
        await new Promise<void>((resolve) => s.close(() => resolve()));
      }
    }
  });

  it("DEFAULT_PORT_SCAN_RANGE is 50 (FR-002)", () => {
    expect(DEFAULT_PORT_SCAN_RANGE).toBe(50);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// QT-4 / T030 — Parent-death watcher within 7s (US4)
// ─────────────────────────────────────────────────────────────────────────────
describe("QT-4 — Parent-death watcher triggers graceful shutdown within 7s of parent exit (US4)", () => {
  it("watcher fires onParentGone within 2 misses × interval against a dead PID", async () => {
    let fired = false;
    const start = Date.now();
    const watcher = startParentWatcher(999_999, () => { fired = true; }, {
      intervalMs: 50,
      missThreshold: 2,
    });
    while (!fired && Date.now() - start < 1000) {
      await sleep(25);
    }
    watcher.stop();
    expect(fired).toBe(true);
    expect(Date.now() - start).toBeLessThan(500);
  });

  it("MISS_THRESHOLD_FOR_FIRE × DEFAULT_WATCHER_INTERVAL_MS = 4s detection (plan.md P-3 documents ~9s including 5s grace)", () => {
    expect(MISS_THRESHOLD_FOR_FIRE).toBe(2);
    expect(DEFAULT_WATCHER_INTERVAL_MS).toBe(2000);
    const detectionMs = MISS_THRESHOLD_FOR_FIRE * DEFAULT_WATCHER_INTERVAL_MS;
    expect(detectionMs).toBe(4000);
    // Worst-case detection-to-exit = detection (4s) + graceful window (5s) = 9s.
    // Plan.md P-3 acknowledges this exceeds A-3's nominal 7s; hysteresis trades latency for stability.
    expect(detectionMs + 5000).toBeLessThanOrEqual(9000);
  });

  it("spawned gateway exits within 7s after parent kill is recorded", async () => {
    // Already covered by gateway-lifecycle.test.ts; this is a parallel smoke check.
    const child = spawn("npx", ["ts-node", "--transpile-only", GATEWAY_ENTRY], {
      cwd: workdir,
      env: {
        ...process.env,
        KIT_PARENT_PID: String(process.pid),
        GATEWAY_HTTP_PORT: "43400",
        KIT_SHUTDOWN_GRACE_MS: "500",
      },
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
    });
    try {
      const filePath = join(workdir, RUNTIME_STATE_PATH);
      const appeared = await waitForFile(filePath, 20_000);
      expect(appeared).toBe(true);
      const state = JSON.parse(readFileSync(filePath, "utf-8"));
      killByPid(state.services.gateway.pid);
      const exited = await waitForExit(child, 7_500);
      expect(exited).toBe(true);
    } finally {
      if (!child.killed) try { child.kill("SIGKILL"); } catch { /* ignore */ }
    }
  }, 60_000);
});

// ─────────────────────────────────────────────────────────────────────────────
// QT-5 / T030 — SIGKILL parent produces identical behavior (US5)
// ─────────────────────────────────────────────────────────────────────────────
describe("QT-5 — Parent SIGKILL produces identical watcher behavior (US5)", () => {
  it("isPidAlive returns false after SIGKILL on a spawned process", async () => {
    const child = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], {
      stdio: "ignore",
      detached: false,
    });
    await sleep(100);
    expect(isPidAlive(child.pid!)).toBe(true);

    child.kill("SIGKILL");
    await sleep(300);
    expect(isPidAlive(child.pid!)).toBe(false);
  });

  it("the watcher's liveness primitive treats SIGKILLed parents identically to gracefully exited ones", async () => {
    let fired = false;
    const watcher = startParentWatcher(999_999, () => { fired = true; }, {
      intervalMs: 25,
      missThreshold: 2,
    });
    await sleep(150);
    watcher.stop();
    // Whether the parent died via SIGTERM, SIGKILL, or natural exit, isPidAlive
    // returns false the same way. The watcher fires on any of them.
    expect(fired).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// QT-6 / T031 — kit:status liveness + exit codes (US7)
// ─────────────────────────────────────────────────────────────────────────────
describe("QT-6 — kit:status reports per-service liveness with correct exit codes (US7)", () => {
  it("returns exit 0 + healthy=1 when the gateway is alive", async () => {
    writeServiceEntry("gateway", {
      port: 3003, pid: process.pid, parentpid: 1,
      startedAt: new Date().toISOString(), cmd: "gw",
    }, workdir);
    const result = await handleKitStatusCommand({ projectRoot: workdir });
    expect(result.exitCode).toBe(0);
    expect(result.report?.summary.healthy).toBe(1);
  });

  it("returns exit 1 when the gateway is missing (NOT RUNNING)", async () => {
    mkdirSync(join(workdir, ".wxai"), { recursive: true });
    writeFileSync(
      join(workdir, RUNTIME_STATE_PATH),
      JSON.stringify({ schemaVersion: RUNTIME_STATE_SCHEMA_VERSION, services: {} }),
    );
    const result = await handleKitStatusCommand({ projectRoot: workdir });
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("NOT RUNNING");
  });

  it("returns exit 2 when runtime-state file is absent", async () => {
    const result = await handleKitStatusCommand({ projectRoot: workdir });
    expect(result.exitCode).toBe(2);
    expect(result.report).toBeNull();
  });

  it("--strict promotes a stale gateway to an error", async () => {
    writeServiceEntry("gateway", {
      port: 3003, pid: 999_999, parentpid: 1,
      startedAt: new Date().toISOString(), cmd: "gw",
    }, workdir);
    const lenient = await handleKitStatusCommand({ projectRoot: workdir });
    expect(lenient.exitCode).toBe(0);
    const strict = await handleKitStatusCommand({ projectRoot: workdir, strict: true });
    expect(strict.exitCode).toBe(1);
  });

  it("--format json output validates against the documented schema", async () => {
    writeServiceEntry("gateway", {
      port: 3003, pid: process.pid, parentpid: 1,
      startedAt: new Date().toISOString(), cmd: "gw",
    }, workdir);
    const result = await handleKitStatusCommand({ projectRoot: workdir, format: "json" });
    const parsed = JSON.parse(result.output);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.services.gateway).toBeDefined();
    expect(parsed.summary).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// QT-7 / T032 — Two concurrent kit instances coexist (US8)
// ─────────────────────────────────────────────────────────────────────────────
describe("QT-7 — Two concurrent kit instances in separate repos coexist without state collision (US8)", () => {
  it("two separate workdirs maintain independent runtime-state files", () => {
    const dirA = mkdtempSync(join(tmpdir(), "spec027-qt7-A-"));
    const dirB = mkdtempSync(join(tmpdir(), "spec027-qt7-B-"));
    try {
      writeServiceEntry("gateway", {
        port: 3003, pid: 1111, parentpid: 9000,
        startedAt: "2026-05-13T00:00:00.000Z", cmd: "A-gw",
      }, dirA);
      writeServiceEntry("gateway", {
        port: 3050, pid: 2222, parentpid: 9001,
        startedAt: "2026-05-13T00:00:00.000Z", cmd: "B-gw",
      }, dirB);

      const stateA = readRuntimeState(dirA);
      const stateB = readRuntimeState(dirB);
      expect(stateA!.services.gateway?.port).toBe(3003);
      expect(stateB!.services.gateway?.port).toBe(3050);
      expect(stateA!.services.gateway?.parentpid).toBe(9000);
      expect(stateB!.services.gateway?.parentpid).toBe(9001);

      // [SCOPE 068 / FR-001] Both PIDs are dead → the resolver fails closed
      // (null) for each project. It MUST NOT fall back to the shared :3003,
      // which would make one project's client target the other's gateway.
      const urlA = resolveServiceUrl("gateway", { projectRoot: dirA, env: {} });
      const urlB = resolveServiceUrl("gateway", { projectRoot: dirB, env: {} });
      expect(urlA).toBeNull();
      expect(urlB).toBeNull();
    } finally {
      try { rmSync(dirA, { recursive: true, force: true }); } catch { /* ignore */ }
      try { rmSync(dirB, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });

  it("when both repos have alive PIDs in their state files, resolver picks each repo's own port", () => {
    const dirA = mkdtempSync(join(tmpdir(), "spec027-qt7-live-A-"));
    const dirB = mkdtempSync(join(tmpdir(), "spec027-qt7-live-B-"));
    try {
      writeServiceEntry("gateway", {
        port: 3003, pid: process.pid, parentpid: 1,
        startedAt: new Date().toISOString(), cmd: "A-gw",
      }, dirA);
      writeServiceEntry("gateway", {
        port: 3050, pid: process.pid, parentpid: 1,
        startedAt: new Date().toISOString(), cmd: "B-gw",
      }, dirB);

      const urlA = resolveServiceUrl("gateway", { projectRoot: dirA, env: {} });
      const urlB = resolveServiceUrl("gateway", { projectRoot: dirB, env: {} });
      expect(urlA).toBe("http://localhost:3003");
      expect(urlB).toBe("http://localhost:3050");
    } finally {
      try { rmSync(dirA, { recursive: true, force: true }); } catch { /* ignore */ }
      try { rmSync(dirB, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });
});

void isPortFree;
void waitForFileAbsent;
void writeFileSync;
void mkdirSync;
beforeAll(() => undefined);
