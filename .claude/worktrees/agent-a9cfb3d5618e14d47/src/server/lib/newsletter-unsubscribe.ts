import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "../config.js";

// [SCOPE 064 / T007] BEGIN — HMAC-signed unsubscribe links (no token column)
// Each newsletter email carries an unsubscribe link ?u=<contactid>&sig=<hmac>.
// The signature is HMAC-SHA256(secret, contactid) so the public unsubscribe route
// can verify the link without storing a per-recipient token. Shared by the send
// service (build) and the public route (verify).

const SECRET = process.env.NEWSLETTER_UNSUBSCRIBE_SECRET ?? "";
// The public origin that hosts the unsubscribe route (the app server). Falls back
// to the configured client origin (App Runner serves API + client on one domain).
const PUBLIC_BASE_URL = (
  process.env.NEWSLETTER_PUBLIC_BASE_URL ?? config.CLIENT_URL
).replace(/\/+$/, "");

export function unsubscribeConfigured(): boolean {
  return SECRET.length > 0;
}

/** HMAC-SHA256(secret, payload) as hex. */
function sign(payload: string): string {
  return createHmac("sha256", SECRET).update(payload).digest("hex");
}

/** Constant-time compare of an expected hex HMAC against a provided signature. */
function verifySig(payload: string, sig: string): boolean {
  if (!SECRET || !payload || !sig) return false;
  const a = Buffer.from(sign(payload), "hex");
  const b = Buffer.from(sig, "hex");
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}

/** HMAC-SHA256(secret, contactId) as hex. */
export function signContactId(contactId: string): string {
  return sign(contactId);
}

/**
 * Constant-time verification of a contactId + signature pair.
 * The signed payload is the bare contactId (unchanged from the original 064 links,
 * so previously-sent unsubscribe links keep working).
 */
export function verifyUnsubscribe(contactId: string, sig: string): boolean {
  return verifySig(contactId, sig);
}

// [SCOPE 064 / T010] BEGIN — Amendment A: registered-user unsubscribe links
// A user's unsubscribe is per-category, so the signed payload tags the recipient
// type and category: `user:<userid>:<updates|promos>`. Contacts keep the bare-id
// payload above. The public route rebuilds the same payload from its query params
// and verifies before touching the matching table.

export type NewsletterCategory = "updates" | "promos";

function userPayload(userId: string, category: NewsletterCategory): string {
  return `user:${userId}:${category}`;
}

/** Verify a registered-user unsubscribe (userId + category + signature). */
export function verifyUserUnsubscribe(
  userId: string,
  category: NewsletterCategory,
  sig: string,
): boolean {
  return verifySig(userPayload(userId, category), sig);
}
// [SCOPE 064 / T010] END

/** Full unsubscribe URL embedded in a marketing-contact recipient's email footer. */
export function buildUnsubscribeUrl(contactId: string): string {
  const sig = signContactId(contactId);
  return `${PUBLIC_BASE_URL}/api/marketing/newsletter/unsubscribe?u=${encodeURIComponent(
    contactId,
  )}&sig=${sig}`;
}

/** Full unsubscribe URL embedded in a registered-user recipient's email footer. */
export function buildUserUnsubscribeUrl(
  userId: string,
  category: NewsletterCategory,
): string {
  const sig = sign(userPayload(userId, category));
  return `${PUBLIC_BASE_URL}/api/marketing/newsletter/unsubscribe?t=user&u=${encodeURIComponent(
    userId,
  )}&c=${category}&sig=${sig}`;
}
// [SCOPE 064 / T007] END
