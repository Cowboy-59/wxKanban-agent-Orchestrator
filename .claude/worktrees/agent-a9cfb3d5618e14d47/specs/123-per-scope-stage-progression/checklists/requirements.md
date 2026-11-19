# Requirements Checklist: Per-Scope Stage Progression

**Spec**: 123 · Traces each FR to its implementing task and its proving test.

| FR | Requirement | Task(s) | Proven by | Done |
|----|-------------|---------|-----------|------|
| FR-001 | The gate resolves the stage of the scope being acted on | T001, T002 | Unit: two scopes at different stages both work; structural assertion that no gate calls `resolveCurrentPhase` | [ ] |
| FR-002 | `specificationphases` becomes the per-scope system of record | T003, T004 | Unit: one open row per scope, never two, across a six-stage traversal; column shape verified against production | [ ] |
| FR-003 | Completing a scope's last open task advances that scope | T005, T006 | Unit: last task advances, non-last does not, siblings re-read unchanged; `canTransition` exercised on the runtime path | [ ] |
| FR-004 | A stage refusal is actionable | T007 | Unit: message carries scope, current stage, required stage, remaining-task count | [ ] |
| FR-005 | An unknown command reports that it is unknown | T008 | Unit: the two strings asserted **unequal**; both `cli-adapter` sites + `policy.ts` | [ ] |
| FR-006 | The project stage is derived and gates nothing | T009, T010 | Structural: no gate reads `projectphases`; `phaseid` has no readers and the column still exists | [ ] |
| FR-007 | Existing projects are backfilled conservatively | T011 | Integration against a copy of project `947a5614`; idempotent; unstarted scopes derive as Design | [ ] |
| FR-008 | Unscoped commands gate on a stated rule | T012 | CI: an unclassified command fails the build | [ ] |
| FR-009 | One vocabulary, consumed not forked | T013 | Unit: unrecognised value rejected at the boundary, never coerced | [ ] |

## Success metric verification

| # | Metric | Verified by | Done |
|---|--------|-------------|------|
| 1 | 0 manual DB interventions across 3 affected projects in 30 days | Post-release observation; support confirms 0 row edits | [ ] |
| 2 | 100% of active scopes hold exactly 1 open `specificationphases` row (from 0) | Query after backfill; assert none holds 2 | [ ] |
| 3 | 0 new "stuck in Design" reports for 30 days | Feedback sink review at +30 days | [ ] |
| 4 | 2 distinct refusal messages, after 1 prior misdiagnosis | The inequality test (FR-005) | [ ] |

## Pre-implementation gates

- [ ] **SCOPE-122 has landed.** Hard predecessor — FR-009 consumes its vocabulary
- [ ] `specificationphases` column shape verified directly against production, **not** from a
      `db:drift` exit code (T004)
- [ ] The placement decision for the FR-003 advance is made — one location reachable by both the app
      task service and the MCP tool
- [ ] The FR-006 rollup derivation rule is chosen (lowest / highest / most common)
- [ ] A copy of a genuinely affected project is available for T011; a synthetic fixture is not
      acceptable

## Do-not-do gates

- [ ] `projectspecifications.phaseid` is **not** dropped — readers removed only; deferred drop
      recorded in `specs/117-production-schema-integrity/schema-change-log.md`
- [ ] No DDL is introduced anywhere in this scope
- [ ] The dashboard advance/reopen UI is not rebuilt — it works and its June 500 is fixed
