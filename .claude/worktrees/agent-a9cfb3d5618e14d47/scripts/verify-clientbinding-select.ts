#!/usr/bin/env tsx
/**
 * SPEC-133 / T001 verification — prove a real Drizzle SELECT naming `clientbinding`
 * succeeds against the live database, from BOTH declaration sites.
 *
 * This is the specific production risk the declare-after-apply rule exists for:
 * Drizzle names every declared column in its SELECT, so a column declared before it
 * is added throws "column does not exist" on every query against that table. For
 * `mcpapitokens` that is every authenticated MCP request — the kit, the Cockpit and
 * every agent — not one endpoint.
 *
 * Sibling of scripts/verify-brandschema-select.ts (SPEC-126 / T007), same purpose.
 * Read-only; writes nothing.
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { Client } from 'pg';
import { config } from 'dotenv';

import { mcpapitokens as appTokens } from '../src/db/schema/mcpapitokens';
import { mcpapitokens as mirrorTokens } from '../mcp-server/src/db/schema';

config();

// [SCOPE 133 / T001] BEGIN — clientbinding declaration proof (both schema sites)
function cleanConnectionString(url: string): string {
  try {
    const p = new URL(url);
    p.searchParams.delete('sslmode');
    p.searchParams.delete('ssl');
    return p.toString();
  } catch {
    return url;
  }
}

export async function verifyClientBindingSelect(): Promise<number> {
  const dbUrl = process.env['DATABASE_URL'];
  if (!dbUrl) {
    console.error('DATABASE_URL not set');
    return 1;
  }

  const client = new Client({
    connectionString: cleanConnectionString(dbUrl),
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  const db = drizzle(client);

  let failures = 0;

  try {
    // The mirror is read on every MCP request — the highest-blast-radius site.
    try {
      const rows = await db.select().from(mirrorTokens).limit(3);
      const keys = rows[0] ? Object.keys(rows[0]) : [];
      console.log(`mcp-server mirror : SELECT ok — ${rows.length} rows, ${keys.length} columns`);
      console.log(`                    clientbinding declared: ${keys.includes('clientbinding') ? 'YES' : 'NO'}`);
      if (!keys.includes('clientbinding')) failures++;
    } catch (err) {
      failures++;
      console.log(`mcp-server mirror : FAILED — ${(err as Error).message}`);
    }

    try {
      const rows = await db.select().from(appTokens).limit(3);
      const keys = rows[0] ? Object.keys(rows[0]) : [];
      console.log(`application schema: SELECT ok — ${rows.length} rows, ${keys.length} columns`);
      console.log(`                    clientbinding declared: ${keys.includes('clientbinding') ? 'YES' : 'NO'}`);
      if (!keys.includes('clientbinding')) failures++;
    } catch (err) {
      failures++;
      console.log(`application schema: FAILED — ${(err as Error).message}`);
    }

    // The auth path itself: lookup by tokenhash, as middleware/auth.ts does on every request.
    try {
      const probe = await db
        .select()
        .from(mirrorTokens)
        .where(eq(mirrorTokens.tokenhash, 'no-such-hash-this-matches-nothing'))
        .limit(1);
      console.log(`auth lookup path  : query compiled and ran — ${probe.length} rows (0 expected)`);
    } catch (err) {
      failures++;
      console.log(`auth lookup path  : FAILED — ${(err as Error).message}`);
    }

    // Unbound tokens must still be readable — FR-005.
    try {
      const counts = await client.query(
        `SELECT count(*)::int AS total, count(clientbinding)::int AS bound FROM mcpapitokens`,
      );
      const { total, bound } = counts.rows[0] as { total: number; bound: number };
      console.log(`unbound tokens    : ${total - bound} of ${total} unbound and still readable`);
    } catch (err) {
      failures++;
      console.log(`unbound tokens    : FAILED — ${(err as Error).message}`);
    }

    console.log(failures === 0 ? '\nRESULT: PASS' : `\nRESULT: FAIL (${failures} check(s))`);
    return failures === 0 ? 0 : 1;
  } finally {
    await client.end();
  }
}
// [SCOPE 133 / T001] END

void verifyClientBindingSelect().then((code) => {
  process.exitCode = code;
});
