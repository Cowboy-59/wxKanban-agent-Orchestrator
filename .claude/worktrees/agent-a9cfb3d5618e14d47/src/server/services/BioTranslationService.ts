// [SCOPE 100 / T010] BEGIN — Chunked bio translation fan-out (FR-007)
// MODIFIED-BY: T015 — inherit the en-US source row's status instead of hardcoding
// "published" (whole-branch review fix, FR-003/US6). Hardcoding "published" here
// meant every Translate press force-published all 5 locale rows even when the
// English source itself was still a draft, defeating the en-US publish gate added
// to bio.ts by the same fix.
// Locales run STRICTLY ONE AT A TIME, and within each locale title then content
// run in sequence too — so at most one model call is ever in flight. This is
// deliberate: a 5.3K-char bio is ~15 calls totalling ~50-67K tokens, and the
// translation model's free-tier budget is 30K tokens/minute. Firing them in
// parallel (the old Promise.all design) burst ~50K at once and every call 429'd.
// One-at-a-time keeps each call small; when the rolling per-minute budget still
// fills mid-run, the sender's 429 backoff (llm-provider.ts) waits out the window
// and continues, so a long bio takes ~1-2 min but never fails. The existing
// chunk/stitch (chunkMarkdown/stitchChunks) is unchanged — only the fan-out was
// the problem, not the splitting.
//
// Fail-open per locale: a failure leaves the previous translation in place, /bio falls
// back to English, and the English row is never rolled back.
//
// MODIFIED-BY: T017 — optional `routing` threaded through so a founder-chosen provider
// (FR-011) drives the fan-out; omitted preserves each translator's env default.
import { db } from "../../db/client.js";
import { marketingassets } from "../../db/schema/marketingassets.js";
import type { GenerateOptions } from "../ai/llm-provider.js";
import { TRANSLATION_LOCALES, translateMarkdownChunk, translateTitle } from "./MarketingAIService.js";
import { chunkMarkdown, stitchChunks, BIO_CHUNK_MAX_CHARS } from "../../shared/bio/chunker.js";
import { BIO_ASSETKEY, BIO_TYPE, BIO_CATEGORY } from "../../shared/bio/constants.js";
import { createLogger } from "../lib/logger.js";

const bioLogger = createLogger("bio-translation");

/** Translate markdown into one locale, chunking when it exceeds the budget. */
export async function translateMarkdown(
  md: string,
  locale: string,
  language: string,
  routing?: Pick<GenerateOptions, "provider" | "model">,
): Promise<string | null> {
  const chunks = chunkMarkdown(md, BIO_CHUNK_MAX_CHARS);
  if (chunks.length === 0) return null;

  const out: string[] = [];
  for (const chunk of chunks) {
    const translated = await translateMarkdownChunk(chunk, locale, language, routing);
    // A null chunk fails the whole locale — a half-translated bio is worse than a
    // stale one, because the reader cannot tell which half is current.
    if (!translated) {
      bioLogger.warn({ locale, chunkChars: chunk.length }, "bio chunk translation returned null");
      return null;
    }
    out.push(translated.trim());
  }
  return stitchChunks(out);
}

/**
 * Translate title + content into all 5 non-English locales and upsert each row.
 *
 * `source.status` MUST be the en-US row's own status (T015) — the upsert inherits
 * it verbatim rather than hardcoding "published", so a translation of a still-draft
 * English bio does not itself go live. The route caller (bioAdmin.ts) already has
 * the source row on hand and passes its status through unchanged.
 */
export async function translateBioToAllLocales(
  source: {
    title: string;
    content: string;
    fileurl: string | null;
    status: string;
  },
  routing?: Pick<GenerateOptions, "provider" | "model">,
): Promise<Array<{ locale: string; ok: boolean }>> {
  const results: Array<{ locale: string; ok: boolean }> = [];
  // Sequential: one locale at a time, one call at a time. See the block comment
  // above for why parallelism is what broke this.
  for (const { locale, language } of TRANSLATION_LOCALES) {
    try {
      // Title uses the single-line translator, NOT translateMarkdownChunk: a bare
      // short title makes the model autocomplete a fake bio that overflows the
      // title varchar(255) column (see translateTitle for the full story).
      const title = await translateTitle(source.title, locale, language, routing);
      const content = await translateMarkdown(source.content, locale, language, routing);
      if (!title || !content) {
        results.push({ locale, ok: false });
        continue;
      }

      await db
        .insert(marketingassets)
        .values({
          assetkey: BIO_ASSETKEY,
          locale,
          type: BIO_TYPE,
          category: BIO_CATEGORY,
          title,
          content,
          fileurl: source.fileurl,
          status: source.status,
        })
        .onConflictDoUpdate({
          target: [marketingassets.assetkey, marketingassets.locale],
          set: { title, content, fileurl: source.fileurl, status: source.status, updatedat: new Date() },
        });
      results.push({ locale, ok: true });
    } catch (err) {
      bioLogger.error({ err, locale }, "bio locale translation failed");
      results.push({ locale, ok: false });
    }
  }
  return results;
}
// [SCOPE 100 / T010] END
