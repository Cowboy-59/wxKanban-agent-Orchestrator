# Requirements Checklist: 127-test-pipeline-stack-adapters

**Spec Number**: 127
**Created**: 2026-08-22
**Source**: `specs/Project-Scope/127-test-pipeline-stack-adapters.md`
**Interview**: interactive buildscope, section-by-section, approved through all six sections 2026-08-22

---

## Specification Quality

- [x] Overview clearly states WHAT and WHY (not HOW)
- [x] User scenarios cover primary, secondary, and edge cases (US1 happy path, US2 generation, US3 safety edge, US4 no-server posture)
- [x] Functional requirements are numbered (FR-001 … FR-015)
- [x] Each FR has clear acceptance criteria
- [x] Success criteria are measurable and technology-agnostic (SC-1 … SC-8; SC-2, SC-4 and SC-5 are machine-checkable)
- [x] Scope boundaries are clearly defined (against SCOPE-111, SCOPE-120, SCOPE-047)
- [x] No implementation details in specification sections

## Completeness

- [x] Primary actor identified (the AI agent executing `/implement` on a non-wxKanban stack)
- [x] Key value proposition stated
- [x] At least 3 user scenarios defined — **4**
- [x] At least 3 functional requirements defined — **15**
- [x] At least 3 success criteria defined — **8**
- [x] Constraints documented (delivery mechanisms, kit sync, SPEC-121 dependency, compliance, SCOPE-117)
- [x] Risks documented (RISK-1 blast radius, RISK-2 generation quality, RISK-3 fixture-only verification)
- [x] Compliance Requirements section present (SOC 2 CC7.1 → FR-014)

## Readiness for Pipeline

- [x] No `[NEEDS CLARIFICATION]` markers remain
- [x] Dependencies on other scopes identified (SPEC-121 blocking; SCOPE-026, SCOPE-117 procedural)
- [x] Decisions recorded so they are not re-litigated (Notes → 9-row decision table)
- [x] Analyst assumptions stated explicitly (SC-7 window; two hand-authored postures)
- [x] ADR written for the hard-to-reverse decision (`docs/adr/0001-…`)
- [x] `CONTEXT.md` updated — 2 terms added (Stack Adapter, Database Posture)
- [ ] Ready to break down into detailed specs via `createSpecs`

---

## Known issues to resolve before `createSpecs`

- [ ] **Scope-number mismatch between disk and database.** `project.buildscope` assigned **126**, which collides with the existing on-disk `126-customer-data-sovereignty-audit-readines.md`. The disk file for this scope is **127**. The database record must be renumbered to 127, or the two will disagree permanently.
- [ ] **Server-generated FR section was boilerplate and was replaced by hand.** `project.buildscope` emitted six template FRs ("Primary workflow support", "Business rule enforcement", "Visibility for affected actors", "Integration alignment", "History and traceability", "Reporting and operational review") and three generic scenarios, while the real content landed in the Clarifications table. The on-disk file carries the real 15 FRs and 4 scenarios. **The database copy still carries the boilerplate** and must be re-pushed before `createSpecs` fans out from it.
- [ ] **Release ordering.** This scope cannot release before SPEC-121 (2026-08-23), which FR-007 depends on.

---

## Next Steps

1. Renumber the database record 126 → 127 and re-push the corrected document
2. Run `validatescope` against the corrected document
3. `createSpecs` — **read the FR section first** and confirm it carries the real 15 requirements, not the template six
