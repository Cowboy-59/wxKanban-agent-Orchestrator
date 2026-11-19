/**
 * translate-feature-snippets.ts — AI-translate every English marketing feature
 * snippet into the 5 other supported locales (SCOPE-096 + SPEC-052).
 *
 * Feature snippets are marketingassets rows (type='synopsis',
 * assetkey='feature-<slug>'). Language variants share an `assetkey` and differ by
 * `locale` — (assetkey, locale) is unique. For each en-US snippet this creates or
 * updates one row per target locale with the title + content translated via
 * MarketingAIService.translateText (fail-open per field). The canonical en-US row's
 * status is preserved by not touching it; variants are written as 'published'
 * (variant status does not govern the carousel on/off — only the en-US row does).
 *
 * SAFETY: writes to whatever DATABASE_URL points at — the SAME database production
 * uses. Runs DRY by default. Pass --apply to write.
 *
 *   npx tsx scripts/translate-feature-snippets.ts            # dry run
 *   npx tsx scripts/translate-feature-snippets.ts --apply    # write translated rows
 *   npx tsx scripts/translate-feature-snippets.ts --apply --locale de-DE
 */
import { and, eq, like } from "drizzle-orm";
import { db, pool } from "../src/db/client.js";
import { marketingassets } from "../src/db/schema/marketingassets.js";
import {
  translateText,
  TRANSLATION_LOCALES,
} from "../src/server/services/MarketingAIService.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const APPLY = process.argv.includes("--apply");
const ONLY_LOCALE = arg("locale");
const targets = TRANSLATION_LOCALES.filter((l) => !ONLY_LOCALE || l.locale === ONLY_LOCALE);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const BASE_DELAY_MS = 1500;

async function translateWithRetry(text: string, locale: string, label: string): Promise<string | null> {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const out = await translateText(text, locale);
    if (out) return out;
    if (attempt < 5) {
      const backoff = 3000 * attempt;
      console.log(`      ${label}: rate-limited/failed, retry in ${backoff}ms (attempt ${attempt})`);
      await sleep(backoff);
    }
  }
  return null;
}

async function main(): Promise<void> {
  if (!targets.length) {
    console.error(`No target locale matches "${ONLY_LOCALE}". Valid: ${TRANSLATION_LOCALES.map((l) => l.locale).join(", ")}`);
    process.exit(2);
  }

  // Source set: en-US feature snippets (all of them — published + draft; translating
  // draft/in-flux snippets is fine, they just stay off the carousel via the en-US row).
  const sources = await db
    .select({
      assetkey: marketingassets.assetkey,
      type: marketingassets.type,
      title: marketingassets.title,
      content: marketingassets.content,
      targetsegment: marketingassets.targetsegment,
      createdbyid: marketingassets.createdbyid,
    })
    .from(marketingassets)
    .where(
      and(
        eq(marketingassets.type, "synopsis"),
        eq(marketingassets.locale, "en-US"),
        like(marketingassets.assetkey, "feature-%"),
      ),
    );

  console.log(`${APPLY ? "APPLY" : "DRY RUN"} — ${sources.length} en-US feature snippet(s) → ${targets.map((t) => t.locale).join(", ")}`);
  if (!sources.length) {
    await pool.end();
    return;
  }

  let written = 0;
  let skipped = 0;
  for (const s of sources) {
    console.log(`\n• ${s.assetkey} — "${s.title.slice(0, 55)}"`);
    for (const { locale, language } of targets) {
      // Skip if this locale variant already exists (idempotent, saves LLM calls).
      const existing = await db
        .select({ id: marketingassets.id })
        .from(marketingassets)
        .where(and(eq(marketingassets.assetkey, s.assetkey), eq(marketingassets.locale, locale)))
        .limit(1);
      if (existing.length) {
        console.log(`   ${locale} (${language}): already present — skip`);
        continue;
      }
      const title = await translateWithRetry(s.title, locale, `${locale} title`);
      await sleep(BASE_DELAY_MS);
      const content = s.content ? await translateWithRetry(s.content, locale, `${locale} content`) : null;
      await sleep(BASE_DELAY_MS);
      if (!title || !content) {
        console.log(`   ${locale} (${language}): SKIP (translation unavailable)`);
        skipped += 1;
        continue;
      }
      if (APPLY) {
        await db
          .insert(marketingassets)
          .values({
            assetkey: s.assetkey,
            locale,
            type: "synopsis",
            category: "open",
            title,
            content,
            targetsegment: s.targetsegment,
            status: "published",
            createdbyid: s.createdbyid,
          })
          .onConflictDoUpdate({
            target: [marketingassets.assetkey, marketingassets.locale],
            set: { title, content, status: "published", updatedat: new Date() },
          });
      }
      console.log(`   ${locale} (${language}): ${APPLY ? "written" : "would write"} — "${title.slice(0, 55)}"`);
      written += 1;
    }
  }

  console.log(`\n${APPLY ? "Wrote" : "Would write"} ${written} row(s); skipped ${skipped}.`);
  if (!APPLY) console.log("Re-run with --apply to persist.");
  await pool.end();
}

main().catch(async (err) => {
  console.error("translate-feature-snippets failed:", err);
  try {
    await pool.end();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
