#!/usr/bin/env tsx
/**
 * Read-only — list the human owners of the 8 actively-used personal apitokens
 * that spec 028 Phase 11 migration would drop. Used to make an informed
 * proceed/backfill call before applying 0022.
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
    const rows = await client.query<{
      tokenname: string | null;
      lastusedat: Date | null;
      createdat: Date;
      emailaddr: string | null;
      fullname: string | null;
      companyid: string;
      companyname: string | null;
      projectcount: string;
    }>(
      `WITH active_personal AS (
         SELECT * FROM apitokens
         WHERE projectid IS NULL
           AND revokedat IS NULL
           AND lastusedat > now() - interval '30 days'
       )
       SELECT
         a.name AS tokenname,
         a.lastusedat,
         a.createdat,
         u.emailaddr,
         u.fullname,
         a.companyid,
         c.name AS companyname,
         (SELECT count(*)::text FROM companyprojects cp WHERE cp.companyid = a.companyid) AS projectcount
       FROM active_personal a
       LEFT JOIN userprofiles u ON u.id = a.userid
       LEFT JOIN companies c ON c.id = a.companyid
       ORDER BY a.lastusedat DESC NULLS LAST`,
    );

    if (rows.rows.length === 0) {
      console.log("No active personal tokens to inspect.");
      return;
    }
    console.log(`\nActive personal apitokens (used in last 30d): ${rows.rows.length}\n`);
    for (const r of rows.rows) {
      const who = r.fullname?.trim() || "(no name)";
      console.log(
        `  user:        ${who} <${r.emailaddr ?? "no-email"}>\n` +
          `  company:     ${r.companyname ?? "(unnamed)"} (${r.projectcount} projects)\n` +
          `  token name:  ${r.tokenname ?? "(unnamed)"}\n` +
          `  last used:   ${r.lastusedat?.toISOString() ?? "never"}\n` +
          `  created:     ${r.createdat.toISOString()}\n`,
      );
    }
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
