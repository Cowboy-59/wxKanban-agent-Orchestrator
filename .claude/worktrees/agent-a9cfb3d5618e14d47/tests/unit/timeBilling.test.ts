// SPEC-005 / T003 — Time and Billing rounding, rates and money. Pure functions; no database.
import { describe, it, expect } from "vitest";
import {
  roundUpToQuarterHour,
  roundSecondsUpToQuarterHour,
  minutesToHours,
  resolveRates,
  normalizeRate,
  rateToCents,
  amountCents,
  centsToAmount,
} from "../../src/server/lib/timeBilling.js";

// [SCOPE 005 / T003] BEGIN — unit tests for timeBilling helpers
describe("roundUpToQuarterHour (FR-005)", () => {
  it("rounds 0:07 up to 0.25 hrs and 1:38 up to 1.75 hrs", () => {
    expect(roundUpToQuarterHour(7)).toBe(15);
    expect(minutesToHours(roundUpToQuarterHour(7))).toBe("0.25");
    expect(roundUpToQuarterHour(98)).toBe(105);
    expect(minutesToHours(roundUpToQuarterHour(98))).toBe("1.75");
  });

  it("keeps exact quarter hours and zero", () => {
    expect(roundUpToQuarterHour(0)).toBe(0);
    expect(roundUpToQuarterHour(15)).toBe(15);
    expect(roundUpToQuarterHour(60)).toBe(60);
    expect(roundUpToQuarterHour(1)).toBe(15);
  });

  it("rounds a negative correction away from zero (FR-011)", () => {
    expect(roundUpToQuarterHour(-60)).toBe(-60);
    expect(roundUpToQuarterHour(-7)).toBe(-15);
  });

  it("rejects non-finite input", () => {
    expect(() => roundUpToQuarterHour(Number.NaN)).toThrow(RangeError);
    expect(() => roundUpToQuarterHour(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

describe("roundSecondsUpToQuarterHour (FR-007)", () => {
  it("rounds the day's sum once: 40 runs totalling 1 h 32 m give 1.75 hrs, not 40 × 0.25", () => {
    const runs = Array.from({ length: 40 }, () => 138); // 2 m 18 s each
    const total = runs.reduce((a, b) => a + b, 0);
    expect(total).toBe(5520);
    expect(roundSecondsUpToQuarterHour(total)).toBe(105);
    expect(minutesToHours(roundSecondsUpToQuarterHour(total))).toBe("1.75");
  });

  it("handles boundaries", () => {
    expect(roundSecondsUpToQuarterHour(0)).toBe(0);
    expect(roundSecondsUpToQuarterHour(1)).toBe(15);
    expect(roundSecondsUpToQuarterHour(900)).toBe(15);
    expect(roundSecondsUpToQuarterHour(901)).toBe(30);
  });

  it("rejects negative seconds", () => {
    expect(() => roundSecondsUpToQuarterHour(-1)).toThrow(RangeError);
  });
});

describe("resolveRates (FR-008)", () => {
  const none = { hourlyrate: null, resourcerate: null };

  it("a new company starts with Developer 150.00 and Resource 50.00", () => {
    expect(resolveRates(none, null)).toEqual({ developer: "150.00", resource: "50.00" });
  });

  it("uses the company rates when the project has no override", () => {
    expect(resolveRates({ hourlyrate: "120", resourcerate: "40.5" }, none)).toEqual({
      developer: "120.00",
      resource: "40.50",
    });
  });

  it("a project override wins over the company default, per rate", () => {
    expect(
      resolveRates({ hourlyrate: "150.00", resourcerate: "50.00" }, { hourlyrate: "175.00", resourcerate: null }),
    ).toEqual({ developer: "175.00", resource: "50.00" });
    expect(
      resolveRates({ hourlyrate: "150.00", resourcerate: "50.00" }, { hourlyrate: null, resourcerate: "60.00" }),
    ).toEqual({ developer: "150.00", resource: "60.00" });
  });

  it("treats a blank rate as unset", () => {
    expect(resolveRates({ hourlyrate: " ", resourcerate: "" }, null)).toEqual({
      developer: "150.00",
      resource: "50.00",
    });
  });
});

describe("money (FR-009)", () => {
  it("parses and normalizes rates", () => {
    expect(rateToCents("150.00")).toBe(15000);
    expect(rateToCents("150")).toBe(15000);
    expect(rateToCents("0.5")).toBe(50);
    expect(normalizeRate("75.5")).toBe("75.50");
    expect(() => rateToCents("-1")).toThrow(RangeError);
    expect(() => rateToCents("12.345")).toThrow(RangeError);
    expect(() => rateToCents("abc")).toThrow(RangeError);
  });

  it("amount = hours × rate, in cents", () => {
    expect(amountCents(105, "150.00")).toBe(26250); // 1.75 × 150 = 262.50
    expect(amountCents(15, "50.00")).toBe(1250); // 0.25 × 50 = 12.50
    expect(amountCents(-60, "150.00")).toBe(-15000); // −1.00 hr correction
    expect(amountCents(15, "33.33")).toBe(833); // 8.3325 → 8.33
  });

  it("formats cents", () => {
    expect(centsToAmount(26250)).toBe("262.50");
    expect(centsToAmount(-15000)).toBe("-150.00");
    expect(centsToAmount(0)).toBe("0.00");
  });

  it("the total equals the sum of the rounded rows", () => {
    const rows = [amountCents(105, "150.00"), amountCents(15, "33.33"), amountCents(-60, "150.00")];
    expect(centsToAmount(rows.reduce((a, b) => a + b, 0))).toBe("120.83");
  });
});
// [SCOPE 005 / T003] END
