import { describe, expect, it } from "vitest";
import {
  UNKNOWN,
  describeMeasured,
  isKnown,
  type Measured,
} from "../../_wxAI/skills/wxDBAnalyze/scripts/core/metrics.js";

describe("Measured", () => {
  it("treats a real zero as known", () => {
    const v: Measured<number> = 0;
    expect(isKnown(v)).toBe(true);
  });

  it("treats UNKNOWN as not known", () => {
    expect(isKnown(UNKNOWN)).toBe(false);
  });

  it("renders a known value with its unit", () => {
    expect(describeMeasured(1234, (n) => `${n} rows`)).toBe("1234 rows");
  });

  it("renders unknown as an explicit statement, never as a number", () => {
    const text = describeMeasured(UNKNOWN, (n) => `${n} rows`);
    expect(text).toMatch(/unknown/i);
    expect(text).not.toMatch(/\d/);
  });

  it("never renders unknown as zero", () => {
    expect(describeMeasured(UNKNOWN, (n) => `${n} rows`)).not.toContain("0");
  });
});
