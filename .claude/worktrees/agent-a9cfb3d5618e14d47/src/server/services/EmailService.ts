import { createLogger } from '../lib/logger.js';
import { getEmailQueue, type EmailJobData as QueueEmailJobData } from '../jobs/emailQueue.js';
import type { Job } from 'bullmq';
import { v7 as uuidv7 } from 'uuid';

const logger = createLogger('email-service');
const emailQueue = getEmailQueue();
type QueuedEmailJobData = QueueEmailJobData & { id?: string; batchId?: string };

export type EmailTemplate = 
  | 'verification'
  | 'welcome'
  | 'invitation'
  | 'account-created'
  | 'invoice'
  | 'payment-failed'
  | 'password-reset';

export interface EmailData {
  to: string;
  subject: string;
  template: EmailTemplate;
  variables: Record<string, string>;
  replyTo?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer;
    contentType: string;
  }>;
}

export interface QueuedEmail {
  id: string;
  status: 'queued' | 'sent' | 'failed';
  attempts: number;
  maxAttempts: number;
  error?: string;
}

/**
 * Queue an email for sending
 */
export async function queueEmail(data: EmailData): Promise<QueuedEmail> {
  try {
    const emailId = uuidv7();

    const job = await emailQueue.add(
      'send-email',
      {
        id: emailId,
        ...data,
      },
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000, // Start with 5s, then 10s, then 20s
        },
        removeOnComplete: 100,
        removeOnFail: 50,
      }
    );

    logger.info(
      {
        emailId,
        to: data.to,
        template: data.template,
        jobId: job.id,
      },
      'Email queued successfully'
    );

    return {
      id: emailId,
      status: 'queued',
      attempts: 0,
      maxAttempts: 3,
    };
  } catch (error) {
    logger.error(
      { error, to: data.to, template: data.template },
      'Failed to queue email'
    );
    throw error;
  }
}

/**
 * Queue multiple emails (batch)
 */
export async function queueBatchEmails(
  emails: EmailData[],
  batchId?: string
): Promise<{ batchId: string; queued: number; failed: number }> {
  const batch = batchId || uuidv7();
  let queued = 0;
  let failed = 0;

  logger.info(
    { batchId: batch, total: emails.length },
    'Starting batch email queue'
  );

  for (const email of emails) {
    try {
      await emailQueue.add(
        'send-email',
        {
          id: uuidv7(),
          batchId: batch,
          ...email,
        },
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
        }
      );
      queued++;
    } catch (error) {
      logger.error(
        { error, to: email.to, batchId: batch },
        'Failed to queue email in batch'
      );
      failed++;
    }
  }

  logger.info(
    { batchId: batch, queued, failed, total: emails.length },
    'Batch email queue completed'
  );

  return { batchId: batch, queued, failed };
}

/**
 * Get email job status
 */
export async function getEmailStatus(emailId: string): Promise<QueuedEmail | null> {
  try {
    const jobs = await emailQueue.getJobs(['completed', 'failed', 'waiting', 'active']);
    const job = jobs.find((j: Job<QueuedEmailJobData>) => j.data.id === emailId);

    if (!job) {
      return null;
    }

    const attempts = job.attemptsMade || 0;
    const maxAttempts = job.opts?.attempts || 3;

    if (job.returnvalue) {
      return {
        id: emailId,
        status: 'sent',
        attempts,
        maxAttempts,
      };
    }

    if (job.failedReason) {
      return {
        id: emailId,
        status: 'failed',
        attempts,
        maxAttempts,
        error: job.failedReason,
      };
    }

    return {
      id: emailId,
      status: 'queued',
      attempts,
      maxAttempts,
    };
  } catch (error) {
    logger.error({ error, emailId }, 'Failed to get email status');
    throw error;
  }
}

/**
 * Get batch status
 */
export async function getBatchStatus(batchId: string): Promise<{
  total: number;
  sent: number;
  failed: number;
  pending: number;
  failedEmails?: Array<{ email: string; reason: string }>;
}> {
  try {
    const jobs = await emailQueue.getJobs(['completed', 'failed', 'waiting', 'active']);
    const batchJobs = jobs.filter((j: Job<QueuedEmailJobData>) => j.data.batchId === batchId);

    const total = batchJobs.length;
    const sent = batchJobs.filter((j: Job<QueuedEmailJobData>) => j.returnvalue).length;
    const failed = batchJobs.filter((j: Job<QueuedEmailJobData>) => j.failedReason).length;
    const pending = total - sent - failed;

    const failedEmails = batchJobs
      .filter((j: Job<QueuedEmailJobData>) => j.failedReason)
      .map((j: Job<QueuedEmailJobData>) => ({
        email: j.data.to,
        reason: j.failedReason || 'Unknown error',
      }));

    return {
      total,
      sent,
      failed,
      pending,
      failedEmails: failedEmails.length > 0 ? failedEmails : undefined,
    };
  } catch (error) {
    logger.error({ error, batchId }, 'Failed to get batch status');
    throw error;
  }
}

/**
 * Retry failed email
 */
export async function retryEmail(emailId: string): Promise<boolean> {
  try {
    const jobs = await emailQueue.getJobs(['failed']);
    const job = jobs.find((j: Job<QueuedEmailJobData>) => j.data.id === emailId);

    if (!job) {
      logger.warn({ emailId }, 'Failed email job not found for retry');
      return false;
    }

    await job.retry();
    logger.info({ emailId, jobId: job.id }, 'Email retry initiated');
    return true;
  } catch (error) {
    logger.error({ error, emailId }, 'Failed to retry email');
    return false;
  }
}

/**
 * Cancel pending email
 */
export async function cancelEmail(emailId: string): Promise<boolean> {
  try {
    const jobs = await emailQueue.getJobs(['waiting', 'delayed']);
    const job = jobs.find((j: Job<QueuedEmailJobData>) => j.data.id === emailId);

    if (!job) {
      logger.warn({ emailId }, 'Pending email job not found for cancellation');
      return false;
    }

    await job.remove();
    logger.info({ emailId, jobId: job.id }, 'Email cancelled');
    return true;
  } catch (error) {
    logger.error({ error, emailId }, 'Failed to cancel email');
    return false;
  }
}

/**
 * Send verification email
 */
export async function sendVerificationEmail(
  to: string,
  verificationLink: string,
  companyName?: string
): Promise<QueuedEmail> {
  return queueEmail({
    to,
    subject: 'Verify your email address',
    template: 'verification',
    variables: {
      verificationLink,
      companyName: companyName || 'wxKanban',
      expiryHours: '24',
    },
  });
}

/**
 * Send welcome email
 */
export async function sendWelcomeEmail(
  to: string,
  dashboardLink: string,
  firstName: string
): Promise<QueuedEmail> {
  return queueEmail({
    to,
    subject: 'Welcome to wxKanban!',
    template: 'welcome',
    variables: {
      firstName,
      dashboardLink,
    },
  });
}

/**
 * Send invitation email
 */
export async function sendInvitationEmail(
  to: string,
  invitationLink: string,
  invitedByName: string,
  companyName: string,
  role: string,
  message?: string
): Promise<QueuedEmail> {
  return queueEmail({
    to,
    subject: `You've been invited to join ${companyName} on wxKanban`,
    template: 'invitation',
    variables: {
      invitationLink,
      invitedByName,
      companyName,
      role,
      message: message || '',
      expiryDays: '7',
    },
  });
}

/**
 * Send account created email
 */
export async function sendAccountCreatedEmail(
  to: string,
  dashboardLink: string,
  companyName: string
): Promise<QueuedEmail> {
  return queueEmail({
    to,
    subject: 'Your wxKanban account is ready',
    template: 'account-created',
    variables: {
      dashboardLink,
      companyName,
    },
  });
}

/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(
  to: string,
  resetLink: string
): Promise<QueuedEmail> {
  return queueEmail({
    to,
    subject: 'Reset your wxKanban password',
    template: 'password-reset',
    variables: {
      resetLink,
      expiryHours: '1',
    },
  });
}
