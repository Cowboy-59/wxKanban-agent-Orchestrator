import { Request, Response, NextFunction } from "express";
import { logger } from "@server/lib/logger.js";

/**
 * Role-Based Access Control (RBAC) Middleware
 *
 * Enforces role-based authorization with 3-tier hierarchy:
 * - Admin: Full access to company features, can manage users and billing
 * - TeamManager: Can manage users and projects, limited billing access
 * - Developer: Can access assigned projects, track time, view own data only
 *
 * Usage:
 *   app.get('/api/company/users', requireRole('Admin', 'TeamManager'), handleListUsers);
 *   app.patch('/api/company/billing/rates', requireRole('Admin'), handleUpdateRates);
 */

declare global {
  namespace Express {
    interface Request {
      role?: "Admin" | "TeamManager" | "Developer";
      userid?: string;
      companyid?: string;
    }
  }
}

type Role = "Admin" | "TeamManager" | "Developer";

/**
 * Middleware factory to require specific roles
 *
 * @param allowedRoles - One or more roles with access (checked in order)
 * @returns Express middleware function
 */
export function requireRole(...allowedRoles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const userRole = req.role as Role | undefined;

      if (!userRole) {
        logger.warn({ path: req.path }, "Missing role in request context");
        res.status(401).json({
          success: false,
          error: "Unauthorized: User role required",
        });
        return;
      }

      // Check if user role is in allowed roles
      const isAllowed = allowedRoles.includes(userRole);

      if (!isAllowed) {
        logger.warn(
          { userRole, allowedRoles, path: req.path, userid: req.userid },
          "Access denied: insufficient role",
        );
        res.status(403).json({
          success: false,
          error: `Forbidden: Requires one of roles: ${allowedRoles.join(", ")}`,
        });
        return;
      }

      logger.debug(
        { userRole, allowedRoles, path: req.path },
        "RBAC authorization successful",
      );
      next();
    } catch (error) {
      logger.error({ err: error, path: req.path }, "RBAC middleware error");
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  };
}

/**
 * RBAC Matrix defining which roles can perform which actions
 *
 * Used for fine-grained permission checking beyond role-based access
 */
export const rbacMatrix: Record<Role, Record<string, boolean>> = {
  Admin: {
    // Company management
    "company:create": true,
    "company:read": true,
    "company:update": true,
    "company:deactivate": true,
    // User management
    "user:invite": true,
    "user:list": true,
    "user:update": true,
    "user:deactivate": true,
    "user:read": true,
    // Project management
    "project:create": true,
    "project:list": true,
    "project:update": true,
    "project:delete": true,
    "project:assign-users": true,
    // Billing
    "billing:configure": true,
    "billing:view-rates": true,
    "billing:generate-invoices": true,
    "billing:view-reports": true,
    // Admin dashboard
    "dashboard:view": true,
    "dashboard:analytics": true,
    // Audit logs
    "audit:view": true,
  },
  TeamManager: {
    // Company management (read-only)
    "company:create": false,
    "company:read": true,
    "company:update": false,
    "company:deactivate": false,
    // User management (limited)
    "user:invite": true,
    "user:list": true,
    "user:update": false,
    "user:deactivate": false,
    "user:read": true,
    // Project management
    "project:create": true,
    "project:list": true,
    "project:update": true,
    "project:delete": false,
    "project:assign-users": true,
    // Billing (read-only)
    "billing:configure": false,
    "billing:view-rates": true,
    "billing:generate-invoices": false,
    "billing:view-reports": true,
    // Admin dashboard
    "dashboard:view": true,
    "dashboard:analytics": true,
    // Audit logs
    "audit:view": false,
  },
  Developer: {
    // Company management (no access)
    "company:create": false,
    "company:read": false,
    "company:update": false,
    "company:deactivate": false,
    // User management (no access)
    "user:invite": false,
    "user:list": false,
    "user:update": false,
    "user:deactivate": false,
    "user:read": false,
    // Project management (assigned projects only)
    "project:create": false,
    "project:list": true, // See own assigned projects
    "project:update": false,
    "project:delete": false,
    "project:assign-users": false,
    // Billing (no access)
    "billing:configure": false,
    "billing:view-rates": false,
    "billing:generate-invoices": false,
    "billing:view-reports": false,
    // Admin dashboard
    "dashboard:view": false,
    "dashboard:analytics": false,
    // Audit logs
    "audit:view": false,
  },
};

/**
 * Check if a role can perform a specific action
 *
 * @param role - User role
 * @param action - Action identifier (e.g., 'billing:configure')
 * @returns true if role can perform action, false otherwise
 */
export function canPerformAction(role: Role, action: string): boolean {
  return rbacMatrix[role]?.[action] ?? false;
}

/**
 * Middleware factory for fine-grained permission checking
 *
 * @param action - Action identifier from rbacMatrix
 * @returns Express middleware function
 */
export function requirePermission(action: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const userRole = req.role as Role | undefined;

      if (!userRole) {
        logger.warn({ path: req.path }, "Missing role in request context");
        res.status(401).json({
          success: false,
          error: "Unauthorized: User role required",
        });
        return;
      }

      const hasPermission = canPerformAction(userRole, action);

      if (!hasPermission) {
        logger.warn(
          { userRole, action, path: req.path, userid: req.userid },
          "Access denied: insufficient permission",
        );
        res.status(403).json({
          success: false,
          error: `Forbidden: Permission denied for action "${action}"`,
        });
        return;
      }

      logger.debug(
        { userRole, action, path: req.path },
        "Permission check successful",
      );
      next();
    } catch (error) {
      logger.error(
        { err: error, path: req.path },
        "Permission check middleware error",
      );
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  };
}
