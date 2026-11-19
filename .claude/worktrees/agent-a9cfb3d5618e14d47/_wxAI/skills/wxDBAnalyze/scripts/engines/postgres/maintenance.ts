import type { DbConnection } from "../../core/engine.js";
import type { PgCapabilities } from "./capabilities.js";

// [SCOPE 121 / T020] BEGIN — Maintenance types
// MODIFIED-BY [SCOPE 121 / T020] — review round 1: `headroomFraction`'s doc
// now states it is unclamped and goes negative past the limit (Finding 3);
// `MaintenanceSnapshot` gained `freezeMaxAgeAssumed` so a consumer can tell a
// real configured `autovacuum_freeze_max_age` from the hardcoded default
// (Finding 1 — Critical, see `collectMaintenance` below).
export interface FreezeAge {
  table: string;
  age: number;
  /**
   * Fraction of autovacuum_freeze_max_age remaining as headroom, i.e.
   * (freezeMaxAge - age) / freezeMaxAge. 0 means at the limit (no headroom
   * left, forced autovacuum is imminent); 1.0 means the freeze age is 0.
   * Unclamped: once age exceeds freezeMaxAge this goes negative (e.g. age at
   * 1.5x the max yields -0.5) rather than floors at 0 — a consumer that
   * displays or formats this value must account for that itself.
   */
  headroomFraction: number;
}

export interface VacuumBlocker {
  kind: string;
  detail: string;
  ageSeconds: number;
}

/**
 * FIX (SCOPE-121 final fix wave, C1 — CRITICAL): a relation excluded from
 * `freezeAges` because its `relfrozenxid` cannot be trusted — most notably a
 * partitioned PARENT table, which has no storage of its own and therefore no
 * meaningful transaction-freeze horizon. Recorded rather than silently
 * dropped, so the exclusion is visible in the report instead of simply
 * absent from it.
 */
export interface FreezeAgeExclusion {
  table: string;
  reason: string;
}

export interface MaintenanceSnapshot {
  freezeAges: FreezeAge[];
  /**
   * FIX (SCOPE-121 final fix wave, C1 — CRITICAL): relations whose
   * `relfrozenxid` was not a real per-relation value — see `FreezeAgeExclusion`.
   */
  freezeAgeExcluded: FreezeAgeExclusion[];
  freezeMaxAge: number;
  /**
   * True when `freezeMaxAge` is the hardcoded 200,000,000 fallback because
   * the server's real `autovacuum_freeze_max_age` was not present in
   * `capabilities.settings` — as opposed to the server genuinely being
   * configured at (or defaulting to) that value. A tuned-down setting that
   * failed to reach `capabilities` for any reason will surface here rather
   * than silently understating how close a table is to forced autovacuum.
   */
  freezeMaxAgeAssumed: boolean;
  tableOptions: Map<string, string[]>;
  blockers: VacuumBlocker[];
  blockersUnavailable?: string;
  /** False unless pgstattuple is installed; bloat is then estimate-only. */
  bloatMeasurable: boolean;
  bloatUnavailable?: string;
}
// [SCOPE 121 / T020] END

// [SCOPE 121 / T020] BEGIN — Maintenance queries
// MODIFIED-BY (SCOPE-121 final fix wave, C1 — CRITICAL): a partitioned PARENT
// has no storage of its own, so `relfrozenxid` on its `pg_class` row is
// `InvalidTransactionId` (0) — not a real freeze horizon. `age(0)` returns
// INT_MAX (2147483647) for a non-normal xid, which used to be read as a
// genuine, catastrophic freeze age: a `critical`/`immediate` finding reading
// "only -973.7% of that budget remains" and recommending `vacuum` against a
// table that was never actually close to wraparound. `relkind = 'p'` is now
// excluded outright (a partitioned parent's real freeze exposure lives on its
// LEAF partitions, which already have `relkind = 'r'` and are already
// covered), and `c.relkind` plus the raw `c.relfrozenxid` are selected so
// `collectMaintenance` can also belt-and-braces-exclude any relation whose
// `relfrozenxid` is 0 for a reason other than being a partitioned parent
// (e.g. a relation kind future Postgres adds that behaves the same way).
// Every exclusion is recorded in `MaintenanceSnapshot.freezeAgeExcluded`
// rather than silently dropped.
export const FREEZE_AGE_SQL = `
  select c.relname as table_name,
         c.relkind as relkind,
         c.relfrozenxid::text as relfrozenxid,
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
 *
 * MODIFIED-BY [SCOPE 121 / T020] — review round 1 Finding 2 (Important): the
 * replication-slot branch used `where not active`, which only catches
 * abandoned slots. `active` reflects whether a walsender is currently
 * attached, not whether the slot is holding back the vacuum horizon — an
 * ACTIVE slot that is falling behind pins xmin/catalog_xmin exactly as
 * effectively as an inactive one. Per the PostgreSQL 15 docs for
 * `pg_replication_slots` (verified against
 * https://www.postgresql.org/docs/15/view-pg-replication-slots.html):
 * `wal_status` is `reserved` while the slot's claimed WAL is within
 * `max_wal_size`; `extended` once `max_wal_size` is exceeded but the files
 * are still retained; `unreserved` once the slot no longer retains the
 * required WAL and files are about to be removed at the next checkpoint
 * (recoverable back to reserved/extended); and `lost` once required WAL has
 * already been removed and the slot is unusable. `safe_wal_size` is the
 * remaining bytes before a slot enters `lost` (NULL when lost, or when
 * `max_slot_wal_keep_size` is -1/unlimited). The branch now also fires on
 * `wal_status in ('unreserved','lost')` regardless of `active`, since those
 * are the documented at-risk states; a generic "lagging" byte threshold is
 * not applied here because no single value is safe across configurations —
 * `wal_status`, `safe_wal_size`, and `active` are all surfaced in `detail`
 * so Task 21 can judge severity from the real numbers.
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
         'slot ' || slot_name || ' (' || coalesce(slot_type, '?') ||
           ', active=' || active ||
           ', wal_status=' || coalesce(wal_status, 'unknown') ||
           ', safe_wal_size=' || coalesce(safe_wal_size::text, 'unbounded') ||
           ') — ' ||
           case
             when not active and coalesce(wal_status, '') in ('unreserved', 'lost')
               then 'inactive and at risk of losing required WAL'
             when not active
               then 'inactive, holding back the xmin/WAL horizon'
             else 'active but wal_status indicates it is at risk of losing required WAL'
           end as detail,
         0::bigint as age_seconds
    from pg_catalog.pg_replication_slots
   where not active
      or wal_status in ('unreserved', 'lost')`;
// [SCOPE 121 / T020] END

// [SCOPE 121 / T020] BEGIN — Maintenance collection
// MODIFIED-BY [SCOPE 121 / T020] — review round 1 Finding 1 (Critical):
// `capabilities.settings.autovacuum_freeze_max_age` was always undefined
// because `TRACKED_SETTINGS` never listed the setting, so `freezeMaxAge`
// silently fell back to the hardcoded default on every run, including on a
// database where a DBA had tuned the real value down for wraparound safety —
// headroom would then be computed against a ceiling larger than the real
// one. `TRACKED_SETTINGS` in capabilities.ts now carries the setting; here,
// the fallback is kept (200,000,000 is the correct Postgres default) but is
// now recorded as an assumption via `freezeMaxAgeAssumed` rather than
// silently applied.
function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export async function collectMaintenance(
  connection: DbConnection,
  capabilities: PgCapabilities,
): Promise<MaintenanceSnapshot> {
  const configuredFreezeMaxAge = num(capabilities.settings.autovacuum_freeze_max_age);
  const freezeMaxAgeAssumed = configuredFreezeMaxAge <= 0;
  const freezeMaxAge = freezeMaxAgeAssumed ? 200_000_000 : configuredFreezeMaxAge;

  // FIX (SCOPE-121 final fix wave, C1 — CRITICAL): `relkind = 'p'` (a
  // partitioned parent) is excluded outright, and `relfrozenxid = 0`
  // (InvalidTransactionId) is excluded belt-and-braces even for a relation
  // kind that is not 'p' — both are recorded in `freezeAgeExcluded` rather
  // than silently dropped.
  const freezeAges: FreezeAge[] = [];
  const freezeAgeExcluded: FreezeAgeExclusion[] = [];
  for (const r of await connection.query(FREEZE_AGE_SQL)) {
    const table = String(r.table_name);
    const relkind = r.relkind === undefined ? undefined : String(r.relkind);
    const relfrozenxidRaw = r.relfrozenxid === undefined || r.relfrozenxid === null
      ? undefined
      : String(r.relfrozenxid);

    if (relkind === "p") {
      freezeAgeExcluded.push({
        table,
        reason:
          "partitioned PARENT table — it has no storage of its own, so relfrozenxid is not a " +
          "real per-relation value (it reads as InvalidTransactionId/0, and age(0) returns " +
          "INT_MAX rather than a genuine freeze age). Its leaf partitions carry the real " +
          "freeze exposure and are covered separately.",
      });
      continue;
    }
    if (relfrozenxidRaw === "0") {
      freezeAgeExcluded.push({
        table,
        reason:
          "relfrozenxid is InvalidTransactionId (0), so no meaningful freeze age can be " +
          "computed for this relation.",
      });
      continue;
    }

    const age = num(r.freeze_age);
    freezeAges.push({
      table,
      age,
      headroomFraction: freezeMaxAge > 0 ? (freezeMaxAge - age) / freezeMaxAge : 0,
    });
  }

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
    freezeAgeExcluded,
    freezeMaxAge,
    freezeMaxAgeAssumed,
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
