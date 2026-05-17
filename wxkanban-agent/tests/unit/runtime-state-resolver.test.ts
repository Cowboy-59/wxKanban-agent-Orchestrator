import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  resolveServiceUrl,
  resolveServicePort,
  DEFAULT_PORTS,
} from "../../core/context/runtime-state";
import {
  writeServiceEntry,
  RUNTIME_STATE_PATH,
  RUNTIME_STATE_SCHEMA_VERSION,
} from "../../core/runtime/state-file";

let workdir: string;

beforeAll(() => {
  workdir = mkdtempSync(join(tmpdir(), "resolver-"));
});

afterAll(() => {
  rmSync(workdir, { recursive: true, force: true });
});

beforeEach(() => {
  const file = join(workdir, RUNTIME_STATE_PATH);
  if (existsSync(file)) rmSync(file, { force: true });
});

describe("resolveServiceUrl — FR-008 precedence", () => {
  it("falls back to default localhost:3002 for MCP when nothing else is set", () => {
    expect(
      resolveServiceUrl("mcp", { projectRoot: workdir, env: {} }),
    ).toBe("http://localhost:3002");
  });

  it("falls back to default localhost:3003 for gateway", () => {
    expect(
      resolveServiceUrl("gateway", { projectRoot: workdir, env: {} }),
    ).toBe("http://localhost:3003");
  });

  it("honors MCP_BASE_URL env var when no runtime-state entry", () => {
    expect(
      resolveServiceUrl("mcp", {
        projectRoot: workdir,
        env: { MCP_BASE_URL: "http://custom:9999" },
      }),
    ).toBe("http://custom:9999");
  });

  it("honors MCP_HTTP_URL as alias", () => {
    expect(
      resolveServiceUrl("mcp", {
        projectRoot: workdir,
        env: { MCP_HTTP_URL: "http://alias:8888" },
      }),
    ).toBe("http://alias:8888");
  });

  it("honors MCP_HTTP_PORT to build a localhost URL", () => {
    expect(
      resolveServiceUrl("mcp", {
        projectRoot: workdir,
        env: { MCP_HTTP_PORT: "4001" },
      }),
    ).toBe("http://localhost:4001");
  });

  it("honors GATEWAY_HTTP_PORT for gateway", () => {
    expect(
      resolveServiceUrl("gateway", {
        projectRoot: workdir,
        env: { GATEWAY_HTTP_PORT: "5005" },
      }),
    ).toBe("http://localhost:5005");
  });

  it("runtime-state file takes precedence over env vars (alive PID)", () => {
    writeServiceEntry(
      "mcp",
      {
        port: 3050,
        pid: process.pid,
        parentpid: 1,
        startedAt: "2026-05-13T00:00:00.000Z",
        cmd: "mcp",
      },
      workdir,
    );
    const url = resolveServiceUrl("mcp", {
      projectRoot: workdir,
      env: { MCP_BASE_URL: "http://should-be-ignored:9999" },
    });
    expect(url).toBe("http://localhost:3050");
  });

  it("runtime-state file with stale PID falls through to env var", () => {
    writeServiceEntry(
      "mcp",
      {
        port: 3050,
        pid: 999_999,
        parentpid: 1,
        startedAt: "2026-05-13T00:00:00.000Z",
        cmd: "mcp",
      },
      workdir,
    );
    const url = resolveServiceUrl("mcp", {
      projectRoot: workdir,
      env: { MCP_BASE_URL: "http://fallback:7777" },
    });
    expect(url).toBe("http://fallback:7777");
  });

  it("runtime-state file with stale PID falls through to default when no env", () => {
    writeServiceEntry(
      "gateway",
      {
        port: 4040,
        pid: 999_999,
        parentpid: 1,
        startedAt: "2026-05-13T00:00:00.000Z",
        cmd: "gw",
      },
      workdir,
    );
    expect(
      resolveServiceUrl("gateway", { projectRoot: workdir, env: {} }),
    ).toBe("http://localhost:3003");
  });

  it("unknown schemaVersion in runtime-state file is treated as absent", () => {
    const dir = join(workdir, ".wxai");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(workdir, RUNTIME_STATE_PATH),
      JSON.stringify({ schemaVersion: 999, services: { mcp: { port: 1111 } } }),
    );
    expect(
      resolveServiceUrl("mcp", { projectRoot: workdir, env: {} }),
    ).toBe("http://localhost:3002");
  });

  it("malformed runtime-state file falls through gracefully", () => {
    const dir = join(workdir, ".wxai");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(workdir, RUNTIME_STATE_PATH), "{ not valid json");
    expect(
      resolveServiceUrl("mcp", { projectRoot: workdir, env: {} }),
    ).toBe("http://localhost:3002");
  });
});

describe("resolveServicePort", () => {
  it("extracts port from the resolved URL", () => {
    writeServiceEntry(
      "mcp",
      {
        port: 3777,
        pid: process.pid,
        parentpid: 1,
        startedAt: "2026-05-13T00:00:00.000Z",
        cmd: "mcp",
      },
      workdir,
    );
    expect(
      resolveServicePort("mcp", { projectRoot: workdir, env: {} }),
    ).toBe(3777);
  });

  it("returns default port when no resolution available", () => {
    expect(
      resolveServicePort("gateway", { projectRoot: workdir, env: {} }),
    ).toBe(DEFAULT_PORTS.gateway);
  });

  it("DEFAULT_PORTS matches FR-001", () => {
    expect(DEFAULT_PORTS.mcp).toBe(3002);
    expect(DEFAULT_PORTS.gateway).toBe(3003);
  });

  it("DEFAULT_PORTS uses RUNTIME_STATE_SCHEMA_VERSION as expected (=1)", () => {
    expect(RUNTIME_STATE_SCHEMA_VERSION).toBe(1);
  });
});
