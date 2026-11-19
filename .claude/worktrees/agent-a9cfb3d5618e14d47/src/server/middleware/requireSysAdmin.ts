import { Response, NextFunction } from "express";
import { AuthRequest } from "./auth.js";
import { createLogger } from "../lib/logger.js";

const logger = createLogger("require-sysadmin-middleware");

/**
 * Middleware that restricts an endpoint to SYSADMIN users only.
 * ADMIN, TEAM_MANAGER, and TEAM_MEMBER receive 403.
 *
 * Must be used after authenticateToken.
 *
 * Usage: router.get("/companies", authenticateToken, requireSysAdmin, handler)
 */
export function requireSysAdmin(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): void {
  // [SCOPE 146 / T005] MODIFIED-BY — the denial record names the method, so a denied DELETE is distinguishable from a GET
  if (req.usertype !== "SYSADMIN") {
    logger.warn(
      { userid: req.userid, usertype: req.usertype, method: req.method, path: `${req.baseUrl}${req.path}` },
      "SysAdmin-only endpoint accessed by non-sysadmin",
    );
    res.status(403).json({
      error: "This action requires System Administrator access.",
      roleRequired: "SYSADMIN",
      currentRole: req.usertype,
    });
    return;
  }

  next();
}
