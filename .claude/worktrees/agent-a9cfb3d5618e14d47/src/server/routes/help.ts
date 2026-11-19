/**
 * Help Routes - wxKanban Online Help System API
 * 
 * Public and admin endpoints for help articles, search, and analytics.
 */

import { Router, Request, Response } from "express";
import { z } from "zod";
import { and, desc, eq, isNotNull, isNull, ne } from "drizzle-orm";
import helpService from "../services/HelpService.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../../middleware/rbac.js";
import { db } from "../db/client.js";
import { marketingassets } from "../../db/schema/marketingassets.js";
import { createLogger } from "../lib/logger.js";

const router = Router();
const faqLogger = createLogger("help-faq-routes");

// Validation schemas
const searchQuerySchema = z.object({
  q: z.string().optional(),
  category: z.string().optional(),
  subcategory: z.string().optional(),
  tags: z.string().optional(), // comma-separated
  page: z.string().transform(Number).default("1"),
  limit: z.string().transform(Number).default("20"),
});

const rateArticleSchema = z.object({
  rating: z.enum(["helpful", "not_helpful"]),
});

const createArticleSchema = z.object({
  title: z.string().min(1).max(200),
  slug: z.string().max(100).optional(),
  content: z.string().min(1),
  summary: z.string().max(500).optional(),
  category: z.enum(["cli", "ui", "api", "guide", "faq"]),
  subcategory: z.string().max(50).optional(),
  tags: z.array(z.string()).optional(),
  command: z.string().max(100).optional(),
  usage: z.string().max(500).optional(),
  arguments: z.record(z.string()).optional(),
  options: z.record(z.string()).optional(),
  examples: z.array(z.string()).optional(),
  relatedTopics: z.array(z.string()).optional(),
  prerequisites: z.array(z.string()).optional(),
  version: z.string().max(20).optional(),
  visibility: z.enum(["public", "internal", "admin"]).default("public"),
  status: z.enum(["active", "draft", "archived"]).default("draft"),
  isFeatured: z.boolean().default(false),
  searchKeywords: z.string().optional(),
});

const updateArticleSchema = createArticleSchema.partial();

const toTextArray = (value?: string[]): string | undefined => {
  if (!value) {
    return undefined;
  }
  return JSON.stringify(value);
};

// ==================== PUBLIC ENDPOINTS ====================

/**
 * GET /api/help/search
 * Search help articles with full-text search and filters
 */
router.get("/search", async (req: Request, res: Response) => {
  try {
    const query = searchQuerySchema.parse(req.query);

    const filters = {
      searchQuery: query.q,
      category: query.category,
      subcategory: query.subcategory,
      tags: query.tags ? query.tags.split(",").map((t) => t.trim()) : undefined,
    };

    const result = await helpService.searchArticles(
      filters,
      query.page,
      query.limit
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: "Invalid query parameters",
        details: error.errors,
      });
      return;
    }
    console.error("Error searching help articles:", error);
    res.status(500).json({
      success: false,
      error: "Failed to search help articles",
    });
  }
});

/**
 * GET /api/help/categories
 * Get all unique categories and subcategories
 */
router.get("/categories", async (_req: Request, res: Response) => {
  try {
    const categories = await helpService.getCategories();

    res.json({
      success: true,
      data: categories,
    });
  } catch (error) {
    console.error("Error fetching categories:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch categories",
    });
  }
});

/**
 * GET /api/help/articles/:slug
 * Get a single article by slug (increments view count)
 */
router.get("/articles/:slug", async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;

    const article = await helpService.getArticleBySlug(slug);

    if (!article) {
      res.status(404).json({
        success: false,
        error: "Article not found",
      });
      return;
    }

    // Increment view count asynchronously (don't wait)
    helpService.incrementViewCount(article.id).catch((err) => {
      console.error("Failed to increment view count:", err);
    });

    res.json({
      success: true,
      data: article,
    });
  } catch (error) {
    console.error("Error fetching article:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch article",
    });
  }
});

/**
 * GET /api/help/related/:slug
 * Get related articles for a given article
 */
router.get("/related/:slug", async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const limit = parseInt(req.query.limit as string) || 5;

    // First get the article to find its ID
    const article = await helpService.getArticleBySlug(slug);

    if (!article) {
      res.status(404).json({
        success: false,
        error: "Article not found",
      });
      return;
    }

    const related = await helpService.getRelatedArticles(article.id, limit);

    res.json({
      success: true,
      data: related,
    });
  } catch (error) {
    console.error("Error fetching related articles:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch related articles",
    });
  }
});

/**
 * GET /api/help/cli-commands
 * Get all CLI command documentation
 */
router.get("/cli-commands", async (_req: Request, res: Response) => {
  try {
    const commands = await helpService.getCLICommands();

    res.json({
      success: true,
      data: commands,
    });
  } catch (error) {
    console.error("Error fetching CLI commands:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch CLI commands",
    });
  }
});

// [SCOPE 044 / T002] BEGIN — public landing-page Docs endpoints
/**
 * GET /api/help/docs
 * Public landing-page docs index — published docs, ordered. No auth.
 */
router.get("/docs", async (_req: Request, res: Response) => {
  try {
    const docs = await helpService.listPublicDocs();
    res.json({
      success: true,
      data: docs.map((d) => ({
        id: d.id,
        slug: d.slug,
        title: d.title,
        summary: d.summary,
        videourl: d.videourl,
        posterurl: d.posterurl,
        sortorder: d.sortorder,
      })),
    });
  } catch (error) {
    console.error("Error fetching docs index:", error);
    res.status(500).json({ success: false, error: "Failed to fetch docs" });
  }
});

/**
 * GET /api/help/docs/:slug
 * Public landing-page doc detail by slug. 404 on draft/unknown. No auth.
 */
router.get("/docs/:slug", async (req: Request, res: Response) => {
  try {
    const doc = await helpService.getPublicDocBySlug(req.params.slug);
    if (!doc) {
      res.status(404).json({ success: false, error: "Doc not found" });
      return;
    }
    res.json({
      success: true,
      data: {
        id: doc.id,
        slug: doc.slug,
        title: doc.title,
        summary: doc.summary,
        content: doc.content,
        videourl: doc.videourl,
        posterurl: doc.posterurl,
      },
    });
  } catch (error) {
    console.error("Error fetching doc:", error);
    res.status(500).json({ success: false, error: "Failed to fetch doc" });
  }
});
// [SCOPE 044 / T002] END

// [SCOPE 066 / T007] BEGIN — public FAQ + categorized marketing-video catalog
// These mirror the public /docs index: read-only, unauthenticated, consumed by the
// VS Code Cockpit (faqCatalog/videosCatalog) the same way it already fetches /docs.
// FAQs and marketing videos are global, published product content — safe to expose.

/**
 * GET /api/help/faq
 * Published, answered, global product FAQs. Public, read-only.
 */
router.get("/faq", async (req: Request, res: Response) => {
  try {
    // [SCOPE 066 / T008] MODIFIED (SCOPE-093 sidebar bug) — return ONE row per FAQ
    // (assetkey), not every translation. Prefer the caller's language (e.g. the Cockpit's
    // editor language via ?locale=), fall back to en-US, then to any available locale.
    // Without this the unauthenticated Cockpit fetch showed each FAQ once per language.
    const requested =
      typeof req.query.locale === "string" ? req.query.locale.trim().toLowerCase() : "";
    const reqLang = requested.split(/[-_]/)[0]; // "fr-FR" | "fr" -> "fr"
    const rows = await db
      .select({
        id: marketingassets.id,
        assetkey: marketingassets.assetkey,
        title: marketingassets.title,
        content: marketingassets.content,
        fileurl: marketingassets.fileurl,
        locale: marketingassets.locale,
      })
      .from(marketingassets)
      .where(
        and(
          eq(marketingassets.category, "faq"),
          eq(marketingassets.status, "published"),
          isNull(marketingassets.companyid),
          isNotNull(marketingassets.content),
          ne(marketingassets.content, ""),
        ),
      )
      .orderBy(desc(marketingassets.updatedat));

    // Higher score wins: requested language (2) > English (1) > anything (0).
    const score = (loc: string): number => {
      const lang = (loc || "").toLowerCase().split(/[-_]/)[0];
      if (reqLang && lang === reqLang) return 2;
      if (lang === "en") return 1;
      return 0;
    };
    const best = new Map<string, (typeof rows)[number]>();
    for (const r of rows) {
      const cur = best.get(r.assetkey);
      if (!cur || score(r.locale) > score(cur.locale)) best.set(r.assetkey, r);
    }
    const data = [...best.values()].map((r) => ({
      id: r.id,
      title: r.title,
      content: r.content,
      fileurl: r.fileurl,
      locale: r.locale,
    }));
    res.json({ success: true, data });
  } catch (error) {
    faqLogger.error({ err: error }, "fetch public FAQ failed");
    res.status(500).json({ success: false, error: "Failed to fetch FAQ" });
  }
});

/**
 * GET /api/help/guides
 * Published downloadable guides (type='guide') for the public /docs Guides tab.
 * Public, read-only.
 *
 * Unlike /faq, this returns EVERY locale variant rather than collapsing to one
 * best-match row: only some guides are translated, and the page lists the
 * languages that actually exist so a reader can see that a translation is there.
 *
 * `?locale=` filters by LANGUAGE, not exact locale — 'fr', 'fr-FR' and 'fr_CA'
 * all match a row stored as 'fr-FR'. Omit it to get everything (what the /docs
 * page does, so it can build its own language filter from the real data).
 */
router.get("/guides", async (req: Request, res: Response) => {
  try {
    const requested =
      typeof req.query.locale === "string" ? req.query.locale.trim().toLowerCase() : "";
    const reqLang = requested.split(/[-_]/)[0];

    const rows = await db
      .select({
        id: marketingassets.id,
        assetkey: marketingassets.assetkey,
        title: marketingassets.title,
        content: marketingassets.content,
        fileurl: marketingassets.fileurl,
        category: marketingassets.category,
        locale: marketingassets.locale,
        updatedat: marketingassets.updatedat,
      })
      .from(marketingassets)
      .where(
        and(
          eq(marketingassets.type, "guide"),
          eq(marketingassets.status, "published"),
          isNull(marketingassets.companyid),
          isNotNull(marketingassets.fileurl),
          ne(marketingassets.fileurl, ""),
        ),
      )
      .orderBy(desc(marketingassets.updatedat));

    const data = reqLang
      ? rows.filter((r) => (r.locale || "").toLowerCase().split(/[-_]/)[0] === reqLang)
      : rows;

    res.json({ success: true, data });
  } catch (error) {
    faqLogger.error({ err: error }, "fetch public guides failed");
    res.status(500).json({ success: false, error: "Failed to fetch guides" });
  }
});

/**
 * GET /api/help/marketing-videos
 * Published marketingassets videos (type='video') with their category, so the
 * Cockpit can group them into Open / Training subtrees. Excludes faq-category rows.
 * Public, read-only.
 */
router.get("/marketing-videos", async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select({
        id: marketingassets.id,
        title: marketingassets.title,
        fileurl: marketingassets.fileurl,
        category: marketingassets.category,
        locale: marketingassets.locale,
      })
      .from(marketingassets)
      .where(
        and(
          eq(marketingassets.type, "video"),
          eq(marketingassets.status, "published"),
          ne(marketingassets.category, "faq"),
          isNotNull(marketingassets.fileurl),
          ne(marketingassets.fileurl, ""),
        ),
      )
      .orderBy(desc(marketingassets.updatedat));
    res.json({ success: true, data: rows });
  } catch (error) {
    faqLogger.error({ err: error }, "fetch marketing videos failed");
    res.status(500).json({ success: false, error: "Failed to fetch marketing videos" });
  }
});

/**
 * GET /api/help/training-sessions
 * Published, upcoming online training sessions. Public, read-only.
 * Sessions are marketingassets rows (category='trainingsession', companyid NULL):
 * the registration URL is stored in `fileurl` and the schedule/description is a
 * JSON blob in `content` ({ startsAt, timezone, description }). Only sessions whose
 * startsAt is in the future are returned, soonest first, so the public page never
 * shows a past session.
 */
router.get("/training-sessions", async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select({
        id: marketingassets.id,
        title: marketingassets.title,
        content: marketingassets.content,
        fileurl: marketingassets.fileurl,
        locale: marketingassets.locale,
      })
      .from(marketingassets)
      .where(
        and(
          eq(marketingassets.category, "trainingsession"),
          eq(marketingassets.status, "published"),
          isNull(marketingassets.companyid),
          isNotNull(marketingassets.content),
          ne(marketingassets.content, ""),
        ),
      );

    const now = Date.now();
    const sessions = rows
      .map((row) => {
        // content holds { startsAt, timezone, description }; a row with malformed
        // JSON or no startsAt is skipped rather than crashing the endpoint.
        let meta: { startsAt?: string; timezone?: string; description?: string } = {};
        try {
          meta = JSON.parse(row.content ?? "{}");
        } catch {
          return null;
        }
        if (!meta.startsAt) return null;
        const startsMs = Date.parse(meta.startsAt);
        if (Number.isNaN(startsMs)) return null;
        return {
          id: row.id,
          title: row.title,
          startsAt: meta.startsAt,
          startsMs,
          timezone: meta.timezone ?? "",
          description: meta.description ?? "",
          registerUrl: row.fileurl ?? "",
          locale: row.locale,
        };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null && s.startsMs >= now)
      .sort((a, b) => a.startsMs - b.startsMs)
      .map(({ startsMs: _startsMs, ...rest }) => rest);

    res.json({ success: true, data: sessions });
  } catch (error) {
    faqLogger.error({ err: error }, "fetch training sessions failed");
    res.status(500).json({ success: false, error: "Failed to fetch training sessions" });
  }
});
// [SCOPE 066 / T007] END

/**
 * POST /api/help/:id/rate
 * Rate an article (helpful/not helpful)
 */
router.post(
  "/:id/rate",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const body = rateArticleSchema.parse(req.body);

      // Verify article exists
      const article = await helpService.getArticleById(id);
      if (!article) {
        res.status(404).json({
          success: false,
          error: "Article not found",
        });
        return;
      }

      // TODO: Check if user has already rated (requires ratings table)
      // For now, just increment the count

      await helpService.rateArticle({
        articleId: id,
        userId: req.user?.id || "anonymous",
        rating: body.rating,
      });

      res.json({
        success: true,
        message: "Rating recorded successfully",
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: "Invalid rating",
          details: error.errors,
        });
        return;
      }
      console.error("Error rating article:", error);
      res.status(500).json({
        success: false,
        error: "Failed to record rating",
      });
    }
  }
);

// ==================== ADMIN ENDPOINTS ====================

/**
 * GET /api/admin/help/articles
 * Get all articles (admin view with filters)
 */
router.get(
  "/admin/articles",
  requireAuth,
  requireRole("Admin"),
  async (req: Request, res: Response) => {
    try {
      const {
        category,
        status,
        visibility,
        q,
        page = "1",
        limit = "50",
      } = req.query;

      const filters = {
        category: category as string | undefined,
        status: status as string | undefined,
        visibility: visibility as string | undefined,
        searchQuery: q as string | undefined,
      };

      const result = await helpService.getAllArticles(
        filters,
        parseInt(page as string),
        parseInt(limit as string)
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error("Error fetching admin articles:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch articles",
      });
    }
  }
);

/**
 * POST /api/admin/help/articles
 * Create a new help article
 */
router.post(
  "/admin/articles",
  requireAuth,
  requireRole("Admin"),
  async (req: Request, res: Response) => {
    try {
      const parsed = createArticleSchema.parse(req.body);
      const data = {
        ...parsed,
        slug:
          parsed.slug ??
          parsed.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .substring(0, 100),
        tags: toTextArray(parsed.tags),
        arguments: parsed.arguments ? JSON.stringify(parsed.arguments) : undefined,
        options: parsed.options ? JSON.stringify(parsed.options) : undefined,
        examples: toTextArray(parsed.examples),
        relatedTopics: toTextArray(parsed.relatedTopics),
        prerequisites: toTextArray(parsed.prerequisites),
        description: parsed.summary,
      };

      const article = await helpService.createArticle(data);

      res.status(201).json({
        success: true,
        data: article,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: "Invalid article data",
          details: error.errors,
        });
        return;
      }
      console.error("Error creating article:", error);
      res.status(500).json({
        success: false,
        error: "Failed to create article",
      });
    }
  }
);

/**
 * PUT /api/admin/help/articles/:id
 * Update an existing help article
 */
router.put(
  "/admin/articles/:id",
  requireAuth,
  requireRole("Admin"),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const parsed = updateArticleSchema.parse(req.body);
      const data = {
        ...parsed,
        tags: toTextArray(parsed.tags),
        arguments: parsed.arguments ? JSON.stringify(parsed.arguments) : undefined,
        options: parsed.options ? JSON.stringify(parsed.options) : undefined,
        examples: toTextArray(parsed.examples),
        relatedTopics: toTextArray(parsed.relatedTopics),
        prerequisites: toTextArray(parsed.prerequisites),
        description: parsed.summary,
      };

      const article = await helpService.updateArticle(id, data);

      if (!article) {
        res.status(404).json({
          success: false,
          error: "Article not found",
        });
        return;
      }

      res.json({
        success: true,
        data: article,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: "Invalid article data",
          details: error.errors,
        });
        return;
      }
      console.error("Error updating article:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update article",
      });
    }
  }
);

/**
 * DELETE /api/admin/help/articles/:id
 * Soft delete a help article
 */
router.delete(
  "/admin/articles/:id",
  requireAuth,
  requireRole("Admin"),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const success = await helpService.deleteArticle(id);

      if (!success) {
        res.status(404).json({
          success: false,
          error: "Article not found",
        });
        return;
      }

      res.json({
        success: true,
        message: "Article deleted successfully",
      });
    } catch (error) {
      console.error("Error deleting article:", error);
      res.status(500).json({
        success: false,
        error: "Failed to delete article",
      });
    }
  }
);

/**
 * GET /api/admin/help/analytics
 * Get help system analytics
 */
router.get(
  "/admin/analytics",
  requireAuth,
  requireRole("Admin"),
  async (_req: Request, res: Response) => {
    try {
      const analytics = await helpService.getAnalytics();

      res.json({
        success: true,
        data: analytics,
      });
    } catch (error) {
      console.error("Error fetching analytics:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch analytics",
      });
    }
  }
);

/**
 * POST /api/admin/help/import
 * Bulk import help articles
 */
router.post(
  "/admin/import",
  requireAuth,
  requireRole("Admin"),
  async (req: Request, res: Response) => {
    try {
      const { articles } = req.body;

      if (!Array.isArray(articles) || articles.length === 0) {
        res.status(400).json({
          success: false,
          error: "Invalid import data. Expected array of articles.",
        });
        return;
      }

      const imported = await helpService.importArticles(articles);

      res.json({
        success: true,
        message: `Successfully imported ${imported} articles`,
        imported,
      });
    } catch (error) {
      console.error("Error importing articles:", error);
      res.status(500).json({
        success: false,
        error: "Failed to import articles",
      });
    }
  }
);

export default router;
