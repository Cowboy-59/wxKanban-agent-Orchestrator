/**
 * [SCOPE 154 / T008] 15-minute heartbeat from the run state (FR-007).
 */
import { describe, expect, it } from "vitest";
import { buildFullSummary, buildHeartbeat } from "../../apps/remote-bridge/src/autopilot-heartbeat";
import type { AutopilotRunState } from "../../apps/remote-bridge/src/autopilot-skip";

describe("buildHeartbeat", () => {
  it("says paused when the owner paused the run, regardless of run state", () => {
    const state: AutopilotRunState = { mode: "autopilot", skips: [], units: [{ scope: "010", title: "Billing", status: "done" }] };
    const result = buildHeartbeat({ state, paused: true, previouslyPosted: [] });
    expect(result).toEqual({ message: "Autopilot heartbeat: paused.", kind: "paused", postedScopes: [] });
  });

  it("says nothing changed when every unit was already posted", () => {
    const state: AutopilotRunState = { mode: "autopilot", skips: [], units: [{ scope: "010", title: "Billing", status: "done" }] };
    const result = buildHeartbeat({ state, paused: false, previouslyPosted: ["010"] });
    expect(result).toEqual({
      message: "Autopilot heartbeat: nothing changed since the last post.",
      kind: "nothing-changed",
      postedScopes: ["010"],
    });
  });

  it("says nothing changed when no units have run at all", () => {
    const state: AutopilotRunState = { mode: "autopilot", skips: [] };
    const result = buildHeartbeat({ state, paused: false, previouslyPosted: [] });
    expect(result.kind).toBe("nothing-changed");
  });

  it("gives full detail for units finished since the last post, and carries forward the posted set", () => {
    const state: AutopilotRunState = {
      mode: "autopilot",
      skips: [],
      units: [
        { scope: "010", title: "Billing", status: "done" },
        { scope: "011", title: "Invoices", status: "failed", error: "tests failed", waitingDependents: [{ scope: "012", title: "Reports" }] },
      ],
    };
    const result = buildHeartbeat({ state, paused: false, previouslyPosted: ["010"] });
    expect(result.kind).toBe("full");
    expect(result.message).toContain("SCOPE-011: Invoices");
    expect(result.message).toContain("tests failed");
    expect(result.message).toContain("SCOPE-012 (Reports)");
    expect(result.message).not.toContain("SCOPE-010");
    expect(result.postedScopes).toEqual(["010", "011"]);
  });

  it("masks a secret inside a failed unit's error text before posting", () => {
    const state: AutopilotRunState = {
      mode: "autopilot",
      skips: [],
      units: [{ scope: "010", title: "Billing", status: "failed", error: "could not reach postgres://u:s3cr3t@host/db" }],
    };
    const result = buildHeartbeat({ state, paused: false, previouslyPosted: [] });
    expect(result.message).not.toContain("s3cr3t");
  });
});

describe("buildFullSummary", () => {
  it("lists every unit, not just the unposted ones (startup-list-finished / 18:00 summary)", () => {
    const state: AutopilotRunState = {
      mode: "autopilot",
      skips: [],
      units: [
        { scope: "010", title: "Billing", status: "done" },
        { scope: "011", title: "Invoices", status: "parked" },
      ],
    };
    const result = buildFullSummary(state);
    expect(result.kind).toBe("full");
    expect(result.message).toContain("SCOPE-010: Billing");
    expect(result.message).toContain("SCOPE-011: Invoices");
    expect(result.postedScopes).toEqual(["010", "011"]);
  });

  it("says no units have run yet when the state is empty", () => {
    const result = buildFullSummary({ mode: "autopilot", skips: [] });
    expect(result.message).toBe("Autopilot summary: no units have run yet.");
    expect(result.kind).toBe("nothing-changed");
  });
});
