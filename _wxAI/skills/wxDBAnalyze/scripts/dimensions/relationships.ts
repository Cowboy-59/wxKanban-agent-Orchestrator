import type { DeclaredSchema } from "../engines/postgres/declared.js";
import type { LiveSchema } from "../engines/postgres/schema.js";

// [SCOPE 121 / T008] BEGIN — Relationship types
export type RelationshipSource =
  | "declared"
  | "live"
  | "convention"
  | "datamodel";

export type FkNamingPattern = "lowercase-concat" | "snake_case" | "pascal-case";

export interface DataModelEdge {
  child: string;
  childColumn: string;
  parent: string;
  parentColumn: string;
}

export interface Relationship {
  child: string;
  /** First element of `childColumns` — the key Tasks 9/10 index and label on. */
  childColumn: string;
  /**
   * The full ordered key, in declaration order. Single-element for every
   * convention/datamodel source and for the common single-column FK; more
   * than one element only when a declared or live foreign key is composite
   * (e.g. `testsignoffs`'s `(itemid, itemexecutor)` pairing FK).
   */
  childColumns: string[];
  parent: string;
  /** First element of `parentColumns`. */
  parentColumn: string;
  /** The full ordered parent key, aligned positionally with `childColumns`. */
  parentColumns: string[];
  /** True when `childColumns.length > 1`. Branch on this, not array length. */
  isComposite: boolean;
  sources: RelationshipSource[];
  constraintName?: string;
  /**
   * The database's actually-enforced ON DELETE/ON UPDATE action, taken from
   * the live catalog when a live foreign key asserts this relationship.
   * Falls back to the declared value when there is no live constraint at
   * all (nothing enforces anything, so the declared intent is the only
   * signal available).
   */
  onDelete?: string;
  onUpdate?: string;
  /**
   * What the code declares, kept alongside `onDelete`/`onUpdate` even when a
   * live value overwrites them — so a caller (Task 10) can compare declared
   * intent against enforced behaviour and report the mismatch itself, rather
   * than that disagreement being silently lost in the merge.
   */
  declaredOnDelete?: string;
  declaredOnUpdate?: string;
  childColumnNullable: boolean;
  childColumnType: string;
  parentColumnType: string;
  indexedOnChild: boolean;
}

/**
 * A convention-based parent resolution that was attempted and declined,
 * recorded rather than silently dropped. `parent` is the table the naming
 * convention resolved to (or, for the self-reference case, equal to
 * `child`).
 */
export interface SkippedRelationship {
  child: string;
  childColumn: string;
  parent: string;
  reason: string;
}
// [SCOPE 121 / T008] END

// [SCOPE 121 / T008] BEGIN — Convention-based parent resolution
/**
 * Candidate parent table names for a singular stem, most-likely first.
 * Deliberately small: over-eager pluralisation invents relationships, and a
 * relationship invented here becomes an orphan query against a table that has
 * nothing to do with the child.
 */
function pluralCandidates(stem: string): string[] {
  const candidates = [`${stem}s`, stem, `${stem}es`];
  if (stem.endsWith("y")) candidates.push(`${stem.slice(0, -1)}ies`);
  if (stem.endsWith("s") || stem.endsWith("x") || stem.endsWith("ch")) {
    candidates.push(`${stem}es`);
  }
  return candidates;
}

/**
 * Derive the FK-shaped stem from a column name for the given pattern.
 *
 * KNOWN LIMITATION (documented rather than "fixed" — see Task 8 code review
 * Finding 4): in `lowercase-concat` mode this strips the trailing two
 * characters of ANY column ending in "id", with no word-boundary awareness.
 * `paid`, `valid`, `void`, `uuid`, `guid`, `solid`, `hybrid` all stem the
 * same way a real FK column would (e.g. `totalpaid` -> stem `totalpa`). The
 * only thing standing between that and a false relationship is that
 * `resolveParentTable` requires the stemmed/pluralised candidate to name a
 * table that actually exists — a coincidental collision (a column stemming
 * to a real, unrelated table name) would invent a relationship. A word list
 * or cleverer heuristic was deliberately NOT added here: that would trade a
 * visible, testable limitation for an invisible one (a word list is always
 * incomplete, and its gaps would fail the same way but silently). Callers
 * that need certainty for a specific column should corroborate via
 * `declared`, `live`, or `datamodel` sources rather than trusting
 * `convention` alone.
 */
function stemFor(column: string, pattern: FkNamingPattern): string | undefined {
  if (pattern === "snake_case") {
    return column.endsWith("_id") ? column.slice(0, -3) : undefined;
  }
  if (pattern === "pascal-case") {
    return column.endsWith("Id") && column.length > 2
      ? column.slice(0, -2).toLowerCase()
      : undefined;
  }
  // lowercase-concat: "projectid" -> "project". "id" itself is the PK, not an FK.
  return column.endsWith("id") && column.length > 2
    ? column.slice(0, -2)
    : undefined;
}

/**
 * Resolve the parent table a foreign-key-shaped column points at, using naming
 * convention alone. Returns undefined when no plausible parent exists — an
 * unresolvable name is reported as unresolvable, never guessed at.
 */
export function resolveParentTable(
  column: string,
  tables: ReadonlySet<string>,
  pattern: FkNamingPattern,
): string | undefined {
  const stem = stemFor(column, pattern);
  if (!stem) return undefined;
  return pluralCandidates(stem).find((candidate) => tables.has(candidate));
}
// [SCOPE 121 / T008] END

// [SCOPE 121 / T008] BEGIN — Relationship cross-tabulation
function key(child: string, childColumn: string): string {
  return `${child}.${childColumn}`;
}

/**
 * Cross-tabulate every source that asserts a parent/child link.
 *
 * The output is one relationship per child column carrying the SET of sources
 * that assert it. That set is the whole point: a link asserted by convention
 * but not by the live catalog is an unenforced relationship, and a link
 * enforced live but undeclared is a cascade the code knows nothing about.
 *
 * Returns `skipped` alongside `relationships` — every convention resolution
 * that was attempted and declined (rather than silently dropped), e.g. a
 * name that resolves to a real table which turns out to have no primary key,
 * or a name that would only resolve to the child table itself.
 */
export function inferRelationships(input: {
  declared: DeclaredSchema;
  live: LiveSchema;
  dataModel?: DataModelEdge[];
  pattern?: FkNamingPattern;
}): { relationships: Relationship[]; skipped: SkippedRelationship[] } {
  const pattern = input.pattern ?? "lowercase-concat";
  const liveTableNames = new Set(input.live.tables.keys());
  const found = new Map<string, Relationship>();
  const skipped: SkippedRelationship[] = [];

  const upsert = (
    base: Omit<Relationship, "sources">,
    source: RelationshipSource,
  ): void => {
    const k = key(base.child, base.childColumn);
    const existing = found.get(k);
    if (existing) {
      if (!existing.sources.includes(source)) existing.sources.push(source);

      // FIX (SCOPE-121/T008, round 1 — code review Finding 3, Important): the
      // live catalog is the database's actually-enforced behaviour and must
      // win over whatever the declared loop (which runs first) put there.
      // The declared value is retained separately in declaredOnDelete /
      // declaredOnUpdate rather than discarded, so a caller can compare
      // intent against enforcement instead of losing one of the two values.
      if (source === "live") {
        if (base.constraintName !== undefined) existing.constraintName = base.constraintName;
        if (base.onDelete !== undefined) existing.onDelete = base.onDelete;
        if (base.onUpdate !== undefined) existing.onUpdate = base.onUpdate;
      } else {
        existing.constraintName ??= base.constraintName;
        existing.onDelete ??= base.onDelete;
        existing.onUpdate ??= base.onUpdate;
      }
      if (source === "declared") {
        existing.declaredOnDelete ??= base.declaredOnDelete;
        existing.declaredOnUpdate ??= base.declaredOnUpdate;
      }

      // FIX (SCOPE-121/T008, round 1 — code review Finding 1, Critical): a
      // declared or live foreign key's full composite key must win over a
      // single-column convention/datamodel guess recorded under the same
      // key, so a composite constraint is never reported as single-column
      // just because a convention match landed first.
      if (source === "declared" || source === "live") {
        existing.childColumns = base.childColumns;
        existing.parentColumns = base.parentColumns;
        existing.isComposite = base.isComposite;
      }
      return;
    }
    found.set(k, { ...base, sources: [source] });
  };

  const describe = (
    child: string,
    childColumns: string[],
    parent: string,
    parentColumns: string[],
    extra: Partial<Relationship> = {},
  ): Omit<Relationship, "sources"> => {
    const childColumn = childColumns[0] ?? "";
    const parentColumn = parentColumns[0] ?? "";
    const childTable = input.live.tables.get(child);
    const parentTable = input.live.tables.get(parent);
    const childCol = childTable?.columns.find((c) => c.name === childColumn);
    const parentCol = parentTable?.columns.find((c) => c.name === parentColumn);
    return {
      child,
      childColumn,
      childColumns,
      parent,
      parentColumn,
      parentColumns,
      isComposite: childColumns.length > 1,
      childColumnNullable: childCol ? !childCol.notNull : true,
      childColumnType: childCol?.sqlType ?? "unknown",
      parentColumnType: parentCol?.sqlType ?? "unknown",
      indexedOnChild:
        childTable?.indexes.some((i) => i.columns[0] === childColumn) ?? false,
      ...extra,
    };
  };

  for (const [child, table] of input.declared.tables) {
    for (const fk of table.foreignKeys) {
      if (!fk.columns.length || !fk.foreignColumns.length) continue;
      upsert(
        describe(child, fk.columns, fk.foreignTable, fk.foreignColumns, {
          onDelete: fk.onDelete,
          onUpdate: fk.onUpdate,
          declaredOnDelete: fk.onDelete,
          declaredOnUpdate: fk.onUpdate,
        }),
        "declared",
      );
    }
  }

  for (const [child, table] of input.live.tables) {
    for (const fk of table.foreignKeys) {
      if (!fk.columns.length || !fk.foreignColumns.length) continue;
      upsert(
        describe(child, fk.columns, fk.foreignTable, fk.foreignColumns, {
          constraintName: fk.name,
          onDelete: fk.onDelete,
          onUpdate: fk.onUpdate,
        }),
        "live",
      );
    }
  }

  for (const [child, table] of input.live.tables) {
    for (const column of table.columns) {
      if (column.isPrimaryKey) continue;
      const parent = resolveParentTable(column.name, liveTableNames, pattern);
      if (!parent) continue;

      // FIX (SCOPE-121/T008, round 1 — code review Finding 2, Critical): both
      // of the remaining `continue`s below discard a resolution the naming
      // convention actually found. Silently dropping them loses signal —
      // record what was declined and why instead.
      if (parent === child) {
        skipped.push({
          child,
          childColumn: column.name,
          parent,
          reason: "resolved parent is the same table as the child (self-reference guarded)",
        });
        continue;
      }
      const parentPk = input.live.tables
        .get(parent)
        ?.columns.find((c) => c.isPrimaryKey);
      if (!parentPk) {
        skipped.push({
          child,
          childColumn: column.name,
          parent,
          reason: `resolved parent table "${parent}" has no primary key`,
        });
        continue;
      }
      upsert(describe(child, [column.name], parent, [parentPk.name]), "convention");
    }
  }

  for (const edge of input.dataModel ?? []) {
    upsert(
      describe(edge.child, [edge.childColumn], edge.parent, [edge.parentColumn]),
      "datamodel",
    );
  }

  const relationships = [...found.values()].sort((a, b) =>
    key(a.child, a.childColumn).localeCompare(key(b.child, b.childColumn)),
  );
  return { relationships, skipped };
}
// [SCOPE 121 / T008] END
