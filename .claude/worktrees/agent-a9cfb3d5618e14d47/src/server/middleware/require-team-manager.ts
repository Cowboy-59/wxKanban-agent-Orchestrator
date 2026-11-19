/**
 * Team Manager Role Requirement Middleware
 *
 * Middleware to enforce Team Manager role on routes that require duty assignment authority.
 * Used on all POST/DELETE duty assignment and compliance override routes (T058-T059).
 *
 * Implements: T058-T059
 * - T058: requireTeamManagerRole() middleware
 * - T059: Application to routes T048-T054
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '~/lib/logger';

/**
 * Extend Express Request type to include user info
 */
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        name: string;
        role: string;
        projectRoles?: {
          [projectId: string]: string; // Project-specific roles
        };
      };
    }
  }
}

/**
 * Middleware: Require Team Manager role
 *
 * Verifies the requesting user has Team Manager role on the project.
 * Should be applied to:
 * - POST /api/projects/{projectId}/duties/assign (T048)
 * - DELETE /api/projects/{projectId}/duties/assignments/{id} (T050)
 * - POST /api/compliance/overrides/* (if implemented) (T053-T054)
 *
 * Returns 401 if not authenticated, 403 if not Team Manager.
 *
 * Usage:
 * router.post('/:projectId/duties/assign', requireTeamManagerRole, handler);
 */
export function requireTeamManagerRole(req: Request, res: Response, next: NextFunction): void {
  try {
    // Check if user is authenticated
    if (!req.user) {
      logger.warn({ path: req.path }, 'Attempted access without authentication');
      res.status(401).json({
        error: 'Authentication required',
        code: 'UNAUTHENTICATED',
      });
      return;
    }

    const { projectId } = req.params;

    if (!projectId) {
      logger.error({ path: req.path }, 'projectId not found in route params');
      res.status(400).json({
        error: 'Missing projectId in route',
      });
      return;
    }

    // Check for Team Manager role
    const userRole = getUserRoleOnProject(req.user, projectId);

    if (userRole !== 'TEAM_MANAGER' && userRole !== 'ADMIN') {
      logger.warn(
        { userId: req.user.id, projectId, userRole },
        'Unauthorized: User does not have Team Manager role'
      );

      res.status(403).json({
        error: 'Only Team Managers can perform this action',
        code: 'INSUFFICIENT_PERMISSIONS',
        requiredRole: 'TEAM_MANAGER',
        userRole,
      });
      return;
    }

    logger.debug(
      { userId: req.user.id, projectId, userRole },
      'Team Manager permission check passed'
    );

    // Permission granted, continue to next middleware/handler
    next();
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error checking Team Manager role');
    res.status(500).json({
      error: 'Failed to verify permissions',
    });
  }
}

/**
 * Middleware: Require Admin role (stricter than Team Manager)
 *
 * Used for subscription-level operations that only admins can perform.
 * Applied to compliance override listing and reporting endpoints (T053-T054).
 *
 * Returns 401 if not authenticated, 403 if not Admin.
 */
export function requireAdminRole(req: Request, res: Response, next: NextFunction): void {
  try {
    if (!req.user) {
      logger.warn({ path: req.path }, 'Attempted admin access without authentication');
      res.status(401).json({
        error: 'Authentication required',
        code: 'UNAUTHENTICATED',
      });
      return;
    }

    // Check for Admin role (global, not per-project)
    if (req.user.role !== 'ADMIN' && req.user.role !== 'SUPER_ADMIN') {
      logger.warn(
        { userId: req.user.id, userRole: req.user.role },
        'Unauthorized: User does not have Admin role'
      );

      res.status(403).json({
        error: 'Only Admins can perform this action',
        code: 'INSUFFICIENT_PERMISSIONS',
        requiredRole: 'ADMIN',
        userRole: req.user.role,
      });
      return;
    }

    logger.debug({ userId: req.user.id }, 'Admin permission check passed');
    next();
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error checking Admin role');
    res.status(500).json({
      error: 'Failed to verify permissions',
    });
  }
}

/**
 * Middleware: Require Project access
 *
 * Verifies user is a member of the specified project.
 * Useful for read operations where Team Manager isn't required,
 * but user should still be on the project.
 *
 * Applied to:
 * - GET /api/projects/{projectId}/duties/assignments (T049)
 * - GET /api/projects/{projectId}/duties/available (T051)
 */
export function requireProjectAccess(req: Request, res: Response, next: NextFunction): void {
  try {
    if (!req.user) {
      logger.warn({ path: req.path }, 'Attempted access without authentication');
      res.status(401).json({
        error: 'Authentication required',
        code: 'UNAUTHENTICATED',
      });
      return;
    }

    const { projectId } = req.params;

    if (!projectId) {
      logger.error({ path: req.path }, 'projectId not found in route params');
      res.status(400).json({
        error: 'Missing projectId in route',
      });
      return;
    }

    // Check if user is on the project
    const userRole = getUserRoleOnProject(req.user, projectId);

    if (!userRole) {
      logger.warn(
        { userId: req.user.id, projectId },
        'User is not a member of this project'
      );

      res.status(403).json({
        error: 'You do not have access to this project',
        code: 'PROJECT_ACCESS_DENIED',
      });
      return;
    }

    logger.debug({ userId: req.user.id, projectId }, 'Project access check passed');
    next();
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error checking project access');
    res.status(500).json({
      error: 'Failed to verify project access',
    });
  }
}

/**
 * Helper: Get user's role on a specific project
 *
 * Checks both:
 * - Global admin roles (ADMIN, SUPER_ADMIN)
 * - Project-specific roles in req.user.projectRoles
 *
 * Returns the role (e.g., 'TEAM_MANAGER', 'DEVELOPER') or null if not a member.
 *
 * @param user - The authenticated user
 * @param projectId - The project ID
 * @returns User's role or null
 */
function getUserRoleOnProject(user: any, projectId: string): string | null {
  if (!user) {
    return null;
  }

  // Global admin roles have all permissions
  if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') {
    return 'ADMIN';
  }

  // Check project-specific role
  if (user.projectRoles && user.projectRoles[projectId]) {
    return user.projectRoles[projectId];
  }

  return null;
}

/**
 * Helper: Check if user is project Team Manager
 *
 * @param user - The authenticated user
 * @param projectId - The project ID
 * @returns true if user is Team Manager or Admin on project
 */
export function isTeamManagerOrAdmin(user: any, projectId: string): boolean {
  const role = getUserRoleOnProject(user, projectId);
  return role === 'TEAM_MANAGER' || role === 'ADMIN';
}

/**
 * Helper: Check if user is global Admin
 *
 * @param user - The authenticated user
 * @returns true if user is global admin
 */
export function isGlobalAdmin(user: any): boolean {
  return user && (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN');
}

/**
 * Logging helper for audit trail
 *
 * Logs permission-related events (success and failures) for compliance auditing.
 *
 * @param userId - The user ID
 * @param action - The action attempted
 * @param projectId - The project ID (if applicable)
 * @param allowed - Whether the action was allowed
 * @param requiredRole - The role required for action
 * @param userRole - The user's actual role
 */
export function logPermissionEvent(
  userId: string,
  action: string,
  projectId: string | undefined,
  allowed: boolean,
  requiredRole: string,
  userRole: string | null
): void {
  const level = allowed ? 'info' : 'warn';
  const message = allowed
    ? `Permission granted: ${action}`
    : `Permission denied: ${action}`;

  logger.log(level, {
    message,
    userId,
    action,
    projectId,
    requiredRole,
    userRole,
    timestamp: new Date().toISOString(),
  });
}

export default {
  requireTeamManagerRole,
  requireAdminRole,
  requireProjectAccess,
  isTeamManagerOrAdmin,
  isGlobalAdmin,
};
