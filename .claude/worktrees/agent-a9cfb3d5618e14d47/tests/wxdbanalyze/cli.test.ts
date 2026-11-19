// [SCOPE 121 / T014] BEGIN — CLI argument parsing tests
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dimensionStatuses, isCompleteDimensionSet, parseArgs, run, type CliOptions, type RunDeps } from "../../_wxAI/skills/wxDBAnalyze/scripts/cli.js";
import type { EngineAdapter, DbConnection } from "../../_wxAI/skills/wxDBAnalyze/scripts/core/engine.js";
import type { AnalysisReport, ReportPaths } from "../../_wxAI/skills/wxDBAnalyze/scripts/core/report.js";
import type { LoadSchemaModulesResult } from "../../_wxAI/skills/wxDBAnalyze/scripts/engines/postgres/declared.js";
import { primeTableConfig } from "../../_wxAI/skills/wxDBAnalyze/scripts/engines/postgres/declared.js";
import { getTableConfig } from "drizzle-orm/pg-core";

// run()'s extractDeclaredSchema requires drizzle's getTableConfig to be primed
// before it is called at all (even with an empty `sources` array — the guard
// is unconditional). The real `loadSchemaModules` primes it as a side effect;
// every test below injects a FAKE `loadSchemaModules` that never does, so it
// is primed once here instead, exactly as declared.test.ts does.
primeTableConfig(getTableConfig as never);

describe("parseArgs", () => {
  // MODIFIED-BY [SCOPE 121 / T022] — IMPLEMENTED grew from two dimensions to
  // five (schema, integrity, data, performance, maintenance) once Tasks
  // 15-21 shipped; this default-dimensions assertion now reflects that.
  it("defaults to every implemented dimension, read-only, no apply", () => {
    const o = parseArgs([]);
    expect(o.dimensions).toEqual(["schema", "integrity", "data", "performance", "maintenance"]);
    expect(o.apply).toBe(false);
    expect(o.dryRun).toBe(false);
    expect(o.deep).toBe(false);
  });

  it("parses a dimension filter", () => {
    expect(parseArgs(["--dimension", "integrity"]).dimensions).toEqual(["integrity"]);
  });

  it("accepts --key=value as well as spaced form", () => {
    expect(parseArgs(["--dimension=schema"]).dimensions).toEqual(["schema"]);
  });

  it("rejects an unknown dimension by name", () => {
    expect(() => parseArgs(["--dimension", "gravity"])).toThrow(/gravity/);
  });

  it("treats --dry-run as implying --apply planning without writes", () => {
    const o = parseArgs(["--dry-run"]);
    expect(o.dryRun).toBe(true);
    expect(o.apply).toBe(false);
  });

  it("parses engine and url overrides", () => {
    const o = parseArgs(["--engine", "mssql", "--url", "mssql://h/db"]);
    expect(o.engine).toBe("mssql");
    expect(o.url).toBe("mssql://h/db");
  });

  it("rejects --apply together with --dry-run, which contradict", () => {
    expect(() => parseArgs(["--apply", "--dry-run"])).toThrow(/both/i);
  });
});

// SCOPE-121 final wave, C2 [CRITICAL]: every dimension — implemented or not,
// selected or not — must get exactly one row, with wording that tells the
// three cases apart. Before this fix, an implemented-but-unselected
// dimension appeared in neither list.
describe("dimensionStatuses", () => {
  it("reports every dimension exactly once for a partial selection", () => {
    const statuses = dimensionStatuses(["schema"]);
    const ids = statuses.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("schema");
    expect(ids).toContain("integrity");
    // Every Phase 2 dimension must also appear.
    for (const id of ["data", "conventions", "performance", "maintenance", "security", "availability", "impact"]) {
      expect(ids).toContain(id);
    }
  });

  it("marks the selected dimension as full", () => {
    const statuses = dimensionStatuses(["schema"]);
    expect(statuses.find((s) => s.id === "schema")).toMatchObject({ support: "full" });
  });

  it("marks an implemented-but-unselected dimension as not-selected, distinct from not-implemented, and never silently absent", () => {
    const statuses = dimensionStatuses(["schema"]);
    const integrity = statuses.find((s) => s.id === "integrity");
    expect(integrity).toBeDefined();
    expect(integrity?.support).toBe("not-selected");
    expect(integrity?.support).not.toBe("not-implemented");
    expect(integrity?.note).toMatch(/not selected/i);
  });

  // MODIFIED-BY [SCOPE 121 / T022] — "performance" moved into IMPLEMENTED
  // when Task 18/19 shipped; "conventions" is now the still-Phase-2 example.
  it("still marks a genuine Phase 2 gap as not-implemented", () => {
    const statuses = dimensionStatuses(["schema"]);
    const conventions = statuses.find((s) => s.id === "conventions");
    expect(conventions?.support).toBe("not-implemented");
    expect(conventions?.note).toMatch(/phase 2/i);
  });

  it("marks both implemented dimensions as full when both are selected", () => {
    const statuses = dimensionStatuses(["schema", "integrity"]);
    expect(statuses.find((s) => s.id === "schema")).toMatchObject({ support: "full" });
    expect(statuses.find((s) => s.id === "integrity")).toMatchObject({ support: "full" });
  });
});
// [SCOPE 121 / T014] END

// ADDITION (SCOPE-121 final fix wave, LATEST-FILE — Important): `complete`
// must be true ONLY when the selection is exactly the full implemented set.
describe("isCompleteDimensionSet", () => {
  it("is true for the full implemented set, in any order", () => {
    expect(isCompleteDimensionSet(["schema", "integrity", "data", "performance", "maintenance"])).toBe(true);
    expect(isCompleteDimensionSet(["maintenance", "performance", "data", "integrity", "schema"])).toBe(true);
  });

  it("is false for any partial selection", () => {
    expect(isCompleteDimensionSet(["maintenance"])).toBe(false);
    expect(isCompleteDimensionSet(["schema", "integrity"])).toBe(false);
  });

  it("is false for an empty selection", () => {
    expect(isCompleteDimensionSet([])).toBe(false);
  });
});

// SCOPE-121 final wave, I3 [Important]: run() is the single composition seam
// for the whole skill and previously had zero test coverage — it is exactly
// what would have caught C2 and C3. Every test here injects a fake adapter
// (`deps.adapterFor`) whose `connect()` returns an in-memory `DbConnection`,
// so NO real database connection is ever made — this mirrors SAFETY: the
// repo-root .env DATABASE_URL points at production, and these tests must
// never touch it. `.env` is loaded once at module import time by cli.ts
// (`import "dotenv/config"`), which can populate `process.env.DATABASE_URL`
// with the real production string — every test below therefore either
// supplies its own `--url` explicitly or clears `process.env.DATABASE_URL`
// for the duration of the test, and every test past the URL/dimension check
// supplies a fake `adapterFor` so the resolved URL, real or not, is never
// actually dialled.
describe("run", () => {
  const baseOptions: CliOptions = {
    dimensions: ["schema", "integrity"],
    apply: false,
    dryRun: false,
    deep: false,
    reportDir: "docs/db-analysis",
  };

  /** A DbConnection whose query() fails the test if it is ever called. */
  function unreachableConnection(): DbConnection {
    return {
      async query(sql: string) {
        throw new Error(`connection.query must not be called in this test — got: ${sql}`);
      },
      async close() {},
    };
  }

  /** Fake connection driven by substring-matched canned responses, same pattern as pg-schema-collect.test.ts / pg-integrity-probe.test.ts. */
  function scriptedConnection(handler: (sql: string) => Record<string, unknown>[]): DbConnection {
    return {
      async query(sql: string) {
        return handler(sql);
      },
      async close() {},
    };
  }

  function fakeAdapterFor(connection: DbConnection, support: "full" | "not-implemented" = "full") {
    return (): EngineAdapter => ({
      engine: "postgres",
      supports: () => support,
      connect: async () => connection,
      async collect(): Promise<never> {
        throw new Error("collect() must not be called by run() in Phase 1");
      },
      additiveWhitelist: () => [],
    });
  }

  function fakeDeps(overrides: Partial<RunDeps>): RunDeps {
    return {
      adapterFor: fakeAdapterFor(unreachableConnection()),
      loadApplyPolicy: async () => ({ mode: "approve-each", source: "test" }),
      // MODIFIED-BY (SCOPE 111 / T046): stubbed like loadApplyPolicy so run()
      // never reads the real .wxai/db-policy.json under test. Empty map = no
      // column declared intentionally-null, which is the pre-T046 behaviour.
      loadAnalysisPolicy: async () => ({
        intentionalNullColumns: new Map<string, string>(),
        source: "test",
      }),
      loadSchemaModules: async () => ({ sources: [], unresolved: [] }),
      writeReport: async (_dir, _report, _snapshot, _complete): Promise<ReportPaths> => ({
        reportPath: "test/report.md",
        latestPath: "test/latest.md",
        snapshotPath: "test/report.snapshot.json",
        latestUpdated: true,
      }),
      ...overrides,
    };
  }

  let originalUrl: string | undefined;
  beforeEach(() => {
    originalUrl = process.env.DATABASE_URL;
  });
  afterEach(() => {
    if (originalUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalUrl;
  });

  it("returns 2 when neither --url nor DATABASE_URL is available — never reaches an adapter", async () => {
    delete process.env.DATABASE_URL;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const code = await run({ ...baseOptions, url: undefined });
      expect(code).toBe(2);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("returns 3 when the resolved engine's adapter does not support a requested dimension — never connects", async () => {
    const code = await run({
      ...baseOptions,
      engine: "oracle",
      url: "oracle://fake-host/db",
    });
    expect(code).toBe(3);
  });

  it("refuses (returns 4) when every declared schema source fails to resolve, without ever querying the connection", async () => {
    const connection = unreachableConnection();
    const querySpy = vi.spyOn(connection, "query");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const deps = fakeDeps({
        adapterFor: fakeAdapterFor(connection),
        loadSchemaModules: async (): Promise<LoadSchemaModulesResult> => ({
          sources: [],
          unresolved: [
            { label: "app", path: "src/db/schema", reason: "path does not exist" },
            { label: "mcp", path: "mcp-server/src/db/schema.ts", reason: "path does not exist" },
          ],
        }),
      });
      const code = await run({ ...baseOptions, url: "postgres://fake-host/db" }, deps);
      expect(code).toBe(4);
      expect(querySpy).not.toHaveBeenCalled();
      expect(errorSpy.mock.calls.some((c) => String(c[0]).match(/configuration error/i))).toBe(true);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("does NOT refuse when only SOME declared schema sources fail to resolve, and reports the unresolved one loudly", async () => {
    const connection = scriptedConnection(() => []);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    let capturedReport: AnalysisReport | undefined;
    try {
      const deps = fakeDeps({
        adapterFor: fakeAdapterFor(connection),
        loadSchemaModules: async (): Promise<LoadSchemaModulesResult> => ({
          sources: [],
          unresolved: [
            { label: "mcp", path: "mcp-server/src/db/schema.ts", reason: "path does not exist" },
          ],
        }),
        writeReport: async (_dir, report): Promise<ReportPaths> => {
          capturedReport = report;
          return { reportPath: "x", latestPath: "y", snapshotPath: "z", latestUpdated: true };
        },
      });
      const code = await run({ ...baseOptions, dimensions: ["schema"], url: "postgres://fake-host/db" }, deps);
      expect(code).not.toBe(4);
      expect(capturedReport?.unresolvedSources).toEqual([
        { label: "mcp", path: "mcp-server/src/db/schema.ts", reason: "path does not exist" },
      ]);
      expect(
        errorSpy.mock.calls.some((c) => String(c[0]).includes("mcp-server/src/db/schema.ts")),
      ).toBe(true);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("reports skipped relationships on the AnalysisReport itself, not only to stderr", async () => {
    // Convention resolution: widgets.ownerid -> owners, but "owners" has no
    // primary-key column, so inferRelationships declines the resolution and
    // records it in `skipped` — this is a pure consequence of the live
    // schema shape, no declared schema needed.
    const connection = scriptedConnection((sql) => {
      if (sql.includes("atttypmod")) {
        return [
          { table_name: "widgets", column_name: "id", sql_type: "uuid", not_null: true, has_default: true, is_primary_key: true },
          { table_name: "widgets", column_name: "ownerid", sql_type: "uuid", not_null: false, has_default: false, is_primary_key: false },
          { table_name: "owners", column_name: "name", sql_type: "text", not_null: false, has_default: false, is_primary_key: false },
        ];
      }
      return [];
    });
    let capturedReport: AnalysisReport | undefined;
    const deps = fakeDeps({
      adapterFor: fakeAdapterFor(connection),
      writeReport: async (_dir, report): Promise<ReportPaths> => {
        capturedReport = report;
        return { reportPath: "x", latestPath: "y", snapshotPath: "z", latestUpdated: true };
      },
    });
    const code = await run({ ...baseOptions, dimensions: ["integrity"], url: "postgres://fake-host/db" }, deps);
    expect(code).toBe(0);
    expect(capturedReport?.skippedRelationships).toEqual([
      { child: "widgets", childColumn: "ownerid", parent: "owners", reason: expect.stringMatching(/no primary key/) },
    ]);
  });

  it("returns 1 when a critical finding is produced (missing FK with measured orphans)", async () => {
    const connection = scriptedConnection((sql) => {
      if (sql.includes("atttypmod")) {
        return [
          { table_name: "widgets", column_name: "id", sql_type: "uuid", not_null: true, has_default: true, is_primary_key: true },
          { table_name: "widgets", column_name: "ownerid", sql_type: "uuid", not_null: false, has_default: false, is_primary_key: false },
          { table_name: "owners", column_name: "id", sql_type: "uuid", not_null: true, has_default: true, is_primary_key: true },
        ];
      }
      if (sql.includes("reltuples")) {
        return [{ table_name: "widgets", rows: "10" }];
      }
      if (sql.includes("orphans")) {
        return [{ orphans: "5" }];
      }
      if (sql.includes("mismatches")) {
        return [{ mismatches: "0" }];
      }
      return [];
    });
    const deps = fakeDeps({ adapterFor: fakeAdapterFor(connection) });
    const code = await run({ ...baseOptions, dimensions: ["integrity"], url: "postgres://fake-host/db" }, deps);
    expect(code).toBe(1);
  });

  it("returns 0 for a clean run with no findings", async () => {
    const connection = scriptedConnection(() => []);
    const deps = fakeDeps({ adapterFor: fakeAdapterFor(connection) });
    const code = await run({ ...baseOptions, dimensions: ["integrity"], url: "postgres://fake-host/db" }, deps);
    expect(code).toBe(0);
  });

  it("exercises the refusing-adapter branch (an engine with no implemented adapter) distinctly from a plain missing-URL exit", async () => {
    const code = await run({
      ...baseOptions,
      engine: "mssql",
      url: "mssql://fake-host/db",
    });
    expect(code).toBe(3);
  });

  // SCOPE-121 Phase 1 punch list, P2: the all-unresolved refusal used to sit
  // AFTER adapter.connect(url), so a misconfigured run dialled the target —
  // production, per .env — before refusing; this test previously only
  // checked that close() ran afterwards, which is true either way and does
  // not prove the dial never happened. run() now resolves schema sources and
  // returns 4 BEFORE calling adapter.connect() at all, so there is no
  // connection to close on this path. Assert the stronger property directly:
  // connect() itself is never invoked.
  it("never attempts to connect when the all-unresolved refusal fires early", async () => {
    const connection = unreachableConnection();
    const adapter = fakeAdapterFor(connection)();
    const connectSpy = vi.spyOn(adapter, "connect");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const deps = fakeDeps({
        adapterFor: () => adapter,
        loadSchemaModules: async (): Promise<LoadSchemaModulesResult> => ({
          sources: [],
          unresolved: [
            { label: "app", path: "src/db/schema", reason: "path does not exist" },
            { label: "mcp", path: "mcp-server/src/db/schema.ts", reason: "path does not exist" },
          ],
        }),
      });
      const code = await run({ ...baseOptions, url: "postgres://fake-host/db" }, deps);
      expect(code).toBe(4);
      expect(connectSpy).not.toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
    }
  });

  // [SCOPE 121 / T022] BEGIN — Batch A wiring tests
  // Confirms `run()` actually calls the Batch A collectors/analysers behind
  // their selection flags, collects capabilities/table-statistics exactly
  // once regardless of which dimensions are selected, threads the gap
  // channels (extension states, never-analyzed count, *Unavailable reasons)
  // into the JSON snapshot handed to `writeReport`, and that `--deep` raises
  // `probeDataHealth`'s size ceiling the same way it already raises
  // `probeIntegrity`'s unindexed-row ceiling.
  describe("Batch A dimension wiring (data, performance, maintenance)", () => {
    /** Counts how many times a query was issued whose SQL contains `needle`. */
    function countingConnection(
      handler: (sql: string) => Record<string, unknown>[],
    ): { connection: DbConnection; countOf: (needle: string) => number } {
      const calls: string[] = [];
      return {
        connection: {
          async query(sql: string) {
            calls.push(sql);
            return handler(sql);
          },
          async close() {},
        },
        countOf: (needle: string) => calls.filter((c) => c.includes(needle)).length,
      };
    }

    it("collects capabilities and table statistics exactly once even when no Batch A dimension is selected", async () => {
      const { connection, countOf } = countingConnection(() => []);
      const deps = fakeDeps({ adapterFor: fakeAdapterFor(connection) });
      const code = await run(
        { ...baseOptions, dimensions: ["schema"], url: "postgres://fake-host/db" },
        deps,
      );
      expect(code).toBe(0);
      expect(countOf("pg_catalog.pg_extension")).toBe(1);
      expect(countOf("pg_catalog.pg_available_extensions")).toBe(1);
      expect(countOf("pg_catalog.pg_settings")).toBe(1);
      expect(countOf("pg_stat_user_tables")).toBe(1);
    });

    it("threads extension states, the never-analyzed count, and *Unavailable reasons into the written snapshot", async () => {
      const { connection } = countingConnection((sql) => {
        if (sql.includes("pg_catalog.pg_settings")) {
          // track_counts/autovacuum both "on" so this test's own concern (the
          // gap channels below) is not obscured by the SCOPE-121 final fix
          // wave C3 counters-disabled / autovacuum-disabled-globally findings.
          return [
            { name: "shared_preload_libraries", setting: "pg_stat_statements" },
            { name: "track_counts", setting: "on" },
            { name: "autovacuum", setting: "on" },
          ];
        }
        return [];
      });
      let capturedSnapshot: Record<string, unknown> | undefined;
      const deps = fakeDeps({
        adapterFor: fakeAdapterFor(connection),
        writeReport: async (_dir, _report, snapshot): Promise<ReportPaths> => {
          capturedSnapshot = snapshot as Record<string, unknown>;
          return { reportPath: "x", latestPath: "y", snapshotPath: "z", latestUpdated: true };
        },
      });
      const code = await run(
        {
          ...baseOptions,
          dimensions: ["performance", "maintenance"],
          url: "postgres://fake-host/db",
        },
        deps,
      );
      expect(code).toBe(0);
      expect(capturedSnapshot).toBeDefined();
      // pg_stat_statements is in shared_preload_libraries but never installed
      // (no row in pg_extension) — "preloaded-not-created".
      expect(
        (capturedSnapshot!.capabilityExtensions as Record<string, string>).pg_stat_statements,
      ).toBe("preloaded-not-created");
      expect(capturedSnapshot!.neverAnalyzedCount).toBe(0);
      expect(capturedSnapshot!.statementsUnavailable).toMatch(/CREATE EXTENSION/i);
      // pgstattuple is neither preloaded nor installed nor available here.
      expect(capturedSnapshot!.bloatUnavailable).toMatch(/pgstattuple/i);
      // No BLOCKERS_SQL failure was scripted, so this gap channel is unset.
      expect(capturedSnapshot!.blockersUnavailable).toBeUndefined();
    });

    it("--deep raises probeDataHealth's size ceiling the same way it raises the orphan anti-join's row ceiling", async () => {
      const hugeTableRow = {
        table_name: "huge",
        seq_scan: 0, seq_tup_read: 0, idx_scan: 0,
        n_tup_ins: 0, n_tup_upd: 0, n_tup_del: 0,
        n_live_tup: 5, n_dead_tup: 0, n_ins_since_vacuum: 0,
        last_vacuum: null, last_autovacuum: null,
        last_analyze: "2026-08-01T00:00:00.000Z", last_autoanalyze: null,
        reltuples: 5, relpages: 1,
        // Above the 2 GB default ceiling, well below Number.MAX_SAFE_INTEGER.
        table_bytes: "3000000000", index_bytes: "0", toast_bytes: "0",
      };
      function hugeTableConnection(): { connection: DbConnection; countOf: (needle: string) => number } {
        return countingConnection((sql) => {
          if (sql.includes("atttypmod")) {
            return [
              { table_name: "huge", column_name: "id", sql_type: "uuid", not_null: true, has_default: true, is_primary_key: true },
            ];
          }
          if (sql.includes("pg_stat_user_tables")) return [hugeTableRow];
          if (sql.includes(`from "huge"`)) return [{ total: "5", nn_0: "5" }];
          return [];
        });
      }

      // Without --deep: the 3,000,000,000-byte table is above the 2 GB
      // default ceiling, so it is declined rather than scanned, and
      // analyzeData reports it as "not-profiled".
      const shallowConn = hugeTableConnection();
      let shallowReport: AnalysisReport | undefined;
      const shallowDeps = fakeDeps({
        adapterFor: fakeAdapterFor(shallowConn.connection),
        writeReport: async (_dir, report): Promise<ReportPaths> => {
          shallowReport = report;
          return { reportPath: "x", latestPath: "y", snapshotPath: "z", latestUpdated: true };
        },
      });
      const shallow = await run(
        { ...baseOptions, dimensions: ["data"], deep: false, url: "postgres://fake-host/db" },
        shallowDeps,
      );
      expect(shallow).toBe(0);
      expect(shallowReport?.findings.some((f) => f.rule === "not-profiled")).toBe(true);
      expect(shallowConn.countOf(`from "huge"`)).toBe(0);

      // With --deep: the same table is now under the raised ceiling
      // (Number.MAX_SAFE_INTEGER), so it IS profiled — the null-density
      // query runs and "not-profiled" does not fire for it.
      const deepConn = hugeTableConnection();
      let deepReport: AnalysisReport | undefined;
      const deepDeps = fakeDeps({
        adapterFor: fakeAdapterFor(deepConn.connection),
        writeReport: async (_dir, report): Promise<ReportPaths> => {
          deepReport = report;
          return { reportPath: "x", latestPath: "y", snapshotPath: "z", latestUpdated: true };
        },
      });
      const deep = await run(
        { ...baseOptions, dimensions: ["data"], deep: true, url: "postgres://fake-host/db" },
        deepDeps,
      );
      expect(deep).toBe(0);
      expect(deepReport?.findings.some((f) => f.rule === "not-profiled")).toBe(false);
      expect(deepConn.countOf(`from "huge"`)).toBe(1);
    });

    // ADDITION (SCOPE-121 final fix wave, LATEST-FILE — Important): run()
    // must pass `complete: true` only when every implemented dimension was
    // selected — a `--dimension`-filtered run must pass `complete: false` so
    // `writeReport` does not overwrite `latest.md` with a partial slice.
    it("passes complete=true to writeReport for the full default dimension set", async () => {
      const { connection } = countingConnection((sql) =>
        sql.includes("pg_catalog.pg_settings")
          ? [
              { name: "track_counts", setting: "on" },
              { name: "autovacuum", setting: "on" },
            ]
          : [],
      );
      let capturedComplete: boolean | undefined;
      const deps = fakeDeps({
        adapterFor: fakeAdapterFor(connection),
        writeReport: async (_dir, _report, _snapshot, complete): Promise<ReportPaths> => {
          capturedComplete = complete;
          return { reportPath: "x", latestPath: "y", snapshotPath: "z", latestUpdated: complete };
        },
      });
      const code = await run(
        {
          ...baseOptions,
          dimensions: ["schema", "integrity", "data", "performance", "maintenance"],
          url: "postgres://fake-host/db",
        },
        deps,
      );
      expect(code).toBe(0);
      expect(capturedComplete).toBe(true);
    });

    it("passes complete=false to writeReport for a filtered dimension selection", async () => {
      const { connection } = countingConnection((sql) =>
        sql.includes("pg_catalog.pg_settings")
          ? [
              { name: "track_counts", setting: "on" },
              { name: "autovacuum", setting: "on" },
            ]
          : [],
      );
      let capturedComplete: boolean | undefined;
      const deps = fakeDeps({
        adapterFor: fakeAdapterFor(connection),
        writeReport: async (_dir, _report, _snapshot, complete): Promise<ReportPaths> => {
          capturedComplete = complete;
          return { reportPath: "x", latestPath: "y", snapshotPath: "z", latestUpdated: complete };
        },
      });
      const code = await run(
        { ...baseOptions, dimensions: ["maintenance"], url: "postgres://fake-host/db" },
        deps,
      );
      expect(code).toBe(0);
      expect(capturedComplete).toBe(false);
    });

    // ADDITION (SCOPE-121 final fix wave, C3 — CRITICAL): capabilities must
    // actually reach analyzePerformance/analyzeMaintenance through run(), not
    // only be collected and left unused.
    it("threads capabilities through to analyzeMaintenance so a globally disabled autovacuum is reported", async () => {
      const { connection } = countingConnection((sql) => {
        if (sql.includes("pg_catalog.pg_settings")) {
          return [{ name: "autovacuum", setting: "off" }];
        }
        return [];
      });
      let capturedReport: AnalysisReport | undefined;
      const deps = fakeDeps({
        adapterFor: fakeAdapterFor(connection),
        writeReport: async (_dir, report): Promise<ReportPaths> => {
          capturedReport = report;
          return { reportPath: "x", latestPath: "y", snapshotPath: "z", latestUpdated: true };
        },
      });
      const code = await run(
        { ...baseOptions, dimensions: ["maintenance"], url: "postgres://fake-host/db" },
        deps,
      );
      expect(code).toBe(1); // autovacuum-disabled-globally is critical
      expect(
        capturedReport?.findings.some((f) => f.rule === "autovacuum-disabled-globally"),
      ).toBe(true);
    });
  });
  // [SCOPE 121 / T022] END
});
