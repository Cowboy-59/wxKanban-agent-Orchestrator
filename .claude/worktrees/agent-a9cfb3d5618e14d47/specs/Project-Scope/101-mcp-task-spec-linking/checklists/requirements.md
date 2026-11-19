# Requirements Checklist: MCP Task↔Spec Linking & Spec Lifecycle Transition

**Spec Number**: SCOPE-101
**Created**: 2026-07-18
**Source**: `specs/Project-Scope/101-mcp-task-spec-linking.md`

---

## Specification Quality

- [x] Overview clearly states WHAT and WHY (not HOW)
- [x] User scenarios cover primary, secondary, and edge cases
- [x] Functional requirements are numbered (FR-001, FR-002...)
- [x] Each FR has clear acceptance criteria
- [x] Success criteria are measurable and technology-agnostic
- [x] Scope boundaries are clearly defined
- [x] No implementation details in specification sections

## Completeness

- [x] Primary actor identified
- [x] Key value proposition stated
- [x] At least 3 user scenarios defined (5)
- [x] At least 3 functional requirements defined (6)
- [x] At least 3 success criteria defined (6)
- [x] Constraints documented

## Readiness for Pipeline

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Ready to break down into detailed specs via `/wxAI-pipeline`
- [x] Dependencies on other scopes identified (SPEC-028, SCOPE-042, SCOPE-097, SCOPE-058)

## Open decisions before implementation is "closed"

- [ ] Register SCOPE-101 / T001–T006 as DB task rows so the in-code fences resolve under `auditfences --strict`
- [ ] Decide whether to fold the gate-doc vocabulary reconciliation (`wxAI-implement-gate.md` / `projectrules.md` vs `policy.ts`) into this scope or a new one
- [ ] Decide whether the two new tools surface anywhere in the kit / Cockpit / help (currently tool-only)
- [ ] Authorize deploy (push to main auto-deploys the hosted MCP → production/customer)

---

## Amendment A — Issues 3 and 4 (added 2026-08-04)

### Amendment A — Specification Quality

- [x] Overview clearly states WHAT and WHY (not HOW)
- [x] User scenarios cover primary, secondary, and edge cases (US6–US10)
- [x] Functional requirements are numbered (FR-007–FR-012)
- [x] Each FR has clear acceptance criteria
- [x] Success criteria are measurable, with a stated baseline to measure against
- [x] Scope boundaries are clearly defined
- [x] Superseded content marked in place rather than deleted (4 markers)

### Amendment A — Completeness

- [x] Primary actor identified (the operator syncing spec artifacts to the Project Hub)
- [x] At least 3 user scenarios defined (5: US6–US10)
- [x] At least 3 functional requirements defined (6: FR-007–FR-012)
- [x] At least 3 success criteria defined (6: 7–12)
- [x] Constraints documented, including the two-deployment-surface amendment
- [x] Compliance context loaded and applied (SOC 2 CC8.1)

### Amendment A — Open decisions

- [ ] Register SCOPE-101 / T007–T012 as DB task rows alongside T001–T006
- [ ] Decide on the `created > 0 && updated == 0` safety guard (recorded Out of Scope; becomes FR-013 on request)
- [ ] Confirm T011's separator defect is real before fixing it — it has never been observed
- [ ] Authorize the kit release (T007, T009–T012 reach consumers only via `sync-to-orchestrator --release`, not a `main` push)

### Known gap

- [ ] This scope cannot be synced to the DB by `dbpush` — that is the very defect it describes. Sync via targeted MCP calls until FR-007 lands.

---

## Next Steps

1. Review and refine this scope document
2. Run `/scope-validate` to check quality
3. When ready, break down into detailed specs via `createSpecs` (T001–T006 already mapped; T007–T012 added by Amendment A)
