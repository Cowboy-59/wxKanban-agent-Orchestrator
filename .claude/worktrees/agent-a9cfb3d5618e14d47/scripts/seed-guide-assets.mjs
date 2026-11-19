/**
 * Seed the downloadable guides as marketingassets rows (type='guide').
 *
 * The /docs Guides tab used to hardcode its PDF list in DocsIndexPage.tsx. It now
 * reads GET /api/help/guides, which returns published type='guide' assets. This
 * script inserts the rows that endpoint expects.
 *
 *   - assetkey groups the locale variants of ONE guide
 *   - locale is the language of that variant
 *   - category groups guides into a titled section on the page
 *   - fileurl is the public S3 URL of the PDF, under the bucket's public-read
 *     `public/` prefix (MARKETING_ASSETS_BASEURL), same as every other binary
 *     marketing asset — NOT a path into the app's own public/ folder.
 *
 * Idempotent: (assetkey, locale) is UNIQUE, so re-running updates instead of
 * inserting duplicates.
 *
 * ⚠️  The local .env DATABASE_URL points at PRODUCTION. Run deliberately:
 *        node scripts/seed-guide-assets.mjs --dry-run   # print, touch nothing
 *        node scripts/seed-guide-assets.mjs --apply     # write
 */
import "dotenv/config";
import pg from "pg";
// marketingassets.id has no DB-side default — Drizzle fills it via $defaultFn(uuidv7).
// Raw SQL must therefore supply the id itself or the insert violates NOT NULL.
import { v7 as uuidv7 } from "uuid";

const BASEURL = (process.env.MARKETING_ASSETS_BASEURL ?? "").replace(/\/+$/, "");
if (!BASEURL) {
  console.error("MARKETING_ASSETS_BASEURL is not set — cannot build guide URLs.");
  process.exit(1);
}
/** Objects live under the bucket's public-read `public/` prefix, in a guides/ folder. */
const url = (name) => `${BASEURL}/public/guides/${name}`;

const ROWS = [
  {
    assetkey: "guide-wxconversion",
    category: "migrationguides",
    title: "WINDEV / WEBDEV Conversion Guide",
    content:
      "How to bring a legacy WINDEV or WEBDEV application across to a modern React and PostgreSQL stack, step by step.",
    variants: [
      { locale: "en-US", fileurl: url("wxConversion-Guide-EN.pdf") },
      { locale: "es-ES", fileurl: url("wxConversion-Guide-ES.pdf") },
      { locale: "fr-FR", fileurl: url("wxConversion-Guide-FR.pdf") },
    ],
  },
  {
    assetkey: "guide-wxkanban-migration",
    category: "migrationguides",
    title: "Migrating WinDev/WebDev to wxKanban and AI",
    content:
      "A step-by-step walkthrough of the whole migration: prerequisites and project setup, generating the WinDev technical documentation, converting it into scopes, building the full stack, and the commands that drive each stage.",
    variants: [{ locale: "en-US", fileurl: url("wxKanban-Migration-Guide-EN.pdf") }],
  },
];

const apply = process.argv.includes("--apply");
const dryRun = !apply;

const flat = ROWS.flatMap((g) =>
  g.variants.map((v) => ({
    assetkey: g.assetkey,
    locale: v.locale,
    type: "guide",
    category: g.category,
    title: g.title,
    content: g.content,
    fileurl: v.fileurl,
    status: "published",
  })),
);

if (dryRun) {
  console.log("DRY RUN — nothing written. Rows that WOULD be upserted:\n");
  for (const r of flat) {
    console.log(`  ${r.assetkey.padEnd(26)} ${r.locale.padEnd(6)} ${r.fileurl}`);
  }
  console.log(`\n${flat.length} rows. Re-run with --apply to write.`);
  process.exit(0);
}

// Strip sslmode from the URL: newer pg-connection-string treats 'require' as
// 'verify-full', which overrides the ssl option below and fails the RDS chain
// with SELF_SIGNED_CERT_IN_CHAIN. TLS is still on — just not cert-verified.
const connectionString = (process.env.DATABASE_URL ?? "").replace(
  /([?&])sslmode=[^&]*(&)?/,
  (_m, lead, trail) => (trail ? lead : ""),
);

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
try {
  await client.query("BEGIN");
  for (const r of flat) {
    await client.query(
      `INSERT INTO marketingassets
         (id, assetkey, locale, type, category, title, content, fileurl, status, companyid)
       VALUES ($9, $1, $2, $3, $4, $5, $6, $7, $8, NULL)
       ON CONFLICT (assetkey, locale) DO UPDATE SET
         type = EXCLUDED.type,
         category = EXCLUDED.category,
         title = EXCLUDED.title,
         content = EXCLUDED.content,
         fileurl = EXCLUDED.fileurl,
         status = EXCLUDED.status,
         updatedat = NOW()`,
      [
        r.assetkey,
        r.locale,
        r.type,
        r.category,
        r.title,
        r.content,
        r.fileurl,
        r.status,
        uuidv7(),
      ],
    );
    console.log(`upserted ${r.assetkey} / ${r.locale}`);
  }
  await client.query("COMMIT");
  console.log(`\nDone — ${flat.length} guide assets upserted.`);
} catch (err) {
  await client.query("ROLLBACK");
  console.error("FAILED, rolled back:", err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
