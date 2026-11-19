/**
 * SPEC-151 (SCOPE-132 Amendment D) T003 — the project agent connection record:
 *   decideOpen                      stale / same-machine / other-machine rules (FR-059)
 *   ProjectAgentConnectionService   room lookup, conflict and open results
 *   POST /api/project-agent/connections[/:id/heartbeat|/:id/close] over real HTTP, services stubbed
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "net";
import type { Server } from "http";

const h = vi.hoisted(() => ({
  validateToken: vi.fn(),
  project: vi.fn(),
  open: vi.fn(),
  heartbeat: vi.fn(),
  close: vi.fn(),
}));

vi.mock("../../src/db/client.js", () => ({ db: {} }));
vi.mock("../../src/server/services/ApiTokenService.js", () => ({
  apiTokenService: { validateToken: h.validateToken },
}));
vi.mock("../../src/server/services/ProjectRemoteAccessService.js", () => ({
  projectRemoteAccessService: { project: h.project },
}));
vi.mock("../../src/server/services/AgentConnectService.js", () => ({
  agentConnectService: {},
  AgentConnectError: class extends Error {},
}));
vi.mock("../../src/server/services/CompanyYappchattService.js", () => ({ companyYappchattService: {} }));

import {
  decideOpen,
  formatHeartbeatBack,
  formatHeartbeatMissed,
  isHeartbeatMissed,
  LIVE_WINDOW_MS,
  ProjectAgentConnectionService,
  stepOutage,
  type ConnectionStore,
  type MissedHeartbeatCheck,
  type OpenConnectionRow,
  type OutageState,
} from "../../src/server/services/ProjectAgentConnectionService.js";

const NOW = new Date("2026-10-28T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const row = (id: string, machine: string, seenMsAgo: number): OpenConnectionRow => ({
  id,
  machine,
  connectedat: ago(seenMsAgo + 60_000),
  lastseenat: ago(seenMsAgo),
});

describe("decideOpen (FR-059)", () => {
  it("opens with nothing to close when the project has no open row", () => {
    expect(decideOpen([], "LAPTOP", NOW)).toEqual({ close: [], conflict: null });
  });

  it("closes a stale row from any machine as stale", () => {
    const d = decideOpen([row("a", "DESKTOP", LIVE_WINDOW_MS + 1)], "LAPTOP", NOW);
    expect(d).toEqual({ close: [{ id: "a", reason: "stale" }], conflict: null });
  });

  it("closes a live row from the same machine as replaced, ignoring host-name case", () => {
    const d = decideOpen([row("a", "laptop", 10_000)], "LAPTOP", NOW);
    expect(d).toEqual({ close: [{ id: "a", reason: "replaced" }], conflict: null });
  });

  it("refuses when another machine is live, and closes nothing", () => {
    const live = row("a", "DESKTOP", 10_000);
    expect(decideOpen([live], "LAPTOP", NOW)).toEqual({ close: [], conflict: live });
  });

  it("treats a row seen exactly 3 minutes ago as no longer live", () => {
    const d = decideOpen([row("a", "DESKTOP", LIVE_WINDOW_MS)], "LAPTOP", NOW);
    expect(d.conflict).toBeNull();
    expect(d.close).toEqual([{ id: "a", reason: "stale" }]);
  });
});

describe("ProjectAgentConnectionService", () => {
  const fakeStore = (open: OpenConnectionRow[], room: string | null) => {
    const closed: { id: string; reason: string }[] = [];
    const store: ConnectionStore = {
      liveRoom: vi.fn(async () => room),
      open: vi.fn(async (_p, _input, _now, decide) => {
        const d = decide(open);
        if (d.conflict) return { conflict: d.conflict };
        closed.push(...d.close);
        return { connectionId: "new-id" };
      }),
      heartbeat: vi.fn(async () => "ok" as const),
      close: vi.fn(async () => "ok" as const),
    };
    return { store, closed };
  };
  const info = { machine: "LAPTOP", repo: "wxKanban", agentTag: "wxKanban", kitVersion: "1.7.90" };

  it("opens with the project's live room and the 60-second heartbeat", async () => {
    const { store } = fakeStore([], "conv-1");
    const r = await new ProjectAgentConnectionService(store).open("p1", "KAIN", info, NOW);
    expect(r).toEqual({ kind: "opened", connectionId: "new-id", heartbeatSeconds: 60 });
    expect(store.liveRoom).toHaveBeenCalledWith("p1", "KAIN");
    expect(store.open).toHaveBeenCalledWith("p1", { ...info, conversationId: "conv-1" }, NOW, expect.any(Function));
  });

  it("answers a conflict with the other machine and its times", async () => {
    const live = row("a", "DESKTOP", 5_000);
    const { store } = fakeStore([live], "conv-1");
    const r = await new ProjectAgentConnectionService(store).open("p1", "KAIN", info, NOW);
    expect(r).toEqual({ kind: "conflict", machine: "DESKTOP", connectedAt: live.connectedat, lastSeenAt: live.lastseenat });
  });

  it("opens with no room when none is bound", async () => {
    const { store } = fakeStore([], null);
    await new ProjectAgentConnectionService(store).open("p1", "KAIN", info, NOW);
    expect(store.open).toHaveBeenCalledWith("p1", { ...info, conversationId: null }, NOW, expect.any(Function));
  });
});

vi.mock("../../src/server/services/ProjectAgentConnectionService.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../src/server/services/ProjectAgentConnectionService.js")>();
  return {
    ...real,
    projectAgentConnectionService: { open: h.open, heartbeat: h.heartbeat, close: h.close },
  };
});

describe("project agent connection routes", () => {
  let server: Server;
  let base: string;
  const ID = "0192f0a0-0000-7000-8000-000000000001";

  beforeAll(async () => {
    const { default: projectAgentRoutes } = await import("../../src/server/routes/projectAgent.js");
    const app = express();
    app.use(express.json());
    app.use("/api/project-agent", projectAgentRoutes);
    server = app.listen(0);
    await new Promise((r) => server.once("listening", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/project-agent`;
  });
  afterAll(() => server.close());

  beforeEach(() => {
    vi.clearAllMocks();
    h.validateToken.mockResolvedValue({ projectid: "p1", expiresat: null });
    h.project.mockResolvedValue({ id: "p1", name: "wxKanban", companyid: "c1", allowremote: true });
  });

  const post = (path: string, body: unknown, token: string | null = "kit-token") =>
    fetch(`${base}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
  const openBody = { machine: "LAPTOP", repo: "wxKanban", agentTag: "wxKanban", kitVersion: "1.7.90" };

  it("401 without a token, before anything is read", async () => {
    const res = await post("/connections", openBody, null);
    expect(res.status).toBe(401);
    expect(h.open).not.toHaveBeenCalled();
  });

  it("400 when the body names a project — the project is the token's", async () => {
    const res = await post("/connections", { ...openBody, projectId: "p2" });
    expect(res.status).toBe(400);
    expect(h.open).not.toHaveBeenCalled();
  });

  it("403 remote_not_allowed when the token's project does not allow remote", async () => {
    h.project.mockResolvedValue({ id: "p1", name: "wxKanban", companyid: "c1", allowremote: false });
    const res = await post("/connections", openBody);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("remote_not_allowed");
    expect(h.open).not.toHaveBeenCalled();
  });

  it("201 with the connection id, opened for the token's project and the default supervisor", async () => {
    h.open.mockResolvedValue({ kind: "opened", connectionId: ID, heartbeatSeconds: 60 });
    const res = await post("/connections", openBody);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ connectionId: ID, heartbeatSeconds: 60 });
    expect(h.open).toHaveBeenCalledWith("p1", "KAIN", { machine: "LAPTOP", repo: "wxKanban", agentTag: "wxKanban", kitVersion: "1.7.90" });
  });

  it("409 agent_already_connected names the other machine", async () => {
    h.open.mockResolvedValue({
      kind: "conflict",
      machine: "DESKTOP",
      connectedAt: new Date("2026-10-28T11:00:00Z"),
      lastSeenAt: new Date("2026-10-28T11:59:30Z"),
    });
    const res = await post("/connections", openBody);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toMatchObject({ error: "agent_already_connected", machine: "DESKTOP", lastSeenAt: "2026-10-28T11:59:30.000Z" });
  });

  it("heartbeat passes the state for the token's project; 404 and 410 map through", async () => {
    h.heartbeat.mockResolvedValueOnce("ok").mockResolvedValueOnce("not_found").mockResolvedValueOnce("closed");
    expect((await post(`/connections/${ID}/heartbeat`, { state: "working" })).status).toBe(200);
    expect(h.heartbeat).toHaveBeenCalledWith(ID, "p1", "working");
    expect((await post(`/connections/${ID}/heartbeat`, { state: "idle" })).status).toBe(404);
    const gone = await post(`/connections/${ID}/heartbeat`, { state: "idle" });
    expect(gone.status).toBe(410);
    expect((await gone.json()).error).toBe("connection_closed");
  });

  it("heartbeat refuses an unknown state and a non-uuid id", async () => {
    expect((await post(`/connections/${ID}/heartbeat`, { state: "busy" })).status).toBe(400);
    expect((await post(`/connections/not-a-uuid/heartbeat`, { state: "idle" })).status).toBe(400);
    expect(h.heartbeat).not.toHaveBeenCalled();
  });

  it("close is scoped to the token's project", async () => {
    h.close.mockResolvedValue("ok");
    expect((await post(`/connections/${ID}/close`, {})).status).toBe(200);
    expect(h.close).toHaveBeenCalledWith(ID, "p1");
  });
});

// [SCOPE 154 / T009] Missed-heartbeat alert from the connection record (FR-008).
describe("isHeartbeatMissed", () => {
  const now = new Date("2026-11-07T18:00:00Z");
  const base: MissedHeartbeatCheck = { live: true, autopilotRunActive: true, paused: false, lastStatusPostAt: now };

  it("never raises for a paused run", () => {
    expect(isHeartbeatMissed({ ...base, paused: true, live: false }, now)).toBe(false);
  });

  it("never raises when autopilot is not active on this connection", () => {
    expect(isHeartbeatMissed({ ...base, autopilotRunActive: false, live: false }, now)).toBe(false);
  });

  it("is missed when the connection is not live, even with a recent status post", () => {
    expect(isHeartbeatMissed({ ...base, live: false }, now)).toBe(true);
  });

  it("is missed when no status post has happened for 20 minutes", () => {
    const staleAt = new Date(now.getTime() - 20 * 60_000);
    expect(isHeartbeatMissed({ ...base, lastStatusPostAt: staleAt }, now)).toBe(true);
  });

  it("is not missed inside the 20-minute window", () => {
    const recentAt = new Date(now.getTime() - 19 * 60_000);
    expect(isHeartbeatMissed({ ...base, lastStatusPostAt: recentAt }, now)).toBe(false);
  });

  it("is not missed when live and no status post has posted yet (nothing to compare against)", () => {
    expect(isHeartbeatMissed({ ...base, lastStatusPostAt: null }, now)).toBe(false);
  });
});

describe("stepOutage", () => {
  it("raises exactly one alert on the transition into an outage, then stays quiet", () => {
    let state: OutageState = { alerting: false };
    const first = stepOutage(state, true);
    expect(first.verdict).toBe("missed");
    state = first.state;
    const second = stepOutage(state, true);
    expect(second.verdict).toBe("none");
  });

  it("raises exactly one back line on return, then stays quiet", () => {
    let state: OutageState = { alerting: true };
    const first = stepOutage(state, false);
    expect(first.verdict).toBe("back");
    state = first.state;
    const second = stepOutage(state, false);
    expect(second.verdict).toBe("none");
  });
});

describe("formatHeartbeatMissed / formatHeartbeatBack", () => {
  it("name the machine in each line", () => {
    expect(formatHeartbeatMissed("DESKTOP-ANDY")).toContain("DESKTOP-ANDY");
    expect(formatHeartbeatBack("DESKTOP-ANDY")).toContain("DESKTOP-ANDY");
  });
});
