/**
 * Banner Studio — SysAdmin admin API (SCOPE-070 / SPEC-067)
 *
 * Create/list/edit/delete promotional banners, generate an AI background, and render
 * the brand overlay to a PNG. Each banner is backed by a tracked marketinglinks row
 * (the /r/:code redirect + click counting live in SPEC-068). All routes require SYSADMIN.
 */

import { Router, Response } from "express";
import { z } from "zod";
import { and, desc, eq, type SQL } from "drizzle-orm";
import { authenticateToken, AuthRequest } from "../middleware/auth.js";
import { requireSysAdmin } from "../middleware/requireSysAdmin.js";
import { db } from "../db/client.js";
import { marketingbanners } from "../../db/schema/marketingbanners.js";
import { marketinglinks } from "../../db/schema/marketinglinks.js";
import { getBannerPreset } from "../lib/banner-brand.js";
import {
  generateLinkCode,
  isAllowedDestinationHost,
  buildRedirectUrl,
} from "../lib/marketing-links.js";
import { generateImage, editImage } from "../ai/image-provider.js";
import { BannerRenderService } from "../services/BannerRenderService.js";
import {
  putBannerObject,
  bannerObjectKey,
  marketingAssetsConfigured,
  presignBannerBackgroundUpload,
  publicUrlForKey,
} from "../lib/marketing-assets-s3.js";
import { checkThrottle } from "../services/MarketingAIService.js";
import { createLogger } from "../lib/logger.js";

const logger = createLogger("marketing-banners-routes");
const router = Router();

router.use(authenticateToken);
router.use(requireSysAdmin);

// [SCOPE 070 / T005] BEGIN — Banner Studio admin API (CRUD + generate-bg + render)

const SIZE_PRESETS = [
  "og",
  "mrec",
  "leaderboard",
  "skyscraper",
  "halfpage",
  "mobile",
] as const;
const SEGMENTS = ["windev", "careerchanger", "broad"] as const;

// [SCOPE 070 / Amendment-B] v2 rich-overlay fields shared by create + update.
const headlineSegmentSchema = z.object({
  text: z.string().max(255),
  accent: z.boolean().optional(),
});
const overlayFields = {
  eyebrow: z.string().max(255).optional(),
  headlinesegments: z.array(headlineSegmentSchema).max(8).optional(),
  badge: z.string().max(120).optional(),
  bulletslabel: z.string().max(120).optional(),
  bullets: z.array(z.string().max(200)).max(12).optional(),
  ctaurl: z.string().max(200).optional(),
  overlayanchor: z.string().max(20).optional(),
  // [SCOPE 070 / Amendment-D] per-element drag/resize overrides; null clears → auto layout.
  // [SCOPE 070 / Amendment-F] hidden:true deletes an element (e.g. the logo) from the render.
  overlaylayout: z
    .record(
      z.string(),
      z.object({
        x: z.number(),
        y: z.number(),
        scale: z.number(),
        hidden: z.boolean().optional(),
      }),
    )
    .nullable()
    .optional(),
};

const bannerCreateSchema = z.object({
  title: z.string().min(1).max(255),
  sizepreset: z.enum(SIZE_PRESETS),
  prompt: z.string().max(4000).optional(),
  headline: z.string().max(255).optional(),
  subhead: z.string().max(500).optional(),
  ctatext: z.string().max(80).optional(),
  ...overlayFields,
  destinationurl: z.string().url().max(1000),
  campaignid: z.string().uuid().optional(),
  targetsegment: z.enum(SEGMENTS).optional(),
  slot: z.string().max(40).optional(),
  brandtokens: z.record(z.string(), z.unknown()).optional(),
  utmsource: z.string().max(80).optional(),
  utmmedium: z.string().max(80).optional(),
  utmcampaign: z.string().max(120).optional(),
});

const bannerUpdateSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  sizepreset: z.enum(SIZE_PRESETS).optional(),
  prompt: z.string().max(4000).optional(),
  headline: z.string().max(255).optional(),
  subhead: z.string().max(500).optional(),
  ctatext: z.string().max(80).optional(),
  ...overlayFields,
  destinationurl: z.string().url().max(1000).optional(),
  campaignid: z.string().uuid().optional(),
  targetsegment: z.enum(SEGMENTS).optional(),
  slot: z.string().max(40).optional(),
  brandtokens: z.record(z.string(), z.unknown()).optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
});

/** GET /api/sysadmin/marketing/banners — list banners (with the linked clickcount + code). */
router.get("/", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { status, campaignid, segment, sizepreset } = req.query;
    const conds: SQL[] = [];
    if (typeof status === "string")
      conds.push(eq(marketingbanners.status, status));
    if (typeof campaignid === "string")
      conds.push(eq(marketingbanners.campaignid, campaignid));
    if (typeof segment === "string")
      conds.push(eq(marketingbanners.targetsegment, segment));
    if (typeof sizepreset === "string")
      conds.push(eq(marketingbanners.sizepreset, sizepreset));

    const rows = await db
      .select({
        banner: marketingbanners,
        clickcount: marketinglinks.clickcount,
        code: marketinglinks.code,
      })
      .from(marketingbanners)
      .leftJoin(
        marketinglinks,
        eq(marketingbanners.linkid, marketinglinks.id),
      )
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(marketingbanners.updatedat));

    res.json({
      banners: rows.map((r) => ({
        ...r.banner,
        clickcount: r.clickcount ?? 0,
        code: r.code ?? null,
      })),
    });
  } catch (err) {
    logger.error({ err }, "list banners failed");
    res.status(500).json({ error: "Failed to list banners." });
  }
});

/** POST /api/sysadmin/marketing/banners — create a draft + its tracked link. */
router.post("/", async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = bannerCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid banner payload." });
    return;
  }
  const d = parsed.data;
  if (!isAllowedDestinationHost(d.destinationurl)) {
    res
      .status(400)
      .json({ error: "Destination URL host is not allowed." });
    return;
  }
  const preset = getBannerPreset(d.sizepreset);
  if (!preset) {
    res.status(400).json({ error: "Unknown size preset." });
    return;
  }
  try {
    // Create the tracked link first (the banner references it). Retry on the
    // astronomically-unlikely code collision.
    let link: typeof marketinglinks.$inferSelect | undefined;
    for (let attempt = 0; attempt < 3 && !link; attempt++) {
      try {
        [link] = await db
          .insert(marketinglinks)
          .values({
            companyid: req.companyid ?? null,
            campaignid: d.campaignid ?? null,
            code: generateLinkCode(),
            destinationurl: d.destinationurl,
            utmsource: d.utmsource ?? null,
            utmmedium: d.utmmedium ?? null,
            utmcampaign: d.utmcampaign ?? null,
            createdbyid: req.userid ?? null,
          })
          .returning();
      } catch (e) {
        if ((e as { cause?: { code?: string } })?.cause?.code === "23505")
          continue; // code collision — retry
        throw e;
      }
    }
    if (!link) {
      res.status(500).json({ error: "Failed to allocate a tracked link." });
      return;
    }

    const [banner] = await db
      .insert(marketingbanners)
      .values({
        companyid: req.companyid ?? null,
        campaignid: d.campaignid ?? null,
        linkid: link.id,
        title: d.title,
        sizepreset: d.sizepreset,
        width: preset.width,
        height: preset.height,
        layout: preset.layout,
        prompt: d.prompt ?? null,
        headline: d.headline ?? null,
        subhead: d.subhead ?? null,
        ctatext: d.ctatext ?? null,
        eyebrow: d.eyebrow ?? null,
        headlinesegments: d.headlinesegments ?? null,
        badge: d.badge ?? null,
        bulletslabel: d.bulletslabel ?? null,
        bullets: d.bullets ?? null,
        ctaurl: d.ctaurl ?? null,
        overlayanchor: d.overlayanchor ?? null,
        overlaylayout: d.overlaylayout ?? null,
        brandtokens: d.brandtokens ?? null,
        frames: [],
        bgversions: [],
        status: "draft",
        targetsegment: d.targetsegment ?? null,
        slot: d.slot ?? null,
        createdbyid: req.userid ?? null,
      })
      .returning();

    res.status(201).json({ banner, link });
  } catch (err) {
    logger.error({ err }, "create banner failed");
    res.status(500).json({ error: "Failed to create banner." });
  }
});

/** GET /api/sysadmin/marketing/banners/:id — banner detail + its link. */
router.get("/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [banner] = await db
      .select()
      .from(marketingbanners)
      .where(eq(marketingbanners.id, req.params.id));
    if (!banner) {
      res.status(404).json({ error: "Banner not found." });
      return;
    }
    let link: typeof marketinglinks.$inferSelect | null = null;
    if (banner.linkid) {
      [link] = await db
        .select()
        .from(marketinglinks)
        .where(eq(marketinglinks.id, banner.linkid));
    }
    res.json({ banner, link: link ?? null });
  } catch (err) {
    logger.error({ err }, "get banner failed");
    res.status(500).json({ error: "Failed to load banner." });
  }
});

/** PATCH /api/sysadmin/marketing/banners/:id — update fields (and the linked destination). */
router.patch("/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = bannerUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid banner payload." });
    return;
  }
  const d = parsed.data;
  if (d.destinationurl !== undefined && !isAllowedDestinationHost(d.destinationurl)) {
    res.status(400).json({ error: "Destination URL host is not allowed." });
    return;
  }
  try {
    const [existing] = await db
      .select()
      .from(marketingbanners)
      .where(eq(marketingbanners.id, req.params.id));
    if (!existing) {
      res.status(404).json({ error: "Banner not found." });
      return;
    }

    // Re-freeze width/height/layout if the preset changes (only meaningful pre-render).
    const presetPatch =
      d.sizepreset !== undefined
        ? (() => {
            const p = getBannerPreset(d.sizepreset!);
            return p
              ? { width: p.width, height: p.height, layout: p.layout }
              : {};
          })()
        : {};

    const [banner] = await db
      .update(marketingbanners)
      .set({
        ...(d.title !== undefined ? { title: d.title } : {}),
        ...(d.sizepreset !== undefined ? { sizepreset: d.sizepreset } : {}),
        ...presetPatch,
        ...(d.prompt !== undefined ? { prompt: d.prompt } : {}),
        ...(d.headline !== undefined ? { headline: d.headline } : {}),
        ...(d.subhead !== undefined ? { subhead: d.subhead } : {}),
        ...(d.ctatext !== undefined ? { ctatext: d.ctatext } : {}),
        ...(d.eyebrow !== undefined ? { eyebrow: d.eyebrow } : {}),
        ...(d.headlinesegments !== undefined
          ? { headlinesegments: d.headlinesegments }
          : {}),
        ...(d.badge !== undefined ? { badge: d.badge } : {}),
        ...(d.bulletslabel !== undefined ? { bulletslabel: d.bulletslabel } : {}),
        ...(d.bullets !== undefined ? { bullets: d.bullets } : {}),
        ...(d.ctaurl !== undefined ? { ctaurl: d.ctaurl } : {}),
        ...(d.overlayanchor !== undefined
          ? { overlayanchor: d.overlayanchor }
          : {}),
        ...(d.overlaylayout !== undefined
          ? { overlaylayout: d.overlaylayout }
          : {}),
        ...(d.brandtokens !== undefined ? { brandtokens: d.brandtokens } : {}),
        ...(d.campaignid !== undefined ? { campaignid: d.campaignid } : {}),
        ...(d.targetsegment !== undefined
          ? { targetsegment: d.targetsegment }
          : {}),
        ...(d.slot !== undefined ? { slot: d.slot } : {}),
        ...(d.status !== undefined ? { status: d.status } : {}),
        updatedat: new Date(),
      })
      .where(eq(marketingbanners.id, req.params.id))
      .returning();

    // Push destination/UTM changes onto the linked tracked link.
    if (
      existing.linkid &&
      (d.destinationurl !== undefined || d.campaignid !== undefined)
    ) {
      await db
        .update(marketinglinks)
        .set({
          ...(d.destinationurl !== undefined
            ? { destinationurl: d.destinationurl }
            : {}),
          ...(d.campaignid !== undefined ? { campaignid: d.campaignid } : {}),
          updatedat: new Date(),
        })
        .where(eq(marketinglinks.id, existing.linkid));
    }

    res.json({ banner });
  } catch (err) {
    logger.error({ err }, "update banner failed");
    res.status(500).json({ error: "Failed to update banner." });
  }
});

/** DELETE /api/sysadmin/marketing/banners/:id — delete the banner (the link is left intact). */
router.delete("/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [row] = await db
      .delete(marketingbanners)
      .where(eq(marketingbanners.id, req.params.id))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Banner not found." });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "delete banner failed");
    res.status(500).json({ error: "Failed to delete banner." });
  }
});

/** POST /api/sysadmin/marketing/banners/:id/generate-bg — AI background (throttled, fail-open). */
router.post(
  "/:id/generate-bg",
  async (req: AuthRequest, res: Response): Promise<void> => {
    const t = checkThrottle(`banner-genbg:${req.userid ?? "anon"}`);
    if (!t.ok) {
      res.status(429).json({
        error: "Too many requests — slow down.",
        retryAfterMs: t.retryAfterMs,
      });
      return;
    }
    if (!marketingAssetsConfigured()) {
      res.status(503).json({ error: "Asset storage is not configured." });
      return;
    }
    try {
      const [banner] = await db
        .select()
        .from(marketingbanners)
        .where(eq(marketingbanners.id, req.params.id));
      if (!banner) {
        res.status(404).json({ error: "Banner not found." });
        return;
      }
      const img = await generateImage(banner.prompt ?? banner.title, {
        width: banner.width,
        height: banner.height,
      });
      if (!img) {
        // fail-open: a provider error / content-filter refusal is a handled result.
        res.status(502).json({
          error: "Could not generate a background. Try again or adjust the prompt.",
        });
        return;
      }
      const key = bannerObjectKey(
        banner.id,
        `bg-${Date.now().toString(36)}.png`,
      );
      const url = await putBannerObject({
        key,
        body: img.bytes,
        contentType: img.contentType || "image/png",
      });
      const versions = Array.isArray(banner.bgversions)
        ? (banner.bgversions as unknown[])
        : [];
      const [updated] = await db
        .update(marketingbanners)
        .set({
          backgroundurl: url,
          bgversions: [
            ...versions,
            { url, kind: "generate", createdat: new Date().toISOString() },
          ],
          updatedat: new Date(),
        })
        .where(eq(marketingbanners.id, banner.id))
        .returning();
      res.json({ banner: updated });
    } catch (err) {
      logger.error({ err }, "generate-bg failed");
      res.status(500).json({ error: "Background generation failed." });
    }
  },
);

/** POST /api/sysadmin/marketing/banners/:id/render — composite overlay → versioned PNG. */
router.post(
  "/:id/render",
  async (req: AuthRequest, res: Response): Promise<void> => {
    if (!marketingAssetsConfigured()) {
      res.status(503).json({ error: "Asset storage is not configured." });
      return;
    }
    try {
      const [banner] = await db
        .select()
        .from(marketingbanners)
        .where(eq(marketingbanners.id, req.params.id));
      if (!banner) {
        res.status(404).json({ error: "Banner not found." });
        return;
      }
      const png = await BannerRenderService.render({
        sizepreset: banner.sizepreset,
        width: banner.width,
        height: banner.height,
        layout: banner.layout as "hero" | "horizontal" | "vertical",
        backgroundUrl: banner.backgroundurl,
        headline: banner.headline,
        subhead: banner.subhead,
        ctatext: banner.ctatext,
        eyebrow: banner.eyebrow,
        headlinesegments:
          (banner.headlinesegments as
            | { text: string; accent?: boolean }[]
            | null) ?? null,
        badge: banner.badge,
        bulletslabel: banner.bulletslabel,
        bullets: (banner.bullets as string[] | null) ?? null,
        ctaurl: banner.ctaurl,
        overlayanchor: banner.overlayanchor,
        overlaylayout:
          (banner.overlaylayout as Record<
            string,
            { x: number; y: number; scale: number }
          > | null) ?? null,
        brandtokens:
          (banner.brandtokens as Record<string, string> | null) ?? null,
      });
      const key = bannerObjectKey(
        banner.id,
        `render-${Date.now().toString(36)}.png`,
      );
      const url = await putBannerObject({
        key,
        body: png,
        contentType: "image/png",
      });
      const [updated] = await db
        .update(marketingbanners)
        .set({ renderedurl: url, updatedat: new Date() })
        .where(eq(marketingbanners.id, banner.id))
        .returning();
      res.json({ banner: updated });
    } catch (err) {
      logger.error({ err }, "render failed");
      res.status(500).json({ error: "Banner render failed." });
    }
  },
);

// [SCOPE 070 / Amendment-B] BEGIN — directable AI background edit + version select

/** POST /api/sysadmin/marketing/banners/:id/edit-bg — in-place AI edit of the current background. */
router.post(
  "/:id/edit-bg",
  async (req: AuthRequest, res: Response): Promise<void> => {
    const parsed = z
      .object({ instruction: z.string().min(1).max(2000) })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "An edit instruction is required." });
      return;
    }
    const t = checkThrottle(`banner-editbg:${req.userid ?? "anon"}`);
    if (!t.ok) {
      res.status(429).json({
        error: "Too many requests — slow down.",
        retryAfterMs: t.retryAfterMs,
      });
      return;
    }
    if (!marketingAssetsConfigured()) {
      res.status(503).json({ error: "Asset storage is not configured." });
      return;
    }
    try {
      const [banner] = await db
        .select()
        .from(marketingbanners)
        .where(eq(marketingbanners.id, req.params.id));
      if (!banner) {
        res.status(404).json({ error: "Banner not found." });
        return;
      }
      if (!banner.backgroundurl) {
        res.status(409).json({
          error: "Generate a background first — an edit needs an image to work from.",
        });
        return;
      }
      // Pull the current background bytes (public CloudFront/S3 URL) to feed the editor.
      const srcRes = await fetch(banner.backgroundurl);
      if (!srcRes.ok) {
        res.status(502).json({ error: "Could not load the current background." });
        return;
      }
      const srcBytes = Buffer.from(await srcRes.arrayBuffer());
      const mimeType = srcRes.headers.get("content-type") || "image/png";

      const img = await editImage(srcBytes, parsed.data.instruction, { mimeType });
      if (!img) {
        // fail-open: a provider error / refusal is a handled result.
        res.status(502).json({
          error: "Could not edit the background. Try a different instruction.",
        });
        return;
      }
      const key = bannerObjectKey(
        banner.id,
        `bg-edit-${Date.now().toString(36)}.png`,
      );
      const url = await putBannerObject({
        key,
        body: img.bytes,
        contentType: img.contentType || "image/png",
      });
      const versions = Array.isArray(banner.bgversions)
        ? (banner.bgversions as unknown[])
        : [];
      const [updated] = await db
        .update(marketingbanners)
        .set({
          backgroundurl: url,
          bgversions: [
            ...versions,
            {
              url,
              kind: "edit",
              instruction: parsed.data.instruction,
              createdat: new Date().toISOString(),
            },
          ],
          updatedat: new Date(),
        })
        .where(eq(marketingbanners.id, banner.id))
        .returning();
      res.json({ banner: updated });
    } catch (err) {
      logger.error({ err }, "edit-bg failed");
      res.status(500).json({ error: "Background edit failed." });
    }
  },
);

/** POST /api/sysadmin/marketing/banners/:id/background/select — make a past version active. */
router.post(
  "/:id/background/select",
  async (req: AuthRequest, res: Response): Promise<void> => {
    const parsed = z
      .object({ url: z.string().url().max(1000) })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "A version url is required." });
      return;
    }
    try {
      const [banner] = await db
        .select()
        .from(marketingbanners)
        .where(eq(marketingbanners.id, req.params.id));
      if (!banner) {
        res.status(404).json({ error: "Banner not found." });
        return;
      }
      const versions = Array.isArray(banner.bgversions)
        ? (banner.bgversions as Array<{ url?: string }>)
        : [];
      if (!versions.some((v) => v?.url === parsed.data.url)) {
        res
          .status(400)
          .json({ error: "That url is not one of this banner's versions." });
        return;
      }
      const [updated] = await db
        .update(marketingbanners)
        .set({ backgroundurl: parsed.data.url, updatedat: new Date() })
        .where(eq(marketingbanners.id, banner.id))
        .returning();
      res.json({ banner: updated });
    } catch (err) {
      logger.error({ err }, "background/select failed");
      res.status(500).json({ error: "Could not select that background version." });
    }
  },
);

// [SCOPE 070 / Amendment-B] END

// [SCOPE 070 / Amendment-E] BEGIN — upload a custom background (bring-your-own image)

const bgUploadUrlSchema = z.object({
  filename: z.string().min(1).max(200),
  contentType: z.string().min(1).max(100),
  contentLength: z.number().int().positive(),
});

/**
 * POST /api/sysadmin/marketing/banners/:id/background/upload-url — issue a short-TTL
 * presigned PUT so the browser can upload a custom background straight to S3. Content-type
 * and size are validated up front (image types only); the bytes never transit the API.
 */
router.post(
  "/:id/background/upload-url",
  async (req: AuthRequest, res: Response): Promise<void> => {
    if (!marketingAssetsConfigured()) {
      res.status(503).json({ error: "Asset storage is not configured." });
      return;
    }
    const parsed = bgUploadUrlSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "filename, contentType and contentLength are required." });
      return;
    }
    try {
      const [banner] = await db
        .select()
        .from(marketingbanners)
        .where(eq(marketingbanners.id, req.params.id));
      if (!banner) {
        res.status(404).json({ error: "Banner not found." });
        return;
      }
      const presign = await presignBannerBackgroundUpload({
        bannerId: banner.id,
        filename: parsed.data.filename,
        contentType: parsed.data.contentType,
        contentLength: parsed.data.contentLength,
      });
      res.json({ uploadUrl: presign.uploadUrl, publicUrl: presign.publicUrl });
    } catch (err) {
      // Disallowed type / over-size are user errors → 400 with the validator's message.
      logger.warn({ err }, "background upload-url rejected");
      res.status(400).json({ error: (err as Error).message });
    }
  },
);

const bgUploadCompleteSchema = z.object({ url: z.string().url().max(1000) });

/**
 * POST /api/sysadmin/marketing/banners/:id/background/upload-complete — after the browser
 * PUT succeeds, register the uploaded image as a bgversion and make it the active background.
 * The url MUST live under this banner's own S3 prefix (defense-in-depth — never trust an
 * arbitrary url from the client).
 */
router.post(
  "/:id/background/upload-complete",
  async (req: AuthRequest, res: Response): Promise<void> => {
    const parsed = bgUploadCompleteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "A url is required." });
      return;
    }
    try {
      const [banner] = await db
        .select()
        .from(marketingbanners)
        .where(eq(marketingbanners.id, req.params.id));
      if (!banner) {
        res.status(404).json({ error: "Banner not found." });
        return;
      }
      const prefix = publicUrlForKey(bannerObjectKey(banner.id, ""));
      if (!parsed.data.url.startsWith(prefix)) {
        res.status(400).json({ error: "That url is not in this banner's storage." });
        return;
      }
      const versions = Array.isArray(banner.bgversions)
        ? (banner.bgversions as unknown[])
        : [];
      const [updated] = await db
        .update(marketingbanners)
        .set({
          backgroundurl: parsed.data.url,
          bgversions: [
            ...versions,
            { url: parsed.data.url, kind: "upload", createdat: new Date().toISOString() },
          ],
          updatedat: new Date(),
        })
        .where(eq(marketingbanners.id, banner.id))
        .returning();
      res.json({ banner: updated });
    } catch (err) {
      logger.error({ err }, "background upload-complete failed");
      res.status(500).json({ error: "Could not set the uploaded background." });
    }
  },
);

// [SCOPE 070 / Amendment-E] END

// [SCOPE 070 / T005] END

// [SCOPE 070 / T001] BEGIN — SPEC-069 export bundle (PNG + <a><img> snippet + raw URL + redirect URL)
/** GET /api/sysadmin/marketing/banners/:id/export — everything needed to place the banner. */
router.get(
  "/:id/export",
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const [banner] = await db
        .select()
        .from(marketingbanners)
        .where(eq(marketingbanners.id, req.params.id));
      if (!banner) {
        res.status(404).json({ error: "Banner not found." });
        return;
      }
      if (!banner.renderedurl) {
        res.status(409).json({ error: "Render the banner before exporting." });
        return;
      }
      let code: string | null = null;
      if (banner.linkid) {
        const [link] = await db
          .select({ code: marketinglinks.code })
          .from(marketinglinks)
          .where(eq(marketinglinks.id, banner.linkid));
        code = link?.code ?? null;
      }
      const pngUrl = banner.renderedurl;
      const redirectUrl = code ? buildRedirectUrl(code) : pngUrl;
      const alt = banner.title.replace(/"/g, "'");
      const anchorImgSnippet = `<a href="${redirectUrl}"><img src="${pngUrl}" width="${banner.width}" height="${banner.height}" alt="${alt}" style="border:0"/></a>`;
      res.json({
        pngUrl,
        imgUrl: pngUrl,
        redirectUrl,
        anchorImgSnippet,
        width: banner.width,
        height: banner.height,
      });
    } catch (err) {
      logger.error({ err }, "banner export failed");
      res.status(500).json({ error: "Failed to build export." });
    }
  },
);
// [SCOPE 070 / T001] END

export default router;
