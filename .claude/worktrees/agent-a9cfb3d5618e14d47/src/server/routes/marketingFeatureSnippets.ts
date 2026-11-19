/**
 * Marketing Feature Snippets manager (SCOPE-096)
 *
 * Curate the customer-facing feature set that drives the landing billboard
 * carousel. Copy + on/off live in marketingassets (type='synopsis',
 * assetkey='feature-<slug>'); per-feature config (CTA link, dwell, enhanced,
 * order, source scope) lives in the marketingfeaturesnippets sidecar.
 *
 * Two routers:
 *   publicRouter  — GET / : published snippets for the landing carousel (no auth).
 *   adminRouter   — SYSADMIN CRUD: list, toggle/edit config, translations, add-from-scope.
 *
 * Nothing here publishes on its own: add-from-scope lands a DRAFT (off); the
 * SYSADMIN turns it on explicitly. AI drafting is fail-open (never 5xx).
 */

import { Router, Response, Request } from "express";
import { z } from "zod";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { and, asc, eq, inArray } from "drizzle-orm";
import { authenticateToken, AuthRequest } from "../middleware/auth.js";
import { requireSysAdmin } from "../middleware/requireSysAdmin.js";
import { db } from "../db/client.js";
import { marketingassets } from "../../db/schema/marketingassets.js";
import { marketingfeaturesnippets } from "../../db/schema/marketingfeaturesnippets.js";
import { featureSnippetFromScope } from "../services/MarketingAIService.js";
import { createLogger } from "../lib/logger.js";

const logger = createLogger("feature-snippets-routes");

// The project's supported locales (SCOPE-046). en-US is the source/canonical.
const PROJECT_LOCALES = ["en-US", "fr-FR", "de-DE", "es-ES", "it-IT", "pt-BR"] as const;
const slugOf = (assetkey: string): string => assetkey.replace(/^feature-/, "");

// [SCOPE 096 / T002] BEGIN — public read endpoint for the landing carousel
export const publicRouter = Router();

/**
 * GET /api/marketing/feature-snippets — published snippets only, ordered for the
 * carousel. Returns per-feature dwellMs/enhanced/ctaUrl plus the locales that have
 * copy (the carousel builds billboard image URLs by convention and falls back to
 * en-US). Fail-safe: on error returns an empty set so the landing page never breaks.
 */
publicRouter.get("/", async (_req: Request, res: Response): Promise<void> => {
  try {
    const rows = await db
      .select({
        assetkey: marketingfeaturesnippets.assetkey,
        name: marketingassets.title,
        ctaurl: marketingfeaturesnippets.ctaurl,
        dwellms: marketingfeaturesnippets.dwellms,
        enhanced: marketingfeaturesnippets.enhanced,
        sortorder: marketingfeaturesnippets.sortorder,
      })
      .from(marketingfeaturesnippets)
      .innerJoin(
        marketingassets,
        and(
          eq(marketingassets.assetkey, marketingfeaturesnippets.assetkey),
          eq(marketingassets.locale, "en-US"),
          eq(marketingassets.type, "synopsis"),
          eq(marketingassets.status, "published"),
        ),
      )
      .orderBy(asc(marketingfeaturesnippets.sortorder));

    const localesByAssetkey = await localesFor(rows.map((r) => r.assetkey));
    const localeSet = new Set<string>();
    const features = rows.map((r) => {
      const locales = localesByAssetkey.get(r.assetkey) ?? ["en-US"];
      locales.forEach((l) => localeSet.add(l));
      return {
        slug: slugOf(r.assetkey),
        name: r.name,
        link: r.ctaurl || "#features",
        ctaUrl: r.ctaurl,
        dwellMs: r.dwellms,
        enhanced: r.enhanced,
        locales,
      };
    });
    res.json({ locales: [...localeSet], features });
  } catch (err) {
    logger.error({ err }, "public feature-snippets read failed (fail-safe empty)");
    res.json({ locales: [], features: [] });
  }
});
// [SCOPE 096 / T002] END

/** locales (of type=synopsis) present for each assetkey, in PROJECT_LOCALES order. */
async function localesFor(assetkeys: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (assetkeys.length === 0) return out;
  const variants = await db
    .select({ assetkey: marketingassets.assetkey, locale: marketingassets.locale })
    .from(marketingassets)
    .where(
      and(
        inArray(marketingassets.assetkey, assetkeys),
        eq(marketingassets.type, "synopsis"),
      ),
    );
  const order = (l: string) => {
    const i = (PROJECT_LOCALES as readonly string[]).indexOf(l);
    return i === -1 ? 99 : i;
  };
  for (const v of variants) {
    const list = out.get(v.assetkey) ?? [];
    if (!list.includes(v.locale)) list.push(v.locale);
    out.set(v.assetkey, list);
  }
  for (const [k, list] of out) out.set(k, list.sort((a, b) => order(a) - order(b)));
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin router — SYSADMIN only
export const adminRouter = Router();
adminRouter.use(authenticateToken);
adminRouter.use(requireSysAdmin);

// [SCOPE 096 / T003] BEGIN — SYSADMIN list + config PATCH
/** GET / — every snippet (published + draft) with its canonical name + on/off. */
adminRouter.get("/", async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const rows = await db
      .select({
        assetkey: marketingfeaturesnippets.assetkey,
        name: marketingassets.title,
        status: marketingassets.status,
        ctaurl: marketingfeaturesnippets.ctaurl,
        dwellms: marketingfeaturesnippets.dwellms,
        enhanced: marketingfeaturesnippets.enhanced,
        sortorder: marketingfeaturesnippets.sortorder,
        sourcescope: marketingfeaturesnippets.sourcescope,
      })
      .from(marketingfeaturesnippets)
      .leftJoin(
        marketingassets,
        and(
          eq(marketingassets.assetkey, marketingfeaturesnippets.assetkey),
          eq(marketingassets.locale, "en-US"),
          eq(marketingassets.type, "synopsis"),
        ),
      )
      .orderBy(asc(marketingfeaturesnippets.sortorder));
    const snippets = rows.map((r) => ({
      slug: slugOf(r.assetkey),
      assetkey: r.assetkey,
      name: r.name ?? slugOf(r.assetkey),
      on: r.status === "published",
      ctaUrl: r.ctaurl,
      dwellMs: r.dwellms,
      enhanced: r.enhanced,
      sortOrder: r.sortorder,
      sourceScope: r.sourcescope,
    }));
    res.json({ snippets });
  } catch (err) {
    logger.error({ err }, "list feature snippets failed");
    res.status(500).json({ error: "Failed to load feature snippets." });
  }
});

const patchSchema = z.object({
  on: z.boolean().optional(),
  ctaUrl: z.string().max(1000).nullable().optional(),
  dwellMs: z.number().int().min(1000).max(60000).optional(),
  enhanced: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});

/** PATCH /:assetkey — toggle on/off (marketingassets.status) + sidecar config. */
adminRouter.patch("/:assetkey", async (req: AuthRequest, res: Response): Promise<void> => {
  const p = patchSchema.safeParse(req.body);
  if (!p.success) {
    res.status(400).json({ error: "Invalid update." });
    return;
  }
  const assetkey = req.params.assetkey;
  if (!assetkey) {
    res.status(400).json({ error: "assetkey is required." });
    return;
  }
  try {
    const hasSidecar =
      p.data.ctaUrl !== undefined ||
      p.data.dwellMs !== undefined ||
      p.data.enhanced !== undefined ||
      p.data.sortOrder !== undefined;
    if (hasSidecar) {
      await db
        .update(marketingfeaturesnippets)
        .set({
          ...(p.data.ctaUrl !== undefined ? { ctaurl: p.data.ctaUrl } : {}),
          ...(p.data.dwellMs !== undefined ? { dwellms: p.data.dwellMs } : {}),
          ...(p.data.enhanced !== undefined ? { enhanced: p.data.enhanced } : {}),
          ...(p.data.sortOrder !== undefined ? { sortorder: p.data.sortOrder } : {}),
          updatedat: new Date(),
        })
        .where(eq(marketingfeaturesnippets.assetkey, assetkey));
    }
    if (p.data.on !== undefined) {
      await db
        .update(marketingassets)
        .set({ status: p.data.on ? "published" : "draft", updatedat: new Date() })
        .where(
          and(
            eq(marketingassets.assetkey, assetkey),
            eq(marketingassets.locale, "en-US"),
            eq(marketingassets.type, "synopsis"),
          ),
        );
    }
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err, assetkey }, "patch feature snippet failed");
    res.status(500).json({ error: "Failed to update the snippet." });
  }
});
// [SCOPE 096 / T003] END

// [SCOPE 096 / T004] BEGIN — per-snippet translations (language dropdown)
/** GET /:assetkey/translations — each project locale's copy; missing flagged. */
adminRouter.get("/:assetkey/translations", async (req: AuthRequest, res: Response): Promise<void> => {
  const assetkey = req.params.assetkey;
  if (!assetkey) {
    res.status(400).json({ error: "assetkey is required." });
    return;
  }
  try {
    const variants = await db
      .select({
        locale: marketingassets.locale,
        title: marketingassets.title,
        content: marketingassets.content,
        status: marketingassets.status,
      })
      .from(marketingassets)
      .where(
        and(eq(marketingassets.assetkey, assetkey), eq(marketingassets.type, "synopsis")),
      );
    const byLocale = new Map(variants.map((v) => [v.locale, v]));
    const translations = PROJECT_LOCALES.map((locale) => {
      const v = byLocale.get(locale);
      return {
        locale,
        present: Boolean(v),
        title: v?.title ?? null,
        content: v?.content ?? null,
        status: v?.status ?? null,
      };
    });
    res.json({ assetkey, translations });
  } catch (err) {
    logger.error({ err, assetkey }, "get translations failed");
    res.status(500).json({ error: "Failed to load translations." });
  }
});
// [SCOPE 096 / T004] END

// [SCOPE 096 / T005] BEGIN — edit a snippet's copy for a locale
const editSchema = z.object({
  locale: z.enum(PROJECT_LOCALES),
  title: z.string().min(1).max(255).optional(),
  content: z.string().max(20000).optional(),
});

/** POST /:assetkey — edit the copy (title/content) for one locale; persists, no publish. */
adminRouter.post("/:assetkey", async (req: AuthRequest, res: Response): Promise<void> => {
  const p = editSchema.safeParse(req.body);
  if (!p.success) {
    res.status(400).json({ error: "Invalid edit." });
    return;
  }
  const assetkey = req.params.assetkey;
  if (!assetkey) {
    res.status(400).json({ error: "assetkey is required." });
    return;
  }
  try {
    const result = await db
      .update(marketingassets)
      .set({
        ...(p.data.title !== undefined ? { title: p.data.title } : {}),
        ...(p.data.content !== undefined ? { content: p.data.content } : {}),
        updatedat: new Date(),
      })
      .where(
        and(
          eq(marketingassets.assetkey, assetkey),
          eq(marketingassets.locale, p.data.locale),
          eq(marketingassets.type, "synopsis"),
        ),
      )
      .returning({ id: marketingassets.id });
    if (result.length === 0) {
      res.status(404).json({ error: `No ${p.data.locale} copy for this snippet.` });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err, assetkey }, "edit snippet copy failed");
    res.status(500).json({ error: "Failed to save the edit." });
  }
});
// [SCOPE 096 / T005] END

// [SCOPE 096 / T006] BEGIN — add a snippet by drafting it from a Project-Scope doc
const fromScopeSchema = z.object({ scopeId: z.string().min(1).max(60) });

/** POST /from-scope — pick a Project-Scope, AI drafts a snippet, save as DRAFT (off). */
adminRouter.post("/from-scope", async (req: AuthRequest, res: Response): Promise<void> => {
  const p = fromScopeSchema.safeParse(req.body);
  if (!p.success) {
    res.status(400).json({ error: "scopeId is required." });
    return;
  }
  const scopeId = p.data.scopeId.replace(/[^a-z0-9-]/gi, "");
  try {
    const dir = resolve(process.cwd(), "specs/Project-Scope");
    const files = await readdir(dir);
    const match = files.find((f) => f.startsWith(`${scopeId}-`) || f === `${scopeId}.md`);
    if (!match) {
      res.status(404).json({ error: `No Project-Scope doc found for "${scopeId}".` });
      return;
    }
    const scopeContent = await readFile(resolve(dir, match), "utf8");
    const draft = await featureSnippetFromScope(scopeContent);
    if (!draft) {
      // fail-open: AI unavailable/garbled — no row saved, clear message
      res.json({ ok: false, error: "Couldn't draft from that scope — try again." });
      return;
    }
    const slug = draft.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || scopeId;
    const assetkey = `feature-${slug}`;
    const content = [
      draft.valueProp,
      "",
      `**For:** ${draft.audience}`,
      `**Benefit:** ${draft.benefit}`,
      "",
      `_Source: SCOPE-${scopeId}_`,
    ].join("\n");
    // Draft (off) synopsis row + sidecar row (idempotent).
    await db
      .insert(marketingassets)
      .values({
        assetkey,
        locale: "en-US",
        type: "synopsis",
        category: "open",
        title: draft.name,
        content,
        targetsegment: draft.audience,
        status: "draft",
        createdbyid: req.userid ?? null,
      })
      .onConflictDoUpdate({
        target: [marketingassets.assetkey, marketingassets.locale],
        set: { title: draft.name, content, updatedat: new Date() },
      });
    await db
      .insert(marketingfeaturesnippets)
      .values({ assetkey, dwellms: 5000, enhanced: false, sortorder: 999, sourcescope: `SCOPE-${scopeId}` })
      .onConflictDoUpdate({
        target: marketingfeaturesnippets.assetkey,
        set: { sourcescope: `SCOPE-${scopeId}`, updatedat: new Date() },
      });
    res.status(201).json({ ok: true, slug, assetkey, draft });
  } catch (err) {
    logger.error({ err, scopeId }, "add-from-scope failed");
    res.status(500).json({ error: "Failed to add from scope." });
  }
});
// [SCOPE 096 / T006] END
