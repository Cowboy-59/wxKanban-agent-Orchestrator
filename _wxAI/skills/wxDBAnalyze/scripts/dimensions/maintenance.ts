import type { Confidence, Finding, Severity, Urgency } from "../core/finding.js";
import { quoteIdent } from "../core/identifiers.js";
import { isKnown } from "../core/metrics.js";
import type { PgCapabilities } from "../engines/postgres/capabilities.js";
import type {
  FreezeAge,
  FreezeAgeExclusion,
  MaintenanceSnapshot,
  VacuumBlocker,
} from "../engines/postgres/maintenance.js";
import type { StatsSnapshot, TableStats } from "../engines/postgres/stats.js";

// [SCOPE 121 / T021] BEGIN — Maintenance findings: statistics coverage
/**
 * Headline finding for this dimension. On a database where a large fraction
 * of tables have never been analyzed, one finding per table would bury every
 * other finding in the report — the same mistake the cross-tenant coverage
 * roll-up in `dimensions/integrity.ts` already corrected once. This is a
 * SINGLE roll-up finding stating the count, capped at the first 50 table
 * names in `evidence.rows` with the remaining count stated explicitly so the
 * list can never silently truncate.
 *
 * M1 (SCOPE-121 final fix wave, Minor): this comment used to hardcode
 * "218 of 259 tables" — a one-time production census that does not belong in
 * this doc comment. Deleted rather than corrected; the point being made does
 * not depend on the exact count.
 *
 * `whyItNeedsChanging` states both halves of the harm, because they are
 * different facts and both matter: the planner is flying blind on these
 * tables, AND every statistics-derived finding elsewhere in this very report
 * is unavailable for them — their apparent good health is an absence of
 * data, not evidence of health.
 */
function neverAnalyzedFinding(stats: StatsSnapshot): Finding | null {
  const names = stats.neverAnalyzed;
  if (names.length === 0) return null;

  const count = names.length;
  const total = stats.tables.size;
  const shown = names.slice(0, 50);
  const remaining = names.length - shown.length;
  const sample = names.slice(0, 10).join(", ");
  const sampleClause =
    names.length > 10 ? `${sample}, and ${names.length - 10} more` : sample;

  const rows: Record<string, unknown>[] = shown.map((table) => ({ table }));
  if (remaining > 0) {
    rows.push({ table: `(${remaining} more table(s), not shown)`, remainingCount: remaining });
  }

  return {
    id: "maintenance.never-analyzed",
    dimension: "maintenance",
    rule: "never-analyzed",
    subject: `${count} tables`,
    observation:
      `${count} of ${total} tables have never been analyzed — neither a manual ANALYZE ` +
      `nor autovacuum has ever run against them: ${sampleClause}.`,
    evidence: {
      query:
        "select relname from pg_catalog.pg_stat_user_tables " +
        "where last_analyze is null and last_autoanalyze is null",
      rows,
    },
    whyItNeedsChanging:
      "The planner is choosing join orders and scan strategies for these tables with no " +
      "idea how large they are or how their values are distributed — every plan touching " +
      "them is a guess dressed up as a decision. And it is not only the planner: every " +
      "statistics-derived metric elsewhere in this report — dead-tuple ratios, row " +
      "estimates, bloat — is unavailable for these same tables, so their apparent good " +
      "health in the rest of this report is an absence of data, not evidence of health.",
    businessImpact:
      "Queries touching these tables may pick sequential scans, bad join orders, or wrong " +
      "memory allocations with no warning, because the optimizer has nothing measured to " +
      "reason from.",
    severity: "high",
    urgency: "scheduled",
    remediation: {
      statements: ["analyze;"],
      fixClass: "manual-only",
      lockClass:
        "SHARE UPDATE EXCLUSIVE per table, held only while that table is scanned — does " +
        "not block reads or writes",
      estimatedDuration:
        `proportional to the combined size of all ${count} tables; runs online, one table ` +
        "at a time",
      rollback: "n/a — ANALYZE only refreshes planner statistics, it changes no data",
    },
    fixRisk:
      "ANALYZE reads a sample of rows from each table and has real I/O cost while it runs " +
      "across this many tables, but it takes no exclusive lock and does not block " +
      "concurrent reads or writes.",
    doingNothing:
      "The planner keeps flying blind on these tables, and every statistics-derived " +
      "finding in this report keeps excluding them — not because they are healthy, but " +
      "because nothing has ever measured them.",
    confidence: "proven",
  };
}
// [SCOPE 121 / T021] END

// [SCOPE 121 / T021] BEGIN — Maintenance findings: dead-tuple ratio
/**
 * Only ever computed for a table `isKnown` has confirmed both counters for —
 * a never-analyzed table's `liveTuples`/`deadTuples` are `UNKNOWN`, and a
 * ratio built from `UNKNOWN` would be fabricated, not measured.
 */
function deadTupleRatioFinding(table: TableStats, dead: number, total: number, ratio: number): Finding {
  const pct = (ratio * 100).toFixed(1);
  return {
    id: `maintenance.dead-tuple-ratio.${table.name}`,
    dimension: "maintenance",
    rule: "dead-tuple-ratio",
    subject: table.name,
    observation:
      `${table.name} has ${dead} dead tuples out of ${total} total rows (${pct}% dead).`,
    evidence: {
      query:
        "select n_live_tup, n_dead_tup from pg_catalog.pg_stat_user_tables " +
        `where relname = ${quoteIdent(table.name)}`,
      rows: [{ table: table.name, live_tuples: table.liveTuples, dead_tuples: table.deadTuples }],
    },
    whyItNeedsChanging:
      `${pct}% of ${table.name}'s rows are dead — versions superseded by an update or ` +
      "delete that autovacuum has not yet reclaimed. Every scan of this table, sequential " +
      "or index, reads and discards these dead versions before it reaches a live row.",
    businessImpact:
      `Queries against ${table.name} do more I/O than the live row count would suggest, ` +
      "and the table occupies more disk than its live data requires.",
    severity: ratio > 0.5 ? "high" : "medium",
    urgency: "scheduled",
    remediation: {
      statements: [`vacuum (analyze) ${quoteIdent(table.name)};`],
      fixClass: "manual-only",
      lockClass: "SHARE UPDATE EXCLUSIVE — does not block reads or writes",
      estimatedDuration: `proportional to ${total} rows; runs online`,
      rollback: "n/a — VACUUM only reclaims space, it changes no live data",
    },
    fixRisk:
      "VACUUM (ANALYZE) is routine maintenance; it does not block concurrent reads or " +
      "writes, though it competes for I/O bandwidth while it runs.",
    doingNothing:
      `Dead tuples keep accumulating, ${table.name} keeps bloating on disk, and every scan ` +
      "of it keeps paying to skip past rows nobody can see.",
    confidence: "proven",
  };
}
// [SCOPE 121 / T021] END

// [SCOPE 121 / T021] BEGIN — Maintenance findings: autovacuum disabled
// FIX (SCOPE-121 final fix wave, I2 — Important): the caller used to compare
// a reloption against the exact literal string "autovacuum_enabled=false".
// PostgreSQL preserves whatever boolean spelling the operator wrote — "off",
// "0", "f", "no", "n" (any case) are all equally valid and equally common —
// so a table using any spelling other than the one hardcoded string read as
// healthy. `findAutovacuumDisabledOption` parses the option properly and
// returns the ACTUAL matched option text, so the finding below reports what
// is really on the table rather than a fixed string that may not match it.
const AUTOVACUUM_FALSY_VALUES: ReadonlySet<string> = new Set([
  "false", "off", "0", "f", "no", "n",
]);

function findAutovacuumDisabledOption(options: string[]): string | null {
  for (const option of options) {
    const eq = option.indexOf("=");
    if (eq === -1) continue;
    const key = option.slice(0, eq).trim().toLowerCase();
    if (key !== "autovacuum_enabled") continue;
    const value = option.slice(eq + 1).trim().toLowerCase();
    if (AUTOVACUUM_FALSY_VALUES.has(value)) return option;
  }
  return null;
}

function autovacuumDisabledFinding(tableName: string, matchedOption: string): Finding {
  return {
    id: `maintenance.autovacuum-disabled.${tableName}`,
    dimension: "maintenance",
    rule: "autovacuum-disabled",
    subject: tableName,
    observation: `${tableName} has ${matchedOption} set in its storage options.`,
    evidence: {
      query:
        "select relname, reloptions from pg_catalog.pg_class where reloptions is not null",
      rows: [{ table: tableName, reloption: matchedOption }],
    },
    whyItNeedsChanging:
      `With autovacuum disabled, dead rows on ${tableName} accumulate without bound and ` +
      "its freeze age climbs unchecked until a manual VACUUM intervenes. This is " +
      "sometimes a deliberate choice for a table under bulk load, where autovacuum would " +
      "otherwise compete with the load for I/O — which is exactly why it must be surfaced " +
      "rather than assumed accidental: only a human reviewing this table's current " +
      "purpose can say whether it is still mid-load or was simply forgotten.",
    businessImpact:
      `${tableName} silently accumulates bloat and its transaction-wraparound freeze age ` +
      "climbs with no automatic backstop.",
    severity: "high",
    urgency: "scheduled",
    remediation: {
      statements: [`alter table ${quoteIdent(tableName)} set (autovacuum_enabled = true);`],
      fixClass: "manual-only",
      lockClass: "SHARE UPDATE EXCLUSIVE — brief, storage-option change only",
      estimatedDuration: "milliseconds",
      rollback: `alter table ${quoteIdent(tableName)} set (autovacuum_enabled = false);`,
    },
    fixRisk:
      "Re-enabling autovacuum on a table that is genuinely mid bulk-load reintroduces " +
      "contention for I/O during that load — confirm the table's current purpose before " +
      "flipping this back on.",
    doingNothing:
      `${tableName} keeps accumulating dead rows and its freeze age keeps climbing with no ` +
      "automatic maintenance to stop it.",
    confidence: "proven",
  };
}
// [SCOPE 121 / T021] END

// [SCOPE 121 / T021] BEGIN — Maintenance findings: freeze age
/**
 * SEMANTICS WARNING pinned by the controller brief: `headroomFraction` is the
 * fraction of `autovacuum_freeze_max_age` REMAINING, not consumed — 0 means
 * at the limit, 1.0 means the freeze age is zero. This fires when headroom
 * is LOW (`<= 0.2`), never when it is high, and the comparison is left
 * unclamped so it still fires for the negative values `headroomFraction`
 * takes on past the limit (see the doc comment on `FreezeAge.headroomFraction`
 * in `engines/postgres/maintenance.ts`).
 *
 * When `freezeMaxAgeAssumed` is true, the ceiling this was computed against
 * is the Postgres default, not a confirmed setting — the real ceiling may be
 * lower, so the urgency this finding states may be an understatement, and
 * that is said explicitly rather than left implicit.
 *
 * FIX (SCOPE-121 final fix wave, C1 — CRITICAL, belt and braces): the engine
 * layer now excludes partitioned parents and any zero `relfrozenxid` from
 * `freezeAges` outright (see `engines/postgres/maintenance.ts`), so a
 * fabricated INT_MAX freeze age should never reach this function. But the
 * severity/urgency computation below is deliberately left reading the RAW,
 * unclamped `headroomFraction` — a genuinely far-past-limit table should
 * still read as critical/immediate. Only the DISPLAYED percentage is
 * clamped, so no finding can ever print something like "-973.7%", which
 * reads as an implausible, untrustworthy number rather than as "very bad".
 */
function freezeAgeFinding(fa: FreezeAge, freezeMaxAge: number, assumed: boolean): Finding {
  const displayFraction = Math.max(fa.headroomFraction, -1);
  const headroomPct = (displayFraction * 100).toFixed(1);
  const atOrPastLimit = fa.headroomFraction <= 0;
  const severity: Severity = atOrPastLimit ? "critical" : fa.headroomFraction <= 0.1 ? "high" : "medium";
  const urgency: Urgency = atOrPastLimit ? "immediate" : "scheduled";
  const confidence: Confidence = assumed ? "inferred" : "proven";
  const assumedClause = assumed
    ? " autovacuum_freeze_max_age could not be read from this server, so the " +
      `${freezeMaxAge.toLocaleString()}-transaction ceiling used here is the Postgres ` +
      "default, assumed rather than confirmed — the real configured ceiling may be " +
      "lower, which would make this more urgent than stated here."
    : "";

  return {
    id: `maintenance.freeze-age.${fa.table}`,
    dimension: "maintenance",
    rule: "freeze-age",
    subject: fa.table,
    observation:
      `${fa.table} has a transaction freeze age of ${fa.age.toLocaleString()} against a ` +
      `configured autovacuum_freeze_max_age of ${freezeMaxAge.toLocaleString()} — only ` +
      `${headroomPct}% of that budget remains as headroom.${assumedClause}`,
    evidence: {
      query:
        "select relname, age(relfrozenxid) as freeze_age from pg_catalog.pg_class order by 2 desc",
      rows: [
        {
          table: fa.table,
          age: fa.age,
          freeze_max_age: freezeMaxAge,
          freeze_max_age_assumed: assumed,
          headroom_fraction: fa.headroomFraction,
        },
      ],
    },
    whyItNeedsChanging:
      `${fa.table} is running out of headroom before Postgres's transaction-id wraparound ` +
      `limit. Once its freeze age reaches ${freezeMaxAge.toLocaleString()}, Postgres forces ` +
      "an aggressive anti-wraparound autovacuum on this table that cannot be cancelled and " +
      "takes priority over other work until it completes.",
    businessImpact:
      "Once forced, the anti-wraparound autovacuum holds up other maintenance and consumes " +
      `I/O for as long as it takes to sweep ${fa.table}, with no way to defer or cancel it.`,
    severity,
    urgency,
    remediation: {
      statements: [`vacuum ${quoteIdent(fa.table)};`],
      fixClass: "manual-only",
      lockClass: "SHARE UPDATE EXCLUSIVE — does not block reads or writes",
      estimatedDuration: "proportional to table size; runs online",
      rollback:
        "n/a — VACUUM only reclaims space and advances relfrozenxid, it changes no live data",
    },
    fixRisk:
      "A manual VACUUM run now happens on a schedule this team controls; waiting lets " +
      "Postgres force it later, on its own schedule, with no way to defer it.",
    doingNothing:
      `${fa.table}'s freeze age keeps climbing until Postgres forces the anti-wraparound ` +
      "autovacuum itself.",
    confidence,
  };
}
// [SCOPE 121 / T021] END

// [SCOPE 121 / T021] BEGIN — Maintenance findings: vacuum blockers
/**
 * One finding per blocker. A `long-transaction` blocker prevents vacuum from
 * reclaiming any row version newer than its snapshot, database-wide, not
 * only in whatever table it is writing. A `replication-slot` blocker's
 * `detail` now carries `active`, `wal_status` and `safe_wal_size`
 * (`engines/postgres/maintenance.ts`, `BLOCKERS_SQL`) — this prose does not
 * assume the slot is abandoned, because an ACTIVE slot that is merely
 * lagging behind pins the same xmin/WAL horizon as an inactive one.
 */
function vacuumBlockedFinding(blocker: VacuumBlocker, index: number): Finding {
  const isLongTransaction = blocker.kind === "long-transaction";
  const mechanism = isLongTransaction
    ? "Vacuum cannot reclaim any row version newer than this transaction's snapshot, no " +
      "matter which table it touches — dead tuples accumulate database-wide for as long " +
      "as it stays open, not only in whichever table this transaction happens to be " +
      "writing."
    : "A replication slot pins the WAL and transaction-id horizon vacuum needs to " +
      "advance past. While it does, vacuum cannot reclaim dead tuples on ANY table, " +
      "whether the slot is actively streaming and merely falling behind, or has stopped " +
      "consuming entirely — an ACTIVE slot that is lagging blocks vacuum exactly as " +
      "effectively as an abandoned one, so this must not be assumed to be an abandoned " +
      "slot without checking its wal_status.";

  return {
    id: `maintenance.vacuum-blocked.${index}`,
    dimension: "maintenance",
    rule: "vacuum-blocked",
    subject: blocker.kind,
    observation: `${blocker.detail} (blocked for ${blocker.ageSeconds}s) is blocking vacuum.`,
    evidence: {
      query:
        "select pid, state, xact_start from pg_catalog.pg_stat_activity " +
        "union all select slot_name, active, wal_status, safe_wal_size from pg_catalog.pg_replication_slots",
      rows: [{ kind: blocker.kind, detail: blocker.detail, age_seconds: blocker.ageSeconds }],
    },
    whyItNeedsChanging: mechanism,
    businessImpact:
      "Dead tuples accumulate across the whole database while this blocker persists, " +
      "growing every table's bloat and pushing every table's freeze age closer to a " +
      "forced autovacuum.",
    severity: "high",
    urgency: "scheduled",
    remediation: {
      statements: [],
      fixClass: "manual-only",
      lockClass: "n/a — resolving the blocker is an operational decision, not DDL",
      estimatedDuration: "n/a",
      rollback: "n/a",
    },
    fixRisk: isLongTransaction
      ? "Terminating the blocking backend (pg_terminate_backend) is disruptive to " +
        "whatever session holds the transaction open and must be a deliberate decision, " +
        "not an automated one."
      : "Dropping a lagging or stalled replication slot permanently breaks that " +
        "subscriber's ability to resume without a fresh full sync — confirm it is truly " +
        "abandoned, using its wal_status, before dropping it.",
    doingNothing:
      "The blocker persists and vacuum keeps losing ground database-wide for as long as " +
      "it does.",
    confidence: "proven",
  };
}
// [SCOPE 121 / T021] END

// [SCOPE 121 / T021] BEGIN — Maintenance findings: unmeasurable / unavailable coverage
/** Emitted whenever `bloatMeasurable` is false — pgstattuple is not installed. */
function bloatUnmeasurableFinding(maint: MaintenanceSnapshot): Finding {
  const reason =
    maint.bloatUnavailable ??
    "pgstattuple is not installed, so physical bloat cannot be measured.";
  return {
    id: "maintenance.bloat-unmeasurable",
    dimension: "maintenance",
    rule: "bloat-unmeasurable",
    subject: "database-wide bloat",
    observation: reason,
    evidence: {
      query: "select extname from pg_catalog.pg_extension where extname = 'pgstattuple'",
      rows: [{ pgstattuple_installed: false }],
    },
    whyItNeedsChanging:
      "Physical bloat is not measured here, not zero — its absence from this report must " +
      "not be read as evidence these tables are unbloated; it is simply unknown.",
    businessImpact:
      "Bloat-driven disk growth and the query slowdown it causes could be present on any " +
      "table and would not show up anywhere in this report.",
    severity: "info",
    urgency: "deferred",
    remediation: {
      statements: [],
      fixClass: "none",
      lockClass: "n/a",
      estimatedDuration: "n/a",
      rollback: "n/a",
    },
    fixRisk:
      "None — this finding is informational. Installing pgstattuple, if desired, is a " +
      "separate operational decision outside this tool's scope.",
    doingNothing: "Physical bloat remains unmeasured and unmeasurable by this tool.",
    confidence: "proven",
  };
}

/** Emitted whenever `blockersUnavailable` is set — the blocker query could not run. */
function blockersUnknownFinding(maint: MaintenanceSnapshot): Finding {
  const reason = maint.blockersUnavailable ?? "vacuum-blocker query could not run";
  return {
    id: "maintenance.blockers-unknown",
    dimension: "maintenance",
    rule: "blockers-unknown",
    subject: "vacuum blockers",
    observation: `Vacuum blockers could not be checked: ${reason}`,
    evidence: {
      query:
        "select pid, state, xact_start from pg_catalog.pg_stat_activity " +
        "union all select slot_name, active, wal_status, safe_wal_size from pg_catalog.pg_replication_slots",
      rows: [{ reason }],
    },
    whyItNeedsChanging:
      "Whether anything is blocking vacuum right now is unknown, not clean — an " +
      "unreadable check must not be mistaken for a checked-and-clear result. Reading " +
      "other backends' pg_stat_activity and pg_replication_slots typically needs " +
      "pg_read_all_stats or superuser, which this connection may not have.",
    businessImpact:
      "A real blocker — a long-running transaction or a stalled replication slot — could " +
      "be active right now and would not appear anywhere in this report.",
    severity: "info",
    urgency: "deferred",
    remediation: {
      statements: [],
      fixClass: "none",
      lockClass: "n/a",
      estimatedDuration: "n/a",
      rollback: "n/a",
    },
    fixRisk:
      "None — informational only. Granting pg_read_all_stats to the auditing role would " +
      "restore coverage.",
    doingNothing:
      "Vacuum blockers remain unchecked on every future run until the role's privileges " +
      "change.",
    confidence: "inferred",
  };
}

// ADDITION (SCOPE-121 final fix wave, C1 — CRITICAL): the engine now excludes
// partitioned parents (and any zero-relfrozenxid relation) from `freezeAges`
// rather than fabricating a wraparound emergency out of them. That exclusion
// must still be VISIBLE — a reader must not be able to mistake "excluded
// because its freeze age is not meaningful" for "excluded because nothing was
// found here at all". One roll-up finding, same shape as `neverAnalyzedFinding`.
function freezeAgeExcludedFinding(excluded: FreezeAgeExclusion[]): Finding {
  const count = excluded.length;
  const shown = excluded.slice(0, 50);
  const remaining = excluded.length - shown.length;
  const sample = shown.slice(0, 10).map((e) => e.table).join(", ");
  const sampleClause =
    shown.length > 10 ? `${sample}, and ${shown.length - 10} more` : sample;
  const rows: Record<string, unknown>[] = shown.map((e) => ({ table: e.table, reason: e.reason }));
  if (remaining > 0) {
    rows.push({ table: `(${remaining} more, not shown)`, reason: "" });
  }

  return {
    id: "maintenance.freeze-age-excluded",
    dimension: "maintenance",
    rule: "freeze-age-excluded",
    subject: `${count} relation(s)`,
    observation:
      `${count} relation(s) were excluded from freeze-age checking because their ` +
      `relfrozenxid cannot be trusted — most commonly a partitioned parent table, which ` +
      `has no storage of its own: ${sampleClause}.`,
    evidence: {
      query:
        "select relname, relkind, relfrozenxid from pg_catalog.pg_class " +
        "where relkind in ('r','p','m')",
      rows,
    },
    whyItNeedsChanging:
      "A partitioned parent's relfrozenxid reads as InvalidTransactionId (0), and " +
      "age(0) returns INT_MAX rather than a real freeze age — treating that as measured " +
      "would fabricate a wraparound emergency that does not exist. These relations are " +
      "excluded rather than measured; their leaf partitions carry the real freeze " +
      "exposure and are checked normally.",
    businessImpact:
      "None directly — this is a coverage note, not a defect. It exists so an operator " +
      "does not mistake an excluded relation for a healthy one that was simply never " +
      "mentioned.",
    severity: "info",
    urgency: "deferred",
    remediation: {
      statements: [],
      fixClass: "none",
      lockClass: "n/a",
      estimatedDuration: "n/a",
      rollback: "n/a",
    },
    fixRisk: "None — informational only.",
    doingNothing: "These relations continue to be excluded from freeze-age checking, correctly.",
    confidence: "proven",
  };
}

// ADDITION (SCOPE-121 final fix wave, C3 — CRITICAL): with track_counts off,
// pg_stat_user_tables' activity counters (seq_scan, idx_scan, n_dead_tup, …)
// freeze at exactly 0 while the stats ROW still exists — so `isKnown` passes
// (the counter is genuinely present) even though its MEANING has changed from
// "measured zero" to "never counted at all". `dead-tuple-ratio` would read
// 0% dead on every table. Rather than let that happen silently, this single
// finding suppresses the affected rule and says why.
function maintenanceCountersDisabledFinding(): Finding {
  return {
    id: "maintenance.counters-disabled",
    dimension: "maintenance",
    rule: "counters-disabled",
    subject: "database-wide activity statistics",
    observation:
      "track_counts is off on this server, so pg_stat_user_tables' activity counters " +
      "(n_dead_tup, n_live_tup, seq_scan, and the rest) are not being collected — every " +
      "counter reads a genuine 0, not because nothing happened but because nothing is " +
      "being counted.",
    evidence: {
      query: "select setting from pg_catalog.pg_settings where name = 'track_counts'",
      rows: [{ track_counts: "off" }],
    },
    whyItNeedsChanging:
      "With track_counts off, a table's dead-tuple count reads 0% dead regardless of how " +
      "much dead-tuple bloat it actually carries — the counter is present and honestly " +
      "zero, but the MEANING of zero changed from 'measured, no dead tuples' to 'never " +
      "counted'. dead-tuple-ratio is suppressed entirely rather than risk reading a " +
      "bloated table as clean on fabricated evidence.",
    businessImpact:
      "This tool cannot detect dead-tuple bloat at all until track_counts is re-enabled — " +
      "that class of finding is silently absent from this report, not because nothing is " +
      "wrong but because nothing can be measured.",
    severity: "medium",
    urgency: "scheduled",
    remediation: {
      statements: ["alter system set track_counts = on;", "select pg_reload_conf();"],
      fixClass: "manual-only",
      lockClass: "n/a — server-level configuration change, takes effect on reload",
      estimatedDuration: "seconds — a config reload, not a data change",
      rollback: "alter system set track_counts = off; select pg_reload_conf();",
    },
    fixRisk:
      "track_counts should be on for any production server; disabling it is essentially " +
      "never intentional and its absence should be investigated before assuming it was " +
      "deliberate.",
    doingNothing:
      "dead-tuple-ratio stays suppressed, and this tool cannot tell a genuinely clean " +
      "table from one it simply cannot see.",
    confidence: "proven",
  };
}

/**
 * A global `autovacuum = off` is strictly worse than any per-table
 * `autovacuum_enabled=false` override — it silences maintenance across every
 * table on the server at once, including ones nobody remembered to check —
 * and deserves its own critical finding rather than staying invisible next to
 * the per-table findings this dimension already reports.
 */
function globalAutovacuumDisabledFinding(): Finding {
  return {
    id: "maintenance.autovacuum-disabled-globally",
    dimension: "maintenance",
    rule: "autovacuum-disabled-globally",
    subject: "server-wide autovacuum",
    observation:
      "autovacuum is set to off at the server level — no table on this server is being " +
      "auto-vacuumed or auto-analyzed, regardless of any per-table override.",
    evidence: {
      query: "select setting from pg_catalog.pg_settings where name = 'autovacuum'",
      rows: [{ autovacuum: "off" }],
    },
    whyItNeedsChanging:
      "A global autovacuum=off is strictly worse than any per-table autovacuum_enabled=" +
      "false override this dimension can also detect: it silences maintenance across " +
      "every table in every database on this server at once, including ones nobody " +
      "remembered to check. Dead tuples accumulate and freeze ages climb everywhere with " +
      "nothing to intervene, until a manual VACUUM catches up or transaction-id " +
      "wraparound forces the issue.",
    businessImpact:
      "Every table on this server accumulates dead rows and advances toward its freeze-" +
      "age limit with zero automatic maintenance running anywhere.",
    severity: "critical",
    urgency: "immediate",
    remediation: {
      statements: ["alter system set autovacuum = on;", "select pg_reload_conf();"],
      fixClass: "manual-only",
      lockClass: "n/a — server-level configuration change, takes effect on reload",
      estimatedDuration: "seconds — a config reload, not a data change",
      rollback: "alter system set autovacuum = off; select pg_reload_conf();",
    },
    fixRisk:
      "Turning autovacuum back on can trigger a burst of catch-up vacuum activity across " +
      "every table with a backlog; consider whether that competes with a maintenance " +
      "window before applying.",
    doingNothing:
      "Every table on this server keeps bloating and every freeze age keeps climbing " +
      "with nothing automatic to stop it.",
    confidence: "proven",
  };
}
// [SCOPE 121 / T021] END

// [SCOPE 121 / T021] BEGIN — Maintenance analysis
/**
 * Pure: turns a `MaintenanceSnapshot` and `StatsSnapshot` into
 * contract-complete `Finding[]`. No I/O, no database, no clock, no
 * randomness — every fact comes from the snapshots passed in.
 *
 * MODIFIED-BY (SCOPE-121 final fix wave, C3 — CRITICAL): `capabilities` is a
 * new, OPTIONAL third parameter so every existing caller/test that does not
 * pass it keeps its prior behaviour unchanged (undefined means "not known" —
 * the track_counts/autovacuum checks below simply do not run, exactly as
 * before this fix). `cli.ts` always passes the real, already-collected
 * `PgCapabilities` in production.
 */
export function analyzeMaintenance(
  maint: MaintenanceSnapshot,
  stats: StatsSnapshot,
  capabilities?: PgCapabilities,
): Finding[] {
  const findings: Finding[] = [];

  const rollup = neverAnalyzedFinding(stats);
  if (rollup) findings.push(rollup);

  const countersDisabled =
    capabilities !== undefined && capabilities.settings.track_counts !== "on";

  if (countersDisabled) {
    findings.push(maintenanceCountersDisabledFinding());
  } else {
    for (const table of stats.tables.values()) {
      if (!isKnown(table.liveTuples) || !isKnown(table.deadTuples)) continue;
      const total = table.liveTuples + table.deadTuples;
      if (total <= 1000) continue;
      const ratio = table.deadTuples / total;
      if (ratio <= 0.2) continue;
      findings.push(deadTupleRatioFinding(table, table.deadTuples, total, ratio));
    }
  }

  for (const [tableName, options] of maint.tableOptions) {
    const matched = findAutovacuumDisabledOption(options);
    if (matched) findings.push(autovacuumDisabledFinding(tableName, matched));
  }

  if (capabilities !== undefined && capabilities.settings.autovacuum !== "on") {
    findings.push(globalAutovacuumDisabledFinding());
  }

  for (const fa of maint.freezeAges) {
    if (fa.headroomFraction <= 0.2) {
      findings.push(freezeAgeFinding(fa, maint.freezeMaxAge, maint.freezeMaxAgeAssumed));
    }
  }

  if (maint.freezeAgeExcluded.length > 0) {
    findings.push(freezeAgeExcludedFinding(maint.freezeAgeExcluded));
  }

  maint.blockers.forEach((blocker, index) => {
    findings.push(vacuumBlockedFinding(blocker, index));
  });

  if (!maint.bloatMeasurable) {
    findings.push(bloatUnmeasurableFinding(maint));
  }

  if (maint.blockersUnavailable !== undefined) {
    findings.push(blockersUnknownFinding(maint));
  }

  return findings;
}
// [SCOPE 121 / T021] END
