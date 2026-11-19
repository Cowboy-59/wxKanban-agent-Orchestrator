import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../../..");
const url = fs.readFileSync(path.join(repoRoot, ".env"), "utf8").match(/^DATABASE_URL=(.*)$/m)[1].trim().replace(/^["']|["']$/g, "");
const connectionString = url.replace(/([?&])sslmode=[^&]*/i, "$1").replace(/[?&]$/, "");
const pool = new pg.Pool({ connectionString, ssl: { rejectUnauthorized: false } });
try {
  const byList = await pool.query("select signuplist, count(*)::int n, count(cell)::int withcell from marketingcontacts group by signuplist order by n desc");
  console.log("by list:"); console.table(byList.rows);
  const tot = await pool.query("select count(*)::int total, count(distinct lower(email))::int distinctemails, count(cell)::int withphone from marketingcontacts");
  console.log("totals:", tot.rows[0]);
  const sample = await pool.query("select name, email, cell, payload->>'company' as company, payload->>'state' as state from marketingcontacts where signuplist='customer-import' order by submittedat desc limit 3");
  console.log("sample rows:"); console.log(sample.rows);
} finally { await pool.end(); }
