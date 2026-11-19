// tests/wxdbanalyze/dimension-performance.test.ts
import { describe, expect, it } from "vitest";
import { analyzePerformance } from "../../_wxAI/skills/wxDBAnalyze/scripts/dimensions/performance.js";
import { validateFinding } from "../../_wxAI/skills/wxDBAnalyze/scripts/core/finding.js";
import { UNKNOWN } from "../../_wxAI/skills/wxDBAnalyze/scripts/core/metrics.js";
import type { PgCapabilities } from "../../_wxAI/skills/wxDBAnalyze/scripts/engines/postgres/capabilities.js";
import type { IndexStat, PerformanceSnapshot } from "../../_wxAI/skills/wxDBAnalyze/scripts/engines/postgres/performance.js";
import type { StatsSnapshot, TableStats } from "../../_wxAI/skills/wxDBAnalyze/scripts/engines/postgres/stats.js";

// FOLD-IN (SCOPE-121/T022, controller decision): `definition` used to be a
// single hardcoded string shared by every fixture index regardless of
// `name`, so a test could never distinguish "the rollback recreates the
// index that was actually dropped" from "the rollback recreates whichever
// index happens to share this fixture's one definition string" — both
// produced byte-identical rollback text. `definition` now derives from
// `name` (still overridable via `over.definition` for a test that needs an
// arbitrary definition), so `analyzePerformance`'s duplicate-index rollback
// can actually be asserted against the dropped index's own name and not a
// different survivor's.
const idx = (over: Partial<IndexStat> = {}): IndexStat => {
  const name = over.name ?? "idx_a";
  return {
    table: "projecttasks",
    name,
    bytes: 340_000_000,
    scans: 0,
    isUnique: false,
    isPrimary: false,
    isValid: true,
    columns: ["projectid"],
    definition: `CREATE INDEX ${name} ON public.projecttasks USING btree (projectid)`,
    ...over,
  };
};

function perf(indexes: IndexStat[], over: Partial<PerformanceSnapshot> = {}): PerformanceSnapshot {
  const byTable = new Map<string, IndexStat[]>();
  for (const i of indexes) byTable.set(i.table, [...(byTable.get(i.table) ?? []), i]);
  return { indexes, byTable, statements: null, ...over };
}

const tstat = (over: Partial<TableStats> = {}): TableStats => ({
  name: "projecttasks", everAnalyzed: true,
  seqScan: 5, seqTupRead: 50, idxScan: 500,
  inserts: 12_000, updates: 0, deletes: 0, insertsSinceVacuum: 0,
  liveTuples: 5000, deadTuples: 0, rowEstimate: 5000, pages: 100,
  lastVacuum: null, lastAutovacuum: null,
  lastAnalyze: "2026-07-30T00:00:00.000Z", lastAutoanalyze: null,
  tableBytes: 1_000_000, indexBytes: 340_000_000, toastBytes: 0,
  ...over,
});

const stats = (tables: TableStats[]): StatsSnapshot => ({
  tables: new Map(tables.map((t) => [t.name, t])),
  neverAnalyzed: tables.filter((t) => !t.everAnalyzed).map((t) => t.name),
});

const caps = (settings: Record<string, string> = {}): PgCapabilities => ({
  extensions: {
    pg_stat_statements: "preloaded-not-created",
    pgstattuple: "available-not-installed",
    pg_buffercache: "available-not-installed",
    pgaudit: "available-not-installed",
  },
  settings: { track_counts: "on", ...settings },
  serverVersionNum: 150017,
});

describe("analyzePerformance", () => {
  it("every finding it produces satisfies the contract", () => {
    const findings = analyzePerformance(
      perf([
        idx(),
        idx({ name: "idx_dup1", columns: ["a"] }),
        idx({ name: "idx_dup2", columns: ["a"] }),
        idx({ name: "idx_broken", isValid: false }),
      ], { statementsUnavailable: "pg_stat_statements is loaded ... CREATE EXTENSION ..." }),
      stats([tstat({ seqScan: 9000, idxScan: 10 })]),
    );
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) expect(validateFinding(f)).toEqual([]);
  });

  it("pins the full rule set", () => {
    const findings = analyzePerformance(
      perf([
        idx(),
        idx({ name: "idx_dup1", columns: ["a"] }),
        idx({ name: "idx_dup2", columns: ["a"] }),
        idx({ name: "idx_broken", isValid: false }),
      ], { statementsUnavailable: "loaded but not created — run CREATE EXTENSION" }),
      stats([tstat({ seqScan: 9000, idxScan: 10 })]),
    );
    expect(new Set(findings.map((f) => f.rule))).toEqual(
      new Set(["unused-index", "duplicate-index", "invalid-index", "seq-scan-heavy", "no-statement-stats"]),
    );
  });

  it("reports an unused index with its size and the write cost it imposes", () => {
    const f = analyzePerformance(
      perf([idx({ scans: 0, bytes: 340_000_000 })]),
      stats([tstat({ inserts: 12_000 })]),
    ).find((x) => x.rule === "unused-index")!;
    expect(f.observation).toContain("340000000");
    expect(f.observation).toContain("12000");
    expect(f.remediation.statements.join(" ")).toContain("drop index concurrently");
    expect(f.remediation.fixClass).toBe("manual-only");
  });

  it("never reports a primary key or unique index as unused", () => {
    // These enforce a constraint; scan count is irrelevant to whether they are needed.
    const findings = analyzePerformance(
      perf([
        idx({ name: "pk", isPrimary: true, scans: 0 }),
        idx({ name: "uq", isUnique: true, scans: 0 }),
      ]),
      stats([tstat()]),
    );
    expect(findings.filter((f) => f.rule === "unused-index")).toEqual([]);
  });

  it("reports duplicate indexes once per group, naming both", () => {
    const findings = analyzePerformance(
      perf([idx({ name: "idx_dup1", columns: ["a"] }), idx({ name: "idx_dup2", columns: ["a"] })]),
      stats([tstat()]),
    ).filter((f) => f.rule === "duplicate-index");
    expect(findings).toHaveLength(1);
    expect(findings[0]!.observation).toContain("idx_dup1");
    expect(findings[0]!.observation).toContain("idx_dup2");
  });

  it("reports an invalid index as critical, since it is not enforcing anything", () => {
    const f = analyzePerformance(
      perf([idx({ name: "idx_broken", isValid: false })]),
      stats([tstat()]),
    ).find((x) => x.rule === "invalid-index")!;
    expect(f.severity).toBe("high");
    expect(f.whyItNeedsChanging).toMatch(/not used by the planner|invalid/i);
  });

  it("reports a sequential-scan-heavy table", () => {
    const f = analyzePerformance(
      perf([]),
      stats([tstat({ seqScan: 9000, idxScan: 10, liveTuples: 50_000 })]),
    ).find((x) => x.rule === "seq-scan-heavy")!;
    expect(f.observation).toContain("9000");
  });

  it("does not call a small table seq-scan-heavy", () => {
    // A sequential scan of a tiny table is the correct plan, not a defect.
    const findings = analyzePerformance(
      perf([]),
      stats([tstat({ seqScan: 9000, idxScan: 0, liveTuples: 12 })]),
    );
    expect(findings.filter((f) => f.rule === "seq-scan-heavy")).toEqual([]);
  });

  it("does not call a never-analyzed table seq-scan-heavy", () => {
    // Without statistics the row count is unknown, so the ratio is unjudgeable.
    // Saying nothing here is correct; the maintenance dimension reports the
    // missing statistics as its own finding.
    const findings = analyzePerformance(
      perf([]),
      stats([tstat({ everAnalyzed: false, liveTuples: UNKNOWN, seqScan: 9000, idxScan: 0 })]),
    );
    expect(findings.filter((f) => f.rule === "seq-scan-heavy")).toEqual([]);
  });

  it("reports missing statement statistics with the actionable reason", () => {
    const f = analyzePerformance(
      perf([], { statementsUnavailable: "loaded but not created — run CREATE EXTENSION pg_stat_statements" }),
      stats([tstat()]),
    ).find((x) => x.rule === "no-statement-stats")!;
    expect(f.observation).toMatch(/CREATE EXTENSION/i);
    expect(f.whyItNeedsChanging).toMatch(/cannot rank|no visibility|blind/i);
  });

  it("says nothing when statement statistics are present and indexes are healthy", () => {
    expect(
      analyzePerformance(
        perf([idx({ scans: 5000 })], { statements: [], statementsUnavailable: undefined }),
        stats([tstat()]),
      ),
    ).toEqual([]);
  });

  // [SCOPE 121 / T019] BEGIN — UNKNOWN scans must never read as unused
  it("never reports an index with UNKNOWN scans as unused-index (partitioned parent index case)", () => {
    // A partitioned table's PARENT index has no row in pg_stat_user_indexes at
    // all — only its leaf partitions do — so its scan count is UNKNOWN, not 0.
    // Firing unused-index here would recommend DROP INDEX on an index that is,
    // for all this view can see, actively used through its leaves.
    const findings = analyzePerformance(
      perf([idx({ name: "idx_parent", scans: UNKNOWN })]),
      stats([tstat()]),
    );
    expect(findings.filter((f) => f.rule === "unused-index")).toEqual([]);
  });
  // [SCOPE 121 / T019] END

  // [SCOPE 121 / T019] BEGIN — review round 1, Finding 1: keeper selection must never prefer an invalid index
  it("prefers a valid primary key over a valid plain index as the duplicate-group survivor", () => {
    const findings = analyzePerformance(
      perf([
        idx({ name: "idx_w_pk", isPrimary: true }),
        idx({ name: "idx_w_plain" }),
      ]),
      stats([tstat()]),
    ).filter((f) => f.rule === "duplicate-index");
    expect(findings).toHaveLength(1);
    // The plain index is redundant and should be the one dropped; the PK survives.
    expect(findings[0]!.remediation.statements.join(" ")).toContain("idx_w_plain");
    expect(findings[0]!.remediation.statements.join(" ")).not.toContain("idx_w_pk");
    // FOLD-IN (SCOPE-121/T022): the rollback must recreate the index that was
    // actually dropped (idx_w_plain), not the surviving keeper (idx_w_pk).
    // With `idx()`'s definition now derived per-name, these two definitions
    // are distinguishable, so this is provable rather than trivially true.
    expect(findings[0]!.remediation.rollback).toContain("idx_w_plain");
    expect(findings[0]!.remediation.rollback).not.toContain("idx_w_pk");
  });

  it("prefers a VALID plain index over an INVALID primary key as the duplicate-group survivor", () => {
    const findings = analyzePerformance(
      perf([
        idx({ name: "idx_w_pk", isPrimary: true, isValid: false }),
        idx({ name: "idx_w_plain", isValid: true }),
      ]),
      stats([tstat()]),
    ).filter((f) => f.rule === "duplicate-index");
    expect(findings).toHaveLength(1);
    // The invalid PK is not a safe survivor even though it is the primary key;
    // the working plain index must be kept and the broken PK dropped instead.
    expect(findings[0]!.remediation.statements.join(" ")).toContain("idx_w_pk");
    expect(findings[0]!.remediation.statements.join(" ")).not.toContain("idx_w_plain");
    // FOLD-IN (SCOPE-121/T022): the rollback must recreate the index that was
    // actually dropped (idx_w_pk), not the surviving keeper (idx_w_plain).
    expect(findings[0]!.remediation.rollback).toContain("idx_w_pk");
    expect(findings[0]!.remediation.rollback).not.toContain("idx_w_plain");
  });

  it("names an all-invalid duplicate group as its own problem rather than silently picking a survivor", () => {
    const findings = analyzePerformance(
      perf([
        idx({ name: "idx_broken1", isValid: false }),
        idx({ name: "idx_broken2", isValid: false }),
      ]),
      stats([tstat()]),
    ).filter((f) => f.rule === "duplicate-index");
    expect(findings).toHaveLength(1);
    expect(findings[0]!.observation).toMatch(/invalid/i);
    expect(findings[0]!.whyItNeedsChanging).toMatch(/invalid|no working index/i);
    // No drop is recommended when every copy is broken — dropping all of them
    // would leave the table with no index on these columns at all.
    expect(findings[0]!.remediation.statements).toEqual([]);
  });
  // [SCOPE 121 / T019] END

  // [SCOPE 121 / T019] BEGIN — review round 1, Finding 2: invalid indexes must not double-report as unused
  it("reports an invalid index with zero scans as invalid-index only, not also unused-index", () => {
    const findings = analyzePerformance(
      perf([idx({ name: "idx_broken", isValid: false, scans: 0 })]),
      stats([tstat()]),
    );
    const rules = findings.map((f) => f.rule);
    expect(rules).toContain("invalid-index");
    expect(rules).not.toContain("unused-index");
  });
  // [SCOPE 121 / T019] END

  // STEP 0 (b) — final fix wave, C2 [CRITICAL]: INDEX_STATS_SQL renders every
  // expression column as the literal placeholder "(expression)", and grouping
  // on `columns.join(",")` collapses ALL expression indexes on a table into
  // one duplicate group regardless of what they actually index — lower(email)
  // and upper(name) are functionally unrelated but currently look identical.
  it("never groups two expression indexes with different definitions as duplicates", () => {
    const findings = analyzePerformance(
      perf([
        idx({
          name: "idx_lower_email",
          columns: ["(expression)"],
          definition: "CREATE INDEX idx_lower_email ON public.projecttasks USING btree (lower(email))",
        }),
        idx({
          name: "idx_upper_name",
          columns: ["(expression)"],
          definition: "CREATE INDEX idx_upper_name ON public.projecttasks USING btree (upper(name))",
        }),
      ]),
      stats([tstat()]),
    );
    expect(findings.filter((f) => f.rule === "duplicate-index")).toEqual([]);
    // The exclusion must be visible, not silent.
    expect(findings.some((f) => f.rule === "duplicate-check-skipped")).toBe(true);
  });

  // STEP 0 (b) — final fix wave, C2 [CRITICAL]: the same grouping key also
  // ignores a partial index's WHERE predicate, so a full index and a partial
  // index on identical columns look like duplicates even though they cover
  // different rows.
  it("never groups a partial index (has a WHERE predicate) with a full index on the same columns, and records the exclusion instead", () => {
    const findings = analyzePerformance(
      perf([
        idx({
          name: "idx_full",
          columns: ["status"],
          definition: "CREATE INDEX idx_full ON public.projecttasks USING btree (status)",
        }),
        idx({
          name: "idx_partial",
          columns: ["status"],
          definition: "CREATE INDEX idx_partial ON public.projecttasks USING btree (status) WHERE (status = 'active'::text)",
        }),
      ]),
      stats([tstat()]),
    );
    expect(findings.filter((f) => f.rule === "duplicate-index")).toEqual([]);
    expect(findings.some((f) => f.rule === "duplicate-check-skipped")).toBe(true);
  });

  // STEP 0 (c) — final fix wave, I1 [Important]: `collectPerformance` gathers
  // `statements` from pg_stat_statements, but `analyzePerformance` never reads
  // them — the collected data is thrown away and no finding is ever produced
  // from it, even when the extension is fully installed and populated.
  it("reports the top statement by cumulative execution time as a slow-statement finding", () => {
    const findings = analyzePerformance(
      perf([], {
        statements: [
          {
            query: "select * from projecttasks where status = $1",
            calls: 500_000,
            totalExecMs: 9_000_000,
            meanExecMs: 18,
            rows: 500_000,
          },
        ],
        statementsUnavailable: undefined,
      }),
      stats([tstat()]),
    );
    const f = findings.find((x) => x.rule === "slow-statement");
    expect(f).toBeDefined();
    expect(f!.observation).toContain("500000");
    expect(f!.observation).toMatch(/9000000|9,000,000/);
  });

  it("caps slow-statement findings and rolls the rest into one count", () => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      query: `select ${i}`,
      calls: 10,
      totalExecMs: 1000 - i,
      meanExecMs: 100,
      rows: 1,
    }));
    const findings = analyzePerformance(
      perf([], { statements: many, statementsUnavailable: undefined }),
      stats([tstat()]),
    );
    expect(findings.filter((f) => f.rule === "slow-statement")).toHaveLength(5);
    const more = findings.find((f) => f.rule === "slow-statement-more");
    expect(more).toBeDefined();
    expect(more!.observation).toContain("3");
  });

  it("says nothing statement-related when statements is an empty array", () => {
    const findings = analyzePerformance(
      perf([], { statements: [], statementsUnavailable: undefined }),
      stats([tstat()]),
    );
    expect(findings.filter((f) => f.rule.startsWith("slow-statement"))).toEqual([]);
  });

  // ADDITION (SCOPE-121 final fix wave, C3 — CRITICAL): with track_counts
  // off, idx_scan/seq_scan freeze at a genuine-looking 0 — unused-index and
  // seq-scan-heavy must be suppressed entirely, replaced by one
  // counters-disabled finding.
  it("suppresses unused-index and seq-scan-heavy and emits ONE counters-disabled finding when track_counts is off", () => {
    const findings = analyzePerformance(
      perf([idx({ scans: 0 })]),
      stats([tstat({ seqScan: 9000, idxScan: 10, liveTuples: 50_000 })]),
      caps({ track_counts: "off" }),
    );
    expect(findings.filter((f) => f.rule === "unused-index")).toEqual([]);
    expect(findings.filter((f) => f.rule === "seq-scan-heavy")).toEqual([]);
    expect(findings.filter((f) => f.rule === "counters-disabled")).toHaveLength(1);
  });

  it("does not suppress unused-index/seq-scan-heavy when track_counts is on", () => {
    const findings = analyzePerformance(
      perf([idx({ scans: 0 })]),
      stats([tstat({ seqScan: 9000, idxScan: 10, liveTuples: 50_000 })]),
      caps({ track_counts: "on" }),
    );
    expect(findings.some((f) => f.rule === "unused-index")).toBe(true);
    expect(findings.some((f) => f.rule === "seq-scan-heavy")).toBe(true);
    expect(findings.filter((f) => f.rule === "counters-disabled")).toEqual([]);
  });

  it("does not run the track_counts check when capabilities is not provided (backward compatible)", () => {
    const findings = analyzePerformance(
      perf([idx({ scans: 0 })]),
      stats([tstat()]),
    );
    expect(findings.some((f) => f.rule === "counters-disabled")).toBe(false);
    expect(findings.some((f) => f.rule === "unused-index")).toBe(true);
  });

  // ADDITION (SCOPE-121 final fix wave, I5a — Important): an index on a
  // table with a KNOWN, measured zero row count has zero scans by
  // construction, not by measurement — it must not be reported as
  // unused-index with a DROP recommendation.
  it("does not report unused-index on a table with a known-zero row count", () => {
    const findings = analyzePerformance(
      perf([idx({ scans: 0 })]),
      stats([tstat({ liveTuples: 0 })]),
    );
    expect(findings.filter((f) => f.rule === "unused-index")).toEqual([]);
  });

  it("still reports unused-index on a table with a known-nonzero row count", () => {
    const findings = analyzePerformance(
      perf([idx({ scans: 0 })]),
      stats([tstat({ liveTuples: 5000 })]),
    );
    expect(findings.some((f) => f.rule === "unused-index")).toBe(true);
  });

  // A live run against production showed the liveTuples-only check barely
  // helps, because most empty tables have never been ANALYZEd (liveTuples
  // stays UNKNOWN). `knownEmptyTables` — sourced from the data dimension's
  // exact count(*), the same source `data.empty-table` findings come from —
  // catches a never-analyzed empty table too.
  it("does not report unused-index on a table in knownEmptyTables, even when liveTuples is UNKNOWN (never analyzed)", () => {
    const findings = analyzePerformance(
      perf([idx({ scans: 0 })]),
      stats([tstat({ everAnalyzed: false, liveTuples: UNKNOWN })]),
      undefined,
      new Set(["projecttasks"]),
    );
    expect(findings.filter((f) => f.rule === "unused-index")).toEqual([]);
  });

  it("still reports unused-index on a never-analyzed table not in knownEmptyTables", () => {
    const findings = analyzePerformance(
      perf([idx({ scans: 0 })]),
      stats([tstat({ everAnalyzed: false, liveTuples: UNKNOWN })]),
      undefined,
      new Set(["someothertable"]),
    );
    expect(findings.some((f) => f.rule === "unused-index")).toBe(true);
  });
});
