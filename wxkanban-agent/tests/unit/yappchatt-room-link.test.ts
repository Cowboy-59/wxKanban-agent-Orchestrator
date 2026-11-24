// [SCOPE 144 / T022] BEGIN — Room Link client tests: fake socket, fake clock, scripted server
// SPEC-144 Amendment B. The YappChatt client against a scripted fetch and a fake socket; no live
// YappChatt. T022 dead-socket detection (FR-013), T023 session renewal (FR-014), T024 failure
// count and outage times (FR-016, FR-017), T026 replayed messages (FR-020).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { YappchattClient, type FetchImpl, type RoomLinkInfo, type YappchattMessage } from "../../core/yappchatt";
import { fail, ok, roomLinkCfg as cfg, scriptedServer, sessionOk, type FakeSocket, type ScriptedServer } from "../helpers/room-link-fakes";

function recorder() {
  const statuses: Array<{ status: string; detail?: string; link?: RoomLinkInfo }> = [];
  const errors: string[] = [];
  const messages: YappchattMessage[] = [];
  const h = {
    onStatus: (status: string, detail?: string, link?: RoomLinkInfo) => statuses.push({ status, detail, link }),
    onHistory: () => undefined,
    onMessage: (m: YappchattMessage) => messages.push(m),
    onTyping: () => undefined,
    onError: (e: string) => errors.push(e),
  };
  return { h, statuses, errors, messages };
}

const of = <T extends { status: string }>(statuses: T[], status: string): T[] => statuses.filter((s) => s.status === status);
const last = <T>(items: T[]): T | undefined => items[items.length - 1];

// [SCOPE 144 / T030] BEGIN — a socket is up only once YappChatt acks its probe heartbeat
const ack = (sock: FakeSocket | undefined): void => sock?.frame({ type: "heartbeat_ack" });
const up = (sock: FakeSocket | undefined): void => {
  sock?.emit("open");
  ack(sock);
};
// [SCOPE 144 / T030] END

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-23T10:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

async function startedClient(srv: ScriptedServer) {
  const rec = recorder();
  const client = new YappchattClient(cfg, { email: "op@example.com", displayName: "Op" }, rec.h, srv.fetchImpl, srv.socketFactory);
  await client.start();
  await vi.advanceTimersByTimeAsync(0);
  return { client, ...rec };
}

describe("T022 dead-socket detection (FR-013)", () => {
  it("acks keep the socket", async () => {
    const srv = scriptedServer([sessionOk("cookie-value-0001")]);
    const c = await startedClient(srv);
    up(srv.sockets[0]); // [SCOPE 144 / T030] the probe at open, acked
    for (let i = 0; i < 6; i++) {
      await vi.advanceTimersByTimeAsync(30_000);
      srv.sockets[0].frame({ type: "heartbeat_ack" });
    }
    expect(srv.sockets[0].heartbeats()).toBe(7); // [SCOPE 144 / T030] the probe and 6 ticks
    expect(srv.sockets[0].terminated).toBe(false);
    expect(srv.sockets).toHaveLength(1);
    expect(of(c.statuses, "reconnecting")).toHaveLength(0);
    c.client.dispose();
  });

  it("two missed acks terminate the socket and reconnect", async () => {
    const srv = scriptedServer([sessionOk("cookie-value-0001")]);
    const c = await startedClient(srv);
    up(srv.sockets[0]); // [SCOPE 144 / T030] proven by the probe's ack
    await vi.advanceTimersByTimeAsync(60_000); // heartbeats at 30 s and 60 s, neither acked
    expect(srv.sockets[0].terminated).toBe(false);
    await vi.advanceTimersByTimeAsync(30_000); // 90 s: the second miss
    expect(srv.sockets[0].terminated).toBe(true);
    expect(of(c.statuses, "reconnecting")).toEqual([
      expect.objectContaining({ detail: "no heartbeat_ack", link: expect.objectContaining({ roomLink: "reconnecting", failures: 0 }) }),
    ]);
    // A late close from the terminated socket does not schedule a second reconnect.
    srv.sockets[0].emit("close");
    expect(of(c.statuses, "reconnecting")).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(srv.sockets).toHaveLength(2);
    up(srv.sockets[1]); // [SCOPE 144 / T030]
    expect(last(c.statuses)).toMatchObject({ status: "connected", link: { roomLink: "connected", failures: 0 } });
    c.client.dispose();
  });

  it("a socket killed with no close event is reconnecting within 90 s", async () => {
    const srv = scriptedServer([sessionOk("cookie-value-0001")]);
    const c = await startedClient(srv);
    up(srv.sockets[0]); // [SCOPE 144 / T030]
    await vi.advanceTimersByTimeAsync(30_000);
    srv.sockets[0].frame({ type: "heartbeat_ack" });
    // The socket dies here: no close, no error, no frames.
    const diedAt = Date.now();
    let reconnectingAt: number | undefined;
    for (let t = 0; t < 120 && reconnectingAt === undefined; t++) {
      await vi.advanceTimersByTimeAsync(1_000);
      if (of(c.statuses, "reconnecting").length > 0) reconnectingAt = Date.now();
    }
    expect(reconnectingAt).toBeDefined();
    expect((reconnectingAt as number) - diedAt).toBeLessThanOrEqual(90_000);
    c.client.dispose();
  });
});
// [SCOPE 144 / T022] END

// [SCOPE 144 / T023] BEGIN — session renewal tests (FR-014)
describe("T023 session renewal (FR-014)", () => {
  it("an expired cookie renews the session and reconnects with no restart", async () => {
    const srv = scriptedServer([sessionOk("cookie-value-0001"), sessionOk("cookie-value-0002")]);
    let tokenCalls = 0;
    srv.wsToken = () => (++tokenCalls === 1 ? fail(401, { error: "session expired" }) : ok({ token: "ws-token-0002" }));
    const c = await startedClient(srv);
    expect(srv.calls.filter((u) => u.endsWith("/api/community/session"))).toHaveLength(2);
    expect(srv.sockets).toHaveLength(1);
    up(srv.sockets[0]); // [SCOPE 144 / T030]
    expect(last(c.statuses)?.status).toBe("connected");
    expect(of(c.statuses, "error")).toHaveLength(0);
    expect(c.errors).toHaveLength(0);
    c.client.dispose();
  });

  it("a 403 on history at start renews before the socket opens", async () => {
    const srv = scriptedServer([sessionOk("cookie-value-0001"), sessionOk("cookie-value-0002")]);
    let historyCalls = 0;
    srv.history = () => (++historyCalls === 1 ? fail(403) : ok({ messages: [] }));
    const c = await startedClient(srv);
    expect(srv.calls.filter((u) => u.endsWith("/api/community/session"))).toHaveLength(2);
    expect(srv.sockets).toHaveLength(1);
    c.client.dispose();
  });

  it("an expired cookie on a later reconnect renews too", async () => {
    const srv = scriptedServer([sessionOk("cookie-value-0001"), sessionOk("cookie-value-0002")]);
    const c = await startedClient(srv);
    up(srv.sockets[0]); // [SCOPE 144 / T030]
    let tokenCalls = 0;
    srv.wsToken = () => (++tokenCalls === 1 ? fail(401) : ok({ token: "ws-token-0003" }));
    srv.sockets[0].emit("close");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(srv.calls.filter((u) => u.endsWith("/api/community/session"))).toHaveLength(2);
    expect(srv.sockets).toHaveLength(2);
    up(srv.sockets[1]); // [SCOPE 144 / T030]
    expect(last(c.statuses)?.status).toBe("connected");
    c.client.dispose();
  });

  it("a refused renewal gives one error with the server's words and no retry loop", async () => {
    const words = "This email isn't a member of your company";
    const srv = scriptedServer([sessionOk("cookie-value-0001"), fail(403, { error: "email_not_in_company", message: words })]);
    srv.wsToken = () => fail(401);
    const c = await startedClient(srv);
    const errorsNow = of(c.statuses, "error");
    expect(errorsNow).toHaveLength(1);
    expect(errorsNow[0].detail).toBe(words);
    expect(errorsNow[0].link).toMatchObject({ roomLink: "error", reason: words });
    expect(c.errors).toHaveLength(1);
    expect(c.errors[0]).toContain(words);
    const callsBefore = srv.calls.length;
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(srv.calls.length).toBe(callsBefore);
    expect(of(c.statuses, "reconnecting")).toHaveLength(0);
    expect(of(c.statuses, "error")).toHaveLength(1);
    expect(srv.sockets).toHaveLength(0);
    c.client.dispose();
  });

  it("a fresh session refused too is dropped: the next attempt renews again, never the dead cookie", async () => {
    const srv = scriptedServer([sessionOk("cookie-value-0001"), sessionOk("cookie-value-0002"), sessionOk("cookie-value-0003")]);
    let tokenCalls = 0;
    srv.wsToken = () => (++tokenCalls <= 2 ? fail(401) : ok({ token: "ws-token-0006" }));
    const c = await startedClient(srv);
    expect(srv.calls.filter((u) => u.endsWith("/api/community/session"))).toHaveLength(2);
    expect(of(c.statuses, "reconnecting")).toHaveLength(1);
    expect(srv.sockets).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(srv.calls.filter((u) => u.endsWith("/api/community/session"))).toHaveLength(3);
    expect(srv.sockets).toHaveLength(1);
    c.client.dispose();
  });

  it("the cookie value is masked even when the server echoes it (FR-018)", async () => {
    const cookie = "cookie-value-SECRET-77";
    const srv = scriptedServer([sessionOk(cookie), fail(403, { message: `session yc_session=${cookie} was revoked (${cookie})` })]);
    srv.wsToken = () => fail(401);
    const c = await startedClient(srv);
    const seen = JSON.stringify([c.statuses, c.errors]);
    expect(seen).not.toContain(cookie);
    expect(of(c.statuses, "error")[0].detail).toContain("[masked]");
    c.client.dispose();
  });

  it("a renewal that fails on the network retries as before", async () => {
    const srv = scriptedServer([sessionOk("cookie-value-0001"), fail(503, "upstream down"), sessionOk("cookie-value-0003")]);
    let tokenCalls = 0;
    srv.wsToken = () => (++tokenCalls === 1 ? fail(401) : ok({ token: "ws-token-0004" }));
    // A 503 is a refusal-shaped reply; a thrown fetch is the network case.
    const base = srv.fetchImpl;
    let sessionCalls = 0;
    srv.fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).endsWith("/api/community/session") && ++sessionCalls === 2) throw new Error("ECONNRESET");
      return base(input, init);
    }) as unknown as FetchImpl;
    srv.sessions.splice(1, 1);
    const c = await startedClient(srv);
    expect(of(c.statuses, "reconnecting")).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(srv.sockets).toHaveLength(1);
    expect(of(c.statuses, "error")).toHaveLength(0);
    c.client.dispose();
  });
});
// [SCOPE 144 / T023] END

// [SCOPE 144 / T024] BEGIN — failed reconnects in a row and the outage times (FR-016, FR-017)
describe("T024 failure count and outage times (FR-016, FR-017)", () => {
  it("counts failed reconnects in a row, goes to error at 5, keeps the 15 s cap, and reports the outage on reconnect", async () => {
    const srv = scriptedServer([sessionOk("cookie-value-0001")]);
    const c = await startedClient(srv);
    up(srv.sockets[0]); // [SCOPE 144 / T030] the last proof of life is this ack
    const lostAt = Date.now();
    srv.wsToken = () => fail(503);
    srv.sockets[0].emit("close");
    const reconnecting = () => of(c.statuses, "reconnecting").map((s) => s.link as RoomLinkInfo);
    expect(reconnecting().map((l) => l.failures)).toEqual([0]);
    // Delays 1, 2, 4, 8, 15, 15 s.
    for (const d of [1_000, 2_000, 4_000, 8_000, 15_000, 15_000]) await vi.advanceTimersByTimeAsync(d);
    expect(reconnecting().map((l) => l.failures)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(reconnecting().map((l) => l.roomLink)).toEqual([
      "reconnecting",
      "reconnecting",
      "reconnecting",
      "reconnecting",
      "reconnecting",
      "error",
      "error",
    ]);
    expect(reconnecting().every((l) => l.since === new Date(lostAt).toISOString())).toBe(true);
    expect(reconnecting()[1].reason).toBe("token: ws/token 503");
    // Still at the cap: no attempt before 15 s.
    const callsBefore = srv.calls.length;
    await vi.advanceTimersByTimeAsync(14_000);
    expect(srv.calls.length).toBe(callsBefore);
    srv.wsToken = () => ok({ token: "ws-token-0005" });
    await vi.advanceTimersByTimeAsync(1_000);
    up(last(srv.sockets)); // [SCOPE 144 / T030]
    const connected = last(c.statuses);
    expect(connected?.status).toBe("connected");
    expect(connected?.link).toMatchObject({
      roomLink: "connected",
      failures: 0,
      outageStartedAt: new Date(lostAt).toISOString(),
      outageEndedAt: new Date(Date.now()).toISOString(),
    });
    expect(connected?.link?.reason).toBeUndefined();
    c.client.dispose();
  });
});
// [SCOPE 144 / T024] END

// [SCOPE 144 / T026] BEGIN — replayed messages are marked (FR-020)
describe("T026 replay marking (FR-020)", () => {
  it("marks messages between replay_start and replay_end, and only those", async () => {
    const srv = scriptedServer([sessionOk("cookie-value-0001")]);
    const c = await startedClient(srv);
    const sock = srv.sockets[0];
    sock.emit("open");
    const ev = (id: string, content: string) => ({
      type: "event",
      event: { id: `e-${id}`, type: "message.inbound", payload: { id, content, authorid: "u-1", authorname: "Ann" } },
    });
    sock.frame(ev("m1", "live before"));
    sock.frame({ type: "replay_start" });
    sock.frame(ev("m2", "CONFIRMED"));
    sock.frame({ type: "replay_end" });
    sock.frame(ev("m3", "live after"));
    expect(c.messages.map((m) => [m.text, m.replayed === true])).toEqual([
      ["live before", false],
      ["CONFIRMED", true],
      ["live after", false],
    ]);
    c.client.dispose();
  });
});
// [SCOPE 144 / T026] END

// [SCOPE 144 / T030] BEGIN — a reconnect counts only once proven healthy; the outage starts at the last proof of life
describe("T030 proven reconnect and outage start (FR-013, FR-015, FR-017)", () => {
  it("an open socket is not connected until its probe heartbeat is acked", async () => {
    const srv = scriptedServer([sessionOk("cookie-value-0001")]);
    const c = await startedClient(srv);
    srv.sockets[0].emit("open");
    expect(srv.sockets[0].heartbeats()).toBe(1); // the probe goes at open
    expect(of(c.statuses, "connected")).toHaveLength(0);
    ack(srv.sockets[0]);
    expect(of(c.statuses, "connected")).toHaveLength(1);
    ack(srv.sockets[0]); // a later ack is not a second reconnect
    expect(of(c.statuses, "connected")).toHaveLength(1);
    c.client.dispose();
  });

  it("a new socket that never acks is killed within 90 s and never reported connected", async () => {
    const srv = scriptedServer([sessionOk("cookie-value-0001")]);
    const c = await startedClient(srv);
    srv.sockets[0].emit("open");
    await vi.advanceTimersByTimeAsync(30_000);
    expect(srv.sockets[0].terminated).toBe(false);
    await vi.advanceTimersByTimeAsync(30_000); // the probe and the 30 s beat, both unacked
    expect(srv.sockets[0].terminated).toBe(true);
    expect(of(c.statuses, "connected")).toHaveLength(0);
    c.client.dispose();
  });

  it("open-then-drop keeps counting failures in a row and keeps the outage open", async () => {
    const srv = scriptedServer([sessionOk("cookie-value-0001")]);
    const c = await startedClient(srv);
    up(srv.sockets[0]);
    const aliveAt = Date.now();
    await vi.advanceTimersByTimeAsync(5_000);
    srv.sockets[0].emit("close");
    // Each new socket opens and drops at once, before any ack.
    for (const d of [1_000, 2_000, 4_000, 8_000, 15_000, 15_000]) {
      await vi.advanceTimersByTimeAsync(d);
      last(srv.sockets)?.emit("open");
      last(srv.sockets)?.emit("close");
    }
    const reconnecting = of(c.statuses, "reconnecting").map((s) => s.link as RoomLinkInfo);
    expect(reconnecting.map((l) => l.failures)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(reconnecting[5].roomLink).toBe("error");
    expect(of(c.statuses, "connected")).toHaveLength(1); // only the first, proven socket
    await vi.advanceTimersByTimeAsync(15_000);
    up(last(srv.sockets));
    expect(last(c.statuses)?.link).toMatchObject({
      roomLink: "connected",
      failures: 0,
      outageStartedAt: new Date(aliveAt).toISOString(),
      outageEndedAt: new Date(Date.now()).toISOString(),
    });
    c.client.dispose();
  });

  it("a silent death: the outage starts at the last ack, the status since at detection", async () => {
    const srv = scriptedServer([sessionOk("cookie-value-0001")]);
    const c = await startedClient(srv);
    up(srv.sockets[0]);
    await vi.advanceTimersByTimeAsync(30_000);
    ack(srv.sockets[0]);
    const lastAckAt = Date.now();
    await vi.advanceTimersByTimeAsync(90_000); // no acks: killed at the second miss
    expect(srv.sockets[0].terminated).toBe(true);
    const lost = of(c.statuses, "reconnecting")[0].link as RoomLinkInfo;
    expect(Date.parse(lost.since) - lastAckAt).toBeGreaterThan(30_000);
    await vi.advanceTimersByTimeAsync(1_000);
    up(last(srv.sockets));
    expect(last(c.statuses)?.link?.outageStartedAt).toBe(new Date(lastAckAt).toISOString());
    c.client.dispose();
  });

  it("two drops in a row: each is its own outage, and the second counts from 0", async () => {
    const srv = scriptedServer([sessionOk("cookie-value-0001")]);
    const c = await startedClient(srv);
    up(srv.sockets[0]);
    const firstLost = Date.now();
    srv.sockets[0].emit("close");
    await vi.advanceTimersByTimeAsync(1_000);
    up(srv.sockets[1]);
    const firstBack = Date.now();
    expect(last(c.statuses)?.link).toMatchObject({
      outageStartedAt: new Date(firstLost).toISOString(),
      outageEndedAt: new Date(firstBack).toISOString(),
    });
    await vi.advanceTimersByTimeAsync(10_000);
    srv.sockets[1].emit("close"); // the second drop, soon after the first reconnect
    await vi.advanceTimersByTimeAsync(1_000); // back-off restarts at 1 s: the count was reset
    expect(srv.sockets).toHaveLength(3);
    up(srv.sockets[2]);
    const reconnecting = of(c.statuses, "reconnecting").map((s) => s.link as RoomLinkInfo);
    expect(reconnecting.map((l) => l.failures)).toEqual([0, 0]);
    const connected = of(c.statuses, "connected").map((s) => s.link as RoomLinkInfo);
    expect(connected).toHaveLength(3);
    // The second outage starts at the last proof of life after the first reconnect (its ack).
    expect(connected[2]).toMatchObject({
      outageStartedAt: new Date(firstBack).toISOString(),
      outageEndedAt: new Date(Date.now()).toISOString(),
    });
    c.client.dispose();
  });
});
// [SCOPE 144 / T030] END
