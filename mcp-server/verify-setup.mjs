#!/usr/bin/env node
/**
 * MCP Server Setup Verification Script
 * Tests database connection and configuration with encrypted credentials
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env file manually (since MCP server doesn't load it)
function loadEnvFile() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) {
    console.error('❌ .env file not found at:', envPath);
    return false;
  }
  
  const envContent = fs.readFileSync(envPath, 'utf-8');
  const lines = envContent.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex > 0) {
      const key = trimmed.substring(0, eqIndex).trim();
      const value = trimmed.substring(eqIndex + 1).trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }
  
  return true;
}

// Load environment variables
console.log('🔍 MCP Server Setup Verification\n');
console.log('1️⃣ Loading environment variables...');
if (!loadEnvFile()) {
  process.exit(1);
}
console.log('   ✅ .env file loaded');

// Check for encrypted credentials
const hasEncryptedUrl = !!process.env.DATABASE_URL_ENCRYPTED;
const hasApiToken = !!process.env.WXKANBAN_API_TOKEN;
const hasProjectId = !!process.env.WXKANBAN_PROJECT_ID;

console.log('');
console.log('2️⃣ Checking encrypted credentials:');
console.log('   DATABASE_URL_ENCRYPTED:', hasEncryptedUrl ? '✅ Set' : '❌ Missing');
console.log('   WXKANBAN_API_TOKEN:', hasApiToken ? '✅ Set' : '❌ Missing');
console.log('   WXKANBAN_PROJECT_ID:', hasProjectId ? '✅ Set (' + process.env.WXKANBAN_PROJECT_ID + ')' : '❌ Missing');

if (!hasEncryptedUrl || !hasApiToken) {
  console.error('');
  console.error('❌ Encrypted credentials not found. Please run:');
  console.error('   node init-project.mjs --INIT <projectId>');
  process.exit(1);
}

// Now import config after loading env
console.log('');
console.log('3️⃣ Loading MCP configuration...');
const { default: config } = await import('./dist/config.js');
const { checkDatabaseConnection } = await import('./dist/db/connection.js');

console.log('   ✅ Configuration loaded');
console.log('');
console.log('4️⃣ Configuration Details:');
console.log('   Database URL:', config.databaseUrl ? '✅ Decrypted successfully' : '❌ Failed to decrypt');
console.log('   API Key:', config.apiKey ? '✅ Set' : '❌ Missing');
console.log('   Log Level:', config.logLevel);
console.log('   Transport:', config.transport);
console.log('');

// Test Database Connection
console.log('5️⃣ Database Connection Test:');
try {
  const connected = await checkDatabaseConnection();
  if (connected) {
    console.log('   ✅ Database connection successful');
  } else {
    console.log('   ❌ Database connection failed');
    process.exit(1);
  }
} catch (error) {
  console.log('   ❌ Database connection error:', error.message);
  process.exit(1);
}

console.log('');
console.log('✅ All checks passed! MCP server is ready to run.');
console.log('');
console.log('To start the server:');
console.log('   npm start');
console.log('');
console.log('Project ID:', process.env.WXKANBAN_PROJECT_ID);
