// Verify a live-endpoint test row actually landed in Postgres, then delete it.
//   node verify-live.mjs <id>
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const id = process.argv[2];
if (!id) { console.error("usage: node verify-live.mjs <id>"); process.exit(1); }

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../../..");
const env = fs.readFileSync(path.join(repoRoot, ".env"), "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)[1].trim().replace(/^["']|["']$/g, "");
const connectionString = url.replace(/([?&])sslmode=[^&]*/i, "$1").replace(/[?&]$/, "");

const pool = new pg.Pool({ connectionString, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000 });
try {
  const r = await pool.query(
    "select id, name, email, cell, platform, language, signuplist, wantshandson, sourceip, submittedat from marketingcontacts where id=$1",
    [id]
  );
  if (r.rowCount === 0) {
    console.error("❌ row NOT found in Postgres — endpoint returned ok via the email fallback, DB write failed.");
    process.exit(2);
  }
  console.log("✅ row found in Postgres:");
  console.log(r.rows[0]);
  const del = await pool.query("delete from marketingcontacts where id=$1", [id]);
  console.log(`✅ cleanup: removed ${del.rowCount} test row`);
  const cnt = await pool.query("select count(*)::int as n from marketingcontacts");
  console.log("   real rows now in marketingcontacts:", cnt.rows[0].n);
} catch (e) {
  console.error("error:", e.message); process.exitCode = 1;
} finally {
  await pool.end();
}
