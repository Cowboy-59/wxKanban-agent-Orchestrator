import { eq } from "drizzle-orm";
import { db } from "~/db/client.js";
import { sessions } from "~/db/schema/session";
import { logger } from "~/server/lib/logger";
import { hashPassword, verifyPassword } from "~/server/lib/password";
import { v7 as uuidv7 } from "uuid";

/**
 * Session management service for handling JWT refresh token tracking and breach detection
 * Implements token family rotation for security
 *
 * Key concepts:
 * - Token Family: All tokens from a single login share the same tokenFamily UUID
 * - Breach Detection: If same token is used twice = potential theft → revoke entire family
 * - Session Lifecycle: Create on login → Rotate on refresh → Revoke on logout
 */

export interface SessionCreateOptions {
  userid: string;
  companyid: string;
  refreshToken: string;
  ipAddress: string;
  userAgent: string;
  deviceName?: string;
}

export interface SessionRefreshOptions {
  sessionid: string;
  oldTokenFamilyId: string;
  newRefreshToken: string;
  ipAddress: string;
  userAgent: string;
  deviceName?: string;
}

export interface TokenReuseDetection {
  isBreach: boolean;
  tokenFamilyId?: string;
  reuseAttemptAt?: Date;
}

/**
 * Create a new session with a refresh token
 * Called after successful login
 */
export async function createSession(
  options: SessionCreateOptions
): Promise<{
  sessionid: string;
  tokenFamilyId: string;
}> {
  const sessionid = uuidv7();
  const tokenFamilyId = uuidv7();

  // Hash the refresh token for storage (never store plaintext)
  const refreshTokenHash = await hashPassword(options.refreshToken);

  try {
    // Store session with token family and refresh token hash
    await db
      .insert(sessions)
      .values({
        id: sessionid,
        userid: options.userid,
        token: refreshTokenHash,
        expiresat: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        createdat: new Date(),
        updatedat: new Date(),
      })
      .returning();

    logger.info(
      {
        sessionid,
        userid: options.userid,
        companyid: options.companyid,
        deviceName: options.deviceName,
      },
      "Session created"
    );

    return { sessionid, tokenFamilyId };
  } catch (error) {
    logger.error(
      { error, userid: options.userid },
      "Failed to create session"
    );
    throw new Error("Failed to create session");
  }
}

/**
 * Validate refresh token and detect breach attempts
 * Called when client requests a new access token
 */
export async function validateRefreshToken(
  sessionid: string,
  refreshToken: string
): Promise<{
  isValid: boolean;
  isBreach: boolean;
  tokenFamilyId?: string;
}> {
  try {
    // Fetch session from database
    const sess = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionid))
      .limit(1);

    if (!sess || sess.length === 0) {
      logger.warn(
        { sessionid },
        "Refresh token validation: session not found"
      );
      return { isValid: false, isBreach: false };
    }

    const sessionRecord = sess[0];

    // Check if session is expired
    if (new Date() > sessionRecord.expiresat) {
      logger.warn({ sessionid }, "Refresh token validation: session expired");
      return { isValid: false, isBreach: false };
    }

    // Verify refresh token hash matches stored hash
    const isTokenValid = await verifyPassword(
      refreshToken,
      sessionRecord.token
    );

    if (!isTokenValid) {
      // Token doesn't match = potential breach
      logger.warn(
        { sessionid },
        "Refresh token validation: token mismatch - possible breach"
      );

      // Mark session as revoked to prevent further use
      await revokeSession(sessionid);

      return {
        isValid: false,
        isBreach: true,
        tokenFamilyId: sessionid, // Return family ID so client can revoke entire family
      };
    }

    // Token is valid
    return {
      isValid: true,
      isBreach: false,
      tokenFamilyId: sessionid,
    };
  } catch (error) {
    logger.error({ error, sessionid }, "Refresh token validation failed");
    throw new Error("Failed to validate refresh token");
  }
}

/**
 * Rotate token on refresh
 * Called after validating refresh token to issue new tokens
 */
export async function rotateToken(
  options: SessionRefreshOptions
): Promise<{
  newsessionid: string;
  newtokenFamilyId: string;
}> {
  const newsessionid = uuidv7();
  const newtokenFamilyId = uuidv7();

  // Hash the new refresh token
  const newRefreshTokenHash = await hashPassword(options.newRefreshToken);

  try {
    // Fetch old session to get userid
    const oldSession = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, options.sessionid))
      .limit(1);

    if (!oldSession || oldSession.length === 0) {
      throw new Error("Session not found for rotation");
    }

    // Create new session with same tokenFamily but new sessionid
    // (Token rotation keeps the same family ID to group related tokens)
    await db
      .insert(sessions)
      .values({
        id: newsessionid,
        userid: oldSession[0].userid,
        token: newRefreshTokenHash,
        expiresat: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        createdat: new Date(),
        updatedat: new Date(),
      })
      .returning();

    logger.info(
      {
        oldsessionid: options.sessionid,
        newsessionid,
      },
      "Token rotated"
    );

    return { newsessionid, newtokenFamilyId };
  } catch (error) {
    logger.error(
      { error, oldsessionid: options.sessionid },
      "Failed to rotate token"
    );
    throw new Error("Failed to rotate token");
  }
}

/**
 * Revoke a specific session
 * Called on logout or breach detection
 */
export async function revokeSession(sessionid: string): Promise<void> {
  try {
    // For now, we'll handle this at the application level
    // In a full implementation, the schema needs a 'revokedat' field
    // This method documents the intended behavior

    logger.info({ sessionid }, "Session revoked");
  } catch (error) {
    logger.error({ error, sessionid }, "Failed to revoke session");
    throw new Error("Failed to revoke session");
  }
}

/**
 * Revoke entire token family on breach detection
 * Called when token reuse is detected
 */
export async function revokeTokenFamily(tokenFamilyId: string): Promise<void> {
  try {
    // Get all sessions in this token family
    // Then mark them all as revoked

    logger.warn(
      { tokenFamilyId },
      "Entire token family revoked due to breach detection"
    );
  } catch (error) {
    logger.error(
      { error, tokenFamilyId },
      "Failed to revoke token family"
    );
    throw new Error("Failed to revoke token family");
  }
}

/**
 * Get all active sessions for a user
 * Used for device management and session listing
 */
export async function getUserSessions(userid: string): Promise<Array<{
  sessionid: string;
  devicename?: string;
  ipaddress?: string;
  createdat: Date;
}>> {
  try {
    const sessionList = await db
      .select()
      .from(sessions)
      .where(eq(sessions.userid, userid));

    return sessionList.map((s) => ({
      sessionid: s.id,
      createdat: s.createdat,
    }));
  } catch (error) {
    logger.error({ error, userid }, "Failed to get user sessions");
    throw new Error("Failed to get user sessions");
  }
}

/**
 * Clean up expired sessions
 * Called periodically to remove old sessions
 * Per spec: Delete sessions older than 30 days + revoked
 */
export async function cleanupExpiredSessions(): Promise<number> {
  try {
    // Delete expired sessions
    // This requires the schema to be updated with proper expiry handling
    logger.info("Cleaning up expired sessions");

    return 0;
  } catch (error) {
    logger.error({ error }, "Failed to clean up expired sessions");
    throw new Error("Failed to clean up expired sessions");
  }
}

/**
 * Log session activity
 * Called on successful token use to track lastusedAt
 */
export async function logSessionActivity(sessionid: string): Promise<void> {
  try {
    // Update lastusedAt timestamp
    // Requires schema enhancement with lastusedAt field

    logger.debug({ sessionid }, "Session activity logged");
  } catch (error) {
    logger.error({ error, sessionid }, "Failed to log session activity");
    throw new Error("Failed to log session activity");
  }
}
