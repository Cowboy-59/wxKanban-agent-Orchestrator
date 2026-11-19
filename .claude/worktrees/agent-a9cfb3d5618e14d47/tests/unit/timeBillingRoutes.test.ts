// SPEC-005 / T020 — contract tests for /api/time-billing. The router is mounted on a bare
// Express app; auth reads test headers and every service is mocked, so nothing touches a
// database (the local .env points at production). Covers FR-001 (guard), FR-002/FR-014
// (404 for another company's project), FR-005, FR-011 (409), FR-012/FR-013 (audit, no ACH values).
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import express, { type NextFunction, type Response } from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

const audits: Array<{ action: string; resourceType: string; resourceId?: string; details?: Record<string, unknown> }> = [];
const calls: Record<string, unknown[]> = {};
const record = (name: string, args: unknown[]) => {
  (calls[name] ??= []).push(args);
};

vi.mock("../../src/server/middleware/auth.js", () => ({
  authenticateToken: (req: Record<string, unknown> & { headers: Record<string, string | undefined> }, res: Response, next: NextFunction) => {
    if (!req.headers["x-test-user"]) {
      res.status(401).json({ error: "Missing authorization token" });
      return;
    }
    req.userid = req.headers["x-test-user"];
    req.companyid = req.headers["x-test-company"];
    req.usertype = req.headers["x-test-usertype"];
    req.billingplan = req.headers["x-test-plan"];
    next();
  },
  requireAuth: (_req: unknown, _res: unknown, next: NextFunction) => next(),
}));

vi.mock("../../src/server/services/AuditService.js", () => ({
  logAuditEvent: async (e: { action: string; resourceType: string; resourceId?: string; details?: Record<string, unknown> }) => {
    audits.push(e);
  },
}));

vi.mock("../../src/server/services/TimeBillingProjectAccess.js", async () => {
  const { NotFoundError } = await import("../../src/server/lib/errors.js");
  const own = { id: "11111111-1111-4111-8111-111111111111", name: "Own", engaged: false, clientname: null, billed: false, customerid: null, customername: null, hourlyrate: null, resourcerate: null };
  const engaged = { ...own, id: "22222222-2222-4222-8222-222222222222", name: "Client P", engaged: true, clientname: "Acme", customerid: "c0000000-0000-4000-8000-000000000000" };
  return {
    TimeBillingProjectAccess: {
      resolve: async (_companyid: string, projectid: string) => {
        if (projectid === own.id) return own;
        if (projectid === engaged.id) return engaged;
        throw new NotFoundError("Project");
      },
      upsertEngaged: async (...args: unknown[]) => record("upsertEngaged", args),
    },
  };
});

vi.mock("../../src/server/services/TimeBillingService.js", () => ({
  currentWeekRange: () => ({ from: "2026-10-26", to: "2026-11-01" }),
  setProjectBilled: async (...args: unknown[]) => {
    record("setProjectBilled", args);
    return { before: false, after: true, name: "Own" };
  },
  TimeBillingService: {
    getProjects: async (...args: unknown[]) => {
      record("getProjects", args);
      return { projects: [], billedTotalMinutes: 0, billedTotalHours: "0.00" };
    },
  },
}));

vi.mock("../../src/server/services/TimeBillingEntryService.js", async () => {
  const { ConflictError } = await import("../../src/server/lib/errors.js");
  const entry = { id: "e1", projectid: "p", specid: null, line: "brainstorm", category: "developer", workdate: "2026-11-02", duration: 15, userid: "u1", model: null, entryrate: "150.00", source: "manual", notes: "secret client note" };
  return {
    TimeBillingEntryService: {
      create: async (...args: unknown[]) => {
        record("create", args);
        return entry;
      },
      update: async (_c: string, id: string) => {
        if (id === "99999999-9999-4999-8999-999999999999") throw new ConflictError("This entry is on a statement and cannot be changed");
        return { before: entry, after: { ...entry, duration: 30 } };
      },
      remove: async () => entry,
    },
  };
});

vi.mock("../../src/server/services/TimeBillingSettingsService.js", () => ({
  checkRate: (raw: string) => raw,
  TimeBillingSettingsService: {
    get: async () => ({ developerRate: "150.00", resourceRate: "50.00", ach: {} }),
    update: async () => ({
      before: { developerRate: "150.00", resourceRate: "50.00", ach: {} },
      after: { developerRate: "175.00", resourceRate: "50.00", ach: {} },
      changed: ["developerRate", "ach.routingnumber", "ach.accountnumber"],
    }),
    updateProjectRates: async () => ({ before: { developerRate: null, resourceRate: null }, after: { developerRate: "175.00", resourceRate: null } }),
  },
}));

vi.mock("../../src/server/services/TimeBillingStatementService.js", () => ({
  TimeBillingStatementService: {
    getSuggestedPeriod: async () => ({ periodstart: "2026-10-26", periodend: "2026-11-01" }),
    generate: async () => ({ invoice: { id: "inv1", invoicenumber: "INV-2026-X" }, page1: { total: "387.50" }, entrycount: 2 }),
  },
}));
vi.mock("../../src/server/services/TimeBillingStatementPdf.js", () => ({
  renderStatementPdf: async () => ({ filename: "INV-2026-X.pdf", pdf: Buffer.from("%PDF") }),
}));
vi.mock("../../src/server/services/TimeBillingCustomerService.js", () => ({
  TimeBillingCustomerService: { list: async () => [], setBillingCycle: async () => ({ before: "weekly", after: "biweekly", name: "Acme" }) },
}));
vi.mock("../../src/server/services/TimeBillingTimerService.js", () => ({
  TimeBillingTimerService: {
    getRunning: async () => null,
    // [SCOPE 005 / T029] Pause/Resume (Amendment F)
    pause: async () => ({ entry: { id: "t1" }, elapsedSeconds: 600, paused: true }),
    resume: async () => ({ entry: { id: "t1" }, elapsedSeconds: 600, paused: false }),
    start: async () => ({ id: "t1" }),
    notes: async () => ({ available: false, lines: [] }),
    stop: async () => ({ id: "t1", projectid: "p", specid: null, line: "brainstorm", category: "developer", workdate: "2026-11-02", duration: 105, userid: "u1", model: null, entryrate: "150.00", source: "timer", notes: null }),
  },
}));
vi.mock("../../src/server/services/TimeBillingEntryList.js", () => ({ listEntries: async () => [] }));
// [SCOPE 143 / T027] pullRange is the automatic pull; pullFails makes it throw
let pullFails = false;
vi.mock("../../src/server/services/AgentRunPullService.js", () => ({
  AgentRunPullService: {
    pullDay: async () => ({ available: false, workdate: "2026-11-02", upserted: 0, lockedSkipped: 0 }),
    pullRange: async (...args: unknown[]) => {
      record("pullRange", args);
      if (pullFails) throw new Error("pull failed");
      return { available: true, days: 1, upserted: 2, lockedSkipped: 0 };
    },
  },
}));
vi.mock("../../src/server/services/AgentRunSource.js", () => ({ isAgentRunsAvailable: async () => false }));

import router from "../../src/server/routes/timeBilling.js";

// [SCOPE 005 / T020] BEGIN — contract tests for the Time and Billing routes
const OWN = "11111111-1111-4111-8111-111111111111";
const ENGAGED = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";
let server: Server;
let base = "";

const admin = { "x-test-user": "u1", "x-test-company": "co1", "x-test-usertype": "ADMIN", "x-test-plan": "SMALL_BUSINESS" };

async function call(method: string, path: string, opts: { headers?: Record<string, string>; body?: unknown } = {}) {
  const res = await fetch(`${base}/api/time-billing${path}`, {
    method,
    headers: { "content-type": "application/json", ...(opts.headers ?? admin) },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json: json as Record<string, unknown>, headers: res.headers };
}

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/time-billing", router);
  server = app.listen(0);
  await new Promise<void>((r) => server.once("listening", () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));
beforeEach(() => {
  audits.length = 0;
  pullFails = false;
  for (const k of Object.keys(calls)) delete calls[k];
});

describe("guard (FR-001, CC6.3)", () => {
  it("401 without a session", async () => {
    expect((await call("GET", "/projects", { headers: {} })).status).toBe(401);
  });
  it("403 for a TEAM_MANAGER", async () => {
    expect((await call("GET", "/projects", { headers: { ...admin, "x-test-usertype": "TEAM_MANAGER" } })).status).toBe(403);
  });
  it("403 with upgrade for a FREE plan; Business, Consultant and Enterprise pass", async () => {
    const free = await call("GET", "/projects", { headers: { ...admin, "x-test-plan": "FREE" } });
    expect(free.status).toBe(403);
    expect(free.json.upgrade).toBe(true);
    for (const plan of ["SMALL_BUSINESS", "CONSULTANT", "ENTERPRISE"]) {
      expect((await call("GET", "/projects", { headers: { ...admin, "x-test-plan": plan } })).status).toBe(200);
    }
  });
  it("every route is guarded", async () => {
    const routes: Array<[string, string]> = [
      ["GET", "/status"], ["GET", "/settings"], ["PUT", "/settings"], ["GET", "/customers"],
      ["POST", "/entries"], ["GET", "/timer"], ["POST", "/statements"], ["GET", `/statements/${OWN}/pdf`],
    ];
    for (const [m, p] of routes) {
      expect((await call(m, p, { headers: { ...admin, "x-test-usertype": "TEAM_MEMBER" }, body: m === "GET" ? undefined : {} })).status).toBe(403);
    }
  });
});

describe("projects (FR-002, FR-014)", () => {
  it("a project of another company with no engagement is 404 and writes nothing", async () => {
    const r = await call("PATCH", `/projects/${OTHER}/billed`, { body: { billed: true } });
    expect(r.status).toBe(404);
    expect(calls.setProjectBilled).toBeUndefined();
    expect(calls.upsertEngaged).toBeUndefined();
    expect(audits).toHaveLength(0);
  });
  it("an own project toggles companyprojects; an engaged one writes projectbillings only", async () => {
    expect((await call("PATCH", `/projects/${OWN}/billed`, { body: { billed: true } })).status).toBe(200);
    expect(calls.setProjectBilled).toHaveLength(1);
    expect(calls.upsertEngaged).toBeUndefined();
    expect((await call("PATCH", `/projects/${ENGAGED}/billed`, { body: { billed: true } })).status).toBe(200);
    expect(calls.setProjectBilled).toHaveLength(1);
    expect(calls.upsertEngaged).toHaveLength(1);
    expect(audits.map((a) => a.action)).toEqual(["TIMEBILLING_PROJECT_BILLED_CHANGED", "TIMEBILLING_PROJECT_BILLED_CHANGED"]);
  });
  it("the Customer of an own project is not set here (400)", async () => {
    expect((await call("PATCH", `/projects/${OWN}/customer`, { body: { customerid: null } })).status).toBe(400);
  });
  it("rejects a malformed id and unknown body keys (400)", async () => {
    expect((await call("PATCH", "/projects/not-a-uuid/billed", { body: { billed: true } })).status).toBe(400);
    expect((await call("PATCH", `/projects/${OWN}/billed`, { body: { billed: true, companyid: "x" } })).status).toBe(400);
  });
});

describe("entries (FR-005, FR-011, FR-013)", () => {
  const body = { projectid: OWN, line: "brainstorm", specid: null, category: "developer", userid: OWN, model: null, workdate: "2026-11-02", minutes: 7, notes: null };
  it("create writes exactly one audit row, without the note text", async () => {
    const r = await call("POST", "/entries", { body });
    expect(r.status).toBe(201);
    expect(audits).toHaveLength(1);
    expect(audits[0]?.action).toBe("TIMEBILLING_ENTRY_CREATED");
    expect(JSON.stringify(audits[0])).not.toContain("secret client note");
  });
  it("editing an invoiced entry returns 409, not 500", async () => {
    const r = await call("PATCH", "/entries/99999999-9999-4999-8999-999999999999", { body: { minutes: 30 } });
    expect(r.status).toBe(409);
    expect(audits).toHaveLength(0);
  });
  it("delete is audited once", async () => {
    expect((await call("DELETE", `/entries/${OWN}`)).status).toBe(204);
    expect(audits.map((a) => a.action)).toEqual(["TIMEBILLING_ENTRY_DELETED"]);
  });
  it("stopping the timer is the entry's one creation record", async () => {
    expect((await call("POST", "/timer/stop", { body: {} })).status).toBe(200);
    expect(audits.map((a) => a.action)).toEqual(["TIMEBILLING_ENTRY_CREATED"]);
  });
});

describe("settings and statements (FR-008, FR-009, FR-012, FR-013)", () => {
  it("a rate change and an ACH change are two audit rows; ACH records field names only", async () => {
    const r = await call("PUT", "/settings", { body: { developerRate: "175.00", ach: { routingnumber: "111000025", accountnumber: "123456789012" } } });
    expect(r.status).toBe(200);
    expect(audits.map((a) => a.action)).toEqual(["TIMEBILLING_RATES_CHANGED", "TIMEBILLING_ACH_CHANGED"]);
    const ach = JSON.stringify(audits[1]);
    expect(ach).not.toContain("111000025");
    expect(ach).not.toContain("123456789012");
    expect(audits[1]?.details).toEqual({ changed: ["routingnumber", "accountnumber"] });
  });
  it("generating a statement is audited once (after its automatic agent pull)", async () => {
    const r = await call("POST", "/statements", { body: { customerid: OWN, periodstart: "2026-10-26", periodend: "2026-11-01" } });
    expect(r.status).toBe(201);
    expect(r.json.total).toBe("387.50");
    expect(audits.map((a) => a.action)).toEqual(["TIMEBILLING_AGENT_TIME_PULLED", "TIMEBILLING_STATEMENT_GENERATED"]);
  });
  it("the PDF downloads as an attachment and is never cached", async () => {
    const r = await call("GET", `/statements/${OWN}/pdf`);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("application/pdf");
    expect(r.headers.get("content-disposition")).toContain('attachment; filename="INV-2026-X.pdf"');
    expect(r.headers.get("cache-control")).toBe("no-store");
  });
  it("billing cycle change is audited with before and after", async () => {
    expect((await call("PATCH", `/customers/${OWN}/billingcycle`, { body: { billingcycle: "biweekly" } })).status).toBe(200);
    expect(audits[0]?.details).toEqual({ before: { billingcycle: "weekly" }, after: { billingcycle: "biweekly" } });
  });
});
// [SCOPE 005 / T020] END

// [SCOPE 143 / T027] BEGIN — automatic agent-run pull (SPEC-005 Amendment E, SPEC-143 FR-014, D4)
describe("automatic agent-run pull", () => {
  it("loading the page pulls its date range for the caller's company", async () => {
    expect((await call("GET", "/projects?from=2026-11-02&to=2026-11-08")).status).toBe(200);
    expect(calls.pullRange).toEqual([["co1", "u1", "2026-11-02", "2026-11-08"]]);
    expect(audits[0]?.action).toBe("TIMEBILLING_AGENT_TIME_PULLED");
    expect(audits[0]?.details).toMatchObject({ automatic: true, upserted: 2 });
  });
  it("with no range, the page pulls the current week", async () => {
    expect((await call("GET", "/projects")).status).toBe(200);
    expect(calls.pullRange).toEqual([["co1", "u1", "2026-10-26", "2026-11-01"]]);
  });
  it("a statement pulls its own period first", async () => {
    await call("POST", "/statements", { body: { customerid: OWN, periodstart: "2026-10-12", periodend: "2026-10-25" } });
    expect(calls.pullRange).toEqual([["co1", "u1", "2026-10-12", "2026-10-25"]]);
  });
  it("a failed pull never blocks the page", async () => {
    pullFails = true;
    expect((await call("GET", "/projects")).status).toBe(200);
    expect(calls.getProjects).toHaveLength(1);
  });
  it("a failed pull blocks the statement, which is not generated without its agent time", async () => {
    pullFails = true;
    const r = await call("POST", "/statements", { body: { customerid: OWN, periodstart: "2026-10-26", periodend: "2026-11-01" } });
    expect(r.status).toBe(500);
    expect(audits.map((a) => a.action)).not.toContain("TIMEBILLING_STATEMENT_GENERATED");
  });
  it("other routes and refused callers never pull", async () => {
    await call("GET", "/settings");
    await call("GET", "/projects", { headers: { ...admin, "x-test-usertype": "TEAM_MEMBER" } });
    expect(calls.pullRange).toBeUndefined();
  });
});
// [SCOPE 143 / T027] END

// [SCOPE 005 / T029] BEGIN — Pause/Resume routes (FR-006 Amendment F)
describe("timer pause and resume", () => {
  it("pause and resume answer with the timer and write no audit row", async () => {
    const p = await call("POST", "/timer/pause", { body: {} });
    expect(p.status).toBe(200);
    expect(p.json.timer).toMatchObject({ paused: true, elapsedSeconds: 600 });
    const r = await call("POST", "/timer/resume", { body: {} });
    expect(r.status).toBe(200);
    expect(r.json.timer).toMatchObject({ paused: false });
    expect(audits).toHaveLength(0);
  });
  it("both are guarded like every other route", async () => {
    for (const path of ["/timer/pause", "/timer/resume"]) {
      expect((await call("POST", path, { headers: { ...admin, "x-test-usertype": "TEAM_MEMBER" }, body: {} })).status).toBe(403);
    }
  });
});
// [SCOPE 005 / T029] END
