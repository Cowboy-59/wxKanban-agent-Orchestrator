import { Router, Response } from 'express';
import { z } from 'zod';
import { getProjectTaskSummaries, getPendingTasksByScope } from '~/server/services/pendingTaskService.js';
import { validateParams, validateQuery } from '~/server/middleware/validation.js';
import { authenticateToken, requireAuth, AuthRequest } from '~/server/middleware/auth.js';
import { asyncHandler } from '~/server/middleware/errorHandler.js';
import { createLogger } from '~/server/lib/logger.js';

const router = Router();
const logger = createLogger('pending-tasks-routes');

// ─── Validation schemas ───────────────────────────────────────────────────────

const projectIdSchema = z.object({
  id: z.string().uuid('Project ID must be a valid UUID'),
});

const pendingTasksQuerySchema = z.object({
  priority: z.enum(['all', 'low', 'medium', 'high', 'critical']).optional(),
  status: z.enum(['open', 'in_progress', 'both']).optional(),
  assignee: z.string().uuid().optional(),
  showcompleted: z.enum(['true', 'false']).optional(),
  sort: z.enum(['priority', 'duedate', 'status']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function requireAdminOrManager(req: AuthRequest, res: Response): boolean {
  if (req.usertype !== 'ADMIN' && req.usertype !== 'TEAM_MANAGER') {
    res.status(403).json({ error: 'Admin or Team Manager role required' });
    return false;
  }
  return true;
}

// ─── Pending tasks summary (per-project counts) ──────────────────────────────

router.get(
  '/summary',
  authenticateToken,
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { companyid } = req;
    if (!companyid) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (!requireAdminOrManager(req, res)) return;

    const projects = await getProjectTaskSummaries(companyid);

    res.status(200).json({ success: true, projects });
  })
);

// ─── Pending tasks by scope for a project ─────────────────────────────────────

router.get(
  '/projects/:id',
  authenticateToken,
  requireAuth,
  validateParams(projectIdSchema),
  validateQuery(pendingTasksQuerySchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { userid, companyid, usertype } = req;
    if (!userid || !companyid || !usertype) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const query = req.query as z.infer<typeof pendingTasksQuerySchema>;
    const result = await getPendingTasksByScope(
      req.params.id,
      companyid,
      usertype,
      userid,
      {
        priority: query.priority,
        status: query.status,
        assignee: query.assignee,
        showcompleted: query.showcompleted === 'true',
      },
    );

    if (!result) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    res.status(200).json({ success: true, ...result });
  })
);

export default router;
