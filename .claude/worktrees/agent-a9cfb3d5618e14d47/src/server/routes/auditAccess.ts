import type { NextFunction, Response } from "express";
import { db } from "~/db/client.js";
import { companyauditlogs } from "~/db/schema/companyauditlog.js";
import { companyprojects } from "~/db/schema/companyproject.js";
import { eq } from "drizzle-orm";
import { ProjectService } from "../services/ProjectService.js";
import type { AuthRequest } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { requireSysAdmin } from "../middleware/requireSysAdmin.js";
import { createLogger } from "../lib/logger.js";

const logger = createLogger("audit-access");

// [SCOPE 146 / T001] BEGIN — who may call each /api/audit route (FR-004, SOC2 CC6.3)
/**
 * Every /api/audit route, keyed "METHOD /path" exactly as it is registered on the router.
 *
 *   login               any signed-in user
 *   loginFrameworkOnly  any signed-in user; a non-SYSADMIN sees only compliance_framework documents
 *   companyAdmin        company ADMIN (requireAdmin)
 *   sysadmin            SYSADMIN only (requireSysAdmin)
 *
 * The Platform Compliance Library and the Platform Self-Audit have no tenant column, so every
 * write to them, and every read of wxKanban's own audit data, is SYSADMIN only. A route that is
 * registered without an entry here fails tests/unit/auditRouteAccess.test.ts.
 */
export type AuditRouteAccess = "login" | "loginFrameworkOnly" | "companyAdmin" | "sysadmin";

export const AUDIT_ROUTE_ACCESS = {
  "GET /config": "login",
  "PUT /config": "companyAdmin",
  "GET /documents": "loginFrameworkOnly",
  "POST /documents": "sysadmin",
  "GET /documents/search": "loginFrameworkOnly",
  "POST /documents/:id/extract": "sysadmin",
  "GET /documents/:id": "loginFrameworkOnly",
  "DELETE /documents/:id": "sysadmin",
  "GET /tasks": "login",
  "GET /tasks/relevant": "login",
  "GET /tasks/:id": "login",
  "POST /execute": "sysadmin",
  "GET /executions": "sysadmin",
  "GET /executions/:id": "sysadmin",
  "GET /executions/:id/results": "sysadmin",
  "POST /executions/:id/cancel": "sysadmin",
  "POST /reports": "sysadmin",
  "GET /reports": "sysadmin",
  "GET /reports/:id": "sysadmin",
  "GET /reports/:id/download": "sysadmin",
  "POST /reports/:id/approve": "sysadmin",
  "GET /trends": "sysadmin",
} as const satisfies Record<string, AuditRouteAccess>;

export type AuditRouteKey = keyof typeof AUDIT_ROUTE_ACCESS;
// [SCOPE 146 / T001] END

// [SCOPE 146 / T001] BEGIN — the guard a route's access entry requires
type AuditGuard = (req: AuthRequest, res: Response, next: NextFunction) => void;

/**
 * The middleware to mount first on a route, ahead of any body or query validation, so a caller
 * without the role is refused (403) before anything about the request is examined.
 */
export function guardFor(route: AuditRouteKey): AuditGuard[] {
  switch (AUDIT_ROUTE_ACCESS[route]) {
    case "sysadmin":
      return [requireSysAdmin];
    case "companyAdmin":
      return [requireAdmin];
    case "login":
    case "loginFrameworkOnly":
      return [];
  }
}

/** True when the caller may see the whole Platform Compliance Library, internal documents included. */
export function isSysAdminCaller(req: AuthRequest): boolean {
  return req.usertype === "SYSADMIN";
}
// [SCOPE 146 / T001] END

// [SCOPE 146 / T009] BEGIN — may the caller reach this project's compliance settings (FR-009)
/** The body every refused or unknown project answers with, so a refusal reveals nothing. */
export const PROJECT_NOT_FOUND = { success: false, error: "Project not found" } as const;

async function projectCompanyId(projectId: string): Promise<string | null> {
  const [project] = await db
    .select({ companyid: companyprojects.companyid })
    .from(companyprojects)
    .where(eq(companyprojects.id, projectId))
    .limit(1);
  return project?.companyid ?? null;
}

/**
 * Read access to a project's compliance settings: the owner company, a company holding an
 * engagement grant on it (ProjectService.canAccessProjectTenant — the rule the project page uses),
 * or a SYSADMIN. The project must exist in every case.
 */
export async function canReadProjectCompliance(req: AuthRequest, projectId: string): Promise<boolean> {
  if (isSysAdminCaller(req)) return (await projectCompanyId(projectId)) !== null;
  if (!req.companyid) return false;
  return ProjectService.canAccessProjectTenant(projectId, req.companyid);
}

/** Write access: only the project's owner company. A consulting company may read, never change. */
export async function ownsProject(req: AuthRequest, projectId: string): Promise<boolean> {
  if (!req.companyid) return false;
  return (await projectCompanyId(projectId)) === req.companyid;
}
// [SCOPE 146 / T009] END

// [SCOPE 146 / T005] BEGIN — durable record of a SYSADMIN write to the audit library (FR-005, SOC2 CC7.2)
/**
 * Writes a companyauditlogs row for a state-changing /api/audit action, attributed to the acting
 * SYSADMIN's own company. companyauditlogs is the only durable audit store; there is no separate
 * SysAdmin audit table (SPEC-146 FR-010 removed a dead logger that assumed one).
 *
 * Never throws — the action has already happened; a failed record is logged as an error.
 */
export async function recordAuditLibraryWrite(
  req: AuthRequest,
  action: string,
  description: string,
  values: { previousvalue?: Record<string, unknown>; newvalue?: Record<string, unknown> } = {},
): Promise<void> {
  if (!req.companyid) {
    logger.error({ action, userid: req.userid }, "Audit-library write not recorded: caller has no company");
    return;
  }
  try {
    await db.insert(companyauditlogs).values({
      companyid: req.companyid,
      action,
      changedby: req.userid ?? null,
      previousvalue: values.previousvalue ?? null,
      newvalue: values.newvalue ?? null,
      description,
    });
  } catch (error) {
    logger.error({ error, action, userid: req.userid }, "Failed to record audit-library write");
  }
}
// [SCOPE 146 / T005] END
