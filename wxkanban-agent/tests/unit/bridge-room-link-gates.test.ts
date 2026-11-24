/**
 * SPEC-144 Amendment B, T026 (FR-020) — a message YappChatt replays after a drop is discussion
 * only, and every gate still waiting is asked again once on reconnect. Room client, session,
 * Autopilot schedule and unit runner are all stubbed: no socket, no network, no files.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HookCallback } from "@anthropic-ai/claude-agent-sdk";

import { mkdtempSync } from "fs"; // [SCOPE 144 / T027]
import { tmpdir } from "os"; // [SCOPE 144 / T027]
import { join } from "path"; // [SCOPE 144 / T027]
const STATUS_DIR = mkdtempSync(join(tmpdir(), "room-link-status-")); // [SCOPE 144 / T027]

// [SCOPE 144 / T026] BEGIN — stubs and helpers for the replay and re-ask tests
// MODIFIED-BY: [SCOPE 144 / T030] — statuses carry the client's real link info; an optional repo and approver lookup
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

// No triage run, no hand-off folder watcher: neither belongs to this test, and both touch disk.
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

vi.mock("../../apps/remote-bridge/src/autopilot-skip", async () => {
  const actual = await vi.importActual<typeof import("../../apps/remote-bridge/src/autopilot-skip")>(
    "../../apps/remote-bridge/src/autopilot-skip",
  );
  return {
    ...actual,
    loadAutopilotState: () => ({ mode: "autopilot" as const, skips: [], units: [] }),
    saveAutopilotState: () => undefined,
    runSkipCascade: async () => ({
      message: "SCOPE-200 skipped. Its dependents: SCOPE-201. Reply keep or keep none.",
      state: { mode: "autopilot" as const, skips: [], units: [] },
    }),
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
import type { ApproverLookup } from "../../apps/remote-bridge/src/decision-reply"; // [SCOPE 144 / T030]
import { createRoomLinkLogger } from "../../apps/remote-bridge/src/room-link"; // [SCOPE 144 / T030]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"; // [SCOPE 144 / T030]

const AGENT = { name: "PROJECT-AGENT", projectId: "p-1", mcpUrl: "https://mcp.test", mcpToken: "tok" };
const REASK = "Asking again";
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async (n = 8) => {
  for (let i = 0; i < n; i++) await tick();
};

async function connectedBridge(over: { cwd?: string; approverLookup?: ApproverLookup } = {}): Promise<RemoteBridge> {
  const bridge = new RemoteBridge({
    projectName: "wxKanban",
    cwd: over.cwd ?? STATUS_DIR, // [SCOPE 144 / T027] the status file goes to a temp dir, never the repo
    agent: AGENT,
    supervisor: "KAIN",
    projectAgentConfig: { mcpUrl: "https://mcp.test" } as never,
    approverLookup: over.approverLookup ?? (async () => ({ approver: true, name: "Andy", role: "ADMIN" })),
  });
  await bridge.run();
  room.handlers?.onStatus("connected", undefined, { roomLink: "connected", since: new Date().toISOString(), failures: 0 });
  await settle(3);
  return bridge;
}

const say = (text: string, from = "Andy") => room.handlers?.onMessage({ id: String(Math.random()), from, text, ts: Date.now() });
const replayed = (text: string, from = "Andy") =>
  room.handlers?.onMessage({ id: String(Math.random()), from, text, ts: Date.now() - 120_000, replayed: true });

/** A drop and a reconnect, as the client reports them. */
async function dropAndReconnect(): Promise<void> {
  const lostAt = new Date(Date.now() - 20_000).toISOString();
  const backAt = new Date().toISOString();
  room.handlers?.onStatus("reconnecting", "socket closed", { roomLink: "reconnecting", since: lostAt, failures: 0, reason: "socket closed" });
  room.handlers?.onStatus("connected", undefined, {
    roomLink: "connected",
    since: backAt,
    failures: 0,
    outageStartedAt: lostAt,
    outageEndedAt: backAt,
  });
  await settle(2);
}

const reasks = () => room.posts.filter((p) => p.includes(REASK));

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

beforeEach(() => {
  room.posts.length = 0;
  session.sent.length = 0;
  session.gate = undefined;
  session.interrupted = 0;
  pushes.count = 0;
  runnerCalls.length = 0;
  ledgerWrites.length = 0;
  schedule.awaiting = false;
  schedule.scopes = [];
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});
// [SCOPE 144 / T026] END

// [SCOPE 144 / T026] BEGIN — replayed replies settle nothing; each waiting gate is re-asked once
describe("replayed messages and the reconnect re-ask (T026, FR-020)", () => {
  it("push approval: a replayed CONFIRMED settles nothing; one re-ask; a reply after it pushes", async () => {
    const bridge = await connectedBridge();
    say("PUSH");
    await settle();
    expect(room.posts.some((p) => p.startsWith("Do you want me to push main → origin?"))).toBe(true);
    await dropAndReconnect();
    expect(reasks()).toHaveLength(1);
    expect(reasks()[0]).toContain("push main → origin");
    replayed("CONFIRMED");
    await settle();
    expect(pushes.count).toBe(0);
    expect(bridge.connectionState()).toBe("waiting");
    expect(session.sent.some((t) => t.includes("Discussion only") && t.endsWith("CONFIRMED"))).toBe(true);
    say("CONFIRMED");
    await settle();
    expect(pushes.count).toBe(1);
    expect(reasks()).toHaveLength(1);
  });

  it("gated action: a replayed CONFIRMED settles nothing; one re-ask; a reply after it allows", async () => {
    await connectedBridge();
    let outcome: string | undefined;
    void askGate("git push origin main").then((o) => (outcome = o));
    await settle();
    expect(room.posts.some((p) => p.includes("is asking to run a gated action"))).toBe(true);
    await dropAndReconnect();
    expect(reasks()).toHaveLength(1);
    expect(reasks()[0]).toContain("is asking to run a gated action");
    replayed("CONFIRMED");
    replayed("NO");
    await settle();
    expect(outcome).toBeUndefined();
    say("CONFIRMED");
    await settle();
    expect(outcome).toBe("allow");
  });

  it("a live reply received before the drop still counts, and nothing is re-asked", async () => {
    await connectedBridge();
    let outcome: string | undefined;
    void askGate("git push origin main").then((o) => (outcome = o));
    await settle();
    say("NO");
    await settle();
    expect(outcome).toBe("deny");
    await dropAndReconnect();
    expect(reasks()).toHaveLength(0);
  });

  it("Autopilot gate question: a replayed answer is not recorded; one re-ask; a reply after it is", async () => {
    schedule.scopes = [{ num: "202", title: "Gate scope", stage: "implementation" }];
    schedule.awaiting = true;
    await connectedBridge();
    say("go");
    await settle();
    expect(room.posts.some((p) => p.includes(GATE_QUESTION))).toBe(true);
    await dropAndReconnect();
    expect(reasks()).toHaveLength(1);
    expect(reasks()[0]).toContain(GATE_QUESTION);
    replayed("Yes, use synthetic data only");
    await settle();
    expect(ledgerWrites).toHaveLength(0);
    say("Yes, use synthetic data only");
    await settle();
    expect(ledgerWrites).toEqual([expect.objectContaining({ scopeNum: "202", decision: "Yes, use synthetic data only" })]);
  });

  it("Autopilot go: a replayed go starts nothing; one re-ask; a go after it starts the run", async () => {
    schedule.scopes = [{ num: "200", title: "First", stage: "implementation" }];
    schedule.awaiting = true;
    await connectedBridge();
    await dropAndReconnect();
    expect(reasks()).toHaveLength(1);
    expect(reasks()[0]).toContain('Reply "go"');
    replayed("go");
    await settle();
    expect(runnerCalls).toEqual([]);
    say("go");
    await settle();
    expect(runnerCalls).toEqual(["200"]);
  });

  it("skip cascade: a replayed keep none is not applied; one re-ask per waiting kind; a reply after it is", async () => {
    schedule.scopes = [
      { num: "200", title: "First", stage: "implementation" },
      { num: "201", title: "Second", stage: "implementation" },
    ];
    schedule.awaiting = true;
    await connectedBridge();
    say("skip 200");
    await settle();
    await dropAndReconnect();
    // Both the cascade question and the startup list's go are waiting: each is asked once.
    expect(reasks()).toHaveLength(2);
    expect(reasks().filter((p) => p.includes('"keep none"'))).toHaveLength(1);
    expect(reasks().filter((p) => p.includes('Reply "go"'))).toHaveLength(1);
    replayed("keep none");
    await settle();
    expect(room.posts).not.toContain("Skipping all dependent scopes too.");
    say("keep none");
    await settle();
    expect(room.posts).toContain("Skipping all dependent scopes too.");
  });

  it("a replayed control word is discussion only: STOP interrupts nothing", async () => {
    await connectedBridge();
    replayed("STOP");
    await settle();
    expect(session.interrupted).toBe(0);
    expect(session.sent.some((t) => t.includes("Replayed room message from Andy") && t.endsWith("STOP"))).toBe(true);
  });

  it("a reconnect with nothing waiting re-asks nothing", async () => {
    await connectedBridge();
    await dropAndReconnect();
    expect(reasks()).toHaveLength(0);
  });
});
// [SCOPE 144 / T026] END

// [SCOPE 144 / T030] BEGIN — a replayed DQ answer or KR verdict records nothing (FR-020, FR-008)
/** A temp repo with an Ask Gate whose scripts log each run, one open question and one KAIN reply. */
function askgateRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "room-link-askgate-"));
  mkdirSync(join(dir, "_wxAI", "askgate"), { recursive: true });
  mkdirSync(join(dir, "docs"), { recursive: true });
  mkdirSync(join(dir, "decisions"), { recursive: true });
  const script = (name: string) =>
    [
      'import { appendFileSync } from "fs";',
      `appendFileSync("ran.log", "${name} " + process.argv.slice(2).join(" ") + "\\n");`,
      'console.log(JSON.stringify({ ok: true, ledgerId: "L-0001", releases: [], recheck: [], verdict: "approved" }));',
    ].join("\n");
  writeFileSync(join(dir, "_wxAI", "askgate", "route.mjs"), script("route.mjs"));
  writeFileSync(join(dir, "_wxAI", "askgate", "kain.mjs"), script("kain.mjs"));
  writeFileSync(join(dir, "docs", "GOD-State.json"), JSON.stringify({ decisionQueue: [{ id: "DQ-01", status: "open" }] }));
  writeFileSync(join(dir, "decisions", "kain-replies.yaml"), '- id: "KR-0001"\n');
  return dir;
}

describe("a replayed decision reply (T030, FR-020)", () => {
  it("a replayed DQ answer or KR verdict settles nothing; the same answer live is recorded", async () => {
    const dir = askgateRepo();
    const lookup = vi.fn<ApproverLookup>(async () => ({ approver: true, name: "Andy", role: "ADMIN" }));
    await connectedBridge({ cwd: dir, approverLookup: lookup });
    const old = Date.now() - 120_000;
    room.handlers?.onMessage({ id: "r1", from: "Andy", authorId: "u-andy", text: "DQ-01: use synthetic data", ts: old, replayed: true });
    room.handlers?.onMessage({ id: "r2", from: "Andy", authorId: "u-andy", text: "KR-0001 approve", ts: old, replayed: true });
    await settle();
    await new Promise((r) => setTimeout(r, 300)); // room for a script run, had one started
    expect(lookup).not.toHaveBeenCalled();
    expect(existsSync(join(dir, "ran.log"))).toBe(false);
    expect(room.posts.some((p) => p.startsWith("Recorded") || p.startsWith("Not recorded"))).toBe(false);
    expect(session.sent.filter((t) => t.includes("Replayed room message from Andy"))).toHaveLength(2);
    // The control: the same answer, live, is checked and recorded, so the set-up above is real.
    room.handlers?.onMessage({ id: "r3", from: "Andy", authorId: "u-andy", text: "DQ-01: use synthetic data", ts: Date.now() });
    await vi.waitFor(() => expect(existsSync(join(dir, "ran.log"))).toBe(true), { timeout: 10_000, interval: 50 });
    await vi.waitFor(() => expect(room.posts.some((p) => p.startsWith("Recorded your answer to DQ-01"))).toBe(true), { timeout: 10_000, interval: 50 });
    expect(lookup).toHaveBeenCalledWith("u-andy");
    expect(readFileSync(join(dir, "ran.log"), "utf-8")).toContain("route.mjs answer --dq DQ-01 --answer use synthetic data --approved-by Andy");
  });

  it("a decision reply that throws is logged through Pino, masked, and records nothing", async () => {
    const dir = askgateRepo();
    const secret = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdef";
    const lines: string[] = [];
    const bridge = new RemoteBridge({
      projectName: "wxKanban",
      cwd: dir,
      agent: AGENT,
      supervisor: "KAIN",
      projectAgentConfig: { mcpUrl: "https://mcp.test" } as never,
      roomLinkLogger: createRoomLinkLogger({ write: (l: string) => void lines.push(l) }),
      approverLookup: async () => {
        throw new Error(`lookup failed with yc_session=${secret}`);
      },
    });
    await bridge.run();
    room.handlers?.onStatus("connected", undefined, { roomLink: "connected", since: new Date().toISOString(), failures: 0 });
    await settle(3);
    room.handlers?.onMessage({ id: "r4", from: "Andy", authorId: "u-andy", text: "DQ-01: yes", ts: Date.now() });
    await vi.waitFor(() => expect(lines.some((l) => l.includes('"event":"decision-failed"'))).toBe(true), { timeout: 5_000, interval: 20 });
    expect(lines.join("\n")).not.toContain(secret);
    expect(existsSync(join(dir, "ran.log"))).toBe(false);
    expect(room.posts.some((p) => p.startsWith("Recorded"))).toBe(false);
  });
});
// [SCOPE 144 / T030] END
