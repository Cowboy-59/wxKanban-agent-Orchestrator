/**
 * SPEC-131 T016 — the pure half of the failure-path suite.
 *
 * These cover the decisions that can be made without a database or Stripe: the
 * access policy's new PAUSED branch, the deny-by-default posture it must not
 * break, both cancelled spellings, and the subscription-gate exemption that keeps
 * the repair surface reachable.
 *
 * The other half of T016 — the live endpoint checks — is
 * `tests/backend/scope131-endpoints.mjs`, because a green unit run plus a green
 * build has shipped fatal bugs on this project before.
 */
import { describe, it, expect } from "vitest";
import {
  evaluateAccess,
  isCancelledStatus,
  CANCELLED_STATUSES,
  UNRESTRICTED_STATUSES,
} from "../../src/shared/subscription-policy.js";

describe("SPEC-131 FR-007 — PAUSED is walled, with its own mode", () => {
  it("PAUSED is NOT on the allow list", () => {
    // The single most expensive mistake available here: a paused company that is
    // not being billed, using the product.
    expect(UNRESTRICTED_STATUSES.has("PAUSED")).toBe(false);
  });

  it("a PAUSED admin is blocked and routed to resume, not to a plan picker", () => {
    const r = evaluateAccess({
      subscriptionstatus: "PAUSED",
      activeflag: true,
      usertype: "ADMIN",
    });
    // 'pick-plan' here would invite a SECOND Stripe subscription against a
    // company that already has one.
    expect(r).toMatchObject({ allowed: false, mode: "resume-subscription" });
  });

  it("a PAUSED team member is blocked and told who can fix it", () => {
    const r = evaluateAccess({
      subscriptionstatus: "PAUSED",
      activeflag: true,
      usertype: "TEAM_MEMBER",
    });
    // Only an ADMIN can resume, so a resume button here would be a dead end.
    expect(r).toMatchObject({ allowed: false, mode: "contact-admin", status: "PAUSED" });
  });

  it("lower-case paused is normalized, not fallen through", () => {
    const r = evaluateAccess({ subscriptionstatus: "paused", usertype: "ADMIN" });
    expect(r.mode).toBe("resume-subscription");
  });

  it("a billing-exempt PAUSED company is still allowed", () => {
    // Exempt accounts never reach Stripe, so no billing state of theirs is
    // meaningful. This ordering predates SPEC-131 and must survive it.
    const r = evaluateAccess({
      subscriptionstatus: "PAUSED",
      billingexempt: true,
      usertype: "ADMIN",
    });
    expect(r).toMatchObject({ allowed: true, mode: "ok" });
  });

  it("a SYSADMIN is never locked out by PAUSED", () => {
    const r = evaluateAccess({ subscriptionstatus: "PAUSED", usertype: "SYSADMIN" });
    expect(r).toMatchObject({ allowed: true, mode: "ok" });
  });
});

describe("SPEC-131 — deny-by-default survives the PAUSED addition", () => {
  it("an unknown status still blocks", () => {
    const r = evaluateAccess({
      subscriptionstatus: "SOMETHING_NOBODY_HAS_HEARD_OF",
      activeflag: true,
      usertype: "ADMIN",
    });
    expect(r.allowed).toBe(false);
    expect(r.mode).toBe("pick-plan");
  });

  it("an empty status still blocks", () => {
    expect(evaluateAccess({ subscriptionstatus: "", usertype: "ADMIN" }).allowed).toBe(false);
    expect(evaluateAccess({ usertype: "ADMIN" }).allowed).toBe(false);
  });

  it("activeflag false outranks PAUSED — an operator suspension still wins", () => {
    const r = evaluateAccess({
      subscriptionstatus: "PAUSED",
      activeflag: false,
      usertype: "ADMIN",
    });
    expect(r.allowed).toBe(false);
  });
});

describe("SPEC-131 FR-005 — both cancelled spellings", () => {
  it("accepts CANCELED and CANCELLED", () => {
    // Production rows carry one L; the UI and deleteCompany() write two.
    // SCOPE-067 FR-002 undertook to standardize this and did not.
    expect(isCancelledStatus("CANCELED")).toBe(true);
    expect(isCancelledStatus("CANCELLED")).toBe(true);
    expect(CANCELLED_STATUSES.size).toBe(2);
  });

  it("is case-insensitive and null-safe", () => {
    expect(isCancelledStatus("canceled")).toBe(true);
    expect(isCancelledStatus("Cancelled")).toBe(true);
    expect(isCancelledStatus(null)).toBe(false);
    expect(isCancelledStatus(undefined)).toBe(false);
    expect(isCancelledStatus("")).toBe(false);
  });

  it("does not treat PAUSED or ACTIVE as cancelled", () => {
    // A false positive here would put a live company into SPEC-132's archival
    // queue, so it is worth asserting rather than assuming.
    expect(isCancelledStatus("PAUSED")).toBe(false);
    expect(isCancelledStatus("ACTIVE")).toBe(false);
    expect(isCancelledStatus("PENDING_INACTIVE")).toBe(false);
  });

  it("neither spelling is on the allow list", () => {
    for (const s of CANCELLED_STATUSES) {
      expect(evaluateAccess({ subscriptionstatus: s, usertype: "ADMIN" }).allowed).toBe(false);
    }
  });
});

describe("SPEC-131 FR-008 — the repair surface stays reachable", () => {
  // Mirrors `isExempt` in src/server/middleware/requireActiveSubscription.ts.
  // Duplicated rather than imported because that module opens a database pool at
  // import time; the rule under test is three lines and the duplication is
  // visible, whereas a DB connection inside a unit test is not.
  const EXEMPT_PREFIXES = [
    "/api/auth",
    "/api/payment",
    "/api/health",
    "/api/webhooks",
    "/api/company/subscription",
  ];
  const isExempt = (path: string): boolean =>
    EXEMPT_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));

  it("all four mutating lifecycle routes are exempt from the gate", () => {
    // Without this, a PAUSED company's admin is walled away from the one action
    // that unwalls them.
    expect(isExempt("/api/company/subscription")).toBe(true);
    expect(isExempt("/api/company/subscription/resume")).toBe(true);
    expect(isExempt("/api/company/subscription/pause")).toBe(true);
    expect(isExempt("/api/company/subscription/unpause")).toBe(true);
  });

  it("the exemption does not leak to the rest of /api/company", () => {
    // A prefix typo here would exempt the whole company API from the gate.
    expect(isExempt("/api/company")).toBe(false);
    expect(isExempt("/api/company/users")).toBe(false);
    expect(isExempt("/api/company/dashboard")).toBe(false);
    expect(isExempt("/api/company/subscriptionz")).toBe(false);
  });

  it("the pre-existing exemptions are unchanged", () => {
    expect(isExempt("/api/auth/login")).toBe(true);
    expect(isExempt("/api/payment/subscription")).toBe(true);
    expect(isExempt("/api/projects")).toBe(false);
  });
});
