import type { DimensionId } from "./finding.js";

// [SCOPE 121 / T003] BEGIN — Engine identity and adapter contract
export const ENGINE_IDS = [
  "postgres",
  "mssql",
  "mysql",
  "oracle",
  "firebird",
] as const;

export type EngineId = (typeof ENGINE_IDS)[number];

/**
 * "not-applicable" means the engine has no analogue for the check (an honest
 * absence). "not-implemented" means we have not written it yet (a gap).
 * "not-selected" means it IS implemented and the current engine supports it,
 * but this particular run did not ask for it (e.g. `--dimension schema` on a
 * build where `integrity` also ships) — see `cli.ts`'s `dimensionStatuses`.
 * These are reported differently and must never be collapsed: an operator
 * reading "not-implemented" next to a dimension that actually shipped would
 * be told the wrong thing about what wxDBAnalyze is capable of.
 */
export type SupportLevel =
  | "full"
  | "partial"
  | "not-applicable"
  | "not-implemented"
  | "not-selected";

export interface DbConnection {
  query(
    sql: string,
    params?: readonly unknown[],
  ): Promise<ReadonlyArray<Record<string, unknown>>>;
  close(): Promise<void>;
}

export interface RawDimensionData {
  dimension: DimensionId;
  engine: EngineId;
  support: SupportLevel;
  /** Populated only when support is "full" or "partial". */
  data: Record<string, unknown>;
  /** Present when support is not "full" — states why, in operator-readable terms. */
  note?: string;
}

export interface AdditiveRule {
  pattern: RegExp;
  lockClass: string;
  rationale: string;
}

export interface EngineAdapter {
  readonly engine: EngineId;
  supports(dimension: DimensionId): SupportLevel;
  connect(url: string): Promise<DbConnection>;
  collect(
    dimension: DimensionId,
    connection: DbConnection,
  ): Promise<RawDimensionData>;
  additiveWhitelist(): AdditiveRule[];
}
// [SCOPE 121 / T003] END

// [SCOPE 121 / T003] BEGIN — Engine resolution
const SCHEME_TO_ENGINE: ReadonlyMap<string, EngineId> = new Map([
  ["postgres", "postgres"],
  ["postgresql", "postgres"],
  ["mssql", "mssql"],
  ["sqlserver", "mssql"],
  ["mysql", "mysql"],
  ["mariadb", "mysql"],
  ["oracle", "oracle"],
  ["oracledb", "oracle"],
  ["firebird", "firebird"],
  ["fb", "firebird"],
]);

const STACK_KEYWORDS: ReadonlyArray<[RegExp, EngineId]> = [
  [/postgres/i, "postgres"],
  [/sql\s*server|mssql/i, "mssql"],
  [/mysql|mariadb/i, "mysql"],
  [/oracle/i, "oracle"],
  [/firebird|interbase/i, "firebird"],
];

function isEngineId(value: string): value is EngineId {
  return (ENGINE_IDS as readonly string[]).includes(value);
}

/**
 * Resolve the engine from, in order: an explicit flag, the connection-string
 * scheme, then the project's declared stack. Throws rather than defaulting —
 * guessing the engine would mean running one dialect's SQL against another.
 */
export function resolveEngine(opts: {
  explicit?: string;
  url?: string;
  projectStack?: string;
}): EngineId {
  if (opts.explicit) {
    if (!isEngineId(opts.explicit)) {
      throw new Error(
        `unknown engine ${JSON.stringify(opts.explicit)} — supported: ${ENGINE_IDS.join(", ")}`,
      );
    }
    return opts.explicit;
  }

  if (opts.url) {
    const scheme = opts.url.split(":", 1)[0]?.toLowerCase() ?? "";
    const fromScheme = SCHEME_TO_ENGINE.get(scheme);
    if (fromScheme) return fromScheme;
  }

  if (opts.projectStack) {
    for (const [pattern, engine] of STACK_KEYWORDS) {
      if (pattern.test(opts.projectStack)) return engine;
    }
  }

  throw new Error(
    "cannot determine the database engine — pass --engine, or supply a " +
      "connection string whose scheme names the engine",
  );
}
// [SCOPE 121 / T003] END
