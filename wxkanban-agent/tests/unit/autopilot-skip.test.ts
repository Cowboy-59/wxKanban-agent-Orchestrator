/**
 * [SCOPE 154 / T004] Skip cascade via scope-impact.mjs (FR-003).
 */
import { mkdirSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyKeepDecision,
  classifyDependents,
  clearCurrentStep,
  formatSkipCascade,
  loadAutopilotState,
  parseKeepReply,
  pendingPartialSkips,
  recordCurrentStep,
  recordSkipCascade,
  recordStartupList,
  recordUnitOutcome,
  runSkipCascade,
  saveAutopilotState,
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

describe("recordSkipCascade / applyKeepDecision preserve the rest of the state (SCOPE 154 / T003)", () => {
  it("recordSkipCascade does not drop units, startupList, or the current-step fields", () => {
    const withExtras: AutopilotRunState = {
      mode: "autopilot",
      skips: [],
      units: [{ scope: "001", title: "Auth", status: "done" }],
      startupList: [{ scope: "001", title: "Auth", status: "waiting" }],
      currentScope: "001",
      currentStep: "running",
      stepStartedAt: "2026-11-08T00:00:00.000Z",
    };
    const state = recordSkipCascade(withExtras, "010", "Billing", []);
    expect(state.units).toEqual(withExtras.units);
    expect(state.startupList).toEqual(withExtras.startupList);
    expect(state.currentScope).toBe("001");
    expect(state.currentStep).toBe("running");
    expect(state.stepStartedAt).toBe("2026-11-08T00:00:00.000Z");
  });

  it("applyKeepDecision does not drop units or the startup list", () => {
    const withExtras: AutopilotRunState = {
      mode: "autopilot",
      skips: [{ scope: "010", title: "Billing", status: "partly-worked", dependents: [] }],
      units: [{ scope: "001", title: "Auth", status: "done" }],
      startupList: [{ scope: "001", title: "Auth", status: "waiting" }],
    };
    const state = applyKeepDecision(withExtras, "010", ["011"]);
    expect(state.units).toEqual(withExtras.units);
    expect(state.startupList).toEqual(withExtras.startupList);
    expect(state.skips[0].keptDependents).toEqual(["011"]);
  });
});

describe("startup list and current-step helpers (SCOPE 154 / T003)", () => {
  it("recordStartupList sets every scope to waiting, in the given order", () => {
    const state = recordStartupList(EMPTY_STATE, [
      { num: "010", title: "Billing" },
      { num: "011", title: "Invoices" },
    ]);
    expect(state.startupList).toEqual([
      { scope: "010", title: "Billing", status: "waiting" },
      { scope: "011", title: "Invoices", status: "waiting" },
    ]);
  });

  it("recordStartupList preserves skips/units already on the state", () => {
    const withUnits = recordUnitOutcome(EMPTY_STATE, { scope: "001", title: "Auth", status: "done" });
    const state = recordStartupList(withUnits, [{ num: "010", title: "Billing" }]);
    expect(state.units).toEqual(withUnits.units);
  });

  it("recordCurrentStep sets currentScope/currentStep/stepStartedAt", () => {
    const state = recordCurrentStep(EMPTY_STATE, "010", "running", "2026-11-08T12:00:00.000Z");
    expect(state.currentScope).toBe("010");
    expect(state.currentStep).toBe("running");
    expect(state.stepStartedAt).toBe("2026-11-08T12:00:00.000Z");
  });

  it("recordCurrentStep defaults stepStartedAt to now when omitted", () => {
    const before = Date.now();
    const state = recordCurrentStep(EMPTY_STATE, "010", "running");
    expect(new Date(state.stepStartedAt as string).getTime()).toBeGreaterThanOrEqual(before);
  });

  it("clearCurrentStep removes all three current-step fields", () => {
    const running = recordCurrentStep(EMPTY_STATE, "010", "running");
    const cleared = clearCurrentStep(running);
    expect(cleared.currentScope).toBeUndefined();
    expect(cleared.currentStep).toBeUndefined();
    expect(cleared.stepStartedAt).toBeUndefined();
  });

  it("clearCurrentStep preserves skips/units/startupList", () => {
    const state = recordStartupList(EMPTY_STATE, [{ num: "010", title: "Billing" }]);
    const running = recordCurrentStep(state, "010", "running");
    const cleared = clearCurrentStep(running);
    expect(cleared.startupList).toEqual(state.startupList);
  });
});

describe("loadAutopilotState / saveAutopilotState round-trip the new fields (SCOPE 154 / T003)", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "autopilot-skip-test-"));
    mkdirSync(join(root, "docs"), { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("round-trips startupList/currentScope/currentStep/stepStartedAt through a save+load", () => {
    const state: AutopilotRunState = {
      mode: "autopilot",
      skips: [],
      startupList: [{ scope: "010", title: "Billing", status: "waiting" }],
      currentScope: "010",
      currentStep: "running",
      stepStartedAt: "2026-11-08T00:00:00.000Z",
    };
    saveAutopilotState(root, state);
    const loaded = loadAutopilotState(root);
    expect(loaded.startupList).toEqual(state.startupList);
    expect(loaded.currentScope).toBe("010");
    expect(loaded.currentStep).toBe("running");
    expect(loaded.stepStartedAt).toBe("2026-11-08T00:00:00.000Z");
  });

  it("a missing file loads as empty state with no new fields set", () => {
    const loaded = loadAutopilotState(root);
    expect(loaded).toEqual({ mode: "autopilot", skips: [] });
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
