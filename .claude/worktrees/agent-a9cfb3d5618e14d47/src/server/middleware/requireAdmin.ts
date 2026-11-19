import { Response, NextFunction } from "express";
import { AuthRequest } from "./auth.js";
import { createLogger } from "../lib/logger.js";

const logger = createLogger("require-admin-middleware");

/**
 * Middleware that restricts an endpoint to ADMIN users only.
 * TEAM_MANAGER and TEAM_MEMBER receive 403.
 *
 * Must be used after authenticateToken.
 *
 * Usage: router.post("/company/:id/verify", authenticateToken, requireAdmin, handler)
 */
export function requireAdmin(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): void {
  if (req.usertype !== "ADMIN") {
    logger.warn(
      { userid: req.userid, usertype: req.usertype },
      "Admin-only endpoint accessed by non-admin",
    );
    res.status(403).json({
      error: "This action requires Administrator access.",
      roleRequired: "ADMIN",
    });
    return;
  }

  next();
}
