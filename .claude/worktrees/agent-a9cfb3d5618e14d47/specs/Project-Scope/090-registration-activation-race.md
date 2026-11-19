# SCOPE-090: Activate Paid Signups at Registration (Close the Webhook Race)

**Scope Number**: SCOPE-090
**Status**: `draft`
**Created**: 2026-07-06
**Last Reviewed**: 2026-07-06 (authored in-conversation, section-by-section; boundary decision: inline reconcile at registration, log-only for unmatched events, registration path only)
**Depends On**: SCOPE-085 (Subscription Reconciliation — `SubscriptionRecoveryService.resyncSubscriptionFromStripe`, webhook secret fix, `company_status_history` audit), SCOPE-023 (Stripe subscription operations — `StripeWebhookHandler`, `companysubscriptions`).
**Related Scopes**: SCOPE-085 fixed the webhook so events *arrive and verify* (the `STRIPE_WEBHOOK_SECRET` mismatch) and added a customer-id fallback + manual reconcile console. This scope closes the one drift 085's hardening cannot reach: activation events that arrive **before the subscription row exists**, where neither the subscription-id nor the customer-id lookup can match.
**Source**: `specs/Project-Scope/090-registration-activation-race.md`

---

## Overview

A new paid company can stay `PENDING` forever even though its Stripe payment fully succeeded. In the registration flow the customer pays Stripe on the client **first**, then submits registration, and the server persists the `companysubscriptions` row (with `status: "incomplete"`) only afterward — explicitly delegating activation to "webhook events later." But Stripe's activation events (`invoice.paid` / `invoice.payment_succeeded`, and any early `customer.subscription.updated → active`) fire during the gap, before the row exists. `handleStripeEvent` calls `resolveCompanySubscription`, finds no row (not by `stripesubscriptionid`, not by SCOPE-085's `stripecustomerid` fallback — there is no row at all), returns `200` **without recording the event or running the handler**, and Stripe considers it delivered. The activation event is gone; the company never activates.

Confirmed on **Linnell Technology** (2026-07-06): Stripe invoice paid at 08:40:19 (`billing_reason = subscription_create`), our `companysubscriptions` row created at 08:41:46, `subscriptionbillinghistory` rows = **0**. The only recorded webhook was a retried `customer.subscription.created` at 08:44:30 carrying a frozen `incomplete` status — which correctly makes no status change. The company sat at `PENDING` until a manual `resyncSubscriptionFromStripe` reconcile flipped it to `ACTIVE`.

This is distinct from SCOPE-085. That scope's root cause was the webhook being inert (secret mismatch), now resolved — Linnell proves events flow and verify again. SCOPE-085's resolution hardening (customer-id fallback) assumes a row **exists**; here it does not yet. The durable fix is to stop depending on webhook timing for *first* activation: reconcile the company directly from Stripe the moment the row is written, since registration always runs after payment.

## Business Problem

The product bills real money, but a customer who has paid can appear unpaid indefinitely — wrong billing banner, wrong entitlement, and a support/manual-scripting burden for the operator. SCOPE-085 gave the operator a manual reconcile console, but that is a *safety net after the fact*; every affected signup still requires a human to notice and click. Because the failure is a timing race baked into the registration sequence, it recurs on every paid signup where the payment events land before the row — silently, with no billing-history trace. Until first activation no longer depends on webhook delivery order, "paid-but-PENDING" accounts keep accumulating one signup at a time.

### Core Design

| Element | Activate Paid Signups at Registration |
| --- | --- |
| **Primary Actor** | A new paying customer completing registration for a paid tier (activation must complete without operator action) |
| **Secondary Actors** | `RegistrationService` (persists the subscription row, then reconciles); `SubscriptionRecoveryService.resyncSubscriptionFromStripe` (reused read-and-map); Stripe (source of truth — invoice already paid by registration time); the Stripe webhook (`StripeWebhookHandler` — remains authoritative for *later* lifecycle changes) |
| **Key Value** | A paid signup is `ACTIVE` by the time registration returns, regardless of webhook timing — first activation no longer races the webhook, and no paying customer is left looking unpaid |
| **Boundary — IN** | Inline, fail-open reconcile from Stripe immediately after `RegistrationService` inserts the paid-tier `companysubscriptions` row; idempotent + audited (reuse SCOPE-085 machinery); durable (log-based) record when the webhook drops an activation-relevant event for an unknown subscription |
| **Boundary — OUT** | The client-side payment sequence; buffering/replaying dropped webhook events into a table; the `PaymentService` card-update/re-subscribe path (already activates inline); renewals / failures / cancellations (webhook-owned); any new billing or card-collection logic |

---

## User Scenarios

### US1 — Paid signup activates at registration
A customer completes Stripe payment, then finishes registration for a paid tier.
**Expected:** by the time registration returns, `companies.subscriptionstatus = ACTIVE` and `companysubscriptions.status = active` — no webhook required, no operator action.

### US2 — Webhook won the race
The `invoice.paid` webhook happened to land after the row existed and already activated the company.
**Expected:** the inline reconcile finds the company already `ACTIVE`, makes no change, and writes no duplicate `company_status_history` row.

### US3 — Stripe unreachable during registration
The inline reconcile call to Stripe errors or times out.
**Expected:** registration still succeeds; the company remains `PENDING`; the error is logged; the existing sysadmin/self-serve reconcile remains the fallback. Registration never fails because reconcile failed.

### US4 — Genuinely unpaid at registration
Registration completes but the Stripe subscription is still `incomplete` (payment not actually done).
**Expected:** the reconcile maps `incomplete → no change`; the company stays `PENDING`; it is not falsely activated.

### US5 — Activation event dropped for an unknown subscription
An `invoice.paid` / `customer.subscription.*` event resolves to no local subscription row.
**Expected:** the handler emits a structured, greppable warn record (company/customer/subscription ids + event type) instead of returning silently, so the occurrence is countable and detectable.

### US6 — Auditable activation
The inline reconcile activates a company.
**Expected:** a `company_status_history` row records previous→new status, reason, `changedByType`, and Stripe status metadata — identical to the sysadmin reconcile path.

---

## Functional Requirements

### FR-001 — Inline activation at registration
Immediately after `RegistrationService` inserts the `companysubscriptions` row for a paid tier (`hasStripeSubscription === true`), it MUST reconcile that company's status from Stripe via `resyncSubscriptionFromStripe(companyId)` before returning the registration response.
**Acceptance:**
- [ ] A paid signup whose Stripe payment has succeeded is `ACTIVE` at the end of registration, with no webhook delivery required
- [ ] The reconcile runs only for paid tiers with a Stripe subscription (FREE / billing-exempt paths are untouched)

### FR-002 — Fail-open
The inline reconcile MUST NOT be able to fail registration. Any Stripe/network/DB error MUST be caught and logged; registration completes, the company remains `PENDING`, and the existing reconcile paths remain the fallback.
**Acceptance:**
- [ ] A simulated Stripe error during registration leaves registration successful and the company `PENDING`, with the error logged
- [ ] No registration path throws out of the reconcile call

### FR-003 — Idempotent, safe mapping
The reconcile MUST reuse `SubscriptionRecoveryService`'s mapping (`active→ACTIVE`, `trialing→TRIAL`, `past_due`/`unpaid`→`PENDING_INACTIVE`, `canceled→CANCELED`, `incomplete`→no change) and MUST make no change (and write no audit row) when the company is already in the target status.
**Acceptance:**
- [ ] An already-`ACTIVE` company (webhook won the race) gets no update and no duplicate `company_status_history` row
- [ ] An `incomplete`/unpaid subscription never activates the company

### FR-004 — Audited
When the inline reconcile changes status, it MUST write the same `company_status_history` audit row the sysadmin reconcile writes (previous, new, reason, `changedByType`, `stripeStatus` metadata).
**Acceptance:**
- [ ] Each inline activation produces exactly one `company_status_history` row attributing the change

### FR-005 — No silently-dropped activation events
When `handleStripeEvent` receives an activation-relevant event (`invoice.paid`, `invoice.payment_succeeded`, `customer.subscription.created/updated`) that resolves to no subscription row, it MUST emit a structured warn record (event type, `stripeeventid`, customer id, subscription id) rather than returning silently — enough to detect and count future races. (This completes SCOPE-085 FR-002's intent for the pre-row case; log-only, no replay table.)
**Acceptance:**
- [ ] An activation event with no matching row produces a greppable warn record with the ids needed to correlate it
- [ ] The count of such records is observable over time (baseline expected: ~0 once FR-001 is in place)

---

## Technical Sections

### Registration (root cause) — `src/server/services/RegistrationService.ts`
After the `hasStripeSubscription` block inserts the `companysubscriptions` row (~line 390), add a single fail-open call to `resyncSubscriptionFromStripe(companyId)` inside a `try/catch` that logs and swallows. By registration time the invoice is already paid, so Stripe reports `active` and the reconcile flips `PENDING → ACTIVE` and `companysubscriptions.status incomplete → active` (+ period end) immediately. The `status: "incomplete"` insert and the "webhook flips status later" comment stay — webhooks remain the mechanism for *subsequent* changes; this only removes them from the critical path for first activation. No change to the client payment sequence.

### Reconcile service (reuse) — `src/server/services/SubscriptionRecoveryService.ts`
`resyncSubscriptionFromStripe(companyId, { changedBy })` already reads live Stripe, maps status, writes `companies.subscriptionstatus` + `activeflag`, `companysubscriptions.status` + `currentperiodend`, and inserts the `company_status_history` audit row — all idempotent (`companyChanged`/`subChanged` guards). Used as-is; `changedBy` is null for the system-initiated registration reconcile (`changedByType` defaults to `SYSADMIN`; acceptable, or introduce a `SYSTEM` type if preferred at implement time).

### Webhook (visibility) — `src/server/services/StripeWebhookHandler.ts`
In `handleStripeEvent`, when `resolveCompanySubscription` returns `null`, the current `logger.warn(... "references unknown subscription — skipping")` already exists but is generic. For FR-005, ensure it includes the customer id and (where extractable) the subscription id for activation-relevant event types, so pre-row drops are correlatable. No change to the activation branches or to signature verification (SCOPE-085).

### Not in scope — `PaymentService`
`confirmSubscriptionCardUpdate` and `processSubscription` already set `companies.subscriptionstatus = "ACTIVE"` inline and do not defer activation to webhooks — not exposed to this race, no change.

### Conventions
Routes via `index.ts → app.ts`; DB via `src/db/client.ts`; 100% TypeScript (no `any`/`@ts-ignore`); Pino-only; Stripe key from `STRIPE_API_KEY` (App Runner console, `sk_live_`), `STRIPE_CC_PROCESSING_ENABLED=true`; code fences written by the orchestrator at `implement`; nothing pushed until the user says push.

---

## Success Criteria

1. **Activation completeness.** 100% of paid signups with a succeeded Stripe payment are `subscriptionstatus = ACTIVE` at the end of registration; **0** paid signups sit in `PENDING` more than 60 seconds post-registration (measured weekly). *(FR-001, FR-003)*
2. **Reconcile safety.** **0** registration failures attributable to the inline reconcile, and **0** duplicate `company_status_history` rows per activation (fail-open + idempotent, verified in tests). *(FR-002, FR-003, FR-004)*
3. **Race visibility.** 100% of activation-relevant webhook events that resolve to no subscription row emit a structured warn record (count observable), up from 0% today (silently dropped); baseline occurrences trend to ~0 once FR-001 ships. *(FR-005)*

---

## Constraints & Notes

### Constraints
- **Reuse, don't reinvent.** Built entirely on SCOPE-085's `SubscriptionRecoveryService` reconcile + `company_status_history` audit — no new billing, card-collection, or replay infrastructure.
- **Fail-open, non-blocking.** The inline reconcile must never block or fail registration; it is an optimization of first activation, not a new gate.
- **Webhook stays authoritative for lifecycle.** This scope only removes webhooks from the critical path for *first* activation; renewals, failures, and cancellations remain webhook-owned.
- **Orchestrator-first.** Implement via `createSpecs` → `implement`. Nothing pushed until the user says push.

### Out of Scope (own later scopes)
- Buffering/replaying dropped webhook events into a persistent table (log-only chosen here).
- The client-side pay-then-register sequence itself.
- Renewals, dunning, cancellation, proration (webhook/SCOPE-023/067-owned).
- The `PaymentService` card-update/re-subscribe path (already activates inline).

### Dependencies
- SCOPE-085 (webhook secret fixed — events now arrive and verify; `SubscriptionRecoveryService`; `company_status_history` migration), SCOPE-023.
- `STRIPE_API_KEY` + `STRIPE_CC_PROCESSING_ENABLED=true` in the App Runner console.

### Notes — ROOT CAUSE CONFIRMED (2026-07-06)
Diagnosis on Linnell Technology (company `019f3697-337d-7564-8de9-a78b36182671`, subscription `sub_1Tq845…`): Stripe invoice paid 08:40:19 (`subscription_create`), local row created 08:41:46, `subscriptionbillinghistory` = 0, one recorded webhook (`customer.subscription.created`, retried, `incomplete` snapshot) at 08:44:30. A bulk `resyncPendingSubscriptions({dryRun:true})` across all non-active companies found **0 others currently stuck** — Linnell was the only live instance and has been reconciled to `ACTIVE`. The race is real but low-frequency; the fix prevents recurrence rather than remediating a backlog. SCOPE-085's secret fix is confirmed working (events flow again); this is the residual pre-row ordering gap 085's customer-id fallback structurally cannot cover.

- **Process note:** authored in-conversation (interactive buildscope, section-by-section approval); root cause confirmed by live diagnosis; implement via `createSpecs` → `implement`.
