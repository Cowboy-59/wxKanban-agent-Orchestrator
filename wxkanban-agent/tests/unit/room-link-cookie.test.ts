/**
 * SPEC-144 Amendment B, T028 (FR-018) — the YappChatt session cookie never appears in any output.
 * The real room client and the real bridge run US7 (dead socket), US8 (renewal, then a refused
 * renewal) and US9 (failures in a row and a 7-minute outage) against a scripted server and a fake
 * socket, with a known cookie the server also echoes in its error bodies. Everything the bridge
 * can show is captured, then searched for the cookie. No live YappChatt, no network, fake clock.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { DestinationStream } from "pino";
import type { FetchImpl, SocketFactory } from "../../core/yappchatt";

// [SCOPE 144 / T028] BEGIN — the real client wired to the scripted server, and output capture
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
}));

vi.mock("../../core/http/mcp-client", () => ({ resolveApiToken: () => null }));

import { RemoteBridge } from "../../apps/remote-bridge/src/bridge";
import { createRoomLinkLogger } from "../../apps/remote-bridge/src/room-link";
import { ConnectionRecord } from "../../apps/remote-bridge/src/connection-record";
import { readRefusal, recordRefusal, statusPath } from "../../apps/remote-bridge/src/agent-status";
import { fail, ok, scriptedServer, sessionOk, type FakeSocket } from "../helpers/room-link-fakes";

const COOKIE = "yc-cookie-SECRET-7731";

// [SCOPE 144 / T030] a socket is up only once YappChatt acks its probe heartbeat
const up = (sock: FakeSocket | undefined): void => {
  sock?.emit("open");
  sock?.frame({ type: "heartbeat_ack" });
};

/** Everything the bridge shows: terminal, Pino, room posts, heartbeat bodies, state, files. */
interface Capture {
  terminal: string[];
  pino: string[];
  heartbeats: string[];
}

function pinoSink(into: string[]): DestinationStream {
  return {
    write(line: string) {
      into.push(line);
    },
  };
}

/** A connection-record server that accepts the open and records every heartbeat body. */
function heartbeatServer(into: string[]) {
  return vi.fn(async (url: string, init: { body?: string }) => {
    if (url.endsWith("/heartbeat") && init.body) into.push(init.body);
    const status = url.endsWith("/connections") ? 201 : 200;
    const body = status === 201 ? { connectionId: "c1", heartbeatSeconds: 60 } : {};
    return { status, ok: true, text: async () => JSON.stringify(body) };
  });
}

/** Every file under dir, read as text. */
function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...filesUnder(p));
    else out.push(readFileSync(p, "utf-8"));
  }
  return out;
}

let cap: Capture;
let repo: string;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-23T10:00:00Z"));
  cap = { terminal: [], pino: [], heartbeats: [] };
  repo = mkdtempSync(join(tmpdir(), "room-link-cookie-"));
  const keep = (...a: unknown[]) => {
    cap.terminal.push(a.map(String).join(" "));
  };
  vi.spyOn(console, "log").mockImplementation(keep);
  vi.spyOn(console, "error").mockImplementation(keep);
  vi.spyOn(console, "warn").mockImplementation(keep);
  vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
    cap.terminal.push(String(chunk));
    return true;
  });
  vi.spyOn(process.stderr, "write").mockImplementation((chunk: string | Uint8Array) => {
    cap.terminal.push(String(chunk));
    return true;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  rmSync(repo, { recursive: true, force: true });
});
// [SCOPE 144 / T028] END

// [SCOPE 144 / T028] BEGIN — US7 to US9 with a known cookie: zero hits anywhere
describe("the cookie is never shown (T028, FR-018)", () => {
  it("US7 dead socket, US8 renewal and refusal, US9 alert and outage notice: no output carries the cookie", async () => {
    const srv = scriptedServer([sessionOk(COOKIE)]);
    transport.fetchImpl = srv.fetchImpl;
    transport.socketFactory = srv.socketFactory;

    const bridge = new RemoteBridge({
      projectName: "wxKanban",
      cwd: repo,
      roomLinkLogger: createRoomLinkLogger(pinoSink(cap.pino)),
      approverLookup: async () => ({ approver: true, name: "Andy", role: "ADMIN" }),
    });
    const states: unknown[] = [];
    const rec = new ConnectionRecord(
      { appBaseUrl: "https://app.test", projectToken: "kit-token", supervisor: "KAIN" },
      { machine: "LAPTOP", repo: "wxKanban", agentTag: "wxKanban", kitVersion: "1.7.90" },
      (w: string) => cap.terminal.push(w),
      heartbeatServer(cap.heartbeats),
    );
    await rec.open();
    rec.startHeartbeat(() => "idle", () => {
      const s = bridge.roomLinkState();
      states.push(s);
      return s;
    });

    await bridge.run();
    await vi.advanceTimersByTimeAsync(0);
    up(srv.sockets[0]); // [SCOPE 144 / T030] up once the probe heartbeat is acked
    await vi.advanceTimersByTimeAsync(0);

    // US7: the socket dies silently; two missed acks end it and the link comes back.
    await vi.advanceTimersByTimeAsync(90_000);
    expect(srv.sockets[0].terminated).toBe(true);
    await vi.advanceTimersByTimeAsync(1_000);
    up(srv.sockets[1]); // [SCOPE 144 / T030]
    await vi.advanceTimersByTimeAsync(0);

    // US8: the cookie expires; the server's refusal echoes it; the session renews.
    let tokenCalls = 0;
    srv.wsToken = () => (++tokenCalls === 1 ? fail(401, { error: `session ${COOKIE} expired`, cookie: COOKIE }) : ok({ token: "ws-token-0002" }));
    srv.sessions.push(sessionOk(COOKIE));
    srv.sockets[1].emit("close");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(srv.sockets).toHaveLength(3);
    up(srv.sockets[2]); // [SCOPE 144 / T030]
    await vi.advanceTimersByTimeAsync(0);

    // [SCOPE 144 / T030] The socket opened with the ws/token echoes the cookie and the ws token
    // back: in a handshake error and in an engine error frame. Both reach the terminal masked.
    srv.sockets[2].emit("error", new Error(`handshake refused: yc_session=${COOKIE} (${COOKIE}) token ws-token-0002`));
    srv.sockets[2].frame({ type: "error", error: `cookie ${COOKIE} rejected for ws-token-0002` });
    await vi.advanceTimersByTimeAsync(0);
    expect(cap.terminal).toContain("[room] error — handshake refused: yc_session=[masked] ([masked]) token [masked]");
    expect(cap.terminal).toContain("[room] Engine: cookie [masked] rejected for [masked]");

    // US9: reconnects fail in a row past the alert, with the cookie in every error body; after
    // seven minutes the link comes back and the outage notice is posted.
    srv.wsToken = () => fail(503, { message: `upstream refused yc_session=${COOKIE}` });
    srv.sockets[2].emit("close");
    const downAt = Date.now();
    while (Date.now() - downAt < 7 * 60_000) await vi.advanceTimersByTimeAsync(15_000);
    expect(cap.terminal.some((l) => l.includes("[room-link] ALERT"))).toBe(true);
    srv.wsToken = () => ok({ token: "ws-token-0003" });
    await vi.advanceTimersByTimeAsync(15_000);
    up(srv.sockets[srv.sockets.length - 1]); // [SCOPE 144 / T030]
    await vi.advanceTimersByTimeAsync(0);
    expect(srv.posts.some((p) => p.startsWith("Room link was down"))).toBe(true);

    // US8 refused: the renewal is refused with the cookie in the server's words. One error, no loop.
    srv.wsToken = () => fail(401, { error: `cookie ${COOKIE} invalid` });
    srv.sessions.push(fail(403, { message: `session yc_session=${COOKIE} was revoked (${COOKIE})` }));
    srv.sockets[srv.sockets.length - 1].emit("close");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(bridge.roomLinkState()?.roomLink).toBe("error");
    const callsAfterRefusal = srv.calls.length;
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(srv.calls.length).toBe(callsAfterRefusal);

    // A refusal recorded from the link's error reason still holds a code only.
    recordRefusal(repo, bridge.roomLinkState()?.roomLinkReason ?? "");
    expect(readRefusal(repo)).not.toBeNull();
    expect(readFileSync(statusPath(repo), "utf-8")).not.toContain(COOKIE);

    rec.stopHeartbeat();
    await bridge.shutdown();

    // The cookie did reach the client (it is the session it renewed with) ...
    expect(srv.calls.filter((u) => u.endsWith("/api/community/session")).length).toBeGreaterThanOrEqual(3);
    // ... and appears in none of the outputs.
    expect(cap.terminal.length).toBeGreaterThan(0);
    expect(cap.pino.some((l) => l.includes('"event":"alert"'))).toBe(true);
    expect(cap.heartbeats.length).toBeGreaterThan(5);
    const outputs: Record<string, string> = {
      terminal: cap.terminal.join("\n"),
      pino: cap.pino.join("\n"),
      roomPosts: srv.posts.join("\n"),
      heartbeatBodies: cap.heartbeats.join("\n"),
      roomLinkStates: JSON.stringify(states),
      files: filesUnder(repo).join("\n"),
    };
    // The server's echo did reach the outputs, masked: the search below is not vacuous.
    expect(outputs.terminal).toContain("[masked]");
    for (const [where, text] of Object.entries(outputs)) {
      expect({ where, hits: text.split(COOKIE).length - 1 }).toEqual({ where, hits: 0 });
      // [SCOPE 144 / T030] nor any ws token the client was handed
      expect({ where, wsTokens: text.match(/ws-token-\d+/g) ?? [] }).toEqual({ where, wsTokens: [] });
    }
  });
});
// [SCOPE 144 / T028] END
