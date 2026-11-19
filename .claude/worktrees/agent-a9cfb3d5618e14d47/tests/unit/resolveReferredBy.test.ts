/**
 * resolveReferredBy — unit tests for SCOPE-088 / T007 (FR-008, SM-002)
 *
 * A customer-entered referral code is uppercased + trimmed and validated against
 * existing distributor codes. A match returns the normalized code; an unknown or
 * empty code returns null (and must never throw — signup can't be blocked).
 * db and RegistrationService's other heavy deps are mocked.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

let selectResults: unknown[][] = [];

vi.mock("../../src/db/client.js", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(selectResults.shift() ?? []),
        }),
      }),
    }),
    insert: () => ({ values: () => ({ returning: () => Promise.resolve([{}]) }) }),
  },
}));

vi.mock("../../src/db/schema/company", () => ({
  companies: { id: "id", referralcode: "referralcode", distributor: "distributor" },
}));
vi.mock("../../src/db/schema/userprofiles", () => ({ userprofiles: {} }));
vi.mock("../../src/db/schema/companysubscription", () => ({ companysubscriptions: {} }));
vi.mock("../../src/server/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));
vi.mock("../../src/server/lib/stripe", () => ({ isStripeCcProcessingEnabled: () => false }));
vi.mock("../../src/server/lib/password", () => ({ hashPassword: async () => "hash" }));
vi.mock("../../src/server/lib/passwordValidator", () => ({
  validateEmail: () => true,
  validatePassword: () => ({ isValid: true, errors: [] }),
}));
vi.mock("../../src/server/lib/referralCode", () => ({
  generateUniqueReferralCode: async () => "TESTCODE",
}));

import { resolveReferredBy } from "../../src/server/services/RegistrationService";

describe("resolveReferredBy — referral attribution (FR-008)", () => {
  beforeEach(() => {
    selectResults = [];
  });

  it("returns null for an empty / undefined code without hitting the DB", async () => {
    await expect(resolveReferredBy(undefined)).resolves.toBeNull();
    await expect(resolveReferredBy("")).resolves.toBeNull();
    await expect(resolveReferredBy("   ")).resolves.toBeNull();
  });

  it("uppercases + trims and returns the normalized code on a distributor match", async () => {
    selectResults = [[{ referralcode: "WX7K2Q" }]];
    await expect(resolveReferredBy("  wx7k2q  ")).resolves.toBe("WX7K2Q");
  });

  it("returns null (never throws) for an unknown code", async () => {
    selectResults = [[]]; // no distributor owns this code
    await expect(resolveReferredBy("ZZZZZZ")).resolves.toBeNull();
  });
});
