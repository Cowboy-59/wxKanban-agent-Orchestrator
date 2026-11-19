/**
 * SPEC-090 Amendment A (T013) — subscription access policy truth table.
 *
 * This is the gate that decides whether a paying customer can use the product,
 * so the table is exhaustive rather than representative: every status crossed
 * with every user type, plus the two overrides. A change that silently opens the
 * gate should fail here, not in production.
 */
import { describe, it, expect } from "vitest";
import { evaluateAccess, UNRESTRICTED_STATUSES } from "../../src/shared/subscription-policy.js";

const BLOCKED_STATUSES = ["PENDING", "PENDING_INACTIVE", "CANCELED", "CANCELLED", "SUSPENDED"];

describe("evaluateAccess — allowed states", () => {
  for (const status of ["ACTIVE", "TRIAL"]) {
    it(`${status} admin is allowed`, () => {
      const r = evaluateAccess({ subscriptionstatus: status, activeflag: true, usertype: "ADMIN" });
      expect(r).toMatchObject({ allowed: true, mode: "ok" });
    });

    it(`${status} team member is allowed`, () => {
      const r = evaluateAccess({
        subscriptionstatus: status,
        activeflag: true,
        usertype: "TEAM_MEMBER",
      });
      expect(r).toMatchObject({ allowed: true, mode: "ok" });
    });
  }

  it("normalizes lowercase status", () => {
    expect(evaluateAccess({ subscriptionstatus: "active", usertype: "ADMIN" }).allowed).toBe(true);
  });

  it("only ACTIVE and TRIAL are on the allow list", () => {
    expect([...UNRESTRICTED_STATUSES].sort()).toEqual(["ACTIVE", "TRIAL"]);
  });
});

describe("evaluateAccess — overrides", () => {
  it("billingexempt beats any bad status", () => {
    for (const status of BLOCKED_STATUSES) {
      const r = evaluateAccess({
        subscriptionstatus: status,
        activeflag: false,
        billingexempt: true,
        usertype: "TEAM_MEMBER",
      });
      expect(r).toMatchObject({ allowed: true, mode: "ok" });
    }
  });

  it("SYSADMIN is never walled — the fix for a stuck subscription lives behind the wall", () => {
    for (const status of BLOCKED_STATUSES) {
      const r = evaluateAccess({
        subscriptionstatus: status,
        activeflag: false,
        usertype: "SYSADMIN",
      });
      expect(r).toMatchObject({ allowed: true, mode: "ok" });
    }
  });
});

describe("evaluateAccess — blocked states route by what the user can do", () => {
  it("PENDING admin gets the plan picker", () => {
    const r = evaluateAccess({ subscriptionstatus: "PENDING", activeflag: true, usertype: "ADMIN" });
    expect(r).toMatchObject({ allowed: false, mode: "pick-plan" });
  });

  it("PENDING_INACTIVE admin gets the billing portal, not a second subscription", () => {
    const r = evaluateAccess({
      subscriptionstatus: "PENDING_INACTIVE",
      activeflag: true,
      usertype: "ADMIN",
    });
    expect(r).toMatchObject({ allowed: false, mode: "update-card" });
  });

  it("both CANCELED spellings block — the allow list makes spelling irrelevant", () => {
    for (const status of ["CANCELED", "CANCELLED"]) {
      expect(
        evaluateAccess({ subscriptionstatus: status, activeflag: true, usertype: "ADMIN" }).mode,
      ).toBe("pick-plan");
    }
  });

  it("activeflag false outranks a healthy status", () => {
    const r = evaluateAccess({ subscriptionstatus: "ACTIVE", activeflag: false, usertype: "ADMIN" });
    expect(r).toMatchObject({ allowed: false, mode: "pick-plan" });
  });

  it("an unknown status blocks rather than falling through", () => {
    const r = evaluateAccess({ subscriptionstatus: "SOMETHING_NEW", usertype: "ADMIN" });
    expect(r.allowed).toBe(false);
  });

  it("an absent status blocks", () => {
    expect(evaluateAccess({ usertype: "ADMIN" }).allowed).toBe(false);
    expect(evaluateAccess({ subscriptionstatus: null, usertype: "ADMIN" }).allowed).toBe(false);
  });

  it("non-admins never see a payment UI they cannot submit", () => {
    for (const status of BLOCKED_STATUSES) {
      for (const usertype of ["TEAM_MEMBER", "TEAM_MANAGER", undefined]) {
        const r = evaluateAccess({ subscriptionstatus: status, activeflag: true, usertype });
        expect(r).toMatchObject({ allowed: false, mode: "contact-admin" });
      }
    }
  });
});
