#!/usr/bin/env node
/**
 * MCP Server Startup Script
 * Loads .env file and starts the MCP server
 * This is needed because the MCP server config intentionally doesn't load .env files
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env file
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex > 0) {
      const key = trimmed.substring(0, eqIndex).trim();
      const value = trimmed.substring(eqIndex + 1).trim();
      // Only set if not already in environment
      if (process.env[key] === undefined || process.env[key] === '') {
        process.env[key] = value;
      }
    }
  }
  
  console.log('✅ Loaded environment from .env file');
}

// Start the MCP server
const serverPath = path.join(__dirname, 'dist', 'index.js');
console.log('🚀 Starting MCP server...');
console.log('');

const child = spawn('node', [serverPath], {
  stdio: 'inherit',
  env: process.env
});

child.on('exit', (code) => {
  process.exit(code);
});
