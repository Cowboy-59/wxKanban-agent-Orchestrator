// tests/wxdbanalyze/pg-performance-collect.test.ts
import { describe, expect, it } from "vitest";
import {
  INDEX_STATS_SQL,
  collectPerformance,
} from "../../_wxAI/skills/wxDBAnalyze/scripts/engines/postgres/performance.js";
import type { PgCapabilities } from "../../_wxAI/skills/wxDBAnalyze/scripts/engines/postgres/capabilities.js";
import { UNKNOWN } from "../../_wxAI/skills/wxDBAnalyze/scripts/core/metrics.js";

const caps = (over: Partial<PgCapabilities["extensions"]> = {}): PgCapabilities => ({
  extensions: {
    pg_stat_statements: "preloaded-not-created",
    pgstattuple: "available-not-installed",
    pg_buffercache: "available-not-installed",
    pgaudit: "available-not-installed",
    ...over,
  },
  settings: {},
  serverVersionNum: 150017,
});

const idxRow = (over: Record<string, unknown> = {}) => ({
  table_name: "projecttasks",
  index_name: "idx_projecttasks_projectid",
  index_bytes: "16384",
  idx_scan: "0",
  is_unique: false,
  is_primary: false,
  is_valid: true,
  index_columns: ["projectid"],
  index_def: 'CREATE INDEX idx_projecttasks_projectid ON public.projecttasks USING btree (projectid)',
  ...over,
});

function conn(handler: (sql: string) => Record<string, unknown>[]) {
  return { async query(sql: string) { return handler(sql); }, async close() {} };
}

describe("INDEX_STATS_SQL", () => {
  it("reads pg_catalog and pg_stat, never information_schema", () => {
    expect(INDEX_STATS_SQL).toContain("pg_catalog");
    expect(INDEX_STATS_SQL).not.toContain("information_schema");
  });
});

describe("collectPerformance", () => {
  it("collects index statistics", async () => {
    const p = await collectPerformance(conn(() => [idxRow()]), caps());
    expect(p.indexes).toHaveLength(1);
    expect(p.indexes[0]!.scans).toBe(0);
    expect(p.indexes[0]!.bytes).toBe(16384);
    expect(p.indexes[0]!.isValid).toBe(true);
  });

  it("records that statement statistics were preloaded but never created", async () => {
    const p = await collectPerformance(conn(() => [idxRow()]), caps());
    expect(p.statements).toBeNull();
    expect(p.statementsUnavailable).toMatch(/preloaded/i);
    expect(p.statementsUnavailable).toMatch(/create extension/i);
  });

  it("distinguishes not-created from genuinely unavailable", async () => {
    const p = await collectPerformance(
      conn(() => [idxRow()]),
      caps({ pg_stat_statements: "unavailable" }),
    );
    expect(p.statementsUnavailable).toMatch(/not available/i);
    expect(p.statementsUnavailable).not.toMatch(/create extension/i);
  });

  it("distinguishes available-not-installed with its own restart-specific wording", async () => {
    const p = await collectPerformance(
      conn(() => [idxRow()]),
      caps({ pg_stat_statements: "available-not-installed" }),
    );
    expect(p.statementsUnavailable).toMatch(/restart/i);
  });

  it("reports a partitioned parent's missing stats row as UNKNOWN, not zero", async () => {
    const p = await collectPerformance(
      conn(() => [idxRow({ idx_scan: null })]),
      caps(),
    );
    expect(p.indexes[0]!.scans).toBe(UNKNOWN);
  });

  it("reports a real zero-scan count as the number 0, distinct from UNKNOWN", async () => {
    const p = await collectPerformance(
      conn(() => [idxRow({ idx_scan: "0" })]),
      caps(),
    );
    expect(p.indexes[0]!.scans).toBe(0);
    expect(p.indexes[0]!.scans).not.toBe(UNKNOWN);
  });

  it("collects statement statistics when the extension is installed", async () => {
    const p = await collectPerformance(
      conn((sql) =>
        sql.includes("pg_stat_statements")
          ? [{ query: "select 1", calls: "10", total_exec_time: "500.5", mean_exec_time: "50.05", rows: "10" }]
          : [idxRow()],
      ),
      caps({ pg_stat_statements: "installed" }),
    );
    expect(p.statements).toHaveLength(1);
    expect(p.statements![0]!.meanExecMs).toBeCloseTo(50.05);
    expect(p.statementsUnavailable).toBeUndefined();
  });

  it("records a statement-statistics query failure without losing the index data", async () => {
    const p = await collectPerformance(
      conn((sql) => {
        if (sql.includes("pg_stat_statements")) throw new Error("relation does not exist");
        return [idxRow()];
      }),
      caps({ pg_stat_statements: "installed" }),
    );
    expect(p.indexes).toHaveLength(1);
    expect(p.statements).toBeNull();
    expect(p.statementsUnavailable).toMatch(/relation does not exist/);
  });

  it("groups indexes by table for duplicate detection downstream", async () => {
    const p = await collectPerformance(
      conn(() => [
        idxRow({ index_name: "a", index_columns: ["projectid"] }),
        idxRow({ index_name: "b", index_columns: ["projectid"] }),
        idxRow({ table_name: "other", index_name: "c", index_columns: ["x"] }),
      ]),
      caps(),
    );
    expect(p.byTable.get("projecttasks")).toHaveLength(2);
    expect(p.byTable.get("other")).toHaveLength(1);
  });
});
