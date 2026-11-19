/**
 * FAQ — authenticated user surface (SCOPE-066)
 *
 * Read + ask endpoints for any logged-in user (NOT sysadmin). FAQs are global
 * product Q&A stored as marketingassets rows (category='faq', companyid NULL).
 * The single visibility rule lives here: only published, answered rows are
 * returned. Submitting a question creates an unanswered row (empty content) that
 * lands in the SysAdmin FAQ queue — nothing a user submits is shown until an
 * admin answers and publishes it.
 */

import { Router, Response } from "express";
import { z } from "zod";
import { randomUUID } from "crypto";
import { and, desc, eq, isNull, isNotNull, ne } from "drizzle-orm";
import { authenticateToken, AuthRequest } from "../middleware/auth.js";
import { db } from "../db/client.js";
import { marketingassets } from "../../db/schema/marketingassets.js";
import { checkThrottle } from "../services/MarketingAIService.js";
import { createLogger } from "../lib/logger.js";

const logger = createLogger("faq-routes");
const router = Router();

router.use(authenticateToken);

// [SCOPE 066 / T005] BEGIN — user FAQ read + ask
/**
 * GET /api/faq — published, answered, global FAQs. Optional ?locale= filter.
 * The visibility gate (FR-005) is enforced here so no read surface re-implements it.
 */
router.get("/", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { locale } = req.query;
    const conds = [
      eq(marketingassets.category, "faq"),
      eq(marketingassets.status, "published"),
      isNull(marketingassets.companyid),
      isNotNull(marketingassets.content),
      ne(marketingassets.content, ""),
    ];
    if (typeof locale === "string" && locale) conds.push(eq(marketingassets.locale, locale));
    const rows = await db
      .select({
        id: marketingassets.id,
        title: marketingassets.title,
        content: marketingassets.content,
        fileurl: marketingassets.fileurl,
        locale: marketingassets.locale,
        updatedat: marketingassets.updatedat,
      })
      .from(marketingassets)
      .where(and(...conds))
      .orderBy(desc(marketingassets.updatedat));
    res.json({ faqs: rows });
  } catch (err) {
    logger.error({ err }, "list faqs failed");
    res.status(500).json({ error: "Failed to load FAQs." });
  }
});

const askSchema = z.object({
  question: z.string().trim().min(5).max(2000),
  locale: z.string().min(2).max(35).optional(),
});

/**
 * POST /api/faq/questions — submit a question. Creates an unanswered FAQ row
 * (empty content) for the SysAdmin queue. Authenticated + soft-throttled (abuse guard).
 */
router.post("/questions", async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = askSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Please enter a question (5–2000 characters)." });
    return;
  }
  const throttle = checkThrottle(`faq-ask:${req.userid ?? "anon"}`);
  if (!throttle.ok) {
    res.status(429).json({ error: "You're asking too quickly — try again shortly.", retryAfterMs: throttle.retryAfterMs });
    return;
  }
  try {
    const question = parsed.data.question.trim();
    const slug = question.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90);
    // Unique per (assetkey, locale); append a short random suffix so distinct users
    // asking similar questions never collide.
    const assetkey = `faq-q-${slug || "question"}-${randomUUID().slice(0, 8)}`;
    await db.insert(marketingassets).values({
      assetkey,
      locale: parsed.data.locale ?? "en-US",
      type: "page",
      category: "faq",
      title: question,
      content: null, // unanswered
      status: "draft",
      createdbyid: req.userid ?? null,
    });
    res.status(201).json({ ok: true, message: "Thanks — we'll answer this and add it to the FAQ." });
  } catch (err) {
    logger.error({ err }, "submit faq question failed");
    res.status(500).json({ error: "Failed to submit your question." });
  }
});
// [SCOPE 066 / T005] END

export default router;
