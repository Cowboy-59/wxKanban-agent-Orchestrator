/**
 * npm run db:drift
 *
 * Compares the schema declared in code against the schema actually deployed,
 * and exits non-zero if anything declared is missing from the database.
 *
 * This is the local form of the CI gate added under SCOPE 117 / FR-005. Because
 * all schema changes on this project are applied manually, this is the check
 * that confirms a hand-applied change actually landed and matches the code.
 *
 * Reads DATABASE_URL. That points at PRODUCTION on a developer machine — this
 * script only reads the catalog and never writes.
 */

import "dotenv/config";
import * as driftModule from "../wxkanban-agent/core/orchestrator/schema-drift";

// The kit compiles to CommonJS, so when loaded from an ESM context the named
// exports may sit behind `default`. Resolve both shapes without widening types.
type DriftModule = typeof driftModule;
const drift: DriftModule =
  (driftModule as { default?: DriftModule }).default ?? driftModule;
const { runSchemaDrift, formatSchemaDriftText } = drift;

// [SCOPE 117 / T006] BEGIN — Local schema drift check entry point
async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("db:drift — DATABASE_URL is not set.");
    process.exit(2);
  }

  try {
    const result = await runSchemaDrift({
      databaseUrl,
      sources: [
        { label: "app", path: "src/db/schema" },
        { label: "mcp", path: "mcp-server/src/db/schema.ts" },
      ],
    });
    console.log(formatSchemaDriftText(result));
    process.exit(result.missing.length > 0 ? 1 : 0);
  } catch (error) {
    console.error(
      `db:drift failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(2);
  }
}

void main();
// [SCOPE 117 / T006] END
