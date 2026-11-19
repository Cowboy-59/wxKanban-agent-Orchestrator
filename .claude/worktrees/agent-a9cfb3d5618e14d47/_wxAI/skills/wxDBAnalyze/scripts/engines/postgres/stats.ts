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
