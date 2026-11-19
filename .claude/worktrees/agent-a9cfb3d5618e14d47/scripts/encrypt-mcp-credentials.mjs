#!/usr/bin/env node

/**
 * MCP Credentials Build-Time Encryption Script
 * 
 * This script encrypts the MCP DATABASE_URL at build time and prepares
 * it for embedding directly into the MCP server code.
 * 
 * Usage:
 *   node scripts/encrypt-mcp-credentials.mjs <database-url> <api-token>
 * 
 * Output:
 *   JSON object with encrypted credentials ready for embedding
 * 
 * Security:
 * - Credentials are encrypted using AES-256-GCM
 * - API token is used as the encryption key
 * - Output is designed to be embedded as a TypeScript constant
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const SALT = 'wxkanban-mcp-embedded-v1';

function deriveKey(apiToken) {
  return crypto.scryptSync(apiToken, SALT, KEY_LENGTH);
}

function encryptForEmbedding(credential, apiToken) {
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

function generateEmbeddedCode(encryptedData) {
  return `{
  encrypted: "${encryptedData.encrypted}",
  iv: "${encryptedData.iv}",
  authTag: "${encryptedData.authTag}",
  version: "${encryptedData.version}"
}`;
}

function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.error('Usage: node encrypt-mcp-credentials.mjs <database-url> <api-token>');
    console.error('');
    console.error('Example:');
    console.error('  node encrypt-mcp-credentials.mjs "postgresql://..." "wxk_abc123..."');
    process.exit(1);
  }

  const [databaseUrl, apiToken] = args;

  // Validate inputs
  if (!databaseUrl.startsWith('postgresql://')) {
    console.error('Error: DATABASE_URL must start with postgresql://');
    process.exit(1);
  }

  if (apiToken.length < 16) {
    console.error('Error: API token must be at least 16 characters');
    process.exit(1);
  }

  try {
    // Encrypt the credentials
    const encrypted = encryptForEmbedding(databaseUrl, apiToken);
    
    // Output as JSON for programmatic use
    console.log(JSON.stringify({
      success: true,
      embedded: encrypted,
      code: generateEmbeddedCode(encrypted),
    }, null, 2));

    // Also output the code block for manual insertion
    console.error('\n--- TypeScript Code for Embedding ---');
    console.error('Replace the EMBEDDED_DATABASE_URL constant in mcp-server/src/config.ts with:');
    console.error('');
    console.error(`const EMBEDDED_DATABASE_URL: EmbeddedCredentials | undefined = ${generateEmbeddedCode(encrypted)};`);
    console.error('');
    console.error('--- End TypeScript Code ---\n');

  } catch (error) {
    console.error('Encryption failed:', error.message);
    process.exit(1);
  }
}

main();
