# Tasks: Registration Activation Race (Spec 090)

Spec ID: e336c37c-d60a-4e5a-a1c4-4e6428c7bc4f · 13 tasks

| # | Task | Priority | Status | FRs | Task ID |
|---|------|----------|--------|-----|---------|
| T001 | Inline fail-open reconcile after registration subscription insert | high | done | FR-001, FR-002 | 5389c3fb-5591-44ff-aee6-9f11ddc3164b |
| T002 | Verify idempotency + audit on inline reconcile path | high | done | FR-003, FR-004 | d9f8b54e-407e-4461-b9a7-43ab2024bed8 |
| T003 | Enrich webhook unknown-subscription warn record for activation events | medium | done | FR-005 | b783bba0-3630-4906-87a6-a6fd37c566ee |
| T004 | Tests: registration activation, fail-open, idempotency, no-false-activate, dropped-event log | high | done | FR-001–FR-005 | f9644ad6-37ef-486e-b38b-f37c694b23db |
| T005 | Shared subscription access policy module | high | pending | FR-006 | |
| T006 | Auth payload: billingexempt + company admin email | high | pending | FR-010 | |
| T007 | Subscription wall page with inline plan picker and Stripe | high | pending | FR-008 | |
| T008 | Route guard redirect and wall route registration | high | pending | FR-007 | |
| T009 | Server-side enforcement middleware, flag-gated | high | pending | FR-009 | |
| T010 | MCP entitlement exempt set, message wording, configurable remediation URL | medium | pending | FR-011, FR-012 | |
| T011 | Kit-wide remediation URL sweep | low | pending | FR-012 | |
| T012 | Remove skip-payment-for-now action from registration | medium | pending | FR-013 | |
| T013 | Tests: policy truth table, MCP mirror, wall routing | high | pending | FR-006–FR-013 | |

## T001 — Inline fail-open reconcile after registration subscription insert
In `src/server/services/RegistrationService.ts`, immediately after the `hasStripeSubscription` block inserts the `companysubscriptions` row (~line 390), add a fail-open call to `resyncSubscriptionFromStripe(companyId)` wrapped in `try/catch` that logs and swallows any error. By registration time the invoice is paid, so Stripe reports `active` and the reconcile flips PENDING → ACTIVE (+ `companysubscriptions.status` and period end). Keep the `status: "incomplete"` insert and the webhook comment.

## T002 — Verify idempotency + audit on inline reconcile path
Confirm `resyncSubscriptionFromStripe`'s `companyChanged`/`subChanged` guards make the registration reconcile a no-op (and write no `company_status_history` row) when the company is already ACTIVE, and that a genuine activation writes exactly one audit row with previous/new/reason/changedByType/stripeStatus. Adjust `changedBy` handling for the system-initiated call.

## T003 — Enrich webhook unknown-subscription warn record for activation events
In `src/server/services/StripeWebhookHandler.ts` `handleStripeEvent`, when `resolveCompanySubscription` returns null for an activation-relevant event (invoice.paid, invoice.payment_succeeded, customer.subscription.created/updated), emit a structured warn including event type, `stripeeventid`, customer id and (where extractable) subscription id, instead of the generic skip log.

## T004 — Tests
Add unit/integration tests covering: (a) paid signup reaches ACTIVE at end of registration with no webhook; (b) a simulated Stripe error leaves registration successful and company PENDING; (c) already-ACTIVE company gets no duplicate `company_status_history` row; (d) incomplete subscription is not activated; (e) an activation event with no matching row emits the structured warn record.

---

# Amendment A — Subscription Access Gate

## T005 — Shared subscription access policy module
New `src/shared/subscriptionPolicy.ts`. Pure, dependency-free `evaluateAccess({ subscriptionstatus, activeflag, billingexempt, usertype })` returning `{ allowed, mode }` with `mode` in `ok | pick-plan | update-card | contact-admin`. Order: billingexempt or SYSADMIN wins first, then ACTIVE/TRIAL with `activeflag !== false`, then non-ADMIN short-circuits to `contact-admin`, then PENDING_INACTIVE to `update-card`, else `pick-plan`. Importable from both client and server; no React, no DB, no env.

## T006 — Auth payload: billingexempt + company admin email
Add `billingexempt` and `companyadminemail` to the authenticated-user payload the client reads (`/auth/me` and the login/register responses that hydrate `AuthContext`), plus the `AuthUser` interface in `src/client/context/AuthContext.tsx`. Without these the wall cannot distinguish an exempt internal account from a delinquent one, and cannot name an admin in `contact-admin` mode. Do NOT add them to the JWT — they are lookup-time facts and the JWT already carries stale-status risk.

## T007 — Subscription wall page
New `src/client/pages/SubscriptionRequiredPage.tsx` at `/subscription-required`. `pick-plan`: tier picker pre-selected to the company's current `billingplan`, then the existing `StripePaymentForm` driven through `/payment/subscription/update-card` + `/subscription/confirm` (same pair the registration payment step uses). `update-card`: one button to `/payment/portal-session`. `contact-admin`: dead-end screen naming `companyadminemail`, no payment UI. Sign-out reachable in all three.

## T008 — Route guard redirect and route registration
In `src/client/components/ProtectedRoute.tsx`, after the `isAuthenticated` check, call `evaluateAccess`; when mode is not `ok`, `<Navigate to="/subscription-required" replace />`. Register `/subscription-required` in `src/client/App.tsx` inside `ProtectedRoute` (auth still required) — the guard's own already-on-wall check prevents the redirect loop.

## T009 — Server-side enforcement middleware, flag-gated
New `src/server/middleware/requireActiveSubscription.ts` applying the T005 policy to API requests, rejecting with 402 and `{ error, mode }`. Exempt paths: `/api/auth/*`, `/api/payment/*`, health, static. Controlled by `SUBSCRIPTION_GATE_ENFORCE` = `off` (default) | `log` (evaluate + log, never reject) | `on`. Mount in `src/server/app.ts` after auth, before feature routes. Ships `off`; verified in `log` against production traffic before flipping to `on`.

## T010 — MCP entitlement gate corrections
In `mcp-server/src/auth/entitlement.ts`: add `project.session_start` and `project.cockpit_summary` to `ENTITLEMENT_EXEMPT_TOOLS` so a lapsed customer's editor session opens and can deliver the message; reword `reason` to say the subscription is not complete and the user must log in to wxKanban to correct it; source `REMEDIATION_URL` from `WXKANBAN_BILLING_URL` with default `https://wxkanban.com/admin/billing`. Do not re-implement the gate — the ACTIVE/TRIAL policy, billingexempt pass, and fail-open behavior are already correct.

## T011 — Kit-wide remediation URL sweep
Replace `https://wxperts.com/account/billing` (no such route exists in this app) across `_wxAI/commands/*.md`, `_wxAI/skills/*/SKILL.md`, and the `.claude/` mirrors. Blocked on the owner confirming the canonical host (see spec Open Question).

## T012 — Remove skip-payment-for-now action
In `src/client/pages/RegistrationPage.tsx`, remove `handleSkipPaymentForNow` and its button, and make the payment-step back action return to the admin step or be removed. Under the gate this path leads only to a wall on next navigation, so offering it misleads the user.

## T013 — Tests
Unit tests for `evaluateAccess` covering the full truth table (ACTIVE, TRIAL, PENDING, PENDING_INACTIVE, CANCELED, SUSPENDED, activeflag false, billingexempt, SYSADMIN, non-ADMIN in each blocked state). Mirror the same cases into `mcp-server/tests/auth/entitlement.test.ts` so client/server/MCP drift fails a test. Component test that the guard redirects on a blocked mode and does not loop on the wall route.
