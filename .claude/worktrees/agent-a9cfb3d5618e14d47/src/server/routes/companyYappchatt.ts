/**
 * Company YappChatt account routes — SPEC-144 (SCOPE-144) T006, contract C3.
 *
 *   GET  /api/company/yappchatt   any signed-in company user: connected status, email, ids
 *   POST /api/company/yappchatt   ADMIN only. { confirm: false }: the account the button would
 *                                 link or create, nothing changed (D5). { confirm: true }: create
 *                                 or link the company account from the contact email, create
 *                                 the group, sync
 *
 * The company always comes from the user's JWT, never from the request (FR-002).
 * Mounted ahead of `companyRoutes`, whose GET /:id stub would otherwise answer GET /yappchatt.
 */
import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticateToken, requireAuth, AuthRequest } from '~/server/middleware/auth.js';
import { requireAdmin } from '~/server/middleware/requireAdmin.js';
import { companyYappchattService, CompanyYappchattError } from '~/server/services/CompanyYappchattService.js';
import { YappchattBrokerError } from '~/server/lib/yappchattBroker.js';
import { logger } from '~/server/lib/logger.js';

const router = Router();

// [SCOPE 144 / T006] BEGIN — company YappChatt routes (contract C3)
/** The broker's single "companion not available" code (contract C1, FR-011). */
const COMPANION_UNAVAILABLE_CODE = 'companion_unavailable';

const connectSchema = z.object({ confirm: z.boolean() }).strict();

function sendError(res: Response, err: unknown, what: string): Response {
  if (err instanceof CompanyYappchattError) {
    return res.status(err.status).json({ error: err.code, message: err.message, ...err.extra });
  }
  if (err instanceof YappchattBrokerError) {
    if (err.code === COMPANION_UNAVAILABLE_CODE) {
      return res.status(503).json({ error: COMPANION_UNAVAILABLE_CODE, message: 'YappChatt companion not available' });
    }
    if (err.code === 'invalid_email') {
      return res.status(400).json({ error: 'invalid_email', message: 'The company contact email is not a valid email address.' });
    }
    logger.warn({ code: err.code, status: err.status }, `${what}: YappChatt refused`);
    return res.status(502).json({ error: err.code, message: err.message, upstreamStatus: err.status });
  }
  logger.error({ err }, `${what} failed`);
  return res.status(500).json({ error: `${what} failed` });
}

router.get('/', authenticateToken, requireAuth, async (req: AuthRequest, res: Response) => {
  const companyId = req.companyid;
  if (!companyId) return res.status(401).json({ error: 'Authentication required' });
  try {
    return res.json(await companyYappchattService.status(companyId, req.usertype));
  } catch (err) {
    return sendError(res, err, 'company YappChatt status');
  }
});

router.post('/', authenticateToken, requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  const companyId = req.companyid;
  if (!companyId) return res.status(401).json({ error: 'Authentication required' });
  const parsed = connectSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid request', detail: 'Body is { confirm: true } or { confirm: false }.' });
  }
  if (!parsed.data.confirm) {
    // D5: show the admin which account would be linked, before anything happens.
    try {
      return res.json(await companyYappchattService.previewConnect(companyId));
    } catch (err) {
      return sendError(res, err, 'company YappChatt preview');
    }
  }
  try {
    const result = await companyYappchattService.connectCompany(companyId, req.userid ?? null);
    logger.info({ companyId, outcome: result.outcome, members: result.members }, 'company YappChatt account connected');
    return res.json(result);
  } catch (err) {
    return sendError(res, err, 'company YappChatt connect');
  }
});
// [SCOPE 144 / T006] END

export default router;
