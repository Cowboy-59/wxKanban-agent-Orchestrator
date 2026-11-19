# SPEC-131: Self-Serve Subscription Suspend & Cancel

**Spec Number**: SPEC-131
**Umbrella Scope**: SCOPE-130 (`specs/Project-Scope/130-subscription-cancellation-and-data-archival.md`)
**Status**: `planned`
**Created**: 2026-09-21
**Implements**: SCOPE-130 FR-001 – FR-007, FR-015 (cancellation email), FR-016 (customer-initiated transitions), FR-017
**Completes**: SCOPE-023 Chunk D — D.4 (`DELETE /api/company/subscription`) and D.6 (cancel UI), specified 2026-04-29 and never built
**Sibling**: SPEC-132 (Cancelled-Company Data Archival) consumes the `cancelledat` stamp this spec writes

> Fence label for this spec's code is `[SCOPE 131 / Tnnn]` — fences follow the SPEC
> folder, not the umbrella scope (CLAUDE.md, "Fence labels follow the SPEC folder").

---

## Overview

A company ADMIN can today update their card from **Settings → Billing & Subscription** and do nothing else. This spec adds the two missing verbs.

**Suspend** pauses billing through Stripe `pause_collection` without ending the subscription: no further invoices, access walled, one click to resume, and nothing scheduled for deletion. It introduces a `PAUSED` subscription status.

**Cancel** uses Stripe `cancel_at_period_end: true`, so the customer keeps every day they have already paid for and can reverse the decision until the period actually ends. The click records an *intent* (`cancelrequestedat`); the period-end webhook is what finally writes `CANCELLED` and stamps `cancelledat`, which is the signal SPEC-132 waits on.

The pieces already on disk are closer than they look, and wrong in one specific way. `stripe.cancelSubscription()` in `src/server/lib/stripe.ts:406` already does exactly the right thing — `cancel_at_period_end: true` — and is **called by nobody**. `PaymentService.cancelSubscription()` at `src/server/services/PaymentService.ts:727` is a stub whose entire body logs `"Subscription cancellation not yet implemented"` and returns, without ever reaching the helper. No route reaches either. `pause_collection` appears nowhere in `src/`.

## Business Problem

With no cancel button, a customer who wants to leave and a customer whose card fails are indistinguishable to the system: both end up in the dunning sequence. That path is worse than a clean exit for everyone. Stripe gives up after roughly nine retries and cancels the subscription, and a canceled Stripe subscription cannot be resumed — so a customer who would have left tidily, and might have returned, is instead hard-walled out of the product. Production currently holds two companies in `PENDING_INACTIVE`, mid-dunning, with no way to tell which of them actually wanted out.

Three costs follow:

1. **Forced involuntary churn.** Leaving is only expressible as non-payment.
2. **No pause.** A customer stopping for a quarter must cancel and re-register, losing their project history — so they don't come back.
3. **Specified work left on the floor.** SCOPE-023 Chunk D wrote this endpoint down in April 2026, recorded the supporting Stripe dashboard decision ("leave *Cancel subscriptions* OFF — cancel happens in our UI"), and shipped neither half, leaving a correct Stripe helper with no caller and a stub that logs its own absence.

A second, quieter cost: because cancellation is unreachable in the product, every cancellation today happens by a human editing state, which is precisely the class of change SOC 2 CC8.1 exists to make traceable.

---

## Actors

- Primary: A company ADMIN suspending or cancelling their own subscription from Settings → Billing & Subscription.
- Secondary: The Stripe webhook, which confirms the cancellation at period end and reports dashboard-side pause/resume; Stripe's billing API; a company TEAM_MANAGER or member, who must see a coherent state but can take no action.

---

## Functional Requirements

### FR-001 — Replace the cancel stub with a real Stripe call
`PaymentService.cancelSubscription()` MUST resolve the company's `companysubscriptions.stripesubscriptionid` and call `stripe.cancelSubscription()` (`cancel_at_period_end: true`).
**Acceptance:**
- [ ] The `"not yet implemented"` warning is gone and the Stripe helper is invoked
- [ ] A company with no Stripe subscription returns a clear 409, never a silent success
- [ ] A Stripe failure propagates and **no local write occurs**

### FR-002 — `DELETE /api/company/subscription` with typed confirmation
Admin-only. Body carries `{ confirmName: '<companyname>' }`, rejected with 400 **before** Stripe is contacted.
**Acceptance:**
- [ ] Wrong or missing `confirmName` → 400, nothing sent to Stripe
- [ ] Success → Stripe shows `cancel_at_period_end: true`; the response carries the effective date
- [ ] Non-ADMIN → 403; `billingexempt` → 409

### FR-003 — Cancellation is pending, not applied
The click MUST NOT write `CANCELLED`. It records `companies.cancelrequestedat` plus Stripe's `cancel_at`, and leaves `subscriptionstatus` untouched.
**Rationale:** `evaluateAccess` allow-lists only `ACTIVE`/`TRIAL`, and the client wall in `ProtectedRoute.tsx` runs it unconditionally with no env flag. Writing `CANCELLED` on click would wall a paying customer for days they had already bought, while Stripe kept billing them.
**Acceptance:**
- [ ] Immediately after cancelling, the company is still `ACTIVE` and fully usable
- [ ] No wall appears until the period actually ends
- [ ] The panel shows the effective date

### FR-004 — Un-cancel while pending
`POST /api/company/subscription/resume` MUST clear `cancel_at_period_end` in Stripe and clear the local pending markers.
**Acceptance:**
- [ ] Offered only while a cancellation is pending
- [ ] Stripe shows `cancel_at_period_end: false`; `cancelrequestedat` is null
- [ ] No new subscription is created and no proration occurs

### FR-005 — Period-end webhook starts the archival clock
On `customer.subscription.deleted` for a customer-initiated cancellation, the webhook MUST set `subscriptionstatus = 'CANCELLED'` and stamp `cancelledat = now`.
**Acceptance:**
- [ ] `cancelledat` is set exactly once, at effective cancellation — never at the click
- [ ] A resubscribe clears `cancelledat` back to null
- [ ] Both `CANCELED` and `CANCELLED` spellings are accepted wherever status is read. Production contains **only** the one-L spelling today, while the UI and `deleteCompany()` write two — SCOPE-067 FR-002 promised to standardize this and did not

### FR-006 — Suspend via `pause_collection`
`POST /api/company/subscription/pause` calls Stripe with `pause_collection: { behavior: 'void' }`, sets `subscriptionstatus = 'PAUSED'` and `pausedat`. `POST .../unpause` reverses it.
**Acceptance:**
- [ ] Stripe issues no invoice while paused
- [ ] Resume clears `pause_collection` and returns the company to `ACTIVE` on the **same** subscription
- [ ] `customer.subscription.updated` carrying `pause_collection` maps to `PAUSED`, so a dashboard-side pause is not lost

### FR-007 — `PAUSED` is walled, but never archived
`PAUSED` MUST NOT join `UNRESTRICTED_STATUSES`. `evaluateAccess` MUST return a distinct mode so the wall can offer *resume* rather than a plan picker. A `PAUSED` company MUST never receive a `cancelledat`.
**Acceptance:**
- [ ] A paused company is blocked, with copy naming the pause and offering resume
- [ ] An unknown status still blocks — the allow-list posture in `shared/subscription-policy.ts` is preserved
- [ ] No code path can stamp `cancelledat` on a paused company

### FR-008 — The repair surface must stay reachable
All four mutating routes MUST remain callable by a walled company's ADMIN.
**Rationale:** `requireActiveSubscription.EXEMPT_PREFIXES` exempts `/api/payment` but **not** `/api/company`. Adding cancel/pause under `/api/company/subscription` without extending that list would make the controls unreachable exactly when they are needed.
**Acceptance:**
- [ ] A `PAUSED` or `CANCELLED` company's ADMIN can reach all four routes
- [ ] The exemption is explicit, with a comment naming why

### FR-009 — Cancellation confirmation email
On a successful cancel, email the company's active ADMIN the effective date and how to reverse it, reusing `emailTemplates.ts` and the `emailQueue` job.
**Acceptance:**
- [ ] Exactly one email per cancellation
- [ ] Email failure never blocks the route or the Stripe state
- [ ] Sent in the recipient's language across the 6 supported locales

### FR-010 — Audit every customer-initiated transition
Suspend, resume, cancel, un-cancel and effective cancellation each write a `company_status_history` row with actor attribution.
**Acceptance:**
- [ ] `changedByType` distinguishes `CUSTOMER` from `SYSTEM` (webhook) from `SYSADMIN`
- [ ] Satisfies SOC 2 CC7.2 — the record lives in a table separate from the row being changed
- [ ] `company_status_history` is underscore-named, the documented exception to the house convention, and is **not** "corrected"

### FR-011 — Panel UI
Extend `BillingSubscriptionPanel.tsx` with an admin-only suspend/cancel block rendering three states: active, paused, cancellation-pending-with-date. Cancel goes through a typed-confirmation dialog.
**Acceptance:**
- [ ] Controls are **hidden**, not disabled, for non-ADMIN and `billingexempt`
- [ ] Destructive actions are visually distinct; cancel requires the typed company name
- [ ] Every state re-fetches after mutation; loading and error states handled
- [ ] shadcn components per `_wxAI/rules/shadcn.md`; all copy i18n-keyed across 6 languages

---

## Success Metrics

1. A customer can cancel unaided in **under 60 seconds** and **0** support tickets.
2. **100%** of cancelling customers keep full access to the end of the paid period — **0** wall events on a company whose `cancelrequestedat` is set but whose period has not elapsed.
3. **0** local writes occur when the Stripe call fails, verified by fault injection.
4. **100%** of the five transitions produce an attributable `company_status_history` row.
5. Involuntary churn — companies reaching `CANCELED` via dunning rather than a deliberate click — falls measurably within 2 billing cycles, against today's baseline of 2 companies in `PENDING_INACTIVE`.
6. **0** paused companies acquire a `cancelledat`, verified by query after a full pause/resume cycle.

## Scope Boundary

In scope: the real Stripe cancel call; `DELETE /api/company/subscription` with typed confirmation; pending-cancellation markers; un-cancel; the period-end webhook that stamps `cancelledat`; pause/unpause via `pause_collection`; the `PAUSED` status and its `evaluateAccess` decision; the subscription-gate exemption for the new routes; the cancellation email; audit rows for the five customer-initiated transitions; the panel and its typed-confirmation dialog; paused-specific wall copy; i18n across 6 locales.

## Out of Scope

Excluded: everything downstream of the `cancelledat` stamp — the 30-day window, the archival sweep, the transfer, the scrub, the user deactivation and the legacy backfill all belong to **SPEC-132**. Also excluded: plan upgrade / downgrade and proration (SCOPE-023 D.1–D.3); refunds; recovery from a *dunning*-initiated Stripe cancellation, which is a separate defect needing its own spec; multiple concurrent subscriptions per company; the four new timestamp columns themselves, whose DDL is SPEC-132 T001 (this spec writes to them and therefore depends on it); changing how subscriptions are first created (SCOPE-023 Chunks B / H).

---

## Data Requirements

Writes to columns created by **SPEC-132 T001** — `companies.cancelrequestedat`, `companies.cancelledat`, `companies.pausedat`. That DDL is a hard prerequisite: this spec cannot be verified before it lands.

New `subscriptionstatus` value: `PAUSED`. Live distribution today: `ACTIVE` 47, `CANCELED` 4, `PENDING_INACTIVE` 2, `PENDING` 1, `SUSPENDED` 1. Note `activeflag` is independently inconsistent (one `ACTIVE` company has `activeflag = false`), so status alone is not a sufficient read.

Reads/writes `companysubscriptions` (`stripesubscriptionid`, `status`, `canceledat`) and appends to `company_status_history`.

## API Routes

| Method | Route | Notes |
| --- | --- | --- |
| DELETE | `/api/company/subscription` | Cancel at period end; `{ confirmName }` required |
| POST | `/api/company/subscription/resume` | Un-cancel while pending |
| POST | `/api/company/subscription/pause` | Suspend via `pause_collection` |
| POST | `/api/company/subscription/unpause` | Resume from paused |
| GET | `/api/company/subscription` | **Exists** at `src/server/routes/company.ts:203` — extend with pause/cancel state and effective date |

All four mutating routes: `authenticateToken` + `requireAuth` + `requireAdmin` (SOC 2 CC6.3 — an explicit role guard, not an assumption that an authenticated caller is entitled), and all four added to `EXEMPT_PREFIXES` per FR-008.

## Frontend Components

| Component | Path | Notes |
| --- | --- | --- |
| `BillingSubscriptionPanel` | `src/client/components/billing/BillingSubscriptionPanel.tsx` | **Extend** — the panel that actually shipped |
| `CancelSubscriptionDialog` | `src/client/components/billing/CancelSubscriptionDialog.tsx` | New — typed confirmation |
| Subscription wall | `src/client/components/ProtectedRoute.tsx` | **Extend** — paused-specific copy for the new access mode |

`SubscriptionManagementPanel.tsx`, the name SCOPE-023 D.6 used, was never created. This spec extends the panel that exists rather than introducing a second one.

## Integration Context

Must align with three standing decisions rather than reopen them. **SCOPE-090 Amendment A** owns `shared/subscription-policy.ts`; adding `PAUSED` means editing that shared module, and its deny-by-default posture must survive the edit. **SCOPE-067** owns `PENDING_INACTIVE` and the recovery loop; a deliberate cancellation must not be confused with a failed card, and the two paths must not both email the same customer. **SCOPE-023** owns subscription creation and the Stripe dashboard configuration — including "leave *Cancel subscriptions* OFF" — which this spec finally makes true by putting cancel in the product.

## Open Questions

1. Should a suspend carry a maximum duration, or may a company stay `PAUSED` indefinitely? Indefinite pause is revenue-neutral for Stripe but leaves an account in a state no policy covers.
2. Does suspend need the same typed confirmation as cancel? It is reversible and non-destructive, so the friction may be unhelpful — but it does wall the whole team.
3. When a cancellation is pending, should team members see the effective date, or only the ADMIN? Showing it is honest; hiding it avoids alarming a team whose ADMIN may still reverse the decision.

---

## Amendment C — Operator-initiated cancellation (2026-09-22)

**Requested by:** Andy, directly — "add the Cancel subscription button to the Admin Company list".

SPEC-131 as written addresses one actor: a company ADMIN cancelling their own
subscription from Settings → Billing. This amendment adds a second actor, a
SYSADMIN cancelling on a company's behalf from the platform company list. It
reuses the engine rather than building a second one; the only behavioral
difference is the recorded actor.

### C.1 — `requestCancellation` and `reverseCancellation` take an actor

Both shipped with `actorType: "CUSTOMER"` hardcoded, because the only caller was
the customer's own panel. FR-010 requires every transition to be attributable,
and `TransitionActor` has carried `"SYSADMIN"` since T015 without anything ever
passing it. Both functions now take an `actor: TransitionActor` parameter
defaulting to `"CUSTOMER"`, so every existing call keeps its meaning and the
operator path records what actually happened.

Without this the feature would have written a false audit row on every use —
the failure mode FR-010 exists to prevent.

### C.2 — Two SYSADMIN-gated routes

| Method | Path | Notes |
|--------|------|-------|
| POST | `/api/sysadmin/companies/:id/cancel-subscription` | Body `{ confirmName }`. Same typed-name gate as FR-002, re-checked server-side before Stripe. |
| POST | `/api/sysadmin/companies/:id/resume-subscription` | Clears a pending cancellation. |

Both sit under the `/api/sysadmin` router, which applies `authenticateToken` +
`requireSysAdmin` to everything mounted on it.

The un-cancel ships with the cancel, for the reason FR-004 gives for the
customer-side one: without it an operator mis-click is only fixable in the
database.

### C.3 — The button is NOT the existing `Inactivate` or `Delete`

The company list already has Suspend and Delete. Both change local status and
never contact Stripe — which is precisely the divergence SCOPE-130 was written
to close. "Cancel subscription" is a separate control that calls Stripe with
`cancel_at_period_end`, so billing actually stops. Adding it to the existing
local-only path would have widened that defect instead of closing it.

### C.4 — The customer is still emailed

Confirmed with Andy. `requestCancellation` already awaits
`sendCancellationConfirmation`, and an operator-initiated cancellation goes out
the same way: no silent cancellations. The email is unchanged, so it is written
in the customer's voice — correct, since the customer is the recipient either way.

### C.5 — The confirmation dialog is shared, its copy is not

`CancelSubscriptionDialog` gains an optional `copy` prop. Omitted keys fall back
to the existing customer-voiced strings, so the original caller is untouched.
The operator surface overrides them: the defaults say "You keep full access
until…", which is wrong when the person clicking is not the person losing
access. Forking the dialog would have produced two typed-name gates free to
drift apart.

### C.6 — Placement, and a defect found on the way

The button went onto `src/client/pages/SysAdminDashboard.tsx`, the company list
routed at `/sysadmin/dashboard`.

**`src/client/pages/SysAdmin/Companies.tsx` is dead code.** Nothing imports it;
it is in no bundle. It is a fuller twin of the dashboard's company management —
including SCOPE-085's "Recheck Stripe" button, which therefore has never
shipped. It is untouched by this amendment and is recorded here as a finding,
not fixed.

### C.7 — Verification

- Both routes proven mounted and SYSADMIN-gated over real HTTP
  (`tests/backend/scope131-endpoints.mjs`, extended; 14 passed / 0 failed).
- The button, the undo and the dialog copy confirmed present in the built client
  bundle — the check that exposed C.6.
- Unit suite unchanged: 12 pre-existing failures, none in this area.

Not proven here, and carried on the same untested list as the rest of SPEC-131:
that a real operator cancel writes `changedByType=SYSADMIN`, that the button
hides once a cancellation is pending, and that undo clears `cancelrequestedat`.
All three need a disposable company on Stripe test keys; the local
`DATABASE_URL` is production and Stripe is live.
