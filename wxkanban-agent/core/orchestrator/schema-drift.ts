/**
 * Schema drift detection — declared schema vs deployed schema.
 *
 * A table declared in code but absent from the database is invisible until a
 * user hits the route that queries it and receives a 500. That is how
 * `complianceflags` broke the Consultant Hub on 2026-07-30: nine error bursts
 * in a day, of which the CloudFront alarm caught one.
 *
 * This compares what the code declares against what the database actually has.
 *
 * Two directions, deliberately asymmetric:
 *   - declared but NOT deployed  -> a defect. Non-zero exit.
 *   - deployed but NOT declared  -> informational ONLY. Never reported as
 *     removable. Orphan tables are frequently live (marketingcontacts holds
 *     1,006 rows and is queried by raw SQL), and tooling that treats them as
 *     droppable is how production data gets destroyed.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join, resolve } from "path";

export interface SchemaSource {
  /** Human label used in output. */
  label: string;
  /** Directory of *.ts schema modules, or a single schema file. */
  path: string;
}

export interface SchemaDriftResult {
  declared: Map<string, string[]>;
  deployed: Set<string>;
  /** Declared in code, absent from the database. Defects. */
  missing: string[];
  /** Present in the database, declared nowhere. Informational only. */
  orphans: string[];
  sourcesScanned: string[];
  databaseName?: string;
}

// [SCOPE 117 / T007] BEGIN — Declared-table extraction
const PG_TABLE_RE = /pgTable\(\s*["'`]([A-Za-z0-9_]+)["'`]/g;

/**
 * Extract every `pgTable("name", ...)` declaration from a schema source.
 * A source may be a directory of modules or a single file.
 */
export function collectDeclaredTables(sources: SchemaSource[]): {
  declared: Map<string, string[]>;
  scanned: string[];
} {
  const declared = new Map<string, string[]>();
  const scanned: string[] = [];

  for (const source of sources) {
    const target = resolve(source.path);
    if (!existsSync(target)) continue;

    const files: string[] = [];
    let stat: { isDirectory(): boolean };
    try {
      stat = statSync(target);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      for (const entry of readdirSync(target)) {
        if (entry.endsWith(".ts") && !entry.endsWith(".d.ts")) {
          files.push(join(target, entry));
        }
      }
    } else {
      files.push(target);
    }

    for (const file of files) {
      scanned.push(file);
      let contents: string;
      try {
        contents = readFileSync(file, "utf8");
      } catch {
        continue;
      }
      for (const match of contents.matchAll(PG_TABLE_RE)) {
        const table = match[1];
        const owners = declared.get(table) ?? [];
        if (!owners.includes(source.label)) owners.push(source.label);
        declared.set(table, owners);
      }
    }
  }

  return { declared, scanned };
}
// [SCOPE 117 / T007] END

// [SCOPE 117 / T007] BEGIN — Postgres driver loading
/**
 * Minimal structural type for the slice of postgres-js this check uses: a
 * tagged-template query function plus `end()`. Typed structurally rather than
 * imported, because the driver is an optional dependency here.
 */
interface TaggedSql {
  (
    strings: TemplateStringsArray,
    ...values: readonly unknown[]
  ): Promise<ReadonlyArray<Record<string, unknown>>>;
  end(options?: { timeout?: number }): Promise<void>;
}

type PostgresFactory = (
  url: string,
  options?: { prepare?: boolean },
) => TaggedSql;

/**
 * Import the driver dynamically. The orchestrator kit deliberately does not
 * ship database dependencies to consumer projects, so a missing driver must
 * produce a clear message rather than a module-not-found crash.
 */
async function loadPostgresDriver(): Promise<PostgresFactory> {
  let mod: unknown;
  try {
    mod = await import("postgres");
  } catch {
    throw new Error(
      "schema drift check needs the 'postgres' driver, which is not installed here. " +
        "Run it from a project that has database dependencies.",
    );
  }
  const candidate =
    (mod as { default?: unknown }).default ?? (mod as unknown);
  if (typeof candidate !== "function") {
    throw new Error("the 'postgres' module did not export a callable factory");
  }
  return candidate as PostgresFactory;
}
// [SCOPE 117 / T007] END

// [SCOPE 117 / T007] BEGIN — Deployed-table introspection
/**
 * Read the deployed table list from the Postgres catalog.
 */
export async function collectDeployedTables(
  databaseUrl: string,
): Promise<{ deployed: Set<string>; databaseName?: string }> {
  const factory = await loadPostgresDriver();

  const url = new URL(databaseUrl);
  url.searchParams.delete("schema");

  const sql = factory(url.toString(), { prepare: false });
  try {
    // pg_catalog, NOT information_schema: information_schema.tables is
    // privilege-filtered — it only lists tables the connecting role holds a
    // privilege on. A least-privilege CI role would therefore see a short list
    // and every unseen table would be reported as "missing", failing the build
    // for tables that exist. pg_catalog is not filtered, so the check needs
    // only CONNECT and USAGE on the schema.
    const rows = await sql`
      select tablename as table_name from pg_catalog.pg_tables
      where schemaname = 'public'`;
    const nameRow = await sql`select current_database() as db`;
    const deployed = new Set<string>();
    for (const row of rows) {
      const name = row.table_name;
      if (typeof name === "string") deployed.add(name);
    }
    const dbName = nameRow[0]?.db;
    return {
      deployed,
      databaseName: typeof dbName === "string" ? dbName : undefined,
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}
// [SCOPE 117 / T007] END

// [SCOPE 117 / T007] BEGIN — Drift comparison
/**
 * Compare declared against deployed. Pure: takes already-collected sets so it
 * is testable without a database.
 */
export function compareSchemas(
  declared: Map<string, string[]>,
  deployed: Set<string>,
): { missing: string[]; orphans: string[] } {
  const missing = [...declared.keys()].filter((t) => !deployed.has(t)).sort();
  const orphans = [...deployed].filter((t) => !declared.has(t)).sort();
  return { missing, orphans };
}
// [SCOPE 117 / T007] END

// [SCOPE 117 / T007] BEGIN — Drift check entry point
export async function runSchemaDrift(options: {
  sources: SchemaSource[];
  databaseUrl: string;
}): Promise<SchemaDriftResult> {
  const { declared, scanned } = collectDeclaredTables(options.sources);
  const { deployed, databaseName } = await collectDeployedTables(
    options.databaseUrl,
  );
  const { missing, orphans } = compareSchemas(declared, deployed);
  return {
    declared,
    deployed,
    missing,
    orphans,
    sourcesScanned: scanned,
    databaseName,
  };
}
// [SCOPE 117 / T007] END

// [SCOPE 117 / T007] BEGIN — Drift report formatting
export function formatSchemaDriftText(result: SchemaDriftResult): string {
  const lines: string[] = [];
  lines.push(
    `Schema drift — ${result.declared.size} declared, ${result.deployed.size} deployed` +
      (result.databaseName ? ` (database: ${result.databaseName})` : ""),
  );
  lines.push("");

  if (result.missing.length > 0) {
    lines.push(`DECLARED BUT NOT DEPLOYED (${result.missing.length}) — defects:`);
    for (const table of result.missing) {
      const owners = result.declared.get(table)?.join(", ") ?? "unknown";
      lines.push(`  ERROR   ${table.padEnd(28)} declared in ${owners}`);
    }
    lines.push("");
  } else {
    lines.push("DECLARED BUT NOT DEPLOYED (0) — none");
    lines.push("");
  }

  lines.push(
    `UNDECLARED IN DATABASE (${result.orphans.length}) — informational, not managed by this tool:`,
  );
  if (result.orphans.length > 0) {
    lines.push(`  ${result.orphans.join(", ")}`);
    lines.push(
      "  These are NOT reported as removable. An undeclared table may still be live.",
    );
  }
  lines.push("");
  lines.push(
    result.missing.length > 0
      ? `FAIL — ${result.missing.length} declared table(s) missing from the database`
      : "OK — every declared table exists in the database",
  );
  return lines.join("\n");
}

export function formatSchemaDriftJson(result: SchemaDriftResult): string {
  return JSON.stringify(
    {
      summary: {
        declared: result.declared.size,
        deployed: result.deployed.size,
        missing: result.missing.length,
        orphans: result.orphans.length,
        database: result.databaseName,
      },
      missing: result.missing.map((table) => ({
        table,
        declaredIn: result.declared.get(table) ?? [],
      })),
      orphans: result.orphans,
    },
    null,
    2,
  );
}
// [SCOPE 117 / T007] END
