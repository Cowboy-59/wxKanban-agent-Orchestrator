// _wxAI/skills/wxDBAnalyze/scripts/dimensions/performance.ts
import type { Finding, Remediation } from "../core/finding.js";
import { isKnown } from "../core/metrics.js";
import { quoteIdent } from "../core/identifiers.js";
import type { PgCapabilities } from "../engines/postgres/capabilities.js";
import type { IndexStat, PerformanceSnapshot, StatementStat } from "../engines/postgres/performance.js";
import type { StatsSnapshot, TableStats } from "../engines/postgres/stats.js";

// [SCOPE 121 / T019] BEGIN — Performance remediation helpers
const NO_STATEMENT: Remediation = {
  statements: [],
  fixClass: "manual-only",
  lockClass: "n/a — no statement is generated",
  estimatedDuration: "n/a",
  rollback: "n/a",
};

/**
 * `pg_stat_*` scan counters accumulate since the last stats reset, not since
 * the index was created — a real 0 still deserves the "manual-only" caveat
 * baked into every remediation below rather than an unqualified "safe to
 * drop".
 */
function subjectFor(idx: IndexStat): string {
  return `${idx.table}.${idx.name}`;
}

/**
 * Turns a captured `CREATE INDEX` definition into its CONCURRENTLY form, so a
 * generated rebuild never takes the exclusive lock the original DDL might
 * have. Both plain and UNIQUE index definitions are handled; anything else is
 * returned unchanged rather than guessed at.
 */
function toConcurrentDefinition(definition: string): string {
  if (/^create unique index /i.test(definition)) {
    return definition.replace(/^create unique index /i, "create unique index concurrently ");
  }
  if (/^create index /i.test(definition)) {
    return definition.replace(/^create index /i, "create index concurrently ");
  }
  return definition;
}
// [SCOPE 121 / T019] END

// [SCOPE 121 / T019] BEGIN — unused-index
/**
 * `scans === 0` only ever compares a KNOWN measurement. `UNKNOWN` means the
 * index has no row in `pg_stat_user_indexes` at all — most notably a
 * partitioned table's PARENT index, whose leaf partitions carry the real scan
 * activity — and must never be read as "unused". Firing here on `UNKNOWN`
 * would recommend `DROP INDEX` against an index that is, for all this view
 * can see, actively used through its leaves: fabricated evidence backing a
 * destructive statement, exactly what this tool exists to prevent.
 *
 * FIX (SCOPE-121/T019, review round 1 — Finding 2, Important): an invalid
 * index also excludes `!idx.isValid`. Its zero scan count is not evidence
 * that nobody needs it — it is a structural consequence of the planner
 * refusing to use ANY invalid index, which `invalid-index` already reports at
 * higher severity with the correct fix (recreate it). Without this guard the
 * same object produced both findings with contradictory framing:
 * `unused-index` said low/deferred, "nobody reads it, cannot be cheaply
 * recreated", while `invalid-index` correctly said high/scheduled, "the fix
 * is to recreate it" — for the identical index. This was live in the brief's
 * own `idx_broken` fixture (defaults to `scans: 0`, never overridden).
 *
 * FIX (SCOPE-121 final fix wave, I5a — Important): an index on a table with
 * a KNOWN-empty row count now also excludes it. Zero scans on a table with
 * zero rows is zero scans by CONSTRUCTION — nobody could possibly have a
 * reason to read an empty table through this index yet — not by measurement
 * of anything meaningful, and must not carry `confidence: "proven"` or a
 * DROP statement as if genuine read traffic had been observed and absent.
 *
 * TWO sources feed this, in preference order, because a live run against
 * production showed the first-considered option alone (`TableStats.liveTuples`)
 * barely helps: `liveTuples` is ANALYZE-derived, and on this database most
 * tables — including most empty ones — have never been analyzed, so
 * `liveTuples` stays UNKNOWN for exactly the tables this fix targets.
 *   1. `knownEmptyTables` — the set of tables the DATA dimension already
 *      measured as exactly zero rows via `count(*)` (`DataSnapshot.rowCount`,
 *      the same source `data.empty-table` findings come from) — independent
 *      of ANALYZE status, so it catches a never-analyzed empty table too.
 *      Only populated when the `data` dimension also ran this pass.
 *   2. `table.liveTuples === 0` (ANALYZE-derived) — kept as a fallback so a
 *      `--dimension performance` run on its own, with no `DataSnapshot` ever
 *      collected, still gets SOME protection rather than none.
 */
function isUnused(
  idx: IndexStat,
  table: TableStats | undefined,
  knownEmptyTables?: ReadonlySet<string>,
): boolean {
  if (knownEmptyTables?.has(idx.table)) return false;
  if (table !== undefined && isKnown(table.liveTuples) && table.liveTuples === 0) {
    return false;
  }
  return (
    isKnown(idx.scans) &&
    idx.scans === 0 &&
    idx.isValid &&
    !idx.isPrimary &&
    !idx.isUnique
  );
}

function unusedIndex(idx: IndexStat, table: TableStats | undefined): Finding {
  const inserts = table?.inserts;
  const insertsClause =
    inserts === undefined
      ? "insert activity unknown — no statistics are collected for this table"
      : `${inserts} inserts`;
  const dropStatement = `drop index concurrently ${quoteIdent(idx.name)};`;
  return {
    id: `performance.unused-index.${idx.table}.${idx.name}`,
    dimension: "performance",
    rule: "unused-index",
    subject: subjectFor(idx),
    observation:
      `${subjectFor(idx)} is ${idx.bytes} bytes and has recorded zero scans since ` +
      `the statistics were last reset, while ${idx.table} has recorded ${insertsClause}.`,
    evidence: {
      query: "select idx_scan from pg_catalog.pg_stat_user_indexes where indexrelid = $index",
      rows: [
        {
          table: idx.table,
          index: idx.name,
          bytes: idx.bytes,
          scans: idx.scans,
          inserts: inserts ?? "unknown",
        },
      ],
    },
    whyItNeedsChanging:
      `Every insert into ${idx.table} — ${insertsClause} so far — updates ` +
      `${idx.name} in addition to the table itself, and the index's ${idx.bytes} ` +
      "bytes compete for space in the buffer cache on every access to that " +
      "table, for a structure no recorded query has ever read.",
    businessImpact:
      `${idx.bytes} bytes of storage and a write penalty on every one of ` +
      `${insertsClause} to ${idx.table} are being spent maintaining a structure ` +
      "that provides no read benefit today.",
    severity: "low",
    urgency: "deferred",
    remediation: {
      statements: [dropStatement],
      fixClass: "manual-only",
      lockClass: "SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes",
      estimatedDuration: "proportional to index size; runs online",
      rollback: `${idx.definition};`,
    },
    fixRisk:
      "DROP INDEX CONCURRENTLY cannot run inside a transaction block, so it " +
      "must be issued on its own. If a future query does need this access " +
      "path, the index cannot be cheaply recreated — rebuilding it against a " +
      `grown ${idx.table} costs a full index build, not a rollback.`,
    doingNothing:
      `${idx.name} keeps paying its write and storage cost on every future ` +
      `insert into ${idx.table} without ever being read.`,
    confidence: "proven",
  };
}
// [SCOPE 121 / T019] END

// [SCOPE 121 / T019] BEGIN — duplicate-index
// FIX (SCOPE-121 final fix wave, C2 — CRITICAL): `INDEX_STATS_SQL` renders
// EVERY expression column as the literal placeholder string "(expression)"
// (see `engines/postgres/performance.ts`), and the old grouping key joined
// `idx.columns` — so `lower(email)` and `upper(name)` both keyed to
// `table::(expression)` and were reported as duplicates of one another
// despite indexing entirely unrelated data, with a generated
// `drop index concurrently` statement for one of them. The same key also
// ignored a partial index's `WHERE` predicate, opclass, and sort order — two
// indexes covering different subsets of rows, or ordered differently, still
// collapsed into one "duplicate" group.
//
// Any index whose `columns` contains the expression placeholder, or whose
// `definition` carries a `WHERE` clause, is now refused from grouping
// entirely — it is structurally impossible to tell from the placeholder
// alone whether two expression indexes are the same expression, and a
// partial predicate changes which rows an index covers regardless of its
// column list. Every other index groups on its NORMALISED `definition`
// (the captured `CREATE INDEX` text with the index's own name blanked out)
// rather than on the column list — this also incidentally fixes the same
// class of defect for opclass and sort order, since either difference now
// shows up as a different definition and no longer collapses two distinct
// indexes together.
function isExpressionOrPartial(idx: IndexStat): boolean {
  return idx.columns.includes("(expression)") || /\bwhere\b/i.test(idx.definition);
}

/**
 * Blank out the index's own name in its captured definition so two indexes
 * that are structurally identical except for what they are called still
 * group — while any OTHER difference (columns, expression, opclass, sort
 * order, USING method, INCLUDE list, collation) makes them distinct, because
 * it survives into the normalised string unchanged.
 */
function normalizedDefinitionKey(idx: IndexStat): string {
  const normalized = idx.definition.replace(
    /^(create\s+(?:unique\s+)?index\s+(?:concurrently\s+)?)\S+/i,
    "$1<name>",
  );
  return `${idx.table}::${normalized}`;
}

/**
 * Prefer keeping a VALID constraint-bearing index, then any VALID index,
 * before ever falling back to an invalid one.
 *
 * FIX (SCOPE-121/T019, review round 1 — Finding 1, Important): this used to
 * order purely by `isPrimary` / `isUnique` with no validity check, so an
 * INVALID primary-key index could be chosen as the "keeper" over a working
 * plain index in the same group — the remediation would then drop the only
 * functioning index on those columns while keeping the broken one, exactly
 * the "destructive change that makes things worse" failure this tool exists
 * to prevent. `group[0]` is now reached only when every member is invalid —
 * `duplicateIndex` below checks for that case explicitly and changes its
 * prose and remediation rather than silently presenting an unusable index as
 * a safe survivor.
 */
function pickKeeper(group: IndexStat[]): IndexStat {
  return (
    group.find((i) => i.isValid && i.isPrimary) ??
    group.find((i) => i.isValid && i.isUnique) ??
    group.find((i) => i.isValid) ??
    group[0]!
  );
}

function duplicateIndex(group: IndexStat[]): Finding {
  const table = group[0]!.table;
  const columns = group[0]!.columns.join(", ");
  const names = group.map((i) => i.name);
  const totalBytes = group.reduce((sum, i) => sum + i.bytes, 0);
  const keeper = pickKeeper(group);
  const redundant = group.filter((i) => i !== keeper);
  // FIX (SCOPE-121/T019, review round 1 — Finding 1): true only when
  // `pickKeeper` had no valid candidate at all and fell back to `group[0]`.
  const allInvalid = group.every((i) => !i.isValid);

  const situationClause = allInvalid
    ? ` Every index in this group is invalid — none of them currently function, ` +
      "so the duplication provides no working index at all despite " +
      `${group.length} copies on disk. Rebuild one of them first (see the ` +
      "related invalid-index findings) before deciding which copy to keep."
    : "";

  return {
    id: `performance.duplicate-index.${table}.${group.map((i) => i.name).join(".")}`,
    dimension: "performance",
    rule: "duplicate-index",
    subject: `${table} (${columns})`,
    observation:
      `${table} carries ${group.length} indexes on the same columns (${columns}): ` +
      `${names.join(", ")}, together ${totalBytes} bytes.${situationClause}`,
    evidence: {
      query: "select relname, indkey from pg_catalog.pg_index where indrelid = $table group by indkey",
      rows: group.map((i) => ({
        table: i.table,
        index: i.name,
        columns: i.columns.join(","),
        valid: i.isValid,
        bytes: i.bytes,
      })),
    },
    whyItNeedsChanging: allInvalid
      ? `${table} has ${group.length} indexes on (${columns}) and every one of ` +
        `them is invalid, so none is available to the planner. This is not an ` +
        "ordinary duplication where one survivor keeps the table covered — " +
        "there is currently no working index on these columns at all."
      : `Every insert, update, or delete on ${table} maintains all ${group.length} ` +
        `of these indexes — ${names.join(", ")} — because they cover the identical ` +
        "column set, but the planner only ever chooses one of them to satisfy a " +
        "given query. The extras pay full write cost for zero additional read benefit.",
    businessImpact: allInvalid
      ? `${table} currently has no working index on (${columns}) despite ` +
        `${group.length} indexes on disk consuming ${totalBytes} bytes between them.`
      : `${totalBytes} bytes across ${group.length} indexes where one would serve ` +
        `every query the redundant ones could also serve, plus the write cost of ` +
        "maintaining every copy on every change to the table.",
    severity: "medium",
    urgency: "scheduled",
    remediation: allInvalid
      ? {
          statements: [],
          fixClass: "manual-only",
          lockClass: "n/a — no statement is generated",
          estimatedDuration: "n/a",
          rollback: "n/a",
        }
      : {
          statements: redundant.map((i) => `drop index concurrently ${quoteIdent(i.name)};`),
          fixClass: "manual-only",
          lockClass: "SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes",
          estimatedDuration: "proportional to index size; runs online",
          rollback: redundant.map((i) => `${i.definition};`).join(" "),
        },
    fixRisk: allInvalid
      ? "No drop is recommended here: with every copy invalid, dropping all of " +
        "them first would leave the table with no index on these columns at all " +
        "for longer than necessary. Resolve at least one invalid-index finding " +
        "in this group before reassessing the duplication."
      : "Confirm the surviving index's options (uniqueness, opclass, sort order) " +
        "cover every use case of the ones being dropped before dropping them — " +
        "two indexes on the same columns can still differ in those details.",
    doingNothing: allInvalid
      ? `${table} keeps having no working index on (${columns}) while still ` +
        `paying storage for ${group.length} broken copies.`
      : `${table} keeps paying the write and storage cost of ${group.length} ` +
        "indexes doing the work of one.",
    confidence: "proven",
  };
}

// ADDITION (SCOPE-121 final fix wave, C2 — CRITICAL): expression and partial
// indexes are refused from duplicate-index grouping (see `isExpressionOrPartial`
// above) because this tool cannot safely compare them by column list alone.
// That exclusion must be visible rather than silent — one roll-up finding,
// same shape as the maintenance dimension's `never-analyzed` roll-up.
function duplicateCheckSkippedFinding(excluded: IndexStat[]): Finding {
  const count = excluded.length;
  const shown = excluded.slice(0, 50);
  const remaining = excluded.length - shown.length;
  const names = shown.map((i) => `${i.table}.${i.name}`);
  const sample = names.slice(0, 10).join(", ");
  const sampleClause = names.length > 10 ? `${sample}, and ${names.length - 10} more` : sample;
  const rows: Record<string, unknown>[] = shown.map((i) => ({
    table: i.table,
    index: i.name,
    reason: i.columns.includes("(expression)") ? "expression index" : "partial index (WHERE predicate)",
  }));
  if (remaining > 0) {
    rows.push({ table: `(${remaining} more, not shown)`, index: "", reason: "" });
  }

  return {
    id: "performance.duplicate-check-skipped",
    dimension: "performance",
    rule: "duplicate-check-skipped",
    subject: `${count} index(es)`,
    observation:
      `${count} index(es) were excluded from duplicate-index detection because they are ` +
      "expression indexes or carry a partial WHERE predicate, neither of which this " +
      `tool's column-list grouping can compare safely: ${sampleClause}.`,
    evidence: {
      query:
        "select indexrelid, pg_get_indexdef(indexrelid) from pg_catalog.pg_index " +
        "where indexrelid in (select oid from pg_catalog.pg_class where relkind = 'i')",
      rows,
    },
    whyItNeedsChanging:
      "Two expression indexes both reporting the identical placeholder column name " +
      "\"(expression)\" are not necessarily duplicates — lower(email) and upper(name) " +
      "would collapse into one group under a naive column-list comparison despite " +
      "indexing entirely different data — and a partial index's WHERE predicate changes " +
      "which rows it covers even when its columns match a full index exactly. Grouping " +
      "either kind by column list alone risks recommending DROP INDEX CONCURRENTLY " +
      "against an index that is not actually redundant.",
    businessImpact:
      "These indexes are not checked for redundancy at all by this tool; a genuine " +
      "duplicate among them would not be reported.",
    severity: "info",
    urgency: "deferred",
    remediation: {
      statements: [],
      fixClass: "none",
      lockClass: "n/a",
      estimatedDuration: "n/a",
      rollback: "n/a",
    },
    fixRisk: "None — this finding is informational; review these indexes manually for redundancy if desired.",
    doingNothing: "These indexes remain unchecked for duplication by this tool.",
    confidence: "proven",
  };
}
// [SCOPE 121 / T019] END

// [SCOPE 121 / T019] BEGIN — invalid-index
function invalidIndex(idx: IndexStat): Finding {
  const recreate = toConcurrentDefinition(idx.definition);
  return {
    id: `performance.invalid-index.${idx.table}.${idx.name}`,
    dimension: "performance",
    rule: "invalid-index",
    subject: subjectFor(idx),
    observation:
      `${subjectFor(idx)} is marked invalid — its build did not complete — and ` +
      `occupies ${idx.bytes} bytes on disk.`,
    evidence: {
      query: "select indisvalid from pg_catalog.pg_index where indexrelid = $index",
      rows: [{ table: idx.table, index: idx.name, bytes: idx.bytes, valid: false }],
    },
    whyItNeedsChanging:
      `An invalid index is not used by the planner at all — Postgres leaves it ` +
      "on disk after a failed CREATE INDEX CONCURRENTLY (most commonly, one " +
      "that hit a constraint violation or was cancelled mid-build) but never " +
      `considers it for a query plan. ${idx.name} still costs ${idx.bytes} ` +
      "bytes of storage and, if it is unique, enforces no constraint at all — " +
      "it looks like protection that is not actually there.",
    businessImpact:
      `${idx.bytes} bytes are held by a structure that speeds up no query and, ` +
      `if ${idx.name} was meant to be unique, enforces no uniqueness — any code ` +
      "relying on that constraint existing is relying on nothing.",
    severity: "high",
    urgency: "scheduled",
    remediation: {
      statements: [
        `drop index concurrently ${quoteIdent(idx.name)};`,
        `${recreate};`,
      ],
      fixClass: "manual-only",
      lockClass: "SHARE UPDATE EXCLUSIVE — concurrent drop and rebuild, does not block reads or writes",
      estimatedDuration: "proportional to index size; runs online",
      rollback: "n/a — the index is already invalid; there is no working state to return to",
    },
    fixRisk:
      "CREATE INDEX CONCURRENTLY can fail again for the same reason it failed " +
      "before (commonly a constraint violation in the data); investigate the " +
      "cause before assuming a retry will succeed.",
    doingNothing:
      `${idx.name} keeps occupying ${idx.bytes} bytes while enforcing and ` +
      "accelerating nothing.",
    confidence: "proven",
  };
}
// [SCOPE 121 / T019] END

// [SCOPE 121 / T019] BEGIN — seq-scan-heavy
const SEQ_SCAN_ROW_FLOOR = 1000;
const SEQ_SCAN_COUNT_FLOOR = 100;

/**
 * Only judged when the row count is a real ANALYZE-derived measurement.
 * A never-analyzed table has no `liveTuples` at all — `isKnown` narrows that
 * out before any of the numeric thresholds are even reached — so this never
 * fires on a table nobody has ever measured. The maintenance dimension
 * reports the missing statistics themselves; this dimension only reports what
 * the statistics say once they exist.
 */
function isSeqScanHeavy(t: TableStats): boolean {
  return (
    isKnown(t.liveTuples) &&
    t.liveTuples > SEQ_SCAN_ROW_FLOOR &&
    t.seqScan > SEQ_SCAN_COUNT_FLOOR &&
    t.seqScan > t.idxScan
  );
}

function seqScanHeavy(t: TableStats): Finding {
  const liveTuples = isKnown(t.liveTuples) ? t.liveTuples : 0;
  return {
    id: `performance.seq-scan-heavy.${t.name}`,
    dimension: "performance",
    rule: "seq-scan-heavy",
    subject: t.name,
    observation:
      `${t.name} has been sequentially scanned ${t.seqScan} times against ` +
      `${t.idxScan} index scans, reading ${t.seqTupRead} rows via sequential ` +
      `scan out of ~${liveTuples} live rows.`,
    evidence: {
      query: "select seq_scan, idx_scan, seq_tup_read, n_live_tup from pg_catalog.pg_stat_user_tables",
      rows: [
        {
          table: t.name,
          seq_scan: t.seqScan,
          idx_scan: t.idxScan,
          seq_tup_read: t.seqTupRead,
          live_tuples: liveTuples,
        },
      ],
    },
    whyItNeedsChanging:
      `${t.name} has ${liveTuples} live rows — large enough that a sequential ` +
      `scan reads the whole table every time — and has been scanned that way ` +
      `${t.seqScan} times against only ${t.idxScan} index scans. Whatever ` +
      "predicate these queries filter on has no supporting index, so every one " +
      "of them pays a full-table read instead of a targeted lookup.",
    businessImpact:
      `Each of the ${t.seqScan} sequential scans reads on the order of ` +
      `${liveTuples} rows instead of the handful an index lookup would touch, ` +
      "and the cost grows as the table grows.",
    severity: "medium",
    urgency: "scheduled",
    remediation: NO_STATEMENT,
    fixRisk:
      "No index is generated automatically here because the columns these " +
      "scans filter on are not visible from table-level counters alone — " +
      "identify them from the query text (see the statement-statistics " +
      "findings) before adding an index.",
    doingNothing:
      `${t.name} keeps paying a full-table read for every one of these ` +
      "queries, and the cost grows with every row inserted.",
    confidence: "proven",
  };
}
// [SCOPE 121 / T019] END

// [SCOPE 121 / T019] BEGIN — no-statement-stats
function noStatementStats(reason: string): Finding {
  return {
    id: "performance.no-statement-stats",
    dimension: "performance",
    rule: "no-statement-stats",
    subject: "query performance monitoring",
    observation: reason,
    evidence: {
      query: "select 1 from pg_extension where extname = 'pg_stat_statements'",
      rows: [{ reason }],
    },
    whyItNeedsChanging:
      "Without statement statistics this tool cannot rank queries by cost at " +
      "all — it has no visibility into which queries actually run, how often, " +
      "or how long they take. Every performance finding in this report is " +
      "therefore structural, derived only from the schema and table counters, " +
      "and none of it is derived from what the database is actually spending " +
      "its time on — the report is blind to the workload itself.",
    businessImpact:
      "The performance findings in this report cover only what the schema and " +
      "table-level counters can show. Whichever queries are actually slowest " +
      "in production are invisible until this is enabled.",
    severity: "medium",
    urgency: "scheduled",
    remediation: { ...NO_STATEMENT, fixClass: "none" },
    fixRisk:
      "Creating the extension is a single DDL statement, but enabling " +
      "collection where it is not already preloaded requires a change to " +
      "shared_preload_libraries and a server restart.",
    doingNothing:
      "Query-level cost stays invisible; this report can only reason from " +
      "schema and table shape, never from actual query behaviour.",
    confidence: "proven",
  };
}
// [SCOPE 121 / T019] END

// [SCOPE 121 / T019] BEGIN — slow-statement
// ADDITION (SCOPE-121 final fix wave, I1 — Important): `collectPerformance`
// (engines/postgres/performance.ts) populates `PerformanceSnapshot.statements`
// from pg_stat_statements' top-50-by-total-time query, but until this fix
// `analyzePerformance` never read it — the collected data was queried and
// then thrown away, so installing pg_stat_statements produced LESS output
// from this tool (the no-statement-stats finding disappears and nothing
// replaces it). This is the ranking option, chosen over emitting a single
// "statement stats exist but are not analysed" placeholder, because
// pg_stat_statements is exactly the kind of workload-derived evidence this
// report is otherwise structurally blind to (see `noStatementStats` above) —
// throwing it away after collecting it is the one outcome the design
// explicitly forbids.
const MAX_SLOW_STATEMENTS = 5;

/** Stable across runs — a simple hash of the query text, not array position. */
function stableStatementId(text: string): string {
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

function truncateQuery(query: string, max = 200): string {
  const trimmed = query.trim().replace(/\s+/g, " ");
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

function slowStatementFinding(stmt: StatementStat, rank: number): Finding {
  const total = stmt.totalExecMs.toFixed(1);
  const mean = stmt.meanExecMs.toFixed(2);
  const preview = truncateQuery(stmt.query);
  return {
    id: `performance.slow-statement.${stableStatementId(stmt.query)}`,
    dimension: "performance",
    rule: "slow-statement",
    subject: `statement rank #${rank} by cumulative execution time`,
    observation:
      `Rank #${rank} by cumulative execution time: ${stmt.calls} calls, ${total}ms total, ` +
      `${mean}ms mean, ${stmt.rows} rows returned — "${preview}"`,
    evidence: {
      query: "select query, calls, total_exec_time, mean_exec_time, rows from pg_stat_statements order by total_exec_time desc",
      rows: [{ query: preview, calls: stmt.calls, total_exec_ms: stmt.totalExecMs, mean_exec_ms: stmt.meanExecMs, rows: stmt.rows }],
    },
    whyItNeedsChanging:
      `This statement has consumed ${total}ms of cumulative execution time across ` +
      `${stmt.calls} calls (${mean}ms average) — real, measured workload cost, not a ` +
      "structural inference from schema shape. It is the kind of evidence every other " +
      "finding in this dimension is built without, because pg_stat_statements is not " +
      "always available.",
    businessImpact:
      `${total}ms of cumulative database time attributable to one statement shape is ` +
      "time unavailable to every other query competing for the same resources.",
    severity: "medium",
    urgency: "scheduled",
    remediation: NO_STATEMENT,
    fixRisk:
      "No index or rewrite is generated automatically — identify the predicate or join " +
      "this statement is paying for from its text before changing anything.",
    doingNothing: "This statement keeps consuming the same cumulative execution time on every future run.",
    confidence: "proven",
  };
}

function moreSlowStatementsFinding(remaining: number): Finding {
  return {
    id: "performance.slow-statement-more",
    dimension: "performance",
    rule: "slow-statement-more",
    subject: `${remaining} additional statement(s)`,
    observation:
      `${remaining} additional statement(s) exist in pg_stat_statements beyond the top ` +
      `${MAX_SLOW_STATEMENTS} shown individually above, ranked lower by cumulative ` +
      "execution time.",
    evidence: {
      query: "select count(*) from pg_stat_statements",
      rows: [{ additional_statements: remaining }],
    },
    whyItNeedsChanging:
      "Individual findings are capped so this report stays readable; the remaining " +
      "statements are not lower priority by definition, only lower-ranked by this one " +
      "metric — query pg_stat_statements directly for the full list.",
    businessImpact: "None beyond what the shown statements already report.",
    severity: "info",
    urgency: "deferred",
    remediation: NO_STATEMENT,
    fixRisk: "None — informational only.",
    doingNothing: "The remaining statements stay unlisted individually in this report.",
    confidence: "proven",
  };
}
// [SCOPE 121 / T019] END

// [SCOPE 121 / T019] BEGIN — counters-disabled (performance)
// ADDITION (SCOPE-121 final fix wave, C3 — CRITICAL): with track_counts off,
// pg_stat_user_indexes rows still exist but `idx_scan` (and every other
// activity counter) freezes at exactly 0 — `isKnown(idx.scans)` passes (the
// counter genuinely IS present) even though its meaning changed from "zero
// scans measured" to "nothing is being counted". Left unguarded, `isUnused`
// would fire on EVERY non-unique, non-primary, valid index with
// `confidence: "proven"` and a DROP statement — fabricated evidence for a
// destructive recommendation. `seq-scan-heavy` goes silent for the same
// reason (seq_scan/idx_scan both frozen at 0). This one finding replaces
// both rather than let either mislead.
function performanceCountersDisabledFinding(): Finding {
  return {
    id: "performance.counters-disabled",
    dimension: "performance",
    rule: "counters-disabled",
    subject: "database-wide activity statistics",
    observation:
      "track_counts is off on this server, so pg_stat_user_tables/pg_stat_user_indexes " +
      "activity counters (idx_scan, seq_scan, and the rest) are not being collected — " +
      "every counter reads a genuine 0, not because nothing happened but because nothing " +
      "is being counted.",
    evidence: {
      query: "select setting from pg_catalog.pg_settings where name = 'track_counts'",
      rows: [{ track_counts: "off" }],
    },
    whyItNeedsChanging:
      "With track_counts off, pg_stat_user_indexes rows still exist and every scan " +
      "counter freezes at exactly 0 — indistinguishable here from a real zero. Rules " +
      "that read those counters (unused-index, seq-scan-heavy) cannot tell 'never used' " +
      "from 'not being measured', so they are suppressed entirely rather than risk " +
      "recommending a destructive DROP INDEX, or missing a genuinely scan-heavy table, " +
      "on fabricated zero evidence.",
    businessImpact:
      "This tool cannot detect unused indexes or sequential-scan-heavy tables at all " +
      "until track_counts is re-enabled — those classes of finding are silently absent " +
      "from this report, not because nothing is wrong but because nothing can be " +
      "measured.",
    severity: "high",
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
      "This tool cannot tell a genuinely unused index or scan-heavy table from one it " +
      "simply cannot see.",
    confidence: "proven",
  };
}
// [SCOPE 121 / T019] END

// [SCOPE 121 / T019] BEGIN — analyzePerformance
// MODIFIED-BY (SCOPE-121 final fix wave, C2/C3/I1/I5a): `capabilities` and
// `knownEmptyTables` are new, OPTIONAL trailing parameters — undefined/absent
// keeps every existing caller/test unchanged. `cli.ts` always passes the
// real, already-collected `PgCapabilities` in production, and — when the
// `data` dimension also ran this pass — the set of tables it measured as
// exactly zero rows. Duplicate grouping now excludes expression/partial
// indexes (C2); `unused-index`/`seq-scan-heavy` are suppressed when
// track_counts is off, replaced by one counters-disabled finding (C3);
// collected statement statistics are now ranked into slow-statement findings
// (I1); `isUnused` also takes the table and `knownEmptyTables` so it can
// suppress a known-empty table's index (I5a).
export function analyzePerformance(
  perf: PerformanceSnapshot,
  stats: StatsSnapshot,
  capabilities?: PgCapabilities,
  knownEmptyTables?: ReadonlySet<string>,
): Finding[] {
  const findings: Finding[] = [];
  const countersDisabled =
    capabilities !== undefined && capabilities.settings.track_counts !== "on";

  for (const idx of perf.indexes) {
    const table = stats.tables.get(idx.table);
    if (!countersDisabled && isUnused(idx, table, knownEmptyTables)) {
      findings.push(unusedIndex(idx, table));
    }
    if (!idx.isValid) findings.push(invalidIndex(idx));
  }

  const groups = new Map<string, IndexStat[]>();
  const excludedFromDuplicateDetection: IndexStat[] = [];
  for (const idx of perf.indexes) {
    if (isExpressionOrPartial(idx)) {
      excludedFromDuplicateDetection.push(idx);
      continue;
    }
    const key = normalizedDefinitionKey(idx);
    groups.set(key, [...(groups.get(key) ?? []), idx]);
  }
  for (const group of groups.values()) {
    if (group.length > 1) findings.push(duplicateIndex(group));
  }
  if (excludedFromDuplicateDetection.length > 0) {
    findings.push(duplicateCheckSkippedFinding(excludedFromDuplicateDetection));
  }

  if (!countersDisabled) {
    for (const table of stats.tables.values()) {
      if (isSeqScanHeavy(table)) findings.push(seqScanHeavy(table));
    }
  } else {
    findings.push(performanceCountersDisabledFinding());
  }

  if (perf.statementsUnavailable !== undefined) {
    findings.push(noStatementStats(perf.statementsUnavailable));
  } else if (perf.statements && perf.statements.length > 0) {
    const ranked = [...perf.statements].sort((a, b) => b.totalExecMs - a.totalExecMs);
    const top = ranked.slice(0, MAX_SLOW_STATEMENTS);
    top.forEach((stmt, i) => findings.push(slowStatementFinding(stmt, i + 1)));
    const remaining = ranked.length - top.length;
    if (remaining > 0) findings.push(moreSlowStatementsFinding(remaining));
  }

  return findings;
}
// [SCOPE 121 / T019] END
