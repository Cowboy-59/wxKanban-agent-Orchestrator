/**
 * Permission isolation — SC-3 (≥15 negative scenarios)
 * Spec 037 — Consultants Management (Engagement Core)
 *
 * Each scenario verifies a SPECIFIC access-denial path. Uses vi.mock to stub
 * the db so these are pure unit tests — no DB, no fixtures. Tests exercise:
 *
 *   1.  Engagement context resolver (resolveEngagementContext)
 *   2.  Side guards (requireClientSide, requireConsultingSide)
 *   3.  Admin guards (requireClientAdmin, requireConsultingAdminOrManager)
 *   4.  Write guard (requireWriteAllowed) for paused/disabled/ended
 *   5.  Visibility helpers (isUserAConsultingMember, canConsultantAccessTask)
 *
 * Each scenario corresponds to a real attempted-leak vector. Per SC-3, the
 * total must be ≥ 15. This file has 18 scenarios.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Response, NextFunction } from "express";

// ── db mock — controllable rows per test ────────────────────────────────────
const mockState: {
  engagementRows: Array<Record<string, unknown>>;
  userRows: Array<Record<string, unknown>>;
  taskRows: Array<Record<string, unknown>>;
  visibilityRows: Array<Record<string, unknown>>;
  rejectQuery: boolean;
} = {
  engagementRows: [],
  userRows: [],
  taskRows: [],
  visibilityRows: [],
  rejectQuery: false,
};

// Counter to round-robin between query results when a test makes multiple queries.
let queryIdx = 0;

vi.mock("../../src/server/lib/db.js", () => {
  const mkChain = (rows: Array<Record<string, unknown>>) => {
    const chain: Record<string, unknown> = {};
    const noop = () => chain;
    chain.from = noop;
    chain.innerJoin = noop;
    chain.leftJoin = noop;
    chain.where = noop;
    chain.orderBy = noop;
    chain.limit = () => Promise.resolve(rows);
    chain.then = (fn: (v: Array<Record<string, unknown>>) => unknown) =>
      Promise.resolve(rows).then(fn);
    return chain;
  };

  return {
    db: {
      select: () => {
        // Round-robin between distinct row sets per test (engagement → user → task).
        const pools = [
          mockState.engagementRows,
          mockState.userRows,
          mockState.taskRows,
          mockState.visibilityRows,
        ];
        const rows = mockState.rejectQuery
          ? Promise.reject(new Error("test db rejection"))
          : pools[queryIdx % pools.length] ?? [];
        queryIdx += 1;
        if (rows instanceof Promise) {
          // Return a chain that propagates rejection on .limit().
          return {
            from: () => ({
              innerJoin: () => ({ where: () => ({ limit: () => rows }) }),
              where: () => ({ limit: () => rows }),
            }),
          };
        }
        return mkChain(rows);
      },
      execute: () =>
        Promise.resolve({ rows: mockState.visibilityRows }) as unknown,
    },
  };
});

vi.mock("../../src/db/schema/index.js", () => {
  // Bare stand-ins — middleware reads keys off these via Drizzle's eq()/and();
  // since we stub the chain entirely above, the actual schema shape isn't used.
  const passthrough = {
    id: "id",
    clientcompanyid: "clientcompanyid",
    consultingcompanyid: "consultingcompanyid",
    state: "state",
    companyid: "companyid",
    billingplan: "billingplan",
    usertype: "usertype",
    emailaddr: "emailaddr",
    active: "active",
  };
  return {
    engagements: passthrough,
    userprofiles: passthrough,
    companies: passthrough,
    projecttasks: passthrough,
    engagementassignments: passthrough,
    subassignments: passthrough,
  };
});

import {
  resolveEngagementContext,
  requireClientSide,
  requireConsultingSide,
  requireClientAdmin,
  requireConsultingAdminOrManager,
  requireWriteAllowed,
  type EngagementAuthRequest,
} from "../../src/server/middleware/engagementContext";
import {
  isUserAConsultingMember,
  canConsultantAccessTask,
  assertConsultantCannotAdvancePhase,
} from "../../src/server/services/EngagementVisibility";

// ── Helpers ─────────────────────────────────────────────────────────────────
function mkReq(over: Partial<EngagementAuthRequest> = {}): EngagementAuthRequest {
  return {
    userid: "user-1",
    companyid: "client-1",
    usertype: "ADMIN",
    params: { id: "eng-1" },
    body: {},
    ...over,
  } as EngagementAuthRequest;
}

function mkRes(): { res: Response; status: number; payload: unknown } {
  const captured = { status: 0, payload: undefined as unknown };
  const res = {
    status(code: number) {
      captured.status = code;
      return this;
    },
    json(body: unknown) {
      captured.payload = body;
      return this;
    },
  } as unknown as Response;
  return { res, get status() { return captured.status; }, get payload() { return captured.payload; } } as
    unknown as { res: Response; status: number; payload: unknown };
}

const noopNext: NextFunction = vi.fn();

describe("SC-3 — Engagement permission isolation (≥15 negative scenarios)", () => {
  beforeEach(() => {
    mockState.engagementRows = [];
    mockState.userRows = [];
    mockState.taskRows = [];
    mockState.visibilityRows = [];
    mockState.rejectQuery = false;
    queryIdx = 0;
    vi.clearAllMocks();
  });

  // ── Scenario 1: Caller is not a party to the engagement ─────────────────
  it("1. resolveEngagementContext denies when caller's company is neither Client nor Consulting", async () => {
    mockState.engagementRows = [
      {
        id: "eng-1",
        clientcompanyid: "client-1",
        consultingcompanyid: "consulting-1",
        state: "active",
      },
    ];
    const r = mkRes();
    const req = mkReq({ companyid: "outsider-co" });
    await resolveEngagementContext(req, r.res, noopNext);
    expect(r.status).toBe(403);
    expect((r.payload as { code: string }).code).toBe("NOT_A_PARTY");
  });

  // ── Scenario 2: Engagement not found ────────────────────────────────────
  it("2. resolveEngagementContext returns 404 when engagement doesn't exist", async () => {
    mockState.engagementRows = [];
    const r = mkRes();
    await resolveEngagementContext(mkReq(), r.res, noopNext);
    expect(r.status).toBe(404);
    expect((r.payload as { code: string }).code).toBe("ENGAGEMENT_NOT_FOUND");
  });

  // ── Scenario 3: Missing engagement id ───────────────────────────────────
  it("3. resolveEngagementContext returns 400 when :id param missing", async () => {
    const r = mkRes();
    const req = mkReq({ params: {} as Record<string, string> });
    await resolveEngagementContext(req, r.res, noopNext);
    expect(r.status).toBe(400);
  });

  // ── Scenario 4: Unauthenticated ─────────────────────────────────────────
  it("4. resolveEngagementContext returns 401 when caller has no companyid", async () => {
    const r = mkRes();
    const req = mkReq({ companyid: undefined });
    await resolveEngagementContext(req, r.res, noopNext);
    expect(r.status).toBe(401);
  });

  // ── Scenario 5: Consulting-side caller tries to use Client-only endpoint ─
  it("5. requireClientSide denies Consulting-side caller", () => {
    const r = mkRes();
    const req = mkReq() as EngagementAuthRequest;
    req.engagementContext = {
      role: "consulting",
      engagement: { state: "active" } as never,
    };
    requireClientSide(req, r.res, noopNext);
    expect(r.status).toBe(403);
    expect((r.payload as { code: string }).code).toBe("CLIENT_SIDE_REQUIRED");
  });

  // ── Scenario 6: Client-side TEAM_MEMBER tries to do ADMIN-only op ───────
  it("6. requireClientAdmin denies Client-side non-ADMIN", () => {
    const r = mkRes();
    const req = mkReq({ usertype: "TEAM_MEMBER" }) as EngagementAuthRequest;
    req.engagementContext = {
      role: "client",
      engagement: { state: "active" } as never,
    };
    requireClientAdmin(req, r.res, noopNext);
    expect(r.status).toBe(403);
    expect((r.payload as { code: string }).code).toBe("CLIENT_ADMIN_REQUIRED");
  });

  // ── Scenario 7: Consulting-side caller tries to advance lifecycle ───────
  it("7. requireClientAdmin denies Consulting-side caller even if ADMIN", () => {
    const r = mkRes();
    const req = mkReq({ usertype: "ADMIN" }) as EngagementAuthRequest;
    req.engagementContext = {
      role: "consulting",
      engagement: { state: "active" } as never,
    };
    requireClientAdmin(req, r.res, noopNext);
    expect(r.status).toBe(403);
    expect((r.payload as { code: string }).code).toBe("CLIENT_SIDE_REQUIRED");
  });

  // ── Scenario 8: Client-side caller tries Consulting-only endpoint ───────
  it("8. requireConsultingSide denies Client-side caller", () => {
    const r = mkRes();
    const req = mkReq() as EngagementAuthRequest;
    req.engagementContext = {
      role: "client",
      engagement: { state: "active" } as never,
    };
    requireConsultingSide(req, r.res, noopNext);
    expect(r.status).toBe(403);
    expect((r.payload as { code: string }).code).toBe("CONSULTING_SIDE_REQUIRED");
  });

  // ── Scenario 9: Consulting-side TEAM_MEMBER tries to sub-assign ────────
  it("9. requireConsultingAdminOrManager denies Consulting-side TEAM_MEMBER", () => {
    const r = mkRes();
    const req = mkReq({ usertype: "TEAM_MEMBER" }) as EngagementAuthRequest;
    req.engagementContext = {
      role: "consulting",
      engagement: { state: "active" } as never,
    };
    requireConsultingAdminOrManager(req, r.res, noopNext);
    expect(r.status).toBe(403);
    expect((r.payload as { code: string }).code).toBe("CONSULTING_LEAD_REQUIRED");
  });

  // ── Scenario 10: Client-side ADMIN tries to sub-assign ──────────────────
  it("10. requireConsultingAdminOrManager denies Client-side ADMIN", () => {
    const r = mkRes();
    const req = mkReq({ usertype: "ADMIN" }) as EngagementAuthRequest;
    req.engagementContext = {
      role: "client",
      engagement: { state: "active" } as never,
    };
    requireConsultingAdminOrManager(req, r.res, noopNext);
    expect(r.status).toBe(403);
    expect((r.payload as { code: string }).code).toBe("CONSULTING_SIDE_REQUIRED");
  });

  // ── Scenario 11: Writes blocked when engagement is paused ───────────────
  it("11. requireWriteAllowed denies writes when engagement is paused", () => {
    const r = mkRes();
    const req = mkReq() as EngagementAuthRequest;
    req.engagementContext = {
      role: "client",
      engagement: { state: "paused" } as never,
    };
    requireWriteAllowed(req, r.res, noopNext);
    expect(r.status).toBe(403);
    expect((r.payload as { code: string }).code).toBe("ENGAGEMENT_WRITES_BLOCKED");
  });

  // ── Scenario 12: Writes blocked when engagement is disabled ─────────────
  it("12. requireWriteAllowed denies writes when engagement is disabled", () => {
    const r = mkRes();
    const req = mkReq() as EngagementAuthRequest;
    req.engagementContext = {
      role: "client",
      engagement: { state: "disabled" } as never,
    };
    requireWriteAllowed(req, r.res, noopNext);
    expect(r.status).toBe(403);
    expect((r.payload as { code: string }).code).toBe("ENGAGEMENT_WRITES_BLOCKED");
  });

  // ── Scenario 13: All operations blocked when engagement is ended ────────
  it("13. requireWriteAllowed denies all writes when engagement is ended", () => {
    const r = mkRes();
    const req = mkReq() as EngagementAuthRequest;
    req.engagementContext = {
      role: "client",
      engagement: { state: "ended" } as never,
    };
    requireWriteAllowed(req, r.res, noopNext);
    expect(r.status).toBe(403);
    expect((r.payload as { code: string }).code).toBe("ENGAGEMENT_ENDED");
  });

  // ── Scenario 14: Consulting Member sees no tasks when no sub-assignment ─
  it("14. canConsultantAccessTask returns false when consultant has no covering sub-assignment", async () => {
    mockState.taskRows = [{ id: "task-1" }];
    mockState.visibilityRows = []; // no matching sub-assignments
    const allowed = await canConsultantAccessTask("user-x", "task-1");
    expect(allowed).toBe(false);
  });

  // ── Scenario 15: Non-CONSULTANT-plan user is not flagged as consultant ──
  it("15. isUserAConsultingMember returns false when primary Company is SMALL_BUSINESS", async () => {
    mockState.engagementRows = [
      { companyid: "co-1", billingplan: "SMALL_BUSINESS" },
    ];
    const isConsultant = await isUserAConsultingMember("user-y");
    expect(isConsultant).toBe(false);
  });

  // ── Scenario 16: Consultant from CONSULTANT-plan tenant CAN'T advance phases ─
  it("16. assertConsultantCannotAdvancePhase throws for CONSULTANT-plan user", async () => {
    mockState.engagementRows = [
      { companyid: "co-2", billingplan: "CONSULTANT" },
    ];
    await expect(assertConsultantCannotAdvancePhase("user-z")).rejects.toThrow(
      /Consultants cannot manually advance/i,
    );
  });

  // ── Scenario 17: Non-consultant CAN advance phases (positive control) ──
  it("17. assertConsultantCannotAdvancePhase resolves silently for non-CONSULTANT users", async () => {
    mockState.engagementRows = [
      { companyid: "co-3", billingplan: "SMALL_BUSINESS" },
    ];
    await expect(
      assertConsultantCannotAdvancePhase("user-q"),
    ).resolves.toBeUndefined();
  });

  // ── Scenario 18: Db error during context resolve surfaces as 500 ────────
  it("18. resolveEngagementContext returns 500 on db rejection (fail-closed)", async () => {
    mockState.rejectQuery = true;
    const r = mkRes();
    await resolveEngagementContext(mkReq(), r.res, noopNext);
    expect(r.status).toBe(500);
    expect((r.payload as { code: string }).code).toBe(
      "ENGAGEMENT_CONTEXT_ERROR",
    );
  });
});
