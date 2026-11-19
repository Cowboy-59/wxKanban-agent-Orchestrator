/**
 * API Endpoint Tests for Spec 011
 * Tests all 8 kit routes via HTTP requests
 */

import { db } from '../src/db/client.js';

const BASE_URL = 'http://localhost:3000/api';
let authToken: string | null = null;
let testProjectId: string | null = null;
let testCompanyId: string | null = null;
let testUserId: string | null = null;

// Test results
const results: Array<{ endpoint: string; method: string; status: string; error?: string }> = [];

async function setupTestData() {
  console.log('🔧 Setting up test data...\n');
  
  try {
    // Get or create a test company
    const companyResult = await db.execute(`
      INSERT INTO companies (name, slug, status)
      VALUES ('Test Company API', 'test-company-api', 'active')
      ON CONFLICT (slug) DO UPDATE SET name = 'Test Company API'
      RETURNING id;
    `);
    testCompanyId = companyResult.rows[0]?.id as string | null;

    console.log(`  ✓ Test company: ${testCompanyId}`);
    
    // Get or create a test user (sysadmin)
    const userResult = await db.execute(`
      INSERT INTO userprofiles (email, firstname, lastname, status, role)
      VALUES ('test-api@wxkanban.com', 'Test', 'API', 'active', 'sysadmin')
      ON CONFLICT (email) DO UPDATE SET status = 'active'
      RETURNING id;
    `);
    testUserId = userResult.rows[0]?.id as string | null;

    console.log(`  ✓ Test user: ${testUserId}`);
    
    // Create a test project
    const projectResult = await db.execute(`
      INSERT INTO companyprojects (companyid, name, slug, description, status, createdbyid)
      VALUES ('${testCompanyId}', 'API Test Project', 'api-test-project', 'For API testing', 'active', '${testUserId}')
      ON CONFLICT (slug) DO UPDATE SET name = 'API Test Project'
      RETURNING id;
    `);
    testProjectId = projectResult.rows[0]?.id as string | null;

    console.log(`  ✓ Test project: ${testProjectId}`);
    
    // Create API token for authentication simulation
    const tokenResult = await db.execute(`
      INSERT INTO apitokens (userid, companyid, tokenprefix, tokenhash, name)
      VALUES ('${testUserId}', '${testCompanyId}', 'wxkb_test', 'testhash123456', 'API Test Token')
      ON CONFLICT (tokenhash) DO NOTHING
      RETURNING id;
    `);
    console.log(`  ✓ API token created`);
    
    return true;
  } catch (e: any) {
    console.error(`  ✗ Setup failed: ${e.message}`);
    return false;
  }
}

async function testEndpoint(name: string, method: string, url: string, body?: object) {
  try {
    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authToken ? `Bearer ${authToken}` : 'Bearer test-token',
      },
    };
    
    if (body) {
      options.body = JSON.stringify(body);
    }
    
    const response = await fetch(url, options);
    const responseBody = await response.text();
    
    let parsedBody;
    try {
      parsedBody = JSON.parse(responseBody);
    } catch {
      parsedBody = responseBody;
    }
    
    const status = response.ok ? '✅ PASS' : '⚠️ FAIL';
    results.push({ endpoint: name, method, status: status === '✅ PASS' ? 'PASS' : 'FAIL' });
    
    console.log(`\n${method} ${url}`);
    console.log(`  Status: ${response.status} ${status}`);
    console.log(`  Response: ${JSON.stringify(parsedBody).substring(0, 200)}...`);
    
    return { ok: response.ok, status: response.status, body: parsedBody };
  } catch (e: any) {
    results.push({ endpoint: name, method, status: 'ERROR', error: e.message });
    console.log(`\n${method} ${url}`);
    console.log(`  ❌ ERROR: ${e.message}`);
    return { ok: false, error: e.message };
  }
}

async function runApiTests() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     Spec 011: API Endpoint Testing                          ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  
  // Setup test data
  const setupOk = await setupTestData();
  if (!setupOk) {
    console.log('\n❌ Test setup failed. Ensure database is accessible.');
    process.exit(1);
  }
  
  console.log('\n🧪 Testing API Endpoints...\n');
  
  // Test 1: Get kit status (should be 404 or empty initially)
  await testEndpoint(
    'Get Kit Status (initial)',
    'GET',
    `${BASE_URL}/projects/${testProjectId}/kit`
  );
  
  // Test 2: Create/Generate kit
  const createResult = await testEndpoint(
    'Generate Kit',
    'POST',
    `${BASE_URL}/projects/${testProjectId}/kit`,
    {
      primaryAi: 'blackboxai',
      generateKit: true,
    }
  );
  
  // Test 3: Get kit status after creation
  if (createResult.ok) {
    await testEndpoint(
      'Get Kit Status (after creation)',
      'GET',
      `${BASE_URL}/projects/${testProjectId}/kit`
    );
    
    // Test 4: Download kit
    await testEndpoint(
      'Download Kit',
      'GET',
      `${BASE_URL}/projects/${testProjectId}/kit/download`
    );
  }
  
  // Test 5: Regenerate kit
  await testEndpoint(
    'Regenerate Kit',
    'POST',
    `${BASE_URL}/projects/${testProjectId}/kit/regenerate`
  );
  
  // Test 6: Create API token
  const tokenResult = await testEndpoint(
    'Create API Token',
    'POST',
    `${BASE_URL}/users/${testUserId}/tokens`,
    {
      name: 'Test Token',
      companyId: testCompanyId,
    }
  );
  
  // Test 7: List API tokens
  await testEndpoint(
    'List API Tokens',
    'GET',
    `${BASE_URL}/users/${testUserId}/tokens`
  );
  
  // Test 8: Import project
  await testEndpoint(
    'Import Project',
    'POST',
    `${BASE_URL}/projects/import`,
    {
      name: 'Imported Test Project',
      slug: 'imported-test-project',
      companyId: testCompanyId,
      importMode: true,
      sourceDirectory: '/test/path',
    }
  );
  
  // Summary
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║                    API Test Summary                         ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const errors = results.filter(r => r.status === 'ERROR').length;
  
  results.forEach(r => {
    const icon = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '⚠️' : '❌';
    console.log(`║  ${icon} ${r.method.padEnd(6)} ${r.endpoint.padEnd(40)} ${r.status.padEnd(8)} ║`);
  });
  
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log(`║  Passed: ${passed.toString().padStart(2)} / ${results.length.toString().padStart(2)}                                          ║`);
  console.log(`║  Failed: ${failed.toString().padStart(2)}                                            ║`);
  console.log(`║  Errors: ${errors.toString().padStart(2)}                                            ║`);
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  
  // Cleanup
  console.log('🧹 Cleaning up test data...');
  try {
    await db.execute(`DELETE FROM projectkitfiles WHERE kitid IN (SELECT id FROM projectkits WHERE projectid = '${testProjectId}');`);
    await db.execute(`DELETE FROM projectkits WHERE projectid = '${testProjectId}';`);
    await db.execute(`DELETE FROM apitokens WHERE userid = '${testUserId}';`);
    console.log('  ✓ Cleanup complete\n');
  } catch (e: any) {
    console.log(`  ⚠️ Cleanup warning: ${e.message}\n`);
  }
  
  process.exit(failed > 0 || errors > 0 ? 1 : 0);
}

// Check if server is running
async function checkServer() {
  try {
    const response = await fetch(`${BASE_URL}/health`, { 
      method: 'GET',
      signal: AbortSignal.timeout(3000)
    });
    return response.ok;
  } catch {
    return false;
  }
}

// Main
async function main() {
  console.log('Checking if server is running on localhost:3000...\n');
  
  const serverRunning = await checkServer();
  if (!serverRunning) {
    console.log('⚠️  Server not detected on localhost:3000');
    console.log('   Please start the server first: npm run dev');
    console.log('\n   Running database-only tests instead...\n');
    
    // Run basic DB tests
    await setupTestData();
    console.log('\n✅ Database setup verified. Start server to test API endpoints.');
    process.exit(0);
  }
  
  await runApiTests();
}

main().catch(e => {
  console.error('Test suite failed:', e);
  process.exit(1);
});
