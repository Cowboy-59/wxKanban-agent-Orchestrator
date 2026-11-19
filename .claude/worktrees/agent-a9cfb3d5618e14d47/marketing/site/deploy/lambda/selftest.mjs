// One-off self-test: prove the wxKanban DB is reachable over TLS, apply the
// marketingcontacts schema, and do an insert -> select -> delete round-trip.
// Run from this folder so node_modules/pg resolves:  node selftest.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { randomUUID } from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../../..");

// read DATABASE_URL straight from .env (no dotenv dep)
const env = fs.readFileSync(path.join(repoRoot, ".env"), "utf8");
const m = env.match(/^DATABASE_URL=(.*)$/m);
if (!m) { console.error("no DATABASE_URL in .env"); process.exit(1); }
const DATABASE_URL = m[1].trim().replace(/^["']|["']$/g, "");
const masked = DATABASE_URL.replace(/(:\/\/[^:]+:)[^@]+@/, "$1****@");
console.log("connecting to:", masked);

const sql = fs.readFileSync(path.join(__dirname, "../sql/marketingcontacts.sql"), "utf8");

// Match the Lambda: strip sslmode (newer pg treats require as verify-full) but still encrypt.
const connectionString = DATABASE_URL.replace(/([?&])sslmode=[^&]*/i, "$1").replace(/[?&]$/, "");
const pool = new pg.Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 8000,
});

try {
  const who = await pool.query(
    "select version() as v, current_database() as db, current_user as usr, now() as ts"
  );
  console.log("✅ connected");
  console.log("   db   :", who.rows[0].db);
  console.log("   user :", who.rows[0].usr);
  console.log("   pg   :", who.rows[0].v.split(" ").slice(0, 2).join(" "));

  await pool.query(sql);
  console.log("✅ marketingcontacts table ensured (create if not exists + indexes)");

  const id = randomUUID();
  await pool.query(
    `insert into marketingcontacts (id, name, email, cell, signuplist, payload)
     values ($1,$2,$3,$4,$5,$6::jsonb)`,
    [id, "SELFTEST — delete me", "selftest@wxperts.com", "+10000000000",
     "selftest", JSON.stringify({ selftest: true })]
  );
  const back = await pool.query(
    "select id, name, email, cell, submittedat from marketingcontacts where id=$1", [id]
  );
  console.log("✅ insert + read back:", back.rows[0]);

  const del = await pool.query("delete from marketingcontacts where id=$1", [id]);
  console.log(`✅ cleanup: removed ${del.rowCount} test row`);

  const cnt = await pool.query("select count(*)::int as n from marketingcontacts");
  console.log("   real rows now in marketingcontacts:", cnt.rows[0].n);
  console.log("\nSELF-TEST PASSED — DB reachable, schema valid, round-trip OK.");
} catch (e) {
  console.error("❌ SELF-TEST FAILED:", e.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
