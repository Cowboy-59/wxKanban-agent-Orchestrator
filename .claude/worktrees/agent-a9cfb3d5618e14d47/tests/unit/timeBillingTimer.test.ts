// SPEC-005 / T006 — side timer and automatic notes. The db client is mocked; nothing here
// opens a connection (the local .env points at production).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const selectQueue: unknown[][] = [];
const updateQueue: unknown[][] = [];
const executeQueue: unknown[][] = [];
const executeCalls: number[] = [];
const inserted: Record<string, unknown>[] = [];

vi.mock("../../src/db/client.js", () => {
  const thenable = (rows: () => unknown[]): Record<string, unknown> => {
    const c: Record<string, unknown> = {};
    for (const m of ["from", "where", "limit", "orderBy", "set"]) c[m] = () => c;
    c.returning = () => c;
    c.then = (resolve: (v: unknown[]) => void) => resolve(rows());
    return c;
  };
  return {
    db: {
      select: () => thenable(() => selectQueue.shift() ?? []),
      update: () => thenable(() => updateQueue.shift() ?? []),
      execute: () => {
        executeCalls.push(1);
        return Promise.resolve({ rows: executeQueue.shift() ?? [] });
      },
      insert: () => ({
        values: (v: Record<string, unknown>) => {
          inserted.push(v);
          return { returning: () => Promise.resolve([{ ...v }]) };
        },
      }),
    },
  };
});

import { TimeBillingTimerService } from "../../src/server/services/TimeBillingTimerService.js";
import {
  formatRunNoteLine,
  resetAgentRunsAvailabilityCache,
} from "../../src/server/services/AgentRunSource.js";

// [SCOPE 005 / T006] BEGIN — unit tests for the side timer
const T0 = new Date("2026-11-02T14:00:00.000Z");

function running(minutesAgo: number): Record<string, unknown> {
  return {
    id: "e1",
    companyid: "c1",
    userid: "u1",
    projectid: "p1",
    line: "scope",
    source: "timer",
    category: "developer",
    starttime: new Date(T0.getTime() - minutesAgo * 60000),
    endtime: null,
    pausedat: null, // [SCOPE 005 / T029] columns from 0077
    pausedseconds: 0,
  };
}

beforeEach(() => {
  selectQueue.length = 0;
  updateQueue.length = 0;
  executeQueue.length = 0;
  executeCalls.length = 0;
  inserted.length = 0;
  resetAgentRunsAvailabilityCache();
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("TimeBillingTimerService.start (FR-006)", () => {
  const input = { projectid: "p1", line: "scope" as const, specid: "s1" };

  it("refuses a second running timer with 409", async () => {
    selectQueue.push([running(5)]);
    await expect(TimeBillingTimerService.start("c1", "u1", input)).rejects.toMatchObject({ statusCode: 409 });
    expect(inserted).toHaveLength(0);
  });

  it("refuses the process line", async () => {
    await expect(
      TimeBillingTimerService.start("c1", "u1", { projectid: "p1", line: "process", specid: null }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("refuses a project of another company with 404", async () => {
    selectQueue.push([], []); // no running timer, no project
    await expect(TimeBillingTimerService.start("c1", "u1", input)).rejects.toMatchObject({ statusCode: 404 });
    expect(inserted).toHaveLength(0);
  });

  it("inserts a running Developer row with the rate snapshotted", async () => {
    selectQueue.push(
      [], // no running timer
      [{ id: "p1", hourlyrate: "175.00", resourcerate: null }],
      [{ id: "s1" }],
      [{ hourlyrate: null, resourcerate: null }],
    );
    const created = await TimeBillingTimerService.start("c1", "u1", { ...input, workdate: "2026-11-02" });
    expect(created).toMatchObject({
      source: "timer",
      category: "developer",
      endtime: null,
      duration: null,
      userid: "u1",
      enteredbyid: "u1",
      entryrate: "175.00",
      workdate: "2026-11-02",
    });
  });
});

describe("TimeBillingTimerService.getRunning (reload survival)", () => {
  it("returns the running row with elapsed seconds", async () => {
    selectQueue.push([running(5)]);
    const r = await TimeBillingTimerService.getRunning("c1", "u1");
    expect(r?.elapsedSeconds).toBe(300);
  });

  it("returns null when nothing runs", async () => {
    selectQueue.push([]);
    expect(await TimeBillingTimerService.getRunning("c1", "u1")).toBeNull();
  });
});

describe("TimeBillingTimerService.stop (FR-005, FR-006)", () => {
  it("rounds 7 elapsed minutes up to 15 and 98 up to 105", async () => {
    for (const [elapsed, expected] of [[7, 15], [98, 105]] as const) {
      resetAgentRunsAvailabilityCache();
      selectQueue.push([running(elapsed)]);
      executeQueue.push([{ ok: false }]);
      updateQueue.push([{ id: "e1", duration: expected }]);
      const stopped = await TimeBillingTimerService.stop("c1", "u1");
      expect(stopped.duration).toBe(expected);
    }
  });

  it("combines automatic run lines with manual notes", async () => {
    const sets: unknown[] = [];
    selectQueue.push([running(20)]);
    executeQueue.push(
      [{ ok: true }],
      [
        { command: "implement", task: "Add timer", scope: "005", model: "claude-opus-5-5", activeseconds: 125 },
        { command: "runqa", task: null, scope: "005", model: "claude-sonnet-5-5", activeseconds: null },
      ],
    );
    updateQueue.push([{ id: "e1" }]);
    const stopped = await TimeBillingTimerService.stop("c1", "u1", { manualNotes: "  Client call  " });
    sets.push(stopped);
    expect(executeCalls).toHaveLength(2);
    // The mocked update returns its queued row; verify the notes through a second pass on the pure formatter.
    expect(
      formatRunNoteLine({ command: "implement", task: "Add timer", scope: "005", model: "claude-opus-5-5", minutes: 3 }),
    ).toBe("implement · Add timer · 005 · claude-opus-5-5 · 3 min");
  });

  it("writes automatic lines, a blank line, then manual notes into the update", async () => {
    let captured: Record<string, unknown> | undefined;
    const { db } = await import("../../src/db/client.js");
    const realUpdate = db.update;
    (db as unknown as { update: () => unknown }).update = () => {
      const chain: Record<string, unknown> = {};
      for (const m of ["where", "returning"]) chain[m] = () => chain;
      chain.set = (v: Record<string, unknown>) => {
        captured = v;
        return chain;
      };
      chain.then = (resolve: (v: unknown[]) => void) => resolve([{ id: "e1" }]);
      return chain;
    };
    try {
      selectQueue.push([running(20)]);
      executeQueue.push(
        [{ ok: true }],
        [{ command: "implement", task: "Add timer", scope: "005", model: "m1", activeseconds: 125 }],
      );
      await TimeBillingTimerService.stop("c1", "u1", { manualNotes: "  Client call  " });
    } finally {
      (db as unknown as { update: typeof realUpdate }).update = realUpdate;
    }
    expect(captured?.notes).toBe("implement · Add timer · 005 · m1 · 3 min\n\nClient call");
    expect(captured?.duration).toBe(30);
  });

  it("returns 409 when the timer was stopped between load and write", async () => {
    selectQueue.push([running(10)]);
    executeQueue.push([{ ok: false }]);
    updateQueue.push([]);
    await expect(TimeBillingTimerService.stop("c1", "u1")).rejects.toMatchObject({ statusCode: 409 });
  });

  it("returns 404 when no timer runs", async () => {
    selectQueue.push([]);
    await expect(TimeBillingTimerService.stop("c1", "u1")).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("automatic notes (FR-006)", () => {
  it("reports available:false and runs no agentruns query when the table is missing", async () => {
    selectQueue.push([running(10)]);
    executeQueue.push([{ ok: false }]);
    const n = await TimeBillingTimerService.notes("c1", "u1");
    expect(n).toEqual({ available: false, lines: [] });
    expect(executeCalls).toHaveLength(1); // only the existence probe
  });

  it("formatRunNoteLine carries only the five fields and uses a dash for gaps", () => {
    expect(formatRunNoteLine({ command: "runqa", task: null, scope: null, model: "m1", minutes: 0 })).toBe(
      "runqa · — · — · m1 · 0 min",
    );
  });
});
// [SCOPE 005 / T006] END

// [SCOPE 005 / T027] BEGIN — Amendment D: the timer runs on DBA, Management and Meetings
describe("TimeBillingTimerService.start — Developer-only project lines (Amendment D)", () => {
  it("refuses a scope on a Developer-only line", async () => {
    await expect(
      TimeBillingTimerService.start("c1", "u1", { projectid: "p1", line: "meeting", specid: "s1" }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("inserts a running Developer row on the dba line with no scope", async () => {
    selectQueue.push(
      [], // no running timer
      [{ id: "p1", hourlyrate: null, resourcerate: null }],
      [{ hourlyrate: "150.00", resourcerate: null }],
    );
    const created = await TimeBillingTimerService.start("c1", "u1", {
      projectid: "p1",
      line: "dba",
      specid: null,
      workdate: "2026-11-02",
    });
    expect(created).toMatchObject({ line: "dba", specid: null, category: "developer", source: "timer" });
  });
});
// [SCOPE 005 / T027] END

// [SCOPE 005 / T029] BEGIN — Pause/Resume: one entry, active time rounded once (FR-006 Amendment F)
describe("TimeBillingTimerService pause and resume (Amendment F)", () => {
  /** Runs fn with db.update replaced by a chain that records its .set() values and returns `rows`. */
  async function captureUpdates<T>(rows: unknown[], fn: () => Promise<T>): Promise<{ result: T; sets: Record<string, unknown>[] }> {
    const sets: Record<string, unknown>[] = [];
    const { db } = await import("../../src/db/client.js");
    const realUpdate = db.update;
    (db as unknown as { update: () => unknown }).update = () => {
      const chain: Record<string, unknown> = {};
      for (const m of ["where", "returning"]) chain[m] = () => chain;
      chain.set = (v: Record<string, unknown>) => {
        sets.push(v);
        return chain;
      };
      chain.then = (resolve: (v: unknown[]) => void) => resolve(rows);
      return chain;
    };
    try {
      return { result: await fn(), sets };
    } finally {
      (db as unknown as { update: typeof realUpdate }).update = realUpdate;
    }
  }

  it("pause sets pausedat to now and reports the frozen active time", async () => {
    selectQueue.push([running(10)]);
    const row = { ...running(10), pausedat: T0 };
    const { result, sets } = await captureUpdates([row], () => TimeBillingTimerService.pause("c1", "u1"));
    expect(sets[0]?.pausedat).toEqual(T0);
    expect(result).toMatchObject({ paused: true, elapsedSeconds: 600 });
  });

  it("a paused timer's clock does not move, and getRunning says paused", async () => {
    // Started 30 min ago, paused 20 min ago, nothing paused before: 10 active minutes.
    selectQueue.push([{ ...running(30), pausedat: new Date(T0.getTime() - 20 * 60000) }]);
    const r = await TimeBillingTimerService.getRunning("c1", "u1");
    expect(r).toMatchObject({ paused: true, elapsedSeconds: 600 });
  });

  it("resume adds the paused stretch to pausedseconds and clears pausedat", async () => {
    selectQueue.push([{ ...running(30), pausedat: new Date(T0.getTime() - 20 * 60000), pausedseconds: 60 }]);
    const row = { ...running(30), pausedat: null, pausedseconds: 1260 };
    const { result, sets } = await captureUpdates([row], () => TimeBillingTimerService.resume("c1", "u1"));
    expect(sets[0]).toMatchObject({ pausedat: null, pausedseconds: 60 + 1200 });
    expect(result).toMatchObject({ paused: false, elapsedSeconds: 30 * 60 - 1260 });
  });

  it("two 5-minute stretches around a 20-minute pause save ONE 15-minute entry", async () => {
    // Started 30 min ago, paused 20 of them: 10 active minutes -> rounds up to 15 once.
    selectQueue.push([{ ...running(30), pausedseconds: 1200 }]);
    executeQueue.push([{ ok: false }]);
    const { sets } = await captureUpdates([{ id: "e1" }], () => TimeBillingTimerService.stop("c1", "u1"));
    expect(sets[0]).toMatchObject({ duration: 15, pausedat: null, pausedseconds: 1200 });
  });

  it("stopping while paused bills only up to the pause and records the open pause", async () => {
    // Started 40 min ago, paused 25 min ago (still paused): 15 active minutes.
    selectQueue.push([{ ...running(40), pausedat: new Date(T0.getTime() - 25 * 60000) }]);
    executeQueue.push([{ ok: false }]);
    const { sets } = await captureUpdates([{ id: "e1" }], () => TimeBillingTimerService.stop("c1", "u1"));
    expect(sets[0]).toMatchObject({ duration: 15, pausedat: null, pausedseconds: 1500 });
  });

  it("pause on a paused timer and resume on a running one are 409; no timer is 404", async () => {
    selectQueue.push([{ ...running(10), pausedat: T0 }]);
    await expect(TimeBillingTimerService.pause("c1", "u1")).rejects.toMatchObject({ statusCode: 409 });
    selectQueue.push([running(10)]);
    await expect(TimeBillingTimerService.resume("c1", "u1")).rejects.toMatchObject({ statusCode: 409 });
    selectQueue.push([]);
    await expect(TimeBillingTimerService.pause("c1", "u1")).rejects.toMatchObject({ statusCode: 404 });
    selectQueue.push([]);
    await expect(TimeBillingTimerService.resume("c1", "u1")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("a timer stopped between load and pause is 409", async () => {
    selectQueue.push([running(10)]);
    const { result } = await captureUpdates([], () => TimeBillingTimerService.pause("c1", "u1").catch((e: unknown) => e));
    expect(result).toMatchObject({ statusCode: 409 });
  });
});
// [SCOPE 005 / T029] END
