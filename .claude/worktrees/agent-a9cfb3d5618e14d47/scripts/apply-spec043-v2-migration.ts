#!/usr/bin/env tsx
/**
 * Apply spec 043 v2 (web triage console + accept-to-scope) — migration 0030.
 *
 * Mirrors the apply-spec046-migration.ts pattern: pg.Client + single
 * transaction. Idempotent: the migration uses ADD COLUMN IF NOT EXISTS, so
 * re-running is a no-op. Pass --dry-run to print the SQL without applying.
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { Client } from "pg";
import { config } from "dotenv";

config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MIGRATION_FILE = "0030_spec043_v2_disposition.sql";
const V2_COLUMNS = [
  "aiproposeddisposition",
  "dispositionrationale",
  "disposition",
  "dispositionedat",
  "dispositionedbyid",
  "linkedscopenumber",
  "scopeseed",
];

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
    ssl: isProduction ? { rejectUnauthorized: true } : { rejectUnauthorized: false },
  });
}

async function presentColumns(client: Client): Promise<Set<string>> {
  const { rows } = await client.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'feedbacksubmissions'
       AND column_name = ANY($1::text[])`,
    [V2_COLUMNS],
  );
  return new Set(rows.map((r) => r.column_name));
}

async function apply(client: Client): Promise<void> {
  const path = resolve(__dirname, "../src/db/migrations", MIGRATION_FILE);
  const sql = readFileSync(path, "utf-8");

  await client.query("BEGIN");
  try {
    console.log(`Applying ${MIGRATION_FILE}...`);
    await client.query(sql);
    await client.query("COMMIT");
    console.log(`  ${MIGRATION_FILE} applied`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

async function verify(client: Client): Promise<void> {
  const present = await presentColumns(client);
  console.log("\nPost-migration verify (feedbacksubmissions v2 columns):");
  let ok = true;
  for (const col of V2_COLUMNS) {
    const has = present.has(col);
    if (!has) ok = false;
    console.log(`  ${col.padEnd(24)} ${has ? "present" : "MISSING"}`);
  }
  if (!ok) throw new Error("verify failed — some v2 columns are missing.");
}

async function main(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }
  const isProduction = process.env.NODE_ENV === "production";
  const dryRun = process.argv.includes("--dry-run");

  if (dryRun) {
    const path = resolve(__dirname, "../src/db/migrations", MIGRATION_FILE);
    console.log(`--dry-run — would apply ${MIGRATION_FILE}:\n`);
    console.log(readFileSync(path, "utf-8"));
    return;
  }

  const client = makeClient(dbUrl, isProduction);
  await client.connect();
  try {
    await apply(client);
    await verify(client);
    console.log("\nspec 043 v2 migration complete.");
  } finally {
    await client.end();
  }
}

main().catch((err: Error) => {
  console.error(`Migration failed: ${err.message}`);
  process.exit(1);
});
