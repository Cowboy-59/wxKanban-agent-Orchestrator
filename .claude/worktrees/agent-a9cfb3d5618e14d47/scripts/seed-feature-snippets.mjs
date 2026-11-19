#!/usr/bin/env node
/**
 * [SCOPE 096 / T009] Seed marketingfeaturesnippets from marketing/feature-set.json,
 * and set which feature snippets are live on the landing carousel.
 *
 * For each feature: upsert a sidecar row (dwellms, enhanced, sortorder=rank,
 * ctaurl, sourcescope) keyed on assetkey=feature-<slug>; and set the canonical
 * en-US marketingassets synopsis row's status — 'published' (on) for most, but
 * 'draft' (off) for the in-flux / low-proof features so they stay suppressed.
 *
 *   node scripts/seed-feature-snippets.mjs [--dry-run]
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const DRY = process.argv.includes("--dry-run");
const JSON_PATH = resolve(process.cwd(), "marketing/feature-set.json");

// In-flux / low-proof features kept OFF (draft) until they're ready.
const SUPPRESSED = new Set([
  "consulting-marketplace",
  "bring-your-own-llm",
  "project-theme",
]);

const req = createRequire(pathToFileURL(resolve(process.cwd(), "package.json")));
const load = async (s) => import(pathToFileURL(req.resolve(s)).href);
const clean = (u) => {
  try {
    const p = new URL(u);
    p.searchParams.delete("sslmode");
    p.searchParams.delete("ssl");
    return p.toString();
  } catch {
    return u;
  }
};

async function main() {
  const pgMod = await load("pg");
  const Client = pgMod.Client || pgMod.default?.Client;
  const uuidMod = await load("uuid");
  const uuidv7 = uuidMod.v7 || uuidMod.default?.v7;
  (await load("dotenv")).config?.() ?? (await load("dotenv")).default?.config?.();

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }
  const data = JSON.parse(await readFile(JSON_PATH, "utf8"));
  const features = data.features || [];

  const plan = features.map((f) => {
    const d = f.display || {};
    const on = !SUPPRESSED.has(f.slug);
    return {
      assetkey: `feature-${f.slug}`,
      dwellms: d.dwellMs ?? 5000,
      enhanced: !!d.enhanced,
      sortorder: f.rank ?? 999,
      ctaurl: (f.banner && f.banner.link) || null,
      sourcescope: null,
      status: on ? "published" : "draft",
    };
  });

  console.log(`${DRY ? "[dry-run] " : ""}${plan.length} feature snippets:`);
  for (const p of plan)
    console.log(
      `  ${p.status === "published" ? "ON " : "off"}  ${p.assetkey}  dwell=${p.dwellms}${p.enhanced ? " *featured*" : ""}  order=${p.sortorder}`,
    );
  if (DRY) return;

  const c = new Client({
    connectionString: clean(dbUrl),
    ssl:
      process.env.NODE_ENV === "production"
        ? { rejectUnauthorized: true }
        : { rejectUnauthorized: false },
  });
  await c.connect();
  try {
    for (const p of plan) {
      await c.query(
        `INSERT INTO marketingfeaturesnippets (id, assetkey, ctaurl, dwellms, enhanced, sortorder, sourcescope)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (assetkey) DO UPDATE SET
           ctaurl=EXCLUDED.ctaurl, dwellms=EXCLUDED.dwellms, enhanced=EXCLUDED.enhanced,
           sortorder=EXCLUDED.sortorder, updatedat=now()`,
        [uuidv7(), p.assetkey, p.ctaurl, p.dwellms, p.enhanced, p.sortorder, p.sourcescope],
      );
      // Set the canonical en-US synopsis row's on/off.
      await c.query(
        `UPDATE marketingassets SET status=$1, updatedat=now()
         WHERE assetkey=$2 AND locale='en-US' AND type='synopsis'`,
        [p.status, p.assetkey],
      );
    }
    console.log(`\n✓ Seeded ${plan.length} sidecar rows; set canonical statuses.`);
  } finally {
    await c.end();
  }
}

main().catch((e) => {
  console.error("seed failed:", e.message || e);
  process.exit(1);
});
