#!/usr/bin/env tsx
/**
 * Apply spec 046 (Marketing — Lead Capture & Funnel) — migration 0028 — and seed
 * the July 5 2026 launch campaign (FR-014).
 *
 * Mirrors the apply-spec028-migration.ts pattern: pg.Client + single transaction.
 * Idempotent: skips table creation if `marketingleads` already exists, and the
 * campaign seed uses a fixed id with ON CONFLICT DO NOTHING.
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { Client } from "pg";
import { config } from "dotenv";

config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MIGRATION_FILE = "0028_spec046_marketing_lead_capture.sql";
// Fixed id so the seed is idempotent and referenceable by the sites.
const JULY5_CAMPAIGN_ID = "01975000-0000-7000-8000-000000000045";

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

async function tableExists(client: Client, name: string): Promise<boolean> {
  const { rows } = await client.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1
     ) AS exists`,
    [name],
  );
  return rows[0]?.exists ?? false;
}

async function apply(client: Client): Promise<void> {
  const path = resolve(__dirname, "../src/db/migrations", MIGRATION_FILE);
  const sql = readFileSync(path, "utf-8");

  await client.query("BEGIN");
  try {
    if (await tableExists(client, "marketingleads")) {
      console.log("marketingleads already exists — skipping table creation.");
    } else {
      console.log(`Applying ${MIGRATION_FILE}...`);
      await client.query(sql);
      console.log(`  ${MIGRATION_FILE} applied`);
    }

    // Seed the July 5 2026 launch campaign (FR-014) — idempotent.
    console.log("Seeding July 5 2026 launch campaign...");
    await client.query(
      `INSERT INTO campaigns (id, companyid, name, segment, launchdate, status)
       VALUES ($1, NULL, $2, $3, $4, $5)
       ON CONFLICT (id) DO NOTHING`,
      [
        JULY5_CAMPAIGN_ID,
        "WINDEV Launch — July 2026",
        "windev",
        "2026-07-05T00:00:00.000Z",
        "active",
      ],
    );
    console.log(`  campaign ${JULY5_CAMPAIGN_ID} ensured`);

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

async function verify(client: Client): Promise<void> {
  const leads = await tableExists(client, "marketingleads");
  const camps = await tableExists(client, "campaigns");
  const { rows } = await client.query<{ count: string }>(
    `SELECT count(*) AS count FROM campaigns WHERE id = $1`,
    [JULY5_CAMPAIGN_ID],
  );
  console.log("\nPost-migration verify:");
  console.log(`  marketingleads table:   ${leads ? "present" : "MISSING"}`);
  console.log(`  campaigns table:        ${camps ? "present" : "MISSING"}`);
  console.log(`  July-5 campaign rows:   ${rows[0]?.count}`);
  if (!leads || !camps || rows[0]?.count !== "1") {
    throw new Error("verify failed — see counts above.");
  }
}

async function main(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }
  const isProduction = process.env.NODE_ENV === "production";
  const dryRun = process.argv.includes("--dry-run");

  const client = makeClient(dbUrl, isProduction);
  await client.connect();
  try {
    if (dryRun) {
      const leads = await tableExists(client, "marketingleads");
      console.log(
        `--dry-run: marketingleads ${leads ? "exists" : "does not exist"}; no changes made.`,
      );
      return;
    }
    await apply(client);
    await verify(client);
    console.log("\nSpec 046 migration + seed applied successfully.");
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
