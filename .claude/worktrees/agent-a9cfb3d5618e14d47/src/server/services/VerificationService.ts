import { db } from '~/db/client.js';
import { emailverificationtokens } from '~/db/schema/emailverificationtoken.js';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';
import { logger } from '~/server/lib/logger.js';

/**
 * VerificationService
 * Handles email verification token generation, validation, and token management
 */

interface VerificationToken {
  token: string;
  expiresAt: Date;
  hash: string;
}

export class VerificationService {
  private static readonly TOKEN_EXPIRY_HOURS = 24;
  private static readonly TOKEN_LENGTH = 32;

  /**
   * Generate a secure verification token
   * Returns both the raw token (for email) and hash (for storage)
   */
  static generateVerificationToken(): VerificationToken {
    const token = crypto.randomBytes(VerificationService.TOKEN_LENGTH).toString('hex');
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + VerificationService.TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

    return { token, hash, expiresAt };
  }

  /**
   * Generate verification link for email
   * @param token - Raw token to include in URL
   * @returns Full verification link
   */
  static generateVerificationLink(token: string): string {
    const baseUrl = process.env.CLIENT_URL || 'http://localhost:3000';
    return `${baseUrl}/verify-email?token=${token}`;
  }

  /**
   * Store verification token in database
   * @param userId - User ID
   * @param hash - Token hash
   * @param expiresAt - Expiry time
   */
  static async storeVerificationToken(
    userId: string,
    hash: string,
    expiresAt: Date
  ): Promise<void> {
    try {
      await db
        .insert(emailverificationtokens)
        .values({
          userid: userId,
          tokenhash: hash,
          expiresat: expiresAt,
          attemptcount: 0,
        });

      logger.info({ userId }, 'Verification token stored');
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error', userId },
        'Failed to store verification token'
      );
      throw error;
    }
  }

  /**
   * Verify email using token
   * @param token - Raw token from email link
   * @returns Success/failure
   */
  static async verifyEmail(token: string): Promise<{
    success: boolean;
    message: string;
    userId?: string;
  }> {
    try {
      // Get verification token record
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const tokenRecord = await db
        .select()
        .from(emailverificationtokens)
        .where(eq(emailverificationtokens.tokenhash, tokenHash))
        .then(rows => rows[0]);

      if (!tokenRecord) {
        return { success: false, message: 'Invalid verification token' };
      }

      // Check if expired
      if (tokenRecord.expiresat < new Date()) {
        return { success: false, message: 'Verification token has expired' };
      }

      // Check attempt count
      if ((tokenRecord.attemptcount ?? 0) >= 5) {
        return { success: false, message: 'Too many verification attempts' };
      }

      // Delete used token
      await db
        .delete(emailverificationtokens)
        .where(eq(emailverificationtokens.id, tokenRecord.id));

      logger.info({ userId: tokenRecord.userid }, 'Email verified successfully');

      return {
        success: true,
        message: 'Email verified successfully',
        userId: tokenRecord.userid,
      };
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error' },
        'Email verification error'
      );
      return { success: false, message: 'Email verification failed' };
    }
  }

  /**
   * Increment verification attempt count
   * @param token - Raw token
   */
  static async incrementAttemptCount(token: string): Promise<void> {
    try {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const tokenRecord = await db
        .select()
        .from(emailverificationtokens)
        .where(eq(emailverificationtokens.tokenhash, tokenHash))
        .then(rows => rows[0]);

      if (tokenRecord) {
        await db
          .update(emailverificationtokens)
          .set({ attemptcount: (tokenRecord.attemptcount ?? 0) + 1 })
          .where(eq(emailverificationtokens.id, tokenRecord.id));
      }
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : 'Unknown error' },
        'Failed to increment attempt count'
      );
    }
  }

  /**
   * Check if verification token is valid
   * @param token - Raw token
   * @returns True if token is valid and not expired
   */
  static async isValidToken(token: string): Promise<boolean> {
    try {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const tokenRecord = await db
        .select()
        .from(emailverificationtokens)
        .where(eq(emailverificationtokens.tokenhash, tokenHash))
        .then(rows => rows[0]);

      if (!tokenRecord) {
        return false;
      }

      // Check expiry
      if (tokenRecord.expiresat < new Date()) {
        return false;
      }

      // Check attempt count
      if ((tokenRecord.attemptcount ?? 0) >= 5) {
        return false;
      }

      return true;
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error' },
        'Check valid token error'
      );
      return false;
    }
  }

  /**
   * Delete expired verification tokens
   */
  static async deleteExpiredTokens(): Promise<number> {
    try {
      const result = await db
        .delete(emailverificationtokens)
        .where(eq(emailverificationtokens.expiresat, new Date()));

      logger.info({ count: result.rowCount ?? 0 }, 'Expired tokens deleted');
      return result.rowCount ?? 0;
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error' },
        'Delete expired tokens error'
      );
      return 0;
    }
  }
}
