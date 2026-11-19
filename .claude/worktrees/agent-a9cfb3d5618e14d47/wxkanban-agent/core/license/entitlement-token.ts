// Verify Ed25519-signed entitlement tokens issued by the hosted MCP (Phase 1B).
// Pure + offline: no network. Returns the claims only if the signature is valid.
import { createPublicKey, verify } from "crypto";
import { ENTITLEMENT_PUBLIC_KEY_PEM } from "./public-key";

export interface EntitlementClaims {
  customerId: string;
  status: string | null;
  iat: number; // epoch seconds, server-stamped
  exp: number; // epoch seconds
}

function fromB64url(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

/**
 * Verify a `<body>.<sig>` token. Returns the decoded claims on a valid
 * signature, or null on any malformation / bad signature.
 */
export function verifyEntitlementToken(
  token: string,
  publicKeyPem: string = ENTITLEMENT_PUBLIC_KEY_PEM,
): EntitlementClaims | null {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  try {
    const ok = verify(null, Buffer.from(body), createPublicKey(publicKeyPem), fromB64url(sig));
    if (!ok) return null;
    const claims = JSON.parse(fromB64url(body).toString("utf8")) as EntitlementClaims;
    if (
      typeof claims.customerId !== "string" ||
      typeof claims.iat !== "number" ||
      typeof claims.exp !== "number"
    ) {
      return null;
    }
    return claims;
  } catch {
    return null;
  }
}
