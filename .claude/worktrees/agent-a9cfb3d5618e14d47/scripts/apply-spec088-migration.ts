#!/usr/bin/env tsx
/**
 * Apply SCOPE-088 (Distributor Affiliate + Referral Attribution) — migration 0045 / T001.
 * Adds companies.distributor / referralcode / referredby (+ unique constraint + index).
 * Idempotent (ADD COLUMN IF NOT EXISTS + guarded constraint). pg.Client + transaction.
 *
 * Run:  npx tsx scripts/apply-spec088-migration.ts            (apply)
 *       npx tsx scripts/apply-spec088-migration.ts --dry-run  (report column state)
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { Client } from "pg";
import { config } from "dotenv";

config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MIGRATION_FILE = "0045_scope088_distributor_referral.sql";
const COLUMNS = ["distributor", "referralcode", "referredby"];

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

async function columnExists(client: Client, column: string): Promise<boolean> {
  const { rows } = await client.query<{ exists: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='companies' AND column_name=$1) AS exists`,
    [column],
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
      for (const c of COLUMNS) {
        console.log(`--dry-run: companies.${c}`, (await columnExists(client, c)) ? "exists" : "missing");
      }
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
    for (const c of COLUMNS) {
      const present = await columnExists(client, c);
      console.log(`Post-migration: companies.${c}=${present ? "present" : "MISSING"}`);
      if (!present) ok = false;
    }
    if (!ok) throw new Error("verify failed");
    console.log("SCOPE-088 migration applied successfully.");
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
