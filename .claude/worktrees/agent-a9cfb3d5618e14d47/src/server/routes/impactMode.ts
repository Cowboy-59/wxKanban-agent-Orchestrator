/**
 * The project owner's Change Impact mode — SCOPE-137 Amendment A (FR-007a).
 *
 *   GET /api/projects/:projectid/impact-mode   anyone with access to the project
 *   PUT /api/projects/:projectid/impact-mode   the project's owner or a company administrator
 *
 * The tenant gate runs first and answers 404, so another company's project is never confirmed;
 * the role check then answers 403 (requireProjectAdminOrOwner). Every change is appended as an
 * impact_mode_set event.
 */
import { Router, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { authenticateToken, requireAuth, AuthRequest } from "~/server/middleware/auth.js";
import { validateParams } from "~/server/middleware/validation.js";
import { asyncHandler } from "~/server/middleware/errorHandler.js";
import { requireProjectAdminOrOwner } from "~/server/middleware/requireProjectAdminOrOwner.js";
import { ProjectService } from "~/server/services/ProjectService.js";
import { IMPACT_MODES, ImpactModeService } from "~/server/services/ImpactModeService.js";
import { db } from "~/db/client.js";
import { companyprojects } from "~/db/schema/companyproject.js";
import { createLogger } from "~/server/lib/logger.js";

const router = Router();
const logger = createLogger("impact-mode-routes");

const paramsSchema = z.object({ projectid: z.string().uuid() });
const bodySchema = z.object({ mode: z.enum(IMPACT_MODES) });

// [SCOPE 137 / T019] BEGIN — Tenant gate and the owner-or-admin test for impactMode (FR-007a)
async function tenantGate(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const { companyid } = req;
  if (!companyid) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  // [SOC 2 CC6.1 — H-2] Same tenant gate as the projects router; 404 so existence is not confirmed.
  if (!(await ProjectService.canAccessProjectTenant(String(req.params.projectid), companyid))) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  next();
}

/** The same rule requireProjectAdminOrOwner enforces, answered as a flag for the UI. */
async function canChange(req: AuthRequest, projectid: string): Promise<boolean> {
  const [project] = await db
    .select({ userid: companyprojects.userid, companyid: companyprojects.companyid })
    .from(companyprojects)
    .where(eq(companyprojects.id, projectid))
    .limit(1);
  if (!project) return false;
  return (
    req.usertype === "SYSADMIN" ||
    (req.usertype === "ADMIN" && project.companyid === req.companyid) ||
    project.userid === req.userid
  );
}
// [SCOPE 137 / T019] END

// [SCOPE 137 / T019] BEGIN — GET the project's owner-set impactMode
router.get(
  "/:projectid/impact-mode",
  authenticateToken,
  requireAuth,
  validateParams(paramsSchema),
  tenantGate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { projectid } = paramsSchema.parse(req.params);
    const impactMode = await ImpactModeService.get(projectid);
    res.status(200).json({ impactMode, modes: IMPACT_MODES, canChange: await canChange(req, projectid) });
  }),
);
// [SCOPE 137 / T019] END

// [SCOPE 137 / T019] BEGIN — PUT a new impactMode (owner or company administrator only)
router.put(
  "/:projectid/impact-mode",
  authenticateToken,
  requireAuth,
  validateParams(paramsSchema),
  tenantGate,
  requireProjectAdminOrOwner,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { projectid } = paramsSchema.parse(req.params);
    const body = bodySchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: `mode must be one of ${IMPACT_MODES.join(", ")}` });
      return;
    }
    const userid = String(req.userid);
    const result = await ImpactModeService.set(projectid, body.data.mode, { userid, label: req.email ?? userid });
    logger.info({ projectid, mode: body.data.mode, changed: result.changed }, "[impact-mode] set");
    res.status(200).json({ impactMode: result.current, changed: result.changed });
  }),
);
// [SCOPE 137 / T019] END

export default router;
