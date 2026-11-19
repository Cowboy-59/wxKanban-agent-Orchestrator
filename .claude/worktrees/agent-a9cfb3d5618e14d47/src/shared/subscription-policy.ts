// [SCOPE 090 / T005] BEGIN — shared subscription access policy (Amendment A, FR-006)
// [SCOPE 131 / T007] MODIFIED-BY — added the PAUSED branch and its 'resume-subscription' mode, plus both cancelled spellings. Deny-by-default is unchanged: PAUSED is not on the allow list and an unknown status still blocks.
/**
 * SPEC-090 Amendment A FR-006. The single decision function behind the access
 * gate, kept pure and dependency-free so the client wall, the server middleware,
 * and the MCP entitlement gate cannot drift apart on what "may use the product"
 * means. No React, no database, no environment access — the whole truth table is
 * unit-testable in isolation.
 *
 * Deliberately allow-listed rather than deny-listed: only ACTIVE and TRIAL pass.
 * A status this module has never heard of blocks rather than falls through, so
 * adding a new subscriptionstatus can never silently open the gate. That also
 * makes the CANCELED / CANCELLED spelling split already present in the codebase
 * a non-issue — neither spelling is on the allow list.
 */

/** What the caller should be shown, not merely whether they are allowed. */
export type AccessMode =
  /** Full access. */
  | 'ok'
  /** No usable subscription — send them to the plan picker and on to Stripe. */
  | 'pick-plan'
  /** A subscription exists but its card failed — send them to the billing portal. */
  | 'update-card'
  /**
   * [SCOPE 131 / T007] The company suspended its own billing. Nothing is wrong and
   * nothing is scheduled for deletion — one click resumes the SAME subscription, so
   * the wall must offer resume rather than a plan picker. A plan picker here would
   * invite a second Stripe subscription against a company that already has one.
   */
  | 'resume-subscription'
  /** Blocked, and this user cannot pay: only a company ADMIN can. */
  | 'contact-admin';

/**
 * The only subscription states permitted to use the product.
 *
 * [SCOPE 131 / T007] PAUSED is deliberately NOT here. A paused company is walled:
 * it is not paying, and Stripe is voiding its invoices. Adding it would be the
 * single easiest way to give away the product for free.
 */
export const UNRESTRICTED_STATUSES: ReadonlySet<string> = new Set(['ACTIVE', 'TRIAL']);

// [SCOPE 131 / T005] BEGIN — cancelled-status spelling (FR-005)
/**
 * Both spellings of cancelled, because the codebase contains both and always has.
 * Production rows carry only `CANCELED` (one L), while the sysadmin UI and
 * `deleteCompany()` write `CANCELLED` (two). SCOPE-067 FR-002 undertook to
 * standardize this and did not. Any status read that picks one spelling silently
 * misses the other's rows — so read through this, never against a literal.
 *
 * Note this changes no behavior in `evaluateAccess`: neither spelling is on the
 * allow list, so both were already blocked. It matters to the callers that have
 * to *find* cancelled companies.
 */
export const CANCELLED_STATUSES: ReadonlySet<string> = new Set(['CANCELED', 'CANCELLED']);

export function isCancelledStatus(status?: string | null): boolean {
  return CANCELLED_STATUSES.has((status ?? '').toUpperCase());
}
// [SCOPE 131 / T005] END

export interface AccessSubject {
  /** companies.subscriptionstatus */
  subscriptionstatus?: string | null;
  /** companies.activeflag — false means operator-suspended. */
  activeflag?: boolean | null;
  /** companies.billingexempt — internal / kit-author accounts never hit Stripe. */
  billingexempt?: boolean | null;
  /** userprofiles.usertype — only ADMIN can reach the payment endpoints. */
  usertype?: string | null;
}

export interface AccessDecision {
  allowed: boolean;
  mode: AccessMode;
  /** Normalized status the decision was made on, for logging and display. */
  status: string;
}

export function evaluateAccess(subject: AccessSubject): AccessDecision {
  const status = (subject.subscriptionstatus ?? '').toUpperCase();

  // Billing-exempt companies (spec 023 Design Decisions) never hit Stripe at all,
  // so no billing state of theirs is meaningful. Checked first so an exempt
  // account can never be walled by a stale or absent status.
  if (subject.billingexempt === true) {
    return { allowed: true, mode: 'ok', status };
  }

  // SYSADMIN operates the platform and must never be locked out of it — not least
  // because the sysadmin console is where a stuck subscription gets fixed.
  if ((subject.usertype ?? '').toUpperCase() === 'SYSADMIN') {
    return { allowed: true, mode: 'ok', status };
  }

  // activeflag false is an operator suspension and outranks a healthy status:
  // an ACTIVE-but-suspended company stays blocked.
  if (subject.activeflag !== false && UNRESTRICTED_STATUSES.has(status)) {
    return { allowed: true, mode: 'ok', status };
  }

  // From here the company is blocked. Who is asking decides what they can do
  // about it: the payment endpoints are all requireAdmin, so pointing a team
  // member at a plan picker they cannot submit would be a dead end with no
  // explanation. Name the person who can pay instead.
  if ((subject.usertype ?? '').toUpperCase() !== 'ADMIN') {
    return { allowed: false, mode: 'contact-admin', status };
  }

  // A failed card means a subscription and a chosen plan already exist. Routing
  // this admin through the plan picker would invite a second Stripe subscription
  // against the same company; the billing portal is the correct repair surface.
  if (status === 'PENDING_INACTIVE') {
    return { allowed: false, mode: 'update-card', status };
  }

  // [SCOPE 131 / T007] A self-suspended company. Same reasoning as the failed
  // card above — the subscription still exists and must be resumed, not replaced.
  // Reached only by an ADMIN: the non-ADMIN branch above already sent everyone
  // else to 'contact-admin', which is correct, since only an ADMIN can resume.
  if (status === 'PAUSED') {
    return { allowed: false, mode: 'resume-subscription', status };
  }

  return { allowed: false, mode: 'pick-plan', status };
}
// [SCOPE 090 / T005] END
