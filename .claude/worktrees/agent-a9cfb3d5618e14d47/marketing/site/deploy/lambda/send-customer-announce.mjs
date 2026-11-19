// One-time "Don't miss this" launch announcement to EXISTING wxperts customers
// (signuplist='customer-import'). Different copy + audience from the opt-in welcome.
//
// SAFE BY DEFAULT: dry run (lists recipients + counts, sends nothing).
// To actually send:   node send-customer-announce.mjs --send
//
// Protections baked in:
//   - valid-email regex filter (drops malformed imports → protects bounce rate)
//   - excludes anyone already in the launch-notify opt-in list (no double-contact)
//   - case-insensitive dedupe
//   - per-recipient CTA token (marketingcontacts.id) for click attribution
//   - sub-addressed reply-to for inbox filtering
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { SESClient } from "@aws-sdk/client-ses";
import { sendCustomerAnnounce, SUBJECT } from "./customer-announce-email.mjs";

const SEND = process.argv.includes("--send");
const FROM = process.env.ANNOUNCE_FROM || "andy@wxperts.com";
const DELAY_MS = 300; // ~3/sec, well under SES limits

process.env.ANNOUNCE_FROM = FROM;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../../..");
const url = fs.readFileSync(path.join(repoRoot, ".env"), "utf8")
  .match(/^DATABASE_URL=(.*)$/m)[1].trim().replace(/^["']|["']$/g, "");
const cs = url.replace(/([?&])sslmode=[^&]*/i, "$1").replace(/[?&]$/, "");
const pool = new pg.Pool({ connectionString: cs, ssl: { rejectUnauthorized: false } });
const ses = new SESClient({ region: process.env.AWS_REGION || "us-east-1" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Total customer-import rows, and how many are dropped as invalid, for transparency.
const totals = await pool.query(
  `select
     count(*) filter (where signuplist='customer-import')::int as imported,
     count(*) filter (where signuplist='customer-import'
        and email !~ '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$')::int as invalidemail
   from marketingcontacts`
);

const { rows } = await pool.query(
  `select distinct on (lower(email)) id, name, email
     from marketingcontacts
    where signuplist = 'customer-import'
      and email is not null and email <> ''
      and email ~ '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$'
      and lower(email) not in (
        select lower(email) from marketingcontacts where signuplist = 'launch-notify'
      )
    order by lower(email), submittedat desc`
);

console.log(`\nMode:     ${SEND ? "LIVE SEND" : "DRY RUN (no email sent)"}`);
console.log(`Subject:  ${SUBJECT}`);
console.log(`From:     ${FROM}   Reply-To: andy+cust844@wxperts.com`);
console.log(`CTA:      https://windev.wxperts.com/?c=cust844&u=<contact id>  (click tracking)`);
console.log(`\nSegment composition:`);
console.log(`  customer-import rows:      ${totals.rows[0].imported}`);
console.log(`  dropped (invalid email):  ${totals.rows[0].invalidemail}`);
console.log(`  final recipients (deduped, opt-ins excluded): ${rows.length}`);

if (!SEND) {
  console.log(`\nFirst 15 recipients:`);
  rows.slice(0, 15).forEach((r, i) => console.log(`  ${String(i + 1).padStart(3)}. ${r.email}  (${r.name})`));
  console.log(`  ... (${Math.max(0, rows.length - 15)} more)`);
  console.log(`\nDry run complete. Re-run with --send to deliver to all ${rows.length}.`);
  await pool.end();
  process.exit(0);
}

console.log(`\nSending to ${rows.length}...`);
let sent = 0, failed = 0;
const failures = [];
for (const r of rows) {
  const ok = await sendCustomerAnnounce(ses, { to: r.email, name: r.name, token: r.id });
  if (ok) { sent++; if (sent % 50 === 0) process.stdout.write(`[${sent}]`); process.stdout.write("."); }
  else { failed++; failures.push(r.email); process.stdout.write("x"); }
  await sleep(DELAY_MS);
}
console.log(`\n\nDone. sent=${sent} failed=${failed}`);
if (failures.length) console.log("failures:", failures);

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const logPath = path.join(__dirname, `customer-announce-${stamp}.json`);
fs.writeFileSync(logPath, JSON.stringify(
  { subject: SUBJECT, from: FROM, sent, failed, failures, recipients: rows }, null, 2));
console.log("audit log:", logPath);

await pool.end();
