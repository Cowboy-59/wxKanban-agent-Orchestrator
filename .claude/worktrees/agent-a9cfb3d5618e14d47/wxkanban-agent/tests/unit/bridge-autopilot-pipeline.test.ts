/**
 * [SCOPE 154 / T005] "go" must actually run the pipeline, not just post a count and return.
 * Drives the real message path (say("go")) with AutopilotSchedule and the unit runner stubbed,
 * and asserts runPipeline is reached with the approved scopes, each outcome is persisted, and a
 * final summary is posted — the exact gap the owner found 2026-11-08.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const room = vi.hoisted(() => ({
  posts: [] as string[],
  handlers: undefined as
    | undefined
    | {
        onStatus: (s: string) => void;
        onMessage: (m: { id: string; from: string; text: string; ts: number; isAgent?: boolean }) => void;
      },
}));

vi.mock("../../core/yappchatt", () => ({
  resolveYappchattConfig: () => ({ config: {}, user: { email: "andy@wxperts.com", displayName: "KAIN" } }),
  YappchattClient: class {
    constructor(_c: unknown, _u: unknown, h: typeof room.handlers) {
      room.handlers = h;
    }
    async start() {}
    async send(text: string) {
      room.posts.push(text);
      return true;
    }
    formatOutgoing(text: string) {
      return `[KAIN] ${text}`;
    }
    dispose() {}
  },
}));

vi.mock("../../apps/remote-bridge/src/session", () => ({
  BridgeSession: class {
    get id() {
      return "sess-123";
    }
    async start() {}
    send(_t: string) {}
    stop() {}
    async interrupt() {}
  },
}));

vi.mock("../../apps/remote-bridge/src/push-gate", () => ({
  runReview: async () => ({ clean: true, summary: "clean" }),
  gitTarget: async () => ({ remote: "origin", branch: "main" }),
  gitPush: async () => ({ ok: true, output: "" }),
}));

vi.mock("../../apps/remote-bridge/src/agent-mode", () => ({
  recordOverride: async () => ({ ok: true, detail: "" }),
  readyLine: (projectName: string) => `[bridge] ready project=${projectName}`,
}));

// [SCOPE 154 / T003] Stand in for the schedule: already awaiting "go" on two scopes.
const schedule = vi.hoisted(() => ({
  scopes: [
    { num: "200", title: "First scope", stage: "implementation" },
    { num: "201", title: "Second scope", stage: "implementation" },
  ],
  awaiting: true,
}));
vi.mock("../../apps/remote-bridge/src/autopilot-schedule", () => ({
  AutopilotSchedule: class {
    async start() {}
    get isAwaitingGo() {
      return schedule.awaiting;
    }
    // [SCOPE 154 / T003] Mirrors the real class: the pending list while awaiting "go".
    get pendingScopes() {
      return schedule.awaiting ? schedule.scopes : undefined;
    }
    confirmGo() {
      if (!schedule.awaiting) return undefined;
      schedule.awaiting = false;
      return schedule.scopes;
    }
  },
}));

// [SCOPE 154 / T005b] The real runner spawns an Agent SDK session; stub it to record calls and
// resolve per-scope outcomes without ever touching the network or a real child session.
const runnerCalls = vi.hoisted(() => [] as string[]);
vi.mock("../../apps/remote-bridge/src/autopilot-unit-runner", () => ({
  createAutopilotUnitRunner: (opts: { mcpUrl: string; mcpToken: string }) => {
    expect(opts.mcpUrl).toBe("https://mcp.test");
    expect(opts.mcpToken).toBe("tok");
    return async (
      unit: { num: string },
      ctx: { resolveGate: (scopeNum: string, question: string) => Promise<{ decision: string; ledgerId: string } | undefined> },
    ) => {
      runnerCalls.push(unit.num);
      await new Promise((r) => setTimeout(r, 20)); // leaves a real window for a concurrent "go"
      // [SCOPE 154 / T013] Unit 202 has a gate question neither the ledger nor its own scope
      // text answers — exercises the bridge's live round trip (pendingAutopilotGate).
      if (unit.num === "202") {
        const resolution = await ctx.resolveGate("202", "May I load production customer data into the test database?");
        return resolution ? { ok: true } : { ok: false, parkedGates: [{ project: "", scope: "SCOPE-202", question: "May I load production customer data into the test database?", blocks: "invoice totals" }] };
      }
      return unit.num === "201" ? { ok: false, error: "boom" } : { ok: true };
    };
  },
}));

// [SCOPE 154 / T005] Keep the run-state file out of this test — assert on what gets passed in.
const persisted = vi.hoisted(() => [] as Array<{ scope: string; status: string }>);
// [SCOPE 154 / T003] Every saveAutopilotState call's state, in order — lets the "current step"
// and "startup list" wiring in bridge.ts be asserted on without touching the real fs.
const savedStates = vi.hoisted(() => [] as Array<Record<string, unknown>>);
vi.mock("../../apps/remote-bridge/src/autopilot-skip", async () => {
  const actual = await vi.importActual<typeof import("../../apps/remote-bridge/src/autopilot-skip")>(
    "../../apps/remote-bridge/src/autopilot-skip",
  );
  return {
    ...actual,
    loadAutopilotState: () => ({ mode: "autopilot" as const, skips: [], units: [] }),
    saveAutopilotState: (_root: string, state: Record<string, unknown>) => {
      savedStates.push({ ...state });
    },
    recordUnitOutcome: (
      state: { units?: Array<{ scope: string; status: string }> },
      record: { scope: string; status: string },
    ) => {
      persisted.push({ scope: record.scope, status: record.status });
      return { ...state, units: [...(state.units ?? []), record] };
    },
  };
});

// The real nodeDependentsResolver shells out to _wxAI/impact/scope-impact.mjs — irrelevant to
// this wiring test (it only matters for a failed unit's dependents), so stub it to "none found".
// [SCOPE 154 / T013] nodeLedgerResolver/nodeLedgerWriter both dynamic-import
// _wxAI/askgate/ledger.mjs relative to cwd, which this test's cwd ("." under the test runner)
// does not resolve to — stub both so the live-gate tests below exercise bridge.ts's own
// pendingAutopilotGate round trip, not the real ledger file.
const ledgerWrites = vi.hoisted(() => [] as Array<{ scopeNum: string; question: string; decision: string; approvedBy: string }>);
vi.mock("../../apps/remote-bridge/src/autopilot-pipeline", async () => {
  const actual = await vi.importActual<typeof import("../../apps/remote-bridge/src/autopilot-pipeline")>(
    "../../apps/remote-bridge/src/autopilot-pipeline",
  );
  return {
    ...actual,
    nodeDependentsResolver: () => async () => [],
    nodeLedgerResolver: () => async () => undefined,
    nodeLedgerWriter: () => async (scopeNum: string, question: string, decision: string, approvedBy: string) => {
      ledgerWrites.push({ scopeNum, question, decision, approvedBy });
      return { decision, ledgerId: "ledger-test-1" };
    },
  };
});

import { RemoteBridge } from "../../apps/remote-bridge/src/bridge";

const AGENT = { name: "PROJECT-AGENT", projectId: "p-1", mcpUrl: "https://mcp.test", mcpToken: "tok" };

async function connectedBridge(): Promise<RemoteBridge> {
  const bridge = new RemoteBridge({
    projectName: "wxKanban",
    cwd: ".",
    agent: AGENT,
    supervisor: "KAIN",
    // this.autopilot (and this.triage) are only constructed when both are set — mirrors
    // project-agent mode's real wiring (see bridge.ts onStatus()).
    projectAgentConfig: { mcpUrl: "https://mcp.test" } as never,
  });
  await bridge.run();
  room.handlers?.onStatus("connected");
  return bridge;
}

const say = (text: string) => room.handlers?.onMessage({ id: String(Math.random()), from: "Andy", text, ts: Date.now() });
const tick = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  room.posts.length = 0;
  runnerCalls.length = 0;
  persisted.length = 0;
  savedStates.length = 0;
  ledgerWrites.length = 0;
  schedule.awaiting = true;
  schedule.scopes = [
    { num: "200", title: "First scope", stage: "implementation" },
    { num: "201", title: "Second scope", stage: "implementation" },
  ];
});

describe("Autopilot go actually runs the pipeline (SCOPE-154 T005)", () => {
  it("runs every approved scope's unit, records each outcome, and posts a final summary", async () => {
    await connectedBridge();
    say("go");
    // The run is awaited inside the handler via a background promise — give the microtask
    // queue enough turns for the two sequential unit runs to settle.
    for (let i = 0; i < 10; i++) await tick();

    expect(runnerCalls).toEqual(["200", "201"]);
    expect(persisted).toEqual([
      { scope: "200", status: "done" },
      { scope: "201", status: "failed" },
    ]);
    expect(room.posts).toContain("Autopilot: starting on 2 scopes.");
    expect(room.posts.some((p) => p.includes("1 done, 1 failed, 0 parked"))).toBe(true);
  });

  it("a second go while a run is in flight is ignored, not started twice", async () => {
    await connectedBridge();
    say("go");
    await tick();
    schedule.awaiting = true; // pretend a second list arrived mid-run
    say("go");
    for (let i = 0; i < 10; i++) await tick();

    expect(room.posts).toContain("Autopilot: a run is already in progress — ignoring this go.");
  });
});

describe("Run-state persistence (SCOPE-154 T003)", () => {
  it("persists the posted startup list once the schedule is awaiting go", async () => {
    await connectedBridge();
    for (let i = 0; i < 5; i++) await tick();

    const withStartupList = savedStates.find((s) => Array.isArray(s.startupList));
    expect(withStartupList?.startupList).toEqual([
      { scope: "200", title: "First scope", status: "waiting" },
      { scope: "201", title: "Second scope", status: "waiting" },
    ]);
  });

  it("sets currentScope/currentStep/stepStartedAt before each unit runs, and clears them when the run ends", async () => {
    await connectedBridge();
    say("go");
    for (let i = 0; i < 10; i++) await tick();

    // Each unit's state is saved twice (onUnitStart, then recordOutcome, which doesn't clear
    // currentScope) — assert the de-duplicated order rather than an exact save count.
    const currentScopeSeen = savedStates.filter((s) => s.currentScope !== undefined).map((s) => s.currentScope);
    expect([...new Set(currentScopeSeen)]).toEqual(["200", "201"]);
    const withStep = savedStates.find((s) => s.currentScope === "200");
    expect(withStep?.currentStep).toBe("running");
    expect(typeof withStep?.stepStartedAt).toBe("string");

    // The run's last save (the finally-block cleanup) clears all three fields.
    const last = savedStates[savedStates.length - 1];
    expect(last.currentScope).toBeUndefined();
    expect(last.currentStep).toBeUndefined();
    expect(last.stepStartedAt).toBeUndefined();
  });
});

describe("Autopilot live gate round trip (SCOPE-154 T013)", () => {
  it("a live-answered gate resumes the same unit and persists the answer to the ledger under the replier's name", async () => {
    schedule.scopes = [{ num: "202", title: "Gate scope", stage: "implementation" }];
    await connectedBridge();
    say("go");
    for (let i = 0; i < 5; i++) await tick();

    expect(room.posts.some((p) => p.includes('SCOPE-202 needs input') && p.includes("May I load production customer data"))).toBe(
      true,
    );

    say("Yes, the test database is already masked.");
    for (let i = 0; i < 10; i++) await tick();

    expect(room.posts).toContain("Got it — recording that answer.");
    expect(ledgerWrites).toEqual([
      {
        scopeNum: "202",
        question: "May I load production customer data into the test database?",
        decision: "Yes, the test database is already masked.",
        approvedBy: "Andy",
      },
    ]);
    expect(persisted).toEqual([{ scope: "202", status: "done" }]);
  });

  it("PARK leaves the gate for the owner and the unit parks instead of resuming", async () => {
    schedule.scopes = [{ num: "202", title: "Gate scope", stage: "implementation" }];
    await connectedBridge();
    say("go");
    for (let i = 0; i < 5; i++) await tick();

    say("PARK");
    for (let i = 0; i < 10; i++) await tick();

    expect(room.posts).toContain("Parked — left for the owner.");
    expect(ledgerWrites).toEqual([]);
    expect(persisted).toEqual([{ scope: "202", status: "parked" }]);
  });
});
