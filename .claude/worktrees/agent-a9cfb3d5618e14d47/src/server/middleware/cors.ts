import cors, { CorsOptions } from "cors";
import { Request, Response, NextFunction } from "express";
import { config } from "~/server/config";
import { logger } from "~/server/lib/logger";

/**
 * CORS Configuration middleware
 * Handles Cross-Origin Resource Sharing for frontend-backend communication
 *
 * Allows:
 * - Frontend requests from CLIENT_URL
 * - Credentials (cookies with httpOnly tokens)
 * - Required headers (Content-Type, Authorization, etc.)
 * - Preflight requests (OPTIONS)
 *
 * Rejects:
 * - Requests from unauthorized origins
 * - Requests without proper credentials
 */

/**
 * Get allowed origins based on environment
 */
function getAllowedOrigins(): string[] {
  const origins = [config.CLIENT_URL];

  // Allow localhost variations in development
  if (config.NODE_ENV === "development") {
    origins.push(
      "http://localhost:3000",
      "http://localhost:5173", // Vite default
      "http://127.0.0.1:3000",
      "http://127.0.0.1:5173"
    );
  }

  // Allow staging in non-production
  if (config.NODE_ENV !== "production") {
    origins.push("http://staging.localhost:3000");
  }

  return origins;
}

/**
 * CORS options configuration
 */
const corsOptions: CorsOptions = {
  origin: (requestOrigin, callback) => {
    const allowedOrigins = getAllowedOrigins();

    if (!requestOrigin) {
      // Allow requests with no origin (like mobile apps or curl requests)
      return callback(null, true);
    }

    if (allowedOrigins.includes(requestOrigin)) {
      callback(null, true);
    } else {
      logger.warn(
        { origin: requestOrigin },
        "CORS request from unauthorized origin"
      );
      callback(new Error("Not allowed by CORS"));
    }
  },

  // Allow credentials (cookies, authorization headers)
  credentials: true,

  // Allowed HTTP methods
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],

  // Allowed request headers
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "Accept",
    "Origin",
    "X-CSRF-Token",
    "X-API-Key",
  ],

  // Headers exposed to the frontend
  exposedHeaders: [
    "Content-Type",
    "X-Total-Count", // For pagination
    "X-Total-Pages",
    "X-Current-Page",
  ],

  // Cache preflight requests for 24 hours
  maxAge: 86400,

  // CORS preflight successful without credentials
  preflightContinue: false,
};

/**
 * CORS middleware handler
 */
export function corsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const corsHandler = cors(corsOptions);
  corsHandler(req, res, next);
}

/**
 * Express-compatible CORS middleware export
 */
export default cors(corsOptions);
