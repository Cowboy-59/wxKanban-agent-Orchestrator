/**
 * Email Notification Service
 * Feature 002: Send invitations, notifications, and summary emails
 *
 * Supports Resend or SendGrid integration
 */

import { createLogger } from '../server/lib/logger.js';

const logger = createLogger('email-service');

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

export interface InvitationEmailData {
  recipientEmail: string;
  companyName: string;
  invitationLink: string;
  expiresIn: string;
}

export interface VerificationEmailData {
  recipientEmail: string;
  verificationLink: string;
  expiresIn: string;
}

export interface InvoiceEmailData {
  recipientEmail: string;
  companyName: string;
  invoiceNumber: string;
  invoiceAmount: number;
  pdfUrl: string;
}

export interface DailySummaryEmailData {
  recipientEmail: string;
  recipientName: string;
  companyName: string;
  metrics: {
    activeUsers: number;
    activeProjects: number;
    totalHours: number;
    totalRevenue: number;
  };
  recentActivity: Array<{
    action: string;
    actor: string;
    timestamp: Date;
  }>;
}

/**
 * Send email via configured provider (Resend/SendGrid)
 * Currently configured for Resend (noreply@resend.dev)
 */
export async function sendEmail(options: EmailOptions): Promise<{
  success: boolean;
  messageId?: string;
  error?: string;
}> {
  try {
    // Determine which provider to use
    const provider = process.env.EMAIL_PROVIDER || 'resend';

    if (provider === 'resend') {
      return await sendViaResend(options);
    } else if (provider === 'sendgrid') {
      return await sendViaSendGrid(options);
    } else {
      logger.warn({ provider }, 'Unknown email provider, defaulting to Resend');
      return await sendViaResend(options);
    }
  } catch (error) {
    logger.error({ error, email: options.to }, 'Failed to send email');
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Send via Resend (requires RESEND_API_KEY env var)
 */
async function sendViaResend(options: EmailOptions): Promise<{
  success: boolean;
  messageId?: string;
  error?: string;
}> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    logger.warn('RESEND_API_KEY not configured, email would be sent in production');
    logger.info({ to: options.to, subject: options.subject }, 'Email (mocked)');
    return { success: true, messageId: `mock-${Date.now()}` };
  }

  try {
    // TODO: Implement actual Resend API call
    // const response = await fetch('https://api.resend.com/emails', {
    //   method: 'POST',
    //   headers: {
    //     'Authorization': `Bearer ${apiKey}`,
    //     'Content-Type': 'application/json',
    //   },
    //   body: JSON.stringify({
    //     from: 'noreply@wxkanban.dev',
    //     to: options.to,
    //     subject: options.subject,
    //     html: options.html,
    //     text: options.text,
    //     reply_to: options.replyTo,
    //   }),
    // });
    // const data = await response.json();
    // return { success: true, messageId: data.id };

    // For now, mock the response
    logger.info({ to: options.to, subject: options.subject }, 'Email sent via Resend (mocked)');
    return { success: true, messageId: `res-${Date.now()}` };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Send via SendGrid (requires SENDGRID_API_KEY env var)
 */
async function sendViaSendGrid(options: EmailOptions): Promise<{
  success: boolean;
  messageId?: string;
  error?: string;
}> {
  const apiKey = process.env.SENDGRID_API_KEY;

  if (!apiKey) {
    logger.warn('SENDGRID_API_KEY not configured, email would be sent in production');
    logger.info({ to: options.to, subject: options.subject }, 'Email (mocked)');
    return { success: true, messageId: `mock-${Date.now()}` };
  }

  try {
    // TODO: Implement actual SendGrid API call
    // const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    //   method: 'POST',
    //   headers: {
    //     'Authorization': `Bearer ${apiKey}`,
    //     'Content-Type': 'application/json',
    //   },
    //   body: JSON.stringify({
    //     personalizations: [{ to: [{ email: options.to }] }],
    //     from: { email: 'noreply@wxkanban.dev' },
    //     subject: options.subject,
    //     content: [{ type: 'text/html', value: options.html }],
    //     reply_to: options.replyTo ? { email: options.replyTo } : undefined,
    //   }),
    // });
    // return { success: response.ok, messageId: response.headers.get('Server') };

    // For now, mock the response
    logger.info({ to: options.to, subject: options.subject }, 'Email sent via SendGrid (mocked)');
    return { success: true, messageId: `sg-${Date.now()}` };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Send user invitation email
 */
export async function sendInvitationEmail(data: InvitationEmailData): Promise<boolean> {
  const html = `
    <h1>You've been invited to ${data.companyName}</h1>
    <p>You've been invited to join the wxKanban team at ${data.companyName}.</p>
    <p><a href="${data.invitationLink}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Accept Invitation</a></p>
    <p>This invitation expires in ${data.expiresIn}.</p>
    <p>If you didn't expect this invitation, you can safely ignore this email.</p>
  `;

  const result = await sendEmail({
    to: data.recipientEmail,
    subject: `You're invited to join ${data.companyName}`,
    html,
    text: `You've been invited to join ${data.companyName}. Visit ${data.invitationLink} to accept.`,
  });

  return result.success;
}

/**
 * Send email verification
 */
export async function sendVerificationEmail(data: VerificationEmailData): Promise<boolean> {
  const html = `
    <h1>Verify your email</h1>
    <p>Please verify your email address to complete your registration.</p>
    <p><a href="${data.verificationLink}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Verify Email</a></p>
    <p>This link expires in ${data.expiresIn}.</p>
  `;

  const result = await sendEmail({
    to: data.recipientEmail,
    subject: 'Verify your email address',
    html,
    text: `Verify your email: ${data.verificationLink}`,
  });

  return result.success;
}

/**
 * Send invoice notification email
 */
export async function sendInvoiceEmail(data: InvoiceEmailData): Promise<boolean> {
  const html = `
    <h1>Your invoice is ready</h1>
    <p>Invoice #${data.invoiceNumber} for ${data.companyName} is ready.</p>
    <p><strong>Amount:</strong> $${data.invoiceAmount.toFixed(2)}</p>
    <p><a href="${data.pdfUrl}" style="background-color: #28a745; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Download Invoice</a></p>
  `;

  const result = await sendEmail({
    to: data.recipientEmail,
    subject: `Invoice #${data.invoiceNumber} - ${data.companyName}`,
    html,
    text: `Invoice #${data.invoiceNumber} is ready. Download: ${data.pdfUrl}`,
  });

  return result.success;
}

/**
 * Email service namespace for organized exports
 */
export const emailService = {
  sendEmail,
  sendInvitationEmail,
  sendVerificationEmail,
  sendInvoiceEmail,
  sendDailySummaryEmail,
};

/**
 * Send daily summary email
 */
export async function sendDailySummaryEmail(data: DailySummaryEmailData): Promise<boolean> {
  const activityList = data.recentActivity
    .map(
      (activity) =>
        `<li><strong>${activity.action}</strong> by ${activity.actor} at ${activity.timestamp.toLocaleString()}</li>`
    )
    .join('');

  const html = `
    <h1>Daily Summary - ${data.companyName}</h1>
    <p>Hi ${data.recipientName},</p>

    <h2>Metrics</h2>
    <ul>
      <li><strong>Active Users:</strong> ${data.metrics.activeUsers}</li>
      <li><strong>Active Projects:</strong> ${data.metrics.activeProjects}</li>
      <li><strong>Total Hours:</strong> ${data.metrics.totalHours}</li>
      <li><strong>Total Revenue:</strong> $${data.metrics.totalRevenue.toFixed(2)}</li>
    </ul>

    <h2>Recent Activity</h2>
    <ul>
      ${activityList}
    </ul>

    <p>Log in to wxKanban to see more details.</p>
  `;

  const result = await sendEmail({
    to: data.recipientEmail,
    subject: `Daily Summary - ${data.companyName}`,
    html,
  });

  return result.success;
}
