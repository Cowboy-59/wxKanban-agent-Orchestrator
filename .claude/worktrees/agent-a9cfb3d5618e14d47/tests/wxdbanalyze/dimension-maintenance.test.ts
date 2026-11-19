// [SCOPE 121 / T021] BEGIN — Dimension 6 (maintenance) analysis tests
import { describe, expect, it } from "vitest";
import { analyzeMaintenance } from "../../_wxAI/skills/wxDBAnalyze/scripts/dimensions/maintenance.js";
import { validateFinding } from "../../_wxAI/skills/wxDBAnalyze/scripts/core/finding.js";
import { UNKNOWN } from "../../_wxAI/skills/wxDBAnalyze/scripts/core/metrics.js";
import type { PgCapabilities } from "../../_wxAI/skills/wxDBAnalyze/scripts/engines/postgres/capabilities.js";
import type { MaintenanceSnapshot } from "../../_wxAI/skills/wxDBAnalyze/scripts/engines/postgres/maintenance.js";
import type { StatsSnapshot, TableStats } from "../../_wxAI/skills/wxDBAnalyze/scripts/engines/postgres/stats.js";

const tstat = (over: Partial<TableStats> = {}): TableStats => ({
  name: "projecttasks", everAnalyzed: true,
  seqScan: 0, seqTupRead: 0, idxScan: 0,
  inserts: 0, updates: 0, deletes: 0, insertsSinceVacuum: 0,
  liveTuples: 10_000, deadTuples: 0, rowEstimate: 10_000, pages: 100,
  lastVacuum: null, lastAutovacuum: "2026-07-30T00:00:00.000Z",
  lastAnalyze: "2026-07-30T00:00:00.000Z", lastAutoanalyze: null,
  tableBytes: 1_000_000, indexBytes: 0, toastBytes: 0,
  ...over,
});

const stats = (tables: TableStats[]): StatsSnapshot => ({
  tables: new Map(tables.map((t) => [t.name, t])),
  neverAnalyzed: tables.filter((t) => !t.everAnalyzed).map((t) => t.name),
});

// DEVIATION (controller decision, brief Step 4 preamble): the brief's fixture
// omits `freezeMaxAgeAssumed`, but `MaintenanceSnapshot` now requires it
// (SCOPE-121/T020 review round 1). Added here with a `false` default — no
// test below exercises the assumed-ceiling branch, so `false` keeps every
// given assertion's behaviour unchanged while still satisfying the real type.
const maint = (over: Partial<MaintenanceSnapshot> = {}): MaintenanceSnapshot => ({
  freezeAges: [],
  // ADDITION (SCOPE-121 final fix wave, C1 — CRITICAL): `freezeAgeExcluded`
  // is a new required field recording relations excluded from freeze-age
  // checking (partitioned parents, zero relfrozenxid). Empty by default — no
  // exclusions unless a test overrides it.
  freezeAgeExcluded: [],
  freezeMaxAge: 200_000_000,
  freezeMaxAgeAssumed: false,
  tableOptions: new Map(),
  blockers: [],
  bloatMeasurable: false,
  bloatUnavailable: "pgstattuple is not installed, so bloat cannot be measured; it is not reported rather than reported as zero.",
  ...over,
});

// ADDITION (SCOPE-121 final fix wave, C3 — CRITICAL): minimal PgCapabilities
// builder for the track_counts/autovacuum threading tests below.
const caps = (settings: Record<string, string> = {}): PgCapabilities => ({
  extensions: {
    pg_stat_statements: "preloaded-not-created",
    pgstattuple: "available-not-installed",
    pg_buffercache: "available-not-installed",
    pgaudit: "available-not-installed",
  },
  settings: { autovacuum: "on", track_counts: "on", ...settings },
  serverVersionNum: 150017,
});

describe("analyzeMaintenance", () => {
  it("every finding it produces satisfies the contract", () => {
    const findings = analyzeMaintenance(
      maint({
        freezeAges: [{ table: "old", age: 190_000_000, headroomFraction: 0.05 }],
        tableOptions: new Map([["frozen", ["autovacuum_enabled=false"]]]),
        blockers: [{ kind: "long-transaction", detail: "pid 42 idle in transaction", ageSeconds: 9000 }],
        blockersUnavailable: undefined,
      }),
      stats([
        tstat({ name: "a", everAnalyzed: false, liveTuples: UNKNOWN, deadTuples: UNKNOWN }),
        tstat({ name: "b", everAnalyzed: false, liveTuples: UNKNOWN, deadTuples: UNKNOWN }),
        tstat({ name: "dirty", liveTuples: 1000, deadTuples: 900 }),
      ]),
    );
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) expect(validateFinding(f)).toEqual([]);
  });

  it("rolls every never-analyzed table into ONE finding stating the count", () => {
    const findings = analyzeMaintenance(
      maint(),
      stats(
        Array.from({ length: 218 }, (_, i) =>
          tstat({ name: `t${i}`, everAnalyzed: false, liveTuples: UNKNOWN, deadTuples: UNKNOWN }),
        ),
      ),
    );
    const rolled = findings.filter((f) => f.rule === "never-analyzed");
    expect(rolled).toHaveLength(1);
    expect(rolled[0]!.observation).toContain("218");
    expect(rolled[0]!.severity).toBe("high");
  });

  it("explains that missing statistics degrade the planner AND this tool", () => {
    const f = analyzeMaintenance(
      maint(),
      stats([tstat({ everAnalyzed: false, liveTuples: UNKNOWN, deadTuples: UNKNOWN })]),
    ).find((x) => x.rule === "never-analyzed")!;
    expect(f.whyItNeedsChanging).toMatch(/planner/i);
    expect(f.remediation.statements.join(" ")).toMatch(/analyze/i);
  });

  it("reports a high dead-tuple ratio", () => {
    const f = analyzeMaintenance(
      maint(),
      stats([tstat({ name: "dirty", liveTuples: 1000, deadTuples: 900 })]),
    ).find((x) => x.rule === "dead-tuple-ratio")!;
    expect(f.observation).toContain("900");
    expect(f.remediation.statements.join(" ")).toMatch(/vacuum/i);
  });

  it("never computes a dead-tuple ratio for a never-analyzed table", () => {
    // Its counters are UNKNOWN; a ratio built from them would be fabricated.
    const findings = analyzeMaintenance(
      maint(),
      stats([tstat({ everAnalyzed: false, liveTuples: UNKNOWN, deadTuples: UNKNOWN })]),
    );
    expect(findings.filter((f) => f.rule === "dead-tuple-ratio")).toEqual([]);
  });

  it("reports a table with autovacuum switched off", () => {
    const f = analyzeMaintenance(
      maint({ tableOptions: new Map([["frozen", ["autovacuum_enabled=false"]]]) }),
      stats([tstat()]),
    ).find((x) => x.rule === "autovacuum-disabled")!;
    expect(f.subject).toBe("frozen");
    expect(f.severity).toBe("high");
  });

  // STEP 0 (d) — final fix wave, I2 [Important]: PostgreSQL preserves
  // whatever boolean spelling the operator wrote for a reloption. The exact
  // string match on "autovacuum_enabled=false" misses "off" (and 0/f/no/n)
  // entirely, so a table using this spelling reads as healthy.
  it("recognizes the 'off' spelling of autovacuum_enabled, not only 'false'", () => {
    const f = analyzeMaintenance(
      maint({ tableOptions: new Map([["frozen", ["autovacuum_enabled=off"]]]) }),
      stats([tstat()]),
    ).find((x) => x.rule === "autovacuum-disabled");
    expect(f).toBeDefined();
    expect(f!.subject).toBe("frozen");
  });

  it("recognizes every documented falsy spelling of autovacuum_enabled, case-insensitively", () => {
    for (const spelling of ["FALSE", "Off", "0", "f", "NO", "n"]) {
      const f = analyzeMaintenance(
        maint({ tableOptions: new Map([["t", [`autovacuum_enabled=${spelling}`]]]) }),
        stats([tstat()]),
      ).find((x) => x.rule === "autovacuum-disabled");
      expect(f, `spelling ${spelling} should be recognized`).toBeDefined();
    }
  });

  it("reports freeze-age pressure only above the threshold", () => {
    const near = analyzeMaintenance(
      maint({ freezeAges: [{ table: "old", age: 190_000_000, headroomFraction: 0.05 }] }),
      stats([tstat()]),
    );
    expect(near.some((f) => f.rule === "freeze-age")).toBe(true);

    const fine = analyzeMaintenance(
      maint({ freezeAges: [{ table: "young", age: 1000, headroomFraction: 0.999995 }] }),
      stats([tstat()]),
    );
    expect(fine.some((f) => f.rule === "freeze-age")).toBe(false);
  });

  it("reports a vacuum blocker", () => {
    const f = analyzeMaintenance(
      maint({ blockers: [{ kind: "long-transaction", detail: "pid 42 idle in transaction", ageSeconds: 9000 }] }),
      stats([tstat()]),
    ).find((x) => x.rule === "vacuum-blocked")!;
    expect(f.observation).toContain("pid 42");
  });

  it("surfaces that bloat could not be measured, rather than implying none", () => {
    const f = analyzeMaintenance(maint(), stats([tstat()])).find((x) => x.rule === "bloat-unmeasurable")!;
    expect(f.observation).toMatch(/pgstattuple/i);
    expect(f.whyItNeedsChanging).toMatch(/not.*measur|unknown/i);
    expect(f.severity).toBe("info");
  });

  it("surfaces an unreadable blocker query as its own finding", () => {
    const f = analyzeMaintenance(
      maint({ blockersUnavailable: "permission denied for pg_stat_activity" }),
      stats([tstat()]),
    ).find((x) => x.rule === "blockers-unknown")!;
    expect(f.observation).toMatch(/permission denied/);
  });

  it("says nothing about a well-maintained, analyzed, unblocked database", () => {
    const findings = analyzeMaintenance(
      maint({ bloatMeasurable: true, bloatUnavailable: undefined }),
      stats([tstat({ liveTuples: 10_000, deadTuples: 5 })]),
    );
    expect(findings).toEqual([]);
  });

  // FIX (review round 1, Finding 1 — Important): the assumed-versus-proven
  // freeze-ceiling distinction had zero automated coverage. An assumed
  // ceiling may be HIGHER than the real one, so urgency computed against it
  // can understate a wraparound risk — this asserts the distinction itself,
  // not merely that a finding exists.
  it("marks a confirmed freeze ceiling as proven, with no assumed-ceiling clause", () => {
    const f = analyzeMaintenance(
      maint({
        freezeAges: [{ table: "old", age: 190_000_000, headroomFraction: 0.05 }],
        freezeMaxAgeAssumed: false,
      }),
      stats([tstat()]),
    ).find((x) => x.rule === "freeze-age")!;
    expect(f.confidence).toBe("proven");
    expect(f.observation).not.toMatch(/assum/i);
  });

  // STEP 0 (a) — final fix wave, C1 [CRITICAL]: a partitioned PARENT's
  // relfrozenxid is InvalidTransactionId (0), and age(0) returns INT_MAX
  // (2147483647), not a normal freeze age. Even after the engine-layer fix
  // excludes such relations from `freezeAges` (see pg-maintenance-collect.test.ts),
  // this dimension must never RENDER a headroom percentage below -100% for any
  // pathological input that does reach it — belt and braces against the exact
  // "-973.7%" figure the review reproduced.
  it("clamps the displayed headroom percentage so it never reads below -100%, even for a pathological freeze age (INT_MAX)", () => {
    const freezeMaxAge = 200_000_000;
    const age = 2_147_483_647; // INT_MAX — what age() returns for relfrozenxid = 0
    const headroomFraction = (freezeMaxAge - age) / freezeMaxAge; // ~ -9.737...
    const f = analyzeMaintenance(
      maint({ freezeAges: [{ table: "orders_parent", age, headroomFraction }] }),
      stats([tstat()]),
    ).find((x) => x.rule === "freeze-age")!;
    expect(f.severity).toBe("critical");
    const match = f.observation.match(/(-?\d+(?:\.\d+)?)% of that budget remains/);
    expect(match).not.toBeNull();
    const pct = Number(match![1]);
    expect(pct).toBeGreaterThanOrEqual(-100);
  });

  it("marks an assumed freeze ceiling as inferred, and states the ceiling was assumed", () => {
    const f = analyzeMaintenance(
      maint({
        freezeAges: [{ table: "old", age: 190_000_000, headroomFraction: 0.05 }],
        freezeMaxAgeAssumed: true,
      }),
      stats([tstat()]),
    ).find((x) => x.rule === "freeze-age")!;
    expect(f.confidence).toBe("inferred");
    expect(f.observation).toMatch(/assum/i);
  });

  // ADDITION (SCOPE-121 final fix wave, C1 — CRITICAL): the freeze-age
  // exclusion (partitioned parents, zero relfrozenxid) must be visible, not
  // silently absent.
  it("reports excluded freeze-age relations as a single roll-up finding, naming the count and cause", () => {
    const f = analyzeMaintenance(
      maint({ freezeAgeExcluded: [{ table: "orders_parent", reason: "partitioned PARENT table — ..." }] }),
      stats([tstat()]),
    ).find((x) => x.rule === "freeze-age-excluded")!;
    expect(f).toBeDefined();
    expect(f.observation).toContain("orders_parent");
    expect(f.severity).toBe("info");
  });

  it("says nothing about freeze-age exclusions when there are none", () => {
    const findings = analyzeMaintenance(maint({ freezeAgeExcluded: [] }), stats([tstat()]));
    expect(findings.filter((f) => f.rule === "freeze-age-excluded")).toEqual([]);
  });

  // ADDITION (SCOPE-121 final fix wave, C3 — CRITICAL): with track_counts
  // off, pg_stat_user_tables' counters freeze at a genuine-looking 0 —
  // dead-tuple-ratio must be suppressed entirely, replaced by one
  // counters-disabled finding, rather than reading every table as 0% dead.
  it("suppresses dead-tuple-ratio and emits ONE counters-disabled finding when track_counts is off", () => {
    const findings = analyzeMaintenance(
      maint(),
      stats([tstat({ name: "dirty", liveTuples: 1000, deadTuples: 900 })]),
      caps({ track_counts: "off" }),
    );
    expect(findings.filter((f) => f.rule === "dead-tuple-ratio")).toEqual([]);
    expect(findings.filter((f) => f.rule === "counters-disabled")).toHaveLength(1);
  });

  it("does not suppress dead-tuple-ratio when track_counts is on", () => {
    const findings = analyzeMaintenance(
      maint(),
      stats([tstat({ name: "dirty", liveTuples: 1000, deadTuples: 900 })]),
      caps({ track_counts: "on" }),
    );
    expect(findings.some((f) => f.rule === "dead-tuple-ratio")).toBe(true);
    expect(findings.filter((f) => f.rule === "counters-disabled")).toEqual([]);
  });

  // Design §4.6 explicitly asks for per-table overrides "versus global
  // settings" — a global autovacuum=off is strictly worse than any per-table
  // override and must not stay invisible next to it.
  it("emits a critical finding when autovacuum is off globally", () => {
    const f = analyzeMaintenance(
      maint(),
      stats([tstat()]),
      caps({ autovacuum: "off" }),
    ).find((x) => x.rule === "autovacuum-disabled-globally")!;
    expect(f).toBeDefined();
    expect(f.severity).toBe("critical");
  });

  it("does not run the track_counts/autovacuum checks when capabilities is not provided (backward compatible)", () => {
    const findings = analyzeMaintenance(
      maint(),
      stats([tstat({ name: "dirty", liveTuples: 1000, deadTuples: 900 })]),
    );
    expect(findings.some((f) => f.rule === "counters-disabled")).toBe(false);
    expect(findings.some((f) => f.rule === "autovacuum-disabled-globally")).toBe(false);
    expect(findings.some((f) => f.rule === "dead-tuple-ratio")).toBe(true);
  });

  // FIX (review round 1, Finding 2 — Minor): pin the complete rule set so a
  // rule cannot be silently added, removed, or renamed without breaking this
  // suite — the standard already applied to every other dimension in this
  // build.
  it("produces exactly the seven documented rules and nothing else", () => {
    const findings = analyzeMaintenance(
      maint({
        freezeAges: [{ table: "old", age: 190_000_000, headroomFraction: 0.05 }],
        tableOptions: new Map([["frozen", ["autovacuum_enabled=false"]]]),
        blockers: [{ kind: "long-transaction", detail: "pid 42 idle in transaction", ageSeconds: 9000 }],
        blockersUnavailable: "permission denied for pg_stat_activity",
        bloatMeasurable: false,
      }),
      stats([
        tstat({ name: "neveranalyzed", everAnalyzed: false, liveTuples: UNKNOWN, deadTuples: UNKNOWN }),
        tstat({ name: "dirty", liveTuples: 1000, deadTuples: 900 }),
      ]),
    );

    expect(new Set(findings.map((f) => f.rule))).toEqual(
      new Set([
        "never-analyzed",
        "dead-tuple-ratio",
        "autovacuum-disabled",
        "freeze-age",
        "vacuum-blocked",
        "bloat-unmeasurable",
        "blockers-unknown",
      ]),
    );
    for (const f of findings) expect(validateFinding(f)).toEqual([]);
  });
});
// [SCOPE 121 / T021] END
