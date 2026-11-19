// tests/wxdbanalyze/pg-maintenance-collect.test.ts
import { describe, expect, it } from "vitest";
import {
  BLOCKERS_SQL,
  FREEZE_AGE_SQL,
  collectMaintenance,
} from "../../_wxAI/skills/wxDBAnalyze/scripts/engines/postgres/maintenance.js";
import type { PgCapabilities } from "../../_wxAI/skills/wxDBAnalyze/scripts/engines/postgres/capabilities.js";

const caps = (settings: Record<string, string> = {}): PgCapabilities => ({
  extensions: {
    pg_stat_statements: "preloaded-not-created",
    pgstattuple: "available-not-installed",
    pg_buffercache: "available-not-installed",
    pgaudit: "available-not-installed",
  },
  settings: { autovacuum: "on", autovacuum_freeze_max_age: "200000000", ...settings },
  serverVersionNum: 150017,
});

function conn(handler: (sql: string) => Record<string, unknown>[]) {
  return { async query(sql: string) { return handler(sql); }, async close() {} };
}

describe("maintenance SQL", () => {
  it("reads pg_catalog only", () => {
    expect(FREEZE_AGE_SQL).toContain("pg_catalog");
    expect(FREEZE_AGE_SQL).not.toContain("information_schema");
    expect(BLOCKERS_SQL).not.toContain("information_schema");
  });

  // Review round 1 Finding 2: `where not active` alone only caught abandoned
  // slots. wal_status/safe_wal_size let an ACTIVE-but-lagging slot be
  // detected too, since `active` only reflects walsender attachment.
  it("reads wal_status and safe_wal_size so an active-but-lagging replication slot is not invisible", () => {
    expect(BLOCKERS_SQL).toContain("wal_status");
    expect(BLOCKERS_SQL).toContain("safe_wal_size");
    expect(BLOCKERS_SQL).toContain("unreserved");
    expect(BLOCKERS_SQL).toContain("lost");
  });
});

describe("collectMaintenance", () => {
  it("collects freeze ages and computes headroom against the configured max", async () => {
    const m = await collectMaintenance(
      conn((sql) =>
        sql.includes("relfrozenxid")
          ? [{ table_name: "projecttasks", relkind: "r", relfrozenxid: "12345678", freeze_age: "150000000" }]
          : [],
      ),
      caps(),
    );
    const f = m.freezeAges.find((x) => x.table === "projecttasks")!;
    expect(f.age).toBe(150_000_000);
    expect(f.headroomFraction).toBeCloseTo(0.25);
  });

  // C1 [CRITICAL] regression: a partitioned PARENT has no storage of its own,
  // so relfrozenxid reads as InvalidTransactionId (0) and age(0) returns
  // INT_MAX — this must never be reported as a real freeze age, and the
  // exclusion must be recorded, not silently dropped.
  it("excludes a partitioned parent (relkind 'p') from freeze ages and records the exclusion", async () => {
    const m = await collectMaintenance(
      conn((sql) =>
        sql.includes("relfrozenxid")
          ? [
              { table_name: "orders_parent", relkind: "p", relfrozenxid: "0", freeze_age: "2147483647" },
              { table_name: "orders_2026_01", relkind: "r", relfrozenxid: "999999", freeze_age: "1000" },
            ]
          : [],
      ),
      caps(),
    );
    expect(m.freezeAges.find((x) => x.table === "orders_parent")).toBeUndefined();
    expect(m.freezeAges.find((x) => x.table === "orders_2026_01")).toBeDefined();
    expect(m.freezeAgeExcluded).toHaveLength(1);
    expect(m.freezeAgeExcluded[0]!.table).toBe("orders_parent");
    expect(m.freezeAgeExcluded[0]!.reason).toMatch(/partitioned/i);
  });

  // Belt and braces: even a relation NOT reported as relkind 'p' must still
  // be excluded if its relfrozenxid is literally 0 — InvalidTransactionId is
  // never a real freeze horizon regardless of relkind.
  it("excludes any relation with relfrozenxid = 0, even if relkind is not 'p'", async () => {
    const m = await collectMaintenance(
      conn((sql) =>
        sql.includes("relfrozenxid")
          ? [{ table_name: "oddcase", relkind: "r", relfrozenxid: "0", freeze_age: "2147483647" }]
          : [],
      ),
      caps(),
    );
    expect(m.freezeAges).toHaveLength(0);
    expect(m.freezeAgeExcluded).toHaveLength(1);
    expect(m.freezeAgeExcluded[0]!.table).toBe("oddcase");
  });

  it("collects per-table autovacuum overrides", async () => {
    const m = await collectMaintenance(
      conn((sql) =>
        sql.includes("reloptions")
          ? [{ table_name: "bigtable", reloptions: ["autovacuum_enabled=false"] }]
          : [],
      ),
      caps(),
    );
    expect(m.tableOptions.get("bigtable")).toEqual(["autovacuum_enabled=false"]);
  });

  it("collects long-running transactions that hold vacuum back", async () => {
    const m = await collectMaintenance(
      conn((sql) =>
        sql.includes("pg_stat_activity")
          ? [{ kind: "long-transaction", detail: "pid 4242 idle in transaction", age_seconds: "9000" }]
          : [],
      ),
      caps(),
    );
    expect(m.blockers).toHaveLength(1);
    expect(m.blockers[0]!.ageSeconds).toBe(9000);
  });

  it("records a blockers-query failure without losing the rest", async () => {
    const m = await collectMaintenance(
      conn((sql) => {
        if (sql.includes("pg_stat_activity")) throw new Error("permission denied for pg_stat_activity");
        if (sql.includes("relfrozenxid")) return [{ table_name: "a", relkind: "r", relfrozenxid: "1000000", freeze_age: "1000" }];
        return [];
      }),
      caps(),
    );
    expect(m.freezeAges).toHaveLength(1);
    expect(m.blockersUnavailable).toMatch(/permission denied/);
  });

  it("reports that bloat cannot be measured without pgstattuple", async () => {
    const m = await collectMaintenance(conn(() => []), caps());
    expect(m.bloatMeasurable).toBe(false);
    expect(m.bloatUnavailable).toMatch(/pgstattuple/i);
    expect(m.bloatUnavailable).toMatch(/estimat/i);
  });

  // Review round 1 Finding 1 (Critical): capabilities.settings never carried
  // autovacuum_freeze_max_age (TRACKED_SETTINGS omitted it), so freezeMaxAge
  // silently fell back to the hardcoded default even when a DBA had tuned it
  // down. The fixture's caps() helper hand-injects the key, which is exactly
  // why the earlier tests above never caught this — this pair drives the
  // absent/present cases directly against collectMaintenance's own logic.
  it("marks freezeMaxAgeAssumed true and uses the Postgres default when the setting is absent from capabilities", async () => {
    const noFreezeSetting: PgCapabilities = {
      extensions: {
        pg_stat_statements: "preloaded-not-created",
        pgstattuple: "available-not-installed",
        pg_buffercache: "available-not-installed",
        pgaudit: "available-not-installed",
      },
      settings: { autovacuum: "on" },
      serverVersionNum: 150017,
    };
    const m = await collectMaintenance(conn(() => []), noFreezeSetting);
    expect(m.freezeMaxAgeAssumed).toBe(true);
    expect(m.freezeMaxAge).toBe(200_000_000);
  });

  it("marks freezeMaxAgeAssumed false and uses the real value when autovacuum_freeze_max_age is present", async () => {
    const m = await collectMaintenance(
      conn(() => []),
      caps({ autovacuum_freeze_max_age: "150000000" }),
    );
    expect(m.freezeMaxAgeAssumed).toBe(false);
    expect(m.freezeMaxAge).toBe(150_000_000);
  });

  // Review round 1 Finding 2: an active slot whose wal_status has already
  // gone unreserved/lost must still surface as a blocker, not just inactive
  // ones — this exercises the plumbing from BLOCKERS_SQL's row shape through
  // to VacuumBlocker.
  it("reports an active-but-lagging replication slot as a blocker, not only inactive ones", async () => {
    const m = await collectMaintenance(
      conn((sql) =>
        sql.includes("pg_stat_activity")
          ? [
              {
                kind: "replication-slot",
                detail:
                  "slot repl1 (physical, active=true, wal_status=unreserved, safe_wal_size=unbounded) — " +
                  "active but wal_status indicates it is at risk of losing required WAL",
                age_seconds: "0",
              },
            ]
          : [],
      ),
      caps(),
    );
    expect(m.blockers).toHaveLength(1);
    expect(m.blockers[0]!.kind).toBe("replication-slot");
    expect(m.blockers[0]!.detail).toMatch(/wal_status=unreserved/);
    expect(m.blockers[0]!.detail).toMatch(/active but wal_status indicates/);
  });
});
