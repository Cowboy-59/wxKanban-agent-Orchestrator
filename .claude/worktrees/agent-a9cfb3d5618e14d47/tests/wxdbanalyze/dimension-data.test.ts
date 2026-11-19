// tests/wxdbanalyze/dimension-data.test.ts
import { describe, expect, it } from "vitest";
import { analyzeData } from "../../_wxAI/skills/wxDBAnalyze/scripts/dimensions/data.js";
import { validateFinding } from "../../_wxAI/skills/wxDBAnalyze/scripts/core/finding.js";
import { UNKNOWN } from "../../_wxAI/skills/wxDBAnalyze/scripts/core/metrics.js";
import type { DataSnapshot, TableProfile } from "../../_wxAI/skills/wxDBAnalyze/scripts/engines/postgres/data.js";

const profile = (over: Partial<TableProfile> = {}): TableProfile => ({
  name: "customers",
  rowCount: 100,
  columns: [],
  tableBytes: 8192,
  everAnalyzed: true,
  ...over,
});

const snap = (tables: TableProfile[]): DataSnapshot => ({
  tables: new Map(tables.map((t) => [t.name, t])),
});

const ids = (f: ReturnType<typeof analyzeData>) => f.map((x) => x.id);

// Realistic `skipped` strings, copied verbatim from what
// `probeDataHealth` (engines/postgres/data.ts) actually produces for the two
// skip causes, rather than short hand-written stand-ins. A fixture shorter or
// cleaner than the real producer's output cannot catch a formatting defect in
// the seam between the engine and this dimension's finding template — which is
// exactly how the doubled "not profiled: not profiled: " prefix shipped
// undetected in review round 1.
const CEILING_SKIP =
  "huge holds 3000000000 bytes, above the 2000000000-byte ceiling for a full scan. Re-run with --deep to profile it.";

const STATS_MISSING_SKIP =
  "parenttbl has no entry in the collected table statistics, so its size cannot be established. This is the expected shape for a " +
  "partitioned PARENT table — pg_stat_user_tables reports only its leaf partitions, never the parent itself — but the cause could also " +
  "be a table created after statistics were collected. Its size is treated as unknown rather than assumed small, and it is not scanned " +
  "out of caution.";

describe("analyzeData", () => {
  it("every finding it produces satisfies the contract", () => {
    const findings = analyzeData(
      snap([
        profile({ name: "emptyone", rowCount: 0 }),
        profile({
          name: "customers",
          columns: [
            { name: "legacycol", sqlType: "text", nonNullCount: 0, nullFraction: 1, allNull: true },
            { name: "note", sqlType: "text", nonNullCount: 2, nullFraction: 0.98, allNull: false },
          ],
        }),
        profile({ name: "huge", rowCount: UNKNOWN, skipped: CEILING_SKIP }),
      ]),
    );
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) expect(validateFinding(f)).toEqual([]);
  });

  it("pins the full rule set", () => {
    const findings = analyzeData(
      snap([
        profile({ name: "emptyone", rowCount: 0 }),
        profile({
          columns: [
            { name: "legacycol", sqlType: "text", nonNullCount: 0, nullFraction: 1, allNull: true },
            { name: "note", sqlType: "text", nonNullCount: 2, nullFraction: 0.98, allNull: false },
          ],
        }),
        profile({ name: "huge", rowCount: UNKNOWN, skipped: CEILING_SKIP }),
      ]),
    );
    expect(new Set(findings.map((f) => f.rule))).toEqual(
      new Set(["empty-table", "all-null-column", "high-null-density", "not-profiled"]),
    );
  });

  it("reports an empty table", () => {
    const f = analyzeData(snap([profile({ name: "emptyone", rowCount: 0 })]))[0]!;
    expect(f.id).toBe("data.empty-table.emptyone");
    expect(f.severity).toBe("low");
    expect(f.confidence).toBe("proven");
  });

  it("reports an all-null column as a dead column, with the row count as evidence", () => {
    const f = analyzeData(
      snap([
        profile({
          rowCount: 5000,
          columns: [{ name: "legacycol", sqlType: "text", nonNullCount: 0, nullFraction: 1, allNull: true }],
        }),
      ]),
    ).find((x) => x.rule === "all-null-column")!;
    expect(f.observation).toContain("5000");
    expect(f.whyItNeedsChanging).toMatch(/never been written|no row/i);
    expect(f.remediation.fixClass).toBe("manual-only");
  });

  // ADDITION (SCOPE-121 final fix wave, I5b — Important): multiple all-null
  // columns on the SAME table must roll into ONE finding, not one per
  // column — a real report had up to 12 all-null columns on a single table.
  it("rolls multiple all-null columns on the same table into ONE finding", () => {
    const findings = analyzeData(
      snap([
        profile({
          name: "legacy",
          rowCount: 5000,
          columns: [
            { name: "col_a", sqlType: "text", nonNullCount: 0, nullFraction: 1, allNull: true },
            { name: "col_b", sqlType: "text", nonNullCount: 0, nullFraction: 1, allNull: true },
            { name: "col_c", sqlType: "text", nonNullCount: 0, nullFraction: 1, allNull: true },
          ],
        }),
      ]),
    );
    const allNullFindings = findings.filter((f) => f.rule === "all-null-column");
    expect(allNullFindings).toHaveLength(1);
    expect(allNullFindings[0]!.observation).toContain("col_a");
    expect(allNullFindings[0]!.observation).toContain("col_b");
    expect(allNullFindings[0]!.observation).toContain("col_c");
    expect(allNullFindings[0]!.observation).toContain("3");
    expect(allNullFindings[0]!.id).toBe("data.all-null-column.legacy");
  });

  it("does not report an all-null column in an empty table", () => {
    // Every column of a zero-row table is trivially all-null; saying so would
    // produce one finding per column for every empty table in the schema.
    const findings = analyzeData(
      snap([
        profile({
          name: "emptyone",
          rowCount: 0,
          columns: [{ name: "a", sqlType: "text", nonNullCount: 0, nullFraction: 1, allNull: true }],
        }),
      ]),
    );
    expect(ids(findings)).toEqual(["data.empty-table.emptyone"]);
  });

  it("reports a high-null-density column but not a merely-sparse one", () => {
    const findings = analyzeData(
      snap([
        profile({
          columns: [
            { name: "rare", sqlType: "text", nonNullCount: 2, nullFraction: 0.98, allNull: false },
            { name: "common", sqlType: "text", nonNullCount: 60, nullFraction: 0.4, allNull: false },
          ],
        }),
      ]),
    );
    expect(ids(findings)).toEqual(["data.high-null-density.customers.rare"]);
  });

  it("surfaces an unprofiled table so it cannot read as clean (over-ceiling cause)", () => {
    const f = analyzeData(
      snap([profile({ name: "huge", rowCount: UNKNOWN, skipped: CEILING_SKIP })]),
    )[0]!;
    expect(f.id).toBe("data.not-profiled.huge");
    expect(f.observation).toMatch(/above the .*-byte ceiling/);
    expect(f.whyItNeedsChanging).toMatch(/unverified|not.*examin/i);
    expect(f.severity).toBe("info");
    // The finding template prefixes "was not profiled: "; the engine's raw
    // `skipped` reason must not ALSO carry its own "not profiled" framing, or
    // the two seams stutter together ("was not profiled: not profiled: …").
    expect(f.observation.match(/not profiled/gi)?.length ?? 0).toBeLessThanOrEqual(1);
  });

  it("surfaces an unprofiled table so it cannot read as clean (missing-statistics cause)", () => {
    const f = analyzeData(
      snap([profile({ name: "parenttbl", rowCount: UNKNOWN, skipped: STATS_MISSING_SKIP })]),
    )[0]!;
    expect(f.id).toBe("data.not-profiled.parenttbl");
    expect(f.observation).toMatch(/no entry in the collected table statistics/);
    expect(f.observation).toMatch(/partitioned PARENT table/);
    expect(f.whyItNeedsChanging).toMatch(/unverified|not.*examin/i);
    expect(f.severity).toBe("info");
    expect(f.observation.match(/not profiled/gi)?.length ?? 0).toBeLessThanOrEqual(1);
  });

  it("says nothing about a healthy populated table", () => {
    expect(
      analyzeData(
        snap([
          profile({
            columns: [{ name: "name", sqlType: "text", nonNullCount: 100, nullFraction: 0, allNull: false }],
          }),
        ]),
      ),
    ).toEqual([]);
  });

  // [SCOPE 111 / T046] BEGIN — All-null BY DESIGN is not a dead column
  describe("intentionally-null columns", () => {
    const forcetestSnap = () =>
      snap([
        profile({
          name: "testplanitems",
          rowCount: 178,
          columns: [
            { name: "forcetest", sqlType: "boolean", nonNullCount: 0, nullFraction: 1, allNull: true },
            { name: "taskid", sqlType: "uuid", nonNullCount: 0, nullFraction: 1, allNull: true },
          ],
        }),
      ]);
    const declared = new Map([["testplanitems.forcetest", "null = inherit the plan flag (FR-030)"]]);

    it("withholds a declared column from the dead-column finding", () => {
      const dead = analyzeData(forcetestSnap(), declared).find(
        (f) => f.rule === "all-null-column",
      )!;
      // taskid is genuinely undeclared and must still be reported...
      expect(dead.observation).toMatch(/taskid/);
      // ...but forcetest must not be, because the remediation there is the defect.
      expect(dead.observation).not.toMatch(/forcetest/);
    });

    it("re-reports the withheld column at info with its declared reason", () => {
      // Filtering it out silently would be indistinguishable from never having
      // looked at the column.
      const f = analyzeData(forcetestSnap(), declared).find(
        (x) => x.rule === "intentional-null-column",
      )!;
      expect(f.id).toBe("data.intentional-null-column.testplanitems");
      expect(f.severity).toBe("info");
      expect(f.observation).toMatch(/forcetest/);
      expect(f.whyItNeedsChanging).toMatch(/FR-030/);
    });

    it("emits no dead-column finding at all when every all-null column is declared", () => {
      const onlyDeclared = snap([
        profile({
          name: "testplanitems",
          rowCount: 178,
          columns: [
            { name: "forcetest", sqlType: "boolean", nonNullCount: 0, nullFraction: 1, allNull: true },
          ],
        }),
      ]);
      const findings = analyzeData(onlyDeclared, declared);
      expect(findings.filter((f) => f.rule === "all-null-column")).toHaveLength(0);
      expect(findings.filter((f) => f.rule === "intentional-null-column")).toHaveLength(1);
    });

    it("behaves exactly as before when nothing is declared", () => {
      const dead = analyzeData(forcetestSnap()).find((f) => f.rule === "all-null-column")!;
      expect(dead.observation).toMatch(/forcetest/);
      expect(dead.observation).toMatch(/taskid/);
    });

    it("produces contract-complete findings", () => {
      for (const f of analyzeData(forcetestSnap(), declared)) {
        expect(validateFinding(f)).toEqual([]);
      }
    });
  });
  // [SCOPE 111 / T046] END
});
