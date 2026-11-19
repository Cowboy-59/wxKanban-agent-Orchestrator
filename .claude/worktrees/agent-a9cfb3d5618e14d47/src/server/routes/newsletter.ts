/**
 * Newsletter — SysAdmin compose + send API (spec 064 / Phase B)
 *
 * Authored issues are drafted, previewed against a recipient segment, then sent
 * via SES as a background job (NewsletterSendService). All routes require SYSADMIN;
 * the public unsubscribe route lives in the unauthenticated marketing router.
 */

import { Router, Response } from "express";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { authenticateToken, AuthRequest } from "../middleware/auth.js";
import { requireSysAdmin } from "../middleware/requireSysAdmin.js";
import { db } from "../db/client.js";
import { newsletterissues } from "../../db/schema/newsletterissues.js";
import { newslettersends } from "../../db/schema/newslettersends.js";
import {
  startSend,
  countAudience,
  sendTestEmail,
  type Audience,
} from "../services/NewsletterSendService.js";
import type { NewsletterCategory } from "../lib/newsletter-unsubscribe.js";
import { newsletterSenderConfigured } from "../lib/ses.js";
import { createLogger } from "../lib/logger.js";

const logger = createLogger("newsletter-routes");
const router = Router();

router.use(authenticateToken);
router.use(requireSysAdmin);

// [SCOPE 064 / T006] BEGIN — SysAdmin newsletter API (issues CRUD + preview + send)

// [SCOPE 064 / T010] Amendment A — an issue targets marketing contacts, registered
// users, or both. `segment` is required only when marketing is included; `usercategory`
// only when users are included. superRefine enforces that on create.
const issueBase = z.object({
  subject: z.string().min(1).max(255),
  body: z.string().min(1),
  segment: z.string().max(40).optional(),
  audience: z.enum(["marketing", "users", "both"]).optional(),
  usercategory: z.enum(["updates", "promos"]).optional(),
});

const issueSchema = issueBase.superRefine((v, ctx) => {
  const audience: Audience = v.audience ?? "marketing";
  if ((audience === "marketing" || audience === "both") && !v.segment?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["segment"], message: "segment is required for the marketing audience." });
  }
  if ((audience === "users" || audience === "both") && !v.usercategory) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["usercategory"], message: "usercategory is required for the registered-users audience." });
  }
});

/** GET /issues — reverse-chronological list with outcomes. */
router.get("/issues", async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const rows = await db
      .select()
      .from(newsletterissues)
      .orderBy(desc(newsletterissues.createdat));
    res.json({ issues: rows });
  } catch (err) {
    logger.error({ err }, "list newsletter issues failed");
    res.status(500).json({ error: "Failed to list issues." });
  }
});

/** POST /issues — create a draft. */
router.post("/issues", async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = issueSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid issue payload." });
    return;
  }
  try {
    const audience: Audience = parsed.data.audience ?? "marketing";
    const [row] = await db
      .insert(newsletterissues)
      .values({
        subject: parsed.data.subject,
        body: parsed.data.body,
        // segment is only meaningful for the marketing side; store "" when users-only.
        segment: parsed.data.segment?.trim() ?? "",
        audience,
        usercategory: audience === "marketing" ? null : parsed.data.usercategory ?? null,
        createdbyid: req.userid ?? null,
      })
      .returning();
    res.status(201).json({ issue: row });
  } catch (err) {
    logger.error({ err }, "create newsletter issue failed");
    res.status(500).json({ error: "Failed to create issue." });
  }
});

/** GET /issues/:id — detail + per-recipient send record. */
router.get("/issues/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [issue] = await db
      .select()
      .from(newsletterissues)
      .where(eq(newsletterissues.id, req.params.id));
    if (!issue) {
      res.status(404).json({ error: "Issue not found." });
      return;
    }
    const sends = await db
      .select()
      .from(newslettersends)
      .where(eq(newslettersends.issueid, req.params.id))
      .orderBy(desc(newslettersends.sentat));
    res.json({ issue, sends });
  } catch (err) {
    logger.error({ err }, "get newsletter issue failed");
    res.status(500).json({ error: "Failed to load issue." });
  }
});

/** PATCH /issues/:id — edit a draft (only while status = draft). */
router.patch("/issues/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = issueBase.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid issue payload." });
    return;
  }
  try {
    const [existing] = await db
      .select()
      .from(newsletterissues)
      .where(eq(newsletterissues.id, req.params.id));
    if (!existing) {
      res.status(404).json({ error: "Issue not found." });
      return;
    }
    if (existing.status !== "draft") {
      res.status(409).json({ error: "Only a draft issue can be edited." });
      return;
    }
    const d = parsed.data;
    // [SCOPE 064 / T010] Amendment A — validate the resulting audience is coherent.
    const audience: Audience = (d.audience ?? existing.audience) as Audience;
    const segment = d.segment !== undefined ? d.segment.trim() : existing.segment;
    const usercategory =
      d.usercategory !== undefined ? d.usercategory : (existing.usercategory as NewsletterCategory | null);
    if ((audience === "marketing" || audience === "both") && !segment) {
      res.status(400).json({ error: "segment is required for the marketing audience." });
      return;
    }
    if ((audience === "users" || audience === "both") && !usercategory) {
      res.status(400).json({ error: "usercategory is required for the registered-users audience." });
      return;
    }
    const [row] = await db
      .update(newsletterissues)
      .set({
        ...(d.subject !== undefined ? { subject: d.subject } : {}),
        ...(d.body !== undefined ? { body: d.body } : {}),
        segment,
        audience,
        usercategory: audience === "marketing" ? null : usercategory,
        updatedat: new Date(),
      })
      .where(eq(newsletterissues.id, req.params.id))
      .returning();
    res.json({ issue: row });
  } catch (err) {
    logger.error({ err }, "update newsletter issue failed");
    res.status(500).json({ error: "Failed to update issue." });
  }
});

/**
 * GET /issues/:id/recipients?audience=&segment=&usercategory= — deduped recipient
 * count preview (no send). Query params override the stored issue so the compose UI
 * can preview a changed audience before saving; unspecified fields fall back to the
 * saved issue. [SCOPE 064 / T010] Amendment A.
 */
router.get(
  "/issues/:id/recipients",
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const [issue] = await db
        .select()
        .from(newsletterissues)
        .where(eq(newsletterissues.id, req.params.id));
      if (!issue) {
        res.status(404).json({ error: "Issue not found." });
        return;
      }
      const qAudience = typeof req.query.audience === "string" ? req.query.audience : null;
      const audience: Audience =
        qAudience === "marketing" || qAudience === "users" || qAudience === "both"
          ? qAudience
          : (issue.audience as Audience) ?? "marketing";
      const segment =
        typeof req.query.segment === "string" ? req.query.segment : issue.segment;
      const qCat = typeof req.query.usercategory === "string" ? req.query.usercategory : null;
      const usercategory: NewsletterCategory | null =
        qCat === "updates" || qCat === "promos"
          ? qCat
          : (issue.usercategory as NewsletterCategory | null);
      const count = await countAudience({ audience, segment, usercategory });
      res.json({ audience, segment, usercategory, count });
    } catch (err) {
      logger.error({ err }, "recipient preview failed");
      res.status(500).json({ error: "Failed to compute recipients." });
    }
  },
);

// [SCOPE 064 / T011] BEGIN — "Send to me": one review copy to a fixed review inbox.
const testSchema = z.object({
  subject: z.string().min(1).max(255),
  body: z.string().min(1),
  // [SCOPE 064] Optional language for the review copy — server translates to it.
  locale: z.string().max(10).optional(),
});

// Always the review inbox — NOT the logged-in user. Overridable via env, but
// defaults to andy@wxperts.com so review copies always land in one place.
const REVIEW_TO = process.env.NEWSLETTER_REVIEW_TO?.trim() || "andy@wxperts.com";

/** POST /test — send a single [TEST] review copy to the fixed review inbox. */
router.post("/test", async (req: AuthRequest, res: Response): Promise<void> => {
  if (!newsletterSenderConfigured()) {
    res.status(503).json({ error: "Sending is not configured on this server (NEWSLETTER_FROM)." });
    return;
  }
  const parsed = testSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "subject and body are required." });
    return;
  }
  try {
    const result = await sendTestEmail(
      REVIEW_TO,
      parsed.data.subject,
      parsed.data.body,
      parsed.data.locale,
    );
    res.json({ ok: true, to: REVIEW_TO, locale: result.locale, translated: result.translated });
  } catch (err) {
    logger.error({ err }, "newsletter test send failed");
    res.status(500).json({ error: "Test send failed." });
  }
});
// [SCOPE 064 / T011] END

/** POST /issues/:id/send — atomically claim a draft → sending, then send in background. */
router.post("/issues/:id/send", async (req: AuthRequest, res: Response): Promise<void> => {
  if (!newsletterSenderConfigured()) {
    res.status(503).json({ error: "Sending is not configured on this server (NEWSLETTER_FROM)." });
    return;
  }
  try {
    // Atomic guard: only a draft can be claimed for sending — prevents double-send.
    const claimed = await db
      .update(newsletterissues)
      .set({ status: "sending", updatedat: new Date() })
      .where(and(eq(newsletterissues.id, req.params.id), eq(newsletterissues.status, "draft")))
      .returning();
    if (!claimed.length) {
      res.status(409).json({ error: "Issue is not a draft (already sending or sent)." });
      return;
    }
    // Background send — not awaited (a full segment blast far exceeds a request).
    const issueId = String(req.params.id);
    void startSend(issueId).catch((err) => {
      logger.error({ err, issueId }, "background newsletter send threw");
    });
    res.status(202).json({ ok: true, issue: claimed[0] });
  } catch (err) {
    logger.error({ err }, "trigger newsletter send failed");
    res.status(500).json({ error: "Failed to start send." });
  }
});

/**
 * POST /issues/:id/revert — move a sent/failed issue back to draft so it can be
 * edited and re-sent. Resets the roll-up counts; prior per-recipient send records
 * are kept as history. [SCOPE 064]
 */
router.post("/issues/:id/revert", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [existing] = await db
      .select()
      .from(newsletterissues)
      .where(eq(newsletterissues.id, req.params.id));
    if (!existing) {
      res.status(404).json({ error: "Issue not found." });
      return;
    }
    if (existing.status === "draft") {
      res.status(409).json({ error: "Issue is already a draft." });
      return;
    }
    const [row] = await db
      .update(newsletterissues)
      .set({
        status: "draft",
        recipientcount: 0,
        sentcount: 0,
        failedcount: 0,
        sentat: null,
        updatedat: new Date(),
      })
      .where(eq(newsletterissues.id, req.params.id))
      .returning();
    res.json({ issue: row });
  } catch (err) {
    logger.error({ err }, "revert newsletter issue failed");
    res.status(500).json({ error: "Failed to revert issue." });
  }
});
// [SCOPE 064 / T006] END

export default router;
