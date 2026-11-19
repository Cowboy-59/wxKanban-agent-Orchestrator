#!/usr/bin/env tsx
/**
 * SPEC-126 / T007 verification — prove a real Drizzle SELECT naming `brandschema` succeeds
 * against the live database on all three theme tiers.
 *
 * This is the specific production risk the ordering rule exists for: Drizzle names every
 * declared column in its SELECT, so a column declared before it is added throws
 * "column does not exist" on every query against that table. Read-only; writes nothing.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { config } from "dotenv";

import { projectthemes } from "../src/db/schema/projecttheme";
import { themetemplates } from "../src/db/schema/themetemplate";
import { companythemeprofiles } from "../src/db/schema/companythemeprofile";

config();

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

async function main(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }
  const client = new Client({
    connectionString: cleanConnectionString(dbUrl),
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  const db = drizzle(client);

  try {
    // Full-column selects — exactly what a route does, and what would throw if the
    // declaration and the deployed schema disagreed.
    const pt = await db.select().from(projectthemes).limit(3);
    console.log(`projectthemes         ${pt.length} row(s), brandschema selectable`);

    const tt = await db.select().from(themetemplates).limit(3);
    console.log(`themetemplates        ${tt.length} row(s), brandschema selectable`);

    const cp = await db.select().from(companythemeprofiles).limit(3);
    console.log(`companythemeprofiles  ${cp.length} row(s), brandschema selectable`);

    const nonNull = [...pt, ...tt, ...cp].filter((r) => r.brandschema !== null).length;
    console.log(`\nrows carrying a brand schema: ${nonNull} (0 expected — nothing has been captured yet)`);
    console.log("PASS — all three tiers select cleanly with brandschema declared");
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error("FAIL —", err instanceof Error ? err.message : err);
  process.exit(1);
});
