#!/usr/bin/env tsx
/**
 * Generic migration applier — applies a single SQL file from src/db/migrations in a
 * transaction, via the pg.Client pattern (idempotent migrations only).
 *
 * Run:  npx tsx scripts/apply-migration.ts 0041_spec106_project_theme_chrome.sql
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { Client } from "pg";
import { config } from "dotenv";

config();

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
  const file = process.argv[2];
  if (!file) {
    console.error("usage: apply-migration.ts <file.sql>");
    process.exit(1);
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
    const sql = readFileSync(resolve(process.cwd(), "src/db/migrations", file), "utf-8");
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
    console.log(`Applied ${file}`);
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
