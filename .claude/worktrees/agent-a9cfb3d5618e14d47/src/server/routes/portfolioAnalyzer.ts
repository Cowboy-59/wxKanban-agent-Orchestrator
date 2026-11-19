// [SCOPE 075 / T4,6] BEGIN — Portfolio Analyzer routes: cross-project search, report PDF, regenerate.
import { Router, Response } from "express";
import { eq, and } from "drizzle-orm";
import { db } from "~/db/client.js";
import { companyprojects } from "~/db/schema/companyproject.js";
import { authenticateToken, requireAuth, type AuthRequest } from "~/server/middleware/auth.js";
import { asyncHandler } from "~/server/middleware/errorHandler.js";
import { createLogger } from "~/server/lib/logger.js";
import { ProjectDocumentService } from "~/server/services/ProjectDocumentService.js";
import { searchCompanyCapabilities, synthesizeSearch } from "~/server/services/PortfolioCapabilityService.js";
import { generatePortfolioAnalysis } from "~/server/services/PortfolioAnalysisGenerator.js";

const router = Router();
const logger = createLogger("portfolio-analyzer-route");
const DOCTYPE = "PortfolioAnalysis";

async function projectInCompany(projectid: string, companyid: string | undefined): Promise<{ id: string; name: string } | null> {
  if (!companyid) return null;
  const [row] = await db
    .select({ id: companyprojects.id, name: companyprojects.name })
    .from(companyprojects)
    .where(and(eq(companyprojects.id, projectid), eq(companyprojects.companyid, companyid)))
    .limit(1);
  return row ?? null;
}

/**
 * POST /api/projects/:id/portfolio/search  { query, topK? }
 * Company-wide capability reuse search (SCOPE-074 index across the caller's company's projects).
 */
router.post(
  "/api/projects/:id/portfolio/search",
  authenticateToken,
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const projectid = String(req.params.id);
    if (!(await projectInCompany(projectid, req.companyid))) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    const query = String((req.body?.query ?? "")).trim();
    if (!query) {
      res.status(400).json({ error: "query is required" });
      return;
    }
    const topK = Number.isFinite(req.body?.topK) ? Number(req.body.topK) : 10;
    const matches = await searchCompanyCapabilities(req.companyid!, query, { topK });
    const synthesis = await synthesizeSearch(query, matches);
    res.json({ matches, synthesis });
  })
);

/**
 * GET /api/projects/:id/portfolio  — serve the PortfolioAnalysis PDF inline. 404 empty-state.
 */
router.get(
  "/api/projects/:id/portfolio",
  authenticateToken,
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const projectid = String(req.params.id);
    if (!(await projectInCompany(projectid, req.companyid))) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    const pdf = await ProjectDocumentService.getPdf(projectid, DOCTYPE);
    if (!pdf) {
      res.status(404).json({ error: "Portfolio analysis not generated yet", hint: "POST /api/admin/projects/:id/portfolio/regenerate" });
      return;
    }
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="portfolio-${projectid}.pdf"`);
    res.setHeader("Cache-Control", "private, max-age=60");
    res.send(pdf.bytes);
  })
);

/**
 * POST /api/admin/projects/:id/portfolio/regenerate — admin-only. Generates the report from the
 * company's capability index, renders the PDF, upserts. (Search works without this.)
 */
router.post(
  "/api/admin/projects/:id/portfolio/regenerate",
  authenticateToken,
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (req.usertype !== "ADMIN" && req.usertype !== "SYSADMIN") {
      res.status(403).json({ error: "Admin access required" });
      return;
    }
    const projectid = String(req.params.id);
    const project = await projectInCompany(projectid, req.companyid);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    const result = await generatePortfolioAnalysis(req.companyid!, projectid, req.userid ?? null);
    logger.info({ projectid, ...result }, "Portfolio analysis regenerated");
    res.json({ success: true, projectid, ...result });
  })
);

export default router;
// [SCOPE 075 / T4,6] END
