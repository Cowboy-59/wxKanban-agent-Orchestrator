import { Router, Response } from 'express';
import { eq, and } from 'drizzle-orm';
import { db } from '~/db/client.js';
import { companyprojects } from '~/db/schema/companyproject.js';
import { authenticateToken, requireAuth, type AuthRequest } from '~/server/middleware/auth.js';
import { asyncHandler } from '~/server/middleware/errorHandler.js';
import { createLogger } from '~/server/lib/logger.js';
import { ProjectDocumentService } from '~/server/services/ProjectDocumentService.js';
import { ProjectLearningsGenerator } from '~/server/services/ProjectLearningsGenerator.js';
import { MarkdownPdfRenderer } from '~/server/services/MarkdownPdfRenderer.js';

const router = Router();
const logger = createLogger('project-learnings-route');

const LEARNINGS_DOCTYPE = 'CompoundLearnings';
const LEARNINGS_TITLE = 'Project Learnings';

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
 * GET /api/projects/:id/learnings/pdf
 * Serves the stored learnings PDF inline for browser rendering.
 * 404 if no PDF has been generated yet.
 */
router.get(
  '/api/projects/:id/learnings/pdf',
  authenticateToken,
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const projectid = String(req.params.id);
    const project = await assertProjectInCompany(projectid, req.companyid);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const pdf = await ProjectDocumentService.getPdf(projectid, LEARNINGS_DOCTYPE);
    if (!pdf) {
      res.status(404).json({
        error: 'Learnings PDF not yet generated for this project',
        hint: 'POST /api/admin/projects/:id/learnings/regenerate',
      });
      return;
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="learnings-${projectid}.pdf"`);
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.send(pdf.bytes);

    logger.info(
      { projectid, bytes: pdf.bytes.length, generatedat: pdf.generatedat.toISOString() },
      'Learnings PDF served'
    );
  })
);

/**
 * POST /api/admin/projects/:id/learnings/regenerate
 * Admin-only. Compiles all CompoundLearning docs into a consolidated report PDF.
 */
router.post(
  '/api/admin/projects/:id/learnings/regenerate',
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

    const result = await ProjectLearningsGenerator.generate(projectid);
    const pdfBytes = await MarkdownPdfRenderer.renderToPdf(
      result.markdown,
      `${project.name} — Project Learnings`
    );

    await ProjectDocumentService.upsertDocumentWithPdf(
      projectid,
      LEARNINGS_DOCTYPE,
      LEARNINGS_TITLE,
      result.markdown,
      pdfBytes,
      req.userid ?? null
    );

    logger.info(
      { projectid, docCount: result.docCount, pdfbytes: pdfBytes.length },
      'Learnings PDF regenerated'
    );

    res.json({
      success: true,
      projectid,
      projectName: result.projectName,
      docCount: result.docCount,
      pdfBytes: pdfBytes.length,
    });
  })
);

export default router;
