#!/usr/bin/env tsx
/**
 * Apply SPEC-058 (SCOPE-058 scope branch check-out) — migration 0033 / T001.
 * Adds claimedbyid + claimedat to projectspecifications (optimistic scope claim).
 * Idempotent (ADD COLUMN IF NOT EXISTS + DO-block FK guard). pg.Client + transaction.
 *
 * Run:  npx tsx scripts/apply-spec058-migration.ts            (apply)
 *       npx tsx scripts/apply-spec058-migration.ts --dry-run  (report column state)
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { Client } from "pg";
import { config } from "dotenv";

config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MIGRATION_FILE = "0033_spec058_scope_claim_columns.sql";

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
      console.log(
        "--dry-run: projectspecifications.claimedbyid",
        (await columnExists(client, "projectspecifications", "claimedbyid")) ? "exists" : "missing",
        "| claimedat",
        (await columnExists(client, "projectspecifications", "claimedat")) ? "exists" : "missing",
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
    const byid = await columnExists(client, "projectspecifications", "claimedbyid");
    const at = await columnExists(client, "projectspecifications", "claimedat");
    console.log(`Post-migration: claimedbyid=${byid ? "present" : "MISSING"} claimedat=${at ? "present" : "MISSING"}`);
    if (!byid || !at) throw new Error("verify failed");
    console.log("Spec 058 migration applied successfully.");
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
