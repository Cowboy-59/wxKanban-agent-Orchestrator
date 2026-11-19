/**
 * SPEC-146 — /api/audit access control over real HTTP. Services and the db are stubbed: nothing
 * reaches the database. The role comes from an `x-test-role` header read by the stubbed auth
 * middleware; no header means anonymous.
 *   T001 / FR-004  every registered route has an access entry, and its guard matches it
 *   T007           each role gets the expected status on all 23 routes; denied writes call nothing
 *   FR-003         a non-SYSADMIN reads framework documents only; internal documents answer 404
 *   FR-005         SYSADMIN writes leave a companyauditlogs row
 *   FR-006         extract answers 404 / 422 / { tasksRemoved, tasksExtracted }
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "net";
import type { Server } from "http";
import type { NextFunction, Request, Response } from "express";

const h = vi.hoisted(() => {
  class NoTasksExtractedError extends Error {
    constructor(public readonly documentId: string) {
      super("The document produced no compliance tasks; its existing tasks were left unchanged.");
    }
  }
  return {
    NoTasksExtractedError,
    inserts: [] as Array<{ table: unknown; values: Record<string, unknown> }>,
    doc: null as Record<string, unknown> | null,
    projectCompany: "c-1" as string | null,
    tenant: vi.fn(async () => true),
    svc: {
      getAuditConfig: vi.fn(async () => null),
      getOrCreateAuditConfig: vi.fn(async () => ({})),
      getOrCreateAuditConfigByProject: vi.fn(async () => ({})),
      updateAuditConfig: vi.fn(async () => ({})),
      updateAuditConfigByProject: vi.fn(async () => ({})),
      getEnabledFrameworks: vi.fn(async () => ["SOC2"]),
      getEnabledFrameworksByProject: vi.fn(async () => ["SOC2"]),
      listDocuments: vi.fn(async () => []),
      uploadDocument: vi.fn(async () => ({ id: "d-new", title: "New", documenttype: "compliance_framework", framework: "SOC2" })),
      getDocument: vi.fn(async () => h.doc),
      deleteDocument: vi.fn(async () => undefined),
      searchDocuments: vi.fn(async () => []),
      extractTasksFromDocument: vi.fn(async () => ({ tasksRemoved: 3, tasksExtracted: 3 })),
      countTasksForDocument: vi.fn(async () => 119),
      listTasks: vi.fn(async () => []),
      getTask: vi.fn(async () => ({ id: "t" })),
      getRelevantTasks: vi.fn(async () => []),
      createAuditExecution: vi.fn(async () => ({ id: "e-new" })),
      executeAudit: vi.fn(async () => undefined),
      cancelAuditExecution: vi.fn(async () => undefined),
      generateReport: vi.fn(async () => ({ id: "r-new" })),
      listReports: vi.fn(async () => []),
      getReport: vi.fn(async () => ({ id: "r", document: { title: "R", filecontent: "x" } })),
      approveReport: vi.fn(async () => ({ id: "r" })),
      getComplianceTrends: vi.fn(async () => []),
    },
  };
});

vi.mock("../../src/db/client.js", async () => {
  const { companyprojects } = await import("../../src/db/schema/companyproject.js");
  const rows = () => {
    const p = Promise.resolve([] as unknown[]);
    return Object.assign(p, { limit: async () => [], offset: async () => [] });
  };
  // A companyprojects lookup answers with h.projectCompany (null = no such project); every other read is empty.
  const chain = (table: unknown) => ({
    from: (t: unknown) => chain(t),
    where: () =>
      Object.assign(rows(), {
        limit: async () => (table === companyprojects && h.projectCompany ? [{ companyid: h.projectCompany }] : []),
      }),
    orderBy: () => ({ limit: () => ({ offset: async () => [] }) }),
  });
  return {
    db: {
      select: () => chain(null),
      insert: (table: unknown) => ({
        values: async (values: Record<string, unknown>) => {
          h.inserts.push({ table, values });
        },
      }),
    },
  };
});
vi.mock("../../src/server/middleware/auth.js", () => ({
  authenticateToken: (req: Request & Record<string, unknown>, _res: Response, next: NextFunction) => {
    const role = req.header("x-test-role");
    if (role) {
      req.usertype = role;
      req.userid = "u-1";
      req.companyid = "c-1";
      req.email = "t@example.com";
    }
    next();
  },
  requireAuth: (req: Request & Record<string, unknown>, res: Response, next: NextFunction) => {
    if (!req.userid) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    next();
  },
}));
vi.mock("../../src/server/services/AuditConfigService.js", () => h.svc);
vi.mock("../../src/server/services/DocumentService.js", () => h.svc);
vi.mock("../../src/server/services/AuditTaskService.js", () => ({ ...h.svc, NoTasksExtractedError: h.NoTasksExtractedError }));
vi.mock("../../src/server/services/AuditEngineService.js", () => h.svc);
vi.mock("../../src/server/services/ReportService.js", () => h.svc);
vi.mock("../../src/server/services/ProjectService.js", () => ({
  ProjectService: { canAccessProjectTenant: h.tenant },
}));

import auditRoutes from "../../src/server/routes/audit.js";
import { AUDIT_ROUTE_ACCESS, type AuditRouteKey } from "../../src/server/routes/auditAccess.js";
import { requireAdmin } from "../../src/server/middleware/requireAdmin.js";
import { requireSysAdmin } from "../../src/server/middleware/requireSysAdmin.js";
import { companyauditlogs } from "../../src/db/schema/companyauditlog.js";

// [SCOPE 146 / T001] BEGIN — route-enumeration test: every /api/audit route is declared, and guarded as declared
type RouteLayer = { route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: unknown }> } };

const registered = (): Array<{ key: string; handles: unknown[] }> =>
  ((auditRoutes as unknown as { stack: RouteLayer[] }).stack)
    .filter((l) => l.route)
    .flatMap((l) =>
      Object.keys(l.route!.methods)
        .filter((m) => l.route!.methods[m])
        .map((m) => ({ key: `${m.toUpperCase()} ${l.route!.path}`, handles: l.route!.stack.map((s) => s.handle) })),
    );

describe("T001 — the access table and the router agree (FR-004)", () => {
  it("every registered route has an access entry", () => {
    const missing = registered().map((r) => r.key).filter((k) => !(k in AUDIT_ROUTE_ACCESS));
    expect(missing).toEqual([]);
  });

  it("every access entry names a registered route", () => {
    const keys = new Set(registered().map((r) => r.key));
    expect(Object.keys(AUDIT_ROUTE_ACCESS).filter((k) => !keys.has(k))).toEqual([]);
  });

  it("there are 22 routes", () => {
    expect(registered()).toHaveLength(22);
  });

  it("each route's guard matches its entry and runs first", () => {
    for (const { key, handles } of registered()) {
      const access = AUDIT_ROUTE_ACCESS[key as AuditRouteKey];
      if (access === "sysadmin") expect(handles[0], key).toBe(requireSysAdmin);
      else if (access === "companyAdmin") expect(handles[0], key).toBe(requireAdmin);
      else {
        expect(handles, key).not.toContain(requireSysAdmin);
        expect(handles, key).not.toContain(requireAdmin);
      }
    }
  });

  it("/documents/search is registered before /documents/:id, so it is reachable", () => {
    const order = registered().map((r) => r.key);
    expect(order.indexOf("GET /documents/search")).toBeLessThan(order.indexOf("GET /documents/:id"));
  });
});
// [SCOPE 146 / T001] END

// [SCOPE 146 / T007] BEGIN — role tests over real HTTP for all 22 audit routes
const ID = "11111111-1111-7111-8111-111111111111";
let server: Server;
let base: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/audit", auditRoutes);
  server = app.listen(0);
  await new Promise<void>((r) => server.once("listening", () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

beforeEach(() => {
  h.inserts.length = 0;
  h.doc = { id: ID, title: "SOC2 SDLC Compliance Rules", documenttype: "compliance_framework", framework: "SOC2", extractedtasks: 1 };
  for (const fn of Object.values(h.svc)) fn.mockClear();
  h.projectCompany = "c-1";
  h.tenant.mockReset();
  h.tenant.mockImplementation(async () => true);
  h.svc.extractTasksFromDocument.mockImplementation(async () => ({ tasksRemoved: 3, tasksExtracted: 3 }));
});

const call = (key: string, role?: string, body: unknown = {}) => {
  const [method, path] = key.split(" ");
  const url = `${base}/api/audit${path.replace(/:id/g, ID)}${path === "/documents/search" ? "?q=access" : ""}${path === "/tasks/relevant" ? `?projectId=${ID}` : ""}`;
  return fetch(url, {
    method,
    headers: { "content-type": "application/json", ...(role ? { "x-test-role": role } : {}) },
    body: method === "GET" ? undefined : JSON.stringify(body),
  });
};

const WRITE_FNS = [
  "uploadDocument", "deleteDocument", "extractTasksFromDocument", "createAuditExecution",
  "cancelAuditExecution", "generateReport", "approveReport", "updateAuditConfig", "updateAuditConfigByProject",
] as const;
const routes = Object.entries(AUDIT_ROUTE_ACCESS) as Array<[AuditRouteKey, string]>;
const customerRoles = ["TEAM_MEMBER", "TEAM_MANAGER", "ADMIN"];

describe("T007 — anonymous callers", () => {
  it.each(routes.map(([k]) => k))("%s → 401", async (key) => {
    expect((await call(key)).status).toBe(401);
  });
});

describe("T007 — customer roles on SYSADMIN routes (FR-001, FR-002)", () => {
  const sys = routes.filter(([, a]) => a === "sysadmin").map(([k]) => k);
  it("14 routes are SYSADMIN only", () => expect(sys).toHaveLength(14));

  for (const role of customerRoles) {
    it.each(sys)(`${role}: %s → 403 SYSADMIN, nothing called`, async (key) => {
      const res = await call(key, role);
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({ roleRequired: "SYSADMIN", currentRole: role });
      for (const fn of WRITE_FNS) expect(h.svc[fn], fn).not.toHaveBeenCalled();
      expect(h.svc.listReports).not.toHaveBeenCalled();
      expect(h.svc.getComplianceTrends).not.toHaveBeenCalled();
      expect(h.inserts).toHaveLength(0);
    });
  }

  it("a malformed body is still refused with 403, not 400 (the guard runs first)", async () => {
    const res = await call("POST /documents", "TEAM_MEMBER", { nonsense: true });
    expect(res.status).toBe(403);
  });
});

describe("T007 — SYSADMIN is never refused on a SYSADMIN route", () => {
  it.each(routes.filter(([, a]) => a === "sysadmin").map(([k]) => k))("%s → not 401/403", async (key) => {
    const res = await call(key, "SYSADMIN", key === "POST /documents"
      ? { documenttype: "compliance_framework", title: "T", filecontent: "- [ ] x" }
      : key === "POST /reports" ? { executionId: ID, title: "R" } : {});
    expect([401, 403]).not.toContain(res.status);
  });
});

describe("T007 — unchanged routes keep their rules", () => {
  it.each(routes.filter(([, a]) => a === "login" || a === "loginFrameworkOnly").map(([k]) => k))(
    "TEAM_MEMBER: %s → not 401/403",
    async (key) => {
      expect([401, 403]).not.toContain((await call(key, "TEAM_MEMBER")).status);
    },
  );
  it("PUT /config: ADMIN allowed, TEAM_MEMBER 403, unchanged", async () => {
    expect((await call("PUT /config", "ADMIN", { soc2enabled: true })).status).not.toBe(403);
    expect((await call("PUT /config", "TEAM_MEMBER", { soc2enabled: true })).status).toBe(403);
  });
});

describe("FR-003 — framework-only document reads", () => {
  it("a non-SYSADMIN list is framework-only, whatever documenttype says", async () => {
    await fetch(`${base}/api/audit/documents?documenttype=db_analysis`, { headers: { "x-test-role": "TEAM_MEMBER" } });
    expect(h.svc.listDocuments).toHaveBeenCalledWith(expect.objectContaining({ frameworkOnly: true, documenttype: "db_analysis" }));
  });
  it("a SYSADMIN list is not narrowed", async () => {
    await call("GET /documents", "SYSADMIN");
    expect(h.svc.listDocuments).toHaveBeenCalledWith(expect.objectContaining({ frameworkOnly: false }));
  });
  it("an internal document answers 404 to a non-SYSADMIN, same body as a missing one", async () => {
    h.svc.getDocument.mockImplementationOnce(async () => null);
    const res = await call("GET /documents/:id", "ADMIN");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ success: false, error: "Document not found" });
    expect(h.svc.getDocument).toHaveBeenCalledWith(ID, { frameworkOnly: true });
  });
  it("search reaches the search route and is framework-only", async () => {
    const res = await call("GET /documents/search", "TEAM_MEMBER");
    expect(res.status).toBe(200);
    expect(h.svc.searchDocuments).toHaveBeenCalledWith("access", { frameworkOnly: true });
    expect(h.svc.getDocument).not.toHaveBeenCalled();
  });
});

describe("FR-006 / FR-005 — extract and delete as SYSADMIN", () => {
  it("extract answers the replace counts and records the write", async () => {
    const res = await call("POST /documents/:id/extract", "SYSADMIN");
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ documentId: ID, tasksRemoved: 3, tasksExtracted: 3 });
    expect(h.inserts).toHaveLength(1);
    expect(h.inserts[0].table).toBe(companyauditlogs);
    expect(h.inserts[0].values).toMatchObject({ action: "audit_document_tasks_replaced", companyid: "c-1", changedby: "u-1" });
  });
  it("extract of a missing document → 404, nothing extracted", async () => {
    h.doc = null;
    expect((await call("POST /documents/:id/extract", "SYSADMIN")).status).toBe(404);
    expect(h.svc.extractTasksFromDocument).not.toHaveBeenCalled();
  });
  it("a 0-task parse → 422, no audit row", async () => {
    h.svc.extractTasksFromDocument.mockImplementationOnce(async () => {
      throw new h.NoTasksExtractedError(ID);
    });
    expect((await call("POST /documents/:id/extract", "SYSADMIN")).status).toBe(422);
    expect(h.inserts).toHaveLength(0);
  });
  it("delete of a missing document → 404, nothing deleted", async () => {
    h.doc = null;
    expect((await call("DELETE /documents/:id", "SYSADMIN")).status).toBe(404);
    expect(h.svc.deleteDocument).not.toHaveBeenCalled();
  });
  it("delete records what the document held", async () => {
    expect((await call("DELETE /documents/:id", "SYSADMIN")).status).toBe(200);
    expect(h.inserts[0].values).toMatchObject({
      action: "audit_document_deleted",
      previousvalue: expect.objectContaining({ documentId: ID, tasksRemoved: 119 }),
    });
  });
});
// [SCOPE 146 / T007] END

// [SCOPE 146 / T009] BEGIN — per-project compliance settings answer only to the project's tenant (FR-009)
const P = "22222222-2222-7222-8222-222222222222";
const cfg = (method: "GET" | "PUT", role: string, path = `/config?projectId=${P}`) =>
  fetch(`${base}/api/audit${path}`, {
    method,
    headers: { "content-type": "application/json", "x-test-role": role },
    body: method === "PUT" ? JSON.stringify({ soc2enabled: false }) : undefined,
  });

describe("FR-009 — /config and /tasks/relevant check the project's tenant", () => {
  it("another company's ADMIN cannot change the project's frameworks (US5)", async () => {
    h.projectCompany = "c-2";
    const res = await cfg("PUT", "ADMIN");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ success: false, error: "Project not found" });
    expect(h.svc.updateAuditConfigByProject).not.toHaveBeenCalled();
    expect(h.svc.getOrCreateAuditConfigByProject).not.toHaveBeenCalled();
  });

  it("another company cannot read the project's settings or relevant tasks", async () => {
    h.projectCompany = "c-2";
    h.tenant.mockImplementation(async () => false);
    expect((await cfg("GET", "TEAM_MEMBER")).status).toBe(404);
    expect((await cfg("GET", "ADMIN", `/tasks/relevant?projectId=${P}`)).status).toBe(404);
    expect(h.svc.getOrCreateAuditConfigByProject).not.toHaveBeenCalled();
    expect(h.svc.getEnabledFrameworksByProject).not.toHaveBeenCalled();
    expect(h.tenant).toHaveBeenCalledWith(P, "c-1");
  });

  it("an engaged consulting company may read but not change", async () => {
    h.projectCompany = "c-2";
    h.tenant.mockImplementation(async () => true);
    expect((await cfg("GET", "ADMIN")).status).toBe(200);
    expect((await cfg("PUT", "ADMIN")).status).toBe(404);
    expect(h.svc.updateAuditConfigByProject).not.toHaveBeenCalled();
  });

  it("the owner company reads and its ADMIN writes, as before", async () => {
    expect((await cfg("GET", "TEAM_MEMBER")).status).toBe(200);
    expect((await cfg("PUT", "ADMIN")).status).toBe(200);
    expect(h.svc.updateAuditConfigByProject).toHaveBeenCalledWith(P, { soc2enabled: false });
  });

  it("an owner-company TEAM_MEMBER still cannot write (requireAdmin, unchanged)", async () => {
    expect((await cfg("PUT", "TEAM_MEMBER")).status).toBe(403);
  });

  it("a SYSADMIN reads any existing project without the tenant rule; an unknown project is 404", async () => {
    h.projectCompany = "c-2";
    h.tenant.mockImplementation(async () => false);
    expect((await cfg("GET", "SYSADMIN")).status).toBe(200);
    expect(h.tenant).not.toHaveBeenCalled();
    h.projectCompany = null;
    expect((await cfg("GET", "SYSADMIN")).status).toBe(404);
  });

  it("the legacy company-wide path (no projectId) is unchanged", async () => {
    h.projectCompany = null;
    expect((await cfg("GET", "TEAM_MEMBER", "/config")).status).toBe(200);
    expect(h.svc.getOrCreateAuditConfig).toHaveBeenCalledWith("c-1");
  });
});
// [SCOPE 146 / T009] END
