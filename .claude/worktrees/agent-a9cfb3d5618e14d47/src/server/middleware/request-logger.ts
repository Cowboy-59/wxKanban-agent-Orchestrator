/**
 * Request Logger Middleware
 * Feature 002: Structured logging for all HTTP requests and responses
 *
 * Uses Pino for JSON logging with request/response tracking
 */

import { Request, Response, NextFunction } from 'express';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('http');

/**
 * Request ID for tracing requests through the system
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Log HTTP request and response
 * Measures request duration and logs details
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  // Generate unique request ID
  const requestId = generateRequestId();
  const startTime = Date.now();

  // Attach request ID to response locals for easy access in handlers
  res.locals.requestId = requestId;

  // Log incoming request
  logger.info(
    {
      requestId,
      method: req.method,
      path: req.path,
      query: req.query,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      userId: (req as any).user?.userid,
      companyId: (req as any).user?.companyid,
    },
    `${req.method} ${req.path}`
  );

  // Intercept response to log it
  const originalSend = res.send;

  res.send = function (data: any) {
    const duration = Date.now() - startTime;

    // Log response
    logger.info(
      {
        requestId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        userId: (req as any).user?.userid,
        companyId: (req as any).user?.companyid,
      },
      `${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`
    );

    // For error responses, log additional details
    if (res.statusCode >= 400) {
      logger.warn(
        {
          requestId,
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          duration: `${duration}ms`,
          body: typeof data === 'string' ? data : JSON.stringify(data),
        },
        `Error: ${req.method} ${req.path} - ${res.statusCode}`
      );
    }

    // Call original send
    return originalSend.call(this, data);
  };

  next();
}

/**
 * Log slow requests (> threshold)
 */
export function slowRequestLogger(thresholdMs: number = 1000) {
  return (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();

    // Intercept response
    const originalSend = res.send;

    res.send = function (data: any) {
      const duration = Date.now() - startTime;

      if (duration > thresholdMs) {
        logger.warn(
          {
            method: req.method,
            path: req.path,
            duration: `${duration}ms`,
            threshold: `${thresholdMs}ms`,
            statusCode: res.statusCode,
            userId: (req as any).user?.userid,
          },
          `Slow request: ${req.method} ${req.path} took ${duration}ms`
        );
      }

      return originalSend.call(this, data);
    };

    next();
  };
}

/**
 * Log request body for debugging (be careful with sensitive data)
 */
export function bodyLogger(req: Request, _res: Response, next: NextFunction): void {
  if (req.body && Object.keys(req.body).length > 0) {
    // Don't log sensitive fields
    const sensitiveFields = ['password', 'passwordhash', 'token', 'secret', 'key'];
    const sanitized = { ...req.body };

    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    }

    logger.debug(
      {
        method: req.method,
        path: req.path,
        body: sanitized,
      },
      `Request body: ${req.method} ${req.path}`
    );
  }

  next();
}

/**
 * Log API errors with context
 */
export function errorLogger(req: Request, res: Response, next: NextFunction): void {
  // Capture any error from previous middleware
  if ((req as any).error) {
    const error = (req as any).error;

    logger.error(
      {
        error: error.message,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        userId: (req as any).user?.userid,
        companyId: (req as any).user?.companyid,
        stack: error.stack,
      },
      `API Error: ${error.message}`
    );
  }

  next();
}

/**
 * Log database queries (when called from query helpers)
 */
export function queryLogger(query: string, params?: unknown[], duration?: number) {
  // Only log in development or if query is slow (> 100ms)
  if (process.env.NODE_ENV === 'development' || (duration && duration > 100)) {
    logger.debug(
      {
        query,
        params,
        duration: duration ? `${duration}ms` : undefined,
      },
      'Database query'
    );
  }
}

/**
 * Log authentication events
 */
export function authLogger(event: string, data: Record<string, unknown>) {
  const level = event.includes('failed') || event.includes('error') ? 'warn' : 'info';

  logger.log(
    {
      level,
      event,
      ...data,
    },
    `Auth event: ${event}`
  );
}

/**
 * Log company changes for audit trail
 */
export function auditLogger(action: string, companyId: string, userId: string, data: Record<string, unknown>) {
  logger.info(
    {
      action,
      companyId,
      userId,
      ...data,
    },
    `Audit: ${action} in company ${companyId}`
  );
}
