#!/usr/bin/env node

/**
 * MCP Security Verification Script
 * 
 * This script verifies that the MCP server is properly secured with
 * zero-exposure embedded credentials.
 * 
 * Usage:
 *   node scripts/verify-mcp-security.mjs [options]
 * 
 * Options:
 *   --strict    Fail if any warnings are found
 *   --json      Output results as JSON
 */

import { readFileSync, existsSync, statSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const MCP_DIR = join(ROOT, 'mcp-server');
const CONFIG_FILE = join(MCP_DIR, 'src', 'config.ts');

// Colors for output
const colors = {
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
};

function log(status, message) {
  const color = status === 'PASS' ? colors.green : 
                status === 'WARN' ? colors.yellow : 
                status === 'FAIL' ? colors.red : colors.cyan;
  console.log(`${color}[${status}]${colors.reset} ${message}`);
}

function checkFileExists(path, description) {
  if (existsSync(path)) {
    log('PASS', `${description}: Found`);
    return true;
  } else {
    log('FAIL', `${description}: Not found at ${path}`);
    return false;
  }
}

function checkFileNotExists(path, description) {
  if (!existsSync(path)) {
    log('PASS', `${description}: Not present (good)`);
    return true;
  } else {
    const stats = statSync(path);
    if (stats.size === 0) {
      log('PASS', `${description}: Empty file (acceptable)`);
      return true;
    }
    log('WARN', `${description}: EXISTS at ${path} - should be removed`);
    return false;
  }
}

function checkConfigFile() {
  log('INFO', 'Checking MCP config file...');
  
  if (!existsSync(CONFIG_FILE)) {
    log('FAIL', `Config file not found: ${CONFIG_FILE}`);
    return false;
  }

  const content = readFileSync(CONFIG_FILE, 'utf8');
  const checks = [];

  // Check for embedded credentials constant
  const hasEmbeddedConstant = content.includes('EMBEDDED_DATABASE_URL');
  checks.push({
    name: 'Embedded credentials constant',
    pass: hasEmbeddedConstant,
    message: hasEmbeddedConstant ? 'Found EMBEDDED_DATABASE_URL' : 'Missing embedded credentials support'
  });

  // Check that it doesn't read from .env files
  const readsEnvFile = content.includes("readFileSync") && content.includes(".env");
  checks.push({
    name: 'No .env file reading',
    pass: !readsEnvFile,
    message: readsEnvFile ? 'Config still reads from .env files' : 'Does not read from .env files'
  });

  // Check for system env variable support
  const hasSystemEnv = content.includes('WXKANBAN_MCP_DATABASE_URL');
  checks.push({
    name: 'System environment support',
    pass: hasSystemEnv,
    message: hasSystemEnv ? 'Supports WXKANBAN_MCP_DATABASE_URL' : 'Missing system env support'
  });

  // Check for security comment
  const hasSecurityComment = content.includes('SECURITY:') || content.includes('Zero-Exposure');
  checks.push({
    name: 'Security documentation',
    pass: hasSecurityComment,
    message: hasSecurityComment ? 'Has security comments' : 'Missing security documentation'
  });

  // Check for embedded crypto import
  const hasCryptoImport = content.includes('embedded-crypto');
  checks.push({
    name: 'Embedded crypto module',
    pass: hasCryptoImport,
    message: hasCryptoImport ? 'Imports embedded-crypto' : 'Missing embedded-crypto import'
  });

  // Run checks
  let allPass = true;
  for (const check of checks) {
    if (check.pass) {
      log('PASS', check.message);
    } else {
      log('FAIL', check.message);
      allPass = false;
    }
  }

  return allPass;
}

function checkGitignore() {
  log('INFO', 'Checking .gitignore protections...');
  
  const gitignorePath = join(MCP_DIR, '.gitignore');
  if (!existsSync(gitignorePath)) {
    log('FAIL', 'No .gitignore file in mcp-server');
    return false;
  }

  const content = readFileSync(gitignorePath, 'utf8');
  const requiredPatterns = [
    '.env.mcp',
    '.mcp-credentials.json',
    '.mcp-security-checksum'
  ];

  let allPass = true;
  for (const pattern of requiredPatterns) {
    if (content.includes(pattern)) {
      log('PASS', `.gitignore blocks ${pattern}`);
    } else {
      log('FAIL', `.gitignore missing ${pattern}`);
      allPass = false;
    }
  }

  return allPass;
}

function checkForExposedCredentials() {
  log('INFO', 'Scanning for exposed credentials...');
  
  const sensitiveFiles = [
    join(ROOT, '.env'),
    join(MCP_DIR, '.env'),
    join(MCP_DIR, '.env.mcp'),
    join(ROOT, 'project-variables.json'),
  ];

  let allPass = true;
  const dbUrlPattern = /postgresql:\/\/[^"'\s]+/i;

  for (const file of sensitiveFiles) {
    if (!existsSync(file)) continue;

    const content = readFileSync(file, 'utf8');
    const hasDbUrl = dbUrlPattern.test(content);

    if (hasDbUrl) {
      log('WARN', `Potential exposed DATABASE_URL in ${file}`);
      allPass = false;
    } else {
      log('PASS', `No exposed DATABASE_URL in ${file}`);
    }
  }

  return allPass;
}

function checkEmbeddedCryptoModule() {
  log('INFO', 'Checking embedded crypto module...');
  
  const cryptoFile = join(MCP_DIR, 'src', 'utils', 'embedded-crypto.ts');
  
  if (!existsSync(cryptoFile)) {
    log('FAIL', 'embedded-crypto.ts not found');
    return false;
  }

  const content = readFileSync(cryptoFile, 'utf8');
  const checks = [];

  // Check for AES-256-GCM
  checks.push({
    name: 'AES-256-GCM algorithm',
    pass: content.includes('aes-256-gcm'),
    message: 'Uses AES-256-GCM encryption'
  });

  // Check for scrypt key derivation
  checks.push({
    name: 'Scrypt key derivation',
    pass: content.includes('scryptSync'),
    message: 'Uses scrypt for key derivation'
  });

  // Check for auth tag validation
  checks.push({
    name: 'Auth tag validation',
    pass: content.includes('setAuthTag'),
    message: 'Validates GCM auth tag'
  });

  // Check for version validation
  checks.push({
    name: 'Version validation',
    pass: content.includes('validateEmbeddedCredentials'),
    message: 'Has credential format validation'
  });

  let allPass = true;
  for (const check of checks) {
    if (check.pass) {
      log('PASS', check.message);
    } else {
      log('FAIL', check.message);
      allPass = false;
    }
  }

  return allPass;
}

function generateReport(results) {
  const report = {
    timestamp: new Date().toISOString(),
    overall: results.every(r => r.pass) ? 'SECURE' : 'VULNERABLE',
    checks: results
  };

  return report;
}

function main() {
  const args = process.argv.slice(2);
  const jsonOutput = args.includes('--json');
  const strictMode = args.includes('--strict');

  if (!jsonOutput) {
    console.log(`\n${colors.bold}${colors.cyan}╔════════════════════════════════════════════════════════╗${colors.reset}`);
    console.log(`${colors.bold}${colors.cyan}║     MCP Server Security Verification                   ║${colors.reset}`);
    console.log(`${colors.bold}${colors.cyan}╚════════════════════════════════════════════════════════╝${colors.reset}\n`);
  }

  const results = [];

  // Run all checks
  results.push({ name: 'Config File', pass: checkConfigFile() });
  results.push({ name: 'Gitignore', pass: checkGitignore() });
  results.push({ name: 'Exposed Credentials', pass: checkForExposedCredentials() });
  results.push({ name: 'Crypto Module', pass: checkEmbeddedCryptoModule() });

  const report = generateReport(results);

  if (jsonOutput) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`\n${colors.bold}Security Report:${colors.reset}`);
    console.log(`Overall Status: ${report.overall === 'SECURE' ? colors.green + 'SECURE' : colors.red + 'VULNERABLE'}${colors.reset}`);
    console.log(`Timestamp: ${report.timestamp}`);
    console.log(`\nChecks:`);
    for (const check of report.checks) {
      const status = check.pass ? colors.green + '✓' : colors.red + '✗';
      console.log(`  ${status}${colors.reset} ${check.name}`);
    }
  }

  // Exit with appropriate code
  const exitCode = (report.overall === 'SECURE' || !strictMode) ? 0 : 1;
  process.exit(exitCode);
}

main();
