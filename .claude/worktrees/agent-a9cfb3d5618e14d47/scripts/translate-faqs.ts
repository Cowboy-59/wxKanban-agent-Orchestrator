/**
 * translate-faqs.ts — AI-translate every published English FAQ into the 5 other
 * supported locales (SCOPE-066 + SPEC-052).
 *
 * FAQs are marketingassets rows (category='faq', companyid NULL). Language variants
 * share an `assetkey` and differ by `locale` — (assetkey, locale) is unique. For each
 * published en-US FAQ this creates/updates one row per target locale with the title
 * and answer translated via MarketingAIService.translateText (fail-open per field).
 *
 * SAFETY: writes to whatever DATABASE_URL points at — which on this project is the
 * SAME database production uses. Runs DRY by default (no writes). Pass --apply to write.
 *
 *   npx tsx scripts/translate-faqs.ts            # dry run — shows what it would do
 *   npx tsx scripts/translate-faqs.ts --apply    # actually write translated rows
 *   npx tsx scripts/translate-faqs.ts --apply --locale fr-FR   # one target locale
 */
import { and, eq, isNull, isNotNull, ne, like } from 'drizzle-orm';
import { db, pool } from '../src/db/client.js';
import { marketingassets } from '../src/db/schema/marketingassets.js';
import { translateText, TRANSLATION_LOCALES } from '../src/server/services/MarketingAIService.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const APPLY = process.argv.includes('--apply');
const ONLY_LOCALE = arg('locale');
const PREFIX = arg('prefix'); // optional: only translate FAQs whose assetkey starts with this
const targets = TRANSLATION_LOCALES.filter((l) => !ONLY_LOCALE || l.locale === ONLY_LOCALE);

// The provider (Groq free tier) rate-limits bursts, so pace calls and retry with
// backoff. translateText is fail-open (null on any error, incl. 429), so a null
// return is retried rather than treated as a permanent skip.
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const BASE_DELAY_MS = 1500; // spacing between calls to stay under the RPM limit

async function translateWithRetry(text: string, locale: string, label: string): Promise<string | null> {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const out = await translateText(text, locale);
    if (out) return out;
    if (attempt < 5) {
      const backoff = 3000 * attempt; // 3s, 6s, 9s, 12s
      console.log(`      ${label}: rate-limited/failed, retry in ${backoff}ms (attempt ${attempt})`);
      await sleep(backoff);
    }
  }
  return null;
}

async function main(): Promise<void> {
  if (!targets.length) {
    console.error(`No target locale matches "${ONLY_LOCALE}". Valid: ${TRANSLATION_LOCALES.map((l) => l.locale).join(', ')}`);
    process.exit(2);
  }

  // Source set: published, answered, global English FAQs.
  const sources = await db
    .select({
      assetkey: marketingassets.assetkey,
      type: marketingassets.type,
      title: marketingassets.title,
      content: marketingassets.content,
      createdbyid: marketingassets.createdbyid,
    })
    .from(marketingassets)
    .where(
      and(
        eq(marketingassets.category, 'faq'),
        eq(marketingassets.status, 'published'),
        eq(marketingassets.locale, 'en-US'),
        isNull(marketingassets.companyid),
        isNotNull(marketingassets.content),
        ne(marketingassets.content, ''),
        ...(PREFIX ? [like(marketingassets.assetkey, `${PREFIX}%`)] : []),
      ),
    );

  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} — ${sources.length} published en-US FAQ(s) → ${targets.map((t) => t.locale).join(', ')}`);
  if (!sources.length) {
    console.log('Nothing to translate.');
    await pool.end();
    return;
  }

  let written = 0;
  let skipped = 0;
  for (const faq of sources) {
    console.log(`\n• ${faq.assetkey} — "${faq.title.slice(0, 60)}"`);
    for (const { locale, language } of targets) {
      const title = await translateWithRetry(faq.title, locale, `${locale} title`);
      await sleep(BASE_DELAY_MS);
      const content = faq.content ? await translateWithRetry(faq.content, locale, `${locale} content`) : null;
      await sleep(BASE_DELAY_MS);
      // Fail-open: if either field fails to translate, skip this locale so the
      // FaqPanel falls back to the English row rather than showing English text
      // mislabelled as this locale.
      if (!title || !content) {
        console.log(`   ${locale} (${language}): SKIP (translation unavailable)`);
        skipped += 1;
        continue;
      }
      if (APPLY) {
        await db
          .insert(marketingassets)
          .values({
            assetkey: faq.assetkey,
            locale,
            type: faq.type,
            category: 'faq',
            title,
            content,
            status: 'published',
            createdbyid: faq.createdbyid,
          })
          .onConflictDoUpdate({
            target: [marketingassets.assetkey, marketingassets.locale],
            set: { title, content, status: 'published', updatedat: new Date() },
          });
      }
      console.log(`   ${locale} (${language}): ${APPLY ? 'written' : 'would write'} — "${title.slice(0, 60)}"`);
      written += 1;
    }
  }

  console.log(`\n${APPLY ? 'Wrote' : 'Would write'} ${written} row(s); skipped ${skipped}.`);
  if (!APPLY) console.log('Re-run with --apply to persist.');
  await pool.end();
}

main().catch(async (err) => {
  console.error('translate-faqs failed:', err);
  try {
    await pool.end();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
