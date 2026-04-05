/**
 * Embedded Credential Decryption Module
 * 
 * This module handles decryption of build-time embedded credentials.
 * The encrypted DATABASE_URL is embedded directly in the compiled code,
 * making it invisible to project files and immune to AI interference.
 * 
 * Security Model:
 * - Credentials are encrypted at build time using a unique key
 * - Encrypted value is embedded as a constant in the compiled code
 * - Decryption occurs only at runtime using the WXKANBAN_API_TOKEN
 * - Original credentials never exist in any file on disk
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const SALT = 'wxkanban-mcp-embedded-v1';

export interface EmbeddedCredentials {
  encrypted: string;
  iv: string;
  authTag: string;
  version: string;
}

/**
 * Derive decryption key from API token
 * Uses scrypt for key derivation with fixed salt
 */
function deriveKey(apiToken: string): Buffer {
  return crypto.scryptSync(apiToken, SALT, KEY_LENGTH);
}

/**
 * Decrypt embedded credentials at runtime
 * 
 * @param embedded - The embedded encrypted credentials
 * @param apiToken - The WXKANBAN_API_TOKEN for decryption
 * @returns Decrypted credential string
 * @throws Error if decryption fails (wrong token or tampered data)
 */
export function decryptEmbeddedCredentials(
  embedded: EmbeddedCredentials,
  apiToken: string
): string {
  try {
    const key = deriveKey(apiToken);
    const iv = Buffer.from(embedded.iv, 'hex');
    const authTag = Buffer.from(embedded.authTag, 'hex');
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(embedded.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    throw new Error(
      `Failed to decrypt embedded credentials: ${error instanceof Error ? error.message : String(error)}. ` +
      'Ensure WXKANBAN_API_TOKEN is correct and matches the build-time token.'
    );
  }
}

/**
 * Verify that embedded credentials are valid format
 * Does NOT decrypt - just validates structure
 */
export function validateEmbeddedCredentials(
  embedded: unknown
): embedded is EmbeddedCredentials {
  if (!embedded || typeof embedded !== 'object') return false;
  
  const creds = embedded as Record<string, unknown>;
  
  return (
    typeof creds.encrypted === 'string' &&
    typeof creds.iv === 'string' &&
    typeof creds.authTag === 'string' &&
    typeof creds.version === 'string' &&
    creds.version === '1.0'
  );
}

/**
 * Build-time encryption function
 * Used during kit generation to create embedded credentials
 * 
 * @param credential - The credential to encrypt (e.g., DATABASE_URL)
 * @param apiToken - The API token to use as encryption key
 * @returns EmbeddedCredentials object for embedding in code
 */
export function encryptForEmbedding(
  credential: string,
  apiToken: string
): EmbeddedCredentials {
  const key = deriveKey(apiToken);
  const iv = crypto.randomBytes(IV_LENGTH);
  
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(credential, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return {
    encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    version: '1.0',
  };
}

/**
 * Check if running with embedded credentials mode
 * This is determined by checking for the embedded constant
 */
export function hasEmbeddedCredentials(): boolean {
  try {
    // This will be replaced at build time with actual check
    return typeof EMBEDDED_DATABASE_URL !== 'undefined';
  } catch {
    return false;
  }
}

// Build-time constant - will be replaced during kit generation
// This line is a placeholder that gets replaced with actual encrypted data
declare const EMBEDDED_DATABASE_URL: EmbeddedCredentials | undefined;

/**
 * Get database URL from embedded credentials
 * Returns null if no embedded credentials available
 */
export function getEmbeddedDatabaseUrl(apiToken: string): string | null {
  try {
    if (typeof EMBEDDED_DATABASE_URL === 'undefined' || !EMBEDDED_DATABASE_URL) {
      return null;
    }
    
    if (!validateEmbeddedCredentials(EMBEDDED_DATABASE_URL)) {
      throw new Error('Invalid embedded credentials format');
    }
    
    return decryptEmbeddedCredentials(EMBEDDED_DATABASE_URL, apiToken);
  } catch (error) {
    console.error('Failed to get embedded database URL:', error);
    return null;
  }
}
