# Tasks: Self-Serve Subscription Suspend & Cancel (SPEC-131)

Umbrella scope: `specs/Project-Scope/130-subscription-cancellation-and-data-archival.md`
Spec: `specs/131-selfserve-suspend-cancel/spec.md`
Created 2026-09-21 by `createSpecs` (SCOPE-130 fan-out). DB spec id `891a7cad-e4c0-46cc-9014-d0b8dfc67853`.

Fence label for this spec's code is `[SCOPE 131 / Tnnn]` — fences follow the SPEC folder,
not the umbrella scope. Fences are written by `implement`, never by hand.

**Prerequisite CLEARED 2026-09-22.** SPEC-132 T001 (the four `companies` timestamp columns)
was hand-applied to production and verified against `information_schema.columns`; T002 declared
them in `schema/company.ts` and a live drizzle select confirmed the declaration matches.

**Implemented 2026-09-22.** All sixteen tasks are written and fenced `[SCOPE 131 / Tnnn]`.
Server and client both build; 31 unit assertions and 10 live endpoint checks pass.
**Nothing is committed and nothing is pushed.** See T016 for what is still untested.

| # | Task | Priority | Status | FRs |
|---|------|----------|--------|-----|
| T001 | Replace the `cancelSubscription` stub with a real Stripe call | high | **done** | FR-001 |
| T002 | `DELETE /api/company/subscription` with typed confirmation | high | **done** | FR-002 |
| T003 | Record cancellation as pending — never write `CANCELLED` on the click | critical | **done** | FR-003 |
| T004 | `POST /api/company/subscription/resume` — un-cancel while pending | high | **done** | FR-004 |
| T005 | Period-end webhook: set `CANCELLED` and stamp `cancelledat` | critical | **done** | FR-005 |
| T006 | `POST pause` / `unpause` via Stripe `pause_collection` | high | **done** | FR-006 |
| T007 | Add `PAUSED` to `evaluateAccess` with its own mode | high | **done** | FR-007 |
| T008 | Extend `GET /api/company/subscription` with pause and cancel state | medium | **done** | FR-011 |
| T009 | Keep the repair surface reachable — extend `EXEMPT_PREFIXES` | high | **done** | FR-008 |
| T010 | `BillingSubscriptionPanel` — suspend/cancel block with three states | high | **done** | FR-011 |
| T011 | `CancelSubscriptionDialog` with typed confirmation | high | **done** | FR-011 |
| T012 | `ProtectedRoute` — paused-specific wall copy | medium | **done** | FR-007 |
| T013 | i18n keys for all new billing copy across 6 locales | medium | **done** | FR-011 |
| T014 | Cancellation confirmation email | medium | **done** | FR-009 |
| T015 | Audit rows for all five customer-initiated transitions | high | **done** | FR-010 |
| T016 | Endpoint-test every failure path, not just the happy path | high | **partial — Tier 1 green** | FR-001…FR-008 |
| T017 | Operator-initiated cancel / un-cancel from the SYSADMIN company list | high | **done** | Amendment C |

---

## T001 — Replace the cancel stub with a real Stripe call
`PaymentService.cancelSubscription()` (`src/server/services/PaymentService.ts:727`) logs
`"Subscription cancellation not yet implemented"` and returns without touching Stripe. Resolve
`companysubscriptions.stripesubscriptionid` and call `stripe.cancelSubscription()`
(`src/server/lib/stripe.ts:406`) — which already does the right thing and has **no caller**.
409 when no Stripe subscription exists. A Stripe failure propagates and writes nothing locally.

## T002 — `DELETE /api/company/subscription`
Implements SCOPE-023 **D.4**, specified 2026-04-29 and never built. Admin-only. Body carries
`{ confirmName: '<companyname>' }`; a mismatch returns 400 **before** Stripe is contacted.
Non-ADMIN 403, `billingexempt` 409. Response carries the effective date.

## T003 — Cancellation is pending, not applied
Record `companies.cancelrequestedat` plus Stripe's `cancel_at`; leave `subscriptionstatus` alone.
`evaluateAccess` allow-lists only `ACTIVE`/`TRIAL` and the client wall in `ProtectedRoute.tsx`
runs it **unconditionally, with no env flag** — so writing `CANCELLED` here walls a customer for
days they have already paid for while Stripe keeps billing them. This is the task most likely to
be "simplified" into a bug.

## T004 — Un-cancel while pending
Clear `cancel_at_period_end` in Stripe and clear the local markers. Offered only while pending.
No new subscription, no proration. This is the safety valve that makes cancelling low-risk.

## T005 — Period-end webhook stamps the clock
On `customer.subscription.deleted` for a customer-initiated cancellation, set
`subscriptionstatus = 'CANCELLED'` and stamp `cancelledat = now`. This stamp is the **only**
signal SPEC-132 acts on: set it exactly once, and clear it on a resubscribe. Accept **both**
`CANCELED` and `CANCELLED` wherever status is read — production contains only the one-L form
while the UI and `deleteCompany()` write two, and SCOPE-067 FR-002 promised to standardize this
and did not.

## T006 — Suspend via `pause_collection`
`pause_collection: { behavior: 'void' }`; set `PAUSED` and `pausedat`. Unpause clears it and
returns to `ACTIVE` on the **same** subscription with no double charge. Also map
`customer.subscription.updated` carrying `pause_collection`, so a pause applied from the Stripe
dashboard is not lost. `pause_collection` appears nowhere in `src/` today.

## T007 — `PAUSED` in `evaluateAccess`
`PAUSED` must **not** join `UNRESTRICTED_STATUSES` in `src/shared/subscription-policy.ts`. Return
a distinct mode so the wall offers *resume* rather than a plan picker. Preserve deny-by-default:
an unknown status must still block. Guarantee no path can stamp `cancelledat` on a paused company.

## T008 — Extend the subscription summary endpoint
`GET /api/company/subscription` exists at `src/server/routes/company.ts:203` and returns
read-only summary data. Add pause state, pending-cancellation state and the effective date so the
panel renders three states without a second call.

## T009 — Keep the repair surface reachable
`requireActiveSubscription.EXEMPT_PREFIXES` exempts `/api/payment` but **not** `/api/company`.
Adding cancel/pause under `/api/company/subscription` without extending that list makes the
controls unreachable exactly when a walled company needs them. Add them explicitly, with a
comment naming why.

## T010 — The panel
Extend `src/client/components/billing/BillingSubscriptionPanel.tsx` — the panel that actually
shipped. (`SubscriptionManagementPanel.tsx`, the name SCOPE-023 D.6 used, was never created; do
not introduce a second panel.) Admin-only block rendering active / paused /
cancellation-pending-with-date. Controls **hidden**, not disabled, for non-ADMIN and
`billingexempt`. Re-fetch after every mutation. shadcn per `_wxAI/rules/shadcn.md`.

## T011 — Typed-confirmation dialog
New `src/client/components/billing/CancelSubscriptionDialog.tsx`. The destructive action stays
disabled until the typed company name matches, mirroring the server check in T002.

## T012 — Paused wall copy
The wall routes blocked companies to a plan picker. A paused company needs copy naming the pause
and offering resume, driven by the new access mode — not by a status string compared inside the
component.

## T013 — i18n
Every string added by this spec is i18n-keyed and translated across the 6 supported languages,
including the T014 email. No hardcoded English in panel, dialog or wall.

## T014 — Cancellation confirmation email
Effective date plus how to reverse it, to the active ADMIN, reusing `emailTemplates.ts` and the
`emailQueue` job. Exactly one per cancellation. Email failure must never block the route or leave
Stripe and the database disagreeing.

## T015 — Audit the five transitions
Suspend, resume, cancel, un-cancel and effective cancellation each write a
`company_status_history` row, with `changedByType` distinguishing `CUSTOMER` from `SYSTEM`
(webhook) from `SYSADMIN`. Satisfies SOC 2 **CC7.2** — the record lives in a table separate from
the row being changed. `company_status_history` is underscore-named, the documented exception to
the house convention; do not "correct" it.

## T016 — Endpoint-test the failure paths
A green unit run plus a green build has shipped fatal bugs on this project before, so each path is
exercised against a live endpoint: Stripe failure writes nothing locally; wrong or missing
`confirmName` sends nothing to Stripe; non-ADMIN 403; `billingexempt` 409; a walled ADMIN can
still reach all four routes; pause-then-resume leaves no `cancelledat`.

## T017 — Operator-initiated cancel / un-cancel (Amendment C)
Add **Cancel subscription** to the company list at `/sysadmin/dashboard`, so a SYSADMIN can
cancel on a company's behalf. Reuses the engine rather than adding a second one.

- `requestCancellation` / `reverseCancellation` take `actor: TransitionActor = "CUSTOMER"`.
  Both hardcoded `CUSTOMER`; an operator action recorded as customer-initiated would make
  `changedByType` wrong, which is the exact thing FR-010 exists to prevent.
- `POST /api/sysadmin/companies/:id/cancel-subscription` — body `{ confirmName }`, same typed-name
  gate as FR-002, re-checked server-side before Stripe. SYSADMIN-gated by the router.
- `POST /api/sysadmin/companies/:id/resume-subscription` — the un-cancel, shipped alongside for the
  reason FR-004 gives: otherwise a mis-click is only fixable in the database.
- `CancelSubscriptionDialog` gains an optional `copy` prop. The defaults address the customer
  ("You keep full access until…"), which is wrong on an operator's screen. Omitted keys fall back,
  so the panel caller is untouched.
- Distinct from the row's existing **Suspend** and **Delete**, which change local status and never
  call Stripe. That divergence is what SCOPE-130 exists to close, not to widen.

**Found on the way:** `src/client/pages/SysAdmin/Companies.tsx` is dead code — nothing imports it,
it is in no bundle, and it carries SCOPE-085's "Recheck Stripe" button, which has therefore never
shipped. Left untouched; recorded in Amendment C.6 as a finding.

**Verified:** both routes mounted and SYSADMIN-gated over real HTTP (14 passed / 0 failed);
button, undo and dialog copy present in the built client bundle; unit suite unchanged.
**Not verified** (needs Stripe test keys, listed in T016's untested set): that a real operator
cancel writes `changedByType=SYSADMIN`, that the button hides once a cancellation is pending,
and that undo clears `cancelrequestedat`.
