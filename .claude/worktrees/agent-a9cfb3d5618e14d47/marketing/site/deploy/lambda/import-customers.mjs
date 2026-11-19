// Import the customer master (marketing/site/email/customer.json) into the
// marketingcontacts table. Maps ContactName/CompanyName -> name, EmailAddress ->
// email, PhoneNo -> cell. Respects DoNotContact (skips opt-outs). Stores NO secrets
// in payload. Idempotent: skips emails already present in the table and dupes in-file.
//
//   node import-customers.mjs            # dry run — analyse + sample, no writes
//   node import-customers.mjs --commit   # actually insert
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { randomUUID } from "node:crypto";

const COMMIT = process.argv.includes("--commit");
const LIST = "customer-import";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../../..");
const jsonPath = path.join(repoRoot, "marketing/site/email/customer.json");

const env = fs.readFileSync(path.join(repoRoot, ".env"), "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)[1].trim().replace(/^["']|["']$/g, "");
const connectionString = url.replace(/([?&])sslmode=[^&]*/i, "$1").replace(/[?&]$/, "");

const raw = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
const rows = raw.Customer || [];
console.log(`source records: ${rows.length}`);

const stats = { donotcontact: 0, noemail: 0, badEmail: 0, dupInFile: 0, alreadyInDb: 0, ready: 0 };
const seen = new Set();
const candidates = [];

for (const r of rows) {
  if (r.DoNotContact === true) { stats.donotcontact++; continue; }
  const email = String(r.EmailAddress || "").trim();
  if (!email) { stats.noemail++; continue; }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { stats.badEmail++; continue; }
  const key = email.toLowerCase();
  if (seen.has(key)) { stats.dupInFile++; continue; }
  seen.add(key);

  const name = (String(r.ContactName || "").trim() || String(r.CompanyName || "").trim()).slice(0, 500);
  const cell = String(r.PhoneNo || "").trim().slice(0, 100) || null;
  const payload = {
    source: "customer.json",
    customerid: r.CustomerID ?? null,
    company: String(r.CompanyName || "").trim() || null,
    city: String(r.City || "").trim() || null,
    state: String(r.StateProvince || "").trim() || null,
    referralcode: String(r.ReferalCode || "").trim() || null,
  };
  candidates.push({ email, key, name, cell, payload });
}

const pool = new pg.Pool({ connectionString, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000 });
try {
  // Existing emails in the table (case-insensitive) for idempotency.
  const existing = await pool.query("select lower(email) as e from marketingcontacts");
  const have = new Set(existing.rows.map((x) => x.e));

  const toInsert = [];
  for (const c of candidates) {
    if (have.has(c.key)) { stats.alreadyInDb++; continue; }
    toInsert.push(c);
  }
  stats.ready = toInsert.length;

  console.log("\n--- breakdown ---");
  console.log("  skipped DoNotContact :", stats.donotcontact);
  console.log("  skipped no email     :", stats.noemail);
  console.log("  skipped bad email    :", stats.badEmail);
  console.log("  skipped dup in file  :", stats.dupInFile);
  console.log("  skipped already in db:", stats.alreadyInDb);
  console.log("  READY TO INSERT      :", stats.ready);
  console.log("  with phone number    :", toInsert.filter((c) => c.cell).length);
  console.log("\nsample (first 5 to insert):");
  for (const c of toInsert.slice(0, 5)) console.log(`  ${c.name} | ${c.email} | ${c.cell || "(no phone)"}`);

  if (!COMMIT) {
    console.log("\nDRY RUN — nothing written. Re-run with --commit to insert.");
  } else {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      let n = 0;
      for (const c of toInsert) {
        await client.query(
          `insert into marketingcontacts (id, name, email, cell, signuplist, payload)
           values ($1,$2,$3,$4,$5,$6::jsonb)`,
          [randomUUID(), c.name, c.email, c.cell, LIST, JSON.stringify(c.payload)]
        );
        n++;
      }
      await client.query("COMMIT");
      console.log(`\n✅ COMMITTED — inserted ${n} rows.`);
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
    const cnt = await pool.query("select count(*)::int as n from marketingcontacts");
    console.log("total rows now in marketingcontacts:", cnt.rows[0].n);
  }
} catch (e) {
  console.error("❌ error:", e.message); process.exitCode = 1;
} finally {
  await pool.end();
}
