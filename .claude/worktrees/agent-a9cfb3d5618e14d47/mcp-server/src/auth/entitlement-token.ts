/**
 * Ed25519-signed entitlement tokens (Phase 1B).
 *
 * The server signs a short-lived token stating the customer's subscription
 * status and a server-stamped issue/expiry time. The kit caches it and verifies
 * it offline with the embedded PUBLIC key, so local-only commands can fail closed
 * without the customer being able to forge "active".
 *
 * The PRIVATE key is supplied via env `ENTITLEMENT_PRIVATE_KEY_B64` (base64 of a
 * PKCS#8 PEM). If unset, signing returns null → the server is "not enforcing"
 * kit-side and the kit treats that as a rollout no-op (fail open).
 */
import { createPrivateKey, sign, type KeyObject } from 'crypto';
import logger from '../utils/logger.js';

export interface EntitlementTokenPayload {
  customerId: string;
  status: string | null;
  iat: number; // epoch seconds, server-stamped
  exp: number; // epoch seconds (iat + offline grace window)
}

/** Offline grace window baked into the token's exp. Owner decision: 7 days. */
export const ENTITLEMENT_GRACE_DAYS = 7;

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

let cachedKey: KeyObject | null | undefined;

function loadPrivateKey(): KeyObject | null {
  if (cachedKey !== undefined) return cachedKey;
  const b64 = process.env.ENTITLEMENT_PRIVATE_KEY_B64;
  if (!b64) {
    cachedKey = null;
    return null;
  }
  try {
    const pem = Buffer.from(b64, 'base64').toString('utf8');
    cachedKey = createPrivateKey(pem);
  } catch (err) {
    logger.error('entitlement.token.key.invalid', err as Error);
    cachedKey = null;
  }
  return cachedKey;
}

/**
 * Sign an entitlement token. Returns null when no signing key is configured
 * (server not enforcing kit-side yet).
 */
export function signEntitlementToken(customerId: string, status: string | null): string | null {
  const key = loadPrivateKey();
  if (!key) return null;
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + ENTITLEMENT_GRACE_DAYS * 24 * 3600;
  const payload: EntitlementTokenPayload = { customerId, status, iat, exp };
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  const signature = b64url(sign(null, Buffer.from(body), key)); // Ed25519 → algorithm null
  return `${body}.${signature}`;
}
