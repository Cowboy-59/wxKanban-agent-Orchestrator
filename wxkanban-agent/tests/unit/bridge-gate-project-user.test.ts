/**
 * SPEC-159 Amendment A, T021 (FR-094) — any active person on the Project's user list answers every
 * gate kind: push CONFIRMED, the agent approval gate, the Autopilot gate question and the list's go.
 * Role never decides. A person the app refuses settles nothing and the gate keeps waiting. Room
 * client, session, Autopilot schedule and unit runner are all stubbed: no socket, no network.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HookCallback } from "@anthropic-ai/claude-agent-sdk";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// [SCOPE 159 / T021] BEGIN — stubs and helpers for the project-user gate tests (FR-094)
const room = vi.hoisted(() => ({
  posts: [] as string[],
  handlers: undefined as
    | undefined
    | {
        onStatus: (s: string, d?: string, l?: unknown) => void;
        onMessage: (m: { id: string; from: string; text: string; ts: number; isAgent?: boolean; authorId?: string }) => void;
      },
}));

vi.mock("../../core/yappchatt", () => ({
  ROOM_LINK_ALERT_FAILURES: 5,
  resolveYappchattConfig: () => ({ config: {}, user: { email: "andy@wxperts.com", displayName: "KAIN" } }),
  YappchattClient: class {
    constructor(_c: unknown, _u: unknown, h: typeof room.handlers) {
      room.handlers = h;
    }
    async start() {
      /* connected by the test */
    }
    async send(text: string) {
      room.posts.push(text);
      return true;
    }
    formatOutgoing(text: string) {
      return `[KAIN] ${text}`;
    }
    dispose() {
      /* noop */
    }
  },
}));

const session = vi.hoisted(() => ({ gate: undefined as HookCallback | undefined, sent: [] as string[] }));
vi.mock("../../apps/remote-bridge/src/session", () => ({
  BridgeSession: class {
    constructor(opts: { overrideGate?: HookCallback }) {
      session.gate = opts.overrideGate;
    }
    get id() {
      return "sess-1";
    }
    async start() {
      /* noop */
    }
    send(t: string) {
      session.sent.push(t);
    }
    stop() {
      /* noop */
    }
    async interrupt() {
      /* noop */
    }
  },
}));

const pushes = vi.hoisted(() => ({ count: 0 }));
vi.mock("../../apps/remote-bridge/src/push-gate", () => ({
  runReview: async () => ({ clean: true, summary: "clean" }),
  gitTarget: async () => ({ remote: "origin", branch: "main" }),
  gitPush: async () => {
    pushes.count++;
    return { ok: true, output: "" };
  },
}));

vi.mock("../../apps/remote-bridge/src/agent-mode", () => ({
  recordOverride: async () => ({ ok: true, detail: "" }),
  readyLine: (projectName: string) => `[bridge] ready project=${projectName}`,
  refreshMcpToken: async () => ({ token: "tok-2", expiresAt: "2099-01-01T00:00:00.000Z" }),
}));

vi.mock("../../core/http/mcp-client", () => ({ resolveApiToken: () => null }));

vi.mock("../../apps/remote-bridge/src/triage-schedule", () => ({
  TriageSchedule: class {
    async start() {
      /* noop */
    }
    get isRunning() {
      return false;
    }
  },
}));
vi.mock("../../apps/remote-bridge/src/handoff-watch", () => ({
  HandoffWatcher: class {
    start() {
      /* noop */
    }
    stop() {
      /* noop */
    }
  },
}));
vi.mock("../../apps/remote-bridge/src/handoff-queue", () => ({
  HandoffQueue: class {
    start() {
      /* noop */
    }
    stop() {
      /* noop */
    }
    offer() {
      /* noop */
    }
  },
}));
vi.mock("../../apps/remote-bridge/src/autopilot-startup", () => ({ fetchScopeStage: async () => undefined }));

const schedule = vi.hoisted(() => ({
  scopes: [] as Array<{ num: string; title: string; stage: string }>,
  awaiting: false,
}));
vi.mock("../../apps/remote-bridge/src/autopilot-schedule", () => ({
  AutopilotSchedule: class {
    async start() {
      /* noop */
    }
    get isAwaitingGo() {
      return schedule.awaiting;
    }
    get pendingScopes() {
      return schedule.awaiting ? schedule.scopes : undefined;
    }
    confirmGo() {
      if (!schedule.awaiting) return undefined;
      schedule.awaiting = false;
      return schedule.scopes;
    }
    skip(num: string) {
      const s = schedule.scopes.find((x) => x.num === num);
      if (s) schedule.scopes = schedule.scopes.filter((x) => x.num !== num);
      return s;
    }
  },
}));

const GATE_QUESTION = "May I load production customer data into the test database?";
const runnerCalls = vi.hoisted(() => [] as string[]);
vi.mock("../../apps/remote-bridge/src/autopilot-unit-runner", () => ({
  createAutopilotUnitRunner: () => async (
    unit: { num: string },
    ctx: { resolveGate: (scopeNum: string, question: string) => Promise<{ decision: string; ledgerId: string } | undefined> },
  ) => {
    runnerCalls.push(unit.num);
    if (unit.num === "202") {
      const r = await ctx.resolveGate("202", "May I load production customer data into the test database?");
      return r ? { ok: true } : { ok: false };
    }
    return { ok: true };
  },
}));

// The run state lives in memory: no docs/ folder is written.
vi.mock("../../apps/remote-bridge/src/autopilot-skip", async () => {
  const actual = await vi.importActual<typeof import("../../apps/remote-bridge/src/autopilot-skip")>(
    "../../apps/remote-bridge/src/autopilot-skip",
  );
  return {
    ...actual,
    loadAutopilotState: () => ({ mode: "autopilot" as const, skips: [], units: [] }),
    saveAutopilotState: () => undefined,
  };
});

const ledgerWrites = vi.hoisted(() => [] as Array<{ scopeNum: string; decision: string; approvedBy: string }>);
vi.mock("../../apps/remote-bridge/src/autopilot-pipeline", async () => {
  const actual = await vi.importActual<typeof import("../../apps/remote-bridge/src/autopilot-pipeline")>(
    "../../apps/remote-bridge/src/autopilot-pipeline",
  );
  return {
    ...actual,
    nodeDependentsResolver: () => async () => [],
    nodeLedgerResolver: () => async () => undefined,
    nodeLedgerWriter: () => async (scopeNum: string, _q: string, decision: string, approvedBy: string) => {
      ledgerWrites.push({ scopeNum, decision, approvedBy });
      return { decision, ledgerId: "ledger-1" };
    },
  };
});

import { RemoteBridge } from "../../apps/remote-bridge/src/bridge";
import { NOT_RECORDED_NOTE, type ApproverLookup } from "../../apps/remote-bridge/src/decision-reply";

const AGENT = { name: "PROJECT-AGENT", projectId: "p-1", mcpUrl: "https://mcp.test", mcpToken: "tok" };
const MEMBER = "u-member";
const STRANGER = "u-bob";
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async (n = 8) => {
  for (let i = 0; i < n; i++) await tick();
};

/** The app's answer: a TEAM_MEMBER on the project passes; anyone else is refused. */
const lookup: ApproverLookup = async (id) =>
  id === MEMBER ? { approver: true, name: "Tom Member", role: "TEAM_MEMBER" } : { approver: false, name: null, role: null };

async function connectedBridge(): Promise<RemoteBridge> {
  const bridge = new RemoteBridge({
    projectName: "wxKanban",
    cwd: mkdtempSync(join(tmpdir(), "gate-project-user-")),
    agent: AGENT,
    supervisor: "KAIN",
    projectAgentConfig: { mcpUrl: "https://mcp.test" } as never,
    approverLookup: lookup,
  });
  await bridge.run();
  room.handlers?.onStatus("connected", undefined, { roomLink: "connected", since: new Date().toISOString(), failures: 0 });
  await settle(3);
  return bridge;
}

const say = (text: string, authorId: string, from = authorId === MEMBER ? "Tom" : "Bob") =>
  room.handlers?.onMessage({ id: String(Math.random()), from, text, ts: Date.now(), authorId });

/** Drive the gate as the SDK does: a PreToolUse hook call. */
function askGate(command: string): Promise<"allow" | "deny"> {
  const hook = session.gate as HookCallback;
  return (
    hook(
      { hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command }, tool_use_id: "t" } as never,
      "t",
      { signal: new AbortController().signal },
    ) as Promise<{ hookSpecificOutput?: { permissionDecision?: string } }>
  ).then((out) => (out.hookSpecificOutput?.permissionDecision === "allow" ? "allow" : "deny"));
}

const refusals = () => room.posts.filter((p) => p.includes(NOT_RECORDED_NOTE));

beforeEach(() => {
  room.posts.length = 0;
  session.sent.length = 0;
  session.gate = undefined;
  pushes.count = 0;
  runnerCalls.length = 0;
  ledgerWrites.length = 0;
  schedule.awaiting = false;
  schedule.scopes = [];
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});
// [SCOPE 159 / T021] END

// [SCOPE 159 / T021] BEGIN — a project user answers every gate kind; a refused person settles nothing (FR-094)
describe("FR-094 a person on the Project's user list answers every gate kind", () => {
  it("push: a refused CONFIRMED pushes nothing and the push still waits; a project user's CONFIRMED pushes", async () => {
    await connectedBridge();
    say("PUSH", MEMBER);
    await settle();
    expect(room.posts.some((p) => p.startsWith("Do you want me to push main → origin?"))).toBe(true);
    say("CONFIRMED", STRANGER);
    await settle();
    expect(pushes.count).toBe(0);
    expect(refusals()).toHaveLength(1);
    say("CONFIRMED", MEMBER);
    await settle();
    expect(pushes.count).toBe(1);
  });

  it("agent approval gate: a refused CONFIRMED settles nothing; a project user's CONFIRMED allows", async () => {
    await connectedBridge();
    let outcome: string | undefined;
    void askGate("git push origin main").then((o) => (outcome = o));
    await settle();
    expect(room.posts.some((p) => p.includes("(a person on this Project's user list, or KAIN relaying one)"))).toBe(true);
    say("CONFIRMED", STRANGER);
    await settle();
    expect(outcome).toBeUndefined();
    expect(refusals()).toHaveLength(1);
    say("CONFIRMED", MEMBER);
    await settle();
    expect(outcome).toBe("allow");
  });

  it("Autopilot gate question: a refused answer is not recorded; a project user's answer is, under their name", async () => {
    schedule.scopes = [{ num: "202", title: "Gate scope", stage: "implementation" }];
    schedule.awaiting = true;
    await connectedBridge();
    say("go", MEMBER);
    await settle();
    expect(runnerCalls).toEqual(["202"]);
    expect(room.posts.some((p) => p.includes(GATE_QUESTION))).toBe(true);
    say("Yes, use synthetic data only", STRANGER);
    await settle();
    expect(ledgerWrites).toHaveLength(0);
    expect(refusals()).toHaveLength(1);
    say("Yes, use synthetic data only", MEMBER);
    await settle();
    expect(ledgerWrites).toEqual([{ scopeNum: "202", decision: "Yes, use synthetic data only", approvedBy: "Tom Member" }]);
  });

  it("list go: a refused go starts nothing and the list still waits; a project user's go starts the run", async () => {
    schedule.scopes = [{ num: "200", title: "First", stage: "implementation" }];
    schedule.awaiting = true;
    await connectedBridge();
    say("go", STRANGER);
    await settle();
    expect(runnerCalls).toEqual([]);
    expect(schedule.awaiting).toBe(true);
    expect(refusals()).toHaveLength(1);
    say("go", MEMBER);
    await settle();
    expect(runnerCalls).toEqual(["200"]);
  });
});
// [SCOPE 159 / T021] END
