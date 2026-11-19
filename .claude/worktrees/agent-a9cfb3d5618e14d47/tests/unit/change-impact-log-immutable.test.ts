// SCOPE-137 / T014 — the agreement log cannot be altered (FR-013).
//
// "Records cannot be altered by the user" holds only while NOTHING can alter them: no app
// route, no MCP tool, no service. This scans every server-side source for an UPDATE or
// DELETE that could reach the events table, and checks the app's log router answers GET
// only. A new writer fails the build here instead of quietly making the log editable.
//
// Written directly: the fencer rejects test files with no top-level declaration.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

// The router's own imports, stubbed: this checks which verbs it answers, not auth or the database,
// and must not need the app's environment (DATABASE_URL, JWT_SECRET) to load.
vi.mock("~/db/client.js", () => ({ db: {} }));
vi.mock("~/server/middleware/auth.js", () => ({ authenticateToken: vi.fn(), requireAuth: vi.fn() }));
vi.mock("~/server/middleware/validation.js", () => ({ validateParams: () => vi.fn() }));
vi.mock("~/server/middleware/errorHandler.js", () => ({ asyncHandler: (fn: unknown) => fn }));
vi.mock("~/server/services/ProjectService.js", () => ({ ProjectService: { canAccessProjectTenant: vi.fn() } }));
vi.mock("~/server/services/ChangeImpactLogService.js", () => ({ ChangeImpactLogService: { listForScope: vi.fn() } }));
vi.mock("~/server/lib/logger.js", () => ({ createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }));

const ROOTS = ["src/server", "src/db", "mcp-server/src"];

// [SCOPE 137 / T014] BEGIN — Server-side source walker for the append-only check
function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name !== "node_modules" && name !== "dist") sources(full, out);
    } else if (/\.(ts|mjs|js)$/.test(name) && !/\.test\./.test(name)) {
      out.push(full);
    }
  }
  return out;
}
// [SCOPE 137 / T014] END

/** Ways code could update or delete rows of the events table. */
const WRITERS = [
  /\b(?:update|delete)(?:Scoped)?\(\s*(?:schema\.)?events\b/,
  /\bUPDATE\s+"?events"?\s+SET\b/i,
  /\bDELETE\s+FROM\s+"?events"?\b/i,
  /\bTRUNCATE\s+(?:TABLE\s+)?"?events"?\b/i,
];

describe("SCOPE-137 T014 — the agreement log is append-only (FR-013)", () => {
  it("the scan is not vacuous: it reads the real tree and its patterns catch a writer", () => {
    expect(ROOTS.flatMap((r) => sources(r)).length).toBeGreaterThan(200);
    for (const sample of [
      "await db.delete(events).where(eq(events.id, id));",
      "await scoped.updateScoped(events, { type: 'x' }, cond);",
      "UPDATE events SET metadata = '{}'",
      'DELETE FROM "events" WHERE id = $1',
    ]) {
      expect(WRITERS.some((re) => re.test(sample)), sample).toBe(true);
    }
  });

  it("no server, schema or MCP source updates or deletes events", () => {
    const hits: string[] = [];
    for (const root of ROOTS) {
      for (const file of sources(root)) {
        const text = readFileSync(file, "utf8");
        for (const re of WRITERS) {
          const m = re.exec(text);
          if (m) hits.push(`${file}: ${m[0]}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });

  it("the only MCP tool that touches events is capture_event, which inserts", () => {
    const server = readFileSync("mcp-server/src/server.ts", "utf8");
    const eventTools = [...server.matchAll(/'project\.(\w*event\w*)'/g)].map((m) => m[1]);
    expect([...new Set(eventTools)]).toEqual(["capture_event"]);
  });

  it("the app's Change Impact log router answers GET only", async () => {
    const { default: router } = await import("../../src/server/routes/changeImpact");
    const stack = (router as unknown as { stack: Array<{ route?: { path: string; methods: Record<string, boolean> } }> }).stack;
    const routes = stack.filter((l) => l.route).map((l) => ({ path: l.route!.path, methods: Object.keys(l.route!.methods) }));
    expect(routes).toEqual([{ path: "/:id/scopes/:scopeid/change-impact", methods: ["get"] }]);
  });
});
