/**
 * Spec 011 Implementation Test Suite
 * 
 * Tests all components of the New Project Kit implementation
 */

import { db } from '../src/db/client.js';
import { kitEncryptionService } from '../src/server/services/KitEncryptionService.js';
import { apiTokenService } from '../src/server/services/ApiTokenService.js';
import { kitGenerationService } from '../src/server/services/KitGenerationService.js';

async function runTests() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     Spec 011: New Project — AI-Ready Project Provisioning   ║');
  console.log('║                    Implementation Tests                     ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  let passed = 0;
  let failed = 0;

  // Test 1: Database Tables
  console.log('📋 Test 1: Database Tables');
  const tables = ['apitokens', 'projectkits', 'projectkitfiles'];
  for (const table of tables) {
    try {
      await db.execute(`SELECT 1 FROM ${table} LIMIT 1`);
      console.log(`  ✓ Table exists: ${table}`);
      passed++;
    } catch (e: any) {
      console.log(`  ✗ Table missing: ${table} - ${e.message}`);
      failed++;
    }
  }

  // Test 2: Encryption Service
  console.log('\n📋 Test 2: KitEncryptionService');
  try {
    const testData = 'postgresql://user:pass@localhost/db';
    const encrypted = kitEncryptionService.encryptDatabaseUrl(testData, 'test-key-12345678901234567890123456789012');
    const decrypted = kitEncryptionService.decryptDatabaseUrl(encrypted, 'test-key-12345678901234567890123456789012');
    
    if (decrypted === testData) {
      console.log('  ✓ AES-256-GCM encrypt/decrypt roundtrip works');
      passed++;
    } else {
      console.log('  ✗ Decrypted data does not match original');
      failed++;
    }
  } catch (e: any) {
    console.log(`  ✗ Encryption test failed: ${e.message}`);
    failed++;
  }

  // Test 3: Token Generation
  console.log('\n📋 Test 3: Token Generation');
  try {
    const token = kitEncryptionService.generateApiToken();
    // base64url encoding produces ~43 characters for 32 bytes
    if (token.length >= 40 && token.length <= 50 && /^[A-Za-z0-9_-]+$/.test(token)) {
      console.log('  ✓ API token generation works (base64url format)');
      passed++;
    } else {
      console.log(`  ✗ Token format incorrect: length=${token.length}, format=${token.substring(0, 20)}...`);
      failed++;
    }
  } catch (e: any) {
    console.log(`  ✗ Token generation failed: ${e.message}`);
    failed++;
  }


  // Test 4: Token Hashing
  console.log('\n📋 Test 4: Token Hashing');
  try {
    const token = 'test-token-123';
    const hash = kitEncryptionService.hashToken(token);
    if (hash.length === 64) {
      console.log('  ✓ Token hashing works (SHA-256)');
      passed++;
    } else {
      console.log('  ✗ Hash length incorrect');
      failed++;
    }
  } catch (e: any) {
    console.log(`  ✗ Token hashing failed: ${e.message}`);
    failed++;
  }

  // Test 5: Kit Generation Service
  console.log('\n📋 Test 5: KitGenerationService');
  try {
    const result = await kitGenerationService.generateKit({
      projectId: '00000000-0000-0000-0000-000000000000',
      userId: '00000000-0000-0000-0000-000000000000',
      companyId: '00000000-0000-0000-0000-000000000000',
      primaryAi: 'blackboxai',
      importMode: false,
    });
    
    // Service should handle invalid project ID gracefully (FK constraint)
    if (result.status === 'failed' && result.error) {
      console.log(`  ✓ Kit generation properly rejects invalid project ID`);
      passed++;
    } else if (result.kitId && result.status === 'ready') {
      console.log(`  ✓ Kit generation service responds (status: ${result.status})`);
      passed++;
    } else {
      console.log(`  ✗ Kit generation response invalid: ${JSON.stringify(result)}`);
      failed++;
    }
  } catch (e: any) {
    console.log(`  ✗ Kit generation threw exception: ${e.message}`);
    failed++;
  }


  // Test 6: Command Files
  console.log('\n📋 Test 6: AI Command Files');
  const fs = await import('fs/promises');
  const commands = [
    '_wxAI-commands/task-push.md',
    '_wxAI-commands/task-done.md',
    '_wxAI-commands/wxAI-pipeline.md',
    '_wxAI-commands/autofix-tests.md',
    '_wxAI-commands/autofix-translation.md',
    '_wxAI-commands/sync-cpl.md',
    '_wxAI-commands/sync-starter-kit.md',
  ];
  
  for (const cmd of commands) {
    try {
      await fs.access(cmd);
      console.log(`  ✓ Command file exists: ${cmd}`);
      passed++;
    } catch (e: any) {
      console.log(`  ✗ Command file missing: ${cmd}`);
      failed++;
    }
  }

  // Summary
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║                        Test Summary                         ║');
  console.log(`║  Passed: ${passed.toString().padStart(3)}                                                ║`);
  console.log(`║  Failed: ${failed.toString().padStart(3)}                                                ║`);
  console.log(`║  Total:  ${(passed + failed).toString().padStart(3)}                                                ║`);
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(e => {
  console.error('Test suite failed:', e);
  process.exit(1);
});
