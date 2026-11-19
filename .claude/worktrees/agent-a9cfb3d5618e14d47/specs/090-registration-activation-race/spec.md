# Spec 090: Registration Activation Race

**Spec Number**: 090
**Scope**: SCOPE-090 (`specs/Project-Scope/090-registration-activation-race.md`)
**Status**: implemented
**Phase**: implementation
**Priority**: high
**Created**: 2026-07-06
**Spec ID**: e336c37c-d60a-4e5a-a1c4-4e6428c7bc4f

## Overview

A new paid company can stay PENDING forever even though its Stripe payment fully succeeded. In the registration flow the customer pays Stripe on the client first, then submits registration, and the server persists the companysubscriptions row (with status "incomplete") only afterward, explicitly delegating activation to webhook events. But Stripe's activation events (invoice.paid / invoice.payment_succeeded, and any early customer.subscription.updated to active) fire during the gap, before the row exists. handleStripeEvent calls resolveCompanySubscription, finds no row (not by stripesubscriptionid, not by the SCOPE-085 stripecustomerid fallback, because there is no row at all), returns 200 without recording the event or running the handler, and Stripe considers it delivered. The activation event is lost and the company never activates.

Confirmed on Linnell Technology (2026-07-06): Stripe invoice paid at 08:40:19 (billing_reason subscription_create), our companysubscriptions row created at 08:41:46, subscriptionbillinghistory rows = 0. The only recorded webhook was a retried customer.subscription.created at 08:44:30 carrying a frozen incomplete status, which correctly makes no change. The company sat at PENDING until a manual resyncSubscriptionFromStripe reconcile flipped it to ACTIVE. This is distinct from SCOPE-085, whose root cause (an inert webhook from a STRIPE_WEBHOOK_SECRET mismatch) is now fixed; that scope's customer-id fallback assumes a row exists. Here it does not yet.

## Business Problem

The product bills real money, but a customer who has paid can appear unpaid indefinitely, seeing the wrong billing banner and the wrong entitlement, and creating a manual reconcile burden for the operator. SCOPE-085 added a manual reconcile console, but that is an after-the-fact safety net: every affected signup still requires a human to notice and click. Because the failure is a timing race baked into the registration sequence (pay-then-persist), it recurs on every paid signup where the activation events land before the row, silently, with no billing-history trace. Until first activation no longer depends on webhook delivery order, paid-but-PENDING accounts accumulate one signup at a time.

## Actors

- Primary: A new paying customer completing registration for a paid tier, whose company must reach ACTIVE without any operator action.
- Secondary: RegistrationService (persists the subscription row, then reconciles); SubscriptionRecoveryService.resyncSubscriptionFromStripe (the reused read-and-map that writes status + audit); Stripe (source of truth, invoice already paid by registration time); StripeWebhookHandler (remains authoritative for later lifecycle changes such as renewals, failures, cancellations).

## Success Metrics

- Activation completeness: 100% of paid signups with a succeeded Stripe payment are subscriptionstatus = ACTIVE at the end of registration; 0 paid signups sit in PENDING more than 60 seconds post-registration, measured weekly.
- Reconcile safety: 0 registration failures attributable to the inline reconcile, and 0 duplicate company_status_history rows per activation, verified by fail-open and idempotency tests.
- Race visibility: 100% of activation-relevant webhook events that resolve to no subscription row emit a structured warn record, up from 0% today (silently dropped); baseline occurrences trend toward 0 once inline activation ships.

## Scope Boundary

IN: an inline, fail-open reconcile from Stripe immediately after RegistrationService inserts the paid-tier companysubscriptions row; idempotent and audited by reusing the SCOPE-085 SubscriptionRecoveryService machinery (no new billing logic); a durable, greppable warn record when the webhook drops an activation-relevant event for an unknown subscription. The reconcile runs only for paid tiers with a Stripe subscription; FREE and billing-exempt paths are untouched.

## Out of Scope

Buffering or replaying dropped webhook events into a persistent table (log-only chosen here); the client-side pay-then-register sequence itself; the PaymentService card-update / re-subscribe and processSubscription paths (they already set ACTIVE inline and are not exposed to this race); renewals, dunning, cancellation, and proration (webhook and SCOPE-023/067 owned); any new billing or card-collection logic.

## Open Questions

Should the system-initiated registration reconcile record changedByType SYSADMIN (current default) or a new SYSTEM type in company_status_history? Decided at implement time; SYSADMIN is acceptable for v1. No other open questions; root cause is confirmed by live diagnosis.

## Functional Requirements

FR-001 Inline activation at registration: immediately after RegistrationService inserts the companysubscriptions row for a paid tier (hasStripeSubscription true), it MUST reconcile that company's status from Stripe via resyncSubscriptionFromStripe(companyId) before returning the registration response. A paid signup whose payment has succeeded is ACTIVE at the end of registration with no webhook delivery required; the reconcile runs only for paid tiers with a Stripe subscription.

FR-002 Fail-open: the inline reconcile MUST NOT be able to fail registration. Any Stripe, network, or DB error MUST be caught and logged; registration completes, the company remains PENDING, and existing reconcile paths remain the fallback. No registration path throws out of the reconcile call.

FR-003 Idempotent, safe mapping: the reconcile MUST reuse SubscriptionRecoveryService's mapping (active to ACTIVE, trialing to TRIAL, past_due/unpaid to PENDING_INACTIVE, canceled to CANCELED, incomplete to no change) and MUST make no change and write no audit row when the company is already in the target status. An already-ACTIVE company (webhook won the race) gets no update and no duplicate history row; an incomplete or unpaid subscription never activates the company.

FR-004 Audited: when the inline reconcile changes status, it MUST write the same company_status_history audit row the sysadmin reconcile writes (previous, new, reason, changedByType, stripeStatus metadata). Each inline activation produces exactly one history row attributing the change.

FR-005 No silently-dropped activation events: when handleStripeEvent receives an activation-relevant event (invoice.paid, invoice.payment_succeeded, customer.subscription.created/updated) that resolves to no subscription row, it MUST emit a structured warn record (event type, stripeeventid, customer id, subscription id) rather than returning silently, enough to detect and count future races. This completes SCOPE-085 FR-002's intent for the pre-row case; log-only, no replay table.

---

## Amendment A — Subscription Access Gate (2026-07-22)

### Why this amendment belongs to SCOPE-090

FR-001..FR-005 closed the "Stripe paid, no account" orphan by reordering registration so the account is persisted before payment (T003). That reorder created the exact mirror defect: a customer who abandons the wizard at the card step now leaves behind a fully usable company at subscriptionstatus PENDING, with no subscription, no charge, and no prompt. Confirmed by reading the shipped code, not by report:

- RegistrationPage handleSkipPaymentForNow and handleBack both route a dropped card step to the success screen; the account is already saved and the admin is already authenticated via the httpOnly cookie set at register.
- No route guard, middleware, or API check anywhere in src/server/middleware reads subscriptionstatus to deny access. PENDING is a label with no consequence.
- The in-app prompt the T003 code comment promises ("the in-app billing banner will prompt them to complete payment") does not exist for this case: AppShell BillingBanner renders only when subscriptionstatus === "PENDING_INACTIVE", so a fresh PENDING signup sees nothing, forever.
- Neither recovery path can reach these accounts. sendRestartLink returns no_stripe_customer because no companysubscriptions row exists, and resyncPendingSubscriptions has nothing in Stripe to reconcile against.

Net effect: an unlimited free paid-tier account that is never charged and never asked. This amendment closes it.

### Owner decisions (2026-07-22)

Recorded because two of them deliberately override previously shipped behavior.

1. The gate covers every status except ACTIVE and TRIAL. This supersedes the SCOPE-067 grace design for PENDING_INACTIVE: a failed card now walls the customer rather than showing a dismissible banner. The operator accepts that a customer whose card merely expired loses access at the first failed Stripe retry, before dunning completes.
2. Non-admin users of a blocked company are hard-blocked, not merely banner-warned. They cannot pay (the Stripe endpoints are requireAdmin), so they get a dead-end screen identifying the admin who can.
3. The MCP blocks writes and allows a small read set, so the user has a working surface on which to receive the explanation.

### Functional Requirements

FR-006 Shared access policy: a single pure decision function MUST own the gate, taking (subscriptionstatus, activeflag, billingexempt, usertype) and returning one of four modes — ok, pick-plan, update-card, contact-admin. ACTIVE, TRIAL, billingexempt true, and usertype SYSADMIN all yield ok. PENDING, CANCELED, SUSPENDED, absent status, and activeflag false yield pick-plan. PENDING_INACTIVE yields update-card. Any blocked company evaluated for a non-ADMIN user yields contact-admin regardless of which blocked status produced it. No caller may re-derive this policy inline.

FR-007 Client wall: the authenticated route guard MUST be the single client-side choke point. When the policy returns anything other than ok, every protected route MUST redirect to the wall route, replacing history, and MUST NOT redirect when already on the wall route. Sign-out MUST remain reachable from the wall so a walled user is never trapped.

FR-008 Wall routes straight to payment: in pick-plan mode the wall MUST present the tier picker pre-selected to the company's current billingplan and, on selection, drive the existing authenticated card flow (/payment/subscription/update-card then /payment/subscription/confirm) inline. It MUST NOT be an interstitial that merely links elsewhere. In update-card mode it MUST instead offer a single action opening /payment/portal-session, because the company already has a Stripe subscription and plan and must not be led to create a second one. In contact-admin mode it MUST show no payment UI and MUST name the company ADMIN's email address.

FR-009 Server-side enforcement: the gate MUST be enforced server-side, not only in the client, since a client-only wall is bypassable by calling the API directly. A middleware MUST apply the FR-006 policy to API requests and reject blocked callers with HTTP 402 carrying the mode, with an exempt path list covering at minimum the auth routes, the payment routes, health, and static assets. This middleware MUST be controlled by an environment flag supporting a log-only mode that evaluates and records the decision without rejecting, so it can ship dark and be verified against production traffic before enforcement is turned on.

FR-010 Auth payload completeness: the authenticated-user payload consumed by the client MUST carry billingexempt and the company ADMIN's email address. Without billingexempt the client cannot distinguish an exempt internal account from a delinquent one and would wall every billing-exempt company; without the admin email FR-008's contact-admin mode cannot name anyone.

FR-011 MCP diagnostic surface: project.session_start and project.cockpit_summary MUST be added to the MCP entitlement exempt set. Today both are gated, so a lapsed customer's editor session fails at its first call and the user has no working tool through which to receive the explanation. The existing entitlement gate is otherwise correct and MUST NOT be re-implemented — it already enforces ACTIVE plus TRIAL, honors billingexempt, and fails open on database error.

FR-012 MCP message accuracy: the entitlement denial reason MUST tell the user their subscription is not complete and that they must log in to wxKanban to correct it, and MUST link to a route that exists. The current REMEDIATION_URL is https://wxperts.com/account/billing, for which this application defines no route; the billing page is /admin/billing. The corrected URL MUST be sourced from configuration with a single default rather than hard-coded, and every duplicated copy of the old string across the kit command and skill files (and their .claude mirrors) MUST be swept to match.

FR-013 Remove the dead escape hatch: the registration wizard's skip-payment-for-now action MUST be removed. Under this amendment it leads only to a wall on the next navigation, so presenting it as an option misleads the user about what they are getting.

### Success Metrics

- Gate completeness: 0 companies outside ACTIVE, TRIAL, or billingexempt hold a usable authenticated session, measured by the log-only enforcement counter reaching zero non-exempt allowed requests before enforcement is enabled.
- Conversion recovery: of companies sitting at PENDING with no subscription at the time this ships, the share that either complete payment or explicitly cancel within 30 days, up from the current 0% (they are never prompted).
- No false lockouts: 0 support reports of an ACTIVE, TRIAL, billingexempt, or SYSADMIN account reaching the wall during the log-only period.

### Scope Boundary

IN: the shared policy function and its mirror in the MCP truth table; the client wall route and guard change; the flag-gated server middleware; the two auth-payload additions; the MCP exempt-set, wording, and URL corrections including the kit-wide string sweep; removal of the skip-payment action.

OUT: dunning schedules, grace windows, or any time-based softening of the gate (the owner chose an immediate wall); changes to how registration assigns PENDING in the first place; new billing, proration, or plan-change logic; the Stripe webhook and reconcile machinery from FR-001..FR-005, which this amendment consumes unchanged; email or other outbound nudges to walled customers.

### Open Question

The canonical public host for the corrected remediation URL is unconfirmed: the codebase contains both wxkanban.com (registration links, marketing links) and app.wxkanban.com (the sysadmin bootstrap script's login URL). FR-012 requires the value come from configuration, so this can default to https://wxkanban.com/admin/billing and be corrected by environment without a code change, but the intended host should be confirmed before the kit-wide string sweep bakes it into ~20 files.
