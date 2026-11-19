#!/usr/bin/env tsx
/**
 * Diagnostic for SCOPE-129 / SPEC-126 T006 — why ALTER TABLE was refused.
 *
 * Read-only. Prints role names and ownership, never a credential or a connection string.
 */
import { Client } from "pg";
import { config } from "dotenv";

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
  try {
    const who = await client.query(
      "select current_user, session_user, current_database() as db",
    );
    console.log("connected as:", who.rows[0]);

    const owners = await client.query(
      `select tablename, tableowner
         from pg_tables
        where tablename in ('themetemplates','projectthemes','companythemeprofiles')
        order by tablename`,
    );
    console.log("\ntable owners:");
    for (const r of owners.rows) console.log(`  ${String(r.tablename).padEnd(22)} owner=${r.tableowner}`);

    const memberships = await client.query(
      `select r.rolname as role
         from pg_roles r
         join pg_auth_members m on m.roleid = r.oid
         join pg_roles u on u.oid = m.member
        where u.rolname = current_user`,
    );
    console.log("\ncurrent_user is a member of:", memberships.rows.map((r) => r.role).join(", ") || "(none)");

    const attrs = await client.query(
      `select rolsuper, rolcreatedb, rolcreaterole, rolbypassrls
         from pg_roles where rolname = current_user`,
    );
    console.log("current_user attributes:", attrs.rows[0]);

    // Did anything land despite the failure? The applier used a transaction, so expect 0.
    const cols = await client.query(
      `select table_name from information_schema.columns
        where column_name = 'brandschema'
          and table_name in ('themetemplates','projectthemes','companythemeprofiles')`,
    );
    console.log(
      "\nbrandschema columns present:",
      cols.rows.length === 0 ? "NONE — the transaction rolled back cleanly" : cols.rows.map((r) => r.table_name).join(", "),
    );
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
