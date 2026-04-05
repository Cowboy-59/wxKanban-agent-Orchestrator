#!/usr/bin/env node
/**
 * Environment Variable Diagnostic Script
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔍 Environment Variable Diagnostic\n');

// Check process.env directly
console.log('1️⃣ Process Environment Variables:');
console.log('   WXKANBAN_MCP_DATABASE_URL:', process.env.WXKANBAN_MCP_DATABASE_URL ? '✅ Set' : '❌ Not set');
console.log('   DATABASE_URL:', process.env.DATABASE_URL ? '✅ Set' : '❌ Not set');
console.log('   DATABASE_URL_ENCRYPTED:', process.env.DATABASE_URL_ENCRYPTED ? '✅ Set' : '❌ Not set');
console.log('   WXKANBAN_API_TOKEN:', process.env.WXKANBAN_API_TOKEN ? '✅ Set' : '❌ Not set');
console.log('');

// Read .env file directly
const envPath = path.join(__dirname, '.env');
console.log('2️⃣ .env File Check:');
console.log('   Path:', envPath);
console.log('   Exists:', fs.existsSync(envPath) ? '✅ Yes' : '❌ No');

if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf-8');
  console.log('');
  console.log('3️⃣ .env File Contents:');
  console.log('---');
  console.log(content);
  console.log('---');
  
  // Parse and show specific values
  const lines = content.split('\n');
  const env = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex > 0) {
      const key = trimmed.substring(0, eqIndex).trim();
      const value = trimmed.substring(eqIndex + 1).trim();
      env[key] = value;
    }
  }
  
  console.log('');
  console.log('4️⃣ Parsed Values:');
  console.log('   WXKANBAN_MCP_DATABASE_URL:', env.WXKANBAN_MCP_DATABASE_URL ? '✅ Set (' + env.WXKANBAN_MCP_DATABASE_URL.substring(0, 30) + '...)' : '❌ Not set');
  console.log('   DATABASE_URL:', env.DATABASE_URL ? '✅ Set (' + env.DATABASE_URL.substring(0, 30) + '...)' : '❌ Not set');
  console.log('   DATABASE_URL_ENCRYPTED:', env.DATABASE_URL_ENCRYPTED ? '✅ Set (' + env.DATABASE_URL_ENCRYPTED.substring(0, 30) + '...)' : '❌ Not set');
  console.log('   WXKANBAN_API_TOKEN:', env.WXKANBAN_API_TOKEN ? '✅ Set (' + env.WXKANBAN_API_TOKEN.substring(0, 20) + '...)' : '❌ Not set');
  console.log('   WXKANBAN_PROJECT_ID:', env.WXKANBAN_PROJECT_ID ? '✅ Set (' + env.WXKANBAN_PROJECT_ID + ')' : '❌ Not set');
}

console.log('');
console.log('5️⃣ Recommendations:');
if (!fs.existsSync(envPath)) {
  console.log('   ❌ .env file is missing. Create it with:');
  console.log('      WXKANBAN_MCP_DATABASE_URL=postgresql://...');
} else if (!process.env.WXKANBAN_MCP_DATABASE_URL && !process.env.DATABASE_URL && !process.env.DATABASE_URL_ENCRYPTED) {
  console.log('   ⚠️  No database URL found in environment.');
  console.log('   Options:');
  console.log('   1. Set WXKANBAN_MCP_DATABASE_URL in .env file');
  console.log('   2. Set DATABASE_URL in .env file');
  console.log('   3. Ensure DATABASE_URL_ENCRYPTED and WXKANBAN_API_TOKEN are both set');
}
