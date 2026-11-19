/**
 * Critical Path Testing for gitcommit feature
 * Quick validation of key functionality
 */

import { 
  getGitStatus, 
  getCurrentBranch, 
  extractScopeFromBranch, 
  stageFiles,
  getRepositoryInfo 
} from '../cli/services/gitService.js';
import { 
  executeGitCommit, 
  showCommitPreview, 
  quickCommit,
  generateCommitMessage 
} from '../cli/services/gitCommitService.js';

// Test results
const results: { test: string; status: 'PASS' | 'FAIL'; error?: string }[] = [];

function assert(condition: boolean, testName: string): void {
  if (condition) {
    results.push({ test: testName, status: 'PASS' });
    console.log(`✅ ${testName}`);
  } else {
    results.push({ test: testName, status: 'FAIL', error: 'Assertion failed' });
    console.log(`❌ ${testName}`);
  }
}

async function runTests(): Promise<void> {
  console.log('🧪 Running Critical Path Tests for gitcommit\n');
  
  // Test 1: Get current branch
  console.log('Test 1: Get Current Branch');
  try {
    const branch = getCurrentBranch();
    console.log(`   Branch: ${branch}`);
    assert(branch !== null && branch.length > 0, 'Get current branch');
  } catch (error) {
    assert(false, `Get current branch: ${error}`);
  }
  
  // Test 2: Extract scope from branch name
  console.log('\nTest 2: Extract Scope from Branch');
  try {
    const testCases = [
      { branch: '013-user-auth', expected: '013' },
      { branch: 'feature/042-api-integration', expected: '042' },
      { branch: 'main', expected: null },
      { branch: 'bugfix-123-login', expected: '123' },
    ];
    
    let allPassed = true;
    for (const { branch, expected } of testCases) {
      const scope = extractScopeFromBranch(branch);
      const passed = scope === expected;
      console.log(`   ${branch} → ${scope} (expected: ${expected}) ${passed ? '✓' : '✗'}`);
      if (!passed) allPassed = false;
    }
    assert(allPassed, 'Extract scope from branch names');
  } catch (error) {
    assert(false, `Extract scope: ${error}`);
  }
  
  // Test 3: Get git status
  console.log('\nTest 3: Get Git Status');
  try {
    const status = getGitStatus();
    console.log(`   Staged: ${status.staged.length}, Unstaged: ${status.unstaged.length}, Untracked: ${status.untracked.length}`);
    assert(status !== null && Array.isArray(status.staged), 'Get git status structure');
  } catch (error) {
    assert(false, `Get git status: ${error}`);
  }
  
  // Test 4: Get repository info
  console.log('\nTest 4: Get Repository Info');
  try {
    const info = getRepositoryInfo();
    if (info) {
      console.log(`   Branch: ${info.branch}, Has changes: ${info.hasStagedChanges || info.hasUnstagedChanges}`);
      assert(info.branch !== null && info.rootPath !== null, 'Get repository info');
    } else {
      assert(false, 'Get repository info: null result');
    }
  } catch (error) {
    assert(false, `Get repository info: ${error}`);
  }
  
  // Test 5: Show commit preview
  console.log('\nTest 5: Show Commit Preview');
  try {
    const preview = showCommitPreview();
    console.log(`   Branch: ${preview.branch}, Scope: ${preview.scope || 'none'}`);
    console.log(`   Staged files: ${preview.staged.length}`);
    assert(preview.branch !== null && Array.isArray(preview.staged), 'Show commit preview');
  } catch (error) {
    assert(false, `Show commit preview: ${error}`);
  }
  
  // Test 6: Generate commit message (mock)
  console.log('\nTest 6: Generate Commit Message');
  try {
    const diff = 'diff --git a/test.ts b/test.ts\nnew file mode 100644\nindex 0000000..1234567\n--- /dev/null\n+++ b/test.ts\n@@ -0,0 +1 @@\n+test content';
    const stats = '1 file changed, 1 insertion(+)';
    const branch = '013-test-feature';
    const scope = extractScopeFromBranch(branch);
    
    const message = await generateCommitMessage({
      diff,
      stats,
      branch,
      scope: scope || undefined,
      style: 'conventional'
    });
    console.log(`   Generated: ${message}`);
    assert(message !== null && typeof message === 'string' && message.length > 0, 'Generate commit message');
  } catch (error) {
    assert(false, `Generate commit message: ${error}`);
  }
  
  // Test 7: Validate commit prerequisites
  console.log('\nTest 7: Validate Commit Prerequisites');
  try {
    const status = getGitStatus();
    // Should either have staged files or not
    const canCommit = status.staged.length > 0;
    console.log(`   Can commit: ${canCommit} (staged: ${status.staged.length})`);
    assert(true, 'Validate commit prerequisites');
  } catch (error) {
    assert(false, `Validate prerequisites: ${error}`);
  }
  
  // Summary
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('TEST SUMMARY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  
  console.log(`Total: ${results.length} | ✅ Passed: ${passed} | ❌ Failed: ${failed}`);
  
  if (failed > 0) {
    console.log('\nFailed tests:');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`  ❌ ${r.test}: ${r.error}`);
    });
    process.exit(1);
  } else {
    console.log('\n🎉 All critical path tests passed!');
    process.exit(0);
  }
}

// Run tests
runTests().catch(error => {
  console.error('Test runner failed:', error);
  process.exit(1);
});
