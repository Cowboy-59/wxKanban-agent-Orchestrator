/**
 * Spec 028 / T014 — Role check for hosted-MCP token administration.
 *
 * Allows the caller through when ANY condition holds for the
 * `:projectid` route param:
 *
 *   1. `usertype === 'SYSADMIN'` (platform-wide admin — superset of ADMIN,
 *      no company-match check)
 *   2. `usertype === 'ADMIN'` AND the project belongs to the user's company
 *      (company-wide admins manage tokens for any project in their company)
 *   3. `userprofiles.id === companyprojects.userid` (the project's owner —
 *      "PROJECT_OWNER" per spec 028 FR-009, in this schema represented as
 *      the project row's `userid` column)
 *
 * Returns 403 otherwise. Must run after `authenticateToken`.
 */
import { Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { AuthRequest } from "./auth.js";
import { db } from "../../db/client.js";
import { companyprojects } from "../../db/schema/companyproject.js";
import { createLogger } from "../lib/logger.js";

const logger = createLogger("require-project-admin-or-owner");

export async function requireProjectAdminOrOwner(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const projectid = req.params.projectid;
  if (!projectid) {
    res.status(400).json({ error: "missing-projectid" });
    return;
  }
  const userid = req.userid;
  const companyid = req.companyid;
  if (!userid || !companyid) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const [project] = await db
    .select({ id: companyprojects.id, userid: companyprojects.userid, companyid: companyprojects.companyid })
    .from(companyprojects)
    .where(eq(companyprojects.id, projectid))
    .limit(1);

  if (!project) {
    res.status(404).json({ error: "project-not-found" });
    return;
  }

  const isSysAdmin = req.usertype === "SYSADMIN";
  const isCompanyAdmin = req.usertype === "ADMIN" && project.companyid === companyid;
  const isOwner = project.userid === userid;

  if (!isSysAdmin && !isCompanyAdmin && !isOwner) {
    logger.warn(
      { userid, projectid, usertype: req.usertype },
      "non-admin / non-owner attempted token admin action",
    );
    res.status(403).json({
      error: "This action requires SYSADMIN, ADMIN, or project-owner access.",
      roleRequired: "SYSADMIN, COMPANY_ADMIN, or PROJECT_OWNER",
    });
    return;
  }

  next();
}
