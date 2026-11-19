import type { Confidence, Finding, Severity, Urgency } from "../core/finding.js";
import { quoteIdent } from "../core/identifiers.js";
import type { OrphanProbe, RowCountEstimate } from "../engines/postgres/integrity.js";
import type { Relationship } from "./relationships.js";

// [SCOPE 121 / T010] BEGIN — Row-count and confidence presentation (final wave I4/I6/I7)
/**
 * FIX (SCOPE-121 final wave, I4 — Important): a single place to turn a
 * `RowCountEstimate` into prose, so "unknown" never silently reads as small.
 * Used everywhere a finding used to interpolate `~${childRows}` directly.
 */
function rowsClause(childRows: RowCountEstimate): string {
  return childRows === "unknown"
    ? "row count unknown (table has never been analyzed)"
    : `~${childRows} rows`;
}

/**
 * FIX (SCOPE-121 final wave, I6 — Important): `childRows` is a PLANNER
 * ESTIMATE (`pg_class.reltuples`), refreshed only by ANALYZE/autovacuum —
 * it can be stale in either direction. The live run produced "385,039 of
 * ~369,427", which reads as a tool bug rather than what it actually is: a
 * measured, exact orphan count next to a stale estimate. This never lets the
 * orphan count and the estimate collide into a nonsensical ratio — when the
 * measured count exceeds the estimate, it says so explicitly and states
 * which number is exact.
 */
function orphanCountClause(orphans: number, childRows: RowCountEstimate, childTable: string): string {
  if (childRows === "unknown") {
    return (
      `${orphans} orphaned rows out of a total that is unknown — ${childTable} ` +
      "has never been analyzed, so there is no planner estimate to compare against."
    );
  }
  if (orphans > childRows) {
    return (
      `${orphans} rows are orphaned — more than the planner's ~${childRows}-row estimate ` +
      `for ${childTable}. The estimate is a stale statistics snapshot from the last ` +
      "ANALYZE, not a live count; the orphan count itself comes from a direct count(*) " +
      "and is exact, so it is the number to trust."
    );
  }
  return `${orphans} of ~${childRows} rows are orphaned.`;
}

/**
 * FIX (SCOPE-121 final wave, I7 — Important): confidence used to be
 * hardcoded `"proven"` in every finding builder below regardless of how the
 * relationship was actually established, contradicting the finding
 * contract's own rule ("An orphan count is proven; a convention-inferred
 * relationship is not" — `references/finding-contract.md`). A relationship
 * is only as trustworthy as its most direct source: `"declared"` (the code
 * says so), `"live"` (the catalog enforces it) and `"datamodel"` (an
 * explicit, supplied mapping) are all direct evidence; `"convention"` alone
 * is a naming-pattern guess with no corroboration. Proven iff at least one
 * non-heuristic source backs the relationship.
 */
function relationshipConfidence(rel: Relationship): Confidence {
  return rel.sources.some((s) => s !== "convention") ? "proven" : "inferred";
}
// [SCOPE 121 / T010] END

// [SCOPE 121 / T010] BEGIN — Integrity remediation builders
/**
 * DEVIATION (controller decision, SCOPE-121/T010): the brief's `constraintName`
 * and `indexName` build from `rel.childColumn` alone — a single-column name.
 * Task 8 added composite-key support (`childColumns`, positionally paired
 * with `parentColumns`), with a real composite FK in this database —
 * `testsignoffs.(itemid, itemexecutor) -> testplanitems.(id, executor)`.
 * Naming and building DDL from the singular field would silently drop the
 * second column, exactly the bug Task 8 was fixed for. Every generated name
 * and statement below is therefore built from the full `childColumns` /
 * `parentColumns` arrays, in order, each element routed through
 * `quoteIdent`.
 */

/**
 * FIX (SCOPE-121/T010, review round 1 — Finding 2, Important): the generated
 * constraint/index names concatenated the child table and every column with
 * no length guard. Postgres silently truncates identifiers at 63 bytes, so
 * two distinct composite relationships whose names happen to agree on their
 * first 63 bytes would collapse to the same name — a real collision risk
 * once Task 12 executes this SQL against production.
 *
 * `stableHash` is a plain, deterministic 32-bit FNV-1a hash — no
 * `node:crypto` import, no I/O, no clock, no randomness, so the module stays
 * pure and its output is stable across runs and platforms. `boundedIdentifier`
 * only touches names that actually exceed the limit: it keeps a truncated
 * prefix and appends an 8-hex-char hash of the FULL untruncated name, so two
 * different long names collapse to two different short names rather than
 * the same one. Both `constraintName` and `indexName` route through it, and
 * every caller (forward AND rollback statements) calls the SAME function
 * with the SAME relationship, so the two can never diverge from each other.
 */
function stableHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

const POSTGRES_IDENTIFIER_LIMIT = 63;

function boundedIdentifier(name: string): string {
  if (name.length <= POSTGRES_IDENTIFIER_LIMIT) return name;
  const suffix = `_${stableHash(name)}`;
  const prefixLength = POSTGRES_IDENTIFIER_LIMIT - suffix.length;
  return `${name.slice(0, prefixLength)}${suffix}`;
}

function constraintName(rel: Relationship): string {
  return boundedIdentifier(`${rel.child}_${rel.childColumns.join("_")}_fkey`);
}

function indexName(rel: Relationship): string {
  return boundedIdentifier(`idx_${rel.child}_${rel.childColumns.join("_")}`);
}

function columnList(columns: readonly string[]): string {
  return columns.map(quoteIdent).join(", ");
}

/**
 * Human-readable subject for a relationship's child side. Single-column
 * relationships keep the plain `table.column` form every existing finding id
 * and message already uses; composite relationships spell out the whole key
 * so the reader never mistakes a two-column defect for a single-column one.
 */
function subjectFor(rel: Relationship): string {
  return rel.isComposite
    ? `${rel.child}.(${rel.childColumns.join(", ")})`
    : `${rel.child}.${rel.childColumn}`;
}

/** Same idea as `subjectFor`, for the parent side of the relationship. */
function parentRef(rel: Relationship): string {
  return rel.isComposite
    ? `${rel.parent}.(${rel.parentColumns.join(", ")})`
    : `${rel.parent}.${rel.parentColumn}`;
}

/**
 * Two-phase FK repair. ADD CONSTRAINT ... NOT VALID takes only a brief
 * SHARE ROW EXCLUSIVE lock and stops NEW bad rows immediately; VALIDATE then
 * scans without blocking writes.
 *
 * VALIDATE is omitted when orphans exist, because it would fail against them.
 * Emitting a statement we know will error would make the apply path
 * untrustworthy, and cleaning orphans is a business decision — delete or
 * re-parent — that does not belong to this tool.
 */
function addForeignKey(rel: Relationship, orphans: number | null): string[] {
  const name = quoteIdent(constraintName(rel));
  const statements = [
    `alter table ${quoteIdent(rel.child)} add constraint ${name} ` +
      `foreign key (${columnList(rel.childColumns)}) references ` +
      `${quoteIdent(rel.parent)} (${columnList(rel.parentColumns)}) not valid;`,
  ];
  if (orphans === 0) {
    statements.push(
      `alter table ${quoteIdent(rel.child)} validate constraint ${name};`,
    );
  }
  return statements;
}
// [SCOPE 121 / T010] END

// [SCOPE 121 / T010] BEGIN — Integrity findings
function missingFk(probe: OrphanProbe): Finding {
  const rel = probe.relationship;
  const subject = subjectFor(rel);
  const orphans = probe.orphanRows;
  const measured = orphans !== null;
  const hasOrphans = measured && orphans > 0;

  const severity: Severity = hasOrphans
    ? "critical"
    : measured
      ? "medium"
      : "high";
  const urgency: Urgency = hasOrphans
    ? "immediate"
    : measured
      ? "scheduled"
      : "scheduled";

  const observation = measured
    ? `${subject} references ${parentRef(rel)} ` +
      `(asserted by ${rel.sources.join(" + ")}) but no foreign key enforces it. ` +
      orphanCountClause(orphans, probe.childRows, rel.child)
    : `${subject} references ${parentRef(rel)} ` +
      `(asserted by ${rel.sources.join(" + ")}) but no foreign key enforces it. ` +
      `Orphans were not measured — ${probe.skipped ?? "probe did not run"}.`;

  return {
    id: `integrity.missing-fk.${rel.child}.${rel.childColumn}`,
    dimension: "integrity",
    rule: "missing-fk",
    subject,
    observation,
    evidence: {
      query: probe.query || "anti-join not executed",
      rows: [
        {
          child: rel.child,
          columns: rel.childColumns.join(","),
          parent: rel.parent,
          parent_columns: rel.parentColumns.join(","),
          orphans: orphans ?? "not measured",
          child_rows: probe.childRows,
          asserted_by: rel.sources.join(","),
          sources: rel.sources.join(","),
        },
      ],
    },
    whyItNeedsChanging: hasOrphans
      ? `Nothing stops a ${rel.child} row pointing at a ${rel.parent} that no ` +
        `longer exists, and ${orphans} rows already do. Any join to ` +
        `${rel.parent} silently drops those rows, so they vanish from lists and ` +
        "aggregates rather than raising an error anyone would notice."
      : `Nothing prevents a ${rel.child} row from pointing at a deleted ` +
        `${rel.parent}. The data is currently consistent, which means the gap ` +
        "is a latent defect rather than an active one — the next parent " +
        "deletion is what creates the orphan.",
    businessImpact: hasOrphans
      ? `${orphans} rows are already unreachable through their parent. Any ` +
        `per-${rel.parent} count, total or report built on a join undercounts ` +
        "by that amount, silently."
      : `A single ${rel.parent} deletion converts every referencing ` +
        `${rel.child} row into an invisible orphan.`,
    severity,
    urgency,
    remediation: {
      statements: addForeignKey(rel, orphans),
      fixClass: "additive-safe",
      lockClass: "SHARE ROW EXCLUSIVE, held briefly",
      estimatedDuration: hasOrphans
        ? "milliseconds — NOT VALID does not scan existing rows"
        : `NOT VALID is instant; VALIDATE scans ${rowsClause(probe.childRows)} without blocking writes`,
      rollback: `alter table ${quoteIdent(rel.child)} drop constraint ${quoteIdent(constraintName(rel))};`,
    },
    fixRisk: hasOrphans
      ? "NOT VALID is safe and immediate, but it does not repair the existing " +
        `${orphans} orphans — those are emitted separately for manual handling, ` +
        "because deleting versus re-parenting is a business decision."
      : "Brief lock on the child table; the validating scan does not block reads or writes.",
    doingNothing: hasOrphans
      ? "The orphan count grows with every parent deletion, and the affected " +
        "rows stay invisible to anyone reading through the parent."
      : "The relationship stays unenforced; correctness depends entirely on " +
        "application code getting every deletion path right, forever.",
    confidence: measured ? "proven" : "inferred",
  };
}

function undeclaredFk(rel: Relationship): Finding {
  const subject = subjectFor(rel);
  return {
    id: `integrity.undeclared-fk.${rel.child}.${rel.childColumn}`,
    dimension: "integrity",
    rule: "undeclared-fk",
    subject,
    observation:
      `Constraint ${rel.constraintName} enforces ${subject} ` +
      `-> ${parentRef(rel)} with ON DELETE ` +
      `${rel.onDelete ?? "no action"}, but no schema source declares it.`,
    evidence: {
      query: "select conname, confdeltype from pg_catalog.pg_constraint where contype = 'f'",
      rows: [
        {
          constraint: rel.constraintName,
          child: rel.child,
          // FIX (SCOPE-121/T010, review round 1 — Finding 4, Minor): evidence
          // rows used to carry only the leading `rel.childColumn`, next to
          // DDL elsewhere in this file that is fully composite-aware. Carry
          // the full column list here too, so the evidence a reader inspects
          // is never narrower than the fix that was generated from it.
          columns: rel.childColumns.join(","),
          parent: rel.parent,
          parent_columns: rel.parentColumns.join(","),
          on_delete: rel.onDelete ?? "no action",
          sources: rel.sources.join(","),
        },
      ],
    },
    whyItNeedsChanging:
      `The database will apply ON DELETE ${rel.onDelete ?? "no action"} when a ` +
      `${rel.parent} row is removed, and no code declares that behaviour. A ` +
      "cascade the application does not know about deletes rows nobody expected " +
      "to lose; a restrict it does not know about turns an ordinary delete into " +
      "an unexplained constraint error.",
    businessImpact:
      `Deletion behaviour for ${rel.child} is decided by the database and is ` +
      "invisible in code review.",
    severity: rel.onDelete === "cascade" ? "high" : "medium",
    urgency: "scheduled",
    remediation: {
      statements: [],
      fixClass: "manual-only",
      lockClass: "n/a — code change only",
      estimatedDuration: "n/a",
      rollback: "n/a",
    },
    fixRisk:
      "Declaring the existing constraint in the ORM is inert at runtime; the " +
      "risk is declaring a different action than the one deployed.",
    doingNothing:
      "The gap between declared and enforced deletion semantics persists, and " +
      "the next person to read the schema in code will be misled.",
    // FIX (SCOPE-121 final wave, I7 — Important): derived from rel.sources
    // rather than hardcoded. In practice this rule only ever fires when
    // `rel.sources` includes "live" (see `analyzeIntegrity`'s `enforced &&
    // !declared` gate), so it still always resolves "proven" — but it is now
    // a real derivation from the evidence rather than an assumption baked
    // into every finding this file emits.
    confidence: relationshipConfidence(rel),
  };
}

/**
 * FIX (SCOPE-121/T010, review round 1 — Finding 1, Critical): the original
 * version of this rule compared `onDelete` only, on the premise that
 * drizzle-orm materialises an unset `onDelete` as `undefined` while
 * materialising an unset `onUpdate` as the literal string `"no action"` —
 * attributed to "the Task 8 author's comment on `Relationship.declaredOnUpdate`".
 * That premise was checked against the actual installed source
 * (drizzle-orm 0.45.2) and is FALSE, and no such comment exists in
 * `relationships.ts`:
 *
 *   - `node_modules/drizzle-orm/pg-core/foreign-keys.js`, `ForeignKeyBuilder`:
 *     `_onUpdate = "no action"; _onDelete = "no action";` — both fields
 *     default to the identical literal string. The constructor only
 *     overrides them when an `actions` object is passed:
 *     `if (actions) { this._onUpdate = actions.onUpdate; this._onDelete = actions.onDelete; }`.
 *   - `node_modules/drizzle-orm/pg-core/columns/common.js`, inside the
 *     `.references()` builder path: `if (actions2.onUpdate) { builder.onUpdate(actions2.onUpdate); } if (actions2.onDelete) { builder.onDelete(actions2.onDelete); }`
 *     — both actions are set conditionally, on the identical truthy check.
 *
 *   There is no asymmetry: an unset `onDelete` materialises to `"no action"`
 *   exactly as an unset `onUpdate` does. `rel.declaredOnDelete !== undefined`
 *   was therefore effectively always true whenever a declared FK exists at
 *   all (since drizzle always populates it, defaulted or explicit), making
 *   that guard a near-no-op rather than the filter it was written to be —
 *   and it left ON UPDATE drift permanently unchecked on a false premise,
 *   exactly the "silently drop a check" failure this design exists to
 *   prevent.
 *
 * Fixed by comparing BOTH `onDelete` and `onUpdate` symmetrically via
 * `actionDeltas`, and by accepting the real consequence that follows: an
 * unset declared action reads as `"no action"`, so a live `cascade` against
 * an unset declaration IS a real, reportable mismatch — the code never
 * asked for cascade and the database does it anyway. That case is not
 * suppressed.
 *
 * Shape decision: ONE finding per relationship, covering whichever of the
 * two actions actually differ (one or both), rather than two independent
 * `action-mismatch-delete` / `action-mismatch-update` findings. A single
 * relationship's declared-vs-live drift is one fact about that relationship
 * a reader needs to reconcile in one pass; splitting it into two findings
 * with two ids would force an operator fixing the constraint to cross-
 * reference two report entries for what is fixed by inspecting the same
 * constraint once.
 */
interface ActionDelta {
  action: "delete" | "update";
  declared: string;
  live: string;
}

function actionDeltas(rel: Relationship): ActionDelta[] {
  const deltas: ActionDelta[] = [];
  if (
    rel.declaredOnDelete !== undefined &&
    rel.onDelete !== undefined &&
    rel.declaredOnDelete !== rel.onDelete
  ) {
    deltas.push({ action: "delete", declared: rel.declaredOnDelete, live: rel.onDelete });
  }
  if (
    rel.declaredOnUpdate !== undefined &&
    rel.onUpdate !== undefined &&
    rel.declaredOnUpdate !== rel.onUpdate
  ) {
    deltas.push({ action: "update", declared: rel.declaredOnUpdate, live: rel.onUpdate });
  }
  return deltas;
}

function actionLabel(action: "delete" | "update"): string {
  return action === "delete" ? "DELETE" : "UPDATE";
}

function actionMismatch(rel: Relationship, deltas: ActionDelta[]): Finding {
  const subject = subjectFor(rel);
  const involvesCascade = deltas.some((d) => d.declared === "cascade" || d.live === "cascade");
  const declaredClause = deltas
    .map((d) => `ON ${actionLabel(d.action)} ${d.declared}`)
    .join(" and ");
  const liveClause = deltas.map((d) => `ON ${actionLabel(d.action)} ${d.live}`).join(" and ");
  return {
    id: `integrity.action-mismatch.${rel.child}.${rel.childColumn}`,
    dimension: "integrity",
    rule: "action-mismatch",
    subject,
    observation:
      `${subject} is declared with ${declaredClause} but the live constraint ` +
      `${rel.constraintName ?? "(unnamed)"} enforces ${liveClause}.`,
    evidence: {
      query: "select confdeltype, confupdtype from pg_catalog.pg_constraint where contype = 'f'",
      rows: [
        {
          child: rel.child,
          columns: rel.childColumns.join(","),
          ...Object.fromEntries(
            deltas.map((d) => [`declared_on_${d.action}`, d.declared]),
          ),
          ...Object.fromEntries(deltas.map((d) => [`live_on_${d.action}`, d.live])),
          sources: rel.sources.join(","),
        },
      ],
    },
    whyItNeedsChanging:
      `Every reader of the code sees ${declaredClause} declared on ${subject} and ` +
      `reasons about deletes and updates accordingly, but the database actually ` +
      `enforces ${liveClause}. The affected operation behaves differently than ` +
      "every reader of the code expects, and code review cannot catch it because " +
      "the truth is not in the code — it is only in the live catalog.",
    businessImpact: involvesCascade
      ? `A ${rel.parent} deletion or key update silently cascades through every ` +
        `referencing ${rel.child} row when the live action is cascade, or is ` +
        "unexpectedly blocked/nulled when the code declares cascade but the " +
        "database does not enforce it — either way, the path the team believes " +
        "runs is not the one that does."
      : `A ${rel.parent} deletion or key update behaves as declared in the live ` +
        `constraint (${liveClause}) while the code declares ${declaredClause}, so ` +
        "the path the team tested against the declared behaviour is not the one " +
        "that actually runs.",
    severity: involvesCascade ? "critical" : "high",
    urgency: "scheduled",
    remediation: {
      statements: [],
      fixClass: "manual-only",
      lockClass: "n/a — code change or migration decision only",
      estimatedDuration: "n/a",
      rollback: "n/a",
    },
    fixRisk:
      "Reconciling requires deciding which behaviour is correct — updating the " +
      "code to declare the enforced action, or migrating the constraint to match " +
      "the code — and that decision is a business one, not a mechanical fix.",
    doingNothing:
      "The declared and enforced referential-action semantics keep disagreeing, " +
      "and the next person to read the code is misled by it.",
    confidence: "proven",
  };
}

/**
 * FIX (SCOPE-121 final wave, I8 — Important): the mechanism this finding
 * describes — a parent delete/key-update forcing a scan of the child table
 * under lock — only happens when a foreign key actually enforces the
 * relationship. For the 14 live subjects that ALSO have a missing-fk finding
 * (no constraint exists at all), Postgres performs no such scan today; the
 * old unconditional prose asserted a mechanism that was false for those
 * subjects while being labelled `confidence: "proven"`. When unenforced, the
 * honest framing is forward-looking: the index is needed BEFORE the
 * constraint can be added economically (VALIDATE, and every ordinary lookup
 * by this column in the meantime, would otherwise scan sequentially).
 *
 * FIX (SCOPE-121 Phase 1 punch list P3a): the unenforced branch used to
 * interpolate `rowsPhrase` straight into a "scan N of table sequentially"
 * template. That template assumes a quantity; `rowsClause("unknown")`
 * returns the sentence fragment "row count unknown (table has never been
 * analyzed)", not a quantity, so the result read as "would otherwise scan
 * row count unknown (table has never been analyzed) of tasks sequentially"
 * — a string substituted where a number was expected, not a sentence. The
 * unenforced branch now takes `childRows` directly and, when it is
 * `"unknown"`, states plainly that the table has never been analyzed, so
 * there is no estimate to size the scan against and the cost cannot be
 * quantified — which argues FOR adding the index promptly rather than for
 * deferring it, matching this finding's `isLargeOrUnknown` severity
 * treatment of an unknown size as never "small". The enforced (live) branch
 * is untouched — this fixes the unknown-size wording, not the
 * enforced-versus-unenforced split.
 */
function unindexedFkMechanism(rel: Relationship, childRows: RowCountEstimate): string {
  if (rel.sources.includes("live")) {
    return (
      `Every delete or key update on ${rel.parent} must scan ${rowsClause(childRows)} of ` +
      `${rel.child} to check for referencing rows, and it holds a lock for the ` +
      "duration of that scan. The cost falls on the parent's writes, which is " +
      "why it is easy to miss when profiling the child."
    );
  }
  const scanClause =
    childRows === "unknown"
      ? `${rel.child} has never been analyzed, so there is no row-count estimate ` +
        "to say how large that sequential scan would be — its cost cannot be " +
        "quantified, which is itself a reason to add the index now rather than " +
        "a reason to wait until the cost is known"
      : `every ordinary lookup by this column in the meantime would otherwise ` +
        `scan ${rowsClause(childRows)} of ${rel.child} sequentially`;
  return (
    `No foreign key enforces ${subjectFor(rel)} today (see the related ` +
    `missing-fk finding), so a ${rel.parent} delete triggers no such scan right ` +
    "now. But the constraint cannot be added economically without this index " +
    `first — VALIDATE CONSTRAINT, and ${scanClause}. Add the index before the ` +
    "foreign key, not after."
  );
}

function unindexedFk(rel: Relationship, childRows: RowCountEstimate): Finding {
  const subject = subjectFor(rel);
  const rowsPhrase = rowsClause(childRows);
  // FIX (SCOPE-121 final wave, I4): unknown must not be treated as "not
  // large" — it is rated and scheduled the same as a confirmed-large table,
  // never silently folded into the smaller/deferred branch.
  const isLargeOrUnknown = childRows === "unknown" || childRows > 100_000;
  // FIX (SCOPE-121/T010, review round 1 — Finding 5, Minor): "no index on
  // its leading column" reads oddly for a single-column relationship, which
  // has no "leading column" distinct from "its column" — the composite
  // framing only makes sense once there is more than one column to lead.
  const observation = rel.isComposite
    ? `${subject} references ${rel.parent} but has no index on its leading ` +
      `column; ${rel.child} holds ${rowsPhrase}. Only the leading column ` +
      "of the key was checked for an index; this finding means that column " +
      "has no index at all, not that the full composite key was checked and " +
      "found unindexed."
    : `${subject} references ${rel.parent} but has no index; ${rel.child} ` +
      `holds ${rowsPhrase}.`;
  return {
    id: `integrity.unindexed-fk.${rel.child}.${rel.childColumn}`,
    dimension: "integrity",
    rule: "unindexed-fk",
    subject,
    observation,
    evidence: {
      query: "select indkey from pg_catalog.pg_index where indrelid = $child",
      rows: [
        {
          child: rel.child,
          column: rel.childColumn,
          columns: rel.childColumns.join(","),
          rows: childRows,
          indexed: false,
          sources: rel.sources.join(","),
        },
      ],
    },
    whyItNeedsChanging: unindexedFkMechanism(rel, childRows),
    businessImpact: rel.sources.includes("live")
      ? `Deleting a ${rel.parent} is slow and blocks concurrent writes to ` +
        `${rel.child} for the length of the scan.`
      : `Adding the foreign key later requires a slow VALIDATE, and every ` +
        `interim lookup by this column against ${rel.child} pays a sequential scan.`,
    severity: isLargeOrUnknown ? "high" : "medium",
    urgency: isLargeOrUnknown ? "scheduled" : "deferred",
    remediation: {
      statements: [
        `create index concurrently ${quoteIdent(indexName(rel))} on ` +
          `${quoteIdent(rel.child)} (${columnList(rel.childColumns)});`,
      ],
      fixClass: "additive-safe",
      lockClass: "SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes",
      estimatedDuration: `proportional to ${rowsPhrase}; runs online`,
      rollback: `drop index concurrently ${quoteIdent(indexName(rel))};`,
    },
    fixRisk:
      "CREATE INDEX CONCURRENTLY cannot run inside a transaction block and " +
      "leaves an INVALID index behind if it fails, which must then be dropped. " +
      "It does not block reads or writes while building.",
    doingNothing:
      `Parent deletions stay slow and get slower as ${rel.child} grows.`,
    // FIX (SCOPE-121 final wave, I7 — Important): derived from rel.sources —
    // a convention-only relationship's "unindexed" claim is only as
    // trustworthy as the relationship itself.
    confidence: relationshipConfidence(rel),
  };
}

function crossTenant(probe: OrphanProbe): Finding {
  const rel = probe.relationship;
  const subject = subjectFor(rel);
  const count = probe.tenantMismatches ?? 0;
  return {
    id: `integrity.cross-tenant.${rel.child}.${rel.childColumn}`,
    dimension: "integrity",
    rule: "cross-tenant",
    subject,
    observation:
      `${count} ${rel.child} rows carry a tenant that disagrees with their ` +
      `parent ${rel.parent} row.`,
    evidence: {
      // FIX (SCOPE-121 final wave, C1 — CRITICAL): this used to cite
      // `probe.query`, which is the ORPHAN anti-join, not the tenant-mismatch
      // query — re-running it reproduces an orphan count, not the tenant
      // mismatch count this finding is actually about, and would return 0
      // for a `crossTenant` finding whose own subject has no orphans at all.
      // `tenantMismatches` is only ever non-null after `tenantQuery` was
      // built and executed, so it is always populated here.
      query: probe.tenantQuery ?? "tenant query not available",
      rows: [
        {
          child: rel.child,
          columns: rel.childColumns.join(","),
          parent: rel.parent,
          parent_columns: rel.parentColumns.join(","),
          mismatches: count,
          sources: rel.sources.join(","),
        },
      ],
    },
    whyItNeedsChanging:
      "No foreign key can express this — a constraint checks that the parent " +
      "exists, not that it belongs to the same tenant. Any query filtering by " +
      "tenant on the child while joining through the parent (or the reverse) " +
      "returns rows belonging to a different customer.",
    businessImpact:
      "Cross-tenant data exposure: one customer can see another customer's " +
      "rows through whichever of the two paths disagrees.",
    severity: "critical",
    urgency: "immediate",
    remediation: {
      statements: [],
      fixClass: "manual-only",
      lockClass: "n/a",
      estimatedDuration: "n/a",
      rollback: "n/a",
    },
    fixRisk:
      "Correcting the tenant on an affected row moves data between customers; " +
      "it must be decided per row, not applied in bulk.",
    doingNothing:
      "The exposure persists and grows with every write that repeats the defect.",
    // FIX (SCOPE-121 final wave, I7 — Important): a cross-tenant mismatch
    // COUNT is a proven measurement (a direct query result) regardless of
    // how the relationship itself was discovered, but the relationship
    // being examined might still be only a convention guess — a mismatch
    // count on a guessed-at relationship is not as trustworthy as one on a
    // relationship the live catalog or code actually confirms.
    confidence: relationshipConfidence(rel),
  };
}

function notProbed(probe: OrphanProbe): Finding {
  const rel = probe.relationship;
  const subject = subjectFor(rel);
  return {
    id: `integrity.not-probed.${rel.child}.${rel.childColumn}`,
    dimension: "integrity",
    rule: "not-probed",
    subject,
    observation:
      `Orphans for ${subject} -> ${rel.parent} were not ` +
      `measured: ${probe.skipped}.`,
    evidence: {
      query: probe.query || "not executed",
      rows: [
        {
          child: rel.child,
          column: rel.childColumn,
          columns: rel.childColumns.join(","),
          reason: probe.skipped ?? "unknown",
          sources: rel.sources.join(","),
        },
      ],
    },
    whyItNeedsChanging:
      "This relationship is unverified, not verified-clean. Treating an " +
      "unmeasured link as healthy is how an audit reports green while proving " +
      "nothing about the rows it never looked at.",
    businessImpact:
      "The integrity of this relationship is unknown; it may hold orphans " +
      "nobody has counted.",
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
      "Re-running with --deep executes the anti-join and may be slow on a " +
      "large unindexed table.",
    doingNothing: "This relationship remains unaudited.",
    // FIX (SCOPE-121 final wave, I7 — Important): derived, not hardcoded —
    // see `relationshipConfidence`.
    confidence: relationshipConfidence(rel),
  };
}

/**
 * FIX (SCOPE-121/T010, review round 1 — Finding 3, Important): a per-
 * relationship `tenant-not-probed` finding for EVERY skipped tenant sub-probe
 * would drown the report. Task 9's dominant skip reason is SQLSTATE 42703 —
 * the tenant column not existing on one side of the relationship — which is
 * the EXPECTED outcome for every relationship that is not multi-tenant on
 * both sides. With ~221 relationships in this database and Task 14 passing a
 * tenant column on every CLI run, reporting one finding per relationship
 * would bury the findings that matter under expected noise.
 *
 * Task 9 now exposes a typed `tenantSkippedKind` discriminator (controller-
 * authorised change to `engines/postgres/integrity.ts`, derived from the same
 * SQLSTATE check `describeTenantSkip` already performed — not a new text
 * match here). This function stays for the `"probe-error"` case: a genuine
 * failure (permission error, network failure, a malformed identifier) that
 * is NOT the expected shape and IS worth an operator's individual attention.
 * `analyzeIntegrity` also treats an unclassified skip (`tenantSkippedKind`
 * undefined — a probe result that did not go through Task 9's classifier)
 * as this case rather than silently folding it into the rollup: an
 * unrecognised skip reason staying individually visible is the safe default,
 * matching the "a skipped anti-join that reported zero would be
 * indistinguishable from clean" principle this whole dimension is built on.
 * `column-missing` skips are aggregated instead — see `tenantCoverageGap`.
 */
function tenantNotProbed(probe: OrphanProbe): Finding {
  const rel = probe.relationship;
  const subject = subjectFor(rel);
  return {
    id: `integrity.tenant-not-probed.${rel.child}.${rel.childColumn}`,
    dimension: "integrity",
    rule: "tenant-not-probed",
    subject,
    observation:
      `Cross-tenant consistency for ${subject} -> ${rel.parent} was not ` +
      `measured: ${probe.tenantSkipped}.`,
    evidence: {
      // FIX (SCOPE-121 final wave, C1 — CRITICAL): as with `crossTenant`
      // above, this used to cite the orphan anti-join (`probe.query`)
      // instead of the tenant query that was actually attempted (and
      // failed). `tenantQuery` is populated whenever `buildTenantQuery`
      // succeeded, even if the subsequent execution then failed — it is
      // only absent when building the query itself threw.
      query: probe.tenantQuery || "not executed",
      rows: [
        {
          child: rel.child,
          column: rel.childColumn,
          columns: rel.childColumns.join(","),
          reason: probe.tenantSkipped ?? "unknown",
          sources: rel.sources.join(","),
        },
      ],
    },
    whyItNeedsChanging:
      "A cross-tenant check that did not run must not be read as evidence " +
      "the relationship carries no cross-tenant leak — no probe means no " +
      "signal either way, and this is not the expected column-missing case, " +
      "so it is worth investigating on its own rather than rolled up.",
    businessImpact:
      "Whether this relationship crosses tenant boundaries is unknown; it may " +
      "leak one customer's rows to another without anyone having checked.",
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
      "Re-running the tenant probe, once the underlying cause is resolved, is " +
      "read-only and safe.",
    doingNothing: "This relationship's cross-tenant consistency remains unverified.",
    // FIX (SCOPE-121 final wave, I7 — Important): derived, not hardcoded —
    // see `relationshipConfidence`.
    confidence: relationshipConfidence(rel),
  };
}

/**
 * ADDITION (controller decision, SCOPE-121/T010 review round 1, Finding 3):
 * one aggregate, info-severity finding per run covering every relationship
 * whose tenant sub-probe was skipped for the EXPECTED reason (the tenant
 * column absent on one side). Keeps the coverage gap visible — silence here
 * would read as "no cross-tenant problem" for checks that never ran — without
 * spending one report line per relationship for an outcome that is normal
 * for the majority of relationships in a schema that is not multi-tenant
 * end to end.
 */
function tenantCoverageGap(probes: OrphanProbe[]): Finding {
  const count = probes.length;
  const rows = probes.map((p) => ({
    child: p.relationship.child,
    columns: p.relationship.childColumns.join(","),
    parent: p.relationship.parent,
    sources: p.relationship.sources.join(","),
  }));
  return {
    id: "integrity.tenant-coverage-gap",
    dimension: "integrity",
    rule: "tenant-coverage-gap",
    subject: "tenant consistency coverage",
    observation:
      `${count} relationship${count === 1 ? "" : "s"} could not be checked for ` +
      "cross-tenant consistency because the configured tenant column does not " +
      "exist on one side — expected for a relationship that is not multi-tenant " +
      "on both sides, and rolled up into this one finding rather than reported " +
      "per relationship so it does not bury findings that matter under expected " +
      "noise.",
    evidence: {
      query: "aggregate of tenant sub-probe skips classified column-missing",
      rows,
    },
    whyItNeedsChanging:
      "This is coverage information, not a defect by itself: it states how much " +
      "of the schema the cross-tenant check could not examine, so the absence of " +
      "a cross-tenant finding elsewhere in the report is never mistaken for proof " +
      "that no leak exists among these relationships.",
    businessImpact:
      "None directly — this finding measures audit coverage rather than reporting " +
      "a database defect.",
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
    doingNothing:
      "The coverage gap remains, and these relationships' cross-tenant " +
      "consistency stays unmeasured.",
    confidence: "proven",
  };
}
// [SCOPE 121 / T010] END

// [SCOPE 121 / T010] BEGIN — Integrity analysis
/** Turn orphan probes into contract-complete findings. */
export function analyzeIntegrity(probes: OrphanProbe[]): Finding[] {
  const findings: Finding[] = [];
  const columnMissingProbes: OrphanProbe[] = [];

  for (const probe of probes) {
    const rel = probe.relationship;
    const enforced = rel.sources.includes("live");
    const declared = rel.sources.includes("declared");

    if (!enforced) findings.push(missingFk(probe));
    if (enforced && !declared) findings.push(undeclaredFk(rel));
    if (enforced && declared) {
      const deltas = actionDeltas(rel);
      if (deltas.length > 0) findings.push(actionMismatch(rel, deltas));
    }
    if (!rel.indexedOnChild) findings.push(unindexedFk(rel, probe.childRows));
    if ((probe.tenantMismatches ?? 0) > 0) findings.push(crossTenant(probe));
    if (probe.skipped && enforced) findings.push(notProbed(probe));
    if (probe.tenantSkipped) {
      if (probe.tenantSkippedKind === "column-missing") {
        columnMissingProbes.push(probe);
      } else {
        findings.push(tenantNotProbed(probe));
      }
    }
  }

  if (columnMissingProbes.length > 0) {
    findings.push(tenantCoverageGap(columnMissingProbes));
  }

  return findings;
}
// [SCOPE 121 / T010] END
