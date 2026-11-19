/**
 * Billing & Invoice Routes
 * Feature 002: Billing rates, invoice generation, and financial reporting
 *
 * GET    /api/company/billing/rates     - Get current rates
 * PATCH  /api/company/billing/rates     - Update billing rates
 * POST   /api/company/billing/invoices  - Generate invoice
 * GET    /api/company/billing/invoices  - List invoices
 * GET    /api/company/billing/reports   - Financial reports
 */

import { Router, Response, Request } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error-handler.js';
import { sendSuccess, sendError, ErrorCode } from '../../lib/api-response.js';
import {
  getBillingRates,
  updateBillingRate,
  generateInvoice,
  getInvoices,
  generateFinancialReport,
} from '../../services/billing-service.js';
import { createLogger } from '../lib/logger.js';
import { z } from 'zod';

const router = Router();
const logger = createLogger('billing-routes');

// Validation schemas
const rateUpdateSchema = z.object({
  level: z.enum(['company', 'project', 'user']),
  entityid: z.string().uuid().optional(),
  hourlyrate: z.number().positive().max(10000),
});

const invoiceGenerateSchema = z.object({
  projectid: z.string().uuid().optional(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  billedto: z.string().optional(),
  description: z.string().optional(),
});

/**
 * GET /api/company/billing/rates
 * Get current billing rates (company, project, user)
 */
router.get(
  '/rates',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const companyid = user?.companyid;

      if (!companyid) {
        sendError(res, ErrorCode.UNAUTHORIZED, 'No company in token', 401);
        return;
      }

      const projectid = req.query.projectid as string;
      const userid = req.query.userid as string;

      const rates = await getBillingRates(companyid, { projectid, userid });
      sendSuccess(res, rates, 200);
    } catch (error) {
      logger.error({ error }, 'Failed to get billing rates');
      sendError(res, ErrorCode.INTERNAL_ERROR, 'Failed to get rates', 500);
    }
  })
);

/**
 * PATCH /api/company/billing/rates
 * Update billing rates at any tier
 */
router.patch(
  '/rates',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const companyid = user?.companyid;

      if (!companyid) {
        sendError(res, ErrorCode.UNAUTHORIZED, 'No company in token', 401);
        return;
      }

      // Check authorization (Admin only)
      if (user?.role !== 'Admin') {
        sendError(res, ErrorCode.INSUFFICIENT_PERMISSIONS, 'Admin access required', 403);
        return;
      }

      // Validate input
      const data = rateUpdateSchema.parse(req.body);

      const result = await updateBillingRate({
        companyid,
        level: data.level as 'company' | 'project' | 'user',
        entityid: data.entityid,
        hourlyrate: data.hourlyrate,
      });

      sendSuccess(res, result, 200, 'Rate updated successfully');
    } catch (error) {
      if (error instanceof z.ZodError) {
        sendError(res, ErrorCode.VALIDATION_ERROR, error.errors[0].message, 400, { errors: error.errors });
      } else if (error instanceof Error && error.message.includes('rate must be')) {
        sendError(res, ErrorCode.VALIDATION_ERROR, error.message, 400);
      } else {
        logger.error({ error }, 'Failed to update billing rate');
        sendError(res, ErrorCode.INTERNAL_ERROR, 'Failed to update rate', 500);
      }
    }
  })
);

/**
 * POST /api/company/billing/invoices
 * Generate invoice for date range
 */
router.post(
  '/invoices',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const companyid = user?.companyid;

      if (!companyid) {
        sendError(res, ErrorCode.UNAUTHORIZED, 'No company in token', 401);
        return;
      }

      // Check authorization (Admin only)
      if (user?.role !== 'Admin') {
        sendError(res, ErrorCode.INSUFFICIENT_PERMISSIONS, 'Admin access required', 403);
        return;
      }

      // Validate input
      const data = invoiceGenerateSchema.parse(req.body);

      const result = await generateInvoice({
        companyid,
        projectid: data.projectid,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        billedto: data.billedto,
        description: data.description,
      });

      sendSuccess(res, result, 201, 'Invoice generated successfully');
    } catch (error) {
      if (error instanceof z.ZodError) {
        sendError(res, ErrorCode.VALIDATION_ERROR, error.errors[0].message, 400, { errors: error.errors });
      } else if (error instanceof Error && error.message.includes('date')) {
        sendError(res, ErrorCode.VALIDATION_ERROR, error.message, 400);
      } else {
        logger.error({ error }, 'Failed to generate invoice');
        sendError(res, ErrorCode.INTERNAL_ERROR, 'Failed to generate invoice', 500);
      }
    }
  })
);

/**
 * GET /api/company/billing/invoices
 * List invoices with pagination
 */
router.get(
  '/invoices',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const companyid = user?.companyid;

      if (!companyid) {
        sendError(res, ErrorCode.UNAUTHORIZED, 'No company in token', 401);
        return;
      }

      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const offset = parseInt(req.query.offset as string) || 0;

      const result = await getInvoices(companyid, { limit, offset });

      sendSuccess(res, {
        invoices: result.invoices,
        pagination: {
          total: result.total,
          limit,
          offset,
          hasMore: offset + limit < result.total,
        },
      }, 200);
    } catch (error) {
      logger.error({ error }, 'Failed to list invoices');
      sendError(res, ErrorCode.INTERNAL_ERROR, 'Failed to list invoices', 500);
    }
  })
);

/**
 * GET /api/company/billing/reports
 * Generate financial reports
 */
router.get(
  '/reports',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const companyid = user?.companyid;

      if (!companyid) {
        sendError(res, ErrorCode.UNAUTHORIZED, 'No company in token', 401);
        return;
      }

      const startDateStr = req.query.startDate as string;
      const endDateStr = req.query.endDate as string;

      const options: any = {};
      if (startDateStr) options.startDate = new Date(startDateStr);
      if (endDateStr) options.endDate = new Date(endDateStr);

      const report = await generateFinancialReport(companyid, options);
      sendSuccess(res, report, 200);
    } catch (error) {
      logger.error({ error }, 'Failed to generate financial report');
      sendError(res, ErrorCode.INTERNAL_ERROR, 'Failed to generate report', 500);
    }
  })
);

export default router;
