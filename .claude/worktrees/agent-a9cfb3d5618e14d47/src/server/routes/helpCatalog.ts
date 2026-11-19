// [SCOPE 084 / T003,T004] BEGIN — Subscription-aware Help catalog API
//
// Distinct from routes/help.ts (the SCOPE-044/066 articles/FAQ system). Paths are
// chosen to not collide with that router: GET /api/help/catalog + the admin
// regenerate under /api/admin/help. Mounted at "/" before /api/help.
import { Router, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '~/db/client.js';
import { companies } from '~/db/schema/company.js';
import { authenticateToken, requireAuth, type AuthRequest } from '~/server/middleware/auth.js';
import { asyncHandler } from '~/server/middleware/errorHandler.js';
import { createLogger } from '~/server/lib/logger.js';
import { PLANS, HELP_FEATURES, CATEGORIES, billingPlanToPublicPlan, type PlanId } from '~/shared/help/catalog.js';
import { regenerateAllHelpDocs } from '~/server/services/HelpGenerator.js';

const router = Router();
const logger = createLogger('help-catalog-route');

/**
 * GET /api/help/catalog
 * Returns the Help catalog plus the authenticated viewer's public plan, so the
 * in-app Help page can default its tier selector to the viewer's plan.
 */
router.get(
  '/api/help/catalog',
  authenticateToken,
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    let plan: PlanId = 'SINGLE_USER';
    if (req.companyid) {
      const [company] = await db
        .select({ billingplan: companies.billingplan })
        .from(companies)
        .where(eq(companies.id, req.companyid))
        .limit(1);
      plan = billingPlanToPublicPlan(company?.billingplan);
    }

    res.setHeader('Cache-Control', 'private, max-age=60');
    res.json({ plan, plans: PLANS, categories: CATEGORIES, features: HELP_FEATURES });
  }),
);

/**
 * POST /api/admin/help/regenerate
 * Admin-only. Regenerates the doctype='help' markdown and upserts it as the
 * single canonical Help row on the given project. Body: { projectId }.
 */
router.post(
  '/api/admin/help/regenerate',
  authenticateToken,
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (req.usertype !== 'ADMIN' && req.usertype !== 'SYSADMIN') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }
    const projectId = String((req.body as { projectId?: string })?.projectId ?? '').trim();
    if (!projectId) {
      res.status(400).json({ error: 'projectId is required' });
      return;
    }

    // Generate the stored doc for all six locales (English + fr/es/it/de/pt).
    const results = await regenerateAllHelpDocs(projectId, req.userid ?? null);
    const totalChars = results.reduce((n, r) => n + r.chars, 0);
    logger.info({ projectId, locales: results.length, totalChars }, 'Help documents regenerated via API');
    res.json({ success: true, projectId, locales: results.map((r) => r.locale), results });
  }),
);

export default router;
// [SCOPE 084 / T003,T004] END
