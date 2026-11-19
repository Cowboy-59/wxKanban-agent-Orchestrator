# Plan: Customer Welcome Message (Spec 109)

**Spec**: 109 · SCOPE-109 · 11 tasks across 4 phases.

## Approach

Build the send path first and everything else around it. The single riskiest thing here is not the UI — it is that a welcome must be delivered **exactly once per person**, must **never disrupt** an activation or an invitation acceptance, and must **not silently drain** a finite link. So the order is: get the data guarantees right, then the one shared send function, then the surfaces, then attach the triggers last.

There is exactly one code path that sends a welcome — `sendWelcomeTo(person, trigger)`. Both triggers, the backfill and the retry all call it. Nothing else may send a welcome. This is what stops dedupe and capacity rules from drifting apart between four callers.

Capacity and dedupe are deliberately one primitive: a conditional UPDATE guarded on `linkconsumed < linkcapacity`, executed in the same transaction as the `welcomesends` insert whose partial unique index enforces once-per-person. If either rejects, nothing is sent. That gives correctness under concurrency without any locking of our own, and it is the piece to get right before anything else is built on top.

## Phases

### Phase A — Data + the one send path (FR-001, 004, 005, 006, 007, 009)

The foundation. Two tables plus the migration carrying the partial unique index, the standing-record service, and `sendWelcomeTo` with its atomic claim, SES delivery, and capacity release on failure. Nothing user-visible ships in this phase; it is the correctness layer.

### Phase B — Surfaces (FR-002, 003, 010)

The SYSADMIN routes and the Welcome tab, both modelled directly on the newsletter equivalents. Test send lands here because it exercises the compose surface without touching the send guarantees.

### Phase C — Triggers, backfill, retry (FR-005, 006, 008, 011)

Attach to the two existing once-only hook points, add the throttled backfill runner, and add retry of failures. Triggers go last on purpose: by this point the send path is already proven, so attaching them is a small, low-risk change to two live code paths.

### Phase D — Verification (cross-cutting)

Unit tests on the pieces that are hard to eyeball — capacity arithmetic, the once-per-person constraint under retry, and the failure-releases-capacity rule — plus build verification.

## Key files / seams

- `src/db/schema/welcomemessages.ts`, `src/db/schema/welcomesends.ts` — new tables; index registered in `src/db/schema/index.ts`.
- `src/db/migrations/` — generated migration; the partial unique index is hand-checked because Drizzle's generator does not always express partial indexes.
- `src/server/services/WelcomeMessageService.ts` — the standing record, publish, test send, and the single `sendWelcomeTo`.
- `src/server/routes/welcome.ts` — SYSADMIN routes, mounted in `src/server/app.ts` alongside `newsletter.ts`.
- `src/server/lib/ses.ts` — reused sender; no changes expected.
- `src/server/services/StripeWebhookHandler.ts` — the PENDING→ACTIVE transition; the subscription trigger attaches here.
- `src/server/services/InvitationService.ts` — post-acceptance user creation; the invitation trigger attaches here.
- `src/client/pages/SysAdmin/marketing/Welcome.tsx` + `MarketingTabs.tsx` — the new tab.

## Risks & mitigations

**A send failure breaks a payment or an invite.** The two triggers touch live billing and onboarding paths. Mitigation: both call `sendWelcomeTo` fire-and-forget inside a catch that can only log — the welcome can never throw into the caller. Attaching the triggers is deliberately the last code change, after the send path is proven.

**A transient SES failure strands a customer forever.** Direct SES has no retry. Mitigation: the unique index is partial (successful sends only) so a `failed` row never bars a later success, and FR-011 provides retry. These two are load-bearing, not polish.

**A run of failures silently empties the link.** Capacity is claimed before SES confirms. Mitigation: failure releases the claim; verified by test.

**Double-send under concurrency.** A trigger firing while the backfill runs. Mitigation: the DB constraint is the arbiter, not application logic; the insert simply loses and no email goes out.

**Emailing a test account.** `PENDING` companies include a deliberate test account. Mitigation: FR-008 restricts eligibility to active-subscription companies.

## Constraints

TypeScript with no `any`, Pino only, Drizzle + UUID v7, lowercase concatenated names. Every endpoint SYSADMIN-gated. Backfill reuses the newsletter throttle. Fences `[SCOPE 109 / T0xx]` on all new top-level declarations.
