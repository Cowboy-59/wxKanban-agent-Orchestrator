#!/usr/bin/env node

/**
 * Build MCP Server with Embedded Credentials
 * 
 * This script:
 * 1. Takes the DATABASE_URL and API_TOKEN as inputs
 * 2. Encrypts the credentials using the embedded crypto system
 * 3. Modifies mcp-server/src/config.ts to include the embedded credentials
 * 4. Builds the MCP server with the embedded config
 * 
 * Usage:
 *   node scripts/build-mcp-with-embedded-config.mjs \
 *     --db-url="postgresql://..." \
 *     --api-token="wxk_..." \
 *     --output-dir="./dist/mcp-server"
 * 
 * Security:
 * - Credentials are encrypted and embedded at build time
 * - Original DATABASE_URL never appears in any output file
 * - Each build gets unique encryption
 */

import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync, rmSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const MCP_DIR = join(ROOT, 'mcp-server');
const CONFIG_FILE = join(MCP_DIR, 'src', 'config.ts');

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const SALT = 'wxkanban-mcp-embedded-v1';

// Colors for output
const colors = {
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
};

function log(prefix, color, message) {
  console.log(`${color}[${prefix}]${colors.reset} ${message}`);
}

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

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    dbUrl: null,
    apiToken: null,
    outputDir: join(ROOT, 'dist', 'mcp-server'),
    skipBuild: false,
  };

  for (const arg of args) {
    if (arg.startsWith('--db-url=')) {
      options.dbUrl = arg.slice(9);
    } else if (arg.startsWith('--api-token=')) {
      options.apiToken = arg.slice(12);
    } else if (arg.startsWith('--output-dir=')) {
      options.outputDir = arg.slice(13);
    } else if (arg === '--skip-build') {
      options.skipBuild = true;
    }
  }

  return options;
}

function validateOptions(options) {
  if (!options.dbUrl) {
    log('error', colors.red, 'Missing required --db-url parameter');
    return false;
  }

  if (!options.dbUrl.startsWith('postgresql://')) {
    log('error', colors.red, 'DATABASE_URL must start with postgresql://');
    return false;
  }

  if (!options.apiToken) {
    log('error', colors.red, 'Missing required --api-token parameter');
    return false;
  }

  if (options.apiToken.length < 16) {
    log('error', colors.red, 'API token must be at least 16 characters');
    return false;
  }

  return true;
}

function backupConfig() {
  const backupPath = `${CONFIG_FILE}.backup`;
  if (!existsSync(backupPath)) {
    copyFileSync(CONFIG_FILE, backupPath);
    log('backup', colors.cyan, `Created backup: ${backupPath}`);
  }
}

function restoreConfig() {
  const backupPath = `${CONFIG_FILE}.backup`;
  if (existsSync(backupPath)) {
    copyFileSync(backupPath, CONFIG_FILE);
    log('restore', colors.cyan, 'Restored original config');
  }
}

function embedCredentials(configContent, encryptedData) {
  // Find and replace the EMBEDDED_DATABASE_URL constant
  const embeddedCode = `{
  encrypted: "${encryptedData.encrypted}",
  iv: "${encryptedData.iv}",
  authTag: "${encryptedData.authTag}",
  version: "${encryptedData.version}"
}`;

  // Replace the placeholder line
  const pattern = /const EMBEDDED_DATABASE_URL: EmbeddedCredentials \| undefined = undefined; \/\/ Replaced at build time/;
  const replacement = `const EMBEDDED_DATABASE_URL: EmbeddedCredentials | undefined = ${embeddedCode}; // Embedded at build time`;
  
  if (!pattern.test(configContent)) {
    // Try alternative pattern without comment
    const altPattern = /const EMBEDDED_DATABASE_URL: EmbeddedCredentials \| undefined = undefined;/;
    if (altPattern.test(configContent)) {
      return configContent.replace(altPattern, replacement);
    }
    throw new Error('Could not find EMBEDDED_DATABASE_URL placeholder in config.ts');
  }

  return configContent.replace(pattern, replacement);
}

function buildMcpServer(outputDir) {
  log('build', colors.magenta, 'Building MCP server...');

  try {
    // Install dependencies if needed
    const nodeModulesPath = join(MCP_DIR, 'node_modules');
    if (!existsSync(nodeModulesPath)) {
      log('deps', colors.yellow, 'Installing MCP dependencies...');
      execSync('npm install', {
        cwd: MCP_DIR,
        stdio: 'inherit',
        shell: true,
      });
    }

    // Build the TypeScript
    log('tsc', colors.cyan, 'Compiling TypeScript...');
    execSync('npx tsc', {
      cwd: MCP_DIR,
      stdio: 'inherit',
      shell: true,
    });

    // Copy built files to output directory
    const distDir = join(MCP_DIR, 'dist');
    if (!existsSync(distDir)) {
      throw new Error('Build failed: dist directory not created');
    }

    // Ensure output directory exists
    if (existsSync(outputDir)) {
      rmSync(outputDir, { recursive: true });
    }
    mkdirSync(outputDir, { recursive: true });

    // Copy all built files
    const files = execSync(`find ${distDir} -type f`, { encoding: 'utf8', shell: true })
      .trim()
      .split('\n')
      .filter(f => f);

    for (const file of files) {
      const relativePath = file.replace(distDir, '').replace(/^\/+/, '');
      const targetPath = join(outputDir, relativePath);
      const targetDir = dirname(targetPath);
      
      if (!existsSync(targetDir)) {
        mkdirSync(targetDir, { recursive: true });
      }
      
      copyFileSync(file, targetPath);
    }

    log('build', colors.green, `MCP server built successfully: ${outputDir}`);
    return true;
  } catch (error) {
    log('error', colors.red, `Build failed: ${error.message}`);
    return false;
  }
}

function main() {
  console.log(`\n${colors.bold}${colors.magenta}╔════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.bold}${colors.magenta}║     MCP Server Build with Embedded Credentials        ║${colors.reset}`);
  console.log(`${colors.bold}${colors.magenta}╚════════════════════════════════════════════════════════╝${colors.reset}\n`);

  const options = parseArgs();

  if (!validateOptions(options)) {
    console.log('\nUsage:');
    console.log('  node scripts/build-mcp-with-embedded-config.mjs \\');
    console.log('    --db-url="postgresql://user:pass@host:5432/db" \\');
    console.log('    --api-token="wxk_your_api_token" \\');
    console.log('    [--output-dir="./dist/mcp-server"] \\');
    console.log('    [--skip-build]');
    process.exit(1);
  }

  try {
    // Step 1: Backup original config
    backupConfig();

    // Step 2: Encrypt credentials
    log('encrypt', colors.cyan, 'Encrypting credentials...');
    const encrypted = encryptForEmbedding(options.dbUrl, options.apiToken);
    log('encrypt', colors.green, 'Credentials encrypted successfully');

    // Step 3: Read and modify config
    log('config', colors.cyan, 'Embedding credentials in config...');
    let configContent = readFileSync(CONFIG_FILE, 'utf8');
    configContent = embedCredentials(configContent, encrypted);
    writeFileSync(CONFIG_FILE, configContent, 'utf8');
    log('config', colors.green, 'Credentials embedded in config.ts');

    // Step 4: Build (if not skipped)
    if (!options.skipBuild) {
      const success = buildMcpServer(options.outputDir);
      if (!success) {
        throw new Error('Build failed');
      }
    }

    // Step 5: Restore original config
    restoreConfig();

    console.log(`\n${colors.bold}${colors.green}✅ MCP Server Build Complete!${colors.reset}\n`);
    console.log(`${colors.cyan}Output Directory:${colors.reset} ${options.outputDir}`);
    console.log(`${colors.cyan}Security:${colors.reset} Credentials are embedded and encrypted`);
    console.log(`${colors.cyan}Decryption:${colors.reset} Requires WXKANBAN_API_TOKEN at runtime\n`);

  } catch (error) {
    log('error', colors.red, `Build failed: ${error.message}`);
    restoreConfig();
    process.exit(1);
  }
}

main();
