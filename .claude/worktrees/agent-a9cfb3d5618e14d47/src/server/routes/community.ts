import { Router, Request, Response } from "express";
import { z } from "zod";
import { createLogger } from "~/server/lib/logger.js";
import { apiTokenService } from "~/server/services/ApiTokenService.js";
import {
  NOT_COMPANY_MEMBER_MESSAGE,
  auditRefusedSession,
  isCompanyMemberEmail,
} from "~/server/lib/communityMembership.js";

const router = Router();
const logger = createLogger("community-route");

// [SCOPE 079 / FR-008] BEGIN — Community-chat session broker (Amendment C)
// MODIFIED-BY: [SCOPE 144 / T002] — app token required; sessions only for the token's company (FR-009)
// Holds WXKANBAN_CONSUMER_SECRET server-side and provisions a YappChat session on
// the caller's behalf, so the consumer secret NEVER ships to any client (the
// Cockpit). Per-IP rate-limited to blunt abuse. The consumer secret used to live in
// the extension host's SecretStorage; it now lives only in the wxKanban server env.
// SPEC-144 FR-009: the caller sends its project's app token as a Bearer, and a session
// is issued only for an email of that token's company (a user, or a current consulting
// member on one of its projects). Refusals are audited.

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_PER_IP_PER_WINDOW = 30; // room for reconnects; blunts abuse
const ipHits = new Map<string, { count: number; reset: number }>();

function ipAllowed(ip: string): boolean {
  const now = Date.now();
  const e = ipHits.get(ip);
  if (!e || now > e.reset) {
    ipHits.set(ip, { count: 1, reset: now + WINDOW_MS });
    return true;
  }
  if (e.count >= MAX_PER_IP_PER_WINDOW) return false;
  e.count++;
  return true;
}

// Evict expired buckets so the map can't grow without bound. unref() so the timer
// never keeps the process (or a test runner) alive.
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of ipHits) if (now > v.reset) ipHits.delete(k);
}, 60_000).unref?.();

function yappchatBaseUrl(): string {
  return (process.env.WXKANBAN_YAPPCHAT_BASE_URL || "https://www.yappchatt.com").replace(/\/$/, "");
}

const bodySchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1).max(120).optional(),
});

// POST /api/community/session   Authorization: Bearer <project app token>
// { email, displayName? } -> { sessionToken, userid, communityId, spaceId, conversationId }
// The wxKanban server calls YappChat's consumer endpoint with the server-held
// secret and passes the session payload straight back to the extension host, which
// then continues the handshake (history, ws-token, WS, send) with the returned
// per-user session — none of which needs the secret.
router.post("/api/community/session", async (req: Request, res: Response) => {
  const ip =
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
    req.ip ||
    "unknown";
  if (!ipAllowed(ip)) {
    res.status(429).json({ error: "rate-limited", retryAfter: Math.ceil(WINDOW_MS / 1000) });
    return;
  }

  const bearer = /^Bearer\s+(.+)$/i.exec((req.header("Authorization") ?? "").trim());
  if (!bearer) {
    res.status(401).json({ error: "token_required" });
    return;
  }

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "a valid email is required" });
    return;
  }
  const email = parsed.data.email.trim().toLowerCase();
  const displayName = (parsed.data.displayName ?? email.split("@")[0]).trim();

  try {
    const token = await apiTokenService.validateToken(bearer[1].trim());
    if (!token || (token.expiresat && token.expiresat.getTime() <= Date.now())) {
      res.status(401).json({ error: "invalid-token" });
      return;
    }
    if (!(await isCompanyMemberEmail(token.customerid, email))) {
      await auditRefusedSession({
        companyId: token.customerid,
        email,
        projectId: token.projectid,
        tokenId: token.id,
        ip,
      });
      res.status(403).json({ error: "not_company_member", message: NOT_COMPANY_MEMBER_MESSAGE });
      return;
    }
  } catch (err) {
    logger.error({ err: (err as Error).message }, "community/session membership check failed");
    res.status(500).json({ error: "membership check failed" });
    return;
  }

  const secret = process.env.WXKANBAN_CONSUMER_SECRET;
  if (!secret) {
    logger.error("WXKANBAN_CONSUMER_SECRET is not configured — community chat broker unavailable");
    res.status(503).json({ error: "community chat is not configured" });
    return;
  }

  try {
    const upstream = await fetch(`${yappchatBaseUrl()}/api/consumer/session`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${secret}` },
      body: JSON.stringify({ email, displayName }),
    });
    const text = await upstream.text();
    if (!upstream.ok) {
      logger.warn({ status: upstream.status }, "yappchat consumer/session upstream failed");
      res.status(502).json({ error: "community chat upstream error", status: upstream.status });
      return;
    }
    // Pass the session payload straight through to the extension host.
    res.status(200).type("application/json").send(text);
  } catch (err) {
    logger.error({ err: (err as Error).message }, "community/session broker error");
    res.status(502).json({ error: "community chat upstream unreachable" });
  }
});
// [SCOPE 079 / FR-008] END

export default router;
