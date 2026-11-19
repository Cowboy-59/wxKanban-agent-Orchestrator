# Requirements Checklist: 117-schema-integrity-eliminate-schema-drift

**Spec Number**: 117
**Created**: 2026-07-31
**Source**: `specs/Project-Scope/117-schema-integrity-eliminate-schema-drift.md`

---

## Specification Quality

- [x] Overview clearly states WHAT and WHY (not HOW)
- [x] User scenarios cover primary, secondary, and edge cases
- [x] Functional requirements are numbered (FR-001 … FR-007)
- [x] Each FR has clear acceptance criteria
- [x] Success criteria are measurable and technology-agnostic
- [x] Scope boundaries are clearly defined
- [x] No implementation placeholders remain in required sections

## Completeness

- [x] Primary actor identified
- [x] Key value proposition stated
- [x] At least 3 user scenarios defined (5 defined)
- [x] At least 3 functional requirements defined (7 defined)
- [x] At least 3 success criteria defined (7 defined)
- [x] Constraints documented (C-1 … C-9)
- [x] Integration context documented
- [x] Compliance requirements documented (SOC2: CC7.1, CC8.1, CC6.1, CC7.2)

## Readiness for Pipeline

- [x] No [NEEDS CLARIFICATION], TODO, or TBD markers remain in required sections
- [ ] Scope clears the `validatescope` quality gate
- [x] Business context and actors are implementation-ready
- [x] Dependencies on other scopes identified (none blocking; orphan cleanup blocked on PPE conversion)

## Scope-Specific Safety Gates

These are non-negotiable before any implementation task touches the database.

- [ ] Target database verified before every `drizzle-kit` invocation (C-1 — local `.env` points at PRODUCTION)
- [ ] `drizzle-kit push` confirmed NOT used at any point (C-2 — would propose dropping all 27 orphan tables)
- [ ] Baseline rehearsed against a restored non-production copy before production (FR-004)
- [ ] Pre-change snapshot captured: 125 tables, `marketingcontacts` 1,006 rows, `capabilityindex` 4,002 rows
- [ ] Post-change verification: exactly 131 tables, both row counts unchanged
- [ ] No orphan table dropped (C-9 — blocked on PPE conversion)

---

## Next Steps

1. Run `validatescope 117` to confirm the quality gate
2. Proceed to `createspecs` only after the scope clears the gate
3. Implement via `implement 117/<task>` — fences are written by the orchestrator only
