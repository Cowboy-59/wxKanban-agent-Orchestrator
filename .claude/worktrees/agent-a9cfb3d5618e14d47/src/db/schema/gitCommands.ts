/**
 * Git Command Monitoring Schema
 * 
 * Drizzle ORM schema definitions for git command tracking tables
 */

import { 
  pgTable, 
  uuid, 
  varchar, 
  text, 
  timestamp, 
  integer, 
  boolean, 
  jsonb,
  index,
  unique
} from 'drizzle-orm/pg-core';

/**
 * Git command logs table
 */
export const gitCommandLogs = pgTable('gitcommandlogs', {
  // [SCOPE 117 / T001] gen_random_uuid(), not uuid_generate_v4(): the uuid-ossp
  // extension is not installed on this database, so the previous default would
  // have failed at CREATE TABLE time. Matches every other table in the schema.
  id: uuid('id').primaryKey().defaultRandom(),
  command: varchar('command', { length: 100 }).notNull(),
  subcommand: varchar('subcommand', { length: 100 }),
  args: text('args').array(),
  workingDirectory: text('working_directory').notNull(),
  userId: uuid('user_id'),
  username: varchar('username', { length: 255 }),
  branch: varchar('branch', { length: 255 }),
  commitHash: varchar('commit_hash', { length: 40 }),
  
  // Execution tracking
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  exitCode: integer('exit_code'),
  startTime: timestamp('start_time', { withTimezone: true }).notNull().defaultNow(),
  endTime: timestamp('end_time', { withTimezone: true }),
  durationMs: integer('duration_ms'),
  
  // Additional metadata
  remoteUrl: text('remote_url'),
  repositoryName: varchar('repository_name', { length: 255 }),
  sessionId: varchar('session_id', { length: 255 }),
  parentCommandId: uuid('parent_command_id'),
  
  // Error information
  errorMessage: text('error_message'),
  errorStack: text('error_stack'),
  
  // Created at
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  userIdIdx: index('idx_git_command_logs_user_id').on(table.userId),
  statusIdx: index('idx_git_command_logs_status').on(table.status),
  startTimeIdx: index('idx_git_command_logs_start_time').on(table.startTime),
  commandIdx: index('idx_git_command_logs_command').on(table.command),
  sessionIdx: index('idx_git_command_logs_session').on(table.sessionId),
  branchIdx: index('idx_git_command_logs_branch').on(table.branch),
  userTimeIdx: index('idx_git_command_logs_user_time').on(table.userId, table.startTime),
}));

/**
 * Git command statistics table
 */
export const gitCommandStats = pgTable('gitcommandstats', {
  // [SCOPE 117 / T001] gen_random_uuid(), not uuid_generate_v4(): the uuid-ossp
  // extension is not installed on this database, so the previous default would
  // have failed at CREATE TABLE time. Matches every other table in the schema.
  id: uuid('id').primaryKey().defaultRandom(),
  command: varchar('command', { length: 100 }).notNull(),
  subcommand: varchar('subcommand', { length: 100 }),
  repositoryName: varchar('repository_name', { length: 255 }),
  
  // Statistics
  totalExecutions: integer('total_executions').notNull().default(0),
  successfulExecutions: integer('successful_executions').notNull().default(0),
  failedExecutions: integer('failed_executions').notNull().default(0),
  avgDurationMs: integer('avg_duration_ms'),
  minDurationMs: integer('min_duration_ms'),
  maxDurationMs: integer('max_duration_ms'),
  
  // Time window
  periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
  periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
  periodType: varchar('period_type', { length: 20 }).notNull(),
  
  // Last updated
  lastUpdated: timestamp('last_updated', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  periodIdx: index('idx_git_command_stats_period').on(table.periodType, table.periodStart),
  commandIdx: index('idx_git_command_stats_command').on(table.command),
  uniqueStats: unique('unique_git_command_stats').on(
    table.command, 
    table.subcommand, 
    table.repositoryName, 
    table.periodType, 
    table.periodStart
  )
}));

/**
 * Git command sessions table
 */
export const gitCommandSessions = pgTable('gitcommandsessions', {
  id: varchar('id', { length: 255 }).primaryKey(),
  userId: uuid('user_id'),
  username: varchar('username', { length: 255 }).notNull(),
  repositoryPath: text('repository_path').notNull(),
  branch: varchar('branch', { length: 255 }),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  lastActivityAt: timestamp('last_activity_at', { withTimezone: true }).notNull().defaultNow(),
  isActive: boolean('is_active').notNull().default(true),
  metadata: jsonb('metadata')
}, (table) => ({
  userIdx: index('idx_git_command_sessions_user').on(table.userId),
  activeIdx: index('idx_git_command_sessions_active').on(table.isActive)
}));

// Types
export type GitCommandLog = typeof gitCommandLogs.$inferSelect;
export type NewGitCommandLog = typeof gitCommandLogs.$inferInsert;
export type GitCommandStat = typeof gitCommandStats.$inferSelect;
export type NewGitCommandStat = typeof gitCommandStats.$inferInsert;
export type GitCommandSession = typeof gitCommandSessions.$inferSelect;
export type NewGitCommandSession = typeof gitCommandSessions.$inferInsert;
