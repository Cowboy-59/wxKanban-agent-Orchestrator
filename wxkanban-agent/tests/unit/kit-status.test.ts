import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  handleKitStatusCommand,
  renderText,
  formatUptime,
  EXPECTED_SERVICES,
} from "../../core/orchestrator/command-handlers/kit-status";
import {
  writeServiceEntry,
  RUNTIME_STATE_PATH,
} from "../../core/runtime/state-file";

let workdir: string;

beforeAll(() => {
  workdir = mkdtempSync(join(tmpdir(), "kit-status-"));
});

afterAll(() => {
  rmSync(workdir, { recursive: true, force: true });
});

beforeEach(() => {
  const file = join(workdir, RUNTIME_STATE_PATH);
  if (existsSync(file)) rmSync(file, { force: true });
});

describe("kit:status — FR-009 exit codes", () => {
  it("returns exit 2 when runtime-state file is absent", async () => {
    const result = await handleKitStatusCommand({ projectRoot: workdir });
    expect(result.exitCode).toBe(2);
    expect(result.report).toBeNull();
    expect(result.output).toContain("runtime-state file not found");
  });

  it("returns exit 1 when at least one expected service is missing", async () => {
    writeServiceEntry(
      "mcp",
      {
        port: 3002,
        pid: process.pid,
        parentpid: 1,
        startedAt: new Date().toISOString(),
        cmd: "mcp",
      },
      workdir,
    );
    const result = await handleKitStatusCommand({ projectRoot: workdir });
    expect(result.exitCode).toBe(1);
    expect(result.report?.summary.missing).toBe(1);
    expect(result.report?.summary.healthy).toBe(1);
    expect(result.output).toContain("NOT RUNNING");
  });

  it("returns exit 0 when both expected services are alive", async () => {
    writeServiceEntry(
      "mcp",
      {
        port: 3002,
        pid: process.pid,
        parentpid: 1,
        startedAt: new Date().toISOString(),
        cmd: "mcp",
      },
      workdir,
    );
    writeServiceEntry(
      "gateway",
      {
        port: 3003,
        pid: process.pid,
        parentpid: 1,
        startedAt: new Date().toISOString(),
        cmd: "gw",
      },
      workdir,
    );
    const result = await handleKitStatusCommand({ projectRoot: workdir });
    expect(result.exitCode).toBe(0);
    expect(result.report?.summary.healthy).toBe(2);
  });

  it("--strict promotes stale entries to errors (exit 1)", async () => {
    writeServiceEntry(
      "mcp",
      {
        port: 3002,
        pid: 999_999,
        parentpid: 1,
        startedAt: new Date().toISOString(),
        cmd: "mcp",
      },
      workdir,
    );
    writeServiceEntry(
      "gateway",
      {
        port: 3003,
        pid: process.pid,
        parentpid: 1,
        startedAt: new Date().toISOString(),
        cmd: "gw",
      },
      workdir,
    );
    const lenient = await handleKitStatusCommand({ projectRoot: workdir });
    expect(lenient.exitCode).toBe(0);

    const strict = await handleKitStatusCommand({
      projectRoot: workdir,
      strict: true,
    });
    expect(strict.exitCode).toBe(1);
    expect(strict.report?.summary.stale).toBe(1);
  });
});

describe("kit:status — JSON output", () => {
  it("produces parseable JSON matching the report schema", async () => {
    writeServiceEntry(
      "mcp",
      {
        port: 3002,
        pid: process.pid,
        parentpid: 1,
        startedAt: new Date().toISOString(),
        cmd: "mcp",
      },
      workdir,
    );
    writeServiceEntry(
      "gateway",
      {
        port: 3003,
        pid: process.pid,
        parentpid: 1,
        startedAt: new Date().toISOString(),
        cmd: "gw",
      },
      workdir,
    );
    const result = await handleKitStatusCommand({
      projectRoot: workdir,
      format: "json",
    });
    const parsed = JSON.parse(result.output);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.services.mcp.alive).toBe(true);
    expect(parsed.services.gateway.alive).toBe(true);
    expect(parsed.summary.healthy).toBe(2);
  });

  it("missing-file JSON shape includes the error field", async () => {
    const result = await handleKitStatusCommand({
      projectRoot: workdir,
      format: "json",
    });
    const parsed = JSON.parse(result.output);
    expect(parsed.error).toMatch(/missing|unreadable/);
    expect(parsed.summary.missing).toBe(EXPECTED_SERVICES.length);
  });
});

describe("renderText", () => {
  it("prints alive line with parent status + uptime", () => {
    const text = renderText({
      schemaVersion: 1,
      services: {
        mcp: {
          port: 3002,
          pid: 1234,
          parentpid: 5678,
          alive: true,
          parentAlive: true,
          uptimeSec: 125,
          health: "alive",
        },
        gateway: {
          port: 3003,
          pid: 1235,
          parentpid: 5678,
          alive: true,
          parentAlive: true,
          uptimeSec: 125,
          health: "alive",
        },
      },
      summary: { healthy: 2, stale: 0, missing: 0 },
    });
    expect(text).toContain("mcp");
    expect(text).toContain("port=3002");
    expect(text).toContain("parent alive");
    expect(text).toContain("2 healthy");
  });

  it("renders stale entry distinctly", () => {
    const text = renderText({
      schemaVersion: 1,
      services: {
        mcp: {
          port: 3002,
          pid: 1234,
          parentpid: 5678,
          alive: false,
          parentAlive: false,
          uptimeSec: 60,
          health: "stale",
        },
        gateway: {
          port: null,
          pid: null,
          parentpid: null,
          alive: false,
          parentAlive: false,
          uptimeSec: null,
          health: "missing",
        },
      },
      summary: { healthy: 0, stale: 1, missing: 1 },
    });
    expect(text).toContain("STALE");
    expect(text).toContain("NOT RUNNING");
    expect(text).toContain("1 stale");
    expect(text).toContain("1 missing");
  });
});

describe("formatUptime", () => {
  it("renders seconds-only for short durations", () => {
    expect(formatUptime(5)).toBe("5s");
    expect(formatUptime(59)).toBe("59s");
  });

  it("renders minutes for medium durations", () => {
    expect(formatUptime(60)).toBe("1m0s");
    expect(formatUptime(125)).toBe("2m5s");
  });

  it("renders hours for long durations", () => {
    expect(formatUptime(3600)).toBe("1h0m0s");
    expect(formatUptime(3725)).toBe("1h2m5s");
  });
});
