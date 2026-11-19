// Engagement report for the customer-announce blast: who clicked the tagged CTA.
// Scans the pageviews table for campaign='cust844', maps each uid (marketingcontacts.id)
// back to the contact, and prints + writes a CSV of who clicked through.
//
// Needs the DynamoDB SDK locally (Lambda provides it at runtime, scripts don't):
//   npm install @aws-sdk/client-dynamodb @aws-sdk/util-dynamodb --no-save
// Run:  node report-customer-clicks.mjs            (default campaign cust844)
//       node report-customer-clicks.mjs <campaign>
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { DynamoDBClient, ScanCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";

const CAMPAIGN = process.argv[2] || "cust844";
const TABLE = process.env.PAGEVIEW_TABLE || "wxkanban-pageviews";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../../..");
const url = fs.readFileSync(path.join(repoRoot, ".env"), "utf8")
  .match(/^DATABASE_URL=(.*)$/m)[1].trim().replace(/^["']|["']$/g, "");
const cs = url.replace(/([?&])sslmode=[^&]*/i, "$1").replace(/[?&]$/, "");
const pool = new pg.Pool({ connectionString: cs, ssl: { rejectUnauthorized: false } });
const ddb = new DynamoDBClient({ region: process.env.AWS_REGION || "us-east-1" });

// Scan all pageviews for this campaign (paginated).
const clicks = new Map(); // uid -> { count, first, last }
let ExclusiveStartKey;
do {
  const res = await ddb.send(new ScanCommand({
    TableName: TABLE,
    FilterExpression: "#c = :c",
    ExpressionAttributeNames: { "#c": "campaign" },
    ExpressionAttributeValues: { ":c": { S: CAMPAIGN } },
    ExclusiveStartKey,
  }));
  for (const raw of res.Items || []) {
    const it = unmarshall(raw);
    const uid = it.uid || "(none)";
    const e = clicks.get(uid) || { count: 0, first: it.ts, last: it.ts };
    e.count++;
    if (it.ts < e.first) e.first = it.ts;
    if (it.ts > e.last) e.last = it.ts;
    clicks.set(uid, e);
  }
  ExclusiveStartKey = res.LastEvaluatedKey;
} while (ExclusiveStartKey);

const uids = [...clicks.keys()].filter((u) => u && u !== "(none)");
let contacts = {};
if (uids.length) {
  const { rows } = await pool.query(
    `select id, name, email from marketingcontacts where id = any($1::uuid[])`, [uids]);
  for (const r of rows) contacts[r.id] = r;
}

const report = [...clicks.entries()]
  .map(([uid, e]) => ({ uid, ...e, name: contacts[uid]?.name || "", email: contacts[uid]?.email || "" }))
  .sort((a, b) => b.count - a.count);

console.log(`\nCampaign: ${CAMPAIGN}  ·  distinct clickers: ${report.length}  ·  total clicks: ${[...clicks.values()].reduce((s, e) => s + e.count, 0)}\n`);
report.forEach((r, i) =>
  console.log(`  ${String(i + 1).padStart(3)}. ${(r.email || r.uid).padEnd(38)} clicks:${r.count}  ${r.name}`));

const csv = "email,name,clicks,first,last,uid\n" +
  report.map((r) => `${r.email},"${r.name}",${r.count},${r.first},${r.last},${r.uid}`).join("\n");
const out = path.join(__dirname, `clicks-${CAMPAIGN}.csv`);
fs.writeFileSync(out, csv);
console.log(`\nCSV: ${out}`);

await pool.end();
