import crypto from "crypto";
import { db } from "~/db/client.js";
import { companies } from "~/db/schema/company";
import { eq } from "drizzle-orm";

// [SCOPE 088 / T001] BEGIN — Distributor referral code generation (FR-006)
/**
 * Alphabet for human-friendly referral codes: uppercase alphanumerics with the
 * ambiguous characters removed (no 0/O, no 1/I/L). Keeps codes easy to read
 * aloud and re-type off an email.
 */
const REFERRAL_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const REFERRAL_CODE_LENGTH = 8;

/**
 * Generate a single random referral code (pure — no DB, no uniqueness check).
 * Exposed for unit testing the format.
 */
export function generateReferralCode(length: number = REFERRAL_CODE_LENGTH): string {
  let code = "";
  for (let i = 0; i < length; i += 1) {
    code += REFERRAL_ALPHABET[crypto.randomInt(REFERRAL_ALPHABET.length)];
  }
  return code;
}

/**
 * Generate a referral code guaranteed unique against companies.referralcode,
 * regenerating on the rare collision. Bounded retries so a pathological DB
 * state can't spin forever.
 */
export async function generateUniqueReferralCode(maxAttempts: number = 10): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const code = generateReferralCode();
    const existing = await db
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.referralcode, code))
      .limit(1);
    if (existing.length === 0) {
      return code;
    }
  }
  throw new Error("Failed to generate a unique referral code after multiple attempts");
}
// [SCOPE 088 / T001] END
