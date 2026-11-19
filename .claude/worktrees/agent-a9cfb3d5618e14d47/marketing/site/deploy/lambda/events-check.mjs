// Tally recent Mailgun events to confirm the campaign is delivering (not failing).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../../..");
const env = {};
for (const line of fs.readFileSync(path.join(repoRoot, ".env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const get = (...n) => { const lc = {}; for (const k of Object.keys(env)) lc[k.toLowerCase()] = env[k]; for (const x of n) if (lc[x.toLowerCase()]) return lc[x.toLowerCase()]; };
const key = get("MAILGUN_API_KEY", "MAILGUN_KEY");
const raw = get("MAILGUN_URL", "MAILGUN_DOMAIN");
const base = raw.replace(/\/+$/, "").replace(/\/messages$/, "");
const eventsUrl = base + "/events?limit=300";
const auth = "Basic " + Buffer.from(`api:${key}`).toString("base64");

let url = eventsUrl, pages = 0;
const tally = {};
while (url && pages < 10) {
  const res = await fetch(url, { headers: { Authorization: auth } });
  if (!res.ok) { console.error(`events ${res.status}:`, await res.text()); process.exit(1); }
  const j = await res.json();
  const items = j.items || [];
  for (const it of items) tally[it.event] = (tally[it.event] || 0) + 1;
  pages++;
  url = items.length && j.paging && j.paging.next && j.paging.next !== url ? j.paging.next : null;
  if (!items.length) break;
}
console.log("recent Mailgun event tally:");
console.table(tally);
