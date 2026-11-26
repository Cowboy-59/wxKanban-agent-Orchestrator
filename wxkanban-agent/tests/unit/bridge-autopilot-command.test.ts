/**
 * SPEC-159 Amendment A, T024 (FR-097) — "autopilot" lists the devplan, "go" runs it, the same way
 * from the room and from the local session. One temp repo per path; the room client, session, push
 * gate and unit runner are stubbed, the schedule posts the real startup list. The run-state file
 * and the panel snapshot are real (in the temp folder). The lane's watcher is replaced by the test,
 * which hands each written command file to the bridge's lane entry itself: no timer, no socket.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// [SCOPE 159 / T024] BEGIN — stubs and helpers for the room-and-local autopilot test (FR-097)
const room = vi.hoisted(() => ({
  posts: [] as string[],
  sent: [] as string[],
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
    send(text: string) {
      room.sent.push(text);
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
vi.mock("../../apps/remote-bridge/src/autopilot-startup", async () => {
  const actual = await vi.importActual<typeof import("../../apps/remote-bridge/src/autopilot-startup")>(
    "../../apps/remote-bridge/src/autopilot-startup",
  );
  return { ...actual, fetchScopeStage: async () => undefined };
});

// The lane's watcher is the test's own delivery (deliverLane), so nothing scans on a timer.
vi.mock("../../apps/remote-bridge/src/command-lane", async () => {
  const actual = await vi.importActual<typeof import("../../apps/remote-bridge/src/command-lane")>(
    "../../apps/remote-bridge/src/command-lane",
  );
  return {
    ...actual,
    CommandLane: class {
      start() {
        /* delivered by the test */
      }
      stop() {
        /* noop */
      }
    },
  };
});

// The gate is read from `schedule.gateOn` at each start; the list it posts is the real startup list.
const schedule = vi.hoisted(() => ({
  gateOn: true,
  starts: 0,
  scopes: [] as Array<{ num: string; title: string; stage: string }>,
}));
vi.mock("../../apps/remote-bridge/src/autopilot-schedule", async () => {
  const startup = await vi.importActual<typeof import("../../apps/remote-bridge/src/autopilot-startup")>(
    "../../apps/remote-bridge/src/autopilot-startup",
  );
  type Scope = { num: string; title: string; stage: string };
  return {
    AutopilotSchedule: class {
      private awaiting = false;
      private listed: Scope[] | undefined;
      private readonly post: (t: string) => Promise<void>;
      constructor(opts: { post: (t: string) => Promise<void> }) {
        this.post = opts.post;
      }
      get isAwaitingGo() {
        return this.awaiting;
      }
      get pendingScopes() {
        return this.awaiting ? this.listed : undefined;
      }
      async start(): Promise<Scope[] | null | undefined> {
        schedule.starts += 1;
        if (!schedule.gateOn) return undefined;
        const scopes = schedule.scopes.map((s) => ({ ...s }));
        if (scopes.length === 0) {
          await this.post(startup.NOTHING_TO_DO_MESSAGE);
          return scopes;
        }
        this.listed = scopes;
        this.awaiting = true;
        await this.post(startup.formatStartupList(scopes));
        return scopes;
      }
      confirmGo() {
        if (!this.awaiting) return undefined;
        this.awaiting = false;
        return this.listed;
      }
      skip() {
        return undefined;
      }
    },
  };
});

// Each unit is recorded and runs until the test ends, so the run is live while status is asked.
const runner = vi.hoisted(() => ({ units: [] as string[], releases: [] as Array<() => void> }));
vi.mock("../../apps/remote-bridge/src/autopilot-unit-runner", () => ({
  createAutopilotUnitRunner: () => (unit: { num: string }) =>
    new Promise<{ ok: boolean }>((resolve) => {
      runner.units.push(unit.num);
      runner.releases.push(() => resolve({ ok: true }));
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
import {
  AGENT_COMMAND_EXIT,
  AUTOPILOT_GO_LINE,
  NOTHING_WAITING_LINE,
  agentCommand,
  commandDir,
  parseCommandFile,
  runAgentCommand,
} from "../../apps/remote-bridge/src/command-lane";
import { AUTOPILOT_STATE_PATH, loadAutopilotState } from "../../apps/remote-bridge/src/autopilot-skip";
import { formatStartupList } from "../../apps/remote-bridge/src/autopilot-startup";
import { resolveCommand } from "../../apps/remote-bridge/src/command-set";
import { isRunDevplan } from "../../apps/remote-bridge/src/instruction-intake";

const AGENT = { name: "PROJECT-AGENT", projectId: "p-1", mcpUrl: "https://mcp.test", mcpToken: "tok" };
const MEMBER = "u-member";
const NOW = new Date("2026-11-26T15:00:00.000Z");
const STARTED = new Date(NOW.getTime() - 12 * 60_000);
const SCOPES = [
  { num: "200", title: "First", stage: "implementation" },
  { num: "201", title: "Second", stage: "Design" },
];
const LIST = formatStartupList(SCOPES.map((s) => ({ ...s })));
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async (n = 10) => {
  for (let i = 0; i < n; i++) await tick();
};
const say = (text: string) => room.handlers?.onMessage({ id: String(Math.random()), from: "Tom", text, ts: Date.now(), authorId: MEMBER });
const statusPost = (): string | undefined => room.posts.find((p) => p.startsWith("Status — "));
const stateFile = (cwd: string): string => readFileSync(join(cwd, AUTOPILOT_STATE_PATH), "utf8");

function repo(): string {
  const cwd = mkdtempSync(join(tmpdir(), "bridge-autopilot-"));
  mkdirSync(join(cwd, "docs"), { recursive: true });
  mkdirSync(join(cwd, ".wxai"), { recursive: true });
  // The Project Agent's lock, as the launcher writes it.
  writeFileSync(join(cwd, ".wxai", "remote-session.lock"), JSON.stringify({ pid: process.pid, owner: "project agent" }), "utf8");
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
  await settle();
  return bridge;
}

/** The lane's watcher, run by hand: every waiting command file goes to the bridge's lane entry once. */
async function deliverLane(cwd: string, bridge: RemoteBridge): Promise<void> {
  const dir = commandDir(cwd);
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir).sort()) {
    const parsed = parseCommandFile(readFileSync(join(dir, name), "utf8"));
    rmSync(join(dir, name));
    if (parsed) bridge.receiveLocalCommand(parsed.body);
  }
  await settle();
}

interface RunSeen {
  cwd: string;
  listed: string[];
  starting: string[];
  units: string[];
  state: string;
  roomStatus: string | undefined;
  localStatus: string[];
}

/** Connect with the gate off, then "autopilot" and "go" from one place, then status at NOW from both. */
async function runFrom(via: "room" | "lane"): Promise<RunSeen> {
  vi.setSystemTime(STARTED);
  schedule.gateOn = false;
  const cwd = repo();
  const bridge = await connectedBridge(cwd);
  schedule.gateOn = true;
  schedule.scopes = SCOPES.map((s) => ({ ...s }));
  room.posts.length = 0;
  runner.units.length = 0;
  if (via === "room") {
    say("autopilot");
    await settle();
    say("go");
    await settle();
  } else {
    const listed = await agentCommand(["autopilot"], {
      repoRoot: cwd,
      pidAlive: () => true,
      sleep: () => deliverLane(cwd, bridge),
    });
    expect(listed.lines).toEqual([...LIST.split("\n"), "", AUTOPILOT_GO_LINE]);
    const go = await agentCommand(["go"], { repoRoot: cwd, pidAlive: () => true });
    expect(go).toEqual({ code: AGENT_COMMAND_EXIT.sent, lines: ["Sent to the Project Agent: go."] });
    await deliverLane(cwd, bridge);
  }
  const listed = room.posts.filter((p) => p === LIST);
  const starting = room.posts.filter((p) => p.startsWith("Autopilot: starting"));
  const units = [...runner.units];
  const state = stateFile(cwd);
  vi.setSystemTime(NOW);
  room.posts.length = 0;
  say("status");
  await settle();
  const roomStatus = statusPost();
  const localStatus = runAgentCommand(["status"], { repoRoot: cwd, pidAlive: () => true, now: () => NOW }).lines;
  return { cwd, listed, starting, units, state, roomStatus, localStatus };
}

beforeEach(() => {
  room.posts.length = 0;
  room.sent.length = 0;
  schedule.gateOn = true;
  schedule.starts = 0;
  schedule.scopes = [];
  runner.units.length = 0;
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(STARTED);
});

afterEach(async () => {
  for (const release of runner.releases.splice(0)) release();
  await settle();
  vi.useRealTimers();
});
// [SCOPE 159 / T024] END

// [SCOPE 159 / T024] BEGIN — autopilot lists the devplan, go runs it, the same from the room and the local session (FR-097)
describe("FR-097 the command words", () => {
  it('"autopilot", "Autopilot." and "run devplan" start the list; "autopilot now" does not', () => {
    for (const text of ["autopilot", "Autopilot.", "run devplan"]) {
      expect(resolveCommand(text)?.name).toBe("autopilot");
      expect(isRunDevplan(text)).toBe(true);
    }
    expect(resolveCommand("autopilot now")).toBeNull();
    expect(isRunDevplan("autopilot now")).toBe(false);
  });

  it('in the room "Autopilot." posts the list and never reaches the session; "autopilot now" is an ordinary instruction', async () => {
    schedule.gateOn = false;
    await connectedBridge(repo());
    schedule.gateOn = true;
    schedule.scopes = SCOPES.map((s) => ({ ...s }));
    const base = schedule.starts;
    say("Autopilot.");
    await settle();
    expect(schedule.starts).toBe(base + 1);
    expect(room.posts).toContain(LIST);
    expect(room.sent).not.toContain("Autopilot.");

    const after = schedule.starts;
    say("autopilot now");
    await settle();
    expect(schedule.starts).toBe(after);
    expect(room.sent).toContain("autopilot now");
  });
});

describe("FR-097 autopilot then go, from the room and from the local session", () => {
  it("room and lane autopilot then go start the same run", async () => {
    const fromRoom = await runFrom("room");
    const fromLane = await runFrom("lane");
    expect(fromRoom.listed).toEqual([LIST]);
    expect(fromLane.listed).toEqual(fromRoom.listed);
    expect(fromRoom.starting).toEqual(["Autopilot: starting on 2 scopes."]);
    expect(fromLane.starting).toEqual(fromRoom.starting);
    expect(fromRoom.units).toEqual(["200"]);
    expect(fromLane.units).toEqual(fromRoom.units);
    expect(JSON.parse(fromLane.state)).toEqual(JSON.parse(fromRoom.state));
  });

  it("both start paths persist the list identically: connect time and the autopilot command", async () => {
    schedule.scopes = SCOPES.map((s) => ({ ...s }));
    const atConnect = repo();
    await connectedBridge(atConnect);
    expect(room.posts).toContain(LIST);

    schedule.gateOn = false;
    const byCommand = repo();
    const bridge = await connectedBridge(byCommand);
    expect(existsSync(join(byCommand, AUTOPILOT_STATE_PATH))).toBe(false);
    schedule.gateOn = true;
    const listed = await agentCommand(["autopilot"], {
      repoRoot: byCommand,
      pidAlive: () => true,
      sleep: () => deliverLane(byCommand, bridge),
    });
    expect(listed.code).toBe(AGENT_COMMAND_EXIT.sent);

    expect(stateFile(byCommand)).toBe(stateFile(atConnect));
    const saved = loadAutopilotState(atConnect);
    expect(saved.startupListAt).toBe(STARTED.toISOString());
    expect(saved.startupList).toEqual([
      { scope: "200", title: "First", status: "waiting", stage: "implementation" },
      { scope: "201", title: "Second", status: "waiting", stage: "Design" },
    ]);
  });

  it("status after go is the same from both places", async () => {
    const fromRoom = await runFrom("room");
    const fromLane = await runFrom("lane");
    expect(fromRoom.roomStatus).toBeDefined();
    expect(fromRoom.localStatus.join("\n")).toBe(fromRoom.roomStatus);
    expect(fromLane.roomStatus).toBe(fromRoom.roomStatus);
    expect(fromLane.localStatus).toEqual(fromRoom.localStatus);
    expect((fromRoom.roomStatus ?? "").split("\n")).toContain("Autopilot run: working on SCOPE-200 — First (12m so far).");
  });

  it("go typed locally after the run started finds nothing waiting and writes nothing", async () => {
    const fromLane = await runFrom("lane");
    const again = runAgentCommand(["go"], { repoRoot: fromLane.cwd, pidAlive: () => true });
    expect(again).toEqual({ code: AGENT_COMMAND_EXIT.notNow, lines: [NOTHING_WAITING_LINE] });
    expect(existsSync(commandDir(fromLane.cwd)) ? readdirSync(commandDir(fromLane.cwd)) : []).toEqual([]);
  });
});
// [SCOPE 159 / T024] END
