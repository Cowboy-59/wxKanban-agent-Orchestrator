/**
 * SysAdmin API Routes
 * 
 * Platform-level administration endpoints for SYSADMIN role.
 * All routes require SYSADMIN authentication.
 */

import { Router, Response } from "express";
import { z } from "zod";
import crypto from "crypto";
import { authenticateToken, AuthRequest } from "../middleware/auth.js";
import { requireSysAdmin } from "../middleware/requireSysAdmin.js";
import { createLogger } from "../lib/logger.js";
import { db } from "../db/client.js";
import { userprofiles as users } from "../../db/schema/userprofiles.js";

import { companies } from "../../db/schema/company.js";
import { companysubscriptions } from "../../db/schema/companysubscription.js";
import { sql, eq, desc, count, and, like } from "drizzle-orm";
import { hashPassword } from "../lib/password.js";
import { stripeConfig } from "../lib/stripe.js";
import { validateBody } from "../middleware/validation.js";
// [SCOPE 043 / T029] Amendment E — attachment read path (FR-025).
import { attachmentsOf, stripAttachmentContent } from "../../shared/feedback-attachments.js";
// [SCOPE 023 / T110] Signup invitations (FR-002a mint surface).
import {
  createSignupInvitation,
  listSignupInvitations,
  revokeSignupInvitation,
  resolveSignupInvitationByToken, // [SCOPE 023 / T114] preview/send re-hash the token
  MAX_PROMO_DAYS,
} from "../services/SignupInvitationService.js";
import { validateTierSelection } from "../services/PaymentService.js";
import { sendEmail } from "../lib/email.js";
import {
  getSignupInvitationEmailHTML,
  getSignupInvitationEmailText,
  getSignupInvitationEmailSubject, // [SCOPE 023 / T116]
} from "../lib/emailTemplates.js";
import { translateText } from "../services/MarketingAIService.js"; // [SCOPE 023 / T116] FR-002a.2
import * as SysAdminCompanyService from "../services/SysAdminCompanyService.js";
import * as SysAdminUserService from "../services/SysAdminUserService.js";
import * as SysAdminMetricsService from "../services/SysAdminMetricsService.js";
import {
  sendRestartLink,
  getSubscriptionReason,
  resyncSubscriptionFromStripe,
  resyncPendingSubscriptions,
} from "../services/SubscriptionRecoveryService.js"; // [SCOPE 067]
// [SCOPE 131 / T017] Operator-side cancel/un-cancel runs the same engine as the
// customer-side panel; only the recorded actor differs.
import {
  requestCancellation,
  reverseCancellation,
} from "../services/SubscriptionLifecycleService.js";
import { AppError } from "../middleware/errorHandler.js";
import { kitProxyService } from "../services/KitProxyService.js"; // [SCOPE 086 / FR-003]
import * as FeedbackTriageService from "../services/FeedbackTriageService.js"; // [SCOPE 043 / T006]
import helpService from "../services/HelpService.js"; // [SCOPE 044 / T003]
import { systemSettings, systemSettingsHistory } from "../../db/schema/systemSettings.js";
import { infrahealthchecks } from "../../db/schema/infrahealthchecks.js"; // [SCOPE 078 / T007]
import { runInfraHealthSweep } from "../infrahealth/runner.js"; // [SCOPE 078 / T007]
import { loadThresholds } from "../infrahealth/config.js"; // [SCOPE 078 / T007]
import { summarizeInfraHealth } from "../infrahealth/summary.js"; // [SCOPE 078 / T007]




const logger = createLogger("sysadmin-routes");
const router = Router();

// All routes require SYSADMIN authentication
router.use(authenticateToken);
router.use(requireSysAdmin);

// [SCOPE 078 / T007] BEGIN — Infrastructure Health Monitor: read warnings+solutions; manual refresh
function infraStaleMs(): number {
  const t = loadThresholds();
  return t.staleCadences * t.cadenceMinutes * 60_000;
}

/**
 * GET /api/sysadmin/infra-health
 * Current Infrastructure Health Monitor results (RDS/App Runner capacity warnings + solutions),
 * urgent-first, with derived overall status and a stale-monitor flag.
 */
router.get("/infra-health", async (_req: AuthRequest, res: Response) => {
  try {
    const rows = await db.select().from(infrahealthchecks);
    return res.json(summarizeInfraHealth(rows, infraStaleMs()));
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : "Unknown error" },
      "Failed to read infra-health",
    );
    return res.status(500).json({ error: "Failed to read infrastructure health" });
  }
});

/**
 * POST /api/sysadmin/infra-health/refresh
 * Trigger an immediate sweep (so an operator can confirm a warning clears after a fix) and return
 * the freshly evaluated state.
 */
router.post("/infra-health/refresh", async (_req: AuthRequest, res: Response) => {
  try {
    await runInfraHealthSweep(); // fail-open; always returns
    const rows = await db.select().from(infrahealthchecks);
    return res.json(summarizeInfraHealth(rows, infraStaleMs()));
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : "Unknown error" },
      "Failed to refresh infra-health",
    );
    return res.status(500).json({ error: "Failed to refresh infrastructure health" });
  }
});
// [SCOPE 078 / T007] END

/**
 * GET /api/sysadmin/metrics
 * Get platform-wide metrics
 */
router.get("/metrics", async (req: AuthRequest, res: Response) => {
  try {
    // Get all companies
    const allCompanies = await db.select().from(companies);
    const totalCompanies = allCompanies.length;
    const activeCompanies = allCompanies.filter((c: any) => c.activeflag && c.subscriptionstatus === "ACTIVE").length;
    const trialCompanies = allCompanies.filter((c: any) => c.subscriptionstatus === "TRIAL").length;
    const suspendedCompanies = allCompanies.filter((c: any) => !c.activeflag).length;

    // Get all users
    const allUsers = await db.select().from(users);
    const totalUsers = allUsers.length;
    const activeUsers = allUsers.filter((u: any) => u.active).length;

    // Calculate MRR from billing plans of paying companies (active + ACTIVE
    // subscription only; FREE/TRIAL/suspended contribute $0). ENTERPRISE adds a
    // per-active-user overage above 25 seats. Prices live in stripeConfig (cents).
    const activeUserCountByCompany = new Map<string, number>();
    for (const u of allUsers as any[]) {
      if (u.active) {
        activeUserCountByCompany.set(u.companyid, (activeUserCountByCompany.get(u.companyid) ?? 0) + 1);
      }
    }
    let mrrCents = 0;
    for (const c of allCompanies as any[]) {
      if (!(c.activeflag && c.subscriptionstatus === "ACTIVE")) continue;
      const plan = (c.billingplan ?? "FREE") as keyof typeof stripeConfig.pricing;
      mrrCents += stripeConfig.pricing[plan]?.monthlyPrice ?? 0;
      if (plan === "ENTERPRISE") {
        const activeCount = activeUserCountByCompany.get(c.id) ?? 0;
        if (activeCount > 25) mrrCents += (activeCount - 25) * stripeConfig.additionalUserPrice;
      }
    }
    const mrr = mrrCents / 100;

    const metrics = {
      totalCompanies,
      activeCompanies,
      trialCompanies,
      suspendedCompanies,
      totalUsers,
      activeUsers,
      mrr,
      churnRate: 0,
      timestamp: new Date().toISOString(),
    };

    logger.info({ adminId: req.userid }, "SysAdmin retrieved platform metrics");
    res.json(metrics);
  } catch (error) {
    logger.error({ error, adminId: req.userid }, "Failed to retrieve platform metrics");
    res.status(500).json({ error: "Failed to retrieve metrics" });
  }
});

/**
 * GET /api/sysadmin/companies
 * Get all companies with filtering and pagination
 */
router.get("/companies", async (req: AuthRequest, res: Response) => {
  try {
    const { status, search, limit = "50", offset = "0" } = req.query;
    const limitNum = Number(limit);
    const offsetNum = Number(offset);
    // Build conditions array
    const conditions: any[] = [];

    // Apply status filter
    if (status && status !== "all") {
      if (status === "ACTIVE") {
        conditions.push(eq(companies.activeflag, true));
      } else if (status === "SUSPENDED") {
        conditions.push(eq(companies.activeflag, false));
      } else {
        conditions.push(eq(companies.subscriptionstatus, status as string));
      }
    }

    // Apply search filter
    if (search) {
      conditions.push(like(companies.name, `%${search}%`));
    }
    // Get total count
    const totalResult = conditions.length > 0
      ? await db.select({ count: count() }).from(companies).where(and(...conditions))
      : await db.select({ count: count() }).from(companies);
    const total = Number(totalResult[0]?.count || 0);
    // Execute query
    let results: any[];
    if (conditions.length > 0) {
      results = await db
        .select()
        .from(companies)
        .where(and(...conditions))
        .limit(limitNum)
        .offset(offsetNum)
        .orderBy(desc(companies.createdat));
    } else {
      results = await db
        .select()
        .from(companies)
        .limit(limitNum)
        .offset(offsetNum)
        .orderBy(desc(companies.createdat));
    }

    // Get user counts for each company
    const companiesWithStats = await Promise.all(
      results.map(async (company: any) => {
        const userCount = await db
          .select({ count: count() })
          .from(users)
          .where(eq(users.companyid, company.id));

        const seats = Number(userCount[0]?.count || 0);
        const isPaying = company.activeflag && company.subscriptionstatus === "ACTIVE";
        const plan = (company.billingplan ?? "FREE") as keyof typeof stripeConfig.pricing;
        let companyMrrCents = isPaying ? (stripeConfig.pricing[plan]?.monthlyPrice ?? 0) : 0;
        if (isPaying && plan === "ENTERPRISE" && seats > 25) {
          companyMrrCents += (seats - 25) * stripeConfig.additionalUserPrice;
        }

        return {
          ...company,
          userCount: seats,
          mrr: companyMrrCents / 100,
        };
      })
    );

    logger.info({ adminId: req.userid, count: results.length }, "SysAdmin retrieved companies list");
    res.json({
      companies: companiesWithStats,
      total,
      page: Math.floor(offsetNum / limitNum) + 1,
      limit: limitNum,
      offset: offsetNum,
    });
  } catch (error) {
    logger.error({ error, adminId: req.userid }, "Failed to retrieve companies");
    res.status(500).json({ error: "Failed to retrieve companies" });
  }
});

/**
 * GET /api/sysadmin/companies/:id
 * Get detailed company information
 */
router.get("/companies/:id", async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const company = await db
      .select()
      .from(companies)
      .where(eq(companies.id, id))
      .limit(1);

    if (!company.length) {
      res.status(404).json({ error: "Company not found" });
      return;
    }

    // Get company users
    const companyUsers = await db
      .select({
        id: users.id,
        email: users.emailaddr,
        fullName: users.fullname,
        usertype: users.usertype,
        active: users.active,
        lastLoginAt: users.lastloginedat,
      })
      .from(users)
      .where(eq(users.companyid, id));

    const userCount = companyUsers.length;

    // Latest Stripe subscription record for this company (if any). The Stripe
    // ids/status live in companysubscriptions, not on the companies row.
    const subRows = await db
      .select({
        stripesubscriptionid: companysubscriptions.stripesubscriptionid,
        stripecustomerid: companysubscriptions.stripecustomerid,
        planname: companysubscriptions.planname,
        planamount: companysubscriptions.planamount,
        overageamount: companysubscriptions.overageamount,
        status: companysubscriptions.status,
        currentperiodstart: companysubscriptions.currentperiodstart,
        currentperiodend: companysubscriptions.currentperiodend,
        canceledat: companysubscriptions.canceledat,
      })
      .from(companysubscriptions)
      .where(eq(companysubscriptions.companyid, id))
      .orderBy(desc(companysubscriptions.createdat))
      .limit(1);

    logger.info({ adminId: req.userid, companyId: id }, "SysAdmin retrieved company details");
    res.json({
      ...company[0],
      userCount,
      users: companyUsers,
      subscription: subRows[0] ?? null,
    });
  } catch (error) {
    logger.error({ error, adminId: req.userid, companyId: req.params.id }, "Failed to retrieve company");
    res.status(500).json({ error: "Failed to retrieve company details" });
  }
});

/**
 * PATCH /api/sysadmin/companies/:id
 * Update editable company profile fields (name, contact, plan, seats, billing).
 * Status changes go through PATCH /companies/:id/status, not here.
 */
const companyUpdateSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  contactemail: z.string().email().max(255).optional(),
  phone: z.string().max(20).nullable().optional(),
  billingplan: z.enum(["FREE", "SINGLE_USER", "SMALL_BUSINESS", "CONSULTANT", "ENTERPRISE"]).optional(),
  maxusers: z.number().int().min(1).max(100000).optional(),
  billingemail: z.string().email().max(255).nullable().optional(),
  vatnumber: z.string().trim().max(50).nullable().optional(), // [SCOPE 002 / T076] FR-012a
});

router.patch("/companies/:id", async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const parsed = companyUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid company update", details: parsed.error.flatten() });
      return;
    }
    const fields = parsed.data;
    if (fields.vatnumber === "") fields.vatnumber = null; // [SCOPE 002 / T076] FR-012a — empty clears
    if (Object.keys(fields).length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }

    const existing = await db.select().from(companies).where(eq(companies.id, id)).limit(1);
    if (!existing.length) {
      res.status(404).json({ error: "Company not found" });
      return;
    }

    await db
      .update(companies)
      .set({ ...fields, updatedat: new Date() })
      .where(eq(companies.id, id));

    const updated = await db.select().from(companies).where(eq(companies.id, id)).limit(1);

    logger.info({ adminId: req.userid, companyId: id, fields: Object.keys(fields) }, "SysAdmin updated company profile");
    res.json(updated[0]);
  } catch (error) {
    logger.error({ error, adminId: req.userid, companyId: req.params.id }, "Failed to update company");
    res.status(500).json({ error: "Failed to update company" });
  }
});

/**
 * PATCH /api/sysadmin/companies/:id/status
 * Update company status (suspend, activate, etc.)
 */
router.patch("/companies/:id/status", async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;

    if (!status || !["ACTIVE", "SUSPENDED", "TRIAL", "CANCELED"].includes(status)) {
      res.status(400).json({ error: "Invalid status" });
      return;
    }

    // Update company status
    const updates: any = {
      updatedat: new Date(),
    };

    if (status === "ACTIVE") {
      updates.activeflag = true;
      updates.subscriptionstatus = "ACTIVE";
    } else if (status === "SUSPENDED") {
      // SCOPE-067 "Inactivate": block login AND reflect it in the status badge.
      updates.activeflag = false;
      updates.subscriptionstatus = "SUSPENDED";
    } else {
      updates.subscriptionstatus = status;
    }

    await db
      .update(companies)
      .set(updates)
      .where(eq(companies.id, id));

    logger.info({ adminId: req.userid, companyId: id, newStatus: status, reason }, "SysAdmin changed company status");

    res.json({ 
      success: true, 
      message: `Company status updated to ${status}`,
      companyId: id,
      newStatus: status,
    });
  } catch (error) {
    logger.error({ error, adminId: req.userid, companyId: req.params.id }, "Failed to update company status");
    res.status(500).json({ error: "Failed to update company status" });
  }
});

/**
 * POST /api/sysadmin/companies/:id/restart-link
 * SCOPE-067 — email the company's billing/admin contact a Stripe Customer
 * Portal link to update their card and restore service.
 */
router.post("/companies/:id/restart-link", async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const result = await sendRestartLink(id);
    if (result.sent) {
      logger.info({ adminId: req.userid, companyId: id, to: result.to }, "SysAdmin sent subscription restart link");
      res.json({ success: true, to: result.to });
      return;
    }
    const statusByReason: Record<string, number> = {
      no_company: 404,
      exempt: 400,
      no_stripe_customer: 400,
      no_recipient: 400,
      error: 502,
    };
    res
      .status(statusByReason[result.reason ?? "error"] ?? 500)
      .json({ success: false, reason: result.reason });
  } catch (error) {
    logger.error({ error, adminId: req.userid, companyId: req.params.id }, "Failed to send restart link");
    res.status(500).json({ error: "Failed to send restart link" });
  }
});

/**
 * GET /api/sysadmin/companies/:id/subscription-reason
 * SCOPE-067 follow-up — explain WHY a company's subscription isn't active
 * (live Stripe lookup of the latest invoice's PaymentIntent).
 */
router.get("/companies/:id/subscription-reason", async (req: AuthRequest, res: Response) => {
  try {
    const result = await getSubscriptionReason(req.params.id);
    res.json(result);
  } catch (error) {
    logger.error({ error, adminId: req.userid, companyId: req.params.id }, "Failed to get subscription reason");
    res.status(500).json({ error: "Failed to get subscription reason" });
  }
});

/**
 * POST /api/sysadmin/companies/:id/resync-subscription
 * SCOPE-067 follow-up — reconcile one company's local status from Stripe.
 */
router.post("/companies/:id/resync-subscription", async (req: AuthRequest, res: Response) => {
  try {
    const result = await resyncSubscriptionFromStripe(req.params.id, { changedBy: req.userid });
    logger.info({ adminId: req.userid, companyId: req.params.id, result }, "SysAdmin resynced subscription");
    res.json(result);
  } catch (error) {
    logger.error({ error, adminId: req.userid, companyId: req.params.id }, "Failed to resync subscription");
    res.status(500).json({ error: "Failed to resync subscription" });
  }
});

// [SCOPE 131 / T017] BEGIN — operator-initiated cancel / un-cancel (SPEC-131 Amendment C)
/**
 * POST /api/sysadmin/companies/:id/cancel-subscription
 * Body: { confirmName: string }
 *
 * The operator-side twin of `DELETE /api/company/subscription`. It runs the same
 * SPEC-131 engine — Stripe `cancel_at_period_end`, `cancelrequestedat` stamped,
 * access preserved to period end, the customer emailed — and differs in exactly
 * one respect: the audit row is attributed to SYSADMIN rather than CUSTOMER.
 *
 * It deliberately does NOT reuse the `Inactivate` path. That one flips local
 * status and never contacts Stripe, so a company "cancelled" that way keeps
 * being billed. SCOPE-130 exists because of that divergence; adding a second
 * button with the same flaw would widen the defect rather than close it.
 *
 * The typed company name is re-checked here even though the dialog checks it:
 * the dialog can be bypassed with curl, and this is a billing-terminating action
 * against a company the operator does not belong to.
 */
router.post("/companies/:id/cancel-subscription", async (req: AuthRequest, res: Response) => {
  // String() because req.params is typed `string | string[]` on AuthRequest.
  const id = String(req.params.id);
  try {
    const confirmName =
      typeof req.body?.confirmName === "string" ? req.body.confirmName.trim() : "";

    const [company] = await db
      .select({ name: companies.name })
      .from(companies)
      .where(eq(companies.id, id))
      .limit(1);

    if (!company) {
      res.status(404).json({ error: "Company not found" });
      return;
    }

    // Case-insensitive, matching the customer-side check exactly. A stricter
    // rule here would reject confirmations the other endpoint accepts.
    if (confirmName.toLowerCase() !== company.name.trim().toLowerCase()) {
      logger.warn(
        { adminId: req.userid, companyId: id },
        "SysAdmin cancellation rejected — confirmName mismatch",
      );
      res.status(400).json({
        error: "Type the company name exactly as shown to confirm cancellation.",
        code: "CONFIRM_NAME_MISMATCH",
      });
      return;
    }

    const result = await requestCancellation(id, req.userid ?? null, "SYSADMIN");

    logger.info(
      { adminId: req.userid, companyId: id, effectiveDate: result.effectiveDate },
      "SysAdmin cancelled subscription on behalf of company",
    );
    res.json({ success: true, data: result });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    // A ConflictError here is a legitimate answer ("already cancelled"), not a
    // fault, so it is logged at warn and its message is passed through — the
    // operator needs to read it to know what to do next.
    logger[status >= 500 ? "error" : "warn"](
      { error, adminId: req.userid, companyId: id },
      "SysAdmin subscription cancellation did not complete",
    );
    res.status(status).json({
      error:
        error instanceof AppError
          ? error.message
          : "Failed to cancel subscription",
    });
  }
});

/**
 * POST /api/sysadmin/companies/:id/resume-subscription
 *
 * Clears a pending cancellation before it takes effect. Ships alongside the
 * cancel rather than later, for the reason SPEC-131 gives for the customer-side
 * un-cancel: without it a mis-click is unrecoverable from the product, and the
 * operator's only remedy would be editing the database by hand.
 */
router.post("/companies/:id/resume-subscription", async (req: AuthRequest, res: Response) => {
  const id = String(req.params.id);
  try {
    const result = await reverseCancellation(id, req.userid ?? null, "SYSADMIN");
    logger.info(
      { adminId: req.userid, companyId: id },
      "SysAdmin reversed a pending cancellation",
    );
    res.json({ success: true, data: result });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    logger[status >= 500 ? "error" : "warn"](
      { error, adminId: req.userid, companyId: id },
      "SysAdmin cancellation reversal did not complete",
    );
    res.status(status).json({
      error:
        error instanceof AppError
          ? error.message
          : "Failed to reverse the pending cancellation",
    });
  }
});
// [SCOPE 131 / T017] END

/**
 * POST /api/sysadmin/subscriptions/resync
 * SCOPE-067 follow-up — bulk reconcile non-active companies from Stripe.
 * Body: { dryRun?: boolean } — dryRun returns the planned changes without writing.
 */
router.post("/subscriptions/resync", async (req: AuthRequest, res: Response) => {
  try {
    const dryRun = req.body?.dryRun === true;
    const results = await resyncPendingSubscriptions({ dryRun, changedBy: req.userid });
    const changes = results.filter((r) => r.changed);
    logger.info({ adminId: req.userid, dryRun, scanned: results.length, changes: changes.length }, "SysAdmin bulk subscription resync");
    res.json({ dryRun, scanned: results.length, changed: changes.length, results });
  } catch (error) {
    logger.error({ error, adminId: req.userid }, "Failed to bulk resync subscriptions");
    res.status(500).json({ error: "Failed to resync subscriptions" });
  }
});

/**
 * POST /api/sysadmin/kit/reset-cache
 * SCOPE-086 FR-003 — purge KitProxyService's in-memory archive cache. Useful
 * immediately after a same-tag release-asset re-upload so the proxy stops
 * serving the cached stale archive before its 1-hour TTL / a redeploy.
 */
router.post("/kit/reset-cache", async (req: AuthRequest, res: Response) => {
  try {
    await kitProxyService._resetCache();
    logger.info({ adminId: req.userid }, "SysAdmin reset kit proxy cache");
    res.json({ ok: true, message: "Kit archive cache cleared" });
  } catch (error) {
    logger.error({ error, adminId: req.userid }, "Failed to reset kit cache");
    res.status(500).json({ error: "Failed to reset kit cache" });
  }
});

/**
 * GET /api/sysadmin/users
 * Get all users across all companies with filtering and pagination
 * NOTE: password field is explicitly excluded from all responses
 */
router.get("/users", async (req: AuthRequest, res: Response) => {
  try {
    const { search, companyId, active, limit = "50", offset = "0" } = req.query;
    const limitNum = Number(limit);
    const offsetNum = Number(offset);

    // Build conditions array
    const conditions: any[] = [];

    if (companyId) {
      conditions.push(eq(users.companyid, companyId as string));
    }

    if (active !== undefined) {
      conditions.push(eq(users.active, active === "true"));
    }

    if (search) {
      conditions.push(like(users.emailaddr, `%${search}%`));
    }
    // Get total count
    const totalResult = conditions.length > 0
      ? await db.select({ count: count() }).from(users).where(and(...conditions))
      : await db.select({ count: count() }).from(users);
    const total = Number(totalResult[0]?.count || 0);
    // Execute query
    let results: any[];
    if (conditions.length > 0) {
      results = await db
        .select()
        .from(users)
        .where(and(...conditions))
        .limit(limitNum)
        .offset(offsetNum)
        .orderBy(desc(users.joinedat));
    } else {
      results = await db
        .select()
        .from(users)
        .limit(limitNum)
        .offset(offsetNum)
        .orderBy(desc(users.joinedat));
    }

    // Get company names and strip password field
    const resultsWithCompany = await Promise.all(
      results.map(async (user: any) => {
        const company = await db
          .select({ name: companies.name })
          .from(companies)
          .where(eq(companies.id, user.companyid))
          .limit(1);
        // Destructure to exclude password from response
        const { password: _password, ...safeUser } = user;
        return {
          ...safeUser,
          companyName: company[0]?.name || "Unknown",
        };
      })
    );

    logger.info({ adminId: req.userid, count: results.length }, "SysAdmin retrieved users list");
    res.json({
      users: resultsWithCompany,
      total,
      page: Math.floor(offsetNum / limitNum) + 1,
      limit: limitNum,
      offset: offsetNum,
    });
  } catch (error) {
    logger.error({ error, adminId: req.userid }, "Failed to retrieve users");
    res.status(500).json({ error: "Failed to retrieve users" });
  }
});

/**
 * GET /api/sysadmin/users/:id
 * Get detailed user information
 * NOTE: password field is explicitly excluded from response
 */
router.get("/users/:id", async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (!user.length) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    // Get company info
    const company = await db
      .select()
      .from(companies)
      .where(eq(companies.id, user[0].companyid))
      .limit(1);
    // Strip password from response
    const { password: _password, ...safeUser } = user[0];

    logger.info({ adminId: req.userid, userId: id }, "SysAdmin retrieved user details");
    res.json({
      ...safeUser,
      company: company[0] || null,
    });
  } catch (error) {
    logger.error({ error, adminId: req.userid, userId: req.params.id }, "Failed to retrieve user");
    res.status(500).json({ error: "Failed to retrieve user details" });
  }
});

/**
 * PATCH /api/sysadmin/users/:id/status
 * Enable/disable user account
 */
router.patch("/users/:id/status", async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { active, reason } = req.body;

    if (typeof active !== "boolean") {
      res.status(400).json({ error: "Active status must be boolean" });
      return;
    }

    await db
      .update(users)
      .set({ active })
      .where(eq(users.id, id));

    logger.info({ adminId: req.userid, userId: id, active, reason }, "SysAdmin changed user status");

    res.json({
      success: true,
      message: `User ${active ? "enabled" : "disabled"}`,
      userId: id,
      active,
    });
  } catch (error) {
    logger.error({ error, adminId: req.userid, userId: req.params.id }, "Failed to update user status");
    res.status(500).json({ error: "Failed to update user status" });
  }
});

/**
 * PATCH /api/sysadmin/users/:id/usertype
 * Update user usertype (e.g., promote to ADMIN or demote to TEAM_MEMBER)
 */
router.patch("/users/:id/usertype", async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { usertype, reason } = req.body;

    // Validate usertype
    const validUserTypes = ["SYSADMIN", "ADMIN", "TEAM_MANAGER", "TEAM_MEMBER"];
    if (!usertype || !validUserTypes.includes(usertype)) {
      res.status(400).json({ error: "Invalid usertype. Must be one of: " + validUserTypes.join(", ") });
      return;
    }

    // Prevent changing own usertype (safety measure)
    if (id === req.userid) {
      res.status(403).json({ error: "Cannot change your own usertype" });
      return;
    }

    // Check if user exists
    const user = await db
      .select({ id: users.id, emailaddr: users.emailaddr, usertype: users.usertype })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (!user.length) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const oldUserType = user[0].usertype;

    // Update usertype
    await db
      .update(users)
      .set({ usertype })
      .where(eq(users.id, id));

    logger.info({ 
      adminId: req.userid, 
      userId: id, 
      oldUserType, 
      newUserType: usertype, 
      reason 
    }, "SysAdmin changed user usertype");

    res.json({
      success: true,
      message: `User usertype updated from ${oldUserType} to ${usertype}`,
      userId: id,
      oldUserType,
      newUserType: usertype,
    });
  } catch (error) {
    logger.error({ error, adminId: req.userid, userId: req.params.id }, "Failed to update user usertype");
    res.status(500).json({ error: "Failed to update user usertype" });
  }
});


/**
 * POST /api/sysadmin/users/:id/reset-password
 * Reset user password (generates temporary password)
 */
router.post("/users/:id/reset-password", async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // TODO: Generate temporary password and send email
    const tempPassword = Math.random().toString(36).slice(-12);

    logger.info({ adminId: req.userid, userId: id }, "SysAdmin reset user password");

    res.json({
      success: true,
      message: "Password reset email sent",
      userId: id,
      tempPassword: process.env.NODE_ENV === "development" ? tempPassword : undefined,
    });
  } catch (error) {
    logger.error({ error, adminId: req.userid, userId: req.params.id }, "Failed to reset user password");
    res.status(500).json({ error: "Failed to reset password" });
  }
});

/**
 * POST /api/sysadmin/users/create
 * Recovery endpoint to create a user directly without company creation or email sending.
 * Requires SYSADMIN authentication.
 */
const createUserSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  companyid: z.string().uuid("Invalid company ID"),
  fullname: z.string().optional(),
  usertype: z.enum(["SYSADMIN", "ADMIN", "TEAM_MANAGER", "TEAM_MEMBER"]).default("TEAM_MEMBER"),
});


router.post(
  "/users/create",
  validateBody(createUserSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { email, password, companyid, fullname, usertype } = req.body as {
        email: string;
        password: string;
        companyid: string;
        fullname?: string;
        usertype: "SYSADMIN" | "ADMIN" | "TEAM_MANAGER" | "TEAM_MEMBER";
      };


      // Verify company exists
      const company = await db
        .select({ id: companies.id, name: companies.name })
        .from(companies)
        .where(eq(companies.id, companyid))
        .limit(1);

      if (company.length === 0) {
        res.status(404).json({ error: "Company not found" });
        return;
      }

      // Check if user already exists
      const existingUser = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.emailaddr, email))
        .limit(1);

      if (existingUser.length > 0) {
        res.status(409).json({ error: "User with this email already exists" });
        return;
      }

      // Create user
      const userId = crypto.randomUUID();
      const passwordHash = await hashPassword(password);
      const resolvedFullname = fullname || email.split("@")[0];

      await db.insert(users).values({
        id: userId,
        emailaddr: email,
        password: passwordHash,
        fullname: resolvedFullname,
        companyid: companyid,
        usertype: usertype,
        active: true,
        securitylevel: 1,
        timezone: "UTC",
        tracktime: true,
        joinedat: new Date(),
      });

      logger.info(
        { adminId: req.userid, userId, companyid, email, usertype },
        "SysAdmin created user directly (recovery)"
      );

      res.status(201).json({
        success: true,
        message: "User created successfully",
        user: {
          id: userId,
          email: email,
          fullname: resolvedFullname,
          companyid: companyid,
          companyName: company[0].name,
          usertype: usertype,
          active: true,
        },
      });
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create user";
      logger.error({ error: message, adminId: req.userid }, "SysAdmin user creation error");
      res.status(500).json({ error: message });
      return;
    }
  }
);

/**
 * POST /api/sysadmin/companies
 * Create a new company
 */
router.post("/companies", async (req: AuthRequest, res: Response) => {
  try {
    const { name, contactemail, phone, billingPlan } = req.body;

    if (!name || !contactemail) {
      res.status(400).json({ error: "Name and contact email are required" });
      return;
    }

    const result = await SysAdminCompanyService.createCompany({
      name,
      contactemail,
      phone,
      billingPlan,
      createdBy: req.userid,
    });

    logger.info({ adminId: req.userid, companyId: result.id }, "SysAdmin created company via API");
    res.status(201).json(result);
  } catch (error) {
    logger.error({ error, adminId: req.userid }, "Failed to create company");
    res.status(500).json({ error: "Failed to create company" });
  }
});

/**
 * DELETE /api/sysadmin/companies/:id
 * Soft delete a company
 */
router.delete("/companies/:id", async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { reason, retentionDays } = req.body;

    const result = await SysAdminCompanyService.deleteCompany(
      id,
      reason || "Deleted by SysAdmin",
      req.userid!,
      retentionDays || 30
    );

    logger.info({ adminId: req.userid, companyId: id }, "SysAdmin deleted company");
    res.json(result);
  } catch (error) {
    logger.error({ error, adminId: req.userid, companyId: req.params.id }, "Failed to delete company");
    res.status(500).json({ error: "Failed to delete company" });
  }
});

/**
 * GET /api/sysadmin/companies/:id/analytics
 * Get company analytics
 */
router.get("/companies/:id/analytics", async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { period } = req.query;

    const analytics = await SysAdminCompanyService.getCompanyAnalytics(
      id,
      period as string
    );

    logger.info({ adminId: req.userid, companyId: id }, "SysAdmin retrieved company analytics");
    res.json(analytics);
  } catch (error) {
    logger.error({ error, adminId: req.userid, companyId: req.params.id }, "Failed to get company analytics");
    res.status(500).json({ error: "Failed to retrieve company analytics" });
  }
});

/**
 * POST /api/sysadmin/users/transfer
 * Transfer user between companies
 */
router.post("/users/transfer", async (req: AuthRequest, res: Response) => {
  try {
    const { userId, targetCompanyId, newRole, reason } = req.body;

    if (!userId || !targetCompanyId) {
      res.status(400).json({ error: "User ID and target company ID are required" });
      return;
    }

    const result = await SysAdminUserService.transferUser(
      { userId, targetCompanyId, newRole, reason },
      req.userid!
    );

    logger.info({ adminId: req.userid, userId, targetCompanyId }, "SysAdmin transferred user");
    res.json(result);
  } catch (error) {
    logger.error({ error, adminId: req.userid }, "Failed to transfer user");
    res.status(500).json({ error: "Failed to transfer user" });
  }
});

/**
 * GET /api/sysadmin/users/:id/activity
 * Get user activity across companies
 */
router.get("/users/:id/activity", async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { period } = req.query;

    const activity = await SysAdminUserService.getUserActivity(
      id,
      period as string
    );

    logger.info({ adminId: req.userid, userId: id }, "SysAdmin retrieved user activity");
    res.json(activity);
  } catch (error) {
    logger.error({ error, adminId: req.userid, userId: req.params.id }, "Failed to get user activity");
    res.status(500).json({ error: "Failed to retrieve user activity" });
  }
});

/**
 * GET /api/sysadmin/metrics/platform
 * Alias for /metrics — platform-wide metrics (spec FR4 path)
 */
router.get("/metrics/platform", async (req: AuthRequest, res: Response) => {
  try {
    const metrics = await SysAdminMetricsService.getPlatformMetrics();
    logger.info({ adminId: req.userid }, "SysAdmin retrieved platform metrics");
    res.json(metrics);
  } catch (error) {
    logger.error({ error, adminId: req.userid }, "Failed to get platform metrics");
    res.status(500).json({ error: "Failed to retrieve platform metrics" });
  }
});

/**
 * GET /api/sysadmin/metrics/revenue
 * Get revenue metrics
 */
router.get("/metrics/revenue", async (req: AuthRequest, res: Response) => {
  try {
    const metrics = await SysAdminMetricsService.getRevenueMetrics();
    logger.info({ adminId: req.userid }, "SysAdmin retrieved revenue metrics");
    res.json(metrics);
  } catch (error) {
    logger.error({ error, adminId: req.userid }, "Failed to get revenue metrics");
    res.status(500).json({ error: "Failed to retrieve revenue metrics" });
  }
});

/**
 * GET /api/sysadmin/metrics/database
 * Get database health metrics
 */
router.get("/metrics/database", async (req: AuthRequest, res: Response) => {
  try {
    const health = await SysAdminMetricsService.getDatabaseHealth();
    logger.info({ adminId: req.userid }, "SysAdmin retrieved database health");
    res.json(health);
  } catch (error) {
    logger.error({ error, adminId: req.userid }, "Failed to get database health");
    res.status(500).json({ error: "Failed to retrieve database health" });
  }
});

/**
 * GET /api/sysadmin/metrics/jobs
 * Get job queue status
 */
router.get("/metrics/jobs", async (req: AuthRequest, res: Response) => {
  try {
    const status = await SysAdminMetricsService.getJobQueueStatus();
    logger.info({ adminId: req.userid }, "SysAdmin retrieved job queue status");
    res.json(status);
  } catch (error) {
    logger.error({ error, adminId: req.userid }, "Failed to get job queue status");
    res.status(500).json({ error: "Failed to retrieve job queue status" });
  }
});

/**
 * GET /api/sysadmin/metrics/integrations
 * Get integration health
 */
router.get("/metrics/integrations", async (req: AuthRequest, res: Response) => {
  try {
    const health = await SysAdminMetricsService.getIntegrationHealth();
    logger.info({ adminId: req.userid }, "SysAdmin retrieved integration health");
    res.json(health);
  } catch (error) {
    logger.error({ error, adminId: req.userid }, "Failed to get integration health");
    res.status(500).json({ error: "Failed to retrieve integration health" });
  }
});

/**
 * GET /api/sysadmin/settings
 * Get all system settings
 */
router.get("/settings", async (req: AuthRequest, res: Response) => {
  try {
    const settings = await db.select().from(systemSettings);
    logger.info({ adminId: req.userid }, "SysAdmin retrieved system settings");
    res.json(settings);
  } catch (error) {
    logger.error({ error, adminId: req.userid }, "Failed to get system settings");
    res.status(500).json({ error: "Failed to retrieve system settings" });
  }
});

/**
 * PUT /api/sysadmin/settings/:key
 * Update a system setting
 */
router.put("/settings/:key", async (req: AuthRequest, res: Response) => {
  try {
    const { key } = req.params;
    const { value, category, description, changeReason } = req.body;

    // Get current setting
    const existing = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, key))
      .limit(1);

    const now = new Date();

    if (existing.length > 0) {
      // Update existing
      await db
        .update(systemSettings)
        .set({
          value,
          updatedat: now,
          updatedby: req.userid,
        })
        .where(eq(systemSettings.key, key));

      // Log history
      await db.insert(systemSettingsHistory).values({
        settingid: existing[0].id,
        previousvalue: existing[0].value,
        newvalue: value,
        changedat: now,
        changedby: req.userid,
        changereason: changeReason || "Updated by SysAdmin",
      });
    } else {
      // Create new
      await db.insert(systemSettings).values({
        key,
        value,
        category: category || "general",
        description,
        updatedat: now,
        updatedby: req.userid,
      });
    }

    logger.info({ adminId: req.userid, key }, "SysAdmin updated system setting");
    res.json({ success: true, key, value });
  } catch (error) {
    logger.error({ error, adminId: req.userid, key: req.params.key }, "Failed to update setting");
    res.status(500).json({ error: "Failed to update setting" });
  }
});

/**
 * GET /api/sysadmin/settings/:key/history
 * Get setting change history
 */
router.get("/settings/:key/history", async (req: AuthRequest, res: Response) => {
  try {
    const { key } = req.params;

    // Get setting
    const setting = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, key))
      .limit(1);

    if (!setting.length) {
      res.status(404).json({ error: "Setting not found" });
      return;
    }

    // Get history
    const history = await db
      .select()
      .from(systemSettingsHistory)
      .where(eq(systemSettingsHistory.settingid, setting[0].id))
      .orderBy(desc(systemSettingsHistory.changedat));

    logger.info({ adminId: req.userid, key }, "SysAdmin retrieved setting history");
    res.json({ setting: setting[0], history });
  } catch (error) {
    logger.error({ error, adminId: req.userid, key: req.params.key }, "Failed to get setting history");
    res.status(500).json({ error: "Failed to retrieve setting history" });
  }
});

/**
 * GET /api/sysadmin/health
 * Get system health status
 */
router.get("/health", async (req: AuthRequest, res: Response) => {
  try {
    // Check database connectivity
    const dbHealth = await db.execute(sql`SELECT 1`);

    const health = {
      database: dbHealth ? "healthy" : "critical",
      api: "healthy",
      email: "healthy",
      payments: "healthy",
      queue: "healthy",
      timestamp: new Date().toISOString(),
    };

    res.json(health);
  } catch (error) {
    logger.error({ error, adminId: req.userid }, "Health check failed");
    res.status(500).json({
      database: "critical",
      api: "warning",
      email: "unknown",
      payments: "unknown",
      queue: "unknown",
      timestamp: new Date().toISOString(),
    });
  }
});

// [SCOPE 043 / T006] BEGIN — User Feedback triage surface (spec 043)
// Queue + triage for wxperts platform admins: list with AI triage results,
// status transitions (firsttriagedat on first touch), internal notes, send the
// single clarifying question, and manual retry of a failed notification leg.
const feedbackStatusSchema = z.object({
  status: z.enum(FeedbackTriageService.FEEDBACK_STATUSES),
  declineReason: z.string().max(2000).optional(),
});
const feedbackNoteSchema = z.object({ note: z.string().min(1).max(4000) });
const feedbackClarifySchema = z.object({ question: z.string().min(1).max(2000) });

router.get("/feedback", async (req: AuthRequest, res: Response) => {
  try {
    const statusRaw = typeof req.query.status === "string" ? req.query.status : undefined;
    const status = (FeedbackTriageService.FEEDBACK_STATUSES as readonly string[]).includes(statusRaw ?? "")
      ? (statusRaw as FeedbackTriageService.FeedbackStatus)
      : undefined;
    // [SCOPE 061] BEGIN — optional source/type filters for auto-error triage
    const sourceRaw = typeof req.query.source === "string" ? req.query.source : undefined;
    const source = (FeedbackTriageService.FEEDBACK_SOURCES as readonly string[]).includes(sourceRaw ?? "")
      ? (sourceRaw as FeedbackTriageService.FeedbackSource)
      : undefined;
    const typeRaw = typeof req.query.type === "string" ? req.query.type : undefined;
    const type = (["bug", "suggestion", "error"] as readonly string[]).includes(typeRaw ?? "")
      ? typeRaw
      : undefined;
    // [SCOPE 110 / T012] dismissed visibility — default excludes dismissed rows.
    const dismissedRaw = typeof req.query.dismissed === "string" ? req.query.dismissed : undefined;
    const dismissed = (["exclude", "only", "include"] as readonly string[]).includes(dismissedRaw ?? "")
      ? (dismissedRaw as "exclude" | "only" | "include")
      : undefined;
    const filter =
      status || source || type || dismissed
        ? {
            ...(status && { status }),
            ...(source && { source }),
            ...(type && { type }),
            ...(dismissed && { dismissed }),
          }
        : undefined;
    const items = await FeedbackTriageService.listFeedback(filter);
    // [SCOPE 061] END
    // [SCOPE 043 / T029] Amendment E (FR-025): the queue carries attachment
    // METADATA, never the content. Full text is served per-attachment below.
    res.json({
      items: items.map((it) => ({ ...it, details: stripAttachmentContent(it.details) })),
    });
  } catch (error) {
    logger.error({ error, adminId: req.userid }, "Failed to list feedback");
    res.status(500).json({ error: "Failed to list feedback" });
  }
});

// [SCOPE 043 / T014] BEGIN — v2 feedback analytics (FR-016). Registered BEFORE
// /feedback/:id so "metrics" is not captured as an :id param.
router.get("/feedback/metrics", async (req: AuthRequest, res: Response) => {
  try {
    const metrics = await FeedbackTriageService.getFeedbackMetrics();
    res.json({ metrics });
  } catch (error) {
    logger.error({ error, adminId: req.userid }, "Failed to compute feedback metrics");
    res.status(500).json({ error: "Failed to compute feedback metrics" });
  }
});
// [SCOPE 043 / T014] END

router.get("/feedback/:id", async (req: AuthRequest, res: Response) => {
  try {
    const row = await FeedbackTriageService.getFeedback(req.params.id);
    if (!row) {
      res.status(404).json({ error: "Feedback not found" });
      return;
    }
    res.json({ feedback: row });
  } catch (error) {
    logger.error({ error, adminId: req.userid }, "Failed to get feedback");
    res.status(500).json({ error: "Failed to get feedback" });
  }
});

// [SCOPE 043 / T029] BEGIN — Amendment E: serve one attachment in full (FR-025)
// The single place the full text is available. Everything else — the queue, the
// Cockpit's list, the triage prompt, the lifecycle artifact — carries a bounded
// excerpt, so the cost of an attached log is paid once, by the one admin who
// chose to open it. Behind the router's authenticateToken + requireSysAdmin.
router.get("/feedback/:id/attachments/:index", async (req: AuthRequest, res: Response) => {
  try {
    // Express types these as string | string[]; take the scalar deliberately
    // rather than letting a repeated param arrive as an array.
    const feedbackId = String(req.params.id);
    const row = await FeedbackTriageService.getFeedback(feedbackId);
    if (!row) {
      res.status(404).json({ error: "Feedback not found" });
      return;
    }
    const attachments = attachmentsOf(row.details);
    const index = Number.parseInt(String(req.params.index), 10);
    if (!Number.isInteger(index) || index < 0 || index >= attachments.length) {
      res.status(404).json({ error: "Attachment not found" });
      return;
    }
    const attachment = attachments[index];
    // The name came from a submitter's filesystem. Reduce it to a safe token
    // before it reaches a Content-Disposition header, where a quote or newline
    // would let it rewrite the header rather than name the file.
    const safeName =
      attachment.name.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120) || "attachment.txt";
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(attachment.content);
  } catch (error) {
    logger.error({ error, adminId: req.userid }, "Failed to download feedback attachment");
    res.status(500).json({ error: "Failed to download attachment" });
  }
});
// [SCOPE 043 / T029] END

router.patch(
  "/feedback/:id/status",
  validateBody(feedbackStatusSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { status, declineReason } = req.body as z.infer<typeof feedbackStatusSchema>;
      const row = await FeedbackTriageService.transitionStatus(req.params.id, status, {
        declineReason,
        adminId: req.userid,
      });
      res.json({ feedback: row });
    } catch (error) {
      logger.error({ error, adminId: req.userid }, "Failed to transition feedback status");
      res.status(400).json({ error: (error as Error).message });
    }
  },
);

router.post(
  "/feedback/:id/note",
  validateBody(feedbackNoteSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { note } = req.body as z.infer<typeof feedbackNoteSchema>;
      const row = await FeedbackTriageService.addInternalNote(req.params.id, note, req.userid);
      res.json({ feedback: row });
    } catch (error) {
      logger.error({ error, adminId: req.userid }, "Failed to add feedback note");
      res.status(400).json({ error: (error as Error).message });
    }
  },
);

router.post(
  "/feedback/:id/clarify",
  validateBody(feedbackClarifySchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { question } = req.body as z.infer<typeof feedbackClarifySchema>;
      const row = await FeedbackTriageService.sendClarification(req.params.id, question, req.userid);
      res.json({ feedback: row });
    } catch (error) {
      logger.error({ error, adminId: req.userid }, "Failed to send feedback clarification");
      res.status(400).json({ error: (error as Error).message });
    }
  },
);

router.post("/feedback/:id/retry-notification", async (req: AuthRequest, res: Response) => {
  try {
    const result = await FeedbackTriageService.retryNotification(req.params.id);
    res.json(result);
  } catch (error) {
    logger.error({ error, adminId: req.userid }, "Failed to retry feedback notification");
    res.status(500).json({ error: "Failed to retry notification" });
  }
});
// [SCOPE 043 / T006] END

// [SCOPE 110 / T008] BEGIN — bulk removal: dismiss / undismiss / purge (FR-001/002/003/007)
// Every action takes a SET of ids; a single record is a one-element call. Purge is
// audited and guarded by a confirmation proportionate to the selection (FR-007).
const feedbackBulkSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
});
const feedbackPurgeSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
  confirm: z.boolean().optional(),
  confirmText: z.string().max(32).optional(),
});

router.post("/feedback/dismiss", validateBody(feedbackBulkSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { ids } = req.body as z.infer<typeof feedbackBulkSchema>;
    const result = await FeedbackTriageService.dismissFeedback(ids, req.userid);
    res.json(result);
  } catch (error) {
    logger.error({ error, adminId: req.userid }, "Failed to dismiss feedback");
    res.status(400).json({ error: (error as Error).message });
  }
});

router.post("/feedback/undismiss", validateBody(feedbackBulkSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { ids } = req.body as z.infer<typeof feedbackBulkSchema>;
    const result = await FeedbackTriageService.undismissFeedback(ids);
    res.json(result);
  } catch (error) {
    logger.error({ error, adminId: req.userid }, "Failed to undismiss feedback");
    res.status(400).json({ error: (error as Error).message });
  }
});

router.post("/feedback/purge", validateBody(feedbackPurgeSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { ids, confirm, confirmText } = req.body as z.infer<typeof feedbackPurgeSchema>;
    const result = await FeedbackTriageService.purgeFeedback(ids, {
      adminId: req.userid,
      confirm,
      confirmText,
    });
    res.json(result);
  } catch (error) {
    // FR-007 — surface the human-submitted titles so the client can render the
    // typed-DELETE confirmation with exactly what is about to be destroyed.
    if (error instanceof FeedbackTriageService.PurgeConfirmationError) {
      res.status(409).json({
        error: error.message,
        confirmationRequired: "DELETE",
        humanTitles: error.humanTitles,
      });
      return;
    }
    logger.error({ error, adminId: req.userid }, "Failed to purge feedback");
    res.status(400).json({ error: (error as Error).message });
  }
});
// [SCOPE 110 / T008] END

// [SCOPE 043 / T014] BEGIN — v2 disposition decision + accept-to-scope (FR-012/013)
const feedbackDispositionSchema = z.object({
  disposition: z.enum(FeedbackTriageService.FEEDBACK_DISPOSITIONS),
});
const feedbackAcceptScopeSchema = z.object({
  title: z.string().min(1).max(255).optional(),
});

router.patch(
  "/feedback/:id/disposition",
  validateBody(feedbackDispositionSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { disposition } = req.body as z.infer<typeof feedbackDispositionSchema>;
      const row = await FeedbackTriageService.setDisposition(req.params.id, disposition, req.userid);
      res.json({ feedback: row });
    } catch (error) {
      logger.error({ error, adminId: req.userid }, "Failed to set feedback disposition");
      res.status(400).json({ error: (error as Error).message });
    }
  },
);

router.post(
  "/feedback/:id/accept-to-scope",
  validateBody(feedbackAcceptScopeSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { title } = req.body as z.infer<typeof feedbackAcceptScopeSchema>;
      const result = await FeedbackTriageService.acceptToScope(
        req.params.id,
        title ? { title } : undefined,
        req.userid,
      );
      res.json(result);
    } catch (error) {
      logger.error({ error, adminId: req.userid }, "Failed to accept feedback to scope");
      res.status(400).json({ error: (error as Error).message });
    }
  },
);
// [SCOPE 043 / T014] END

// [SCOPE 044 / T003] BEGIN — Landing-Page Docs management (SysAdmin-only CRUD)
const docsBodySchema = z.object({
  title: z.string().min(1).max(255),
  slug: z.string().max(255).optional(),
  summary: z.string().optional(),
  content: z.string().default(""),
  videourl: z.string().max(1000).optional().nullable(),
  posterurl: z.string().max(1000).optional().nullable(),
  sortorder: z.number().int().default(0),
  // 'active' = published, 'draft' = hidden from the public /docs page.
  status: z.enum(["active", "draft", "archived"]).default("draft"),
});
const docsUpdateSchema = docsBodySchema.partial();

/**
 * GET /api/sysadmin/docs — list every docs record (any status) for management.
 */
router.get("/docs", async (_req: AuthRequest, res: Response) => {
  try {
    const docs = await helpService.listDocsForAdmin();
    res.json({ docs });
  } catch (error) {
    logger.error({ error }, "Failed to list docs");
    res.status(500).json({ error: "Failed to list docs" });
  }
});

/**
 * POST /api/sysadmin/docs — create a docs record.
 */
router.post("/docs", validateBody(docsBodySchema), async (req: AuthRequest, res: Response) => {
  try {
    const body = req.body as z.infer<typeof docsBodySchema>;
    const doc = await helpService.createDoc({ ...body, createdBy: req.userid });
    res.status(201).json({ doc });
  } catch (error) {
    logger.error({ error, adminId: req.userid }, "Failed to create doc");
    res.status(400).json({ error: (error as Error).message });
  }
});

/**
 * PUT /api/sysadmin/docs/:id — update a docs record (text, video, order, status).
 */
router.put("/docs/:id", validateBody(docsUpdateSchema), async (req: AuthRequest, res: Response) => {
  try {
    const body = req.body as z.infer<typeof docsUpdateSchema>;
    const doc = await helpService.updateDoc(req.params.id, { ...body, updatedBy: req.userid });
    if (!doc) {
      res.status(404).json({ error: "Doc not found" });
      return;
    }
    res.json({ doc });
  } catch (error) {
    logger.error({ error, adminId: req.userid }, "Failed to update doc");
    res.status(400).json({ error: (error as Error).message });
  }
});

/**
 * DELETE /api/sysadmin/docs/:id — remove a docs record.
 */
router.delete("/docs/:id", async (req: AuthRequest, res: Response) => {
  try {
    const ok = await helpService.deleteDoc(req.params.id);
    if (!ok) {
      res.status(404).json({ error: "Doc not found" });
      return;
    }
    res.json({ success: true });
  } catch (error) {
    logger.error({ error, adminId: req.userid }, "Failed to delete doc");
    res.status(500).json({ error: "Failed to delete doc" });
  }
});
// [SCOPE 044 / T003] END

// [SCOPE 023 / T110] BEGIN — signup invitations (FR-002a mint surface)
const createSignupInviteSchema = z.object({
  email: z.string().email("Invalid email"),
  billingplan: z.enum(["SINGLE_USER", "SMALL_BUSINESS", "CONSULTANT", "ENTERPRISE"]),
  // Capped at 2 months by product decision — see MAX_PROMO_DAYS. The service
  // re-checks; this just rejects earlier with a cleaner message.
  promodays: z.number().int().min(1).max(MAX_PROMO_DAYS),
});

// [SCOPE 023 / T114] BEGIN — preview + edit before send (FR-002a.1)
/**
 * The raw token is never stored (only its sha256), so it exists solely in the
 * create response. Preview and send therefore take it back from the browser and
 * re-hash it to prove it matches — which keeps the no-plaintext-at-rest property
 * while still letting the email be composed after the invitation is minted.
 */
const signupInviteEmailSchema = z.object({
  rawToken: z.string().regex(/^[a-f0-9]{64}$/i, "Invalid invitation"),
  subject: z.string().min(1, "Subject required").max(200),
  message: z.string().max(4000).optional(),
  // [SCOPE 023 / T116] FR-002a.2 — unknown locales fall back to English rather
  // than being rejected, so a stale client can never fail to send.
  locale: z.string().max(10).optional(),
});

/** Render the exact email for an invitation. Shared by preview and send so the
 *  preview cannot drift from what actually goes out. */
async function renderInviteEmail(
  invitation: { email: string; billingplan: string; promodays: number; expiresat: Date },
  rawToken: string,
  message?: string | null,
  locale: string = "en-US",
): Promise<{ html: string; text: string; registerLink: string }> {
  const registerLink = `${process.env.CLIENT_URL || "http://localhost:5173"}/register?invite=${rawToken}`;
  const validation = await validateTierSelection(
    invitation.billingplan as Parameters<typeof validateTierSelection>[0],
  );
  return {
    registerLink,
    html: getSignupInvitationEmailHTML(
      invitation.email,
      invitation.billingplan,
      invitation.promodays,
      validation.monthlyPrice,
      invitation.expiresat,
      registerLink,
      message,
      locale,
    ),
    text: getSignupInvitationEmailText(
      invitation.email,
      invitation.billingplan,
      invitation.promodays,
      validation.monthlyPrice,
      invitation.expiresat,
      registerLink,
      message,
      locale,
    ),
  };
}

// [SCOPE 023 / T116] BEGIN — translate the admin's message (FR-002a.2)
const translateMessageSchema = z.object({
  text: z.string().min(1, "Nothing to translate").max(4000),
  locale: z.string().max(10),
});

/**
 * POST /api/sysadmin/signup-invitations/translate
 * Machine-translate the admin's own message only — never the template, which is
 * pre-authored per language. The result is returned for review, not sent: FR-002a.2
 * forbids sending an unreviewed machine translation.
 *
 * Reuses MarketingAIService.translateText, which returns null on an unknown
 * locale or any model error. That null is surfaced as a clear failure so the
 * admin keeps their original text rather than silently sending English.
 */
router.post(
  "/signup-invitations/translate",
  validateBody(translateMessageSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { text, locale } = req.body;

      if (locale === "en-US") {
        res.json({ success: true, text, unchanged: true });
        return;
      }

      const translated = await translateText(text, locale);
      if (!translated) {
        res.status(502).json({
          error: "Translation is unavailable right now — your message is unchanged.",
        });
        return;
      }

      logger.info({ adminId: req.userid, locale }, "Translated signup-invitation message");
      res.json({ success: true, text: translated });
    } catch (error) {
      logger.error({ error, adminId: req.userid }, "Failed to translate invitation message");
      res.status(502).json({
        error: "Translation failed — your message is unchanged.",
      });
    }
  },
);
// [SCOPE 023 / T116] END
// [SCOPE 023 / T114] END

/**
 * POST /api/sysadmin/signup-invitations
 * Issue an invite-bound promotional signup. Returns the link ONCE — the raw
 * token is not stored (only its sha256), so it can never be shown again.
 *
 * [SCOPE 023 / T114] Deliberately sends NO email (FR-002a.1). Creating and
 * sending are separate steps so the email can be previewed and edited first.
 */
router.post(
  "/signup-invitations",
  validateBody(createSignupInviteSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { email, billingplan, promodays } = req.body;

      const { invitation, rawToken } = await createSignupInvitation({
        email,
        billingplan,
        promodays,
        invitedbyid: req.userid ?? null,
      });

      const registerLink = `${process.env.CLIENT_URL || "http://localhost:5173"}/register?invite=${rawToken}`;

      logger.info(
        { adminId: req.userid, invitationId: invitation.id, email, promodays },
        "SysAdmin issued signup invitation (email not yet sent)",
      );

      res.status(201).json({
        success: true,
        invitation: { ...invitation, tokenhash: undefined },
        registerLink,
        rawToken,
        defaultSubject: getSignupInvitationEmailSubject(promodays, "en-US"),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create invitation";
      logger.error({ error: message, adminId: req.userid }, "Failed to create signup invitation");
      // These are all caller-input problems (duplicate email, already has an
      // account, bad promo length), not server faults.
      res.status(400).json({ error: message });
    }
  },
);

// [SCOPE 023 / T114] BEGIN — POST preview + POST send (FR-002a.1)
/**
 * POST /api/sysadmin/signup-invitations/preview
 * Render the exact email that would be sent, without sending it. Uses the same
 * renderer as /send, so the preview cannot drift from the real thing.
 */
router.post(
  "/signup-invitations/preview",
  validateBody(signupInviteEmailSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { rawToken, subject, message, locale } = req.body;

      const resolved = await resolveSignupInvitationByToken(rawToken);
      if (!resolved.ok) {
        res.status(400).json({ error: "This invitation is no longer valid.", code: `INVITE_${resolved.reason}` });
        return;
      }

      const { html, registerLink } = await renderInviteEmail(resolved.invitation, rawToken, message, locale);
      res.json({
        success: true,
        subject,
        html,
        registerLink,
        to: resolved.invitation.email,
        // [SCOPE 023 / T116] So the client can offer this language's default
        // subject when the admin hasn't written their own.
        defaultSubject: getSignupInvitationEmailSubject(
          resolved.invitation.promodays,
          locale ?? "en-US",
        ),
      });
    } catch (error) {
      logger.error({ error, adminId: req.userid }, "Failed to preview signup invitation email");
      res.status(500).json({ error: "Failed to render preview" });
    }
  },
);

/**
 * POST /api/sysadmin/signup-invitations/send
 * Send the invitation email with the admin's subject + message.
 *
 * A send failure is reported, not swallowed — the invitation stays usable via
 * its link either way (FR-002a.1), so a dead SMTP path never strands an invite.
 */
router.post(
  "/signup-invitations/send",
  validateBody(signupInviteEmailSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { rawToken, subject, message, locale } = req.body;

      // resolve re-hashes the token and rejects redeemed/revoked/expired, so a
      // spent invitation can't have its email sent.
      const resolved = await resolveSignupInvitationByToken(rawToken);
      if (!resolved.ok) {
        res.status(400).json({ error: "This invitation is no longer valid.", code: `INVITE_${resolved.reason}` });
        return;
      }

      const { html, text } = await renderInviteEmail(resolved.invitation, rawToken, message, locale);

      let emailSent = false;
      let emailError: string | null = null;
      try {
        const result = await sendEmail(resolved.invitation.email, subject, html, text);
        // sendEmail returns "logged-dev" and sends NOTHING when SMTP_HOST is
        // unset. Treat that as a failure to report, not a success.
        emailSent = result.status !== "logged-dev";
        if (!emailSent) emailError = "SMTP is not configured — no email was sent. Send the link yourself.";
      } catch (err) {
        emailError = err instanceof Error ? err.message : "Email send failed";
      }

      logger.info(
        { adminId: req.userid, invitationId: resolved.invitation.id, emailSent },
        "SysAdmin sent signup invitation email",
      );

      res.json({ success: true, emailSent, emailError });
    } catch (error) {
      logger.error({ error, adminId: req.userid }, "Failed to send signup invitation email");
      res.status(500).json({ error: "Failed to send invitation email" });
    }
  },
);
// [SCOPE 023 / T114] END

/**
 * GET /api/sysadmin/signup-invitations
 * List all signup invitations with live status. Never returns tokens.
 */
router.get("/signup-invitations", async (req: AuthRequest, res: Response) => {
  try {
    const invitations = await listSignupInvitations();
    res.json({
      success: true,
      invitations: invitations.map((i) => ({ ...i, tokenhash: undefined })),
    });
  } catch (error) {
    logger.error({ error, adminId: req.userid }, "Failed to list signup invitations");
    res.status(500).json({ error: "Failed to list invitations" });
  }
});

/**
 * DELETE /api/sysadmin/signup-invitations/:id
 * Revoke a pending invitation. Writes 'revoked' — not 'expired'.
 */
router.delete("/signup-invitations/:id", async (req: AuthRequest, res: Response) => {
  try {
    const invitationId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;
    const revoked = await revokeSignupInvitation(invitationId);
    if (!revoked) {
      res.status(409).json({
        error: "Only a pending invitation can be revoked — this one is already used, revoked or expired.",
      });
      return;
    }
    logger.info(
      { adminId: req.userid, invitationId: req.params.id },
      "SysAdmin revoked signup invitation",
    );
    res.json({ success: true });
  } catch (error) {
    logger.error({ error, adminId: req.userid }, "Failed to revoke signup invitation");
    res.status(500).json({ error: "Failed to revoke invitation" });
  }
});
// [SCOPE 023 / T110] END

export default router;
