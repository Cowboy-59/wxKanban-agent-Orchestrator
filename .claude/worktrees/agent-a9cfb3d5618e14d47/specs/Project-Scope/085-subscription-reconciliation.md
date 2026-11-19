# SCOPE-085: Subscription Reconciliation Console + Webhook Activation Fix

**Scope Number**: SCOPE-085
**Status**: `draft`
**Created**: 2026-07-04
**Last Reviewed**: 2026-07-04 (authored in-conversation, section-by-section; boundary decision: include the webhook root-cause fix)
**Depends On**: SCOPE-067 (Subscription Lifecycle Visibility & Recovery — `PENDING_INACTIVE`, `SubscriptionRecoveryService`, sysadmin Companies panel), SCOPE-023 (Stripe subscription operations — `StripeWebhookHandler`, `companysubscriptions`, `stripeConfig`).
**Related Scopes**: SCOPE-067 built the *failure → recovery* loop (payment fails → PENDING_INACTIVE → restart link). This scope closes the opposite drift — *paid customers stuck as unpaid* — by fixing the webhook that drops first-payment activation and giving the operator a manual reconcile safety net.
**Source**: `specs/Project-Scope/085-subscription-reconciliation.md`

---

## Overview

When a customer's first Stripe payment succeeds but the webhook event never gets applied, the company stays `PENDING` and its `companysubscriptions.status` stays `incomplete`, even though Stripe shows the subscription `active`. On 2026-07-04, six of the most-recent paying signups were all in this state — live Stripe said `active`, the database said `incomplete`/`PENDING` — and they had to be reconciled by hand with a one-off script.

The webhook activation logic already exists and is correct: `handleInvoicePaymentSucceeded` flips `PENDING → ACTIVE` on `invoice.paid` with `billing_reason === 'subscription_create'`, and `handleSubscriptionUpdated` flips to `ACTIVE` on `status === 'active'`. The failure is upstream of those branches: `resolveCompanySubscription` returns `null` and the event is skipped with **no record and no handler**, and the invoice → subscription-id extraction is fragile across Stripe API versions. A first-payment event that can't be resolved is silently lost, and the company never activates.

This scope does two things:

- **Fix the root cause.** Make first-payment activation reliable — harden event resolution (fall back to the Stripe customer id, never silently drop an activation-relevant event), and verify the live webhook endpoint registration + signing secret so events actually arrive and verify.
- **Add a manual safety net.** Give the SYSADMIN an in-app reconciliation console: a one-click "Recheck all pending from Stripe" (dry-run preview, then apply) and an always-available per-company "Recheck Stripe" — both wiring the existing `SubscriptionRecoveryService` reconcile logic, not new billing logic.

## Business Problem

The product bills real money through Stripe, but the app can be wrong about who has paid. When a webhook event is dropped, a paying customer appears unpaid — they may see the wrong billing banner or entitlement, and the operator cannot tell truth from drift without opening the Stripe dashboard. The reconcile logic exists server-side (`SubscriptionRecoveryService`), and a per-company button exists, but there is no way to invoke reconcile in bulk from the app, and the per-company recheck is hidden exactly when it's needed (missing/stale local row). Until this is closed, every webhook miss becomes a manual database-scripting job, and silent "paid-but-inactive" accounts accumulate.

Two concrete gaps:

1. **Root cause — dropped first-payment activation.** `resolveCompanySubscription` silently skips events it can't match; the invoice→subscription-id extraction is API-version-fragile; a lost event means the company is never activated.
2. **No operator safety net.** The backend bulk-reconcile endpoint (`POST /api/sysadmin/subscriptions/resync`) has no UI, and the per-company recheck is gated behind a local subscription row — so the operator's only recourse for drift is a manual script.

### Core Design

| Element | Subscription Reconciliation Console + Webhook Activation Fix |
| --- | --- |
| **Primary Actor** | A SYSADMIN reconciling company subscription state against Stripe from the sysadmin Companies page |
| **Secondary Actors** | The Stripe webhook (`StripeWebhookHandler` — should auto-activate on first payment); Stripe (source of truth for live subscription status); `SubscriptionRecoveryService` (`resyncSubscriptionFromStripe` / `resyncPendingSubscriptions`, the read-and-map used by both the manual console and this scope) |
| **Key Value** | Paying customers are never left looking unpaid — the webhook activates them automatically, and when an event is missed the operator reconciles everyone from Stripe in one click instead of scripting the database |
| **Boundary — IN** | Harden webhook event→subscription resolution (customer-id fallback; never silently drop an activation event); verify live webhook endpoint registration + signing secret; bulk "Recheck all pending from Stripe" UI with dry-run preview then apply; ungate + resolve-by-customer for the per-company "Recheck Stripe"; show per-company local→live→result diffs; audit each reconcile write |
| **Boundary — OUT** | Dunning / automatic suspension timers; plan upgrade/downgrade/proration; multiple concurrent subscriptions per company; changes to how subscriptions are first created (SCOPE-023); the failure→recovery loop itself (SCOPE-067) |

---

## User Scenarios

### US1 — First payment auto-activates
A new customer completes their first Stripe payment; within one webhook delivery the company transitions `PENDING → ACTIVE` with no operator action.
**Expected:** `companies.subscriptionstatus = ACTIVE` and `companysubscriptions.status = active` (+ period end) are written automatically.

### US2 — Webhook can't resolve the subscription
An `invoice.paid` / `customer.subscription.updated` event arrives but the local subscription can't be matched by `stripesubscriptionid`.
**Expected:** the handler falls back (by `stripecustomerid`) and, if still unresolved, records the event rather than silently dropping it, so it is caught by reconcile — not lost.

### US3 — Operator rechecks one company
From the Companies detail panel the SYSADMIN clicks "Recheck Stripe".
**Expected:** the company reconciles to live Stripe; the action is available even when the local subscription row is missing/stale (resolves by customer).

### US4 — Operator reconciles everyone
The SYSADMIN clicks "Recheck all pending from Stripe", sees a dry-run preview (per company: local status → live Stripe → resulting status, and a total-changed count), then applies.
**Expected:** drifted paid customers flip to `ACTIVE` in one action; the preview lists every company that would change before any write.

### US5 — No false transitions
A transient Stripe error, or a genuinely-unpaid `incomplete` subscription, is processed.
**Expected:** an `ACTIVE` company is never downgraded on a transient error; an `incomplete` (unpaid) subscription never flips a company to `ACTIVE`.

### US6 — Auditable
Every reconcile write is recorded with the acting sysadmin and a "manual reconcile" reason.
**Expected:** a `company_status_history` row captures previous→new status, `changedBy`, and reason.

---

## Functional Requirements

### FR-001 — Reliable first-payment activation
The webhook MUST transition a company `PENDING`/`incomplete` → `ACTIVE` when Stripe completes the first payment (`invoice.paid` with `billing_reason = subscription_create`, or `customer.subscription.updated` → `active`), writing both `companies.subscriptionstatus` and `companysubscriptions.status` (+ period end). This includes verifying that the live webhook endpoint is registered in Stripe and its signing secret matches `STRIPE_WEBHOOK_SECRET`, so events actually arrive and pass signature verification.
**Acceptance:**
- [ ] A completed first payment results in `ACTIVE` within one webhook delivery, with no manual action
- [ ] Signature verification passes for live events (endpoint + secret confirmed); processed events are recorded in `subscriptionbillingevents`

### FR-002 — Resilient event resolution
When `resolveCompanySubscription` cannot match by `stripesubscriptionid`, it MUST fall back (e.g. by `stripecustomerid`) and MUST NOT silently drop an activation-relevant event without recording it for later reconcile.
**Acceptance:**
- [ ] An event whose subscription id can't be extracted from the invoice is still resolved by customer id, or recorded (not skipped) so reconcile catches it
- [ ] No activation-relevant event is discarded without a durable record

### FR-003 — Bulk "Recheck all pending from Stripe"
The sysadmin Companies page MUST offer a bulk reconcile that wires the existing `POST /api/sysadmin/subscriptions/resync`, with a dry-run preview before any write.
**Acceptance:**
- [ ] A dry-run preview lists every company that would change (local → live Stripe → resulting status) before applying
- [ ] Applying reconciles all drifted companies in one action and refreshes the list

### FR-004 — Always-available per-company "Recheck Stripe"
The per-company recheck MUST be available even when the local subscription row is missing or stale, resolving live from Stripe (by subscription or customer).
**Acceptance:**
- [ ] The recheck action shows and works for a `PENDING` company regardless of local subscription-row state
- [ ] It reconciles that company to live Stripe and surfaces the result

### FR-005 — Show results
The UI MUST surface, per company, the local status, the live Stripe status, the resulting status, and a total-changed count.
**Acceptance:**
- [ ] After a reconcile (single or bulk), the operator can see what changed and what was left unchanged, with reasons

### FR-006 — Safe & idempotent mapping
Reconcile MUST map `active→ACTIVE`, `trialing→TRIAL`, `past_due`/`unpaid`→`PENDING_INACTIVE`, `canceled→CANCELED`, and `incomplete`→no change; it MUST NOT downgrade an `ACTIVE` company on a transient Stripe error; it MUST be SYSADMIN-gated.
**Acceptance:**
- [ ] The mapping matches `SubscriptionRecoveryService`; `incomplete`/unknown never activates; a Stripe error leaves state unchanged; non-sysadmins are rejected

### FR-007 — Audit
Each reconcile write MUST record the acting sysadmin and a "manual reconcile" reason.
**Acceptance:**
- [ ] A `company_status_history` row captures previous status, new status, `changedBy`, and reason for every reconcile-driven change

---

## Technical Sections

### Webhook (root cause) — `src/server/services/StripeWebhookHandler.ts`
`handleStripeEvent` skips any event whose `resolveCompanySubscription` returns `null` (no `subscriptionbillingevents` row, no handler). Harden two functions: `extractInvoiceSubscriptionId` (already reads multiple API-version locations) and `resolveCompanySubscription` — add a `stripecustomerid` fallback (look up `companysubscriptions` by customer when the subscription id can't be extracted), and when still unresolved, record the event for reconcile rather than dropping it. The activation branches (`handleInvoicePaymentSucceeded` `subscription_create` → `ACTIVE`; `handleSubscriptionUpdated` `active` → `ACTIVE`) are already correct and unchanged. Separately, confirm the live-mode webhook endpoint is registered in the Stripe dashboard and its signing secret equals `STRIPE_WEBHOOK_SECRET` in App Runner — a mismatch fails `verifyWebhookSignature` for every event, which alone would produce the observed drift.

### Reconcile service (reuse) — `src/server/services/SubscriptionRecoveryService.ts`
`resyncSubscriptionFromStripe(companyId, {dryRun})` and `resyncPendingSubscriptions({dryRun})` already read live Stripe and map to company status (writing `companies.subscriptionstatus` + `activeflag` and `companysubscriptions.status` + period end). For FR-004, extend the per-company path to resolve by `stripecustomerid` (or fetch the customer's active subscription) when no local subscription row exists. No new billing logic.

### Routes (exist) — `src/server/routes/sysadmin.ts`
`POST /api/sysadmin/subscriptions/resync` (body `{dryRun}`) and `POST /api/sysadmin/companies/:id/resync-subscription` already exist and are SYSADMIN-gated. Add the `company_status_history` audit write (FR-007) on reconcile-driven changes.

### Client — `src/client/pages/SysAdmin/Companies.tsx`
Add a top-level "Recheck all pending from Stripe" button: first POST `{dryRun:true}`, render the preview (`scanned` / `changed` + per-company rows), then on confirm POST `{dryRun:false}` and refetch. Ungate the per-company "Resync from Stripe" (remove the `companySubscription &&` guard at the Actions block) and relabel to "Recheck Stripe". Show the local→live→result diff and change count (FR-005).

### Conventions
Routes via `index.ts → app.ts`; DB via `src/db/client.ts`; 100% TypeScript (no `any`/`@ts-ignore`); Pino-only; Stripe key from `STRIPE_API_KEY` (App Runner console, `sk_live_`), `STRIPE_CC_PROCESSING_ENABLED=true`; code fences written by the orchestrator at `implement`; nothing pushed until the user says push.

---

## Success Criteria

1. **First payment auto-activates.** After a completed first payment, the company reaches `ACTIVE` within one webhook delivery (≤ 60 seconds) with no manual action; **0** new paid-but-`PENDING` accounts are created after the fix (measured weekly). *(FR-001, FR-002)*
2. **Drift is reconcilable in one click.** The bulk recheck's dry-run preview lists **100%** of drifted companies before any write, and applying reconciles them in a single action. *(FR-003, FR-005)*
3. **No standing drift.** A weekly reconcile finds **0** companies where Stripe = `active` but local status ≠ `ACTIVE` (down from 6 on 2026-07-04). *(FR-001–FR-004)*
4. **No false transitions.** **0** `ACTIVE` companies are downgraded by a reconcile due to a transient Stripe error, and **0** `incomplete`/unpaid subscriptions are marked `ACTIVE`. *(FR-006)*

---

## Constraints & Notes

### Constraints
- **Reuse, don't reinvent.** Built on SCOPE-067's `SubscriptionRecoveryService` + existing sysadmin routes and SCOPE-023's webhook — no new billing or card-collection logic.
- **Webhook authoritative + non-blocking; reconcile is a safety net.** Automatic activation is the primary path; the manual console exists for missed events, not as a replacement.
- **Safe writes only.** Forward/expected mappings only; `incomplete`→no change; never downgrade on a transient error; SYSADMIN-gated; audited.
- **Orchestrator-first.** Implement via `createSpecs` → `implement`. Nothing pushed until the user says push.

### Out of Scope (own later scopes)
- Dunning sequences / automatic suspension after N days.
- Plan upgrade/downgrade/proration.
- Multiple concurrent subscriptions per company.
- Changes to initial subscription creation (SCOPE-023) or the failure→recovery loop (SCOPE-067).

### Dependencies
- SCOPE-067, SCOPE-023; `STRIPE_API_KEY` + `STRIPE_WEBHOOK_SECRET` + `STRIPE_CC_PROCESSING_ENABLED` in the App Runner console.
- The live-mode Stripe **webhook endpoint must be registered** for the live key with a signing secret matching `STRIPE_WEBHOOK_SECRET` — a Stripe-dashboard config step (analogous to SCOPE-067's Customer Portal enablement).

### Notes — ROOT CAUSE CONFIRMED (2026-07-04)
Investigation (T001) settled it: **`subscriptionbillingevents` has 1 row in the entire system**, and Stripe's own event log is full of events → the webhook is failing system-wide, not merely drifting on edge cases. Ruled out: endpoint registration (1 endpoint `we_1Tg6s9…` → `https://wxKanban.wxperts.com/api/webhooks/stripe`, status `enabled`), URL routing (a signed-less POST returns the app's own `{"error":"Missing stripe-signature"}` 400 → route reachable + mounted), CC-processing gate (`STRIPE_CC_PROCESSING_ENABLED=true`), and the route code (raw body + `verifyWebhookSignature`, all correct). **The remaining cause is a `STRIPE_WEBHOOK_SECRET` mismatch** — real signed events reach `verifyWebhookSignature`, throw, 400, and never persist. This makes the webhook fix **config-first, not code:** set `STRIPE_WEBHOOK_SECRET` (App Runner) to endpoint `we_1Tg6s9…`'s dashboard signing secret, redeploy, send a test event, confirm a new `subscriptionbillingevents` row.

Consequence: the whole billing lifecycle (first-payment activation **and** SCOPE-067's failure→recovery loop, cancellations, renewals) has been inert. FR-002 (resolution hardening) remains valuable defense-in-depth but is **not** the root cause; FR-001's core is the secret + a post-fix verification that events flow.

- **Process note:** authored in-conversation (interactive buildscope, section-by-section approval); root cause confirmed by live diagnosis; implement via `createSpecs` → `implement`.
