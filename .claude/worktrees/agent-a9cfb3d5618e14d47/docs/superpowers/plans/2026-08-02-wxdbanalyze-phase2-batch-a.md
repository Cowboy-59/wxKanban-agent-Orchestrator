# wxDBAnalyze Phase 2 Batch A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add dimensions 3 (data health), 5 (performance & index strategy) and 6 (maintenance & bloat) to the wxDBAnalyze PostgreSQL adapter — the three that follow up what Phase 1 found.

**Architecture:** Same split Phase 1 proved: `engines/postgres/*.ts` collects (engine-specific SQL, read-only), `dimensions/*.ts` analyses (pure, produces contract-complete `Finding`s). One shared statistics module serves all three dimensions, because `pg_stat_user_tables` answers questions for each of them in a single pass.

**Tech Stack:** TypeScript (ESM), `tsx`, Vitest, `postgres` (postgres-js) via the existing read-only guard.

## Global Constraints

- **TypeScript 100%.** No `any`, no `@ts-ignore`. `npm run typecheck:dbanalyze` must exit 0.
- **`pg_catalog` and `pg_stat_*` only, never `information_schema`** — it is privilege-filtered, so a least-privilege role sees a truncated list and every unseen object reads as missing.
- **Read-only by construction.** All collection runs through `createReadOnlyConnection`, which sets and independently verifies `default_transaction_read_only` on a single pinned socket.
- **Every finding satisfies the contract** in `core/finding.ts`: all nine fields, `dimension` from the valid set, severity and urgency from theirs. Each dimension's test suite must assert `validateFinding(f) === []` for **every** finding produced and pin the full rule set with `toEqual(new Set([...]))`.
- **THE CENTRAL CONSTRAINT OF THIS BATCH — statistics-unavailable is not health.** 88 of this database's 129 public tables have never been analyzed. Every metric these dimensions read (`seq_scan`, `idx_scan`, `n_live_tup`, `n_dead_tup`, bloat estimates) is either absent or meaningless for those tables. A table with no statistics must never produce a finding that reads as "fine", and must never be silently omitted. It gets an explicit *unknown* state, exactly as Phase 1's `RowCountEstimate` did for `reltuples = -1`.
- **Expensive probes are bounded and their skips are recorded.** Follow `probeIntegrity`'s precedent: a probe that did not run yields `null` plus a populated reason string, never `0`.
- **Code fences.** Every top-level declaration carries `// [SCOPE 121 / Tnnn] BEGIN — …` / `// [SCOPE 121 / Tnnn] END`, numbered per this plan's task numbers, continuing from Phase 1's T014 — so this batch uses **T015 onward**.
- **No git.** The operator runs git themselves. Skip every commit step.
- **Live verification commands** must begin with `import('dotenv/config')` and are best run as a scratch `.mjs` file at the repo root, deleted afterwards — inline `npx tsx -e` one-liners proved fragile on this shell.

## Facts about the target database, measured 2026-08-02

These are load-bearing; several tasks depend on them.

| Fact | Value | Consequence |
|---|---|---|
| Server version | PostgreSQL 15.17 | `pg_stat_user_tables` has `n_ins_since_vacuum`; no `pg_stat_io` (PG16+) |
| `shared_preload_libraries` | includes `pg_stat_statements` | The library is loaded and **already collecting** |
| `pg_extension` | `plpgsql`, `vector` only | `pg_stat_statements` is **NOT created**, so its view is unreadable |
| Available, not installed | `pg_stat_statements`, `pgstattuple`, `pg_buffercache`, `pgaudit` | Bloat must be **estimated**, not measured |
| Tables in `public` | 129 | An earlier count of 259 was measured across ALL schemas and was wrong |
| **Never analyzed (`public`)** | **88 of 129** | Statistics-derived metrics are unavailable for 68% of tables |
| Leftover schema | `wxktest_119_6f0ff`, 130 tables, 4.2 MB | A wxPreTest clone never torn down. All 130 never analyzed — this is what inflated the earlier 259/218 figures |
| Tables with >1000 dead tuples | 0 | Plausibly real, but unreliable while stats are missing |
| `track_counts` / `track_io_timing` | on / on | Scan counts and I/O timing are being collected |
| `autovacuum` | on | |
| `max_connections` | 1500 | |

---

## Design coverage — what this batch does and does not implement

Checked against the design's §4.3, §4.5 and §4.6. Anything the design lists that is not built here is deferred **with a reason**, so a reader of the report can tell a deliberate omission from an oversight.

| Design item | Batch A | Where / why |
|---|---|---|
| Row counts, exact and estimated | ✅ | T16 exact `count(*)`; T15 carries the planner estimate |
| Per-column NULL density | ✅ | T16 |
| All-NULL (dead) columns | ✅ | T16 / T17 |
| Empty and never-written tables | ✅ | T16 / T17 |
| Table, index and TOAST sizes | ✅ | T15 |
| Query statistics ranked by time | ⚠️ partial | T18 collects them **if** the extension exists; on this database it does not, and T19 reports that as `no-statement-stats` with the `CREATE EXTENSION` remedy |
| Sequential-scan to index-scan ratio | ✅ | T19 |
| Unused, duplicate and invalid indexes | ✅ | T19 |
| Foreign keys with no supporting index | ✅ already shipped | Dimension 2, Phase 1 (`integrity.unindexed-fk`, 101 live findings) |
| Dead-tuple ratios | ✅ | T21 |
| Vacuum / analyze recency, per-table overrides | ✅ | T20 / T21 |
| Transaction-ID wraparound headroom | ✅ | T20 / T21 |
| Long transactions and replication slots pinning vacuum | ✅ | T20 / T21 |
| **Duplicate rows on natural keys** | ❌ deferred | Identifying a natural key needs dimension 4 (conventions) — a column that *should* be unique but carries no unique constraint is invisible to the catalog. Batch B. |
| **UUID v4-vs-v7 conformance** | ❌ deferred | This is a conformance check against a declared project convention, so it belongs with dimension 4, not data health. Batch B. |
| **`max(createdat)` staleness** | ❌ deferred | Requires knowing which column is the creation timestamp — again a convention question. Batch B, alongside dimension 4. |
| **Cache hit ratios** | ❌ deferred | `pg_statio_user_tables` makes this cheap and it is worth doing; it is left out only to keep Batch A to three dimensions. Batch B. |
| **`EXPLAIN` on the worst statements** | ❌ deferred | There are no worst statements to explain until `pg_stat_statements` is created. Blocked on the finding T19 raises. |
| **Checkpoint and bgwriter pressure** | ❌ deferred | Instance-level rather than schema-level; sits more naturally with dimension 8 (availability). Batch B. |
| **Bloat estimates** | ❌ not reported | Measuring needs `pgstattuple` (absent); estimating needs table statistics, which 84% of this database lacks. T20/T21 surface the gap as a finding rather than fill it with a fabricated number. |
| **Size trending across runs** | ❌ deferred | Phase 1 already retains a snapshot JSON per run, so this becomes possible once two runs exist to compare. Not implementable on a first run. |

---

## File Structure

```text
_wxAI/skills/wxDBAnalyze/scripts/
  engines/postgres/
    capabilities.ts     extension + setting detection (T015)
    stats.ts            one-pass pg_stat_user_tables + size collection (T015)
    data.ts             dimension 3 collection (T016)
    performance.ts      dimension 5 collection (T018)
    maintenance.ts      dimension 6 collection (T020)
  dimensions/
    data.ts             dimension 3 analysis (T017)
    performance.ts      dimension 5 analysis (T019)
    maintenance.ts      dimension 6 analysis (T021)
  core/
    metrics.ts          the shared unknown-vs-value type + helpers (T015)
```

**Responsibility boundary, unchanged from Phase 1:** `core/` is engine-neutral with no database imports; `engines/` is the only place that speaks a dialect; `dimensions/` is pure analysis over normalised input and must be testable with zero I/O.

---

## Task 15: Capability detection, shared statistics, and the unknown type

**Files:**
- Create: `_wxAI/skills/wxDBAnalyze/scripts/core/metrics.ts`
- Create: `_wxAI/skills/wxDBAnalyze/scripts/engines/postgres/capabilities.ts`
- Create: `_wxAI/skills/wxDBAnalyze/scripts/engines/postgres/stats.ts`
- Test: `tests/wxdbanalyze/metrics.test.ts`
- Test: `tests/wxdbanalyze/pg-capabilities.test.ts`
- Test: `tests/wxdbanalyze/pg-stats.test.ts`

**Interfaces:**
- Consumes: `DbConnection` from `core/engine.js`
- Produces: `Measured<T>`, `UNKNOWN`, `isKnown`, `describeMeasured` from `core/metrics.js`; `PgCapabilities`, `ExtensionState`, `collectCapabilities(conn)` from `engines/postgres/capabilities.js`; `TableStats`, `StatsSnapshot`, `collectTableStats(conn)`, `TABLE_STATS_SQL` from `engines/postgres/stats.js`

All three dimensions read the same statistics, so they are collected once. The unknown type is shared because every dimension needs to distinguish "measured zero" from "never measured".

- [ ] **Step 1: Write the failing metrics test**

```ts
// tests/wxdbanalyze/metrics.test.ts
import { describe, expect, it } from "vitest";
import {
  UNKNOWN,
  describeMeasured,
  isKnown,
  type Measured,
} from "../../_wxAI/skills/wxDBAnalyze/scripts/core/metrics.js";

describe("Measured", () => {
  it("treats a real zero as known", () => {
    const v: Measured<number> = 0;
    expect(isKnown(v)).toBe(true);
  });

  it("treats UNKNOWN as not known", () => {
    expect(isKnown(UNKNOWN)).toBe(false);
  });

  it("renders a known value with its unit", () => {
    expect(describeMeasured(1234, (n) => `${n} rows`)).toBe("1234 rows");
  });

  it("renders unknown as an explicit statement, never as a number", () => {
    const text = describeMeasured(UNKNOWN, (n) => `${n} rows`);
    expect(text).toMatch(/unknown/i);
    expect(text).not.toMatch(/\d/);
  });

  it("never renders unknown as zero", () => {
    expect(describeMeasured(UNKNOWN, (n) => `${n} rows`)).not.toContain("0");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/wxdbanalyze/metrics.test.ts`
Expected: FAIL — cannot resolve `core/metrics.js`.

- [ ] **Step 3: Write `core/metrics.ts`**

```ts
// _wxAI/skills/wxDBAnalyze/scripts/core/metrics.ts

// [SCOPE 121 / T015] BEGIN — Measured-or-unknown metric type
/**
 * The sentinel for a metric that was never measured.
 *
 * This exists because 218 of this database's 259 tables have never been
 * analyzed, so most statistics are absent rather than zero. Collapsing the two
 * would let "nobody has ever looked at this table" render as "this table is
 * fine" — the failure this whole design is built against.
 */
export const UNKNOWN = "unknown" as const;

export type Measured<T> = T | typeof UNKNOWN;

export function isKnown<T>(value: Measured<T>): value is T {
  return value !== UNKNOWN;
}

/**
 * Render a metric for operator-facing prose. An unknown metric renders as a
 * sentence saying so and MUST NOT contain a digit — a reader skimming for
 * numbers must not mistake it for a measurement.
 */
export function describeMeasured<T>(
  value: Measured<T>,
  format: (known: T) => string,
): string {
  return isKnown(value)
    ? format(value)
    : "unknown (this table has never been analyzed, so no statistics exist)";
}
// [SCOPE 121 / T015] END
```

- [ ] **Step 4: Write the failing capabilities test**

```ts
// tests/wxdbanalyze/pg-capabilities.test.ts
import { describe, expect, it } from "vitest";
import { collectCapabilities } from "../../_wxAI/skills/wxDBAnalyze/scripts/engines/postgres/capabilities.js";

function conn(rows: Record<string, Record<string, unknown>[]>) {
  return {
    async query(sql: string) {
      const key = Object.keys(rows).find((k) => sql.includes(k));
      return key ? rows[key]! : [];
    },
    async close() {},
  };
}

describe("collectCapabilities", () => {
  it("reports an extension that is installed", async () => {
    const c = await collectCapabilities(
      conn({
        pg_extension: [{ extname: "pg_stat_statements" }],
        pg_available_extensions: [{ name: "pg_stat_statements" }],
        pg_settings: [],
      }),
    );
    expect(c.extensions.pg_stat_statements).toBe("installed");
  });

  it("distinguishes preloaded-but-not-created from simply absent", async () => {
    const c = await collectCapabilities(
      conn({
        pg_extension: [{ extname: "plpgsql" }],
        pg_available_extensions: [
          { name: "pg_stat_statements" },
          { name: "pgstattuple" },
        ],
        pg_settings: [
          { name: "shared_preload_libraries", setting: "rdsutils,pg_stat_statements,rds_casts" },
        ],
      }),
    );
    // Loaded by the server and already collecting, but no CREATE EXTENSION.
    expect(c.extensions.pg_stat_statements).toBe("preloaded-not-created");
    // Available to install, but not loaded and not collecting.
    expect(c.extensions.pgstattuple).toBe("available-not-installed");
  });

  it("reports an extension that is neither installed nor available", async () => {
    const c = await collectCapabilities(
      conn({ pg_extension: [], pg_available_extensions: [], pg_settings: [] }),
    );
    expect(c.extensions.pgaudit).toBe("unavailable");
  });

  it("captures the settings the later dimensions read", async () => {
    const c = await collectCapabilities(
      conn({
        pg_extension: [],
        pg_available_extensions: [],
        pg_settings: [
          { name: "autovacuum", setting: "on" },
          { name: "track_counts", setting: "on" },
          { name: "server_version_num", setting: "150017" },
        ],
      }),
    );
    expect(c.settings.autovacuum).toBe("on");
    expect(c.settings.track_counts).toBe("on");
    expect(c.serverVersionNum).toBe(150017);
  });
});
```

- [ ] **Step 5: Write `engines/postgres/capabilities.ts`**

```ts
// _wxAI/skills/wxDBAnalyze/scripts/engines/postgres/capabilities.ts
import type { DbConnection } from "../../core/engine.js";

// [SCOPE 121 / T015] BEGIN — Capability detection
/**
 * `preloaded-not-created` is the state that matters and the reason this is a
 * four-value union rather than a boolean.
 *
 * On this database `pg_stat_statements` sits in `shared_preload_libraries`, so
 * the server has been collecting query statistics all along — but nobody ran
 * `CREATE EXTENSION`, so the view does not exist and nothing can read them.
 * Reporting that as "unavailable" would hide a one-statement fix that unlocks
 * data already being gathered.
 */
export type ExtensionState =
  | "installed"
  | "preloaded-not-created"
  | "available-not-installed"
  | "unavailable";

/** Extensions this tool can make use of, and reports on when absent. */
export const TRACKED_EXTENSIONS = [
  "pg_stat_statements",
  "pgstattuple",
  "pg_buffercache",
  "pgaudit",
] as const;

export type TrackedExtension = (typeof TRACKED_EXTENSIONS)[number];

/** Settings the later dimensions read. */
export const TRACKED_SETTINGS = [
  "autovacuum",
  "track_counts",
  "track_io_timing",
  "max_connections",
  "shared_preload_libraries",
  "server_version_num",
  "autovacuum_vacuum_scale_factor",
  "autovacuum_analyze_scale_factor",
  "autovacuum_vacuum_threshold",
  "autovacuum_analyze_threshold",
] as const;

export interface PgCapabilities {
  extensions: Record<TrackedExtension, ExtensionState>;
  settings: Record<string, string>;
  serverVersionNum: number;
}

export const EXTENSIONS_SQL = `select extname from pg_catalog.pg_extension`;
export const AVAILABLE_SQL = `select name from pg_catalog.pg_available_extensions`;
export const SETTINGS_SQL = `select name, setting from pg_catalog.pg_settings`;

export async function collectCapabilities(
  connection: DbConnection,
): Promise<PgCapabilities> {
  const installed = new Set(
    (await connection.query(EXTENSIONS_SQL)).map((r) => String(r.extname)),
  );
  const available = new Set(
    (await connection.query(AVAILABLE_SQL)).map((r) => String(r.name)),
  );

  const settings: Record<string, string> = {};
  for (const row of await connection.query(SETTINGS_SQL)) {
    const name = String(row.name);
    if ((TRACKED_SETTINGS as readonly string[]).includes(name)) {
      settings[name] = String(row.setting);
    }
  }

  const preloaded = (settings.shared_preload_libraries ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const extensions = {} as Record<TrackedExtension, ExtensionState>;
  for (const ext of TRACKED_EXTENSIONS) {
    extensions[ext] = installed.has(ext)
      ? "installed"
      : preloaded.includes(ext)
        ? "preloaded-not-created"
        : available.has(ext)
          ? "available-not-installed"
          : "unavailable";
  }

  return {
    extensions,
    settings,
    serverVersionNum: Number(settings.server_version_num ?? 0),
  };
}
// [SCOPE 121 / T015] END
```

- [ ] **Step 6: Write the failing stats test**

```ts
// tests/wxdbanalyze/pg-stats.test.ts
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
```

- [ ] **Step 7: Write `engines/postgres/stats.ts`**

```ts
// _wxAI/skills/wxDBAnalyze/scripts/engines/postgres/stats.ts
import type { DbConnection } from "../../core/engine.js";
import { UNKNOWN, type Measured } from "../../core/metrics.js";

// [SCOPE 121 / T015] BEGIN — Table statistics types
export interface TableStats {
  name: string;
  /** False when neither last_analyze nor last_autoanalyze is set. */
  everAnalyzed: boolean;
  /** Activity counters — real measurements, independent of ANALYZE. */
  seqScan: number;
  seqTupRead: number;
  idxScan: number;
  inserts: number;
  updates: number;
  deletes: number;
  insertsSinceVacuum: number;
  /** ANALYZE-derived — UNKNOWN when the table has never been analyzed. */
  liveTuples: Measured<number>;
  deadTuples: Measured<number>;
  rowEstimate: Measured<number>;
  pages: Measured<number>;
  lastVacuum: string | null;
  lastAutovacuum: string | null;
  lastAnalyze: string | null;
  lastAutoanalyze: string | null;
  /** Sizes are always measurable — they come from the file system, not stats. */
  tableBytes: number;
  indexBytes: number;
  toastBytes: number;
}

export interface StatsSnapshot {
  tables: Map<string, TableStats>;
  neverAnalyzed: string[];
}
// [SCOPE 121 / T015] END

// [SCOPE 121 / T015] BEGIN — Table statistics collection
/**
 * One pass serving all three Batch A dimensions: scan ratios for performance,
 * dead tuples and vacuum ages for maintenance, live counts and sizes for data
 * health.
 *
 * pg_catalog and pg_stat_*, never information_schema — the latter is
 * privilege-filtered and would silently truncate the table list for a
 * least-privilege role.
 */
export const TABLE_STATS_SQL = `
  select
    st.relname                              as table_name,
    st.seq_scan, st.seq_tup_read, st.idx_scan,
    st.n_tup_ins, st.n_tup_upd, st.n_tup_del,
    st.n_live_tup, st.n_dead_tup, st.n_ins_since_vacuum,
    st.last_vacuum, st.last_autovacuum, st.last_analyze, st.last_autoanalyze,
    c.reltuples, c.relpages,
    pg_catalog.pg_table_size(c.oid)         as table_bytes,
    pg_catalog.pg_indexes_size(c.oid)       as index_bytes,
    coalesce(pg_catalog.pg_total_relation_size(c.reltoastrelid), 0) as toast_bytes
  from pg_catalog.pg_stat_user_tables st
  join pg_catalog.pg_class c on c.oid = st.relid
  where st.schemaname = 'public'
  order by st.relname`;

function num(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function text(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

export async function collectTableStats(
  connection: DbConnection,
): Promise<StatsSnapshot> {
  const tables = new Map<string, TableStats>();
  const neverAnalyzed: string[] = [];

  for (const r of await connection.query(TABLE_STATS_SQL)) {
    const name = String(r.table_name);
    const lastAnalyze = text(r.last_analyze);
    const lastAutoanalyze = text(r.last_autoanalyze);
    const everAnalyzed = lastAnalyze !== null || lastAutoanalyze !== null;
    if (!everAnalyzed) neverAnalyzed.push(name);

    // Tuple counts and the planner's row estimate are products of ANALYZE.
    // Without it they are absent, not zero — reporting 0 live rows for an
    // unanalyzed table would understate every severity that reads it.
    const analyzed = <T>(value: T): Measured<T> =>
      everAnalyzed ? value : UNKNOWN;

    tables.set(name, {
      name,
      everAnalyzed,
      seqScan: num(r.seq_scan),
      seqTupRead: num(r.seq_tup_read),
      idxScan: num(r.idx_scan),
      inserts: num(r.n_tup_ins),
      updates: num(r.n_tup_upd),
      deletes: num(r.n_tup_del),
      insertsSinceVacuum: num(r.n_ins_since_vacuum),
      liveTuples: analyzed(num(r.n_live_tup)),
      deadTuples: analyzed(num(r.n_dead_tup)),
      rowEstimate: analyzed(num(r.reltuples)),
      pages: analyzed(num(r.relpages)),
      lastVacuum: text(r.last_vacuum),
      lastAutovacuum: text(r.last_autovacuum),
      lastAnalyze,
      lastAutoanalyze,
      tableBytes: num(r.table_bytes),
      indexBytes: num(r.index_bytes),
      toastBytes: num(r.toast_bytes),
    });
  }

  return { tables, neverAnalyzed };
}
// [SCOPE 121 / T015] END
```

- [ ] **Step 8: Run all three suites and the typecheck**

Run: `npx vitest run tests/wxdbanalyze/metrics.test.ts tests/wxdbanalyze/pg-capabilities.test.ts tests/wxdbanalyze/pg-stats.test.ts && npm run typecheck:dbanalyze`
Expected: 15 tests PASS, typecheck exits 0.

- [ ] **Step 9: Verify against the live catalog**

Write a scratch file at the repo root, run it, delete it:

```js
// wxdb-t15-tmp.mjs
import "dotenv/config";
const { createReadOnlyConnection } = await import("./_wxAI/skills/wxDBAnalyze/scripts/engines/postgres/connect.js");
const { collectCapabilities } = await import("./_wxAI/skills/wxDBAnalyze/scripts/engines/postgres/capabilities.js");
const { collectTableStats } = await import("./_wxAI/skills/wxDBAnalyze/scripts/engines/postgres/stats.js");
const c = await createReadOnlyConnection(process.env.DATABASE_URL);
try {
  const caps = await collectCapabilities(c);
  console.log("extensions:", caps.extensions);
  console.log("server:", caps.serverVersionNum);
  const s = await collectTableStats(c);
  console.log("tables:", s.tables.size, "never analyzed:", s.neverAnalyzed.length);
  const t = s.tables.get("projecttasks");
  console.log("projecttasks:", { everAnalyzed: t?.everAnalyzed, seq: t?.seqScan, idx: t?.idxScan, live: t?.liveTuples, bytes: t?.tableBytes });
} finally { await c.close(); }
```

Run with `npx tsx wxdb-t15-tmp.mjs`, then delete the file.

Expected: `pg_stat_statements` reports `preloaded-not-created`; `pgstattuple` reports `available-not-installed`; the table count is around 259 with roughly 218 never analyzed. Quote the real numbers in your report — if the never-analyzed count is not close to 218, say so rather than moving on.

---

## Task 16: Dimension 3 — data health collection

**Files:**
- Create: `_wxAI/skills/wxDBAnalyze/scripts/engines/postgres/data.ts`
- Test: `tests/wxdbanalyze/pg-data-collect.test.ts`

**Interfaces:**
- Consumes: `DbConnection` (`core/engine.js`), `quoteIdent` (`core/identifiers.js`), `StatsSnapshot` (`engines/postgres/stats.js`), `Measured`/`UNKNOWN` (`core/metrics.js`), `LiveSchema` (`engines/postgres/schema.js`)
- Produces: `ColumnProfile`, `TableProfile`, `DataSnapshot`, `DataProbeOptions`, `buildNullDensityQuery(table, columns)`, `probeDataHealth(conn, live, stats, options?)`

Column profiling is the expensive part — a full scan per table. It is bounded by size, and every table it declines to profile is recorded with a reason, exactly as `probeIntegrity` does.

- [ ] **Step 1: Write the failing test**

```ts
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
    expect(snap.tables.get("customers")!.skipped).toMatch(/permission denied/);
    // The failure must not take the rest of the run down with it.
    expect(snap.tables.get("projects")).toBeDefined();
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
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/wxdbanalyze/pg-data-collect.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `engines/postgres/data.ts`**

```ts
// _wxAI/skills/wxDBAnalyze/scripts/engines/postgres/data.ts
import type { DbConnection } from "../../core/engine.js";
import { quoteIdent } from "../../core/identifiers.js";
import { UNKNOWN, type Measured } from "../../core/metrics.js";
import type { LiveSchema } from "./schema.js";
import type { StatsSnapshot } from "./stats.js";

// [SCOPE 121 / T016] BEGIN — Data health types
export interface ColumnProfile {
  name: string;
  sqlType: string;
  nonNullCount: number;
  nullFraction: number;
  allNull: boolean;
}

export interface TableProfile {
  name: string;
  /** Exact count(*), or UNKNOWN when the table was not profiled. */
  rowCount: Measured<number>;
  columns: ColumnProfile[];
  tableBytes: number;
  everAnalyzed: boolean;
  skipped?: string;
}

export interface DataSnapshot {
  tables: Map<string, TableProfile>;
}

export interface DataProbeOptions {
  /** Tables larger than this are not profiled. Default 2 GB. */
  maxTableBytes?: number;
}
// [SCOPE 121 / T016] END

// [SCOPE 121 / T016] BEGIN — Data health query construction
/**
 * One pass per table: total rows plus a non-null count per column.
 *
 * Columns are aliased positionally (`nn_0`, `nn_1`, …) rather than by name,
 * because a column name that is a valid identifier is not necessarily a
 * distinct result alias once case-folded, and a collision would silently
 * overwrite one column's profile with another's.
 */
export function buildNullDensityQuery(
  table: string,
  columns: readonly string[],
): string {
  if (columns.length === 0) return "";
  const counts = columns
    .map((c, i) => `count(${quoteIdent(c)})::bigint as nn_${i}`)
    .join(", ");
  return `select count(*)::bigint as total, ${counts} from ${quoteIdent(table)}`;
}
// [SCOPE 121 / T016] END

// [SCOPE 121 / T016] BEGIN — Data health probing
const DEFAULT_MAX_TABLE_BYTES = 2_000_000_000;

/**
 * Profile every table's row count and per-column null density.
 *
 * Expensive by construction — a sequential scan per table — so it is bounded by
 * size and every decline is RECORDED. A table that reads as clean because it
 * was never examined is the failure mode this tool exists to prevent, so
 * `rowCount` becomes UNKNOWN and `skipped` explains why; it never becomes 0.
 */
export async function probeDataHealth(
  connection: DbConnection,
  live: LiveSchema,
  stats: StatsSnapshot,
  options: DataProbeOptions = {},
): Promise<DataSnapshot> {
  const ceiling = options.maxTableBytes ?? DEFAULT_MAX_TABLE_BYTES;
  const tables = new Map<string, TableProfile>();

  for (const [name, liveTable] of live.tables) {
    const stat = stats.tables.get(name);
    const tableBytes = stat?.tableBytes ?? 0;
    const base: TableProfile = {
      name,
      rowCount: UNKNOWN,
      columns: [],
      tableBytes,
      everAnalyzed: stat?.everAnalyzed ?? false,
    };

    if (tableBytes > ceiling) {
      tables.set(name, {
        ...base,
        skipped:
          `not profiled: ${name} holds ${tableBytes} bytes, above the ` +
          `${ceiling}-byte ceiling for a full scan. Re-run with --deep to profile it.`,
      });
      continue;
    }

    const columnNames = liveTable.columns.map((c) => c.name);
    const query = buildNullDensityQuery(name, columnNames);
    if (query === "") {
      tables.set(name, { ...base, rowCount: 0 });
      continue;
    }

    try {
      const rows = await connection.query(query);
      const total = Number(rows[0]?.total ?? 0);
      if (total === 0) {
        tables.set(name, { ...base, rowCount: 0, columns: [] });
        continue;
      }

      const columns: ColumnProfile[] = columnNames.map((cname, i) => {
        const nonNullCount = Number(rows[0]?.[`nn_${i}`] ?? 0);
        return {
          name: cname,
          sqlType:
            liveTable.columns.find((c) => c.name === cname)?.sqlType ?? "unknown",
          nonNullCount,
          nullFraction: (total - nonNullCount) / total,
          allNull: nonNullCount === 0,
        };
      });

      tables.set(name, { ...base, rowCount: total, columns });
    } catch (error) {
      tables.set(name, {
        ...base,
        skipped: `profile failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
    }
  }

  return { tables };
}
// [SCOPE 121 / T016] END
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run tests/wxdbanalyze/pg-data-collect.test.ts && npm run typecheck:dbanalyze`
Expected: 9 tests PASS, typecheck exits 0.

**Scope note for dimension 3.** The design lists duplicate detection on natural keys. It is **deliberately deferred to Batch B**, because identifying a natural key requires the conventions dimension — a column that *should* be unique but carries no unique constraint cannot be recognised from the catalog alone. Do not half-implement it here. Say so in the report so the omission is on the record rather than silently absent.

---

## Task 17: Dimension 3 — data health analysis

**Files:**
- Create: `_wxAI/skills/wxDBAnalyze/scripts/dimensions/data.ts`
- Test: `tests/wxdbanalyze/dimension-data.test.ts`

**Interfaces:**
- Consumes: `DataSnapshot`, `TableProfile`, `ColumnProfile` (`engines/postgres/data.js`), `Finding` (`core/finding.js`), `isKnown`/`describeMeasured` (`core/metrics.js`), `quoteIdent` (`core/identifiers.js`)
- Produces: `analyzeData(snapshot: DataSnapshot): Finding[]`

Pure. Rule ids: `data.empty-table`, `data.all-null-column`, `data.high-null-density`, `data.not-profiled`.

- [ ] **Step 1: Write the failing test**

```ts
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
        profile({ name: "huge", rowCount: UNKNOWN, skipped: "above the ceiling" }),
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
        profile({ name: "huge", rowCount: UNKNOWN, skipped: "above the ceiling" }),
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

  it("surfaces an unprofiled table so it cannot read as clean", () => {
    const f = analyzeData(
      snap([profile({ name: "huge", rowCount: UNKNOWN, skipped: "above the ceiling" })]),
    )[0]!;
    expect(f.id).toBe("data.not-profiled.huge");
    expect(f.observation).toMatch(/above the ceiling/);
    expect(f.whyItNeedsChanging).toMatch(/unverified|not.*examin/i);
    expect(f.severity).toBe("info");
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
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/wxdbanalyze/dimension-data.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `dimensions/data.ts`**

```ts
// _wxAI/skills/wxDBAnalyze/scripts/dimensions/data.ts
import type { Finding, Remediation } from "../core/finding.js";
import { isKnown } from "../core/metrics.js";
import type { ColumnProfile, DataSnapshot, TableProfile } from "../engines/postgres/data.js";

// [SCOPE 121 / T017] BEGIN — Data health remediation
const MANUAL: Remediation = {
  statements: [],
  fixClass: "manual-only",
  lockClass: "n/a — no statement is generated",
  estimatedDuration: "n/a",
  rollback: "n/a",
};

const NONE: Remediation = { ...MANUAL, fixClass: "none" };

/**
 * A column is "mostly empty" above this fraction. Deliberately high: a nullable
 * column being half unused is ordinary, and flagging it would bury the columns
 * that are genuinely dead. Qualify it by workload before acting.
 */
const HIGH_NULL_FRACTION = 0.95;
// [SCOPE 121 / T017] END

// [SCOPE 121 / T017] BEGIN — Data health findings
function emptyTable(t: TableProfile): Finding {
  return {
    id: `data.empty-table.${t.name}`,
    dimension: "data",
    rule: "empty-table",
    subject: t.name,
    observation: `${t.name} exists and holds no rows (${t.tableBytes} bytes allocated).`,
    evidence: {
      query: `select count(*) from "${t.name}"`,
      rows: [{ table: t.name, rows: 0, bytes: t.tableBytes }],
    },
    whyItNeedsChanging:
      "An empty table is either a feature that was never used, a table whose " +
      "writes go somewhere else than intended, or scaffolding left behind. All " +
      "three are worth knowing, and none is distinguishable from the catalog " +
      "alone — the table looks identical in each case.",
    businessImpact:
      "None directly. The cost is that a reader of the schema cannot tell " +
      "whether this table is pending, abandoned, or silently broken.",
    severity: "low",
    urgency: "deferred",
    remediation: MANUAL,
    fixRisk:
      "Dropping an unused table is destructive and irreversible; confirm no " +
      "code path writes to it before considering that.",
    doingNothing:
      "The table stays as an unexplained entry in the schema. No runtime cost.",
    confidence: "proven",
  };
}

function allNullColumn(t: TableProfile, c: ColumnProfile, rows: number): Finding {
  return {
    id: `data.all-null-column.${t.name}.${c.name}`,
    dimension: "data",
    rule: "all-null-column",
    subject: `${t.name}.${c.name}`,
    observation:
      `${t.name}.${c.name} (${c.sqlType}) is null in all ${rows} rows — no row ` +
      "has ever carried a value.",
    evidence: {
      query: `select count("${c.name}") from "${t.name}"`,
      rows: [{ table: t.name, column: c.name, rows, non_null: 0 }],
    },
    whyItNeedsChanging:
      `Across ${rows} rows nothing has ever written ${c.name}. Either the code ` +
      "path that populates it is dead, or it writes to a different column than " +
      "the one intended — a mistake that produces no error, because writing to " +
      "the wrong nullable column and never writing at all look identical here.",
    businessImpact:
      "If the column is meant to hold data, a feature is silently not working. " +
      "If it is genuinely unused, it is storage and schema noise.",
    severity: "medium",
    urgency: "scheduled",
    remediation: MANUAL,
    fixRisk:
      "Dropping the column is destructive. Confirm first whether the intended " +
      "writer exists — an all-null column is evidence of a bug at least as " +
      "often as it is evidence of dead weight.",
    doingNothing:
      "If a writer was supposed to exist, it keeps not existing, and nothing " +
      "will surface that fact.",
    confidence: "proven",
  };
}

function highNullDensity(t: TableProfile, c: ColumnProfile, rows: number): Finding {
  const pct = (c.nullFraction * 100).toFixed(1);
  return {
    id: `data.high-null-density.${t.name}.${c.name}`,
    dimension: "data",
    rule: "high-null-density",
    subject: `${t.name}.${c.name}`,
    observation:
      `${t.name}.${c.name} is null in ${pct}% of ${rows} rows ` +
      `(${c.nonNullCount} populated).`,
    evidence: {
      query: `select count("${c.name}") from "${t.name}"`,
      rows: [{ table: t.name, column: c.name, rows, non_null: c.nonNullCount, null_fraction: c.nullFraction }],
    },
    whyItNeedsChanging:
      `Only ${c.nonNullCount} of ${rows} rows carry a value. That is the shape ` +
      "of a column populated by one narrow code path rather than the general " +
      "case — which usually means it belongs on a separate table, or that the " +
      "path meant to populate it runs far less often than intended.",
    businessImpact:
      "Any query filtering or reporting on this column covers a small fraction " +
      "of the table, which is easy to mistake for a small result rather than a " +
      "sparsely-populated field.",
    severity: "low",
    urgency: "deferred",
    remediation: NONE,
    fixRisk:
      "None from reporting. Acting on it — normalising the column out — is a " +
      "schema change that needs its own analysis.",
    doingNothing:
      "Nothing breaks. This is a modelling observation, not a defect.",
    confidence: "proven",
  };
}

function notProfiled(t: TableProfile): Finding {
  return {
    id: `data.not-profiled.${t.name}`,
    dimension: "data",
    rule: "not-profiled",
    subject: t.name,
    observation: `${t.name} was not profiled: ${t.skipped}`,
    evidence: {
      query: "not executed",
      rows: [{ table: t.name, bytes: t.tableBytes, reason: t.skipped ?? "unknown" }],
    },
    whyItNeedsChanging:
      "This table is unexamined, not examined-and-clean. Treating an unprofiled " +
      "table as healthy is how a data-quality report reads green while saying " +
      "nothing about the rows it never looked at.",
    businessImpact:
      "The data quality of this table is unknown. It may hold the defects this " +
      "dimension exists to find.",
    severity: "info",
    urgency: "deferred",
    remediation: NONE,
    fixRisk:
      "Re-running with a raised ceiling executes a full scan of a large table, " +
      "which competes for I/O with live traffic.",
    doingNothing: "This table remains unaudited for data quality.",
    confidence: "proven",
  };
}
// [SCOPE 121 / T017] END

// [SCOPE 121 / T017] BEGIN — Data health analysis
/** Turn table profiles into contract-complete findings. Pure. */
export function analyzeData(snapshot: DataSnapshot): Finding[] {
  const findings: Finding[] = [];

  for (const table of snapshot.tables.values()) {
    if (table.skipped) {
      findings.push(notProfiled(table));
      continue;
    }
    if (!isKnown(table.rowCount)) continue;

    if (table.rowCount === 0) {
      findings.push(emptyTable(table));
      // Every column of a zero-row table is trivially all-null. Reporting them
      // would emit one finding per column for every empty table, burying the
      // columns that are dead in a table that is actually in use.
      continue;
    }

    for (const column of table.columns) {
      if (column.allNull) {
        findings.push(allNullColumn(table, column, table.rowCount));
      } else if (column.nullFraction >= HIGH_NULL_FRACTION) {
        findings.push(highNullDensity(table, column, table.rowCount));
      }
    }
  }

  return findings;
}
// [SCOPE 121 / T017] END
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run tests/wxdbanalyze/dimension-data.test.ts && npm run typecheck:dbanalyze`
Expected: 8 tests PASS, typecheck exits 0.

---

## Task 18: Dimension 5 — performance collection

**Files:**
- Create: `_wxAI/skills/wxDBAnalyze/scripts/engines/postgres/performance.ts`
- Test: `tests/wxdbanalyze/pg-performance-collect.test.ts`

**Interfaces:**
- Consumes: `DbConnection` (`core/engine.js`), `PgCapabilities` (`engines/postgres/capabilities.js`), `Measured`/`UNKNOWN` (`core/metrics.js`)
- Produces: `IndexStat`, `StatementStat`, `PerformanceSnapshot`, `INDEX_STATS_SQL`, `STATEMENT_STATS_SQL`, `collectPerformance(conn, capabilities)`

The statement-statistics half depends on `pg_stat_statements`, which on this database is **loaded but not created**. Collection must record that state rather than treating it as no data.

- [ ] **Step 1: Write the failing test**

```ts
// tests/wxdbanalyze/pg-performance-collect.test.ts
import { describe, expect, it } from "vitest";
import {
  INDEX_STATS_SQL,
  collectPerformance,
} from "../../_wxAI/skills/wxDBAnalyze/scripts/engines/postgres/performance.js";
import type { PgCapabilities } from "../../_wxAI/skills/wxDBAnalyze/scripts/engines/postgres/capabilities.js";

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
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/wxdbanalyze/pg-performance-collect.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `engines/postgres/performance.ts`**

```ts
// _wxAI/skills/wxDBAnalyze/scripts/engines/postgres/performance.ts
import type { DbConnection } from "../../core/engine.js";
import type { PgCapabilities } from "./capabilities.js";

// [SCOPE 121 / T018] BEGIN — Performance types
export interface IndexStat {
  table: string;
  name: string;
  bytes: number;
  scans: number;
  isUnique: boolean;
  isPrimary: boolean;
  isValid: boolean;
  columns: string[];
  definition: string;
}

export interface StatementStat {
  query: string;
  calls: number;
  totalExecMs: number;
  meanExecMs: number;
  rows: number;
}

export interface PerformanceSnapshot {
  indexes: IndexStat[];
  byTable: Map<string, IndexStat[]>;
  /** Null whenever statement statistics could not be read. */
  statements: StatementStat[] | null;
  /** Present exactly when `statements` is null; states why, actionably. */
  statementsUnavailable?: string;
}
// [SCOPE 121 / T018] END

// [SCOPE 121 / T018] BEGIN — Performance queries
export const INDEX_STATS_SQL = `
  select
    t.relname  as table_name,
    i.relname  as index_name,
    pg_catalog.pg_relation_size(i.oid) as index_bytes,
    coalesce(s.idx_scan, 0)            as idx_scan,
    ix.indisunique                     as is_unique,
    ix.indisprimary                    as is_primary,
    ix.indisvalid                      as is_valid,
    pg_catalog.pg_get_indexdef(i.oid)  as index_def,
    (select array_agg(coalesce(att.attname, '(expression)') order by k.ord)
       from unnest(ix.indkey::int[]) with ordinality k(attnum, ord)
       left join pg_catalog.pg_attribute att
         on att.attrelid = t.oid and att.attnum = k.attnum) as index_columns
  from pg_catalog.pg_index ix
  join pg_catalog.pg_class i on i.oid = ix.indexrelid
  join pg_catalog.pg_class t on t.oid = ix.indrelid
  join pg_catalog.pg_namespace n on n.oid = t.relnamespace
  left join pg_catalog.pg_stat_user_indexes s on s.indexrelid = i.oid
  where n.nspname = 'public'
  order by t.relname, i.relname`;

/** Top statements by cumulative time. Only runs when the extension exists. */
export const STATEMENT_STATS_SQL = `
  select query, calls, total_exec_time, mean_exec_time, rows
    from pg_stat_statements
   order by total_exec_time desc
   limit 50`;
// [SCOPE 121 / T018] END

// [SCOPE 121 / T018] BEGIN — Performance collection
function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Collect index statistics always, statement statistics when possible.
 *
 * `statementsUnavailable` is the important field. On this database
 * pg_stat_statements sits in shared_preload_libraries — the server has been
 * collecting query timings all along — but no CREATE EXTENSION was ever run, so
 * the view does not exist. Reporting that as "no data" would hide a
 * one-statement fix that unlocks data already being gathered.
 */
export async function collectPerformance(
  connection: DbConnection,
  capabilities: PgCapabilities,
): Promise<PerformanceSnapshot> {
  const indexes: IndexStat[] = [];
  for (const r of await connection.query(INDEX_STATS_SQL)) {
    indexes.push({
      table: String(r.table_name),
      name: String(r.index_name),
      bytes: num(r.index_bytes),
      scans: num(r.idx_scan),
      isUnique: r.is_unique === true,
      isPrimary: r.is_primary === true,
      isValid: r.is_valid === true,
      columns: Array.isArray(r.index_columns)
        ? r.index_columns.filter((c): c is string => typeof c === "string")
        : [],
      definition: String(r.index_def ?? ""),
    });
  }

  const byTable = new Map<string, IndexStat[]>();
  for (const idx of indexes) {
    const list = byTable.get(idx.table) ?? [];
    list.push(idx);
    byTable.set(idx.table, list);
  }

  const state = capabilities.extensions.pg_stat_statements;
  if (state !== "installed") {
    return {
      indexes,
      byTable,
      statements: null,
      statementsUnavailable:
        state === "preloaded-not-created"
          ? "pg_stat_statements is loaded in shared_preload_libraries and is " +
            "already collecting query statistics, but the extension was never " +
            "created, so nothing can read them. Run CREATE EXTENSION " +
            "pg_stat_statements to expose the data already being gathered."
          : state === "available-not-installed"
            ? "pg_stat_statements is available on this server but is neither " +
              "loaded nor created, so no query statistics are being collected. " +
              "Enabling it requires adding it to shared_preload_libraries and " +
              "restarting, then creating the extension."
            : "pg_stat_statements is not available on this server, so query " +
              "statistics cannot be collected at all.",
    };
  }

  try {
    const rows = await connection.query(STATEMENT_STATS_SQL);
    return {
      indexes,
      byTable,
      statements: rows.map((r) => ({
        query: String(r.query ?? ""),
        calls: num(r.calls),
        totalExecMs: num(r.total_exec_time),
        meanExecMs: num(r.mean_exec_time),
        rows: num(r.rows),
      })),
    };
  } catch (error) {
    return {
      indexes,
      byTable,
      statements: null,
      statementsUnavailable: `statement statistics query failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}
// [SCOPE 121 / T018] END
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run tests/wxdbanalyze/pg-performance-collect.test.ts && npm run typecheck:dbanalyze`
Expected: 7 tests PASS, typecheck exits 0.

---

## Task 19: Dimension 5 — performance analysis

**Files:**
- Create: `_wxAI/skills/wxDBAnalyze/scripts/dimensions/performance.ts`
- Test: `tests/wxdbanalyze/dimension-performance.test.ts`

**Interfaces:**
- Consumes: `PerformanceSnapshot`, `IndexStat` (`engines/postgres/performance.js`), `StatsSnapshot` (`engines/postgres/stats.js`), `Finding` (`core/finding.js`), `isKnown` (`core/metrics.js`), `quoteIdent` (`core/identifiers.js`)
- Produces: `analyzePerformance(perf: PerformanceSnapshot, stats: StatsSnapshot): Finding[]`

Pure. Rule ids: `performance.unused-index`, `performance.duplicate-index`, `performance.invalid-index`, `performance.seq-scan-heavy`, `performance.no-statement-stats`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/wxdbanalyze/dimension-performance.test.ts
import { describe, expect, it } from "vitest";
import { analyzePerformance } from "../../_wxAI/skills/wxDBAnalyze/scripts/dimensions/performance.js";
import { validateFinding } from "../../_wxAI/skills/wxDBAnalyze/scripts/core/finding.js";
import { UNKNOWN } from "../../_wxAI/skills/wxDBAnalyze/scripts/core/metrics.js";
import type { IndexStat, PerformanceSnapshot } from "../../_wxAI/skills/wxDBAnalyze/scripts/engines/postgres/performance.js";
import type { StatsSnapshot, TableStats } from "../../_wxAI/skills/wxDBAnalyze/scripts/engines/postgres/stats.js";

const idx = (over: Partial<IndexStat> = {}): IndexStat => ({
  table: "projecttasks",
  name: "idx_a",
  bytes: 340_000_000,
  scans: 0,
  isUnique: false,
  isPrimary: false,
  isValid: true,
  columns: ["projectid"],
  definition: "CREATE INDEX idx_a ON public.projecttasks USING btree (projectid)",
  ...over,
});

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
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/wxdbanalyze/dimension-performance.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `dimensions/performance.ts`**

Implement each rule so its `whyItNeedsChanging` states a mechanism derived from the numbers in hand, following the pattern established in `dimensions/integrity.ts`. Required behaviour, all pinned by the tests above:

- `unusedIndex` — only for indexes where `scans === 0 && !isPrimary && !isUnique`. Quote the index's bytes and the table's insert count; the mechanism is write amplification and buffer-cache pollution on every insert, for an index no query reads. Remediation is `drop index concurrently "<name>";` classified `manual-only` (dropping is destructive), lock class `SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes`, rollback the `CREATE INDEX` text from `definition`. `fixRisk` must note that `DROP INDEX CONCURRENTLY` cannot run inside a transaction block and that the index cannot be cheaply recreated if a future query needs it.
- `duplicateIndex` — group a table's indexes by `columns.join(",")`; emit ONE finding per group of two or more, naming every index in the group and their combined bytes. Mechanism: every write maintains all of them while the planner uses one.
- `invalidIndex` — `!isValid`. Severity `high`. Mechanism: an invalid index is skipped by the planner entirely, so it costs write maintenance and storage while providing nothing, and a unique invalid index enforces no constraint. Typically left behind by a failed `CREATE INDEX CONCURRENTLY`. Remediation `drop index concurrently` then recreate.
- `seqScanHeavy` — only when `isKnown(liveTuples)`, `liveTuples > 1000`, `seqScan > 100`, and `seqScan > idxScan`. Never for a never-analyzed table: without statistics the row count is unknown and the ratio cannot be judged.
- `noStatementStats` — emitted whenever `snapshot.statementsUnavailable` is set. Put the collected reason string verbatim in the observation so the `CREATE EXTENSION` remedy reaches the operator. Severity `medium`, `fixClass: "none"`. Mechanism: without statement statistics the tool cannot rank queries by cost at all, so every performance finding here is structural — derived from the schema — and none is derived from what the database is actually spending its time on.

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run tests/wxdbanalyze/dimension-performance.test.ts && npm run typecheck:dbanalyze`
Expected: 11 tests PASS, typecheck exits 0.

---

## Task 20: Dimension 6 — maintenance collection

**Files:**
- Create: `_wxAI/skills/wxDBAnalyze/scripts/engines/postgres/maintenance.ts`
- Test: `tests/wxdbanalyze/pg-maintenance-collect.test.ts`

**Interfaces:**
- Consumes: `DbConnection` (`core/engine.js`), `PgCapabilities` (`engines/postgres/capabilities.js`)
- Produces: `FreezeAge`, `VacuumBlocker`, `MaintenanceSnapshot`, `FREEZE_AGE_SQL`, `BLOCKERS_SQL`, `TABLE_OPTIONS_SQL`, `collectMaintenance(conn, capabilities)`

Vacuum and analyze ages come from `StatsSnapshot` (Task 15) and are not re-collected here. This task adds what that does not cover: transaction-ID freeze headroom, per-table autovacuum overrides, and the things that prevent vacuum from making progress.

- [ ] **Step 1: Write the failing test**

```ts
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
});

describe("collectMaintenance", () => {
  it("collects freeze ages and computes headroom against the configured max", async () => {
    const m = await collectMaintenance(
      conn((sql) => (sql.includes("relfrozenxid") ? [{ table_name: "projecttasks", freeze_age: "150000000" }] : [])),
      caps(),
    );
    const f = m.freezeAges.find((x) => x.table === "projecttasks")!;
    expect(f.age).toBe(150_000_000);
    expect(f.headroomFraction).toBeCloseTo(0.25);
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
        if (sql.includes("relfrozenxid")) return [{ table_name: "a", freeze_age: "1000" }];
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
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/wxdbanalyze/pg-maintenance-collect.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `engines/postgres/maintenance.ts`**

```ts
// _wxAI/skills/wxDBAnalyze/scripts/engines/postgres/maintenance.ts
import type { DbConnection } from "../../core/engine.js";
import type { PgCapabilities } from "./capabilities.js";

// [SCOPE 121 / T020] BEGIN — Maintenance types
export interface FreezeAge {
  table: string;
  age: number;
  /** Fraction of autovacuum_freeze_max_age REMAINING. 0 means at the limit. */
  headroomFraction: number;
}

export interface VacuumBlocker {
  kind: string;
  detail: string;
  ageSeconds: number;
}

export interface MaintenanceSnapshot {
  freezeAges: FreezeAge[];
  freezeMaxAge: number;
  tableOptions: Map<string, string[]>;
  blockers: VacuumBlocker[];
  blockersUnavailable?: string;
  /** False unless pgstattuple is installed; bloat is then estimate-only. */
  bloatMeasurable: boolean;
  bloatUnavailable?: string;
}
// [SCOPE 121 / T020] END

// [SCOPE 121 / T020] BEGIN — Maintenance queries
export const FREEZE_AGE_SQL = `
  select c.relname as table_name,
         pg_catalog.age(c.relfrozenxid) as freeze_age
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r','p','m')
   order by pg_catalog.age(c.relfrozenxid) desc`;

export const TABLE_OPTIONS_SQL = `
  select c.relname as table_name, c.reloptions
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r','p') and c.reloptions is not null`;

/**
 * Two things stop vacuum reclaiming dead rows: a transaction older than the
 * dead rows, and a replication slot pinning WAL. Both look like "vacuum is not
 * working" from the dead-tuple counts alone, so they are collected together.
 */
export const BLOCKERS_SQL = `
  select 'long-transaction' as kind,
         'pid ' || pid || ' ' || coalesce(state, 'unknown') as detail,
         extract(epoch from (now() - xact_start))::bigint as age_seconds
    from pg_catalog.pg_stat_activity
   where xact_start is not null
     and now() - xact_start > interval '1 hour'
     and pid <> pg_backend_pid()
  union all
  select 'replication-slot' as kind,
         'slot ' || slot_name || ' (' || coalesce(slot_type, '?') || ', active=' || active || ')' as detail,
         0::bigint as age_seconds
    from pg_catalog.pg_replication_slots
   where not active`;
// [SCOPE 121 / T020] END

// [SCOPE 121 / T020] BEGIN — Maintenance collection
function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export async function collectMaintenance(
  connection: DbConnection,
  capabilities: PgCapabilities,
): Promise<MaintenanceSnapshot> {
  const freezeMaxAge = num(capabilities.settings.autovacuum_freeze_max_age) || 200_000_000;

  const freezeAges: FreezeAge[] = (await connection.query(FREEZE_AGE_SQL)).map((r) => {
    const age = num(r.freeze_age);
    return {
      table: String(r.table_name),
      age,
      headroomFraction: freezeMaxAge > 0 ? (freezeMaxAge - age) / freezeMaxAge : 0,
    };
  });

  const tableOptions = new Map<string, string[]>();
  for (const r of await connection.query(TABLE_OPTIONS_SQL)) {
    tableOptions.set(
      String(r.table_name),
      Array.isArray(r.reloptions)
        ? r.reloptions.filter((o): o is string => typeof o === "string")
        : [],
    );
  }

  let blockers: VacuumBlocker[] = [];
  let blockersUnavailable: string | undefined;
  try {
    blockers = (await connection.query(BLOCKERS_SQL)).map((r) => ({
      kind: String(r.kind),
      detail: String(r.detail),
      ageSeconds: num(r.age_seconds),
    }));
  } catch (error) {
    // Reading pg_stat_activity beyond one's own backend needs pg_read_all_stats
    // or superuser. A least-privilege role sees nothing, which must not read as
    // "no blockers".
    blockersUnavailable = `vacuum-blocker query failed: ${
      error instanceof Error ? error.message : String(error)
    }`;
  }

  const bloatMeasurable = capabilities.extensions.pgstattuple === "installed";

  return {
    freezeAges,
    freezeMaxAge,
    tableOptions,
    blockers,
    blockersUnavailable,
    bloatMeasurable,
    bloatUnavailable: bloatMeasurable
      ? undefined
      : "pgstattuple is not installed, so physical bloat cannot be measured. " +
        "The usual alternative — estimating bloat from column statistics — is " +
        "also unavailable for any table that has never been analyzed, which on " +
        "this database is most of them. Bloat is therefore not reported rather " +
        "than reported as zero.",
  };
}
// [SCOPE 121 / T020] END
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run tests/wxdbanalyze/pg-maintenance-collect.test.ts && npm run typecheck:dbanalyze`
Expected: 6 tests PASS, typecheck exits 0.

---

## Task 21: Dimension 6 — maintenance analysis

**Files:**
- Create: `_wxAI/skills/wxDBAnalyze/scripts/dimensions/maintenance.ts`
- Test: `tests/wxdbanalyze/dimension-maintenance.test.ts`

**Interfaces:**
- Consumes: `MaintenanceSnapshot` (`engines/postgres/maintenance.js`), `StatsSnapshot`/`TableStats` (`engines/postgres/stats.js`), `Finding` (`core/finding.js`), `isKnown` (`core/metrics.js`)
- Produces: `analyzeMaintenance(maint: MaintenanceSnapshot, stats: StatsSnapshot): Finding[]`

Pure. Rule ids: `maintenance.never-analyzed`, `maintenance.dead-tuple-ratio`, `maintenance.autovacuum-disabled`, `maintenance.freeze-age`, `maintenance.vacuum-blocked`, `maintenance.bloat-unmeasurable`, `maintenance.blockers-unknown`.

**`maintenance.never-analyzed` is this dimension's headline finding and must be a single roll-up, not one finding per table.** 218 tables would otherwise produce 218 findings and bury everything else — the same mistake the tenant-coverage roll-up already corrected in Phase 1.

- [ ] **Step 1: Write the failing test**

```ts
// tests/wxdbanalyze/dimension-maintenance.test.ts
import { describe, expect, it } from "vitest";
import { analyzeMaintenance } from "../../_wxAI/skills/wxDBAnalyze/scripts/dimensions/maintenance.js";
import { validateFinding } from "../../_wxAI/skills/wxDBAnalyze/scripts/core/finding.js";
import { UNKNOWN } from "../../_wxAI/skills/wxDBAnalyze/scripts/core/metrics.js";
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

const maint = (over: Partial<MaintenanceSnapshot> = {}): MaintenanceSnapshot => ({
  freezeAges: [],
  freezeMaxAge: 200_000_000,
  tableOptions: new Map(),
  blockers: [],
  bloatMeasurable: false,
  bloatUnavailable: "pgstattuple is not installed, so bloat cannot be measured; it is not reported rather than reported as zero.",
  ...over,
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
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/wxdbanalyze/dimension-maintenance.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `dimensions/maintenance.ts`**

Every rule below is pinned by the tests above. Follow `dimensions/integrity.ts` for finding shape and prose discipline.

- `neverAnalyzed` — **one roll-up finding** when `stats.neverAnalyzed.length > 0`. Observation states the count and the total. Severity `high`, urgency `scheduled`. `whyItNeedsChanging` must state both halves of the harm: the planner is choosing join orders and scan strategies with no idea how large these tables are or how values are distributed, *and* every statistics-derived metric in this report is unavailable for them, so their apparent health is absence of data rather than evidence of health. Remediation is `analyze;` (or `vacuum analyze;`), `fixClass: "manual-only"` — it is not additive DDL, it is a maintenance command with real I/O cost. `evidence.rows` carries the table names, capped at the first 50 with the remaining count stated so the row list cannot silently truncate.
- `deadTupleRatio` — only when `isKnown(liveTuples) && isKnown(deadTuples)`, `liveTuples + deadTuples > 1000`, and `deadTuples / (liveTuples + deadTuples) > 0.2`. Remediation `vacuum (analyze) "<table>";`, `manual-only`.
- `autovacuumDisabled` — any table whose `reloptions` contain `autovacuum_enabled=false`. Severity `high`: dead rows accumulate without bound and the freeze age climbs unchecked. Mention that this is sometimes a deliberate choice for a bulk-load table, which is exactly why it must be surfaced rather than assumed accidental.
- `freezeAge` — when `headroomFraction <= 0.2`, i.e. less than a fifth of the freeze budget REMAINS. Note the field is remaining headroom, not consumed: 0 means at the limit. Getting this backwards would alarm on healthy tables and stay silent on ones approaching wraparound. State the age, the configured `autovacuum_freeze_max_age`, and that reaching the limit forces an aggressive anti-wraparound autovacuum that cannot be cancelled.
- `vacuumBlocked` — one finding per blocker. For a long transaction, the mechanism is that vacuum cannot reclaim any row version newer than the oldest running transaction, so dead tuples accumulate database-wide, not only in the table being written.
- `bloatUnmeasurable` — emitted whenever `bloatMeasurable` is false. Severity `info`, `fixClass: "none"`. Carry the collected reason verbatim.
- `blockersUnknown` — emitted whenever `blockersUnavailable` is set. Severity `info`.

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run tests/wxdbanalyze/dimension-maintenance.test.ts && npm run typecheck:dbanalyze`
Expected: 11 tests PASS, typecheck exits 0.

---

## Task 22: Wiring, adapter support, and the live run

**Files:**
- Modify: `_wxAI/skills/wxDBAnalyze/scripts/engines/postgres/index.ts`
- Modify: `_wxAI/skills/wxDBAnalyze/scripts/cli.ts`
- Modify: `_wxAI/skills/wxDBAnalyze/SKILL.md`
- Modify: `.claude/commands/wxDBAnalyze.md` and `_wxAI/commands/wxDBAnalyze.md`
- Test: `tests/wxdbanalyze/cli.test.ts` (extend)
- Test: `tests/wxdbanalyze/engine.test.ts` (extend)

**Interfaces:**
- Consumes: everything from Tasks 15–21
- Produces: no new exports; `IMPLEMENTED` in `cli.ts` grows to five dimensions

- [ ] **Step 1: Extend the adapter's support map**

In `engines/postgres/index.ts`, `SUPPORT` gains `data: "full"`, `performance: "full"`, `maintenance: "full"`. The remaining four stay absent so `?? "not-implemented"` still covers them. Add a test to `engine.test.ts` asserting all five implemented dimensions report `"full"` and that `conventions`, `security`, `availability` and `impact` still report `"not-implemented"`.

- [ ] **Step 2: Extend the CLI's dimension list and collection**

In `cli.ts`, add `"data"`, `"performance"`, `"maintenance"` to `IMPLEMENTED` and remove them from `PHASE_2`. Collect capabilities and table statistics ONCE, before the per-dimension branches, since all three new dimensions read them:

```ts
const capabilities = await collectCapabilities(connection);
const tableStats = await collectTableStats(connection);
```

Then guard each dimension behind its selection flag, exactly as `schema` and `integrity` already are. Pass `options.deep` through to `probeDataHealth` as a raised `maxTableBytes` so `--deep` means the same thing it already means for the orphan anti-join.

- [ ] **Step 3: Carry the new gap channels into the report**

`collectCapabilities` and the three snapshots each carry information the operator must see even when no finding fires. Thread them into the JSON snapshot written by `writeReport` — at minimum the extension states, the never-analyzed count, and any `*Unavailable` reason strings. These are already surfaced as findings, so this is for the machine-readable artifact, not a second rendering path.

- [ ] **Step 4: Run the full suite and typecheck**

```bash
npx vitest run tests/wxdbanalyze
npm run typecheck:dbanalyze
```

Expected: every previous test still passing plus the new ones; typecheck exits 0. Report the exact total.

- [ ] **Step 5: Run it against the live database**

```bash
npm run db:analyze
```

This is read-only through the Task 4 guard. Report, without summarising away:

- the exact terminal summary line
- findings per rule across all five dimensions
- the never-analyzed count — expected near 218 of 259
- whether `pg_stat_statements` reported `preloaded-not-created` and produced the `no-statement-stats` finding with its `CREATE EXTENSION` remedy
- how many tables were skipped by the data-health size ceiling
- any withheld findings, with the fields they were missing
- the top 5 findings by severity, quoted in full including `whyItNeedsChanging`
- the report path and exit code

If any number looks implausible, say so rather than presenting it as a clean result.

- [ ] **Step 6: Update the skill and command documentation**

`SKILL.md`'s dimension table and build-status section must now show five dimensions implemented and four remaining, and must keep stating plainly that there is no apply entrypoint. Both command files get the same treatment. Do not overstate: dimensions 3, 5 and 6 are PostgreSQL-only, exactly as 1 and 2 are.

---

## Post-Batch-A follow-ups

Recorded so they are not mistaken for oversights:

1. **Batch B** — dimensions 4 (conventions), 7 (security), 8 (availability), 9 (change impact).
2. **Duplicate detection on natural keys** was deliberately deferred from dimension 3; it needs the conventions dimension to identify what a natural key is.
3. **Bloat is not reported at all** in Batch A. Measuring it needs `pgstattuple`; estimating it needs table statistics that 84% of this database lacks. The gap is surfaced as a finding rather than filled with a fabricated number.
4. **`pg_buffercache` and cache-hit analysis** are not implemented. `pg_stat_database` block hit ratios would be a cheap partial substitute and are worth considering for Batch B.
