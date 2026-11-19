// SPEC-005 / T007 — daily agent-run pull into Resource lines. The db client is mocked; nothing
// here opens a connection (the local .env points at production).
import { describe, it, expect, vi, beforeEach } from "vitest";

const executeQueue: Array<{ rows: unknown[] }> = [];
const executed: string[] = [];
const selectQueue: unknown[][] = [];
let available = true;

vi.mock("../../src/db/client.js", () => {
  const thenable = (rows: () => unknown[]): Record<string, unknown> => {
    const c: Record<string, unknown> = {};
    for (const m of ["from", "where", "limit"]) c[m] = () => c;
    c.then = (resolve: (v: unknown[]) => void) => resolve(rows());
    return c;
  };
  return {
    db: {
      select: () => thenable(() => selectQueue.shift() ?? []),
      execute: (q: { queryChunks?: unknown[] }) => {
        executed.push(JSON.stringify(q.queryChunks ?? ""));
        return Promise.resolve(executeQueue.shift() ?? { rows: [] });
      },
    },
  };
});

vi.mock("../../src/server/services/AgentRunSource.js", () => ({
  isAgentRunsAvailable: () => Promise.resolve(available),
}));

// [SCOPE 143 / T027] the projects the caller's company may bill: own + engaged (FR-014)
let billableList: Array<{ id: string; hourlyrate: string | null; resourcerate: string | null; engaged: boolean }> = [];
vi.mock("../../src/server/services/TimeBillingProjectAccess.js", () => ({
  TimeBillingProjectAccess: { list: () => Promise.resolve(billableList) },
}));

import { AgentRunPullService, aggregateRuns, lineForRun, type DayRun } from "../../src/server/services/AgentRunPullService.js";

// [SCOPE 005 / T007] BEGIN — unit tests for the agent-run pull
const run = (over: Partial<DayRun>): DayRun => ({
  projectid: "p1",
  specid: null,
  command: "implement",
  kind: "subagent",
  aispecsessionid: "sess1",
  model: "claude-sonnet-5-5",
  activeseconds: 60,
  ...over,
});

beforeEach(() => {
  executeQueue.length = 0;
  executed.length = 0;
  selectQueue.length = 0;
  available = true;
  billableList = [];
});

describe("lineForRun (FR-007)", () => {
  it("a run tied to a scope's task goes to that scope; brainstorms to Brainstorming; the rest to Processes", () => {
    expect(lineForRun({ specid: "s1", command: "wxBrainstorm" })).toBe("scope");
    expect(lineForRun({ specid: null, command: "wxBrainstorm" })).toBe("brainstorm");
    expect(lineForRun({ specid: null, command: "wxCreateTestPlan" })).toBe("process");
    expect(lineForRun({ specid: null, command: null })).toBe("process");
  });
});

describe("aggregateRuns (FR-007, FR-009)", () => {
  it("40 runs totalling 1 h 32 m on one line in one day produce 1.75 hrs, not 40 × 0.25", () => {
    const runs = Array.from({ length: 40 }, () => run({ specid: "s1", activeseconds: 138 }));
    const [b] = aggregateRuns(runs);
    expect(b?.activeseconds).toBe(5520);
    expect(b?.minutes).toBe(105);
  });

  it("splits by line, scope and model", () => {
    const out = aggregateRuns([
      run({ specid: "s1", model: "claude-sonnet-5-5" }),
      run({ specid: "s1", model: "claude-haiku-5-5" }),
      run({ specid: "s2" }),
      run({ command: "wxBrainstorm" }),
      run({ command: "wxDBAnalyze" }),
    ]);
    expect(out).toHaveLength(5);
    expect(out.map((b) => b.line).sort()).toEqual(["brainstorm", "process", "scope", "scope", "scope"]);
  });

  it("five subagents on the same model are 5 Resources; the main session counts once", () => {
    const subagents = Array.from({ length: 5 }, () => run({ specid: "s1", kind: "subagent" }));
    const main = [
      run({ specid: "s1", kind: "session", aispecsessionid: "sess1" }),
      run({ specid: "s1", kind: "command", aispecsessionid: "sess1" }),
    ];
    expect(aggregateRuns(subagents)[0]?.resourcecount).toBe(5);
    expect(aggregateRuns([...subagents, ...main])[0]?.resourcecount).toBe(6);
  });

  it("drops buckets with no active time and never reads waiting time", () => {
    expect(aggregateRuns([run({ activeseconds: 0 }), run({ activeseconds: null })])).toEqual([]);
  });
});

describe("AgentRunPullService.pullDay (FR-007)", () => {
  it("until agentruns exists in production, runs manual-only and queries nothing", async () => {
    available = false;
    const r = await AgentRunPullService.pullDay("c1", "admin1", "2026-11-02");
    expect(r).toEqual({ available: false, workdate: "2026-11-02", upserted: 0, lockedSkipped: 0 });
    expect(executed).toHaveLength(0);
  });

  it("upserts one entry per bucket and counts an invoiced bucket as skipped, never changed", async () => {
    executeQueue.push({
      rows: [
        { projectid: "p1", specid: "s1", command: "implement", kind: "subagent", aispecsessionid: "x", model: "m1", activeseconds: 600 },
        { projectid: "p1", specid: null, command: "wxBrainstorm", kind: "session", aispecsessionid: "x", model: "m1", activeseconds: 300 },
      ],
    });
    selectQueue.push([{ hourlyrate: null, resourcerate: "50.00" }]);
    billableList = [{ id: "p1", hourlyrate: null, resourcerate: null, engaged: false }];
    executeQueue.push({ rows: [{ id: "e1" }] }, { rows: [] }); // second bucket hits a locked entry
    const r = await AgentRunPullService.pullDay("c1", "admin1", "2026-11-02");
    expect(r).toEqual({ available: true, workdate: "2026-11-02", upserted: 1, lockedSkipped: 1 });
    // 1 read + 2 upserts; every upsert is ON CONFLICT … WHERE invoiceid IS NULL
    expect(executed).toHaveLength(3);
    expect(executed[1]).toContain("ON CONFLICT");
    expect(executed[1]).toContain("invoiceid IS NULL");
    expect(executed[0]).toContain("neverbilled = false");
  });

  // [SCOPE 143 / T027] BEGIN — pull by billing company (FR-014, FR-017)
  it("reads runs by agentruns.companyid, not by the project's owner, so engaged projects are included", async () => {
    executeQueue.push({ rows: [] });
    await AgentRunPullService.pullDay("c1", "admin1", "2026-11-02");
    expect(executed[0]).toContain("r.companyid =");
    expect(executed[0]).not.toContain("companyprojects");
  });

  it("the conflict key includes the company, so a consultant's and a client's pulls never share a row", async () => {
    executeQueue.push({
      rows: [{ projectid: "client-p", specid: null, command: "implement", kind: "session", aispecsessionid: "x", model: "m1", activeseconds: 900 }],
    });
    selectQueue.push([{ hourlyrate: null, resourcerate: "40.00" }]);
    billableList = [{ id: "client-p", hourlyrate: null, resourcerate: "75.00", engaged: true }];
    executeQueue.push({ rows: [{ id: "e1" }] });
    const r = await AgentRunPullService.pullDay("consultant", "admin1", "2026-11-02");
    expect(r.upserted).toBe(1);
    expect(executed[1]).toContain("ON CONFLICT (companyid, projectid, line,");
  });
  // [SCOPE 143 / T027] END

  it("rejects a malformed date", async () => {
    await expect(AgentRunPullService.pullDay("c1", "admin1", "11/02/2026")).rejects.toMatchObject({ statusCode: 400 });
  });
});

// [SCOPE 143 / T027] BEGIN — pullRange: the automatic pull (SPEC-005 Amendment E)
describe("AgentRunPullService.pullRange", () => {
  it("visits only the days that hold runs and sums their results", async () => {
    executeQueue.push({ rows: [{ workdate: "2026-11-02" }, { workdate: "2026-11-04" }] });
    // day 1: one bucket, written
    executeQueue.push({ rows: [{ projectid: "p1", specid: null, command: "x", kind: "session", aispecsessionid: "s", model: "m1", activeseconds: 600 }] });
    selectQueue.push([{ hourlyrate: null, resourcerate: "50.00" }]);
    executeQueue.push({ rows: [{ id: "e1" }] });
    // day 2: one bucket, already on a statement
    executeQueue.push({ rows: [{ projectid: "p1", specid: null, command: "x", kind: "session", aispecsessionid: "s", model: "m1", activeseconds: 600 }] });
    selectQueue.push([{ hourlyrate: null, resourcerate: "50.00" }]);
    executeQueue.push({ rows: [] });
    const r = await AgentRunPullService.pullRange("c1", "admin1", "2026-11-02", "2026-11-08");
    expect(r).toEqual({ available: true, days: 2, upserted: 1, lockedSkipped: 1 });
    expect(executed[0]).toContain("DISTINCT");
    expect(executed[0]).toContain("r.companyid =");
  });

  it("a repeat over a range with no runs writes nothing", async () => {
    executeQueue.push({ rows: [] });
    const r = await AgentRunPullService.pullRange("c1", "admin1", "2026-11-02", "2026-11-08");
    expect(r).toEqual({ available: true, days: 0, upserted: 0, lockedSkipped: 0 });
    expect(executed).toHaveLength(1);
  });

  it("runs manual-only while agentruns is unavailable", async () => {
    available = false;
    const r = await AgentRunPullService.pullRange("c1", "admin1", "2026-11-02", "2026-11-08");
    expect(r.available).toBe(false);
    expect(executed).toHaveLength(0);
  });

  it("rejects malformed dates", async () => {
    await expect(AgentRunPullService.pullRange("c1", "admin1", "2026-11-02", "soon")).rejects.toMatchObject({ statusCode: 400 });
  });
});
// [SCOPE 143 / T027] END
// [SCOPE 005 / T007] END
