import { Router, Request, Response } from "express";
import { z } from "zod";
import {
  validateTierSelection,
  createRegistrationSubscription,
  resolvePromoDays,
  getGlobalPromoDays,
  getCompanySubscriptionRow,
  startSubscriptionCardUpdate,
  setCompanyBillingPlan, // [SCOPE 090 / T007]
  confirmSubscriptionCardUpdate,
} from "../services/PaymentService.js";
import { isStripeCcProcessingEnabled } from "../lib/stripe.js";
import { resolveSignupInvitationByToken } from "../services/SignupInvitationService.js"; // [SCOPE 023 / T109]
import { getCompanyPortalUrl } from "../services/SubscriptionRecoveryService.js"; // [SCOPE 067]
import { getLifecycleState } from "../services/SubscriptionLifecycleService.js"; // [SCOPE 131 / T008]
import { authenticateToken, requireAuth, AuthRequest } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { signupInviteRateLimit } from "../middleware/rateLimit.js"; // [SCOPE 023 / T111]
import { asyncHandler } from "../middleware/errorHandler.js";
import { logger } from "../lib/logger.js";

const router = Router();

/**
 * GET /payment/config
 * Expose non-secret payment availability flags for registration UX.
 */
router.get("/config", asyncHandler(async (_req: Request, res: Response) => {
  const paymentsEnabled = isStripeCcProcessingEnabled();
  const globalPromoDays = await getGlobalPromoDays();

  res.status(200).json({
    success: true,
    paymentsEnabled,
    paidTierRegistrationRequiresPayment: paymentsEnabled,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? "",
    globalPromoDays,
  });
}));

// [SCOPE 023 / T108] BEGIN — public signup-invitation resolve (FR-002a)
/**
 * GET /payment/registration/invite/:token
 *
 * Lets the registration page show who the invite is for, the pinned plan, and
 * the promo length before any card is collected. Validates WITHOUT consuming —
 * redemption happens once, at POST /auth/register.
 *
 * Anonymous endpoint, so every rejection returns the same opaque 404: telling a
 * stranger "that token exists but is already redeemed" confirms a valid token.
 * The specific reason is surfaced at /auth/register, where the caller has
 * already proven they hold the token.
 */
router.get(
  "/registration/invite/:token",
  signupInviteRateLimit, // [SCOPE 023 / T111] blunt token guessing
  asyncHandler(async (req: Request, res: Response) => {
    const rawToken = Array.isArray(req.params.token)
      ? req.params.token[0]
      : req.params.token;
    const resolved = await resolveSignupInvitationByToken(rawToken ?? "");

    if (!resolved.ok) {
      logger.info(
        { reason: resolved.reason },
        "Signup invitation resolve rejected",
      );
      res.status(404).json({ error: "This invitation is not valid.", success: false });
      return;
    }

    const { invitation } = resolved;
    const validation = await validateTierSelection(
      invitation.billingplan as Parameters<typeof validateTierSelection>[0],
    );

    res.status(200).json({
      success: true,
      email: invitation.email,
      billingplan: invitation.billingplan,
      promoDays: invitation.promodays,
      monthlyPrice: validation.monthlyPrice,
      expiresAt: invitation.expiresat.toISOString(),
    });
  }),
);
// [SCOPE 023 / T108] END

/**
 * POST /payment/registration/subscribe
 * Spec 023 FR-001 + FR-002 / FR-002a / FR-002b.
 *
 * Creates a Stripe customer + incomplete subscription for a registering
 * company and returns a client_secret so the client can collect a payment
 * method via Stripe Elements. No card data ever transits wxKanban.
 *
 * The returned `intentType` says which Stripe.js call to make: a promo
 * subscription bills $0 today, so Stripe issues a SetupIntent ("setup") rather
 * than a PaymentIntent ("payment").
 *
 * The promo window comes from the invitation token, or else from the stored
 * `billing.promoDays` default — never from the request body (FR-002b).
 */
// [SCOPE 023 / T109] BEGIN — FR-002b: no client-supplied promo.
// `promoDaysOverride` used to be accepted here and beat the stored global
// setting, on a public unauthenticated endpoint — so appending `?promo=365` to
// the registration URL self-granted a free year. It is gone: the only way to a
// promo is a server-resolved invitation token (FR-002a). `.strict()` makes a
// stale client sending the old field fail loudly rather than be silently ignored.
const registrationSubscribeSchema = z
  .object({
    subscriptionTier: z.enum([
      "SINGLE_USER",
      "SMALL_BUSINESS",
      "CONSULTANT",
      "ENTERPRISE",
    ]),
    billingEmail: z.string().email("Invalid billing email"),
    companyName: z.string().min(2, "Company name required").max(255),
    /** Opaque lookup key. The promo days + plan it confers are read server-side. */
    inviteToken: z
      .string()
      .regex(/^[a-f0-9]{64}$/i, "Invalid invitation")
      .optional(),
  })
  .strict();
// [SCOPE 023 / T109] END

router.post(
  "/registration/subscribe",
  signupInviteRateLimit, // [SCOPE 023 / T111] public + creates Stripe customers
  asyncHandler(async (req: Request, res: Response) => {
    if (!isStripeCcProcessingEnabled()) {
      res.status(503).json({
        error: "Credit-card processing is temporarily disabled during testing",
        code: "PAYMENTS_TEMP_DISABLED",
      });
      return;
    }

    const parsed = registrationSubscribeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const { subscriptionTier, billingEmail, companyName, inviteToken } =
      parsed.data;

    try {
      // [SCOPE 023 / T109] BEGIN — promo + plan come from the invitation, never
      // the request (FR-002b). With no invitation this falls through to the
      // stored global default, which is DB-only and currently 0.
      let promoDays: number;
      let effectiveTier = subscriptionTier;

      if (inviteToken) {
        const resolved = await resolveSignupInvitationByToken(inviteToken);
        if (!resolved.ok) {
          res.status(400).json({
            error: "This invitation is not valid.",
            code: `INVITE_${resolved.reason}`,
          });
          return;
        }
        promoDays = resolved.invitation.promodays;
        // The invitation pins the plan; ignore whatever tier the client sent.
        effectiveTier = resolved.invitation.billingplan as typeof subscriptionTier;
      } else {
        promoDays = await resolvePromoDays();
      }
      // [SCOPE 023 / T109] END

      const result = await createRegistrationSubscription({
        email: billingEmail,
        companyName,
        tier: effectiveTier,
        promoDays,
      });

      res.status(200).json({ success: true, ...result });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Subscription creation failed";
      logger.error(
        { error: message, tier: subscriptionTier },
        "Registration-subscribe error",
      );
      res.status(500).json({ error: message });
    }
  }),
);

/**
 * GET /payment/subscription
 * Spec 023 Chunk H.1 — current company subscription summary for the Billing tab.
 * Admin-only. Exposes the Stripe subscription id so the admin can confirm/redo.
 */
router.get(
  "/subscription",
  authenticateToken,
  requireAuth,
  requireAdmin,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.companyid;
    if (!companyId) {
      res.status(400).json({ error: "Company ID not found in token" });
      return;
    }

    const row = await getCompanySubscriptionRow(companyId);

    // [SCOPE 131 / T008] MODIFIED-BY — the same lifecycle block the company
    // endpoint returns. SPEC-131 T008 named `/api/company/subscription`, but the
    // panel this data feeds calls THIS route; sending the client to a second
    // endpoint for pause and cancel state would give it two sources that can
    // disagree mid-mutation. Both routes call `getLifecycleState`, so they cannot.
    //
    // `subscriptionStatus` above comes from the JWT, which is a snapshot from
    // login: an admin who just paused would see a stale ACTIVE until their token
    // refreshed. The lifecycle block is read live from the row, so the panel
    // renders from it rather than from that field.
    const lifecycle = await getLifecycleState(companyId);

    res.status(200).json({
      success: true,
      paymentsEnabled: isStripeCcProcessingEnabled(),
      billingPlan: req.billingplan ?? null,
      subscriptionStatus: req.subscriptionstatus ?? null,
      lifecycle,
      subscription: row
        ? {
            stripeSubscriptionId: row.stripesubscriptionid,
            stripeCustomerId: row.stripecustomerid,
            status: row.status,
            planName: row.planname,
            planAmount: row.planamount,
            currentPeriodEnd: row.currentperiodend,
            promoTrialDays: row.promotrialdays,
          }
        : null,
    });
  }),
);

/**
 * POST /payment/portal-session
 * SCOPE-067 — create a Stripe Customer Portal session for the caller's company
 * so an admin can update their card / restart after a failed payment. Returns
 * the hosted portal URL for the in-app billing banner to redirect to.
 */
router.post(
  "/portal-session",
  authenticateToken,
  requireAuth,
  requireAdmin,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.companyid;
    if (!companyId) {
      res.status(400).json({ error: "Company ID not found in token" });
      return;
    }
    const url = await getCompanyPortalUrl(companyId);
    if (!url) {
      res.status(400).json({ error: "No billing account on file for this company" });
      return;
    }
    res.status(200).json({ success: true, url });
  }),
);

// [SCOPE 090 / T007] BEGIN — persist a plan chosen at the subscription wall
/**
 * POST /payment/subscription/plan
 * SPEC-090 Amendment A FR-008. A blocked admin at the subscription wall picks a
 * plan here, then proceeds to the unchanged /subscription/update-card flow, which
 * reads the tier from the company row. Admin-only, like every payment route.
 */
const planSelectionSchema = z.object({
  tier: z.enum(["SINGLE_USER", "SMALL_BUSINESS", "CONSULTANT", "ENTERPRISE"]),
});

router.post(
  "/subscription/plan",
  authenticateToken,
  requireAuth,
  requireAdmin,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.companyid;
    if (!companyId) {
      res.status(400).json({ error: "Company ID not found in token" });
      return;
    }

    const parsed = planSelectionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    try {
      const result = await setCompanyBillingPlan(companyId, parsed.data.tier);
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to set plan";
      logger.warn({ error: message, companyId }, "Plan selection rejected");
      res.status(400).json({ error: message });
    }
  }),
);
// [SCOPE 090 / T007] END

/**
 * POST /payment/subscription/update-card
 * Spec 023 Chunk H.2 — start a card update / re-subscribe for the current
 * company. Admin-only. Returns a PaymentIntent client_secret for Stripe
 * Elements (same PCI posture as registration).
 */
router.post(
  "/subscription/update-card",
  authenticateToken,
  requireAuth,
  requireAdmin,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!isStripeCcProcessingEnabled()) {
      res.status(503).json({
        error: "Credit-card processing is temporarily disabled during testing",
        code: "PAYMENTS_TEMP_DISABLED",
      });
      return;
    }

    const companyId = req.companyid;
    if (!companyId) {
      res.status(400).json({ error: "Company ID not found in token" });
      return;
    }

    try {
      const result = await startSubscriptionCardUpdate(companyId);
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to start card update";
      if (message.startsWith("BILLING_EXEMPT:")) {
        res.status(409).json({ error: message.replace("BILLING_EXEMPT: ", "") });
        return;
      }
      logger.error({ error: message, companyId }, "Card-update start error");
      res.status(500).json({ error: message });
    }
  }),
);

/**
 * POST /payment/subscription/confirm
 * Spec 023 Chunk H.3 — persist a confirmed card update / re-subscribe.
 * Admin-only.
 */
const cardUpdateConfirmSchema = z.object({
  customerId: z.string().min(1),
  subscriptionId: z.string().min(1),
  tier: z.enum(["SINGLE_USER", "SMALL_BUSINESS", "CONSULTANT", "ENTERPRISE"]),
});

router.post(
  "/subscription/confirm",
  authenticateToken,
  requireAuth,
  requireAdmin,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.companyid;
    if (!companyId) {
      res.status(400).json({ error: "Company ID not found in token" });
      return;
    }

    const parsed = cardUpdateConfirmSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    try {
      await confirmSubscriptionCardUpdate(companyId, parsed.data);
      res.status(200).json({ success: true, message: "Subscription reactivated" });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to confirm card update";
      logger.error({ error: message, companyId }, "Card-update confirm error");
      res.status(500).json({ error: message });
    }
  }),
);

/**
 * REMOVED 2026-08-03 — SOC 2 finding H-1, applied out of band.
 *
 * POST /validate, POST /setup-intent and POST /process were unauthenticated:
 * no authenticateToken / requireAuth / requireAdmin and no rate limiter, while
 * every other route in this file is admin-gated. Each one read `companyId`
 * straight out of `req.body`, so any caller holding a company UUID could create
 * a Stripe customer against it (/setup-intent) or attach a subscription to it
 * (/process). Confirmed reachable in production on 2026-08-03.
 *
 * They were also dead. No client code called them: registration goes through
 * POST /registration/subscribe (StripePaymentForm.tsx) and existing customers
 * through POST /subscription/update-card. Deleting them removes the attack
 * surface outright instead of gating handlers nobody exercises.
 *
 * tests/contract/payment.test.ts existed only for these three and was deleted
 * alongside them. tests/integration/registration-flow.test.ts still drives the
 * superseded validate -> setup-intent -> process sequence and needs rewriting
 * against the current flow.
 */

/**
 * POST /payment/webhook
 * Stripe webhook for payment events
 * (Authentication handled via signature verification)
 */
router.post(
  "/webhook",
  asyncHandler(async (req: Request, res: Response) => {
    try {
      if (!isStripeCcProcessingEnabled()) {
        res.status(202).json({
          received: true,
          ignored: true,
          reason: "Credit-card processing is temporarily disabled during testing",
        });
        return;
      }

      const signature = req.headers["stripe-signature"];

      if (!signature) {
        res.status(400).json({ error: "Missing signature" });
        return;
      }

      // Verify webhook signature
      const { verifyWebhookSignature } = await import("../lib/stripe");
      const event = verifyWebhookSignature(
        req.body as unknown as string,
        signature as string
      );

      logger.info({ eventType: (event as any).type }, "Stripe webhook received");

      // Handle webhook events
      switch ((event as any).type) {
        case "charge.succeeded":
          // Payment successful
          logger.info("Charge succeeded");
          break;

        case "charge.failed":
          // Payment failed
          logger.warn("Charge failed");
          break;

        case "invoices.payment_succeeded":
          // Subscription renewal payment successful
          logger.info("Invoice payment succeeded");
          break;

        case "invoices.payment_failed":
          // Subscription renewal payment failed
          logger.warn("Invoice payment failed");
          break;

        case "customer.subscription.updated":
          // Subscription updated
          logger.info("Subscription updated");
          break;

        case "customer.subscription.deleted":
          // Subscription cancelled
          logger.info("Subscription deleted");
          break;

        default:
          logger.debug(`Unhandled webhook type: ${(event as any).type}`);
      }

      res.json({ received: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Webhook processing failed";
      logger.error({ error: message }, "Webhook processing error");
      res.status(400).json({ error: message });
    }
  })
);

export default router;
