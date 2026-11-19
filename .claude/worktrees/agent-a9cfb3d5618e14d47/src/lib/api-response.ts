/**
 * Standard API Response Envelope
 * Provides consistent response format across all endpoints
 *
 * Feature 002: API standardization for company, billing, user management
 */

import { Response } from 'express';

/**
 * Success response envelope
 */
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  message?: string;
  timestamp: string;
}

/**
 * Error response envelope
 */
export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  timestamp: string;
}

/**
 * Paginated response envelope
 */
export interface ApiPaginatedResponse<T> {
  success: true;
  data: T[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
  timestamp: string;
}

/**
 * Send success response
 */
export function sendSuccess<T>(
  res: Response,
  data: T,
  statusCode: number = 200,
  message?: string
): Response {
  const response: ApiSuccessResponse<T> = {
    success: true,
    data,
    ...(message && { message }),
    timestamp: new Date().toISOString(),
  };

  return res.status(statusCode).json(response);
}

/**
 * Send paginated response
 */
export function sendPaginated<T>(
  res: Response,
  data: T[],
  total: number,
  limit: number,
  offset: number,
  statusCode: number = 200
): Response {
  const response: ApiPaginatedResponse<T> = {
    success: true,
    data,
    pagination: {
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    },
    timestamp: new Date().toISOString(),
  };

  return res.status(statusCode).json(response);
}

/**
 * Send error response
 */
export function sendError(
  res: Response,
  code: string,
  message: string,
  statusCode: number = 400,
  details?: Record<string, unknown>
): Response {
  const response: ApiErrorResponse = {
    success: false,
    error: {
      code,
      message,
      ...(details && { details }),
    },
    timestamp: new Date().toISOString(),
  };

  return res.status(statusCode).json(response);
}

/**
 * Common error codes
 */
export const ErrorCode = {
  // 4xx Client Errors
  INVALID_REQUEST: 'INVALID_REQUEST',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',

  // 5xx Server Errors
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  DATABASE_ERROR: 'DATABASE_ERROR',

  // Domain-Specific
  COMPANY_NOT_FOUND: 'COMPANY_NOT_FOUND',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  PROJECT_NOT_FOUND: 'PROJECT_NOT_FOUND',
  INVOICE_NOT_FOUND: 'INVOICE_NOT_FOUND',
  INVITATION_EXPIRED: 'INVITATION_EXPIRED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  COMPANY_DEACTIVATED: 'COMPANY_DEACTIVATED',
  USER_DEACTIVATED: 'USER_DEACTIVATED',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  EMAIL_NOT_FOUND: 'EMAIL_NOT_FOUND',
} as const;

/**
 * HTTP status code mapping
 */
export const ErrorStatus: Record<string, number> = {
  [ErrorCode.INVALID_REQUEST]: 400,
  [ErrorCode.VALIDATION_ERROR]: 400,
  [ErrorCode.UNAUTHORIZED]: 401,
  [ErrorCode.FORBIDDEN]: 403,
  [ErrorCode.NOT_FOUND]: 404,
  [ErrorCode.CONFLICT]: 409,
  [ErrorCode.RATE_LIMITED]: 429,
  [ErrorCode.INTERNAL_ERROR]: 500,
  [ErrorCode.SERVICE_UNAVAILABLE]: 503,
  [ErrorCode.DATABASE_ERROR]: 500,
  [ErrorCode.COMPANY_NOT_FOUND]: 404,
  [ErrorCode.USER_NOT_FOUND]: 404,
  [ErrorCode.PROJECT_NOT_FOUND]: 404,
  [ErrorCode.INVOICE_NOT_FOUND]: 404,
  [ErrorCode.INVITATION_EXPIRED]: 410,
  [ErrorCode.INVALID_CREDENTIALS]: 401,
  [ErrorCode.COMPANY_DEACTIVATED]: 403,
  [ErrorCode.USER_DEACTIVATED]: 403,
  [ErrorCode.INSUFFICIENT_PERMISSIONS]: 403,
  [ErrorCode.EMAIL_NOT_FOUND]: 404,
};

/**
 * Get HTTP status code for error code
 */
export function getStatusCode(code: string, defaultStatus: number = 500): number {
  return ErrorStatus[code] || defaultStatus;
}

/**
 * Helper to send common errors
 */
export const sendErrors = {
  badRequest: (res: Response, message: string = 'Bad request') =>
    sendError(res, ErrorCode.INVALID_REQUEST, message, 400),

  validation: (res: Response, message: string, details?: Record<string, unknown>) =>
    sendError(res, ErrorCode.VALIDATION_ERROR, message, 400, details),

  unauthorized: (res: Response, message: string = 'Unauthorized') =>
    sendError(res, ErrorCode.UNAUTHORIZED, message, 401),

  forbidden: (res: Response, message: string = 'Forbidden') =>
    sendError(res, ErrorCode.FORBIDDEN, message, 403),

  notFound: (res: Response, resource: string) =>
    sendError(res, ErrorCode.NOT_FOUND, `${resource} not found`, 404),

  conflict: (res: Response, message: string) =>
    sendError(res, ErrorCode.CONFLICT, message, 409),

  rateLimited: (res: Response) =>
    sendError(res, ErrorCode.RATE_LIMITED, 'Too many requests, please try again later', 429),

  internal: (res: Response, message: string = 'Internal server error') =>
    sendError(res, ErrorCode.INTERNAL_ERROR, message, 500),

  companyNotFound: (res: Response) =>
    sendError(res, ErrorCode.COMPANY_NOT_FOUND, 'Company not found', 404),

  userNotFound: (res: Response) =>
    sendError(res, ErrorCode.USER_NOT_FOUND, 'User not found', 404),

  projectNotFound: (res: Response) =>
    sendError(res, ErrorCode.PROJECT_NOT_FOUND, 'Project not found', 404),

  invitationExpired: (res: Response) =>
    sendError(res, ErrorCode.INVITATION_EXPIRED, 'Invitation has expired', 410),

  insufficientPermissions: (res: Response) =>
    sendError(
      res,
      ErrorCode.INSUFFICIENT_PERMISSIONS,
      'You do not have permission to perform this action',
      403
    ),
};
