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
  encrypted: '527664b4663f2e28f2fdccf2dfe14ba56861494995b368cd4599c628d69ebebef39211954d9855b81e5d2124661d58474d486de411136ee4a6adc6c4205b54c801e7306bf17a3e87591cab3d403e29bc04a64d3a4a61f8c1225dc6378d982bfb28ea0b57c1f93258fce8400cfe9b1e9cf07df051b7739ae555bf7f8808b36343928d5c7c9bb57ae7e99949d2f683',
  iv: '0439abd4dcc2f62f23e28d84c17e42ea',
  authTag: '931195a4b8be00cf3187572d5877423e',
  version: '1.0',
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
 * True when EMBEDDED_DATABASE_URL is the unpatched placeholder shipped in
 * source. The kit-author build replaces this object with real ciphertext
 * (KitGenerationService); on a consumer install where that replacement
 * never happens, every field is empty. Treating that as "not embedded"
 * avoids noisy decrypt-failure logs at startup.
 */
function hasUsableEmbeddedCredentials(): boolean {
  if (!EMBEDDED_DATABASE_URL) return false;
  return Boolean(
    EMBEDDED_DATABASE_URL.encrypted &&
    EMBEDDED_DATABASE_URL.iv &&
    EMBEDDED_DATABASE_URL.authTag
  );
}

/**
 * Get database URL from embedded credentials
 * This is the primary secure method - credentials are embedded at build time
 */
function getEmbeddedDatabaseUrl(): string | null {
  try {
    if (!hasUsableEmbeddedCredentials()) {
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
 * Get database URL — priority order:
 *   1. WXKANBAN_MCP_DATABASE_URL (env)            — consumer projects
 *   2. Embedded credentials                       — kit-author dogfooding
 *   3. DATABASE_URL_ENCRYPTED + WXKANBAN_API_TOKEN — legacy
 *   4. DATABASE_URL                                — dev only
 *
 * Why env first: in a consumer project that installs the kit, the embedded
 * credentials are kit-author state and must be ignored — the consumer uses
 * its own DB via env. Checking env first keeps the consumer flow silent
 * (no spurious "Failed to decrypt embedded database URL" log) and matches
 * the rule that consumer projects must recognize + ignore the wxKanban PG
 * connection that ships in the kit.
 */
function getDatabaseUrl(): string {
  // Priority 1: explicit env DB URL — consumer projects, dev overrides
  if (env.WXKANBAN_MCP_DATABASE_URL) {
    return env.WXKANBAN_MCP_DATABASE_URL;
  }

  // Priority 2: Embedded credentials (kit-author dogfooding only)
  const embedded = getEmbeddedDatabaseUrl();
  if (embedded) {
    return embedded;
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
