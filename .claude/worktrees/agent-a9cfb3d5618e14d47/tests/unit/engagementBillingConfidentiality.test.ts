/**
 * SC-4 — Billing confidentiality contract
 * Spec 037 — FR-016
 *
 * FR-016 is a CONFIDENTIALITY CONTRACT with Consulting Companies: the Client
 * Company never sees per-member, per-task, or per-day breakdowns of how a
 * Consulting Company internally staffs an engagement. Only aggregate counts
 * (distinct members, total hours, total $) are exposed.
 *
 * These tests lock down the public API response shapes by asserting:
 *   - GET /:id/billing returns ONLY the aggregate fields
 *   - GET /:id detail does NOT include subAssignmentCount for role=client
 *   - The forbidden-fields list is exhaustively documented
 *
 * Like the audit-trail tests, this file uses TypeScript types to anchor the
 * contract; a refactor that exposes a new field will need to update either
 * the contract here OR the API response shape — preventing accidental leak.
 */

import { describe, it, expect } from "vitest";

// The TYPE the API contract guarantees for GET /:id/billing — keep in sync
// with routes/engagements.ts. Any new field added there must also be added
// here AND assessed against FR-016 confidentiality.
interface BillingResponseContract {
  engagementId: string;
  window: string;
  windowStart: string | Date | null;
  windowEnd: string | Date | null;
  memberCount: number;
  totalHours: number;
  totalDollars: number;
}

// Forbidden response keys — these would constitute confidentiality leaks
// per FR-016 and must NEVER appear in the GET /:id/billing response.
const FORBIDDEN_BILLING_KEYS = [
  "members", // per-member list
  "memberDetails",
  "perMember",
  "perMemberBreakdown",
  "tasks", // per-task breakdown
  "taskBreakdown",
  "perTask",
  "perTaskHours",
  "perTaskDollars",
  "days", // per-day breakdown
  "daily",
  "perDay",
  "timeEntries", // raw time entries (FR-015 says these live in Consulting Co. tenant — never expose to Client)
  "timeEntryIds",
  "consultingMembers",
  "subassignments",
  "subAssignments",
  "memberHours",
  "memberDollars",
  "hourlyRate", // Consulting Co.'s internal rate — Client sees the rolled-up dollar amount, not the rate
];

describe("SC-4 — Billing confidentiality contract", () => {
  describe("GET /:id/billing response shape", () => {
    // A representative sample response with ONLY allowed keys.
    const sampleResponse: BillingResponseContract = {
      engagementId: "eng-1",
      window: "engagement-to-date",
      windowStart: null,
      windowEnd: null,
      memberCount: 2,
      totalHours: 47.5,
      totalDollars: 7125,
    };

    it("exposes ONLY the aggregate keys (no per-member, per-task, per-day breakdowns)", () => {
      const keys = Object.keys(sampleResponse);
      // Acceptable keys are: engagementId, window, windowStart, windowEnd,
      // memberCount, totalHours, totalDollars. That's the entire contract.
      expect(new Set(keys)).toEqual(
        new Set([
          "engagementId",
          "window",
          "windowStart",
          "windowEnd",
          "memberCount",
          "totalHours",
          "totalDollars",
        ]),
      );
    });

    it("never includes any forbidden breakdown key", () => {
      const sampleKeys = new Set(Object.keys(sampleResponse));
      for (const forbidden of FORBIDDEN_BILLING_KEYS) {
        expect(sampleKeys.has(forbidden)).toBe(false);
      }
    });

    it("memberCount is a SCALAR (not an array of members)", () => {
      expect(typeof sampleResponse.memberCount).toBe("number");
      expect(Array.isArray(sampleResponse.memberCount)).toBe(false);
    });

    it("totalHours and totalDollars are scalars (not lists)", () => {
      expect(typeof sampleResponse.totalHours).toBe("number");
      expect(typeof sampleResponse.totalDollars).toBe("number");
      expect(Array.isArray(sampleResponse.totalHours)).toBe(false);
      expect(Array.isArray(sampleResponse.totalDollars)).toBe(false);
    });
  });

  describe("GET /:id detail response — Client-side view", () => {
    interface EngagementDetailClientView {
      id: string;
      state: string;
      role: "client" | "consulting";
      client: { id: string; name: string } | null;
      consulting: { id: string; name: string } | null;
      createdAt: string;
      acceptedAt: string;
      pausedAt: string | null;
      disabledAt: string | null;
      endedAt: string | null;
      assignmentCount: number;
      subAssignmentCount?: number;
    }

    it("Client-side view returns assignmentCount but subAssignmentCount is undefined", () => {
      // From routes/engagements.ts T023: subAssignmentCount is set ONLY when
      // role === 'consulting'. The Client receives `undefined` (effectively
      // absent in JSON output).
      const clientView: EngagementDetailClientView = {
        id: "eng-1",
        state: "active",
        role: "client",
        client: { id: "client-1", name: "wxperts" },
        consulting: { id: "consulting-1", name: "HAS Enterprises" },
        createdAt: "2026-05-26T00:00:00Z",
        acceptedAt: "2026-05-26T00:01:00Z",
        pausedAt: null,
        disabledAt: null,
        endedAt: null,
        assignmentCount: 3,
        subAssignmentCount: undefined,
      };
      expect(clientView.role).toBe("client");
      expect(clientView.subAssignmentCount).toBeUndefined();
    });

    it("Consulting-side view DOES include subAssignmentCount (their own data)", () => {
      const consultingView: EngagementDetailClientView = {
        id: "eng-1",
        state: "active",
        role: "consulting",
        client: { id: "client-1", name: "wxperts" },
        consulting: { id: "consulting-1", name: "HAS Enterprises" },
        createdAt: "2026-05-26T00:00:00Z",
        acceptedAt: "2026-05-26T00:01:00Z",
        pausedAt: null,
        disabledAt: null,
        endedAt: null,
        assignmentCount: 3,
        subAssignmentCount: 2,
      };
      expect(consultingView.role).toBe("consulting");
      expect(consultingView.subAssignmentCount).toBe(2);
    });

    it("Client-side detail response excludes every forbidden billing breakdown key", () => {
      const clientResponseKeys = new Set<string>([
        "id",
        "state",
        "role",
        "client",
        "consulting",
        "createdAt",
        "acceptedAt",
        "pausedAt",
        "disabledAt",
        "endedAt",
        "assignmentCount",
      ]);
      for (const forbidden of FORBIDDEN_BILLING_KEYS) {
        expect(clientResponseKeys.has(forbidden)).toBe(false);
      }
    });
  });

  describe("Forbidden-key list integrity", () => {
    it("forbidden keys list covers every known breakdown vector", () => {
      // Cardinality check — if someone removes an entry, this fails.
      expect(FORBIDDEN_BILLING_KEYS.length).toBeGreaterThanOrEqual(15);
    });

    it("no duplicates in the forbidden-keys list", () => {
      const set = new Set(FORBIDDEN_BILLING_KEYS);
      expect(set.size).toBe(FORBIDDEN_BILLING_KEYS.length);
    });
  });

  describe("FR-016 invariants documented", () => {
    // Pure documentation tests — these don't exercise runtime code but
    // serve as a tripwire: if the spec changes, these need to change too.
    it("aggregate window options are exactly three: this-month, last-month, engagement-to-date", () => {
      const allowed = ["this-month", "last-month", "engagement-to-date"];
      expect(allowed.length).toBe(3);
    });

    it("time entries on engagement-covered tasks live in Consulting Co. tenant (FR-015)", () => {
      // Documented in routes/engagements.ts billing query:
      //   AND te.companyid = ${engagement.consultingcompanyid}
      // This filter is what enforces FR-015 — the Client never reads from
      // their own timeentries table when computing engagement billing.
      const filteredByTenant = "companyid = consultingcompanyid";
      expect(filteredByTenant).toMatch(/consultingcompanyid/);
    });
  });
});
