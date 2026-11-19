/**
 * Spec 028 / T008 — Security response headers.
 *
 * HSTS only emitted when the request arrived over TLS (or x-forwarded-proto
 * says so — App Runner terminates TLS at the edge). Always sets
 * `X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer`.
 */
import type { Request, Response, NextFunction } from 'express';

function isTls(req: Request): boolean {
  if (req.secure) return true;
  const fwd = req.header('x-forwarded-proto');
  return typeof fwd === 'string' && fwd.toLowerCase().split(',')[0].trim() === 'https';
}

export const securityHeadersMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if (isTls(req)) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
};
