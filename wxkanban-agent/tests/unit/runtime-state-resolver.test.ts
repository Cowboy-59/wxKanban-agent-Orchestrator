import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  resolveServiceUrl,
  resolveServicePort,
  resolveMcpBaseUrl,
  DEFAULT_PORTS,
  HOSTED_MCP_BASE_URL,
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
  for (const f of [RUNTIME_STATE_PATH, ".wxkanban-project.json", ".wxai/project.json"]) {
    const p = join(workdir, f);
    if (existsSync(p)) rmSync(p, { force: true });
  }
});

// Spec 042 cleanup — MCP is hosted-only. It is NOT a locally-tracked service;
// it resolves via resolveMcpBaseUrl and never to a localhost port.
describe("resolveMcpBaseUrl — hosted-only", () => {
  it("defaults to the hosted MCP when nothing is set", () => {
    expect(resolveMcpBaseUrl({ projectRoot: workdir, env: {} })).toBe(HOSTED_MCP_BASE_URL);
    expect(HOSTED_MCP_BASE_URL).toBe("https://mcp.wxperts.com");
  });

  it("honors WXKANBAN_MCP_BASE_URL env override (staging)", () => {
    expect(
      resolveMcpBaseUrl({ projectRoot: workdir, env: { WXKANBAN_MCP_BASE_URL: "https://staging.mcp.wxperts.com" } }),
    ).toBe("https://staging.mcp.wxperts.com");
  });

  it("honors MCP_BASE_URL / MCP_HTTP_URL aliases", () => {
    expect(resolveMcpBaseUrl({ projectRoot: workdir, env: { MCP_BASE_URL: "https://a.example" } })).toBe("https://a.example");
    expect(resolveMcpBaseUrl({ projectRoot: workdir, env: { MCP_HTTP_URL: "https://b.example" } })).toBe("https://b.example");
  });

  it("reads mcpBaseUrl from .wxkanban-project.json when no env override", () => {
    writeFileSync(join(workdir, ".wxkanban-project.json"), JSON.stringify({ mcpBaseUrl: "https://file.mcp.example" }));
    expect(resolveMcpBaseUrl({ projectRoot: workdir, env: {} })).toBe("https://file.mcp.example");
  });

  it("reads kit.mcpBaseUrl from .wxai/project.json", () => {
    mkdirSync(join(workdir, ".wxai"), { recursive: true });
    writeFileSync(join(workdir, ".wxai", "project.json"), JSON.stringify({ kit: { mcpBaseUrl: "https://kit.mcp.example" } }));
    expect(resolveMcpBaseUrl({ projectRoot: workdir, env: {} })).toBe("https://kit.mcp.example");
  });

  it("never resolves to a localhost URL, even with a stale runtime-state file", () => {
    mkdirSync(join(workdir, ".wxai"), { recursive: true });
    writeFileSync(
      join(workdir, RUNTIME_STATE_PATH),
      JSON.stringify({ schemaVersion: RUNTIME_STATE_SCHEMA_VERSION, services: { gateway: { port: 3003 } } }),
    );
    expect(resolveMcpBaseUrl({ projectRoot: workdir, env: {} })).not.toMatch(/localhost/);
  });
});

describe("resolveServiceUrl — gateway (the only locally-started service)", () => {
  it("falls back to default localhost:3003 for gateway", () => {
    expect(resolveServiceUrl("gateway", { projectRoot: workdir, env: {} })).toBe("http://localhost:3003");
  });

  it("honors GATEWAY_HTTP_PORT for gateway", () => {
    expect(
      resolveServiceUrl("gateway", { projectRoot: workdir, env: { GATEWAY_HTTP_PORT: "5005" } }),
    ).toBe("http://localhost:5005");
  });

  it("runtime-state file takes precedence over env (alive PID)", () => {
    writeServiceEntry(
      "gateway",
      { port: 3050, pid: process.pid, parentpid: 1, startedAt: "2026-05-13T00:00:00.000Z", cmd: "gw" },
      workdir,
    );
    expect(
      resolveServiceUrl("gateway", { projectRoot: workdir, env: { GATEWAY_HTTP_PORT: "9999" } }),
    ).toBe("http://localhost:3050");
  });

  it("runtime-state file with stale PID falls through to default", () => {
    writeServiceEntry(
      "gateway",
      { port: 4040, pid: 999_999, parentpid: 1, startedAt: "2026-05-13T00:00:00.000Z", cmd: "gw" },
      workdir,
    );
    expect(resolveServiceUrl("gateway", { projectRoot: workdir, env: {} })).toBe("http://localhost:3003");
  });
});

describe("resolveServicePort", () => {
  it("extracts port from the resolved gateway URL", () => {
    writeServiceEntry(
      "gateway",
      { port: 3777, pid: process.pid, parentpid: 1, startedAt: "2026-05-13T00:00:00.000Z", cmd: "gw" },
      workdir,
    );
    expect(resolveServicePort("gateway", { projectRoot: workdir, env: {} })).toBe(3777);
  });

  it("returns default gateway port when no resolution available", () => {
    expect(resolveServicePort("gateway", { projectRoot: workdir, env: {} })).toBe(DEFAULT_PORTS.gateway);
  });

  it("DEFAULT_PORTS has gateway 3003 and no mcp entry (hosted-only)", () => {
    expect(DEFAULT_PORTS.gateway).toBe(3003);
    expect("mcp" in DEFAULT_PORTS).toBe(false);
  });

  it("RUNTIME_STATE_SCHEMA_VERSION is 1", () => {
    expect(RUNTIME_STATE_SCHEMA_VERSION).toBe(1);
  });
});
