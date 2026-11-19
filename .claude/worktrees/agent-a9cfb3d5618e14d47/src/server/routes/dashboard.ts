/**
 * Dashboard & Analytics Routes
 * Feature 002: Company dashboard, activity feed, and notifications
 *
 * GET    /api/company/dashboard          - Dashboard metrics
 * GET    /api/company/dashboard/activity - Activity feed
 * GET    /api/company/notifications      - Notification settings
 * PATCH  /api/company/notifications      - Update notifications
 */

import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error-handler.js';
import { sendSuccess, sendError, ErrorCode } from '../../lib/api-response.js';
import {
  getDashboardMetrics,
  getActivityFeed,
  getNotificationSettings,
  updateNotificationSettings,
} from '../../services/dashboard-service.js';
import { createLogger } from '../lib/logger.js';
import { z } from 'zod';

const router = Router();
const logger = createLogger('dashboard-routes');

// Validation schemas
const notificationUpdateSchema = z.object({
  emailfrequency: z.enum(['daily', 'weekly', 'monthly', 'never']).optional(),
  emailtime: z.string().regex(/^\d{2}:\d{2}:\d{2}$/).optional(),
  includeprojectupdate: z.boolean().optional(),
  includeteamactivity: z.boolean().optional(),
  includefinancials: z.boolean().optional(),
});

/**
 * GET /api/company/dashboard
 * Get company dashboard metrics
 */
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    try {
      const user = (req as any).user;
      const companyid = user?.companyid;

      if (!companyid) {
        sendError(res, ErrorCode.UNAUTHORIZED, 'No company in token', 401);
        return;
      }

      const metrics = await getDashboardMetrics(companyid);
      sendSuccess(res, metrics, 200);
    } catch (error) {
      logger.error({ error }, 'Failed to get dashboard metrics');
      sendError(res, ErrorCode.INTERNAL_ERROR, 'Failed to get dashboard metrics', 500);
    }
  })
);

/**
 * GET /api/company/dashboard/activity
 * Get recent activity feed
 */
router.get(
  '/activity',
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    try {
      const user = (req as any).user;
      const companyid = user?.companyid;

      if (!companyid) {
        sendError(res, ErrorCode.UNAUTHORIZED, 'No company in token', 401);
        return;
      }

      const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
      const offset = parseInt(req.query.offset as string) || 0;

      const activities = await getActivityFeed(companyid, { limit, offset });
      sendSuccess(
        res,
        {
          activities,
          pagination: {
            limit,
            offset,
            count: activities.length,
          },
        },
        200
      );
    } catch (error) {
      logger.error({ error }, 'Failed to get activity feed');
      sendError(res, ErrorCode.INTERNAL_ERROR, 'Failed to get activity feed', 500);
    }
  })
);

/**
 * GET /api/company/notifications
 * Get notification settings
 */
router.get(
  '/notifications',
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    try {
      const user = (req as any).user;
      const companyid = user?.companyid;

      if (!companyid) {
        sendError(res, ErrorCode.UNAUTHORIZED, 'No company in token', 401);
        return;
      }

      const settings = await getNotificationSettings(companyid);
      sendSuccess(res, settings, 200);
    } catch (error) {
      logger.error({ error }, 'Failed to get notification settings');
      sendError(
        res,
        ErrorCode.INTERNAL_ERROR,
        'Failed to get notification settings',
        500
      );
    }
  })
);

/**
 * PATCH /api/company/notifications
 * Update notification settings
 */
router.patch(
  '/notifications',
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    try {
      const user = (req as any).user;
      const companyid = user?.companyid;

      if (!companyid) {
        sendError(res, ErrorCode.UNAUTHORIZED, 'No company in token', 401);
        return;
      }

      // Check authorization (Admin only)
      if (user?.role !== 'Admin') {
        sendError(
          res,
          ErrorCode.INSUFFICIENT_PERMISSIONS,
          'Admin access required',
          403
        );
        return;
      }

      // Validate input
      const data = notificationUpdateSchema.parse(req.body);

      await updateNotificationSettings(companyid, data);

      // Return updated settings
      const settings = await getNotificationSettings(companyid);
      sendSuccess(res, settings, 200, 'Notification settings updated');
    } catch (error) {
      if (error instanceof z.ZodError) {
        sendError(
          res,
          ErrorCode.VALIDATION_ERROR,
          error.errors[0].message,
          400,
          { errors: error.errors }
        );
      } else if (error instanceof Error && error.message.includes('Invalid')) {
        sendError(
          res,
          ErrorCode.VALIDATION_ERROR,
          error.message,
          400
        );
      } else {
        logger.error({ error }, 'Failed to update notification settings');
        sendError(
          res,
          ErrorCode.INTERNAL_ERROR,
          'Failed to update notification settings',
          500
        );
      }
    }
  })
);

export default router;
