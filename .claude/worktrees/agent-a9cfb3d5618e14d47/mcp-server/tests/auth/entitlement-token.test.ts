/**
 * Entitlement token signing tests (Phase 1B). Verifies the server signer
 * produces a `<body>.<sig>` token that the matching Ed25519 public key validates
 * — the same check the kit performs offline.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { generateKeyPairSync, verify } from 'crypto';

vi.mock('../../src/utils/logger.js', () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

function fromB64url(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

let pubPem: string;
let savedEnv: string | undefined;

beforeEach(() => {
  savedEnv = process.env.ENTITLEMENT_PRIVATE_KEY_B64;
  vi.resetModules();
});
afterEach(() => {
  if (savedEnv === undefined) delete process.env.ENTITLEMENT_PRIVATE_KEY_B64;
  else process.env.ENTITLEMENT_PRIVATE_KEY_B64 = savedEnv;
});

describe('signEntitlementToken', () => {
  it('returns null when no signing key is configured', async () => {
    delete process.env.ENTITLEMENT_PRIVATE_KEY_B64;
    const { signEntitlementToken } = await import('../../src/auth/entitlement-token.js');
    expect(signEntitlementToken('cust-1', 'ACTIVE')).toBeNull();
  });

  it('produces a token the public key verifies, with correct claims', async () => {
    const kp = generateKeyPairSync('ed25519');
    pubPem = kp.publicKey.export({ type: 'spki', format: 'pem' }).toString();
    process.env.ENTITLEMENT_PRIVATE_KEY_B64 = Buffer.from(
      kp.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    ).toString('base64');

    const { signEntitlementToken, ENTITLEMENT_GRACE_DAYS } = await import('../../src/auth/entitlement-token.js');
    const token = signEntitlementToken('cust-1', 'TRIAL');
    expect(token).toBeTruthy();

    const [body, sig] = token!.split('.');
    expect(verify(null, Buffer.from(body), kp.publicKey, fromB64url(sig))).toBe(true);

    const claims = JSON.parse(fromB64url(body).toString('utf8'));
    expect(claims.customerId).toBe('cust-1');
    expect(claims.status).toBe('TRIAL');
    expect(claims.exp - claims.iat).toBe(ENTITLEMENT_GRACE_DAYS * 24 * 3600);
    void pubPem;
  });
});
