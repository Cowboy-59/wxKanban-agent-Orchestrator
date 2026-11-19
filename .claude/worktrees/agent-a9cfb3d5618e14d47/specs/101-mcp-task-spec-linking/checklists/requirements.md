# Requirements Checklist: MCP Task Spec Linking

**Spec Number**: 101
**Created**: 2026-08-04
**Source**: `specs/Project-Scope/101-mcp-task-spec-linking.md` (incl. Amendment A)

---

## Specification Quality

- [x] Overview clearly states WHAT and WHY (not HOW)
- [x] User scenarios cover primary, secondary, and edge cases (US1–US10 in the scope)
- [x] Functional requirements are numbered (FR-001 … FR-012)
- [x] Each FR has clear acceptance criteria
- [x] Success criteria are measurable, each with a stated baseline to measure against
- [x] Scope boundaries are clearly defined
- [x] No implementation details in specification sections

## Completeness

- [x] Primary actor identified
- [x] Secondary actors identified
- [x] At least 3 user scenarios defined (10)
- [x] At least 3 functional requirements defined (12)
- [x] At least 3 success criteria defined (7)
- [x] Constraints documented
- [x] Compliance context loaded and applied (SOC 2, CC8.1)

## Preflight

- [x] Verified locally against `shared/preflight` **before** calling `create_specs`
- [x] Score **100**, `isValid: true`
- [x] 0 blocking issues, 0 missing sections, 0 warnings, 0 placeholder markers
- [x] Server-side preflight confirmed the same score on the live call

## Readiness for Pipeline

- [x] No clarification markers remain
- [x] Dependencies identified (SPEC-028, SCOPE-042, SCOPE-097)
- [x] Spec row created (`eb918170-1b58-41b8-8b06-0514db7de830`), status `implementing`
- [x] 12 tasks created and linked to the spec
- [x] Lifecycle generated; project lifecycle updated

## Open decisions

- [ ] Should the `created > 0 && updated == 0` guard become FR-013? (Offered, deliberately not taken up)
- [ ] Confirm T011's separator defect is real before fixing — it has never been observed
- [ ] Authorize the kit release (T007, T009–T012 reach consumers only via `sync-to-orchestrator --release`, not a `main` push)
- [ ] Verify the `[SCOPE 101 / T001..T006]` fences now resolve under `auditfences --strict`

## Known constraint

- [ ] **This spec cannot be synced by `dbpush`** — that is the defect it fixes. Use targeted MCP calls until FR-007 lands.
