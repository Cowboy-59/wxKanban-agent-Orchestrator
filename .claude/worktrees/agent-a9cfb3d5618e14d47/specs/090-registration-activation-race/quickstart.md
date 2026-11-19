# Quickstart: Registration Activation Race (Spec 090)

## What this fixes
Paid signups that stay PENDING because Stripe's activation webhooks fired before the `companysubscriptions` row existed. Fix = reconcile from Stripe inline at registration (fail-open), so first activation doesn't race the webhook.

## Files
- `src/server/services/RegistrationService.ts` — add fail-open `resyncSubscriptionFromStripe(companyId)` after the paid-tier row insert (~line 390).
- `src/server/services/SubscriptionRecoveryService.ts` — reused as-is (`resyncSubscriptionFromStripe`).
- `src/server/services/StripeWebhookHandler.ts` — enrich the unknown-subscription warn for activation events.

## Manual reconcile (already available, unchanged)
The sysadmin path remains the fallback:
- Per company: `POST /api/sysadmin/companies/:id/resync-subscription`
- Bulk: `POST /api/sysadmin/subscriptions/resync` (body `{ "dryRun": true }` to preview)
- Programmatic: `resyncSubscriptionFromStripe(companyId)` / `resyncPendingSubscriptions({ dryRun })`

## Verify locally
`.env` points at the prod DB with `STRIPE_API_KEY=sk_live_…` and `STRIPE_CC_PROCESSING_ENABLED=true`.
- Dry-run bulk reconcile to confirm no standing drift.
- After implementing T001, a paid registration should return with the company ACTIVE.
- `npm run check-types` and the Spec 090 tests must pass; `wxkanban-agent auditfences` clean for touched files.

## Guardrails
- Nothing pushed until the user says push (push deploys app + MCP on App Runner).
- Reconcile must never block registration (fail-open).
