/**
 * Job Scheduler Service
 * Simple background job scheduler for task synchronization
 * Can be upgraded to Bull/BullMQ when Redis is available
 */

import { logger } from '../lib/logger.js';
import { syncAllPMTasks, type SyncResult } from './pmSyncService.js';
import type { PMSystem } from './pmSystemService.js';

// Job types
type JobType = 'sync-pm-tasks' | 'refresh-tokens' | 'cleanup-old-tasks';

interface Job {
  id: string;
  type: JobType;
  userid?: string;
  pmsystem?: PMSystem;
  data?: Record<string, unknown>;
  scheduledAt: Date;
  interval?: number; // milliseconds for recurring jobs
}

interface JobResult {
  jobId: string;
  success: boolean;
  result?: SyncResult | unknown;
  error?: string;
  executedAt: Date;
}

// In-memory job storage (replace with Redis in production)
const scheduledJobs = new Map<string, NodeJS.Timeout>();
const jobHistory: JobResult[] = [];
const MAX_HISTORY = 100;

/**
 * Schedule a one-time job
 */
export function scheduleJob(
  type: JobType,
  executeAt: Date,
  data?: {
    userid?: string;
    pmsystem?: PMSystem;
    [key: string]: unknown;
  }
): string {
  const jobId = `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const delay = executeAt.getTime() - Date.now();

  if (delay < 0) {
    throw new Error('Cannot schedule job in the past');
  }

  const job: Job = {
    id: jobId,
    type,
    userid: data?.userid,
    pmsystem: data?.pmsystem,
    data,
    scheduledAt: executeAt,
  };

  const timeout = setTimeout(() => {
    executeJob(job);
  }, delay);

  scheduledJobs.set(jobId, timeout);

  logger.info(
    { jobId, type, executeAt, delay },
    'Job scheduled'
  );

  return jobId;
}

/**
 * Schedule a recurring job
 */
export function scheduleRecurringJob(
  type: JobType,
  interval: number, // milliseconds
  data?: {
    userid?: string;
    pmsystem?: PMSystem;
    [key: string]: unknown;
  }
): string {
  const jobId = `${type}-recurring-${Date.now()}`;

  const job: Job = {
    id: jobId,
    type,
    userid: data?.userid,
    pmsystem: data?.pmsystem,
    data,
    scheduledAt: new Date(),
    interval,
  };

  // Execute immediately, then schedule recurring
  executeJob(job);

  const intervalId = setInterval(() => {
    executeJob(job);
  }, interval);

  scheduledJobs.set(jobId, intervalId);

  logger.info(
    { jobId, type, interval },
    'Recurring job scheduled'
  );

  return jobId;
}

/**
 * Cancel a scheduled job
 */
export function cancelJob(jobId: string): boolean {
  const timeout = scheduledJobs.get(jobId);
  if (!timeout) {
    return false;
  }

  clearTimeout(timeout);
  clearInterval(timeout);
  scheduledJobs.delete(jobId);

  logger.info({ jobId }, 'Job cancelled');
  return true;
}

/**
 * Execute a job
 */
async function executeJob(job: Job): Promise<JobResult> {
  logger.info({ jobId: job.id, type: job.type }, 'Executing job');

  const result: JobResult = {
    jobId: job.id,
    success: false,
    executedAt: new Date(),
  };

  try {
    switch (job.type) {
      case 'sync-pm-tasks':
        if (job.userid) {
          const syncResults = await syncAllPMTasks(job.userid);
          result.result = syncResults;
          result.success = syncResults.every(r => r.errors.length === 0);
        }
        break;

      case 'refresh-tokens':
        // TODO: Implement token refresh
        logger.info('Token refresh job not yet implemented');
        result.success = true;
        break;

      case 'cleanup-old-tasks':
        // TODO: Implement task cleanup
        logger.info('Task cleanup job not yet implemented');
        result.success = true;
        break;

      default:
        throw new Error(`Unknown job type: ${job.type}`);
    }

    logger.info(
      { jobId: job.id, type: job.type, success: result.success },
      'Job executed successfully'
    );
  } catch (error) {
    result.success = false;
    result.error = error instanceof Error ? error.message : 'Unknown error';
    logger.error(
      { jobId: job.id, type: job.type, error: result.error },
      'Job execution failed'
    );
  }

  // Store in history
  jobHistory.push(result);
  if (jobHistory.length > MAX_HISTORY) {
    jobHistory.shift();
  }

  return result;
}

/**
 * Get job execution history
 */
export function getJobHistory(limit: number = 50): JobResult[] {
  return jobHistory.slice(-limit);
}

/**
 * Get active scheduled jobs count
 */
export function getActiveJobCount(): number {
  return scheduledJobs.size;
}

/**
 * Initialize default recurring jobs for a user
 * Call this when a user connects their first PM system
 */
export function initializeUserSyncJobs(userid: string): void {
  // Sync PM tasks every 15 minutes
  scheduleRecurringJob('sync-pm-tasks', 15 * 60 * 1000, { userid });

  // Refresh tokens every 12 hours (most tokens last 24+ hours)
  scheduleRecurringJob('refresh-tokens', 12 * 60 * 60 * 1000, { userid });

  logger.info({ userid }, 'Initialized default sync jobs for user');
}

/**
 * Cleanup all jobs for a user
 * Call this when user disconnects all PM systems
 */
export function cleanupUserJobs(userid: string): void {
  // Find and cancel all jobs for this user
  for (const [jobId, timeout] of scheduledJobs.entries()) {
    if (jobId.includes(userid) || jobId.includes('recurring')) {
      clearTimeout(timeout);
      clearInterval(timeout);
      scheduledJobs.delete(jobId);
    }
  }

  logger.info({ userid }, 'Cleaned up sync jobs for user');
}

/**
 * Shutdown all scheduled jobs
 * Call this on server shutdown
 */
export function shutdownScheduler(): void {
  logger.info('Shutting down job scheduler');

  for (const [jobId, timeout] of scheduledJobs.entries()) {
    clearTimeout(timeout);
    clearInterval(timeout);
    scheduledJobs.delete(jobId);
  }

  logger.info('Job scheduler shut down');
}
