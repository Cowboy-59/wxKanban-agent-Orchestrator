import { describe, expect, it } from "vitest";
import {
  buildOrphanQuery,
  buildTenantQuery,
  estimateRowCounts,
  probeIntegrity,
} from "../../_wxAI/skills/wxDBAnalyze/scripts/engines/postgres/integrity.js";
import type { Relationship } from "../../_wxAI/skills/wxDBAnalyze/scripts/dimensions/relationships.js";

// DEVIATION (controller decision, SCOPE-121/T009): the brief's `rel()` fixture
// predates Task 8's composite-key fields (`childColumns`, `parentColumns`,
// `isComposite`), which are non-optional on `Relationship`. They are added
// here with single-element defaults so the fixture still type-checks and so
// the single-column case (the common path) is exercised unchanged.
const rel = (over: Partial<Relationship> = {}): Relationship => ({
  child: "tasks",
  childColumn: "projectid",
  childColumns: ["projectid"],
  parent: "projects",
  parentColumn: "id",
  parentColumns: ["id"],
  isComposite: false,
  sources: ["convention"],
  childColumnNullable: true,
  childColumnType: "uuid",
  parentColumnType: "uuid",
  indexedOnChild: true,
  ...over,
});

// Modeled on the real src/db/schema/testsignoffs.ts composite FK:
// testsignoffs.(itemid, itemexecutor) -> testplanitems.(id, executor).
const compositeRel = (over: Partial<Relationship> = {}): Relationship =>
  rel({
    child: "testsignoffs",
    childColumn: "itemid",
    childColumns: ["itemid", "itemexecutor"],
    parent: "testplanitems",
    parentColumn: "id",
    parentColumns: ["id", "executor"],
    isComposite: true,
    childColumnType: "uuid",
    parentColumnType: "uuid",
    ...over,
  });

describe("buildOrphanQuery", () => {
  it("builds a left-join anti-join with quoted identifiers", () => {
    const sql = buildOrphanQuery(rel());
    expect(sql).toContain('from "tasks" c');
    expect(sql).toContain('left join "projects" p on c."projectid" = p."id"');
    expect(sql).toContain('where c."projectid" is not null and p."id" is null');
  });

  it("refuses to build SQL from an unsafe identifier", () => {
    expect(() => buildOrphanQuery(rel({ child: 'x"; drop table y --' }))).toThrow();
  });

  // Controller decision 3: composite keys must join on every column pair,
  // AND-ed together and paired by index, with a NULL guard covering every
  // child column — not just the first.
  it("joins every column pair and null-guards every child column for a composite key", () => {
    const sql = buildOrphanQuery(compositeRel());
    expect(sql).toContain('from "testsignoffs" c');
    expect(sql).toContain(
      'left join "testplanitems" p on c."itemid" = p."id" and c."itemexecutor" = p."executor"',
    );
    expect(sql).toContain(
      'where c."itemid" is not null and c."itemexecutor" is not null and p."id" is null',
    );
  });
});

describe("buildTenantQuery", () => {
  it("compares the child's tenant column against the parent's", () => {
    const sql = buildTenantQuery(rel(), "companyid");
    expect(sql).toContain('c."companyid" <> p."companyid"');
  });

  it("joins every column pair for a composite key", () => {
    const sql = buildTenantQuery(compositeRel(), "companyid");
    expect(sql).toContain(
      'join "testplanitems" p on c."itemid" = p."id" and c."itemexecutor" = p."executor"',
    );
  });
});

// SCOPE-121 final wave, I4 [Important]: estimateRowCounts must no longer
// clamp Postgres's -1 "never analyzed" sentinel up to 0 — the clamp used to
// erase the sentinel before any caller had a chance to preserve it.
describe("estimateRowCounts", () => {
  it("does not clamp reltuples with greatest(...,0) — the query passes the raw value through", async () => {
    let capturedSql = "";
    const conn = {
      async query(sql: string) {
        capturedSql = sql;
        return [{ table_name: "neveranalyzed", rows: "-1" }];
      },
      async close() {},
    };
    const counts = await estimateRowCounts(conn);
    expect(capturedSql).not.toMatch(/greatest/i);
    expect(counts.get("neveranalyzed")).toBe(-1);
  });

  it("passes a genuine analyzed count through unchanged", async () => {
    const conn = {
      async query() {
        return [{ table_name: "tasks", rows: "5000" }];
      },
      async close() {},
    };
    const counts = await estimateRowCounts(conn);
    expect(counts.get("tasks")).toBe(5000);
  });
});

describe("probeIntegrity", () => {
  function conn(handler: (sql: string) => Record<string, unknown>[]) {
    return { async query(sql: string) { return handler(sql); }, async close() {} };
  }

  it("returns the orphan count for a probed relationship", async () => {
    const results = await probeIntegrity(
      conn((sql) => (sql.includes("orphans") ? [{ orphans: "412" }] : [])),
      [rel()],
      { rowCounts: new Map([["tasks", 5000]]) },
    );
    expect(results[0]?.orphanRows).toBe(412);
    expect(results[0]?.skipped).toBeUndefined();
  });

  it("skips an unindexed anti-join on a large table, and says why", async () => {
    const results = await probeIntegrity(
      conn(() => [{ orphans: "0" }]),
      [rel({ indexedOnChild: false })],
      { rowCounts: new Map([["tasks", 20_000_000]]), maxUnindexedRows: 1_000_000 },
    );
    expect(results[0]?.orphanRows).toBeNull();
    expect(results[0]?.skipped).toMatch(/unindexed.*20000000/i);
  });

  // SCOPE-121 final wave, I4 [Important]: Postgres's reltuples sentinel `-1`
  // ("never analyzed") must survive as an explicit "unknown" row count, not
  // collapse to 0 — and an unindexed relationship with an unknown row count
  // must be treated with the SAME caution as a confirmed-huge one (skipped),
  // never silently treated as small enough to probe.
  it("treats a -1 row-count sentinel (never analyzed) as unknown, not zero, and skips an unindexed anti-join out of caution", async () => {
    const results = await probeIntegrity(
      conn(() => [{ orphans: "0" }]),
      [rel({ indexedOnChild: false })],
      { rowCounts: new Map([["tasks", -1]]) },
    );
    expect(results[0]?.childRows).toBe("unknown");
    expect(results[0]?.orphanRows).toBeNull();
    expect(results[0]?.skipped).toMatch(/unknown/i);
    expect(results[0]?.skipped).toMatch(/never.*analyzed|analyzed/i);
  });

  it("still probes an INDEXED relationship with an unknown row count — the ceiling only guards the unindexed case", async () => {
    const results = await probeIntegrity(
      conn(() => [{ orphans: "3" }]),
      [rel({ indexedOnChild: true })],
      { rowCounts: new Map([["tasks", -1]]) },
    );
    expect(results[0]?.childRows).toBe("unknown");
    expect(results[0]?.orphanRows).toBe(3);
    expect(results[0]?.skipped).toBeUndefined();
  });

  it("reports a genuine, analyzed zero-row table as 0, distinctly from unknown", async () => {
    const results = await probeIntegrity(
      conn(() => [{ orphans: "0" }]),
      [rel({ indexedOnChild: false })],
      { rowCounts: new Map([["tasks", 0]]) },
    );
    expect(results[0]?.childRows).toBe(0);
    expect(results[0]?.childRows).not.toBe("unknown");
  });

  it("skips a relationship whose column types cannot be compared", async () => {
    const results = await probeIntegrity(
      conn(() => [{ orphans: "0" }]),
      [rel({ childColumnType: "text", parentColumnType: "uuid" })],
      { rowCounts: new Map([["tasks", 10]]) },
    );
    expect(results[0]?.orphanRows).toBeNull();
    expect(results[0]?.skipped).toMatch(/text.*uuid/);
  });

  it("records a query failure as a skip rather than aborting the run", async () => {
    const results = await probeIntegrity(
      conn(() => { throw new Error("permission denied for table tasks"); }),
      [rel()],
      { rowCounts: new Map([["tasks", 10]]) },
    );
    expect(results[0]?.orphanRows).toBeNull();
    expect(results[0]?.skipped).toMatch(/permission denied/);
  });

  // Controller decision 4: a composite relationship is comparable only on
  // its leading pair's types; when that check fails, the skip reason must
  // say only the leading pair was checked — never imply every pair was.
  it("skips a composite relationship on a leading-pair type mismatch and says only the leading pair was checked", async () => {
    const results = await probeIntegrity(
      conn(() => [{ orphans: "0" }]),
      [compositeRel({ childColumnType: "text", parentColumnType: "uuid" })],
      { rowCounts: new Map([["testsignoffs", 10]]) },
    );
    expect(results[0]?.orphanRows).toBeNull();
    expect(results[0]?.skipped).toMatch(/text.*uuid/);
    expect(results[0]?.skipped).toMatch(/leading column pair/i);
  });

  it("probes a composite relationship whose leading pair's types match", async () => {
    const results = await probeIntegrity(
      conn((sql) => (sql.includes("orphans") ? [{ orphans: "7" }] : [])),
      [compositeRel()],
      { rowCounts: new Map([["testsignoffs", 10]]) },
    );
    expect(results[0]?.orphanRows).toBe(7);
    expect(results[0]?.skipped).toBeUndefined();
  });

  // Review round 1, Finding 1 [Important]: buildOrphanQuery (via quoteIdent)
  // used to be called outside the try block, so one unsafe identifier
  // aborted probeIntegrity entirely and discarded every already-collected
  // result. It must now surface as a per-relationship skip, leaving the
  // surrounding relationships in the same call unaffected.
  it("skips one relationship on an unsafe identifier without discarding the others in the same call", async () => {
    const results = await probeIntegrity(
      conn((sql) => {
        if (sql.includes('"boxes"')) return [{ orphans: "9" }];
        if (sql.includes('"tasks"')) return [{ orphans: "5" }];
        return [];
      }),
      [
        rel(),
        rel({ child: 'x"; drop table y --' }),
        rel({ child: "boxes", parent: "boxes", parentColumn: "id", parentColumns: ["id"] }),
      ],
      { rowCounts: new Map([["tasks", 10], ["boxes", 10]]) },
    );

    expect(results).toHaveLength(3);

    expect(results[0]?.orphanRows).toBe(5);
    expect(results[0]?.skipped).toBeUndefined();

    expect(results[1]?.orphanRows).toBeNull();
    expect(results[1]?.query).toBe("");
    expect(results[1]?.skipped).toMatch(/not a plain catalog identifier|refusing to build/i);

    expect(results[2]?.orphanRows).toBe(9);
    expect(results[2]?.skipped).toBeUndefined();
  });

  // Review round 1, Finding 2 [Important]: the tenant sub-probe's catch used
  // to swallow every error uniformly into `tenantMismatches: null`, with no
  // way to tell "no tenant column, expected" from "tenant probe failed,
  // investigate". These three tests assert the distinction is real, not
  // merely that something was recorded.
  describe("tenant sub-probe", () => {
    it("returns a tenant mismatch count when the tenant probe succeeds", async () => {
      const results = await probeIntegrity(
        conn((sql) => (sql.includes("mismatches") ? [{ mismatches: "3" }] : [{ orphans: "0" }])),
        [rel()],
        { rowCounts: new Map([["tasks", 10]]), tenantColumn: "companyid" },
      );
      expect(results[0]?.tenantMismatches).toBe(3);
      expect(results[0]?.tenantSkipped).toBeUndefined();
    });

    it("marks the tenant skip as expected when the driver reports SQLSTATE 42703", async () => {
      const results = await probeIntegrity(
        {
          async query(sql: string) {
            if (sql.includes("orphans")) return [{ orphans: "0" }];
            throw Object.assign(new Error('column p.companyid does not exist'), {
              code: "42703",
            });
          },
          async close() {},
        },
        [rel()],
        { rowCounts: new Map([["tasks", 10]]), tenantColumn: "companyid" },
      );
      expect(results[0]?.orphanRows).toBe(0);
      expect(results[0]?.tenantMismatches).toBeNull();
      expect(results[0]?.tenantSkipped).toMatch(/42703/);
      expect(results[0]?.tenantSkipped).toMatch(/does not exist|no tenant column/i);
      // MODIFIED-BY [SCOPE 121 / T010]: typed discriminator alongside the
      // free-text message, so a caller can roll up the expected case
      // without re-parsing prose.
      expect(results[0]?.tenantSkippedKind).toBe("column-missing");
    });

    // SCOPE-121 final wave, C1 [CRITICAL]: `tenantQuery` must be recorded on
    // the probe whenever the tenant sub-probe is attempted, independently of
    // the orphan `query` field and independently of whether the tenant probe
    // then succeeds or fails — this is what lets `dimensions/integrity.ts`
    // cite the actual tenant query as evidence instead of the orphan
    // anti-join.
    it("records the tenant query separately from the orphan query when the tenant probe succeeds", async () => {
      const results = await probeIntegrity(
        conn((sql) => (sql.includes("mismatches") ? [{ mismatches: "3" }] : [{ orphans: "0" }])),
        [rel()],
        { rowCounts: new Map([["tasks", 10]]), tenantColumn: "companyid" },
      );
      expect(results[0]?.query).toContain("orphans");
      expect(results[0]?.tenantQuery).toContain("mismatches");
      expect(results[0]?.tenantQuery).not.toBe(results[0]?.query);
    });

    it("still records the tenant query when the tenant probe subsequently fails", async () => {
      const results = await probeIntegrity(
        {
          async query(sql: string) {
            if (sql.includes("orphans")) return [{ orphans: "0" }];
            throw Object.assign(new Error("column p.companyid does not exist"), {
              code: "42703",
            });
          },
          async close() {},
        },
        [rel()],
        { rowCounts: new Map([["tasks", 10]]), tenantColumn: "companyid" },
      );
      expect(results[0]?.tenantQuery).toContain("mismatches");
      expect(results[0]?.tenantQuery).not.toBe(results[0]?.query);
    });

    it("leaves the tenant query unset when no tenant column was configured at all", async () => {
      const results = await probeIntegrity(
        conn(() => [{ orphans: "0" }]),
        [rel()],
        { rowCounts: new Map([["tasks", 10]]) },
      );
      expect(results[0]?.tenantQuery).toBeUndefined();
    });

    it("marks the tenant skip as unexpected for a non-42703 failure, distinctly from the 42703 case", async () => {
      const results = await probeIntegrity(
        {
          async query(sql: string) {
            if (sql.includes("orphans")) return [{ orphans: "0" }];
            throw new Error("permission denied for table projects");
          },
          async close() {},
        },
        [rel()],
        { rowCounts: new Map([["tasks", 10]]), tenantColumn: "companyid" },
      );
      expect(results[0]?.tenantMismatches).toBeNull();
      expect(results[0]?.tenantSkipped).toMatch(/tenant probe failed/);
      expect(results[0]?.tenantSkipped).toMatch(/permission denied/);
      expect(results[0]?.tenantSkipped).not.toMatch(/42703/);
      // MODIFIED-BY [SCOPE 121 / T010]: a non-42703 failure is the
      // "worth investigating" case and must classify distinctly.
      expect(results[0]?.tenantSkippedKind).toBe("probe-error");
    });
  });
});
