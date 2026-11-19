# SCOPE-067: Subscription Lifecycle Visibility & Recovery

**Scope Number**: SCOPE-067
**Status**: `draft`
**Created**: 2026-06-22
**Last Reviewed**: 2026-06-22 (decisions captured in-conversation: status model, access policy, restart mechanism, notification, auto-email)
**Depends On**: SCOPE-023 (Stripe subscription operations — `companysubscriptions`, `StripeWebhookHandler`, `stripeConfig`); existing sysadmin panel (`src/server/routes/sysadmin.ts`, `src/client/pages/SysAdmin/Companies.tsx`, `SysAdminDashboard.tsx`); `src/server/lib/stripe.ts`; `src/server/lib/email.ts`.
**Related Scopes**: SCOPE-023 created the subscription tables and webhook plumbing; this scope makes failure states visible to the sysadmin and gives the customer a self-serve recovery path.
**Source**: `specs/Project-Scope/067-subscription-lifecycle.md`

---

## Overview

Subscription failure states already exist in the data — the Stripe webhook sets `companies.subscriptionstatus` to `PAST_DUE` on `invoice.payment_failed` and `CANCELED` on `customer.subscription.deleted`, and the per-company `companysubscriptions` row carries the live Stripe status, plan amount, and period dates. None of this is surfaced in the sysadmin panel: the company list shows only a coarse badge that recognizes `ACTIVE/TRIAL/SUSPENDED/CANCELLED`, so `PAST_DUE` and `CANCELED` fall through to a generic "SUSPENDED" badge. (There is also a spelling mismatch: the webhook writes `CANCELED`, the UI expects `CANCELLED` — they never match.)

This scope makes the subscription lifecycle visible and recoverable:

- **A clear failed state.** Introduce `PENDING_INACTIVE` as the canonical "payment failed, awaiting resolution" status; the webhook maps Stripe `past_due`/`unpaid` into it. `CANCELED` stays distinct. The `CANCELED`/`CANCELLED` mismatch is standardized.
- **Sysadmin visibility.** The company list gains a real subscription column (live status + plan + MRR) with correct badges; the detail panel renders the subscription block it already receives.
- **Customer recovery.** On payment failure the webhook auto-emails the company admin a Stripe Customer Portal link to update their card and restore service; the sysadmin can also send that link on demand. A persistent in-app banner shows while `PENDING_INACTIVE`.
- **Sysadmin notification.** A "Needs attention" section on the sysadmin dashboard lists `PENDING_INACTIVE` companies with two actions: **Send restart link** and **Inactivate**.

`PENDING_INACTIVE` is a grace state — the company can still log in (with the banner) so they can fix billing; only an explicit sysadmin **Inactivate** sets `SUSPENDED` (which blocks login under existing behavior).

## Business Problem

The product bills real money through Stripe, but when a customer's card fails there is currently no operational loop: the webhook flips a status nobody can see, the customer is never told, and the sysadmin has no list of who's in trouble or any one-click way to help them recover. The result is silent churn — a failed payment quietly degrades to an effectively dead account with no nudge to the customer and no visibility for the operator.

Three concrete gaps:

1. **No visibility.** The sysadmin cannot tell, from the company list, which accounts are paying, in trouble, or canceled — the failure statuses the system already records are rendered as "SUSPENDED" or nothing.
2. **No recovery path.** A customer whose card fails has no link to fix it; they'd have to be told manually, and there's no self-serve update flow wired up.
3. **No operator workflow.** There's no "these N companies just failed payment — act on them" surface, so failures aren't triaged.

The plumbing to close this already exists (Stripe webhooks, `companysubscriptions`, the email helper, Stripe's hosted Customer Portal). The gap is surfacing it and adding the recovery loop.

### Core Design

| Element | Subscription Lifecycle Visibility & Recovery |
| --- | --- |
| **Primary Actor** | A SYSADMIN monitoring and triaging company subscriptions from the sysadmin panel |
| **Secondary Actors** | The Stripe webhook (sets `PENDING_INACTIVE` on failure, auto-emails the customer); the company ADMIN (clicks the restart link to fix billing); Stripe Customer Portal (hosted card-update/reactivation) |
| **Key Value** | Turn silent payment failures into a visible, recoverable workflow — the operator sees who failed and acts in one click; the customer is auto-nudged with a self-serve fix |
| **Placement** | Subscription column + badges in the company list; subscription block + actions in the company detail panel; a "Needs attention" section on the sysadmin dashboard; a billing banner in the app for affected companies |
| **Boundary — IN** | `PENDING_INACTIVE` status + webhook mapping; CANCELED/CANCELLED fix; sysadmin list/detail subscription display; Stripe Customer Portal session endpoint; auto-email on failure + manual "Send restart link"; grace banner; sysadmin "Needs attention" list with Send-link / Inactivate actions |
| **Boundary — OUT** | Automatic suspension timers / dunning sequences; plan upgrade/downgrade UI; proration; multi-subscription per company; any change to how subscriptions are first created (SCOPE-023) |

---

## User Scenarios

### US1 — Sysadmin sees subscription status at a glance
In the company list, each row shows the live subscription status (ACTIVE / TRIAL / PENDING_INACTIVE / CANCELED / SUSPENDED) with a distinct badge, plus plan and MRR.
**Expected:** the failure states the system already records are visibly distinct, not collapsed into "SUSPENDED."

### US2 — Sysadmin inspects a company's billing detail
Selecting a company shows its subscription block: status, plan + amount, current period end, cancel date, and Stripe IDs (already returned by the detail endpoint).
**Expected:** the detail panel renders the `subscription` data; if no Stripe subscription exists (legacy/exempt), it says so cleanly.

### US3 — Payment fails → status + auto-email
Stripe reports `invoice.payment_failed` (or a subscription transitions to `past_due`/`unpaid`). The webhook sets the company to `PENDING_INACTIVE` and emails the company ADMIN a restart link.
**Expected:** status becomes `PENDING_INACTIVE`; one email goes to the billing/admin contact with a working Stripe Customer Portal link; the action is logged.

### US4 — Customer restarts via the link
The ADMIN clicks the emailed (or in-app banner) link, lands in the Stripe Customer Portal, updates their card, and the subscription recovers. On the next `invoice.payment_succeeded`/`subscription.updated`, the webhook returns the company to `ACTIVE`.
**Expected:** successful card update → Stripe retries/activates → company flips back to `ACTIVE` automatically; banner clears.

### US5 — Grace access while PENDING_INACTIVE
A `PENDING_INACTIVE` company's users can still log in and use the app, but see a persistent banner: "Your subscription needs attention — update billing to avoid interruption," with the restart link.
**Expected:** login works; banner shows for that company until status leaves `PENDING_INACTIVE`; no feature lock-out (that's the sysadmin's explicit call).

### US6 — Sysadmin "Needs attention" triage
The sysadmin dashboard shows a section listing all `PENDING_INACTIVE` companies. For each: **Send restart link** (re-send the portal email) and **Inactivate** (set `SUSPENDED`, which blocks login).
**Expected:** the list reflects current failed accounts; Send-link re-emails; Inactivate suspends and the row leaves the list.

### US7 — Sysadmin sends a restart link on demand
From the company detail panel or the Needs-attention list, the sysadmin clicks **Send restart link**.
**Expected:** the same Stripe Customer Portal email is sent to the company ADMIN; success/failure is surfaced; logged.

### US8 — No Stripe customer / legacy or exempt company
A `billingexempt` or legacy company (no `companysubscriptions` row, no Stripe customer) never enters `PENDING_INACTIVE` and shows no restart action.
**Expected:** these are excluded from failure handling and the Needs-attention list; the detail panel shows "no Stripe subscription."

### US9 — Stripe/email unavailable
Creating a portal session or sending the email fails (Stripe error, missing key, email failure).
**Expected:** fail-open and visible — the status change still persists, the failure is logged, the sysadmin action shows a clear error, and the customer email can be retried via Send-restart-link. A failed auto-email never blocks the webhook.

---

## Functional Requirements

### FR-001 — `PENDING_INACTIVE` status
Introduce `PENDING_INACTIVE` as a subscription status value. The webhook MUST set it when Stripe reports a recoverable payment failure (`invoice.payment_failed`, or `customer.subscription.updated` to `past_due`/`unpaid`), replacing the current `PAST_DUE` write.
**Acceptance:**
- [ ] `invoice.payment_failed` sets `companies.subscriptionstatus = 'PENDING_INACTIVE'` and `companysubscriptions.status` to the Stripe value
- [ ] A subsequent successful payment / active update returns the company to `ACTIVE`

### FR-002 — Standardize CANCELED spelling
The webhook-written value and the UI MUST agree on one spelling for the canceled state.
**Acceptance:**
- [ ] One spelling is used end-to-end (server write, list filter, badge); the prior mismatch is gone; existing rows with the old spelling are migrated/handled

### FR-003 — Subscription status in the company list
`GET /api/sysadmin/companies` MUST include the live subscription status (and enough to badge it) for each company; the list UI MUST render distinct badges for ACTIVE/TRIAL/PENDING_INACTIVE/CANCELED/SUSPENDED plus plan and MRR.
**Acceptance:**
- [ ] Each row shows the correct status badge; PENDING_INACTIVE and CANCELED are visually distinct; no failure state renders as a generic SUSPENDED fallback

### FR-004 — Subscription detail block
The company detail panel MUST render the `subscription` object the detail endpoint already returns: status, plan name + amount, current period end, cancel date, Stripe customer/subscription IDs; with a clean empty state when none exists.
**Acceptance:**
- [ ] Detail panel shows the subscription fields; legacy/exempt companies show "no Stripe subscription"

### FR-005 — Stripe Customer Portal session endpoint
A server endpoint MUST create a Stripe Billing/Customer Portal session for a company's Stripe customer and return the URL.
**Acceptance:**
- [ ] Given a company with a Stripe customer id, returns a valid portal URL; returns a clear error for companies without one; SYSADMIN-gated for the sysadmin-triggered path

### FR-006 — Auto-email on failure
On the failure that triggers `PENDING_INACTIVE`, the webhook MUST email the company's ADMIN/billing contact a restart link (Customer Portal). Email failure MUST NOT block webhook processing.
**Acceptance:**
- [ ] A failed-payment event sends exactly one restart email to the billing/admin contact; a send failure is logged and the status change still persists

### FR-007 — Manual "Send restart link"
The sysadmin MUST be able to (re)send the restart email from the company detail panel and the Needs-attention list.
**Acceptance:**
- [ ] The action emails the portal link to the company ADMIN; success/failure surfaced; SYSADMIN-gated; logged

### FR-008 — Grace banner
While a company is `PENDING_INACTIVE`, its users MUST see a persistent in-app banner with the restart link; login and normal use remain available.
**Acceptance:**
- [ ] Banner shows for PENDING_INACTIVE companies with a working restart link; clears when status leaves PENDING_INACTIVE; no feature lock-out

### FR-009 — Sysadmin "Needs attention" section
The sysadmin dashboard MUST list all `PENDING_INACTIVE` companies, each with **Send restart link** and **Inactivate** actions.
**Acceptance:**
- [ ] The section lists current PENDING_INACTIVE companies; Inactivate sets SUSPENDED and removes the row; Send-link re-emails

### FR-010 — Inactivate action
The sysadmin **Inactivate** action MUST set the company to `SUSPENDED` (existing login-blocking behavior) via the existing status-change path.
**Acceptance:**
- [ ] Inactivate transitions the company to SUSPENDED; affected users are blocked from login per existing behavior; logged

### FR-011 — Exclude exempt/legacy from failure handling
`billingexempt` companies and companies with no Stripe customer/subscription MUST NOT enter `PENDING_INACTIVE` and MUST be excluded from the Needs-attention list and restart actions.
**Acceptance:**
- [ ] Exempt/legacy companies never get a failure email or a restart action; not listed in Needs-attention

---

## Technical Sections

### Status model & migration
`companies.subscriptionstatus` is a `varchar(50)` (no DB enum) — adding `PENDING_INACTIVE` needs no schema change. A data migration standardizes the canceled spelling (decide `CANCELED` vs `CANCELLED`; recommend `CANCELED` to match Stripe + current webhook, and update the UI to match) and rewrites any existing `PAST_DUE` rows to `PENDING_INACTIVE`. Client `subscriptionstatus` union types updated accordingly.

### Webhook
`StripeWebhookHandler.ts`: change the `invoice.payment_failed` (and `past_due`/`unpaid` paths) to write `PENDING_INACTIVE` instead of `PAST_DUE`; after persisting, fire the restart email (FR-006) best-effort (try/catch, Pino-logged, never throws into webhook handling). Keep `customer.subscription.deleted` → `CANCELED` and success → `ACTIVE`.

### Stripe Customer Portal
Use `stripe.billingPortal.sessions.create({ customer, return_url })` in `src/server/lib/stripe.ts`. Customer id comes from `companysubscriptions.stripecustomerid`. `return_url` → the app billing/settings page. No new Stripe objects persisted.

### Email
Reuse `src/server/lib/email.ts` + a new template (HTML + text) in `emailTemplates.ts`. Recipient resolution: company `billingemail` if set, else the company ADMIN's `emailaddr`. One email per failure event (idempotency guard so Stripe retries don't spam — e.g., skip if already PENDING_INACTIVE and emailed within a window).

### Routes
- `POST /api/sysadmin/companies/:id/restart-link` (SYSADMIN) — create portal session + email it; returns sent/failed.
- Extend `GET /api/sysadmin/companies` to include live subscription status (join latest `companysubscriptions` or use `companies.subscriptionstatus`).
- `GET /api/sysadmin/needs-attention` (or fold into dashboard summary) — list PENDING_INACTIVE companies.
- A customer-facing `POST /api/billing/portal-session` (authed company ADMIN) for the in-app banner button.
All via `index.ts → app.ts`.

### Client
- `SysAdmin/Companies.tsx`: status badges (add PENDING_INACTIVE/CANCELED), subscription column, detail-panel subscription block + Send-restart-link + Inactivate.
- `SysAdminDashboard.tsx`: "Needs attention" section.
- App shell / dashboard: PENDING_INACTIVE grace banner with portal link (company-scoped).

### Conventions
Routes via `index.ts → app.ts`; DB via `src/db/client.ts`; 100% TypeScript (no `any`/`@ts-ignore`); Pino-only; secrets (Stripe keys) from env/App Runner console; fences by the orchestrator at `implement`. Nothing pushed until the user says push.

---

## Success Criteria

1. **Failure is visible.** The sysadmin list shows distinct, correct badges for every subscription state; no failure renders as a generic SUSPENDED. *(FR-001–004)*
2. **The customer gets a fix automatically.** A failed payment flips the company to PENDING_INACTIVE and emails the admin a working Stripe Portal link, without blocking the webhook. *(FR-001, FR-006)*
3. **Self-serve recovery works.** Updating the card via the portal returns the company to ACTIVE on the next Stripe event; the banner clears. *(FR-005, FR-008)*
4. **The operator has a workflow.** A "Needs attention" list shows failed companies with one-click Send-link and Inactivate. *(FR-007, FR-009, FR-010)*
5. **Grace, not guillotine.** PENDING_INACTIVE keeps login + banner; only explicit Inactivate suspends. *(FR-008, FR-010)*
6. **Exempt/legacy untouched.** Billing-exempt and no-Stripe companies are excluded from failure handling. *(FR-011)*

---

## Constraints & Notes

### Constraints
- **Reuse, don't reinvent.** Built on SCOPE-023's webhook + `companysubscriptions`, the existing email helper, and Stripe's hosted Customer Portal — no custom card-collection page.
- **Webhook is authoritative + non-blocking.** Status transitions come from Stripe events; side effects (email) are best-effort and never break webhook processing.
- **Grace by default.** Failed ≠ locked out; suspension is an explicit sysadmin decision.
- **Correct plumbing.** Routes via `index.ts → app.ts`; 100% TS; Pino-only; Stripe keys from env/console.
- **Orchestrator-first.** Implement via `createSpecs` → `implement`.

### Out of Scope (own later scopes)
- Automatic suspension after N days / dunning email sequences.
- Plan upgrade/downgrade/proration UI.
- Multiple concurrent subscriptions per company.
- Changes to initial subscription creation (SCOPE-023).

### Dependencies
- SCOPE-023 (Stripe subscription operations); `STRIPE_CC_PROCESSING_ENABLED` + keys + webhook secret in the App Runner console; Stripe Customer Portal enabled in the Stripe dashboard (a Stripe-side config step).
- `src/server/lib/email.ts` (SES/SMTP) configured for outbound mail.

### Notes
- **Open items for spec sizing:** canceled-spelling decision (recommend `CANCELED`); the email idempotency window; whether "Needs attention" is a new endpoint vs folded into the existing sysadmin dashboard summary; the customer banner placement (AppShell vs dashboard).
- **Process note:** authored in-conversation (buildscope CLI workaround); implement via `createSpecs` → `implement`.
