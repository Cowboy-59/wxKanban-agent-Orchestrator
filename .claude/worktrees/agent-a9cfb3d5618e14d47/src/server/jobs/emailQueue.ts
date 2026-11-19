import { Queue, QueueEvents, Job } from "bullmq";
import { logger } from "../lib/logger.js";

/**
 * BullMQ email job queue configuration
 * Handles asynchronous email delivery with retry logic and failure handling
 *
 * Features:
 * - Exponential backoff retry strategy (1s → 2s → 4s → 8s → 16s)
 * - Max 3 retry attempts before DLQ
 * - Job priority (high for verification, low for newsletters)
 * - Rate limiting (10 emails per second max)
 */

export interface EmailJobData {
  id?: string;
  batchId?: string;
  to: string;
  subject: string;
  htmlContent?: string;
  textContent?: string;
  template?: string;
  variables?: Record<string, string>;
  priority?: "high" | "normal" | "low";
  replyTo?: string;
}

/**
 * Email queue instance
 */
let emailQueue: Queue<EmailJobData> | null = null;

/**
 * Queue events listener
 */
let queueEvents: QueueEvents | null = null;

/**
 * Initialize email queue
 */
export function initializeEmailQueue(): Queue<EmailJobData> {
  if (emailQueue) {
    return emailQueue;
  }

  try {
    // Use connection object compatible with BullMQ
    const redisConfig = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD,
    };

    emailQueue = new Queue<EmailJobData>("email", {
      connection: redisConfig,
      defaultJobOptions: {
        // Retry configuration
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 1000, // Start with 1 second
        },

        // Remove job after completion (successful)
        removeOnComplete: {
          age: 3600, // Keep for 1 hour
        },

        // Move job to DLQ after max retries
        removeOnFail: false, // Keep failed jobs for inspection
      },
    });

    // Initialize queue events listener
    queueEvents = new QueueEvents("email", { connection: redisConfig });

    // Event listeners
    queueEvents.on("completed", ({ jobId }) => {
      logger.info({ jobId }, "Email job completed");
    });

    queueEvents.on("failed", ({ jobId, failedReason }) => {
      logger.warn({ jobId, failedReason }, "Email job failed");
    });

    queueEvents.on("drained", () => {
      logger.info("Email queue drained");
    });

    logger.info("Email queue initialized");
    return emailQueue;
  } catch (error) {
    logger.error({ error }, "Failed to initialize email queue");
    throw error;
  }
}

/**
 * Get email queue instance
 */
export function getEmailQueue(): Queue<EmailJobData> {
  if (!emailQueue) {
    return initializeEmailQueue();
  }
  return emailQueue;
}

/**
 * Add email job to queue
 */
export async function addEmailJob(
  data: EmailJobData,
  options?: {
    priority?: 1 | 2 | 3; // 1 = high, 3 = low
    delay?: number; // Milliseconds to wait before processing
  }
): Promise<Job<EmailJobData>> {
  const queue = getEmailQueue();

  try {
    const priority = options?.priority || 2; // Default: normal
    const delay = options?.delay || 0;

    const job = await queue.add("email", data, {
      priority,
      delay,
    });

    logger.info(
      { jobId: job.id, to: data.to, subject: data.subject },
      "Email job added to queue"
    );

    return job;
  } catch (error) {
    logger.error({ error, to: data.to }, "Failed to add email job");
    throw error;
  }
}

/**
 * Add bulk email jobs to queue
 */
export async function addBulkEmailJobs(
  emailList: EmailJobData[],
  options?: {
    priority?: 1 | 2 | 3;
    delay?: number;
  }
): Promise<Job<EmailJobData>[]> {
  const queue = getEmailQueue();

  try {
    const priority = options?.priority || 2;
    const delay = options?.delay || 0;

    const jobs = await queue.addBulk(
      emailList.map((email) => ({
        name: "email",
        data: email,
        opts: { priority, delay },
      }))
    );

    logger.info(
      { jobCount: jobs.length },
      "Bulk email jobs added to queue"
    );

    return jobs;
  } catch (error) {
    logger.error(
      { error, jobCount: emailList.length },
      "Failed to add bulk email jobs"
    );
    throw error;
  }
}

/**
 * Get job by ID
 */
export async function getEmailJob(
  jobId: string
): Promise<Job<EmailJobData> | undefined> {
  const queue = getEmailQueue();

  try {
    const job = await queue.getJob(jobId);
    return job;
  } catch (error) {
    logger.error({ error, jobId }, "Failed to get email job");
    throw error;
  }
}

/**
 * Get queue statistics
 */
export async function getEmailQueueStats(): Promise<{
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  completed: number;
}> {
  const queue = getEmailQueue();

  try {
    const [waiting, active, delayed, failed, completed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getDelayedCount(),
      queue.getFailedCount(),
      queue.getCompletedCount(),
    ]);

    return { waiting, active, delayed, failed, completed };
  } catch (error) {
    logger.error({ error }, "Failed to get email queue stats");
    throw error;
  }
}

/**
 * Clear failed jobs (for cleanup)
 */
export async function clearFailedEmailJobs(): Promise<void> {
  const queue = getEmailQueue();

  try {
    const failedJobs = await queue.getFailed();
    await Promise.all(failedJobs.map((job) => job.remove()));
    logger.info("Failed email jobs cleared");
  } catch (error) {
    logger.error({ error }, "Failed to clear failed email jobs");
    throw error;
  }
}

/**
 * Pause queue (stops processing new jobs)
 */
export async function pauseEmailQueue(): Promise<void> {
  const queue = getEmailQueue();

  try {
    await queue.pause();
    logger.info("Email queue paused");
  } catch (error) {
    logger.error({ error }, "Failed to pause email queue");
    throw error;
  }
}

/**
 * Resume queue
 */
export async function resumeEmailQueue(): Promise<void> {
  const queue = getEmailQueue();

  try {
    await queue.resume();
    logger.info("Email queue resumed");
  } catch (error) {
    logger.error({ error }, "Failed to resume email queue");
    throw error;
  }
}

/**
 * Cleanup and disconnect queue
 */
export async function disconnectEmailQueue(): Promise<void> {
  try {
    if (queueEvents) {
      await queueEvents.close();
      queueEvents = null;
    }

    if (emailQueue) {
      await emailQueue.close();
      emailQueue = null;
    }

    logger.info("Email queue disconnected");
  } catch (error) {
    logger.error({ error }, "Error disconnecting email queue");
  }
}

/**
 * Email queue configuration for monitoring
 */
export const emailQueueConfig = {
  // Job timeout (30 minutes for email processing)
  timeout: 1800000,

  // Exponential backoff retry delays (in ms)
  retryDelays: [1000, 2000, 4000, 8000, 16000],

  // Max concurrent job processing
  concurrency: 10,

  // Job priority levels
  priorities: {
    high: 1, // Verification emails
    normal: 2, // Invitations
    low: 3, // Newsletters
  },
};
