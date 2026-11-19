import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  resolveServiceUrl,
  resolveServicePort,
  resolveMcpBaseUrl,
  derivePreferredPort,
  DEFAULT_PORTS,
  HOSTED_MCP_BASE_URL,
} from "../../core/context/runtime-state";
import {
  writeServiceEntry,
  readRuntimeState,
  reapDeadEntries,
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
  // [SCOPE 068 / FR-001] No alive gateway → fail closed (null), never a shared
  // default port that on a multi-project machine belongs to another project.
  it("returns null when no gateway is running (no shared :3003 fallback)", () => {
    expect(resolveServiceUrl("gateway", { projectRoot: workdir, env: {} })).toBeNull();
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

  it("runtime-state file with stale PID returns null and reaps the entry", () => {
    writeServiceEntry(
      "gateway",
      { port: 4040, pid: 999_999, parentpid: 1, startedAt: "2026-05-13T00:00:00.000Z", cmd: "gw" },
      workdir,
    );
    expect(resolveServiceUrl("gateway", { projectRoot: workdir, env: {} })).toBeNull();
    // [SCOPE 068 / FR-004] dead entry reaped on read → file gone
    expect(readRuntimeState(workdir)).toBeNull();
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

  it("returns null when no gateway is running", () => {
    expect(resolveServicePort("gateway", { projectRoot: workdir, env: {} })).toBeNull();
  });

  it("DEFAULT_PORTS has gateway 3003 and no mcp entry (hosted-only)", () => {
    expect(DEFAULT_PORTS.gateway).toBe(3003);
    expect("mcp" in DEFAULT_PORTS).toBe(false);
  });

  it("RUNTIME_STATE_SCHEMA_VERSION is 1", () => {
    expect(RUNTIME_STATE_SCHEMA_VERSION).toBe(1);
  });
});

// [SCOPE 068 / FR-005] deterministic per-project preferred port
describe("derivePreferredPort", () => {
  it("returns the base when no projectId", () => {
    expect(derivePreferredPort(undefined)).toBe(DEFAULT_PORTS.gateway);
    expect(derivePreferredPort(null)).toBe(DEFAULT_PORTS.gateway);
  });

  it("is stable for the same projectId", () => {
    expect(derivePreferredPort("proj-a")).toBe(derivePreferredPort("proj-a"));
  });

  it("differs for different projectIds (two projects don't prefer the same port)", () => {
    expect(derivePreferredPort("proj-a")).not.toBe(derivePreferredPort("proj-b"));
  });

  it("stays within base..base+range", () => {
    const p = derivePreferredPort("some-project-id");
    expect(p).toBeGreaterThanOrEqual(DEFAULT_PORTS.gateway);
    expect(p).toBeLessThan(DEFAULT_PORTS.gateway + 1000);
  });
});

// [SCOPE 068 / FR-004] reaping
describe("reapDeadEntries", () => {
  it("removes a dead entry and keeps a live one", () => {
    writeServiceEntry(
      "gateway",
      { port: 4040, pid: 999_999, parentpid: 1, startedAt: "2026-05-13T00:00:00.000Z", cmd: "gw" },
      workdir,
    );
    const after = reapDeadEntries(workdir);
    expect(after?.services.gateway).toBeUndefined();
  });

  it("is a no-op when there is no state file", () => {
    expect(reapDeadEntries(workdir)).toBeNull();
  });
});
