# Plan: Test Pipeline Stack Adapters

**Spec**: 127 · **Spec ID**: `ac79dae6-28e9-4ed2-a3bf-2ac0d199dada`

Materialized from the database alongside `spec.md` and `tasks.md`. The scope document at
`specs/Project-Scope/127-test-pipeline-stack-adapters.md` is the authority; this file exists
because the orchestrator requires it and reads it as proof the spec has been planned.

## Approach

Cut the adapter seam through all three pipeline layers — `wxCreateTestPlan`, `implement`
Phase 5b and `/preTest` — so machinery is resolved per stack rather than hard-coded to
wxKanban's own. An unmatched stack generates a candidate adapter and proceeds automatically;
blocking and trust are deliberately separated.

**FR-005 and FR-013 are load-bearing.** Without them this scope makes a confident wrong answer
easier to obtain than it is today, which is the failure the subsystem exists to prevent.

## Constraints

- Kit sync mirrors the **filesystem**, not git. A generated adapter landing in the wxKanban tree
  would ship to a public release, so shipped and generated adapters must live in different
  trees: `_wxAI/` ships (KIT_DIRS), `.wxai/` does not.
- TypeScript throughout; fences written by the orchestrator only.
- This scope changes only how machinery is RESOLVED. It does not touch what SCOPE-111,
  SCOPE-120 or SCOPE-047 own.

## Task sequence

- **T001** — Relocate the adapter directory so all three layers read one place
- **T002** — Build the shared adapter-resolution service (FR-001)
- **T003** — Adapter contract validation — six answers or hard-stop (FR-008)
- **T004** — Phase 5b resolves its seeding form from the adapter (FR-002)
- **T005** — /preTest resolves database posture from the adapter (FR-003)
- **T006** — Posture boundary enforcement — schema and file postures (FR-009)
- **T007** — /preTest resolves the UI driver from the adapter (FR-004)
- **T008** — UI driver must PROVE it drove something before any UI result (FR-005)
- **T009** — Provenance reporting — shipped / provisional / approved (FR-010)
- **T010** — Generate a candidate adapter from stack.md and proceed automatically (FR-006)
- **T011** — Persist, reuse and preserve a generated adapter (FR-007)
- **T012** — Provisional-to-approved status lifecycle on user-added adapters
- **T013** — Generation cannot bypass the existing guards (FR-013)
- **T014** — Reference adapter: Expo / React Native (FR-011)
- **T015** — Reference adapter: Electron / embedded SQLite (FR-012)
- **T016** — Security test cases per adapter — SOC 2 CC7.1 (FR-014)
- **T017** — Document the adapter contract for hand-authoring (FR-015)
- **T018** — Prove wxKanban's own pipeline is unchanged (SC-6)
- **T019** — Answer and close the three customer reports

## Risks

- An adapter that resolves but is wrong is worse than one that does not resolve. The contract
  validation in T003 and the guards in T013 are what keep generation honest.
- Three customer reports are closed by this scope and remain open until T019.
