/**
 * Git Command Types and Interfaces
 * 
 * Type definitions for git command monitoring system
 */

export type GitCommandStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export type GitCommandType = 
  | 'commit'
  | 'push'
  | 'pull'
  | 'fetch'
  | 'merge'
  | 'rebase'
  | 'checkout'
  | 'branch'
  | 'status'
  | 'log'
  | 'diff'
  | 'add'
  | 'reset'
  | 'stash'
  | 'tag'
  | 'clone'
  | 'remote'
  | 'config'
  | 'other';

export type PeriodType = 'hourly' | 'daily' | 'weekly' | 'monthly';

/**
 * Git command log entry
 */
export interface GitCommandLog {
  id: string;
  command: string;
  subcommand?: string;
  args: string[];
  workingDirectory: string;
  userId?: string;
  username?: string;
  branch?: string;
  commitHash?: string;
  status: GitCommandStatus;
  exitCode?: number;
  startTime: Date;
  endTime?: Date;
  durationMs?: number;
  remoteUrl?: string;
  repositoryName?: string;
  sessionId?: string;
  parentCommandId?: string;
  errorMessage?: string;
  errorStack?: string;
  createdAt: Date;
}

/**
 * New git command log entry (for insertion)
 */
export interface NewGitCommandLog {
  command: string;
  subcommand?: string;
  args?: string[];
  workingDirectory: string;
  userId?: string;
  username?: string;
  branch?: string;
  commitHash?: string;
  status?: GitCommandStatus;
  exitCode?: number;
  startTime?: Date;
  endTime?: Date;
  durationMs?: number;
  remoteUrl?: string;
  repositoryName?: string;
  sessionId?: string;
  parentCommandId?: string;
  errorMessage?: string;
  errorStack?: string;
}

/**
 * Git command statistics
 */
export interface GitCommandStats {
  id: string;
  command: string;
  subcommand?: string;
  repositoryName?: string;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  avgDurationMs?: number;
  minDurationMs?: number;
  maxDurationMs?: number;
  periodStart: Date;
  periodEnd: Date;
  periodType: PeriodType;
  lastUpdated: Date;
}

/**
 * Git command session
 */
export interface GitCommandSession {
  id: string;
  userId?: string;
  username: string;
  repositoryPath: string;
  branch?: string;
  startedAt: Date;
  lastActivityAt: Date;
  isActive: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * Command start event data
 */
export interface GitCommandStartEvent {
  command: string;
  subcommand?: string;
  args: string[];
  workingDirectory: string;
  userId?: string;
  username?: string;
  branch?: string;
  commitHash?: string;
  sessionId?: string;
  parentCommandId?: string;
  remoteUrl?: string;
  repositoryName?: string;
}

/**
 * Command completion event data
 */
export interface GitCommandCompleteEvent {
  commandId: string;
  status: GitCommandStatus;
  exitCode?: number;
  endTime: Date;
  errorMessage?: string;
  errorStack?: string;
}

/**
 * Command progress event data
 */
export interface GitCommandProgressEvent {
  commandId: string;
  progress: number; // 0-100
  message?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Query filters for git command logs
 */
export interface GitCommandLogFilters {
  userId?: string;
  command?: string;
  subcommand?: string;
  status?: GitCommandStatus;
  branch?: string;
  repositoryName?: string;
  sessionId?: string;
  startTimeFrom?: Date;
  startTimeTo?: Date;
  durationMin?: number;
  durationMax?: number;
}

/**
 * Pagination options
 */
export interface PaginationOptions {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Paginated result
 */
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Command statistics query parameters
 */
export interface StatsQueryParams {
  command?: string;
  subcommand?: string;
  repositoryName?: string;
  periodType: PeriodType;
  periodStart: Date;
  periodEnd: Date;
}

/**
 * Real-time command update (for WebSocket)
 */
export interface RealTimeCommandUpdate {
  type: 'start' | 'progress' | 'complete' | 'error';
  commandId: string;
  data: GitCommandLog | GitCommandProgressEvent | GitCommandCompleteEvent;
  timestamp: Date;
}

/**
 * Dashboard statistics
 */
export interface DashboardStats {
  totalCommands24h: number;
  successfulCommands24h: number;
  failedCommands24h: number;
  averageDuration24h: number;
  topCommands: Array<{ command: string; count: number }>;
  activeSessions: number;
  recentActivity: GitCommandLog[];
}

/**
 * Command execution context
 */
export interface CommandExecutionContext {
  sessionId: string;
  userId?: string;
  username: string;
  repositoryPath: string;
  branch?: string;
  remoteUrl?: string;
  repositoryName?: string;
  startTime: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Hook event data (from git hooks)
 */
export interface GitHookEvent {
  hookName: string;
  command?: string;
  args?: string[];
  exitCode?: number;
  workingDirectory: string;
  branch?: string;
  commitHash?: string;
  errorMessage?: string;
  timestamp: Date;
  environment: Record<string, string>;
}

/**
 * Monitoring configuration
 */
export interface GitMonitorConfig {
  enabled: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  retentionDays: number;
  enableRealTimeUpdates: boolean;
  enableStatsAggregation: boolean;
  statsAggregationInterval: number; // minutes
  maxConcurrentSessions: number;
  sessionTimeoutMinutes: number;
}

/**
 * Event types for the monitor
 */
export type GitMonitorEventType = 
  | 'command:start'
  | 'command:progress'
  | 'command:complete'
  | 'command:error'
  | 'session:start'
  | 'session:end'
  | 'stats:updated';

/**
 * Event handler type
 */
export type GitMonitorEventHandler<T = unknown> = (data: T) => void | Promise<void>;
