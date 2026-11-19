/**
 * Marketing — SysAdmin Lead Funnel API (spec 046)
 *
 * Admin-authed endpoints to work captured leads through the funnel:
 * list/filter, detail, status transitions (decline requires a reason), notes.
 * All routes require SYSADMIN authentication.
 */

import { Router, Response } from "express";
import { z } from "zod";
import { and, asc, desc, eq, isNull, or, type SQL } from "drizzle-orm";
import { authenticateToken, AuthRequest } from "../middleware/auth.js";
import { requireSysAdmin } from "../middleware/requireSysAdmin.js";
import { db } from "../db/client.js";
import { marketingleads } from "../../db/schema/marketingleads.js";
import { campaigns } from "../../db/schema/campaigns.js";
import { marketingassets } from "../../db/schema/marketingassets.js";
import { campaignposts } from "../../db/schema/campaignposts.js";
import {
  presignAssetUpload,
  marketingAssetsConfigured,
} from "../lib/marketing-assets-s3.js";
import { getMarketingOverview } from "../services/SysAdminMarketingOverviewService.js";
import { generateFaqDefaults, checkThrottle } from "../services/MarketingAIService.js";
import { createLogger } from "../lib/logger.js";

const logger = createLogger("marketing-admin-routes");
const router = Router();

router.use(authenticateToken);
router.use(requireSysAdmin);

// [SCOPE 064 / T001] BEGIN — read-only marketing overview rollup
/** GET /api/sysadmin/marketing/overview — aggregate of all marketing work done so far. */
router.get("/overview", async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    res.json(await getMarketingOverview());
  } catch (err) {
    // getMarketingOverview is itself fail-open; this guards only truly unexpected throws.
    logger.error({ err }, "marketing overview failed");
    res.status(500).json({ error: "Failed to load marketing overview." });
  }
});
// [SCOPE 064 / T001] END

// [SCOPE 046 / T004] BEGIN — SysAdmin lead-funnel API (list/get/status/note)

const STATUSES = [
  "new",
  "contacted",
  "qualified",
  "onboarded",
  "declined",
] as const;
type LeadStatus = (typeof STATUSES)[number];

/** GET /api/sysadmin/marketing/leads — filterable funnel list. */
router.get("/leads", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { segment, status, sourceproperty, campaignid } = req.query;
    const conds: SQL[] = [];
    if (typeof segment === "string") conds.push(eq(marketingleads.segment, segment));
    if (typeof status === "string") conds.push(eq(marketingleads.status, status));
    if (typeof sourceproperty === "string")
      conds.push(eq(marketingleads.sourceproperty, sourceproperty));
    if (typeof campaignid === "string")
      conds.push(eq(marketingleads.campaignid, campaignid));

    const rows = await db
      .select()
      .from(marketingleads)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(marketingleads.createdat));

    res.json({ leads: rows });
  } catch (err) {
    logger.error({ err }, "list marketing leads failed");
    res.status(500).json({ error: "Failed to list leads." });
  }
});

/** GET /api/sysadmin/marketing/leads/:id — lead detail. */
router.get("/leads/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [row] = await db
      .select()
      .from(marketingleads)
      .where(eq(marketingleads.id, req.params.id));
    if (!row) {
      res.status(404).json({ error: "Lead not found." });
      return;
    }
    res.json({ lead: row });
  } catch (err) {
    logger.error({ err }, "get marketing lead failed");
    res.status(500).json({ error: "Failed to load lead." });
  }
});

const statusSchema = z.object({
  status: z.enum(STATUSES),
  declinedreason: z.string().max(2000).optional(),
});

/** PATCH /api/sysadmin/marketing/leads/:id/status — transition status. */
router.patch(
  "/leads/:id/status",
  async (req: AuthRequest, res: Response): Promise<void> => {
    const parsed = statusSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid status payload." });
      return;
    }
    const { status, declinedreason } = parsed.data;
    // Decline must carry a reason (FR-011).
    if (status === "declined" && !declinedreason?.trim()) {
      res.status(400).json({ error: "A reason is required to decline a lead." });
      return;
    }

    try {
      const [updated] = await db
        .update(marketingleads)
        .set({
          status: status as LeadStatus,
          declinedreason: status === "declined" ? declinedreason!.trim() : null,
          updatedat: new Date(),
        })
        .where(eq(marketingleads.id, req.params.id))
        .returning();
      if (!updated) {
        res.status(404).json({ error: "Lead not found." });
        return;
      }
      res.json({ lead: updated });
    } catch (err) {
      logger.error({ err }, "update marketing lead status failed");
      res.status(500).json({ error: "Failed to update status." });
    }
  },
);

const noteSchema = z.object({ note: z.string().min(1).max(4000) });

/** POST /api/sysadmin/marketing/leads/:id/note — append a timestamped note. */
router.post(
  "/leads/:id/note",
  async (req: AuthRequest, res: Response): Promise<void> => {
    const parsed = noteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "A non-empty note is required." });
      return;
    }
    try {
      const [row] = await db
        .select({ notes: marketingleads.notes })
        .from(marketingleads)
        .where(eq(marketingleads.id, req.params.id));
      if (!row) {
        res.status(404).json({ error: "Lead not found." });
        return;
      }
      const stamp = new Date().toISOString();
      const author = req.userid ?? "admin";
      const entry = `[${stamp}] (${author}) ${parsed.data.note.trim()}`;
      const next = row.notes ? `${row.notes}\n${entry}` : entry;

      const [updated] = await db
        .update(marketingleads)
        .set({ notes: next, updatedat: new Date() })
        .where(eq(marketingleads.id, req.params.id))
        .returning();
      res.json({ lead: updated });
    } catch (err) {
      logger.error({ err }, "append marketing lead note failed");
      res.status(500).json({ error: "Failed to add note." });
    }
  },
);
// [SCOPE 046 / T004] END

// [SCOPE 048 / T003] BEGIN — Campaign CRUD API
const campaignSchema = z.object({
  name: z.string().min(1).max(255),
  goal: z.string().max(4000).optional(),
  segment: z.enum(["windev", "careerchanger", "broad"]),
  startdate: z.string().datetime().optional(),
  launchdate: z.string().datetime().optional(),
  status: z.enum(["planned", "active", "completed", "archived"]).optional(),
});

router.get("/campaigns", async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const rows = await db
      .select()
      .from(campaigns)
      .orderBy(desc(campaigns.createdat));
    res.json({ campaigns: rows });
  } catch (err) {
    logger.error({ err }, "list campaigns failed");
    res.status(500).json({ error: "Failed to list campaigns." });
  }
});

router.post("/campaigns", async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = campaignSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid campaign payload." });
    return;
  }
  try {
    const d = parsed.data;
    const [row] = await db
      .insert(campaigns)
      .values({
        name: d.name,
        goal: d.goal ?? null,
        segment: d.segment,
        startdate: d.startdate ? new Date(d.startdate) : null,
        launchdate: d.launchdate ? new Date(d.launchdate) : null,
        status: d.status ?? "planned",
        createdbyid: req.userid ?? null,
      })
      .returning();
    res.status(201).json({ campaign: row });
  } catch (err) {
    logger.error({ err }, "create campaign failed");
    res.status(500).json({ error: "Failed to create campaign." });
  }
});

router.get("/campaigns/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [row] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, req.params.id));
    if (!row) {
      res.status(404).json({ error: "Campaign not found." });
      return;
    }
    const [assets, posts] = await Promise.all([
      db.select().from(marketingassets).where(eq(marketingassets.campaignid, req.params.id)),
      db.select().from(campaignposts).where(eq(campaignposts.campaignid, req.params.id)),
    ]);
    res.json({ campaign: row, assets, posts });
  } catch (err) {
    logger.error({ err }, "get campaign failed");
    res.status(500).json({ error: "Failed to load campaign." });
  }
});

router.patch("/campaigns/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = campaignSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid campaign payload." });
    return;
  }
  try {
    const d = parsed.data;
    const [row] = await db
      .update(campaigns)
      .set({
        ...(d.name !== undefined ? { name: d.name } : {}),
        ...(d.goal !== undefined ? { goal: d.goal } : {}),
        ...(d.segment !== undefined ? { segment: d.segment } : {}),
        ...(d.startdate !== undefined ? { startdate: d.startdate ? new Date(d.startdate) : null } : {}),
        ...(d.launchdate !== undefined ? { launchdate: d.launchdate ? new Date(d.launchdate) : null } : {}),
        ...(d.status !== undefined ? { status: d.status } : {}),
        updatedat: new Date(),
      })
      .where(eq(campaigns.id, req.params.id))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Campaign not found." });
      return;
    }
    res.json({ campaign: row });
  } catch (err) {
    logger.error({ err }, "update campaign failed");
    res.status(500).json({ error: "Failed to update campaign." });
  }
});
// [SCOPE 048 / T003] END

// [SCOPE 048 / T004] BEGIN — Asset library API + presigned-upload endpoint
// MODIFIED-BY: T005 — widened the category enum to accept 'bio' (SCOPE-100, FR-002)
const assetSchema = z.object({
  assetkey: z.string().min(1).max(120),
  locale: z.string().min(2).max(35),
  // 'guide' — a downloadable PDF guide surfaced on the public /docs Guides tab.
  // Locale variants of one guide share an assetkey and differ by locale.
  type: z.enum(["post", "page", "video", "synopsis", "image", "download", "guide"]),
  // [SCOPE 100 / T005] 'bio' — the founder bio page (SCOPE-100). The DB column is a
  // plain varchar(50) with no constraint, so a bio row inserts by script regardless;
  // without this enum entry the admin PATCH at :453 rejects every save with a 400.
  // 'migrationguides' groups the guide-type assets into the "Migration Guides" section.
  category: z
    .enum(["open", "training", "faq", "trainingsession", "bio", "migrationguides"])
    .optional(),
  title: z.string().min(1).max(255),
  content: z.string().optional(),
  fileurl: z.string().max(1000).optional(),
  targetsegment: z.enum(["windev", "careerchanger", "broad"]).optional(),
  campaignid: z.string().uuid().optional(),
  status: z.enum(["draft", "scheduled", "published"]).optional(),
});

router.get("/assets", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { assetkey, locale, type, category, targetsegment, campaignid, status, unanswered } = req.query;
    const conds: SQL[] = [];
    if (typeof assetkey === "string") conds.push(eq(marketingassets.assetkey, assetkey));
    if (typeof locale === "string") conds.push(eq(marketingassets.locale, locale));
    if (typeof type === "string") conds.push(eq(marketingassets.type, type));
    if (typeof category === "string") conds.push(eq(marketingassets.category, category));
    if (typeof targetsegment === "string") conds.push(eq(marketingassets.targetsegment, targetsegment));
    if (typeof campaignid === "string") conds.push(eq(marketingassets.campaignid, campaignid));
    if (typeof status === "string") conds.push(eq(marketingassets.status, status));
    // [SCOPE 066 / T002] Unanswered FAQ queue: rows with empty content.
    if (unanswered === "true") {
      const empty = or(isNull(marketingassets.content), eq(marketingassets.content, ""));
      if (empty) conds.push(empty);
    }
    const rows = await db
      .select()
      .from(marketingassets)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(marketingassets.updatedat));
    res.json({ assets: rows });
  } catch (err) {
    logger.error({ err }, "list assets failed");
    res.status(500).json({ error: "Failed to list assets." });
  }
});

router.post("/assets", async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = assetSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid asset payload." });
    return;
  }
  try {
    const d = parsed.data;
    const [row] = await db
      .insert(marketingassets)
      .values({
        assetkey: d.assetkey,
        locale: d.locale,
        type: d.type,
        category: d.category ?? "open",
        title: d.title,
        content: d.content ?? null,
        fileurl: d.fileurl ?? null,
        targetsegment: d.targetsegment ?? null,
        campaignid: d.campaignid ?? null,
        status: d.status ?? "draft",
        createdbyid: req.userid ?? null,
      })
      .returning();
    res.status(201).json({ asset: row });
  } catch (err) {
    // Unique (assetkey, locale) violation → 409. Drizzle wraps the pg error, so
    // check the nested cause's code (23505) and fall back to a string match.
    const cause = (err as { cause?: { code?: string } })?.cause;
    const text = err instanceof Error ? err.message : String(err);
    if (
      (err as { code?: string })?.code === "23505" ||
      cause?.code === "23505" ||
      /uq_marketingassets_assetkey_locale|duplicate key|unique constraint/i.test(text)
    ) {
      res.status(409).json({ error: "An asset with this key + locale already exists." });
      return;
    }
    logger.error({ err }, "create asset failed");
    res.status(500).json({ error: "Failed to create asset." });
  }
});

// [SCOPE 066 / T002] BEGIN — AI default-FAQ seed (admin-only, fail-open, throttled)
const faqGenerateSchema = z.object({
  count: z.number().int().min(1).max(25).optional(),
  locale: z.string().min(2).max(35).optional(),
});

router.post("/assets/faq/generate", async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = faqGenerateSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid generate payload." });
    return;
  }
  const throttle = checkThrottle(`faq-generate:${req.userid ?? "anon"}`);
  if (!throttle.ok) {
    res.status(429).json({ error: "Too many requests — try again shortly.", retryAfterMs: throttle.retryAfterMs });
    return;
  }
  try {
    const locale = parsed.data.locale ?? "en-US";
    const items = await generateFaqDefaults(parsed.data.count ?? 12);
    if (!items || items.length === 0) {
      // Fail-open: nothing generated → handled message, nothing saved.
      res.status(502).json({ error: "Couldn't generate FAQs right now. Try again." });
      return;
    }
    // Insert each as a draft FAQ (global, answered). assetkey is unique per locale,
    // so derive a stable-ish slug from the question and de-dupe within the batch.
    const seen = new Set<string>();
    const rows: typeof marketingassets.$inferInsert[] = [];
    for (const it of items) {
      if (!it.question?.trim() || !it.answer?.trim()) continue;
      let key = `faq-${it.question.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100)}`;
      if (!key || key === "faq-") continue;
      while (seen.has(key)) key = `${key}-x`;
      seen.add(key);
      rows.push({
        assetkey: key,
        locale,
        type: "page",
        category: "faq",
        title: it.question.trim(),
        content: it.answer.trim(),
        status: "draft",
        createdbyid: req.userid ?? null,
      });
    }
    if (rows.length === 0) {
      res.status(502).json({ error: "Couldn't generate usable FAQs. Try again." });
      return;
    }
    // onConflictDoNothing: re-seeding skips FAQs whose (assetkey, locale) already exists.
    const inserted = await db
      .insert(marketingassets)
      .values(rows)
      .onConflictDoNothing({ target: [marketingassets.assetkey, marketingassets.locale] })
      .returning();
    res.status(201).json({ created: inserted.length, assets: inserted });
  } catch (err) {
    logger.error({ err }, "faq generate failed");
    res.status(500).json({ error: "Failed to generate FAQs." });
  }
});
// [SCOPE 066 / T002] END

router.get("/assets/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [row] = await db
      .select()
      .from(marketingassets)
      .where(eq(marketingassets.id, req.params.id));
    if (!row) {
      res.status(404).json({ error: "Asset not found." });
      return;
    }
    res.json({ asset: row });
  } catch (err) {
    logger.error({ err }, "get asset failed");
    res.status(500).json({ error: "Failed to load asset." });
  }
});

router.patch("/assets/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = assetSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid asset payload." });
    return;
  }
  try {
    const d = parsed.data;
    const [row] = await db
      .update(marketingassets)
      .set({ ...d, updatedat: new Date() })
      .where(eq(marketingassets.id, req.params.id))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Asset not found." });
      return;
    }
    res.json({ asset: row });
  } catch (err) {
    logger.error({ err }, "update asset failed");
    res.status(500).json({ error: "Failed to update asset." });
  }
});

// [SCOPE 066 / T002] BEGIN — delete an asset (FAQ / spam question removal)
router.delete("/assets/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [row] = await db
      .delete(marketingassets)
      .where(eq(marketingassets.id, req.params.id))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Asset not found." });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "delete asset failed");
    res.status(500).json({ error: "Failed to delete asset." });
  }
});
// [SCOPE 066 / T002] END

const uploadUrlSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(120),
  contentLength: z.number().int().positive(),
});

// Issue a short-TTL presigned PUT so the client uploads the binary directly to S3.
router.post("/assets/:id/upload-url", async (req: AuthRequest, res: Response): Promise<void> => {
  if (!marketingAssetsConfigured()) {
    res.status(503).json({ error: "Asset storage is not configured on this server." });
    return;
  }
  const parsed = uploadUrlSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "filename, contentType, contentLength required." });
    return;
  }
  try {
    const result = await presignAssetUpload({
      assetId: String(req.params.id),
      filename: parsed.data.filename,
      contentType: parsed.data.contentType,
      contentLength: parsed.data.contentLength,
    });
    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "presign failed";
    logger.error({ err }, "presign asset upload failed");
    res.status(400).json({ error: msg });
  }
});
// [SCOPE 048 / T004] END

// [SCOPE 048 / T005] BEGIN — Campaign posts API (+ content calendar scheduledat)
const postSchema = z.object({
  campaignid: z.string().uuid(),
  assetid: z.string().uuid().optional(),
  channel: z.enum(["facebook", "x", "linkedin", "forum", "youtube", "blog"]),
  content: z.string().max(20000).optional(), // [SCOPE 065 / T009] post copy
  locale: z.string().min(2).max(35),
  status: z.enum(["draft", "scheduled", "published"]).optional(),
  scheduledat: z.string().datetime().optional(),
  liveurl: z.string().max(1000).optional(),
});

router.get("/campaigns/:id/posts", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const rows = await db
      .select()
      .from(campaignposts)
      .where(eq(campaignposts.campaignid, req.params.id))
      .orderBy(asc(campaignposts.scheduledat));
    res.json({ posts: rows });
  } catch (err) {
    logger.error({ err }, "list campaign posts failed");
    res.status(500).json({ error: "Failed to list posts." });
  }
});

// Flat list for the calendar/board across all campaigns (optional ?status filter).
router.get("/posts", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { status } = req.query;
    const rows = await db
      .select()
      .from(campaignposts)
      .where(typeof status === "string" ? eq(campaignposts.status, status) : undefined)
      .orderBy(asc(campaignposts.scheduledat));
    res.json({ posts: rows });
  } catch (err) {
    logger.error({ err }, "list posts failed");
    res.status(500).json({ error: "Failed to list posts." });
  }
});

router.post("/posts", async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = postSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid post payload." });
    return;
  }
  try {
    const d = parsed.data;
    const [row] = await db
      .insert(campaignposts)
      .values({
        campaignid: d.campaignid,
        assetid: d.assetid ?? null,
        channel: d.channel,
        content: d.content ?? null,
        locale: d.locale,
        status: d.status ?? "draft",
        scheduledat: d.scheduledat ? new Date(d.scheduledat) : null,
        liveurl: d.liveurl ?? null,
        createdbyid: req.userid ?? null,
      })
      .returning();
    res.status(201).json({ post: row });
  } catch (err) {
    logger.error({ err }, "create post failed");
    res.status(500).json({ error: "Failed to create post." });
  }
});

router.get("/posts/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [row] = await db
      .select()
      .from(campaignposts)
      .where(eq(campaignposts.id, req.params.id));
    if (!row) {
      res.status(404).json({ error: "Post not found." });
      return;
    }
    res.json({ post: row });
  } catch (err) {
    logger.error({ err }, "get post failed");
    res.status(500).json({ error: "Failed to load post." });
  }
});

router.patch("/posts/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = postSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid post payload." });
    return;
  }
  try {
    const d = parsed.data;
    // Publishing is manual: when status flips to published, stamp publishedat.
    const publishing = d.status === "published";
    const [row] = await db
      .update(campaignposts)
      .set({
        ...(d.campaignid !== undefined ? { campaignid: d.campaignid } : {}),
        ...(d.assetid !== undefined ? { assetid: d.assetid } : {}),
        ...(d.channel !== undefined ? { channel: d.channel } : {}),
        ...(d.content !== undefined ? { content: d.content } : {}),
        ...(d.locale !== undefined ? { locale: d.locale } : {}),
        ...(d.status !== undefined ? { status: d.status } : {}),
        ...(d.scheduledat !== undefined ? { scheduledat: d.scheduledat ? new Date(d.scheduledat) : null } : {}),
        ...(d.liveurl !== undefined ? { liveurl: d.liveurl } : {}),
        ...(publishing ? { publishedat: new Date() } : {}),
        updatedat: new Date(),
      })
      .where(eq(campaignposts.id, req.params.id))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Post not found." });
      return;
    }
    res.json({ post: row });
  } catch (err) {
    logger.error({ err }, "update post failed");
    res.status(500).json({ error: "Failed to update post." });
  }
});
// [SCOPE 048 / T005] END

export default router;
