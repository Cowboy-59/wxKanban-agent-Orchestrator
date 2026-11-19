/**
 * Git Command Monitor Service
 * 
 * Tracks git command execution, stores history, and provides real-time monitoring
 */

import { EventEmitter } from 'events';
import { db } from '~/db/client.js';
import { 
  gitCommandLogs, 
  gitCommandStats, 
  gitCommandSessions 
} from '~/db/schema/gitCommands.js';
import { eq, and, gte, lte, desc, asc, sql, count } from 'drizzle-orm';
import { logger } from '~/server/lib/logger.js';
import type {
  GitCommandLog,
  NewGitCommandLog,
  GitCommandStartEvent,
  GitCommandCompleteEvent,
  GitCommandProgressEvent,
  GitCommandSession,
  GitCommandLogFilters,
  GitCommandStats as GitCommandStatsType,
  PaginationOptions,
  PaginatedResult,
  StatsQueryParams,
  DashboardStats,
  CommandExecutionContext,
  GitMonitorConfig,
  GitMonitorEventType,
  GitMonitorEventHandler
} from '~/server/types/gitCommands.js';

// Singleton instance
let monitorInstance: GitCommandMonitor | null = null;

/**
 * Git Command Monitor Service
 */
export class GitCommandMonitor extends EventEmitter {
  private config: GitMonitorConfig;
  private activeCommands: Map<string, GitCommandLog>;
  private activeSessions: Map<string, GitCommandSession>;
  private statsAggregationTimer: NodeJS.Timeout | null = null;

  constructor(config: Partial<GitMonitorConfig> = {}) {
    super();
    
    this.config = {
      enabled: true,
      logLevel: 'info',
      retentionDays: 30,
      enableRealTimeUpdates: true,
      enableStatsAggregation: true,
      statsAggregationInterval: 60, // 1 hour
      maxConcurrentSessions: 100,
      sessionTimeoutMinutes: 30,
      ...config
    };

    this.activeCommands = new Map();
    this.activeSessions = new Map();

    if (this.config.enableStatsAggregation) {
      this.startStatsAggregation();
    }

    logger.info({ config: this.config }, 'GitCommandMonitor initialized');
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: Partial<GitMonitorConfig>): GitCommandMonitor {
    if (!monitorInstance) {
      monitorInstance = new GitCommandMonitor(config);
    }
    return monitorInstance;
  }

  /**
   * Reset singleton instance (for testing)
   */
  static resetInstance(): void {
    if (monitorInstance) {
      monitorInstance.destroy();
      monitorInstance = null;
    }
  }

  /**
   * Start tracking a new git command
   */
  async startCommand(event: GitCommandStartEvent): Promise<string> {
    if (!this.config.enabled) {
      logger.debug('GitCommandMonitor disabled, skipping command tracking');
      return '';
    }

    try {
      const commandId = crypto.randomUUID();
      const now = new Date();

      // Create session if needed
      let sessionId = event.sessionId;
      if (!sessionId) {
        sessionId = await this.getOrCreateSession({
          userId: event.userId,
          username: event.username || 'unknown',
          repositoryPath: event.workingDirectory,
          branch: event.branch,
          remoteUrl: event.remoteUrl,
          repositoryName: event.repositoryName
        });
      }

      // Prepare log entry
      const newLog: NewGitCommandLog = {
        command: event.command,
        subcommand: event.subcommand,
        args: event.args || [],
        workingDirectory: event.workingDirectory,
        userId: event.userId,
        username: event.username,
        branch: event.branch,
        commitHash: event.commitHash,
        status: 'running',
        startTime: now,
        sessionId,
        parentCommandId: event.parentCommandId,
        remoteUrl: event.remoteUrl,
        repositoryName: event.repositoryName
      };

      // Insert into database
      await db.insert(gitCommandLogs).values(newLog);

      // Store in memory for real-time tracking
      const logEntry = { ...newLog, id: commandId, createdAt: now } as GitCommandLog;
      this.activeCommands.set(commandId, logEntry);

      // Update session activity
      this.updateSessionActivity(sessionId);

      // Emit event
      this.emit('command:start', logEntry);
      
      if (this.config.enableRealTimeUpdates) {
        this.emit('realtime:update', {
          type: 'start',
          commandId,
          data: logEntry,
          timestamp: now
        });
      }

      logger.debug(
        { commandId, command: event.command, sessionId },
        'Git command started'
      );

      return commandId;
    } catch (error) {
      logger.error({ error, event }, 'Failed to start git command tracking');
      throw error;
    }
  }

  /**
   * Complete a tracked git command
   */
  async completeCommand(event: GitCommandCompleteEvent): Promise<void> {
    if (!this.config.enabled) return;

    try {
      const { commandId, status, exitCode, endTime, errorMessage, errorStack } = event;
      const now = endTime || new Date();

      // Get active command
      const activeCommand = this.activeCommands.get(commandId);
      
      // Update in database
      const updateData: Partial<GitCommandLog> = {
        status,
        exitCode,
        endTime: now,
        errorMessage,
        errorStack
      };

      await db
        .update(gitCommandLogs)
        .set(updateData)
        .where(eq(gitCommandLogs.id, commandId));

      // Remove from active commands
      this.activeCommands.delete(commandId);

      // Update session activity if we have the session ID
      if (activeCommand?.sessionId) {
        this.updateSessionActivity(activeCommand.sessionId);
      }

      // Emit completion event
      const completedCommand = {
        ...activeCommand,
        ...updateData,
        id: commandId
      } as GitCommandLog;

      this.emit('command:complete', completedCommand);

      if (this.config.enableRealTimeUpdates) {
        this.emit('realtime:update', {
          type: 'complete',
          commandId,
          data: completedCommand,
          timestamp: now
        });
      }

      logger.debug(
        { commandId, status, exitCode, durationMs: completedCommand.durationMs },
        'Git command completed'
      );
    } catch (error) {
      logger.error({ error, event }, 'Failed to complete git command tracking');
      throw error;
    }
  }

  /**
   * Update command progress
   */
  async updateProgress(event: GitCommandProgressEvent): Promise<void> {
    if (!this.config.enabled) return;

    const { commandId, progress, message } = event;

    // Emit progress event
    this.emit('command:progress', event);

    if (this.config.enableRealTimeUpdates) {
      this.emit('realtime:update', {
        type: 'progress',
        commandId,
        data: event,
        timestamp: new Date()
      });
    }

    logger.debug({ commandId, progress, message }, 'Git command progress');
  }

  /**
   * Get or create a session
   */
  private async getOrCreateSession(context: Partial<CommandExecutionContext>): Promise<string> {
    const sessionId = context.sessionId || crypto.randomUUID();
    const now = new Date();

    // Check if session exists
    const existingSession = this.activeSessions.get(sessionId);
    
    if (!existingSession) {
      // Create new session
      const session: GitCommandSession = {
        id: sessionId,
        userId: context.userId,
        username: context.username || 'unknown',
        repositoryPath: context.repositoryPath || process.cwd(),
        branch: context.branch,
        startedAt: now,
        lastActivityAt: now,
        isActive: true,
        metadata: context.metadata
      };

      // Store in memory
      this.activeSessions.set(sessionId, session);

      // Insert into database
      try {
        await db.insert(gitCommandSessions).values({
          id: sessionId,
          userId: context.userId,
          username: session.username,
          repositoryPath: session.repositoryPath,
          branch: context.branch,
          startedAt: now,
          lastActivityAt: now,
          isActive: true,
          metadata: context.metadata || {}
        });
      } catch (error) {
        // Session might already exist, ignore error
        logger.debug({ sessionId, error }, 'Session may already exist');
      }

      this.emit('session:start', session);
      logger.info({ sessionId, username: session.username }, 'Git session started');
    }

    return sessionId;
  }

  /**
   * Update session activity timestamp
   */
  private async updateSessionActivity(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.lastActivityAt = new Date();
      this.activeSessions.set(sessionId, session);

      // Update in database periodically (not every time for performance)
      // This is a simplified version - in production, batch these updates
      try {
        await db
          .update(gitCommandSessions)
          .set({ lastActivityAt: new Date() })
          .where(eq(gitCommandSessions.id, sessionId));
      } catch (error) {
        logger.debug({ sessionId, error }, 'Failed to update session activity');
      }
    }
  }

  /**
   * End a session
   */
  async endSession(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.isActive = false;
      
      try {
        await db
          .update(gitCommandSessions)
          .set({ isActive: false })
          .where(eq(gitCommandSessions.id, sessionId));
      } catch (error) {
        logger.error({ sessionId, error }, 'Failed to end session');
      }

      this.activeSessions.delete(sessionId);
      this.emit('session:end', session);
      logger.info({ sessionId }, 'Git session ended');
    }
  }

  /**
   * Get command logs with filtering and pagination
   */
  async getCommandLogs(
    filters: GitCommandLogFilters = {},
    pagination: PaginationOptions = {}
  ): Promise<PaginatedResult<GitCommandLog>> {
    const {
      page = 1,
      limit = 50,
      sortBy = 'startTime',
      sortOrder = 'desc'
    } = pagination;

    // Build where conditions
    const conditions = [];

    if (filters.userId) {
      conditions.push(eq(gitCommandLogs.userId, filters.userId));
    }
    if (filters.command) {
      conditions.push(eq(gitCommandLogs.command, filters.command));
    }
    if (filters.subcommand) {
      conditions.push(eq(gitCommandLogs.subcommand, filters.subcommand));
    }
    if (filters.status) {
      conditions.push(eq(gitCommandLogs.status, filters.status));
    }
    if (filters.branch) {
      conditions.push(eq(gitCommandLogs.branch, filters.branch));
    }
    if (filters.repositoryName) {
      conditions.push(eq(gitCommandLogs.repositoryName, filters.repositoryName));
    }
    if (filters.sessionId) {
      conditions.push(eq(gitCommandLogs.sessionId, filters.sessionId));
    }
    if (filters.startTimeFrom) {
      conditions.push(gte(gitCommandLogs.startTime, filters.startTimeFrom));
    }
    if (filters.startTimeTo) {
      conditions.push(lte(gitCommandLogs.startTime, filters.startTimeTo));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get total count
    const countResult = await db
      .select({ count: count() })
      .from(gitCommandLogs)
      .where(whereClause);
    
    const total = countResult[0]?.count || 0;

    // Build order by from a safe column map.
    const sortableColumns = {
      startTime: gitCommandLogs.startTime,
      endTime: gitCommandLogs.endTime,
      command: gitCommandLogs.command,
      status: gitCommandLogs.status,
      createdAt: gitCommandLogs.createdAt,
    } as const;
    const selectedColumn = sortableColumns[sortBy as keyof typeof sortableColumns] ?? gitCommandLogs.startTime;
    const orderBy = sortOrder === 'asc' ? asc(selectedColumn) : desc(selectedColumn);

    // Get data
    const data = await db
      .select()
      .from(gitCommandLogs)
      .where(whereClause)
      .orderBy(orderBy)
      .limit(limit)
      .offset((page - 1) * limit);

    return {
      data: data as GitCommandLog[],
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  /**
   * Get command statistics
   */
  async getCommandStats(params: StatsQueryParams): Promise<GitCommandStatsType[]> {
    const { command, subcommand, repositoryName, periodType, periodStart, periodEnd } = params;

    const conditions = [
      eq(gitCommandStats.periodType, periodType),
      gte(gitCommandStats.periodStart, periodStart),
      lte(gitCommandStats.periodStart, periodEnd)
    ];

    if (command) {
      conditions.push(eq(gitCommandStats.command, command));
    }
    if (subcommand) {
      conditions.push(eq(gitCommandStats.subcommand, subcommand));
    }
    if (repositoryName) {
      conditions.push(eq(gitCommandStats.repositoryName, repositoryName));
    }

    const results = await db
      .select()
      .from(gitCommandStats)
      .where(and(...conditions))
      .orderBy(desc(gitCommandStats.periodStart));

    return results as GitCommandStatsType[];
  }

  /**
   * Get dashboard statistics
   */
  async getDashboardStats(): Promise<DashboardStats> {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Get 24h stats
    const recentLogs = await db
      .select()
      .from(gitCommandLogs)
      .where(gte(gitCommandLogs.startTime, yesterday))
      .orderBy(desc(gitCommandLogs.startTime));

    const totalCommands24h = recentLogs.length;
    const successfulCommands24h = recentLogs.filter((l) => l.status === 'completed').length;
    const failedCommands24h = recentLogs.filter((l) => l.status === 'failed').length;
    
    const durations = recentLogs
      .filter((l) => l.durationMs !== null)
      .map((l) => l.durationMs as number);
    
    const averageDuration24h = durations.length > 0
      ? durations.reduce((a: number, b: number) => a + b, 0) / durations.length
      : 0;

    // Get top commands
    const commandCounts = recentLogs.reduce((acc: Record<string, number>, log) => {
      acc[log.command] = (acc[log.command] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const topCommands = Object.entries(commandCounts)
      .map(([command, count]) => ({ command, count: count as number }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Get active sessions
    const activeSessions = await db
      .select({ count: count() })
      .from(gitCommandSessions)
      .where(eq(gitCommandSessions.isActive, true));

    return {
      totalCommands24h,
      successfulCommands24h,
      failedCommands24h,
      averageDuration24h,
      topCommands,
      activeSessions: activeSessions[0]?.count || 0,
      recentActivity: recentLogs.slice(0, 10) as GitCommandLog[]
    };
  }

  /**
   * Get active commands
   */
  getActiveCommands(): GitCommandLog[] {
    return Array.from(this.activeCommands.values());
  }

  /**
   * Get active sessions
   */
  getActiveSessions(): GitCommandSession[] {
    return Array.from(this.activeSessions.values());
  }

  /**
   * Clean up old logs
   */
  async cleanupOldLogs(): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);

    try {
      const result = await db
        .delete(gitCommandLogs)
        .where(lte(gitCommandLogs.startTime, cutoffDate));

      logger.info({ deletedCount: result.rowCount, cutoffDate }, 'Cleaned up old git command logs');
      return result.rowCount || 0;
    } catch (error) {
      logger.error({ error, cutoffDate }, 'Failed to cleanup old logs');
      throw error;
    }
  }

  /**
   * Start stats aggregation timer
   */
  private startStatsAggregation(): void {
    const intervalMs = this.config.statsAggregationInterval * 60 * 1000;
    
    this.statsAggregationTimer = setInterval(async () => {
      try {
        await this.aggregateStats();
      } catch (error) {
        logger.error({ error }, 'Stats aggregation failed');
      }
    }, intervalMs);

    logger.info({ intervalMinutes: this.config.statsAggregationInterval }, 'Started stats aggregation');
  }

  /**
   * Aggregate statistics
   */
  private async aggregateStats(): Promise<void> {
    const now = new Date();
    const hourStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());
    
    // Aggregate hourly stats
    const hourlyStats = await db.execute(sql`
      SELECT 
        command,
        subcommand,
        repository_name,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as successful,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        AVG(duration_ms) as avg_duration,
        MIN(duration_ms) as min_duration,
        MAX(duration_ms) as max_duration
      FROM gitcommandlogs
      WHERE start_time >= ${hourStart} AND start_time < ${now}
      GROUP BY command, subcommand, repository_name
    `);

    // Insert or update stats
    for (const stat of hourlyStats.rows || []) {
      await db
        .insert(gitCommandStats)
        .values({
          command: stat.command as string,
          subcommand: stat.subcommand as string,
          repositoryName: stat.repository_name as string,
          totalExecutions: parseInt(stat.total as string),
          successfulExecutions: parseInt(stat.successful as string),
          failedExecutions: parseInt(stat.failed as string),
          avgDurationMs: Math.round(parseFloat(stat.avg_duration as string)),
          minDurationMs: parseInt(stat.min_duration as string),
          maxDurationMs: parseInt(stat.max_duration as string),
          periodStart: hourStart,
          periodEnd: now,
          periodType: 'hourly',
          lastUpdated: now
        })
        .onConflictDoUpdate({
          target: [
            gitCommandStats.command,
            gitCommandStats.subcommand,
            gitCommandStats.repositoryName,
            gitCommandStats.periodType,
            gitCommandStats.periodStart
          ],
          set: {
            totalExecutions: parseInt(stat.total as string),
            successfulExecutions: parseInt(stat.successful as string),
            failedExecutions: parseInt(stat.failed as string),
            avgDurationMs: Math.round(parseFloat(stat.avg_duration as string)),
            minDurationMs: parseInt(stat.min_duration as string),
            maxDurationMs: parseInt(stat.max_duration as string),
            lastUpdated: now
          }
        });
    }

    this.emit('stats:updated', { period: 'hourly', timestamp: now });
    logger.debug('Hourly stats aggregation completed');
  }

  /**
   * Subscribe to monitor events
   */
  on<T>(event: GitMonitorEventType, handler: GitMonitorEventHandler<T>): this {
    return super.on(event, handler);
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<GitMonitorConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.info({ config: this.config }, 'GitCommandMonitor config updated');
  }

  /**
   * Get current configuration
   */
  getConfig(): GitMonitorConfig {
    return { ...this.config };
  }

  /**
   * Destroy the monitor
   */
  destroy(): void {
    if (this.statsAggregationTimer) {
      clearInterval(this.statsAggregationTimer);
      this.statsAggregationTimer = null;
    }

    this.activeCommands.clear();
    this.activeSessions.clear();
    this.removeAllListeners();

    logger.info('GitCommandMonitor destroyed');
  }
}

/**
 * Initialize the git command monitor
 */
export function initializeGitCommandMonitor(config?: Partial<GitMonitorConfig>): GitCommandMonitor {
  return GitCommandMonitor.getInstance(config);
}

/**
 * Get the monitor instance
 */
export function getGitCommandMonitor(): GitCommandMonitor {
  return GitCommandMonitor.getInstance();
}

/**
 * Shutdown the monitor
 */
export function shutdownGitCommandMonitor(): void {
  GitCommandMonitor.resetInstance();
}

// Export singleton methods for convenience
export const startCommand = (event: GitCommandStartEvent) => 
  getGitCommandMonitor().startCommand(event);

export const completeCommand = (event: GitCommandCompleteEvent) => 
  getGitCommandMonitor().completeCommand(event);

export const updateCommandProgress = (event: GitCommandProgressEvent) => 
  getGitCommandMonitor().updateProgress(event);

export const endGitSession = (sessionId: string) => 
  getGitCommandMonitor().endSession(sessionId);

export const getGitDashboardStats = () => 
  getGitCommandMonitor().getDashboardStats();

export const getGitCommandLogs = (
  filters?: GitCommandLogFilters, 
  pagination?: PaginationOptions
) => getGitCommandMonitor().getCommandLogs(filters, pagination);
