#!/usr/bin/env tsx
/**
 * Apply SCOPE-063 — migration 0036 / T001.
 * Adds four nullable columns to feedbacksubmissions (suggestedsolution,
 * suggestedsolutionrationale, suggestedat, linkedtaskid).
 * Idempotent (ADD COLUMN IF NOT EXISTS). pg.Client + transaction
 * (reference_drizzle_migration_apply — drizzle-kit push needs a TTY).
 *
 * Run:  npx tsx scripts/apply-spec063-migration.ts            (apply)
 *       npx tsx scripts/apply-spec063-migration.ts --dry-run  (report column state)
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { Client } from "pg";
import { config } from "dotenv";

config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MIGRATION_FILE = "0036_spec063_bugreport_suggestions.sql";
const COLUMNS = [
  "suggestedsolution",
  "suggestedsolutionrationale",
  "suggestedat",
  "linkedtaskid",
];

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
    `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='feedbacksubmissions' AND column_name=$1) AS exists`,
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
  let host = "unknown";
  try { host = new URL(dbUrl).host; } catch { /* ignore */ }
  console.log(`Target DB host: ${host}`);

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
        console.log(`--dry-run: feedbacksubmissions.${c}`, (await columnExists(client, c)) ? "exists" : "missing");
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
      console.log(`Post-migration: feedbacksubmissions.${c}=${present ? "present" : "MISSING"}`);
      if (!present) ok = false;
    }
    if (!ok) throw new Error("verify failed");
    console.log("SCOPE-063 migration applied successfully.");
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
