/**
 * SPEC-144 Amendment B — the bridge side of the Room Link reconnect, with the room client and
 * the SDK session stubbed. The client's own behavior (acks, renewal, counting) is covered in
 * yappchatt-room-link.test.ts; here the test feeds the statuses the client would report.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DestinationStream } from "pino";
import type { RoomLinkInfo } from "../../core/yappchatt";

import { mkdtempSync } from "fs"; // [SCOPE 144 / T027]
import { tmpdir } from "os"; // [SCOPE 144 / T027]
import { join } from "path"; // [SCOPE 144 / T027]
const STATUS_DIR = mkdtempSync(join(tmpdir(), "room-link-status-")); // [SCOPE 144 / T027]

// [SCOPE 144 / T024] BEGIN — stubs and helpers for the bridge Room Link tests
const room = vi.hoisted(() => ({
  posts: [] as string[],
  handlers: undefined as
    | undefined
    | {
        onStatus: (s: string, d?: string, l?: RoomLinkInfo) => void;
        onMessage: (m: {
          id: string;
          from: string;
          text: string;
          ts: number;
          isAgent?: boolean;
          replayed?: boolean;
        }) => void;
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

const session = vi.hoisted(() => ({ sent: [] as string[] }));
vi.mock("../../apps/remote-bridge/src/session", () => ({
  BridgeSession: class {
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
}));

vi.mock("../../core/http/mcp-client", () => ({ resolveApiToken: () => null }));

import { RemoteBridge } from "../../apps/remote-bridge/src/bridge";
import { createRoomLinkLogger } from "../../apps/remote-bridge/src/room-link";

const T0 = Date.parse("2026-11-23T10:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();
const tick = () => new Promise((r) => setTimeout(r, 0));

/** Pino records written by the bridge's Room Link logger, parsed. */
function pinoSink(): { stream: DestinationStream; records: Array<Record<string, unknown>> } {
  const records: Array<Record<string, unknown>> = [];
  return {
    records,
    stream: {
      write(line: string) {
        records.push(JSON.parse(line) as Record<string, unknown>);
      },
    },
  };
}

let stdout: string[] = [];

async function bridgeWithLog(): Promise<{ bridge: RemoteBridge; records: Array<Record<string, unknown>> }> {
  const sink = pinoSink();
  const bridge = new RemoteBridge({
    projectName: "wxKanban",
    cwd: STATUS_DIR, // [SCOPE 144 / T027] the status file goes to a temp dir, never the repo
    roomLinkLogger: createRoomLinkLogger(sink.stream),
    approverLookup: async () => ({ approver: true, name: "Andy", role: "ADMIN" }),
  });
  await bridge.run();
  room.handlers?.onStatus("connected");
  await tick();
  return { bridge, records: sink.records };
}

const reconnecting = (failures: number, sinceMs = T0, reason = "socket closed"): void =>
  room.handlers?.onStatus("reconnecting", reason, { roomLink: failures >= 5 ? "error" : "reconnecting", since: iso(sinceMs), failures, reason });

const reconnected = (startMs: number, endMs: number): void =>
  room.handlers?.onStatus("connected", undefined, {
    roomLink: "connected",
    since: iso(endMs),
    failures: 0,
    outageStartedAt: iso(startMs),
    outageEndedAt: iso(endMs),
  });

const alertLines = () => stdout.filter((l) => l.includes("[room-link] ALERT"));
const noticePosts = () => room.posts.filter((p) => p.startsWith("Room link was down"));

beforeEach(() => {
  room.posts.length = 0;
  session.sent.length = 0;
  pushes.count = 0;
  stdout = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
    stdout.push(String(chunk));
    return true;
  });
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});
// [SCOPE 144 / T024] END

// [SCOPE 144 / T024] BEGIN — one alert on the 5th failure, one notice after 5+ minutes
describe("Room Link alert and outage notice (T024, FR-015, FR-017)", () => {
  it("the 4th failure in a row gives no alert; the 5th gives exactly one, and later failures no more", async () => {
    const { records } = await bridgeWithLog();
    for (let n = 0; n <= 4; n++) reconnecting(n);
    expect(alertLines()).toHaveLength(0);
    expect(records.filter((r) => r.event === "alert")).toHaveLength(0);
    reconnecting(5);
    expect(alertLines()).toHaveLength(1);
    expect(alertLines()[0]).toContain("5 reconnects failed in a row");
    expect(alertLines()[0]).toContain("Still retrying every 15 s");
    const alerts = records.filter((r) => r.event === "alert");
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ component: "room-link", roomLink: "error", failures: 5, level: 50 });
    reconnecting(6);
    reconnecting(7);
    expect(alertLines()).toHaveLength(1);
    expect(records.filter((r) => r.event === "alert")).toHaveLength(1);
    // No email, no push: the alert never reaches the room.
    expect(room.posts.some((p) => p.includes("ALERT"))).toBe(false);
  });

  it("a reconnect clears the alert, so the next outage raises its own", async () => {
    const { records } = await bridgeWithLog();
    for (let n = 0; n <= 5; n++) reconnecting(n);
    reconnected(T0, T0 + 60_000);
    for (let n = 0; n <= 5; n++) reconnecting(n, T0 + 120_000);
    expect(alertLines()).toHaveLength(2);
    expect(records.filter((r) => r.event === "alert")).toHaveLength(2);
  });

  it("an outage of 6.5 minutes gives one room post and one terminal line, N within 1 minute", async () => {
    const { records } = await bridgeWithLog();
    reconnecting(0);
    reconnected(T0, T0 + 6.5 * 60_000);
    await tick();
    expect(noticePosts()).toHaveLength(1);
    const m = /^Room link was down (\d+) min \((\d\d:\d\d) to (\d\d:\d\d)\)\. Messages posted in that time may not have reached the agent; repeat anything that needs an answer\.$/.exec(
      noticePosts()[0],
    );
    expect(m).not.toBeNull();
    expect(Math.abs(Number(m?.[1]) - 6.5)).toBeLessThanOrEqual(1);
    expect(stdout.filter((l) => l.startsWith("[room-link] Room link was down"))).toHaveLength(1);
    expect(records.filter((r) => r.event === "restored")).toEqual([expect.objectContaining({ noticed: true, minutes: Number(m?.[1]) })]);
  });

  it("a 2-minute outage gives no notice", async () => {
    await bridgeWithLog();
    reconnecting(0);
    reconnecting(1);
    reconnected(T0, T0 + 2 * 60_000);
    await tick();
    expect(noticePosts()).toHaveLength(0);
    expect(stdout.some((l) => l.includes("Room link was down"))).toBe(false);
  });

  it("the alert and its record carry the masked reason, never a secret", async () => {
    const { records } = await bridgeWithLog();
    for (let n = 0; n <= 5; n++) reconnecting(n, T0, "token=abcdefghijklmnop0123456789 refused");
    const out = JSON.stringify([stdout, records]);
    expect(out).not.toContain("abcdefghijklmnop0123456789");
  });
});
// [SCOPE 144 / T024] END

// [SCOPE 144 / T025] BEGIN — the bridge's Room Link state for the connection heartbeat
describe("Room Link state for the heartbeat (T025, FR-016)", () => {
  it("is undefined before any link status, reconnecting with the start time during an outage, connected and 0 after", async () => {
    const { bridge } = await bridgeWithLog();
    expect(bridge.roomLinkState()).toBeUndefined();
    reconnecting(0, T0);
    reconnecting(2, T0, "token=abcdefghijklmnop0123456789 socket closed");
    const during = bridge.roomLinkState();
    expect(during).toMatchObject({ roomLink: "reconnecting", roomLinkSince: iso(T0), roomLinkFailures: 2 });
    expect(during?.roomLinkReason).toBeDefined();
    expect(during?.roomLinkReason).not.toContain("abcdefghijklmnop0123456789");
    // The session's own idle/working/waiting is unchanged by the link.
    expect(bridge.connectionState()).toBe("idle");
    reconnected(T0, T0 + 90_000);
    // [SCOPE 144 / T030] connected sends an explicit empty reason, clearing the stored one
    expect(bridge.roomLinkState()).toEqual({ roomLink: "connected", roomLinkSince: iso(T0 + 90_000), roomLinkFailures: 0, roomLinkReason: "" });
  });

  it("the reason is capped at 200 characters", async () => {
    const { bridge } = await bridgeWithLog();
    reconnecting(1, T0, "x".repeat(500));
    expect(bridge.roomLinkState()?.roomLinkReason?.length).toBe(200);
  });
});
// [SCOPE 144 / T025] END
