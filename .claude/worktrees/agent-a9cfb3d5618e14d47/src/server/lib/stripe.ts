import Stripe from "stripe";
import { logger } from "./logger";

const stripeCcProcessingEnabled =
  process.env.STRIPE_CC_PROCESSING_ENABLED === "true";

export function isStripeCcProcessingEnabled(): boolean {
  return stripeCcProcessingEnabled;
}

/**
 * Stripe SDK initialization and configuration
 * Handles payment processing, subscriptions, and billing
 *
 * Test mode detection:
 * - Uses sk_test_* keys in development/test environments
 * - Uses sk_live_* keys in production (requires explicit setup)
 * - Automatically validates key format
 */

// Initialize Stripe with API key
let stripeClient: Stripe | null = null;

/**
 * Initialize Stripe client
 * Called once at application startup
 */
export function initializeStripe(): Stripe {
  if (!isStripeCcProcessingEnabled()) {
    throw new Error(
      "Stripe credit-card processing is temporarily disabled for testing. " +
        "Set STRIPE_CC_PROCESSING_ENABLED=true to re-enable."
    );
  }

  if (stripeClient) {
    return stripeClient;
  }

  const stripeKey = process.env.STRIPE_API_KEY;

  if (!stripeKey) {
    throw new Error(
      "STRIPE_API_KEY environment variable is not set. " +
        "Get it from https://dashboard.stripe.com/apikeys"
    );
  }

  // Validate key format
  const isTestKey = stripeKey.startsWith("sk_test_");
  const isLiveKey = stripeKey.startsWith("sk_live_");

  if (!isTestKey && !isLiveKey) {
    throw new Error("Invalid STRIPE_API_KEY format. Expected sk_test_* or sk_live_*");
  }

  // Log initialization
  const environment = isTestKey ? "test" : "live";
  logger.info({ environment }, "Initializing Stripe client");

  stripeClient = new Stripe(stripeKey, {
    apiVersion: "2023-10-16", // Latest stable API version
    typescript: true,
  });

  return stripeClient;
}

/**
 * Get Stripe client instance
 */
export function getStripe(): Stripe {
  if (!stripeClient) {
    return initializeStripe();
  }
  return stripeClient;
}

/**
 * Stripe configuration for different features
 */
export const stripeConfig = {
  // Subscription pricing per spec 023 FR-001 (in cents).
  pricing: {
    FREE: { priceId: null, monthlyPrice: 0 },
    // Single User — entry-level paid tier (spec 023 §G, 2026-05-30): $19.95/mo, 1 seat.
    SINGLE_USER: {
      priceId: process.env.STRIPE_PRICE_SINGLE_USER,
      monthlyPrice: 1995, // $19.95 / month
    },
    SMALL_BUSINESS: {
      priceId: process.env.STRIPE_PRICE_SMALL_BUSINESS,
      monthlyPrice: 2995, // $29.95 / month (repriced 2026-05-30, was $19.95)
    },
    CONSULTANT: {
      priceId: process.env.STRIPE_PRICE_CONSULTANT,
      monthlyPrice: 3995, // $39.95 / month (repriced 2026-05-30, was $29.95)
    },
    ENTERPRISE: {
      priceId: process.env.STRIPE_PRICE_ENTERPRISE,
      monthlyPrice: 5995, // $59.95 / month (+ $5/month per active user > 25)
    },
  },

  // Additional user pricing (ENTERPRISE overage: $5/month per active user above 25)
  additionalUserPrice: 500, // $5.00 per additional user

  // Webhook secret for verifying Stripe events
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,

  // Success/failure redirect URLs
  successUrl: `${process.env.CLIENT_URL}/registration/success`,
  cancelUrl: `${process.env.CLIENT_URL}/registration/payment`,
};

/**
 * Stripe error handler
 */
export function handleStripeError(error: unknown): {
  statusCode: number;
  message: string;
  type: string;
} {
  // Type guard for Stripe errors
  if (error && typeof error === 'object') {
    const err = error as Record<string, unknown>;
    const type = err.type as string | undefined;
    const message = err.message as string | undefined;

    if (type === 'StripeCardError' || type === 'card_error') {
      return {
        statusCode: 400,
        message: message || "Card error",
        type: "card_error",
      };
    }

    if (type === 'StripeRateLimitError' || type === 'rate_limit_error') {
      return {
        statusCode: 429,
        message: "Too many requests to Stripe. Please try again later.",
        type: "rate_limit_error",
      };
    }

    if (type === 'StripeAuthenticationError' || type === 'authentication_error') {
      logger.error({ error }, "Stripe authentication failed");
      return {
        statusCode: 500,
        message: "Payment service authentication failed",
        type: "authentication_error",
      };
    }

    if (type === 'StripeConnectionError' || type === 'api_connection_error') {
      logger.error({ error }, "Stripe API connection failed");
      return {
        statusCode: 503,
        message: "Payment service temporarily unavailable",
        type: "api_connection_error",
      };
    }

    if (type === 'StripeInvalidRequestError' || type === 'invalid_request_error') {
      return {
        statusCode: 400,
        message: message || "Invalid request",
        type: "invalid_request_error",
      };
    }

    if (type === 'StripeAPIError' || type === 'stripe_api_error') {
      logger.error({ error }, "Stripe API error");
      return {
        statusCode: 500,
        message: "Payment service error",
        type: "stripe_api_error",
      };
    }
  }

  logger.error({ error }, "Unknown Stripe error");
  return {
    statusCode: 500,
    message: "Unknown payment service error",
    type: "unknown_error",
  };
}

/**
 * Create Stripe customer
 */
export async function createStripeCustomer(
  email: string,
  name: string
): Promise<string> {
  const stripe = getStripe();

  try {
    const customer = await stripe.customers.create({
      email,
      name,
      description: `wxKanban customer - ${email}`,
    });

    logger.info({ customerId: customer.id }, "Stripe customer created");
    return customer.id;
  } catch (error) {
    logger.error({ error, email }, "Failed to create Stripe customer");
    throw error;
  }
}

/**
 * Create SetupIntent for payment method collection
 */
export async function createSetupIntent(
  customerId: string
): Promise<{
  clientSecret: string;
  setupIntentId: string;
}> {
  const stripe = getStripe();

  try {
    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ["card"],
    });

    logger.info(
      { setupIntentId: setupIntent.id },
      "Stripe SetupIntent created"
    );

    return {
      clientSecret: setupIntent.client_secret || "",
      setupIntentId: setupIntent.id,
    };
  } catch (error) {
    logger.error({ error, customerId }, "Failed to create SetupIntent");
    throw error;
  }
}

/**
 * Create subscription after payment method is confirmed
 */
export async function createSubscription(
  customerId: string,
  priceId: string
): Promise<string> {
  const stripe = getStripe();

  try {
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      payment_settings: {
        payment_method_types: ["card"],
        save_default_payment_method: "on_subscription",
      },
    });

    logger.info(
      { subscriptionId: subscription.id },
      "Stripe subscription created"
    );

    return subscription.id;
  } catch (error) {
    logger.error(
      { error, customerId, priceId },
      "Failed to create subscription"
    );
    throw error;
  }
}

/**
 * Create a subscription in `default_incomplete` state so the client can
 * collect a payment method via Stripe Elements / PaymentElement against the
 * returned `client_secret`. Optional `trialPeriodDays` skips billing during
 * the promo window (FR-002) — the subscription still exists, it just waits
 * to charge.
 *
 * The returned `intentType` tells the client which Stripe.js call to make:
 * `confirmPayment` for a PaymentIntent, `confirmSetup` for a SetupIntent.
 * Getting it wrong is a hard error on the client, so it is derived from which
 * secret Stripe actually returned rather than inferred from the trial length.
 */
export async function createRegistrationSubscription(
  customerId: string,
  priceId: string,
  trialPeriodDays?: number,
): Promise<{
  subscriptionId: string;
  clientSecret: string;
  intentType: "payment" | "setup";
  trialEnd: number | null;
}> {
  const stripe = getStripe();
  const isTrial = typeof trialPeriodDays === "number" && trialPeriodDays > 0;

  try {
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: "default_incomplete",
      payment_settings: {
        payment_method_types: ["card"],
        save_default_payment_method: "on_subscription",
      },
      expand: ["latest_invoice.payment_intent", "pending_setup_intent"],
      ...(isTrial
        ? {
            trial_period_days: trialPeriodDays,
            // Belt and braces: a promo subscription that somehow reaches its
            // trial end with no card must not linger unbilled. The registration
            // flow always collects a card, so this should never fire.
            trial_settings: {
              end_behavior: { missing_payment_method: "cancel" as const },
            },
          }
        : {}),
    });

    // A trialing subscription's first invoice is $0, so Stripe issues no
    // PaymentIntent at all — it attaches a pending_setup_intent instead. Read
    // whichever one Stripe actually produced.
    const invoice = subscription.latest_invoice;
    const paymentIntent =
      invoice && typeof invoice !== "string"
        ? (invoice as Stripe.Invoice & {
            payment_intent?: Stripe.PaymentIntent | string;
          }).payment_intent
        : undefined;

    const paymentSecret =
      paymentIntent && typeof paymentIntent !== "string"
        ? paymentIntent.client_secret ?? ""
        : "";

    const setupIntent = subscription.pending_setup_intent;
    const setupSecret =
      setupIntent && typeof setupIntent !== "string"
        ? setupIntent.client_secret ?? ""
        : "";

    const clientSecret = paymentSecret || setupSecret;
    const intentType: "payment" | "setup" = paymentSecret ? "payment" : "setup";

    if (!clientSecret) {
      throw new Error(
        "Stripe subscription created but returned neither a PaymentIntent nor a " +
          "pending_setup_intent client_secret",
      );
    }

    logger.info(
      {
        subscriptionId: subscription.id,
        trialPeriodDays,
        intentType,
        stripeStatus: subscription.status,
      },
      "Registration subscription created",
    );

    return {
      subscriptionId: subscription.id,
      clientSecret,
      intentType,
      trialEnd: subscription.trial_end ?? null,
    };
  } catch (error) {
    logger.error(
      { error, customerId, priceId, trialPeriodDays },
      "Failed to create registration subscription",
    );
    throw error;
  }
}

/**
 * Create a Stripe Billing/Customer Portal session so a customer can update
 * their payment method and reactivate after a failed payment (SCOPE-067).
 * Requires the Customer Portal to be enabled in the Stripe dashboard.
 */
export async function createBillingPortalSession(
  customerId: string,
  returnUrl: string,
): Promise<string> {
  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
  logger.info({ customerId }, "Stripe billing portal session created");
  return session.url;
}

/**
 * Cancel subscription
 */
// [SCOPE 131 / T001] MODIFIED-BY — returns the updated Stripe subscription instead of void.
// The caller needs `cancel_at` to tell the customer the date their access actually ends;
// previously this discarded it. Behavior against Stripe is unchanged.
export async function cancelSubscription(
  subscriptionId: string
): Promise<Stripe.Subscription> {
  const stripe = getStripe();

  try {
    const updated = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });
    logger.info(
      { subscriptionId, cancelAt: updated.cancel_at },
      "Stripe subscription cancelled",
    );
    return updated;
  } catch (error) {
    logger.error({ error, subscriptionId }, "Failed to cancel subscription");
    throw error;
  }
}

// [SCOPE 131 / T004] BEGIN — clear a pending cancellation (FR-004)
/**
 * Un-cancel a subscription that is scheduled to end at period end.
 *
 * This is the safety valve that makes cancelling low-risk, and it is only
 * possible *before* the period closes: once Stripe has actually canceled a
 * subscription it cannot be resumed, only replaced. Clearing the flag creates
 * no new subscription and triggers no proration.
 */
export async function resumeSubscription(
  subscriptionId: string,
): Promise<Stripe.Subscription> {
  const stripe = getStripe();

  try {
    const updated = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: false,
    });
    logger.info({ subscriptionId }, "Stripe pending cancellation cleared");
    return updated;
  } catch (error) {
    logger.error(
      { error, subscriptionId },
      "Failed to clear pending cancellation",
    );
    throw error;
  }
}
// [SCOPE 131 / T004] END

// [SCOPE 131 / T006] BEGIN — suspend and resume billing via pause_collection (FR-006)
/**
 * Suspend billing without ending the subscription.
 *
 * `behavior: 'void'` means invoices raised during the pause are voided rather
 * than accumulated, so resuming does not present the customer with a stack of
 * back-charges. The subscription itself stays alive, which is the whole point:
 * unpausing returns them to the SAME subscription with their history intact,
 * where cancel-then-re-register would not.
 */
export async function pauseSubscriptionCollection(
  subscriptionId: string,
): Promise<Stripe.Subscription> {
  const stripe = getStripe();

  try {
    const updated = await stripe.subscriptions.update(subscriptionId, {
      pause_collection: { behavior: "void" },
    });
    logger.info({ subscriptionId }, "Stripe subscription collection paused");
    return updated;
  } catch (error) {
    logger.error({ error, subscriptionId }, "Failed to pause collection");
    throw error;
  }
}

/** Resume billing on a paused subscription. Same subscription, no double charge. */
export async function unpauseSubscriptionCollection(
  subscriptionId: string,
): Promise<Stripe.Subscription> {
  const stripe = getStripe();

  try {
    const updated = await stripe.subscriptions.update(subscriptionId, {
      pause_collection: null,
    });
    logger.info({ subscriptionId }, "Stripe subscription collection resumed");
    return updated;
  } catch (error) {
    logger.error({ error, subscriptionId }, "Failed to resume collection");
    throw error;
  }
}
// [SCOPE 131 / T006] END

/**
 * Immediately delete a subscription (not cancel-at-period-end). Used by the
 * Chunk H card-update flow to clear a prior stuck/incomplete subscription
 * before creating a fresh one for the same customer. Best-effort: callers
 * wrap in try/catch since the subscription may already be gone.
 */
export async function cancelSubscriptionImmediately(
  subscriptionId: string,
): Promise<void> {
  const stripe = getStripe();
  await stripe.subscriptions.cancel(subscriptionId);
  logger.info({ subscriptionId }, "Stripe subscription canceled immediately");
}

/**
 * Verify Stripe webhook signature and return the parsed event.
 * Caller must pass the raw request body (Buffer or untouched string) — a
 * JSON-parsed body will fail signature verification.
 */
export function verifyWebhookSignature(
  body: string | Buffer,
  signature: string,
): Stripe.Event {
  if (!isStripeCcProcessingEnabled()) {
    throw new Error("Stripe webhooks are disabled while credit-card processing is paused");
  }

  const stripe = getStripe();
  const secret = stripeConfig.webhookSecret;

  if (!secret) {
    throw new Error("STRIPE_WEBHOOK_SECRET not configured");
  }

  try {
    return stripe.webhooks.constructEvent(body, signature, secret);
  } catch (error) {
    logger.error({ err: error }, "Webhook signature verification failed");
    throw error;
  }
}
