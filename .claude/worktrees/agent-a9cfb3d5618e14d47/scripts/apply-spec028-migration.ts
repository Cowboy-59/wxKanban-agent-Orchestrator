#!/usr/bin/env tsx
/**
 * Apply spec 028 (Hosted MCP Deployment) Phase 1 migrations against the
 * wxKanban Postgres. Follows the spec-026 apply-* pattern (pg.Client +
 * single transaction per file, splits on `--> statement-breakpoint`).
 *
 * Applies 0020_spec028_mcpapitokens.sql and 0021_spec028_mcprequestaudit.sql
 * in order. Idempotent: each statement uses IF NOT EXISTS so reruns are safe.
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { Client } from "pg";
import { config } from "dotenv";

config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MIGRATIONS = [
  "0020_spec028_mcpapitokens.sql",
  "0021_spec028_mcprequestaudit.sql",
] as const;

const EXPECTED_TABLES = ["mcpapitokens", "mcprequestaudit"] as const;

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

async function applyOne(client: Client, filename: string): Promise<void> {
  const path = resolve(__dirname, "../src/db/migrations", filename);
  const sql = readFileSync(path, "utf-8");
  const statements = sql
    .split(/-->\s*statement-breakpoint/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  console.log(`\nApplying ${filename} — ${statements.length} statements`);
  await client.query("BEGIN");
  try {
    for (const [i, stmt] of statements.entries()) {
      console.log(`  [${i + 1}/${statements.length}] ${stmt.slice(0, 80)}...`);
      await client.query(stmt);
    }
    await client.query("COMMIT");
    console.log(`  ${filename} committed`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

async function main(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }

  const isProduction = process.env.NODE_ENV === "production";
  const client = makeClient(dbUrl, isProduction);
  await client.connect();
  try {
    for (const f of MIGRATIONS) {
      await applyOne(client, f);
    }
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    await client.end();
  }

  const verify = makeClient(dbUrl, isProduction);
  await verify.connect();
  const result = await verify.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name = ANY($1::text[])
     ORDER BY table_name`,
    [EXPECTED_TABLES],
  );
  await verify.end();

  console.log("\nVerified tables present:");
  for (const row of result.rows) {
    console.log(`  - ${row.table_name}`);
  }
  if (result.rows.length !== EXPECTED_TABLES.length) {
    console.error(
      `Expected ${EXPECTED_TABLES.length} tables, got ${result.rows.length}`,
    );
    process.exit(1);
  }
  console.log("\nSpec 028 Phase 1 migrations applied successfully.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
