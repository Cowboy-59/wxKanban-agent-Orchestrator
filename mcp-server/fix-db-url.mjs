#!/usr/bin/env node
/**
 * Fix Database URL Encoding
 * Properly encodes special characters in the database URL
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read current .env file
const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf-8');

// Extract the current database URL
const dbUrlMatch = envContent.match(/WXKANBAN_MCP_DATABASE_URL=(.+)/);
if (!dbUrlMatch) {
  console.error('❌ Could not find WXKANBAN_MCP_DATABASE_URL in .env file');
  process.exit(1);
}

const currentUrl = dbUrlMatch[1].trim();
console.log('Current URL:', currentUrl);

// Parse and fix the URL
try {
  const url = new URL(currentUrl);
  
  // The password should be properly URL-encoded
  // pK%wjT2BFE%#mU0h needs to be encoded as pK%25wjT2BFE%25%23mU0h
  const password = url.password;
  console.log('Current password:', password);
  
  // If password contains %, it might be double-encoded or not encoded properly
  // Let's decode it first, then re-encode properly
  let decodedPassword;
  try {
    decodedPassword = decodeURIComponent(password);
  } catch (e) {
    // If decoding fails, use as-is
    decodedPassword = password;
  }
  
  console.log('Decoded password:', decodedPassword);
  
  // Re-encode the password properly
  const encodedPassword = encodeURIComponent(decodedPassword);
  console.log('Re-encoded password:', encodedPassword);
  
  // Rebuild the URL with properly encoded password
  const fixedUrl = `postgresql://${url.username}:${encodedPassword}@${url.hostname}:${url.port}${url.pathname}${url.search}`;
  console.log('Fixed URL:', fixedUrl);
  
  // Update the .env file
  const newEnvContent = envContent.replace(
    /WXKANBAN_MCP_DATABASE_URL=.+/,
    `WXKANBAN_MCP_DATABASE_URL=${fixedUrl}`
  );
  
  fs.writeFileSync(envPath, newEnvContent);
  console.log('✅ Database URL fixed in .env file');
  
} catch (error) {
  console.error('❌ Error parsing URL:', error.message);
  
  // If URL is invalid, try to fix common issues
  console.log('\nAttempting manual fix...');
  
  // Replace the URL with a properly formatted one
  // Original: postgresql://wxKanban:pK%wjT2BFE%#mU0h@pgkanban.wxperts.com:5432/wxKanban?schema=wxkanban&sslmode=require
  // The % and # in password need to be encoded as %25 and %23
  
  const fixedUrl = 'postgresql://wxKanban:pK%25wjT2BFE%25%23mU0h@pgkanban.wxperts.com:5432/wxKanban?schema=wxkanban&sslmode=require';
  
  const newEnvContent = envContent.replace(
    /WXKANBAN_MCP_DATABASE_URL=.+/,
    `WXKANBAN_MCP_DATABASE_URL=${fixedUrl}`
  );
  
  fs.writeFileSync(envPath, newEnvContent);
  console.log('✅ Database URL manually fixed in .env file');
  console.log('New URL:', fixedUrl);
}
