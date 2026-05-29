import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import {
  handleKitStatusCommand,
  renderText,
  formatUptime,
  EXPECTED_SERVICES,
} from "../../core/orchestrator/command-handlers/kit-status";
import {
  writeServiceEntry,
  RUNTIME_STATE_PATH,
  RUNTIME_STATE_SCHEMA_VERSION,
} from "../../core/runtime/state-file";

// Spec 042 cleanup — MCP is hosted, so the gateway is the only expected local
// service. kit:status no longer tracks an `mcp` service.

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

function writeRawState(services: Record<string, unknown>): void {
  const file = join(workdir, RUNTIME_STATE_PATH);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ schemaVersion: RUNTIME_STATE_SCHEMA_VERSION, services }));
}

describe("kit:status — FR-009 exit codes", () => {
  it("returns exit 2 when runtime-state file is absent", async () => {
    const result = await handleKitStatusCommand({ projectRoot: workdir });
    expect(result.exitCode).toBe(2);
    expect(result.report).toBeNull();
    expect(result.output).toContain("runtime-state file not found");
  });

  it("returns exit 1 when the gateway service is missing (file present, empty services)", async () => {
    writeRawState({});
    const result = await handleKitStatusCommand({ projectRoot: workdir });
    expect(result.exitCode).toBe(1);
    expect(result.report?.summary.missing).toBe(1);
    expect(result.output).toContain("NOT RUNNING");
  });

  it("returns exit 0 when the gateway is alive", async () => {
    writeServiceEntry(
      "gateway",
      { port: 3003, pid: process.pid, parentpid: 1, startedAt: new Date().toISOString(), cmd: "gw" },
      workdir,
    );
    const result = await handleKitStatusCommand({ projectRoot: workdir });
    expect(result.exitCode).toBe(0);
    expect(result.report?.summary.healthy).toBe(1);
  });

  it("--strict promotes a stale gateway to an error (exit 1)", async () => {
    writeServiceEntry(
      "gateway",
      { port: 3003, pid: 999_999, parentpid: 1, startedAt: new Date().toISOString(), cmd: "gw" },
      workdir,
    );
    const lenient = await handleKitStatusCommand({ projectRoot: workdir });
    expect(lenient.exitCode).toBe(0);

    const strict = await handleKitStatusCommand({ projectRoot: workdir, strict: true });
    expect(strict.exitCode).toBe(1);
    expect(strict.report?.summary.stale).toBe(1);
  });
});

describe("kit:status — JSON output", () => {
  it("produces parseable JSON matching the report schema", async () => {
    writeServiceEntry(
      "gateway",
      { port: 3003, pid: process.pid, parentpid: 1, startedAt: new Date().toISOString(), cmd: "gw" },
      workdir,
    );
    const result = await handleKitStatusCommand({ projectRoot: workdir, format: "json" });
    const parsed = JSON.parse(result.output);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.services.gateway.alive).toBe(true);
    expect(parsed.summary.healthy).toBe(1);
  });

  it("missing-file JSON shape includes the error field", async () => {
    const result = await handleKitStatusCommand({ projectRoot: workdir, format: "json" });
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
      summary: { healthy: 1, stale: 0, missing: 0 },
    });
    expect(text).toContain("gateway");
    expect(text).toContain("port=3003");
    expect(text).toContain("parent alive");
    expect(text).toContain("1 healthy");
  });

  it("renders a stale entry distinctly", () => {
    const text = renderText({
      schemaVersion: 1,
      services: {
        gateway: {
          port: 3003,
          pid: 1234,
          parentpid: 5678,
          alive: false,
          parentAlive: false,
          uptimeSec: 60,
          health: "stale",
        },
      },
      summary: { healthy: 0, stale: 1, missing: 0 },
    });
    expect(text).toContain("STALE");
    expect(text).toContain("1 stale");
  });

  it("renders a missing entry as NOT RUNNING", () => {
    const text = renderText({
      schemaVersion: 1,
      services: {
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
      summary: { healthy: 0, stale: 0, missing: 1 },
    });
    expect(text).toContain("NOT RUNNING");
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
