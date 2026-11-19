#!/usr/bin/env tsx
/**
 * One-off inspection — read-only — before spec 028 Phase 11 migration.
 * Surfaces how active the personal/user-level apitokens rows actually are
 * so the operator can judge whether dropping them is safe.
 */
import { Client } from "pg";
import { config } from "dotenv";
config();

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

async function main(): Promise<void> {
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
  await client.connect();
  try {
    const personal = await client.query<{
      bucket: string;
      count: string;
    }>(
      `SELECT
         CASE
           WHEN lastusedat IS NULL THEN 'never_used'
           WHEN lastusedat > now() - interval '7 days' THEN 'used_last_7d'
           WHEN lastusedat > now() - interval '30 days' THEN 'used_last_30d'
           WHEN lastusedat > now() - interval '90 days' THEN 'used_last_90d'
           ELSE 'older_than_90d'
         END AS bucket,
         count(*)::text AS count
       FROM apitokens
       WHERE projectid IS NULL
         AND revokedat IS NULL
       GROUP BY bucket
       ORDER BY count DESC`,
    );

    const distinctUsers = await client.query<{ users: string }>(
      `SELECT count(DISTINCT userid)::text AS users
       FROM apitokens
       WHERE projectid IS NULL AND revokedat IS NULL`,
    );

    console.log("\nPersonal apitokens (projectid IS NULL, not revoked) by usage:");
    for (const row of personal.rows) {
      console.log(`  ${row.bucket.padEnd(18)} ${row.count}`);
    }
    console.log(`\n  distinct users with personal tokens: ${distinctUsers.rows[0]?.users ?? 0}`);

    const sampleRecent = await client.query<{
      userid: string;
      name: string | null;
      lastusedat: Date | null;
      createdat: Date;
    }>(
      `SELECT userid, name, lastusedat, createdat
       FROM apitokens
       WHERE projectid IS NULL AND revokedat IS NULL
         AND lastusedat > now() - interval '30 days'
       ORDER BY lastusedat DESC
       LIMIT 10`,
    );

    if (sampleRecent.rows.length > 0) {
      console.log("\nMost recently used personal tokens (top 10, last 30d):");
      for (const row of sampleRecent.rows) {
        console.log(
          `  user=${row.userid.slice(0, 8)}… name=${(row.name ?? "(unnamed)").slice(0, 40)} lastused=${row.lastusedat?.toISOString() ?? "(never)"}`,
        );
      }
    } else {
      console.log("\nNo personal tokens used in the last 30 days.");
    }
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
