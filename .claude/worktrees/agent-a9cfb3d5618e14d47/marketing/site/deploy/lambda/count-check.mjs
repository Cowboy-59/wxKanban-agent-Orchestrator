import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../../..");
const url = fs.readFileSync(path.join(repoRoot, ".env"), "utf8").match(/^DATABASE_URL=(.*)$/m)[1].trim().replace(/^["']|["']$/g, "");
const cs = url.replace(/([?&])sslmode=[^&]*/i, "$1").replace(/[?&]$/, "");
const pool = new pg.Pool({ connectionString: cs, ssl: { rejectUnauthorized: false } });
try {
  const t = await pool.query("select count(*)::int total, count(distinct lower(email))::int distinctlower, count(*) filter (where email is null or email='')::int blankemail from marketingcontacts");
  console.log("counts:", t.rows[0]);
  // rows that collapse under distinct-on-lower (case-dup emails)
  const dup = await pool.query("select lower(email) e, count(*) n from marketingcontacts group by lower(email) having count(*)>1 order by n desc limit 10");
  console.log("case-insensitive duplicate emails:", dup.rows);
  // any leftover test addresses?
  const test = await pool.query("select name, email, signuplist from marketingcontacts where email ilike '%selftest%' or email ilike '%delete me%' or name ilike '%selftest%'");
  console.log("possible test rows:", test.rows);
} finally { await pool.end(); }
