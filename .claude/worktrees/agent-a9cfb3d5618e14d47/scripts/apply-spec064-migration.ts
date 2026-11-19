#!/usr/bin/env tsx
/**
 * Apply SCOPE-064 (Marketing Dashboard) — migration 0037 / T004.
 * Creates newsletterissues + newslettersends and adds marketingcontacts.unsubscribedat.
 * Idempotent (CREATE TABLE/INDEX/COLUMN IF NOT EXISTS + DO-block FK guards). pg.Client + transaction.
 *
 * Run:  npx tsx scripts/apply-spec064-migration.ts            (apply)
 *       npx tsx scripts/apply-spec064-migration.ts --dry-run  (report table state)
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { Client } from "pg";
import { config } from "dotenv";

config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MIGRATION_FILE = "0037_spec064_newsletter.sql";
const TABLES = ["newsletterissues", "newslettersends"];

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

async function tableExists(client: Client, table: string): Promise<boolean> {
  const { rows } = await client.query<{ exists: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1) AS exists`,
    [table],
  );
  return rows[0]?.exists ?? false;
}

async function columnExists(client: Client, table: string, column: string): Promise<boolean> {
  const { rows } = await client.query<{ exists: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2) AS exists`,
    [table, column],
  );
  return rows[0]?.exists ?? false;
}

async function main(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }
  const isProduction = process.env.NODE_ENV === "production";
  const dryRun = process.argv.includes("--dry-run");
  const client = new Client({
    connectionString: cleanConnectionString(dbUrl),
    ssl: isProduction ? { rejectUnauthorized: true } : { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    if (dryRun) {
      for (const t of TABLES) {
        console.log(`--dry-run: ${t}`, (await tableExists(client, t)) ? "exists" : "missing");
      }
      console.log(
        "--dry-run: marketingcontacts.unsubscribedat",
        (await columnExists(client, "marketingcontacts", "unsubscribedat")) ? "exists" : "missing",
      );
      return;
    }
    const sql = readFileSync(resolve(__dirname, "../src/db/migrations", MIGRATION_FILE), "utf-8");
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
    let ok = true;
    for (const t of TABLES) {
      const present = await tableExists(client, t);
      console.log(`Post-migration: ${t}=${present ? "present" : "MISSING"}`);
      if (!present) ok = false;
    }
    const col = await columnExists(client, "marketingcontacts", "unsubscribedat");
    console.log(`Post-migration: marketingcontacts.unsubscribedat=${col ? "present" : "MISSING"}`);
    if (!col) ok = false;
    if (!ok) throw new Error("verify failed");
    console.log("SCOPE-064 migration applied successfully.");
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
