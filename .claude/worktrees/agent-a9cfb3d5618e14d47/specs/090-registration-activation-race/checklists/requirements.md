# Requirements Checklist: Registration Activation Race (Spec 090)

## Functional Requirements
- [ ] FR-001 — Inline `resyncSubscriptionFromStripe(companyId)` runs after the paid-tier `companysubscriptions` insert, before registration returns; paid signup is ACTIVE at return with no webhook. (T001)
- [ ] FR-002 — Reconcile is fail-open: any error is logged and swallowed; registration still succeeds; company stays PENDING on failure. (T001)
- [ ] FR-003 — Reuses SubscriptionRecoveryService mapping; already-target status → no change, no audit row; incomplete/unpaid never activates. (T002)
- [ ] FR-004 — A status change writes exactly one `company_status_history` audit row (previous/new/reason/changedByType/stripeStatus). (T002)
- [ ] FR-005 — Unknown-subscription activation events emit a structured, greppable warn (event type, stripeeventid, customer id, subscription id). (T003)

## Success Metrics
- [ ] 100% of paid signups with succeeded payment are ACTIVE at end of registration; 0 sit in PENDING > 60s (weekly).
- [ ] 0 registration failures from the reconcile; 0 duplicate history rows per activation (tests).
- [ ] 100% of unmatched activation events emit a warn record (observable count).

## Guardrails
- [ ] FREE / billing-exempt paths untouched (no reconcile, no Stripe call).
- [ ] PaymentService inline-activation paths untouched.
- [ ] `npm run check-types` clean; Spec 090 tests pass; `auditfences` clean for touched files.
- [ ] Nothing pushed until the user says push.
