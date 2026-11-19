#!/usr/bin/env tsx
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { Client } from "pg";
import { config } from "dotenv";

config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MIGRATION_FILE = resolve(
  __dirname,
  "../src/db/migrations/0007_spec026_codefencing.sql",
);

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

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }

  const isProduction = process.env.NODE_ENV === "production";
  const client = new Client({
    connectionString: cleanConnectionString(dbUrl),
    ssl: isProduction
      ? { rejectUnauthorized: true }
      : { rejectUnauthorized: false },
  });

  const sql = readFileSync(MIGRATION_FILE, "utf-8");
  const statements = sql
    .split(/-->\s*statement-breakpoint/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  console.log(
    `Applying 0007_spec026_codefencing — ${statements.length} statements`,
  );

  await client.connect();
  try {
    await client.query("BEGIN");
    for (const [i, stmt] of statements.entries()) {
      console.log(`  [${i + 1}/${statements.length}] ${stmt.slice(0, 80)}...`);
      await client.query(stmt);
    }
    await client.query("COMMIT");
    console.log("Migration applied successfully");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Migration failed, rolled back:", err);
    process.exit(1);
  } finally {
    await client.end();
  }

  const verify = new Client({
    connectionString: cleanConnectionString(dbUrl),
    ssl: isProduction
      ? { rejectUnauthorized: true }
      : { rejectUnauthorized: false },
  });
  await verify.connect();
  const result = await verify.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name IN ('taskfences','taskfencemodifications','taskfencehistory','taskfenceslegacy')
     ORDER BY table_name`,
  );
  await verify.end();
  console.log("\nVerified tables present:");
  for (const row of result.rows) {
    console.log(`  - ${row.table_name}`);
  }
  if (result.rows.length !== 4) {
    console.error(`Expected 4 tables, got ${result.rows.length}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
