import { Router, Response } from 'express';
import { z } from 'zod';
import { NotificationService } from '~/server/services/NotificationService.js';
import { validateParams, validateQuery } from '~/server/middleware/validation.js';
import { authenticateToken, requireAuth, AuthRequest } from '~/server/middleware/auth.js';
import { asyncHandler } from '~/server/middleware/errorHandler.js';
import { createLogger } from '~/server/lib/logger.js';

const router = Router();
const logger = createLogger('notifications-routes');

const notifParamsSchema = z.object({ id: z.string().uuid() });

const notifQuerySchema = z.object({
  unreadonly: z.string().optional().transform((v) => v === 'true'),
  limit: z.string().optional().transform((v) => (v ? parseInt(v, 10) : 50)),
  offset: z.string().optional().transform((v) => (v ? parseInt(v, 10) : 0)),
});

// GET /notifications
router.get('/',
  authenticateToken,
  requireAuth,
  validateQuery(notifQuerySchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { userid } = req;
    if (!userid) { res.status(401).json({ error: 'Authentication required' }); return; }
    const query = req.query as unknown as z.infer<typeof notifQuerySchema>;
    const result = await NotificationService.getForUser(userid, {
      unreadonly: query.unreadonly,
      limit: query.limit,
      offset: query.offset,
    });
    res.status(200).json(result);
  })
);

// PATCH /notifications/:id/read
router.patch('/:id/read',
  authenticateToken,
  requireAuth,
  validateParams(notifParamsSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { userid } = req;
    if (!userid) { res.status(401).json({ error: 'Authentication required' }); return; }
    const updated = await NotificationService.markRead(req.params.id, userid);
    if (!updated) { res.status(404).json({ error: 'Notification not found' }); return; }
    logger.debug({ notificationid: req.params.id }, 'Notification marked read');
    res.status(200).json({ read: true });
  })
);

// POST /notifications/read-all
router.post('/read-all',
  authenticateToken,
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { userid } = req;
    if (!userid) { res.status(401).json({ error: 'Authentication required' }); return; }
    const updated = await NotificationService.markAllRead(userid);
    res.status(200).json({ updated });
  })
);

export default router;
