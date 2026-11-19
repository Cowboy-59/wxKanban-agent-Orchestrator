import { Router, Response } from "express";
import { and, eq, like } from "drizzle-orm";
import { db } from "../../db/client.js";
import { companyprojects } from "../../db/schema/companyproject.js";
import { projectspecifications } from "../../db/schema/projectspecification.js";
import {
  authenticateToken,
  requireAuth,
  AuthRequest,
} from "../middleware/auth.js";
import { projectInCompany } from "./projectTheme.js";
import { ScopeService } from "../services/ScopeService.js";
import { apiTokenService } from "../services/ApiTokenService.js";
import { createLogger } from "../lib/logger.js";
import {
  renderBugTrappingScope,
  BUG_TRAPPING_SEED_MARKER,
  BUG_TRAPPING_SEED_TITLE,
} from "../lib/bugTrappingScopeTemplate.js";

const router = Router();
const logger = createLogger("project-bug-trapping");

// [SCOPE 063 / T006] BEGIN — POST /api/projects/:id/bug-trapping/install
// Seeds the customer-facing bug-trapping scope into THIS project (any member),
// idempotently, and returns the project's error-ingest endpoint + a one-time
// token. The seeded scope drives the customer's own lifecycle; the token is the
// credential their app uses to post trapped errors back to this project.

function ingestEndpointFor(req: AuthRequest, projectId: string): string {
  const base =
    process.env["APP_PUBLIC_URL"] ||
    `${req.protocol}://${req.get("host") ?? "app.wxperts.com"}`;
  return `${base.replace(/\/$/, "")}/api/projects/${projectId}/errors`;
}

router.post(
  "/api/projects/:id/bug-trapping/install",
  authenticateToken,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const companyId = req.companyid;
    const userId = req.userid;
    if (!companyId || !userId) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const projectId = String(req.params.id);
    try {
      if (!(await projectInCompany(projectId, companyId))) {
        return res.status(404).json({ error: "Project not found" });
      }

      const [project] = await db
        .select({ name: companyprojects.name })
        .from(companyprojects)
        .where(eq(companyprojects.id, projectId))
        .limit(1);
      const projectName = project?.name ?? "this project";
      const ingestEndpoint = ingestEndpointFor(req, projectId);

      // Ensure an ingest token exists; cleartext returned only on a fresh mint.
      const { token } = await apiTokenService.getOrCreateToken(
        userId,
        companyId,
        projectId,
        "bug-trapping ingest",
      );

      // Idempotency: a prior install left a scope carrying the seed marker.
      const [existing] = await db
        .select({ specnumber: projectspecifications.specnumber })
        .from(projectspecifications)
        .where(
          and(
            eq(projectspecifications.projectid, projectId),
            like(projectspecifications.content, `%${BUG_TRAPPING_SEED_MARKER}%`),
          ),
        )
        .limit(1);

      if (existing) {
        logger.info({ projectId, specnumber: existing.specnumber }, "bug-trapping already installed");
        return res.json({
          alreadyInstalled: true,
          specnumber: existing.specnumber,
          ingestEndpoint,
          ingestToken: token || null, // empty when reusing an existing token
        });
      }

      const content = renderBugTrappingScope({ projectName, ingestEndpoint });
      const scope = await ScopeService.createScope(projectId, userId, {
        title: BUG_TRAPPING_SEED_TITLE,
        content,
      });

      logger.info({ projectId, specnumber: scope.specnumber }, "bug-trapping scope installed");
      return res.json({
        alreadyInstalled: false,
        specnumber: scope.specnumber,
        scopeId: scope.id,
        ingestEndpoint,
        ingestToken: token || null,
      });
    } catch (err) {
      logger.error({ err, projectId }, "Failed to install bug-trapping");
      return res.status(500).json({ error: "Failed to install bug-trapping" });
    }
  },
);
// [SCOPE 063 / T006] END

export default router;
