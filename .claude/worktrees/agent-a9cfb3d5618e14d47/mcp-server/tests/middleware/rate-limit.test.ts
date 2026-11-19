/**
 * Spec 028 / T012 — Rate-limit middleware unit tests.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { rateLimitMiddleware, resetRateLimitForTests } from '../../src/middleware/rate-limit.js';

function mockReqRes(tokenId: string | null, path = '/call'): {
  req: Request;
  res: Response;
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
  setHeader: ReturnType<typeof vi.fn>;
  next: ReturnType<typeof vi.fn>;
} {
  const status = vi.fn().mockReturnThis();
  const json = vi.fn();
  const setHeader = vi.fn();
  const next = vi.fn();
  const req = {
    path,
    mcpScope: tokenId
      ? {
          tokenId,
          customerId: 'c',
          projectId: 'p',
          tokenPrefix: 'pref',
          authMode: 'token' as const,
        }
      : undefined,
    socket: { remoteAddress: '127.0.0.1' },
    ip: '127.0.0.1',
  } as unknown as Request;
  const res = { status, json, setHeader } as unknown as Response;
  return { req, res, status, json, setHeader, next };
}

describe('rateLimitMiddleware', () => {
  beforeEach(() => {
    resetRateLimitForTests();
    process.env.MCP_RATE_LIMIT_PER_MINUTE = '60';
  });

  it('lets /health through unconditionally', () => {
    const { req, res, next, status } = mockReqRes('tok', '/health');
    rateLimitMiddleware(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(status).not.toHaveBeenCalled();
  });

  it('allows requests inside the burst budget', () => {
    const { req, res, next } = mockReqRes('tok-burst');
    for (let i = 0; i < 5; i++) rateLimitMiddleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(5);
  });

  it('returns 429 + Retry-After when the bucket is exhausted', () => {
    process.env.MCP_RATE_LIMIT_PER_MINUTE = '1';
    resetRateLimitForTests();
    const { req, res, next, status, json, setHeader } = mockReqRes('tok-tight');
    // capacity 1 + burst 10 = 11 allowed
    for (let i = 0; i < 11; i++) rateLimitMiddleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(11);
    rateLimitMiddleware(req, res, next);
    expect(status).toHaveBeenCalledWith(429);
    expect(setHeader).toHaveBeenCalledWith('Retry-After', expect.any(String));
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ error: 'rate-limited' }));
  });

  it('keys by client IP when no token scope is present', () => {
    process.env.MCP_RATE_LIMIT_PER_MINUTE = '1';
    resetRateLimitForTests();
    const { req, res, next, status } = mockReqRes(null);
    for (let i = 0; i < 11; i++) rateLimitMiddleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(11);
    rateLimitMiddleware(req, res, next);
    expect(status).toHaveBeenCalledWith(429);
  });
});
