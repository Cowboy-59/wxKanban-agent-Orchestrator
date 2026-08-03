import type { DbConnection } from "../../core/engine.js";
import type { Measured } from "../../core/metrics.js";
import { UNKNOWN } from "../../core/metrics.js";
import type { PgCapabilities } from "./capabilities.js";

// [SCOPE 121 / T018] BEGIN — Performance types
export interface IndexStat {
  table: string;
  name: string;
  bytes: number;
  /**
   * `UNKNOWN` when the index has no row in pg_stat_user_indexes at all — most
   * notably a partitioned table's PARENT index, which never accrues its own
   * stats row (only its leaf partitions do). A real 0 means the stats row
   * exists and reports zero scans. Collapsing the two (as a `coalesce(...,
   * 0)` in SQL would) turns "cannot judge" into "definitely unused", which is
   * exactly the fabricated evidence a DROP-INDEX recommendation must not be
   * built on.
   */
  scans: Measured<number>;
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
    s.idx_scan                         as idx_scan,
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

/**
 * Top statements by cumulative time. Only runs when the extension exists.
 *
 * Known limitations (not fixed here):
 * - If the connecting role lacks `pg_read_all_stats`, Postgres silently
 *   FILTERS this view to the role's own queries rather than throwing. That
 *   surfaces as a short-but-valid `statements` array with
 *   `statementsUnavailable` left undefined — indistinguishable here from a
 *   genuinely quiet database. Detecting this reliably (e.g. cross-checking
 *   role membership) is not cheap and is left for a future task; a caller
 *   should not treat a small `statements` count as proof of low query volume.
 * - `total_exec_time`/`mean_exec_time` are the PG13+ column names (PG12 and
 *   earlier used `total_time`/`mean_time`). On an older server this query
 *   throws and falls into the generic catch below, surfacing a raw driver
 *   error rather than an actionable "unsupported server version" message.
 *   Acceptable today because production runs PG 15.17.
 */
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
 * `idx_scan` is `Measured` because a missing pg_stat_user_indexes row (SQL
 * null) means "never measured", not "zero" — see the `scans` doc comment.
 */
function measuredScans(v: unknown): Measured<number> {
  return v === null || v === undefined ? UNKNOWN : num(v);
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
      scans: measuredScans(r.idx_scan),
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
          ? "pg_stat_statements is already preloaded via shared_preload_libraries " +
            "and has been collecting query statistics all along, but the extension " +
            "was never created, so nothing can read them. Run CREATE EXTENSION " +
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
