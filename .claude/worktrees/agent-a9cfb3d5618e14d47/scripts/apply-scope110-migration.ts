#!/usr/bin/env tsx
/**
 * [SCOPE 110] Apply a SCOPE-110 migration file to the DATABASE_URL target.
 *
 * Mirrors apply-spec043-v2-migration.ts: pg.Client + single transaction, SSL
 * relaxed for the managed prod endpoint. Migrations are idempotent (IF NOT
 * EXISTS), so re-running is a no-op. Run once per target DB (app prod, then
 * hosted MCP) by setting DATABASE_URL for each.
 *
 *   tsx scripts/apply-scope110-migration.ts 0052_scope110_feedback_hygiene.sql
 *   tsx scripts/apply-scope110-migration.ts 0053_scope110_unique_error_identity.sql [--dry-run]
 *
 * ORDER MATTERS: 0052 → (run scope110-merge-auto-duplicates.ts) → 0053.
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { Client } from "pg";
import { config } from "dotenv";

config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

async function main(): Promise<void> {
  const fileArg = process.argv.find((a) => a.endsWith(".sql"));
  if (!fileArg) {
    console.error("usage: apply-scope110-migration.ts <migration>.sql [--dry-run]");
    process.exit(1);
  }
  const path = resolve(__dirname, "../src/db/migrations", fileArg);
  const sql = readFileSync(path, "utf-8");

  if (process.argv.includes("--dry-run")) {
    console.log(`--dry-run — would apply ${fileArg}:\n`);
    console.log(sql);
    return;
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }
  const isProduction = process.env.NODE_ENV === "production";
  const client = new Client({
    connectionString: cleanConnectionString(dbUrl),
    ssl: isProduction ? { rejectUnauthorized: true } : { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query("BEGIN");
    try {
      console.log(`Applying ${fileArg}...`);
      await client.query(sql);
      await client.query("COMMIT");
      console.log(`  ${fileArg} applied`);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  } finally {
    await client.end();
  }
}

main().catch((err: Error) => {
  console.error(`Migration failed: ${err.message}`);
  process.exit(1);
});
