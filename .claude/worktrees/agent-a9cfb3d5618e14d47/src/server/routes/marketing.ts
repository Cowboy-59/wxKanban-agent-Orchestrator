/**
 * Marketing — Public Lead Capture (spec 046)
 *
 * Unauthenticated, CORS-allowlisted, rate-limited public endpoint that the
 * marketing sites (windev.wxperts.com, wxperts.com) post signups to. The DB row
 * is the source of truth; the new-lead notification is best-effort and never
 * blocks or fails the capture.
 */

import { Router, Request, Response, NextFunction } from "express";
import cors from "cors";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { db, client } from "../db/client.js";
import { marketingleads } from "../../db/schema/marketingleads.js";
import { campaigns } from "../../db/schema/campaigns.js";
import { marketingbanners } from "../../db/schema/marketingbanners.js";
import { marketinglinks } from "../../db/schema/marketinglinks.js";
import { buildRedirectUrl } from "../lib/marketing-links.js";
import { sendNewLeadNotification } from "../services/MarketingLeadNotificationService.js";
import {
  verifyUnsubscribe,
  verifyUserUnsubscribe,
  type NewsletterCategory,
} from "../lib/newsletter-unsubscribe.js";
import { marketingString } from "../lib/marketing-i18n.js";
import { createLogger } from "../lib/logger.js";

const logger = createLogger("marketing-routes");
const router = Router();

// [SCOPE 046 / T002] BEGIN — Public POST /api/marketing/leads capture endpoint

// CORS allowlist — only the configured marketing-site origins, no wildcard
// (spec 046 FR-005). Set MARKETING_SITE_ORIGINS as a comma-separated list;
// defaults to the two known properties. Public capture carries no credentials.
const allowlist = (
  process.env.MARKETING_SITE_ORIGINS ??
  "https://windev.wxperts.com,https://wxperts.com"
)
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const marketingCors = cors({
  origin(origin, callback) {
    // Allow no-origin (server-to-server / curl) and allowlisted origins only.
    if (!origin || allowlist.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Origin not allowed"));
    }
  },
  credentials: false,
  methods: ["POST", "OPTIONS"],
});

// Simple in-memory per-IP rate limiter (spec 046 FR-006). No new dependency;
// fixed-window. Tune via MARKETING_RATELIMIT_MAX / MARKETING_RATELIMIT_WINDOW_MS.
const RATE_MAX = Number(process.env.MARKETING_RATELIMIT_MAX ?? 10);
const RATE_WINDOW_MS = Number(process.env.MARKETING_RATELIMIT_WINDOW_MS ?? 60_000);
const hits = new Map<string, { count: number; windowStart: number }>();

function rateLimit(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
    hits.set(ip, { count: 1, windowStart: now });
    next();
    return;
  }
  entry.count += 1;
  if (entry.count > RATE_MAX) {
    res.status(429).json({ error: "Too many requests. Please try again shortly." });
    return;
  }
  next();
}

// Notification is best-effort and bounded: we await it with a short timeout so it
// actually runs on App Runner (which CPU-throttles after the response, killing
// true fire-and-forget — spec 043 lesson) while never failing or stalling the
// capture. A timeout/failure leaves notifystatus for later retry.
const NOTIFY_TIMEOUT_MS = 3_000;
function notifyBestEffort(row: typeof marketingleads.$inferSelect): Promise<void> {
  return Promise.race([
    sendNewLeadNotification(row).then(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, NOTIFY_TIMEOUT_MS)),
  ]).catch((err) => {
    logger.error({ err, leadid: row.id }, "notifyBestEffort swallow");
  });
}

const captureSchema = z.object({
  email: z.string().email(),
  name: z.string().max(255).optional(),
  sourceproperty: z.enum(["windev", "wxperts"]),
  campaign: z.string().uuid().optional(), // campaign id (optional)
  locale: z.string().min(2).max(35),
  company: z.string().max(255).optional(),
  platformfrom: z.string().max(100).optional(),
  // Honeypot — accept any value at the schema level so a filled honeypot still
  // parses; the handler then silently rejects it (success-shaped) so a bot can't
  // distinguish it from a real submit. Validating max(0) here would leak a 400.
  website: z.string().optional(),
});

// Derive the audience segment server-side (FR-003). Client never asserts segment.
// windev source → windev; wxperts source → careerchanger (Phase-1 default).
// A provided campaign's segment overrides the source default.
function deriveSegment(
  sourceproperty: "windev" | "wxperts",
  campaignSegment?: string | null,
): string {
  if (campaignSegment) return campaignSegment;
  return sourceproperty === "windev" ? "windev" : "careerchanger";
}

router.options("/leads", marketingCors);
router.post(
  "/leads",
  marketingCors,
  rateLimit,
  async (req: Request, res: Response): Promise<void> => {
    // Read locale early so even validation errors are locale-keyed (FR-016).
    const reqLocale =
      typeof req.body?.locale === "string" ? req.body.locale : undefined;

    const parsed = captureSchema.safeParse(req.body);
    if (!parsed.success) {
      const emailIssue = parsed.error.issues.some((i) => i.path[0] === "email");
      res.status(400).json({
        error: emailIssue
          ? marketingString("invalidEmail", reqLocale)
          : marketingString("missingFields", reqLocale),
      });
      return;
    }

    const data = parsed.data;

    // Honeypot filled → treat as a bot. Return a success-shaped response so the
    // bot can't distinguish, but persist nothing and never notify (FR-006).
    if (data.website && data.website.length > 0) {
      logger.warn({ ip: req.ip }, "marketing capture honeypot tripped");
      res
        .status(200)
        .json({ ok: true, message: marketingString("captureSuccess", data.locale) });
      return;
    }

    try {
      // Resolve campaign (optional) for attribution + segment override.
      let campaignid: string | null = null;
      let campaignSegment: string | null = null;
      if (data.campaign) {
        const [c] = await db
          .select({ id: campaigns.id, segment: campaigns.segment })
          .from(campaigns)
          .where(eq(campaigns.id, data.campaign));
        if (c) {
          campaignid = c.id;
          campaignSegment = c.segment;
        }
      }

      const segment = deriveSegment(data.sourceproperty, campaignSegment);
      const marketingCompanyId = process.env.MARKETING_COMPANY_ID?.trim() || null;

      // Persist the lead FIRST — source of truth (FR-004).
      const [row] = await db
        .insert(marketingleads)
        .values({
          companyid: marketingCompanyId,
          email: data.email,
          name: data.name ?? null,
          sourceproperty: data.sourceproperty,
          campaignid,
          segment,
          locale: data.locale,
          company: data.company ?? null,
          platformfrom: data.platformfrom ?? null,
        })
        .returning();

      // Respond before/independent of notification result (FR-007), but bounded
      // so the leg actually fires on App Runner.
      await notifyBestEffort(row);

      res.status(200).json({
        ok: true,
        reference: row.id.slice(0, 8),
        message: marketingString("captureSuccess", data.locale),
      });
    } catch (err) {
      logger.error({ err }, "marketing lead capture failed");
      res.status(500).json({ error: marketingString("rejected", reqLocale) });
    }
  },
);
// [SCOPE 046 / T002] END

// [SCOPE 064 / T007] BEGIN — public HMAC-verified newsletter unsubscribe
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function unsubscribePage(message: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribe</title></head>
<body style="font-family:Arial,Helvetica,sans-serif;color:#1e293b;max-width:560px;margin:48px auto;padding:0 16px;line-height:1.5">
<h2>wxperts newsletter</h2><p>${message}</p></body></html>`;
}

// GET /api/marketing/newsletter/unsubscribe?u=<id>&sig=<hmac> — unauthenticated.
//   Marketing contact:  ?u=<contactid>&sig=…            (t omitted → "contact")
//   Registered user:    ?t=user&u=<userid>&c=<updates|promos>&sig=…   [Amendment A]
router.get(
  "/newsletter/unsubscribe",
  async (req: Request, res: Response): Promise<void> => {
    const u = typeof req.query.u === "string" ? req.query.u : "";
    const sig = typeof req.query.sig === "string" ? req.query.sig : "";
    const t = typeof req.query.t === "string" ? req.query.t : "contact";

    // [SCOPE 064 / T010] BEGIN — Amendment A: registered-user (per-category) unsubscribe
    if (t === "user") {
      const c = typeof req.query.c === "string" ? req.query.c : "";
      const category = c === "promos" ? "promos" : c === "updates" ? "updates" : null;
      if (!UUID_RE.test(u) || !category || !verifyUserUnsubscribe(u, category as NewsletterCategory, sig)) {
        res.status(400).send(unsubscribePage("This unsubscribe link is invalid or has expired."));
        return;
      }
      try {
        const col = category === "promos" ? "promosunsubscribedat" : "updatesunsubscribedat";
        // col is a fixed literal (not user input); safe to interpolate via client.unsafe-free path.
        if (category === "promos") {
          await client`update userprofiles set promosunsubscribedat = now() where id = ${u} and promosunsubscribedat is null`;
        } else {
          await client`update userprofiles set updatesunsubscribedat = now() where id = ${u} and updatesunsubscribedat is null`;
        }
        logger.info({ userid: u, col }, "registered-user newsletter unsubscribe");
        res
          .status(200)
          .send(
            unsubscribePage(
              category === "promos"
                ? "You've been unsubscribed from offers &amp; promotions. You'll still receive important product updates."
                : "You've been unsubscribed from product updates.",
            ),
          );
      } catch (err) {
        logger.error({ err }, "user newsletter unsubscribe failed");
        res
          .status(500)
          .send(unsubscribePage("Something went wrong. Email andy@wxperts.com to unsubscribe."));
      }
      return;
    }
    // [SCOPE 064 / T010] END

    if (!UUID_RE.test(u) || !verifyUnsubscribe(u, sig)) {
      res.status(400).send(unsubscribePage("This unsubscribe link is invalid or has expired."));
      return;
    }
    try {
      await client`update marketingcontacts set unsubscribedat = now() where id = ${u} and unsubscribedat is null`;
      res
        .status(200)
        .send(unsubscribePage("You've been unsubscribed and won't receive further newsletters."));
    } catch (err) {
      logger.error({ err }, "newsletter unsubscribe failed");
      res
        .status(500)
        .send(unsubscribePage("Something went wrong. Email andy@wxperts.com to unsubscribe."));
    }
  },
);
// [SCOPE 064 / T007] END

// [SCOPE 070 / T002] BEGIN — SPEC-069 public published-banner read (on-site embed)
// CORS-allowlisted GET so the marketing sites can fetch active banners by segment/slot.
// Returns only published, rendered banners with whitelisted fields — no prompts/admin data.
const bannerReadCors = cors({
  origin(origin, callback) {
    if (!origin || allowlist.includes(origin)) callback(null, true);
    else callback(new Error("Origin not allowed"));
  },
  credentials: false,
  methods: ["GET", "OPTIONS"],
});

router.options("/banners", bannerReadCors);
router.get(
  "/banners",
  bannerReadCors,
  rateLimit,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { segment, slot } = req.query;
      const conds = [eq(marketingbanners.status, "published")];
      if (typeof segment === "string")
        conds.push(eq(marketingbanners.targetsegment, segment));
      if (typeof slot === "string")
        conds.push(eq(marketingbanners.slot, slot));

      const rows = await db
        .select({
          id: marketingbanners.id,
          renderedurl: marketingbanners.renderedurl,
          width: marketingbanners.width,
          height: marketingbanners.height,
          slot: marketingbanners.slot,
          code: marketinglinks.code,
        })
        .from(marketingbanners)
        .leftJoin(
          marketinglinks,
          eq(marketingbanners.linkid, marketinglinks.id),
        )
        .where(and(...conds))
        .orderBy(desc(marketingbanners.updatedat));

      const banners = rows
        .filter((r) => r.renderedurl)
        .map((r) => ({
          id: r.id,
          imageUrl: r.renderedurl,
          redirectUrl: r.code ? buildRedirectUrl(r.code) : null,
          width: r.width,
          height: r.height,
          slot: r.slot,
        }));
      res.json({ banners });
    } catch (err) {
      logger.error({ err }, "public banner read failed");
      res.status(500).json({ error: "Failed to load banners." });
    }
  },
);
// [SCOPE 070 / T002] END

export default router;
