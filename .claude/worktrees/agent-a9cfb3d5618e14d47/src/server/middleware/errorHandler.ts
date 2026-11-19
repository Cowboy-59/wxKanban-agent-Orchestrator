import { Request, Response, NextFunction } from "express";
import { logger } from "~/server/lib/logger";
import { ZodError } from "zod";
import { ErrorCaptureService } from "~/server/services/ErrorCaptureService.js"; // [SCOPE 061]
import type { AuthRequest } from "~/server/middleware/auth.js"; // [SCOPE 061]

/**
 * Error handling middleware for consistent API error responses
 * Ensures all errors return standardized JSON with appropriate status codes
 * and logging for debugging
 */

/**
 * Standard API error response format
 */
export interface ErrorResponse {
  error: string; // User-facing error message
  code?: string; // Error code (optional)
  details?: Record<string, unknown>; // Additional details (optional)
  requestId?: string; // For tracing (optional)
}

/**
 * Custom application error class
 */
export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
    public code?: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "AppError";
  }
}

/**
 * Validation error class for schema validation failures
 */
export class ValidationError extends AppError {
  constructor(
    message: string = "Validation failed",
    public validationErrors?: Record<string, string[]>
  ) {
    super(message, 400, "VALIDATION_ERROR", { validationErrors });
    this.name = "ValidationError";
  }
}

/**
 * Authentication error class
 */
export class AuthenticationError extends AppError {
  constructor(message: string = "Authentication required") {
    super(message, 401, "AUTHENTICATION_ERROR");
    this.name = "AuthenticationError";
  }
}

/**
 * Authorization error class
 */
export class AuthorizationError extends AppError {
  constructor(message: string = "Access denied") {
    super(message, 403, "AUTHORIZATION_ERROR");
    this.name = "AuthorizationError";
  }
}

/**
 * Not found error class
 */
export class NotFoundError extends AppError {
  constructor(resource: string = "Resource") {
    super(`${resource} not found`, 404, "NOT_FOUND");
    this.name = "NotFoundError";
  }
}

/**
 * Conflict error class (duplicate entry, etc.)
 */
export class ConflictError extends AppError {
  constructor(message: string = "Resource already exists") {
    super(message, 409, "CONFLICT");
    this.name = "ConflictError";
  }
}

/**
 * Rate limit error class
 */
export class RateLimitError extends AppError {
  constructor(message: string = "Too many requests") {
    super(message, 429, "RATE_LIMIT_EXCEEDED");
    this.name = "RateLimitError";
  }
}

/**
 * Parse Zod validation errors into user-friendly format
 */
function parseZodError(error: ZodError): Record<string, string[]> {
  const errors: Record<string, string[]> = {};

  error.errors.forEach((issue) => {
    const path = issue.path.join(".");
    if (!errors[path]) {
      errors[path] = [];
    }
    errors[path].push(issue.message);
  });

  return errors;
}

/**
 * Main error handling middleware
 */
export function errorHandler(
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  let statusCode = 500;
  let message = "Internal server error";
  let code = "INTERNAL_SERVER_ERROR";
  let details: Record<string, unknown> | undefined;

  // Handle AppError instances
  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
    code = err.code || "APP_ERROR";
    details = err.details;

    // Log based on severity
    if (statusCode >= 500) {
      logger.error(
        { err, statusCode, code },
        "Application error (5xx)"
      );
    } else if (statusCode >= 400) {
      logger.warn(
        { statusCode, code, message },
        "Client error (4xx)"
      );
    }
  }
  // Handle Zod validation errors
  else if (err instanceof ZodError) {
    statusCode = 400;
    message = "Validation failed";
    code = "VALIDATION_ERROR";
    details = { validationErrors: parseZodError(err) };
    logger.warn({ details }, "Validation error");
  }
  // Handle standard Error instances
  else if (err instanceof Error) {
    // Map known error types
    const errorMessage = err.message.toLowerCase();

    if (
      errorMessage.includes("token") ||
      errorMessage.includes("unauthorized")
    ) {
      statusCode = 401;
      code = "AUTHENTICATION_ERROR";
    } else if (
      errorMessage.includes("forbidden") ||
      errorMessage.includes("permission")
    ) {
      statusCode = 403;
      code = "AUTHORIZATION_ERROR";
    } else if (errorMessage.includes("not found")) {
      statusCode = 404;
      code = "NOT_FOUND";
    } else if (errorMessage.includes("duplicate") ||
      errorMessage.includes("already exists")) {
      statusCode = 409;
      code = "CONFLICT";
    }

    message = err.message || "Internal server error";

    if (statusCode >= 500) {
      logger.error({ err }, "Unhandled error");
    } else {
      logger.warn({ message, statusCode, code }, "Error response");
    }
  }

  // [SCOPE 061] Capture 5xx server errors (best-effort, off the response path,
  // fail-open + non-recursive — capture swallows its own errors).
  if (statusCode >= 500) {
    void ErrorCaptureService.capture(
      {
        source: "server",
        kind: "serverHandler",
        name: err.name || "Error",
        message: err.message || message,
        stack: err.stack,
        route: req.originalUrl,
        status: statusCode,
      },
      { userId: (req as AuthRequest).userid ?? null },
    );
  }

  // Send consistent error response
  const response: ErrorResponse = {
    error: message,
    code,
  };

  if (details) {
    response.details = details;
  }

  res.status(statusCode).json(response);
}

/**
 * Async route wrapper to catch errors in async route handlers
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export default errorHandler;
