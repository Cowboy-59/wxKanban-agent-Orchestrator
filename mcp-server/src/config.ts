import crypto from 'crypto';
import {
  decryptEmbeddedCredentials,
  validateEmbeddedCredentials,
  type EmbeddedCredentials,
} from './utils/embedded-crypto.js';

export interface ServerConfig {
  databaseUrl: string;
  apiKey: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  transport: 'stdio' | 'http';
  httpPort?: number;
  mcpLogPayloads: boolean;
  mcpLogRawChat: boolean;
  mcpLogMaxFieldChars: number;
}

export interface EncryptedData {
  encrypted: string;
  iv: string;
  authTag: string;
}

/**
 * EMBEDDED CREDENTIALS - Build-time constant
 * 
 * This is populated during kit generation with the encrypted DATABASE_URL.
 * The encryption uses the project's unique WXKANBAN_API_TOKEN as the key.
 * 
 * SECURITY: This value is embedded at build time and never exists in any
 * file on disk. It is unique per kit and cannot be read by project code.
 */
const EMBEDDED_DATABASE_URL: EmbeddedCredentials | undefined = {
  encrypted: '',
  iv: '',
  authTag: '',
  version: '1.0.0',
};

/**
 * Load environment variables from system only
 * We intentionally do NOT load from .env files to prevent AI interference
 */
function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {};

  // Only load from process.env - never from .env files
  // This prevents AI or project code from modifying MCP configuration
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }

  return env;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

const env = loadEnv();

/**
 * Decrypt DATABASE_URL using AES-256-GCM with WXKANBAN_API_TOKEN as key
 * Legacy support for non-embedded encrypted format
 */
function decryptDatabaseUrl(encryptedData: EncryptedData, apiToken: string): string {
  const ALGORITHM = 'aes-256-gcm';
  const KEY_LENGTH = 32;
  
  // Derive key from token using scrypt (same as KitEncryptionService)
  const key = crypto.scryptSync(apiToken, 'wxkanban-kit-salt', KEY_LENGTH);
  const iv = Buffer.from(encryptedData.iv, 'hex');
  const authTag = Buffer.from(encryptedData.authTag, 'hex');
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

/**
 * Parse encrypted DATABASE_URL from env
 * Format: <iv_hex>:<authTag_hex>:<ciphertext_hex>
 */
function parseEncryptedDatabaseUrl(encryptedString: string): EncryptedData {
  const parts = encryptedString.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid DATABASE_URL_ENCRYPTED format. Expected: iv:authTag:ciphertext');
  }
  
  return {
    iv: parts[0],
    authTag: parts[1],
    encrypted: parts[2],
  };
}

/**
 * Get database URL from embedded credentials
 * This is the primary secure method - credentials are embedded at build time
 */
function getEmbeddedDatabaseUrl(): string | null {
  try {
    // Check if we have embedded credentials (set at build time)
    if (!EMBEDDED_DATABASE_URL) {
      return null;
    }

    if (!validateEmbeddedCredentials(EMBEDDED_DATABASE_URL)) {
      throw new Error('Invalid embedded credentials format');
    }

    const apiToken = env.WXKANBAN_API_TOKEN;
    if (!apiToken) {
      throw new Error('WXKANBAN_API_TOKEN required to decrypt embedded credentials');
    }

    return decryptEmbeddedCredentials(EMBEDDED_DATABASE_URL, apiToken);
  } catch (error) {
    console.error('Failed to decrypt embedded database URL:', error);
    return null;
  }
}

/**
 * Get database URL - priority: embedded > system env > legacy encrypted
 * 
 * SECURITY NOTE: We never read from .env files. The embedded credentials
 * are the primary source, providing zero-exposure security.
 */
function getDatabaseUrl(): string {
  // Priority 1: Embedded credentials (most secure, zero file exposure)
  const embedded = getEmbeddedDatabaseUrl();
  if (embedded) {
    return embedded;
  }

  // Priority 2: System environment variable (for development/override)
  if (env.WXKANBAN_MCP_DATABASE_URL) {
    return env.WXKANBAN_MCP_DATABASE_URL;
  }

  // Priority 3: Legacy encrypted format (for backward compatibility)
  if (env.DATABASE_URL_ENCRYPTED && env.WXKANBAN_API_TOKEN) {
    try {
      const encryptedData = parseEncryptedDatabaseUrl(env.DATABASE_URL_ENCRYPTED);
      return decryptDatabaseUrl(encryptedData, env.WXKANBAN_API_TOKEN);
    } catch (error) {
      throw new Error(
        `Failed to decrypt DATABASE_URL_ENCRYPTED: ${error instanceof Error ? error.message : String(error)}. ` +
        'Ensure WXKANBAN_API_TOKEN is correct.'
      );
    }
  }
  
  // Priority 4: Plain DATABASE_URL (least secure, for development only)
  if (env.DATABASE_URL) {
    console.warn('WARNING: Using plain DATABASE_URL from environment. ' +
      'This is insecure and should only be used in development.');
    return env.DATABASE_URL;
  }
  
  return '';
}

export const config: ServerConfig = {
  databaseUrl: getDatabaseUrl(),
  apiKey: env.API_KEY || '',
  logLevel: (env.LOG_LEVEL as ServerConfig['logLevel']) || 'info',
  transport: (env.TRANSPORT as ServerConfig['transport']) || 'stdio',
  httpPort: env.HTTP_PORT ? parseInt(env.HTTP_PORT, 10) : 3000,
  mcpLogPayloads: parseBoolean(env.MCP_LOG_PAYLOADS, false),
  mcpLogRawChat: parseBoolean(env.MCP_LOG_RAW_CHAT, false),
  mcpLogMaxFieldChars: parsePositiveInt(env.MCP_LOG_MAX_FIELD_CHARS, 4000),
};

// Validation
if (!config.databaseUrl) {
  throw new Error(
    'DATABASE_URL is required. ' +
    'Primary: Use embedded credentials (kit build required). ' +
    'Alternative: Set WXKANBAN_MCP_DATABASE_URL environment variable. ' +
    'Legacy: Set DATABASE_URL_ENCRYPTED and WXKANBAN_API_TOKEN.'
  );
}

if (!config.apiKey) {
  throw new Error('API_KEY is required. Set API_KEY environment variable.');
}

// Clean up database URL (remove sslmode if present for compatibility)
config.databaseUrl = config.databaseUrl
  .replace(/[?&]sslmode=[^&]*/g, '')
  .replace(/\?$/, '');

export default config;
