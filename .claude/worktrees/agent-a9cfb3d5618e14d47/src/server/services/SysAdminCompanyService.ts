import crypto from "crypto";
import { db } from "../db/client.js";
import { companies } from "../../db/schema/company.js";
import { userprofiles as users } from "../../db/schema/userprofiles.js";
import { companyStatusHistory, companyAnalytics } from "../../db/schema/companyStatus.js";
import { eq, desc, and, like, count, sql, inArray } from "drizzle-orm";
import { createLogger } from "../lib/logger.js";
// [SCOPE 131 / T005] both cancelled spellings — see src/shared/subscription-policy.ts
import { CANCELLED_STATUSES, isCancelledStatus } from "../../shared/subscription-policy.js";

const logger = createLogger("sysadmin-company-service");

export interface CompanyListFilters {
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface CompanyStatusUpdate {
  status: "ACTIVE" | "SUSPENDED" | "TRIAL" | "CANCELLED";
  reason?: string;
}

/**
 * List all companies with filtering and pagination
 */
export async function listCompanies(filters: CompanyListFilters) {
  const { status, search, limit = 50, offset = 0 } = filters;

  const conditions: any[] = [];

  // Apply status filter
  if (status && status !== "all") {
    if (status === "ACTIVE") {
      conditions.push(eq(companies.activeflag, true));
    } else if (status === "SUSPENDED") {
      conditions.push(eq(companies.activeflag, false));
    } else if (isCancelledStatus(status)) {
      // [SCOPE 131 / T005] MODIFIED-BY — filter on BOTH spellings.
      // Rows written before SPEC-131 carry CANCELED; the period-end webhook writes
      // CANCELLED. An equality filter on either one silently returns a partial list,
      // which is worse than an error because it looks like a complete answer.
      conditions.push(inArray(companies.subscriptionstatus, [...CANCELLED_STATUSES]));
    } else {
      conditions.push(eq(companies.subscriptionstatus, status));
    }
  }

  // Apply search filter
  if (search) {
    conditions.push(like(companies.name, `%${search}%`));
  }

  // Execute query
  let results;
  if (conditions.length > 0) {
    results = await db
      .select()
      .from(companies)
      .where(and(...conditions))
      .limit(limit)
      .offset(offset)
      .orderBy(desc(companies.createdat));
  } else {
    results = await db
      .select()
      .from(companies)
      .limit(limit)
      .offset(offset)
      .orderBy(desc(companies.createdat));
  }

  // Get user counts for each company
  const companiesWithStats = await Promise.all(
    results.map(async (company) => {
      const userCount = await db
        .select({ count: count() })
        .from(users)
        .where(eq(users.companyid, company.id));

      return {
        ...company,
        userCount: Number(userCount[0]?.count || 0),
        mrr: 0, // Would need subscription data
      };
    })
  );

  return companiesWithStats;
}

/**
 * Get detailed company information
 */
export async function getCompanyDetail(companyId: string) {
  const company = await db
    .select()
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);

  if (!company.length) {
    return null;
  }

  // Get company users
  const companyUsers = await db
    .select({
      id: users.id,
      email: users.emailaddr,
      fullName: users.fullname,
      usertype: users.usertype,
      active: users.active,
      lastLoginAt: users.lastloginedat,
    })
    .from(users)
    .where(eq(users.companyid, companyId));

  // Get status history
  const statusHistory = await db
    .select({
      id: companyStatusHistory.id,
      previousStatus: companyStatusHistory.previousStatus,
      newStatus: companyStatusHistory.newStatus,
      reason: companyStatusHistory.reason,
      changedAt: companyStatusHistory.changedAt,
      changedBy: companyStatusHistory.changedBy,
      changedByType: companyStatusHistory.changedByType,
    })
    .from(companyStatusHistory)
    .where(eq(companyStatusHistory.companyId, companyId))
    .orderBy(desc(companyStatusHistory.changedAt))
    .limit(20);

  // Get latest analytics
  const analytics = await db
    .select()
    .from(companyAnalytics)
    .where(eq(companyAnalytics.companyId, companyId))
    .orderBy(desc(companyAnalytics.calculatedAt))
    .limit(1);

  return {
    ...company[0],
    userCount: companyUsers.length,
    users: companyUsers,
    statusHistory,
    analytics: analytics[0] || null,
  };
}

/**
 * Create a new company
 */
export async function createCompany(data: {
  name: string;
  contactemail: string;
  phone?: string;
  billingPlan?: string;
  createdBy?: string;
}) {
  const { name, contactemail, phone, billingPlan = "SINGLE_USER", createdBy } = data;

  const companyId = crypto.randomUUID();
  const now = new Date();

  await db.insert(companies).values({
    id: companyId,
    name,
    contactemail,
    phone: phone || null,
    billingplan: billingPlan,
    subscriptionstatus: "TRIAL",
    activeflag: true,
    maxusers: 10, // Default for trial
    createdat: now,
    updatedat: now,
  });


  // Log status change
  if (createdBy) {
    await db.insert(companyStatusHistory).values({
      id: crypto.randomUUID(),
      companyId,
      newStatus: "TRIAL",
      reason: "Company created by SysAdmin",
      changedAt: now,
      changedBy: createdBy,
      changedByType: "SYSADMIN",
    });
  }

  logger.info({ companyId, name, createdBy }, "SysAdmin created company");

  return {
    id: companyId,
    name,
    contactemail,
    subscriptionstatus: "TRIAL",
    activeflag: true,
  };

}

/**
 * Update company status with audit trail
 */
export async function updateCompanyStatus(
  companyId: string,
  update: CompanyStatusUpdate,
  changedBy: string
) {
  const { status, reason } = update;

  // Get current company
  const current = await db
    .select()
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);

  if (!current.length) {
    throw new Error("Company not found");
  }

  const previousStatus = current[0].subscriptionstatus;
  const now = new Date();

  // Build updates
  const updates: any = {
    updatedat: now,
  };

  if (status === "ACTIVE") {
    updates.activeflag = true;
    updates.subscriptionstatus = "ACTIVE";
  } else if (status === "SUSPENDED") {
    updates.activeflag = false;
  } else {
    updates.subscriptionstatus = status;
  }

  // Update company
  await db
    .update(companies)
    .set(updates)
    .where(eq(companies.id, companyId));

  // Log status change
  await db.insert(companyStatusHistory).values({
    id: crypto.randomUUID(),
    companyId,
    previousStatus,
    newStatus: status,
    reason: reason || `Status changed to ${status}`,
    changedAt: now,
    changedBy,
    changedByType: "SYSADMIN",
  });

  logger.info(
    { companyId, previousStatus, newStatus: status, changedBy },
    "SysAdmin changed company status"
  );

  return {
    success: true,
    companyId,
    previousStatus,
    newStatus: status,
  };
}

/**
 * Soft delete company (with retention)
 */
export async function deleteCompany(
  companyId: string,
  reason: string,
  deletedBy: string,
  retentionDays: number = 30
) {
  const now = new Date();
  const retentionDate = new Date(now);
  retentionDate.setDate(retentionDate.getDate() + retentionDays);

  // Update company to cancelled status
  await db
    .update(companies)
    .set({
      activeflag: false,
      subscriptionstatus: "CANCELLED",
      updatedat: now,
    })
    .where(eq(companies.id, companyId));

  // Log status change
  await db.insert(companyStatusHistory).values({
    id: crypto.randomUUID(),
    companyId,
    newStatus: "CANCELLED",
    reason: `Company deleted: ${reason}. Data retention until ${retentionDate.toISOString()}`,
    changedAt: now,
    changedBy: deletedBy,
    changedByType: "SYSADMIN",
    metadata: { retentionDate: retentionDate.toISOString(), retentionDays },
  });

  logger.info(
    { companyId, deletedBy, retentionDays, retentionDate },
    "SysAdmin deleted company (soft delete)"
  );

  return {
    success: true,
    companyId,
    retentionDate: retentionDate.toISOString(),
    message: `Company marked for deletion. Data will be retained for ${retentionDays} days.`,
  };
}

/**
 * Get company analytics
 */
export async function getCompanyAnalytics(companyId: string, period?: string) {
  // Get latest analytics
  const analytics = await db
    .select()
    .from(companyAnalytics)
    .where(eq(companyAnalytics.companyId, companyId))
    .orderBy(desc(companyAnalytics.calculatedAt))
    .limit(1);

  // Calculate real-time metrics
  const userMetrics = await db
    .select({
      total: count(),
      active: sql<number>`sum(case when ${users.active} = true then 1 else 0 end)`,
    })
    .from(users)
    .where(eq(users.companyid, companyId));

  return {
    ...analytics[0],
    realTimeMetrics: {
      totalUsers: Number(userMetrics[0]?.total || 0),
      activeUsers: Number(userMetrics[0]?.active || 0),
    },
    period: period || "current",
  };
}
