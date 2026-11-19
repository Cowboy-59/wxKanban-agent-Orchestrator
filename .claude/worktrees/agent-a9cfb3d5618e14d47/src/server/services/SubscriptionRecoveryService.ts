import { db } from "~/db/client.js";
import { companies } from "~/db/schema/company.js";
import { companysubscriptions } from "~/db/schema/companysubscription.js";
import { companyStatusHistory } from "~/db/schema/companyStatus.js";
import { userprofiles } from "~/db/schema/userprofiles.js";
import { eq, and, desc, inArray } from "drizzle-orm";
import type Stripe from "stripe";
import {
  createBillingPortalSession,
  getStripe,
  isStripeCcProcessingEnabled,
} from "../lib/stripe.js";
import { sendEmail } from "../lib/email.js";
import {
  getSubscriptionRestartEmailHTML,
  getSubscriptionRestartEmailText,
} from "../lib/emailTemplates.js";
import { createLogger } from "../lib/logger.js";

const logger = createLogger("subscription-recovery");

/**
 * Resolve a Stripe Customer Portal URL for a company (no email). Returns null
 * when the company has no Stripe customer on file. Used by the in-app billing
 * banner so a logged-in admin can self-serve.
 */
export async function getCompanyPortalUrl(companyId: string): Promise<string | null> {
  const [sub] = await db
    .select({ stripecustomerid: companysubscriptions.stripecustomerid })
    .from(companysubscriptions)
    .where(eq(companysubscriptions.companyid, companyId))
    .orderBy(desc(companysubscriptions.createdat))
    .limit(1);
  if (!sub?.stripecustomerid) return null;
  const returnUrl = `${process.env.CLIENT_URL || "http://localhost:5173"}/dashboard`;
  return createBillingPortalSession(sub.stripecustomerid, returnUrl);
}

export interface SubscriptionReason {
  /** Stripe subscription status (or stored status if Stripe is unreachable/off). */
  stripeStatus: string | null;
  /** Human-readable explanation of why the subscription is in its current state. */
  reason: string;
  /** True when the reason was derived from a live Stripe lookup (vs stored/derived only). */
  live: boolean;
}

/**
 * Translate a Stripe subscription (with expanded latest_invoice.payment_intent)
 * into a human reason, focused on why it isn't ACTIVE (SCOPE-067 follow-up).
 */
function deriveReason(sub: Stripe.Subscription): string {
  const status = sub.status;
  if (status === "active" || status === "trialing") return "Subscription is active.";
  if (status === "canceled") return "Subscription was canceled.";
  if (status === "incomplete_expired")
    return "Initial payment window expired — the first payment was never completed.";

  // For incomplete / past_due / unpaid, the PaymentIntent on the latest invoice
  // carries the specific reason.
  const invoice = sub.latest_invoice;
  const pi =
    invoice && typeof invoice !== "string"
      ? (invoice as Stripe.Invoice & { payment_intent?: Stripe.PaymentIntent | string })
          .payment_intent
      : undefined;
  const intent = pi && typeof pi !== "string" ? pi : undefined;

  if (intent?.last_payment_error) {
    const e = intent.last_payment_error;
    const detail = e.message || e.decline_code || e.code || "card error";
    return `Card declined / payment error: ${detail}`;
  }
  switch (intent?.status) {
    case "requires_payment_method":
      return "No valid payment method — the customer never entered/confirmed a card.";
    case "requires_action":
      return "Awaiting customer authentication (e.g. 3-D Secure) — not completed.";
    case "requires_confirmation":
      return "Awaiting payment confirmation.";
    case "processing":
      return "Initial payment is still processing.";
    default:
      break;
  }
  if (status === "past_due" || status === "unpaid")
    return "A recurring payment failed (past due).";
  return "Initial payment was not completed (subscription incomplete).";
}

/**
 * SCOPE-067 follow-up — explain WHY a company's subscription isn't active.
 * Pulls the latest Stripe subscription + its PaymentIntent for the specific
 * reason; falls back to a derived message from stored state when Stripe is
 * disabled/unreachable or no subscription exists.
 */
export async function getSubscriptionReason(companyId: string): Promise<SubscriptionReason> {
  const [sub] = await db
    .select({
      stripesubscriptionid: companysubscriptions.stripesubscriptionid,
      status: companysubscriptions.status,
    })
    .from(companysubscriptions)
    .where(eq(companysubscriptions.companyid, companyId))
    .orderBy(desc(companysubscriptions.createdat))
    .limit(1);

  if (!sub?.stripesubscriptionid) {
    return {
      stripeStatus: null,
      reason: "No Stripe subscription on file — registration never reached payment.",
      live: false,
    };
  }

  if (!isStripeCcProcessingEnabled()) {
    return {
      stripeStatus: sub.status,
      reason: `Stripe is disabled; stored status is "${sub.status}".`,
      live: false,
    };
  }

  try {
    const stripe = getStripe();
    const s = await stripe.subscriptions.retrieve(sub.stripesubscriptionid, {
      expand: ["latest_invoice.payment_intent"],
    });
    return { stripeStatus: s.status, reason: deriveReason(s), live: true };
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error), companyId },
      "Failed to fetch live subscription reason from Stripe",
    );
    return {
      stripeStatus: sub.status,
      reason: `Could not reach Stripe; stored status is "${sub.status}".`,
      live: false,
    };
  }
}

/**
 * Map a Stripe subscription status to the company-level subscriptionstatus.
 * Returns null when Stripe's state doesn't imply a company-status change
 * (incomplete / incomplete_expired / paused — still unresolved).
 */
function mapStripeToCompanyStatus(stripeStatus: string): string | null {
  switch (stripeStatus) {
    case "active":
      return "ACTIVE";
    case "trialing":
      return "TRIAL";
    case "past_due":
    case "unpaid":
      return "PENDING_INACTIVE";
    case "canceled":
      return "CANCELED";
    default:
      return null;
  }
}

export interface ResyncResult {
  companyId: string;
  name?: string;
  stripeStatus: string | null;
  fromCompanyStatus: string;
  /** Target company status, or null when no company-status change applies. */
  toCompanyStatus: string | null;
  changed: boolean;
  note?: string;
}

/**
 * SCOPE-067 follow-up — reconcile a company's local status from Stripe.
 * Some companies sit at PENDING/incomplete locally while their Stripe
 * subscription has since moved on (e.g. active) because the webhook was never
 * delivered/processed. This re-reads Stripe and updates
 * companysubscriptions.status + companies.subscriptionstatus (and period end).
 */
export async function resyncSubscriptionFromStripe(
  companyId: string,
  // [SCOPE 090 / T002] reason/source let a system-initiated caller (e.g. the
  // inline registration activation) label its audit row distinctly from a manual
  // sysadmin reconcile, without changing the row shape. changedBy stays a
  // userprofile UUID or null (the column is a uuid FK) — a system call omits it.
  opts: { dryRun?: boolean; changedBy?: string; reason?: string; source?: string } = {},
): Promise<ResyncResult> {
  const [company] = await db
    .select({ name: companies.name, status: companies.subscriptionstatus })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  if (!company) {
    return { companyId, stripeStatus: null, fromCompanyStatus: "?", toCompanyStatus: null, changed: false, note: "no_company" };
  }

  const [sub] = await db
    .select({
      id: companysubscriptions.id,
      stripesubscriptionid: companysubscriptions.stripesubscriptionid,
      status: companysubscriptions.status,
    })
    .from(companysubscriptions)
    .where(eq(companysubscriptions.companyid, companyId))
    .orderBy(desc(companysubscriptions.createdat))
    .limit(1);

  const base = { companyId, name: company.name, fromCompanyStatus: company.status };
  if (!sub?.stripesubscriptionid) {
    return { ...base, stripeStatus: null, toCompanyStatus: null, changed: false, note: "no_subscription" };
  }
  if (!isStripeCcProcessingEnabled()) {
    return { ...base, stripeStatus: sub.status, toCompanyStatus: null, changed: false, note: "stripe_disabled" };
  }

  let s: Stripe.Subscription;
  try {
    s = await getStripe().subscriptions.retrieve(sub.stripesubscriptionid);
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error), companyId },
      "resync: failed to retrieve subscription from Stripe",
    );
    return { ...base, stripeStatus: sub.status, toCompanyStatus: null, changed: false, note: "stripe_error" };
  }

  const stripeStatus = s.status;
  const mapped = mapStripeToCompanyStatus(stripeStatus);
  const companyChanged = mapped !== null && mapped !== company.status;
  const subChanged = stripeStatus !== sub.status;
  const periodEnd =
    s.items?.data?.[0]?.current_period_end != null
      ? new Date(s.items.data[0].current_period_end * 1000)
      : null;

  if (!opts.dryRun && (companyChanged || subChanged)) {
    if (subChanged || periodEnd) {
      await db
        .update(companysubscriptions)
        .set({ status: stripeStatus, ...(periodEnd ? { currentperiodend: periodEnd } : {}), updatedat: new Date() })
        .where(eq(companysubscriptions.id, sub.id));
    }
    if (companyChanged) {
      const upd: Record<string, unknown> = { subscriptionstatus: mapped };
      if (mapped === "ACTIVE") upd.activeflag = true;
      await db.update(companies).set(upd).where(eq(companies.id, companyId));
      // SCOPE-085 FR-007 — audit every reconcile-driven status change.
      await db.insert(companyStatusHistory).values({
        companyId,
        previousStatus: company.status,
        newStatus: mapped as string,
        // [SCOPE 090 / T002] default preserves the sysadmin reconcile's row verbatim.
        reason: opts.reason ?? "Manual reconcile from Stripe",
        changedBy: opts.changedBy ?? null,
        changedByType: "SYSADMIN",
        metadata: { stripeStatus, source: opts.source ?? "resync" },
      });
    }
    logger.info({ companyId, from: company.status, to: mapped, stripeStatus }, "Resynced subscription from Stripe");
  }

  return {
    ...base,
    stripeStatus,
    toCompanyStatus: companyChanged ? mapped : null,
    changed: companyChanged || subChanged,
    note: subChanged && !companyChanged ? "sub_status_only" : undefined,
  };
}

/**
 * Bulk reconcile every company that isn't cleanly ACTIVE/CANCELED locally.
 * Pass dryRun to preview the changes without writing.
 */
export async function resyncPendingSubscriptions(
  opts: { dryRun?: boolean; changedBy?: string } = {},
): Promise<ResyncResult[]> {
  const rows = await db
    .select({ id: companies.id })
    .from(companies)
    .where(inArray(companies.subscriptionstatus, ["PENDING", "PENDING_INACTIVE", "TRIAL", "SUSPENDED"]));
  const results: ResyncResult[] = [];
  for (const r of rows) {
    results.push(await resyncSubscriptionFromStripe(r.id, opts));
  }
  return results;
}

export interface RestartLinkResult {
  sent: boolean;
  to?: string;
  /** Machine-readable reason when not sent: no_company | exempt | no_stripe_customer | no_recipient | error */
  reason?: string;
}

/**
 * SCOPE-067 — send a Stripe Customer Portal "restart" link to a company's
 * billing/admin contact so they can update their card and restore service.
 *
 * Used by both the failed-payment webhook (best-effort, must not throw) and the
 * sysadmin-triggered "Send restart link" action. Returns a result object rather
 * than throwing so callers can report precisely; billing-exempt companies and
 * companies with no Stripe customer are skipped (FR-011).
 */
export async function sendRestartLink(companyId: string): Promise<RestartLinkResult> {
  try {
    const [company] = await db
      .select({
        name: companies.name,
        billingemail: companies.billingemail,
        billingexempt: companies.billingexempt,
      })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);

    if (!company) return { sent: false, reason: "no_company" };
    if (company.billingexempt) return { sent: false, reason: "exempt" };

    const [sub] = await db
      .select({ stripecustomerid: companysubscriptions.stripecustomerid })
      .from(companysubscriptions)
      .where(eq(companysubscriptions.companyid, companyId))
      .orderBy(desc(companysubscriptions.createdat))
      .limit(1);

    if (!sub?.stripecustomerid) return { sent: false, reason: "no_stripe_customer" };

    // Recipient: explicit billing email, else the first active company ADMIN.
    let recipient = company.billingemail ?? null;
    if (!recipient) {
      const [admin] = await db
        .select({ email: userprofiles.emailaddr })
        .from(userprofiles)
        .where(
          and(
            eq(userprofiles.companyid, companyId),
            eq(userprofiles.usertype, "ADMIN"),
            eq(userprofiles.active, true),
          ),
        )
        .limit(1);
      recipient = admin?.email ?? null;
    }
    if (!recipient) return { sent: false, reason: "no_recipient" };

    const returnUrl = `${process.env.CLIENT_URL || "http://localhost:5173"}/dashboard`;
    const portalUrl = await createBillingPortalSession(sub.stripecustomerid, returnUrl);

    await sendEmail(
      recipient,
      "Action needed: update your wxKanban billing",
      getSubscriptionRestartEmailHTML(portalUrl, company.name),
      getSubscriptionRestartEmailText(portalUrl, company.name),
    );

    logger.info({ companyId, to: recipient }, "Sent subscription restart link");
    return { sent: true, to: recipient };
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error), companyId },
      "Failed to send subscription restart link",
    );
    return { sent: false, reason: "error" };
  }
}
