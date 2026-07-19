#!/usr/bin/env node
/**
 * import-feature-set.mjs  (skill: marketing-feature-set)
 * --------------------------------------------------------------------------
 * Upserts the derived feature set into the marketingassets table so the in-app
 * Marketing AI Assist (SCOPE-065) can Draft / Translate / Repurpose from them.
 *
 *   node .claude/skills/marketing-feature-set/scripts/import-feature-set.mjs --dry-run
 *   node .claude/skills/marketing-feature-set/scripts/import-feature-set.mjs
 *
 * Idempotent on (assetkey, locale). Every row lands as status='draft'. Needs
 * DATABASE_URL in .env. Reuses pg + uuid (already in the project).
 *
 * Per feature it writes:
 *   • a `synopsis` asset  — the feature definition            (assetkey feature-<slug>)
 *   • a `post` draft      — social seed referencing the og banner (feature-<slug>-post)
 *   • one row per locale present in the feature's `locales` map.
 * Field mapping: references/marketingassets-mapping.md.
 * --------------------------------------------------------------------------
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const DRY = process.argv.includes('--dry-run');
const JSON_PATH = resolve(process.cwd(), process.argv.find((a, i) => process.argv[i - 1] === '--json') || 'marketing/feature-set.json');
const SITE = (process.env.MARKETING_SITE_URL || 'https://windev.wxperts.com').replace(/\/$/, '');

const reqCwd = createRequire(pathToFileURL(resolve(process.cwd(), 'package.json')));
async function load(spec) {
  try { return await import(pathToFileURL(reqCwd.resolve(spec)).href); }
  catch { console.error(`✗ Missing dependency "${spec}". Install it: npm install ${spec}`); process.exit(1); }
}

function cleanConn(url) {
  try { const p = new URL(url); p.searchParams.delete('sslmode'); p.searchParams.delete('ssl'); return p.toString(); }
  catch { return url; }
}

// Compose the synopsis body + post seed for a feature at a given locale.
function localized(f, locale) {
  const lv = (f.locales && f.locales[locale]) || {};
  return {
    name: lv.name || f.name,
    valueProp: lv.valueProp || f.valueProp,
    benefit: lv.benefit || f.benefit,
  };
}
function synopsisContent(l, f) {
  return [
    l.valueProp,
    '',
    `**For:** ${f.audience}`,
    `**Benefit:** ${l.benefit}`,
    '',
    `_Source: ${(f.sourceRefs || []).join(', ')}_`,
  ].join('\n');
}
function postContent(l, f) {
  const channels = (f.social && f.social.channels) || [];
  return [
    `Hook: ${l.valueProp}`,
    '',
    `Channels: ${channels.join(', ') || '(none set)'}`,
    '',
    '_Seed only — finish per-channel copy with Marketing AI Assist (SCOPE-065) Draft-with-AI / Repurpose. Nothing is posted automatically._',
  ].join('\n');
}

async function main() {
  const pgMod = await load('pg');
  const Client = pgMod.Client || (pgMod.default && pgMod.default.Client); // pg is CJS — Client may sit on .default
  const uuidMod = await load('uuid');
  const uuidv7 = uuidMod.v7 || (uuidMod.default && uuidMod.default.v7);
  const dotenvMod = await load('dotenv');
  (dotenvMod.config || (dotenvMod.default && dotenvMod.default.config))();

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) { console.error('✗ DATABASE_URL not set (put it in .env).'); process.exit(1); }

  const data = JSON.parse(await readFile(JSON_PATH, 'utf8').catch(() => { throw new Error(`feature-set.json not found: ${JSON_PATH}`); }));
  const features = data.features || [];

  // Build the full upsert plan first (so --dry-run shows exactly what would run).
  const rows = [];
  for (const f of features) {
    const locales = ['en-US', ...Object.keys(f.locales || {})];
    for (const locale of locales) {
      const l = localized(f, locale);
      rows.push({ assetkey: `feature-${f.slug}`, locale, type: 'synopsis', category: 'open', title: l.name, content: synopsisContent(l, f), fileurl: null, targetsegment: f.audience, status: 'draft' });
      if (f.social && f.social.seedDrafts && (f.social.channels || []).length) {
        rows.push({ assetkey: `feature-${f.slug}-post`, locale, type: 'post', category: 'open', title: `${l.name} — social`, content: postContent(l, f), fileurl: `${SITE}/banners/${f.slug}.og.${locale}.png`, targetsegment: f.audience, status: 'draft' });
      }
    }
  }

  console.log(`${DRY ? '[dry-run] ' : ''}${rows.length} marketingassets rows from ${features.length} features:`);
  for (const r of rows) console.log(`  ${r.type.padEnd(8)} ${r.assetkey}  [${r.locale}]  "${r.title}"`);

  if (DRY) { console.log('\n[dry-run] no database writes.'); return; }

  const client = new Client({
    connectionString: cleanConn(dbUrl),
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    for (const r of rows) {
      await client.query(
        `INSERT INTO marketingassets (id, assetkey, locale, type, category, title, content, fileurl, targetsegment, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'draft')
         ON CONFLICT (assetkey, locale)
         DO UPDATE SET type=EXCLUDED.type, category=EXCLUDED.category, title=EXCLUDED.title,
                       content=EXCLUDED.content, fileurl=EXCLUDED.fileurl,
                       targetsegment=EXCLUDED.targetsegment, updatedat=now()`,
        [uuidv7(), r.assetkey, r.locale, r.type, r.category, r.title, r.content, r.fileurl, r.targetsegment],
      );
    }
    console.log(`\n✓ Upserted ${rows.length} rows (all status='draft'). Review in the sysadmin Marketing hub → Assets/Posts.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => { console.error('✗ Import failed:', err.message || err); process.exit(1); });
