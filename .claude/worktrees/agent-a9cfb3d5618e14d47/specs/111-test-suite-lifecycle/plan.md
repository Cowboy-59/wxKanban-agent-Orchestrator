# Plan: Test Suite Lifecycle

**Spec**: 111 — Test Suite Lifecycle
**Scope**: SCOPE-111 (`specs/Project-Scope/111-test-suite-lifecycle.md`)
**Spec ID**: `f5552f9a-e581-46d1-8cdf-6e09569d1b22`
**Status**: planned
**Phase**: design
**Created**: 2026-07-25

---

## Approach

Build from the data layer upward, because every later surface — the gate, the run view, the
tester's list — is a projection of rows that do not exist yet. Nothing in the UI is meaningful
until an item, a cycle and a signoff can be stored and queried.

Two invariants shape the whole build and should be preserved in every task:

1. **One source for the gate.** `TestGateService` answers for the phase views, the phase advance
   check and the release commands alike. Any second implementation of "is this release clear?" is a
   defect, because the two will disagree exactly when it matters.
2. **Resets are queries, never sweeps.** A machine signoff stops counting because it carries a
   different `cycleid`, not because a job cleared it. A human signoff stops counting because an
   unanswered Retest mark exists, not because it was deleted. Nothing can half-complete.

## Build order

| Step | Tasks | Why here |
|---|---|---|
| 1 — Data layer | T001–T010 | Everything else is a projection of these rows. Additive migration only. |
| 2 — Services | T011–T017 | The gate and the reset semantics live here, not in routes or components. |
| 3 — Routes | T018–T023 | Thin over the services; the refusals are the interesting tests. |
| 4 — Gate wiring | T024–T026 | Feeds the existing `PhaseCompletionBar` structure — no new gate UI. |
| 5 — MCP | T027–T028 | Two registrations per tool; one without the other is an unknown tool. |
| 6 — Client | T029–T038 | QA panel and live run first, then the tester surface. |
| 7 — Kit / runner | T039–T042 | Rewires generation and execution onto the new structure. |
| 8 — Prereq + verify | T043–T044 | Browser runner, then the end-to-end pass. |

## Reuse — do not rebuild these

- `auditexecutions` / `auditresults` (`src/db/schema/`) — the execution-plus-results shape
  `testruns` / `testrunresults` mirror.
- `AuditExecutionPanel.tsx` (`src/client/components/audit/`) — the fetch-and-poll pattern the live
  run view reuses; do not introduce a second polling approach.
- `PhaseService.checkCompletion` (`src/server/services/PhaseService.ts`) — the existing criterion
  and `blockingtasks` structure already renders in `PhaseCompletionBar`. Add criteria; add no UI.
- `/api/projects/:projectId/bug-reports` (SCOPE-063) — a failed test files here. No second bug path.
- The audit log (SCOPE-013) — force changes, waivers and dismissals write to it.
- The item field contract — owned by `_wxAI/skills/wxCreateTestPlan/references/test-item-schema.md`.
  This spec persists that contract; it does not redesign it.

## Risks

- **Impact analysis is the load-bearing new idea.** Under-marking ships a defect under a green human
  signoff and has no recovery; over-marking costs a dismissal. Err wide, deliberately.
- **Changes with no import edges** — migrations, config, environment, static content, dependency
  upgrades — are where under-marking will actually happen. Build the migration rule first.
- **The runner is trusted.** The commit check (T015) is the only thing standing between a
  wrongly-computed graph and confidently wrong marking.
- **Database safety.** The local environment points at production and the hosted orchestrator shares
  it. The crud gate must refuse to run without a verified non-production target.

## Delivery

Three channels, not one: the application, a kit release (the generation skill changes), and a
rebuilt extension. Shipping only the application leaves the skill filing into the old structure.
