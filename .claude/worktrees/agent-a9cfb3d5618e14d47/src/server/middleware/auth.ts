import { Request, Response, NextFunction } from "express";
import { verifyToken, extractToken } from "../lib/jwt.js";
import { createLogger } from "../lib/logger.js";

const logger = createLogger("auth-middleware");

export interface AuthRequest extends Request {
  userid?: string;
  email?: string;
  companyid?: string;
  usertype?: string;
  billingplan?: string;
  subscriptionstatus?: string;
  maxusers?: number;
}

function getTokenFromRequest(req: AuthRequest): string | null {
  const headerToken = extractToken(req.headers.authorization);
  if (headerToken) return headerToken;

  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    const match = cookieHeader
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith("token="));
    if (match) return match.slice("token=".length);
  }

  return null;
}

/**
 * Middleware to verify JWT token from Authorization header or httpOnly cookie.
 * Extracts userid, email, and company context and adds to request object.
 */
export function authenticateToken(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): void {
  try {
    const token = getTokenFromRequest(req);

    if (!token) {
      res.status(401).json({ error: "Missing authorization token" });
      return;
    }

    const payload = verifyToken(token);
    req.userid = payload.userid;
    req.email = payload.email;
    req.companyid = payload.companyid;
    req.usertype = payload.usertype;
    req.billingplan = payload.billingplan;
    req.subscriptionstatus = payload.subscriptionstatus;
    req.maxusers = payload.maxusers;

    next();
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : "Unknown error" },
      "Token verification failed",
    );
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

/**
 * Soft authentication: decodes the JWT cookie if present and populates
 * req.userid / req.email / etc. — but DOES NOT 401 when no cookie is
 * present. Use on public endpoints that want to behave differently when
 * the caller happens to be signed in.
 *
 * Spec 037 — the engagement accept endpoint is one such case: a brand-new
 * email accepts without auth (provision-and-accept), while an existing user
 * must be signed in as the invited email.
 */
// [SCOPE 037 / T010] BEGIN — softAuthenticateToken middleware
export function softAuthenticateToken(
  req: AuthRequest,
  _res: Response,
  next: NextFunction,
): void {
  try {
    const token = getTokenFromRequest(req);
    if (!token) {
      next();
      return;
    }
    const payload = verifyToken(token);
    req.userid = payload.userid;
    req.email = payload.email;
    req.companyid = payload.companyid;
    req.usertype = payload.usertype;
    req.billingplan = payload.billingplan;
    req.subscriptionstatus = payload.subscriptionstatus;
    req.maxusers = payload.maxusers;
  } catch (error) {
    // Soft-auth: invalid token doesn't fail the request; leave req fields unset.
    logger.warn(
      { error: error instanceof Error ? error.message : "Unknown error" },
      "softAuthenticateToken: cookie present but invalid — proceeding unauthenticated",
    );
  }
  next();
}
// [SCOPE 037 / T010] END

/**
 * Middleware to require authentication.
 * Returns 401 if user is not authenticated.
 */
export function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): void {
  if (!req.userid) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  next();
}
