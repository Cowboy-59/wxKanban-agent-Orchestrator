import type Stripe from "stripe";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { companies } from "../../db/schema/company.js";
import { companysubscriptions, type CompanySubscription } from "../../db/schema/companysubscription.js";
import { subscriptionbillingevents } from "../../db/schema/subscriptionbillingevent.js";
import { subscriptionbillinghistory } from "../../db/schema/subscriptionbillinghistory.js";
import { notifications } from "../../db/schema/notification.js";
import { userprofiles } from "../../db/schema/userprofiles.js";
import { createLogger } from "../lib/logger.js";
import { stripeConfig } from "../lib/stripe.js";
import { sendRestartLink } from "./SubscriptionRecoveryService.js";
// [SCOPE 131 / T005] effective-cancellation stamp, pause mapping and their audit rows.
import { recordSystemTransition } from "./SubscriptionLifecycleService.js";
import { clearSubscriptionGateCache } from "../middleware/requireActiveSubscription.js";
import { isCancelledStatus } from "../../shared/subscription-policy.js";

const logger = createLogger("stripe-webhook-handler");

/**
 * Reverse-lookup wxKanban plan name from a Stripe price ID using the
 * STRIPE_PRICE_* env-var mapping in stripeConfig.pricing. Returns null when
 * the price ID is unknown (newly-created Stripe price not yet in our config),
 * which a caller should log rather than silently ignore.
 */
function planNameFromPriceId(priceId: string | null | undefined): string | null {
  if (!priceId) return null;
  for (const [name, info] of Object.entries(stripeConfig.pricing)) {
    if (info.priceId && info.priceId === priceId) return name;
  }
  return null;
}

/**
 * Top-level dispatcher for Stripe events that have already cleared signature
 * verification (spec 023 FR-006 / Chunk C).
 *
 * Flow:
 *   1. Idempotency check — return early if we already recorded this event id
 *      (Stripe retries on 5xx; without this, retries would double-write).
 *   2. Resolve the wxKanban `companysubscriptions` row this event refers to.
 *      Events for unknown subscriptions are logged and skipped (no insert) —
 *      `subscriptionbillingevents.companysubscriptionid` is NOT NULL so the
 *      row would otherwise fail the FK constraint.
 *   3. Insert the event row before running the handler so idempotency holds
 *      even if the handler crashes partway through.
 *   4. Dispatch by `event.type`. Handlers are pure side-effects; failures
 *      bubble up so the route's outer try/catch can decide how to respond.
 */
// [SCOPE 090 / T003] BEGIN — activation-relevant event types + id extraction.
// Events that can carry a first activation. When one of these resolves to no
// subscription row, it is the SCOPE-090 registration race (event landed before
// the row existed) and MUST be logged with enough detail to detect/count it,
// not dropped silently.
const ACTIVATION_EVENT_TYPES = new Set<string>([
  "invoice.paid",
  "invoice.payment_succeeded",
  "customer.subscription.created",
  "customer.subscription.updated",
]);

// Extract the Stripe subscription + customer ids from an event, mirroring the
// resolveCompanySubscription switch. Shared so the unknown-subscription warn can
// report the same ids the resolver looked up.
function extractStripeIdsFromEvent(event: Stripe.Event): {
  stripeSubId: string | null;
  stripeCustomerId: string | null;
} {
  const pickId = (v: unknown): string | null =>
    !v ? null : typeof v === "string" ? v : ((v as { id?: string }).id ?? null);
  switch (event.type) {
    case "invoice.paid":
    case "invoice.payment_succeeded":
    case "invoice.payment_failed": {
      const inv = event.data.object as Stripe.Invoice;
      return { stripeSubId: extractInvoiceSubscriptionId(inv), stripeCustomerId: pickId(inv.customer) };
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      return { stripeSubId: sub.id, stripeCustomerId: pickId(sub.customer) };
    }
    default:
      return { stripeSubId: null, stripeCustomerId: null };
  }
}
// [SCOPE 090 / T003] END

export async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  const existing = await db
    .select({ id: subscriptionbillingevents.id })
    .from(subscriptionbillingevents)
    .where(eq(subscriptionbillingevents.stripeeventid, event.id))
    .limit(1);

  if (existing.length > 0) {
    logger.info(
      { eventId: event.id, eventType: event.type },
      "Duplicate Stripe event — already processed, skipping",
    );
    return;
  }

  const sub = await resolveCompanySubscription(event);
  if (!sub) {
    // [SCOPE 090 / T003] An activation-relevant event with no row is the
    // registration race (event beat the companysubscriptions insert). Emit a
    // structured, greppable warn (type + event/customer/subscription ids) so
    // the race is countable — the inline registration reconcile (FR-001) should
    // drive these toward zero. Non-activation events keep the generic skip warn.
    if (ACTIVATION_EVENT_TYPES.has(event.type)) {
      const { stripeSubId, stripeCustomerId } = extractStripeIdsFromEvent(event);
      logger.warn(
        {
          eventId: event.id,
          eventType: event.type,
          stripeCustomerId,
          stripeSubId,
          activationRelevant: true,
        },
        "Stripe activation event references unknown subscription (row not yet created) — skipping; registration race (SCOPE-090)",
      );
    } else {
      logger.warn(
        { eventId: event.id, eventType: event.type },
        "Stripe event references unknown subscription — skipping",
      );
    }
    return;
  }

  await db.insert(subscriptionbillingevents).values({
    companysubscriptionid: sub.id,
    eventtype: event.type,
    eventstatus: "received",
    stripeeventid: event.id,
    payload: event.data.object as unknown as Record<string, unknown>,
  });

  switch (event.type) {
    case "invoice.paid":
    case "invoice.payment_succeeded":
      await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice, sub);
      break;
    case "invoice.payment_failed":
      await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice, sub);
      break;
    case "customer.subscription.created":
    case "customer.subscription.updated":
      await handleSubscriptionUpdated(event.data.object as Stripe.Subscription, sub);
      break;
    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(event.data.object as Stripe.Subscription, sub);
      break;
    default:
      logger.info({ eventType: event.type }, "Unhandled Stripe event type");
  }
}

/**
 * Extract the Stripe subscription id from an invoice across API versions.
 * The top-level `invoice.subscription` field was removed in 2025+ API versions
 * (the endpoint sends `2026-03-25.dahlia`), where it moved to
 * `invoice.parent.subscription_details.subscription`; older payloads still use
 * the top-level field. We read all known locations so the handler is resilient
 * to the endpoint's API version.
 */
function extractInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const inv = invoice as unknown as {
    subscription?: string | { id?: string } | null;
    parent?: { subscription_details?: { subscription?: string | { id?: string } | null } | null } | null;
    lines?: { data?: Array<{
      subscription?: string | { id?: string } | null;
      parent?: { subscription_item_details?: { subscription?: string | { id?: string } | null } | null } | null;
    }> } | null;
  };
  const pick = (v: string | { id?: string } | null | undefined): string | null =>
    !v ? null : typeof v === "string" ? v : v.id ?? null;

  return (
    pick(inv.subscription) ||
    pick(inv.parent?.subscription_details?.subscription) ||
    (() => {
      for (const line of inv.lines?.data ?? []) {
        const id = pick(line.subscription) || pick(line.parent?.subscription_item_details?.subscription);
        if (id) return id;
      }
      return null;
    })()
  );
}

/**
 * Find the wxKanban `companysubscriptions` row referenced by this event.
 * Returns null when the event type is not one we track or when the referenced
 * Stripe subscription has no matching row in our DB.
 */
async function resolveCompanySubscription(
  event: Stripe.Event,
): Promise<CompanySubscription | null> {
  // [SCOPE 090 / T003] shared id extraction (also used by the unknown-subscription warn).
  const { stripeSubId, stripeCustomerId } = extractStripeIdsFromEvent(event);
  if (!stripeSubId && !stripeCustomerId) return null;

  // Primary: match by Stripe subscription id.
  if (stripeSubId) {
    const [row] = await db
      .select()
      .from(companysubscriptions)
      .where(eq(companysubscriptions.stripesubscriptionid, stripeSubId))
      .limit(1);
    if (row) return row;
  }

  // SCOPE-085 FR-002 — resilient fallback: match by Stripe customer id (latest
  // subscription row) so an event whose subscription id isn't on file is NOT
  // silently dropped. This defends against the invoice→subscription-id
  // extraction failing across Stripe API versions.
  if (stripeCustomerId) {
    const [row] = await db
      .select()
      .from(companysubscriptions)
      .where(eq(companysubscriptions.stripecustomerid, stripeCustomerId))
      .orderBy(desc(companysubscriptions.createdat))
      .limit(1);
    if (row) {
      logger.warn(
        { eventId: event.id, eventType: event.type, stripeSubId, stripeCustomerId },
        "Resolved subscription by customer-id fallback (subscription id not matched)",
      );
      return row;
    }
  }

  return null;
}

/**
 * C.4 — `invoice.paid` / `invoice.payment_succeeded`.
 *
 * Records the payment in `subscriptionbillinghistory` and, if this is the
 * first invoice for a freshly-registered company, transitions the company
 * from `PENDING` → `ACTIVE` (FR-001 activation gate).
 *
 * FR-002a: a promo subscription opens with a $0 "Free trial" invoice that Stripe
 * marks paid immediately. That is not a payment and must not be recorded as one,
 * nor treated as the FR-001 activation event — a trialing company belongs in
 * TRIAL until the first real charge clears at promo end.
 */
async function handleInvoicePaymentSucceeded(
  invoice: Stripe.Invoice,
  sub: CompanySubscription,
): Promise<void> {
  const billingReason = invoice.billing_reason;

  if (invoice.amount_paid === 0) {
    logger.info(
      {
        companyId: sub.companyid,
        subscriptionId: sub.id,
        invoiceId: invoice.id,
        billingReason,
      },
      "Skipping $0 invoice (promo/trial opening invoice) — not a payment",
    );
    return;
  }
  const displayPrefix =
    billingReason === "subscription_create"
      ? "Initial subscription payment"
      : billingReason === "subscription_cycle"
        ? "Subscription renewal"
        : billingReason === "subscription_update"
          ? "Subscription update"
          : "Subscription payment";

  const occurredat =
    invoice.status_transitions?.paid_at != null
      ? new Date(invoice.status_transitions.paid_at * 1000)
      : new Date(invoice.created * 1000);

  await db.insert(subscriptionbillinghistory).values({
    companysubscriptionid: sub.id,
    historytype: "payment_success",
    amount: (invoice.amount_paid / 100).toFixed(2),
    referencedocid: invoice.id ?? null,
    displaylabel: `${displayPrefix} — ${sub.planname}`,
    occurredat,
  });

  if (billingReason === "subscription_create") {
    // [SCOPE 109 / T007] MODIFIED-BY — capture whether this call actually made
    // the PENDING→ACTIVE transition. The conditional WHERE already made this
    // idempotent; returning the row tells us which invocation was the real one,
    // so the welcome fires on the transition rather than on every replay.
    const activated = await db
      .update(companies)
      .set({ subscriptionstatus: "ACTIVE" })
      .where(
        and(
          eq(companies.id, sub.companyid),
          eq(companies.subscriptionstatus, "PENDING"),
        ),
      )
      .returning({ id: companies.id });
    logger.info(
      { companyId: sub.companyid, subscriptionId: sub.id },
      "Activated company on first successful payment (FR-001 gate)",
    );

    // [SCOPE 109 / T007] SPEC-109 FR-005 — welcome the new customer.
    // Fire-and-forget inside a catch that can only log: a welcome must never
    // fail, delay, or roll back a payment activation.
    if (activated.length > 0) {
      void import("./WelcomeMessageService.js")
        .then((m) => m.welcomeCompanyUsers(sub.companyid))
        .catch((err) =>
          logger.error({ err, companyId: sub.companyid }, "Welcome-on-activation failed (non-fatal)"),
        );
    }
  }

  logger.info(
    {
      subscriptionId: sub.id,
      invoiceId: invoice.id,
      amount: invoice.amount_paid,
      billingReason,
    },
    "Recorded successful payment",
  );
}

/**
 * C.5 — `invoice.payment_failed`.
 *
 * Records the failure in `subscriptionbillinghistory`, marks the subscription
 * past_due locally (Stripe's standard transition for unpaid recurring
 * invoices), and notifies every active company admin so they can update the
 * payment method. Does NOT deactivate the company — Stripe's smart-retry /
 * dunning sequence runs for ~3 attempts over a week. If those fail, the
 * subsequent `customer.subscription.deleted` event (C.7) will close it out.
 */
async function handleInvoicePaymentFailed(
  invoice: Stripe.Invoice,
  sub: CompanySubscription,
): Promise<void> {
  const occurredat = new Date(invoice.created * 1000);
  const amountDue = (invoice.amount_due / 100).toFixed(2);

  await db.insert(subscriptionbillinghistory).values({
    companysubscriptionid: sub.id,
    historytype: "payment_failed",
    amount: amountDue,
    referencedocid: invoice.id ?? null,
    displaylabel: `Payment failed — ${sub.planname} ($${amountDue})`,
    occurredat,
  });

  await db
    .update(companysubscriptions)
    .set({ status: "past_due", updatedat: new Date() })
    .where(eq(companysubscriptions.id, sub.id));

  // SCOPE-067: canonical "payment failed, awaiting resolution" status. Only
  // email + flip if not already PENDING_INACTIVE, so Stripe's retry sequence
  // doesn't re-spam the customer.
  const [companyRow] = await db
    .select({ subscriptionstatus: companies.subscriptionstatus })
    .from(companies)
    .where(eq(companies.id, sub.companyid))
    .limit(1);
  const alreadyPending = companyRow?.subscriptionstatus === "PENDING_INACTIVE";

  await db
    .update(companies)
    .set({ subscriptionstatus: "PENDING_INACTIVE" })
    .where(eq(companies.id, sub.companyid));

  // SCOPE-067 FR-006: auto-email the customer a Stripe Portal restart link.
  // Best-effort — must never block webhook processing.
  if (!alreadyPending) {
    try {
      const result = await sendRestartLink(sub.companyid);
      logger.info({ companyId: sub.companyid, emailResult: result }, "Restart link email attempted");
    } catch (e) {
      logger.error({ err: e, companyId: sub.companyid }, "Restart link email threw (ignored)");
    }
  }

  // Notify every active admin for this company so somebody can update the
  // payment method before Stripe's retry window closes.
  const admins = await db
    .select({ id: userprofiles.id })
    .from(userprofiles)
    .where(
      and(
        eq(userprofiles.companyid, sub.companyid),
        eq(userprofiles.usertype, "ADMIN"),
        eq(userprofiles.active, true),
      ),
    );

  if (admins.length > 0) {
    const message = `Subscription payment failed for ${sub.planname} ($${amountDue}). Please update your payment method to avoid service interruption.`;
    await db.insert(notifications).values(
      admins.map((a) => ({
        userid: a.id,
        type: "payment_failed",
        entityid: sub.id,
        entitytype: "subscription",
        message,
      })),
    );
  }

  logger.warn(
    {
      subscriptionId: sub.id,
      companyId: sub.companyid,
      invoiceId: invoice.id,
      amountDue: invoice.amount_due,
      adminsNotified: admins.length,
      nextPaymentAttempt: invoice.next_payment_attempt,
    },
    "Recorded failed payment + notified admins",
  );
}

/**
 * C.6 — `customer.subscription.updated`.
 *
 * Reconciles local state with Stripe after a subscription change. Most often
 * fires after Chunk D's PATCH /api/company/subscription triggers a Stripe-side
 * proration, but also fires on Stripe-initiated changes (status moves,
 * payment-method updates that affect billing, period rollovers).
 *
 * Resilient to partial info: we update each field independently — if the
 * Stripe payload is missing a price (rare) or has a price ID we don't
 * recognize, we update what we can and log the gap.
 */
async function handleSubscriptionUpdated(
  subscription: Stripe.Subscription,
  sub: CompanySubscription,
): Promise<void> {
  const item = subscription.items.data[0];
  const priceId = item?.price.id ?? null;
  const planName = planNameFromPriceId(priceId);
  const planAmount =
    item?.price.unit_amount != null
      ? (item.price.unit_amount / 100).toFixed(2)
      : null;

  // Stripe SDK v22 moved current_period_start / current_period_end from
  // Subscription onto SubscriptionItem. Both are Unix-seconds timestamps.
  const periodStart =
    item?.current_period_start != null
      ? new Date(item.current_period_start * 1000)
      : null;
  const periodEnd =
    item?.current_period_end != null
      ? new Date(item.current_period_end * 1000)
      : null;

  const updates: Partial<typeof companysubscriptions.$inferInsert> = {
    status: subscription.status,
    updatedat: new Date(),
  };
  if (planName) updates.planname = planName;
  if (planAmount) updates.planamount = planAmount;
  if (periodStart) updates.currentperiodstart = periodStart;
  if (periodEnd) updates.currentperiodend = periodEnd;

  await db
    .update(companysubscriptions)
    .set(updates)
    .where(eq(companysubscriptions.id, sub.id));

  // SCOPE-067: reflect Stripe status transitions onto the company record so the
  // sysadmin/company-facing status stays in sync. Recovery (active) clears the
  // failed state; past_due/unpaid set PENDING_INACTIVE; trialing (FR-002a promo)
  // sets TRIAL. Must stay in step with SubscriptionRecoveryService's
  // mapStripeToCompanyStatus, which the registration reconcile and the sysadmin
  // "Recheck Stripe" action both use — the two disagreeing is how a promo signup
  // ends up with a different status depending on which path happened to win.
  // incomplete/incomplete_expired/paused remain unmapped (still unresolved).
  let companyStatus: string | null = null;
  if (subscription.status === "active") companyStatus = "ACTIVE";
  else if (subscription.status === "trialing") companyStatus = "TRIAL";
  else if (subscription.status === "past_due" || subscription.status === "unpaid")
    companyStatus = "PENDING_INACTIVE";

  // [SCOPE 131 / T006] MODIFIED-BY — pause state and cancellation markers.
  //
  // A paused subscription keeps Stripe status `active`, so without this the map
  // above would report a paused company as ACTIVE and unwall it. `pause_collection`
  // therefore outranks the status map. Handling it here also means a pause applied
  // from the Stripe dashboard rather than our UI is not lost (FR-006).
  const [companyNow] = await db
    .select({
      subscriptionstatus: companies.subscriptionstatus,
      cancelledat: companies.cancelledat,
      pausedat: companies.pausedat,
    })
    .from(companies)
    .where(eq(companies.id, sub.companyid))
    .limit(1);

  const stripePaused = subscription.pause_collection != null;
  const now = new Date();
  const companyUpdate: Record<string, unknown> = {};

  if (stripePaused) {
    companyStatus = "PAUSED";
    if (companyNow?.pausedat == null) companyUpdate.pausedat = now;
  } else if (companyStatus === "ACTIVE" || companyStatus === "TRIAL") {
    // Unpaused, or never paused.
    if (companyNow?.pausedat != null) companyUpdate.pausedat = null;

    // A resubscribe clears the archival clock (FR-005). Only on the way OUT of a
    // cancelled status — an ACTIVE company's `cancelledat` is already null, and
    // blindly writing null here would be a no-op at best and a way to erase the
    // sweep's only signal at worst.
    if (isCancelledStatus(companyNow?.subscriptionstatus) || companyNow?.cancelledat != null) {
      companyUpdate.cancelledat = null;
      logger.info(
        { companyId: sub.companyid },
        "Resubscribe detected — cancelledat cleared, archival clock stopped",
      );
    }

    // Clear a pending cancellation ONLY when Stripe says the flag is actually off.
    // Setting `cancel_at_period_end: true` itself emits this event, so clearing
    // unconditionally would erase the marker we had just written and leave a
    // cancelling customer with no pending state at all.
    if (subscription.cancel_at_period_end === false) {
      companyUpdate.cancelrequestedat = null;
    }
  }

  if (companyStatus) companyUpdate.subscriptionstatus = companyStatus;

  if (Object.keys(companyUpdate).length > 0) {
    companyUpdate.updatedat = now;
    await db
      .update(companies)
      .set(companyUpdate)
      .where(eq(companies.id, sub.companyid));
    clearSubscriptionGateCache(sub.companyid);
  }

  if (priceId && !planName) {
    logger.warn(
      { subscriptionId: sub.id, priceId },
      "Stripe price ID does not match any STRIPE_PRICE_* env var — planname not updated",
    );
  }

  logger.info(
    {
      subscriptionId: sub.id,
      stripeStatus: subscription.status,
      planName,
      planAmount,
    },
    "Synced subscription update from Stripe",
  );
}

/**
 * C.7 — `customer.subscription.deleted`.
 *
 * Stripe fires this when a subscription is fully canceled (either after the
 * `cancel_at_period_end` window closes or when the customer is deleted in
 * Stripe directly). Marks the local subscription canceled but deliberately
 * leaves `companies.billingplan` alone — feature gating stays based on the
 * plan until a separate process explicitly downgrades to FREE.
 */
async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription,
  sub: CompanySubscription,
): Promise<void> {
  const canceledat =
    subscription.canceled_at != null
      ? new Date(subscription.canceled_at * 1000)
      : new Date();

  await db
    .update(companysubscriptions)
    .set({
      status: "canceled",
      canceledat,
      updatedat: new Date(),
    })
    .where(eq(companysubscriptions.id, sub.id));

  // [SCOPE 131 / T005] MODIFIED-BY — this is where the archival clock starts (FR-005).
  //
  // `cancelledat` is the ONLY signal SPEC-132's sweep acts on, so it is stamped here
  // and nowhere else: at effective cancellation, never at the click. Three guards
  // around that one write:
  //
  //  - Stamp once. If `cancelledat` is already set, this event is a Stripe retry or
  //    a duplicate and must not move the 30-day clock forward.
  //  - Never stamp a PAUSED company (FR-007). A paused company is walled but is not
  //    leaving, and a `cancelledat` on one would have it scrubbed 30 days later.
  //  - Clear `cancelrequestedat`: the request has now been fulfilled, and leaving it
  //    set would make the panel offer to reverse a cancellation that has completed.
  const [current] = await db
    .select({
      subscriptionstatus: companies.subscriptionstatus,
      cancelledat: companies.cancelledat,
      pausedat: companies.pausedat,
    })
    .from(companies)
    .where(eq(companies.id, sub.companyid))
    .limit(1);

  const isPaused = (current?.subscriptionstatus ?? "").toUpperCase() === "PAUSED";
  const alreadyStamped = current?.cancelledat != null;
  const now = new Date();

  const companyUpdate: Record<string, unknown> = {
    // Per SPEC-131 FR-005. Production rows written before this carry the one-L
    // spelling; every read added by SPEC-131 goes through `isCancelledStatus`,
    // which accepts both.
    subscriptionstatus: "CANCELLED",
    cancelrequestedat: null,
    updatedat: now,
  };
  if (!alreadyStamped && !isPaused) {
    companyUpdate.cancelledat = now;
  }

  await db
    .update(companies)
    .set(companyUpdate)
    .where(eq(companies.id, sub.companyid));

  if (isPaused) {
    logger.warn(
      { subscriptionId: sub.id, companyId: sub.companyid },
      "Subscription deleted while company was PAUSED — cancelledat deliberately NOT stamped (FR-007)",
    );
  }

  await recordSystemTransition({
    companyId: sub.companyid,
    previousStatus: current?.subscriptionstatus ?? null,
    newStatus: "CANCELLED",
    transition: "CANCEL_EFFECTIVE",
    metadata: {
      stripeSubscriptionId: sub.stripesubscriptionid,
      cancelledatStamped: !alreadyStamped && !isPaused,
      skippedBecausePaused: isPaused,
    },
  });

  clearSubscriptionGateCache(sub.companyid);

  logger.info(
    {
      subscriptionId: sub.id,
      companyId: sub.companyid,
      canceledat,
      cancelledatStamped: !alreadyStamped && !isPaused,
    },
    "Recorded subscription cancellation",
  );
}
