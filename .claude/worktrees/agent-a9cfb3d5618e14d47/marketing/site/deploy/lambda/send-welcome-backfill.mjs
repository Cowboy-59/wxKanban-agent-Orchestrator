// One-time backfill: send the welcome email to existing landing-page opt-ins
// (signuplist='launch-notify') who signed up before the auto-welcome existed.
//
// SAFE BY DEFAULT: dry run (lists recipients, sends nothing).
// To actually send:   node send-welcome-backfill.mjs --send
//
// Reuses welcome-email.mjs so the content is identical to the live auto-reply.
// Sends via SES (production access required — already granted). From = WELCOME_FROM.
// Dedupes case-insensitively; excludes the 'Andy Test' verification row.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { SESClient } from "@aws-sdk/client-ses";
import { sendWelcomeEmail } from "./welcome-email.mjs";

const SEND = process.argv.includes("--send");
const TEST_ROW_ID = "a73b3bab-3173-4e2e-8ae8-a7881d309758";
const FROM = process.env.WELCOME_FROM || "andy@wxperts.com";
const DELAY_MS = 300; // gentle pace, well under SES rate limits

process.env.WELCOME_FROM = FROM;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../../..");
const url = fs.readFileSync(path.join(repoRoot, ".env"), "utf8")
  .match(/^DATABASE_URL=(.*)$/m)[1].trim().replace(/^["']|["']$/g, "");
const cs = url.replace(/([?&])sslmode=[^&]*/i, "$1").replace(/[?&]$/, "");
const pool = new pg.Pool({ connectionString: cs, ssl: { rejectUnauthorized: false } });
const ses = new SESClient({ region: process.env.AWS_REGION || "us-east-1" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { rows } = await pool.query(
  `select distinct on (lower(email)) name, email
     from marketingcontacts
    where signuplist = 'launch-notify'
      and id <> $1
      and email is not null and email <> ''
    order by lower(email), submittedat desc`,
  [TEST_ROW_ID]
);

console.log(`\nMode:     ${SEND ? "LIVE SEND" : "DRY RUN (no email sent)"}`);
console.log(`From:     ${FROM}`);
console.log(`Audience: signuplist='launch-notify', deduped, test row excluded`);
console.log(`Recipients (${rows.length}):`);
rows.forEach((r, i) => console.log(`  ${String(i + 1).padStart(3)}. ${r.email}  (${r.name})`));

if (!SEND) {
  console.log(`\nDry run complete. Re-run with --send to deliver to these ${rows.length} recipients.`);
  await pool.end();
  process.exit(0);
}

console.log(`\nSending...`);
let sent = 0, failed = 0;
const failures = [];
for (const r of rows) {
  const ok = await sendWelcomeEmail(ses, { to: r.email, name: r.name });
  if (ok) { sent++; process.stdout.write("."); }
  else { failed++; failures.push(r.email); process.stdout.write("x"); }
  await sleep(DELAY_MS);
}
console.log(`\n\nDone. sent=${sent} failed=${failed}`);
if (failures.length) console.log("failures:", failures);

// Write an audit log so we know who was welcomed and don't double-send.
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const logPath = path.join(__dirname, `welcome-backfill-${stamp}.json`);
fs.writeFileSync(logPath, JSON.stringify({ from: FROM, sent, failed, failures, recipients: rows }, null, 2));
console.log("audit log:", logPath);

await pool.end();
