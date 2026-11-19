/**
 * Git Monitor API Routes
 * 
 * Provides endpoints for tracking git commands and retrieving monitoring data
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { 
  startCommand, 
  completeCommand, 
  getGitDashboardStats,
  getGitCommandLogs,
  getGitCommandMonitor 
} from '~/server/services/GitCommandMonitor.js';
import { requireAuth } from '~/server/middleware/auth.js';
import { logger } from '~/server/lib/logger.js';
import type { 
  GitCommandStartEvent, 
  GitCommandCompleteEvent,
  GitCommandLogFilters,
  PaginationOptions 
} from '~/server/types/gitCommands.js';

const router = Router();

// Validation schemas
const startCommandSchema = z.object({
  commandId: z.string().optional(),
  command: z.string(),
  subcommand: z.string().optional(),
  args: z.array(z.string()).optional(),
  workingDirectory: z.string(),
  userId: z.string().uuid().optional(),
  username: z.string().optional(),
  branch: z.string().optional(),
  commitHash: z.string().optional(),
  sessionId: z.string().optional(),
  parentCommandId: z.string().uuid().optional(),
  remoteUrl: z.string().optional(),
  repositoryName: z.string().optional(),
  startTime: z.string().datetime().optional()
});

const completeCommandSchema = z.object({
  commandId: z.string(),
  status: z.enum(['completed', 'failed', 'cancelled']),
  exitCode: z.number().optional(),
  endTime: z.string().datetime().optional(),
  durationMs: z.number().optional(),
  errorMessage: z.string().optional(),
  errorStack: z.string().optional()
});

const listCommandsSchema = z.object({
  page: z.string().transform(Number).default('1'),
  limit: z.string().transform(Number).default('50'),
  command: z.string().optional(),
  status: z.enum(['pending', 'running', 'completed', 'failed', 'cancelled']).optional(),
  branch: z.string().optional(),
  repositoryName: z.string().optional(),
  sessionId: z.string().optional(),
  sortBy: z.string().default('startTime'),
  sortOrder: z.enum(['asc', 'desc']).default('desc')
});

/**
 * POST /api/git/commands/start
 * Start tracking a new git command
 * Note: No auth required - called by git hooks
 */
router.post('/commands/start', async (req: Request, res: Response) => {
  try {
    const validated = startCommandSchema.parse(req.body);
    
    const event: GitCommandStartEvent = {
      command: validated.command,
      subcommand: validated.subcommand,
      args: validated.args || [],
      workingDirectory: validated.workingDirectory,
      userId: validated.userId,
      username: validated.username,
      branch: validated.branch,
      commitHash: validated.commitHash,
      sessionId: validated.sessionId,
      parentCommandId: validated.parentCommandId,
      remoteUrl: validated.remoteUrl,
      repositoryName: validated.repositoryName
    };

    const commandId = await startCommand(event);
    
    logger.debug({ commandId, command: event.command }, 'Git command start tracked via API');
    
    res.status(201).json({
      success: true,
      commandId,
      message: 'Command tracking started'
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors
      });
    } else {
      logger.error({ error }, 'Failed to start command tracking');
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
});

/**
 * POST /api/git/commands/complete
 * Complete a tracked git command
 */
router.post('/commands/complete', async (req: Request, res: Response) => {
  try {
    const validated = completeCommandSchema.parse(req.body);
    
    const event: GitCommandCompleteEvent = {
      commandId: validated.commandId,
      status: validated.status,
      exitCode: validated.exitCode,
      endTime: validated.endTime ? new Date(validated.endTime) : new Date(),
      errorMessage: validated.errorMessage,
      errorStack: validated.errorStack
    };

    await completeCommand(event);
    
    logger.debug({ 
      commandId: event.commandId, 
      status: event.status,
      exitCode: event.exitCode 
    }, 'Git command completion tracked via API');
    
    res.json({
      success: true,
      message: 'Command completion tracked'
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors
      });
    } else {
      logger.error({ error }, 'Failed to complete command tracking');
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
});

/**
 * GET /api/git/commands
 * List git command logs with filtering
 */
router.get('/commands', requireAuth, async (req: Request, res: Response) => {
  try {
    const validated = listCommandsSchema.parse(req.query);
    
    const filters: GitCommandLogFilters = {
      command: validated.command,
      status: validated.status,
      branch: validated.branch,
      repositoryName: validated.repositoryName,
      sessionId: validated.sessionId
    };

    // Remove undefined values
    Object.keys(filters).forEach(key => {
      if (filters[key as keyof GitCommandLogFilters] === undefined) {
        delete filters[key as keyof GitCommandLogFilters];
      }
    });

    const pagination: PaginationOptions = {
      page: validated.page,
      limit: validated.limit,
      sortBy: validated.sortBy,
      sortOrder: validated.sortOrder
    };

    const result = await getGitCommandLogs(filters, pagination);
    
    res.json({
      success: true,
      data: result.data,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors
      });
    } else {
      logger.error({ error }, 'Failed to list commands');
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
});

/**
 * GET /api/git/commands/active
 * Get currently active commands
 */
router.get('/commands/active', requireAuth, async (_req: Request, res: Response) => {
  try {
    const monitor = getGitCommandMonitor();
    const activeCommands = monitor.getActiveCommands();
    
    res.json({
      success: true,
      data: activeCommands,
      count: activeCommands.length
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get active commands');
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * GET /api/git/sessions/active
 * Get currently active sessions
 */
router.get('/sessions/active', requireAuth, async (_req: Request, res: Response) => {
  try {
    const monitor = getGitCommandMonitor();
    const activeSessions = monitor.getActiveSessions();
    
    res.json({
      success: true,
      data: activeSessions,
      count: activeSessions.length
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get active sessions');
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * GET /api/git/stats/dashboard
 * Get dashboard statistics
 */
router.get('/stats/dashboard', requireAuth, async (_req: Request, res: Response) => {
  try {
    const stats = await getGitDashboardStats();
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get dashboard stats');
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * GET /api/git/stats/commands
 * Get command statistics
 */
router.get('/stats/commands', requireAuth, async (req: Request, res: Response) => {
  try {
    const { command, periodType = 'daily' } = req.query;
    
    const now = new Date();
    const periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
    
    const monitor = getGitCommandMonitor();
    const stats = await monitor.getCommandStats({
      command: command as string | undefined,
      periodType: periodType as any,
      periodStart,
      periodEnd: now
    });
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get command stats');
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * GET /api/git/config
 * Get monitor configuration
 */
router.get('/config', requireAuth, async (_req: Request, res: Response) => {
  try {
    const monitor = getGitCommandMonitor();
    const config = monitor.getConfig();
    
    res.json({
      success: true,
      data: config
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get config');
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * POST /api/git/config
 * Update monitor configuration
 */
router.post('/config', requireAuth, async (req: Request, res: Response) => {
  try {
    const monitor = getGitCommandMonitor();
    monitor.updateConfig(req.body);
    
    res.json({
      success: true,
      message: 'Configuration updated',
      config: monitor.getConfig()
    });
  } catch (error) {
    logger.error({ error }, 'Failed to update config');
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * POST /api/git/cleanup
 * Clean up old logs
 */
router.post('/cleanup', requireAuth, async (_req: Request, res: Response) => {
  try {
    const monitor = getGitCommandMonitor();
    const deletedCount = await monitor.cleanupOldLogs();
    
    res.json({
      success: true,
      message: `Cleaned up ${deletedCount} old log entries`
    });
  } catch (error) {
    logger.error({ error }, 'Failed to cleanup logs');
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

export default router;
