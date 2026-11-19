/**
 * SPEC-119 / T015 — the access rule and payload validation.
 *
 * Two of this spec's success metrics are security properties, and a rule that is
 * only ever read is a rule nobody knows is broken. `decideAccess` is FR-007 as a
 * pure function precisely so it can be proven here without a database.
 *
 * Covers tests/tests.md: S1–S8 (isolation), S6 (Admin write boundary),
 * S9 conceptually (the link confers nothing — there is no branch that consults
 * clientcompanyid at all), U1–U6 (validation).
 */

import { describe, it, expect } from "vitest";
import {
  decideAccess,
  validateCustomerBody,
} from "../../src/server/lib/customerAccess.js";

const COMPANY = "11111111-1111-1111-1111-111111111111";
const OTHER_COMPANY = "22222222-2222-2222-2222-222222222222";
const OWNER = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const OTHER_CONSULTANT = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const row = { consultantid: OWNER, companyid: COMPANY };

const owner = { userid: OWNER, companyid: COMPANY, usertype: "TEAM" };
const colleague = { userid: OTHER_CONSULTANT, companyid: COMPANY, usertype: "TEAM" };
const admin = { userid: OTHER_CONSULTANT, companyid: COMPANY, usertype: "ADMIN" };
const sysadmin = { userid: OTHER_CONSULTANT, companyid: COMPANY, usertype: "SYSADMIN" };
const outsider = { userid: OTHER_CONSULTANT, companyid: OTHER_COMPANY, usertype: "ADMIN" };

describe("SPEC-119 FR-007 — decideAccess", () => {
  describe("the owner", () => {
    it("reads their own customer", () => {
      expect(decideAccess(row, owner, "read")).toBe(true);
    });

    it("writes their own customer", () => {
      expect(decideAccess(row, owner, "write")).toBe(true);
    });
  });

  describe("another consultant in the same company (S1–S4)", () => {
    it("cannot read", () => {
      expect(decideAccess(row, colleague, "read")).toBe(false);
    });

    it("cannot write", () => {
      expect(decideAccess(row, colleague, "write")).toBe(false);
    });
  });

  describe("Company Admin (S5, S6)", () => {
    it("CAN read any customer in their company", () => {
      expect(decideAccess(row, admin, "read")).toBe(true);
      expect(decideAccess(row, sysadmin, "read")).toBe(true);
    });

    it("CANNOT write customer detail — this is the boundary FR-007 draws", () => {
      expect(decideAccess(row, admin, "write")).toBe(false);
      expect(decideAccess(row, sysadmin, "write")).toBe(false);
    });
  });

  describe("the tenant boundary (S7)", () => {
    it("refuses an Admin from another company, for read and write alike", () => {
      expect(decideAccess(row, outsider, "read")).toBe(false);
      expect(decideAccess(row, outsider, "write")).toBe(false);
    });

    it("refuses a caller with no company at all", () => {
      expect(decideAccess(row, { userid: OWNER }, "read")).toBe(false);
      expect(decideAccess(row, { userid: OWNER }, "write")).toBe(false);
    });

    it("checks the company BEFORE ownership, so a matching userid across companies is still refused", () => {
      const crossTenant = { userid: OWNER, companyid: OTHER_COMPANY, usertype: "TEAM" };
      expect(decideAccess(row, crossTenant, "read")).toBe(false);
      expect(decideAccess(row, crossTenant, "write")).toBe(false);
    });
  });

  describe("missing rows", () => {
    it("treats a missing customer as inaccessible rather than throwing — so the route returns 404, never 500", () => {
      expect(decideAccess(null, owner, "read")).toBe(false);
      expect(decideAccess(undefined, owner, "write")).toBe(false);
    });

    it("refuses when the caller has no userid, even for a row that exists", () => {
      expect(decideAccess(row, { companyid: COMPANY, usertype: "ADMIN" }, "write")).toBe(false);
    });
  });

  describe("S9 — the tenant link confers nothing", () => {
    it("does not consult clientcompanyid at all: two identical rows decide identically", () => {
      const linked = { ...row, clientcompanyid: OTHER_COMPANY };
      const unlinked = { ...row, clientcompanyid: null };
      for (const mode of ["read", "write"] as const) {
        expect(decideAccess(linked, owner, mode)).toBe(decideAccess(unlinked, owner, mode));
        expect(decideAccess(linked, colleague, mode)).toBe(decideAccess(unlinked, colleague, mode));
        expect(decideAccess(linked, admin, mode)).toBe(decideAccess(unlinked, admin, mode));
      }
    });

    it("a linked customer grants its owner no access to a record in the linked company", () => {
      // The consultant owns a customer linked to OTHER_COMPANY. That must not let
      // them reach a row belonging to OTHER_COMPANY.
      const rowInLinkedCompany = { consultantid: OWNER, companyid: OTHER_COMPANY };
      expect(decideAccess(rowInLinkedCompany, owner, "read")).toBe(false);
    });
  });
});

describe("SPEC-119 FR-001 — validateCustomerBody", () => {
  it("U1 — rejects a missing name on create", () => {
    const r = validateCustomerBody({}, true);
    expect(r.ok).toBe(false);
  });

  it("U1 — rejects a whitespace-only name", () => {
    const r = validateCustomerBody({ name: "   " }, true);
    expect(r.ok).toBe(false);
  });

  it("U1 — trims the name it accepts", () => {
    const r = validateCustomerBody({ name: "  Meridian Group  " }, true);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.name).toBe("Meridian Group");
  });

  it("allows an absent name on update", () => {
    const r = validateCustomerBody({ company: "Meridian" }, false);
    expect(r.ok).toBe(true);
  });

  it("U2 — rejects a malformed email", () => {
    expect(validateCustomerBody({ name: "X", email: "not-an-email" }, true).ok).toBe(false);
    expect(validateCustomerBody({ name: "X", email: "a@b" }, true).ok).toBe(false);
  });

  it("U2 — accepts a valid email, and accepts its absence", () => {
    expect(validateCustomerBody({ name: "X", email: "billing@meridian.co.uk" }, true).ok).toBe(true);
    expect(validateCustomerBody({ name: "X" }, true).ok).toBe(true);
  });

  it("U2 — treats empty string as an explicit clear, not a validation failure", () => {
    const r = validateCustomerBody({ name: "X", email: "" }, true);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.email).toBeNull();
  });

  it("rejects a non-string in a text field rather than coercing it", () => {
    const r = validateCustomerBody({ name: "X", phone: 12345 }, true);
    expect(r.ok).toBe(false);
  });

  it("U6 — never emits consultantid or companyid, however they are supplied", () => {
    const r = validateCustomerBody(
      {
        name: "X",
        // These are not part of CustomerBody; the point is that even when a caller
        // sends them, nothing in the validated output carries them through to the
        // insert. Ownership comes from the auth context alone.
        consultantid: "attacker",
        companyid: "attacker",
        id: "attacker",
      } as Record<string, unknown>,
      true,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).not.toHaveProperty("consultantid");
      expect(r.value).not.toHaveProperty("companyid");
      expect(r.value).not.toHaveProperty("id");
    }
  });

  it("does not emit clientcompanyid — the link has its own endpoints (S6e)", () => {
    const r = validateCustomerBody(
      { name: "X", clientcompanyid: OTHER_COMPANY } as Record<string, unknown>,
      true,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).not.toHaveProperty("clientcompanyid");
  });
});
