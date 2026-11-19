/**
 * DashboardService
 * T025 - Admin dashboard data aggregation service
 * Provides metrics and data for admin dashboard widgets
 */

import { db } from '~/db/client.js';
import { companies, userprofiles, companyprojects, projecttasks, projecttimeentries } from '~/db/schema';
import { eq, and, gte, sql, count, sum } from 'drizzle-orm';
import { logger } from '~/server/lib/logger';

export interface DashboardMetrics {
  // Company stats
  totalUsers: number;
  activeUsers: number;
  maxUsers: number;
  
  // Project stats
  totalProjects: number;
  activeProjects: number;
  completedProjects: number;
  
  // Task stats
  totalTasks: number;
  tasksByStatus: Record<string, number>;
  
  // Time tracking
  totalHoursLogged: number;
  billableHours: number;
  
  // Recent activity
  recentActivity: ActivityItem[];
}

export interface ActivityItem {
  id: string;
  type: 'user_joined' | 'project_created' | 'task_completed' | 'time_logged' | 'invoice_generated';
  description: string;
  userId?: string;
  userName?: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface SubscriptionInfo {
  tier: string;
  status: string;
  maxUsers: number;
  currentUsers: number;
  monthlyPrice: number;
  features: string[];
  renewalDate?: Date;
}

export class DashboardService {
  /**
   * Get comprehensive dashboard metrics for a company
   */
  static async getDashboardMetrics(companyId: string): Promise<DashboardMetrics> {
    try {
      const [
        userStats,
        projectStats,
        taskStats,
        timeStats,
        recentActivity
      ] = await Promise.all([
        this.getUserStats(companyId),
        this.getProjectStats(companyId),
        this.getTaskStats(companyId),
        this.getTimeStats(companyId),
        this.getRecentActivity(companyId)
      ]);

      return {
        ...userStats,
        ...projectStats,
        ...taskStats,
        ...timeStats,
        recentActivity
      };
    } catch (error) {
      logger.error({ error, companyId }, 'Failed to get dashboard metrics');
      throw new Error('Failed to load dashboard data');
    }
  }

  /**
   * Get user statistics for company
   */
  private static async getUserStats(companyId: string) {
    const [userCount, companyData] = await Promise.all([
      db.select({ count: count() })
        .from(userprofiles)
        .where(eq(userprofiles.companyid, companyId))
        .then(rows => rows[0]?.count || 0),
      
      db.select({
        maxUsers: companies.maxusers,
        subscriptionStatus: companies.subscriptionstatus
      })
        .from(companies)
        .where(eq(companies.id, companyId))
        .then(rows => rows[0])
    ]);

    // Active users = users who logged in within last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const activeUserCount = await db.select({ count: count() })
      .from(userprofiles)
      .where(
        and(
          eq(userprofiles.companyid, companyId),
          gte(userprofiles.lastloginedat, thirtyDaysAgo)
        )
      )
      .then(rows => rows[0]?.count || 0);

    return {
      totalUsers: userCount,
      activeUsers: activeUserCount,
      maxUsers: companyData?.maxUsers || 5
    };
  }

  /**
   * Get project statistics
   */
  private static async getProjectStats(companyId: string) {
    const projectData = await db.select({
      status: companyprojects.status,
      count: count()
    })
      .from(companyprojects)
      .where(eq(companyprojects.companyid, companyId))
      .groupBy(companyprojects.status);

    const stats = {
      totalProjects: 0,
      activeProjects: 0,
      completedProjects: 0
    };

    for (const row of projectData) {
      stats.totalProjects += row.count;
      if (row.status === 'active') {
        stats.activeProjects = row.count;
      } else if (row.status === 'completed') {
        stats.completedProjects = row.count;
      }
    }

    return stats;
  }

  /**
   * Get task statistics
   */
  private static async getTaskStats(companyId: string) {
    // Get tasks through projects relationship
    const taskData = await db.select({
      status: projecttasks.status,
      count: count()
    })
      .from(projecttasks)
      .innerJoin(companyprojects, eq(projecttasks.projectid, companyprojects.id))
      .where(eq(companyprojects.companyid, companyId))
      .groupBy(projecttasks.status);

    const tasksByStatus: Record<string, number> = {};
    let totalTasks = 0;

    for (const row of taskData) {
      tasksByStatus[row.status] = row.count;
      totalTasks += row.count;
    }

    return {
      totalTasks,
      tasksByStatus
    };
  }

  /**
   * Get time tracking statistics
   */
  private static async getTimeStats(companyId: string) {
    const timeData = await db.select({
      totalDuration: sum(projecttimeentries.duration),
      billableDuration: sum(
        sql`CASE WHEN ${projecttimeentries.billable} = true THEN ${projecttimeentries.duration} ELSE 0 END`
      )
    })
      .from(projecttimeentries)
      .innerJoin(projecttasks, eq(projecttimeentries.taskid, projecttasks.id))
      .innerJoin(companyprojects, eq(projecttasks.projectid, companyprojects.id))
      .where(eq(companyprojects.companyid, companyId));

    const totalMinutes = Number(timeData[0]?.totalDuration || 0);
    const billableMinutes = Number(timeData[0]?.billableDuration || 0);

    return {
      totalHoursLogged: Math.round((totalMinutes / 60) * 100) / 100,
      billableHours: Math.round((billableMinutes / 60) * 100) / 100
    };
  }

  /**
   * Get recent activity feed
   */
  private static async getRecentActivity(companyId: string): Promise<ActivityItem[]> {
    const activity: ActivityItem[] = [];

    // Recent user joins (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    const recentUsers = await db.select({
      userId: userprofiles.id,
      fullName: userprofiles.fullname,
      joinedAt: userprofiles.joinedat
    })
      .from(userprofiles)
      .where(
        and(
          eq(userprofiles.companyid, companyId),
          gte(userprofiles.joinedat, sevenDaysAgo)
        )
      )
      .orderBy(sql`${userprofiles.joinedat} DESC`)
      .limit(5);

    for (const user of recentUsers) {
      activity.push({
        id: `user-${user.userId}`,
        type: 'user_joined',
        description: `${user.fullName || 'A new user'} joined the team`,
        userId: user.userId,
        userName: user.fullName || undefined,
        timestamp: user.joinedAt || new Date()
      });
    }

    // Recent projects created
    const recentProjects = await db.select({
      projectId: companyprojects.id,
      projectName: companyprojects.name,
      createdAt: companyprojects.createdat,
      createdBy: companyprojects.userid
    })
      .from(companyprojects)
      .where(
        and(
          eq(companyprojects.companyid, companyId),
          gte(companyprojects.createdat, sevenDaysAgo)
        )
      )
      .orderBy(sql`${companyprojects.createdat} DESC`)
      .limit(5);

    for (const project of recentProjects) {
      activity.push({
        id: `project-${project.projectId}`,
        type: 'project_created',
        description: `Project "${project.projectName}" was created`,
        userId: project.createdBy,
        timestamp: project.createdAt,
        metadata: { projectId: project.projectId, projectName: project.projectName }
      });
    }

    // Sort by timestamp descending
    return activity.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    ).slice(0, 10);
  }

  /**
   * Get subscription information
   */
  static async getSubscriptionInfo(companyId: string): Promise<SubscriptionInfo> {
    const company = await db.select({
      tier: companies.billingplan,
      status: companies.subscriptionstatus,
      maxUsers: companies.maxusers
    })
      .from(companies)
      .where(eq(companies.id, companyId))
      .then(rows => rows[0]);

    if (!company) {
      throw new Error('Company not found');
    }

    const currentUsers = await db.select({ count: count() })
      .from(userprofiles)
      .where(eq(userprofiles.companyid, companyId))
      .then(rows => rows[0]?.count || 0);

    const tierPricing: Record<string, number> = {
      'FREE': 0,
      'SMALL_BUSINESS': 19.95,
      'CONSULTANT': 29.95,
      'ENTERPRISE': 59.95
    };

    const tierFeatures: Record<string, string[]> = {
      'FREE': ['Up to 5 users', 'Basic task management', 'Email support'],
      'SMALL_BUSINESS': ['Up to 5 users', 'Single company', 'Team management', 'Email support'],
      'CONSULTANT': ['Unlimited users', 'Advanced task management', 'Time tracking with billing', 'Invoice generation', 'Priority email support', 'API access to 3rd party (jira, monday....)'],
      'ENTERPRISE': ['Unlimited everything', 'Advanced analytics', 'Custom integrations', 'Dedicated support', 'SSO/SAML', 'Advanced security', 'SLA guaranteed']
    };

    return {
      tier: company.tier,
      status: company.status,
      maxUsers: company.maxUsers,
      currentUsers,
      monthlyPrice: tierPricing[company.tier] || 0,
      features: tierFeatures[company.tier] || []
    };
  }

  /**
   * Check if feature is available for company's tier
   */
  static async isFeatureAvailable(companyId: string, featureName: string): Promise<boolean> {
    const company = await db.select({
      tier: companies.billingplan
    })
      .from(companies)
      .where(eq(companies.id, companyId))
      .then(rows => rows[0]);

    if (!company) return false;

    const tierFeatures: Record<string, string[]> = {
      'FREE': ['basic_tasks', 'time_tracking', 'email_support'],
      'SMALL_BUSINESS': ['basic_tasks', 'time_tracking', 'basic_invoicing', 'team_management', 'email_support'],
      'CONSULTANT': ['advanced_tasks', 'time_tracking', 'billing', 'invoicing', 'api_access', 'priority_support'],
      'ENTERPRISE': ['advanced_tasks', 'time_tracking', 'billing', 'invoicing', 'api_access', 'dedicated_support', 'sso', 'analytics', 'custom_integrations', 'sla']
    };

    const features = tierFeatures[company.tier] || [];
    return features.includes(featureName.toLowerCase());
  }
}
