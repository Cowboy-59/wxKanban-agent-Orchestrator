/**
 * Spec 028 / T006 — Per-token token-bucket rate limiter.
 *
 * Default: 60 req/min with a 10-req burst. Configured via
 * `MCP_RATE_LIMIT_PER_MINUTE` env var. Throttled requests get 429 +
 * `Retry-After` header. Audit row (outcome `throttled`) is written by the
 * audit middleware downstream — the throttler only attaches the outcome.
 *
 * Storage is in-process; multi-instance deployments will need a shared store
 * (out-of-band follow-up; spec calls out single-instance as v1).
 */
import type { Request, Response, NextFunction } from 'express';

interface Bucket {
  tokens: number;
  lastRefillMs: number;
}

const BUCKETS: Map<string, Bucket> = new Map();

function ratePerMinute(): number {
  const raw = process.env.MCP_RATE_LIMIT_PER_MINUTE;
  if (!raw) return 60;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 60;
}

const BURST = 10;

function refill(bucket: Bucket, capacityPerMinute: number, nowMs: number): void {
  const elapsedMs = nowMs - bucket.lastRefillMs;
  if (elapsedMs <= 0) return;
  const refillTokens = (elapsedMs / 60_000) * capacityPerMinute;
  bucket.tokens = Math.min(capacityPerMinute + BURST, bucket.tokens + refillTokens);
  bucket.lastRefillMs = nowMs;
}

function getBucket(key: string, capacity: number, nowMs: number): Bucket {
  let bucket = BUCKETS.get(key);
  if (!bucket) {
    bucket = { tokens: capacity + BURST, lastRefillMs: nowMs };
    BUCKETS.set(key, bucket);
  }
  return bucket;
}

export function resetRateLimitForTests(): void {
  BUCKETS.clear();
}

export const rateLimitMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if (req.path === '/health') {
    next();
    return;
  }

  // Without a resolved token scope (dev bypass or pre-auth route), rate-limit
  // by client IP so unauthenticated noise still gets throttled.
  const key =
    req.mcpScope?.tokenId ??
    req.ip ??
    req.socket.remoteAddress ??
    'anonymous';

  const capacity = ratePerMinute();
  const now = Date.now();
  const bucket = getBucket(key, capacity, now);
  refill(bucket, capacity, now);

  if (bucket.tokens < 1) {
    const retryAfterSec = Math.max(1, Math.ceil((1 / capacity) * 60));
    res.setHeader('Retry-After', String(retryAfterSec));
    res.status(429).json({ error: 'rate-limited', retryAfterSec });
    if (req.mcpAudit) req.mcpAudit.outcome = 'throttled';
    return;
  }

  bucket.tokens -= 1;
  next();
};
