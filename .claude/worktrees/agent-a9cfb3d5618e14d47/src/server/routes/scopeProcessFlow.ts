import { Router, Response } from 'express';
import { eq, and } from 'drizzle-orm';
import { db } from '~/db/client.js';
import { companyprojects } from '~/db/schema/companyproject.js';
import { authenticateToken, requireAuth, type AuthRequest } from '~/server/middleware/auth.js';
import { asyncHandler } from '~/server/middleware/errorHandler.js';
import { createLogger } from '~/server/lib/logger.js';
import { ScopeProcessFlowGenerator } from '~/server/services/ScopeProcessFlowGenerator.js';
import { MarkdownPdfRenderer } from '~/server/services/MarkdownPdfRenderer.js';

const router = Router();
const logger = createLogger('scope-process-flow-route');

// Tenant guard — non-admins only reach process flows for their own company's projects.
async function projectInCompany(projectid: string, companyid: string | undefined): Promise<boolean> {
  if (!companyid) return false;
  const [row] = await db
    .select({ id: companyprojects.id })
    .from(companyprojects)
    .where(and(eq(companyprojects.id, projectid), eq(companyprojects.companyid, companyid)))
    .limit(1);
  return !!row;
}

// [SCOPE 059 / T005] BEGIN — Per-scope process-flow read + regenerate routes
/**
 * GET /api/projects/:projectId/specs/:specId/process-flow
 * Returns the stored process-flow markdown (two ```mermaid``` sections) for the viewer.
 */
router.get(
  '/api/projects/:projectId/specs/:specId/process-flow',
  authenticateToken,
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const projectId = String(req.params.projectId);
    const specId = String(req.params.specId);
    if (!(await projectInCompany(projectId, req.companyid))) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    // Task flow is rebuilt live on every view (always current); AI flow comes from the
    // stored doc if present. Returns 404 only when the spec itself doesn't exist.
    const markdown = await ScopeProcessFlowGenerator.renderCurrent(specId);
    if (markdown === null) {
      res.status(404).json({ error: 'Spec not found' });
      return;
    }
    res.json({ markdown });
  }),
);

/**
 * GET /api/projects/:projectId/specs/:specId/process-flow/pdf
 * Renders the current process flow (task flow + AI flow) to a PDF for download/print.
 */
router.get(
  '/api/projects/:projectId/specs/:specId/process-flow/pdf',
  authenticateToken,
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const projectId = String(req.params.projectId);
    const specId = String(req.params.specId);
    if (!(await projectInCompany(projectId, req.companyid))) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    const markdown = await ScopeProcessFlowGenerator.renderCurrent(specId);
    if (markdown === null) {
      res.status(404).json({ error: 'Spec not found' });
      return;
    }
    const pdf = await MarkdownPdfRenderer.renderToPdf(markdown, 'Scope Process Flow');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="process-flow-${specId}.pdf"`);
    res.send(pdf);
  }),
);

/**
 * POST /api/projects/:projectId/specs/:specId/process-flow/regenerate?part=ai|tasks|all
 * Regenerates the requested part(s). Default part=ai (the deterministic task flow refreshes
 * automatically on task change; the AI flow is on-demand).
 */
router.post(
  '/api/projects/:projectId/specs/:specId/process-flow/regenerate',
  authenticateToken,
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const projectId = String(req.params.projectId);
    const specId = String(req.params.specId);
    if (!(await projectInCompany(projectId, req.companyid))) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    const part = String(req.query.part ?? 'ai');
    const parts = {
      tasks: part === 'tasks' || part === 'all',
      ai: part === 'ai' || part === 'all',
    };
    const result = await ScopeProcessFlowGenerator.generate(specId, parts, req.userid ?? null);
    if (!result) {
      res.status(404).json({ error: 'Spec not found' });
      return;
    }
    logger.info({ projectId, specId, parts }, 'Process flow regenerated');
    res.json({ success: true, ...result });
  }),
);

/**
 * GET /api/projects/:projectId/scope-flow-status
 * Spec-level doc-status: { [specId]: ISO timestamp | null } for the project-detail badges.
 */
router.get(
  '/api/projects/:projectId/scope-flow-status',
  authenticateToken,
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const projectId = String(req.params.projectId);
    if (!(await projectInCompany(projectId, req.companyid))) {
      res.json({ specs: {} });
      return;
    }
    const specs = await ScopeProcessFlowGenerator.statusForProject(projectId);
    res.json({ specs });
  }),
);
// [SCOPE 059 / T005] END

export default router;
