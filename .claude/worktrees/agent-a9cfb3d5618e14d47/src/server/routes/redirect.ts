/**
 * Banner Studio — public tracked redirect (SCOPE-070 / SPEC-068)
 *
 * GET /r/:code — no auth, no CORS (top-level browser navigation, not XHR). Looks the
 * code up, 302s to the stored destination (UTM appended only if absent), and records
 * the click via the batched writer. Open-redirect-proof: the destination is read only
 * from the DB row, never from the URL.
 */

import { Router, Request, Response } from "express";
import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { marketinglinks } from "../../db/schema/marketinglinks.js";
import {
  enqueueClick,
  flushClicks,
} from "../lib/banner-click-writer.js";
import { createLogger } from "../lib/logger.js";

const logger = createLogger("redirect-routes");
const router = Router();

// [SCOPE 070 / T003] BEGIN — click classification + privacy helpers
// Link unfurlers / preview fetchers — stored but counted=false.
const PREVIEW_UAS = [
  "slackbot",
  "facebookexternalhit",
  "twitterbot",
  "linkedinbot",
  "whatsapp",
  "telegrambot",
  "discordbot",
  "skypeuripreview",
  "embedly",
  "redditbot",
  "pinterest",
  "vkshare",
  "applebot",
  "bitlybot",
  "google-structureddata",
  "preview",
];
// Generic automation — stored but counted=false.
const BOT_UAS = [
  "bot",
  "crawler",
  "spider",
  "crawl",
  "curl",
  "wget",
  "python-requests",
  "headlesschrome",
  "phantomjs",
  "scrapy",
  "go-http-client",
  "libwww",
  "monitor",
  "uptime",
];

function classifyUa(ua: string, method: string): "human" | "bot" | "preview" {
  if (method === "HEAD") return "preview"; // prefetch / scanner
  const u = ua.toLowerCase();
  if (!u) return "bot"; // no UA → almost certainly automated
  if (PREVIEW_UAS.some((s) => u.includes(s))) return "preview";
  if (BOT_UAS.some((s) => u.includes(s))) return "bot";
  return "human";
}

function clientIp(req: Request): string {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length) return xff.split(",")[0]!.trim();
  return req.socket.remoteAddress ?? "unknown";
}

/** Salted + truncated IP hash — no raw IP, no PII. IPv4 → /24, IPv6 → /48-ish. */
function hashIp(ip: string): string | null {
  if (!ip || ip === "unknown") return null;
  let truncated = ip;
  if (ip.includes(".")) {
    truncated = ip.split(".").slice(0, 3).join(".") + ".0";
  } else if (ip.includes(":")) {
    truncated = ip.split(":").slice(0, 3).join(":");
  }
  const salt = process.env["IPHASH_SALT"] || "wxkanban-banner-default-salt";
  return createHmac("sha256", salt).update(truncated).digest("hex").slice(0, 64);
}

// Per-IP-hash logging rate limit (protects the click table from a single flooding
// source) + a short same-(iphash,link) dedupe window so a preview+click pair isn't
// double-counted. Both are in-memory and self-bounded.
const LOG_WINDOW_MS = 60_000;
const LOG_MAX = 120;
const DEDUPE_MS = 4000;
const logHits = new Map<string, { windowStart: number; count: number }>();
const recentCounted = new Map<string, number>();

function rateLimited(iphash: string | null, now: number): boolean {
  if (!iphash) return false;
  if (logHits.size > 20_000) logHits.clear();
  const e = logHits.get(iphash);
  if (!e || now - e.windowStart > LOG_WINDOW_MS) {
    logHits.set(iphash, { windowStart: now, count: 1 });
    return false;
  }
  e.count += 1;
  return e.count > LOG_MAX;
}

function isDuplicate(iphash: string | null, linkid: string, now: number): boolean {
  if (!iphash) return false;
  if (recentCounted.size > 20_000) recentCounted.clear();
  const key = `${iphash}:${linkid}`;
  const last = recentCounted.get(key);
  if (last && now - last < DEDUPE_MS) return true;
  recentCounted.set(key, now);
  return false;
}
// [SCOPE 070 / T003] END

// [SCOPE 070 / T001] BEGIN — GET /r/:code public redirect (302, open-redirect-proof)
router.get("/r/:code", async (req: Request, res: Response): Promise<void> => {
  // Opportunistic: drain clicks buffered by earlier requests while this request has CPU.
  void flushClicks();

  const code = req.params.code;
  try {
    const [link] = await db
      .select()
      .from(marketinglinks)
      .where(eq(marketinglinks.code, code));

    if (!link || link.status !== "active") {
      res.status(404).send("Link not found.");
      return;
    }

    // Build the destination ENTIRELY from the stored row (never from the URL).
    let target: URL;
    try {
      target = new URL(link.destinationurl);
    } catch {
      logger.error({ code }, "stored destination is not a valid URL");
      res.status(500).send("Link misconfigured.");
      return;
    }
    // Append UTM only when not already present (preserves ?tier= etc.).
    const addUtm = (key: string, val: string | null): void => {
      if (val && !target.searchParams.has(key)) target.searchParams.set(key, val);
    };
    addUtm("utm_source", link.utmsource ?? "banner");
    addUtm("utm_medium", link.utmmedium ?? "referral");
    addUtm("utm_campaign", link.utmcampaign ?? null);

    // 302 (not 301 — a 301 is browser-cached and future clicks would never reach us).
    // Also forbid caching by CloudFront/proxies/browser so every click reaches the
    // origin and is counted (a cached 302 would silently drop tracking).
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.redirect(302, target.toString());

    // Record the click (buffered; flushed in batches). Never blocks the redirect.
    const now = Date.now();
    const ip = clientIp(req);
    const iphash = hashIp(ip);
    if (rateLimited(iphash, now)) return; // protect the click table; redirect already sent
    const uaclass = classifyUa(
      typeof req.headers["user-agent"] === "string"
        ? req.headers["user-agent"]
        : "",
      req.method,
    );
    const counted = uaclass === "human" && !isDuplicate(iphash, link.id, now);
    const ref = req.headers["referer"];
    enqueueClick({
      linkid: link.id,
      iphash,
      uaclass,
      referrer: typeof ref === "string" ? ref.slice(0, 1000) : null,
      counted,
    });
  } catch (err) {
    logger.error({ err, code }, "redirect lookup failed");
    if (!res.headersSent) res.status(500).send("Something went wrong.");
  }
});
// [SCOPE 070 / T001] END

export default router;
