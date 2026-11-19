import { describe, expect, it } from "vitest";
import {
  resolveApplyPolicy,
  resolveAnalysisPolicy,
} from "../../_wxAI/skills/wxDBAnalyze/scripts/core/policy.js";

describe("resolveApplyPolicy", () => {
  it("defaults to approve-each when no policy file exists", () => {
    expect(resolveApplyPolicy(undefined)).toEqual({
      mode: "approve-each",
      source: "default (no .wxai/db-policy.json)",
    });
  });

  it.each(["manual", "approve-each", "auto-additive"] as const)(
    "accepts the %s mode",
    (mode) => {
      expect(resolveApplyPolicy({ apply: { mode } }).mode).toBe(mode);
    },
  );

  it("throws on an unknown mode rather than falling back", () => {
    expect(() => resolveApplyPolicy({ apply: { mode: "yolo" } })).toThrow(/yolo/);
  });

  it("throws when apply.mode is missing from a present policy file", () => {
    expect(() => resolveApplyPolicy({ apply: {} })).toThrow(/apply\.mode/);
  });

  it("reports the file as the source when one was read", () => {
    expect(resolveApplyPolicy({ apply: { mode: "manual" } }).source).toMatch(
      /db-policy\.json/,
    );
  });
});

// [SCOPE 111 / T046] BEGIN — Analysis policy: intentionally-null columns
describe("resolveAnalysisPolicy", () => {
  const entry = {
    column: "testplanitems.forcetest",
    reason: "null = inherit the plan flag (FR-030)",
  };

  it("declares nothing when there is no policy file", () => {
    expect(resolveAnalysisPolicy(undefined).intentionalNullColumns.size).toBe(0);
  });

  it("declares nothing when the file omits the analysis block", () => {
    const policy = resolveAnalysisPolicy({ apply: { mode: "manual" } });
    expect(policy.intentionalNullColumns.size).toBe(0);
    expect(policy.source).toMatch(/db-policy\.json/);
  });

  it("maps a declared column to its reason, case-insensitively", () => {
    const policy = resolveAnalysisPolicy({
      analysis: { intentionalNullColumns: [{ ...entry, column: "TestPlanItems.ForceTest" }] },
    });
    expect(policy.intentionalNullColumns.get("testplanitems.forcetest")).toBe(entry.reason);
  });

  it("throws when the list is not an array rather than ignoring it", () => {
    expect(() =>
      resolveAnalysisPolicy({ analysis: { intentionalNullColumns: "forcetest" } }),
    ).toThrow(/not an array/);
  });

  it("rejects a column that is not table-qualified", () => {
    // "forcetest" alone would silently match nothing, which reads in the report
    // exactly like a declaration that worked.
    expect(() =>
      resolveAnalysisPolicy({
        analysis: { intentionalNullColumns: [{ column: "forcetest", reason: "x" }] },
      }),
    ).toThrow(/table\.column/);
  });

  it("rejects a declaration with no reason", () => {
    // The reason is the whole control: an unexplained suppression is
    // indistinguishable from a forgotten bug.
    expect(() =>
      resolveAnalysisPolicy({
        analysis: { intentionalNullColumns: [{ column: "a.b", reason: "  " }] },
      }),
    ).toThrow(/reason/);
  });
});
// [SCOPE 111 / T046] END
