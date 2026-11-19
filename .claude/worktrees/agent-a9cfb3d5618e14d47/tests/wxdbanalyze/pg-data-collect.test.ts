// tests/wxdbanalyze/pg-data-collect.test.ts
import { describe, expect, it } from "vitest";
import {
  buildNullDensityQuery,
  probeDataHealth,
} from "../../_wxAI/skills/wxDBAnalyze/scripts/engines/postgres/data.js";
import { UNKNOWN } from "../../_wxAI/skills/wxDBAnalyze/scripts/core/metrics.js";
import type { LiveSchema } from "../../_wxAI/skills/wxDBAnalyze/scripts/engines/postgres/schema.js";
import type { StatsSnapshot } from "../../_wxAI/skills/wxDBAnalyze/scripts/engines/postgres/stats.js";

const col = (name: string, sqlType = "text") => ({
  name, sqlType, notNull: false, hasDefault: false, isPrimaryKey: false,
});

function live(tables: Record<string, string[]>): LiveSchema {
  return {
    tables: new Map(
      Object.entries(tables).map(([name, cols]) => [
        name,
        { name, columns: cols.map((c) => col(c)), foreignKeys: [], indexes: [] },
      ]),
    ),
  };
}

function stats(entries: Record<string, { bytes: number; analyzed?: boolean }>): StatsSnapshot {
  const tables = new Map();
  const neverAnalyzed: string[] = [];
  for (const [name, v] of Object.entries(entries)) {
    const everAnalyzed = v.analyzed !== false;
    if (!everAnalyzed) neverAnalyzed.push(name);
    tables.set(name, {
      name, everAnalyzed,
      seqScan: 0, seqTupRead: 0, idxScan: 0,
      inserts: 0, updates: 0, deletes: 0, insertsSinceVacuum: 0,
      liveTuples: everAnalyzed ? 10 : UNKNOWN,
      deadTuples: everAnalyzed ? 0 : UNKNOWN,
      rowEstimate: everAnalyzed ? 10 : UNKNOWN,
      pages: everAnalyzed ? 1 : UNKNOWN,
      lastVacuum: null, lastAutovacuum: null,
      lastAnalyze: everAnalyzed ? "2026-07-30T00:00:00.000Z" : null,
      lastAutoanalyze: null,
      tableBytes: v.bytes, indexBytes: 0, toastBytes: 0,
    });
  }
  return { tables, neverAnalyzed };
}

describe("buildNullDensityQuery", () => {
  it("counts rows and non-null values per column with quoted identifiers", () => {
    const sql = buildNullDensityQuery("customers", ["name", "email"]);
    expect(sql).toContain('from "customers"');
    expect(sql).toContain('count("name")');
    expect(sql).toContain('count("email")');
    expect(sql).toContain("count(*)");
  });

  it("refuses to build SQL from an unsafe identifier", () => {
    expect(() => buildNullDensityQuery('x"; drop table y --', ["a"])).toThrow();
  });

  it("returns an empty string when there are no columns to profile", () => {
    expect(buildNullDensityQuery("customers", [])).toBe("");
  });
});

describe("probeDataHealth", () => {
  function conn(handler: (sql: string) => Record<string, unknown>[]) {
    return { async query(sql: string) { return handler(sql); }, async close() {} };
  }

  it("profiles a small table and computes null density", async () => {
    const snap = await probeDataHealth(
      conn(() => [{ total: "100", nn_0: "100", nn_1: "40" }]),
      live({ customers: ["name", "email"] }),
      stats({ customers: { bytes: 8192 } }),
    );
    const t = snap.tables.get("customers")!;
    expect(t.rowCount).toBe(100);
    expect(t.columns.find((c) => c.name === "email")!.nullFraction).toBeCloseTo(0.6);
    expect(t.columns.find((c) => c.name === "name")!.nullFraction).toBe(0);
  });

  it("flags a column that is entirely null", async () => {
    const snap = await probeDataHealth(
      conn(() => [{ total: "100", nn_0: "0" }]),
      live({ customers: ["legacycol"] }),
      stats({ customers: { bytes: 8192 } }),
    );
    expect(snap.tables.get("customers")!.columns[0]!.allNull).toBe(true);
  });

  it("records an empty table without profiling its columns", async () => {
    const snap = await probeDataHealth(
      conn(() => [{ total: "0" }]),
      live({ customers: ["name"] }),
      stats({ customers: { bytes: 0 } }),
    );
    const t = snap.tables.get("customers")!;
    expect(t.rowCount).toBe(0);
    expect(t.columns).toEqual([]);
  });

  it("skips a table above the size ceiling and records why", async () => {
    const snap = await probeDataHealth(
      conn(() => [{ total: "1" }]),
      live({ hugetable: ["a"] }),
      stats({ hugetable: { bytes: 5_000_000_000 } }),
      { maxTableBytes: 1_000_000_000 },
    );
    const t = snap.tables.get("hugetable")!;
    expect(t.rowCount).toBe(UNKNOWN);
    expect(t.skipped).toMatch(/5000000000/);
    expect(t.skipped).toMatch(/ceiling/i);
  });

  it("records a query failure as a skip rather than aborting the run", async () => {
    const snap = await probeDataHealth(
      conn(() => { throw new Error("permission denied for table customers"); }),
      live({ customers: ["name"], projects: ["name"] }),
      stats({ customers: { bytes: 8192 }, projects: { bytes: 8192 } }),
    );
    expect(snap.tables.get("customers")!.rowCount).toBe(UNKNOWN);
    expect(snap.tables.get("customers")!.skipped).toMatch(/permission denied/);
    // The failure must not take the rest of the run down with it.
    expect(snap.tables.get("projects")).toBeDefined();
  });

  it("skips a table with no statistics entry rather than treating it as 0 bytes", async () => {
    // pg_stat_user_tables reports only LEAF partitions, never a partitioned
    // PARENT table — so a partitioned parent has no entry in StatsSnapshot at
    // all. Falling back to 0 bytes would let a table of unknown, possibly
    // huge, size sail under the ceiling and receive a full unbounded scan.
    let queried = false;
    const snap = await probeDataHealth(
      conn(() => { queried = true; return [{ total: "999999999" }]; }),
      live({ partitionedparent: ["a"] }),
      stats({}),
    );
    const t = snap.tables.get("partitionedparent")!;
    expect(t.rowCount).toBe(UNKNOWN);
    expect(t.skipped).toBeTruthy();
    expect(t.skipped).toMatch(/no entry/i);
    expect(queried).toBe(false);
  });

  it("measures the row count of a table with no declared columns rather than assuming 0", async () => {
    let queried = false;
    const snap = await probeDataHealth(
      conn(() => { queried = true; return [{ total: "42" }]; }),
      live({ zerocol: [] }),
      stats({ zerocol: { bytes: 8192 } }),
    );
    const t = snap.tables.get("zerocol")!;
    expect(queried).toBe(true);
    expect(t.rowCount).toBe(42);
    expect(t.columns).toEqual([]);
  });

  it("profiles a never-analyzed table rather than skipping it", async () => {
    // Sizes come from the filesystem, so a never-analyzed table can still be
    // profiled — its exact count is measured here, not estimated.
    const snap = await probeDataHealth(
      conn(() => [{ total: "7", nn_0: "7" }]),
      live({ fresh: ["a"] }),
      stats({ fresh: { bytes: 8192, analyzed: false } }),
    );
    expect(snap.tables.get("fresh")!.rowCount).toBe(7);
  });
});
