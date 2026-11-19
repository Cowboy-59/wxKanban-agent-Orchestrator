// [SCOPE 131 / T001] BEGIN — customer-initiated subscription lifecycle (FR-001…FR-007, FR-010)
/**
 * SPEC-131. The four verbs a company ADMIN can perform on their own subscription:
 * cancel, un-cancel, suspend, resume. Completes SCOPE-023 Chunk D, specified in
 * April 2026 and never built.
 *
 * Three rules hold everywhere in this module, and every one of them exists because
 * getting it wrong is worse than doing nothing:
 *
 * 1. **Stripe first, local write second.** Every mutation calls Stripe and only
 *    writes to our database once Stripe has acknowledged. A Stripe failure therefore
 *    leaves the database untouched, so the two can disagree only in the direction we
 *    can detect and repair (Stripe ahead of us), never the direction we cannot
 *    (us claiming a cancellation Stripe never received). SPEC-131 success metric 3.
 *
 * 2. **Cancelling records an intent, not an outcome.** The click writes
 *    `cancelrequestedat` and leaves `subscriptionstatus` alone. `evaluateAccess`
 *    allow-lists only ACTIVE/TRIAL and the client wall runs it unconditionally with
 *    no env flag, so writing CANCELLED here would wall a customer out of days they
 *    have already paid for while Stripe carried on billing them. Only the period-end
 *    webhook (T005) may write CANCELLED and stamp `cancelledat`.
 *
 * 3. **A paused company never acquires a `cancelledat`.** That stamp is the sole
 *    signal SPEC-132's archival sweep acts on. Pausing is reversible and must never
 *    start a deletion clock; `assertNotPaused` enforces it at the one place that
 *    could.
 */
import { desc, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { companies } from "../../db/schema/company.js";
import {
  companysubscriptions,
  type CompanySubscription,
} from "../../db/schema/companysubscription.js";
import { companyStatusHistory } from "../../db/schema/companyStatus.js";
import { createLogger } from "../lib/logger.js";
import {
  cancelSubscription,
  resumeSubscription,
  pauseSubscriptionCollection,
  unpauseSubscriptionCollection,
} from "../lib/stripe.js";
import { ConflictError, NotFoundError } from "../middleware/errorHandler.js";
import { clearSubscriptionGateCache } from "../middleware/requireActiveSubscription.js";
import { isCancelledStatus } from "../../shared/subscription-policy.js";
import { sendCancellationConfirmation } from "./SubscriptionCancellationEmail.js"; // [SCOPE 131 / T014]

const logger = createLogger("subscription-lifecycle");

/** Who initiated a transition. SOC 2 CC7.2 — attribution is the point of the record. */
export type TransitionActor = "CUSTOMER" | "SYSTEM" | "SYSADMIN";

/** The five customer-initiated transitions SPEC-131 FR-010 requires auditing. */
export type LifecycleTransition =
  | "CANCEL_REQUESTED"
  | "CANCEL_REVERSED"
  | "PAUSED"
  | "RESUMED"
  | "CANCEL_EFFECTIVE";

export interface LifecycleState {
  subscriptionstatus: string;
  /** Cancellation requested but not yet effective — access continues until `effectiveDate`. */
  cancellationPending: boolean;
  cancelrequestedat: Date | null;
  cancelledat: Date | null;
  pausedat: Date | null;
  paused: boolean;
  /** When a pending cancellation takes effect. Null when nothing is pending. */
  effectiveDate: Date | null;
  /** False when the company has no Stripe subscription — no verb is available. */
  manageable: boolean;
}

export interface LifecycleResult {
  companyId: string;
  transition: LifecycleTransition;
  effectiveDate: Date | null;
  state: LifecycleState;
}
// [SCOPE 131 / T001] END

// [SCOPE 131 / T001] BEGIN — company + subscription resolution with explicit refusals
interface ResolvedCompany {
  id: string;
  name: string;
  subscriptionstatus: string | null;
  billingexempt: boolean | null;
  cancelrequestedat: Date | null;
  cancelledat: Date | null;
  pausedat: Date | null;
}

async function loadCompany(companyId: string): Promise<ResolvedCompany> {
  const [company] = await db
    .select({
      id: companies.id,
      name: companies.name,
      subscriptionstatus: companies.subscriptionstatus,
      billingexempt: companies.billingexempt,
      cancelrequestedat: companies.cancelrequestedat,
      cancelledat: companies.cancelledat,
      pausedat: companies.pausedat,
    })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);

  if (!company) {
    throw new NotFoundError("Company not found");
  }
  return company;
}

/**
 * The company's current Stripe subscription row.
 *
 * Refuses with 409 rather than returning null, because every caller here is a
 * mutation and a silent success is the failure mode SPEC-131 FR-001 names
 * explicitly: the old stub logged "not yet implemented" and returned normally,
 * so a customer who clicked cancel was told it worked and was still billed.
 */
async function loadStripeSubscription(
  companyId: string,
): Promise<CompanySubscription> {
  const [sub] = await db
    .select()
    .from(companysubscriptions)
    .where(eq(companysubscriptions.companyid, companyId))
    .orderBy(desc(companysubscriptions.createdat))
    .limit(1);

  if (!sub?.stripesubscriptionid) {
    throw new ConflictError(
      "This company has no Stripe subscription to manage. Nothing was changed.",
    );
  }
  return sub;
}

/**
 * Billing-exempt companies never reach Stripe at all (SCOPE-023 design decision),
 * so there is nothing to cancel or pause and any attempt is a caller error rather
 * than a state to reconcile.
 */
function assertManageable(company: ResolvedCompany): void {
  if (company.billingexempt === true) {
    throw new ConflictError(
      "This company is billing-exempt and has no subscription to manage.",
    );
  }
}

/**
 * FR-007's hard guarantee, enforced at the only place that could break it.
 * A paused company must never acquire a `cancelledat`, because that stamp is the
 * only thing SPEC-132's archival sweep reads — a paused company that acquired one
 * would be scrubbed 30 days later despite having done nothing but pause.
 */
function assertNotPaused(company: ResolvedCompany, action: string): void {
  if ((company.subscriptionstatus ?? "").toUpperCase() === "PAUSED") {
    throw new ConflictError(
      `Billing is suspended for this company. Resume it before you ${action}.`,
    );
  }
}
// [SCOPE 131 / T001] END

// [SCOPE 131 / T015] BEGIN — audit every customer-initiated transition (FR-010)
/**
 * SOC 2 CC7.2. The record lives in `company_status_history`, a table separate from
 * the row being changed, so an actor who alters company state cannot quietly alter
 * the evidence of having done so in the same write.
 *
 * `company_status_history` is underscore-named. That is the documented exception to
 * the house naming convention, not a defect — do not "correct" it.
 *
 * A failure to write the audit row is logged and swallowed. That is deliberate and
 * it is a trade-off, not an oversight: the alternative is throwing after Stripe has
 * already been mutated, which would leave the customer's subscription changed, our
 * database unchanged, and an error on their screen. An unlogged-but-applied
 * transition is recoverable from Stripe; a silent divergence is not.
 */
async function recordTransition(params: {
  companyId: string;
  previousStatus: string | null;
  newStatus: string;
  transition: LifecycleTransition;
  actorType: TransitionActor;
  actorUserId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.insert(companyStatusHistory).values({
      companyId: params.companyId,
      previousStatus: params.previousStatus,
      newStatus: params.newStatus,
      reason: `SPEC-131 ${params.transition} (${params.actorType.toLowerCase()}-initiated)`,
      changedBy: params.actorUserId ?? null,
      changedByType: params.actorType,
      metadata: { transition: params.transition, spec: "SPEC-131", ...params.metadata },
    });
  } catch (error) {
    logger.error(
      { error, companyId: params.companyId, transition: params.transition },
      "Failed to write company_status_history row — the transition itself HAS been applied",
    );
  }
}

/** Exposed so the webhook (T005) audits the effective cancellation the same way. */
export async function recordSystemTransition(params: {
  companyId: string;
  previousStatus: string | null;
  newStatus: string;
  transition: LifecycleTransition;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await recordTransition({ ...params, actorType: "SYSTEM", actorUserId: null });
}
// [SCOPE 131 / T015] END

// [SCOPE 131 / T008] BEGIN — the state the panel renders from (FR-011)
/**
 * One read that answers all three panel states, so the client does not have to
 * make a second call or infer "cancellation pending" from the absence of something.
 */
export async function getLifecycleState(
  companyId: string,
): Promise<LifecycleState> {
  const company = await loadCompany(companyId);

  const [sub] = await db
    .select()
    .from(companysubscriptions)
    .where(eq(companysubscriptions.companyid, companyId))
    .orderBy(desc(companysubscriptions.createdat))
    .limit(1);

  const status = (company.subscriptionstatus ?? "").toUpperCase();
  const cancellationPending =
    company.cancelrequestedat != null && !isCancelledStatus(status);

  return {
    subscriptionstatus: status,
    cancellationPending,
    cancelrequestedat: company.cancelrequestedat,
    cancelledat: company.cancelledat,
    pausedat: company.pausedat,
    paused: status === "PAUSED",
    // The date access actually ends is the end of the period already paid for.
    // The webhook keeps `currentperiodend` in step with Stripe, so it is the same
    // value Stripe reports as `cancel_at`.
    effectiveDate: cancellationPending ? (sub?.currentperiodend ?? null) : null,
    manageable:
      company.billingexempt !== true && Boolean(sub?.stripesubscriptionid),
  };
}
// [SCOPE 131 / T008] END

// [SCOPE 131 / T003] BEGIN — cancellation is pending, not applied (FR-001, FR-003)
/**
 * Cancel at period end.
 *
 * The customer keeps every day they have already paid for, and can reverse this
 * until the period actually closes. `subscriptionstatus` is deliberately NOT
 * touched — see rule 2 in the module header. This is the task most likely to be
 * "simplified" into a bug by someone who assumes cancelling should set CANCELLED.
 */
export async function requestCancellation(
  companyId: string,
  actorUserId: string | null,
  // [SCOPE 131 / T003] MODIFIED-BY — actor is a parameter, not a constant.
  // SPEC-131 shipped this hardcoded to CUSTOMER because the only caller was the
  // customer's own billing panel. The SYSADMIN company console now cancels on a
  // company's behalf, and an operator action recorded as customer-initiated
  // would make `changedByType` — the column the spec relies on for attribution
  // — silently wrong. Defaulted so every existing caller keeps its meaning.
  actor: TransitionActor = "CUSTOMER",
): Promise<LifecycleResult> {
  const company = await loadCompany(companyId);
  assertManageable(company);
  assertNotPaused(company, "cancel");

  if (company.cancelrequestedat != null) {
    throw new ConflictError(
      "A cancellation is already pending for this company.",
    );
  }
  if (isCancelledStatus(company.subscriptionstatus)) {
    throw new ConflictError("This subscription is already cancelled.");
  }

  const sub = await loadStripeSubscription(companyId);

  // Stripe first. If this throws, nothing below runs and nothing local changes.
  const stripeSub = await cancelSubscription(sub.stripesubscriptionid);

  const cancelAt =
    stripeSub.cancel_at != null ? new Date(stripeSub.cancel_at * 1000) : null;
  const now = new Date();

  await db
    .update(companies)
    .set({ cancelrequestedat: now, updatedat: now })
    .where(eq(companies.id, companyId));

  // Keep the period end in step with what Stripe just told us, so the panel and
  // the confirmation email quote the same date Stripe will act on.
  if (cancelAt) {
    await db
      .update(companysubscriptions)
      .set({ currentperiodend: cancelAt, updatedat: now })
      .where(eq(companysubscriptions.id, sub.id));
  }

  await recordTransition({
    companyId,
    previousStatus: company.subscriptionstatus,
    // Status is unchanged on purpose; the audit row records the REQUEST.
    newStatus: company.subscriptionstatus ?? "UNKNOWN",
    transition: "CANCEL_REQUESTED",
    actorType: actor,
    actorUserId,
    metadata: {
      stripeSubscriptionId: sub.stripesubscriptionid,
      effectiveDate: cancelAt?.toISOString() ?? null,
      note: "subscriptionstatus deliberately unchanged — access continues to period end",
    },
  });

  clearSubscriptionGateCache(companyId);

  // [SCOPE 131 / T014] Confirmation email — FR-009. Awaited so a send failure is
  // logged against this request rather than surfacing as an unhandled rejection
  // later, but its result is discarded: `sendCancellationConfirmation` never
  // rejects, and a mail problem must not fail a cancellation Stripe has accepted.
  await sendCancellationConfirmation(companyId, cancelAt);

  logger.info(
    { companyId, stripeSubscriptionId: sub.stripesubscriptionid, cancelAt },
    "Cancellation requested — pending until period end",
  );

  return {
    companyId,
    transition: "CANCEL_REQUESTED",
    effectiveDate: cancelAt,
    state: await getLifecycleState(companyId),
  };
}
// [SCOPE 131 / T003] END

// [SCOPE 131 / T004] BEGIN — un-cancel while pending (FR-004)
/**
 * Clear a pending cancellation. This is the safety valve that makes cancelling a
 * low-risk click, which is why it ships in the same batch as the cancel itself
 * rather than later: without it, a mis-click is unrecoverable in the product.
 */
export async function reverseCancellation(
  companyId: string,
  actorUserId: string | null,
  // [SCOPE 131 / T004] MODIFIED-BY — see the note on requestCancellation. The
  // un-cancel travels with the cancel: an operator who mis-clicks needs the same
  // safety valve the customer has, or the mistake is only fixable in the database.
  actor: TransitionActor = "CUSTOMER",
): Promise<LifecycleResult> {
  const company = await loadCompany(companyId);
  assertManageable(company);

  if (company.cancelrequestedat == null) {
    throw new ConflictError(
      "There is no pending cancellation to reverse for this company.",
    );
  }
  // Once the period has closed, Stripe has canceled the subscription and a canceled
  // Stripe subscription cannot be resumed — only replaced. Refusing here is honest;
  // pretending to resume would leave the customer with no billing at all.
  if (company.cancelledat != null || isCancelledStatus(company.subscriptionstatus)) {
    throw new ConflictError(
      "This subscription has already ended and cannot be resumed. Choose a plan to subscribe again.",
    );
  }

  const sub = await loadStripeSubscription(companyId);

  await resumeSubscription(sub.stripesubscriptionid);

  const now = new Date();
  await db
    .update(companies)
    .set({ cancelrequestedat: null, updatedat: now })
    .where(eq(companies.id, companyId));

  await recordTransition({
    companyId,
    previousStatus: company.subscriptionstatus,
    newStatus: company.subscriptionstatus ?? "UNKNOWN",
    transition: "CANCEL_REVERSED",
    actorType: actor,
    actorUserId,
    metadata: { stripeSubscriptionId: sub.stripesubscriptionid },
  });

  clearSubscriptionGateCache(companyId);

  logger.info(
    { companyId, stripeSubscriptionId: sub.stripesubscriptionid },
    "Pending cancellation reversed",
  );

  return {
    companyId,
    transition: "CANCEL_REVERSED",
    effectiveDate: null,
    state: await getLifecycleState(companyId),
  };
}
// [SCOPE 131 / T004] END

// [SCOPE 131 / T006] BEGIN — suspend and resume billing (FR-006, FR-007)
/**
 * Suspend billing. Stripe stops invoicing, the team is walled, and nothing is
 * scheduled for deletion. The subscription survives, so resuming restores the same
 * subscription and the company keeps its project history — which is the whole
 * reason this exists rather than telling people to cancel and re-register.
 */
export async function pauseBilling(
  companyId: string,
  actorUserId: string | null,
): Promise<LifecycleResult> {
  const company = await loadCompany(companyId);
  assertManageable(company);

  if ((company.subscriptionstatus ?? "").toUpperCase() === "PAUSED") {
    throw new ConflictError("Billing is already suspended for this company.");
  }
  if (company.cancelrequestedat != null) {
    throw new ConflictError(
      "A cancellation is pending. Reverse it before suspending billing.",
    );
  }
  if (isCancelledStatus(company.subscriptionstatus)) {
    throw new ConflictError("This subscription is cancelled and cannot be suspended.");
  }

  const sub = await loadStripeSubscription(companyId);

  await pauseSubscriptionCollection(sub.stripesubscriptionid);

  const now = new Date();
  await db
    .update(companies)
    .set({ subscriptionstatus: "PAUSED", pausedat: now, updatedat: now })
    .where(eq(companies.id, companyId));

  await recordTransition({
    companyId,
    previousStatus: company.subscriptionstatus,
    newStatus: "PAUSED",
    transition: "PAUSED",
    actorType: "CUSTOMER",
    actorUserId,
    metadata: { stripeSubscriptionId: sub.stripesubscriptionid, behavior: "void" },
  });

  clearSubscriptionGateCache(companyId);

  logger.info(
    { companyId, stripeSubscriptionId: sub.stripesubscriptionid },
    "Billing suspended via pause_collection",
  );

  return {
    companyId,
    transition: "PAUSED",
    effectiveDate: null,
    state: await getLifecycleState(companyId),
  };
}

/** Resume billing on the same subscription. No new subscription, no double charge. */
export async function resumeBilling(
  companyId: string,
  actorUserId: string | null,
): Promise<LifecycleResult> {
  const company = await loadCompany(companyId);
  assertManageable(company);

  if ((company.subscriptionstatus ?? "").toUpperCase() !== "PAUSED") {
    throw new ConflictError("Billing is not currently suspended for this company.");
  }

  const sub = await loadStripeSubscription(companyId);

  await unpauseSubscriptionCollection(sub.stripesubscriptionid);

  const now = new Date();
  await db
    .update(companies)
    .set({ subscriptionstatus: "ACTIVE", pausedat: null, updatedat: now })
    .where(eq(companies.id, companyId));

  await recordTransition({
    companyId,
    previousStatus: "PAUSED",
    newStatus: "ACTIVE",
    transition: "RESUMED",
    actorType: "CUSTOMER",
    actorUserId,
    metadata: { stripeSubscriptionId: sub.stripesubscriptionid },
  });

  clearSubscriptionGateCache(companyId);

  logger.info(
    { companyId, stripeSubscriptionId: sub.stripesubscriptionid },
    "Billing resumed from suspension",
  );

  return {
    companyId,
    transition: "RESUMED",
    effectiveDate: null,
    state: await getLifecycleState(companyId),
  };
}
// [SCOPE 131 / T006] END
