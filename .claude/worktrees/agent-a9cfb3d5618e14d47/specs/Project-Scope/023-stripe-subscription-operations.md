# Spec 023: Stripe subscription operations — wxKanban recurring billing

**Spec Number**: 023  
**Status**: `in-progress`  
**Created**: 2026-04-03  
**Implementation Started**: 2026-04-18  
**Depends On**: None  
**Source**: `specs/Project-Scope/023-stripe-subscription-operations.md`

---

## Implementation Plan

Implementation is broken into six shippable chunks so the whole spec can be delivered incrementally without leaving the repo in a half-working state.

| Chunk | Scope | Status |
|-------|-------|--------|
| **A. Foundation** | 3 DB tables (`companysubscriptions`, `subscriptionbillingevents`, `subscriptionbillinghistory`) + migration `0003_add_subscription_tables.sql`; fix `~/` path aliases in existing `stripe.ts` / `PaymentService.ts` / `payment.ts`; align tier codes + prices with FR-001. | complete (2026-04-18) |
| **B. FR-001 + FR-002 registration payment + promo** | `POST /api/payment/registration/subscribe`, PCI-compliant Stripe Elements form, plan-gated activation (paid tiers start `PENDING`), promo-day support (URL override + global `billing.promoDays` setting via `GET /api/payment/config`). `SubscriptionPlanSelector` requirement is fulfilled by the existing `PricingTiers.tsx` on the landing page; FREE removed from that CTA. | FR-001 complete (2026-04-18). FR-002 promo **not functional** — shipped untested and throws on any non-zero promo; URL-override design withdrawn. Superseded by FR-002a + FR-002b (Chunk I). See Design Decisions (2026-07-15). |
| **C. FR-006 webhooks** | `POST /api/webhooks/stripe` with signature verification, `subscriptionbillingevents` sync for payment success/fail, retry/dunning handlers, `customer.subscription.updated` / `.deleted` handlers so Chunk D plan changes stay in sync. | code complete (2026-06-09); live smoke test (C.8) pending |
| **D. FR-003 + FR-005 subscription mgmt (hybrid)** | Replace stub `PATCH /api/company/subscription` with real Stripe-backed upgrade/downgrade/cancel; add `GET /api/company/subscription`; build `SubscriptionManagementPanel` with custom upgrade/downgrade/cancel UI (FR-003) **and** active-user downgrade guard (FR-005). Add `POST /api/company/subscription/portal-session` that creates a Stripe Billing Portal session, with the Portal restricted to *Manage payment method* + *View invoices* only — plan changes stay in our UI so FR-005 is enforced. Pre-flight: consolidate `src/server/services/BillingService.ts` and `src/services/billing-service.ts` into a single canonical module before adding methods. | pending |
| **E. FR-004 overage** | `EnterpriseOverageNotice` on InviteTeamPage, 26th-user warning, overage-billing sync via Stripe subscription item update. (FR-005 moved to Chunk D.) | pending |
| **F. FR-007 + FR-008 history + reports** | `GET /api/company/subscription/history`, `GET /api/company/subscription/reports`, `BillingHistoryPanel`, monthly statements + revenue projection. Note: invoice viewing is also covered by Chunk D's Portal redirect; this chunk adds the in-app history view. | pending |

### Foundation Tasks (Chunk A)

- [x] A.1 Create Drizzle schema files under `src/db/schema/` for the three new tables per the "Schema Definition" block below.
- [x] A.2 Create `src/db/migrations/0003_add_subscription_tables.sql` (idempotent, mirroring the `0001_sync_phase2.sql` style). Migration also adds `companies.billingexempt BOOLEAN DEFAULT false` and backfills `true` for Wxperts LLC + American Litho. Apply to live DB and seed `drizzle.__drizzle_migrations`.
- [x] A.3 Fix `~/` relative-alias imports in `src/server/routes/payment.ts`, `src/server/services/PaymentService.ts`, and any downstream referrers so the module type-checks.
- [x] A.4 Align tier codes + pricing in PaymentService / payment.ts with FR-001 (`SMALL_BUSINESS=$19.95`, `CONSULTANT=$29.95`, `ENTERPRISE=$59.95`). Add `billingexempt` short-circuit that skips Stripe customer / subscription creation for exempt companies while preserving their plan limits + features. Also corrected prior price bug in `stripe.ts` (CONSULTANT was $19.95, ENTERPRISE was $99.95).

### Design Decisions (2026-04-18)

- **Tier code** — `SMALL_BUSINESS` (matches existing `companies.billingplan` values in the live DB; no data migration required).
- **FREE tier** — single-seat tier shown on the landing page alongside the three paid plans. A FREE registration never creates a Stripe subscription and is activated immediately (no payment gate). Still used for test accounts (e.g. `Ed Test`) and the sysadmin backdoor pattern.
- **Billing exemption** — introduced as `companies.billingexempt BOOLEAN DEFAULT false`. When `true`, PaymentService skips Stripe subscription creation entirely so internal / dogfooding accounts (Wxperts LLC, American Litho) never incur charges, yet still receive the feature set + user limits of whatever `billingplan` they sit on.

### Design Decisions (2026-05-30) — Repricing + Single User tier

Supersedes the 2026-04-18 pricing in A.4 and the "FREE shown on landing" decision above.

- **New `SINGLE_USER` paid tier** — entry-level paid plan: **$19.95/month**, **1 active user**, unlimited projects, single PM integration, email support (no time tracking). Becomes the landing page's first card and a payment-gated registration option. Stripe price: `STRIPE_PRICE_SINGLE_USER` (live price created 2026-05-30).
- **Repricing** — `SMALL_BUSINESS` $19.95 → **$29.95** (≤5 users; "invoicing" dropped from marketing copy), `CONSULTANT` $29.95 → **$39.95**. `ENTERPRISE` unchanged at $59.95.
- **FREE is now internal-only** — removed from the public landing + registration CTA; retained in code for test accounts, the sysadmin backdoor, and `billingexempt` companies (single seat, no Stripe subscription, immediate activation). The 2026-04-18 "FREE on landing" decision no longer applies.
- **Pricing applied in place (2026-05-30 outcome)** — the SMB/Consultant amounts were edited on the existing Stripe `price_…` IDs (`price_1TNirO…` → $29.95, `price_1TNis1…` → $39.95), so the `STRIPE_PRICE_*` env vars needed no repoint. Existing subscribers therefore move to the new amount at their next renewal — grandfathering was NOT applied (accepted by the product owner). All four live prices verified 2026-05-30.

### Chunk G Tasks (2026-05-30 repricing) — status: complete (2026-05-30)

- [x] G.1 Added `SINGLE_USER` to `SubscriptionTier` + `TIER_CONFIG` in `TierEnforcementService.ts` (maxUsers 1, features), the price map in `lib/stripe.ts` (`monthlyPrice: 1995`, `priceId: STRIPE_PRICE_SINGLE_USER`), `PaymentService` (duplicate `SubscriptionTier` + `getTierConfiguration`), `payment.ts` zod enums, and `getUpgradeSuggestion` (`SINGLE_USER → SMALL_BUSINESS`).
- [x] G.2 Re-priced `lib/stripe.ts`: `SMALL_BUSINESS` 1995 → 2995, `CONSULTANT` 2995 → 3995; `PaymentService.getTierConfiguration` → $29.95 / $39.95 and SMB `maxUsers` 25 → 5.
- [x] G.3 Stripe live prices set + verified: Single User `price_1Tcsj…` $19.95 (`prod_Uc6x8J6xtyTptm`), SMB `price_1TNirO…` $29.95, Consultant `price_1TNis1…` $39.95, Enterprise `price_1TNid0…` $59.95. Amounts edited in place (IDs unchanged) → no App Runner repoint required beyond confirming `STRIPE_PRICE_SINGLE_USER` is set there.
- [x] G.4 Registration routing — landing "Single User" CTA → `tier=SINGLE_USER` (payment-gated); `RegistrationPage` (Tier/PaidTier/PAID_TIERS/isValidTier/tierLabel), `ConfirmationStep`, `billingPlan.ts` updated. FREE off the public CTA.
- [x] G.5 Display reconciliation — `PricingTiers.tsx`, `ConfirmationStep.tsx`, `TierSelector.tsx`, landing CTA label.
- [x] G.6 Fixed `PaymentService.calculateSubscriptionCost` dividing the already-in-dollars price by 100 (cost breakdown showed 1/100th, e.g. $0.20). Verified live via `/api/payment/validate`.

### Chunk C Tasks (FR-006 webhooks) — status: code complete (2026-06-09)

Implemented in `src/server/routes/webhooks.ts` (`POST /api/webhooks/stripe`) + `src/server/services/StripeWebhookHandler.ts`. Mounted in `app.ts` BEFORE `express.json()` with a route-local `express.raw()` so the raw body survives for signature verification. Stripe SDK pinned at v22 (period fields read from `SubscriptionItem`, not `Subscription`). **Deploy prereqs:** `STRIPE_WEBHOOK_SECRET` set in App Runner (done 2026-06-09), and the live endpoint registered at `https://<app-runner-domain>/api/webhooks/stripe` subscribed to `invoice.paid`, `invoice.payment_succeeded`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`.

Chunk H interaction (2026-06-09): the post-signup card-update flow defers cancelling the prior subscription to `confirmSubscriptionCardUpdate()` — after the DB row already points at the new subscription id — so the old subscription's `customer.subscription.deleted` event no longer matches a row and cannot flip the company back to `CANCELED`.

- [x] **C.1 Raw-body capture middleware for Stripe.** Stripe signature verification requires the *raw* request body, not the JSON-parsed body. Add a route-specific middleware that captures `req.rawBody` for `/api/webhooks/stripe` only (must run *before* `express.json()` for that route). Existing JSON parsing for the rest of the API stays untouched.
- [x] **C.2 `POST /api/webhooks/stripe` route + signature verification.** Read `STRIPE_WEBHOOK_SECRET` env var (fail-fast on startup if missing in non-test env). Call `stripe.webhooks.constructEvent(rawBody, signature, secret)`. Return 400 on bad signature, 200 on success. Wrap entire handler in try/catch — Stripe retries on non-2xx, so we must return 200 even when our own logic errors (log + alert internally instead).
- [x] **C.3 Event dispatcher + idempotency.** Switch on `event.type` to a handler. Before any side effect, check `subscriptionbillingevents` for an existing row with this `stripeeventid` — if present, log "duplicate" and return 200 without re-running the handler. Every handler writes its event row at the start so idempotency holds across crashes.
- [x] **C.4 Handler: `invoice.paid` / `invoice.payment_succeeded`.** Look up `companysubscriptions` by `stripesubscriptionid`, write a `subscriptionbillinghistory` row with `historytype='payment_success'`, `amount` from invoice, `referencedocid=invoice.id`, `displaylabel` like "Subscription renewal — Consultant", `occurredat` from invoice timestamp. If the matching `companies.subscriptionstatus` is `PENDING`, transition to `ACTIVE` (this is the post-registration first-payment activation gate from FR-001).
- [x] **C.5 Handler: `invoice.payment_failed`.** Write `subscriptionbillinghistory` row with `historytype='payment_failed'`. Update `companysubscriptions.status` to Stripe's status (typically `past_due` or `unpaid`). Mirror that to `companies.subscriptionstatus`. Fire an in-app notification to all company admins (use existing notification table). Do NOT deactivate the company — Stripe handles dunning retries; we re-sync on subsequent events.
- [x] **C.6 Handler: `customer.subscription.updated`.** Sync `companysubscriptions.planname / planamount / currentperiodstart / currentperiodend / status` from the Stripe payload. This is the reconciliation path after Chunk D's `PATCH /api/company/subscription` triggers a Stripe-side period change and proration.
- [x] **C.7 Handler: `customer.subscription.deleted`.** Set `companysubscriptions.canceledat = now`, `status = 'canceled'`. Set `companies.subscriptionstatus = 'CANCELED'`. Do NOT change `companies.billingplan` — the customer keeps feature access until period end (Chunk D cancels with `cancel_at_period_end=true`).
- [ ] **C.8 Stripe CLI smoke test.** Use `stripe listen --forward-to localhost:3001/api/webhooks/stripe` against a local dev server, then `stripe trigger invoice.payment_succeeded`, `stripe trigger invoice.payment_failed`, `stripe trigger customer.subscription.updated`, `stripe trigger customer.subscription.deleted`. Confirm each writes the expected `subscriptionbillingevents` + `subscriptionbillinghistory` rows. Then in live mode, register the webhook at `https://<app-runner-domain>/api/webhooks/stripe`, copy the `whsec_…` secret to App Runner env, and verify a single live test transaction round-trips.
- [ ] **C.9 Pre-existing fake PATCH cleanup deferred to D.3.** Note here only — the existing stub `PATCH /api/company/subscription` keeps shipping until Chunk D replaces it. Adding webhook reconciliation now does not require touching that endpoint.

### Chunk D Tasks (FR-003 + FR-005 subscription management)

- [ ] **D.1 Pre-flight: consolidate billing-service files.** Two files exist with overlapping responsibilities: `src/server/services/BillingService.ts` and `src/services/billing-service.ts`. Audit imports, pick the canonical location (server-side, under `src/server/services/`), move/merge methods, delete the duplicate, update all imports. Type-check must pass before any new code is added.
- [ ] **D.2 `GET /api/company/subscription`.** Returns the authenticated user's company subscription: current plan, status, current-period start/end, plan amount, active-user count, active-user limit for current tier, overage state (Enterprise only), promo state, and the `stripesubscriptionid`. Reads from `companysubscriptions` joined with `companies`. Admin-only.
- [ ] **D.3 Replace stub `PATCH /api/company/subscription`.** Current implementation just flips `companies.billingplan` with no Stripe call (verified during 2026-04-29 audit). Replace with: (a) accept `{ targetPlan: 'SMALL_BUSINESS' | 'CONSULTANT' | 'ENTERPRISE' }`; (b) FR-005 active-user guard — if `targetPlan` limit < current active-user count, return 409 with `{ activeUsers, targetLimit, message }`; (c) call Stripe `subscriptions.update` with the matching `STRIPE_PRICE_*` and `proration_behavior: 'create_prorations'`; (d) update `companysubscriptions.planname / planamount` synchronously (webhook from Chunk C will reconcile period dates); (e) update `companies.billingplan` only after Stripe returns 2xx. Billing-exempt companies (Wxperts LLC, American Litho) skip the Stripe call but still get the local DB update. Admin-only.
- [ ] **D.4 `DELETE /api/company/subscription` (cancel).** Calls Stripe `subscriptions.update(id, { cancel_at_period_end: true })` so service continues until period end, then writes `canceledat` to `companysubscriptions`. Cancellation is admin-only and requires a typed-confirmation flow in the UI (passed via request body, e.g. `{ confirmName: '<companyname>' }`).
- [ ] **D.5 `POST /api/company/subscription/portal-session`.** Calls Stripe `billingPortal.sessions.create` with `customer: <stripecustomerid>` and `return_url: <app-runner-domain>/settings/billing`. Returns `{ url }` for client redirect. Relies on the Portal configuration set up in the new Chunk D deploy-prereq checklist. Admin-only. Skips entirely for billing-exempt companies (returns 409 with explanation).
- [ ] **D.6 `SubscriptionManagementPanel` component.** Path: `src/client/components/billing/SubscriptionManagementPanel.tsx`. Renders the data from D.2: current plan card, available-plans grid with "Upgrade" / "Downgrade" buttons (disabled with tooltip when target = current), "Cancel subscription" link (typed confirmation), "Manage payment method" + "View invoices" buttons that hit D.5 and redirect. Downgrade-blocked errors from D.3 surface inline with active-user count + target limit + a deep link to the team page so the admin can deactivate users. Loading + error states. Re-fetch after every mutation.
- [ ] **D.7 Wire `SubscriptionManagementPanel` into the existing settings/billing route** so the dead `/settings/billing/upgrade` link from `SubscriptionCard.tsx:106` and `UpgradeLock.tsx:64` resolves to a real page. Update those two link `to=""` values to point at the new route.
- [ ] **D.8 Smoke test in live mode.** Upgrade Small Business → Consultant on a test company; downgrade Consultant → Small Business; cancel; reactivate via Stripe dashboard. Confirm `companysubscriptions.planname`, `companies.billingplan`, and Stripe dashboard all stay aligned through every transition. Clean up artifacts per the existing Smoke-test cleanup section.

### Chunk H Tasks (post-signup card update + re-subscribe — Billing tab) — status: in-progress (2026-06-09)

**Motivation.** Registration captures the card via `StripePaymentForm` against a `default_incomplete` subscription (Chunk B). When that first payment fails, the company is left with a `companysubscriptions` row stuck at `status='incomplete'` and no in-product way to re-enter a card — the Stripe Billing Portal path (Chunk D, D.5) is not live yet (Portal not configured, Chunk D pending). Two real companies are in this state (signed up 2026-06, card failed). Chunk H delivers a self-contained, Portal-free way for an ADMIN to re-enter their card and re-activate the subscription from **Settings → Billing**, reusing the registration `StripePaymentForm`. This is an interim implementation of the customer-facing half of FR-006 (failed-payment recovery); the webhook/dunning half still ships in Chunk C.

- [ ] **H.1 `GET /api/payment/subscription`** (auth + requireAdmin). Returns the authenticated admin's company subscription summary from `companysubscriptions` (latest row by `createdat`): `{ stripeSubscriptionId, stripeCustomerId, status, planName, planAmount, currentPeriodEnd, promoTrialDays }` or `null`, plus `companies.billingplan` + `companies.subscriptionstatus`. Used to **display the current Stripe subscription id**. Scoped under `/api/payment/*` to avoid colliding with the pending Chunk D `/api/company/subscription` management endpoint.
- [ ] **H.2 `POST /api/payment/subscription/update-card`** (auth + requireAdmin). 503 when `STRIPE_CC_PROCESSING_ENABLED` is off; 409 for billing-exempt companies. Reuses the company's existing `stripecustomerid` (creates one from `companies.contactemail` + `name` if missing), best-effort immediately cancels the prior stuck/incomplete Stripe subscription, then creates a **new** `default_incomplete` subscription for the company's current `billingplan` tier (no promo on re-subscribe) and returns the PaymentIntent `client_secret` + `customerId` / `subscriptionId` / `publishableKey` / `tier` / `monthlyPrice`. Card data never transits wxKanban (same PCI posture as Chunk B).
- [ ] **H.3 `POST /api/payment/subscription/confirm`** (auth + requireAdmin). After the client confirms the card, upserts the `companysubscriptions` row (`stripecustomerid` / `stripesubscriptionid` / `planname` / `planamount`, `status='active'`) and flips `companies.subscriptionstatus='ACTIVE'`. Optimistic client-confirmed activation is the interim until Chunk C webhooks reconcile authoritatively.
- [ ] **H.4 `StripePaymentForm` reuse.** Parameterize the registration form with an optional `initSubscription` callback (defaults to the existing `POST /api/payment/registration/subscribe` fetch) so the Billing tab can drive it against `update-card` instead. Broaden the internal tier label map to include `SINGLE_USER`; derive all displayed pricing from the subscribe response so any paid tier renders.
- [ ] **H.5 `BillingSubscriptionPanel` + Settings page.** New `src/client/components/billing/BillingSubscriptionPanel.tsx` shows current plan / status / Stripe subscription id (H.1) and an "Update card / Re-activate subscription" action that renders the reused `StripePaymentForm` (H.2) then calls confirm (H.3). Wired as an admin-only **Billing & Subscription** section at the top of the live `/admin/settings` page (`src/client/pages/admin/SettingsPage.tsx`) — note the tabbed `src/client/pages/SettingsPage.tsx` is dead/unrouted code and must NOT be used. Also: the **Settings** nav link in `AppShell` is gated to ADMIN (`requiredUsertype: "ADMIN"`), and role-locked nav items are now hidden entirely for non-admins instead of shown as a padlock.
- [ ] **H.6 Country list.** Add Belgium (`BE`) and Italy (`IT`) to the `CompanyInfoForm` country select (registration + any reuse).
- [ ] **H.7 Re-activate the 2 stuck companies** by walking each admin through Settings → Billing → Update card in live mode; confirm `companysubscriptions.status` and `companies.subscriptionstatus` both reach `active`/`ACTIVE`.

---

### Design Decisions (2026-07-15) — Promo is invite-bound; URL override withdrawn

Supersedes the promo-day half of Chunk B. FR-001 (payment gating) is unaffected and stays complete.

- **Chunk B's promo support was marked complete on 2026-04-18 but never worked.** It was shipped without being exercised at a non-zero promo value. Registration creates subscriptions with `payment_behavior: "default_incomplete"`; when a trial is attached the first invoice is $0, so Stripe returns no PaymentIntent and instead attaches a `pending_setup_intent`. `createRegistrationSubscription` in `lib/stripe.ts` only ever read `latest_invoice.payment_intent`, so **any** non-zero promo threw "no PaymentIntent client_secret returned" and failed the registration outright. Setting `billing.promoDays` above 0 at any point since 2026-04-18 would have broken every paid signup. This is why FR-002's acceptance criteria were never checked off.
- **The URL-override design is withdrawn as a security defect, not just a bug.** `promoDaysOverride` was accepted from the body of the public, unauthenticated `POST /api/payment/registration/subscribe`, and `resolvePromoDays` let that client value beat the stored global setting, up to 365 days. Anyone appending `?promo=365` to the registration URL could self-grant a free year. No invitation, no authentication, no audit trail. FR-002b now forbids client-supplied promo values as a standing constraint on all future promo work.
- **Promo access becomes invite-bound (FR-002a).** A system administrator issues an invitation carrying the recipient email, the pinned plan, and the promo duration. The link is single-use and expires. This replaces "configurable global promo + shareable URL" as the delivery mechanism. The stored `billing.promoDays` setting survives as a server-side default (DB-only, never client-settable) and remains 0.
- **Card is collected up front.** The prospect enters a card during the promo via Stripe's SetupIntent path, so billing starts automatically at promo end with no second touch. Chosen over card-at-expiry because the latter needs a dunning/expiry flow and an access gate that do not exist.
- **Modelled on `engagementinvitations`, not `userinvitations`.** `userinvitations` has a NOT NULL FK to `companies.id` and adds a user to an existing company; a signup invite has no company yet. `engagements.ts` already does token → provision a new company bound to an invited email, and is the structural precedent.
- **Token is hashed at rest.** Stored as sha256, following `emailverificationtokens` / `passwordresettokens`. The existing invite tables store tokens in plaintext, so a DB leak exposes every live invite — that precedent is deliberately not followed.
- **Redemption must be atomic.** Both existing invite flows read-then-write with no transaction, so concurrent redemptions can both pass validation. `engagementinvitations` survives this only because a unique constraint catches the second insert. A signup invite has no such backstop — a double-submit would create two companies and two admin users — so the burn is a conditional UPDATE guarded on `status='pending'` with a row-count check, inside the same transaction as company creation.

### Chunk I Tasks (FR-002a + FR-002b invite-bound promo) — status: in-progress (2026-07-15)

- [ ] **I.1 Fix the Stripe trial path.** `lib/stripe.ts` `createRegistrationSubscription`: expand `pending_setup_intent` alongside `latest_invoice.payment_intent`; return the secret from whichever exists plus an `intentType: "payment" | "setup"` discriminator derived from which object supplied it (never from the trial length); throw only when neither is present; send `trial_settings.end_behavior.missing_payment_method: "cancel"` when trialling. Also fix the invalid plural `expand: ["latest_invoices.payment_intent"]`.
- [ ] **I.2 Thread `intentType`** through `PaymentService.RegistrationSubscriptionResponse` and the `POST /api/payment/registration/subscribe` response.
- [ ] **I.3 `StripePaymentForm` setup branch.** Call `stripe.confirmSetup` when `intentType === "setup"`, `confirmPayment` otherwise — `confirmPayment` errors against a `seti_` secret. The `Elements` provider is clientSecret-driven and needs no change.
- [ ] **I.4 FR-002 AC#2 promo copy.** Render "free for N days, then $X/mo starting {date}" from the already-returned-but-unread `trialEnd`, and fix the `register.completePayment` button label (nothing is being charged). Add keys to all six locales.
- [ ] **I.5 Webhook trialing mapping.** `StripeWebhookHandler` never maps Stripe's `trialing` while `SubscriptionRecoveryService.mapStripeToCompanyStatus` maps it to `TRIAL` — three code paths currently disagree about a trialing subscription. Map `trialing → TRIAL`, and stop the $0 trial invoice from flipping the company `ACTIVE` or recording a bogus `payment_success` history row.
- [ ] **I.6 `signupinvitations` table** — `email`, `billingplan`, `promodays`, `tokenhash` (sha256, unique), `status` (pending/redeemed/revoked/expired — honest values, unlike `revokeInvitation` writing `expired`), `expiresat`, `invitedbyid`, `invitedat`, `redeemedat`, `redeemedcompanyid`. Migration into `src/db/migrations`, applied via a `pg.Client` transaction script (`dbpush` is broken for this).
- [ ] **I.7 `SignupInvitationService`** — create/resolveByToken/burn/revoke/list. `resolveByToken` validates without burning. The burn is atomic and runs inside the company-creation transaction; the SCOPE-090 Stripe reconcile stays outside it.
- [ ] **I.8 `GET /api/registration/invite/:token`** — public resolve returning email, plan, promo days, price, expiry. Generic error on failure; never leak whether a token exists.
- [ ] **I.9 Close the hole + bind the token (FR-002b).** Remove `promoDaysOverride` from `registrationSubscribeSchema`; accept `inviteToken` and resolve promo + plan server-side. `registerSchema` accepts `inviteToken`; `adminEmail` must equal the invited email or hard-fail. Follow the `distributor` posture — privilege comes from the server-resolved token, never the request body. An already-registered email must fail loudly *before* the burn (`InvitationService.ts:216-228` gets this wrong today: it burns the invite and gives the user nothing).
- [ ] **I.10 SysAdmin mint UI + routes.** `POST`/`GET`/`DELETE` under `/api/sysadmin/signup-invitations` plus a page listing status, expiry, and redeemed-by. Sysadmin has no invitation surface today. New promo-invite email template — the existing `getInvitationEmailHTML` is hardcoded to team-invite framing with a role table. Always display the link in the UI: `sendEmail` silently no-ops when `SMTP_HOST` is unset and send failures are swallowed, so a dead email must not strand an invite.
- [ ] **I.11 Rate limiting.** `middleware/rateLimit.ts` is SysAdmin-only and applied to neither `/auth/register` nor any invite route. Apply to resolve + register + subscribe. Note it is in-memory and therefore per-instance only under multi-instance App Runner.
- [ ] **I.12 Verify against a Stripe test clock.** Advance past `trial_end` and confirm the real charge lands and the company moves `TRIAL → ACTIVE` (FR-002 AC#3 cannot be verified any other way). Confirm `default_payment_method` is actually populated on the SetupIntent path — if `save_default_payment_method: "on_subscription"` does not set it, the card is on file but the first real charge fails silently, months after signup. Also test the concurrent-redemption case explicitly.

---

## Overview

wxKanban needs Stripe-based subscription billing so customers can choose a plan during registration, complete payment before activation, manage upgrades and downgrades later, and view billing history inside the product. This scope covers three supported plans: Small/Medium Business at $19.95, Consultant at $29.95, and Enterprise at $59.95 with an additional $5 charge when the 26th and later active users are added. It also covers payment success and failure handling, dunning and retry flows, promo-day support at signup, and reporting for monthly statements and revenue projections.

### Core Design

| Element | Value |
|---------|-------|
| **Primary Actor** | Company admin / billing admin |
| **Secondary Actors** | Customer support, finance staff, registered customer account owners |
| **Key Value** | wxKanban can collect subscription revenue directly and reliably through Stripe instead of having no in-product payment processing. |
| **Scope Boundary** | Include registration-time plan selection, successful-payment-gated activation, billing history, plan changes, enterprise overage billing, failed payment retries, and subscription reporting. Exclude consulting charge handling, tax or VAT logic, and refund workflows. |

---

## Production Deployment Checklist

Runs alongside each chunk's code delivery. Nothing here is optional — a missing env var in App Runner is an outage for new signups.

### One-time prerequisites (before Chunk B goes live)

- [ ] **Stripe live-mode Products + Prices created** in [dashboard.stripe.com/products](https://dashboard.stripe.com/products) (toggle off "Test mode"):
  - [ ] Small/Medium Business — $19.95/month recurring → copy `price_…` ID
  - [ ] Consultant — $29.95/month recurring → copy `price_…` ID
  - [ ] Enterprise — $59.95/month recurring → copy `price_…` ID

- [ ] **App Runner env vars set** (AWS console → wxKanban service → Configuration → Environment variables → Edit → Deploy):
  - [ ] `STRIPE_CC_PROCESSING_ENABLED=true`
  - [ ] `STRIPE_API_KEY=sk_live_…`
  - [ ] `STRIPE_PUBLISHABLE_KEY=pk_live_…`
  - [ ] `STRIPE_PRICE_SMALL_BUSINESS=price_…`
  - [ ] `STRIPE_PRICE_CONSULTANT=price_…`
  - [ ] `STRIPE_PRICE_ENTERPRISE=price_…`
  - [ ] `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` (from nodemailer swap — without these, registration verification emails silently no-op)
  - [ ] `JWT_SECRET`, `ENCRYPTION_KEY` already set (unchanged by this spec, but re-verify)

### One-time prerequisites (before Chunk D goes live)

- [ ] **Stripe Billing Portal configured** at [dashboard.stripe.com/settings/billing/portal](https://dashboard.stripe.com/settings/billing/portal) (toggle off "Test mode" for live):
  - [ ] Activate the Portal
  - [ ] Functionality → **Subscriptions**: leave *Update subscriptions* **OFF** (plan changes happen in our UI to enforce FR-005)
  - [ ] Functionality → **Subscriptions**: leave *Cancel subscriptions* **OFF** (cancel happens in our UI)
  - [ ] Functionality → **Invoice history**: **ON**
  - [ ] Functionality → **Payment methods**: **ON** (allow update + remove)
  - [ ] Business information → set support email, terms-of-service URL, privacy-policy URL
  - [ ] Default return URL: `https://<app-runner-domain>/settings/billing` (where `SubscriptionManagementPanel` lives)

### Chunk-specific env vars

| Chunk | Env var | Notes |
|---|---|---|
| A | — | No new env vars. |
| B | `STRIPE_PRICE_*`, `STRIPE_CC_PROCESSING_ENABLED`, `STRIPE_API_KEY`, `STRIPE_PUBLISHABLE_KEY` | Required before `/api/payment/registration/subscribe` can succeed. |
| C | `STRIPE_WEBHOOK_SECRET=whsec_…` | Set **after** registering the prod webhook endpoint at [dashboard.stripe.com/webhooks](https://dashboard.stripe.com/webhooks). URL will be `https://<app-runner-domain>/api/webhooks/stripe`. Subscribe to at least: `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`. |
| D | (none) — but **verify** `STRIPE_PRICE_SMALL_BUSINESS / CONSULTANT / ENTERPRISE` are still set in App Runner before deploy (re-used from Chunk B for upgrade/downgrade calls). | Stripe Billing Portal must be configured in [dashboard.stripe.com/settings/billing/portal](https://dashboard.stripe.com/settings/billing/portal) — feature-restrict to *Manage payment methods* + *View invoices* only. Plan changes must be **disabled** in Portal so FR-005 stays enforceable in our UI. |
| E | (none) | Overage uses Stripe usage-records or pricing-item updates already covered by Chunk B keys. |
| F | (none) | Reporting reads internal tables. |

### Post-deploy verification

- [ ] Browser registration with a paid tier creates a matching Customer + Subscription in the live Stripe dashboard.
- [ ] `companies.subscriptionstatus` flips from `PENDING` → `ACTIVE` after Stripe webhook fires (Chunk C).
- [ ] `companysubscriptions` table has a row with the correct `stripesubscriptionid` and `status='active'` after webhook.
- [ ] Verification email arrives at the admin inbox (SMTP is really sending, not log-fallback).
- [ ] `/api/payment/config` returns `paymentsEnabled: true` and a non-empty `publishableKey`.
- [ ] No test artifacts from dev smoke testing remain in the live Stripe account (see "Smoke-test cleanup" below).
- [ ] (Chunk D) Upgrading from Small Business to Consultant in `SubscriptionManagementPanel` updates the live Stripe subscription's price ID, prorates the current period, and the `companies.billingplan` row reflects the new tier within 5 seconds of the webhook firing.
- [ ] (Chunk D) Downgrade attempt from Enterprise → Small Business with > 5 active users is blocked in our UI with a clear error before any Stripe call is made.
- [ ] (Chunk D) "Manage payment method" and "View invoices" links open a Stripe-hosted Portal page restricted to those two surfaces (no plan-change controls visible).

### Smoke-test cleanup

Each dev smoke test creates a live Stripe Customer + Subscription when `STRIPE_API_KEY` is a `sk_live_…` key. Before declaring a chunk shipped, audit and cancel any artifacts:

- [ ] [dashboard.stripe.com/customers](https://dashboard.stripe.com/customers) — search for `@contract-test.local`, `smoke-test@`, `enterprise-smoke@`, or any test-domain emails; cancel their subscriptions and refund any charges.
- [ ] Known artifacts from this build to audit: `cus_UMRbzTQGx1n0O8` / `sub_1TNihzFFgmijEzwoxPXKRkrE` (Enterprise smoke 2026-04-18).

---

## User Scenarios & Testing

### US1 — Customer registration with paid plan activation

**Actor**: Company admin / billing admin

**Scenario**:
1. A customer registers a new wxKanban company account.
2. The customer selects Small/Medium Business, Consultant, or Enterprise during registration.
3. The system shows the known subscription amount, including any promo-day adjustment in effect.
4. The customer enters payment details through Stripe.
5. The account is activated only after Stripe confirms successful payment.

**Expected outcome**: A paid subscription is created and the company is not activated without successful payment.

---

### US2 — Enterprise customer exceeds 25 active users

**Actor**: Company admin / billing admin

**Scenario**:
1. An Enterprise customer already has 25 active users.
2. The company admin attempts to add a 26th team member.
3. The system warns that adding the user will trigger an additional $5 subscription fee.
4. The admin confirms the addition.
5. The subscription is updated to reflect the overage charge.

**Expected outcome**: The user is informed before the overage is applied, and the Enterprise subscription is updated correctly.

---

### US3 — Customer downgrade blocked by active-user limit

**Actor**: Company admin / billing admin

**Scenario**:
1. A customer requests a downgrade to a lower plan.
2. The system checks the lower plan's allowed active-user capacity.
3. The customer currently exceeds that limit.
4. The system blocks the downgrade and instructs the customer to set enough users inactive first.

**Expected outcome**: Downgrades do not proceed when the account still has too many active users for the target plan.

---

## Functional Requirements

### FR-001 — Registration plan selection and payment gating

The system MUST allow a registering customer to select one of the four supported paid wxKanban subscription plans (Single User, Small/Medium Business, Consultant, Enterprise) and MUST require successful Stripe payment before activating the customer account.

**Acceptance Criteria**:
- [ ] Registration presents Single User at $19.95, Small/Medium Business at $29.95, Consultant at $39.95, and Enterprise at $59.95.
- [ ] The selected plan amount is shown before payment is submitted.
- [ ] The account remains inactive until Stripe confirms payment success.

---

### FR-002 — Promo-day support at signup

The system MUST support a configurable x-day promotional period during registration without removing the requirement for Stripe-backed subscription creation.

**Acceptance Criteria**:
- [ ] Admins can configure a promo duration used during signup.
- [ ] Registration clearly shows the promo effect on billing timing or amount.
- [ ] The subscription transitions to normal recurring billing after the promo period ends.

Superseded in part by FR-002a and FR-002b (2026-07-15). The URL-override delivery mechanism described in Chunk B is withdrawn; promo access is invite-bound. AC#1 is satisfied by the invitation issuing surface in FR-002a together with the stored global default. AC#2 and AC#3 remain open and are delivered alongside FR-002a.

---

### FR-002a — Invite-bound signup promotions

The system MUST grant promotional free periods only through a server-issued invitation bound to a single email address. The invitation MUST pin both the subscription plan and the promotional duration, MUST be redeemable exactly once, and MUST expire if unused.

**Acceptance Criteria**:
- [ ] A system administrator can issue an invitation specifying recipient email, plan, and promotional duration, and can view and revoke outstanding invitations.
- [ ] The invitation link is single-use — a second redemption attempt is rejected and creates no account, including when two attempts arrive simultaneously.
- [ ] Registration through an invitation is locked to the invited email address and the pinned plan; a mismatch is rejected.
- [ ] An expired, revoked, or already-redeemed invitation is rejected and grants no promotional period.
- [ ] A failed registration does not consume the invitation.

---

### FR-002a.1 — Preview and edit the invitation email before sending

Issuing an invitation and sending its email MUST be separate steps. Creating an invitation MUST NOT send anything and MUST surface the invitation link immediately. The administrator MUST be able to see the exact email that will be sent, edit its subject line and add their own message, and send only when satisfied. Editing MUST NOT be able to remove the invitation link, the expiry notice, or the pricing from the email.

**Acceptance Criteria**:
- [ ] Creating an invitation sends no email and shows the invitation link.
- [ ] The preview shows the real email that would be sent, including the real invitation link.
- [ ] The subject line and a free-text message can be edited, and the message appears in the sent email.
- [ ] The link, expiry notice and pricing survive any edit the administrator can make.
- [ ] Sending reports success or failure, and a send failure leaves the invitation usable via its link.
- [ ] An invitation that has already been redeemed or revoked cannot have its email sent.

---

### FR-002a.2 — Send the invitation in any supported language

The administrator MUST be able to send the invitation email in any language wxKanban supports. The email's fixed content — headings, plan and pricing wording, the link button, and the expiry notice — MUST be pre-authored per language rather than machine-translated at send time, so wording is stable and identical for every recipient in that language. Choosing a language MUST produce an email that is wholly in that language, including the administrator's own message. Any machine translation MUST be reviewable and editable before sending. Dates MUST be formatted for the chosen language.

**Acceptance Criteria**:
- [ ] The administrator can choose the send language from the languages wxKanban supports.
- [ ] The email's fixed content appears in the chosen language, from pre-authored wording, with no model call at send time.
- [ ] Choosing a language also translates the administrator's message — no part of the email is left in another language.
- [ ] A machine translation can be edited before sending, and is never sent unreviewed.
- [ ] The administrator's original wording is recoverable — returning to English restores what they actually typed rather than a translation of a translation.
- [ ] A translation failure is surfaced and does not leave the email part-translated.
- [ ] The preview shows the email in the chosen language, including the date.

**Amendment (2026-07-15).** Originally specified as "the administrator's own message MAY be machine-translated *on request*", implemented as an explicit Translate button so that changing the language never overwrote the administrator's words. Rejected in first use: picking Français produced a French email with an English paragraph in it, which reads as broken regardless of the reasoning. The picker now translates everything, and the words are protected by retaining the English source (switching back restores it verbatim) rather than by declining to act.

---

### FR-002b — Promotional duration is never client-supplied

The system MUST NOT accept a promotional duration, plan entitlement, or billing exemption from the client. Promotional values MUST be resolved server-side from a stored invitation or a stored administrator setting. Any promotional value present in a client request MUST be ignored or rejected.

**Acceptance Criteria**:
- [ ] A registration request carrying a promotional duration in its payload receives no promotional period.
- [ ] The registration URL cannot confer a promotional period by itself; only a valid invitation token can.
- [ ] The plan a registrant is billed for is resolved server-side and cannot be altered by the client when an invitation is present.

---

### FR-003 — Subscription lifecycle management

The system MUST let authorized users create, list, review, upgrade, downgrade, and cancel subscriptions for the supported wxKanban plans.

**Acceptance Criteria**:
- [ ] Authorized users can view the current plan, status, and billing details for an account.
- [ ] Upgrades and downgrades can be initiated from inside wxKanban.
- [ ] Cancellation updates subscription status and preserves billing history.

*Implementation: hybrid (decided 2026-04-29). Plan upgrade / downgrade / cancel are custom in-app flows so FR-005 active-user guard and FR-004 overage warning stay enforceable. Payment-method updates and invoice viewing redirect to a Stripe Billing Portal session created by `POST /api/company/subscription/portal-session`, with the Portal feature-restricted to those two surfaces only.*

---

### FR-004 — Enterprise overage charging

The system MUST apply an additional $5 subscription charge for each active Enterprise user above 25 and MUST warn the customer when the first overage-triggering user is being added.

**Acceptance Criteria**:
- [ ] When an Enterprise account attempts to add the 26th active user, the system shows an overage warning before confirming the action.
- [ ] Overage calculations are based on active user count.
- [ ] Subscription billing reflects the additional $5 charge as users over 25 are activated.

---

### FR-005 — Downgrade enforcement

The system MUST block downgrades when the target plan cannot support the current number of active users.

**Acceptance Criteria**:
- [ ] The system checks active-user limits before completing a downgrade.
- [ ] Downgrade is blocked until enough users are set inactive.
- [ ] The customer is told why the downgrade was blocked.

*Implementation: ships in Chunk D alongside FR-003 (subscription management) — the downgrade guard is enforced by `PATCH /api/company/subscription` before any Stripe call is made, and surfaced in `SubscriptionManagementPanel` as a blocking error with the active-user count and target-plan limit.*

---

### FR-006 — Failed payment handling and dunning

The system MUST handle failed payments through retry and dunning workflows and keep subscription state aligned with Stripe events.

**Acceptance Criteria**:
- [ ] Failed payments are recorded and surfaced to the customer or admin.
- [ ] Retry or dunning actions can be executed according to the configured billing workflow.
- [ ] Payment success and failure events synchronize with subscription status inside wxKanban.

---

### FR-007 — Customer billing history

The system MUST provide customer-visible billing history that includes invoices, successful payments, and failed payments.

**Acceptance Criteria**:
- [ ] Customers can view historical invoices from within wxKanban.
- [ ] Customers can view successful payment events.
- [ ] Customers can view failed payment events.

---

### FR-008 — Reporting and revenue visibility

The system MUST provide monthly statements and revenue projection reporting for subscription billing activity.

**Acceptance Criteria**:
- [ ] Authorized users can generate monthly billing statements.
- [ ] Authorized users can view revenue projections based on active subscriptions and overage conditions.
- [ ] Reporting data reflects current Stripe-backed billing state.

---

## Data Requirements

### Schema Changes

| Table | Purpose |
|-------|---------|
| `companysubscriptions` | Stores the current Stripe subscription, chosen plan, pricing state, promo terms, and lifecycle status for each company. |
| `subscriptionbillingevents` | Stores Stripe billing events such as payment success, failed payment, retry, cancellation, and plan changes. |
| `subscriptionbillinghistory` | Stores customer-visible billing history records for invoices and payment outcomes shown inside wxKanban. |

**Schema Definition**:
```sql
CREATE TABLE companysubscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  companyid UUID NOT NULL,
  stripesubscriptionid TEXT NOT NULL,
  stripecustomerid TEXT NOT NULL,
  planname TEXT NOT NULL,
  planamount NUMERIC(10,2) NOT NULL,
  activeuserlimit INTEGER,
  overageamount NUMERIC(10,2),
  promotrialdays INTEGER,
  status TEXT NOT NULL,
  currentperiodstart TIMESTAMP,
  currentperiodend TIMESTAMP,
  canceledat TIMESTAMP,
  createdat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedat TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE subscriptionbillingevents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  companysubscriptionid UUID NOT NULL,
  eventtype TEXT NOT NULL,
  eventstatus TEXT NOT NULL,
  stripeeventid TEXT,
  payload JSONB,
  createdat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedat TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE subscriptionbillinghistory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  companysubscriptionid UUID NOT NULL,
  historytype TEXT NOT NULL,
  amount NUMERIC(10,2),
  referencedocid TEXT,
  displaylabel TEXT NOT NULL,
  occurredat TIMESTAMP NOT NULL,
  createdat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedat TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Indexes

```sql
CREATE INDEX idx_companysubscriptions_companyid ON companysubscriptions(companyid);
CREATE INDEX idx_companysubscriptions_status ON companysubscriptions(status);
CREATE INDEX idx_subscriptionbillingevents_subscriptionid ON subscriptionbillingevents(companysubscriptionid);
CREATE INDEX idx_subscriptionbillinghistory_subscriptionid ON subscriptionbillinghistory(companysubscriptionid);
```

---

## API Routes

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/payment/registration/subscribe` | Create the selected Stripe subscription during registration and gate activation on successful payment. |
| GET | `/api/company/subscription` | Return the current company's subscription plan, status, renewal window, and billing summary. |
| PATCH | `/api/company/subscription` | Upgrade, downgrade, or cancel the current subscription. |
| POST | `/api/company/subscription/retry-payment` | Trigger or schedule failed-payment retry handling. |
| GET | `/api/company/subscription/history` | Return customer-visible billing history with invoices, successful payments, and failed payments. |
| GET | `/api/company/subscription/reports` | Return monthly statements and revenue projection reporting. |
| POST | `/api/webhooks/stripe` | Receive Stripe lifecycle, payment, and dunning events and sync wxKanban state. |

---

## Frontend Components

### New Components

| Component | Path | Description |
|-----------|------|-------------|
| `SubscriptionPlanSelector` | `src/client/components/billing/SubscriptionPlanSelector.tsx` | Displays the three supported plans and any promo-day messaging during registration. |
| `BillingHistoryPanel` | `src/client/components/billing/BillingHistoryPanel.tsx` | Shows invoices, successful payments, and failed payments for the current customer. |
| `SubscriptionManagementPanel` | `src/client/components/billing/SubscriptionManagementPanel.tsx` | Lets authorized users review plan details, upgrade, downgrade, cancel, and retry failed payments. |
| `EnterpriseOverageNotice` | `src/client/components/billing/EnterpriseOverageNotice.tsx` | Warns the user when the next active team member triggers the first $5 overage charge. |

### Modified Components

| Component | Change |
|-----------|--------|
| `RegistrationPage` | Add plan selection, promo display, Stripe payment capture, and activation gating. |
| `SettingsPage` | Add subscription status, plan-change controls, and billing-history entry points. |
| `InviteTeamPage` | Add Enterprise overage warning before adding the 26th and later active users. |

---

## Success Criteria

1. 100% of paid customer registrations require successful Stripe payment before wxKanban activates the account.
2. 95% of payment-processing interactions complete in under 5 seconds, excluding third-party Stripe outages.
3. Failed payments are recorded and routed through retry and dunning workflow with no silent payment failures.
4. Enterprise accounts are warned before the 26th active user triggers the first additional $5 overage charge.
5. Authorized users can generate monthly billing statements and revenue projections from current subscription data.

---

## Key Entities

| Entity | Description |
|--------|-------------|
| `CompanySubscription` | Represents the Stripe-backed recurring plan chosen by a wxKanban company, including promo terms, status, and renewal state. |
| `SubscriptionBillingEvent` | Represents payment success, failed payment, retry, cancellation, webhook sync, and other billing lifecycle events. |
| `SubscriptionBillingHistoryRecord` | Represents a customer-visible invoice or payment outcome shown in billing history. |
| `EnterpriseOverageState` | Represents the active-user count and extra-billing condition for Enterprise subscriptions above 25 users. |

---

## Constraints

- MUST support only the three approved wxKanban subscription plans: Small/Medium Business, Consultant, and Enterprise.
- MUST treat Enterprise overage as the only supported usage-based charge, triggered by active users above 25.
- MUST block plan downgrades until enough users are set inactive to satisfy the target plan limit.
- MUST separate this scope from consulting-charge handling in spec 022.
- MUST require successful payment before initial activation.

---

## Notes

- No additional delivery constraints or risks were identified during discovery.
- Customer billing history is intentionally limited to invoices, successful payments, and failed payments.
- Customer-facing billing begins at registration and continues through plan changes and billing-history review.
- Dunning and retry are explicitly in scope and should be reflected in the billing lifecycle design even if customers do not see every retry event in history.

---

## Clarifications

### Session 2026-04-03

| # | Question | Decision |
|---|----------|----------|
| 1 | What business problem does this solve? | wxKanban does not currently have Stripe set up for payment processing in this product. |
| 2 | Who are the primary and secondary users? | Primary and secondary actors are the business-side admins; technical automation matters only for Enterprise over 25 users. |
| 3 | Where do charges come from? | Charges come only from the subscription itself and Enterprise overage after 25 active users. |
| 4 | How is success measured? | Zero silent failed payments, fast processing, monthly statements, and revenue projections. |
| 5 | What is in and out of scope? | Dunning and retry, registration-time billing, and customer billing history are in scope; consulting charges remain out of scope. |
| 6 | Are there constraints or risks right now? | None were identified at this time. |
| 7 | How should registration and overage work? | Customer chooses a plan during registration, payment must succeed, promo days are supported, and adding the 26th Enterprise user warns of the extra $5 fee. |
| 8 | What happens on downgrade and what does billing history show? | Downgrade is blocked until enough users are inactive; billing history shows invoices, successful payments, and failed payments. |