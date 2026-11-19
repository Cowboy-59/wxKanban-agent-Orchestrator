#!/usr/bin/env tsx
/**
 * Apply spec 048 (Marketing — In-App Module) — migration 0029.
 * Extends campaigns + adds marketingassets + campaignposts. Idempotent
 * (ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT EXISTS). pg.Client + transaction.
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { Client } from "pg";
import { config } from "dotenv";

config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MIGRATION_FILE = "0029_spec048_marketing_module.sql";

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

async function tableExists(client: Client, name: string): Promise<boolean> {
  const { rows } = await client.query<{ exists: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1) AS exists`,
    [name],
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
      console.log("--dry-run:",
        "marketingassets", (await tableExists(client, "marketingassets")) ? "exists" : "missing",
        "| campaignposts", (await tableExists(client, "campaignposts")) ? "exists" : "missing");
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
    const assets = await tableExists(client, "marketingassets");
    const posts = await tableExists(client, "campaignposts");
    console.log(`Post-migration: marketingassets=${assets ? "present" : "MISSING"} campaignposts=${posts ? "present" : "MISSING"}`);
    if (!assets || !posts) throw new Error("verify failed");
    console.log("Spec 048 migration applied successfully.");
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
