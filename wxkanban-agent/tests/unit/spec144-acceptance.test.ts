/**
 * SPEC-144 Amendment B, T030 — acceptance: US7 to US10 end to end, success criteria 8 to 14
 * measured. The real YappChatt client and the real bridge, wired to the scripted server and the
 * fake socket (tests/helpers/room-link-fakes.ts), plus the real ConnectionRecord heartbeat (the
 * session-status feed). Fake clock throughout; no live YappChatt, no network, no repo files.
 *
 * Each measured number is attached to its test with `annotate`, so the run's report carries it.
 * The four criterion tests titled "fixed by T030" were `it.fails` while their review finding was
 * open; the T030 review-fix pass fixed each, and they now run as plain tests.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { DestinationStream } from "pino";
import type { HookCallback } from "@anthropic-ai/claude-agent-sdk";
import type { FetchImpl, SocketFactory } from "../../core/yappchatt";

// [SCOPE 144 / T030] BEGIN — module stubs: the real client on the scripted server; session, git and autopilot stubbed
const transport = vi.hoisted(() => ({
  fetchImpl: undefined as unknown,
  socketFactory: undefined as unknown,
}));

vi.mock("../../core/yappchatt", async () => {
  const actual = await vi.importActual<typeof import("../../core/yappchatt")>("../../core/yappchatt");
  const { roomLinkCfg } = await import("../helpers/room-link-fakes");
  type Args = ConstructorParameters<typeof actual.YappchattClient>;
  class WiredClient extends actual.YappchattClient {
    constructor(cfg: Args[0], user: Args[1], handlers: Args[2]) {
      super(cfg, user, handlers, transport.fetchImpl as FetchImpl, transport.socketFactory as SocketFactory);
    }
  }
  return {
    ...actual,
    YappchattClient: WiredClient,
    resolveYappchattConfig: () => ({ config: roomLinkCfg, user: { email: "op@example.com", displayName: "Op" } }),
  };
});

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

vi.mock("../../apps/remote-bridge/src/push-gate", () => ({
  runReview: async () => ({ clean: true, summary: "clean" }),
  gitTarget: async () => ({ remote: "origin", branch: "main" }),
  gitPush: async () => ({ ok: true, output: "" }),
}));

vi.mock("../../apps/remote-bridge/src/agent-mode", () => ({
  recordOverride: async () => ({ ok: true, detail: "" }),
  readyLine: (projectName: string) => `[bridge] ready project=${projectName}`,
  refreshMcpToken: async () => ({ token: "tok-2", expiresAt: "2099-01-01T00:00:00.000Z" }),
}));

// The project's app token, which the renewal sends as Bearer (FR-014 through the FR-009 gate).
vi.mock("../../core/http/mcp-client", () => ({ resolveApiToken: () => "kit-api-token-0001" }));

// Project-agent mode pieces that do not belong to these tests and touch disk or the network.
vi.mock("../../apps/remote-bridge/src/triage-schedule", () => ({
  TriageSchedule: class {
    async start() {
      /* noop */
    }
    stop() {
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
    skip() {
      return undefined;
    }
  },
}));

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
import { createRoomLinkLogger } from "../../apps/remote-bridge/src/room-link";
import { ConnectionRecord } from "../../apps/remote-bridge/src/connection-record";
import { statusPath } from "../../apps/remote-bridge/src/agent-status";
import { fail, ok, scriptedServer, sessionOk, type FakeSocket, type ScriptedServer } from "../helpers/room-link-fakes";
// [SCOPE 144 / T030] END

// [SCOPE 144 / T030] BEGIN — the acceptance harness: one bridge, one scripted YappChatt, one heartbeat feed
const COOKIE = "yc-cookie-ACCEPT-9157";
const GATE_QUESTION = "May I load production customer data into the test database?";
const REASK = "Asking again";
const NOTICE_TAIL = "Messages posted in that time may not have reached the agent; repeat anything that needs an answer.";
const HEARTBEAT_MS = 60_000; // the connection record's heartbeat (server-confirmed below)
const SEC = 1_000;
const MIN = 60_000;

/** 12:00:00 local time today in the fake clock, so the notice's HH:MM read as in US9. */
const NOON = new Date(2026, 10, 23, 12, 0, 0).getTime();

interface Beat {
  at: number;
  body: Record<string, unknown>;
}

/** What YappChatt is doing: reachable, acking heartbeats, and when a new socket may open. */
interface Net {
  up: boolean;
  acking: boolean;
  openAfter: number;
  /** YappChatt accepts the socket, then drops it at once (the open-then-drop outage). */
  dropOnOpen: boolean;
}

interface Harness {
  bridge: RemoteBridge;
  srv: ScriptedServer;
  rec: ConnectionRecord;
  net: Net;
  terminal: string[];
  pino: string[];
  beats: Beat[];
  sessionHeaders: Array<Record<string, string>>;
  repo: string;
  opened: Set<FakeSocket>;
  acked: Map<FakeSocket, number>;
  msgSeq: number;
}

let live: Harness[] = [];
let terminal: string[] = [];

function pinoSink(into: string[]): DestinationStream {
  return {
    write(line: string) {
      into.push(line);
    },
  };
}

async function harness(opts: { projectAgent?: boolean } = {}): Promise<Harness> {
  const srv = scriptedServer([sessionOk(COOKIE)]);
  const net: Net = { up: true, acking: true, openAfter: 0, dropOnOpen: false };
  srv.wsToken = () => (net.up ? ok({ token: "ws-token-live" }) : fail(503, { message: `upstream refused yc_session=${COOKIE}` }));
  const sessionHeaders: Array<Record<string, string>> = [];
  const base = srv.fetchImpl;
  srv.fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    if (String(input).endsWith("/api/community/session")) sessionHeaders.push({ ...((init?.headers ?? {}) as Record<string, string>) });
    return base(input, init);
  }) as unknown as FetchImpl;
  transport.fetchImpl = srv.fetchImpl;
  transport.socketFactory = srv.socketFactory;

  const repo = mkdtempSync(join(tmpdir(), "spec144-acceptance-"));
  const pino: string[] = [];
  const bridge = new RemoteBridge({
    projectName: "Billing",
    cwd: repo,
    roomLinkLogger: createRoomLinkLogger(pinoSink(pino)),
    approverLookup: async () => ({ approver: true, name: "Andy", role: "ADMIN" }),
    ...(opts.projectAgent
      ? {
          agent: { name: "PROJECT-AGENT", projectId: "p-1", mcpUrl: "https://mcp.test", mcpToken: "tok" },
          projectAgentConfig: { mcpUrl: "https://mcp.test" } as never,
        }
      : {}),
  });

  const beats: Beat[] = [];
  const rec = new ConnectionRecord(
    { appBaseUrl: "https://app.test", projectToken: "kit-token", supervisor: "KAIN" },
    { machine: "LAPTOP", repo: "Billing", agentTag: "Billing", kitVersion: "1.7.103" },
    (w: string) => terminal.push(w),
    vi.fn(async (url: string, init: { body?: string }) => {
      if (url.endsWith("/heartbeat") && init.body) beats.push({ at: Date.now(), body: JSON.parse(init.body) as Record<string, unknown> });
      const status = url.endsWith("/connections") ? 201 : 200;
      const body = status === 201 ? { connectionId: "c1", heartbeatSeconds: HEARTBEAT_MS / SEC } : {};
      return { status, ok: true, text: async () => JSON.stringify(body) };
    }),
  );
  await rec.open();
  rec.startHeartbeat(() => "idle", () => bridge.roomLinkState());

  const h: Harness = { bridge, srv, rec, net, terminal, pino, beats, sessionHeaders, repo, opened: new Set(), acked: new Map(), msgSeq: 0 };
  live.push(h);
  await bridge.run();
  await vi.advanceTimersByTimeAsync(0);
  await openPending(h);
  return h;
}

/** YappChatt's side of one moment: open sockets it accepts, ack heartbeats it hears. */
async function serve(h: Harness): Promise<void> {
  await openPending(h);
  const sock = current(h);
  if (sock && h.net.acking && h.opened.has(sock) && !sock.terminated) {
    const seen = sock.heartbeats();
    if (seen > (h.acked.get(sock) ?? 0)) {
      h.acked.set(sock, seen);
      sock.frame({ type: "heartbeat_ack" });
    }
  }
}

async function openPending(h: Harness): Promise<void> {
  for (const sock of h.srv.sockets) {
    if (h.opened.has(sock) || !h.net.up || Date.now() < h.net.openAfter) continue;
    h.opened.add(sock);
    sock.emit("open");
    await vi.advanceTimersByTimeAsync(0);
    if (h.net.dropOnOpen) {
      sock.emit("close");
      await vi.advanceTimersByTimeAsync(0);
    }
  }
}

const current = (h: Harness): FakeSocket | undefined => h.srv.sockets[h.srv.sockets.length - 1];

/** Advance the fake clock in 1 s steps, YappChatt serving after each one. */
async function run(h: Harness, ms: number): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    await vi.advanceTimersByTimeAsync(Math.min(SEC, end - Date.now()));
    await serve(h);
  }
}

/** Advance 1 s at a time until `cond` holds; returns the time it first held, or undefined. */
async function until(h: Harness, cond: () => boolean, maxMs: number): Promise<number | undefined> {
  const end = Date.now() + maxMs;
  while (Date.now() < end) {
    if (cond()) return Date.now();
    await vi.advanceTimersByTimeAsync(SEC);
    await serve(h);
  }
  return cond() ? Date.now() : undefined;
}

/** A person's message as YappChatt delivers it on the open socket. */
function say(h: Harness, text: string, from = "Andy"): void {
  const n = ++h.msgSeq;
  current(h)?.frame({
    type: "event",
    event: { id: `e-${n}`, type: "message.inbound", payload: { id: `m-${n}`, content: text, authorid: "u-approver", authorname: from } },
  });
}

/** Messages YappChatt replays on resume after a drop. */
function replay(h: Harness, texts: string[]): void {
  current(h)?.frame({ type: "replay_start" });
  for (const t of texts) say(h, t);
  current(h)?.frame({ type: "replay_end" });
}

const linkState = (h: Harness): string | undefined => h.bridge.roomLinkState()?.roomLink;
const notices = (h: Harness): string[] => h.srv.posts.filter((p) => p.startsWith("Room link was down"));
const alertLines = (): string[] => terminal.filter((l) => l.includes("[room-link] ALERT"));
const pinoEvents = (h: Harness, event: string): Array<Record<string, unknown>> =>
  h.pino.map((l) => JSON.parse(l) as Record<string, unknown>).filter((r) => r.event === event);
const reasks = (h: Harness): string[] => h.srv.posts.filter((p) => p.includes(REASK));
const sessionCalls = (h: Harness): number => h.srv.calls.filter((u) => u.endsWith("/api/community/session")).length;
const tokenCalls = (h: Harness): number => h.srv.calls.filter((u) => u.endsWith("/api/ws/token")).length;
/** Heartbeats sent after `from` (a beat in the same ms went out first) and before `to`. */
const beatsBetween = (h: Harness, from: number, to: number): Beat[] => h.beats.filter((b) => b.at > from && b.at < to);
const statusFile = (h: Harness): Record<string, unknown> => JSON.parse(readFileSync(statusPath(h.repo), "utf-8")) as Record<string, unknown>;
const hhmm = (ms: number): string => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...filesUnder(p));
    else out.push(readFileSync(p, "utf-8"));
  }
  return out;
}

/** SC13: the cookie appears in none of the outputs, counted per output. */
function cookieHits(h: Harness): Record<string, number> {
  const outputs: Record<string, string> = {
    terminal: terminal.join("\n"),
    pino: h.pino.join("\n"),
    roomPosts: h.srv.posts.join("\n"),
    heartbeatBodies: JSON.stringify(h.beats),
    roomLinkState: JSON.stringify(h.bridge.roomLinkState() ?? {}),
    files: filesUnder(h.repo).join("\n"),
  };
  return Object.fromEntries(Object.entries(outputs).map(([k, v]) => [k, v.split(COOKIE).length - 1]));
}
const NO_HITS = { terminal: 0, pino: 0, roomPosts: 0, heartbeatBodies: 0, roomLinkState: 0, files: 0 };

/** A gated action, driven as the SDK does: a PreToolUse hook call. */
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

/** YappChatt goes down by closing the socket (a close event), then the test decides when it returns. */
async function goDown(h: Harness): Promise<number> {
  h.net.up = false;
  const at = Date.now();
  current(h)?.emit("close");
  await vi.advanceTimersByTimeAsync(0);
  return at;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOON);
  terminal = [];
  session.sent.length = 0;
  session.gate = undefined;
  schedule.awaiting = false;
  schedule.scopes = [];
  ledgerWrites.length = 0;
  const keep = (...a: unknown[]) => {
    terminal.push(a.map(String).join(" "));
  };
  vi.spyOn(console, "log").mockImplementation(keep);
  vi.spyOn(console, "error").mockImplementation(keep);
  vi.spyOn(console, "warn").mockImplementation(keep);
  vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
    terminal.push(String(chunk));
    return true;
  });
  vi.spyOn(process.stderr, "write").mockImplementation((chunk: string | Uint8Array) => {
    terminal.push(String(chunk));
    return true;
  });
});

afterEach(async () => {
  for (const h of live) {
    h.rec.stopHeartbeat();
    await h.bridge.shutdown();
    rmSync(h.repo, { recursive: true, force: true });
  }
  live = [];
  vi.restoreAllMocks();
  vi.useRealTimers();
});
// [SCOPE 144 / T030] END

// [SCOPE 144 / T030] BEGIN — US7: the socket dies silently (SC8, SC9, SC10 short, SC11, SC13)
describe("US7 — the socket dies silently", () => {
  it("SC8: in 30 of 30 runs, one per second of the heartbeat cycle, the link is reconnecting within 90 s and back with no restart", async ({ annotate }) => {
    const detect: number[] = [];
    const statusLag: number[] = [];
    const staleBeats: number[] = [];
    for (let offset = 0; offset < 30; offset++) {
      terminal.length = 0;
      vi.setSystemTime(NOON);
      const h = await harness();
      await run(h, 30 * SEC + offset * SEC); // acks arrive; the socket is healthy
      expect(linkState(h)).toBe("connected");
      // The socket dies: no close, no error, no frames, no acks.
      h.net.acking = false;
      h.net.openAfter = Number.MAX_SAFE_INTEGER;
      const diedAt = Date.now();
      const detectedAt = await until(h, () => linkState(h) === "reconnecting", 3 * MIN);
      expect(detectedAt).toBeDefined();
      const d = (detectedAt as number) - diedAt;
      detect.push(d);
      expect(d).toBeLessThanOrEqual(90 * SEC);
      expect(h.srv.sockets[0].terminated).toBe(true);
      // SC11: the next connection heartbeat carries reconnecting, with its start time.
      await until(h, () => beatsBetween(h, detectedAt as number, Date.now() + 1).some((b) => b.body.roomLink === "reconnecting"), 2 * HEARTBEAT_MS);
      const first = beatsBetween(h, detectedAt as number, Number.MAX_SAFE_INTEGER).find((b) => b.body.roomLink === "reconnecting");
      expect(first).toBeDefined();
      statusLag.push((first as Beat).at - (detectedAt as number));
      expect((first as Beat).at - (detectedAt as number)).toBeLessThanOrEqual(HEARTBEAT_MS);
      expect((first as Beat).body.roomLinkSince).toBe(new Date(detectedAt as number).toISOString());
      // Heartbeats between the death and its detection still read connected: the bridge cannot know yet.
      staleBeats.push(beatsBetween(h, diedAt, detectedAt as number).filter((b) => b.body.roomLink === "connected").length);
      // SC9: YappChatt answers again; the link reconnects by itself, no restart, no new session.
      h.net.acking = true;
      h.net.openAfter = 0;
      const backAt = await until(h, () => linkState(h) === "connected", 2 * MIN);
      expect(backAt).toBeDefined();
      expect(sessionCalls(h)).toBe(1);
      const afterBack = await until(h, () => beatsBetween(h, backAt as number, Date.now() + 1).length > 0, 2 * HEARTBEAT_MS);
      expect(afterBack).toBeDefined();
      expect(beatsBetween(h, backAt as number, Number.MAX_SAFE_INTEGER)[0].body).toMatchObject({ roomLink: "connected", roomLinkFailures: 0 });
      // SC10: an outage under 5 minutes gets no notice; SC12: no alert.
      expect(notices(h)).toHaveLength(0);
      expect(alertLines()).toHaveLength(0);
      // SC13
      expect(cookieHits(h)).toEqual(NO_HITS);
      h.rec.stopHeartbeat();
      await h.bridge.shutdown();
      rmSync(h.repo, { recursive: true, force: true });
      live = live.filter((x) => x !== h);
    }
    expect(detect).toHaveLength(30);
    await annotate(
      `SC8 detect ms: min ${Math.min(...detect)} max ${Math.max(...detect)} (limit 90000), 30/30 runs; ` +
        `SC11 status lag after detection ms: max ${Math.max(...statusLag)} (one heartbeat = ${HEARTBEAT_MS}); ` +
        `heartbeats reading connected between death and detection: max ${Math.max(...staleBeats)}`,
    );
  });
});
// [SCOPE 144 / T030] END

// [SCOPE 144 / T030] BEGIN — US8: the session cookie expires (SC9, SC11 error reason, SC13)
describe("US8 — the session cookie expires", () => {
  it("SC9: a 401 renews the session through /api/community/session with the app token and reconnects, no operator action", async ({ annotate }) => {
    const h = await harness();
    await run(h, 2 * MIN);
    let refused = 0;
    h.srv.wsToken = () => (refused++ === 0 ? fail(401, { error: `session ${COOKIE} expired` }) : ok({ token: "ws-token-2" }));
    h.srv.sessions.push(sessionOk(COOKIE));
    const lostAt = Date.now();
    current(h)?.emit("close");
    const backAt = await until(h, () => linkState(h) === "connected" && h.srv.sockets.length === 2 && h.opened.has(h.srv.sockets[1]), MIN);
    expect(backAt).toBeDefined();
    expect(sessionCalls(h)).toBe(2);
    expect(h.sessionHeaders[1].authorization).toBe("Bearer kit-api-token-0001");
    expect(h.bridge.roomLinkState()).toMatchObject({ roomLink: "connected", roomLinkFailures: 0 });
    expect(terminal.filter((l) => l.startsWith("[room] error"))).toHaveLength(0);
    await run(h, HEARTBEAT_MS);
    expect(h.beats[h.beats.length - 1].body).toMatchObject({ roomLink: "connected" });
    expect(cookieHits(h)).toEqual(NO_HITS);
    await annotate(`US8 renewal: reconnected ${(backAt as number) - lostAt} ms after the drop; community/session calls 2; operator actions 0`);
  });

  it("SC11: a refused renewal gives one error with the server's words, shown in session status, and retrying stops", async ({ annotate }) => {
    const words = "This email isn't a member of your company";
    const h = await harness();
    await run(h, MIN);
    h.srv.wsToken = () => fail(401, { error: `cookie ${COOKIE} invalid` });
    h.srv.sessions.push(fail(403, { error: "email_not_in_company", message: words }));
    current(h)?.emit("close");
    const errAt = await until(h, () => linkState(h) === "error", MIN);
    expect(errAt).toBeDefined();
    expect(h.bridge.roomLinkState()).toMatchObject({ roomLink: "error", roomLinkReason: words });
    expect(terminal.filter((l) => l.startsWith("[room] error"))).toHaveLength(1);
    const callsAtError = h.srv.calls.length;
    await run(h, 10 * MIN);
    expect(h.srv.calls.length).toBe(callsAtError);
    const firstErrBeat = beatsBetween(h, errAt as number, Number.MAX_SAFE_INTEGER)[0];
    expect(firstErrBeat.body).toMatchObject({ roomLink: "error", roomLinkReason: words });
    expect(firstErrBeat.at - (errAt as number)).toBeLessThanOrEqual(HEARTBEAT_MS);
    expect(statusFile(h)).toMatchObject({ roomLink: "error", reason: words });
    expect(cookieHits(h)).toEqual(NO_HITS);
    await annotate(`US8 refused: 1 error status; calls in the 10 min after: 0; session status shows error + reason ${firstErrBeat.at - (errAt as number)} ms after`);
  });
});
// [SCOPE 144 / T030] END

// [SCOPE 144 / T030] BEGIN — US9: YappChatt is down 7 minutes (SC9, SC10, SC11, SC12, SC13)
describe("US9 — YappChatt is down 7 minutes", () => {
  it("12:03 to 12:10: one alert on the 5th failure, error in session status, one notice 'down 7 min (12:03 to 12:10)'", async ({ annotate }) => {
    const h = await harness();
    await run(h, 3 * MIN); // connected 12:00 to 12:03
    expect(hhmm(Date.now())).toBe("12:03");
    const downAt = await goDown(h);
    const tokenCallsAtDown = tokenCalls(h);
    // SC12: no alert through the 4th failure; exactly one on the 5th.
    const alertAt = await until(h, () => alertLines().length > 0, 2 * MIN);
    expect(alertAt).toBeDefined();
    const failedAtAlert = tokenCalls(h) - tokenCallsAtDown;
    expect(failedAtAlert).toBe(5);
    expect(h.bridge.roomLinkState()).toMatchObject({ roomLink: "error", roomLinkFailures: 5 });
    expect(statusFile(h)).toMatchObject({ roomLink: "error", failures: 5 }); // the Cockpit banner's input
    // Down until 12:10:00.
    await run(h, downAt + 7 * MIN - Date.now());
    expect(hhmm(Date.now())).toBe("12:10");
    expect(alertLines()).toHaveLength(1);
    expect(pinoEvents(h, "alert")).toHaveLength(1);
    h.net.up = true;
    const backAt = await until(h, () => linkState(h) === "connected", MIN);
    expect(backAt).toBeDefined();
    await vi.advanceTimersByTimeAsync(0);
    // SC10: exactly one notice, the words of US9.
    expect(notices(h)).toEqual([`Room link was down 7 min (12:03 to 12:10). ${NOTICE_TAIL}`]);
    expect(terminal.filter((l) => l.startsWith("[room-link] Room link was down"))).toHaveLength(1);
    expect(pinoEvents(h, "restored")).toEqual([expect.objectContaining({ minutes: 7, noticed: true })]);
    // SC11: session status within one heartbeat of the drop, never connected while down, connected after.
    const down = beatsBetween(h, downAt, backAt as number);
    // The first heartbeat after 12:03:00 goes at 12:04:00, after the alert: it reads error.
    expect(["reconnecting", "error"]).toContain(down[0].body.roomLink);
    expect(down[0].body.roomLinkSince).toBe(new Date(downAt).toISOString());
    const statusLag = down[0].at - downAt;
    expect(statusLag).toBeLessThanOrEqual(HEARTBEAT_MS);
    expect(down.filter((b) => b.body.roomLink === "connected")).toHaveLength(0);
    expect(down.filter((b) => b.at > (alertAt as number)).every((b) => b.body.roomLink === "error")).toBe(true);
    await run(h, HEARTBEAT_MS);
    expect(beatsBetween(h, backAt as number, Number.MAX_SAFE_INTEGER)[0].body).toMatchObject({ roomLink: "connected", roomLinkFailures: 0 });
    // The Cockpit banner clears: the status file reads connected, failures 0.
    expect(statusFile(h)).toMatchObject({ roomLink: "connected", failures: 0 });
    // SC9: no restart: one bridge run, one session.
    expect(sessionCalls(h)).toBe(1);
    // No email or push: the alert never reaches the room.
    expect(h.srv.posts.some((p) => p.includes("ALERT"))).toBe(false);
    expect(cookieHits(h)).toEqual(NO_HITS);
    await annotate(
      `US9: alert at failed reconnect #${failedAtAlert}, ${(alertAt as number) - downAt} ms after the drop; alerts 1; alert records 1; ` +
        `reconnected ${hhmm(backAt as number)} (${(backAt as number) - downAt - 7 * MIN} ms after YappChatt returned); notices 1, N=7; ` +
        `session status lag ${statusLag} ms (first beat read ${String(down[0].body.roomLink)}); heartbeats reading connected while down: 0`,
    );
  });

  it("SC10 and SC12 across outage lengths: notice only past 5 min, N within 1 min; one alert only once 5 reconnects have failed", async ({ annotate }) => {
    const rows: string[] = [];
    for (const lengthMs of [20 * SEC, 31 * SEC, 2 * MIN, 299 * SEC, 5 * MIN, 5.5 * MIN, 6 * MIN, 6.5 * MIN, 10 * MIN, 12 * MIN]) {
      terminal.length = 0;
      vi.setSystemTime(NOON);
      const h = await harness();
      await run(h, MIN);
      const downAt = await goDown(h);
      const before = tokenCalls(h);
      await run(h, lengthMs);
      h.net.up = true;
      const backAt = await until(h, () => linkState(h) === "connected", MIN);
      expect(backAt).toBeDefined();
      await vi.advanceTimersByTimeAsync(0);
      const actual = (backAt as number) - downAt;
      const failed = tokenCalls(h) - before - 1; // the last call succeeded
      const n = notices(h);
      if (actual > 5 * MIN) {
        expect(n).toHaveLength(1);
        const minutes = Number(/^Room link was down (\d+) min/.exec(n[0])?.[1]);
        expect(Math.abs(minutes - actual / MIN)).toBeLessThanOrEqual(1);
        expect(n[0]).toContain(`(${hhmm(downAt)} to ${hhmm(backAt as number)})`);
      } else {
        expect(n).toHaveLength(0);
      }
      expect(alertLines()).toHaveLength(failed >= 5 ? 1 : 0);
      expect(pinoEvents(h, "alert")).toHaveLength(failed >= 5 ? 1 : 0);
      expect(cookieHits(h)).toEqual(NO_HITS);
      rows.push(`${lengthMs / SEC}s→outage ${actual / SEC}s failed ${failed} alerts ${alertLines().length} notices ${n.length}${n.length ? ` N=${/down (\d+) min/.exec(n[0])?.[1]}` : ""}`);
      h.rec.stopHeartbeat();
      await h.bridge.shutdown();
      rmSync(h.repo, { recursive: true, force: true });
      live = live.filter((x) => x !== h);
    }
    await annotate(rows.join("; "));
  });

  // Was open finding 1 (fixed by T030): an open-then-drop socket reset the failure count, so the alert never fired.
  it("SC12 (fixed by T030: open-then-drop resets the count): YappChatt that accepts each socket and drops it at once for 7 min still raises one alert", async ({ annotate }) => {
    const h = await harness();
    await run(h, 3 * MIN);
    h.net.dropOnOpen = true;
    current(h)?.emit("close");
    await run(h, 7 * MIN);
    h.net.dropOnOpen = false;
    await until(h, () => linkState(h) === "connected", MIN);
    await annotate(`measured: ${h.srv.sockets.length - 1} sockets opened and dropped in 7 min; alerts ${alertLines().length} (want 1)`);
    expect(alertLines()).toHaveLength(1);
  });

  it("SC10 (fixed by T030: open-then-drop resets the outage): 7 min of open-then-drop gets one notice", async ({ annotate }) => {
    const h = await harness();
    await run(h, 3 * MIN);
    h.net.dropOnOpen = true;
    current(h)?.emit("close");
    await run(h, 7 * MIN);
    h.net.dropOnOpen = false;
    await until(h, () => linkState(h) === "connected", MIN);
    await vi.advanceTimersByTimeAsync(0);
    await annotate(`measured: notices ${notices(h).length} (want 1); restored records ${pinoEvents(h, "restored").length}`);
    expect(notices(h)).toHaveLength(1);
  });

  // Was open finding 2 (fixed by T030): the outage started at detection, not at the last ack.
  it("SC10 (fixed by T030: outage start taken at detection): a silent death at 12:03 with YappChatt back at 12:09:30 gets one notice from 12:03, N within 1 min", async ({ annotate }) => {
    const h = await harness();
    await run(h, 3 * MIN); // the 12:03:00 heartbeat is acked; the socket dies right after
    const diedAt = Date.now();
    h.net.acking = false;
    h.net.up = false;
    await run(h, 6.5 * MIN);
    h.net.up = true;
    h.net.acking = true;
    const backAt = await until(h, () => linkState(h) === "connected", MIN);
    expect(backAt).toBeDefined();
    await vi.advanceTimersByTimeAsync(0);
    const actualMin = ((backAt as number) - diedAt) / MIN;
    const n = Number(/^Room link was down (\d+) min/.exec(notices(h)[0] ?? "")?.[1]);
    await annotate(`measured: real outage ${actualMin} min; notices ${notices(h).length}; notice: ${notices(h)[0] ?? "(none)"}; N error ${Math.abs(n - actualMin)} min (limit 1)`);
    expect(notices(h)).toHaveLength(1);
    expect(notices(h)[0]).toContain(`(${hhmm(diedAt)} to `);
    expect(Math.abs(n - actualMin)).toBeLessThanOrEqual(1);
  });
});
// [SCOPE 144 / T030] END

// [SCOPE 144 / T030] BEGIN — US10: a reply during a drop does not settle a gate (SC14)
describe("US10 — a reply during a drop does not settle a gate", () => {
  it("SC14: the approver's CONFIRMED during a 20 s drop arrives in the replay, settles nothing; one re-ask; the reply after it allows", async ({ annotate }) => {
    const h = await harness();
    await run(h, MIN);
    let outcome: string | undefined;
    void askGate("git push origin main").then((o) => (outcome = o));
    await run(h, SEC);
    expect(h.srv.posts.some((p) => p.includes("is asking to run a gated action") && p.includes("Reply CONFIRMED to allow"))).toBe(true);
    // The link drops for 20 seconds; the approver's CONFIRMED is posted then and held by YappChatt.
    const dropAt = Date.now();
    h.net.openAfter = dropAt + 20 * SEC;
    current(h)?.emit("close");
    const backAt = await until(h, () => linkState(h) === "connected" && h.opened.has(current(h) as FakeSocket), MIN);
    expect(backAt).toBeDefined();
    const dropMs = (backAt as number) - dropAt;
    // On reconnect: the gate is asked again, then YappChatt replays what was posted during the drop.
    expect(reasks(h)).toHaveLength(1);
    expect(reasks(h)[0]).toContain("is asking to run a gated action");
    replay(h, ["CONFIRMED"]);
    await run(h, 2 * SEC);
    expect(outcome).toBeUndefined();
    expect(h.bridge.connectionState()).toBe("waiting");
    expect(session.sent.some((t) => t.includes("Discussion only") && t.endsWith("CONFIRMED"))).toBe(true);
    // Only the approver's reply after the re-ask settles it.
    say(h, "CONFIRMED");
    await run(h, 2 * SEC);
    expect(outcome).toBe("allow");
    expect(reasks(h)).toHaveLength(1);
    expect(cookieHits(h)).toEqual(NO_HITS);
    await annotate(`US10: drop ${dropMs} ms; gates settled by the replay 0; re-asks 1; settled by the live reply after the re-ask: allow`);
  });

  it("SC14: a live reply received before the drop still counts, and nothing is re-asked", async () => {
    const h = await harness();
    await run(h, MIN);
    let outcome: string | undefined;
    void askGate("git push origin main").then((o) => (outcome = o));
    await run(h, SEC);
    say(h, "NO");
    await run(h, SEC);
    expect(outcome).toBe("deny");
    h.net.openAfter = Date.now() + 20 * SEC;
    current(h)?.emit("close");
    await until(h, () => linkState(h) === "connected" && h.opened.has(current(h) as FakeSocket), MIN);
    replay(h, ["CONFIRMED"]);
    await run(h, 2 * SEC);
    expect(reasks(h)).toHaveLength(0);
    expect(outcome).toBe("deny");
  });

  // Was open finding 3 (fixed by T030): Autopilot gate timers ran during an outage, so a gate auto-parked while the
  // link was down and was not waiting (and not re-asked) when it came back. Amendment B rule:
  // "until SPEC-160 an outage holds a gate".
  it("SC14 (fixed by T030: Autopilot gate timers run during an outage): an Autopilot gate waiting when a 16 min outage starts is re-asked once on reconnect", async ({ annotate }) => {
    schedule.scopes = [{ num: "202", title: "Gate scope", stage: "implementation" }];
    schedule.awaiting = true;
    const h = await harness({ projectAgent: true });
    await run(h, 5 * SEC);
    say(h, "go");
    await run(h, 2 * SEC);
    expect(h.srv.posts.some((p) => p.includes(GATE_QUESTION))).toBe(true);
    const downAt = await goDown(h);
    await run(h, 16 * MIN);
    h.net.up = true;
    await until(h, () => linkState(h) === "connected", MIN);
    await vi.advanceTimersByTimeAsync(0);
    const autoParked = h.srv.posts.filter((p) => p.includes("no answer in 15 minutes")).length;
    await annotate(
      `measured: re-asks of the gate ${reasks(h).filter((p) => p.includes(GATE_QUESTION)).length} (want 1); ` +
        `auto-park posts while the link was down (from ${hhmm(downAt)}) ${autoParked}; bridge state at reconnect ${h.bridge.connectionState()}`,
    );
    expect(reasks(h).filter((p) => p.includes(GATE_QUESTION))).toHaveLength(1);
  });
});
// [SCOPE 144 / T030] END
