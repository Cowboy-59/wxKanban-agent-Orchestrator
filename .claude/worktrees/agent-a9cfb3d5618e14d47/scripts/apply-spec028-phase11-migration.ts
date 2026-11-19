#!/usr/bin/env tsx
/**
 * Apply spec 028 Phase 11 (Token Store Unification) — migration 0022.
 *
 * Copies live project-scoped non-revoked apitokens rows into mcpapitokens,
 * then drops the apitokens table. One-way; rollback requires restoring from
 * backup.
 *
 * Mirrors the apply-spec028-migration.ts pattern: pg.Client + single
 * transaction. Pre-flight count surfaces how many personal/revoked rows the
 * migration will drop so the operator can abort before the DROP TABLE.
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { Client } from "pg";
import { config } from "dotenv";

config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MIGRATION_FILE = "0022_spec028_unify_tokens.sql";

function cleanConnectionString(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete("sslmode");
    parsed.searchParams.delete("ssl");
    return parsed.toString();
  } catch {
    return url;
  }
}

function makeClient(dbUrl: string, isProduction: boolean): Client {
  return new Client({
    connectionString: cleanConnectionString(dbUrl),
    ssl: isProduction
      ? { rejectUnauthorized: true }
      : { rejectUnauthorized: false },
  });
}

async function preflight(client: Client): Promise<void> {
  const [{ rows: existsRows }, { rows: countRows }] = await Promise.all([
    client.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'apitokens'
       ) AS exists`,
    ),
    client.query<{
      total: string;
      personal: string;
      revoked: string;
      migratable: string;
    }>(
      `SELECT
         count(*) FILTER (WHERE TRUE) AS total,
         count(*) FILTER (WHERE projectid IS NULL) AS personal,
         count(*) FILTER (WHERE revokedat IS NOT NULL) AS revoked,
         count(*) FILTER (WHERE projectid IS NOT NULL AND revokedat IS NULL) AS migratable
       FROM apitokens`,
    ),
  ]).catch((err: unknown) => {
    // If apitokens doesn't exist, preflight query above fails. Treat as already-migrated.
    if (err instanceof Error && /relation "apitokens" does not exist/.test(err.message)) {
      throw new Error("apitokens table is already gone — migration already applied.");
    }
    throw err;
  });

  if (!existsRows[0]?.exists) {
    throw new Error("apitokens table is already gone — migration already applied.");
  }

  const { total, personal, revoked, migratable } = countRows[0]!;
  console.log("\nPre-flight counts:");
  console.log(`  total rows in apitokens:                 ${total}`);
  console.log(`  personal/user-level (will be DROPPED):   ${personal}`);
  console.log(`  revoked (will be DROPPED):               ${revoked}`);
  console.log(`  project-scoped + active (will migrate):  ${migratable}`);
  console.log(
    "\nAfter migration: apitokens DROPPED. mcpapitokens is the only token store.\n",
  );
}

async function apply(client: Client): Promise<void> {
  const path = resolve(__dirname, "../src/db/migrations", MIGRATION_FILE);
  const sql = readFileSync(path, "utf-8");

  console.log(`Applying ${MIGRATION_FILE}...`);
  // The migration file already wraps in BEGIN/COMMIT, so submit as one query.
  await client.query(sql);
  console.log(`  ${MIGRATION_FILE} committed`);
}

async function verify(client: Client): Promise<void> {
  const apitokensExists = await client.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'apitokens'
     ) AS exists`,
  );
  if (apitokensExists.rows[0]?.exists) {
    throw new Error("Post-migration verify: apitokens still exists.");
  }

  const mcpCount = await client.query<{ count: string }>(
    `SELECT count(*) AS count FROM mcpapitokens WHERE revokedat IS NULL`,
  );
  console.log("\nPost-migration verify:");
  console.log("  apitokens table:               DROPPED");
  console.log(`  mcpapitokens active rows:      ${mcpCount.rows[0]?.count}`);
}

async function main(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }

  const isProduction = process.env.NODE_ENV === "production";
  const dryRun = process.argv.includes("--dry-run");

  const client = makeClient(dbUrl, isProduction);
  await client.connect();
  try {
    await preflight(client);
    if (dryRun) {
      console.log("--dry-run: not executing migration.");
      return;
    }
    await apply(client);
    await verify(client);
    console.log("\nSpec 028 Phase 11 migration applied successfully.");
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
