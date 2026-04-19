#!/usr/bin/env node
/**
 * MCP Server Project Initialization
 * Follows the same methodology as KitGenerationService
 * 
 * Usage: node init-project.mjs --INIT <projectId>
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const initIndex = args.findIndex(arg => arg === '--INIT' || arg === '--init');
  
  if (initIndex === -1 || !args[initIndex + 1]) {
    console.error('❌ Usage: node init-project.mjs --INIT <projectId>');
    process.exit(1);
  }
  
  return {
    projectId: args[initIndex + 1],
    init: true
  };
}

// Generate a secure API token
function generateApiToken() {
  const bytes = crypto.randomBytes(32);
  return 'wxk_live_' + bytes.toString('hex');
}

// Encrypt database URL using AES-256-GCM (same as KitEncryptionService)
function encryptDatabaseUrl(dbUrl, apiToken) {
  const ALGORITHM = 'aes-256-gcm';
  const KEY_LENGTH = 32;
  const IV_LENGTH = 16;
  
  // Derive key from token using scrypt
  const key = crypto.scryptSync(apiToken, 'wxkanban-kit-salt', KEY_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(dbUrl, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  
  return {
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    encrypted: encrypted
  };
}

// Load existing .env file
function loadEnvFile() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) {
    console.error('❌ .env file not found. Please create it first with DATABASE_URL.');
    process.exit(1);
  }
  
  const envContent = fs.readFileSync(envPath, 'utf-8');
  const env = {};
  
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex > 0) {
      const key = trimmed.substring(0, eqIndex).trim();
      const value = trimmed.substring(eqIndex + 1).trim();
      env[key] = value;
    }
  }
  
  return { env, envPath, envContent };
}

// Decrypt database URL using AES-256-GCM (same as KitEncryptionService)
function decryptDatabaseUrl(encryptedString, apiToken) {
  const ALGORITHM = 'aes-256-gcm';
  const KEY_LENGTH = 32;
  
  const parts = encryptedString.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted format. Expected: iv:authTag:ciphertext');
  }
  
  const [ivHex, authTagHex, encrypted] = parts;
  
  // Derive key from token using scrypt
  const key = crypto.scryptSync(apiToken, 'wxkanban-kit-salt', KEY_LENGTH);
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

// Initialize project
async function initProject() {
  const { projectId, init } = parseArgs();
  
  if (!init) {
    console.error('❌ --INIT flag is required');
    process.exit(1);
  }
  
  console.log(`🔧 Initializing MCP server for project: ${projectId}`);
  
  // Load current .env
  const { env, envPath, envContent } = loadEnvFile();
  
  // Get database URL - PRIORITY 1: From process.env (same as KitGenerationService)
  let dbUrl = process.env.DATABASE_URL || process.env.WXKANBAN_MCP_DATABASE_URL;
  
  // PRIORITY 2: From .env file (plain)
  if (!dbUrl) {
    dbUrl = env.DATABASE_URL || env.WXKANBAN_MCP_DATABASE_URL;
  }
  
  // PRIORITY 3: Decrypt existing encrypted URL
  if (!dbUrl && env.DATABASE_URL_ENCRYPTED && env.WXKANBAN_API_TOKEN) {
    try {
      console.log('🔓 Decrypting existing database URL from .env...');
      dbUrl = decryptDatabaseUrl(env.DATABASE_URL_ENCRYPTED, env.WXKANBAN_API_TOKEN);
      console.log('   ✅ Decrypted successfully');
    } catch (error) {
      console.error('❌ Failed to decrypt existing DATABASE_URL_ENCRYPTED:', error.message);
      process.exit(1);
    }
  }
  
  if (!dbUrl) {
    console.error('❌ No database URL found. The init script checks in this order:');
    console.error('   1. process.env.DATABASE_URL (from parent process)');
    console.error('   2. process.env.WXKANBAN_MCP_DATABASE_URL (from parent process)');
    console.error('   3. DATABASE_URL in .env file');
    console.error('   4. WXKANBAN_MCP_DATABASE_URL in .env file');
    console.error('   5. Decrypt DATABASE_URL_ENCRYPTED using WXKANBAN_API_TOKEN');
    console.error('');
    console.error('   To fix: Ensure DATABASE_URL is set in your environment');
    console.error('   or add it to mcp-server/.env file');
    process.exit(1);
  }
  
  console.log('✅ Database URL obtained');
  
  // Generate API token
  const apiToken = generateApiToken();
  console.log('🔑 Generated new API token');
  
  // Encrypt database URL
  const encrypted = encryptDatabaseUrl(dbUrl, apiToken);
  const encryptedString = `${encrypted.iv}:${encrypted.authTag}:${encrypted.encrypted}`;
  console.log('🔒 Re-encrypted database URL with new token');
  
  // Update .env file with encrypted format
  const newEnvContent = `# wxKanban MCP Server Environment Configuration
# Project ID: ${projectId}

# ============================================
# DATABASE CONNECTION (Encrypted)
# ============================================
# DATABASE_URL is encrypted using AES-256-GCM with your WXKANBAN_API_TOKEN
# Format: iv_hex:authTag_hex:ciphertext_hex
DATABASE_URL_ENCRYPTED=${encryptedString}

# Your personal API token for decrypting DATABASE_URL
WXKANBAN_API_TOKEN=${apiToken}

# ============================================
# PROJECT CONTEXT
# ============================================
WXKANBAN_PROJECT_ID=${projectId}

# ============================================
# API AUTHENTICATION
# ============================================
API_KEY=${env.API_KEY || 'dev_api_key_change_in_production'}

# ============================================
# SERVER CONFIGURATION
# ============================================
LOG_LEVEL=${env.LOG_LEVEL || 'info'}
TRANSPORT=${env.TRANSPORT || 'http'}
MCP_HTTP_URL=${env.MCP_HTTP_URL || 'http://localhost:3002'}

# ============================================
# NOTES
# ============================================
# - Never commit this file to git (it's in .gitignore)
# - The decrypted DATABASE_URL is held in memory only
# - If you lose your API token, regenerate with: node init-project.mjs --INIT ${projectId}
`;
  
  fs.writeFileSync(envPath, newEnvContent);
  console.log('✅ Updated .env file with encrypted credentials');
  
  // Create .wxkanban-project.json
  const projectConfig = {
    projectId: projectId,
    version: '2.0.0',
    createdAt: new Date().toISOString(),
    mode: 'new',
    kitVersion: '2.0.0',
    mcpServer: 'mcp-server/dist/index-http.js',
    mcpTransport: 'http',
    mcpHttpUrl: 'http://localhost:3002',
    mcpStartupScript: 'scripts/setup-mcp.mjs',
    commandsDir: '_wxAI/commands/',
    rulesDir: '_wxAI/rules/',
    vscodeDir: '.vscode/'
  };
  
  const projectConfigPath = path.join(__dirname, '..', '.wxkanban-project.json');
  fs.writeFileSync(projectConfigPath, JSON.stringify(projectConfig, null, 2));
  console.log('✅ Created .wxkanban-project.json');

  // Create .vscode/tasks.json for auto-starting MCP server on project open
  const vscodeDirPath = path.join(__dirname, '..', '.vscode');
  if (!fs.existsSync(vscodeDirPath)) {
    fs.mkdirSync(vscodeDirPath, { recursive: true });
  }
  const vscodeTasksPath = path.join(vscodeDirPath, 'tasks.json');
  if (!fs.existsSync(vscodeTasksPath)) {
    const vscodeTasks = {
      "version": "2.0.0",
      "tasks": [
        {
          "label": "Start MCP Server",
          "type": "shell",
          "command": "node",
          "args": ["scripts/setup-mcp.mjs"],
          "isBackground": true,
          "problemMatcher": [],
          "presentation": {
            "reveal": "silent",
            "panel": "dedicated",
            "showReuseMessage": false
          },
          "runOptions": {
            "runOn": "folderOpen"
          }
        }
      ]
    };
    fs.writeFileSync(vscodeTasksPath, JSON.stringify(vscodeTasks, null, 2) + '\n');
    console.log('✅ Created .vscode/tasks.json (MCP auto-start on project open)');
  } else {
    console.log('ℹ️  .vscode/tasks.json already exists, skipping');
  }
  
  // Create ai-settings.json
  const aiSettings = {
    _comment: "wxKanban AI Settings — MCP Project Hub (017)",
    version: '2.0.0',
    primaryAI: 'claude-code',
    project: {
      id: projectId,
      name: "Test Project",
      wxkanban_url: "https://wxkanban.wxperts.com"
    },
    mcpRuntime: {
      transport: 'http',
      baseUrl: 'http://localhost:3002',
      preferredEntrypoint: 'mcp-server/dist/index-http.js',
      startupScript: 'node scripts/setup-mcp.mjs',
      healthEndpoint: 'http://localhost:3002/health',
      validation: {
        primary: 'GET /health',
        secondary: 'POST /call using a known tool',
        note: 'Do not rely on GET /tools as the only readiness check.'
      }
    },
    mcpServers: {
      wxkanban: {
        transport: 'http',
        url: 'http://localhost:3002',
        env: {
          DATABASE_URL_ENCRYPTED: encryptedString,
          WXKANBAN_API_TOKEN: apiToken,
          WXKANBAN_PROJECT_ID: projectId,
          API_KEY: env.API_KEY || 'dev_api_key_change_in_production',
          MCP_HTTP_URL: 'http://localhost:3002'
        }
      }
    }
  };
  
  const aiSettingsPath = path.join(__dirname, '..', 'ai-settings.json');
  fs.writeFileSync(aiSettingsPath, JSON.stringify(aiSettings, null, 2));
  console.log('✅ Created ai-settings.json');
  
  console.log('');
  console.log('🎉 MCP Server initialization complete!');
  console.log('');
  console.log('Project ID:', projectId);
  console.log('API Token:', apiToken);
  // Configure git hooks path to use .husky/ for pre-commit enforcement
  try {
    execSync('git config core.hooksPath .husky', { cwd: path.join(__dirname, '..'), stdio: 'ignore' });
    console.log('✅ Configured git hooks path (.husky/pre-commit enforcement active)');
  } catch {
    console.log('ℹ️  Could not configure git hooks path (not a git repo or git not available)');
  }

  console.log('');
  console.log('Next steps:');
  console.log('  1. Build the MCP server: cd mcp-server && npm run build');
  console.log('  2. Test the setup: cd mcp-server && node verify-setup.mjs');
  console.log('  3. Start the server: node scripts/setup-mcp.mjs');
  console.log('     (or just open the project in VS Code — MCP starts automatically)');
  console.log('');
  console.log('⚠️  IMPORTANT: Save your API token securely. If lost, you must re-run initialization.');
}

initProject().catch(error => {
  console.error('❌ Initialization failed:', error);
  process.exit(1);
});
