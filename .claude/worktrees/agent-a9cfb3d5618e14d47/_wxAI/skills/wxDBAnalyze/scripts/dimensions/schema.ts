import type { Finding, Remediation } from "../core/finding.js";
import { quoteIdent } from "../core/identifiers.js";
import { typesEquivalent } from "../core/pgtypes.js";
import type {
  DeclaredSchema,
  DeclaredTable,
} from "../engines/postgres/declared.js";
import type { LiveSchema, LiveTable } from "../engines/postgres/schema.js";

// [SCOPE 121 / T007] BEGIN — Schema dimension remediation helpers
const MANUAL: Remediation = {
  statements: [],
  fixClass: "manual-only",
  lockClass: "n/a — no statement is generated",
  estimatedDuration: "n/a",
  rollback: "n/a",
};

function addColumn(table: string, column: string, sqlType: string): Remediation {
  return {
    statements: [
      `alter table ${quoteIdent(table)} add column ${quoteIdent(column)} ${sqlType};`,
    ],
    fixClass: "additive-safe",
    lockClass: "ACCESS EXCLUSIVE, held briefly (catalog-only on PG 11+)",
    estimatedDuration: "milliseconds — no table rewrite for a nullable column",
    rollback: `alter table ${quoteIdent(table)} drop column ${quoteIdent(column)};`,
  };
}
// [SCOPE 121 / T007] END

// [SCOPE 121 / T007] BEGIN — Schema dimension analysis
function missingTable(table: DeclaredTable): Finding {
  return {
    id: `schema.missing-table.${table.name}`,
    dimension: "schema",
    rule: "missing-table",
    subject: table.name,
    observation:
      `${table.name} is declared in ${table.sources.join(" and ")} with ` +
      `${table.columns.length} columns but does not exist in the database.`,
    evidence: {
      query: "select relname from pg_catalog.pg_class where relkind in ('r','p')",
      rows: [{ table: table.name, declared_in: table.sources.join(",") }],
    },
    whyItNeedsChanging:
      `Any code path touching ${table.name} raises 42P01 (undefined_table), ` +
      "which surfaces as a 500 rather than a handled error. The failure is " +
      "total for that path, not degraded.",
    businessImpact:
      `Every feature backed by ${table.name} is unavailable, and the failure ` +
      "is invisible to schema tooling that only compares declarations.",
    severity: "critical",
    urgency: "immediate",
    remediation: MANUAL,
    fixRisk:
      "Creating the table is additive, but the correct DDL must come from the " +
      "reviewed migration for the scope that introduced it, not be synthesised here.",
    doingNothing:
      "The 500s continue at the rate that code path is exercised, with no alarm " +
      "distinguishing them from any other server error.",
    confidence: "proven",
  };
}

function undeclaredTable(table: LiveTable): Finding {
  return {
    id: `schema.undeclared-table.${table.name}`,
    dimension: "schema",
    rule: "undeclared-table",
    subject: table.name,
    observation:
      `${table.name} exists in the database with ${table.columns.length} ` +
      "columns but is declared in no schema source.",
    evidence: {
      query: "select relname from pg_catalog.pg_class where relkind in ('r','p')",
      rows: [{ table: table.name, columns: table.columns.length }],
    },
    whyItNeedsChanging:
      "Schema tooling treats undeclared tables as removable. The application " +
      "also cannot read it through the ORM, so whatever writes it is doing so " +
      "outside the declared model and is unprotected by type checking.",
    businessImpact:
      `If ${table.name} holds live data, an automated reconciliation would ` +
      "propose dropping it.",
    severity: "high",
    urgency: "scheduled",
    remediation: MANUAL,
    fixRisk:
      "Declaring it retroactively is safe; the risk lies in declaring it " +
      "inaccurately, which converts a silent table into a wrong one.",
    doingNothing:
      "`drizzle-kit push` would propose dropping this table — which is why it " +
      "is prohibited against this database. The prohibition is the mitigation, " +
      "and it depends on nobody forgetting.",
    confidence: "proven",
  };
}

function missingColumn(
  table: string,
  column: { name: string; sqlType: string; notNull: boolean; hasDefault: boolean },
): Finding {
  // FIX (SCOPE-121/T007, round 1 — code review Finding 1, Important): the
  // remediation always added the column nullable — correctly, since setting
  // NOT NULL in the same statement either rewrites the table or fails
  // outright on existing rows — but `fixRisk` said nothing about that gap.
  // An operator who applied the emitted statement and stopped there was left
  // with a schema that still diverges from the declaration. `fixClass` stays
  // "additive-safe" in both branches because the emitted statement genuinely
  // is additive; only the risk text was dishonest, so only it changes here.
  const fixRisk = column.notNull
    ? "Adding the column takes a brief catalog-only lock on PG 11+ and does " +
      "not rewrite the table, but the statement restores it nullable — it " +
      "cannot set NOT NULL in the same step without either rewriting the " +
      "table or failing outright on existing rows. Reconciling fully " +
      "requires a backfill followed by a separate SET NOT NULL; until both " +
      "run, a subsequent scan will correctly report a nullability mismatch " +
      "on this column."
    : "Adding a nullable column takes a brief catalog-only lock on PG 11+ and " +
      "does not rewrite the table.";
  return {
    id: `schema.missing-column.${table}.${column.name}`,
    dimension: "schema",
    rule: "missing-column",
    subject: `${table}.${column.name}`,
    observation:
      `${table}.${column.name} (${column.sqlType}) is declared but absent ` +
      `from the deployed ${table}.`,
    evidence: {
      query: "select attname from pg_catalog.pg_attribute where attrelid = $table",
      rows: [{ table, column: column.name, declared_type: column.sqlType }],
    },
    // FIX (SCOPE-121/T007, round 1 — code review Finding 2, Important): "every
    // read ... fails" was false as an absolute — explicit partial selects
    // (`db.select({...})`, used throughout src/server/services/*) that never
    // name the missing column keep working. The real mechanism is worse: the
    // dominant bare `db.select().from(table)` pattern fails while partial
    // selects don't, so the failure looks intermittent and endpoint-specific
    // rather than total, which is harder to diagnose than a clean outage.
    whyItNeedsChanging:
      `Bare db.select().from(${table}) — the dominant read pattern in this ` +
      "codebase — asks Drizzle to project every declared column, so those " +
      `reads fail with 42703 even when nothing in the call references ` +
      `${column.name}. Partial selects that name only the columns they need ` +
      "keep working, because they never ask for the missing one. The result " +
      "is not a total outage: it looks intermittent and endpoint-specific, " +
      "which is harder to diagnose than a clean failure.",
    businessImpact:
      `Every bare-select read of ${table} returns 500 until the column is ` +
      "added; partial-select reads that omit it keep succeeding, so the " +
      "outage presents as inconsistent rather than total.",
    severity: "critical",
    urgency: "immediate",
    remediation: addColumn(table, column.name, column.sqlType),
    fixRisk,
    doingNothing:
      `Bare-select reads of ${table} continue to fail; partial-select reads ` +
      "that omit this column continue to mask the gap.",
    confidence: "proven",
  };
}

function undeclaredColumn(table: string, column: { name: string; notNull: boolean; hasDefault: boolean }): Finding {
  const blocksInsert = column.notNull && !column.hasDefault;
  return {
    id: `schema.undeclared-column.${table}.${column.name}`,
    dimension: "schema",
    rule: "undeclared-column",
    subject: `${table}.${column.name}`,
    observation:
      `${table}.${column.name} exists in the database but is not declared` +
      (blocksInsert ? " and is NOT NULL with no default." : "."),
    evidence: {
      query: "select attname, attnotnull, atthasdef from pg_catalog.pg_attribute",
      rows: [{ table, column: column.name, not_null: column.notNull, has_default: column.hasDefault }],
    },
    whyItNeedsChanging: blocksInsert
      ? `Every INSERT into ${table} issued by the application omits ` +
        `${column.name}, and the column is NOT NULL with no default — so ` +
        "every insert fails with 23502."
      : `The application cannot read or write ${column.name}, so any data in ` +
        "it is inaccessible to the product and invisible to type checking.",
    businessImpact: blocksInsert
      ? `No row can be created in ${table} through the application.`
      : "Data written by another process is stranded outside the model.",
    severity: blocksInsert ? "critical" : "medium",
    urgency: blocksInsert ? "immediate" : "deferred",
    remediation: MANUAL,
    fixRisk:
      "Declaring the column in code is inert until deployed; no database change is required.",
    doingNothing: blocksInsert
      ? "Inserts continue to fail for every user."
      : "The column stays invisible to the application indefinitely.",
    confidence: "proven",
  };
}

function typeMismatch(
  table: string,
  column: string,
  declaredType: string,
  liveType: string,
): Finding {
  return {
    id: `schema.type-mismatch.${table}.${column}`,
    dimension: "schema",
    rule: "type-mismatch",
    subject: `${table}.${column}`,
    observation:
      `${table}.${column} is declared ${declaredType} but deployed as ${liveType}.`,
    evidence: {
      query: "select pg_catalog.format_type(atttypid, atttypmod) from pg_catalog.pg_attribute",
      rows: [{ table, column, declared: declaredType, live: liveType }],
    },
    whyItNeedsChanging:
      `The driver decodes ${column} as ${liveType} while the application's ` +
      `types assert ${declaredType}. Comparisons and joins against this column ` +
      "may silently fall back to a cast, defeating any index on it.",
    businessImpact:
      "Queries filtering on this column can degrade to sequential scans, and " +
      "values may round-trip differently than the code expects.",
    severity: "high",
    urgency: "scheduled",
    remediation: MANUAL,
    fixRisk:
      "ALTER COLUMN TYPE rewrites the table and takes ACCESS EXCLUSIVE for the " +
      "duration; it is destructive and must be applied by hand in a window.",
    doingNothing:
      "The mismatch persists silently — it produces no error, only wrong plans " +
      "and occasional wrong comparisons.",
    confidence: "proven",
  };
}

function nullabilityMismatch(table: string, column: string): Finding {
  return {
    id: `schema.nullability-mismatch.${table}.${column}`,
    dimension: "schema",
    rule: "nullability-mismatch",
    subject: `${table}.${column}`,
    observation:
      `${table}.${column} is declared NOT NULL but is nullable in the database.`,
    evidence: {
      query: "select attnotnull from pg_catalog.pg_attribute",
      rows: [{ table, column, declared_not_null: true, live_not_null: false }],
    },
    whyItNeedsChanging:
      `TypeScript types ${column} as non-optional, so no code path guards ` +
      "against null. Any null already present, or inserted by another writer, " +
      "reaches code that will dereference it.",
    businessImpact:
      "A runtime null produces a TypeError rather than a handled validation " +
      "error, and the type system gives no warning at build time.",
    severity: "high",
    urgency: "scheduled",
    remediation: MANUAL,
    fixRisk:
      "SET NOT NULL scans the whole table and takes ACCESS EXCLUSIVE; it also " +
      "fails outright if nulls exist, so existing nulls must be resolved first.",
    doingNothing:
      "The code keeps asserting a guarantee the database does not enforce.",
    confidence: "proven",
  };
}

function sourceConflict(conflict: DeclaredSchema["conflicts"][number]): Finding {
  // FIX (SCOPE-121 Phase 1 punch list P3b): this comment used to define
  // `divergent` as name-only — "each source holds a column the other lacks"
  // — but `describeDifference` (engines/postgres/declared.ts, SCOPE-121 final
  // wave I5) was broadened to also mark `divergent` when both sources
  // declare the SAME column with a different type or nullability, not only
  // when each side has a column the other lacks. `subset` means one source
  // declares a strict subset of the other's columns — the documented
  // read-only-mirror pattern in mcp-server/src/db/schema.ts, and usually
  // deliberate. `divergent` means the sources disagree in a way no mirror
  // explains: either each side holds a column the other lacks, or they
  // describe a shared column differently (type or nullability). Reporting
  // both at the same severity would push the operator to "fix" intentional
  // narrowing.
  const divergent = conflict.direction === "divergent";
  return {
    id: `schema.source-conflict.${conflict.table}`,
    dimension: "schema",
    rule: "source-conflict",
    subject: conflict.table,
    observation:
      `${conflict.table} is declared in ${conflict.sources.join(" and ")} ` +
      `with differing shapes — ${conflict.difference}.`,
    evidence: {
      query: "declared-schema comparison across sources",
      rows: [{ table: conflict.table, sources: conflict.sources.join(","), difference: conflict.difference }],
    },
    // FIX (SCOPE-121 final wave, I5 — Important): `describeDifference` now
    // also marks `divergent` when both sources declare the SAME column with
    // a different type or nullability (previously invisible entirely — see
    // engines/postgres/declared.ts). The old wording here only described the
    // "each side has an extra column" case; broadened so it stays accurate
    // for a shared-column type/nullability disagreement too, without
    // overclaiming specifics `conflict.difference` (rendered separately,
    // right above this text) already states precisely.
    whyItNeedsChanging: divergent
      ? "The sources disagree in a way no read-only-mirror relationship " +
        "explains — either each declares a column the other lacks, or they " +
        "declare the same column with a different type or nullability. " +
        "Whichever is wrong will emit SQL the database rejects, or silently " +
        "accept a value the other source's own type would have refused, and a " +
        "drift check comparing against either source alone reports clean."
      : "One source declares a strict subset of the other's columns. That is " +
        "the read-only-mirror pattern this project uses deliberately, so it is " +
        "reported for confirmation rather than as a defect — but an " +
        "undocumented subset is indistinguishable from a stale declaration.",
    businessImpact: divergent
      ? "One of the two components fails against the deployed schema, and which " +
        "one depends on which source happens to be correct."
      : "None if the narrowing is intentional. If it is not, the narrower " +
        "source cannot read the columns it omits.",
    severity: divergent ? "high" : "low",
    urgency: divergent ? "scheduled" : "deferred",
    remediation: MANUAL,
    fixRisk:
      "Reconciling is a code change only; the risk is choosing the wrong source as authoritative.",
    doingNothing:
      "The divergence widens with each change applied to one source and not the other.",
    confidence: "proven",
  };
}

/** Diff declared against live and produce contract-complete findings. */
export function analyzeSchema(
  declared: DeclaredSchema,
  live: LiveSchema,
): Finding[] {
  const findings: Finding[] = [];

  for (const conflict of declared.conflicts) findings.push(sourceConflict(conflict));

  for (const [name, table] of declared.tables) {
    const liveTable = live.tables.get(name);
    if (!liveTable) {
      findings.push(missingTable(table));
      continue;
    }
    const liveColumns = new Map(liveTable.columns.map((c) => [c.name, c]));
    for (const column of table.columns) {
      const liveColumn = liveColumns.get(column.name);
      if (!liveColumn) {
        findings.push(missingColumn(name, column));
        continue;
      }
      // FIX (SCOPE-121/T007, round 2 — code review Critical finding): raw
      // string equality here compared Drizzle's shorthand against Postgres's
      // canonical spelling and produced 548 false positives out of 558 real
      // production type differences. `typesEquivalent` normalises both sides
      // through the shared alias table in core/pgtypes.ts before comparing.
      if (!typesEquivalent(column.sqlType, liveColumn.sqlType)) {
        findings.push(typeMismatch(name, column.name, column.sqlType, liveColumn.sqlType));
      }
      if (column.notNull && !liveColumn.notNull) {
        findings.push(nullabilityMismatch(name, column.name));
      }
    }
    const declaredColumns = new Set(table.columns.map((c) => c.name));
    for (const liveColumn of liveTable.columns) {
      if (!declaredColumns.has(liveColumn.name)) {
        findings.push(undeclaredColumn(name, liveColumn));
      }
    }
  }

  for (const [name, liveTable] of live.tables) {
    if (!declared.tables.has(name)) findings.push(undeclaredTable(liveTable));
  }

  return findings;
}
// [SCOPE 121 / T007] END
