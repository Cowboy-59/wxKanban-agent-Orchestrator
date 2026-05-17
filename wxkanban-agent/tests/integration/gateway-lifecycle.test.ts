import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawn, ChildProcess } from "child_process";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { createServer, Server as NetServer } from "net";
import { setTimeout as sleep } from "timers/promises";

const KIT_ROOT = resolve(__dirname, "..", "..");
const GATEWAY_ENTRY = resolve(
  KIT_ROOT,
  "apps",
  "command-gateway",
  "src",
  "http.ts",
);
const TS_NODE_BIN = resolve(
  KIT_ROOT,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "ts-node.cmd" : "ts-node",
);
const RUNTIME_PATH = ".wxai/kit-runtime.json";

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

function killByPid(pid: number): void {
  try {
    process.kill(pid, "SIGTERM");
  } catch { /* not alive */ }
}

beforeEach(() => {
  workdir = mkdtempSync(join(tmpdir(), "gateway-lifecycle-"));
});

afterEach(() => {
  if (workdir) {
    const filePath = join(workdir, RUNTIME_PATH);
    if (existsSync(filePath)) {
      try {
        const state = JSON.parse(readFileSync(filePath, "utf-8"));
        const pid = state?.services?.gateway?.pid;
        if (typeof pid === "number") killByPid(pid);
      } catch { /* ignore */ }
    }
    try { rmSync(workdir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

describe("Gateway lifecycle — T009 / FR-001..FR-006", () => {
  it("binds default port, writes runtime-state entry, removes it on SIGTERM", async () => {
    const child = spawn(
      "npx",
      ["ts-node", "--transpile-only", GATEWAY_ENTRY],
      {
        cwd: workdir,
        env: {
          ...process.env,
          KIT_PARENT_PID: String(process.pid),
          GATEWAY_HTTP_PORT: "41600",
          KIT_SHUTDOWN_GRACE_MS: "500",
        },
        stdio: ["ignore", "pipe", "pipe"],
        shell: process.platform === "win32",
      },
    );
    let stderrBuf = "";
    let stdoutBuf = "";
    child.stderr?.on("data", (chunk) => { stderrBuf += chunk.toString(); });
    child.stdout?.on("data", (chunk) => { stdoutBuf += chunk.toString(); });

    try {
      const filePath = join(workdir, RUNTIME_PATH);
      const appeared = await waitForFile(filePath, 20_000);
      if (!appeared) {
        // eslint-disable-next-line no-console
        console.error(`stdout=${stdoutBuf.slice(0, 1500)} stderr=${stderrBuf.slice(0, 1500)}`);
      }
      expect(appeared).toBe(true);

      const state = JSON.parse(readFileSync(filePath, "utf-8"));
      expect(state.schemaVersion).toBe(1);
      expect(state.services.gateway).toBeDefined();
      expect(state.services.gateway.port).toBeGreaterThanOrEqual(41600);
      expect(state.services.gateway.parentpid).toBe(process.pid);
      expect(typeof state.services.gateway.pid).toBe("number");
      expect(state.services.gateway.pid).toBeGreaterThan(0);

      killByPid(state.services.gateway.pid);
      const exited = await waitForExit(child, 10_000);
      expect(exited).toBe(true);

      // Note: Windows process.kill(pid, 'SIGTERM') bypasses the JS SIGTERM handler.
      // File-cleanup on graceful shutdown is covered by QT-4/QT-5 (parent-watcher path).
      if (process.platform !== "win32") {
        const gone = await waitForFileAbsent(filePath, 5_000);
        expect(gone).toBe(true);
      }
    } finally {
      if (!child.killed) {
        try { child.kill("SIGKILL"); } catch { /* best effort */ }
      }
    }
  }, 60_000);

  it("autoselects an alternate port when the preferred port is busy", async () => {
    const blocker = createServer();
    await new Promise<void>((resolve) =>
      blocker.listen(41700, "127.0.0.1", resolve),
    );

    const child = spawn(
      "npx",
      ["ts-node", "--transpile-only", GATEWAY_ENTRY],
      {
        cwd: workdir,
        env: {
          ...process.env,
          KIT_PARENT_PID: String(process.pid),
          GATEWAY_HTTP_PORT: "41700",
          KIT_SHUTDOWN_GRACE_MS: "500",
        },
        stdio: ["ignore", "pipe", "pipe"],
        shell: process.platform === "win32",
      },
    );

    try {
      const filePath = join(workdir, RUNTIME_PATH);
      const appeared = await waitForFile(filePath, 20_000);
      expect(appeared).toBe(true);

      const state = JSON.parse(readFileSync(filePath, "utf-8"));
      expect(state.services.gateway.port).toBeGreaterThan(41700);
      expect(state.services.gateway.port).toBeLessThan(41750);

      killByPid(state.services.gateway.pid);
      await waitForExit(child, 10_000);
    } finally {
      if (!child.killed) {
        try { child.kill("SIGKILL"); } catch { /* best effort */ }
      }
      await new Promise<void>((resolve) => blocker.close(() => resolve()));
    }
  }, 60_000);
});

void NetServer;
