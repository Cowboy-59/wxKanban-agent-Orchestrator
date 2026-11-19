import { Router, Response } from 'express';
import { eq, and } from 'drizzle-orm';
import { db } from '~/db/client.js';
import { companyprojects } from '~/db/schema/companyproject.js';
import { authenticateToken, requireAuth, type AuthRequest } from '~/server/middleware/auth.js';
import { asyncHandler } from '~/server/middleware/errorHandler.js';
import { createLogger } from '~/server/lib/logger.js';
import { ScopeAnalysisService } from '~/server/services/ScopeAnalysisService.js';
import { MarkdownPdfRenderer } from '~/server/services/MarkdownPdfRenderer.js';

const router = Router();
const logger = createLogger('scope-analysis-route');

// Tenant guard — non-admins only reach analyses for their own company's projects.
async function projectInCompany(projectid: string, companyid: string | undefined): Promise<boolean> {
  if (!companyid) return false;
  const [row] = await db
    .select({ id: companyprojects.id })
    .from(companyprojects)
    .where(and(eq(companyprojects.id, projectid), eq(companyprojects.companyid, companyid)))
    .limit(1);
  return !!row;
}

// [SCOPE 060 / T011] BEGIN — Scope Analysis read + PDF routes (per-scope + project-wide)
/**
 * GET /api/projects/:projectId/specs/:specId/scope-analysis
 * Returns the stored per-scope analysis markdown for the viewer. 404 when none exists
 * (generation happens in VS Code via /analyzescope, not here).
 */
router.get(
  '/api/projects/:projectId/specs/:specId/scope-analysis',
  authenticateToken,
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const projectId = String(req.params.projectId);
    const specId = String(req.params.specId);
    if (!(await projectInCompany(projectId, req.companyid))) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    const stored = await ScopeAnalysisService.getForScope(projectId, specId);
    if (!stored) {
      res.status(404).json({ error: 'No scope analysis yet' });
      return;
    }
    res.json({ markdown: stored.content });
  }),
);

/**
 * GET /api/projects/:projectId/specs/:specId/scope-analysis/pdf
 * Renders the stored per-scope analysis to a PDF for download/print.
 */
router.get(
  '/api/projects/:projectId/specs/:specId/scope-analysis/pdf',
  authenticateToken,
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const projectId = String(req.params.projectId);
    const specId = String(req.params.specId);
    if (!(await projectInCompany(projectId, req.companyid))) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    const stored = await ScopeAnalysisService.getForScope(projectId, specId);
    if (!stored) {
      res.status(404).json({ error: 'No scope analysis yet' });
      return;
    }
    const pdf = await MarkdownPdfRenderer.renderToPdf(stored.content, 'Scope Analysis');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="scope-analysis-${specId}.pdf"`);
    res.send(pdf);
  }),
);

/**
 * GET /api/projects/:projectId/scope-analysis
 * Returns the stored project-wide (cross-scope) analysis markdown for the viewer.
 */
router.get(
  '/api/projects/:projectId/scope-analysis',
  authenticateToken,
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const projectId = String(req.params.projectId);
    if (!(await projectInCompany(projectId, req.companyid))) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    const stored = await ScopeAnalysisService.getForProject(projectId);
    if (!stored) {
      res.status(404).json({ error: 'No project scope analysis yet' });
      return;
    }
    res.json({ markdown: stored.content });
  }),
);

/**
 * GET /api/projects/:projectId/scope-analysis/pdf
 * Renders the stored project-wide analysis to a PDF.
 */
router.get(
  '/api/projects/:projectId/scope-analysis/pdf',
  authenticateToken,
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const projectId = String(req.params.projectId);
    if (!(await projectInCompany(projectId, req.companyid))) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    const stored = await ScopeAnalysisService.getForProject(projectId);
    if (!stored) {
      res.status(404).json({ error: 'No project scope analysis yet' });
      return;
    }
    const pdf = await MarkdownPdfRenderer.renderToPdf(stored.content, 'Project Scope Analysis');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="project-scope-analysis-${projectId}.pdf"`);
    res.send(pdf);
  }),
);

/**
 * GET /api/projects/:projectId/scope-analysis-status
 * Spec-level doc-status: { [specId]: ISO timestamp | null } for the project-detail badges.
 */
router.get(
  '/api/projects/:projectId/scope-analysis-status',
  authenticateToken,
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const projectId = String(req.params.projectId);
    if (!(await projectInCompany(projectId, req.companyid))) {
      res.json({ specs: {} });
      return;
    }
    const specs = await ScopeAnalysisService.statusForProject(projectId);
    logger.debug({ projectId }, 'scope-analysis-status served');
    res.json({ specs });
  }),
);
// [SCOPE 060 / T011] END

export default router;
