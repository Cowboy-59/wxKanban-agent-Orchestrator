/**
 * Test script for kit setup routes
 * Tests all 8 wizard steps
 */

const API_BASE = 'http://localhost:3001/api/kit';
const TEST_DIR = 'E:/test-project-kit';
const TEST_PROJECT_ID = 'test-project-123';

// Helper to make API calls
async function apiCall(endpoint, body, token) {
  const response = await fetch(`${API_BASE}/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  
  const data = await response.json();
  return { status: response.status, data };
}

// Test all steps
async function testKitSetup() {
  console.log('=== Testing Kit Setup Routes ===\n');
  
  // You'll need to provide a valid token
  const token = process.env.TEST_TOKEN || 'your-token-here';
  
  const steps = [
    {
      name: 'verify-directory',
      body: { targetDir: TEST_DIR },
    },
    {
      name: 'create-structure',
      body: { targetDir: TEST_DIR, projectId: TEST_PROJECT_ID },
    },
    {
      name: 'copy-commands',
      body: { targetDir: TEST_DIR, projectId: TEST_PROJECT_ID },
    },
    {
      name: 'create-mcp',
      body: { targetDir: TEST_DIR, projectId: TEST_PROJECT_ID },
    },
    {
      name: 'create-config',
      body: { targetDir: TEST_DIR, projectId: TEST_PROJECT_ID },
    },
    {
      name: 'create-context',
      body: { targetDir: TEST_DIR, projectId: TEST_PROJECT_ID, projectName: 'Test Project' },
    },
    {
      name: 'create-env',
      body: { targetDir: TEST_DIR, projectId: TEST_PROJECT_ID },
    },
    {
      name: 'verify-setup',
      body: { targetDir: TEST_DIR, projectId: TEST_PROJECT_ID },
    },
  ];
  
  for (const step of steps) {
    console.log(`Testing: ${step.name}...`);
    try {
      const result = await apiCall(step.name, step.body, token);
      if (result.status === 200) {
        console.log(`  ✓ ${step.name} - SUCCESS`);
        console.log(`    Response: ${JSON.stringify(result.data, null, 2).substring(0, 100)}...`);
      } else {
        console.log(`  ✗ ${step.name} - FAILED (${result.status})`);
        console.log(`    Error: ${JSON.stringify(result.data)}`);
      }
    } catch (err) {
      console.log(`  ✗ ${step.name} - ERROR`);
      console.log(`    ${err.message}`);
    }
    console.log('');
  }
  
  console.log('=== Test Complete ===');
}

testKitSetup().catch(console.error);
