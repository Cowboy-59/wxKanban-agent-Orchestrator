/**
 * Rate Limiting Middleware for SysAdmin Endpoints
 * 
 * Provides protection against brute force attacks and abuse
 * of sensitive SysAdmin operations.
 */

import { Response, NextFunction } from "express";
import { AuthRequest } from "./auth.js";
import { createLogger } from "../lib/logger.js";

const logger = createLogger("rate-limit-middleware");

// In-memory store for rate limiting (in production, use Redis)
interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Clean up expired entries periodically
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetTime < now) {
      rateLimitStore.delete(key);
    }
  }
}, 60000); // Clean up every minute

/**
 * Generate rate limit key from request
 */
function getRateLimitKey(req: AuthRequest, identifier: string): string {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const userId = req.userid || "anonymous";
  return `${identifier}:${userId}:${ip}`;
}

/**
 * Check if request is within rate limit
 */
function checkRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || entry.resetTime < now) {
    // First request or window expired
    rateLimitStore.set(key, {
      count: 1,
      resetTime: now + windowMs,
    });
    return true;
  }

  if (entry.count >= maxRequests) {
    return false;
  }

  entry.count++;
  return true;
}

/**
 * Middleware: General SysAdmin endpoint rate limiting
 * 100 requests per 15 minutes per user
 */
export function sysadminRateLimit(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  const key = getRateLimitKey(req, "sysadmin:general");
  const windowMs = 15 * 60 * 1000; // 15 minutes
  const maxRequests = 100;

  if (!checkRateLimit(key, maxRequests, windowMs)) {
    logger.warn(
      { userid: req.userid, ip: req.ip },
      "SysAdmin rate limit exceeded"
    );
    res.status(429).json({
      error: "Too many requests. Please try again later.",
      retryAfter: Math.ceil(windowMs / 1000),
    });
    return;
  }

  next();
}

/**
 * Middleware: Strict rate limiting for password reset operations
 * 5 requests per hour per user
 */
export function passwordResetRateLimit(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  const key = getRateLimitKey(req, "sysadmin:password-reset");
  const windowMs = 60 * 60 * 1000; // 1 hour
  const maxRequests = 5;

  if (!checkRateLimit(key, maxRequests, windowMs)) {
    logger.warn(
      { userid: req.userid, ip: req.ip, targetUser: req.params.id },
      "Password reset rate limit exceeded"
    );
    res.status(429).json({
      error: "Too many password reset attempts. Please try again in 1 hour.",
      retryAfter: 3600,
    });
    return;
  }

  next();
}

// [SCOPE 023 / T111] BEGIN — public signup-invitation rate limiting (FR-002a)
/**
 * Middleware: anonymous signup-invitation + registration endpoints.
 * 20 requests per 15 minutes.
 *
 * These are unauthenticated, so getRateLimitKey degrades to per-IP. That is the
 * point here: it blunts someone walking token guesses against
 * GET /payment/registration/invite/:token.
 *
 * Caveats worth knowing before treating this as protection:
 *  - The store is an in-process Map, so the limit is PER INSTANCE. Under
 *    multi-instance App Runner the effective ceiling is N x maxRequests.
 *  - It is keyed on IP, which a distributed caller can rotate.
 *
 * The real defence is the 32-byte token itself (2^256 keyspace); this is a
 * speed bump on top, not the lock.
 */
export function signupInviteRateLimit(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  const key = getRateLimitKey(req, "public:signup-invite");
  const windowMs = 15 * 60 * 1000;
  const maxRequests = 20;

  if (!checkRateLimit(key, maxRequests, windowMs)) {
    logger.warn(
      { ip: req.ip, path: req.path },
      "Signup-invitation rate limit exceeded"
    );
    res.status(429).json({
      error: "Too many attempts. Please try again later.",
      retryAfter: 900,
    });
    return;
  }

  next();
}
// [SCOPE 023 / T111] END

// [SCOPE 152 / T005] BEGIN — K.A.I.N. sign-in rate limiting (FR-064, SOC 2 CC6.1)
/**
 * Middleware: POST /api/agent/signin. 30 attempts per 15 minutes per IP, and 10 per email.
 *
 * Per IP stops one caller spraying common passwords across many accounts below each account's
 * lockout; per email stops many callers walking one account. A success counts too: a device
 * signs in once, not in a loop. Same caveats as signupInviteRateLimit — per instance, in memory.
 */
export function agentSigninRateLimit(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  const windowMs = 15 * 60 * 1000;
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const email = (req.body as { email?: unknown } | undefined)?.email;
  const byIp = checkRateLimit(`agent:signin:ip:${ip}`, 30, windowMs);
  const byEmail =
    typeof email !== "string" || checkRateLimit(`agent:signin:email:${email.trim().toLowerCase()}`, 10, windowMs);

  if (!byIp || !byEmail) {
    logger.warn({ ip, limit: byIp ? "email" : "ip" }, "K.A.I.N. sign-in rate limit exceeded");
    res.status(429).json({
      error: "too_many_attempts",
      message: "Too many sign-in attempts. Please try again in 15 minutes.",
      retryAfter: 900,
    });
    return;
  }

  next();
}
// [SCOPE 152 / T005] END

/**
 * Middleware: Strict rate limiting for company status changes
 * 20 requests per hour per user
 */
export function companyStatusRateLimit(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  const key = getRateLimitKey(req, "sysadmin:company-status");
  const windowMs = 60 * 60 * 1000; // 1 hour
  const maxRequests = 20;

  if (!checkRateLimit(key, maxRequests, windowMs)) {
    logger.warn(
      { userid: req.userid, ip: req.ip, companyId: req.params.id },
      "Company status change rate limit exceeded"
    );
    res.status(429).json({
      error: "Too many company status changes. Please try again later.",
      retryAfter: 3600,
    });
    return;
  }

  next();
}

/**
 * Middleware: Ultra-strict rate limiting for user creation
 * 10 requests per hour per user
 */
export function userCreationRateLimit(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  const key = getRateLimitKey(req, "sysadmin:user-creation");
  const windowMs = 60 * 60 * 1000; // 1 hour
  const maxRequests = 10;

  if (!checkRateLimit(key, maxRequests, windowMs)) {
    logger.warn(
      { userid: req.userid, ip: req.ip },
      "User creation rate limit exceeded"
    );
    res.status(429).json({
      error: "Too many user creation attempts. Please try again later.",
      retryAfter: 3600,
    });
    return;
  }

  next();
}

/**
 * Get current rate limit status for a key (for monitoring)
 */
export function getRateLimitStatus(key: string): { count: number; resetTime: number; remaining: number } | null {
  const entry = rateLimitStore.get(key);
  if (!entry) return null;

  return {
    count: entry.count,
    resetTime: entry.resetTime,
    remaining: Math.max(0, entry.count), // This would need maxRequests context
  };
}

/**
 * Reset rate limit for a specific key (admin use)
 */
export function resetRateLimit(key: string): boolean {
  return rateLimitStore.delete(key);
}
