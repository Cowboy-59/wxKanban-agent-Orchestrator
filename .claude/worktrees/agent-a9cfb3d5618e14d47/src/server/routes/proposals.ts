import { Router, Response } from 'express';
import { z } from 'zod';
import {
  listProposals,
  getProposalById,
  createProposal,
  updateProposal,
  transitionStatus,
  deleteProposal,
} from '~/server/services/proposalService.js';
import { validateBody, validateParams, validateQuery } from '~/server/middleware/validation.js';
import { authenticateToken, requireAuth, AuthRequest } from '~/server/middleware/auth.js';
import { asyncHandler } from '~/server/middleware/errorHandler.js';
import { createLogger } from '~/server/lib/logger.js';

const router = Router();
const logger = createLogger('proposals-routes');

// ─── Validation schemas ───────────────────────────────────────────────────────

const proposalIdSchema = z.object({
  id: z.string().uuid('Proposal ID must be a valid UUID'),
});

const listQuerySchema = z.object({
  status: z.enum(['pending', 'good_idea', 'accepted', 'rejected']).optional(),
});

const createProposalSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255),
  description: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  estimatedeffort: z.string().max(100).optional(),
});

const updateProposalSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  estimatedeffort: z.string().max(100).optional(),
});

const transitionStatusSchema = z.object({
  status: z.enum(['pending', 'good_idea', 'accepted', 'rejected']),
  rejectionreason: z.string().optional(),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function requireAdminOrManager(req: AuthRequest, res: Response): boolean {
  if (req.usertype !== 'ADMIN' && req.usertype !== 'TEAM_MANAGER') {
    res.status(403).json({ error: 'Admin or Team Manager role required' });
    return false;
  }
  return true;
}

function requireAdmin(req: AuthRequest, res: Response): boolean {
  if (req.usertype !== 'ADMIN') {
    res.status(403).json({ error: 'Admin role required' });
    return false;
  }
  return true;
}

// ─── List proposals ───────────────────────────────────────────────────────────

router.get(
  '/',
  authenticateToken,
  requireAuth,
  validateQuery(listQuerySchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { companyid } = req;
    if (!companyid) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (!requireAdminOrManager(req, res)) return;

    const { status } = req.query as { status?: string };
    const proposals = await listProposals(companyid, status);

    res.status(200).json({ success: true, proposals });
  })
);

// ─── Get single proposal ─────────────────────────────────────────────────────

router.get(
  '/:id',
  authenticateToken,
  requireAuth,
  validateParams(proposalIdSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { companyid } = req;
    if (!companyid) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (!requireAdminOrManager(req, res)) return;

    const proposal = await getProposalById(companyid, req.params.id);
    if (!proposal) {
      res.status(404).json({ error: 'Proposal not found' });
      return;
    }

    res.status(200).json({ success: true, proposal });
  })
);

// ─── Create proposal ─────────────────────────────────────────────────────────

router.post(
  '/',
  authenticateToken,
  requireAuth,
  validateBody(createProposalSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { userid, companyid, fullname } = req as AuthRequest & { fullname?: string };
    if (!userid || !companyid) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (!requireAdminOrManager(req, res)) return;

    const body = req.body as z.infer<typeof createProposalSchema>;
    const proposal = await createProposal(companyid, userid, {
      ...body,
      source: fullname || req.email || 'Unknown',
    });

    res.status(201).json({ success: true, proposal });
  })
);

// ─── Update proposal fields ──────────────────────────────────────────────────

router.put(
  '/:id',
  authenticateToken,
  requireAuth,
  validateParams(proposalIdSchema),
  validateBody(updateProposalSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { companyid } = req;
    if (!companyid) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (!requireAdminOrManager(req, res)) return;

    const body = req.body as z.infer<typeof updateProposalSchema>;
    const proposal = await updateProposal(companyid, req.params.id, body);
    if (!proposal) {
      res.status(404).json({ error: 'Proposal not found' });
      return;
    }

    res.status(200).json({ success: true, proposal });
  })
);

// ─── Transition status ────────────────────────────────────────────────────────

router.patch(
  '/:id/status',
  authenticateToken,
  requireAuth,
  validateParams(proposalIdSchema),
  validateBody(transitionStatusSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { companyid } = req;
    if (!companyid) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (!requireAdmin(req, res)) return;

    const body = req.body as z.infer<typeof transitionStatusSchema>;
    const result = await transitionStatus(companyid, req.params.id, body);

    if (!result.success) {
      res.status(422).json({ error: result.error });
      return;
    }

    res.status(200).json({ success: true, proposal: result.proposal });
  })
);

// ─── Delete proposal ──────────────────────────────────────────────────────────

router.delete(
  '/:id',
  authenticateToken,
  requireAuth,
  validateParams(proposalIdSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { companyid } = req;
    if (!companyid) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (!requireAdmin(req, res)) return;

    const deleted = await deleteProposal(companyid, req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Proposal not found' });
      return;
    }

    res.status(204).send();
  })
);

export default router;
