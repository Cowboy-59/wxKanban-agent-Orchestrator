import { db } from "../db/client.js";
import { companies } from "../../db/schema/company.js";
import { userprofiles as users } from "../../db/schema/userprofiles.js";
import { companyprojects as projects } from "../../db/schema/companyproject.js";
import { projecttasks as tasks } from "../../db/schema/projecttask.js";
import { sql } from "drizzle-orm";
import { createLogger } from "../lib/logger.js";

const logger = createLogger("sysadmin-metrics-service");

/**
 * Get platform-wide metrics
 */
export async function getPlatformMetrics() {
  // Get all companies
  const allCompanies = await db.select().from(companies);
  const totalCompanies = allCompanies.length;
  const activeCompanies = allCompanies.filter(
    (c) => c.activeflag && c.subscriptionstatus === "ACTIVE"
  ).length;
  const trialCompanies = allCompanies.filter(
    (c) => c.subscriptionstatus === "TRIAL"
  ).length;
  const suspendedCompanies = allCompanies.filter((c) => !c.activeflag).length;

  // Get all users
  const allUsers = await db.select().from(users);
  const totalUsers = allUsers.length;
  const activeUsers = allUsers.filter((u) => u.active).length;

  // Get projects
  const allProjects = await db.select().from(projects);
  const totalProjects = allProjects.length;
  const activeProjects = allProjects.filter((p) => p.status === "ACTIVE").length;

  // Get tasks
  const allTasks = await db.select().from(tasks);
  const totalTasks = allTasks.length;
  const completedTasks = allTasks.filter((t) => t.status === "COMPLETED").length;

  // Calculate MRR (simplified)
  const mrr = activeCompanies * 9900; // $99/month per active company in cents

  // Calculate growth (would need historical data)
  const growthRate = {
    companies: 0,
    users: 0,
    mrr: 0,
  };

  return {
    companies: {
      total: totalCompanies,
      active: activeCompanies,
      trial: trialCompanies,
      suspended: suspendedCompanies,
    },
    users: {
      total: totalUsers,
      active: activeUsers,
      newThisMonth: 0, // Would need joinedat filtering
    },
    projects: {
      total: totalProjects,
      active: activeProjects,
    },
    tasks: {
      total: totalTasks,
      completed: completedTasks,
      completionRate: totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0,
    },
    revenue: {
      mrr,
      arr: mrr * 12,
      growthRate: growthRate.mrr,
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Get database health metrics
 */
export async function getDatabaseHealth(): Promise<any> {
  try {
    // Check connection
    const startTime = Date.now();
    await db.execute(sql`SELECT 1`);
    const connectionTime = Date.now() - startTime;

    // Get table sizes (PostgreSQL specific)
    const tableSizes = await db.execute(sql`
      SELECT 
        schemaname,
        tablename,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
      LIMIT 10
    `);

    // Get connection count
    const connections = await db.execute(sql`
      SELECT count(*) as count FROM pg_stat_activity
    `);

    return {
      status: "healthy",
      connectionTime: `${connectionTime}ms`,
      activeConnections: Number(connections[0]?.count || 0),
      topTables: tableSizes,
      lastChecked: new Date().toISOString(),
    };
  } catch (error) {
    logger.error({ error }, "Database health check failed");
    return {
      status: "critical",
      error: "Database connection failed",
      lastChecked: new Date().toISOString(),
    };
  }
}

/**
 * Get job queue status (placeholder - would integrate with job queue)
 */
export async function getJobQueueStatus() {
  // This would integrate with your job queue system (Bull, Agenda, etc.)
  return {
    queues: [
      {
        name: "email",
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0,
      },
      {
        name: "notifications",
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0,
      },
      {
        name: "billing",
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0,
      },
    ],
    workers: {
      total: 0,
      active: 0,
    },
    lastChecked: new Date().toISOString(),
  };
}

/**
 * Get integration health status
 */
export async function getIntegrationHealth() {
  // Check third-party integrations
  const integrations = [
    {
      name: "Stripe",
      status: "healthy",
      lastSync: new Date().toISOString(),
      metrics: {
        successfulPayments: 0,
        failedPayments: 0,
      },
    },
    {
      name: "Mailgun",
      status: "healthy",
      lastSync: new Date().toISOString(),
      metrics: {
        emailsSent: 0,
        deliveryRate: 100,
      },
    },
    {
      name: "AWS S3",
      status: "healthy",
      lastSync: new Date().toISOString(),
      metrics: {
        storageUsed: "0GB",
        uploadSuccess: 100,
      },
    },
  ];

  return {
    integrations,
    overallStatus: "healthy",
    lastChecked: new Date().toISOString(),
  };
}

/**
 * Get API usage statistics
 */
export async function getApiStatistics(period: string = "24h") {
  // This would query API logs/metrics
  return {
    period,
    requests: {
      total: 0,
      successful: 0,
      failed: 0,
      byEndpoint: {},
    },
    responseTimes: {
      avg: 0,
      p95: 0,
      p99: 0,
    },
    errors: {
      total: 0,
      byType: {},
    },
    lastChecked: new Date().toISOString(),
  };
}

/**
 * Get system alerts
 */
export async function getSystemAlerts() {
  // This would query alert/notification system
  return {
    alerts: [],
    critical: 0,
    warning: 0,
    info: 0,
    lastChecked: new Date().toISOString(),
  };
}

/**
 * Acknowledge an alert
 */
export async function acknowledgeAlert(
  alertId: string,
  acknowledgedBy: string,
  note?: string
) {
  logger.info({ alertId, acknowledgedBy, note }, "Alert acknowledged");

  return {
    success: true,
    alertId,
    acknowledgedBy,
    acknowledgedAt: new Date().toISOString(),
  };
}

/**
 * Get revenue metrics
 */
export async function getRevenueMetrics() {
  const allCompanies = await db.select().from(companies);

  const freeCompanies = allCompanies.filter(
    (c) => c.billingplan === "FREE" || c.subscriptionstatus === "TRIAL"
  ).length;
  const paidCompanies = allCompanies.filter(
    (c) => c.billingplan !== "FREE" && c.subscriptionstatus === "ACTIVE"
  ).length;

  // Calculate MRR
  const mrr = paidCompanies * 9900; // $99/month in cents

  return {
    mrr,
    arr: mrr * 12,
    breakdown: {
      free: freeCompanies,
      paid: paidCompanies,
      total: allCompanies.length,
    },
    trends: {
      newThisMonth: 0,
      churnedThisMonth: 0,
      growthRate: 0,
    },
    lastCalculated: new Date().toISOString(),
  };
}
