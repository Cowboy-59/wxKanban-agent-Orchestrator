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

// FIX (SCOPE-121 final fix wave, I5b — Important): this used to be one
// finding PER (table, column). On a real database that produced 82 of 155
// unused-index findings restating one fact and 122 all-null-column findings
// across only 36 tables (up to 12 on a single table) — 54% of a 19,612-line
// report restating the same mechanism over and over. Rolled up PER TABLE
// (not per rule, which would collapse 122 columns into one unactionable
// "122 all-null columns" finding and destroy the ability to act on any one
// of them) — one finding per table listing every column of ITS that is
// all-null, sharing the one mechanism that applies to all of them.
function allNullColumnsForTable(t: TableProfile, columns: ColumnProfile[], rows: number): Finding {
  const names = columns.map((c) => c.name);
  const list = names.join(", ");
  const single = columns.length === 1;
  return {
    id: `data.all-null-column.${t.name}`,
    dimension: "data",
    rule: "all-null-column",
    subject: t.name,
    observation: single
      ? `${t.name}.${names[0]} (${columns[0]!.sqlType}) is null in all ${rows} rows — no ` +
        "row has ever carried a value."
      : `${t.name} has ${columns.length} columns that are null in all ${rows} rows — no ` +
        `row has ever carried a value in any of them: ${list}.`,
    evidence: {
      query: `select ${columns.map((c) => `count("${c.name}")`).join(", ")} from "${t.name}"`,
      rows: columns.map((c) => ({ table: t.name, column: c.name, rows, non_null: 0 })),
    },
    // DEVIATION (controller decision, SCOPE-121/T017): the brief's prose here
    // read "nothing has ever written ${c.name}", which does not satisfy the
    // brief's own test regex `/never been written|no row/i`
    // (tests/wxdbanalyze/dimension-data.test.ts, "reports an all-null column
    // as a dead column"). Reworded to "has never been written" — same
    // mechanism, now matched, and preserved here through the roll-up.
    whyItNeedsChanging: single
      ? `Across ${rows} rows, ${names[0]} has never been written. Either the code path ` +
        "that populates it is dead, or it writes to a different column than the one " +
        "intended — a mistake that produces no error, because writing to the wrong " +
        "nullable column and never writing at all look identical here."
      : `Across ${rows} rows, none of these ${columns.length} columns has ever been ` +
        `written: ${list}. For each one, either the code path that populates it is dead, ` +
        "or it writes to a different column than the one intended — a mistake that " +
        "produces no error, because writing to the wrong nullable column and never " +
        "writing at all look identical here.",
    businessImpact:
      "If any of these columns is meant to hold data, a feature is silently not " +
      "working. If it is genuinely unused, it is storage and schema noise.",
    severity: "medium",
    urgency: "scheduled",
    remediation: MANUAL,
    fixRisk:
      "Dropping a column is destructive. Confirm first whether the intended writer " +
      "exists for each one — an all-null column is evidence of a bug at least as often " +
      "as it is evidence of dead weight.",
    doingNothing:
      "If a writer was supposed to exist for any of these columns, it keeps not " +
      "existing, and nothing will surface that fact.",
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

// [SCOPE 111 / T046] BEGIN — All-null columns that are all-null by design
/**
 * The counterpart to `allNullColumnsForTable`: columns an operator has declared
 * in `.wxai/db-policy.json` as legitimately never-written.
 *
 * This is NOT a suppression that hides the column. `all-null-column` is a
 * *medium/scheduled* finding whose remediation is "drop it or find the missing
 * writer"; for these columns both of those are wrong, and doing either is the
 * defect. So the column still appears in the report, at `info`, carrying the
 * declared reason — the analyzer states it looked, and states why it is not
 * asking for action.
 *
 * The motivating case is `testplanitems.forcetest`: null means "inherit the
 * plan's force flag" (FR-030), so an unwritten column means nobody has needed
 * an override yet, not that the writer is dead.
 */
function intentionallyNullForTable(
  t: TableProfile,
  entries: Array<{ column: ColumnProfile; reason: string }>,
  rows: number,
): Finding {
  const names = entries.map((e) => e.column.name);
  const list = names.join(", ");
  const single = entries.length === 1;
  return {
    id: `data.intentional-null-column.${t.name}`,
    dimension: "data",
    rule: "intentional-null-column",
    subject: t.name,
    observation: single
      ? `${t.name}.${names[0]} (${entries[0]!.column.sqlType}) is null in all ${rows} ` +
        "rows, and is declared intentionally nullable in .wxai/db-policy.json — not " +
        "reported as a dead column."
      : `${t.name} has ${entries.length} all-null columns declared intentionally ` +
        `nullable in .wxai/db-policy.json — not reported as dead columns: ${list}.`,
    evidence: {
      query: `select ${entries
        .map((e) => `count("${e.column.name}")`)
        .join(", ")} from "${t.name}"`,
      rows: entries.map((e) => ({
        table: t.name,
        column: e.column.name,
        rows,
        non_null: 0,
        declared_reason: e.reason,
      })),
    },
    whyItNeedsChanging:
      "Nothing needs changing. This entry exists so the emptiness is visible and " +
      "attributed rather than silently filtered: " +
      entries.map((e) => `${e.column.name} — ${e.reason}`).join("; ") +
      ".",
    businessImpact:
      "None as reported. The impact would come from ACTING on this as if it were a " +
      "dead column — adding NOT NULL, adding a default, or dropping it — each of " +
      "which destroys the meaning the null carries.",
    severity: "info",
    urgency: "deferred",
    remediation: NONE,
    fixRisk:
      "The risk here runs the other way: a NOT NULL, a default, or a DROP on these " +
      "columns is a silent behaviour change, not a cleanup.",
    doingNothing:
      "Correct. Re-examine only if the declared reason stops being true — a declaration " +
      "in .wxai/db-policy.json is a claim about intent that ages with the code.",
    confidence: "proven",
  };
}
// [SCOPE 111 / T046] END

// [SCOPE 121 / T017] BEGIN — Data health analysis
/**
 * Turn table profiles into contract-complete findings. Pure.
 *
 * MODIFIED-BY (SCOPE 111 / T046): `intentionalNullColumns` — `table.column` →
 * reason, from `.wxai/db-policy.json`. A column listed there is all-null BY
 * DESIGN and is withheld from `data.all-null-column`, because acting on that
 * finding would be the defect. Withheld columns are re-emitted as an `info`
 * finding rather than dropped: a suppression nobody can see in the report is
 * indistinguishable from a column the analyzer never looked at.
 */
export function analyzeData(
  snapshot: DataSnapshot,
  intentionalNullColumns: ReadonlyMap<string, string> = new Map(),
): Finding[] {
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

    const allNullCols: ColumnProfile[] = [];
    const byDesign: Array<{ column: ColumnProfile; reason: string }> = [];
    for (const column of table.columns) {
      if (column.allNull) {
        const reason = intentionalNullColumns.get(
          `${table.name}.${column.name}`.toLowerCase(),
        );
        if (reason === undefined) allNullCols.push(column);
        else byDesign.push({ column, reason });
      } else if (column.nullFraction >= HIGH_NULL_FRACTION) {
        findings.push(highNullDensity(table, column, table.rowCount));
      }
    }
    if (allNullCols.length > 0) {
      findings.push(allNullColumnsForTable(table, allNullCols, table.rowCount));
    }
    if (byDesign.length > 0) {
      findings.push(intentionallyNullForTable(table, byDesign, table.rowCount));
    }
  }

  return findings;
}
// [SCOPE 121 / T017] END
