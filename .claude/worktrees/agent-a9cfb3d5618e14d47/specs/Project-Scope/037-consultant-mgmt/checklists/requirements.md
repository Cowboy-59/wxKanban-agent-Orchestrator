# Requirements Checklist: Consultants Management (Engagement Core)

**Spec Number**: 037
**Created**: 2026-05-26
**Source**: `specs/Project-Scope/037-consultant-mgmt.md`

---

## Specification Quality

- [x] Overview clearly states WHAT and WHY (not HOW)
- [x] User scenarios cover primary, secondary, and edge cases (4 scenarios: US1 happy path, US2 mid-flight modification, US3 lifecycle states, US4 solo auto-provision)
- [x] Functional requirements are numbered (FR-001 through FR-028)
- [x] Each FR has clear acceptance criteria
- [x] Success criteria are measurable and technology-agnostic (SC-1 through SC-7)
- [x] Scope boundaries are clearly defined (IN/OUT lists in Core Design + Section 6)
- [x] No implementation details in specification sections (data model + API routes in Technical Specifications, not in FRs)

## Completeness

- [x] Primary actor identified (Client Company ADMIN)
- [x] Key value proposition stated
- [x] At least 3 user scenarios defined (4 scenarios)
- [x] At least 3 functional requirements defined (28 FRs in 8 groups A–H)
- [x] At least 3 success criteria defined (7 success criteria)
- [x] Constraints documented (technical, business, dependencies, risks, compliance)

## Readiness for Pipeline

- [ ] No `[NEEDS CLARIFICATION]` markers remain — verify before `createSpecs`
- [ ] Dependencies on other scopes identified (020, 023, 005, 002/003, 013, 026 — listed in Dependencies section)
- [x] Stub charters created for downstream scopes (038, 039, 040, 041)
- [ ] CONTEXT.md updated with new terms (Consulting Company, Client Company, Engagement, Engagement Assignment, Sub-Assignment, Consulting Member, B2B Invoice; User entry refined)

## Compliance Coverage (SOC 2)

- [x] CC6.1 Logical access controls — covered by FR-011, FR-013, SC-3
- [x] CC6.2 Identity verification prior to access — covered by FR-001 AC3, FR-002 AC1/AC2
- [x] CC6.3 Access removal timeliness — covered by FR-004 AC2/AC3, SC-6
- [x] CC7.2 Incident response readiness — covered by SC-7 audit-evidence trail
- [x] Confidentiality (TSC C1.x) — covered by FR-016 aggregate-only billing, FR-009 AC3

## Cross-Scope Reconciliation

- [x] Spec 002 (Admin) — invitation pattern extended cleanly; no conflict
- [x] Spec 003 (Registration) — accept flow pattern reused; new endpoint distinct (`/api/engagements/invite/:token/accept` vs `/api/team/invite/:token/accept`)
- [x] Spec 005 (Time and Billing) — soft dependency; Consulting Co. must have hourly rate configured for invoice flow
- [x] Spec 013 (Audit) — `companyauditlogs` reused; no schema change needed
- [x] Spec 020 (Consultant Work Hub) — hard dependency for FR-021 only; FR-021 explicitly marked "pending 020 completion"
- [x] Spec 023 (Stripe) — soft dependency; auto-provisioned solo Consulting tenants land on free/trial state
- [x] Spec 026 (Code Fencing) — implementation must follow BEGIN/END fence convention

## Open Risks Acknowledged

- [x] Dual-persona context for CONSULTANT-tier admins — user's responsibility, not all billing flows through wxKanban
- [x] PM-sync ownership of upstream delete — owned by spec 020
- [x] `engagementinvitations` retained indefinitely for provenance
- [x] "Needs reassignment" queue protected by FR-028 (at-least-one-ADMIN invariant)

---

## Next Steps

1. Review and refine this scope document before pipeline.
2. Run `createSpecs 037` to produce detailed `spec.md` / `plan.md` / `tasks.md` / `tests.md` / `quickstart.md` under `specs/037-consultant-mgmt/`.
3. Run `validateScope 037` to verify quality before implementation begins.
4. Implementation tasks must include explicit "wire `engagementsRoutes` into `src/server/app.ts`" step (preventing the orphaned-route class of bug seen on commits c18ee7a / c03c524).
