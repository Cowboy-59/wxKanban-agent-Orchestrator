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
// MODIFIED-BY [SCOPE 121 / T017] — the two `skipped` string literals below used
// to bake "not profiled: " into the reason text itself. `dimensions/data.ts`'s
// `notProfiled()` finding template ALSO prefixes "was not profiled: ", so real
// output read "huge was not profiled: not profiled: huge holds …" — a doubled
// phrase. This module's own established convention (see
// `engines/postgres/integrity.ts`'s "anti-join skipped: …" / "probe failed: …")
// is that the engine's `skipped` string carries the raw reason only; the
// dimension layer supplies the frame. The leading "not profiled: " is removed
// from both literals below; the rest of each string, including the
// partitioned-parent explanation, is unchanged.
const DEFAULT_MAX_TABLE_BYTES = 2_000_000_000;

/**
 * Profile every table's row count and per-column null density.
 *
 * Expensive by construction — a sequential scan per table — so it is bounded by
 * size and every decline is RECORDED. A table that reads as clean because it
 * was never examined is the failure mode this tool exists to prevent, so
 * `rowCount` becomes UNKNOWN and `skipped` explains why; it never becomes 0.
 *
 * FIX (controller decision, SCOPE-121/T016): the brief built `query` via
 * `buildNullDensityQuery` OUTSIDE the try block below. `buildNullDensityQuery`
 * calls `quoteIdent` on every table and column name, which THROWS on any
 * identifier outside the plain grammar — so one malformed catalog name would
 * propagate out of `probeDataHealth` uncaught, aborting the whole function and
 * discarding every table already profiled before it. This is the exact defect
 * found and fixed in Phase 1's `probeIntegrity` (see `integrity.ts`, "FIX
 * (SCOPE-121/T009, review round 1 — Finding 1, Important)"). Query
 * construction now happens inside the try, so a build failure becomes a
 * recorded skip on that ONE table, and every other table in the same call
 * still gets its own result.
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
    const base: TableProfile = {
      name,
      rowCount: UNKNOWN,
      columns: [],
      tableBytes: stat?.tableBytes ?? 0,
      everAnalyzed: stat?.everAnalyzed ?? false,
    };

    // FIX (review round 1 — Finding 1, Critical): a missing `StatsSnapshot`
    // entry used to fall through to `tableBytes ?? 0`, which treats "we have
    // no idea how big this table is" as "this table is 0 bytes" — the
    // opposite of caution, and the inversion of the precedent Phase 1's
    // `probeIntegrity` set (an unknown row count is treated as OVER the
    // ceiling, never as safely small). This is concretely reachable, not
    // hypothetical: `schema.ts`'s `COLUMNS_SQL` selects `relkind in ('r','p')`,
    // so a partitioned PARENT table appears in `LiveSchema`, but
    // `pg_stat_user_tables` (what `stats.ts` reads) reports only LEAF
    // partitions — a partitioned parent has no stats entry at all. Reading
    // that as 0 bytes let a table of unknown, possibly huge, size sail under
    // the ceiling and receive a full, unbounded sequential scan — reproduced
    // live via a simulated 999,999,999-row table with no stats entry. The
    // size is now treated as unknown and the table is declined, exactly like
    // an over-ceiling table, with a reason naming the cause so the next
    // reader does not have to guess it.
    if (stat === undefined) {
      tables.set(name, {
        ...base,
        skipped:
          `${name} has no entry in the collected table statistics, ` +
          "so its size cannot be established. This is the expected shape for a " +
          "partitioned PARENT table — pg_stat_user_tables reports only its leaf " +
          "partitions, never the parent itself — but the cause could also be a " +
          "table created after statistics were collected. Its size is treated as " +
          "unknown rather than assumed small, and it is not scanned out of caution.",
      });
      continue;
    }

    const tableBytes = stat.tableBytes;

    if (tableBytes > ceiling) {
      tables.set(name, {
        ...base,
        skipped:
          `${name} holds ${tableBytes} bytes, above the ` +
          `${ceiling}-byte ceiling for a full scan. Re-run with --deep to profile it.`,
      });
      continue;
    }

    const columnNames = liveTable.columns.map((c) => c.name);

    try {
      // FIX (review round 1 — Finding 2, Important): a table with zero
      // declared columns used to short-circuit on `buildNullDensityQuery`
      // returning `""` and report `rowCount: 0` WITHOUT ever querying the
      // database — contradicting this module's own documented invariant
      // that `rowCount` never becomes 0 unless it was measured (reproduced
      // live via a fake table that would have returned 42 rows but reported
      // 0 with zero query calls). `count(*)` is still genuinely measured
      // here even when there is nothing to count non-nulls for.
      if (columnNames.length === 0) {
        const query = `select count(*)::bigint as total from ${quoteIdent(name)}`;
        const rows = await connection.query(query);
        const total = Number(rows[0]?.total ?? 0);
        tables.set(name, { ...base, rowCount: total, columns: [] });
        continue;
      }

      const query = buildNullDensityQuery(name, columnNames);
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
