# Requirements Checklist: Lifecycle Documentation Consolidation

**Spec Number**: 048
**Created**: 2026-06-14
**Source**: `specs/Project-Scope/048-lifecycle-consolidation.md`

---

## Specification Quality

- [x] Overview clearly states WHAT and WHY (not HOW)
- [x] User scenarios cover primary, secondary, and edge cases
- [x] Functional requirements are numbered (FR-001 … FR-006)
- [x] Each FR has clear acceptance criteria
- [x] Success criteria are measurable and technology-agnostic
- [x] Scope boundaries are clearly defined
- [x] No implementation details in specification sections

## Completeness

- [x] Primary actor identified
- [x] Key value proposition stated
- [x] At least 3 user scenarios defined (4)
- [x] At least 3 functional requirements defined (6)
- [x] At least 3 success criteria defined (3 metrics + 7 acceptance-level checks)
- [x] Constraints documented

## Readiness for Pipeline

- [x] No [NEEDS CLARIFICATION] markers remain
- [ ] Ready to break down into detailed specs via `createSpecs`
- [x] Dependencies on other scopes identified (021)

---

## Decisions Locked During buildscope (2026-06-14)

- [x] Target shape = per-project only; retire the legacy aggregate
- [x] HARD INVARIANT = per-project auto-generation on scope/spec/task CRUD is preserved, untouched
- [x] Retire: `GET /api/lifecycle`, `LifecyclePanel`, `LifecyclePage`, `specs/projectlifecycle.md`, `push-lifecycle.mjs`
- [x] Fix the doctype `ProjectLifecycle` collision by removal (per-project generator = sole writer)
- [x] Update CLAUDE.md lifecycle conventions to the per-project generator; retire the old file/push path
- [x] Delete the dead `specs/projectlifecycle.md` file (no reader after route removal)
- [x] Preserve BOTH generator modules (server `ProjectLifecycleGenerator` + MCP-side generator)
- [x] Operational: one-time `generate-project-lifecycle.ts --all` after deploy (hygiene, not a feature)

---

## Next Steps

1. Review the generated scope document
2. When ready, break down into detailed specs via `createSpecs`
3. Implement via `implement`; verify FR-001 with a before/after auto-generation check
