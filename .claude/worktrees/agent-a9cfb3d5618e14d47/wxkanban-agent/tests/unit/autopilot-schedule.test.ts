/**
 * [SCOPE 154 / T003] AutopilotSchedule.start()/confirmGo() — the Autopilot gate, the startup
 * list, and the owner's "go" (FR-001, FR-002).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { AutopilotSchedule, type AutopilotScheduleOptions } from "../../apps/remote-bridge/src/autopilot-schedule";
import { NO_DEVPLAN_MESSAGE, NOTHING_TO_DO_MESSAGE, type StartupScope } from "../../apps/remote-bridge/src/autopilot-startup";
import type { ProjectAgentConfig } from "../../apps/remote-bridge/src/agent-mode";

const CONFIG: ProjectAgentConfig = {
  projectToken: "wxk_live_test",
  supervisor: "KAIN",
  appBaseUrl: "https://app.test",
  mcpUrl: "https://mcp.test",
};

const SCOPES: StartupScope[] = [{ num: "010", title: "Billing", stage: "Implementation" }];

let posts: string[];

beforeEach(() => {
  posts = [];
});

// [SCOPE 154 / T003] BEGIN — test helper building a default AutopilotSchedule
function make(over: Partial<AutopilotScheduleOptions> = {}): AutopilotSchedule {
  return new AutopilotSchedule({
    config: CONFIG,
    projectId: "ba924193-0335-4080-9fa6-33cd6b81300a",
    post: (t) => void posts.push(t),
    fetchSettings: async () => ({ allowRemote: true, autopilotEnabled: true, projectName: "Billing", feedbackSink: false }),
    refreshToken: async () => ({ token: "fresh-token", expiresAt: "2026-11-07T08:00:00Z" }),
    buildList: async () => SCOPES,
    ...over,
  });
}
// [SCOPE 154 / T003] END

describe("the Autopilot gate (FR-001)", () => {
  it("does not start a run, and says so, when Autopilot is off", async () => {
    const s = make({ fetchSettings: async () => ({ allowRemote: true, autopilotEnabled: false, projectName: "Billing", feedbackSink: false }) });
    await s.start();
    expect(s.isArmed).toBe(false);
    expect(s.isAwaitingGo).toBe(false);
    expect(posts.join("\n")).toContain("Autopilot is off for this project");
  });

  it("does not start a run when settings cannot be read, and says why", async () => {
    const s = make({
      fetchSettings: async () => {
        throw new Error("getaddrinfo ENOTFOUND app.test");
      },
    });
    await s.start();
    expect(s.isArmed).toBe(false);
    expect(posts.join("\n")).toMatch(/could not be read/i);
    expect(posts.join("\n")).toContain("ENOTFOUND");
  });

  it("does not start a run when the token cannot be minted", async () => {
    const s = make({
      refreshToken: async () => {
        throw new Error("project agent room refused (403): remote_not_allowed");
      },
    });
    await s.start();
    expect(s.isArmed).toBe(false);
    expect(posts.join("\n")).toContain("remote_not_allowed");
  });
});

describe("the startup list (FR-002)", () => {
  it("does not start a run when no server devplan exists", async () => {
    const s = make({ buildList: async () => null });
    await s.start();
    expect(s.isArmed).toBe(false);
    expect(s.isAwaitingGo).toBe(false);
    expect(posts).toEqual([NO_DEVPLAN_MESSAGE]);
  });

  it("arms but has nothing to run when every scope is already done", async () => {
    const s = make({ buildList: async () => [] });
    await s.start();
    expect(s.isArmed).toBe(true);
    expect(s.isAwaitingGo).toBe(false);
    expect(posts).toEqual([NOTHING_TO_DO_MESSAGE]);
  });

  it("posts the list and awaits the owner's go when scopes remain", async () => {
    const s = make();
    await s.start();
    expect(s.isArmed).toBe(true);
    expect(s.isAwaitingGo).toBe(true);
    expect(s.pendingScopes).toEqual(SCOPES);
    expect(posts.join("\n")).toContain("SCOPE-010 — Billing (Implementation)");
  });

  it("surfaces an error from building the list without starting a run", async () => {
    const s = make({
      buildList: async () => {
        throw new Error("scope_stage failed (503)");
      },
    });
    await s.start();
    expect(s.isArmed).toBe(false);
    expect(posts.join("\n")).toContain("scope_stage failed (503)");
  });
});

describe("confirmGo (FR-002)", () => {
  it("returns the pending list once, then clears the wait", async () => {
    const s = make();
    await s.start();
    expect(s.confirmGo()).toEqual(SCOPES);
    expect(s.isAwaitingGo).toBe(false);
    expect(s.confirmGo()).toBeUndefined();
  });

  it("returns undefined when nothing is awaiting a go", async () => {
    const s = make({ fetchSettings: async () => ({ allowRemote: true, autopilotEnabled: false, projectName: "Billing", feedbackSink: false }) });
    await s.start();
    expect(s.confirmGo()).toBeUndefined();
  });
});

describe("the shared token holder", () => {
  it("uses tokens.get/withToken when a holder is supplied, instead of refreshToken", async () => {
    let got = 0;
    let used = 0;
    const s = make({
      tokens: {
        get: async () => {
          got++;
          return "held-token";
        },
        withToken: async (fn) => {
          used++;
          return fn("held-token");
        },
      },
      refreshToken: async () => {
        throw new Error("must not be called when tokens is supplied");
      },
    });
    await s.start();
    expect(got).toBe(1);
    expect(used).toBe(1);
    expect(s.isAwaitingGo).toBe(true);
  });
});
