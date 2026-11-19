import { db } from "../db/client.js";
import { userprofiles as users } from "../../db/schema/userprofiles.js";
import { companies } from "../../db/schema/company.js";
import { eq, desc, and, sql } from "drizzle-orm";
import { createLogger } from "../lib/logger.js";
import { hashPassword } from "../lib/password.js";
import { agentDeviceTokenService } from "./AgentDeviceTokenService.js"; // [SCOPE 152 / T005]

const logger = createLogger("sysadmin-user-service");

export interface UserSearchFilters {
  search?: string;
  companyId?: string;
  active?: boolean;
  usertype?: string;
  limit?: number;
  offset?: number;
}

export interface UserStatusUpdate {
  active: boolean;
  reason?: string;
}

export interface UserTransferData {
  userId: string;
  targetCompanyId: string;
  newRole?: string;
  reason?: string;
}

/**
 * Search users across all companies
 */
export async function searchUsers(filters: UserSearchFilters) {
  const { search, companyId, active, usertype, limit = 50, offset = 0 } = filters;

  const conditions: any[] = [];

  if (companyId) {
    conditions.push(eq(users.companyid, companyId));
  }

  if (active !== undefined) {
    conditions.push(eq(users.active, active));
  }

  if (usertype) {
    conditions.push(eq(users.usertype, usertype));
  }

  if (search) {
    conditions.push(
      sql`(${users.emailaddr} ILIKE ${`%${search}%`} OR ${users.fullname} ILIKE ${`%${search}%`})`
    );
  }

  let results;
  if (conditions.length > 0) {
    results = await db
      .select()
      .from(users)
      .where(and(...conditions))
      .limit(limit)
      .offset(offset)
      .orderBy(desc(users.joinedat));
  } else {
    results = await db
      .select()
      .from(users)
      .limit(limit)
      .offset(offset)
      .orderBy(desc(users.joinedat));
  }

  // Get company names
  const resultsWithCompany = await Promise.all(
    results.map(async (user) => {
      const company = await db
        .select({ name: companies.name })
        .from(companies)
        .where(eq(companies.id, user.companyid))
        .limit(1);

      return {
        ...user,
        companyName: company[0]?.name || "Unknown",
      };
    })
  );

  return resultsWithCompany;
}

/**
 * Get detailed user information
 */
export async function getUserDetail(userId: string) {
  const user = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user.length) {
    return null;
  }

  // Get company info
  const company = await db
    .select()
    .from(companies)
    .where(eq(companies.id, user[0].companyid))
    .limit(1);

  // Get activity summary (would need activity/audit log tables)
  const activitySummary = {
    lastLoginAt: user[0].lastloginedat,
    totalLogins: 0, // Would need login history table
    projectsAccess: 0, // Would need to query project assignments
  };

  return {
    ...user[0],
    company: company[0] || null,
    activitySummary,
  };
}

/**
 * Update user status (enable/disable)
 */
export async function updateUserStatus(
  userId: string,
  update: UserStatusUpdate,
  changedBy: string
) {
  const { active, reason } = update;

  // Get current user
  const current = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!current.length) {
    throw new Error("User not found");
  }

  await db
    .update(users)
    .set({ active })
    .where(eq(users.id, userId));

  logger.info(
    { userId, active, changedBy, reason },
    "SysAdmin changed user status"
  );

  return {
    success: true,
    userId,
    active,
    message: `User ${active ? "enabled" : "disabled"}`,
  };
}

/**
 * Reset user password
 */
export async function resetPassword(userId: string, adminId: string) {
  // Get user
  const user = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user.length) {
    throw new Error("User not found");
  }

  // Generate temporary password
  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  // Update password
  // [SCOPE 152 / T005] A SysAdmin reset signs out every K.A.I.N. device (FR-065, SOC 2 CC6.1), in
  // the same transaction as the new password.
  const revoked = await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ password: passwordHash })
      .where(eq(users.id, userId));
    return agentDeviceTokenService.revokeAllForUser(userId, adminId, "password_changed", tx);
  });
  await agentDeviceTokenService.auditRevokeAll(userId, adminId, "password_changed", revoked);

  logger.info({ userId, adminId }, "SysAdmin reset user password");

  // TODO: Send email with temporary password

  return {
    success: true,
    userId,
    tempPassword: process.env.NODE_ENV === "development" ? tempPassword : undefined,
    message: "Password reset successfully. User will receive email with temporary password.",
  };
}

/**
 * Transfer user between companies
 */
export async function transferUser(data: UserTransferData, performedBy: string) {
  const { userId, targetCompanyId, newRole, reason } = data;

  // Get current user
  const user = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user.length) {
    throw new Error("User not found");
  }

  const sourceCompanyId = user[0].companyid;

  // Verify target company exists
  const targetCompany = await db
    .select()
    .from(companies)
    .where(eq(companies.id, targetCompanyId))
    .limit(1);

  if (!targetCompany.length) {
    throw new Error("Target company not found");
  }

  // Update user company and optionally role
  const updates: any = {
    companyid: targetCompanyId,
  };

  if (newRole) {
    updates.usertype = newRole;
  }

  await db
    .update(users)
    .set(updates)
    .where(eq(users.id, userId));

  logger.info(
    {
      userId,
      sourceCompanyId,
      targetCompanyId,
      newRole,
      performedBy,
      reason,
    },
    "SysAdmin transferred user between companies"
  );

  return {
    success: true,
    userId,
    sourceCompanyId,
    targetCompanyId,
    newRole: newRole || user[0].usertype,
    message: `User transferred to ${targetCompany[0].name}`,
  };
}

/**
 * Get user activity across companies
 */
export async function getUserActivity(userId: string, period?: string) {
  // Get user
  const user = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user.length) {
    throw new Error("User not found");
  }

  // This would query activity logs, audit logs, etc.
  // For now, return basic info
  return {
    userId,
    period: period || "last_30_days",
    activity: [], // Would be populated from activity logs
    summary: {
      totalActions: 0,
      lastActive: user[0].lastloginedat,
    },
  };
}

/**
 * Generate a secure temporary password
 */
function generateTempPassword(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
  let password = "";
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}
