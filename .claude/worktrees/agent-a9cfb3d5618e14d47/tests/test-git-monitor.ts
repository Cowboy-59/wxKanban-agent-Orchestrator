/**
 * Git Command Monitor Test Suite
 * 
 * Comprehensive testing of the git monitoring system
 */

import { db, pool } from '../src/db/client.js';
import { 
  gitCommandLogs, 
  gitCommandStats, 
  gitCommandSessions 
} from '../src/db/schema/gitCommands.js';
import { eq, desc } from 'drizzle-orm';
import { 
  initializeGitCommandMonitor, 
  shutdownGitCommandMonitor,
  startCommand,
  completeCommand,
  getGitDashboardStats,
  getGitCommandLogs
} from '../src/server/services/GitCommandMonitor.js';
import type { GitCommandStartEvent, GitCommandCompleteEvent } from '../src/server/types/gitCommands.js';

// Test configuration
const TEST_TIMEOUT = 30000;
const TEST_USER_ID = null; // Use null to avoid FK constraint issues during testing

// Test results
const results: { name: string; passed: boolean; error?: string }[] = [];

async function runTest(name: string, testFn: () => Promise<void>): Promise<void> {
  try {
    console.log(`\n🧪 Testing: ${name}`);
    await testFn();
    results.push({ name, passed: true });
    console.log(`✅ PASSED: ${name}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    results.push({ name, passed: false, error: errorMessage });
    console.error(`❌ FAILED: ${name}`);
    console.error(`   Error: ${errorMessage}`);
  }
}

// Test 1: Database Schema
async function testDatabaseSchema(): Promise<void> {
  console.log('  Checking database tables...');
  
  // Test git_command_logs table
  const logsResult = await db.execute(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'git_command_logs'
    );
  `);
  
  if (!logsResult.rows[0]?.exists) {
    throw new Error('git_command_logs table does not exist');
  }
  console.log('  ✓ git_command_logs table exists');
  
  // Test git_command_stats table
  const statsResult = await db.execute(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'git_command_stats'
    );
  `);
  
  if (!statsResult.rows[0]?.exists) {
    throw new Error('git_command_stats table does not exist');
  }
  console.log('  ✓ git_command_stats table exists');
  
  // Test git_command_sessions table
  const sessionsResult = await db.execute(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'git_command_sessions'
    );
  `);
  
  if (!sessionsResult.rows[0]?.exists) {
    throw new Error('git_command_sessions table does not exist');
  }
  console.log('  ✓ git_command_sessions table exists');
  
  // Test trigger exists
  const triggerResult = await db.execute(`
    SELECT EXISTS (
      SELECT FROM pg_trigger 
      WHERE tgname = 'trigger_update_git_command_duration'
    );
  `);
  
  if (!triggerResult.rows[0]?.exists) {
    throw new Error('trigger_update_git_command_duration does not exist');
  }
  console.log('  ✓ Duration calculation trigger exists');
}

// Test 2: Service Initialization
async function testServiceInitialization(): Promise<void> {
  console.log('  Initializing GitCommandMonitor...');
  
  const monitor = initializeGitCommandMonitor({
    enabled: true,
    logLevel: 'debug',
    retentionDays: 30,
    enableRealTimeUpdates: true,
    enableStatsAggregation: false // Disable for testing
  });
  
  if (!monitor) {
    throw new Error('Failed to initialize monitor');
  }
  
  const config = monitor.getConfig();
  if (!config.enabled) {
    throw new Error('Monitor should be enabled');
  }
  
  console.log('  ✓ Monitor initialized successfully');
  console.log('  ✓ Configuration retrieved successfully');
}

// Test 3: Start Command Tracking
async function testStartCommand(): Promise<void> {
  console.log('  Starting command tracking...');
  
  const event: GitCommandStartEvent = {
    command: 'commit',
    subcommand: 'test',
    args: ['-m', 'test commit'],
    workingDirectory: '/test/repo',
    userId: TEST_USER_ID,
    username: 'testuser',
    branch: 'main',
    commitHash: 'abc123',
    repositoryName: 'test-repo',
    remoteUrl: 'https://github.com/test/repo.git'
  };
  
  const commandId = await startCommand(event);
  
  if (!commandId) {
    throw new Error('Failed to start command tracking');
  }
  
  console.log(`  ✓ Command started with ID: ${commandId}`);
  
  // Verify in database
  const logs = await db.select().from(gitCommandLogs).where(eq(gitCommandLogs.id, commandId));
  
  if (logs.length === 0) {
    throw new Error('Command not found in database');
  }
  
  if (logs[0].status !== 'running') {
    throw new Error(`Expected status 'running', got '${logs[0].status}'`);
  }
  
  console.log('  ✓ Command record created in database');
  
  return commandId;
}

// Test 4: Complete Command Tracking
async function testCompleteCommand(): Promise<void> {
  console.log('  Completing command tracking...');
  
  // First start a command
  const startEvent: GitCommandStartEvent = {
    command: 'push',
    subcommand: 'origin',
    args: ['main'],
    workingDirectory: '/test/repo',
    userId: TEST_USER_ID,
    username: 'testuser',
    branch: 'main',
    repositoryName: 'test-repo'
  };
  
  const commandId = await startCommand(startEvent);
  console.log(`  Started command: ${commandId}`);
  
  // Complete the command
  const completeEvent: GitCommandCompleteEvent = {
    commandId,
    status: 'completed',
    exitCode: 0,
    endTime: new Date()
  };
  
  await completeCommand(completeEvent);
  console.log('  ✓ Command completion recorded');
  
  // Verify in database
  const logs = await db.select().from(gitCommandLogs).where(eq(gitCommandLogs.id, commandId));
  
  if (logs.length === 0) {
    throw new Error('Completed command not found in database');
  }
  
  if (logs[0].status !== 'completed') {
    throw new Error(`Expected status 'completed', got '${logs[0].status}'`);
  }
  
  if (logs[0].exitCode !== 0) {
    throw new Error(`Expected exitCode 0, got ${logs[0].exitCode}`);
  }
  
  console.log('  ✓ Command status updated in database');
  console.log(`  ✓ Duration: ${logs[0].durationMs}ms`);
}

// Test 5: Failed Command Tracking
async function testFailedCommand(): Promise<void> {
  console.log('  Testing failed command tracking...');
  
  const startEvent: GitCommandStartEvent = {
    command: 'merge',
    subcommand: 'feature-branch',
    args: ['--no-ff'],
    workingDirectory: '/test/repo',
    userId: TEST_USER_ID,
    username: 'testuser',
    branch: 'main',
    repositoryName: 'test-repo'
  };
  
  const commandId = await startCommand(startEvent);
  
  const completeEvent: GitCommandCompleteEvent = {
    commandId,
    status: 'failed',
    exitCode: 1,
    endTime: new Date(),
    errorMessage: 'Merge conflict detected',
    errorStack: 'CONFLICT (content): Merge conflict in file.txt'
  };
  
  await completeCommand(completeEvent);
  
  const logs = await db.select().from(gitCommandLogs).where(eq(gitCommandLogs.id, commandId));
  
  if (logs[0].status !== 'failed') {
    throw new Error(`Expected status 'failed', got '${logs[0].status}'`);
  }
  
  if (logs[0].exitCode !== 1) {
    throw new Error(`Expected exitCode 1, got ${logs[0].exitCode}`);
  }
  
  if (!logs[0].errorMessage?.includes('conflict')) {
    throw new Error('Error message not recorded correctly');
  }
  
  console.log('  ✓ Failed command tracked correctly');
}

// Test 6: Dashboard Stats
async function testDashboardStats(): Promise<void> {
  console.log('  Testing dashboard statistics...');
  
  const stats = await getGitDashboardStats();
  
  if (typeof stats.totalCommands24h !== 'number') {
    throw new Error('totalCommands24h should be a number');
  }
  
  if (typeof stats.successfulCommands24h !== 'number') {
    throw new Error('successfulCommands24h should be a number');
  }
  
  if (typeof stats.failedCommands24h !== 'number') {
    throw new Error('failedCommands24h should be a number');
  }
  
  if (typeof stats.averageDuration24h !== 'number') {
    throw new Error('averageDuration24h should be a number');
  }
  
  if (!Array.isArray(stats.topCommands)) {
    throw new Error('topCommands should be an array');
  }
  
  if (typeof stats.activeSessions !== 'number') {
    throw new Error('activeSessions should be a number');
  }
  
  console.log('  ✓ Dashboard stats retrieved successfully');
  console.log(`  ✓ Total commands (24h): ${stats.totalCommands24h}`);
  console.log(`  ✓ Successful: ${stats.successfulCommands24h}`);
  console.log(`  ✓ Failed: ${stats.failedCommands24h}`);
  console.log(`  ✓ Top commands: ${stats.topCommands.length}`);
}

// Test 7: Command Filtering
async function testCommandFiltering(): Promise<void> {
  console.log('  Testing command filtering...');
  
  const result = await getGitCommandLogs(
    { 
      command: 'commit',
      status: 'completed',
      userId: TEST_USER_ID 
    },
    { page: 1, limit: 10, sortBy: 'startTime', sortOrder: 'desc' }
  );
  
  if (!result.data) {
    throw new Error('No data returned from filtered query');
  }
  
  if (typeof result.total !== 'number') {
    throw new Error('Total count should be a number');
  }
  
  if (typeof result.page !== 'number') {
    throw new Error('Page should be a number');
  }
  
  if (typeof result.totalPages !== 'number') {
    throw new Error('Total pages should be a number');
  }
  
  console.log(`  ✓ Filtered query returned ${result.data.length} results`);
  console.log(`  ✓ Total matching records: ${result.total}`);
}

// Test 8: Session Management
async function testSessionManagement(): Promise<void> {
  console.log('  Testing session management...');
  
  const monitor = initializeGitCommandMonitor();
  const sessions = monitor.getActiveSessions();
  
  if (!Array.isArray(sessions)) {
    throw new Error('getActiveSessions should return an array');
  }
  
  console.log(`  ✓ Active sessions: ${sessions.length}`);
  
  // Test session creation via command
  const startEvent: GitCommandStartEvent = {
    command: 'pull',
    args: ['origin', 'main'],
    workingDirectory: '/test/repo',
    userId: TEST_USER_ID,
    username: 'testuser',
    branch: 'main',
    repositoryName: 'test-repo',
    sessionId: 'test-session-123'
  };
  
  const commandId = await startCommand(startEvent);
  
  const activeCommands = monitor.getActiveCommands();
  console.log(`  ✓ Active commands: ${activeCommands.length}`);
  
  // Complete to clean up
  await completeCommand({
    commandId,
    status: 'completed',
    exitCode: 0
  });
}

// Test 9: Git Hooks Validation
async function testGitHooks(): Promise<void> {
  console.log('  Validating git hooks...');
  
  const hooks = [
    '_git-hooks-project/pre-command',
    '_git-hooks-project/post-command',
    '_git-hooks-project/pre-push',
    '_git-hooks-project/post-push',
    '_git-hooks-project/post-checkout'
  ];
  
  const fs = await import('fs');
  const path = await import('path');
  
  for (const hook of hooks) {
    const hookPath = path.join(process.cwd(), hook);
    
    if (!fs.existsSync(hookPath)) {
      throw new Error(`Hook not found: ${hook}`);
    }
    
    const content = fs.readFileSync(hookPath, 'utf-8');
    
    if (!content.includes('#!/bin/bash')) {
      throw new Error(`Hook ${hook} missing shebang`);
    }
    
    if (!content.includes('SKIP_GIT_MONITOR')) {
      throw new Error(`Hook ${hook} missing bypass check`);
    }
    
    console.log(`  ✓ ${path.basename(hook)} validated`);
  }
}

// Test 10: Cleanup
async function testCleanup(): Promise<void> {
  console.log('  Testing cleanup functionality...');
  
  const monitor = initializeGitCommandMonitor();
  
  // Clean up test data older than 1 day (should not affect our test data)
  const deletedCount = await monitor.cleanupOldLogs();
  
  console.log(`  ✓ Cleanup completed (deleted: ${deletedCount} old records)`);
  
  // Shutdown monitor
  shutdownGitCommandMonitor();
  console.log('  ✓ Monitor shut down successfully');
}

// Main test runner
async function runAllTests(): Promise<void> {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Git Command Monitor - Comprehensive Test Suite');
  console.log('═══════════════════════════════════════════════════════════════');
  
  const startTime = Date.now();
  
  // Run all tests
  await runTest('Database Schema', testDatabaseSchema);
  await runTest('Service Initialization', testServiceInitialization);
  await runTest('Start Command Tracking', testStartCommand);
  await runTest('Complete Command Tracking', testCompleteCommand);
  await runTest('Failed Command Tracking', testFailedCommand);
  await runTest('Dashboard Stats', testDashboardStats);
  await runTest('Command Filtering', testCommandFiltering);
  await runTest('Session Management', testSessionManagement);
  await runTest('Git Hooks Validation', testGitHooks);
  await runTest('Cleanup', testCleanup);
  
  // Summary
  const duration = Date.now() - startTime;
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  Test Summary');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Total:  ${results.length}`);
  console.log(`  Passed: ${passed} ✅`);
  console.log(`  Failed: ${failed} ❌`);
  console.log(`  Time:   ${duration}ms`);
  console.log('═══════════════════════════════════════════════════════════════');
  
  if (failed > 0) {
    console.log('\nFailed Tests:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  ❌ ${r.name}`);
      console.log(`     ${r.error}`);
    });
    process.exit(1);
  } else {
    console.log('\n🎉 All tests passed!');
    process.exit(0);
  }
}

// Run tests
runAllTests().catch(error => {
  console.error('Test suite failed:', error);
  process.exit(1);
}).finally(() => {
  pool.end();
});
