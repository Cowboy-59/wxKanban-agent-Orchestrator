/**
 * SPEC-155 (SCOPE-132 Amendment G piece A) T008 — direct coverage of the real, DB-touching
 * `drizzleConnectionStore` and `sessionStatus()` (FR-003, FR-004, FR-006). Everything else in
 * `ProjectAgentConnectionService.test.ts`-style files exercises the service only via a hand-rolled
 * `fakeStore`; this file is the first to assert the actual `.set()` payloads the store sends to
 * Postgres — the clear-on-close and clear-on-sharing-off columns had zero coverage before this.
 *
 * A hand-built chainable mock stands in for `db`: `update().set().where().returning()` and
 * `select().from().where().orderBy().limit()` are the only two shapes this module calls, so the
 * mock only needs to support those two chains and record what `.set()` was given.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDb = vi.hoisted(() => {
  const state: {
    setPayload: Record<string, unknown> | undefined;
    returningRows: Array<{ id: string }>;
    selectRows: unknown[];
  } = { setPayload: undefined, returningRows: [], selectRows: [] };
  const chain: Record<string, (...args: unknown[]) => unknown> = {
    update: vi.fn(() => chain),
    set: vi.fn((val: unknown) => {
      state.setPayload = val as Record<string, unknown>;
      return chain;
    }),
    where: vi.fn(() => chain),
    returning: vi.fn(async () => state.returningRows),
    select: vi.fn(() => chain),
    from: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    limit: vi.fn(async () => state.selectRows),
  };
  return { chain, state };
});

vi.mock("../../src/db/client.js", () => ({ db: mockDb.chain }));
vi.mock("../../src/db/schema/projectagentconnection.js", () => ({
  projectagentconnections: {
    id: "id",
    projectid: "projectid",
    disconnectedat: "disconnectedat",
    sessionsummary: "sessionsummary",
    lastentry: "lastentry",
    blockers: "blockers",
    sharing: "sharing",
    state: "state",
    lastseenat: "lastseenat",
    connectedat: "connectedat",
  },
}));
vi.mock("../../src/db/schema/projectroom.js", () => ({
  projectrooms: { projectid: "projectid", agentname: "agentname", retiredat: "retiredat", conversationid: "conversationid" },
}));

import { drizzleConnectionStore, sessionStatus } from "../../src/server/services/ProjectAgentConnectionService.js";

const NOW = new Date("2026-11-07T12:00:00.000Z");
const CONN = "conn-1";
const PROJECT = "proj-1";

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.state.setPayload = undefined;
  mockDb.state.returningRows = [{ id: CONN }];
  mockDb.state.selectRows = [];
});

// [SCOPE 155 / T008] BEGIN — heartbeat/close clear the rolling-summary columns (FR-003, FR-006)
describe("drizzleConnectionStore.heartbeat — sharing off clears the columns within one heartbeat", () => {
  it("sharing:false drops whatever was carried, overwrite-only", async () => {
    const result = await drizzleConnectionStore.heartbeat(CONN, PROJECT, "idle", { sharing: false }, NOW);
    expect(result).toBe("ok");
    expect(mockDb.state.setPayload).toEqual({
      lastseenat: NOW,
      state: "idle",
      sharing: false,
      sessionsummary: null,
      lastentry: null,
      blockers: null,
      summaryat: null,
    });
  });

  it("a summary/lastEntry/blockers payload carries through and stamps summaryat", async () => {
    await drizzleConnectionStore.heartbeat(
      CONN,
      PROJECT,
      "working",
      { summary: "Rolling summary.", lastEntry: "Last turn.", blockers: ["blocked on review"], sharing: true },
      NOW,
    );
    expect(mockDb.state.setPayload).toEqual({
      lastseenat: NOW,
      state: "working",
      sessionsummary: "Rolling summary.",
      lastentry: "Last turn.",
      blockers: ["blocked on review"],
      summaryat: NOW,
      sharing: true,
    });
  });

  it("no summaryInput at all only touches lastseenat/state", async () => {
    await drizzleConnectionStore.heartbeat(CONN, PROJECT, "waiting", undefined, NOW);
    expect(mockDb.state.setPayload).toEqual({ lastseenat: NOW, state: "waiting" });
  });

  it("not_found when the row never existed", async () => {
    mockDb.state.returningRows = [];
    mockDb.state.selectRows = [];
    const result = await drizzleConnectionStore.heartbeat(CONN, PROJECT, "idle", undefined, NOW);
    expect(result).toBe("not_found");
  });

  it("closed when the row exists but already ended", async () => {
    mockDb.state.returningRows = [];
    mockDb.state.selectRows = [{ disconnectedat: NOW }];
    const result = await drizzleConnectionStore.heartbeat(CONN, PROJECT, "idle", undefined, NOW);
    expect(result).toBe("closed");
  });
});

describe("drizzleConnectionStore.close — always clears the columns, regardless of sharing", () => {
  it("clears sessionsummary/lastentry/blockers/summaryat alongside disconnectedat/endreason", async () => {
    const result = await drizzleConnectionStore.close(CONN, PROJECT, NOW);
    expect(result).toBe("ok");
    expect(mockDb.state.setPayload).toEqual({
      disconnectedat: NOW,
      endreason: "stopped",
      sessionsummary: null,
      lastentry: null,
      blockers: null,
      summaryat: null,
    });
  });

  it("not_found when the row never existed", async () => {
    mockDb.state.returningRows = [];
    mockDb.state.selectRows = [];
    expect(await drizzleConnectionStore.close(CONN, PROJECT, NOW)).toBe("not_found");
  });
});
// [SCOPE 155 / T008] END

// [SCOPE 155 / T008] BEGIN — sessionStatus masks when sharing is off (FR-004)
describe("sessionStatus", () => {
  it("no connection row at all -> the gone/not-sharing default", async () => {
    mockDb.state.selectRows = [];
    const status = await sessionStatus(PROJECT, NOW);
    expect(status).toEqual({
      summary: null,
      lastEntry: null,
      blockers: [],
      state: null,
      lastSeenAt: null,
      liveness: "gone",
      sharing: false,
    });
  });

  it("sharing on, live: the full shape passes through", async () => {
    mockDb.state.selectRows = [
      {
        sessionsummary: "Rolling summary.",
        lastentry: "Last turn.",
        blockers: ["waiting on review"],
        sharing: true,
        state: "working",
        lastseenat: new Date(NOW.getTime() - 10_000),
        disconnectedat: null,
      },
    ];
    const status = await sessionStatus(PROJECT, NOW);
    expect(status).toEqual({
      summary: "Rolling summary.",
      lastEntry: "Last turn.",
      blockers: ["waiting on review"],
      state: "working",
      lastSeenAt: new Date(NOW.getTime() - 10_000),
      liveness: "live",
      sharing: true,
    });
  });

  // sessionStatus() itself is a plain read — the sharing gate is applied by its callers (the REST
  // route and the MCP tool, each tested separately), not here. This pins that `sharing: false` is
  // reported accurately so a caller CAN mask, without sessionStatus pre-emptively dropping data a
  // caller might need for its own audit/debug purposes.
  it("sharing off: the raw row still comes through — masking is the caller's job, not sessionStatus's", async () => {
    mockDb.state.selectRows = [
      {
        sessionsummary: "Raw summary.",
        lastentry: "Raw last entry.",
        blockers: ["still raw"],
        sharing: false,
        state: "idle",
        lastseenat: new Date(NOW.getTime() - LIVE_WINDOW_MS_PLUS),
        disconnectedat: null,
      },
    ];
    const status = await sessionStatus(PROJECT, NOW);
    expect(status.summary).toBe("Raw summary.");
    expect(status.lastEntry).toBe("Raw last entry.");
    expect(status.blockers).toEqual(["still raw"]);
    expect(status.state).toBe("idle");
    expect(status.liveness).toBe("stale");
    expect(status.sharing).toBe(false);
  });

  it("a closed row (disconnectedat set) reads liveness 'gone' regardless of lastseenat", async () => {
    mockDb.state.selectRows = [
      {
        sessionsummary: null,
        lastentry: null,
        blockers: null,
        sharing: false,
        state: "idle",
        lastseenat: NOW,
        disconnectedat: NOW,
      },
    ];
    const status = await sessionStatus(PROJECT, NOW);
    expect(status.liveness).toBe("gone");
  });

  it("a malformed blockers value (not an array of strings) reads back as no blockers, never throws", async () => {
    mockDb.state.selectRows = [
      {
        sessionsummary: "s",
        lastentry: "e",
        blockers: { not: "an array" },
        sharing: true,
        state: "working",
        lastseenat: NOW,
        disconnectedat: null,
      },
    ];
    const status = await sessionStatus(PROJECT, NOW);
    expect(status.blockers).toEqual([]);
  });
});
// [SCOPE 155 / T008] END

// LIVE_WINDOW_MS is 3 minutes (HEARTBEAT_SECONDS * 3); used above to force a 'stale' verdict
// without importing the constant and coupling this file to its exact value changing later.
const LIVE_WINDOW_MS_PLUS = 4 * 60_000;
