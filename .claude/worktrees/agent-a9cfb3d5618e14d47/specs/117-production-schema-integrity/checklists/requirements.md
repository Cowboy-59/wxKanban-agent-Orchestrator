# Requirements Checklist: Spec 117 — Production Schema Integrity

**Spec Number**: 117
**Created**: 2026-07-31
**Source**: `specs/117-production-schema-integrity/spec.md`
**Scope**: `specs/Project-Scope/117-schema-integrity-eliminate-schema-drift.md`
**Preflight Score**: 100 / 100 (`valid`)

---

## Specification Quality

- [x] Overview states WHAT and WHY, not HOW
- [x] Business problem is evidenced, not asserted (9 dated error bursts, RDS metrics, deploy timing)
- [x] Actors use canonical `- Primary:` / `- Secondary:` labels
- [x] User scenarios cover primary, secondary, and edge cases
- [x] Functional requirements numbered FR-001 … FR-007
- [x] Each FR has testable acceptance criteria
- [x] Success criteria measurable — every metric carries a number or threshold
- [x] Scope boundary and out-of-scope both explicit
- [x] Open questions recorded rather than papered over
- [x] No TODO / TBD / NEEDS CLARIFICATION markers

## Completeness

- [x] Primary actor identified
- [x] Key value proposition stated
- [x] ≥ 3 user scenarios (5 in scope doc)
- [x] ≥ 3 functional requirements (7)
- [x] ≥ 3 success criteria (7)
- [x] Constraints documented (C-1 … C-9 in scope doc)
- [x] Integration context documented
- [x] Compliance requirements mapped (SOC2 CC7.1, CC8.1, CC6.1, CC7.2)
- [x] Tasks created and linked to spec (18)

## Readiness for Implementation

- [x] Preflight passed (score 100)
- [x] Tasks phased by risk, with Phase 1 shippable independently
- [x] Hard gate defined (T010 rehearsal before T011 production DDL)
- [x] Verification baseline captured before any change
- [ ] Implementation begun via `implement 117/<task>`

## Safety Gates — must be checked at execution time

These are non-negotiable. Each one exists because of a specific, documented hazard.

- [ ] `DATABASE_URL` target verified before **every** `drizzle-kit` invocation
      *(C-1 — the local `.env` points at PRODUCTION)*
- [ ] `drizzle-kit push` confirmed **not** used at any point
      *(C-2 — would propose dropping all 27 orphan tables incl. `marketingcontacts`)*
- [ ] T010 rehearsal against a restored non-production copy completed and clean
      *(FR-004 — highest-risk step)*
- [ ] Generated migration SQL reviewed for DROP / ALTER before apply
      *(T012 — must be purely additive)*
- [ ] Pre-change snapshot captured: 125 tables, `marketingcontacts` 1,006, `capabilityindex` 4,002
- [ ] Post-change verification: exactly 131 tables, both row counts unchanged
- [ ] No orphan table dropped
      *(C-9 — blocked on PPE conversion)*
- [ ] Detector observed **failing** against real production state before being trusted
      *(T008 — a detector only ever seen passing is unproven)*

## Notes

The `42P01` from the missing `complianceflags` table is **not** resolved by Phase 1 — only the
`22P02` sentinel is. Full resolution of the Consultant Hub incident requires Phase 3 (T012–T014).
Phase 1 is independently shippable, but shipping it alone leaves the customer-facing 500 in place.

---

## Next Steps

1. `implement 117/T001` — fences are written by the orchestrator only
2. Ship Phase 1 (T001–T005) once verified
3. Build and prove the detector (T006–T008) before touching production DDL
4. Rehearse, then execute Phase 3 behind the T010 gate
