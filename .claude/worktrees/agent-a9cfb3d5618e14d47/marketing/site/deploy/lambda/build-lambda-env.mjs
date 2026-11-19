// Helper: read DATABASE_URL from repo .env and emit the Lambda env JSON to a temp
// file (so the secret isn't echoed to the console). Deleted right after use.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../../..");
const env = fs.readFileSync(path.join(repoRoot, ".env"), "utf8");
const m = env.match(/^DATABASE_URL=(.*)$/m);
if (!m) { console.error("no DATABASE_URL in .env"); process.exit(1); }
const url = m[1].trim().replace(/^["']|["']$/g, "");

const out = path.join(os.tmpdir(), "lambda-env.json");
fs.writeFileSync(out, JSON.stringify({ Variables: { DATABASE_URL: url, NOTIFY_EMAIL: "andy@wxperts.com" } }));
console.log(out);
