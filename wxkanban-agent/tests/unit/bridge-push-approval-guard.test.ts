/**
 * SPEC-144 review follow-up T031 (FR-021, DQ-03) — an agent-initiated push approval counts only
 * after its question is posted. While the pre-push review still runs, a CONFIRMED settles
 * nothing, reaches the session as discussion, and the room is told once. Room client, session
 * and review are all stubbed: no socket, no network, no git.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HookCallback } from "@anthropic-ai/claude-agent-sdk";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// [SCOPE 144 / T031] BEGIN — stubs and helpers for the push approval guard tests
const STATUS_DIR = mkdtempSync(join(tmpdir(), "push-approval-guard-"));

const room = vi.hoisted(() => ({
  posts: [] as string[],
  handlers: undefined as
    | undefined
    | {
        onStatus: (s: string, d?: string, l?: unknown) => void;
        onMessage: (m: { id: string; from: string; text: string; ts: number; isAgent?: boolean; replayed?: boolean; authorId?: string }) => void;
      },
}));

vi.mock("../../core/yappchatt", () => ({
  ROOM_LINK_ALERT_FAILURES: 5,
  resolveYappchattConfig: () => ({ config: {}, user: { email: "agent@example.test", displayName: "KAIN" } }),
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

const session = vi.hoisted(() => ({ gate: undefined as HookCallback | undefined, sent: [] as string[], interrupted: 0 }));
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
      session.interrupted++;
    }
  },
}));

// The review is held open by the test: `review.finish` settles it with the chosen verdict.
const review = vi.hoisted(() => ({
  calls: 0,
  finish: undefined as undefined | ((v: { clean: boolean; summary?: string }) => void),
}));
vi.mock("../../apps/remote-bridge/src/push-gate", () => ({
  runReview: () => {
    review.calls++;
    return new Promise<{ clean: boolean; summary?: string }>((resolve) => {
      review.finish = resolve;
    });
  },
  gitTarget: async () => ({ remote: "origin", branch: "main" }),
  gitPush: async () => ({ ok: true, output: "" }),
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
// An Autopilot startup list the test can open; its one unit asks a live gate question.
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
    skip() {
      return undefined;
    }
  },
}));

const GATE_QUESTION = "May I load production customer data into the test database?";
vi.mock("../../apps/remote-bridge/src/autopilot-unit-runner", () => ({
  createAutopilotUnitRunner: () => async (
    unit: { num: string },
    ctx: { resolveGate: (scopeNum: string, question: string) => Promise<{ decision: string; ledgerId: string } | undefined> },
  ) => {
    const r = await ctx.resolveGate(unit.num, "May I load production customer data into the test database?");
    return r ? { ok: true } : { ok: false };
  },
}));

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

const ledgerWrites = vi.hoisted(() => [] as Array<{ scopeNum: string; decision: string }>);
vi.mock("../../apps/remote-bridge/src/autopilot-pipeline", async () => {
  const actual = await vi.importActual<typeof import("../../apps/remote-bridge/src/autopilot-pipeline")>(
    "../../apps/remote-bridge/src/autopilot-pipeline",
  );
  return {
    ...actual,
    nodeDependentsResolver: () => async () => [],
    nodeLedgerResolver: () => async () => undefined,
    nodeLedgerWriter: () => async (scopeNum: string, _q: string, decision: string) => {
      ledgerWrites.push({ scopeNum, decision });
      return { decision, ledgerId: "ledger-1" };
    },
  };
});

import { RemoteBridge } from "../../apps/remote-bridge/src/bridge";

const AGENT = { name: "PROJECT-AGENT", projectId: "p-1", mcpUrl: "https://mcp.test", mcpToken: "tok" };
const NOTE = "The push review is still running";
const QUESTION = "is asking to run a gated action";
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async (n = 8) => {
  for (let i = 0; i < n; i++) await tick();
};

async function connectedBridge(): Promise<RemoteBridge> {
  const bridge = new RemoteBridge({
    projectName: "wxKanban",
    cwd: STATUS_DIR, // the status file goes to a temp dir, never the repo
    agent: AGENT,
    supervisor: "KAIN",
    projectAgentConfig: { mcpUrl: "https://mcp.test" } as never,
    approverLookup: async () => ({ approver: true, name: "Andy", role: "ADMIN" }),
  });
  await bridge.run();
  room.handlers?.onStatus("connected", undefined, { roomLink: "connected", since: new Date().toISOString(), failures: 0 });
  await settle(3);
  return bridge;
}

const say = (text: string, from = "Andy") => room.handlers?.onMessage({ id: String(Math.random()), from, text, ts: Date.now() });
const replayed = (text: string, from = "Andy") =>
  room.handlers?.onMessage({ id: String(Math.random()), from, text, ts: Date.now() - 120_000, replayed: true });
const notes = () => room.posts.filter((p) => p.includes(NOTE));
const questions = () => room.posts.filter((p) => p.includes(QUESTION));

/** Drive the gate as the SDK does: a PreToolUse hook call for an agent's git push. */
function askPush(): { outcome: () => string | undefined } {
  let outcome: string | undefined;
  const hook = session.gate as HookCallback;
  void (
    hook(
      { hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "git push origin main" }, tool_use_id: "t" } as never,
      "t",
      { signal: new AbortController().signal },
    ) as Promise<{ hookSpecificOutput?: { permissionDecision?: string } }>
  ).then((out) => {
    outcome = out.hookSpecificOutput?.permissionDecision === "allow" ? "allow" : "deny";
  });
  return { outcome: () => outcome };
}

beforeEach(() => {
  room.posts.length = 0;
  session.sent.length = 0;
  session.gate = undefined;
  session.interrupted = 0;
  review.calls = 0;
  review.finish = undefined;
  schedule.awaiting = false;
  schedule.scopes = [];
  ledgerWrites.length = 0;
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});
// [SCOPE 144 / T031] END

// [SCOPE 144 / T031] BEGIN — a push approval counts only after its question is posted (FR-021)
describe("push approval guard (T031, FR-021)", () => {
  it("a CONFIRMED while the review runs settles nothing, goes on as discussion, and the room is told once", async () => {
    const bridge = await connectedBridge();
    const gate = askPush();
    await settle();
    expect(review.calls).toBe(1);
    expect(questions()).toHaveLength(0);

    say("CONFIRMED");
    say("CONFIRMED", "KAIN");
    say("yes go ahead");
    say("STOP");
    await settle();
    expect(gate.outcome()).toBeUndefined();
    expect(bridge.connectionState()).toBe("waiting");
    expect(notes()).toHaveLength(1);
    expect(room.posts).not.toContain("Allowed.");
    // A control word is not acted on either; every message reaches the session labeled.
    expect(session.interrupted).toBe(0);
    expect(session.sent).toHaveLength(4);
    expect(session.sent.every((t) => t.includes("sent while the push review was still running") && t.includes("Discussion only"))).toBe(true);
    expect(session.sent.map((t) => t.split("\n").pop())).toEqual(["CONFIRMED", "CONFIRMED", "yes go ahead", "STOP"]);
    expect(session.sent[1]).toContain("Room message from KAIN");

    // The review finishes clean: the question is posted, and only a reply after it counts.
    review.finish?.({ clean: true, summary: "clean" });
    await settle();
    expect(questions()).toHaveLength(1);
    expect(gate.outcome()).toBeUndefined();
    expect(notes()).toHaveLength(1);
  });

  it("after the question is posted, a CONFIRMED settles it", async () => {
    await connectedBridge();
    const gate = askPush();
    await settle();
    say("CONFIRMED");
    await settle();
    review.finish?.({ clean: true, summary: "clean" });
    await settle();
    expect(questions()).toHaveLength(1);
    say("CONFIRMED");
    await settle();
    expect(gate.outcome()).toBe("allow");
    expect(room.posts).toContain("Allowed.");
  });

  it("an unclean review refuses the push whatever was sent during it", async () => {
    const bridge = await connectedBridge();
    const gate = askPush();
    await settle();
    say("CONFIRMED");
    await settle();
    review.finish?.({ clean: false, summary: "secret in diff" });
    await settle();
    expect(gate.outcome()).toBe("deny");
    expect(questions()).toHaveLength(0);
    expect(room.posts.some((p) => p.startsWith("Review is NOT clean"))).toBe(true);
    expect(room.posts).not.toContain("Allowed.");
    expect(bridge.connectionState()).not.toBe("waiting"); // the discussion turn may still be working
    // A later CONFIRMED has nothing to settle and is plain discussion.
    say("CONFIRMED");
    await settle();
    expect(gate.outcome()).toBe("deny");
  });

  it("a replayed CONFIRMED during the review is discussion only and posts no note", async () => {
    await connectedBridge();
    const gate = askPush();
    await settle();
    replayed("CONFIRMED");
    await settle();
    expect(notes()).toHaveLength(0);
    expect(session.sent.some((t) => t.includes("Discussion only") && t.endsWith("CONFIRMED"))).toBe(true);
    review.finish?.({ clean: true, summary: "clean" });
    await settle();
    expect(gate.outcome()).toBeUndefined();
    say("NO");
    await settle();
    expect(gate.outcome()).toBe("deny");
  });

  it("the note is once per approval: the next push's review gets its own note", async () => {
    await connectedBridge();
    const first = askPush();
    await settle();
    say("CONFIRMED");
    await settle();
    review.finish?.({ clean: true, summary: "clean" });
    await settle();
    say("NO");
    await settle();
    expect(first.outcome()).toBe("deny");
    const second = askPush();
    await settle();
    say("CONFIRMED");
    await settle();
    expect(second.outcome()).toBeUndefined();
    expect(notes()).toHaveLength(2);
  });

  it("with an Autopilot gate open and a push in review, a CONFIRMED settles neither and reaches the session as discussion", async () => {
    schedule.scopes = [{ num: "202", title: "Gate scope", stage: "implementation" }];
    schedule.awaiting = true;
    const bridge = await connectedBridge();
    say("go");
    await settle();
    expect(room.posts.some((p) => p.includes(GATE_QUESTION))).toBe(true);
    const gate = askPush();
    await settle();
    expect(review.calls).toBe(1);
    session.sent.length = 0;

    say("CONFIRMED");
    await settle();
    expect(gate.outcome()).toBeUndefined();
    expect(ledgerWrites).toHaveLength(0);
    expect(bridge.connectionState()).toBe("waiting");
    expect(notes()).toHaveLength(1);
    expect(session.sent).toHaveLength(1);
    expect(session.sent[0]).toContain("Discussion only");
    expect(session.sent[0].endsWith("CONFIRMED")).toBe(true);

    // Once the review refuses the push, the Autopilot gate is still open, and a live answer settles it.
    review.finish?.({ clean: false, summary: "not clean" });
    await settle();
    expect(gate.outcome()).toBe("deny");
    say("Yes, use synthetic data only");
    await settle();
    expect(ledgerWrites).toEqual([expect.objectContaining({ scopeNum: "202", decision: "Yes, use synthetic data only" })]);
  });
});
// [SCOPE 144 / T031] END
