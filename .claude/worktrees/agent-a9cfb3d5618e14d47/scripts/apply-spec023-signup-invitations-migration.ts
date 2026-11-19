#!/usr/bin/env tsx
/**
 * Apply SCOPE-023 (Stripe subscription operations) — migration 0050 / T106.
 * Creates signupinvitations (invite-bound promotional signups, FR-002a).
 * Idempotent (CREATE TABLE / INDEX IF NOT EXISTS + DO-block FK guards). pg.Client + transaction.
 *
 * Run:  npx tsx scripts/apply-spec023-signup-invitations-migration.ts            (apply)
 *       npx tsx scripts/apply-spec023-signup-invitations-migration.ts --dry-run  (report table state)
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { Client } from "pg";
import { config } from "dotenv";

config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MIGRATION_FILE = "0050_scope023_signup_invitations.sql";
const TABLES = ["signupinvitations"];

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
    if (!ok) throw new Error("verify failed");

    // Report the shape so the run is self-evidencing rather than "it said OK".
    const { rows: cols } = await client.query<{ column_name: string; data_type: string }>(
      `SELECT column_name, data_type FROM information_schema.columns
        WHERE table_schema='public' AND table_name='signupinvitations' ORDER BY ordinal_position`,
    );
    console.log(`Columns (${cols.length}):`, cols.map((c) => c.column_name).join(", "));

    const { rows: idx } = await client.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename='signupinvitations' ORDER BY indexname`,
    );
    console.log(`Indexes (${idx.length}):`, idx.map((i) => i.indexname).join(", "));

    console.log("SCOPE-023 signupinvitations migration applied successfully.");
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
