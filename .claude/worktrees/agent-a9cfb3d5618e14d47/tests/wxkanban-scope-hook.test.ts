// [SCOPE 058 / T021] Tests for the git-hook helper's pure logic: scope-branch
// parsing (claim trigger), merge-subject parsing (release trigger), and the
// conflict/forbidden warning (warn-don't-steal on collision).
import { describe, it, expect } from "vitest";
// @ts-expect-error — plain ESM helper (no types); pure functions only.
import { parseScopeFromBranch, parseScopeFromMergeSubject, checkoutWarning } from "../scripts/wxkanban-scope-hook.mjs";

describe("parseScopeFromBranch", () => {
  it("extracts NNN from a scope branch", () => {
    expect(parseScopeFromBranch("scope/058-branch-checkinout")).toBe("058");
    expect(parseScopeFromBranch("scope/042-foo")).toBe("042");
  });
  it("returns null for non-scope or malformed branches", () => {
    expect(parseScopeFromBranch("main")).toBeNull();
    expect(parseScopeFromBranch("feature/058-x")).toBeNull();
    expect(parseScopeFromBranch("scope/58-x")).toBeNull(); // needs 3 digits
    expect(parseScopeFromBranch("")).toBeNull();
    expect(parseScopeFromBranch(undefined)).toBeNull();
  });
});

describe("parseScopeFromMergeSubject", () => {
  it("parses git's default merge subject", () => {
    expect(parseScopeFromMergeSubject("Merge branch 'scope/058-branch-checkinout'")).toBe("058");
    expect(parseScopeFromMergeSubject("Merge branch scope/042-foo into main")).toBe("042");
  });
  it("returns null when no scope branch was merged", () => {
    expect(parseScopeFromMergeSubject("Merge branch 'feature/x'")).toBeNull();
    expect(parseScopeFromMergeSubject("just a normal commit")).toBeNull();
    expect(parseScopeFromMergeSubject(undefined)).toBeNull();
  });
});

describe("checkoutWarning (warn, never steal)", () => {
  it("warns naming the holder on a conflict", () => {
    const w = checkoutWarning({ ok: false, status: "conflict", heldBy: { userId: "u", name: "Bob" } }, "058");
    expect(w).toContain("058");
    expect(w).toContain("Bob");
  });
  it("warns on a consultant forbidden result", () => {
    expect(checkoutWarning({ ok: false, status: "forbidden" }, "058")).toContain("not assigned");
  });
  it("is silent on success / single_user / null", () => {
    expect(checkoutWarning({ ok: true, status: "claimed" }, "058")).toBeNull();
    expect(checkoutWarning({ ok: true, status: "single_user" }, "058")).toBeNull();
    expect(checkoutWarning(null, "058")).toBeNull();
  });
});
