import { Router, Response } from 'express';
import { z } from 'zod';
import { db } from '~/db/client.js';
import { userprofiles as users, companies } from '~/db/schema';
import { eq } from 'drizzle-orm';
import { authenticateToken, requireAuth, AuthRequest } from '~/server/middleware/auth.js';
import { requireAdmin } from '~/server/middleware/requireAdmin.js';
import { asyncHandler } from '~/server/middleware/errorHandler.js';
import { logger } from '~/server/lib/logger.js';
import { registerCompany, RegistrationRequest } from '~/server/services/RegistrationService.js';
import { DashboardService } from '~/server/services/DashboardService.js';
import { BillingService } from '~/server/services/BillingService.js';
import { validateBody } from '~/server/middleware/validation.js';
// [SCOPE 131 / T002] self-serve subscription lifecycle — cancel, un-cancel, pause, resume.
import {
  requestCancellation,
  reverseCancellation,
  pauseBilling,
  resumeBilling,
  getLifecycleState,
} from '~/server/services/SubscriptionLifecycleService.js';

const router = Router();

/**
 * POST /api/company
 * Register a new company with admin account
 * Public endpoint - no authentication required
 */
router.post(
  '/',
  asyncHandler(async (req: any, res: Response) => {
    try {
      const registrationData: RegistrationRequest = req.body;

      // Validate required fields
      if (!registrationData.companyName || !registrationData.billingEmail || 
          !registrationData.adminEmail || !registrationData.adminPassword ||
          !registrationData.adminFirstName || !registrationData.billingAddress ||
          !registrationData.billingCountry || !registrationData.billingPhone ||
          !registrationData.subscriptionTier) {
        res.status(400).json({ 
          error: 'Missing required fields',
          required: ['companyName', 'billingEmail', 'billingAddress', 'billingCountry', 
                    'billingPhone', 'subscriptionTier', 'adminEmail', 'adminPassword', 'adminFirstName']
        });
        return;
      }

      // Register company
      const result = await registerCompany(registrationData);

      logger.info(
        { 
          companyId: result.company.companyId,
          companyName: result.company.companyName,
          subscriptionTier: result.company.subscriptionTier 
        },
        'Company registered successfully'
      );

      res.status(201).json({
        success: true,
        data: {
          company: result.company,
          admin: {
            userId: result.admin.userId,
            email: result.admin.email,
            firstName: result.admin.firstName,
            usertype: result.admin.usertype,
            status: result.admin.status
          },
          nextStep: result.nextStep
        },
        message: 'Company registered successfully. Please verify your email to complete registration.'
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to register company';
      logger.error({ error: message }, 'Company registration error');
      
      // Check for specific error types
      if (message.includes('already registered')) {
        res.status(409).json({ error: message });
      } else if (message.includes('Validation failed')) {
        res.status(400).json({ error: message });
      } else {
        res.status(500).json({ error: 'Failed to register company' });
      }
    }
  })
);

/**
 * GET /api/company
 * Get current user's company details
 * Requires authentication
 */
router.get(
  '/',
  authenticateToken,
  requireAuth,
  asyncHandler(async (req: any, res: Response) => {
    try {
      const userid = req.userid;

      // Get user to get their company
      const userData = await db
        .select()
        .from(users)
        .where(eq(users.id, userid))
        .then(rows => rows[0]);

      if (!userData) {
        logger.warn({ userid }, 'User not found');
        res.status(404).json({ error: 'User not found' });
        return;
      }

      // For now, return a mock company response
      // This requires proper schema mapping once companies schema is finalized
      logger.info({ userid }, 'Company details retrieved');

      res.status(200).json({
        message: 'Company endpoint not yet fully implemented',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch company';
      logger.error({ error: message }, 'Get company error');
      res.status(500).json({ error: 'Failed to fetch company details' });
    }
  })
);

/**
 * GET /api/company/:id
 * Get company details by ID (admin only)
 */
router.get(
  '/:id',
  authenticateToken,
  requireAuth,
  asyncHandler(async (req: any, res: Response) => {
    try {
      const { id } = req.params;
      const userid = req.userid;

      // Get requesting user
      const userData = await db
        .select()
        .from(users)
        .where(eq(users.id, userid))
        .then(rows => rows[0]);

      if (!userData) {
        res.status(403).json({ error: 'User not found' });
        return;
      }

      logger.info({ companyid: id, userid }, 'Company details retrieved');

      res.status(200).json({
        message: 'Company endpoint not yet fully implemented',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch company';
      logger.error({ error: message }, 'Get company by ID error');
      res.status(500).json({ error: 'Failed to fetch company details' });
    }
  })
);

/**
 * GET /api/company/admin/dashboard
 * Get admin dashboard metrics
 * Requires admin authentication
 */
router.get(
  '/admin/dashboard',
  authenticateToken,
  requireAuth,
  requireAdmin,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    try {
      const companyId = req.companyid;

      if (!companyId) {
        res.status(400).json({ error: 'Company ID not found in token' });
        return;
      }

      const metrics = await DashboardService.getDashboardMetrics(companyId);

      logger.info({ companyId }, 'Admin dashboard metrics retrieved');

      res.status(200).json({
        success: true,
        data: metrics
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch dashboard metrics';
      logger.error({ error: message }, 'Get dashboard metrics error');
      res.status(500).json({ error: 'Failed to fetch dashboard metrics' });
    }
  })
);

/**
 * GET /api/company/subscription
 * Get company subscription information
 */
router.get(
  '/subscription',
  authenticateToken,
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    try {
      const companyId = req.companyid;

      if (!companyId) {
        res.status(400).json({ error: 'Company ID not found in token' });
        return;
      }

      const subscriptionInfo = await DashboardService.getSubscriptionInfo(companyId);

      // [SCOPE 131 / T008] The panel renders three states — active, paused and
      // cancellation-pending-with-date. Returning the lifecycle alongside the
      // summary means it renders all three from one call, rather than inferring
      // "pending" from the absence of something.
      const lifecycle = await getLifecycleState(companyId);

      logger.info({ companyId }, 'Subscription info retrieved');

      res.status(200).json({
        success: true,
        data: { ...subscriptionInfo, lifecycle }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch subscription info';
      logger.error({ error: message }, 'Get subscription info error');
      res.status(500).json({ error: 'Failed to fetch subscription information' });
    }
  })
);

/**
 * PATCH /api/company/subscription
 * Update company subscription tier
 * Requires admin authentication
 */
router.patch(
  '/subscription',
  authenticateToken,
  requireAuth,
  requireAdmin,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    try {
      const companyId = req.companyid;
      const { subscriptionTier } = req.body;

      if (!companyId) {
        res.status(400).json({ error: 'Company ID not found in token' });
        return;
      }

      if (!subscriptionTier || !['FREE', 'SMALL_BUSINESS', 'CONSULTANT', 'ENTERPRISE'].includes(subscriptionTier)) {
        res.status(400).json({ error: 'Invalid subscription tier' });
        return;
      }

      // Update company subscription tier
      await db
        .update(companies)
        .set({ 
          billingplan: subscriptionTier,
          updatedat: new Date()
        })
        .where(eq(companies.id, companyId));

      logger.info({ companyId, subscriptionTier }, 'Subscription tier updated');

      res.status(200).json({
        success: true,
        message: 'Subscription tier updated successfully'
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update subscription';
      logger.error({ error: message }, 'Update subscription error');
      res.status(500).json({ error: 'Failed to update subscription' });
    }
  })
);

// [SCOPE 131 / T002] BEGIN — self-serve suspend and cancel routes (FR-002, FR-004, FR-006)
/**
 * The four mutating subscription verbs a company ADMIN can perform on their own
 * subscription. All four carry an explicit `requireAdmin` guard: SOC 2 CC6.3 asks
 * for a role check, and hiding the controls in the panel is UX, not a control.
 *
 * All four are listed in `requireActiveSubscription.EXEMPT_PREFIXES` (T009).
 * Without that they would be unreachable exactly when they are needed — a PAUSED
 * company is walled, and resume is the one action behind the wall that unwalls it.
 *
 * Errors come back through `asyncHandler` to the shared error handler, which maps
 * `ConflictError` to 409 and `NotFoundError` to 404. Nothing here catches broadly
 * and re-reports 500: a refusal the customer can act on ("you have no Stripe
 * subscription", "a cancellation is already pending") must not be flattened into
 * "something went wrong".
 */

/**
 * DELETE /api/company/subscription
 * Cancel at period end. Implements SCOPE-023 D.4, specified 2026-04-29, never built.
 *
 * `confirmName` must match the company name and is checked BEFORE Stripe is
 * contacted, so a mistyped confirmation cannot leave Stripe changed.
 */
router.delete(
  '/subscription',
  authenticateToken,
  requireAuth,
  requireAdmin,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.companyid;
    if (!companyId) {
      res.status(400).json({ error: 'Company ID not found in token' });
      return;
    }

    const confirmName = typeof req.body?.confirmName === 'string'
      ? req.body.confirmName.trim()
      : '';

    const [company] = await db
      .select({ name: companies.name })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);

    if (!company) {
      res.status(404).json({ error: 'Company not found' });
      return;
    }

    // Checked here, before any Stripe call. Case-insensitive because the customer
    // is retyping their own company name from the screen, not a password.
    if (confirmName.toLowerCase() !== company.name.trim().toLowerCase()) {
      logger.warn({ companyId }, 'Cancellation rejected — confirmName mismatch');
      res.status(400).json({
        error: 'Type the company name exactly as shown to confirm cancellation.',
        code: 'CONFIRM_NAME_MISMATCH',
      });
      return;
    }

    const result = await requestCancellation(companyId, req.userid ?? null);

    logger.info(
      { companyId, effectiveDate: result.effectiveDate },
      'Subscription cancellation requested by customer',
    );

    res.status(200).json({ success: true, data: result });
  })
);

/**
 * POST /api/company/subscription/resume
 * Un-cancel while the cancellation is still pending.
 */
router.post(
  '/subscription/resume',
  authenticateToken,
  requireAuth,
  requireAdmin,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.companyid;
    if (!companyId) {
      res.status(400).json({ error: 'Company ID not found in token' });
      return;
    }

    const result = await reverseCancellation(companyId, req.userid ?? null);
    logger.info({ companyId }, 'Pending cancellation reversed by customer');
    res.status(200).json({ success: true, data: result });
  })
);

/**
 * POST /api/company/subscription/pause
 * Suspend billing. Reversible, non-destructive, nothing scheduled for deletion.
 */
router.post(
  '/subscription/pause',
  authenticateToken,
  requireAuth,
  requireAdmin,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.companyid;
    if (!companyId) {
      res.status(400).json({ error: 'Company ID not found in token' });
      return;
    }

    const result = await pauseBilling(companyId, req.userid ?? null);
    logger.info({ companyId }, 'Billing suspended by customer');
    res.status(200).json({ success: true, data: result });
  })
);

/**
 * POST /api/company/subscription/unpause
 * Resume billing on the same subscription.
 */
router.post(
  '/subscription/unpause',
  authenticateToken,
  requireAuth,
  requireAdmin,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.companyid;
    if (!companyId) {
      res.status(400).json({ error: 'Company ID not found in token' });
      return;
    }

    const result = await resumeBilling(companyId, req.userid ?? null);
    logger.info({ companyId }, 'Billing resumed by customer');
    res.status(200).json({ success: true, data: result });
  })
);
// [SCOPE 131 / T002] END

/**
 * GET /api/company/feature/:featureName
 * Check if a feature is available for the company's tier
 */
router.get(
  '/feature/:featureName',
  authenticateToken,
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    try {
      const companyId = req.companyid;
      const { featureName } = req.params;

      if (!companyId) {
        res.status(400).json({ error: 'Company ID not found in token' });
        return;
      }

      const isAvailable = await DashboardService.isFeatureAvailable(companyId, featureName);

      logger.info({ companyId, featureName, isAvailable }, 'Feature availability checked');

      res.status(200).json({
        success: true,
        data: {
          featureName,
          isAvailable
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to check feature availability';
      logger.error({ error: message }, 'Check feature availability error');
      res.status(500).json({ error: 'Failed to check feature availability' });
    }
  })
);

// ─── User Dashboard Config (T035) ────────────────────────────────────────────

const dashboardConfigSchema = z.object({
  widgetOrder: z.array(z.string()).optional(),
  hiddenWidgets: z.array(z.string()).optional(),
  theme: z.enum(['light', 'dark', 'system']).optional(),
  sidebarCollapsed: z.boolean().optional(),
});

/**
 * GET /api/company/user/dashboard/config
 * Get user's dashboard configuration
 */
router.get(
  '/user/dashboard/config',
  authenticateToken,
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.userid;

      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      // Get user's dashboardconfig from database
      const userData = await db
        .select({ dashboardconfig: users.dashboardconfig })
        .from(users)
        .where(eq(users.id, userId))
        .then(rows => rows[0]);

      const config = userData?.dashboardconfig || {
        widgetOrder: ['stats', 'projects', 'activity', 'digest'],
        hiddenWidgets: [],
        theme: 'system',
        sidebarCollapsed: false,
      };

      res.status(200).json({
        success: true,
        data: config
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch dashboard config';
      const fullError = error instanceof Error ? error : new Error(String(error));
      logger.error({ 
        error: message, 
        stack: fullError.stack,
        name: fullError.name,
        cause: (fullError as Error & { cause?: unknown }).cause 
      }, 'Get dashboard config error');
      res.status(500).json({ error: 'Failed to fetch dashboard configuration', details: message });
    }
  })
);

/**
 * PATCH /api/company/user/dashboard/config
 * Update user's dashboard configuration
 */
router.patch(
  '/user/dashboard/config',
  authenticateToken,
  requireAuth,
  validateBody(dashboardConfigSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.userid;
      const updates = req.body;

      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      // Get current config
      const userData = await db
        .select({ dashboardconfig: users.dashboardconfig })
        .from(users)
        .where(eq(users.id, userId))
        .then(rows => rows[0]);

      const currentConfig = (userData?.dashboardconfig as Record<string, unknown>) || {};
      
      // Merge updates
      const newConfig = {
        ...currentConfig,
        ...updates,
      };

      // Save to database
      await db
        .update(users)
        .set({ dashboardconfig: newConfig })
        .where(eq(users.id, userId));

      logger.info({ userId }, 'Dashboard config updated');

      res.status(200).json({
        success: true,
        data: newConfig,
        message: 'Dashboard configuration updated successfully'
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update dashboard config';
      const fullError = error instanceof Error ? error : new Error(String(error));
      logger.error({ 
        error: message, 
        stack: fullError.stack,
        name: fullError.name,
        cause: (fullError as Error & { cause?: unknown }).cause 
      }, 'Update dashboard config error');
      res.status(500).json({ error: 'Failed to update dashboard configuration', details: message });
    }
  })
);

// ─── Company Settings (T036) ─────────────────────────────────────────────────

const companySettingsSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  billingEmail: z.string().email().optional(),
  billingAddress: z.string().min(10).max(500).optional(),
  billingPhone: z.string().min(10).max(20).optional(),
  digestConfig: z.object({
    sendTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).optional(),
    frequency: z.enum(['daily', 'weekly', 'never']).optional(),
    recipients: z.array(z.string().email()).optional(),
  }).optional(),
});

/**
 * PATCH /api/company/settings
 * Update company settings (admin only)
 */
router.patch(
  '/settings',
  authenticateToken,
  requireAuth,
  requireAdmin,
  validateBody(companySettingsSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    try {
      const companyId = req.companyid;
      const updates = req.body;

      if (!companyId) {
        res.status(400).json({ error: 'Company ID not found in token' });
        return;
      }

      // Build update object with only provided fields
      const updateData: Record<string, unknown> = {};
      
      if (updates.name) updateData.name = updates.name;
      if (updates.billingEmail) updateData.contactemail = updates.billingEmail;
      if (updates.billingAddress) updateData.address = updates.billingAddress;
      if (updates.billingPhone) updateData.phone = updates.billingPhone;
      if (updates.digestConfig) updateData.digestconfig = updates.digestConfig;
      
      updateData.updatedat = new Date();

      // Update company
      await db
        .update(companies)
        .set(updateData)
        .where(eq(companies.id, companyId));

      logger.info({ companyId, updates: Object.keys(updates) }, 'Company settings updated');

      res.status(200).json({
        success: true,
        message: 'Company settings updated successfully'
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update company settings';
      const fullError = error instanceof Error ? error : new Error(String(error));
      logger.error({ 
        error: message, 
        stack: fullError.stack,
        name: fullError.name,
        cause: (fullError as Error & { cause?: unknown }).cause 
      }, 'Update company settings error');
      res.status(500).json({ error: 'Failed to update company settings', details: message });
    }
  })
);

// ─── Billing Rates (T055-T058) ───────────────────────────────────────────────

const billingRateSchema = z.object({
  rate: z.number().min(0).max(10000).optional(),
  projectid: z.string().uuid().optional(),
  userid: z.string().uuid().optional(),
});

/**
 * GET /api/company/billing/rates
 * Get billing rate configuration (admin only)
 */
router.get(
  '/billing/rates',
  authenticateToken,
  requireAuth,
  requireAdmin,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    try {
      const companyId = req.companyid;

      if (!companyId) {
        res.status(400).json({ error: 'Company ID not found in token' });
        return;
      }

      const rates = await BillingService.getBillingRates(companyId);

      logger.info({ companyId }, 'Billing rates retrieved');

      res.status(200).json({
        success: true,
        data: rates
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch billing rates';
      logger.error({ error: message }, 'Get billing rates error');
      res.status(500).json({ error: 'Failed to fetch billing rates' });
    }
  })
);

/**
 * PATCH /api/company/billing/rates
 * Update billing rates (admin only)
 * Can update company default, project-specific, or user-specific rates
 */
router.patch(
  '/billing/rates',
  authenticateToken,
  requireAuth,
  requireAdmin,
  validateBody(billingRateSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    try {
      const companyId = req.companyid;
      const { rate, projectid, userid } = req.body;

      if (!companyId) {
        res.status(400).json({ error: 'Company ID not found in token' });
        return;
      }

      if (rate === undefined) {
        res.status(400).json({ error: 'Rate is required' });
        return;
      }

      // Update specific rate based on provided IDs
      if (userid) {
        await BillingService.updateUserRate(userid, companyId, rate);
        logger.info({ companyId, userid, rate }, 'User billing rate updated');
      } else if (projectid) {
        await BillingService.updateProjectRate(projectid, companyId, rate);
        logger.info({ companyId, projectid, rate }, 'Project billing rate updated');
      } else {
        await BillingService.updateCompanyRate(companyId, rate);
        logger.info({ companyId, rate }, 'Company default billing rate updated');
      }

      res.status(200).json({
        success: true,
        message: 'Billing rate updated successfully'
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update billing rate';
      logger.error({ error: message }, 'Update billing rate error');
      res.status(500).json({ error: 'Failed to update billing rate' });
    }
  })
);

/**
 * POST /api/company/billing/invoice-preview
 * Preview invoice before generation (admin only)
 */
router.post(
  '/billing/invoice-preview',
  authenticateToken,
  requireAuth,
  requireAdmin,
  validateBody(z.object({
    projectid: z.string().uuid().optional(),
    startDate: z.string().datetime(),
    endDate: z.string().datetime(),
  })),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    try {
      const companyId = req.companyid;
      const { projectid, startDate, endDate } = req.body;

      if (!companyId) {
        res.status(400).json({ error: 'Company ID not found in token' });
        return;
      }

      const preview = await BillingService.previewInvoice(companyId, {
        projectid,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      });

      logger.info(
        { companyId, entryCount: preview.entryCount, totalAmount: preview.totalAmount },
        'Invoice preview generated'
      );

      res.status(200).json({
        success: true,
        data: preview
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate invoice preview';
      logger.error({ error: message }, 'Invoice preview error');
      res.status(500).json({ error: 'Failed to generate invoice preview' });
    }
  })
);

export default router;
