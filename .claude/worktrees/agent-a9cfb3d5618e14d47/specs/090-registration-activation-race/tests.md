# Tests: Registration Activation Race (Spec 090)

Framework: Vitest (unit/integration). Stripe and DB seams are mocked where a live call is undesirable; a live smoke against `.env` (prod DB + `sk_live_`) is used for final verification only.

## TC-01 — Paid signup activates at registration (FR-001)
Given a registration request for a paid tier with a valid `stripeCustomerId` + `stripeSubscriptionId` whose Stripe subscription is `active` (invoice paid), when registration completes, then `companies.subscriptionstatus = ACTIVE`, `companysubscriptions.status = active`, and no webhook was required.

## TC-02 — Fail-open on Stripe error (FR-002)
Given the inline `resyncSubscriptionFromStripe` throws (Stripe/network/DB), when registration runs, then registration still returns success, the company remains PENDING, and the error is logged. No exception escapes the registration flow.

## TC-03 — Idempotent, no duplicate audit (FR-003, FR-004)
Given a company already ACTIVE (webhook won the race) when the inline reconcile runs, then no update is issued and no new `company_status_history` row is written. A genuine PENDING → ACTIVE transition writes exactly one history row (previous/new/reason/changedByType/stripeStatus).

## TC-04 — No false activation for incomplete (FR-003)
Given a registration whose Stripe subscription is still `incomplete` (payment not completed), when the inline reconcile runs, then the mapping yields no change and the company stays PENDING.

## TC-05 — Dropped activation event is recorded, not silent (FR-005)
Given an activation-relevant event (invoice.paid / customer.subscription.*) that resolves to no subscription row, when `handleStripeEvent` processes it, then a structured warn record is emitted containing event type, `stripeeventid`, customer id, and (where extractable) subscription id.

## Regression
- FREE / billing-exempt registration paths are unchanged (no reconcile call, no Stripe hit).
- `PaymentService` card-update / re-subscribe path still activates inline and is untouched.
