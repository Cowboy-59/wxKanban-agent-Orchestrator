#!/usr/bin/env tsx
/**
 * [SCOPE 110] Apply the hosted-MCP-DB migration (scope110-mcp-migration.sql).
 *
 * The hosted MCP DB is a SEPARATE database whose connection string lives in the
 * App Runner env, not in the repo. Provide it via MCP_DATABASE_URL (preferred) or
 * DATABASE_URL when running this script:
 *
 *   MCP_DATABASE_URL="postgres://…" tsx scripts/apply-scope110-mcp-migration.ts
 *   tsx scripts/apply-scope110-mcp-migration.ts --dry-run   # print SQL only
 *
 * If this DB somehow holds source='auto' rows, run the merge against it FIRST:
 *   DATABASE_URL="<mcp>" tsx scripts/scope110-merge-auto-duplicates.ts
 *
 * Single transaction; idempotent (IF NOT EXISTS throughout).
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { Client } from "pg";
import { config } from "dotenv";

config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SQL_FILE = resolve(__dirname, "scope110-mcp-migration.sql");

function cleanConnectionString(url: string): string {
  try {
    const p = new URL(url);
    p.searchParams.delete("sslmode");
    p.searchParams.delete("ssl");
    return p.toString();
  } catch {
    return url;
  }
}

async function main(): Promise<void> {
  const sql = readFileSync(SQL_FILE, "utf-8");
  if (process.argv.includes("--dry-run")) {
    console.log("--dry-run — would apply scope110-mcp-migration.sql:\n");
    console.log(sql);
    return;
  }
  const dbUrl = process.env.MCP_DATABASE_URL || process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("Set MCP_DATABASE_URL (or DATABASE_URL) to the hosted MCP DB connection string.");
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
      console.log("Applying scope110-mcp-migration.sql to the hosted MCP DB...");
      await client.query(sql);
      await client.query("COMMIT");
      console.log("  applied");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  } finally {
    await client.end();
  }
}

main().catch((err: Error) => {
  console.error(`MCP migration failed: ${err.message}`);
  process.exit(1);
});
