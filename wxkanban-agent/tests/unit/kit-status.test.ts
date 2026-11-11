import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import {
  handleKitStatusCommand,
  renderText,
  formatUptime,
  summarizeRouting,
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

// [SCOPE 143 / T035] BEGIN — kit:status reports the missing token and the waiting count (FR-024)
describe("summarizeRouting — missing-token visibility (T035, FR-024)", () => {
  const repoRoot = join(__dirname, "..", "..", "..");
  let projectRoot: string;
  let home: string;
  let savedHome: string | undefined;
  let savedUrl: string | undefined;
  let savedToken: string | undefined;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), "kit-status-routing-"));
    const routing = join(projectRoot, "_wxAI", "routing");
    mkdirSync(routing, { recursive: true });
    for (const f of ["install.mjs", "token-store.mjs", "forward.mjs", "log.mjs"]) {
      writeFileSync(join(routing, f), readFileSync(join(repoRoot, "_wxAI", "routing", f)));
    }
    mkdirSync(join(projectRoot, "decisions"), { recursive: true });
    writeFileSync(
      join(projectRoot, "decisions", "agentrun-log.jsonl"),
      ["a", "b", "c"].map((id) => JSON.stringify({ id, projectid: "0192f0a8-1111-7000-8000-000000000001", model: "claude-haiku-5-5" })).join("\n") + "\n",
    );
    home = mkdtempSync(join(tmpdir(), "kit-status-home-"));
    savedHome = process.env.WXAI_HOME;
    savedUrl = process.env.WXAI_AGENTRUNS_URL;
    savedToken = process.env.WXAI_AGENTRUNS_TOKEN;
    process.env.WXAI_HOME = home;
    delete process.env.WXAI_AGENTRUNS_URL;
    delete process.env.WXAI_AGENTRUNS_TOKEN;
  });

  afterEach(() => {
    if (savedHome === undefined) delete process.env.WXAI_HOME;
    else process.env.WXAI_HOME = savedHome;
    if (savedUrl === undefined) delete process.env.WXAI_AGENTRUNS_URL;
    else process.env.WXAI_AGENTRUNS_URL = savedUrl;
    if (savedToken === undefined) delete process.env.WXAI_AGENTRUNS_TOKEN;
    else process.env.WXAI_AGENTRUNS_TOKEN = savedToken;
    rmSync(projectRoot, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  });

  it("reports no token stored and the count of records waiting to send, with no token value anywhere", () => {
    const routing = summarizeRouting(projectRoot);
    expect(routing.tokenStored).toBe(false);
    expect(routing.waitingCount).toBe(3);
    expect(routing.detail).toContain(", no project token on this machine (3 record(s) waiting to send)");
    expect(routing.detail).not.toMatch(/Bearer|ey[A-Za-z0-9_-]{10,}/);
  });
});
// [SCOPE 143 / T035] END

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
