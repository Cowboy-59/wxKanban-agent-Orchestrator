/**
 * SPEC-159 Amendment A, T022 (FR-095) — one command list for the room and the local session.
 * The same text typed in the room and sent down the local command lane reaches the same handling.
 * A word added to the list works in both places; a word not on it is refused by both. The safety
 * limit: a lane command never settles a waiting push or approval, and lane push never starts the
 * push gate. Room client, session, push gate and Autopilot are stubbed: no socket, no network.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HookCallback } from "@anthropic-ai/claude-agent-sdk";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// [SCOPE 159 / T022] BEGIN — stubs and helpers for the room-and-lane tests (FR-095)
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

const session = vi.hoisted(() => ({ gate: undefined as HookCallback | undefined, sent: [] as string[], interrupts: 0 }));
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
      session.interrupts++;
    }
  },
}));

const pushes = vi.hoisted(() => ({ count: 0, reviews: 0 }));
vi.mock("../../apps/remote-bridge/src/push-gate", () => ({
  runReview: async () => {
    pushes.reviews++;
    return { clean: true, summary: "clean" };
  },
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
  lockPath: (repoRoot: string) => join(repoRoot, ".wxai", "remote-session.lock"),
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

const runnerCalls = vi.hoisted(() => [] as string[]);
vi.mock("../../apps/remote-bridge/src/autopilot-unit-runner", () => ({
  createAutopilotUnitRunner: () => async (unit: { num: string }) => {
    runnerCalls.push(unit.num);
    return { ok: true };
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

vi.mock("../../apps/remote-bridge/src/autopilot-pipeline", async () => {
  const actual = await vi.importActual<typeof import("../../apps/remote-bridge/src/autopilot-pipeline")>(
    "../../apps/remote-bridge/src/autopilot-pipeline",
  );
  return {
    ...actual,
    nodeDependentsResolver: () => async () => [],
    nodeLedgerResolver: () => async () => undefined,
    nodeLedgerWriter: () => async (_s: string, _q: string, decision: string) => ({ decision, ledgerId: "ledger-1" }),
  };
});

// "Adding a word to the list": the list itself is frozen, so this file adds "halt" as another
// spelling of stop at the one place every reader asks (resolveCommand). Nothing else is changed:
// the room switch, the lane and the writer must all pick it up from there.
const ADDED = "halt";
vi.mock("../../apps/remote-bridge/src/command-set", async () => {
  const actual = await vi.importActual<typeof import("../../apps/remote-bridge/src/command-set")>(
    "../../apps/remote-bridge/src/command-set",
  );
  return {
    ...actual,
    resolveCommand: (text: string) =>
      actual.normalizeCommandText(text) === "halt" ? actual.resolveCommand("stop") : actual.resolveCommand(text),
  };
});

import { RemoteBridge } from "../../apps/remote-bridge/src/bridge";
import { LANE_PUSH_NOTE, runAgentCommand, AGENT_COMMAND_EXIT } from "../../apps/remote-bridge/src/command-lane";
import type { ApproverLookup } from "../../apps/remote-bridge/src/decision-reply";

const AGENT = { name: "PROJECT-AGENT", projectId: "p-1", mcpUrl: "https://mcp.test", mcpToken: "tok" };
const MEMBER = "u-member";
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async (n = 8) => {
  for (let i = 0; i < n; i++) await tick();
};

const lookup: ApproverLookup = async (id) =>
  id === MEMBER ? { approver: true, name: "Tom Member", role: "TEAM_MEMBER" } : { approver: false, name: null, role: null };

async function connectedBridge(): Promise<RemoteBridge> {
  const bridge = new RemoteBridge({
    projectName: "wxKanban",
    cwd: mkdtempSync(join(tmpdir(), "bridge-command-lane-")),
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

const say = (text: string) => room.handlers?.onMessage({ id: String(Math.random()), from: "Tom", text, ts: Date.now(), authorId: MEMBER });

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

/** What a command did: what the room saw, what the session got, and the side effects. */
function effect(): { posts: string[]; sent: string[]; interrupts: number; runner: string[] } {
  return { posts: [...room.posts], sent: [...session.sent], interrupts: session.interrupts, runner: [...runnerCalls] };
}

function reset(): void {
  room.posts.length = 0;
  session.sent.length = 0;
  session.interrupts = 0;
  pushes.count = 0;
  pushes.reviews = 0;
  runnerCalls.length = 0;
  schedule.awaiting = false;
  schedule.scopes = [];
}

/** Run `text` once in the room and once down the lane, each on a fresh bridge, and return both effects. */
async function bothWays(text: string, before?: () => void): Promise<{ room: ReturnType<typeof effect>; lane: ReturnType<typeof effect> }> {
  reset();
  before?.();
  await connectedBridge();
  room.posts.length = 0;
  say(text);
  await settle();
  const viaRoom = effect();
  reset();
  before?.();
  const b = await connectedBridge();
  room.posts.length = 0;
  expect(b.receiveLocalCommand(text)).toBe(true);
  await settle();
  return { room: viaRoom, lane: effect() };
}

beforeEach(() => {
  reset();
  session.gate = undefined;
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});
// [SCOPE 159 / T022] END

// [SCOPE 159 / T022] BEGIN — the same text in the room and down the lane reaches the same handling (FR-095)
describe("FR-095 one list, both places", () => {
  it("status, verbose, concise, stop and continue do the same thing from the room and the lane", async () => {
    for (const text of ["status", "VERBOSE", "concise.", "Stop", "continue"]) {
      const { room: r, lane: l } = await bothWays(text);
      expect(l).toEqual(r);
      expect(r.posts.length + r.sent.length + r.interrupts).toBeGreaterThan(0);
    }
  });

  it("go starts a waiting devplan list from either place", async () => {
    const { room: r, lane: l } = await bothWays("go", () => {
      schedule.scopes = [{ num: "200", title: "First", stage: "implementation" }];
      schedule.awaiting = true;
    });
    expect(r.runner).toEqual(["200"]);
    expect(l.runner).toEqual(["200"]);
  });

  it("a word added to the list works in both places, and in the writer, with no second edit", async () => {
    const { room: r, lane: l } = await bothWays(ADDED);
    expect(r.interrupts).toBe(1);
    expect(l).toEqual(r);
    expect(runAgentCommand([ADDED], { repoRoot: mkdtempSync(join(tmpdir(), "added-word-")) }).code).toBe(AGENT_COMMAND_EXIT.notRunning);
  });

  it("a word not on the list is refused by both: the room runs no control, the lane takes nothing", async () => {
    const b = await connectedBridge();
    room.posts.length = 0;
    say("frobnicate");
    await settle();
    expect(session.interrupts).toBe(0);
    expect(room.posts).toEqual([]); // no control reply: it is ordinary text to the session
    session.sent.length = 0;
    expect(b.receiveLocalCommand("frobnicate")).toBe(false);
    expect(b.receiveLocalCommand("CONFIRMED")).toBe(false);
    await settle();
    expect(session.sent).toEqual([]);
    expect(runAgentCommand(["frobnicate"], { repoRoot: mkdtempSync(join(tmpdir(), "unknown-word-")) }).code).toBe(
      AGENT_COMMAND_EXIT.notACommand,
    );
  });

  it("transfer to agent and cancel remote are not taken from the lane", async () => {
    const b = await connectedBridge();
    expect(b.receiveLocalCommand("transfer to agent")).toBe(false);
    expect(b.receiveLocalCommand("cancel remote")).toBe(false);
  });
});
// [SCOPE 159 / T022] END

// [SCOPE 159 / T022] BEGIN — the safety limit: push and CONFIRMED are a person's, in the room (FR-095)
describe("FR-095 the lane never settles a push or an approval", () => {
  it("lane push never starts the push gate; the room is told in one line", async () => {
    const b = await connectedBridge();
    room.posts.length = 0;
    b.receiveLocalCommand("push");
    await settle();
    expect(pushes.reviews).toBe(0);
    expect(pushes.count).toBe(0);
    expect(room.posts).toEqual([LANE_PUSH_NOTE]);
  });

  it("a waiting push: a lane go or no settles nothing; a person's CONFIRMED in the room pushes", async () => {
    const b = await connectedBridge();
    say("PUSH");
    await settle();
    expect(room.posts.some((p) => p.startsWith("Do you want me to push main → origin?"))).toBe(true);
    room.posts.length = 0;
    b.receiveLocalCommand("go");
    b.receiveLocalCommand("no");
    await settle();
    expect(pushes.count).toBe(0);
    expect(room.posts).toEqual([LANE_PUSH_NOTE, LANE_PUSH_NOTE]);
    expect(room.posts.some((p) => p === "push cancelled")).toBe(false);
    say("CONFIRMED");
    await settle();
    expect(pushes.count).toBe(1);
  });

  it("a waiting approval: a lane no settles nothing; a person's CONFIRMED in the room allows", async () => {
    const b = await connectedBridge();
    let outcome: string | undefined;
    void askGate("git push origin main").then((o) => (outcome = o));
    await settle();
    room.posts.length = 0;
    b.receiveLocalCommand("no");
    await settle();
    expect(outcome).toBeUndefined();
    expect(room.posts).toEqual([LANE_PUSH_NOTE]);
    say("CONFIRMED");
    await settle();
    expect(outcome).toBe("allow");
  });
});
// [SCOPE 159 / T022] END
