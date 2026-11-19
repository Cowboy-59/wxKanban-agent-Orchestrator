import { Worker, Job } from "bullmq";
import { getRedis } from "../lib/redis.js";
import { sendEmail, sendTemplatedEmail } from "../lib/email.js";
import { logger } from "../lib/logger.js";

/**
 * BullMQ worker for processing email jobs from the queue
 * Handles asynchronous email delivery with error handling and retry logic
 *
 * Types of emails processed:
 * - Verification emails (during registration)
 * - Invitation emails (when inviting team members)
 * - Payment confirmation emails
 * - Subscription renewal notifications
 */

export interface EmailJobData {
  to: string;
  subject: string;
  htmlContent?: string;
  textContent?: string;
  template?: string;
  variables?: Record<string, string>;
  replyTo?: string;
}

/**
 * Email worker instance
 */
let emailWorker: Worker<EmailJobData> | null = null;

/**
 * Initialize email worker
 */
export function initializeEmailWorker(): Worker<EmailJobData> {
  if (emailWorker) {
    return emailWorker;
  }

  try {
    const redis = getRedis();

    emailWorker = new Worker<EmailJobData>(
      "email",
      async (job: Job<EmailJobData>) => {
        return await processEmailJob(job);
      },
      {
        connection: redis as any,

        // Concurrency: process 10 emails in parallel
        concurrency: 10,

        // Job timeout: 30 seconds per email (lockDuration in ms)
        lockDuration: 30000,
      }
    );

    // Event handlers
    emailWorker.on("completed", (job) => {
      logger.info(
        { jobId: job.id, to: job.data.to },
        "Email job completed successfully"
      );
    });

    emailWorker.on("failed", (job, error) => {
      if (job) {
        logger.error(
          {
            jobId: job.id,
            to: job.data.to,
            attemptsMade: job.attemptsMade,
            error: error?.message,
          },
          "Email job failed"
        );
      }
    });

    emailWorker.on("error", (error) => {
      logger.error({ error }, "Email worker error");
    });

    logger.info("Email worker initialized");
    return emailWorker;
  } catch (error) {
    logger.error({ error }, "Failed to initialize email worker");
    throw error;
  }
}

/**
 * Get email worker instance
 */
export function getEmailWorker(): Worker<EmailJobData> {
  if (!emailWorker) {
    return initializeEmailWorker();
  }
  return emailWorker;
}

/**
 * Process individual email job
 */
async function processEmailJob(job: Job<EmailJobData>): Promise<string> {
  const { to, subject, htmlContent, textContent, template, variables, replyTo } =
    job.data;

  try {
    logger.debug({ jobId: job.id, to, subject }, "Processing email job");

    let result;

    // Send templated email if template specified
    if (template && variables) {
      result = await sendTemplatedEmail(to, template as any, variables, replyTo);
    } else {
      // Send regular email
      result = await sendEmail(to, subject, htmlContent ?? "", textContent, replyTo);
    }

    logger.info(
      { jobId: job.id, messageId: result.messageId, to },
      "Email sent successfully"
    );

    return result.messageId;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    logger.error(
      { jobId: job.id, to, subject, error: errorMessage },
      "Failed to send email"
    );

    // Throw error to trigger retry logic
    throw error;
  }
}

/**
 * Helper: Send verification email (high priority)
 */
export async function sendVerificationEmail(
  to: string,
  verificationLink: string,
  replyTo?: string
): Promise<Job<EmailJobData>> {
  const { addEmailJob } = await import("../jobs/emailQueue.js");

  const htmlContent = `
    <h2>Verify Your Email Address</h2>
    <p>Thank you for registering with wxKanban!</p>
    <p>Please click the link below to verify your email address:</p>
    <p><a href="${verificationLink}">Verify Email</a></p>
    <p>Or copy and paste this link in your browser:</p>
    <p>${verificationLink}</p>
    <p>This link expires in 24 hours.</p>
  `;

  const textContent = `
    Verify Your Email Address

    Thank you for registering with wxKanban!

    Please click the link below to verify your email address:
    ${verificationLink}

    This link expires in 24 hours.
  `;

  return await addEmailJob(
    {
      to,
      subject: "Verify Your Email - wxKanban",
      htmlContent,
      textContent,
      replyTo,
    },
    { priority: 1 } // High priority
  );
}

/**
 * Helper: Send invitation email
 */
export async function sendInvitationEmail(
  to: string,
  invitationLink: string,
  invitedByName: string,
  companyName: string,
  replyTo?: string
): Promise<Job<EmailJobData>> {
  const { addEmailJob } = await import("../jobs/emailQueue.js");

  const htmlContent = `
    <h2>You've Been Invited to wxKanban</h2>
    <p>${invitedByName} has invited you to join <strong>${companyName}</strong> on wxKanban.</p>
    <p>Click the link below to accept the invitation:</p>
    <p><a href="${invitationLink}">Accept Invitation</a></p>
    <p>Or copy and paste this link in your browser:</p>
    <p>${invitationLink}</p>
    <p>This invitation expires in 7 days.</p>
  `;

  const textContent = `
    You've Been Invited to wxKanban

    ${invitedByName} has invited you to join ${companyName} on wxKanban.

    Click the link below to accept the invitation:
    ${invitationLink}

    This invitation expires in 7 days.
  `;

  return await addEmailJob(
    {
      to,
      subject: `You've been invited to ${companyName} on wxKanban`,
      htmlContent,
      textContent,
      replyTo,
    },
    { priority: 2 } // Normal priority
  );
}

/**
 * Helper: Send payment success email
 */
export async function sendPaymentSuccessEmail(
  to: string,
  companyName: string,
  subscriptionTier: string,
  amount: string,
  replyTo?: string
): Promise<Job<EmailJobData>> {
  const { addEmailJob } = await import("../jobs/emailQueue.js");

  const htmlContent = `
    <h2>Payment Received</h2>
    <p>Thank you for your payment!</p>
    <p>Your subscription has been activated:</p>
    <ul>
      <li><strong>Company:</strong> ${companyName}</li>
      <li><strong>Tier:</strong> ${subscriptionTier}</li>
      <li><strong>Amount:</strong> ${amount}</li>
    </ul>
    <p>You can now access all features on wxKanban.</p>
  `;

  const textContent = `
    Payment Received

    Thank you for your payment!

    Your subscription has been activated:
    Company: ${companyName}
    Tier: ${subscriptionTier}
    Amount: ${amount}

    You can now access all features on wxKanban.
  `;

  return await addEmailJob(
    {
      to,
      subject: `Payment Received - ${companyName}`,
      htmlContent,
      textContent,
      replyTo,
    },
    { priority: 2 } // Normal priority
  );
}

/**
 * Helper: Send payment failed email
 */
export async function sendPaymentFailedEmail(
  to: string,
  companyName: string,
  errorMessage: string,
  retryLink: string,
  replyTo?: string
): Promise<Job<EmailJobData>> {
  const { addEmailJob } = await import("../jobs/emailQueue.js");

  const htmlContent = `
    <h2>Payment Failed</h2>
    <p>We were unable to process your payment for <strong>${companyName}</strong>.</p>
    <p><strong>Error:</strong> ${errorMessage}</p>
    <p>Please try again or update your payment method:</p>
    <p><a href="${retryLink}">Retry Payment</a></p>
    <p>If you continue to experience issues, please contact support.</p>
  `;

  const textContent = `
    Payment Failed

    We were unable to process your payment for ${companyName}.

    Error: ${errorMessage}

    Please try again or update your payment method:
    ${retryLink}

    If you continue to experience issues, please contact support.
  `;

  return await addEmailJob(
    {
      to,
      subject: `Payment Failed - Action Required`,
      htmlContent,
      textContent,
      replyTo,
    },
    { priority: 1 } // High priority - action required
  );
}

/**
 * Cleanup and disconnect worker
 */
export async function disconnectEmailWorker(): Promise<void> {
  try {
    if (emailWorker) {
      await emailWorker.close();
      emailWorker = null;
    }

    logger.info("Email worker disconnected");
  } catch (error) {
    logger.error({ error }, "Error disconnecting email worker");
  }
}
