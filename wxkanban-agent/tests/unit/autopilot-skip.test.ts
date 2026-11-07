/**
 * [SCOPE 154 / T004] Skip cascade via scope-impact.mjs (FR-003).
 */
import { describe, expect, it } from "vitest";
import {
  applyKeepDecision,
  classifyDependents,
  formatSkipCascade,
  parseKeepReply,
  pendingPartialSkips,
  recordSkipCascade,
  runSkipCascade,
  type AutopilotRunState,
  type ScopeImpactDependent,
  type ScopeImpactResult,
} from "../../apps/remote-bridge/src/autopilot-skip";

const EMPTY_STATE: AutopilotRunState = { mode: "autopilot", skips: [] };

describe("classifyDependents", () => {
  it("marks a dependent still in Design as skipped, anything further along as partly worked", async () => {
    const deps: ScopeImpactDependent[] = [
      { scope: "011", title: "Invoices", file: "specs/Project-Scope/011-invoices.md" },
      { scope: "012", title: "Reports", file: "specs/Project-Scope/012-reports.md" },
    ];
    const stageOf = async (num: string) => (num === "011" ? "Design" : "Implementation");
    expect(await classifyDependents(deps, stageOf)).toEqual([
      { scope: "011", title: "Invoices", status: "skipped" },
      { scope: "012", title: "Reports", status: "partly-worked" },
    ]);
  });

  it("treats an unreadable stage as skipped, not partly worked", async () => {
    const deps: ScopeImpactDependent[] = [{ scope: "011", title: "Invoices", file: "x" }];
    expect(await classifyDependents(deps, async () => undefined)).toEqual([
      { scope: "011", title: "Invoices", status: "skipped" },
    ]);
  });
});

describe("formatSkipCascade (FR-003)", () => {
  it("posts with no dependent list when the scope has no dependents", () => {
    const text = formatSkipCascade("010", "Billing", []);
    expect(text).toBe("Autopilot is skipping SCOPE-010 — Billing. No dependent scopes are affected.");
  });

  it("numbers the dependents and marks each skipped or partly worked", () => {
    const text = formatSkipCascade("010", "Billing", [
      { scope: "011", title: "Invoices", status: "skipped" },
      { scope: "012", title: "Reports", status: "partly-worked" },
    ]);
    expect(text).toContain("2 dependent scopes affected");
    expect(text).toContain("1. SCOPE-011 — Invoices (skipped)");
    expect(text).toContain("2. SCOPE-012 — Reports (partly worked)");
    expect(text).toContain('Reply "keep');
  });

  it("singularizes for exactly one dependent", () => {
    const text = formatSkipCascade("010", "Billing", [{ scope: "011", title: "Invoices", status: "skipped" }]);
    expect(text).toContain("1 dependent scope affected");
  });
});

describe("parseKeepReply", () => {
  it("parses a comma-separated keep list", () => {
    expect(parseKeepReply("keep 011, 012")).toEqual(["011", "012"]);
  });

  it("parses a space-separated keep list", () => {
    expect(parseKeepReply("keep 011 012")).toEqual(["011", "012"]);
  });

  it("returns an empty list for \"keep none\"", () => {
    expect(parseKeepReply("keep none")).toEqual([]);
  });

  it("returns undefined for text that isn't a keep reply", () => {
    expect(parseKeepReply("go")).toBeUndefined();
    expect(parseKeepReply("")).toBeUndefined();
  });
});

describe("run-state persistence", () => {
  it("recordSkipCascade stores a skipped status when every dependent is skipped", () => {
    const state = recordSkipCascade(EMPTY_STATE, "010", "Billing", [
      { scope: "011", title: "Invoices", status: "skipped" },
    ]);
    expect(state.skips).toEqual([
      { scope: "010", title: "Billing", status: "skipped", dependents: [{ scope: "011", title: "Invoices", status: "skipped" }] },
    ]);
  });

  it("recordSkipCascade stores partly-worked when any dependent is", () => {
    const state = recordSkipCascade(EMPTY_STATE, "010", "Billing", [
      { scope: "011", title: "Invoices", status: "skipped" },
      { scope: "012", title: "Reports", status: "partly-worked" },
    ]);
    expect(state.skips[0].status).toBe("partly-worked");
  });

  it("recordSkipCascade replaces an earlier record for the same scope", () => {
    const first = recordSkipCascade(EMPTY_STATE, "010", "Billing", [{ scope: "011", title: "Invoices", status: "skipped" }]);
    const second = recordSkipCascade(first, "010", "Billing", []);
    expect(second.skips).toHaveLength(1);
    expect(second.skips[0].dependents).toEqual([]);
  });

  it("applyKeepDecision records the owner's answer for that scope only", () => {
    const state = recordSkipCascade(EMPTY_STATE, "010", "Billing", [{ scope: "011", title: "Invoices", status: "partly-worked" }]);
    const answered = applyKeepDecision(state, "010", ["011"]);
    expect(answered.skips[0].keptDependents).toEqual(["011"]);
  });

  it("pendingPartialSkips returns only unanswered partly-worked records (re-listed next run)", () => {
    const partial = recordSkipCascade(EMPTY_STATE, "010", "Billing", [{ scope: "011", title: "Invoices", status: "partly-worked" }]);
    const resolved = recordSkipCascade(partial, "020", "Payroll", [{ scope: "021", title: "Taxes", status: "partly-worked" }]);
    const answeredOne = applyKeepDecision(resolved, "020", ["021"]);
    expect(pendingPartialSkips(answeredOne).map((s) => s.scope)).toEqual(["010"]);
  });

  it("a fully-skipped record is never considered pending-partial", () => {
    const state = recordSkipCascade(EMPTY_STATE, "010", "Billing", [{ scope: "011", title: "Invoices", status: "skipped" }]);
    expect(pendingPartialSkips(state)).toEqual([]);
  });
});

describe("runSkipCascade", () => {
  const root = "C:\\fake-root";

  function noopPersistence() {
    let stored = EMPTY_STATE;
    return {
      loadState: () => stored,
      saveState: (_root: string, state: AutopilotRunState) => {
        stored = state;
      },
    };
  }

  it("posts with no dependent list and persists an empty record when scope-impact finds none", async () => {
    const result: ScopeImpactResult = { scope: "010", found: true, title: "Billing", dependents: [] };
    const { message, state } = await runSkipCascade({
      root,
      scopeNum: "010",
      title: "Billing",
      scopeImpact: async () => result,
      stageOf: async () => "Design",
      ...noopPersistence(),
    });
    expect(message).toBe("Autopilot is skipping SCOPE-010 — Billing. No dependent scopes are affected.");
    expect(state.skips).toEqual([{ scope: "010", title: "Billing", status: "skipped", dependents: [] }]);
  });

  it("classifies and records dependents when scope-impact finds some", async () => {
    const result: ScopeImpactResult = {
      scope: "010",
      found: true,
      title: "Billing",
      dependents: [{ scope: "011", title: "Invoices", file: "x" }],
    };
    const { message, state } = await runSkipCascade({
      root,
      scopeNum: "010",
      title: "Billing",
      scopeImpact: async () => result,
      stageOf: async () => "Implementation",
      ...noopPersistence(),
    });
    expect(message).toContain("SCOPE-011 — Invoices (partly worked)");
    expect(state.skips[0].status).toBe("partly-worked");
  });

  it("treats scope-impact not finding the scope as having no dependents", async () => {
    const result: ScopeImpactResult = { scope: "999", found: false, dependents: [] };
    const { message } = await runSkipCascade({
      root,
      scopeNum: "999",
      title: "Ghost",
      scopeImpact: async () => result,
      ...noopPersistence(),
    });
    expect(message).toBe("Autopilot is skipping SCOPE-999 — Ghost. No dependent scopes are affected.");
  });
});
