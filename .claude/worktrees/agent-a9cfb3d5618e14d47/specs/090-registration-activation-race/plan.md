# Plan: Registration Activation Race (Spec 090)

**Scope**: SCOPE-090 · **Phase**: design → implementation · **Priority**: high
**Depends on**: SCOPE-085 (SubscriptionRecoveryService, webhook secret fix, company_status_history), SCOPE-023 (StripeWebhookHandler, companysubscriptions)

## Strategy

Reuse, don't reinvent. The reconcile-from-Stripe machinery already exists and is idempotent and audited (`resyncSubscriptionFromStripe`). The fix is to invoke it at the one moment we know the payment has already succeeded — right after the registration flow persists the subscription row — so first activation no longer depends on webhook delivery order. Webhooks remain authoritative for all later lifecycle changes.

## Changes

### 1. RegistrationService (root cause) — `src/server/services/RegistrationService.ts`
After the `hasStripeSubscription` block inserts the `companysubscriptions` row (~line 390), add a single fail-open `try/catch` call to `resyncSubscriptionFromStripe(companyId)`. On success it flips `companies.subscriptionstatus PENDING → ACTIVE`, `activeflag = true`, and `companysubscriptions.status incomplete → active` (+ period end), and writes the audit row. On any error it logs (Pino) and swallows — registration still returns success. The `status: "incomplete"` insert and the "webhook flips status later" comment stay. (FR-001, FR-002)

### 2. Reconcile service (reuse) — `src/server/services/SubscriptionRecoveryService.ts`
`resyncSubscriptionFromStripe(companyId, { changedBy })` is used as-is; its `companyChanged`/`subChanged` guards already give idempotency and the audit insert. Decide `changedBy`/`changedByType` for the system-initiated call (null → SYSADMIN default is acceptable for v1; a SYSTEM type is optional). (FR-003, FR-004)

### 3. Webhook visibility — `src/server/services/StripeWebhookHandler.ts`
In `handleStripeEvent`, when `resolveCompanySubscription` returns null for an activation-relevant event, enrich the existing warn to include event type, `stripeeventid`, customer id, and (where extractable) subscription id, so pre-row drops are correlatable and countable. No change to activation branches or signature verification. (FR-005)

### 4. Not in scope
`PaymentService.confirmSubscriptionCardUpdate` and `processSubscription` already set `subscriptionstatus = ACTIVE` inline — no change.

## Verification gates

- Local: run against the same prod DB + live Stripe (`.env`) — a paid registration reaches ACTIVE at return; simulated Stripe error leaves registration OK + PENDING.
- `npm run check-types` clean; new tests pass (see tests.md).
- `wxkanban-agent auditfences` clean for touched files.
- Nothing pushed until the user says push (App Runner deploys app + MCP on push).

## Conventions

Routes via `index.ts → app.ts`; DB via `src/db/client.ts`; 100% TypeScript (no `any`/`@ts-ignore`); Pino-only logging; Stripe key `STRIPE_API_KEY` (`sk_live_`) + `STRIPE_CC_PROCESSING_ENABLED=true` from App Runner console; code fences written by the orchestrator at `implement`.
