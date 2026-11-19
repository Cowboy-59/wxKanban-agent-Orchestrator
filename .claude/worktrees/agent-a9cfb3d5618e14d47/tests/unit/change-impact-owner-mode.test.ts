// SCOPE-137 / T019 — the owner sets impactMode in wxKanban (Amendment A, FR-007a).
//
// What must hold:
//   - only the project's owner or a company administrator can change it; anyone else gets 403,
//     and another company's project answers 404 before any role check;
//   - every change is appended as an impact_mode_set event, never an update;
//   - the kit cannot write it (capture_event refuses the type);
//   - the kit caches the owner's mode, refreshes it at most hourly, and a hand-edited local value
//     never overrides a known owner value.
//
// Written directly: the fencer rejects test files with no top-level declaration.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Never reach the real wxKanban from a test (see change-impact-hook.test.ts, 2026-10-17).
for (const k of ["WXKANBAN_API_TOKEN", "WXKANBAN_PROJECT_ID"]) delete process.env[k];
process.env.WXKANBAN_MCP_URL = "http://127.0.0.1:9/mcp";

const OWNER = "11111111-1111-4111-8111-111111111111";
const COMPANY = "22222222-2222-4222-8222-222222222222";
const PROJECT = "33333333-3333-4333-8333-333333333333";
const OTHER_PROJECT = "44444444-4444-4444-8444-444444444444";

type Who = { userid: string; companyid: string; usertype: string; email: string };
const who: { current: Who } = { current: { userid: OWNER, companyid: COMPANY, usertype: "USER", email: "owner@example.test" } };

// The events table, as the service sees it: SELECT returns these rows newest first; INSERT appends.
const store: { rows: Array<{ actor: string; metadata: Record<string, unknown>; created_at: string }>; statements: string[] } = { rows: [], statements: [] };

vi.mock("~/server/middleware/auth.js", () => ({
  authenticateToken: (req: Request & Partial<Who>, _res: Response, next: NextFunction) => {
    Object.assign(req, who.current);
    next();
  },
  requireAuth: (_req: Request, _res: Response, next: NextFunction) => next(),
}));
vi.mock("~/server/lib/logger.js", () => ({ createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }));
vi.mock("~/server/services/ProjectService.js", () => ({
  ProjectService: { canAccessProjectTenant: async (projectid: string) => projectid === PROJECT },
}));
vi.mock("~/db/client.js", () => {
  const sqlText = (q: { queryChunks?: unknown[] }) =>
    (q.queryChunks ?? []).map((c) => (typeof c === "object" && c && "value" in c ? (c as { value: string[] }).value.join("") : "?")).join("");
  const params = (q: { queryChunks?: unknown[] }) =>
    (q.queryChunks ?? []).filter((c) => !(typeof c === "object" && c && "value" in c));
  return {
    db: {
      select: () => ({
        from: () => ({
          where: () => ({ limit: async () => [{ id: PROJECT, userid: OWNER, companyid: COMPANY }] }),
        }),
      }),
      execute: async (q: { queryChunks?: unknown[] }) => {
        const text = sqlText(q);
        store.statements.push(text);
        if (/^\s*INSERT/i.test(text)) {
          const p = params(q) as unknown[];
          const row = { actor: String(p[3]), metadata: JSON.parse(String(p[5])), created_at: new Date().toISOString() };
          store.rows.unshift(row);
          return { rows: [{ created_at: row.created_at }] };
        }
        return { rows: store.rows };
      },
    },
  };
});

let base = "";
let server: ReturnType<ReturnType<typeof express>["listen"]>;

beforeAll(async () => {
  const { default: router } = await import("../../src/server/routes/impactMode");
  server = express().use(express.json()).use("/api/projects", router).listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/projects`;
});
afterAll(() => server?.close());
beforeEach(() => {
  store.rows = [];
  store.statements = [];
  who.current = { userid: OWNER, companyid: COMPANY, usertype: "USER", email: "owner@example.test" };
});

const put = (project: string, mode: string) =>
  fetch(`${base}/${project}/impact-mode`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode }) });

describe("SCOPE-137 T019 — the app: owner-set impactMode (FR-007a)", () => {
  it("the owner sets it; the change is appended as an impact_mode_set event with the previous mode", async () => {
    expect((await put(PROJECT, "always")).status).toBe(200);
    const res = await put(PROJECT, "notify");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { impactMode: { mode: string; previous: string; setBy: string }; changed: boolean };
    expect(body).toMatchObject({ changed: true, impactMode: { mode: "notify", previous: "always", setBy: "owner@example.test" } });
    const writes = store.statements.filter((s) => !/^\s*SELECT/i.test(s));
    expect(writes).toHaveLength(2);
    for (const w of writes) {
      expect(w).toMatch(/^\s*INSERT INTO events/);
      expect(w).not.toMatch(/UPDATE|DELETE/i);
    }
    expect(store.rows[0].metadata).toMatchObject({ mode: "notify", previous: "always", setByUserId: OWNER });
  });

  it("setting the mode it already has records nothing", async () => {
    await put(PROJECT, "always");
    const res = await put(PROJECT, "always");
    expect(((await res.json()) as { changed: boolean }).changed).toBe(false);
    expect(store.rows).toHaveLength(1);
  });

  it("a company administrator may change it; anyone else gets 403 and nothing is written", async () => {
    who.current = { userid: "55555555-5555-4555-8555-555555555555", companyid: COMPANY, usertype: "ADMIN", email: "admin@example.test" };
    expect((await put(PROJECT, "always")).status).toBe(200);
    who.current = { userid: "66666666-6666-4666-8666-666666666666", companyid: COMPANY, usertype: "USER", email: "dev@example.test" };
    expect((await put(PROJECT, "notify")).status).toBe(403);
    expect(store.rows).toHaveLength(1);
    const view = (await (await fetch(`${base}/${PROJECT}/impact-mode`)).json()) as { impactMode: { mode: string }; canChange: boolean };
    expect(view).toMatchObject({ impactMode: { mode: "always" }, canChange: false });
  });

  it("another company's project answers 404 for reading and changing", async () => {
    expect((await fetch(`${base}/${OTHER_PROJECT}/impact-mode`)).status).toBe(404);
    expect((await put(OTHER_PROJECT, "always")).status).toBe(404);
    expect(store.rows).toHaveLength(0);
  });

  it("an unknown mode is refused", async () => {
    expect((await put(PROJECT, "never")).status).toBe(400);
    expect(store.rows).toHaveLength(0);
  });
});

describe("SCOPE-137 T019 — the MCP: read-only for the kit (FR-007a)", () => {
  it("capture_event refuses impact_mode_set, so a kit token cannot set the mode", async () => {
    const { ProjectEventTypeSchema } = await import("../../mcp-server/src/utils/schemas");
    expect(ProjectEventTypeSchema.safeParse("impact_mode_set").success).toBe(false);
  });

  it("the newest valid event is the project's mode", async () => {
    const { latestImpactMode } = await import("../../mcp-server/src/utils/impact-mode");
    expect(latestImpactMode([])).toBeNull();
    expect(
      latestImpactMode([
        { actor: "a", metadata: { mode: "notify" }, createdAt: "2026-10-01T00:00:00Z" },
        { actor: "b", metadata: { mode: "bogus" }, createdAt: "2026-10-03T00:00:00Z" },
        { actor: "c", metadata: { mode: "always", previous: "notify" }, createdAt: "2026-10-02T00:00:00Z" },
      ]),
    ).toEqual({ mode: "always", previous: "notify", setBy: "c", setAt: "2026-10-02T00:00:00.000Z" });
  });
});

describe("SCOPE-137 T019 — the kit: cache, refresh, precedence (FR-007a)", () => {
  let root = "";
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "impact-owner-"));
    mkdirSync(join(root, ".wxai"), { recursive: true });
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const local = (mode: string) => writeFileSync(join(root, ".wxai/project.json"), JSON.stringify({ projectId: PROJECT, impactMode: mode }));
  const cache = (v: Record<string, unknown>) => writeFileSync(join(root, ".wxai/impact-mode.json"), JSON.stringify(v));

  it("the owner's mode wins over a hand-edited local value, and the report says so", async () => {
    const { readImpactMode } = await import("../../_wxAI/impact/lib/classify.mjs");
    local("notify");
    expect(readImpactMode(root)).toMatchObject({ mode: "notify", source: "project.json" });
    cache({ mode: "always", setBy: "owner@example.test", fetchedAt: new Date().toISOString() });
    const m = readImpactMode(root);
    expect(m).toMatchObject({ mode: "always", source: "owner" });
    expect(m.warning).toMatch(/"notify" in \.wxai\/project\.json is ignored: the project owner set "always"/);
    cache({ mode: null, fetchedAt: new Date().toISOString() });
    expect(readImpactMode(root)).toMatchObject({ mode: "notify", source: "project.json" });
  });

  it("refreshes at most hourly, asks for the mode alone, and keeps the last value when the call fails", async () => {
    const { refreshOwnerImpactMode, OWNER_MODE_TTL_MS } = await import("../../_wxAI/impact/lib/owner-mode.mjs");
    local("boundaries");
    writeFileSync(join(root, ".wxkanban-project.json"), JSON.stringify({ projectId: PROJECT }));
    const calls: Array<{ name: string; args: Record<string, unknown>; timeoutMs: number }> = [];
    const conn = { url: "http://127.0.0.1:9/mcp", token: "t" };
    const ok = async (_c: unknown, name: string, args: Record<string, unknown>, o: { timeoutMs: number }) => {
      calls.push({ name, args, timeoutMs: o.timeoutMs });
      return { projectId: PROJECT, impactMode: { mode: "always", previous: null, setBy: "owner@example.test", setAt: "2026-10-17T00:00:00.000Z" } };
    };
    const t0 = Date.parse("2026-10-17T12:00:00Z");
    expect(await refreshOwnerImpactMode(root, { conn, mcpCall: ok, now: t0 })).toBe("updated");
    expect(calls[0]).toMatchObject({ name: "project.cockpit_summary", args: { projectId: PROJECT, impactModeOnly: true } });
    expect(calls[0].timeoutMs).toBeLessThanOrEqual(2000);
    expect(JSON.parse(readFileSync(join(root, ".wxai/impact-mode.json"), "utf8"))).toMatchObject({ mode: "always" });

    expect(await refreshOwnerImpactMode(root, { conn, mcpCall: ok, now: t0 + 60_000 })).toBe("fresh");
    expect(calls).toHaveLength(1);

    const fail = async () => {
      throw new Error("offline");
    };
    expect(await refreshOwnerImpactMode(root, { conn, mcpCall: fail, now: t0 + OWNER_MODE_TTL_MS + 1 })).toBe("failed");
    expect(JSON.parse(readFileSync(join(root, ".wxai/impact-mode.json"), "utf8"))).toMatchObject({ mode: "always", lastError: "offline" });
    expect(await refreshOwnerImpactMode(root, { conn, mcpCall: fail, now: t0 + OWNER_MODE_TTL_MS + 2 })).toBe("fresh");
  });

  it("with no project or token it makes no call", async () => {
    const { refreshOwnerImpactMode } = await import("../../_wxAI/impact/lib/owner-mode.mjs");
    const never = vi.fn();
    expect(await refreshOwnerImpactMode(root, { conn: null, mcpCall: never })).toBe("unconfigured");
    expect(never).not.toHaveBeenCalled();
  });

  it("the hook follows the owner's mode: an edit that would ask only notifies under the owner's notify", async () => {
    const { FIXTURES } = await import("../../_wxAI/impact/prove.mjs");
    const { decideToolCall } = await import("../../_wxAI/impact/hook.mjs");
    for (const [file, content] of Object.entries(FIXTURES.native.files as Record<string, string>)) {
      mkdirSync(join(root, file, ".."), { recursive: true });
      writeFileSync(join(root, file), content);
    }
    const edit = {
      file_path: join(root, "src/server/service.ts"),
      old_string: "  bus.emit('item:saved', name);",
      new_string: "  bus.emit('item:saved', name.trim());",
    };
    type Out = { hookSpecificOutput?: { permissionDecision?: string; additionalContext?: string } } | null;
    const call = () => decideToolCall({ hook_event_name: "PreToolUse", tool_name: "Edit", tool_input: edit }, { root, deps: { conn: null } }) as Promise<Out>;

    local("notify"); // hand-edited to stop the asking
    cache({ mode: "boundaries", fetchedAt: new Date().toISOString() });
    const denied = await call();
    expect(denied?.hookSpecificOutput?.permissionDecision).toBe("deny");
    expect((denied?.hookSpecificOutput as { permissionDecisionReason?: string })?.permissionDecisionReason).toMatch(/Note: impactMode "notify" in \.wxai\/project\.json is ignored/);
    const report = JSON.parse(readFileSync(join(root, ".wxai/impact.json"), "utf8"));
    expect(report.classification.warning).toMatch(/is ignored: the project owner set "boundaries"/);

    cache({ mode: "notify", fetchedAt: new Date().toISOString() });
    const out = await call();
    expect(out?.hookSpecificOutput?.permissionDecision).toBeUndefined();
    expect(out?.hookSpecificOutput?.additionalContext).toMatch(/Change Impact \(notify\)/);
  });
});
