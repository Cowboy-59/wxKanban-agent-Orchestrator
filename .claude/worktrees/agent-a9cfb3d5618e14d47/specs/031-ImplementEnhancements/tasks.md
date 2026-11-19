# Task Breakdown: Implement Command Enhancements — Delete Action + Batch-by-Scope Mode

**Feature**: Implement Command Enhancements
**Spec**: 031
**Date Generated**: 2026-05-16
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **ADR**: [ADR-0001](../../wxkanban-agent/docs/adr/0001-cross-surface-concerns-live-in-one-canonical-module.md)

---

## Tasks

| #  | Task | Priority | Status |
|----|------|----------|--------|
| 1  | T001: Update `implement-prompt.ts` — extend `ProposedFile.action` to accept `"delete"`; update `parseProposal` + `SYSTEM_PROMPT` | high | todo |
| 2  | T002: Extend `implement.ts` with delete branch — file removal, drift check, DB cleanup, `filesDeleted` field on `ImplementResult` | high | todo |
| 3  | T003: Write `tests/unit/delete-action.test.ts` — full delete-path coverage | high | todo |
| 4  | T004: Extend `tests/unit/implement-prompt.test.ts` — delete action in `parseProposal` and `SYSTEM_PROMPT` | medium | todo |
| 5  | T005: Extend `implement.ts` with batch loop — dependency walk, cycle detection, stop-on-failure, `--continue-on-error`, `BatchImplementResult` | high | todo |
| 6  | T006: Update `cli.ts` — argument-shape disambiguation, `--continue-on-error` + `--verbose` flags, batch result formatting | high | todo |
| 7  | T007: Wire `--dry-run` summary table emission in the CLI gateway — read `BatchImplementResult`, format per FR-009 | high | todo |
| 8  | T008: Write `tests/unit/batch-mode.test.ts` — disambiguation, dependency walk, cycle detection, failure semantics, mid-batch state | high | todo |
| 9  | T009: Write `tests/unit/dry-run-summary.test.ts` — summary format, `--verbose` expansion, totals math, empty-batch | high | todo |
| 10 | T010: Create fixture scope `tests/fixtures/specs/999-Fixture/` — minimal `spec.md` + 3-task `tasks.md` with known dependencies | medium | todo |
| 11 | T011: Write `tests/integration/batch-against-fixture-scope.test.ts` — end-to-end batch run against the fixture | high | todo |
| 12 | T012: Rewrite `wxkanban-agent/docs/implement.md` — correct step 3, document batch mode + delete action + `--continue-on-error` + `--dry-run --verbose` | medium | todo |
| 13 | T013: Cleanup pass — bump kit minor version in `package.json`, CHANGELOG entry, run `auditfences --strict` | high | todo |

## Dependencies

- **T001 first** — `ProposedFile.action` type expansion is the foundation everything else builds on.
- **T002 depends on T001** — delete branch uses the expanded action type.
- **T003 depends on T002** — tests exercise the delete branch.
- **T004 depends on T001** — tests exercise the parser/prompt updates. Parallel with T002/T003.
- **T005 depends on T002** — batch loop wraps the existing per-task handler (which now includes the delete branch). Also depends on `spec-loader.ts` topological-sort helper (extract during T005 if not already present).
- **T006 depends on T005** — CLI changes consume the new handler signature (batch result type).
- **T007 depends on T006** — summary table emission lives in the CLI gateway alongside the argument parsing. Could be folded into T006 but separated for review clarity.
- **T008 depends on T005** — tests exercise the batch loop directly. Parallel with T006/T007.
- **T009 depends on T007** — tests exercise the summary table output.
- **T010 is independent** — fixture content. Can run anywhere after T001. Place before T011.
- **T011 depends on T005, T006, T007, T010** — integration test needs the batch mode functional and the fixture available.
- **T012 depends on T002, T005, T006, T007** — docs describe completed behavior.
- **T013 last** — depends on everything else passing.

**Critical path**: T001 → T002 → T005 → T006 → T007 → T011 → T013.

**Parallelizable**: T003 + T004 (both after T001/T002, both touch tests); T008 + T009 (both after T005/T007, both touch tests); T010 (anytime independent); T012 (after T002 + T005 + T006 + T007, parallel with T011).

**Phase boundaries** (per [plan.md](plan.md)):

- **Phase 1**: T001, T002, T003, T004 — delete action mechanics.
- **Phase 2**: T005, T006, T007, T008, T009 — batch mode mechanics.
- **Phase 3**: T010, T011, T012, T013 — docs, fixtures, acceptance.

Phase 1 must use the direct-import wrapper (the enhanced `implement` does not yet exist). Phase 2 can dogfood the enhanced `implement <scope>` once T005/T006/T007 land — apply remaining Phase 2 tasks (T008, T009) via the new batch mode. Phase 3 runs entirely under the enhanced surface.

---

## Task Details

### T001 — `implement-prompt.ts` updates

**Modifies**: `wxkanban-agent/core/orchestrator/implement-prompt.ts`

Three changes:

1. `ProposedFile.action` type: `"create" | "modify" | "delete"` (was two values).
2. `parseProposal()` validates the three-value vocabulary; rejection message updated to list all three valid values.
3. `SYSTEM_PROMPT` constant updated to instruct the editor AI: use `"delete"` when removing a file; `body` is ignored when action is `"delete"` (can be the empty string).

**Reference**: FR-001 in [spec.md](spec.md).

### T002 — Delete branch in `implement.ts`

**Modifies**: `wxkanban-agent/core/orchestrator/command-handlers/implement.ts`

Adds the delete branch inside the per-file loop (lines ~191-291 today). For each `ProposedFile` with `action === "delete"`:

1. `existsSync(absPath)` — if false, throw `ImplementError(2, "cannot delete <path>: file does not exist")`. Hard fail per FR-002 #1.
2. Load existing fences via `loadExistingFencesForFile`.
3. Apply drift check against each fence (existing `isDriftDetected` path); throw `ImplementError(1, ...)` with the byte-identical modify-path drift message unless `--accept-drift` is set.
4. If `options.dryRun`, push to `filesSkipped`; continue.
5. Otherwise: `fs.unlinkSync(absPath)`; push to new `filesDeleted: string[]` field.
6. Inside the open DB transaction: insert `taskfencehistory` rows per FR-004 (action = `"delete"` or `"delete-with-drift"`), then delete corresponding `taskfences` and `taskfencemodifications` rows.

Also extends `ImplementResult` with `filesDeleted: string[]` and updates the human-readable message to append "deleted N" when `filesDeleted.length > 0` (omitted when zero — preserves today's message for non-delete tasks per FR-010).

**Reference**: FR-002, FR-003, FR-004, FR-010 in [spec.md](spec.md).

### T003 — `delete-action.test.ts`

**Creates**: `wxkanban-agent/tests/unit/delete-action.test.ts`

Test coverage per FR-013:

- `parseProposal` accepts `"delete"`; rejects unknown values.
- Delete branch with file present, no fences → file removed, no DB writes.
- Delete branch with file present, clean fences → file removed, `taskfencehistory` rows written with `action: "delete"`, `taskfences` and `taskfencemodifications` rows removed inside same transaction.
- Delete branch with drift detected, no override → throws `ImplementError(1, ...)`, no FS or DB change.
- Delete branch with drift + `--accept-drift` → file removed, `taskfencehistory` rows written with `action: "delete-with-drift"`.
- Delete branch with missing file → throws `ImplementError(2, "cannot delete <path>: file does not exist")`.
- Delete branch with `--dry-run` → no FS change, no DB change, `filesSkipped` includes the path, `filesDeleted` remains empty.
- `ImplementResult.message` includes "deleted N" component when `filesDeleted.length > 0`; omits when zero.

**Reference**: FR-013 in [spec.md](spec.md).

### T004 — Extend `implement-prompt.test.ts`

**Modifies** (or creates): `wxkanban-agent/tests/unit/implement-prompt.test.ts`

Adds assertions:

- `SYSTEM_PROMPT` content mentions the `"delete"` action.
- `parseProposal` accepts a proposal with `action: "delete"` and `body: ""`.
- `parseProposal` rejects unknown action values with an updated rejection message listing all three valid values.

**Reference**: FR-001, FR-013 in [spec.md](spec.md).

### T005 — Batch loop in `implement.ts`

**Modifies**: `wxkanban-agent/core/orchestrator/command-handlers/implement.ts`

Adds the batch path. The existing `handleImplementCommand` gains a sibling `handleImplementBatchCommand(options: BatchImplementOptions): Promise<BatchImplementResult>` (or `handleImplementCommand` is extended to dispatch based on whether `task` is supplied — implementer's call; behavior must be equivalent).

Batch handler:

1. Load spec bundle for `scope`.
2. Filter to `todo` tasks; topologically sort by dependencies; throw `ImplementError(2, "tasks.md dependency cycle detected: <ids>")` on cycle.
3. Loop: for each ready task, emit prompt (existing `buildImplementPrompt` flow), read proposal from stdin (existing `parseProposal` flow), call the per-task handler, accumulate result.
4. On failure: if `options.continueOnError`, mark this task failed, recompute ready set excluding tasks transitively-blocked by failed tasks (those are `skipped` with reason). Otherwise, halt and return partial `BatchImplementResult`.
5. After all reachable tasks processed, return `BatchImplementResult` with per-task results and aggregate summary.

Defines and exports `BatchImplementResult` and `BatchImplementOptions` interfaces per FR-010.

If `spec-loader.ts` doesn't already expose a topological-sort helper, extract one as part of this task (small addition to that file).

**Reference**: FR-005, FR-006, FR-007, FR-008, FR-010 in [spec.md](spec.md).

### T006 — `cli.ts` updates

**Modifies**: `wxkanban-agent/apps/command-gateway/src/cli.ts`

Two changes around the `implement` command dispatch:

1. **Argument-shape disambiguation**: a positional matching `^[0-9]{3}$` dispatches to batch mode (`handleImplementBatchCommand`); a positional matching `^[0-9]{3}/T[0-9]+$` dispatches to surgical mode (existing `handleImplementCommand`); other shapes throw `ImplementError(2, "invalid <scope> or <scope>/<task> argument: <given>")` before dispatch.
2. **New flags**: `--continue-on-error` (boolean; forwarded to `BatchImplementOptions.continueOnError`); `--verbose` (boolean; forwarded to batch dry-run handler for per-task detail expansion).

Surgical-mode dispatch is unchanged; the existing flag-parsing path continues to work without modification (FR-011).

**Reference**: FR-005, FR-007, FR-011 in [spec.md](spec.md).

### T007 — Summary table emission

**Modifies**: `wxkanban-agent/apps/command-gateway/src/cli.ts`

After batch dispatch returns a `BatchImplementResult`, format the summary table per FR-009 and emit to stdout. The table includes per-task rows (Task ID, title, files-changed summary, warnings count) plus a totals row aggregating across tasks.

If `--verbose` was supplied, expand each task into the per-task dry-run detail (each task's full output as today, separated by task-id headers) concatenated after the summary table.

The summary format is a discrete formatting function (not inline) so the future `--json` flag (deferred) can swap implementations without touching the dispatch logic.

**Reference**: FR-009 in [spec.md](spec.md).

### T008 — `batch-mode.test.ts`

**Creates**: `wxkanban-agent/tests/unit/batch-mode.test.ts`

Test coverage per FR-013:

- Argument-shape disambiguation regex matches scope-only, scope/task, and rejects malformed inputs.
- Dependency-ordered task walk against a synthetic spec bundle with a known graph: produces the expected order.
- Cycle detection: spec bundle with cyclic dependencies throws `ImplementError(2, ...)` before any task runs.
- Stop-on-failure: failure in task N halts; tasks 1..N-1 are in their committed state; tasks N+1..end remain `todo`.
- `--continue-on-error`: failure in task N rolls back N; tasks transitively blocked by N are skipped (status remains `todo`, reason includes failing task ID); other tasks continue.
- Mid-batch state visibility: a synthetic task whose proposal references an earlier task's on-disk output succeeds because the earlier task is fully applied before the later task's proposal is generated.
- `BatchImplementResult` shape: per-task results + aggregate summary fields match FR-010.

**Reference**: FR-013 in [spec.md](spec.md).

### T009 — `dry-run-summary.test.ts`

**Creates**: `wxkanban-agent/tests/unit/dry-run-summary.test.ts`

Test coverage per FR-013:

- Summary-table format for all-create batch.
- Summary-table format for all-delete batch.
- Summary-table format for mixed batch (some create, some modify, some delete).
- Totals row math (sum of files-changed, sum of warnings).
- `--verbose` produces the per-task detail concatenated below the summary.
- Empty-batch case (all tasks already `done`): summary reports "no tasks to run"; exit code 0.

**Reference**: FR-013 in [spec.md](spec.md).

### T010 — Fixture scope

**Creates**:

- `wxkanban-agent/tests/fixtures/specs/999-Fixture/spec.md` — minimal spec for testing purposes. Title, header, one-sentence overview, no FRs needed (the fixture exists only to provide a parseable spec bundle).
- `wxkanban-agent/tests/fixtures/specs/999-Fixture/tasks.md` — 3 tasks with a known dependency graph:
  - F001: independent (no dependencies); creates file A
  - F002: depends on F001; creates file B that imports from A
  - F003: depends on F001 and F002; creates file C that imports from A and B

Tasks fixture is deliberately small but exercises cross-task references (file A's content matters for B's correctness) so the integration test (T011) can verify apply-then-prompt-next state visibility end-to-end.

**Reference**: FR-013 in [spec.md](spec.md).

### T011 — Integration test

**Creates**: `wxkanban-agent/tests/integration/batch-against-fixture-scope.test.ts`

End-to-end test:

1. Stub proposal source — function that returns the canned proposal for each task ID. Wired into the batch handler's stdin via a test fixture (in-memory readable stream or temp file with proposals concatenated).
2. Run `handleImplementBatchCommand` against `999-Fixture` scope with `--dry-run` first to verify summary table output.
3. Run again without `--dry-run`; verify files A, B, C are written; verify tasks.md statuses flip to `done`; verify `BatchImplementResult` aggregate is correct.
4. Run a second time without changes; verify zero tasks run (idempotent re-run skips `done` tasks).

**Reference**: FR-013, FR-008 in [spec.md](spec.md).

### T012 — Rewrite `docs/implement.md`

**Modifies**: `wxkanban-agent/docs/implement.md`

Per FR-012:

- **Step 3 correction**: remove the "Builds an AI prompt and calls Gemini" line; replace with the editor-AI-driven proposal flow.
- **Synopsis**: document both `implement <scope>` and `implement <scope>/<task>` forms.
- **Flags table**: add `--continue-on-error`, `--verbose`; correct existing flag descriptions that imply AI calling.
- **Examples**: add batch-mode example with summary output; delete-action example with proposal JSON; `--continue-on-error` example; `--dry-run --verbose` example.
- **Required prerequisites**: clarify "the editor AI drives the prompt-response loop"; note batch mode requires a stdin proposal source.
- **Idempotency**: note batch-mode re-runs skip `done` tasks naturally; surgical re-runs of `done` tasks are explicit per today's contract.

**Reference**: FR-012 in [spec.md](spec.md).

### T013 — Cleanup pass

**Modifies**:

- `wxkanban-agent/package.json` — bump kit minor version (e.g., from `0.4.0` to `0.5.0`).
- `wxkanban-agent/CHANGELOG.md` — entry for v0.5.0 documenting:
  - Delete action added to `ProposedFile`.
  - Batch-by-scope invocation form (`implement <scope>`).
  - `--continue-on-error` and `--verbose` flags.
  - `ImplementResult.filesDeleted` field added (non-breaking).
  - `BatchImplementResult` aggregate type added.
  - `docs/implement.md` corrected (no longer states "calls Gemini").

**Verifies**:

- Full test suite green.
- `wxkanban-agent auditfences --strict` exits 0.
- Manual smoke-test matrix from `spec.md` "User Scenarios & Testing" section passes (delete clean, delete with drift, delete missing file, batch happy path, batch stop-on-failure, batch `--continue-on-error`, batch dry-run, surgical preservation).

**Reference**: FR-014 in [spec.md](spec.md).

---

## Notes for `wxkanban-agent implement 031`

This spec has a **chicken-and-egg** at Phase 1: the spec that enhances `implement` must be implemented by `implement` itself (or its direct-import wrapper). The bootstrap order:

- **T001, T002, T003, T004** (Phase 1) — apply via the direct-import wrapper per memory entry `feedback_orchestrator_cli_broken`. The enhanced surface does not yet exist.
- **T005, T006, T007** (Phase 2 core) — apply via the direct-import wrapper. Once these land, the enhanced surface exists.
- **T008, T009** (Phase 2 tests) — first opportunity to dogfood `wxkanban-agent implement 031` against the spec itself. Apply via the enhanced batch mode if the bootstrap from Phase 2 core is functional.
- **T010, T011, T012, T013** (Phase 3) — fully under the enhanced surface.

Each task's fence header reads `// [SCOPE 031 / T0NN] BEGIN — <task title>` and is written by the orchestrator (per [spec 026](../026-CodeFencing/spec.md)), never hand-authored, regardless of whether the direct-import wrapper or the enhanced surface is in use.

Pre-implementation, run the [plan.md](plan.md) Pre-Implementation Gates table to confirm both gates (direct-import wrapper functional, test runner functional). Then start at T001.

Once 031 ships, spec 030's implementation phase unblocks. Spec 030 can then run end-to-end as `wxkanban-agent implement 030`.
