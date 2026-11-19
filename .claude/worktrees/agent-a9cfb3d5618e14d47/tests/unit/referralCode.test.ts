/**
 * referralCode — unit tests for SCOPE-088 / T007
 *
 * Covers the referral-code generator's format (FR-006, SM-001) and the
 * uniqueness/collision-retry behavior of generateUniqueReferralCode. db is
 * mocked so these are pure unit tests with no live database.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Queue of results returned by successive db.select()…limit(1) calls.
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
  },
}));

vi.mock("../../src/db/schema/company", () => ({
  companies: { id: "id", referralcode: "referralcode" },
}));

import {
  generateReferralCode,
  generateUniqueReferralCode,
} from "../../src/server/lib/referralCode";

const AMBIGUOUS = /[01OIL]/;
const ALLOWED = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]+$/;

describe("generateReferralCode — format (FR-006)", () => {
  it("produces a code of the requested length", () => {
    expect(generateReferralCode(8)).toHaveLength(8);
    expect(generateReferralCode(6)).toHaveLength(6);
  });

  it("defaults to an 8-character code", () => {
    expect(generateReferralCode()).toHaveLength(8);
  });

  it("uses only allowed uppercase alphanumerics and never ambiguous characters", () => {
    for (let i = 0; i < 200; i += 1) {
      const code = generateReferralCode();
      expect(code).toMatch(ALLOWED);
      expect(code).not.toMatch(AMBIGUOUS);
    }
  });
});

describe("generateUniqueReferralCode — uniqueness (SM-001)", () => {
  beforeEach(() => {
    selectResults = [];
  });

  it("returns a well-formed code when the first candidate is free", async () => {
    selectResults = [[]]; // no existing row → unique
    const code = await generateUniqueReferralCode();
    expect(code).toMatch(ALLOWED);
    expect(code).toHaveLength(8);
  });

  it("retries on collision and returns the first free candidate", async () => {
    // First candidate collides (row exists), second is free.
    selectResults = [[{ id: "existing" }], []];
    const code = await generateUniqueReferralCode();
    expect(code).toMatch(ALLOWED);
  });

  it("throws after exhausting the retry budget", async () => {
    // Every lookup returns a collision.
    selectResults = Array.from({ length: 3 }, () => [{ id: "existing" }]);
    await expect(generateUniqueReferralCode(3)).rejects.toThrow(/unique referral code/i);
  });
});
