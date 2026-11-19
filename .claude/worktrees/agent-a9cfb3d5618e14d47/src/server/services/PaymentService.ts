import { db } from "../db/client.js";
import { companies } from "../../db/schema/company.js";
import { companysubscriptions } from "../../db/schema/companysubscription.js";
import { systemSettings } from "../../db/schema/systemSettings.js";
import { logger } from "../lib/logger.js";
import {
  createStripeCustomer,
  createSetupIntent,
  createSubscription,
  createRegistrationSubscription as stripeCreateRegistrationSubscription,
  cancelSubscriptionImmediately,
  stripeConfig,
  handleStripeError,
} from "../lib/stripe.js";
import { desc, eq, count } from "drizzle-orm";
import { userprofiles } from "../../db/schema/userprofiles.js"; // [SCOPE 090 / T007] seat check on plan change

const PROMO_DAYS_SETTING_KEY = "billing.promoDays";

/**
 * Read the globally-configured promo-day default from system_settings.
 * Falls back to 0 (no promo) if unset or unparseable.
 */
export async function getGlobalPromoDays(): Promise<number> {
  try {
    const row = await db
      .select({ value: systemSettings.value })
      .from(systemSettings)
      .where(eq(systemSettings.key, PROMO_DAYS_SETTING_KEY))
      .limit(1);

    if (row.length === 0) return 0;
    const parsed = Number(row[0].value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
  } catch (error) {
    logger.warn({ error }, "Failed to read billing.promoDays; defaulting to 0");
    return 0;
  }
}

/**
 * Resolve the effective promo duration for a registration. URL override wins
 * over the global default (FR-002 option c). Negative/invalid values fall
 * through to the global default.
 */
export async function resolvePromoDays(urlOverride?: number): Promise<number> {
  if (typeof urlOverride === "number" && Number.isFinite(urlOverride) && urlOverride >= 0) {
    return Math.floor(urlOverride);
  }
  return getGlobalPromoDays();
}

export interface RegistrationSubscriptionResponse {
  clientSecret: string;
  /**
   * Which Stripe.js confirm call the client must make against `clientSecret`.
   * A promo/trial subscription yields a SetupIntent (no charge today), a normal
   * one yields a PaymentIntent. Calling the wrong one is a hard client error.
   */
  intentType: "payment" | "setup";
  customerId: string;
  subscriptionId: string;
  publishableKey: string;
  tier: SubscriptionTier;
  monthlyPrice: number;
  promoDays: number;
  trialEnd: number | null;
}

/**
 * Spec 023 FR-001 + FR-002: create a Stripe customer + incomplete subscription
 * for a registering company. Returns the client_secret the client can hand to
 * Stripe Elements PaymentElement to collect a card without ever sending card
 * data through wxKanban.
 *
 * Billing-exempt callers short-circuit before this helper in the route layer;
 * FREE legacy never reaches here either (not offered at registration).
 */
export async function createRegistrationSubscription(params: {
  email: string;
  companyName: string;
  tier: SubscriptionTier;
  promoDays?: number;
}): Promise<RegistrationSubscriptionResponse> {
  const { email, companyName, tier, promoDays } = params;

  const validation = await validateTierSelection(tier);
  if (!validation.isValid) {
    throw new Error(validation.error ?? "Invalid tier selection");
  }

  if (tier === "FREE") {
    throw new Error(
      "FREE is a legacy / internal tier and cannot create a Stripe subscription",
    );
  }

  const pricing = stripeConfig.pricing[tier as keyof typeof stripeConfig.pricing];
  const priceId = pricing?.priceId;
  if (!priceId) {
    throw new Error(`Price not configured for ${tier} tier`);
  }
  if (!priceId.startsWith("price_")) {
    throw new Error(
      `STRIPE_PRICE_${tier} must be a Stripe Price ID (e.g. "price_1A2b3C...") — got "${priceId}". ` +
        "Create a Product+Price in the Stripe dashboard and paste that ID, not a dollar amount.",
    );
  }

  const customerId = await createStripeCustomer(email, companyName);
  const trialDays = promoDays && promoDays > 0 ? promoDays : undefined;

  const { subscriptionId, clientSecret, intentType, trialEnd } =
    await stripeCreateRegistrationSubscription(customerId, priceId, trialDays);

  return {
    clientSecret,
    intentType,
    customerId,
    subscriptionId,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? "",
    tier,
    monthlyPrice: validation.monthlyPrice,
    promoDays: trialDays ?? 0,
    trialEnd,
  };
}

/**
 * Payment service for Stripe integration
 * Handles subscription creation, payment processing, and billing
 *
 * Workflow:
 * 1. Validate tier selection
 * 2. Create Stripe customer
 * 3. Create SetupIntent for payment method collection
 * 4. Process subscription after payment confirmation
 * 5. Update company subscription status
 */

export type SubscriptionTier =
  | "FREE"
  | "SINGLE_USER"
  | "SMALL_BUSINESS"
  | "CONSULTANT"
  | "ENTERPRISE";

export interface TierValidationResponse {
  isValid: boolean;
  tier: SubscriptionTier;
  monthlyPrice: number;
  features: string[];
  maxUsers: number;
  error?: string;
}

export interface SetupIntentResponse {
  clientSecret: string;
  setupIntentId: string;
  publishableKey: string;
  tier: SubscriptionTier;
  monthlyPrice: number;
}

export interface SubscriptionCreationResponse {
  subscriptionId: string;
  customerId: string;
  status: "ACTIVE" | "PENDING" | "PAYMENT_REQUIRED";
  monthlyPrice: number;
  renewalDate: Date;
}

/**
 * Validate tier selection and return pricing info
 */
export async function validateTierSelection(tier: SubscriptionTier): Promise<TierValidationResponse> {
  try {
    const tierConfig = getTierConfiguration(tier);

    if (!tierConfig) {
      return {
        isValid: false,
        tier,
        monthlyPrice: 0,
        features: [],
        maxUsers: 0,
        error: "Invalid subscription tier",
      };
    }

    return {
      isValid: true,
      tier,
      monthlyPrice: tierConfig.monthlyPrice,
      features: tierConfig.features,
      maxUsers: tierConfig.maxUsers,
    };
  } catch (error) {
    logger.error({ error, tier }, "Failed to validate tier");
    throw error;
  }
}

/**
 * Get tier configuration
 */
function getTierConfiguration(tier: SubscriptionTier) {
  const configs: Record<SubscriptionTier, any> = {
    FREE: {
      monthlyPrice: 0,
      maxUsers: 5,
      features: [
        "Legacy / internal tier — not offered at registration",
        "Used for dogfooding + sysadmin backdoor accounts",
      ],
    },
    // Single User — entry-level paid tier (spec 023 §G, 2026-05-30).
    SINGLE_USER: {
      monthlyPrice: 19.95,
      maxUsers: 1,
      features: [
        "1 user",
        "Unlimited projects",
        "Single PM integration",
        "Email support",
      ],
    },
    SMALL_BUSINESS: {
      monthlyPrice: 29.95,
      maxUsers: 5,
      features: [
        "Up to 5 users",
        "Task management + time tracking",
        "Email support",
      ],
    },
    CONSULTANT: {
      monthlyPrice: 39.95,
      maxUsers: 999,
      features: [
        "Unlimited team members",
        "Advanced task management",
        "Time tracking with billing",
        "Invoice generation",
        "Priority email support",
        "API access to 3rd party (jira, monday....)",
      ],
    },
    ENTERPRISE: {
      monthlyPrice: 59.95,
      maxUsers: 25,
      features: [
        "Everything in Consultant",
        "$5/month per active user above 25",
        "Advanced analytics",
        "Custom integrations",
        "Dedicated support",
        "SSO/SAML",
        "Advanced security",
        "SLA guaranteed",
      ],
    },
  };

  return configs[tier];
}

/**
 * Create SetupIntent for payment method collection
 * Called before processing payment
 */
export async function createPaymentSetupIntent(
  companyId: string,
  adminEmail: string,
  adminName: string,
  tier: SubscriptionTier
): Promise<SetupIntentResponse> {
  try {
    // Validate tier
    const validation = await validateTierSelection(tier);
    if (!validation.isValid) {
      throw new Error(validation.error);
    }

    // Create Stripe customer
    const customerId = await createStripeCustomer(adminEmail, adminName);

    // Create SetupIntent
    const { clientSecret, setupIntentId } = await createSetupIntent(customerId);

    // Get publishable key from env
    const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY || "";

    logger.info(
      {
        companyId,
        setupIntentId,
        customerId,
        tier,
      },
      "SetupIntent created"
    );

    return {
      clientSecret,
      setupIntentId,
      publishableKey,
      tier,
      monthlyPrice: validation.monthlyPrice,
    };
  } catch (error) {
    logger.error(
      { error, companyId, tier },
      "Failed to create payment setup intent"
    );
    throw error;
  }
}

/**
 * Process subscription after payment method confirmed
 */
export async function processSubscription(
  companyId: string,
  customerId: string,
  tier: SubscriptionTier
): Promise<SubscriptionCreationResponse> {
  try {
    // Validate tier
    const validation = await validateTierSelection(tier);
    if (!validation.isValid) {
      throw new Error(validation.error);
    }

    // Billing-exempt companies (internal / dogfooding) skip Stripe entirely
    // while preserving the features and user limits of their chosen tier.
    const company = await db
      .select({ billingexempt: companies.billingexempt })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);

    const billingExempt = company.length > 0 && company[0].billingexempt;

    if (billingExempt || tier === "FREE") {
      logger.info(
        { companyId, tier, billingExempt },
        billingExempt
          ? "Company is billing-exempt; no Stripe subscription created"
          : "FREE tier; no Stripe subscription created",
      );
      return {
        subscriptionId: "",
        customerId,
        status: "ACTIVE",
        monthlyPrice: 0,
        renewalDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      };
    }

    // Paid tiers: create subscription
    const pricing = stripeConfig.pricing[tier as keyof typeof stripeConfig.pricing];
    const priceId = pricing?.priceId;

    if (!priceId) {
      throw new Error(`Price not configured for ${tier} tier`);
    }

    const subscriptionId = await createSubscription(customerId, priceId);

    // Calculate renewal date (30 days from now)
    const renewalDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    // Update company with subscription info
    await db
      .update(companies)
      .set({
        updatedat: new Date(),
      })
      .where(eq(companies.id, companyId))
      .returning();

    logger.info(
      {
        companyId,
        subscriptionId,
        customerId,
        tier,
      },
      "Subscription processed successfully"
    );

    return {
      subscriptionId,
      customerId,
      status: "ACTIVE",
      monthlyPrice: validation.monthlyPrice,
      renewalDate,
    };
  } catch (error) {
    logger.error(
      { error, companyId, tier },
      "Failed to process subscription"
    );

    // Handle Stripe-specific errors
    if (error instanceof Error && error.message.includes("Stripe")) {
      const stripeError = handleStripeError(error);
      throw new Error(`Payment processing failed: ${stripeError.message}`);
    }

    throw error;
  }
}

/**
 * Calculate total cost for a subscription
 * Includes setup fees or discounts if applicable
 */
export async function calculateSubscriptionCost(
  tier: SubscriptionTier,
  additionalUsers?: number
): Promise<{
  monthlyPrice: number;
  setupFee: number;
  totalFirstMonth: number;
  recurringMonthly: number;
}> {
  try {
    const validation = await validateTierSelection(tier);
    if (!validation.isValid) {
      throw new Error(validation.error);
    }

    const monthlyPrice = validation.monthlyPrice;
    const setupFee = 0; // No setup fee for wxKanban
    const additionalUserCost = (additionalUsers || 0) * stripeConfig.additionalUserPrice * 0.01; // Convert cents to dollars

    // monthlyPrice (from getTierConfiguration) and additionalUserCost are
    // already in dollars — do NOT divide by 100 (that bug made the breakdown
    // show 1/100th, e.g. $0.20 instead of $19.95). The real Stripe charge uses
    // the price ID, so only this display breakdown was affected.
    return {
      monthlyPrice,
      setupFee,
      totalFirstMonth: monthlyPrice + additionalUserCost,
      recurringMonthly: monthlyPrice + additionalUserCost,
    };
  } catch (error) {
    logger.error({ error, tier }, "Failed to calculate subscription cost");
    throw error;
  }
}

/**
 * Get subscription details for a company
 */
export async function getCompanySubscription(companyId: string) {
  try {
    const comp = await db
      .select()
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);

    if (comp.length === 0) {
      throw new Error("Company not found");
    }

    return {
      tier: comp[0].billingplan,
      status: "ACTIVE",
      customerId: "",
      subscriptionId: "",
      startedDate: comp[0].createdat,
      renewalDate: new Date(),
    };
  } catch (error) {
    logger.error({ error, companyId }, "Failed to get subscription");
    throw error;
  }
}

/**
 * Spec 023 Chunk H.1 — read the company's latest subscription row (Stripe ids +
 * status) for the Billing tab. Returns null when the company has never had a
 * Stripe subscription created.
 */
export async function getCompanySubscriptionRow(companyId: string) {
  const rows = await db
    .select()
    .from(companysubscriptions)
    .where(eq(companysubscriptions.companyid, companyId))
    .orderBy(desc(companysubscriptions.createdat))
    .limit(1);

  return rows.length > 0 ? rows[0] : null;
}

export interface CardUpdateSubscriptionResponse {
  clientSecret: string;
  /**
   * Reported from Stripe rather than assumed. A re-subscribe applies no promo →
   * "payment"; a first-time subscribe by a company that redeemed a promo invite
   * (SCOPE-090 reordered flow) opens a trial → "setup". The client follows this
   * discriminator instead of guessing which confirm call to make.
   */
  intentType: "payment" | "setup";
  customerId: string;
  subscriptionId: string;
  publishableKey: string;
  tier: SubscriptionTier;
  monthlyPrice: number;
  // [SCOPE 090 / T002] Promo the subscription actually opened with, so the
  // registration UI can show the "$0 today, first charge on <date>" notice. 0 /
  // null for the ordinary re-subscribe (Billing tab) path.
  promoDays: number;
  trialEnd: number | null;
}

// [SCOPE 090 / T007] BEGIN — set the company's plan before collecting a card
/**
 * SPEC-090 Amendment A FR-008. The subscription wall lets a blocked admin pick a
 * plan, but `startSubscriptionCardUpdate` deliberately reads the tier from
 * `companies.billingplan` rather than trusting the client. Rather than widen that
 * Stripe path to accept a caller-supplied tier, the wall persists the choice here
 * first and then calls the existing card flow unchanged.
 *
 * Refuses a downgrade the company cannot fit into: silently shrinking maxusers
 * below the number of people already in the account would leave existing users
 * over the seat limit with no indication why.
 */
export async function setCompanyBillingPlan(
  companyId: string,
  tier: SubscriptionTier,
): Promise<{ tier: SubscriptionTier; maxUsers: number }> {
  const validation = await validateTierSelection(tier);
  if (!validation.isValid || tier === "FREE") {
    throw new Error(`"${tier}" is not a selectable paid plan.`);
  }

  const seats = await db
    .select({ total: count() })
    .from(userprofiles)
    .where(eq(userprofiles.companyid, companyId));
  const seatsUsed = seats[0]?.total ?? 0;
  if (seatsUsed > validation.maxUsers) {
    throw new Error(
      `This company has ${seatsUsed} users, which exceeds the ${validation.maxUsers}-user limit of the selected plan. Remove users first or choose a larger plan.`,
    );
  }

  await db
    .update(companies)
    .set({ billingplan: tier, maxusers: validation.maxUsers, updatedat: new Date() })
    .where(eq(companies.id, companyId));

  logger.info({ companyId, tier, maxUsers: validation.maxUsers }, "Company plan set from subscription wall");
  return { tier, maxUsers: validation.maxUsers };
}
// [SCOPE 090 / T007] END

/**
 * Spec 023 Chunk H.2 — start a post-signup card update / re-subscribe for an
 * existing company. Reuses the existing Stripe customer (creating one only if
 * absent), best-effort clears the prior stuck subscription, then creates a
 * fresh `default_incomplete` subscription for the company's current tier and
 * returns the PaymentIntent client_secret for Stripe Elements. No promo is
 * applied on re-subscribe.
 */
export async function startSubscriptionCardUpdate(
  companyId: string,
): Promise<CardUpdateSubscriptionResponse> {
  const comp = await db
    .select()
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);

  if (comp.length === 0) {
    throw new Error("Company not found");
  }

  const company = comp[0];

  if (company.billingexempt) {
    throw new Error(
      "BILLING_EXEMPT: This company is billing-exempt and has no Stripe subscription to update.",
    );
  }

  const tier = company.billingplan as SubscriptionTier;

  const validation = await validateTierSelection(tier);
  if (!validation.isValid || tier === "FREE") {
    throw new Error(
      `Company plan "${company.billingplan}" is not a paid Stripe tier and cannot collect a card.`,
    );
  }

  const pricing = stripeConfig.pricing[tier as keyof typeof stripeConfig.pricing];
  const priceId = pricing?.priceId;
  if (!priceId || !priceId.startsWith("price_")) {
    throw new Error(`Price not configured for ${tier} tier`);
  }

  const existing = await getCompanySubscriptionRow(companyId);

  const customerId =
    existing?.stripecustomerid ??
    (await createStripeCustomer(company.contactemail, company.name));

  // [SCOPE 090 / T002] BEGIN — apply the entitled promo on a FIRST-TIME subscribe.
  // In the reordered signup (Company → Admin → Payment) the account is created
  // first with no Stripe subscription, then this endpoint creates it. A company
  // that registered with a promo invite must still get its trial — read the promo
  // back from the redeemed invitation (server-authoritative; never the client).
  // A genuine re-subscribe (the Billing tab, `existing` present) gets no promo,
  // exactly as before.
  const trialDays = existing
    ? undefined
    : await (async () => {
        const { getRedeemedPromoDaysForCompany } = await import(
          "./SignupInvitationService.js"
        );
        const days = await getRedeemedPromoDaysForCompany(companyId);
        return days > 0 ? days : undefined;
      })();
  // [SCOPE 090 / T002] END

  // NOTE: we intentionally do NOT cancel the prior subscription here. With
  // Chunk C webhooks live, an immediate cancel fires customer.subscription.deleted
  // and would mark the company CANCELED before the new card is even entered. The
  // old subscription is cleared in confirmSubscriptionCardUpdate() instead, once
  // the new one is active and the DB row already points at the new id.
  const { subscriptionId, clientSecret, intentType, trialEnd } =
    await stripeCreateRegistrationSubscription(customerId, priceId, trialDays);

  logger.info(
    { companyId, customerId, subscriptionId, tier, intentType, promoDays: trialDays ?? 0 },
    "Card-update subscription created",
  );

  return {
    clientSecret,
    intentType,
    customerId,
    subscriptionId,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? "",
    tier,
    monthlyPrice: validation.monthlyPrice,
    promoDays: trialDays ?? 0,
    trialEnd,
  };
}

/**
 * Spec 023 Chunk H.3 — persist a confirmed card-update / re-subscribe. Upserts
 * the company's `companysubscriptions` row to the new Stripe ids with
 * `status='active'` and flips `companies.subscriptionstatus` to ACTIVE.
 * Optimistic (client-confirmed) until Chunk C webhooks reconcile.
 */
export async function confirmSubscriptionCardUpdate(
  companyId: string,
  params: { customerId: string; subscriptionId: string; tier: SubscriptionTier },
): Promise<void> {
  const { customerId, subscriptionId, tier } = params;
  const planAmount = String(getTierConfiguration(tier)?.monthlyPrice ?? 0);
  const activeUserLimit = getTierConfiguration(tier)?.maxUsers ?? null;

  const existing = await getCompanySubscriptionRow(companyId);
  const priorSubscriptionId = existing?.stripesubscriptionid ?? null;

  if (existing) {
    await db
      .update(companysubscriptions)
      .set({
        stripecustomerid: customerId,
        stripesubscriptionid: subscriptionId,
        planname: tier,
        planamount: planAmount,
        status: "active",
        updatedat: new Date(),
      })
      .where(eq(companysubscriptions.id, existing.id));
  } else {
    await db.insert(companysubscriptions).values({
      companyid: companyId,
      stripecustomerid: customerId,
      stripesubscriptionid: subscriptionId,
      planname: tier,
      planamount: planAmount,
      activeuserlimit: activeUserLimit,
      status: "active",
    });
  }

  await db
    .update(companies)
    .set({ subscriptionstatus: "ACTIVE", updatedat: new Date() })
    .where(eq(companies.id, companyId));

  // Now that the DB row points at the NEW subscription, clear the prior
  // stuck/failed one. The resulting customer.subscription.deleted webhook for
  // the old id no longer matches any row, so it's harmlessly skipped (Chunk C)
  // rather than flipping the company back to CANCELED.
  if (priorSubscriptionId && priorSubscriptionId !== subscriptionId) {
    try {
      await cancelSubscriptionImmediately(priorSubscriptionId);
    } catch (error) {
      logger.warn(
        { error, companyId, subscriptionId: priorSubscriptionId },
        "Could not cancel prior subscription after card update (continuing)",
      );
    }
  }

  logger.info(
    { companyId, customerId, subscriptionId, tier },
    "Card-update subscription confirmed and activated",
  );
}

/**
 * Cancel subscription
 */
// [SCOPE 131 / T001] MODIFIED-BY — the stub is gone.
//
// This function used to log "Subscription cancellation not yet implemented" and
// return normally, on the stated belief that `stripesubscriptionid` did not exist.
// It does: on `companysubscriptions`, not on `companies`. The comment was wrong and
// the consequence was worse than an error, because the caller was told the
// cancellation had succeeded while Stripe kept billing. Meanwhile the correct Stripe
// helper had sat in `lib/stripe.ts` since SCOPE-023 with no caller at all.
//
// Cancellation now lives in SubscriptionLifecycleService, which owns the full
// transition — Stripe first, pending markers, audit row — and is shared with the
// routes. This wrapper stays so existing callers keep working.
export async function cancelSubscription(
  companyId: string,
  actorUserId: string | null = null,
): Promise<void> {
  const { requestCancellation } = await import(
    "./SubscriptionLifecycleService.js"
  );
  await requestCancellation(companyId, actorUserId);
}
