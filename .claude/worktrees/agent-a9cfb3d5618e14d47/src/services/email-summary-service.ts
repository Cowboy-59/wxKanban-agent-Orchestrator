/**
 * Email Summary Service
 * Feature 002: Daily email summaries for admins
 *
 * Handles generation and sending of daily email summaries based on notification settings
 */

import { db } from '../db/client.js';
import { user, company, notificationsettings } from '../db/schema/index.js';
import { eq, and } from 'drizzle-orm';
import { createLogger } from '../server/lib/logger.js';
import { getDashboardMetrics, getActivityFeed } from './dashboard-service.js';

const logger = createLogger('email-summary-service');

/**
 * Generate HTML content for daily email summary
 */
export async function generateEmailSummary(
  companyid: string,
  settings: {
    includeprojectupdate: boolean;
    includeteamactivity: boolean;
    includefinancials: boolean;
  }
): Promise<{
  subject: string;
  html: string;
}> {
  try {
    // Get company info
    const companyResult = await db
      .select()
      .from(company)
      .where(eq(company.companyid, companyid))
      .limit(1);

    if (!companyResult.length) {
      throw new Error('Company not found');
    }

    const companyData = companyResult[0];

    // Get metrics
    const metrics = await getDashboardMetrics(companyid);

    // Get recent activity
    const activities = await getActivityFeed(companyid, { limit: 10 });

    // Build email HTML
    const date = new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const html = generateEmailHTML(
      companyData.name,
      date,
      metrics,
      activities,
      settings
    );

    const subject = `${companyData.name} - Daily Summary`;

    return { subject, html };
  } catch (error) {
    logger.error({ error, companyid }, 'Failed to generate email summary');
    throw error;
  }
}

/**
 * Generate HTML email template
 */
function generateEmailHTML(
  companyName: string,
  date: string,
  metrics: any,
  activities: any[],
  settings: any
): string {
  const getMetricCard = (title: string, value: string | number, color: string) =>
    `
    <td style="background-color: ${color}; padding: 15px; border-radius: 5px; margin: 5px;">
      <div style="color: white; text-align: center;">
        <div style="font-size: 24px; font-weight: bold;">${value}</div>
        <div style="font-size: 14px; margin-top: 5px;">${title}</div>
      </div>
    </td>
  `;

  const activityHTML = activities
    .map(
      (a) =>
        `<tr>
      <td style="padding: 10px; border-bottom: 1px solid #eee;">
        <strong>${a.action}</strong><br/>
        <small style="color: #666;">${new Date(a.timestamp).toLocaleString()}</small>
      </td>
    </tr>`
    )
    .join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #2c3e50; color: white; padding: 20px; border-radius: 5px; }
        .section { margin: 20px 0; }
        .section-title { font-size: 18px; font-weight: bold; color: #2c3e50; margin-bottom: 10px; border-bottom: 2px solid #3498db; padding-bottom: 5px; }
        .metrics { display: flex; gap: 10px; flex-wrap: wrap; }
        .activity-table { width: 100%; border-collapse: collapse; }
        .footer { color: #999; font-size: 12px; text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${companyName}</h1>
          <p>Daily Summary - ${date}</p>
        </div>

        <div class="section">
          <div class="section-title">📊 Key Metrics</div>
          <table style="width: 100%;">
            <tr>
              ${getMetricCard('Team Members', metrics.company.totalUsers, '#3498db')}
              ${getMetricCard('Active Users', metrics.company.activeUsers, '#27ae60')}
              ${getMetricCard('Projects', metrics.projects.totalProjects, '#9b59b6')}
              ${getMetricCard('Hours This Month', metrics.hours.hoursThisMonth, '#e74c3c')}
            </tr>
          </table>
        </div>

        ${
          settings.includefinancials
            ? `
          <div class="section">
            <div class="section-title">💰 Financial Summary</div>
            <table style="width: 100%;">
              <tr>
                <td style="padding: 10px;">
                  <strong>Revenue (This Month):</strong> $${metrics.financials.revenueThisMonth}
                </td>
                <td style="padding: 10px;">
                  <strong>Invoices:</strong> ${metrics.financials.invoicesThisMonth}
                </td>
                <td style="padding: 10px;">
                  <strong>Outstanding:</strong> ${metrics.financials.outstandingInvoices}
                </td>
              </tr>
            </table>
          </div>
        `
            : ''
        }

        ${
          settings.includeteamactivity
            ? `
          <div class="section">
            <div class="section-title">📝 Recent Activity</div>
            <table class="activity-table">
              ${activityHTML || '<tr><td style="padding: 10px; color: #999;">No recent activity</td></tr>'}
            </table>
          </div>
        `
            : ''
        }

        ${
          settings.includeprojectupdate
            ? `
          <div class="section">
            <div class="section-title">📋 Team Workload</div>
            <table style="width: 100%;">
              <tr>
                <td style="padding: 10px;">
                  <strong>Total Hours (All-time):</strong> ${metrics.teamWorkload.totalHours}
                </td>
                <td style="padding: 10px;">
                  <strong>Average per User:</strong> ${metrics.teamWorkload.averageHoursPerUser} hrs
                </td>
              </tr>
            </table>
          </div>
        `
            : ''
        }

        <div class="footer">
          <p>This is an automated email summary. To manage your notification settings, visit the admin dashboard.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Send email summary to all admins with daily frequency enabled
 * Call this function from a scheduled job (e.g., via cron or task scheduler)
 */
export async function sendDailySummaries(): Promise<{
  sent: number;
  failed: number;
  skipped: number;
}> {
  try {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    // Get all companies with daily notifications enabled
    const companiesWithDailyNotifications = await db
      .select({
        companyid: notificationsettings.companyid,
        emailfrequency: notificationsettings.emailfrequency,
        emailtime: notificationsettings.emailtime,
        includeprojectupdate: notificationsettings.includeprojectupdate,
        includeteamactivity: notificationsettings.includeteamactivity,
        includefinancials: notificationsettings.includefinancials,
      })
      .from(notificationsettings)
      .where(eq(notificationsettings.emailfrequency, 'daily'));

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const notification of companiesWithDailyNotifications) {
      try {
        // Check if current time matches scheduled time (within 5-minute window)
        const scheduledTime = notification.emailtime || '09:00:00';
        const [scheduledHour, scheduledMin] = scheduledTime.split(':').map(Number);

        if (
          currentHour === scheduledHour &&
          currentMinute >= scheduledMin &&
          currentMinute < scheduledMin + 5
        ) {
          // Get company admins
          const admins = await db
            .select()
            .from(user)
            .where(
              and(
                eq(user.companyid, notification.companyid),
                eq(user.role, 'Admin')
              )
            );

          if (admins.length === 0) {
            logger.warn(
              { companyid: notification.companyid },
              'No admins found for company'
            );
            skipped++;
            continue;
          }

          // Generate email content
          const emailData = await generateEmailSummary(notification.companyid, {
            includeprojectupdate: notification.includeprojectupdate,
            includeteamactivity: notification.includeteamactivity,
            includefinancials: notification.includefinancials,
          });

          // Log email sending (actual email service would be integrated here)
          logger.info(
            {
              companyid: notification.companyid,
              recipients: admins.map((a) => a.email),
              subject: emailData.subject,
            },
            'Daily summary email prepared'
          );

          // TODO: Integrate with actual email service (Resend, SendGrid, etc.)
          // For now, just count as sent
          sent++;
        } else {
          skipped++;
        }
      } catch (error) {
        logger.error(
          { error, companyid: notification.companyid },
          'Failed to send summary for company'
        );
        failed++;
      }
    }

    logger.info(
      { sent, failed, skipped },
      'Daily summary emails processed'
    );

    return { sent, failed, skipped };
  } catch (error) {
    logger.error({ error }, 'Failed to process daily summaries');
    throw error;
  }
}

/**
 * Send weekly summaries (stub for future implementation)
 */
export async function sendWeeklySummaries(): Promise<{
  sent: number;
  failed: number;
  skipped: number;
}> {
  logger.info('Weekly summary processing started');
  // TODO: Implement weekly summaries
  return { sent: 0, failed: 0, skipped: 0 };
}

/**
 * Send monthly summaries (stub for future implementation)
 */
export async function sendMonthlySummaries(): Promise<{
  sent: number;
  failed: number;
  skipped: number;
}> {
  logger.info('Monthly summary processing started');
  // TODO: Implement monthly summaries
  return { sent: 0, failed: 0, skipped: 0 };
}
