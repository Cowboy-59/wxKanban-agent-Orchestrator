/**
 * Dashboard Service
 * Feature 002: Dashboard metrics, activity feed, and notification settings
 *
 * Handles dashboard metrics aggregation, activity feed queries, and notification management
 */

import { db } from '../db/client.js';
import {
  userprofiles,
  companyprojects,
  projecttimeentries,
  companyauditlogs,
  notificationsettings,
  projectinvoices,
} from '../db/schema/index.js';
import { eq, and, gte, lte, sql } from 'drizzle-orm';
import { createLogger } from '../server/lib/logger.js';

const logger = createLogger('dashboard-service');

/**
 * Get company dashboard metrics
 */
export async function getDashboardMetrics(companyid: string): Promise<{
  company: {
    totalUsers: number;
    usersByRole: { role: string; count: number }[];
    activeUsers: number;
  };
  projects: {
    totalProjects: number;
    activeProjects: number;
  };
  hours: {
    hoursThisMonth: number;
    hoursTrackedThisMonth: number;
  };
  financials: {
    revenueThisMonth: string;
    invoicesThisMonth: number;
    outstandingInvoices: number;
  };
  teamWorkload: {
    totalHours: number;
    averageHoursPerUser: number;
  };
}> {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    // Get total users and count by role
    const users_result = await db
      .select({
        totalCount: sql<number>`count(*)`,
        role: userprofiles.usertype,
      })
      .from(userprofiles)
      .where(eq(userprofiles.companyid, companyid))
      .groupBy(userprofiles.usertype);

    const totalUsers = users_result.reduce((sum, r) => sum + Number(r.totalCount), 0);
    const usersByRole = users_result.map((r) => ({
      role: r.role || 'Unknown',
      count: Number(r.totalCount),
    }));

    // Get active users (with time entries this month)
    const activeUsers_result = await db
      .selectDistinct({ userid: projecttimeentries.userid })
      .from(projecttimeentries)
      .innerJoin(companyprojects, eq(projecttimeentries.projectid, companyprojects.id))
      .where(
        and(
          eq(companyprojects.companyid, companyid),
          gte(projecttimeentries.starttime, monthStart),
          lte(projecttimeentries.starttime, monthEnd)
        )
      );

    const activeUsers = activeUsers_result.length;

    // Get project metrics
    const projects_result = await db
      .select({
        totalCount: sql<number>`count(*)`,
      })
      .from(companyprojects)
      .where(eq(companyprojects.companyid, companyid));

    const totalProjects = Number(projects_result[0]?.totalCount || 0);
    const activeProjects = totalProjects; // Simplified: assume all projects are active

    // Get hours tracked this month
    const hours_result = await db
      .select({
        totalMinutes: sql<number>`sum(${projecttimeentries.duration})`,
      })
      .from(projecttimeentries)
      .innerJoin(companyprojects, eq(projecttimeentries.projectid, companyprojects.id))
      .where(
        and(
          eq(companyprojects.companyid, companyid),
          gte(projecttimeentries.starttime, monthStart),
          lte(projecttimeentries.starttime, monthEnd)
        )
      );

    const hoursTrackedThisMonth = Math.round(
      (Number(hours_result[0]?.totalMinutes || 0)) / 60
    );
    const hoursThisMonth = hoursTrackedThisMonth; // Same for now

    // Get financial metrics
    const invoices_result = await db
      .select({
        totalAmount: sql<number>`sum((${projectinvoices.totalamount}::numeric))`,
        invoiceCount: sql<number>`count(*)`,
      })
      .from(projectinvoices)
      .where(
        and(
          eq(projectinvoices.companyid, companyid),
          gte(projectinvoices.generatedat, monthStart),
          lte(projectinvoices.generatedat, monthEnd)
        )
      );

    const revenueThisMonth = String(
      (Number(invoices_result[0]?.totalAmount || 0)).toFixed(2)
    );
    const invoicesThisMonth = Number(invoices_result[0]?.invoiceCount || 0);

    // Count outstanding invoices (not marked as sent)
    const outstanding_result = await db
      .select({ count: sql<number>`count(*)` })
      .from(projectinvoices)
      .where(
        and(
          eq(projectinvoices.companyid, companyid),
          eq(projectinvoices.emailsent, false)
        )
      );

    const outstandingInvoices = Number(outstanding_result[0]?.count || 0);

    // Get team workload
    const workload_result = await db
      .select({
        totalMinutes: sql<number>`sum(${projecttimeentries.duration})`,
      })
      .from(projecttimeentries)
      .innerJoin(companyprojects, eq(projecttimeentries.projectid, companyprojects.id))
      .where(eq(companyprojects.companyid, companyid));

    const totalHoursAllTime = Math.round(
      (Number(workload_result[0]?.totalMinutes || 0)) / 60
    );
    const averageHoursPerUser =
      totalUsers > 0 ? Math.round(totalHoursAllTime / totalUsers) : 0;

    return {
      company: {
        totalUsers,
        usersByRole,
        activeUsers,
      },
      projects: {
        totalProjects,
        activeProjects,
      },
      hours: {
        hoursThisMonth,
        hoursTrackedThisMonth,
      },
      financials: {
        revenueThisMonth,
        invoicesThisMonth,
        outstandingInvoices,
      },
      teamWorkload: {
        totalHours: totalHoursAllTime,
        averageHoursPerUser,
      },
    };
  } catch (error) {
    logger.error({ error, companyid }, 'Failed to get dashboard metrics');
    throw error;
  }
}

/**
 * Get activity feed for company
 */
export async function getActivityFeed(
  companyid: string,
  options?: {
    limit?: number;
    offset?: number;
  }
): Promise<
  Array<{
    auditid: string;
    action: string;
    changedby?: string;
    description?: string | null;
    timestamp: Date;
  }>
> {
  try {
    const limit = options?.limit ?? 20;
    const offset = options?.offset ?? 0;

    const activities = await db
      .select({
        auditid: companyauditlogs.id,
        action: companyauditlogs.action,
        changedby: companyauditlogs.changedby,
        description: companyauditlogs.description,
        timestamp: companyauditlogs.timestamp,
      })
      .from(companyauditlogs)
      .where(eq(companyauditlogs.companyid, companyid))
      .orderBy(sql`${companyauditlogs.timestamp} DESC`)
      .limit(limit)
      .offset(offset);

    return activities.map((a) => ({
      auditid: a.auditid,
      action: a.action,
      changedby: a.changedby || undefined,
      description: a.description,
      timestamp: a.timestamp,
    }));
  } catch (error) {
    logger.error({ error, companyid }, 'Failed to get activity feed');
    throw error;
  }
}

/**
 * Get notification settings for company
 */
export async function getNotificationSettings(companyid: string): Promise<{
  settingid: string;
  emailfrequency: string;
  emailtime: string;
  includeprojectupdate: boolean;
  includeteamactivity: boolean;
  includefinancials: boolean;
}> {
  try {
    const settings = await db
      .select({
        settingid: notificationsettings.settingid,
        emailfrequency: notificationsettings.emailfrequency,
        emailtime: notificationsettings.emailtime,
        includeprojectupdate: notificationsettings.includeprojectupdate,
        includeteamactivity: notificationsettings.includeteamactivity,
        includefinancials: notificationsettings.includefinancials,
      })
      .from(notificationsettings)
      .where(eq(notificationsettings.companyid, companyid))
      .limit(1);

    // If no settings exist, create default settings
    if (settings.length === 0) {
      const newSettings = await db
        .insert(notificationsettings)
        .values({
          companyid,
          emailfrequency: 'daily',
          emailtime: '09:00:00',
          includeprojectupdate: true,
          includeteamactivity: true,
          includefinancials: true,
        })
        .returning();

      if (!newSettings.length) {
        throw new Error('Failed to create default notification settings');
      }

      return {
        settingid: newSettings[0].settingid,
        emailfrequency: newSettings[0].emailfrequency || 'daily',
        emailtime: newSettings[0].emailtime || '09:00:00',
        includeprojectupdate: newSettings[0].includeprojectupdate,
        includeteamactivity: newSettings[0].includeteamactivity,
        includefinancials: newSettings[0].includefinancials,
      };
    }

    return {
      settingid: settings[0].settingid,
      emailfrequency: settings[0].emailfrequency || 'daily',
      emailtime: settings[0].emailtime || '09:00:00',
      includeprojectupdate: settings[0].includeprojectupdate,
      includeteamactivity: settings[0].includeteamactivity,
      includefinancials: settings[0].includefinancials,
    };
  } catch (error) {
    logger.error({ error, companyid }, 'Failed to get notification settings');
    throw error;
  }
}

/**
 * Update notification settings for company
 */
export async function updateNotificationSettings(
  companyid: string,
  data: {
    emailfrequency?: string;
    emailtime?: string;
    includeprojectupdate?: boolean;
    includeteamactivity?: boolean;
    includefinancials?: boolean;
  }
): Promise<void> {
  try {
    // Validate email frequency
    if (
      data.emailfrequency &&
      !['daily', 'weekly', 'monthly', 'never'].includes(data.emailfrequency)
    ) {
      throw new Error(
        'Invalid email frequency. Must be one of: daily, weekly, monthly, never'
      );
    }

    // Validate email time format (HH:MM:SS)
    if (data.emailtime) {
      const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/;
      if (!timeRegex.test(data.emailtime)) {
        throw new Error('Invalid time format. Expected HH:MM:SS');
      }
    }

    // Update settings
    await db
      .update(notificationsettings)
      .set({
        emailfrequency: data.emailfrequency,
        emailtime: data.emailtime,
        includeprojectupdate: data.includeprojectupdate,
        includeteamactivity: data.includeteamactivity,
        includefinancials: data.includefinancials,
        updatedat: new Date(),
      })
      .where(eq(notificationsettings.companyid, companyid));

    logger.info(
      { companyid, settings: data },
      'Notification settings updated'
    );
  } catch (error) {
    logger.error(
      { error, companyid },
      'Failed to update notification settings'
    );
    throw error;
  }
}
