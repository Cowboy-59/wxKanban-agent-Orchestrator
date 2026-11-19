import bcrypt from "bcryptjs";
import { logger } from "./logger";

const BCRYPT_ROUNDS = 12; // Minimum salt rounds per spec

/**
 * Hash a password using bcrypt
 * Uses 12+ salt rounds as required by spec
 */
export async function hashPassword(password: string): Promise<string> {
  try {
    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
    return hashedPassword;
  } catch (error) {
    logger.error({ error }, "Failed to hash password");
    throw new Error("Failed to hash password");
  }
}

/**
 * Verify a password against its hash
 */
export async function verifyPassword(
  password: string,
  passwordHash: string
): Promise<boolean> {
  try {
    const isValid = await bcrypt.compare(password, passwordHash);
    return isValid;
  } catch (error) {
    logger.error({ error }, "Failed to verify password");
    throw new Error("Failed to verify password");
  }
}

/**
 * Check if a password matches common patterns that should be rejected
 * Prevents weak passwords like "password123", "admin", etc.
 */
export function isCommonPassword(password: string): boolean {
  const commonPatterns = [
    "password",
    "admin",
    "user",
    "test",
    "demo",
    "welcome",
    "123456",
    "qwerty",
    "letmein",
    "monkey",
    "dragon",
    "master",
  ];

  const lowerPassword = password.toLowerCase();

  // Check if password contains any common pattern
  for (const pattern of commonPatterns) {
    if (lowerPassword.includes(pattern)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if password matches email (reject if it does)
 */
export function passwordMatchesEmail(password: string, email: string): boolean {
  const emailLocalPart = email.split("@")[0];
  return password.toLowerCase().includes(emailLocalPart.toLowerCase());
}

/**
 * Hash a token (used for invitation and verification tokens)
 * Uses bcrypt for security
 */
export async function hashToken(token: string): Promise<string> {
  try {
    const hashedToken = await bcrypt.hash(token, BCRYPT_ROUNDS);
    return hashedToken;
  } catch (error) {
    logger.error({ error }, "Failed to hash token");
    throw new Error("Failed to hash token");
  }
}

/**
 * Verify a token against its hash
 */
export async function verifyToken(
  token: string,
  tokenHash: string
): Promise<boolean> {
  try {
    const isValid = await bcrypt.compare(token, tokenHash);
    return isValid;
  } catch (error) {
    logger.error({ error }, "Failed to verify token");
    throw new Error("Failed to verify token");
  }
}
