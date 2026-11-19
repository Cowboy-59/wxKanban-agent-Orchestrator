# SCOPE-130: Self-Serve Subscription Suspend / Cancel & 30-Day Data Archival

**Scope Number**: SCOPE-130
**Status**: `draft`
**Created**: 2026-09-21
**Last Reviewed**: 2026-09-21 (eight decisions captured in-conversation: archival model, cancel timing, user-deactivation point, suspend semantics; then invoice handling, archive-owner role, legacy backfill, and deactivation timing confirmed)
**Depends On**: SCOPE-023 (Chunk D — `cancelSubscription`, typed-confirmation cancel, `companysubscriptions`, `StripeWebhookHandler`); SCOPE-067 (`PENDING_INACTIVE`, `SubscriptionRecoveryService`, billing-portal session); SCOPE-090 Amendment A (`shared/subscription-policy.ts` `evaluateAccess`, the always-on client wall)
**Related Scopes**: SCOPE-023 Chunk D specifies the cancel endpoint and panel and left them unbuilt (D.4, D.6, D.8 still `[ ]`); SCOPE-067 built the *recovery* loop but put "automatic suspension timers" out of scope; SCOPE-126 (customer data sovereignty / audit readiness) governs what may be destroyed
**Source**: `specs/Project-Scope/130-subscription-cancellation-and-data-archival.md`

---

## Overview

A company ADMIN can today update their card from **Settings → Billing & Subscription**, and nothing else. There is no way to suspend billing and no way to cancel. The operator-side path exists but is a misnomer: `SysAdminCompanyService.deleteCompany()` sets `subscriptionstatus = 'CANCELLED'`, flips `activeflag`, writes a `retentionDate` into a `jsonb` metadata blob — and **nothing in the codebase ever reads that field**. The product tells operators "data will be retained for 30 days" and then keeps it forever. `PaymentService.cancelSubscription()` is a stub that logs `"Subscription cancellation not yet implemented"` and returns without calling Stripe.

This scope closes the loop, end to end:

- **Self-serve suspend.** Stripe `pause_collection` — billing stops, access is walled, nothing is scheduled for archival, and one click resumes. A new `PAUSED` status.
- **Self-serve cancel.** Stripe `cancel_at_period_end: true`, so the customer keeps the days they have already paid for, and the cancellation stays reversible until the period actually ends. Typed confirmation, admin-only, per SCOPE-023 D.4.
- **A 30-day archival window that is real.** An explicit `cancelledat` column and a daily sweep job, not a `setTimeout` — `jobScheduler` is in-memory and dies on every App Runner redeploy.
- **Archive by transfer and scrub, not by deletion.** At day 30, projects and all project-scoped data are re-pointed to the wxperts archive company; the departing company and its users are anonymized in place. **No row is deleted.** Every foreign key stays valid, `companyauditlogs` and `companysubscriptions` survive intact for audit, and the financial record remains attributable.

The archival model is the load-bearing decision. Deleting a company cascades into 77 live tables, destroys invoices that must be retained for tax purposes, and severs the audit trail that SOC 2 findings depend on. Scrub-and-transfer achieves the operator's actual goal — the customer's identity is gone and their work is preserved somewhere reachable — with none of that damage.

## Business Problem

The product bills real money and offers no exit. A customer who wants to stop paying has exactly three options: email support, call Stripe, or let their card fail. The third is the one they take, which is why production currently holds **two companies in `PENDING_INACTIVE`** — customers mid-dunning who may simply have wanted out.

Four concrete costs:

1. **Forced involuntary churn.** With no cancel button, wanting to leave and failing to pay are the same event. The dunning sequence then runs its course and cancels the subscription, which per `reference_paid_after_dunning_cancel_trap` is unrecoverable in Stripe. A customer who would have left cleanly and maybe returned is instead hard-walled.
2. **An unenforced retention promise.** `deleteCompany()` reports `"Data will be retained for 30 days"` to the operator and schedules nothing. Production holds **4 companies already in `CANCELED`** — since 2026-06-19, 2026-08-19 and 2026-08-27 — carrying 7 projects between them, none of it archived, none of it purged, and their users still `active`.
3. **No suspend at all.** A customer pausing for a quarter must cancel and re-register, losing their project history. `pause_collection` appears nowhere in `src/`.
4. **A specified feature left on the floor.** SCOPE-023 Chunk D specified `DELETE /api/company/subscription` and `SubscriptionManagementPanel.tsx` in April 2026, recorded the supporting Stripe dashboard decision ("leave *Cancel subscriptions* OFF — cancel happens in our UI"), and shipped neither. `stripe.cancelSubscription()` exists, does the right thing, and is called by nobody.

### Core Design

| Element | Self-Serve Suspend / Cancel & 30-Day Data Archival |
| --- | --- |
| **Primary Actor** | A company ADMIN suspending or cancelling their own subscription from Settings → Billing & Subscription |
| **Secondary Actors** | The daily archival sweep job (transfers and scrubs at day 30); the Stripe webhook (confirms the cancellation at period end, reports pause/resume); a SYSADMIN auditing or reversing an archival; Stripe (`pause_collection`, `cancel_at_period_end`) |
| **Key Value** | A clean, reversible exit that keeps what the customer paid for, followed by an archival that is actually enforced — and that transfers work rather than destroying records |
| **Placement** | A new Suspend / Cancel block in `BillingSubscriptionPanel`; a `cancelledat` / `pausedat` column on `companies`; a sweep job in `src/server/jobs/`; SYSADMIN visibility of the pending-archival queue |
| **Boundary — IN** | Self-serve suspend via `pause_collection` + resume; self-serve cancel via `cancel_at_period_end` + un-cancel; `PAUSED` status and its access decision; typed confirmation; user deactivation with ADMIN exemption; `cancelledat` column; daily archival sweep (env-gated, dry-run capable, per-run capped); transfer of projects and project-scoped data to the archive company; anonymization of the departing company and its users; cancellation and pre-archival emails; audit rows for every transition |
| **Boundary — OUT** | Plan upgrade / downgrade and proration (SCOPE-023 Chunk D.1–D.3); refunds of any kind; recovery from a *dunning*-initiated Stripe cancellation (a separate defect — see `reference_paid_after_dunning_cancel_trap`); multi-subscription per company; hard deletion of any row; a customer-facing data-export / GDPR-erasure surface; backfill of the 4 pre-existing `CANCELED` companies (excluded by design — see FR-008) |

---

## Actors

- Primary: A company ADMIN who wants to suspend or cancel their own wxKanban subscription without contacting support.
- Secondary: The daily archival sweep job; the Stripe webhook confirming period-end cancellation and pause/resume; a SYSADMIN auditing the pending-archival queue or reversing an archival; Stripe itself.

---

## User Scenarios

### US1 — ADMIN suspends billing
The ADMIN opens Settings → Billing & Subscription and chooses **Suspend billing**. Stripe stops invoicing via `pause_collection`; the company moves to `PAUSED`.
**Expected:** no further invoices; the company is walled with a "billing paused — resume any time" message; **no archival is scheduled**; the ADMIN can resume in one click.

### US2 — ADMIN resumes from suspended
The ADMIN clicks **Resume billing**. `pause_collection` is cleared and billing restarts on the existing subscription.
**Expected:** status returns to `ACTIVE`, the wall clears on refresh, no new Stripe subscription is created, no double charge.

### US3 — ADMIN cancels, and keeps the paid period
The ADMIN chooses **Cancel subscription** and types the company name to confirm. Stripe is updated with `cancel_at_period_end: true`.
**Expected:** the company stays `ACTIVE` with full access until the period ends; the panel shows the cancellation date; a confirmation email states that date and how to reverse it; the row records `cancelrequestedat` and Stripe's `cancel_at`.

### US4 — ADMIN changes their mind before period end
While the cancellation is pending, the panel offers **Resume subscription**.
**Expected:** `cancel_at_period_end` is cleared in Stripe, the pending markers are cleared, billing continues uninterrupted, and nothing was ever archived.

### US5 — The period ends and the cancellation takes effect
Stripe emits `customer.subscription.deleted` at period end. The webhook sets `subscriptionstatus = 'CANCELLED'` and stamps `cancelledat = now` — starting the 30-day clock.
**Expected:** the clock starts at *effective* cancellation, never at the click; all users except one ADMIN are set inactive; the surviving ADMIN can still sign in, reach `/api/payment`, and resubscribe.

### US6 — Day 23: the customer is warned
Seven days before archival the sweep emails the surviving ADMIN: this is the date your projects are transferred out, and here is the link to resubscribe first.
**Expected:** exactly one warning per company; a resubscribe before day 30 clears `cancelledat` and cancels the archival entirely.

### US7 — Day 30: transfer and scrub
The sweep re-points the company's `companyprojects` rows and every project-scoped table to archive company `019d4ff7-527e-7627-92a0-13eaf5e16ee8`, owner `019d4ff7-52b5-724d-b0ad-b37f5c331199` (the ADMIN of that company), then anonymizes the departing company, its user rows, and its invoices.
**Expected:** all projects appear under HAS Enterprises LLC owned by an ADMIN who can administer them; no PII remains on the departing company, its users, or its invoices; **no row is deleted**; every foreign key still resolves; `companyauditlogs`, `companysubscriptions` and `company_status_history` are untouched; one audit row per company records exactly what moved.

### US8 — The 4 pre-existing CANCELED companies are backfilled once
The 4 companies already in `CANCELED` have no `cancelledat` value, because the column did not exist when they cancelled. A one-time backfill stamps each from the best available evidence, after which they archive on the normal rule.
**Expected:** the backfill is a reviewed, hand-applied statement recorded in the schema-change log — never inferred by the job at run time. The sweep itself still skips every row where `cancelledat IS NULL`, so a future gap can never be silently archived.

### US9 — The sweep ships disarmed but visible
`SUBSCRIPTION_ARCHIVAL_ENABLED` defaults to `off`.
**Expected:** the job does not archive anything; in `dryrun` it logs precisely what it would have moved; on every boot it logs one line naming its mode, so a disarmed destructive job cannot be silently forgotten.

### US10 — Stripe is unreachable during a cancel
The Stripe call fails when the ADMIN clicks cancel.
**Expected:** **nothing** is written locally — no status change, no `cancelrequestedat`. The ADMIN sees a clear retryable error. The local row must never claim a cancellation Stripe did not accept.

### US11 — A billing-exempt or legacy company
A `billingexempt` company has no Stripe subscription.
**Expected:** suspend and cancel are hidden, not merely disabled; these companies can never enter `PAUSED` or acquire a `cancelledat`.

### US12 — A non-ADMIN opens the panel
A TEAM_MANAGER or member views Settings.
**Expected:** the suspend/cancel block is absent. Every endpoint is `requireAdmin`, and the client hiding it is UX, not the control.

---

## Functional Requirements

### FR-001 — Replace the cancel stub with a real Stripe call
`PaymentService.cancelSubscription()` currently logs `"Subscription cancellation not yet implemented"` and returns. It MUST resolve the company's `companysubscriptions.stripesubscriptionid` and call the existing `stripe.cancelSubscription()` (`cancel_at_period_end: true`).
**Acceptance:**
- [ ] The stub's warning log is gone and the Stripe helper is actually invoked
- [ ] A company with no Stripe subscription returns a clear 409, not a silent success
- [ ] Stripe failure propagates and no local write occurs (US10)

### FR-002 — `DELETE /api/company/subscription` with typed confirmation
Implements SCOPE-023 D.4. Admin-only. Body carries `{ confirmName: '<companyname>' }` and MUST reject a mismatch with 400 before touching Stripe.
**Acceptance:**
- [ ] Wrong or missing `confirmName` → 400, nothing sent to Stripe
- [ ] Success → Stripe shows `cancel_at_period_end: true`; response returns the effective date
- [ ] Non-ADMIN → 403; `billingexempt` → 409

### FR-003 — Cancellation is pending, not applied
The cancel click MUST NOT write `CANCELLED`. It records `companies.cancelrequestedat` and the Stripe `cancel_at`, and leaves `subscriptionstatus` as-is.
**Rationale:** `evaluateAccess` allow-lists only `ACTIVE`/`TRIAL`, and the client wall runs it unconditionally with no env flag. Writing `CANCELLED` on click would wall a customer for days they have already paid for, while Stripe kept billing them.
**Acceptance:**
- [ ] Immediately after cancelling, the company is still `ACTIVE` and fully usable
- [ ] The panel shows the effective date
- [ ] No wall appears until the period actually ends

### FR-004 — Un-cancel while pending
`POST /api/company/subscription/resume` MUST clear `cancel_at_period_end` in Stripe and clear the local pending markers.
**Acceptance:**
- [ ] Available only while a cancellation is pending
- [ ] Stripe shows `cancel_at_period_end: false`; `cancelrequestedat` is null
- [ ] No new subscription is created and no proration occurs

### FR-005 — Period-end webhook starts the clock
On `customer.subscription.deleted` for a customer-initiated cancellation, the webhook MUST set `subscriptionstatus = 'CANCELLED'` and stamp `cancelledat = now`.
**Acceptance:**
- [ ] `cancelledat` is set exactly once, at effective cancellation
- [ ] A resubscribe clears `cancelledat` back to null
- [ ] Both `CANCELED` and `CANCELLED` spellings are recognized everywhere this scope reads status — production currently contains only the one-L spelling, and SCOPE-067 FR-002 promised to standardize it and did not

### FR-006 — Suspend via `pause_collection`
`POST /api/company/subscription/pause` MUST call Stripe with `pause_collection: { behavior: 'void' }` and set `subscriptionstatus = 'PAUSED'` plus `pausedat`. `POST .../unpause` reverses it.
**Acceptance:**
- [ ] Stripe stops invoicing; no invoice is generated while paused
- [ ] Resume clears `pause_collection` and returns the company to `ACTIVE` on the same subscription
- [ ] `customer.subscription.updated` carrying `pause_collection` maps to `PAUSED` so a dashboard-side pause is not lost

### FR-007 — `PAUSED` is walled but never archived
`PAUSED` MUST NOT join `UNRESTRICTED_STATUSES`. `evaluateAccess` MUST return a distinct mode for it so the wall can say "billing paused — resume any time" rather than showing a plan picker. A `PAUSED` company MUST never receive a `cancelledat`.
**Acceptance:**
- [ ] A paused company is blocked, with copy naming pause and offering resume
- [ ] The sweep never selects a `PAUSED` company
- [ ] An unknown-status row still blocks — the allow-list posture is preserved

### FR-008 — `cancelledat` / `pausedat` columns, and the null-skip rule
Add `companies.cancelledat`, `companies.pausedat`, `companies.cancelrequestedat`, `companies.archivedat` (all nullable timestamps). The sweep MUST key on `cancelledat` alone and MUST NOT infer a date from `updatedat`.
**Rationale:** the 4 companies already in `CANCELED` last saw `updatedat` between June and August 2026. A sweep keyed on `updatedat` would judge all four to be months past due and archive them on its first run. Those four are handled by an explicit one-time backfill (FR-019), not by making the job cleverer — the null-skip rule stays absolute so any *future* row that acquires `CANCELED` without a `cancelledat` also fails safe.
**Acceptance:**
- [ ] `cancelledat IS NULL` is skipped unconditionally, before and after the FR-019 backfill
- [ ] No code path anywhere derives an archival date from `updatedat`
- [ ] Per SCOPE-117 the DDL is reviewed and applied by hand, recorded in the schema-change log, and `npm run db:drift` passes — and per `reference_drop_column_ordering` the columns are declared in `src/db/schema/` only **after** they exist in the database

### FR-009 — Daily archival sweep job
A new `src/server/jobs/subscriptionArchivalJob.ts` following the `infraHealthJob` start/stop pattern, wired in `src/server/index.ts`. It MUST NOT use `jobScheduler` — that is in-memory `setTimeout`/`setInterval` and dies on every App Runner redeploy, so a 30-day timer registered there would never fire.
**Acceptance:**
- [ ] Runs on a daily interval and is idempotent — a second run the same day archives nothing twice
- [ ] Modes `off` (default) / `dryrun` / `on` via `SUBSCRIPTION_ARCHIVAL_ENABLED`
- [ ] A per-run cap bounds the blast radius of a bad selection
- [ ] Each company is archived in a single transaction; a partial archival is impossible
- [ ] One line is logged at boot naming the active mode (FR-014)
- [ ] Mode `on` is not set in production until the SOC 2 **P1.1** sign-off on the FR-012 / FR-018 scrub field lists is recorded — see Compliance Context

### FR-010 — Transfer projects and project-scoped data
At day 30 the sweep MUST re-point the company's projects to the archive company and owner:
- Archive company: `019d4ff7-527e-7627-92a0-13eaf5e16ee8` (HAS Enterprises LLC) — verified live, `CONSULTANT`, `maxusers` 999, currently 1 project / 2 users
- Archive owner: `019d4ff7-52b5-724d-b0ad-b37f5c331199` (andy@ccscowboy.com, "Howard") — verified live, `usertype = ADMIN`, active, a member of that company. An ADMIN was chosen deliberately: a transferred project must land with an owner who can actually administer it, which the company's other member (a `TEAM_MANAGER`) could not.

`companyprojects.companyid` and `.userid` are re-pointed. Tables keyed only by `projectid` — roughly 45 of them, including `projecttasks`, `projectphases`, `notes`, `testplans`, `taskfences` — follow automatically and MUST NOT be rewritten. Tables carrying `companyid` *and* `projectid` MUST be re-pointed explicitly: `projecttimeentries`, `projectproposals`, `aispecsessions`, `overviewdrafts`, `feedbacksubmissions`.
**Acceptance:**
- [ ] Every transferred project is visible and usable under the archive company
- [ ] No orphan remains: no `projectid` resolves to a project outside the archive company
- [ ] The target IDs are configuration, not literals compiled into the job
- [ ] The job aborts without writing if either target does not resolve at run time

### FR-011 — Company-scoped data stays with the departing company
These MUST NOT be transferred: `companysubscriptions`, `companyauditlogs`, `company_status_history`, `company_analytics`, `companystackprofiles`, `companythemeprofiles`, `notificationsettings`, `userinvitations`, `customers`, `externalconnections`, `importcache`, `credentialauditlogs`, `subscriptiondutytype`, `themeblocks`, `themetemplates`, `campaigns`, `campaignposts`, `marketingassets`, `marketingbanners`, `marketingleads`, `marketinglinks`. `projectinvoices` also stays, and is additionally scrubbed — see FR-018.
**Rationale:** transferring billing history, audit logs or marketing consent would attribute one company's records — and one company's opt-ins — to another.
**Acceptance:**
- [ ] After archival these rows still reference the original company id
- [ ] `companyauditlogs`, `company_status_history` and `credentialauditlogs` are **not modified at all** — not transferred, not scrubbed, not pruned. SOC 2 CC7.2 requires a durable audit store the acting party cannot alter, and the archival job is an acting party
- [ ] The audit trail for the departed company is complete and readable after archival
- [ ] No marketing contact or consent record changes owner

### FR-012 — Scrub, never delete
The departing company row and its user rows MUST be anonymized in place. No row is deleted anywhere in this scope.
**Rationale:** the departing company remains the FK target of `companyauditlogs`, `companysubscriptions` and `company_status_history`, and its users remain the FK target of `projecttimeentries.userid`, `projectusers`, `projectteam` and `dutyassignment` on the *transferred* projects. Deleting either would either cascade the audit trail away or strand the transferred work.
**Acceptance:**
- [ ] Company `name`, `contactemail`, `address`, `phone`, `billingemail`, `logourl` carry no recoverable PII
- [ ] User `emailaddr`, `fullname`, `avatarurl`, `pendingemail` carry no recoverable PII, and `active = false`
- [ ] User **credentials are destroyed, not merely anonymized**: `password` is overwritten with an unusable value, and `clientid` / `clientsecret` are nulled. A scrubbed account must not be sign-in-able by anyone, including whoever held the original password
- [ ] `payrate`, `payratemethod` and `dashboardconfig` are cleared — commercially sensitive and of no further use
- [ ] `contactemail`, `referralcode` (companies) and `emailaddr` (userprofiles) are unique-constrained, so scrubbed values must be deterministic and collision-free — derive them from the row id rather than using a shared literal, or the second archival of the day fails on a duplicate key
- [ ] Any live `sessions` rows for the scrubbed users are invalidated, so an open session cannot outlive the scrub
- [ ] Every FK in all 77 company/project/user-keyed tables still resolves after archival
- [ ] `archivedat` is stamped, and the company can never be archived twice

### FR-013 — Users inactive at effective cancellation, one ADMIN exempt
When the cancellation takes effect at period end (FR-005) — **not** when the ADMIN clicks cancel — all of the company's users MUST be set `active = false` **except one ADMIN**, who stays active. The timing was decided explicitly: deactivation waits for the end of the paid period.
**Rationale:** two reasons, both load-bearing. First, deactivating at the click would strip seats the customer has already paid for, contradicting the whole point of cancelling at period end. Second, `userprofiles.active = true` is the filter both `StripeWebhookHandler.ts:397` and `SubscriptionRecoveryService.ts:341` use to find someone to email — deactivating everyone would make the company uncontactable about its own cancellation, and would trip `CompanyInvariants.assertCompanyHasAtLeastOneAdmin`, which throws on zero active ADMINs.
**Acceptance:**
- [ ] Exactly one ADMIN remains active between effective cancellation and archival
- [ ] That ADMIN can sign in, reach the wall, and resubscribe
- [ ] `assertCompanyHasAtLeastOneAdmin` is satisfied throughout
- [ ] Seat counts (`TierEnforcementService`) reflect the deactivation
- [ ] At archival the last ADMIN is deactivated too, and `CompanyInvariants` is not invoked on an already-archived company

### FR-014 — A disarmed destructive job must announce itself
On boot the job MUST log one line naming its mode, and the SYSADMIN panel MUST show the pending-archival queue with each company's `cancelledat` and computed archival date.
**Rationale:** this project has shipped a subscription gate off, a welcome message inert, and a compliance context that loaded for nobody. A destructive job defaulting to `off` needs a standing counterweight, and the same requirement in SCOPE-128 (FR-027) exists for the same reason. **This is not log noise — do not trim it.**
**Acceptance:**
- [ ] One boot line states the mode
- [ ] The SYSADMIN queue lists pending archivals, the 4 legacy `cancelledat IS NULL` companies, and the last run's outcome

### FR-015 — Cancellation and pre-archival emails
An email on cancellation (effective date + how to reverse) and one warning 7 days before archival (what moves, and the resubscribe link), reusing `emailTemplates.ts` and the `emailQueue` job.
**Acceptance:**
- [ ] Exactly one of each per company; the warning is not re-sent on subsequent sweeps
- [ ] Email failure never blocks the webhook or the transaction
- [ ] Both are sent to the surviving active ADMIN (FR-013)

### FR-016 — Audit every transition
Suspend, resume, cancel, un-cancel, effective cancellation and archival MUST each write a `company_status_history` row with actor attribution; archival additionally records a manifest of what moved.
**Acceptance:**
- [ ] Every transition is attributable to an actor, with `changedByType` distinguishing `CUSTOMER` from `SYSADMIN` from `SYSTEM`
- [ ] The archival row names the target company, target owner, and per-table row counts
- [ ] `company_status_history` is underscore-named — the documented exception to the house convention — and that is not "corrected"

### FR-017 — Panel UI
Extend `BillingSubscriptionPanel.tsx` with a suspend/cancel block, admin-only, rendering the current state: active, paused, or cancellation-pending-with-date. Cancel uses a typed-confirmation dialog per SCOPE-023 D.6.
**Acceptance:**
- [ ] Controls are hidden, not disabled, for non-ADMIN and `billingexempt`
- [ ] Destructive actions are visually distinct and cancel requires the typed company name
- [ ] Every state re-fetches after mutation; loading and error states are handled
- [ ] Built with shadcn components per `_wxAI/rules/shadcn.md`, and all copy is i18n-keyed across the 6 supported languages

### FR-018 — Invoices are scrubbed in place, and detached from their transferred project
`projectinvoices` rows MUST stay with the departing company (never transferred) and MUST be anonymized at archival. The identity fields `clientemail`, `billedto`, `description` and `downloadurl` are scrubbed; the financial record — `invoicenumber`, `totalamount`, `hoursworked`, `generatedat`, `createdat` — is preserved. `projectid` MUST be set to NULL.
**Rationale:** the invoice belongs to the company that raised it, so transferring it would post one company's revenue as another's. But its `projectid` points at a project that has just moved to the archive company, leaving a row owned by company A referencing a project owned by company B — a cross-tenant join of exactly the kind SCOPE-043 was opened for. `projectinvoices.projectid` is nullable, so severing it is clean; `companyid` is `NOT NULL`, which is why the row must stay rather than be orphaned.
**Acceptance:**
- [ ] After archival no `projectinvoices` row references a project belonging to a different company
- [ ] Totals and invoice numbers are unchanged — the financial history remains auditable in aggregate
- [ ] `clientemail`, `billedto`, `description`, `downloadurl` carry no recoverable PII
- [ ] Any stored PDF behind `downloadurl` is dealt with too; scrubbing the column while leaving a retrievable rendered invoice defeats the requirement
- [ ] The 4 companies covered by FR-019 hold **0** invoices between them, so the first armed run exercises this path against no data — it MUST be tested against a seeded fixture, not assumed

### FR-019 — One-time backfill of the 4 pre-existing CANCELED companies
`cancelledat` MUST be backfilled for the four companies already in `CANCELED`, so they archive under the normal rule rather than sitting indefinitely:

| Company | Id | Evidence | Projects / Users / Invoices |
| --- | --- | --- | --- |
| CPC | `019ee07e-0113-74b0-909e-6f20181bcbdf` | `updatedat` 2026-06-19 | 0 / 1 / 0 |
| McM Tech Solutions | `01a01abf-94b4-774e-89a0-dded7f780eb4` | `updatedat` 2026-08-19 | 1 / 1 / 0 |
| MIRALTEC INFORMÁTICA, S.L.L. | `019f3b5a-091b-77ad-83b2-a0154a97a812` | `updatedat` 2026-08-27 | 4 / 1 / 0 |
| JCA Software | `019f2aed-e170-708c-9915-9a1e426e8e62` | `updatedat` 2026-08-27 | 2 / 1 / 0 |

All four are already more than 30 days past those dates, so they become archival-eligible the moment the sweep is armed. The backfill MUST therefore be applied and reviewed **before** the sweep is ever set to `on`, and a `dryrun` pass over exactly these four is the acceptance evidence.
**Rationale:** `updatedat` is the only date available, and it is weak evidence — any unrelated row update would have moved it. It is being accepted as good enough for these four specific rows by explicit decision, which is precisely why the backfill is a one-time reviewed statement and not a rule the job applies. FR-008's null-skip stays absolute so this never becomes precedent.
**Acceptance:**
- [ ] Applied by hand as reviewed SQL per SCOPE-117, recorded in `specs/117-production-schema-integrity/schema-change-log.md` with the rationale
- [ ] Exactly 4 rows updated — the statement is keyed on those four ids, never on `subscriptionstatus`
- [ ] `activeflag` is inconsistent across them (2 true, 2 false) and the backfill does not attempt to normalize it
- [ ] A `dryrun` sweep afterwards names all four, their 7 projects, and their 4 users, and moves nothing
- [ ] Their 4 users are still `active`, so FR-013's deactivation never ran for them — archival must handle a company that skipped the deactivation step

---

## Success Metrics

1. A customer can cancel without contacting support in **under 60 seconds**, in **0** support tickets.
2. **100%** of cancelling customers retain full access until their paid period ends — measured as zero wall events on a company whose `cancelrequestedat` is set but whose period has not elapsed.
3. The archival sweep processes **100%** of companies whose `cancelledat` is more than 30 days old, and **0%** of those where it is null — verified by a `dryrun` naming exactly the 4 backfilled companies, their 7 projects and their 4 users, and moving nothing.
4. **0** rows deleted and **0** broken foreign keys across all 77 company/project/user-keyed tables after an archival, verified by a post-run integrity check.
5. **100%** of transferred projects are reachable under the archive company, with **0** orphaned `projectid` references.
6. Involuntary churn — companies reaching `CANCELED` via dunning rather than a deliberate click — falls measurably within 2 billing cycles of release, against the current baseline of 2 companies in `PENDING_INACTIVE`.
7. **0** PII fields recoverable on an archived company, its users, or its invoices, confirmed by direct query — and **0** scrubbed accounts that can still authenticate, confirmed by attempting a sign-in with the pre-scrub password.
8. **0** cross-tenant references after an archival: no `projectinvoices` row points at a project owned by another company.

---

## Scope Boundary

In scope: self-serve suspend (`pause_collection`) and resume; self-serve cancel (`cancel_at_period_end`) and un-cancel; the `PAUSED` status and its access decision; typed-confirmation cancel; the four new timestamp columns; user deactivation at period end with one-ADMIN exemption; the daily archival sweep, env-gated with dry-run and a per-run cap; transfer of projects and project-scoped data to the archive company under an ADMIN owner; anonymization of the departing company, its users and their credentials; in-place scrubbing of `projectinvoices` with `projectid` severed; the one-time `cancelledat` backfill for the 4 pre-existing `CANCELED` companies; cancellation and pre-archival emails; audit rows for every transition; SYSADMIN visibility of the pending queue.

## Out of Scope

Excluded: plan upgrade / downgrade and proration (SCOPE-023 D.1–D.3); refunds; recovery from a dunning-initiated Stripe cancellation, which is a separate defect with its own trap (`reference_paid_after_dunning_cancel_trap`) and needs its own scope; multiple concurrent subscriptions per company; hard deletion of any row; a customer-facing data-export or GDPR-erasure surface; arming the sweep in production, which is a separate operational decision after a dry-run review over the FR-019 four; reconciling the sysadmin-side `deleteCompany()` path (see Open Questions); changing how subscriptions are first created (SCOPE-023 Chunks B / H).

---

## Data Requirements

New columns on `companies` (all nullable `timestamp`): `cancelrequestedat`, `cancelledat`, `pausedat`, `archivedat`.

New `subscriptionstatus` value: `PAUSED`. Existing values observed live: `ACTIVE` (47), `CANCELED` (4), `PENDING_INACTIVE` (2), `PENDING` (1), `SUSPENDED` (1). Note `CANCELLED` (two L) does not occur in production despite being what the UI and `deleteCompany()` write — any read must accept both.

Transfer targets, held as configuration:

| Target | Value | Verified |
| --- | --- | --- |
| Archive company | `019d4ff7-527e-7627-92a0-13eaf5e16ee8` — HAS Enterprises LLC | live; `CONSULTANT`, `ACTIVE`, `maxusers` 999, 1 project / 2 users |
| Archive owner | `019d4ff7-52b5-724d-b0ad-b37f5c331199` — `andy@ccscowboy.com` ("Howard") | live; member of the above; `usertype = ADMIN`, active — chosen over the company's `TEAM_MANAGER` so transferred projects land with an owner who can administer them |

Re-pointed on transfer: `companyprojects` (`companyid`, `userid`), then `projecttimeentries`, `projectproposals`, `aispecsessions`, `overviewdrafts`, `feedbacksubmissions` (all carry `companyid` alongside `projectid`).

Scrubbed in place rather than transferred: `projectinvoices` — identity columns `clientemail`, `billedto`, `description`, `downloadurl` cleared, financial columns `invoicenumber`, `totalamount`, `hoursworked`, `generatedat` preserved, `projectid` set to NULL (it is nullable; `companyid` is `NOT NULL`). See FR-018.

Scrub surface on `userprofiles`, which is wider than PII alone: `emailaddr`, `fullname`, `avatarurl`, `pendingemail` (identity); `password`, `clientid`, `clientsecret` (**credentials — destroyed, not anonymized**); `payrate`, `payratemethod`, `dashboardconfig` (commercially sensitive). Plus invalidation of any live `sessions` rows.

Following automatically via `projectid`, and explicitly **not** rewritten: `projecttasks`, `projecttasknotes`, `projectphases`, `projectdocuments`, `projectspecifications`, `projectteam`, `projectusers`, `projectthemes`, `projectkits`, `projectlicenses`, `projectprofilexref`, `notes`, `events`, `testplans`, `testplanitems`, `testruns`, `testcycles`, `testitemsubjects`, `taskfences`, `taskfencehistory`, `taskfenceslegacy`, `scopedependencies`, `capabilityindex`, `phasetransitionlogs`, `dutyassignment`, `teamprojectduty`, `engagementassignments`, `aiproposals`, `complianceoverride`, `appauditconfiguration`, `mcpapitokens`, `mcpdriftevents`, `mcprequestaudit`, `mcpupdateadoptions`, `projectkitfiles`, `timeEntry`.

Never transferred — see FR-011 for the full list, headed by `companysubscriptions`, `companyauditlogs`, `company_status_history` and every `marketing*` table.

Per SCOPE-117: DDL is reviewed and applied by hand, logged in `specs/117-production-schema-integrity/schema-change-log.md`, verified with `npm run db:drift`. `drizzle-kit push` is prohibited against this database. Schema declarations land only after the columns exist.

## API Routes

| Method | Route | Notes |
| --- | --- | --- |
| DELETE | `/api/company/subscription` | Cancel at period end; admin-only; `{ confirmName }` required (SCOPE-023 D.4) |
| POST | `/api/company/subscription/resume` | Un-cancel while pending |
| POST | `/api/company/subscription/pause` | Suspend via `pause_collection` |
| POST | `/api/company/subscription/unpause` | Resume from paused |
| GET | `/api/company/subscription` | **Exists** — extend with pause/cancel state and effective date |
| GET | `/api/sysadmin/archival-queue` | Pending archivals, legacy null-`cancelledat` rows, last run outcome |

All four mutating routes are `authenticateToken` + `requireAuth` + `requireAdmin`, and all four must stay reachable for a walled company — `/api/payment` is already exempt in `requireActiveSubscription.EXEMPT_PREFIXES`, but `/api/company` is **not**, so the exemption list must be extended or these routes relocated under `/api/payment`.

## Frontend Components

| Component | Path | Notes |
| --- | --- | --- |
| `BillingSubscriptionPanel` | `src/client/components/billing/BillingSubscriptionPanel.tsx` | **Extend** — add the suspend/cancel block and the three states |
| `CancelSubscriptionDialog` | `src/client/components/billing/CancelSubscriptionDialog.tsx` | New — typed-confirmation dialog |
| `ArchivalQueuePanel` | `src/client/pages/SysAdmin/` | New — pending-archival visibility (FR-014) |
| Subscription wall | `src/client/components/ProtectedRoute.tsx` | **Extend** — paused-specific copy for the new `evaluateAccess` mode |

`SubscriptionManagementPanel.tsx`, named in SCOPE-023 D.6, was never created. This scope extends the panel that actually shipped rather than introducing a second one.

## Compliance Context — SOC 2

SOC 2 is the only framework enabled on this project (`project.get_audit_config`: `activeFrameworks: ["SOC2"]`, `complianceActive: true`). Five Design-phase controls bear on this scope:

| Control | Requirement | Where it lands |
| --- | --- | --- |
| **CC7.2** — Audit trail of all changes | Every state-changing action records who, what and when, **in a store separate from the record being changed** | FR-016 writes `company_status_history` for all six transitions; FR-011 forbids the job from touching any audit table |
| **CC7.2** — Audit logging for all system access | A durable audit store the acting user cannot alter | FR-011: the archival job may not modify `companyauditlogs`, `company_status_history` or `credentialauditlogs` |
| **CC6.3** — Principle of least privilege | Every privileged route gated by an explicit role guard, not an assumption that an authenticated caller is entitled | FR-002, FR-006, FR-017: all four mutating routes are `requireAdmin`; the client hiding controls is UX, not the control |
| **P1.1** — Privacy officer sign-off for PII handling | A named accountable person approves new personal-data handling | **New obligation this scope creates.** Anonymizing customer PII and destroying credentials is new personal-data handling, so the archival sweep MUST NOT be armed (`SUBSCRIPTION_ARCHIVAL_ENABLED=on`) until a named person has approved the scrub field list in FR-012 and FR-018. The approval is recorded alongside the FR-019 backfill in the schema-change log |
| **CC8.1** — Change management | Every production change traces to a tracked item recording what changed, why, and who approved it | FR-008 and FR-019 require reviewed, hand-applied DDL recorded in `specs/117-production-schema-integrity/schema-change-log.md` |

**CC5.2 (separation of duties — no single identity both authors and approves the same change)** cannot be satisfied as written on a single-operator project. It is recorded here as a known, accepted exception rather than silently omitted, because the FR-019 backfill and the arming of a destructive sweep are exactly the changes that control exists to catch. The compensating control is the mandatory `dryrun` review in FR-009 and FR-019: the job states what it will do, and a human reads that output before anything moves.

## Integration Context

This scope must align with three existing decisions rather than re-litigating them. SCOPE-090 Amendment A owns `evaluateAccess`; adding `PAUSED` means editing that shared module, and its allow-list posture — unknown statuses block — must survive. SCOPE-067 owns `PENDING_INACTIVE` and the recovery loop; a deliberate cancellation must not be confused with a failed card, and the two paths must not both email the same customer. SCOPE-023 owns subscription creation and the Stripe dashboard configuration, including "leave *Cancel subscriptions* OFF" — which this scope finally makes true by putting cancel in our UI. SCOPE-126 (customer data sovereignty / audit readiness) constrains what may be destroyed, and FR-012's no-deletion rule is written to satisfy it.

---

## Open Questions

1. **Should `deleteCompany()` be reconciled or left alone?** It writes `CANCELLED` (two L, which production never contains) and an unread `retentionDate`. Once `cancelledat` exists, the operator path should arguably stamp it so a sysadmin-initiated cancellation archives on the same 30-day rule. That widens this scope into the sysadmin surface — currently excluded, confirm before including.
2. **Is 30 days the right window, and is it configurable?** It is currently a default argument (`retentionDays = 30`) on a function nothing calls. Fixed constant, env var, or per-company override?
3. **Does a resubscribe after archival restore anything?** Once projects have moved and the users are scrubbed, a returning customer effectively starts fresh. Is that acceptable, or is a reclaim path needed within some further window?

### Resolved (2026-09-21)

- **Archival model** — scrub and transfer, not delete. No row is deleted anywhere (FR-010, FR-012).
- **Cancel timing** — `cancel_at_period_end: true`; the customer keeps the paid period and can reverse it (FR-003, FR-004).
- **User deactivation** — at the end of the paid period, not at the click; one ADMIN stays active (FR-013).
- **Suspend semantics** — Stripe `pause_collection`, with a new `PAUSED` status that is walled but never archived (FR-006, FR-007).
- **Invoices** — stay with the departing company and are scrubbed in place, with `projectid` severed (FR-018).
- **Archive owner** — the archive company's ADMIN, `019d4ff7-52b5-724d-b0ad-b37f5c331199`, not its TEAM_MANAGER (FR-010).
- **The 4 pre-existing `CANCELED` companies** — backfill `cancelledat` once, by reviewed hand-applied SQL, then let them archive normally (FR-019).

---

## Notes

The cancel half of this scope is not new work: SCOPE-023 Chunk D specified `DELETE /api/company/subscription` and the panel in April 2026 and shipped neither, leaving `stripe.cancelSubscription()` correct but uncalled and `PaymentService.cancelSubscription()` a stub that logs its own absence. This scope should be read as completing Chunk D and adding the two genuinely new halves — suspend via `pause_collection`, and an archival window that is actually enforced.

The most dangerous requirement here is FR-009 plus FR-010: an unattended job that rewrites ownership of customer data. It ships `off`, runs `dryrun` before it ever runs `on`, works one transaction per company, caps its own blast radius, and refuses to act on any row whose `cancelledat` is null.

That last rule is the one to defend under pressure. The four rows already sitting in `CANCELED` make the alternative concrete: under any `updatedat`-based heuristic they would all have been archived on the sweep's first run, without review, because `updatedat` last moved between June and August. FR-019 backfills those four deliberately and by hand so they *do* archive — but the job still learns nothing about inferring dates. The order matters: backfill, review a `dryrun` over exactly those four, and only then arm the sweep.
