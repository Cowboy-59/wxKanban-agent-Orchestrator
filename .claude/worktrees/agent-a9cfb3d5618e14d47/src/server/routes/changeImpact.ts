/**
 * Change Impact agreement log — read-only route. SCOPE-137 / T014 (FR-013).
 *
 *   GET /api/projects/:id/scopes/:scopeid/change-impact
 *
 * GET only, by design: agreement records cannot be altered by the user, so this router has no
 * other verb (tests/unit/change-impact-log-immutable.test.ts). Mounted beside the projects
 * router, so it applies the same tenant gate itself.
 */
import { Router, Response } from "express";
import { z } from "zod";
import { authenticateToken, requireAuth, AuthRequest } from "~/server/middleware/auth.js";
import { validateParams } from "~/server/middleware/validation.js";
import { asyncHandler } from "~/server/middleware/errorHandler.js";
import { ProjectService } from "~/server/services/ProjectService.js";
import { ChangeImpactLogService } from "~/server/services/ChangeImpactLogService.js";
import { createLogger } from "~/server/lib/logger.js";

const router = Router();
const logger = createLogger("change-impact-routes");

const paramsSchema = z.object({ id: z.string().uuid(), scopeid: z.string().uuid() });

// [SCOPE 137 / T014] BEGIN — GET the scope's Change Impact agreement log (read-only)
router.get(
  "/:id/scopes/:scopeid/change-impact",
  authenticateToken,
  requireAuth,
  validateParams(paramsSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { companyid } = req;
    const { id, scopeid } = paramsSchema.parse(req.params);
    if (!companyid) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    // [SOC 2 CC6.1 — H-2] Same tenant gate as the projects router; 404 so existence is not confirmed.
    if (!(await ProjectService.canAccessProjectTenant(id, companyid))) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    const result = await ChangeImpactLogService.listForScope(id, scopeid);
    if (!result) {
      res.status(404).json({ error: "Scope not found" });
      return;
    }
    logger.info({ projectid: id, scope: result.scopeNumber, count: result.records.length }, "[change-impact] log read");
    res.status(200).json(result);
  }),
);
// [SCOPE 137 / T014] END

export default router;
