import { db } from "~/db/client.js";
import { companyauditlogs, CompanyAuditLog } from "~/db/schema/companyauditlog.js";
import { eq, gte, lte, and } from "drizzle-orm";
import { logger } from "~/server/lib/logger.js";

/**
 * Audit service for compliance logging.
 * Writes to companyauditlogs table and logs to application logger.
 *
 * Events logged:
 * - COMPANY_CREATED, SUBSCRIPTION_CREATED/UPGRADED/DOWNGRADED
 * - USER_CREATED, USER_INVITED, INVITATION_ACCEPTED
 * - PAYMENT_PROCESSED, PAYMENT_FAILED
 * - TOKEN_REVOKED, LOGIN_SUCCESS, LOGIN_FAILED
 * - PASSWORD_CHANGED, USER_SUSPENDED, USER_DEACTIVATED
 * - ADMIN_BYPASS_VERIFY
 */

export type AuditAction =
  | "COMPANY_CREATED"
  | "SUBSCRIPTION_CREATED"
  | "SUBSCRIPTION_UPGRADED"
  | "SUBSCRIPTION_DOWNGRADED"
  | "USER_CREATED"
  | "USER_INVITED"
  | "INVITATION_ACCEPTED"
  | "PAYMENT_PROCESSED"
  | "PAYMENT_FAILED"
  | "TOKEN_REVOKED"
  | "LOGIN_SUCCESS"
  | "LOGIN_FAILED"
  | "PASSWORD_CHANGED"
  | "USER_SUSPENDED"
  | "USER_DEACTIVATED"
  | "ADMIN_BYPASS_VERIFY"
  | "USER_ROLE_CHANGED"
  // Spec 037 — Consultants Management
  | "ENGAGEMENT_CREATED"
  | "ENGAGEMENT_PAUSED"
  | "ENGAGEMENT_RESUMED"
  | "ENGAGEMENT_DISABLED"
  | "ENGAGEMENT_ENABLED"
  | "ENGAGEMENT_ENDED"
  | "ENGAGEMENT_ASSIGNMENT_ADDED"
  | "ENGAGEMENT_ASSIGNMENT_REMOVED"
  | "SUBASSIGNMENT_CREATED"
  | "SUBASSIGNMENT_REMOVED"
  // [SCOPE 005 / T012] Time and Billing state changes (FR-013, SOC 2 CC7.2)
  | "TIMEBILLING_ENTRY_CREATED"
  | "TIMEBILLING_ENTRY_UPDATED"
  | "TIMEBILLING_ENTRY_DELETED"
  | "TIMEBILLING_PROJECT_BILLED_CHANGED"
  | "TIMEBILLING_PROJECT_CUSTOMER_CHANGED"
  | "TIMEBILLING_RATES_CHANGED"
  | "TIMEBILLING_ACH_CHANGED"
  | "TIMEBILLING_BILLINGCYCLE_CHANGED"
  | "TIMEBILLING_AGENT_TIME_PULLED"
  | "TIMEBILLING_STATEMENT_GENERATED";


export type ResourceType =
  | "company"
  | "user"
  | "userinvitation"
  | "subscription"
  | "payment"
  | "session"
  // Spec 037 — Consultants Management
  | "engagement"
  | "engagementinvitation"
  | "engagementassignment"
  | "subassignment"
  // [SCOPE 005 / T012] Time and Billing
  | "project"
  | "timeentry"
  | "customer"
  | "statement";

export interface AuditLogEntry {
  companyId: string;
  userId?: string;
  action: AuditAction;
  resourceType: ResourceType;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  status: "success" | "failure";
  errorMessage?: string;
}

/**
 * Log audit event to DB and application logger.
 * Never throws — audit failures must not block operations.
 */
export async function logAuditEvent(entry: AuditLogEntry): Promise<void> {
  // Always log to application logger first (guaranteed delivery)
  logger.info(
    {
      companyId: entry.companyId,
      userId: entry.userId,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      status: entry.status,
      ipAddress: entry.ipAddress,
    },
    `Audit: ${entry.action}`,
  );

  if (entry.errorMessage) {
    logger.warn(
      { errorMessage: entry.errorMessage },
      `Audit failure: ${entry.action}`,
    );
  }

  // Write to DB (fire-and-forget — never block the caller)
  db.insert(companyauditlogs)
    .values({
      companyid: entry.companyId,
      changedby: entry.userId,
      action: entry.action,
      newvalue: {
        resourceType: entry.resourceType,
        resourceId: entry.resourceId,
        status: entry.status,
        ipAddress: entry.ipAddress,
        errorMessage: entry.errorMessage,
        ...entry.details,
      },
      description: `${entry.action} by ${entry.userId ?? "system"} — ${entry.status}`,
    })
    .then(() => undefined)
    .catch((err: unknown) =>
      logger.error({ err, action: entry.action }, "Failed to persist audit log to DB"),
    );
}

/**
 * Log company creation
 */
export async function logCompanyCreated(
  companyId: string,
  companyName: string,
  tier: string,
  billingEmail: string,
  ipAddress?: string,
): Promise<void> {
  await logAuditEvent({
    companyId,
    action: "COMPANY_CREATED",
    resourceType: "company",
    resourceId: companyId,
    details: { companyName, tier, billingEmail },
    ipAddress,
    status: "success",
  });
}

/**
 * Log subscription creation
 */
export async function logSubscriptionCreated(
  companyId: string,
  userId: string,
  tier: string,
  monthlyPrice: number,
  customerId?: string,
  ipAddress?: string,
): Promise<void> {
  await logAuditEvent({
    companyId,
    userId,
    action: "SUBSCRIPTION_CREATED",
    resourceType: "subscription",
    details: { tier, monthlyPrice, customerId },
    ipAddress,
    status: "success",
  });
}

/**
 * Log subscription upgrade/downgrade
 */
export async function logSubscriptionChanged(
  companyId: string,
  userId: string,
  oldTier: string,
  newTier: string,
  oldPrice: number,
  newPrice: number,
  ipAddress?: string,
): Promise<void> {
  const isPriceIncrease = newPrice > oldPrice;
  const action: AuditAction = isPriceIncrease
    ? "SUBSCRIPTION_UPGRADED"
    : "SUBSCRIPTION_DOWNGRADED";

  await logAuditEvent({
    companyId,
    userId,
    action,
    resourceType: "subscription",
    details: { oldTier, newTier, oldPrice, newPrice },
    ipAddress,
    status: "success",
  });
}

/**
 * Log user creation
 */
export async function logUserCreated(
  companyId: string,
  userId: string,
  email: string,
  usertype: string,
  createdByUserId?: string,
  ipAddress?: string,
): Promise<void> {
  await logAuditEvent({
    companyId,
    userId: createdByUserId,
    action: "USER_CREATED",
    resourceType: "user",
    resourceId: userId,
    details: { email, usertype },
    ipAddress,
    status: "success",
  });
}

/**
 * Log user invitation
 */
export async function logUserInvited(
  companyId: string,
  userId: string,
  invitedEmail: string,
  usertype: string,
  invitationId?: string,
  ipAddress?: string,
): Promise<void> {
  await logAuditEvent({
    companyId,
    userId,
    action: "USER_INVITED",
    resourceType: "userinvitation",
    resourceId: invitationId,
    details: { invitedEmail, usertype },
    ipAddress,
    status: "success",
  });
}

/**
 * Log invitation acceptance
 */
export async function logInvitationAccepted(
  companyId: string,
  newUserId: string,
  invitationId: string,
  email: string,
  ipAddress?: string,
): Promise<void> {
  await logAuditEvent({
    companyId,
    userId: newUserId,
    action: "INVITATION_ACCEPTED",
    resourceType: "userinvitation",
    resourceId: invitationId,
    details: { email },
    ipAddress,
    status: "success",
  });
}

/**
 * Log payment processed
 */
export async function logPaymentProcessed(
  companyId: string,
  userId: string,
  amount: number,
  currency: string,
  subscriptionTier: string,
  stripePaymentId?: string,
  ipAddress?: string,
): Promise<void> {
  await logAuditEvent({
    companyId,
    userId,
    action: "PAYMENT_PROCESSED",
    resourceType: "payment",
    details: { amount, currency, subscriptionTier, stripePaymentId },
    ipAddress,
    status: "success",
  });
}

/**
 * Log payment failure
 */
export async function logPaymentFailed(
  companyId: string,
  userId: string,
  amount: number,
  currency: string,
  subscriptionTier: string,
  errorMessage: string,
  ipAddress?: string,
): Promise<void> {
  await logAuditEvent({
    companyId,
    userId,
    action: "PAYMENT_FAILED",
    resourceType: "payment",
    details: { amount, currency, subscriptionTier },
    ipAddress,
    status: "failure",
    errorMessage,
  });
}

/**
 * Log token revocation (logout or breach detection)
 */
export async function logTokenRevoked(
  companyId: string,
  userId: string,
  reason: "logout" | "breach_detected" | "expired" | "manual",
  ipAddress?: string,
): Promise<void> {
  await logAuditEvent({
    companyId,
    userId,
    action: "TOKEN_REVOKED",
    resourceType: "session",
    details: { reason },
    ipAddress,
    status: "success",
  });
}

/**
 * Log successful login
 */
export async function logLoginSuccess(
  companyId: string,
  userId: string,
  ipAddress?: string,
): Promise<void> {
  await logAuditEvent({
    companyId,
    userId,
    action: "LOGIN_SUCCESS",
    resourceType: "session",
    ipAddress,
    status: "success",
  });
}

/**
 * Log failed login attempt
 */
export async function logLoginFailed(
  companyId: string | undefined,
  email: string,
  reason: string,
  ipAddress?: string,
): Promise<void> {
  await logAuditEvent({
    companyId: companyId ?? "unknown",
    action: "LOGIN_FAILED",
    resourceType: "session",
    details: { email, reason },
    ipAddress,
    status: "failure",
    errorMessage: reason,
  });
}

/**
 * Log password change
 */
export async function logPasswordChanged(
  companyId: string,
  userId: string,
  ipAddress?: string,
): Promise<void> {
  await logAuditEvent({
    companyId,
    userId,
    action: "PASSWORD_CHANGED",
    resourceType: "user",
    resourceId: userId,
    ipAddress,
    status: "success",
  });
}

/**
 * Log user suspension
 */
export async function logUserSuspended(
  companyId: string,
  userId: string,
  suspendedUserId: string,
  reason: string,
  ipAddress?: string,
): Promise<void> {
  await logAuditEvent({
    companyId,
    userId,
    action: "USER_SUSPENDED",
    resourceType: "user",
    resourceId: suspendedUserId,
    details: { reason },
    ipAddress,
    status: "success",
  });
}

/**
 * Log user deactivation
 */
export async function logUserDeactivated(
  companyId: string,
  userId: string,
  deactivatedUserId: string,
  reason: string,
  ipAddress?: string,
): Promise<void> {
  await logAuditEvent({
    companyId,
    userId,
    action: "USER_DEACTIVATED",
    resourceType: "user",
    resourceId: deactivatedUserId,
    details: { reason },
    ipAddress,
    status: "success",
  });
}

/**
 * Log admin email verification bypass
 */
export async function logAdminBypassVerify(
  companyId: string,
  adminUserId: string,
  targetCompanyId: string,
  ipAddress?: string,
): Promise<void> {
  await logAuditEvent({
    companyId,
    userId: adminUserId,
    action: "ADMIN_BYPASS_VERIFY",
    resourceType: "company",
    resourceId: targetCompanyId,
    ipAddress,
    status: "success",
  });
}

/**
 * Get audit logs for a company with optional filters
 */
export async function getCompanyAuditLogs(
  companyId: string,
  options?: {
    limit?: number;
    offset?: number;
    action?: AuditAction;
    startDate?: Date;
    endDate?: Date;
  },
): Promise<CompanyAuditLog[]> {
  try {
    const conditions = [eq(companyauditlogs.companyid, companyId)];

    if (options?.action) {
      conditions.push(eq(companyauditlogs.action, options.action));
    }
    if (options?.startDate) {
      conditions.push(gte(companyauditlogs.timestamp, options.startDate));
    }
    if (options?.endDate) {
      conditions.push(lte(companyauditlogs.timestamp, options.endDate));
    }

    const query = db
      .select()
      .from(companyauditlogs)
      .where(and(...conditions))
      .orderBy(companyauditlogs.timestamp)
      .limit(options?.limit ?? 50)
      .offset(options?.offset ?? 0);

    return await query;
  } catch (error) {
    logger.error({ error, companyId }, "Failed to get audit logs");
    throw error;
  }
}
