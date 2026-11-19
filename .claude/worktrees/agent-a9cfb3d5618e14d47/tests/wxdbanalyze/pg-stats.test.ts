import { describe, expect, it } from "vitest";
import {
  TABLE_STATS_SQL,
  collectTableStats,
} from "../../_wxAI/skills/wxDBAnalyze/scripts/engines/postgres/stats.js";
import { UNKNOWN } from "../../_wxAI/skills/wxDBAnalyze/scripts/core/metrics.js";

const row = (over: Record<string, unknown> = {}) => ({
  table_name: "projecttasks",
  seq_scan: "12",
  seq_tup_read: "480",
  idx_scan: "900",
  n_tup_ins: "40",
  n_tup_upd: "10",
  n_tup_del: "2",
  n_live_tup: "500",
  n_dead_tup: "3",
  n_ins_since_vacuum: "5",
  last_vacuum: null,
  last_autovacuum: "2026-07-30T00:00:00.000Z",
  last_analyze: null,
  last_autoanalyze: "2026-07-30T00:00:00.000Z",
  table_bytes: "8192",
  index_bytes: "16384",
  toast_bytes: "0",
  reltuples: "500",
  relpages: "1",
  ...over,
});

function conn(rows: Record<string, unknown>[]) {
  return { async query() { return rows; }, async close() {} };
}

describe("TABLE_STATS_SQL", () => {
  it("reads pg_stat_user_tables, never information_schema", () => {
    expect(TABLE_STATS_SQL).toContain("pg_stat_user_tables");
    expect(TABLE_STATS_SQL).not.toContain("information_schema");
  });
});

describe("collectTableStats", () => {
  it("parses a fully-analyzed table into known values", async () => {
    const s = await collectTableStats(conn([row()]));
    const t = s.tables.get("projecttasks")!;
    expect(t.seqScan).toBe(12);
    expect(t.idxScan).toBe(900);
    expect(t.liveTuples).toBe(500);
    expect(t.everAnalyzed).toBe(true);
  });

  it("marks a never-analyzed table's derived statistics UNKNOWN, not zero", async () => {
    const s = await collectTableStats(
      conn([
        row({
          last_analyze: null,
          last_autoanalyze: null,
          reltuples: "-1",
          n_live_tup: "0",
          n_dead_tup: "0",
        }),
      ]),
    );
    const t = s.tables.get("projecttasks")!;
    expect(t.everAnalyzed).toBe(false);
    expect(t.liveTuples).toBe(UNKNOWN);
    expect(t.deadTuples).toBe(UNKNOWN);
    expect(t.rowEstimate).toBe(UNKNOWN);
  });

  it("keeps scan counters known even when the table was never analyzed", async () => {
    // seq_scan/idx_scan come from the activity collector, not from ANALYZE, so
    // they are real measurements regardless of whether statistics were gathered.
    const s = await collectTableStats(
      conn([row({ last_analyze: null, last_autoanalyze: null, reltuples: "-1" })]),
    );
    const t = s.tables.get("projecttasks")!;
    expect(t.seqScan).toBe(12);
    expect(t.idxScan).toBe(900);
  });

  it("counts how many tables have never been analyzed", async () => {
    const s = await collectTableStats(
      conn([
        row({ table_name: "a" }),
        row({ table_name: "b", last_analyze: null, last_autoanalyze: null, reltuples: "-1" }),
        row({ table_name: "c", last_analyze: null, last_autoanalyze: null, reltuples: "-1" }),
      ]),
    );
    expect(s.tables.size).toBe(3);
    expect(s.neverAnalyzed).toEqual(["b", "c"]);
  });

  it("treats a null idx_scan (no index on the table) as zero, not unknown", async () => {
    const s = await collectTableStats(conn([row({ idx_scan: null })]));
    expect(s.tables.get("projecttasks")!.idxScan).toBe(0);
  });
});
