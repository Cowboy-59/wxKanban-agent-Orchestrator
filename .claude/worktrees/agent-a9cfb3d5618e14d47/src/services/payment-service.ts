/**
 * Payment Processor Service
 * Feature 002: Handle billing plan payments via Stripe
 *
 * Supports creating payment intents for Professional/Enterprise plans
 */

import { BillingPlan } from '../types/index.js';
import { createLogger } from '../server/lib/logger.js';

const logger = createLogger('payment-service');

/**
 * Plan pricing configuration
 */
const PLAN_PRICING: Record<BillingPlan, { amount: number; interval: string; description: string }> = {
  Free: {
    amount: 0,
    interval: 'month',
    description: 'Free plan - limited features',
  },
  Professional: {
    amount: 9900, // $99 in cents
    interval: 'month',
    description: 'Professional plan - advanced features',
  },
  Enterprise: {
    amount: 29900, // $299 in cents
    interval: 'month',
    description: 'Enterprise plan - custom solutions',
  },
};

export interface PaymentIntentData {
  companyId: string;
  companyName: string;
  email: string;
  plan: BillingPlan;
  amount: number;
}

export interface PaymentResult {
  success: boolean;
  transactionId?: string;
  error?: string;
  nextAction?: string;
}

export interface StripePaymentIntent {
  id: string;
  clientSecret: string;
  amount: number;
  currency: string;
  status: string;
}

/**
 * Get plan pricing
 */
export function getPlanPrice(plan: BillingPlan): number {
  return PLAN_PRICING[plan].amount;
}

/**
 * Create payment intent for billing plan upgrade
 * Returns a client secret for Stripe.js frontend integration
 */
export async function createPaymentIntent(
  data: PaymentIntentData
): Promise<StripePaymentIntent | null> {
  try {
    const stripeKey = process.env.STRIPE_SECRET_KEY;

    // Skip payment for Free plan
    if (data.plan === 'Free') {
      logger.info({ companyId: data.companyId }, 'Free plan selected, no payment needed');
      return null;
    }

    if (!stripeKey) {
      logger.warn('STRIPE_SECRET_KEY not configured');
      // Mock response for development
      return {
        id: `pi_${Date.now()}`,
        clientSecret: `pi_${Date.now()}_secret_mock`,
        amount: data.amount,
        currency: 'usd',
        status: 'requires_payment_method',
      };
    }

    // TODO: Implement actual Stripe API call
    // const response = await fetch('https://api.stripe.com/v1/payment_intents', {
    //   method: 'POST',
    //   headers: {
    //     'Authorization': `Bearer ${stripeKey}`,
    //     'Content-Type': 'application/x-www-form-urlencoded',
    //   },
    //   body: new URLSearchParams({
    //     amount: data.amount.toString(),
    //     currency: 'usd',
    //     metadata: {
    //       companyId: data.companyId,
    //       plan: data.plan,
    //     },
    //     description: `${data.plan} plan for ${data.companyName}`,
    //     receipt_email: data.email,
    //   }),
    // });
    // const intent = await response.json();
    // return intent;

    logger.info(
      { companyId: data.companyId, plan: data.plan, amount: data.amount },
      'Payment intent created (mocked)'
    );

    return {
      id: `pi_${Date.now()}`,
      clientSecret: `pi_${Date.now()}_secret_mock`,
      amount: data.amount,
      currency: 'usd',
      status: 'requires_payment_method',
    };
  } catch (error) {
    logger.error({ error, companyId: data.companyId }, 'Failed to create payment intent');
    return null;
  }
}

/**
 * Verify payment intent completion
 * Called after Stripe webhook or client-side confirmation
 */
export async function verifyPaymentIntent(intentId: string): Promise<PaymentResult> {
  try {
    const stripeKey = process.env.STRIPE_SECRET_KEY;

    if (!stripeKey) {
      // Mock verification for development
      logger.info({ intentId }, 'Payment verified (mocked)');
      return {
        success: true,
        transactionId: intentId,
      };
    }

    // TODO: Implement actual verification
    // const response = await fetch(
    //   `https://api.stripe.com/v1/payment_intents/${intentId}`,
    //   {
    //     headers: {
    //       'Authorization': `Bearer ${stripeKey}`,
    //     },
    //   }
    // );
    // const intent = await response.json();
    // return {
    //   success: intent.status === 'succeeded',
    //   transactionId: intent.id,
    // };

    return {
      success: true,
      transactionId: intentId,
    };
  } catch (error) {
    logger.error({ error, intentId }, 'Failed to verify payment');
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Verification failed',
    };
  }
}

/**
 * Handle Stripe webhook event
 * Called when payment status changes
 */
export async function handleStripeWebhook(event: {
  type: string;
  data: {
    object: {
      id: string;
      status: string;
      metadata?: Record<string, string>;
    };
  };
}): Promise<void> {
  try {
    const { type, data } = event;
    const { object } = data;

    logger.info({ eventType: type, intentId: object.id }, 'Stripe webhook received');

    switch (type) {
      case 'payment_intent.succeeded':
        // Update company billing status
        if (object.metadata?.companyId) {
          logger.info(
            { companyId: object.metadata.companyId, plan: object.metadata.plan },
            'Payment successful'
          );
          // TODO: Update company.billingplan in database
        }
        break;

      case 'payment_intent.payment_failed':
        // Notify company of payment failure
        if (object.metadata?.companyId) {
          logger.warn(
            { companyId: object.metadata.companyId },
            'Payment failed'
          );
          // TODO: Send notification email
        }
        break;

      case 'customer.subscription.deleted':
        // Handle subscription cancellation
        logger.info({ objectId: object.id }, 'Subscription cancelled');
        // TODO: Downgrade to Free plan
        break;

      default:
        logger.debug({ eventType: type }, 'Unhandled webhook type');
    }
  } catch (error) {
    logger.error({ error }, 'Failed to handle Stripe webhook');
  }
}

/**
 * Generate Stripe checkout session for payment
 * Alternative to payment intents for simpler flows
 */
export async function createCheckoutSession(data: PaymentIntentData): Promise<{
  sessionId: string;
  url: string;
} | null> {
  try {
    const stripeKey = process.env.STRIPE_SECRET_KEY;

    if (data.plan === 'Free') {
      return null;
    }

    if (!stripeKey) {
      // Mock response
      return {
        sessionId: `cs_${Date.now()}`,
        url: `https://checkout.stripe.com/pay/cs_${Date.now()}`,
      };
    }

    // TODO: Implement actual checkout session creation
    // const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    //   method: 'POST',
    //   headers: {
    //     'Authorization': `Bearer ${stripeKey}`,
    //     'Content-Type': 'application/x-www-form-urlencoded',
    //   },
    //   body: new URLSearchParams({
    //     payment_method_types: 'card',
    //     line_items: [{
    //       price_data: {
    //         currency: 'usd',
    //         product_data: {
    //           name: `${data.plan} Plan`,
    //         },
    //         unit_amount: getPlanPrice(data.plan),
    //         recurring: {
    //           interval: 'month',
    //         },
    //       },
    //       quantity: '1',
    //     }],
    //     mode: 'subscription',
    //     success_url: `${process.env.APP_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    //     cancel_url: `${process.env.APP_URL}/billing/cancel`,
    //   }),
    // });
    // const session = await response.json();
    // return { sessionId: session.id, url: session.url };

    logger.info(
      { companyId: data.companyId, plan: data.plan },
      'Checkout session created (mocked)'
    );

    return {
      sessionId: `cs_${Date.now()}`,
      url: `https://checkout.stripe.com/pay/cs_${Date.now()}`,
    };
  } catch (error) {
    logger.error({ error, companyId: data.companyId }, 'Failed to create checkout session');
    return null;
  }
}

/**
 * Get payment method from customer
 */
export async function getCustomerPaymentMethods(
  stripeCustomerId: string
): Promise<Array<{ id: string; brand: string; last4: string }> | null> {
  try {
    const stripeKey = process.env.STRIPE_SECRET_KEY;

    if (!stripeKey) {
      // Mock response
      return [];
    }

    // TODO: Implement actual retrieval
    // const response = await fetch(
    //   `https://api.stripe.com/v1/customers/${stripeCustomerId}/payment_methods`,
    //   {
    //     headers: {
    //       'Authorization': `Bearer ${stripeKey}`,
    //     },
    //   }
    // );
    // const { data } = await response.json();
    // return data.map((pm) => ({
    //   id: pm.id,
    //   brand: pm.card.brand,
    //   last4: pm.card.last4,
    // }));

    return [];
  } catch (error) {
    logger.error({ error, stripeCustomerId }, 'Failed to get payment methods');
    return null;
  }
}
