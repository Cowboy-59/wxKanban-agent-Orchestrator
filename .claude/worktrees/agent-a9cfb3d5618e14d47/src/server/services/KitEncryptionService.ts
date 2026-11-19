/**
 * KitEncryptionService
 * 
 * Handles AES-256-GCM encryption for DATABASE_URL per-developer.
 * Part of Spec 011: New Project — AI-Ready Project Provisioning
 */

import crypto from 'crypto';
import { config } from '../config';


const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const KEY_LENGTH = 32;

export interface EncryptedData {
  encrypted: string;
  iv: string;
  authTag: string;
}

export class KitEncryptionService {
  private static instance: KitEncryptionService;
  private serverKey: Buffer;

  private constructor() {
    // Server-side key for additional encryption layer
    const serverKeyString = process.env.API_TOKEN_ENCRYPTION_KEY || config.ENCRYPTION_KEY;

    if (!serverKeyString) {
      throw new Error('API_TOKEN_ENCRYPTION_KEY or ENCRYPTION_KEY must be set');
    }
    this.serverKey = crypto.scryptSync(serverKeyString, 'salt', KEY_LENGTH);
  }

  public static getInstance(): KitEncryptionService {
    if (!KitEncryptionService.instance) {
      KitEncryptionService.instance = new KitEncryptionService();
    }
    return KitEncryptionService.instance;
  }

  /**
   * Derive encryption key from user's API token
   */
  private deriveKeyFromToken(token: string): Buffer {
    return crypto.scryptSync(token, 'wxkanban-kit-salt', KEY_LENGTH);
  }

  /**
   * Encrypt DATABASE_URL using user's API token as key
   */
  encryptDatabaseUrl(databaseUrl: string, apiToken: string): EncryptedData {
    const key = this.deriveKeyFromToken(apiToken);
    const iv = crypto.randomBytes(IV_LENGTH);
    
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    let encrypted = cipher.update(databaseUrl, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
    };
  }

  /**
   * Decrypt DATABASE_URL using user's API token
   */
  decryptDatabaseUrl(encryptedData: EncryptedData, apiToken: string): string {
    const key = this.deriveKeyFromToken(apiToken);
    const iv = Buffer.from(encryptedData.iv, 'hex');
    const authTag = Buffer.from(encryptedData.authTag, 'hex');
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  /**
   * Server-side encrypt for storage (additional security layer)
   */
  serverSideEncrypt(data: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, this.serverKey, iv);
    
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  /**
   * Server-side decrypt
   */
  serverSideDecrypt(encryptedString: string): string {
    const [ivHex, authTagHex, encrypted] = encryptedString.split(':');
    
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    
    const decipher = crypto.createDecipheriv(ALGORITHM, this.serverKey, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  /**
   * Generate a secure API token
   */
  generateApiToken(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  /**
   * Hash token for database lookup (one-way)
   */
  hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}

// Export singleton instance
export const kitEncryptionService = KitEncryptionService.getInstance();
