/**
 * Global Error Handler Middleware
 * Catches all errors and provides standardized response format
 *
 * Feature 002: Error handling for company, billing, user management endpoints
 */

import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { sendError, ErrorCode, ErrorStatus } from '../../lib/api-response.js';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('error-handler');

/**
 * Custom application error class
 */
export class AppError extends Error {
  constructor(
    public code: string,
    public statusCode: number,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/**
 * Error handler middleware
 * Must be placed AFTER all other middleware and routes
 */
export function errorHandler(
  err: Error | AppError | ZodError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Log error for debugging
  logger.error({ error: err }, 'Unhandled error');

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    const details = err.errors.reduce((acc, error) => {
      const path = error.path.join('.');
      acc[path] = error.message;
      return acc;
    }, {} as Record<string, unknown>);

    sendError(res, ErrorCode.VALIDATION_ERROR, 'Validation failed', 400, details);
    return;
  }

  // Handle custom app errors
  if (err instanceof AppError) {
    sendError(res, err.code, err.message, err.statusCode, err.details);
    return;
  }

  // Handle standard errors
  if (err instanceof SyntaxError && 'body' in err) {
    // JSON parsing error
    sendError(res, ErrorCode.INVALID_REQUEST, 'Invalid JSON in request body', 400);
    return;
  }

  if (err instanceof TypeError) {
    // Type errors (usually indicates a bug)
    logger.error({ error: err.message }, 'Type error in request handling');
    sendError(res, ErrorCode.INTERNAL_ERROR, 'Internal server error', 500);
    return;
  }

  // Default: internal server error
  const message = err instanceof Error ? err.message : 'Unknown error occurred';
  sendError(res, ErrorCode.INTERNAL_ERROR, message, 500);
}

/**
 * Async handler wrapper to catch promise rejections
 * Wrap async route handlers with this function
 *
 * Example:
 * router.post('/endpoint', asyncHandler(async (req, res) => { ... }))
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Throw standardized app error
 *
 * Example:
 * throw new AppError(
 *   ErrorCode.USER_NOT_FOUND,
 *   404,
 *   'User not found'
 * )
 */
export function createAppError(
  code: keyof typeof ErrorCode,
  statusCode?: number,
  message?: string,
  details?: Record<string, unknown>
): AppError {
  const errorCode = ErrorCode[code];
  const defaultStatus = ErrorStatus[errorCode] || 500;

  return new AppError(
    errorCode,
    statusCode || defaultStatus,
    message || errorCode,
    details
  );
}

/**
 * Common error creators for convenience
 */
export const errors = {
  badRequest: (message: string = 'Bad request') =>
    createAppError('INVALID_REQUEST', 400, message),

  validation: (message: string, details?: Record<string, unknown>) =>
    createAppError('VALIDATION_ERROR', 400, message, details),

  unauthorized: (message: string = 'Unauthorized') =>
    createAppError('UNAUTHORIZED', 401, message),

  forbidden: (message: string = 'Forbidden') =>
    createAppError('FORBIDDEN', 403, message),

  notFound: (resource: string) =>
    createAppError('NOT_FOUND', 404, `${resource} not found`),

  conflict: (message: string) =>
    createAppError('CONFLICT', 409, message),

  rateLimited: () =>
    createAppError('RATE_LIMITED', 429, 'Too many requests, please try again later'),

  internal: (message: string = 'Internal server error') =>
    createAppError('INTERNAL_ERROR', 500, message),

  companyNotFound: () =>
    createAppError('COMPANY_NOT_FOUND', 404, 'Company not found'),

  userNotFound: () =>
    createAppError('USER_NOT_FOUND', 404, 'User not found'),

  projectNotFound: () =>
    createAppError('PROJECT_NOT_FOUND', 404, 'Project not found'),

  invitationExpired: () =>
    createAppError('INVITATION_EXPIRED', 410, 'Invitation has expired'),

  insufficientPermissions: () =>
    createAppError(
      'INSUFFICIENT_PERMISSIONS',
      403,
      'You do not have permission to perform this action'
    ),

  // Team Assignments & Duties specific errors (T091)
  complianceViolation: (violations: any[]) =>
    createAppError(
      'VALIDATION_ERROR',
      400,
      'Assignment violates compliance rules',
      { violations }
    ),

  dutyAssignmentExists: (userId: string, dutyName: string) =>
    createAppError(
      'CONFLICT',
      409,
      `User ${userId} already has ${dutyName} duty assigned`
    ),

  invalidDuty: (dutyName: string) =>
    createAppError('NOT_FOUND', 404, `Duty "${dutyName}" not found in project`),

  userNotOnProject: (userId: string) =>
    createAppError(
      'NOT_FOUND',
      404,
      `User ${userId} is not a member of this project`
    ),

  teamManagerRequired: () =>
    createAppError(
      'FORBIDDEN',
      403,
      'Only Team Managers can perform this action'
    ),

  insufficientOverrideReason: () =>
    createAppError(
      'VALIDATION_ERROR',
      400,
      'Override reason must be at least 50 characters'
    ),

  noTeamMembersAvailable: (dutyName: string) =>
    createAppError(
      'INVALID_REQUEST',
      400,
      `No team members available for ${dutyName} duty`
    ),

  taskNotFound: (taskId: string) =>
    createAppError('NOT_FOUND', 404, `Task ${taskId} not found`),

  assignmentNotFound: (assignmentId: string) =>
    createAppError(
      'NOT_FOUND',
      404,
      `Assignment ${assignmentId} not found`
    ),

  dutyHasActiveAssignments: (dutyName: string, count: number) =>
    createAppError(
      'CONFLICT',
      409,
      `Cannot remove duty "${dutyName}" - has ${count} active assignment${count !== 1 ? 's' : ''}`
    ),

  cannotRemoveLastDuty: () =>
    createAppError(
      'CONFLICT',
      409,
      'Project must have at least one duty assigned'
    ),

  cannotRemoveStandardDuty: (dutyName: string) =>
    createAppError(
      'CONFLICT',
      409,
      `Cannot remove standard duty "${dutyName}" from project`
    ),
};
