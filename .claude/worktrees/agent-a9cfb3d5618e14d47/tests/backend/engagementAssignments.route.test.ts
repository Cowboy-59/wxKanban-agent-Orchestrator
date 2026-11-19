/**
 * SPEC-037 Amendment A — POST /api/engagements/:id/assignments over real HTTP, the db and
 * side-effect services stubbed (nothing reaches the database, mail or YappChatt):
 *   FR-030  the duplicate check matches the full (projectid, scopeid, taskid) key
 *   FR-031  { allProjects: true } adds every ACTIVE client project not already held
 * Each query's WHERE is rendered to SQL with drizzle's PgDialect, so the conditions the
 * route really sends are what the assertions check.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "net";
import type { Server } from "http";
import type { NextFunction, Request, Response } from "express";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const h = vi.hoisted(() => ({
  results: new Map<unknown, unknown[]>(),
  queries: [] as Array<{ table: unknown; where: unknown }>,
  inserts: [] as Array<{ table: unknown; values: unknown }>,
  insertError: null as Error | null,
  engagement: {} as Record<string, unknown>,
  audit: vi.fn(async () => undefined),
  notify: vi.fn(async () => undefined),
  enqueue: vi.fn(async () => ({ id: "q-" + Math.random().toString(36).slice(2), queuedAt: new Date() })),
}));

vi.mock("../../src/server/db/client.js", () => {
  const select = () => ({
    from: (table: unknown) => ({
      where: (where: unknown) => {
        h.queries.push({ table, where });
        const rows = () => h.results.get(table) ?? [];
        const p = Promise.resolve().then(rows);
        return Object.assign(p, { limit: async () => rows() });
      },
    }),
  });
  const insert = (table: unknown) => ({
    values: async (values: unknown) => {
      if (h.insertError) throw h.insertError;
      h.inserts.push({ table, values });
    },
  });
  return { db: { select, insert } };
});
vi.mock("../../src/server/middleware/auth.js", () => {
  const pass = (_req: unknown, _res: unknown, next: NextFunction) => next();
  return { authenticateToken: pass, requireAuth: pass, softAuthenticateToken: pass };
});
vi.mock("../../src/server/middleware/engagementContext.js", () => {
  const pass = (_req: unknown, _res: unknown, next: NextFunction) => next();
  return {
    resolveEngagementContext: (req: Request & { userid?: string; engagementContext?: unknown }, _res: Response, next: NextFunction) => {
      req.userid = "admin-1";
      req.engagementContext = { role: "client", engagement: h.engagement };
      next();
    },
    requireClientAdmin: pass,
    requireClientSide: pass,
    requireConsultingSide: pass,
    requireConsultingAdminOrManager: pass,
    requireWriteAllowed: pass,
  };
});
vi.mock("../../src/server/services/AuditService.js", () => ({ logAuditEvent: h.audit }));
vi.mock("../../src/server/services/EngagementNotifications.js", () => ({
  notifyEngagementStateChange: vi.fn(async () => undefined),
  notifyAssignmentsModified: h.notify,
}));
vi.mock("../../src/server/services/EngagementModificationQueue.js", () => ({
  enqueueModification: h.enqueue,
  drainPendingModifications: vi.fn(async () => undefined),
}));
vi.mock("../../src/server/lib/email.js", () => ({ sendEmail: vi.fn(async () => undefined) }));
vi.mock("../../src/server/lib/password.js", () => ({ hashPassword: vi.fn(async () => "x") }));
vi.mock("../../src/server/lib/jwt.js", () => ({ signToken: vi.fn(() => "t") }));

import { companyprojects, engagementassignments } from "../../src/db/schema/index.js";
import engagementRoutes from "../../src/server/routes/engagements.js";

// [SCOPE 037 / T078] BEGIN — FR-030 / FR-031 assignment route tests
const ENG = "11111111-1111-7111-8111-111111111111";
const CLIENT = "22222222-2222-7222-8222-222222222222";
const CONSULT = "33333333-3333-7333-8333-333333333333";
const A = "aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbbb";
const C = "cccccccc-cccc-7ccc-8ccc-cccccccccccc";

const dialect = new PgDialect();
const render = (where: unknown) => dialect.sqlToQuery(where as SQL);
const queriesOn = (table: unknown) => h.queries.filter((q) => q.table === table).map((q) => render(q.where));

let server: Server;
let base: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/engagements", engagementRoutes);
  server = app.listen(0);
  await new Promise<void>((r) => server.once("listening", () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

beforeEach(() => {
  h.results.clear();
  h.queries.length = 0;
  h.inserts.length = 0;
  h.insertError = null;
  h.engagement = { id: ENG, state: "active", clientcompanyid: CLIENT, consultingcompanyid: CONSULT };
  h.audit.mockClear();
  h.notify.mockClear();
  h.enqueue.mockClear();
});

const post = (body: unknown) =>
  fetch(`${base}/api/engagements/${ENG}/assignments`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("FR-030 — duplicate check on the full key", () => {
  it("AC1: a second whole-project add checks ITS project, scope IS NULL, task IS NULL — and is accepted", async () => {
    h.results.set(companyprojects, [{ id: B, companyid: CLIENT }]);
    h.results.set(engagementassignments, []); // A is held, but not with B's key
    const res = await post({ projectid: B });
    expect(res.status).toBe(201);
    const [dup] = queriesOn(engagementassignments);
    expect(dup.params).toContain(B);
    expect(dup.sql).toMatch(/"scopeid" is null/);
    expect(dup.sql).toMatch(/"taskid" is null/);
  });

  it("AC2: the same whole project again → 409 naming the existing row", async () => {
    h.results.set(companyprojects, [{ id: A, companyid: CLIENT }]);
    h.results.set(engagementassignments, [{ id: "existing-a" }]);
    const res = await post({ projectid: A });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "ASSIGNMENT_ALREADY_EXISTS", existingId: "existing-a" });
    expect(h.inserts).toHaveLength(0);
  });

  it("AC3: a scope add keys on project + that scope, task IS NULL", async () => {
    h.results.set(companyprojects, [{ id: A, companyid: CLIENT }]);
    h.results.set(engagementassignments, []);
    const res = await post({ projectid: A, scopeid: "037" });
    expect(res.status).toBe(201);
    const [dup] = queriesOn(engagementassignments);
    expect(dup.params).toEqual(expect.arrayContaining([A, "037"]));
    expect(dup.sql).toMatch(/"taskid" is null/);
    expect(dup.sql).not.toMatch(/"scopeid" is null/);
  });

  it("AC4: only active rows count — the check filters removedat IS NULL", async () => {
    h.results.set(companyprojects, [{ id: A, companyid: CLIENT }]);
    h.results.set(engagementassignments, []);
    await post({ projectid: A });
    expect(queriesOn(engagementassignments)[0].sql).toMatch(/"removedat" is null/);
  });
});

describe("FR-031 — { allProjects: true }", () => {
  it("AC1 + AC5: adds the projects not held, skips the held one, one notification, audit to both tenants", async () => {
    h.results.set(companyprojects, [{ id: A }, { id: B }, { id: C }]);
    h.results.set(engagementassignments, [{ projectid: A }]);
    const res = await post({ allProjects: true });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { added: Array<{ projectid: string }>; skipped: string[] };
    expect(body.added.map((a) => a.projectid)).toEqual([B, C]);
    expect(body.skipped).toEqual([A]);

    expect(h.inserts).toHaveLength(1); // one multi-row INSERT: all or none
    const rows = h.inserts[0].values as Array<Record<string, unknown>>;
    expect(rows.map((r) => [r.projectid, r.scopeid, r.taskid])).toEqual([[B, null, null], [C, null, null]]);

    expect(h.notify).toHaveBeenCalledTimes(1);
    expect((h.notify.mock.calls[0] as unknown as [{ added: unknown[] }])[0].added).toHaveLength(2);
    expect(h.audit).toHaveBeenCalledTimes(4); // 2 rows × both tenants
  });

  it("AC2: everything already held → 200, nothing added, no notification", async () => {
    h.results.set(companyprojects, [{ id: A }]);
    h.results.set(engagementassignments, [{ projectid: A }]);
    const res = await post({ allProjects: true });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ added: [], skipped: [A] });
    expect(h.inserts).toHaveLength(0);
    expect(h.notify).not.toHaveBeenCalled();
  });

  it("AC3 + ACTIVE only: the project query is the Client Company's ACTIVE projects; held = project-level only", async () => {
    h.results.set(companyprojects, []);
    await post({ allProjects: true });
    const [proj] = queriesOn(companyprojects);
    expect(proj.params).toEqual(expect.arrayContaining([CLIENT, "ACTIVE"]));
    const [held] = queriesOn(engagementassignments);
    expect(held.sql).toMatch(/"scopeid" is null/);
    expect(held.sql).toMatch(/"taskid" is null/);
    expect(held.sql).toMatch(/"removedat" is null/);
  });

  it("AC4: a failed insert adds nothing — no audit, no notification, 500", async () => {
    h.results.set(companyprojects, [{ id: B }, { id: C }]);
    h.insertError = new Error("boom on second row");
    const res = await post({ allProjects: true });
    expect(res.status).toBe(500);
    expect(h.audit).not.toHaveBeenCalled();
    expect(h.notify).not.toHaveBeenCalled();
  });

  it("paused engagement: one queued ADD_ASSIGNMENT per project, 202, nothing inserted", async () => {
    h.engagement.state = "paused";
    h.results.set(companyprojects, [{ id: B }, { id: C }]);
    const res = await post({ allProjects: true });
    expect(res.status).toBe(202);
    expect(h.enqueue).toHaveBeenCalledTimes(2);
    expect(h.inserts).toHaveLength(0);
  });

  it("ended engagement → 403 ENGAGEMENT_ENDED", async () => {
    h.engagement.state = "ended";
    const res = await post({ allProjects: true });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "ENGAGEMENT_ENDED" });
  });

  it("allProjects with a projectid → 400", async () => {
    const res = await post({ allProjects: true, projectid: A });
    expect(res.status).toBe(400);
    expect(h.inserts).toHaveLength(0);
  });

  it("any other body falls through to the single add", async () => {
    h.results.set(companyprojects, [{ id: A, companyid: CLIENT }]);
    h.results.set(engagementassignments, []);
    const res = await post({ allProjects: false, projectid: A });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ projectid: A, assignmentId: expect.any(String) });
  });
});
// [SCOPE 037 / T078] END
