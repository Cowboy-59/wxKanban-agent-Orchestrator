/**
 * SQL helpers for Drizzle queries.
 *
 * sqlEqU — explicit ::uuid cast for parameterized queries. Some Postgres
 * deployments are strict about `uuid = text` comparisons and reject queries
 * where the pg driver sent the value without uuid type OID information.
 * Diagnosed 2026-05-27 against the prod engagements table; the literal-string
 * version of the query worked, but the parameterized version failed.
 *
 * Use this wherever a uuid column is compared to a JS string variable.
 * Safe to use on column-to-column comparisons too (no-op cast on a uuid).
 */

import { sql, type SQL, type AnyColumn } from "drizzle-orm";

export function sqlEqU(col: AnyColumn, val: string): SQL {
  return sql`${col} = ${val}::uuid`;
}

/**
 * Walk an error's cause chain and produce a flat structure that surfaces the
 * underlying database driver detail. DrizzleQueryError wraps the pg driver's
 * native error in `cause`; pg driver errors carry useful fields like `code`
 * (Postgres SQLSTATE), `detail`, `hint`, `table`, `column`, `routine`.
 *
 * Used by the engagement endpoints (2026-05-27) to surface the actual
 * Postgres failure in API responses when prod is still failing after the
 * uuid cast fix and the App Runner log viewer is truncating the JSON record.
 *
 * Returns a structure safe to embed in 500 responses for short-term debugging.
 * Schema info leaks are acceptable here for the engaged-prod-debug window;
 * remove or feature-flag once the bug is identified.
 */
export interface ExpandedError {
  message: string;
  type: string;
  pgCode?: string;
  pgDetail?: string;
  pgHint?: string;
  pgTable?: string;
  pgColumn?: string;
  pgRoutine?: string;
  pgPosition?: string;
  causeChain: string[];
}

export function expandError(err: unknown): ExpandedError {
  const e = err as Error & {
    cause?: unknown;
    code?: string;
    detail?: string;
    hint?: string;
    table?: string;
    column?: string;
    routine?: string;
    position?: string;
  };

  const causeChain: string[] = [];
  let current: unknown = err;
  let depth = 0;
  while (current && depth < 5) {
    if (current instanceof Error) {
      causeChain.push(`${current.name}: ${current.message}`);
    } else if (typeof current === "object") {
      causeChain.push(JSON.stringify(current).slice(0, 500));
    } else {
      causeChain.push(String(current));
    }
    current = (current as { cause?: unknown })?.cause;
    depth += 1;
  }

  // Drill to the deepest pg-driver error (last in chain).
  let pgErr: typeof e = e;
  let walker: unknown = err;
  for (let i = 0; i < 5 && walker; i += 1) {
    const w = walker as typeof e;
    if (w.code || w.detail || w.routine) {
      pgErr = w;
    }
    walker = (walker as { cause?: unknown })?.cause;
  }

  return {
    message: e?.message ?? "Unknown error",
    type: e?.name ?? typeof e,
    pgCode: pgErr.code,
    pgDetail: pgErr.detail,
    pgHint: pgErr.hint,
    pgTable: pgErr.table,
    pgColumn: pgErr.column,
    pgRoutine: pgErr.routine,
    pgPosition: pgErr.position,
    causeChain,
  };
}
