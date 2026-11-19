# Tasks: Per-Scope Stage Progression

Source of truth for status is the DB (spec `6c83c489-f16a-47fe-8627-00d82c6242d4`). Task titles carry the `[123-Tnnn]` prefix
so `dbpush` can still resolve them today — see SCOPE-124 T004, which removes that dependency.

## Task table

| Task | Title | Priority | Status |
|---|---|---|---|
| T001 | Resolve the gate from the acted-on scope, not the project | critical | done |
| T002 | Bring the MCP adapter to the same per-scope rule | critical | done |
| T003 | Write specificationphases on stage entry and exit | critical | done |
| T004 | Verify specificationphases column shape against production | high | done |
| T005 | Advance a scope when its last open task closes | critical | done |
| T006 | Call canTransition at runtime and refuse illegal moves | critical | done |
| T007 | Make the stage refusal actionable | high | done |
| T008 | Give unknown commands their own error, and assert it differs | high | done |
| T009 | Derive the project rollup stage and remove every gate read of projectphases | high | done |
| T010 | Remove readers of projectspecifications.phaseid, leaving the column | medium | done |
| T011 | Backfill existing projects conservatively | critical | done |
| T012 | Classify every command scoped or unscoped, enforced at build time | high | done |
| T013 | Adopt SCOPE-122's vocabulary and reject unknown values at the boundary | high | done |
| T014 | Regression suite for per-scope independence | high | done |
| T015 | Make the automatic advance wait for the test gates (FR-010) | critical | done |
| T016 | Design exit on tasks, and advance through every clear stage (FR-011, FR-012) | critical | done |
| T017 | Let implement run in QA and HumanTesting for fix work (FR-013) | high | done |
| T018 | MCP tools project.scope_stage and project.backfill_scope_stages | critical | done |
| T019 | Wire the advance into every task and test write path in the app and the MCP | critical | done |
| T020 | Amendment C: inferred stage for untracked scopes, createspecs any stage, every test blocks the advance | critical | done |
| T021 | Review fixes: gate tenancy, lock recount, entry-work retry, missed triggers, test tenancy, inactive scopes | critical | done |

## Task detail

### T001 — Resolve the gate from the acted-on scope, not the project

**Priority**: critical · **Status**: done

FR-001. In wxkanban-agent/core/policy/policy.ts and the three refusal sites in core/policy/adapters/cli-adapter.ts, decide permission from the phase of the scope named by the command instead of resolveCurrentPhase(db, projectId). implement <scope>/<task> already carries its scope. resolveCurrentPhase stays for display/rollup callers but no gate may call it. Acceptance: two scopes at different stages each accept their own stage's commands in one session; a test asserts no gate path calls resolveCurrentPhase.

### T002 — Bring the MCP adapter to the same per-scope rule

**Priority**: critical · **Status**: done

FR-001. mcp-adapter.ts:149 resolves the project phase today. Apply the same scope-first resolution so the CLI, the MCP surface and the Dev Cockpit all inherit the fix from the policy layer rather than each command. Acceptance: an MCP-routed command against a scope in Implementation is permitted while a sibling scope sits in Design.

### T003 — Write specificationphases on stage entry and exit

**Priority**: critical · **Status**: done

FR-002. Give the dormant table its first writer: entering a stage opens a row (specificationid, phase, enteredat); leaving sets exitedat. Populate approvedby, notes, blockers where the transition carries them. A scope's current stage is its single open row; no open row reads as Design. No DDL - the table is declared and present in production. Acceptance: exactly one open row per scope, never two; history reconstructs the scope's path in order.

### T004 — Verify specificationphases column shape against production

**Priority**: high · **Status**: done

FR-002. db:drift is table-level and exits 0 while declared COLUMNS are missing - that is how the phaseid 42703 errors went undetected. Read the deployed column shape directly before building on the table, and record the result. Acceptance: column shape confirmed against production, not inferred from a drift exit code.

### T005 — Advance a scope when its last open task closes

**Priority**: critical · **Status**: done

FR-003. Closing the final open task in a scope moves that scope to the next stage and records the transition as an event. Per scope and unconditional on siblings; no project-level row is written. Acceptance: closing a non-final task advances nothing; siblings verified unchanged by re-reading each sibling's open row.

### T006 — Call canTransition at runtime and refuse illegal moves

**Priority**: critical · **Status**: done

FR-003. core/orchestrator/transitions.ts encodes the legal moves and is currently dead code - its only references are in its own unit test. Make it govern the FR-003 advance. An illegal move is refused with the reason recorded, never silently skipped. Acceptance: a runtime-path test exists alongside transitions.test.ts so the module cannot become dead again.

### T007 — Make the stage refusal actionable

**Priority**: high · **Status**: done

FR-004. A stage denial names the scope, its current stage, the stage the command requires, and what would advance it - at minimum the count of tasks still open in that scope. It must never report a stage that describes no scope in the project. Acceptance: the caller can branch on it programmatically, not only read it.

### T008 — Give unknown commands their own error, and assert it differs

**Priority**: high · **Status**: done

FR-005. cli-adapter.ts:112 returns a byte-identical rejection for unknown commands by explicit design; that identity caused kit:configure to be filed, triaged and amended as a stage-gate defect when it had never been registered. An unregistered command must yield an unrecognised-command error naming no stage. Acceptance: a test asserts the two strings are not equal; both cli-adapter sites and the policy.ts equivalent are covered.

### T009 — Derive the project rollup stage and remove every gate read of projectphases

**Priority**: high · **Status**: done

FR-006. projectphases stays for display, reporting and the dashboard, computed from the project's scopes rather than independently authoritative. Nothing in the policy layer reads it. Acceptance: no policy or gate path reads projectphases; the displayed stage matches a stated rule over its scopes' stages.

### T010 — Remove readers of projectspecifications.phaseid, leaving the column

**Priority**: medium · **Status**: done

FR-006. phaseid points a scope at the PROJECT's phase row - the wiring that made the category error possible. Remove its readers only. Do NOT drop the column: drizzle SELECTs every declared column and an early drop is a production outage (2026-07-28 incident). Record the deferred drop in specs/117-production-schema-integrity/schema-change-log.md. Acceptance: no remaining readers; column still declared and still present.

### T011 — Backfill existing projects conservatively

**Priority**: critical · **Status**: done

FR-007. Affected projects have zero specificationphases rows. Derive each scope's stage from evidence already in the database - tasks, status, documents - and backfill, recording the derivation so a wrong inference is auditable. Where evidence is ambiguous the scope lands in the EARLIER stage: promoting generously would unlock commands for unfinished work, which is worse than the condition being fixed. Acceptance: idempotent; a genuinely unstarted scope derives as Design; verified against a copy of a real affected project, not a synthetic fixture.

### T012 — Classify every command scoped or unscoped, enforced at build time

**Priority**: high · **Status**: done

FR-008. Commands taking no scope argument gate on a rule derived from the project's scopes, not a stored project stage. Acceptance: the classification list is asserted by a test; adding a command without classifying it fails the build rather than defaulting silently.

### T013 — Adopt SCOPE-122's vocabulary and reject unknown values at the boundary

**Priority**: high · **Status**: done

FR-009. specificationphases.phase stores uppercase, projectphases.phasename stores LifecycleStage values, and SCOPE-122 documents a third mismatch. Consume the unified set; add no fourth. An unrecognised value is rejected at the boundary, never coerced. SCOPE-122 is a hard predecessor. Acceptance: if 122 has not landed, values still map to it with no translation layer.

### T014 — Regression suite for per-scope independence

**Priority**: high · **Status**: done

Covers the FR-001..FR-009 acceptance criteria as executable tests: two scopes at different stages in one project, sibling isolation on advance, runtime canTransition, refusal-message inequality, backfill idempotency, and the assertion that no gate path calls resolveCurrentPhase.

### T015 — Make the automatic advance wait for the test gates (FR-010)

**Priority**: critical · **Status**: done

- [ ] In the shared advance service (T005), before leaving QA, check the machine test gate for that
      scope; before leaving Human Testing, check every released human test has a tester sign-off;
      the Release check needs every forced test clear. Reuse the gate logic SCOPE-111 already has
      (`PhaseService.testGateCriterion`), scoped to the scope, rather than writing a second copy.
- [ ] Re-attempt the advance when a test sign-off or result changes, so a scope moves once its last
      gate clears without a further task closing.
- [ ] The refusal (T007) names the open gate and its outstanding items.
- [ ] Tests: last task closed in QA with a failing machine test does not advance; signing it does;
      Implementation and Beta advance on tasks alone.

**Done when** no scope can leave QA, Human Testing, or reach Release with a forced test unsigned or
failing.

### T016 — Design exit on tasks, and advance through every clear stage (FR-011, FR-012)

**Priority**: critical · **Status**: done

Amendment B. In the shared advance service, Design's exit condition is "the scope has at least one
task". After any trigger the service loops: evaluate the current stage's exit condition (FR-012
table), advance one stage through `canTransition` if it holds, record the step, and repeat until a
condition fails. A scope with no machine tests stops in QA with a refusal naming `/wxCreateTestPlan`;
`skiptesting` projects pass the test conditions. Acceptance: FR-011 and FR-012 criteria.

### T017 — Let implement run in QA and HumanTesting for fix work (FR-013)

**Priority**: high · **Status**: done

Amendment B. `gateTable[ImplementTask].allowedPhases` becomes Implementation, QA, HumanTesting. No
backward transition is added. Acceptance: FR-013 criteria; existing tests that pinned implement to
Implementation only are updated to the new row.

### T018 — MCP tools project.scope_stage and project.backfill_scope_stages

**Priority**: critical · **Status**: done

Amendment B. The kit reaches the hub only through MCP tools, so the CLI gate (T001) reads a named
scope's stage, open tasks and open gates from `project.scope_stage`, and the FR-007 command (T011)
runs as `project.backfill_scope_stages` (dry run by default, writes only with `confirm: true`). Both
get a PERMISSION_MATRIX entry, a handler, and a kit-side caller. `project.cockpit_summary` gains an
additive `stage` per scope. Acceptance: the CLI refuses a scoped command with a clear message when
the hub cannot be reached, and never falls back to `.wxai/project.json`.

### T020 — Amendment C: inferred stage, createspecs any stage, every test blocks

**Priority**: critical · **Status**: done

Decisions 9 to 11 (scope document, § Clarifications). A gate judges a scope with no stage row on
its inferred stage (FR-007's rule, read-only); display surfaces use the task-count lower bound and
mark the scope untracked. `createspecs` becomes scope-creating. The per-scope gate checkers count
every test of the stage's kind, forced or not; `skiptesting` still passes. Acceptance: on a
database with no stage rows, `implement` on a scope with open tasks is permitted; re-pushing
`createspecs` for a scope in Implementation is permitted; a scope whose only tests are unforced
and unsigned does not leave QA.

### T021 — Review fixes

**Priority**: critical · **Status**: done

From the advisory review of the first build (scope document, § Clarifications, "Review fixes"):
gate tenancy check before any read; task counts re-read under the lock; stage-entry work re-run on
every advance; advance after `delete_task`, `link_task_to_spec` (losing scope), `merge_scope`, the
`skiptesting` toggle and retest dismissal; project check in `sign_off_test` and
`complete_test_run`; `SCOPE_INACTIVE` refusal; `release(err)` after a failed rollback. Each with a
test, including the three the review named: entry-work retry, a task reopened between assessment
and lock, and a cross-project gate call.

### T019 — Wire the advance into every task and test write path

**Priority**: critical · **Status**: done

Amendment B / FR-003 / FR-010 / FR-011. Call the one shared service, after the write commits, from:
the app's `TaskService.updateTask`, the direct task route `PATCH /:id/phases/:phaseid/tasks/:taskid`,
the PM sync task update, and the scope-chat task approval; the MCP `project.update_task_status`,
`project.create_task`, `project.link_task_to_spec`, `project.create_specs`, `project.sign_off_test`
and `project.complete_test_run`. An advance failure is logged and never fails the write that
triggered it. Acceptance: closing the last task through either door advances the scope.
