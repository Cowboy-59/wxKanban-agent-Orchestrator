import { Request, Response, NextFunction } from "express";
import { logger } from "@server/lib/logger.js";

/**
 * Audit Logging Middleware
 *
 * Logs all company-level actions (creates, updates, deletes) for compliance
 * and debugging purposes. Captures:
 * - Who performed the action (userid)
 * - What action was taken
 * - Which company was affected
 * - Previous and new state (when applicable)
 * - Timestamp and request metadata
 */

declare global {
  namespace Express {
    interface Request {
      auditLog?: {
        action: string;
        previousValue?: Record<string, unknown>;
        newValue?: Record<string, unknown>;
      };
    }
  }
}

export interface AuditLogEntry {
  action: string;
  companyid: string;
  userid: string | null;
  previousvalue?: Record<string, unknown>;
  newvalue?: Record<string, unknown>;
  description?: string;
  timestamp: Date;
}

/**
 * Audit log actions (predefined set for consistency)
 */
export const auditActions = {
  COMPANY_CREATED: "company_created",
  COMPANY_UPDATED: "company_updated",
  COMPANY_DEACTIVATED: "company_deactivated",
  USER_INVITED: "user_invited",
  USER_ACCEPTED_INVITATION: "user_accepted_invitation",
  USER_UPDATED: "user_updated",
  USER_ROLE_CHANGED: "role_changed",
  USER_DEACTIVATED: "user_deactivated",
  PROJECT_CREATED: "project_created",
  PROJECT_UPDATED: "project_updated",
  PROJECT_USER_ASSIGNED: "project_user_assigned",
  PROJECT_USER_REMOVED: "project_user_removed",
  BILLING_RATE_UPDATED: "rate_updated",
  INVOICE_GENERATED: "invoice_generated",
  INVOICE_EMAILED: "invoice_emailed",
  SYSTEM_ACTION: "system_action",
} as const;

/**
 * Main audit logging middleware
 * Logs key company-level operations
 */
export function auditLoggerMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const companyid = req.companyid;
  const userid = req.userid;
  const startTime = Date.now();

  // Intercept response to log after send
  const originalJson = res.json.bind(res);

  res.json = function (data: unknown) {
    const duration = Date.now() - startTime;

    // Log audit actions that were recorded during request processing
    if (req.auditLog && companyid) {
      logAuditEntry({
        action: req.auditLog.action,
        companyid,
        userid: userid || null,
        previousvalue: req.auditLog.previousValue,
        newvalue: req.auditLog.newValue,
        timestamp: new Date(),
      });
    }

    // Log request metadata
    logger.info(
      {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        companyid,
        userid,
        duration,
      },
      "Request completed",
    );

    return originalJson(data);
  };

  next();
}

/**
 * Helper function to log audit entries
 * In Phase 2, this will be extended to save to database
 * For now, logs to structured logging (Pino)
 *
 * @param entry - Audit log entry
 */
export function logAuditEntry(entry: AuditLogEntry): void {
  logger.info(
    {
      action: entry.action,
      companyid: entry.companyid,
      changedby: entry.userid,
      previousvalue: entry.previousvalue,
      newvalue: entry.newvalue,
      timestamp: entry.timestamp.toISOString(),
    },
    `Audit: ${entry.action}`,
  );

  // TODO: In Phase 2, save to companyauditlog table
  // await db.insert(companyauditlog).values({
  //   action: entry.action,
  //   companyid: entry.companyid,
  //   changedby: entry.userid,
  //   previousvalue: entry.previousvalue,
  //   newvalue: entry.newvalue,
  //   timestamp: entry.timestamp,
  // });
}

/**
 * Helper to attach audit log to current request
 *
 * Usage in route handler:
 *   attachAuditLog(req, {
 *     action: auditActions.USER_ROLE_CHANGED,
 *     previousValue: { role: 'Developer' },
 *     newValue: { role: 'Admin' },
 *   });
 *
 * The middleware will log this after response is sent
 */
export function attachAuditLog(
  req: Request,
  log: {
    action: string;
    previousValue?: Record<string, unknown>;
    newValue?: Record<string, unknown>;
  },
): void {
  req.auditLog = {
    action: log.action,
    previousValue: log.previousValue,
    newValue: log.newValue,
  };
}

/**
 * Helper to create audit log description
 */
export function createAuditDescription(
  action: string,
  details: Record<string, unknown>,
): string {
  const entries = Object.entries(details)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join(", ");
  return `${action} - ${entries}`;
}
