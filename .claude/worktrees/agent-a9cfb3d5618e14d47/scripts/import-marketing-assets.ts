#!/usr/bin/env tsx
/**
 * [SCOPE 048 / T009] Import existing hand-maintained marketing markdown into the
 * marketingassets table (en-US). Idempotent: upsert on (assetkey, locale).
 *
 * The video MP4s already on S3 are migrated separately once the public-read bucket
 * exists (provision-marketing-assets-bucket.ps1) — `aws s3 cp s3://old s3://new`,
 * then insert marketingassets rows with type='video' + fileurl=<CloudFront URL>.
 * That step is left to the operator since it needs the bucket + AWS profile Andy.
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { Client } from "pg";
import { v7 as uuidv7 } from "uuid";
import { config } from "dotenv";

config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SOURCES: Array<{ assetkey: string; type: string; title: string; file: string }> = [
  { assetkey: "landing-page", type: "page", title: "Landing Page", file: "marketing/landing-page.md" },
  { assetkey: "launch-posts", type: "post", title: "Launch Posts", file: "marketing/launch-posts.md" },
  { assetkey: "feature-synopsis", type: "synopsis", title: "Feature Synopsis", file: "marketing/feature-synopsis.md" },
  { assetkey: "kit-synopsis", type: "synopsis", title: "Kit Synopsis", file: "marketing/kit-synopsis.md" },
];

function cleanConnectionString(url: string): string {
  try {
    const p = new URL(url);
    p.searchParams.delete("sslmode");
    p.searchParams.delete("ssl");
    return p.toString();
  } catch {
    return url;
  }
}

async function main(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }
  const root = resolve(__dirname, "..");
  const client = new Client({
    connectionString: cleanConnectionString(dbUrl),
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: true } : { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    for (const s of SOURCES) {
      let content: string;
      try {
        content = readFileSync(resolve(root, s.file), "utf-8");
      } catch {
        console.warn(`  skip ${s.file} (not found)`);
        continue;
      }
      await client.query(
        `INSERT INTO marketingassets (id, assetkey, locale, type, title, content, status)
         VALUES ($1, $2, 'en-US', $3, $4, $5, 'published')
         ON CONFLICT (assetkey, locale)
         DO UPDATE SET content = EXCLUDED.content, title = EXCLUDED.title, updatedat = now()`,
        [uuidv7(), s.assetkey, s.type, s.title, content],
      );
      console.log(`  imported ${s.assetkey} (${content.length} chars)`);
    }
    console.log("Marketing asset import complete.");
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
