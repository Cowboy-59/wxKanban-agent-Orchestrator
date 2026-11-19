/**
 * [SCOPE 148 / T012] Triggers, the sink gate and the one-run lock.
 *
 * Real behaviour against a temp repo with the runner, the settings call and the token refresh
 * stubbed. The clock is injected rather than faked globally, because what is under test is how
 * the schedule READS the clock — a tick that fires on the first minute after a laptop wakes is
 * the whole point of a tick instead of a 24-hour timeout, and a frozen global timer cannot show
 * that.
 */
import { mkdtempSync, mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  FAILURE_COOLDOWN_MS,
  NOT_SINK_MESSAGE,
  reportExistsFor,
  TriageSchedule,
  type TriageScheduleOptions,
} from "../../apps/remote-bridge/src/triage-schedule";
import { TRIAGE_DIR } from "../../apps/remote-bridge/src/triage-hook";
import type { TriageRunOptions, TriageRunResult } from "../../apps/remote-bridge/src/triage-run";
import type { ProjectAgentConfig } from "../../apps/remote-bridge/src/agent-mode";
import { formatFingerprint, type Fingerprint } from "../../apps/remote-bridge/src/triage-fingerprint";

const CONFIG: ProjectAgentConfig = {
  projectToken: "wxk_live_test",
  supervisor: "KAIN",
  appBaseUrl: "https://app.test",
  mcpUrl: "https://mcp.test",
};

/** 2026-10-26 07:30 local — past 06:00, so a run is due unless today's report exists. */
const AFTER_SIX = new Date(2026, 9, 26, 7, 30, 0);
/** 2026-10-26 03:15 local — before 06:00, so nothing is due yet. */
const BEFORE_SIX = new Date(2026, 9, 26, 3, 15, 0);

let repoRoot: string;
let posts: string[];
let runs: TriageRunOptions[];

beforeEach(() => {
  repoRoot = mkdtempSync(join(tmpdir(), "triage-sched-"));
  mkdirSync(join(repoRoot, TRIAGE_DIR), { recursive: true });
  posts = [];
  runs = [];
});

function writeTodaysReport(date = "2026-10-26"): void {
  writeFileSync(join(repoRoot, TRIAGE_DIR, `BUG-Triage-${date}.md`), "# Feedback Triage\n", "utf8");
}

/** A stand-in fingerprint; its contents only matter to the fingerprint module's own tests. */
const FP_A: Fingerprint = { "my:new": { count: 2, latest: "2026-10-26T09:00:00Z" } };

const okResult = (): TriageRunResult => ({
  ok: true,
  reportPath: `${TRIAGE_DIR}/BUG-Triage-2026-10-26.md`,
  report: "# Feedback Triage\n",
  blocks: [],
});

function make(over: Partial<TriageScheduleOptions> = {}, at: Date = AFTER_SIX): TriageSchedule {
  return new TriageSchedule({
    repoRoot,
    config: CONFIG,
    projectId: "ba924193-0335-4080-9fa6-33cd6b81300a",
    post: (t) => void posts.push(t),
    now: () => at,
    fetchSettings: async () => ({ allowRemote: true, feedbackSink: true, autopilotEnabled: false }),
    refreshToken: async () => ({ token: "fresh-token", expiresAt: "2026-10-26T08:00:00Z" }),
    run: async (o) => {
      runs.push(o);
      return okResult();
    },
    // T013 default: the queue changed, so scheduled runs proceed. Overridden per test.
    checkChange: async () => ({ run: true, fingerprint: FP_A, titles: [], reason: "changed" }),
    scanNow: async () => ({ fingerprint: FP_A, titles: [] }),
    ...over,
  });
}

describe("the sink gate (FR-001)", () => {
  it("arms nothing and answers with the fixed line when the project is not the sink", async () => {
    const s = make({ fetchSettings: async () => ({ allowRemote: true, feedbackSink: false, autopilotEnabled: false }) });
    await s.start();
    expect(s.isArmed).toBe(false);
    expect(runs).toHaveLength(0);
    expect(posts.join("\n")).toContain(NOT_SINK_MESSAGE);
  });

  it("arms nothing when the settings call cannot be reached, and says so", async () => {
    const s = make({
      fetchSettings: async () => {
        throw new Error("getaddrinfo ENOTFOUND app.test");
      },
    });
    await s.start();
    expect(s.isArmed).toBe(false);
    expect(runs).toHaveLength(0);
    expect(posts.join("\n")).toMatch(/could not be read/i);
    expect(posts.join("\n")).toContain("ENOTFOUND");
  });

  it("an app that predates T006 sends no feedbackSink, which must not read as yes", async () => {
    // The real fetchProjectAgentSettings coerces a missing field to false; prove the schedule
    // honours that rather than treating "not false" as permission.
    const s = make({ fetchSettings: async () => ({ allowRemote: true, feedbackSink: false, autopilotEnabled: false }) });
    await s.start();
    expect(s.isArmed).toBe(false);
  });

  it("arms on the sink project and says how to reach it", async () => {
    writeTodaysReport(); // suppress the catch-up so only the arming post is asserted
    const s = make();
    await s.start();
    expect(s.isArmed).toBe(true);
    expect(posts.join("\n")).toMatch(/daily at 06:00/);
    expect(posts.join("\n")).toContain("TRIAGE");
    s.stop();
  });
});

describe("catch-up on start (FR-002)", () => {
  it("runs when the hour has passed and today has no report", async () => {
    const s = make();
    await s.start();
    expect(runs).toHaveLength(1);
    expect(runs[0].trigger).toBe("catch-up");
    s.stop();
  });

  it("does not run when today's report already exists", async () => {
    writeTodaysReport();
    const s = make();
    await s.start();
    expect(runs).toHaveLength(0);
    s.stop();
  });

  it("does not run before the hour, even with no report", async () => {
    const s = make({}, BEFORE_SIX);
    await s.start();
    expect(runs).toHaveLength(0);
    s.stop();
  });
});

describe("the daily tick", () => {
  it("fires once the clock is past the hour with no report — the after-sleep case", async () => {
    let at = BEFORE_SIX;
    const s = make({ now: () => at }, BEFORE_SIX);
    await s.start();
    expect(runs).toHaveLength(0); // armed at 03:15, nothing due

    at = AFTER_SIX; // the machine slept through 06:00 and woke at 07:30
    await s.tick();
    expect(runs).toHaveLength(1);
    expect(runs[0].trigger).toBe("06:00");
    s.stop();
  });

  it("does not fire twice for one day: the report file is the record", async () => {
    let at = BEFORE_SIX;
    const s = make({
      now: () => at,
      run: async (o) => {
        runs.push(o);
        writeTodaysReport(); // the real runner writes the report
        return okResult();
      },
    });
    await s.start();
    at = AFTER_SIX;
    await s.tick();
    await s.tick();
    await s.tick();
    expect(runs).toHaveLength(1);
    s.stop();
  });

  it("does nothing after stop()", async () => {
    writeTodaysReport();
    const s = make();
    await s.start();
    s.stop();
    expect(s.isArmed).toBe(false);
    await s.tick();
    expect(runs).toHaveLength(0);
  });
});

describe("TRIAGE (FR-002)", () => {
  it("runs at once even when today's report already exists", async () => {
    writeTodaysReport();
    const s = make();
    await s.start();
    await s.trigger();
    expect(runs).toHaveLength(1);
    expect(runs[0].trigger).toBe("TRIAGE");
    s.stop();
  });

  it("is answered with the fixed line on a project that never armed", async () => {
    const s = make({ fetchSettings: async () => ({ allowRemote: true, feedbackSink: false, autopilotEnabled: false }) });
    await s.start();
    posts.length = 0;
    await s.trigger();
    expect(posts).toEqual([NOT_SINK_MESSAGE]);
    expect(runs).toHaveLength(0);
  });

  it("refuses a second run while one is in flight, naming the start time", async () => {
    writeTodaysReport();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const s = make({
      run: async (o) => {
        runs.push(o);
        await gate;
        return okResult();
      },
    });
    await s.start();

    const first = s.trigger();
    await Promise.resolve(); // let the run reach its await
    expect(s.isRunning).toBe(true);

    await s.trigger();
    expect(runs).toHaveLength(1);
    expect(posts.join("\n")).toContain("Triage already running (started 07:30)");

    release();
    await first;
    expect(s.isRunning).toBe(false);
    s.stop();
  });

  it("a tick during a run is ignored, not queued", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const s = make({
      run: async (o) => {
        runs.push(o);
        await gate;
        return okResult();
      },
    });
    // start() awaits its own catch-up run, so it stays pending until the gate opens — hold the
    // promise rather than awaiting it, or the test deadlocks on the thing it is testing.
    const starting = s.start();
    // Wait for the run to actually REACH the runner, not merely for the lock to be taken:
    // begin() awaits the token refresh and the fingerprint check first, so isRunning goes true
    // several microtasks before run() is called.
    for (let i = 0; i < 200 && runs.length === 0; i++) await Promise.resolve();
    expect(s.isRunning).toBe(true);
    await s.tick();
    expect(runs).toHaveLength(1);
    release();
    await starting;
    s.stop();
  });
});

describe("the per-run token refresh (decision A)", () => {
  it("mints a fresh token for every run and hands it to the runner", async () => {
    writeTodaysReport();
    let minted = 0;
    const s = make({
      refreshToken: async () => ({ token: `token-${++minted}`, expiresAt: "2026-10-26T08:00:00Z" }),
    });
    await s.start();
    await s.trigger();
    await s.trigger();
    expect(minted).toBe(2);
    expect(runs.map((r) => r.mcpToken)).toEqual(["token-1", "token-2"]);
    s.stop();
  });

  it("does not run at all when the refresh is refused, and says why", async () => {
    writeTodaysReport();
    const s = make({
      refreshToken: async () => {
        throw new Error("project agent room refused (403): remote_not_allowed");
      },
    });
    await s.start();
    await s.trigger();
    expect(runs).toHaveLength(0);
    expect(posts.join("\n")).toContain("remote_not_allowed");
    s.stop();
  });
});

describe("the failure cooldown", () => {
  it("holds off the tick after a failed run, then retries once the cooldown passes", async () => {
    let at = AFTER_SIX;
    const s = make({
      now: () => at,
      run: async (o) => {
        runs.push(o);
        return { ok: false, cause: "the session ended without success", blocks: [] };
      },
    });
    await s.start(); // catch-up runs and fails
    expect(runs).toHaveLength(1);

    at = new Date(AFTER_SIX.getTime() + 60_000); // a minute later
    await s.tick();
    expect(runs).toHaveLength(1); // still cooling down

    at = new Date(AFTER_SIX.getTime() + FAILURE_COOLDOWN_MS + 1_000);
    await s.tick();
    expect(runs).toHaveLength(2);
    s.stop();
  });

  it("TRIAGE ignores the cooldown — a human asking is not a retry loop", async () => {
    const s = make({
      run: async (o) => {
        runs.push(o);
        return { ok: false, cause: "boom", blocks: [] };
      },
    });
    await s.start();
    expect(runs).toHaveLength(1);
    await s.trigger();
    expect(runs).toHaveLength(2);
    s.stop();
  });
});

describe("the no-change check (FR-003, T013)", () => {
  it("skips a scheduled run and names the date it last reported on", async () => {
    const s = make({ checkChange: async () => ({ run: false, since: "2026-10-25" }) });
    await s.start();
    expect(runs).toHaveLength(0);
    expect(posts.join("\n")).toContain("Triage: no change since 2026-10-25");
    s.stop();
  });

  it("does not re-check every minute for the rest of the day after a skip", async () => {
    let checks = 0;
    const s = make({
      checkChange: async () => {
        checks++;
        return { run: false, since: "2026-10-25" };
      },
    });
    await s.start(); // catch-up checks once and skips
    expect(checks).toBe(1);
    await s.tick();
    await s.tick();
    await s.tick();
    expect(checks).toBe(1); // the day is settled; TRIAGE is the override
    expect(runs).toHaveLength(0);
    s.stop();
  });

  it("TRIAGE overrides a same-day skip and still stamps a fingerprint", async () => {
    const s = make({ checkChange: async () => ({ run: false, since: "2026-10-25" }) });
    await s.start();
    expect(runs).toHaveLength(0);
    await s.trigger();
    expect(runs).toHaveLength(1);
    expect(runs[0].trigger).toBe("TRIAGE");
    expect(runs[0].fingerprint).toBe(formatFingerprint(FP_A));
    s.stop();
  });

  it("TRIAGE never consults the comparison at all", async () => {
    let checks = 0;
    const s = make({
      checkChange: async () => {
        checks++;
        return { run: true, fingerprint: FP_A, titles: [], reason: "changed" };
      },
    });
    writeTodaysReport(); // suppress catch-up so only TRIAGE's path is exercised
    await s.start();
    await s.trigger();
    expect(checks).toBe(0);
    expect(runs).toHaveLength(1);
    s.stop();
  });

  it("passes the current fingerprint to the runner when the queue changed", async () => {
    const s = make();
    await s.start();
    expect(runs).toHaveLength(1);
    expect(runs[0].fingerprint).toBe(formatFingerprint(FP_A));
    s.stop();
  });

  it("runs anyway when the fingerprint cannot be built", async () => {
    const s = make({
      checkChange: async () => {
        throw new Error("list_my_feedback failed (503)");
      },
    });
    await s.start();
    expect(runs).toHaveLength(1);
    expect(runs[0].fingerprint).toBeUndefined();
    s.stop();
  });
});

describe("reportExistsFor", () => {
  it("is false until the report for that date is written, then true", () => {
    expect(reportExistsFor(repoRoot, "2026-10-26")).toBe(false);
    writeTodaysReport();
    expect(reportExistsFor(repoRoot, "2026-10-26")).toBe(true);
    expect(reportExistsFor(repoRoot, "2026-10-25")).toBe(false);
  });
});

describe("isolation from the room session", () => {
  it("never reads or writes the worktree lock", async () => {
    const spy = vi.spyOn(process, "kill");
    const s = make();
    await s.start();
    // acquireWorktreeLock's liveness probe is process.kill(pid, 0); the schedule must not lock.
    expect(spy.mock.calls.filter((c) => c[1] === 0)).toHaveLength(0);
    spy.mockRestore();
    s.stop();
  });
});
