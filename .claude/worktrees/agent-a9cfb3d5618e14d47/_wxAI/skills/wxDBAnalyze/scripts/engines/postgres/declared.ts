// MODIFIED-BY [SCOPE 121 / T005] — Phase 1 punch list P1: describeDifference's
// type comparison (below, in the "Drizzle metadata extraction" block) now
// goes through core/pgtypes.ts's typesEquivalent instead of raw string
// equality on getSQLType(). This is the same defect class Task 7 fixed for
// declared-vs-live (548 false positives from spelling, not drift) — it was
// never applied to the declared-vs-declared (app-vs-mcp) comparison in this
// file, which has its own independent `sqlType !== sqlType` check. Provably
// reachable: drizzle-orm itself emits "timestamp (3)" from a plain
// `timestamp({precision:3})` column and "timestamp(3)" from
// `timestamp({mode:"string",precision:3})` for the SAME logical type —
// verified directly against the installed drizzle-orm. Latent today only
// because neither src/db/schema/ nor mcp-server/src/db/schema.ts currently
// uses `precision`, `mode: "string"` or `serial` on a column that also
// exists in the other source.
import { typesEquivalent } from "../../core/pgtypes.js";

// [SCOPE 121 / T005] BEGIN — Declared schema types
export interface DeclaredColumn {
  name: string;
  sqlType: string;
  notNull: boolean;
  hasDefault: boolean;
  isPrimaryKey: boolean;
}

export interface DeclaredForeignKey {
  columns: string[];
  foreignTable: string;
  foreignColumns: string[];
  onDelete?: string;
  onUpdate?: string;
}

export interface DeclaredIndex {
  name: string;
  columns: string[];
  unique: boolean;
}

export interface DeclaredTable {
  name: string;
  sources: string[];
  columns: DeclaredColumn[];
  foreignKeys: DeclaredForeignKey[];
  indexes: DeclaredIndex[];
}

export interface SourceConflict {
  table: string;
  sources: string[];
  difference: string;
  /**
   * "subset" — one source's columns are a strict subset of the other's (the
   * shape a deliberate, documented read-only mirror takes). "divergent" —
   * each source has at least one column the other lacks, i.e. genuine
   * two-directional disagreement. Task 7 assigns these different severities;
   * a subset mirror is not automatically a defect.
   */
  direction: "subset" | "divergent";
}

export interface DeclaredSchema {
  tables: Map<string, DeclaredTable>;
  conflicts: SourceConflict[];
}

export interface DeclaredSource {
  label: string;
  module: Record<string, unknown>;
}
// [SCOPE 121 / T005] END

// [SCOPE 121 / T005] BEGIN — Drizzle metadata extraction
// MODIFIED-BY [SCOPE 121 / T005] — Phase 1 punch list P1: describeDifference
// (below) now compares column types with typesEquivalent (core/pgtypes.ts)
// instead of raw getSQLType() string equality. See the top-of-file note.
/**
 * Drizzle's own table config is the source of truth here rather than a regex
 * over the source text. Regex parsing yields table names and nothing more;
 * column types, nullability, defaults and referential actions all live in the
 * builder metadata and cannot be recovered from a name match.
 */
type TableConfigFn = (table: unknown) => {
  name: string;
  columns: ReadonlyArray<{
    name: string;
    getSQLType(): string;
    notNull: boolean;
    hasDefault: boolean;
    primary: boolean;
  }>;
  foreignKeys: ReadonlyArray<{
    reference(): {
      columns: ReadonlyArray<{ name: string }>;
      foreignColumns: ReadonlyArray<{ name: string; table: unknown }>;
    };
    onDelete?: string;
    onUpdate?: string;
  }>;
  indexes: ReadonlyArray<{
    config: {
      name: string;
      unique: boolean;
      columns: ReadonlyArray<{ name?: string }>;
    };
  }>;
};

let cachedConfigFn: TableConfigFn | undefined;

async function loadTableConfigFn(): Promise<TableConfigFn> {
  if (cachedConfigFn) return cachedConfigFn;
  let mod: unknown;
  try {
    mod = await import("drizzle-orm/pg-core");
  } catch {
    throw new Error(
      "wxDBAnalyze needs 'drizzle-orm', which is not installed here. " +
        "Run it from a project that has database dependencies installed.",
    );
  }
  const fn = (mod as { getTableConfig?: unknown }).getTableConfig;
  if (typeof fn !== "function") {
    throw new Error("drizzle-orm/pg-core did not export getTableConfig");
  }
  cachedConfigFn = fn as TableConfigFn;
  return cachedConfigFn;
}

/** Set by `primeTableConfig` in tests, or lazily by `loadSchemaModules`. */
export function primeTableConfig(fn: TableConfigFn): void {
  cachedConfigFn = fn;
}

function readTable(
  getTableConfig: TableConfigFn,
  value: unknown,
): DeclaredTable | undefined {
  let config: ReturnType<TableConfigFn>;
  try {
    config = getTableConfig(value);
  } catch {
    return undefined; // not a Drizzle table — a helper, constant or type export
  }
  if (!config || typeof config.name !== "string") return undefined;

  return {
    name: config.name,
    sources: [],
    columns: config.columns.map((c) => ({
      name: c.name,
      sqlType: c.getSQLType(),
      notNull: c.notNull,
      hasDefault: c.hasDefault,
      isPrimaryKey: c.primary,
    })),
    foreignKeys: config.foreignKeys.map((fk) => {
      const ref = fk.reference();
      const foreignTable = getTableConfig(ref.foreignColumns[0]?.table).name;
      return {
        columns: ref.columns.map((c) => c.name),
        foreignTable,
        foreignColumns: ref.foreignColumns.map((c) => c.name),
        onDelete: fk.onDelete,
        onUpdate: fk.onUpdate,
      };
    }),
    indexes: config.indexes.map((i) => ({
      name: i.config.name,
      unique: i.config.unique,
      columns: i.config.columns
        .map((c) => c.name)
        .filter((n): n is string => typeof n === "string"),
    })),
  };
}

interface ColumnDifference {
  difference: string;
  direction: "subset" | "divergent";
}

/**
 * FIX (SCOPE-121 final wave, I5 — Important, done last per instruction and
 * only because the rest of the wave verified green): this used to compare
 * column NAMES only, so two sources declaring the SAME column with a
 * different TYPE or NULLABILITY produced no conflict at all — the second
 * declaration was silently discarded by the `existing.sources.push(...)`
 * last-wins merge in `extractDeclaredSchema` below, with no signal it ever
 * happened. Given the headline result of this scope was 12 app-vs-mcp
 * source conflicts, a type-level disagreement between the two declarations
 * of the SAME column is exactly the drift worth catching — it is a stronger
 * signal than a merely-narrower mirror, not a weaker one. Kept local to this
 * one pure function; the merge loop, `SourceConflict` shape and every other
 * caller are unchanged.
 */
function describeDifference(a: DeclaredTable, b: DeclaredTable): ColumnDifference | undefined {
  const aByName = new Map(a.columns.map((c) => [c.name, c]));
  const bByName = new Map(b.columns.map((c) => [c.name, c]));
  const onlyA = [...aByName.keys()].filter((n) => !bByName.has(n)).sort();
  const onlyB = [...bByName.keys()].filter((n) => !aByName.has(n)).sort();

  const typeMismatches: string[] = [];
  const nullabilityMismatches: string[] = [];
  for (const [name, colA] of [...aByName.entries()].sort(([x], [y]) => x.localeCompare(y))) {
    const colB = bByName.get(name);
    if (!colB) continue;
    if (!typesEquivalent(colA.sqlType, colB.sqlType)) {
      typeMismatches.push(
        `${name} (${a.sources[0]}: ${colA.sqlType} vs ${b.sources[0]}: ${colB.sqlType})`,
      );
    }
    if (colA.notNull !== colB.notNull) {
      nullabilityMismatches.push(
        `${name} (${a.sources[0]}: ${colA.notNull ? "not null" : "nullable"} vs ` +
          `${b.sources[0]}: ${colB.notNull ? "not null" : "nullable"})`,
      );
    }
  }

  const parts: string[] = [];
  if (onlyA.length) parts.push(`columns only in ${a.sources[0]}: ${onlyA.join(", ")}`);
  if (onlyB.length) parts.push(`columns only in ${b.sources[0]}: ${onlyB.join(", ")}`);
  if (typeMismatches.length) parts.push(`type mismatch on: ${typeMismatches.join(", ")}`);
  if (nullabilityMismatches.length) {
    parts.push(`nullability mismatch on: ${nullabilityMismatches.join(", ")}`);
  }
  if (!parts.length) return undefined;

  // Both sides holding exclusive columns is real two-directional disagreement;
  // only one side holding extras is the shape of a deliberate, narrower mirror.
  // A type or nullability disagreement on a column BOTH sides declare is
  // always treated as the stronger "divergent" signal too — a mirror can
  // legitimately omit a column, but it cannot legitimately describe a column
  // it does include any differently than the source it mirrors.
  const hasNameDivergence = onlyA.length > 0 && onlyB.length > 0;
  const hasValueDisagreement = typeMismatches.length > 0 || nullabilityMismatches.length > 0;
  const direction: "subset" | "divergent" =
    hasNameDivergence || hasValueDisagreement ? "divergent" : "subset";
  return { difference: parts.join("; "), direction };
}

/**
 * Merge every declared source into one schema, recording disagreement between
 * sources rather than letting the last one win. This project declares schema in
 * both `src/db/schema/` and `mcp-server/src/db/schema.ts`; silent last-wins
 * merging would hide exactly the divergence worth reporting.
 *
 * DEVIATION (controller decision, SCOPE-121/T005): the brief defaults
 * `getTableConfig` to `cachedConfigFn as TableConfigFn`, which silently casts
 * `undefined` to a function type when neither `primeTableConfig` nor
 * `loadSchemaModules` has run first. The stock failure mode is then a bare
 * "getTableConfig is not a function" thrown deep inside `readTable`, with no
 * indication of the real cause. Guard explicitly and name the fix.
 */
export function extractDeclaredSchema(
  sources: DeclaredSource[],
  getTableConfig: TableConfigFn = cachedConfigFn as TableConfigFn,
): DeclaredSchema {
  if (typeof getTableConfig !== "function") {
    throw new Error(
      "extractDeclaredSchema has no getTableConfig implementation. " +
        "Call loadSchemaModules(...) or primeTableConfig(...) before extractDeclaredSchema(...).",
    );
  }

  const tables = new Map<string, DeclaredTable>();
  const conflicts: SourceConflict[] = [];

  for (const source of sources) {
    for (const exported of Object.values(source.module)) {
      const table = readTable(getTableConfig, exported);
      if (!table) continue;
      table.sources = [source.label];

      const existing = tables.get(table.name);
      if (!existing) {
        tables.set(table.name, table);
        continue;
      }

      const difference = describeDifference(existing, table);
      if (difference) {
        conflicts.push({
          table: table.name,
          sources: [...existing.sources, source.label],
          difference: difference.difference,
          direction: difference.direction,
        });
      }
      existing.sources.push(source.label);
    }
  }

  return { tables, conflicts };
}
// [SCOPE 121 / T005] END

// [SCOPE 121 / T005] BEGIN — Schema module loading
/**
 * A requested schema source that could not be resolved to an importable
 * module, and why. Kept separate from a thrown error because the caller, not
 * this function, decides whether a missing source is fatal — but it must
 * never be silently dropped: if `mcp-server/src/db/schema.ts` is ever moved
 * or renamed, a run where every path fails to resolve must not quietly
 * report a clean `tables: 0, conflicts: 0` schema.
 */
export interface UnresolvedSchemaSource {
  label: string;
  path: string;
  reason: "path does not exist" | "directory has no index.ts";
}

export interface LoadSchemaModulesResult {
  sources: DeclaredSource[];
  unresolved: UnresolvedSchemaSource[];
}

/**
 * Import each declared schema path. Directories are imported via their
 * `index.ts` barrel; single files are imported directly. Every path that
 * cannot be resolved is reported in `unresolved` rather than dropped.
 */
export async function loadSchemaModules(
  paths: ReadonlyArray<{ label: string; path: string }>,
): Promise<LoadSchemaModulesResult> {
  await loadTableConfigFn();
  const { pathToFileURL } = await import("node:url");
  const { existsSync, statSync } = await import("node:fs");
  const { resolve, join } = await import("node:path");

  const sources: DeclaredSource[] = [];
  const unresolved: UnresolvedSchemaSource[] = [];
  for (const entry of paths) {
    const target = resolve(entry.path);
    if (!existsSync(target)) {
      unresolved.push({
        label: entry.label,
        path: entry.path,
        reason: "path does not exist",
      });
      continue;
    }
    const isDirectory = statSync(target).isDirectory();
    const file = isDirectory ? join(target, "index.ts") : target;
    if (!existsSync(file)) {
      unresolved.push({
        label: entry.label,
        path: entry.path,
        reason: "directory has no index.ts",
      });
      continue;
    }
    const module = (await import(pathToFileURL(file).href)) as Record<
      string,
      unknown
    >;
    sources.push({ label: entry.label, module });
  }
  return { sources, unresolved };
}
// [SCOPE 121 / T005] END
