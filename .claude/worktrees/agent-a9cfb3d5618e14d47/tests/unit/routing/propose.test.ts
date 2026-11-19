// SPEC-143 C6 / FR-013: proposals need n >= 5, lower cost, and pass rate no more than 5 points worse.
import { describe, expect, it } from "vitest";

import { buildProposals } from "../../../_wxAI/routing/propose.mjs";
import { comparisons } from "./fixtures";

describe("buildProposals", () => {
  it("proposes when 5 comparisons show lower cost and equal quality", () => {
    const p = buildProposals(comparisons(5, () => true, () => true));
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ class: "easy", from: "claude-sonnet-5-5", to: "claude-haiku-5-5", comparisons: 5, flagged: false });
    expect(p[0].costPerTask.to).toBeLessThan(p[0].costPerTask.from);
  });

  it("does not propose with only 4 comparisons", () => {
    expect(buildProposals(comparisons(4, () => true, () => true))).toEqual([]);
  });

  it("does not propose when the candidate is more than 5 points worse on first pass", () => {
    // 20 comparisons: current 20/20, candidate 18/20 = 10 points worse.
    expect(buildProposals(comparisons(20, () => true, (i) => i >= 2))).toEqual([]);
  });

  it("proposes but flags a candidate that is slightly worse (within 5 points)", () => {
    // 20 comparisons: current 20/20, candidate 19/20 = 5 points worse, allowed.
    const p = buildProposals(comparisons(20, () => true, (i) => i !== 0));
    expect(p).toHaveLength(1);
    expect(p[0].flagged).toBe(true);
    expect(p[0].firstPassRate).toEqual({ from: 100, to: 95 });
  });

  it("does not propose when the candidate is not cheaper", () => {
    const recs = comparisons(5, () => true, () => true).map((r) => (r.variant === "candidate" ? { ...r, model: "claude-opus-5-5" } : r));
    expect(buildProposals(recs)).toEqual([]);
  });

  it("ignores comparisons without a first-pass result", () => {
    const recs = comparisons(5, () => true, () => true).map((r) => (r.variant === "candidate" ? { ...r, firstpass: null } : r));
    expect(buildProposals(recs)).toEqual([]);
  });
});
