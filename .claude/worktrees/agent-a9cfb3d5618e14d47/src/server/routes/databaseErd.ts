import { Router, Response } from 'express';
import { authenticateToken, requireAuth, type AuthRequest } from '~/server/middleware/auth.js';
import { asyncHandler } from '~/server/middleware/errorHandler.js';
import { createLogger } from '~/server/lib/logger.js';
import { ErDiagramGenerator } from '~/server/services/ErDiagramGenerator.js';

const router = Router();
const logger = createLogger('database-erd-route');

function isAdmin(req: AuthRequest): boolean {
  return req.usertype === 'ADMIN' || req.usertype === 'SYSADMIN';
}

// [SCOPE 021 / T013] BEGIN — Serve the platform-wide ER Diagram PDF inline
/**
 * GET /api/admin/database/erdiagram
 * Serves the single global ER-diagram PDF inline. Admin/SysAdmin only. 404 if not generated.
 */
router.get(
  '/api/admin/database/erdiagram',
  authenticateToken,
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!isAdmin(req)) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }
    const stored = await ErDiagramGenerator.getStoredPdf();
    if (!stored) {
      res.status(404).json({
        error: 'ER diagram not yet generated',
        hint: 'POST /api/admin/database/erdiagram/regenerate',
      });
      return;
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="database-erdiagram.pdf"');
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.send(stored.pdf);
    logger.info({ bytes: stored.pdf.length }, 'ER diagram PDF served');
  })
);
// [SCOPE 021 / T013] END

// [SCOPE 021 / T017] BEGIN — Serve the ER Diagram markdown for inline (SVG) rendering
/**
 * GET /api/admin/database/erdiagram/markdown
 * Returns the stored markdown (with ```mermaid``` fences) so the viewer can render the
 * diagrams inline as SVG — browsers force-download application/pdf, markdown does not.
 */
router.get(
  '/api/admin/database/erdiagram/markdown',
  authenticateToken,
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!isAdmin(req)) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }
    const stored = await ErDiagramGenerator.getStoredMarkdown();
    if (!stored) {
      res.status(404).json({ error: 'ER diagram not yet generated' });
      return;
    }
    res.json({ markdown: stored.markdown, generatedat: stored.generatedat });
  })
);
// [SCOPE 021 / T017] END

// [SCOPE 021 / T014] BEGIN — Regenerate the platform-wide ER Diagram
/**
 * POST /api/admin/database/erdiagram/regenerate
 * Admin/SysAdmin only. Introspects the live schema, renders PDF, upserts the global doc.
 */
router.post(
  '/api/admin/database/erdiagram/regenerate',
  authenticateToken,
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!isAdmin(req)) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }
    const { id, bytes } = await ErDiagramGenerator.generateAndStore(req.userid ?? undefined);
    logger.info({ id, bytes }, 'ER diagram regenerated');
    res.json({ success: true, id, pdfBytes: bytes });
  })
);
// [SCOPE 021 / T014] END

export default router;
