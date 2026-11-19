// [SCOPE 090 / T009] BEGIN — server-side subscription gate (Amendment A, FR-009)
// [SCOPE 131 / T009] MODIFIED-BY — exempted /api/company/subscription so a walled company's ADMIN can still reach suspend, cancel, resume and unpause. Gate behavior is otherwise untouched.
/**
 * SPEC-090 Amendment A FR-009. The enforcement half of the subscription gate.
 *
 * The client wall (FR-007) is UX: it can be bypassed with curl, so it protects
 * revenue only in the sense that it protects the honest. This middleware is the
 * control that actually holds.
 *
 * Three deliberate design points:
 *
 * 1. It reads the company row, not the JWT. The JWT carries a subscriptionstatus
 *    snapshot from login, so a cancellation would not take effect until the token
 *    expired — and a customer who just paid would stay blocked. A short TTL cache
 *    keeps that off the hot path.
 *
 * 2. It ships inert. SUBSCRIPTION_GATE_ENFORCE=off (the default) skips entirely;
 *    `log` evaluates and records what it *would* have blocked without rejecting
 *    anyone; `on` enforces. A gate that can lock out every paying customer should
 *    be observed against real traffic before it is armed.
 *
 * 3. It fails OPEN on infrastructure error, matching the MCP entitlement gate. A
 *    database blip must degrade to "everyone gets in", never to "nobody does".
 */
import { Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { companies } from "../../db/schema/company.js";
import { userprofiles } from "../../db/schema/userprofiles.js";
import { verifyToken, extractToken } from "../lib/jwt.js";
import { createLogger } from "../lib/logger.js";
import { evaluateAccess } from "~/shared/subscription-policy.js";
import type { AuthRequest } from "./auth.js";

const logger = createLogger("subscription-gate");

export type GateMode = "off" | "log" | "on";

export function gateMode(): GateMode {
  const raw = (process.env.SUBSCRIPTION_GATE_ENFORCE ?? "off").toLowerCase();
  return raw === "on" || raw === "log" ? raw : "off";
}

/**
 * Paths that must stay reachable for a blocked customer to become unblocked.
 * Gating any of these would strand them: they could neither sign in to see the
 * wall, nor pay from it, nor sign out.
 */
const EXEMPT_PREFIXES = [
  "/api/auth", // sign in / out, /me — the wall needs the session payload
  "/api/payment", // the entire repair surface: plan, card, portal, confirm
  "/api/health",
  "/api/webhooks", // Stripe calls these; they carry no user session at all
  // [SCOPE 131 / T009] Suspend / cancel / resume / unpause live under /api/company,
  // which is NOT covered by the /api/payment exemption above. Without this line the
  // controls become unreachable at exactly the moment they are needed: a PAUSED or
  // CANCELLED company is walled, and the one action its ADMIN needs — resume — sits
  // behind the wall. That is the whole repair surface for a self-suspended company.
  //
  // This exempts GET and PATCH on the same prefix too. Neither is an access bypass:
  // `evaluateAccess` decides on subscriptionstatus / activeflag / billingexempt, and
  // PATCH writes only `companies.billingplan`, which the gate never reads.
  "/api/company/subscription",
];

function isExempt(path: string): boolean {
  return EXEMPT_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

interface CachedDecision {
  allowed: boolean;
  mode: string;
  status: string;
  expiresAt: number;
}

// Allow decisions outlive deny decisions so a customer who has just paid is let
// back in quickly, while a healthy session costs at most one lookup per minute.
const ALLOW_TTL_MS = 60_000;
const DENY_TTL_MS = 15_000;
const cache = new Map<string, CachedDecision>();

/** Drop cached decisions — call after a billing change so it applies at once. */
export function clearSubscriptionGateCache(companyId?: string): void {
  if (companyId) cache.delete(companyId);
  else cache.clear();
}

async function decide(companyId: string, userId: string): Promise<CachedDecision> {
  const now = Date.now();
  const hit = cache.get(companyId);
  if (hit && hit.expiresAt > now) return hit;

  const [company] = await db
    .select({
      subscriptionstatus: companies.subscriptionstatus,
      activeflag: companies.activeflag,
      billingexempt: companies.billingexempt,
    })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);

  const [user] = await db
    .select({ usertype: userprofiles.usertype })
    .from(userprofiles)
    .where(eq(userprofiles.id, userId))
    .limit(1);

  const access = evaluateAccess({
    subscriptionstatus: company?.subscriptionstatus,
    activeflag: company?.activeflag,
    billingexempt: company?.billingexempt,
    usertype: user?.usertype,
  });

  const decision: CachedDecision = {
    allowed: access.allowed,
    mode: access.mode,
    status: access.status,
    expiresAt: now + (access.allowed ? ALLOW_TTL_MS : DENY_TTL_MS),
  };
  cache.set(companyId, decision);
  return decision;
}

export async function requireActiveSubscription(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const mode = gateMode();
  if (mode === "off" || isExempt(req.path)) {
    next();
    return;
  }

  // Mounted app-wide, ahead of the per-route authenticateToken, so identity has
  // to be read here. An unauthenticated request is not this middleware's problem
  // — the route's own auth will reject it.
  let companyid: string | undefined;
  let userid: string | undefined;
  try {
    const cookieMatch = req.headers.cookie?.match(/(?:^|;\s*)token=([^;]+)/);
    const token = extractToken(req.headers.authorization) ?? (cookieMatch?.[1] ?? null);
    if (!token) {
      next();
      return;
    }
    const payload = verifyToken(token);
    companyid = payload.companyid;
    userid = payload.userid;
  } catch {
    next();
    return;
  }

  if (!companyid || !userid) {
    next();
    return;
  }

  try {
    const decision = await decide(companyid, userid);
    if (decision.allowed) {
      next();
      return;
    }

    if (mode === "log") {
      logger.warn(
        { companyid, userid, path: req.path, status: decision.status, mode: decision.mode },
        "subscription gate would have blocked this request (log-only mode)",
      );
      next();
      return;
    }

    logger.info(
      { companyid, userid, path: req.path, status: decision.status, mode: decision.mode },
      "subscription gate blocked request",
    );
    res.status(402).json({
      error: "An active wxKanban subscription is required.",
      mode: decision.mode,
      subscriptionstatus: decision.status,
    });
  } catch (error) {
    // Fail OPEN. See the header note: a DB error must not become an outage for
    // every paying customer.
    logger.error(
      { companyid, error: error instanceof Error ? error.message : String(error) },
      "subscription gate check failed — allowing request (degraded)",
    );
    next();
  }
}
// [SCOPE 090 / T009] END
