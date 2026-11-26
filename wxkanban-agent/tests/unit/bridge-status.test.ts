/**
 * SPEC-159 Amendment A, T023 (FR-096) — the same state gives the same status text from the room
 * and from the local session. One temp repo holds a pending handoff, a running Autopilot run with
 * a current unit, a waiting question and devplan items left; the room's STATUS post is compared
 * with the local writer's `status` over that same folder. Room client, session, push gate and the
 * unit runner are stubbed: no socket, no network. The run-state file is real (in the temp folder).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// [SCOPE 159 / T023] BEGIN — stubs and helpers for the room-and-local status test (FR-096)
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

vi.mock("../../apps/remote-bridge/src/session", () => ({
  BridgeSession: class {
    get id() {
      return "sess-1";
    }
    async start() {
      /* noop */
    }
    send() {
      /* noop */
    }
    stop() {
      /* noop */
    }
    async interrupt() {
      /* noop */
    }
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
// The handoff file stays in the folder: no watcher picks it up, so it is still pending.
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
    skip() {
      return undefined;
    }
  },
}));

// The unit runs until the test lets it finish, so the run is live while STATUS is asked; `ask`
// raises the unit's question through the gate resolver, as a real unit session does.
const runner = vi.hoisted(() => ({
  release: undefined as undefined | (() => void),
  ask: undefined as undefined | ((question: string) => void),
}));
vi.mock("../../apps/remote-bridge/src/autopilot-unit-runner", () => ({
  createAutopilotUnitRunner:
    () => (unit: { num: string }, opts: { resolveGate: (scopeNum: string, question: string) => Promise<unknown> }) =>
      new Promise<{ ok: boolean }>((resolve) => {
        runner.release = () => resolve({ ok: true });
        runner.ask = (question) => void opts.resolveGate(unit.num, question);
      }),
}));

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

import { RemoteBridge } from "../../apps/remote-bridge/src/bridge";
import { AGENT_COMMAND_EXIT, commandDir, runAgentCommand } from "../../apps/remote-bridge/src/command-lane";

const AGENT = { name: "PROJECT-AGENT", projectId: "p-1", mcpUrl: "https://mcp.test", mcpToken: "tok" };
const MEMBER = "u-member";
const NOW = new Date("2026-11-26T15:00:00.000Z");
const STARTED = new Date(NOW.getTime() - 12 * 60_000);
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async (n = 8) => {
  for (let i = 0; i < n; i++) await tick();
};
const say = (text: string) => room.handlers?.onMessage({ id: String(Math.random()), from: "Tom", text, ts: Date.now(), authorId: MEMBER });
const statusPost = (): string | undefined => room.posts.find((p) => p.startsWith("Status — "));

/** A temp repo: the run's startup list, one pending handoff. */
function repo(): string {
  const cwd = mkdtempSync(join(tmpdir(), "bridge-status-"));
  mkdirSync(join(cwd, "docs"), { recursive: true });
  writeFileSync(
    join(cwd, "docs", "GOD-State-Autopilot.json"),
    JSON.stringify({
      mode: "autopilot",
      skips: [],
      startupList: [
        { scope: "200", title: "First", status: "waiting" },
        { scope: "201", title: "Second", status: "waiting" },
        { scope: "202", title: "Third", status: "waiting" },
      ],
    }),
    "utf8",
  );
  mkdirSync(join(cwd, ".wxai", "handoff"), { recursive: true });
  writeFileSync(join(cwd, ".wxai", "handoff", "20261126T143000000Z.md"), "handoff body", "utf8");
  return cwd;
}

async function connectedBridge(cwd: string): Promise<RemoteBridge> {
  const bridge = new RemoteBridge({
    projectName: "wxKanban",
    cwd,
    agent: AGENT,
    supervisor: "KAIN",
    projectAgentConfig: { mcpUrl: "https://mcp.test" } as never,
    approverLookup: async (id) =>
      id === MEMBER ? { approver: true, name: "Tom Member", role: "TEAM_MEMBER" } : { approver: false, name: null, role: null },
  });
  await bridge.run();
  room.handlers?.onStatus("connected", undefined, { roomLink: "connected", since: new Date().toISOString(), failures: 0 });
  await settle(3);
  return bridge;
}

beforeEach(() => {
  room.posts.length = 0;
  schedule.awaiting = false;
  schedule.scopes = [];
  runner.release = undefined;
  runner.ask = undefined;
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(STARTED);
});

afterEach(async () => {
  runner.release?.();
  await settle();
  vi.useRealTimers();
});
// [SCOPE 159 / T023] END

// [SCOPE 159 / T023] BEGIN — same state, same text: the room's STATUS and the local status (FR-096)
describe("FR-096 status from one builder, room and local", () => {
  it("a pending handoff, a running run with its unit, a waiting question and items left: the same text from both places", async () => {
    const cwd = repo();
    const bridge = await connectedBridge(cwd);
    // A running run: "go" on a waiting devplan list; the unit starts at STARTED and keeps running.
    schedule.scopes = [{ num: "200", title: "First", stage: "implementation" }];
    schedule.awaiting = true;
    say("go");
    await settle();
    expect(runner.release).toBeDefined();
    // A waiting question: the running unit asks one; the ledger has no answer, so it waits on the room.
    runner.ask?.("Which table should hold the audit rows?");
    await settle();
    // The Project Agent's lock, as the launcher writes it.
    writeFileSync(join(cwd, ".wxai", "remote-session.lock"), JSON.stringify({ pid: process.pid, owner: "project agent" }), "utf8");

    vi.setSystemTime(NOW);
    room.posts.length = 0;
    say("status");
    await settle();
    const fromRoom = statusPost();
    expect(fromRoom).toBeDefined();
    const local = runAgentCommand(["status"], { repoRoot: cwd, pidAlive: () => true, now: () => NOW });
    expect(local.code).toBe(AGENT_COMMAND_EXIT.sent);
    expect(local.lines.join("\n")).toBe(fromRoom);
    expect(existsSync(commandDir(cwd))).toBe(false);

    expect((fromRoom ?? "").split("\n")).toEqual([
      "Status — the Project Agent is running (waiting).",
      "Handoffs pending: 1 (oldest waiting 30m).",
      "Autopilot run: working on SCOPE-200 — First (12m so far).",
      'Waiting on an answer — SCOPE-200: "Which table should hold the audit rows?"',
      "Devplan items left: 3 — SCOPE-200, SCOPE-201, SCOPE-202.",
    ]);

    // Room STATUS and a lane-delivered status agree.
    room.posts.length = 0;
    expect(bridge.receiveLocalCommand("status")).toBe(true);
    await settle();
    expect(statusPost()).toBe(fromRoom);
  });

  it("with nothing outstanding the room and the local session both give one line", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "bridge-status-empty-"));
    await connectedBridge(cwd);
    mkdirSync(join(cwd, ".wxai"), { recursive: true });
    writeFileSync(join(cwd, ".wxai", "remote-session.lock"), JSON.stringify({ pid: process.pid, owner: "project agent" }), "utf8");
    vi.setSystemTime(NOW);
    room.posts.length = 0;
    say("status");
    await settle();
    const fromRoom = statusPost() ?? "";
    expect(fromRoom.split("\n")).toHaveLength(1);
    expect(fromRoom.endsWith("Nothing outstanding.")).toBe(true);
    expect(runAgentCommand(["status"], { repoRoot: cwd, pidAlive: () => true, now: () => NOW }).lines).toEqual([fromRoom]);
  });
});
// [SCOPE 159 / T023] END
