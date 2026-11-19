import { Router, Response } from 'express';
import { eq, and } from 'drizzle-orm';
import { db } from '~/db/client.js';
import { companyprojects } from '~/db/schema/companyproject.js';
import { authenticateToken, requireAuth, type AuthRequest } from '~/server/middleware/auth.js';
import { asyncHandler } from '~/server/middleware/errorHandler.js';
import { createLogger } from '~/server/lib/logger.js';
import { ProjectDocumentService } from '~/server/services/ProjectDocumentService.js';
import { ProjectLifecycleGenerator } from '~/server/services/ProjectLifecycleGenerator.js';
import { DevelopmentPlanGenerator } from '~/server/services/DevelopmentPlanGenerator.js';
import { MarkdownPdfRenderer } from '~/server/services/MarkdownPdfRenderer.js';

const router = Router();
const logger = createLogger('project-lifecycle-route');

const LIFECYCLE_DOCTYPE = 'ProjectLifecycle';
const LIFECYCLE_TITLE = 'Project Lifecycle';

// [SCOPE 081 / T010] Development Plan PDF — mirrors the ProjectLifecycle plumbing.
const DEVPLAN_DOCTYPE = 'DevelopmentPlan';
const DEVPLAN_TITLE = 'Development Plan';

async function assertProjectInCompany(
  projectid: string,
  companyid: string | undefined
): Promise<{ id: string; name: string } | null> {
  if (!companyid) return null;
  const [row] = await db
    .select({ id: companyprojects.id, name: companyprojects.name })
    .from(companyprojects)
    .where(and(eq(companyprojects.id, projectid), eq(companyprojects.companyid, companyid)))
    .limit(1);
  return row ?? null;
}

/**
 * GET /projects/:id/lifecycle
 * Serves the stored PDF inline so the browser's native PDF viewer renders it
 * (gives Print for free). 404 if no PDF has been generated yet.
 */
router.get(
  '/api/projects/:id/lifecycle',
  authenticateToken,
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const projectid = String(req.params.id);
    const project = await assertProjectInCompany(projectid, req.companyid);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const pdf = await ProjectDocumentService.getPdf(projectid, LIFECYCLE_DOCTYPE);
    if (!pdf) {
      res.status(404).json({
        error: 'Lifecycle PDF not yet generated for this project',
        hint: 'POST /api/admin/projects/:id/lifecycle/regenerate',
      });
      return;
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="lifecycle-${projectid}.pdf"`
    );
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.send(pdf.bytes);

    logger.info(
      { projectid, bytes: pdf.bytes.length, generatedat: pdf.generatedat.toISOString() },
      'Lifecycle PDF served'
    );
  })
);

/**
 * POST /api/admin/projects/:id/lifecycle/regenerate
 * Admin-only. Regenerates per-project lifecycle markdown + PDF and upserts
 * to projectdocuments.
 */
router.post(
  '/api/admin/projects/:id/lifecycle/regenerate',
  authenticateToken,
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (req.usertype !== 'ADMIN' && req.usertype !== 'SYSADMIN') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const projectid = String(req.params.id);
    const project = await assertProjectInCompany(projectid, req.companyid);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const result = await ProjectLifecycleGenerator.generate(projectid);
    const pdfBytes = await MarkdownPdfRenderer.renderToPdf(
      result.markdown,
      `${project.name} — Project Lifecycle`
    );

    await ProjectDocumentService.upsertDocumentWithPdf(
      projectid,
      LIFECYCLE_DOCTYPE,
      LIFECYCLE_TITLE,
      result.markdown,
      pdfBytes,
      req.userid ?? null
    );

    logger.info(
      { projectid, specCount: result.specCount, pdfbytes: pdfBytes.length },
      'Lifecycle regenerated'
    );

    res.json({
      success: true,
      projectid,
      projectName: result.projectName,
      specCount: result.specCount,
      markdownPath: result.outputPath,
      pdfBytes: pdfBytes.length,
    });
  })
);

// [SCOPE 081 / T010] BEGIN — serve the Development Plan PDF inline (mirror of GET lifecycle)
router.get(
  '/api/projects/:id/devplan',
  authenticateToken,
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const projectid = String(req.params.id);
    const project = await assertProjectInCompany(projectid, req.companyid);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const pdf = await ProjectDocumentService.getPdf(projectid, DEVPLAN_DOCTYPE);
    if (!pdf) {
      res.status(404).json({
        error: 'Development Plan PDF not yet generated for this project',
        hint: 'POST /api/admin/projects/:id/devplan/regenerate',
      });
      return;
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="devplan-${projectid}.pdf"`);
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.send(pdf.bytes);

    logger.info(
      { projectid, bytes: pdf.bytes.length, generatedat: pdf.generatedat.toISOString() },
      'Development Plan PDF served'
    );
  })
);
// [SCOPE 081 / T010] END

// [SCOPE 081 / T011] BEGIN — admin regenerate of the Development Plan markdown + PDF
router.post(
  '/api/admin/projects/:id/devplan/regenerate',
  authenticateToken,
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (req.usertype !== 'ADMIN' && req.usertype !== 'SYSADMIN') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const projectid = String(req.params.id);
    const project = await assertProjectInCompany(projectid, req.companyid);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const result = await DevelopmentPlanGenerator.generate(projectid);
    const pdfBytes = await MarkdownPdfRenderer.renderToPdf(
      result.markdown,
      `${project.name} — Development Plan`
    );

    await ProjectDocumentService.upsertDocumentWithPdf(
      projectid,
      DEVPLAN_DOCTYPE,
      DEVPLAN_TITLE,
      result.markdown,
      pdfBytes,
      req.userid ?? null
    );

    logger.info(
      { projectid, specCount: result.specCount, pdfbytes: pdfBytes.length },
      'Development Plan regenerated'
    );

    res.json({
      success: true,
      projectid,
      projectName: result.projectName,
      specCount: result.specCount,
      markdownPath: result.outputPath,
      pdfBytes: pdfBytes.length,
    });
  })
);
// [SCOPE 081 / T011] END

export default router;
