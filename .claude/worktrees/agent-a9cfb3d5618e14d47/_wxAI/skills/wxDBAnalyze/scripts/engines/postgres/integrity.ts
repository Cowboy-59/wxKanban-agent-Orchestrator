import type { DbConnection } from "../../core/engine.js";
import { quoteIdent } from "../../core/identifiers.js";
import type { Relationship } from "../../dimensions/relationships.js";

// [SCOPE 121 / T009] BEGIN — Orphan probe types
// MODIFIED-BY [SCOPE 121 / T010] — added `tenantSkippedKind`, a typed
// discriminator alongside `tenantSkipped` (controller-authorised, review
// round 1 Finding 3). Task 9's dominant tenant-skip reason is SQLSTATE
// 42703 (the tenant column not existing on one side), the EXPECTED outcome
// for every relationship that is not multi-tenant on both sides — with
// ~221 relationships in this database and Task 14 passing a tenant column
// on every run, reporting one finding per such relationship would bury the
// findings that matter under expected noise. The caller (Task 10) needs a
// typed way to separate that expected case from a genuine probe failure
// without re-parsing the free-text `tenantSkipped` message itself.
export interface OrphanProbe {
  relationship: Relationship;
  /**
   * See `RowCountEstimate` (I4, SCOPE-121 final wave): `"unknown"` when
   * Postgres has never run ANALYZE on this table, distinct from a genuine
   * measured `0`.
   */
  childRows: RowCountEstimate;
  /** null when the probe did not run; `skipped` then states why. */
  orphanRows: number | null;
  tenantMismatches: number | null;
  query: string;
  /**
   * FIX (SCOPE-121 final wave, C1 — CRITICAL): `query` above is always the
   * orphan anti-join built by `buildOrphanQuery` — it has nothing to do with
   * the cross-tenant check. `dimensions/integrity.ts`'s `crossTenant` and
   * `tenantNotProbed` findings used to cite `probe.query` as their evidence,
   * which the finding contract defines as "the exact query that produced
   * it, so the reader can re-run it and disagree" (`references/finding-
   * contract.md`). An operator re-running the anti-join instead of the
   * tenant query would get an orphan count of 0 and conclude the tool is
   * simply wrong — three of the six criticals in the first live run carried
   * this self-refuting evidence. `tenantQuery` is populated by
   * `probeIntegrity` whenever `buildTenantQuery` is actually invoked for
   * this relationship (i.e. the tenant sub-probe was attempted), independent
   * of whether that attempt succeeded.
   */
  tenantQuery?: string;
  skipped?: string;
  /**
   * Present whenever the tenant sub-probe did not produce a number, stating
   * why. Kept distinct from `skipped` (which covers the primary orphan
   * probe) because the two are independent: a relationship can be fully
   * probed for orphans while its tenant check fails or vice versa, and
   * collapsing both into one field would lose which one actually happened.
   */
  tenantSkipped?: string;
  /**
   * Machine-readable classification of `tenantSkipped`, set alongside it.
   * `"column-missing"` is the expected, common case — the tenant column
   * does not exist on one side of the relationship (SQLSTATE 42703).
   * `"probe-error"` is everything else — a genuine failure (permission
   * error, network failure, a malformed identifier) worth a caller's
   * individual attention. Derived from the same SQLSTATE check
   * `describeTenantSkip` already performs, not a second, independent
   * text match.
   */
  tenantSkippedKind?: "column-missing" | "probe-error";
}

export interface ProbeOptions {
  rowCounts?: Map<string, number>;
  /** Above this row count an unindexed anti-join is skipped rather than run. */
  maxUnindexedRows?: number;
  /** Column used for the multi-tenant consistency check, when both sides carry it. */
  tenantColumn?: string;
}

/**
 * ADDITION (SCOPE-121 final wave, I4 — Important): Postgres's planner
 * estimate (`pg_class.reltuples`) uses the sentinel value `-1` to mean "this
 * table has never been ANALYZEd — there is no estimate at all", distinct
 * from a genuine `0` (an analyzed, empty table). `estimateRowCounts` used to
 * clamp with `greatest(reltuples, 0)`, which collapsed that sentinel into an
 * ordinary zero — a never-analyzed table then read as holding ~0 rows
 * everywhere `childRows` was quoted, silently dropping `unindexed-fk`
 * severity to medium/deferred and (via the ceiling check in `probeIntegrity`
 * below) letting an unindexed anti-join run unguarded against a table whose
 * real size was unknown. `RowCountEstimate` keeps "unknown" as its own,
 * explicit state rather than a number a caller could mistake for a real
 * count.
 */
export type RowCountEstimate = number | "unknown";
// [SCOPE 121 / T009] END

// [SCOPE 121 / T009] BEGIN — Integrity query construction
/**
 * DEVIATION (controller decision, SCOPE-121/T009): the brief assumes a
 * single-column key (`rel.childColumn` / `rel.parentColumn`). Task 8 added
 * composite-key support (`childColumns`/`parentColumns`, positionally
 * paired), with a real composite FK in this database —
 * `testsignoffs.(itemid, itemexecutor) -> testplanitems.(id, executor)`.
 * Building the join from the singular fields would silently drop the second
 * column of that relationship and probe against the wrong (much looser)
 * condition — exactly the bug Task 8 was fixed for. Every column pair is
 * therefore joined, AND-ed together, pairing `childColumns[i]` with
 * `parentColumns[i]`, and every identifier is still routed through
 * `quoteIdent`.
 *
 * NULL-guard semantics: Postgres's default composite-FK match mode is MATCH
 * SIMPLE, under which the constraint is not enforced at all when ANY column
 * of the composite key is NULL (only a MATCH FULL constraint requires
 * all-or-nothing). So a composite key with a NULL in any column is not a
 * constraint violation candidate under the semantics an actual foreign key
 * would apply — the anti-join must only count a row as a candidate orphan
 * when ALL child columns are non-null and no parent match exists. Guarding on
 * only the first column (as the brief's single-column form does) would
 * mis-count rows for a composite key where the first column is populated but
 * a later one is null.
 */
export function buildOrphanQuery(rel: Relationship): string {
  const child = quoteIdent(rel.child);
  const parent = quoteIdent(rel.parent);
  const onClause = rel.childColumns
    .map((c, i) => `c.${quoteIdent(c)} = p.${quoteIdent(rel.parentColumns[i]!)}`)
    .join(" and ");
  const nullGuard = rel.childColumns
    .map((c) => `c.${quoteIdent(c)} is not null`)
    .join(" and ");
  // FIX (SCOPE-121/T009, review round 1 — Finding 3, Minor): the ON clause
  // AND-s equality across every column pair, and NULL never satisfies `=` —
  // so any row that DOES match necessarily has every joined parent column
  // non-null, regardless of whether those columns are declared nullable.
  // Checking the first parent column for null is therefore sufficient to
  // detect "no match" even for a composite key; no need to repeat the check
  // per parent column.
  const noMatch = `p.${quoteIdent(rel.parentColumns[0]!)} is null`;
  return (
    `select count(*)::bigint as orphans ` +
    `from ${child} c left join ${parent} p on ${onClause} ` +
    `where ${nullGuard} and ${noMatch}`
  );
}

/**
 * Cross-tenant consistency: a child row whose tenant column disagrees with its
 * parent's. No foreign key can express this, so it is invisible to every
 * constraint-based check while being a data-leak class of defect.
 */
export function buildTenantQuery(
  rel: Relationship,
  tenantColumn: string,
): string {
  const child = quoteIdent(rel.child);
  const parent = quoteIdent(rel.parent);
  const tenant = quoteIdent(tenantColumn);
  const onClause = rel.childColumns
    .map((c, i) => `c.${quoteIdent(c)} = p.${quoteIdent(rel.parentColumns[i]!)}`)
    .join(" and ");
  return (
    `select count(*)::bigint as mismatches ` +
    `from ${child} c join ${parent} p on ${onClause} ` +
    `where c.${tenant} is not null and p.${tenant} is not null ` +
    `and c.${tenant} <> p.${tenant}`
  );
}

/**
 * Planner row estimates — cheap, and accurate enough to size a probe.
 *
 * FIX (SCOPE-121 final wave, I4 — Important): this used to wrap the estimate
 * in `greatest(c.reltuples, 0)`, clamping Postgres's `-1` "never analyzed"
 * sentinel up to `0` before it ever left SQL. The raw value is now passed
 * through unclamped — `-1` survives into the returned `Map` — and
 * `probeIntegrity` below is what translates `-1` into the explicit
 * `"unknown"` state. Clamping here would have destroyed the distinction
 * before any caller had a chance to preserve it.
 */
export async function estimateRowCounts(
  connection: DbConnection,
): Promise<Map<string, number>> {
  const rows = await connection.query(
    `select c.relname as table_name, c.reltuples::bigint as rows
       from pg_catalog.pg_class c
       join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r','p')`,
  );
  return new Map(
    rows.map((r) => [String(r.table_name), Number(r.rows ?? 0)]),
  );
}

/**
 * Postgres's own sentinel for "this relation has never been ANALYZEd" —
 * `pg_class.reltuples` reports `-1` rather than an estimate. See
 * `estimateRowCounts` above.
 */
const NEVER_ANALYZED_SENTINEL = -1;

/** Translate a raw planner estimate into the explicit unknown/known split. */
function resolveChildRows(
  rowCounts: Map<string, number>,
  table: string,
): RowCountEstimate {
  const raw = rowCounts.get(table) ?? 0;
  return raw === NEVER_ANALYZED_SENTINEL ? "unknown" : raw;
}
// [SCOPE 121 / T009] END

// [SCOPE 121 / T009] BEGIN — Integrity probing
const DEFAULT_MAX_UNINDEXED_ROWS = 2_000_000;

/**
 * DEVIATION (controller decision, SCOPE-121/T009): `childColumnType` and
 * `parentColumnType` are single-column fields on `Relationship` (Task 8 did
 * not extend them to per-column arrays for composite keys, and Task 8 is not
 * to be modified here). For a composite relationship this checks only the
 * leading column pair. The alternative — extending `Relationship` with a
 * `childColumnTypes`/`parentColumnTypes` array — was rejected as
 * out-of-scope surgery on a file this task must not touch. Instead: a
 * composite relationship is treated as comparable only if its leading pair's
 * types match, and the skip message produced when that check fails says
 * explicitly that only the leading pair was examined, so a reader is never
 * left assuming every column pair was type-checked when only one was.
 */
function comparable(rel: Relationship): boolean {
  if (rel.childColumnType === "unknown" || rel.parentColumnType === "unknown") {
    return false;
  }
  return rel.childColumnType === rel.parentColumnType;
}

/**
 * FIX (SCOPE-121/T009, review round 1 — Finding 2, Important): distinguish
 * "one side of the relationship has no tenant column" (expected — most
 * relationships are not multi-tenant on both sides) from any other tenant
 * probe failure (permission error, network failure, a typo'd
 * `tenantColumn` naming a table that has neither side's column at all,
 * etc. — unexpected, worth investigating). Collapsing both into one
 * unlabelled `null` was the same silent-uniform-catch shape this file's own
 * design comment calls dishonest for the primary orphan probe.
 *
 * postgres.js (this project's driver — see engines/postgres/connect.ts)
 * attaches the raw wire-protocol error fields onto the thrown
 * `PostgresError`, including field `C` (SQLSTATE) as `.code`
 * (node_modules/postgres/src/connection.js `errorFields`, `67: 'code'` —
 * verified by reading the driver source). Postgres raises SQLSTATE `42703`
 * (undefined_column) when a referenced column does not exist, so
 * `error.code === "42703"` reliably identifies the expected case for a real
 * connection. The message-text fallback below only fires for errors that
 * never reached the driver's PostgresError shape at all (e.g. a locally
 * thrown `UnsafeIdentifierError` from `buildTenantQuery`, which has no
 * `.code`) — it is a safety net, not the primary signal.
 */
// MODIFIED-BY [SCOPE 121 / T010] — extracted the SQLSTATE/message check
// `describeTenantSkip` already performed into `classifyTenantError`, so
// `probeIntegrity` can record the SAME classification as a typed
// `OrphanProbe.tenantSkippedKind` instead of the caller (Task 10)
// re-deriving it by matching `describeTenantSkip`'s free-text message.
// The check itself is unchanged — same `.code === "42703"` primary signal,
// same message-regex fallback for errors with no `.code` (e.g. a locally
// thrown `UnsafeIdentifierError`) — only exposed as a reusable boolean-ish
// result rather than folded directly into the prose string.
function classifyTenantError(error: unknown): "column-missing" | "probe-error" {
  const code = (error as { code?: unknown } | null | undefined)?.code;
  const message = error instanceof Error ? error.message : String(error);
  if (code === "42703" || /column .* does not exist/i.test(message)) {
    return "column-missing";
  }
  return "probe-error";
}

function describeTenantSkip(
  error: unknown,
  tenantColumn: string,
  kind: "column-missing" | "probe-error",
): string {
  if (kind === "column-missing") {
    return (
      `tenant column "${tenantColumn}" does not exist on one side of the ` +
      "relationship (SQLSTATE 42703, undefined_column) — expected for a " +
      "relationship that is not multi-tenant on both sides"
    );
  }
  const message = error instanceof Error ? error.message : String(error);
  return `tenant probe failed: ${message}`;
}

/**
 * Measure orphans for every relationship.
 *
 * Every non-probe is RECORDED with its reason. A skipped anti-join that
 * reported zero would be indistinguishable from a clean relationship, which
 * would make the most valuable dimension in this tool quietly dishonest.
 */
export async function probeIntegrity(
  connection: DbConnection,
  relationships: Relationship[],
  options: ProbeOptions = {},
): Promise<OrphanProbe[]> {
  const rowCounts = options.rowCounts ?? new Map<string, number>();
  const ceiling = options.maxUnindexedRows ?? DEFAULT_MAX_UNINDEXED_ROWS;
  const results: OrphanProbe[] = [];

  for (const relationship of relationships) {
    const childRows = resolveChildRows(rowCounts, relationship.child);
    const base: OrphanProbe = {
      relationship,
      childRows,
      orphanRows: null,
      tenantMismatches: null,
      query: "",
    };

    if (!comparable(relationship)) {
      const compositeNote = relationship.isComposite
        ? " (composite key — only the leading column pair's types were checked)"
        : "";
      results.push({
        ...base,
        skipped:
          `child column is ${relationship.childColumnType} but parent key is ` +
          `${relationship.parentColumnType} — the comparison would require a ` +
          "cast, which no foreign key could express either" +
          compositeNote,
      });
      continue;
    }

    // FIX (SCOPE-121 final wave, I4 — Important): an unknown row count must
    // NOT be treated as "not below the ceiling is false" — i.e. it must
    // never silently behave like a small table. An unindexed table whose
    // size Postgres has never estimated is exactly the case this ceiling
    // exists to guard: proceed cautiously (skip, same as a confirmed-huge
    // table) rather than assume small just because there is no number to
    // compare.
    if (!relationship.indexedOnChild && (childRows === "unknown" || childRows > ceiling)) {
      results.push({
        ...base,
        skipped:
          `anti-join skipped: ${relationship.child}.${relationship.childColumn} is unindexed and ` +
          (childRows === "unknown"
            ? `its row count is unknown — ${relationship.child} has never been ` +
              `analyzed, so it is treated as exceeding the ceiling ${ceiling} out of caution`
            : `${relationship.child} holds ~${childRows} rows (ceiling ${ceiling})`) +
          ". Re-run with --deep to probe it anyway.",
      });
      continue;
    }

    // FIX (SCOPE-121/T009, review round 1 — Finding 1, Important): `query`
    // used to be built OUTSIDE this try block. `buildOrphanQuery` calls
    // `quoteIdent`, which THROWS on any identifier outside the plain
    // grammar — so one malformed catalog name propagated out of
    // `probeIntegrity` uncaught, aborting the whole function and discarding
    // every result already collected for every relationship probed before
    // it. Query construction now happens inside the try, so a build failure
    // becomes a recorded skip on that ONE relationship, and every other
    // relationship in the same call still gets its own result. `query`
    // stays "" (matching `base`) when construction itself failed, and is
    // only populated once `buildOrphanQuery` succeeds.
    let query = "";
    try {
      query = buildOrphanQuery(relationship);
      const rows = await connection.query(query);
      const orphanRows = Number(rows[0]?.orphans ?? 0);

      const probe: OrphanProbe = { ...base, query, orphanRows, tenantMismatches: null };

      if (options.tenantColumn) {
        // FIX (SCOPE-121 final wave, C1): build the tenant query and record it
        // on the probe BEFORE executing it, so `tenantQuery` is populated as
        // soon as the tenant sub-probe is attempted — whether or not the
        // subsequent `connection.query` call succeeds. Only a failure inside
        // `buildTenantQuery` itself (an unsafe identifier) leaves it unset,
        // matching the same "not attempted" convention `query` uses above.
        try {
          const tenantQuery = buildTenantQuery(relationship, options.tenantColumn);
          probe.tenantQuery = tenantQuery;
          const tenantRows = await connection.query(tenantQuery);
          probe.tenantMismatches = Number(tenantRows[0]?.mismatches ?? 0);
        } catch (tenantError) {
          probe.tenantMismatches = null;
          const kind = classifyTenantError(tenantError);
          probe.tenantSkipped = describeTenantSkip(tenantError, options.tenantColumn, kind);
          probe.tenantSkippedKind = kind;
        }
      }

      results.push(probe);
    } catch (error) {
      results.push({
        ...base,
        query,
        skipped: `probe failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
    }
  }

  return results;
}
// [SCOPE 121 / T009] END
