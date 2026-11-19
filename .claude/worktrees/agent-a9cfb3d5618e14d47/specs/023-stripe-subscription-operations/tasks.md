# Tasks: Stripe subscription operations (Spec 023)

Chunk I only — FR-002a (invite-bound signup promotions) + FR-002b (no
client-supplied promo). Added 2026-07-15.

**Why this file starts at T101, and why it is partial.** SCOPE-023 predates the
code-fencing convention (spec 026) and never had a `specs/023-*/` folder, so its
earlier chunks (A–H) are tracked as lettered tasks in the scope doc and their
code is legacy un-fenced. `auditfences` resolves fence task IDs against
`specs/<scope>-*/tasks.md`, so Chunk I's fenced code needs real task rows here.
Chunk I tasks I.1–I.12 in the scope doc map to **T101–T112**, leaving T001–T099
free should chunks A–H ever be back-filled as numbered tasks.

Scope doc: `specs/Project-Scope/023-stripe-subscription-operations.md`
(see "Design Decisions (2026-07-15)" and "Chunk I Tasks").

| # | Task | Priority | Status | FRs |
|---|------|----------|--------|-----|
| T101 | Fix the Stripe trial path — expand pending_setup_intent, return intentType | high | done | FR-002 |
| T102 | Thread intentType through PaymentService + subscribe response | high | done | FR-002 |
| T103 | StripePaymentForm confirmSetup branch | high | done | FR-002 |
| T104 | Promo copy at registration (free for N days, then $X on date) | high | done | FR-002 |
| T105 | Webhook: map trialing → TRIAL; ignore $0 trial invoice | high | done | FR-002, FR-006 |
| T106 | signupinvitations table + migration (hashed token) | high | done | FR-002a |
| T107 | SignupInvitationService — create/resolve/atomic burn/revoke/list | high | done | FR-002a |
| T108 | Public GET /payment/registration/invite/:token resolve endpoint | high | done | FR-002a |
| T109 | Bind promo to token; remove promoDaysOverride; enforce email binding | high | done | FR-002a, FR-002b |
| T110 | SysAdmin mint UI + routes + promo-invite email template | high | done | FR-002a |
| T111 | Rate limit invite resolve / register / subscribe | medium | done | FR-002a |
| T112 | Verify: Stripe test clock to trial end, concurrent redemption, hole closed | high | partial | FR-002, FR-002a, FR-002b |
| T113 | Cap promo at 2 months (MAX_PROMO_DAYS=60), enforced server-side | high | done | FR-002a |
| T114 | Preview + edit the invitation email before sending | high | done | FR-002a.1 |
| T115 | SysAdmin nav: Invitations tab (page shipped with no link) | high | done | FR-002a |
| T116 | Send the invitation in any supported language | high | done | FR-002a.2 |
| T117 | Language picker translates the admin's message too (was left in English) | high | done | FR-002a.2 |

## T101 — Fix the Stripe trial path
In `src/server/lib/stripe.ts` `createRegistrationSubscription`, expand
`pending_setup_intent` alongside `latest_invoice.payment_intent` and return the
secret from whichever Stripe actually produced, plus an `intentType`
discriminator derived from that (never from the trial length). A trialing
subscription's first invoice is $0, so Stripe issues no PaymentIntent — the old
code only read `latest_invoice.payment_intent` and threw, which is why any
non-zero promo hard-failed registration. Send
`trial_settings.end_behavior.missing_payment_method: "cancel"` when trialing.
Also removed an invalid `expand: ["latest_invoices.payment_intent"]` (plural) in
`createSubscription`, whose result was never read.

## T102 — Thread intentType
Add `intentType` to `RegistrationSubscriptionResponse` and
`CardUpdateSubscriptionResponse`; both routes already spread the service result.

## T103 — confirmSetup branch
`stripe.confirmPayment` errors against a `seti_` secret, so the client must
follow the server's `intentType`. The Elements provider is clientSecret-driven
and needs no change.

## T104 — Promo copy (FR-002 AC#2)
Render the promo effect from the already-returned-but-previously-unread
`trialEnd`, and stop labelling the button "Complete Payment" when nothing is
charged. Keys added to all six locales.

## T105 — Webhook trialing
`StripeWebhookHandler` never mapped Stripe's `trialing` while
`SubscriptionRecoveryService.mapStripeToCompanyStatus` maps it to `TRIAL`, so
three code paths disagreed about a trialing subscription. Map it, and stop the
$0 trial invoice from flipping the company ACTIVE or writing a bogus
`payment_success` history row.

## T106 — signupinvitations table
Not modelled on `userinvitations` (NOT NULL FK to companies.id; a signup invite
has no company yet). Token stored as sha256 following
`emailverificationtokens` — the existing invite tables store tokens in plaintext.
Status values keep `revoked` and `expired` distinct.

## T107 — SignupInvitationService
`burnSignupInvitation` is a conditional UPDATE guarded on `status='pending'`,
run inside the caller's transaction. Both existing invite flows read-then-write
with no transaction, so concurrent redemptions can both pass validation;
`engagementinvitations` only survives that via a unique constraint. A signup
invite has no such backstop — a double-submit would create two companies and two
admin users.

## T108 — Public resolve endpoint
Validates without consuming. Returns an opaque 404 for every rejection: naming
the reason to an anonymous caller confirms a valid token exists. The specific
reason is surfaced at `/auth/register`, where the caller already holds the token.

## T109 — Bind promo to token, close the hole (FR-002b)
`promoDaysOverride` was accepted from the body of the public unauthenticated
`POST /payment/registration/subscribe` and beat the stored global setting, so
`?promo=365` self-granted a free year. Removed; the schema is now `.strict()` so
a stale client fails loudly. Promo + plan resolve server-side from the token.
`adminEmail` must equal the invited address. The burn shares the company-insert
transaction — company first (FK), burn second as the gate.

## T110 — SysAdmin mint surface
`POST`/`GET`/`DELETE /api/sysadmin/signup-invitations` + page. The link is
returned once (only its hash is stored). Email send outcome is reported, not
swallowed: `sendEmail` silently no-ops when `SMTP_HOST` is unset.

## T111 — Rate limiting
`/auth/register` had no rate limit and is now the redemption point. The limiter
is in-memory, so per-instance only — a speed bump on top of the 32-byte token,
not the lock.

## T112 — Verification (partial)

**Done — Stripe path verified against test mode with a test clock (2026-07-15), 12/12:**
every assumption behind T101 confirmed — with `trial_period_days` +
`payment_behavior:"default_incomplete"` Stripe returns **no** PaymentIntent, a
`pending_setup_intent`, a $0 opening invoice and a `seti_` secret. So the
pre-fix code really did throw on every promo signup, and `confirmSetup` is
required. Advancing the clock past a 60-day trial: subscription → `active`, a
real `subscription_cycle` invoice for **$39.95 paid**. The day-61 revenue risk is
retired.

Non-obvious finding worth keeping: `save_default_payment_method:"on_subscription"`
populates `subscription.default_payment_method` **asynchronously**. It reads
`null` immediately after `confirmSetup` (which looks like a serious fault and
isn't) and is set by trial end. `customer.invoice_settings.default_payment_method`
stays null throughout. Verify with a test clock, not by reading the field
straight after confirm.

**Migration 0050 applied to production 2026-07-15** and verified: 13 columns,
`uk_signupinvitations_tokenhash` unique, both FKs `ON DELETE SET NULL`, 0 rows.

**Knowingly skipped (product owner, 2026-07-15):** the concurrent-redemption race
against a real database. The single-use guarantee therefore rests on the mocked
unit tests in `tests/unit/scope023-signup-invitations.test.ts` plus standard
Postgres `UPDATE … WHERE status='pending'` row-lock semantics — both sound, but
never exercised by two real writers. If a double-submit ever produces two
companies from one invitation, start here. Reproducing it needs a non-prod
Postgres; it was not run against production on purpose.

**Also open:** the end-to-end wizard run (mint an invite → open the link → pay →
land in TRIAL) has not been driven in a browser.

## T113 — Cap promo at 2 months

`MAX_PROMO_DAYS = 60`, enforced in `SignupInvitationService.createSignupInvitation`
and the sysadmin zod schema; the dropdown offers only 1–2 months. Product decision
2026-07-15. Enforced rather than left as convention because the failure mode is
silent and expensive: a mis-typed "12" hands out a free year and nobody finds out
until the charge that never came.
