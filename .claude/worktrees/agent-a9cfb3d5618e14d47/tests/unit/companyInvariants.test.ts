/**
 * CompanyInvariants — unit tests for FR-028 (at-least-one-ADMIN invariant)
 *
 * Uses vitest's vi.mock to stub db so these are pure unit tests without
 * needing a live database. Tests both countActiveAdmins and
 * assertCompanyHasAtLeastOneAdmin.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the db module before importing the SUT.
vi.mock("../../src/server/lib/db.js", () => {
  return { db: {} as unknown };
});

// Mock the schema index to avoid pulling in the whole Drizzle graph.
vi.mock("../../src/db/schema/index.js", () => {
  return {
    userprofiles: { id: "id", companyid: "companyid", usertype: "usertype", active: "active" },
  };
});

// Build a controllable mock of db.select().from().where()
let mockCount = 0;
vi.mock("../../src/server/lib/db.js", async () => {
  return {
    db: {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([{ count: mockCount }]),
        }),
      }),
    },
  };
});

import {
  InvariantViolationError,
  assertCompanyHasAtLeastOneAdmin,
  countActiveAdmins,
} from "../../src/server/services/CompanyInvariants";

describe("CompanyInvariants — FR-028 at-least-one-ADMIN", () => {
  beforeEach(() => {
    mockCount = 0;
  });

  describe("countActiveAdmins", () => {
    it("returns the count from the query", async () => {
      mockCount = 3;
      const n = await countActiveAdmins("company-id", "user-x");
      expect(n).toBe(3);
    });

    it("returns 0 when no admins remain", async () => {
      mockCount = 0;
      const n = await countActiveAdmins("company-id");
      expect(n).toBe(0);
    });
  });

  describe("assertCompanyHasAtLeastOneAdmin", () => {
    it("passes silently when other ADMINs remain", async () => {
      mockCount = 2;
      await expect(
        assertCompanyHasAtLeastOneAdmin("company-id", "leaving-user"),
      ).resolves.toBeUndefined();
    });

    it("throws InvariantViolationError when removing the user would leave zero ADMINs", async () => {
      mockCount = 0;
      await expect(
        assertCompanyHasAtLeastOneAdmin("company-id", "last-admin"),
      ).rejects.toBeInstanceOf(InvariantViolationError);
    });

    it("throws with code LAST_ADMIN_REMOVAL_DENIED", async () => {
      mockCount = 0;
      try {
        await assertCompanyHasAtLeastOneAdmin("c-id", "last");
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(InvariantViolationError);
        const e = err as InvariantViolationError;
        expect(e.code).toBe("LAST_ADMIN_REMOVAL_DENIED");
        expect(e.message).toMatch(/last active ADMIN/i);
      }
    });
  });

  describe("InvariantViolationError shape", () => {
    it("carries the code on the instance", () => {
      const e = new InvariantViolationError("X_CODE", "test");
      expect(e.code).toBe("X_CODE");
      expect(e.name).toBe("InvariantViolationError");
    });
  });
});
