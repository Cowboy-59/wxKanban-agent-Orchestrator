# Spec 031: Plan — Implement Command Enhancements

**See also**: [spec.md](spec.md), [tasks.md](tasks.md), [ADR-0001](../../wxkanban-agent/docs/adr/0001-cross-surface-concerns-live-in-one-canonical-module.md)

This file is the HOW. The WHAT is in [spec.md](spec.md). The task breakdown is in [tasks.md](tasks.md).

---

## Implementation Phasing

The refactor lands as **one PR in three sequenced phases**. Each phase is independently testable and commits a coherent slice of capability. Phase 1 (delete action) and Phase 2 (batch mode) are independent in principle, but Phase 1 is sequenced first because it has fewer moving parts and is a useful warm-up for verifying the chicken-and-egg bootstrap (the direct-import wrapper actually works for `implement` modifications).

### Phase 1 — Delete action mechanics

1. Update `wxkanban-agent/core/orchestrator/implement-prompt.ts` — extend `ProposedFile.action` to accept `"delete"`; update `parseProposal` to validate the three-value vocabulary; update `SYSTEM_PROMPT` to instruct AI consumers on delete usage. (FR-001)
2. Extend `wxkanban-agent/core/orchestrator/command-handlers/implement.ts` with the delete branch — atomic file removal, drift check, DB cleanup inside the existing per-task transaction. Add `filesDeleted: string[]` to `ImplementResult` and update the human-readable message. (FR-002, FR-003, FR-010)
3. Write `wxkanban-agent/tests/unit/delete-action.test.ts` — full coverage of the delete path including drift detection, `--accept-drift` override, missing-file hard fail, dry-run accounting. (FR-013)

**Checkpoint**: existing tests still green; delete-action tests pass; the surgical-mode delete works end-to-end via the direct-import wrapper (apply Phase 1's own changes via the wrapper to verify the bootstrap is functional).

### Phase 2 — Batch mode mechanics

1. Update `wxkanban-agent/apps/command-gateway/src/cli.ts` — add argument-shape disambiguation (scope-only vs scope/task), wire `--continue-on-error` and `--verbose` flag parsing. (FR-005)
2. Extend `wxkanban-agent/core/orchestrator/command-handlers/implement.ts` with the batch loop — dependency-ordered task walk via topological sort (extracting a helper into `spec-loader.ts` if needed), cycle detection that throws before any task runs, stop-on-failure default, `--continue-on-error` opt-in with skip-by-dependency semantics. Define and return `BatchImplementResult` aggregate. (FR-005, FR-006, FR-007, FR-008)
3. Wire `--dry-run` summary table emission in the CLI gateway — read the `BatchImplementResult` and format the table per FR-009; `--verbose` flag expands to per-task detail concatenated below. (FR-009)
4. Write `wxkanban-agent/tests/unit/batch-mode.test.ts` and `wxkanban-agent/tests/unit/dry-run-summary.test.ts` — covers argument disambiguation, dependency walk, cycle detection, stop-on-failure, `--continue-on-error`, mid-batch state visibility, summary-table format, totals math, empty-batch case. (FR-013)

**Checkpoint**: existing per-task tests still green; batch-mode tests pass; `wxkanban-agent implement <scope>` works end-to-end against a small ad-hoc scope (e.g., 2-task private scope, or the fixture scope from Phase 3 once it exists). Dogfood: from this point forward, the rest of spec 031's tasks can be implemented via the enhanced `wxkanban-agent implement 031` itself rather than the direct-import wrapper.

### Phase 3 — Docs, fixtures, and acceptance

1. Create the fixture scope `wxkanban-agent/tests/fixtures/specs/999-Fixture/` with a minimal `spec.md` and a 3-task `tasks.md` with a known dependency graph. (FR-013)
2. Write `wxkanban-agent/tests/integration/batch-against-fixture-scope.test.ts` — end-to-end batch run feeding canned proposals via stdin; verifies the full apply-then-prompt-next loop. (FR-013)
3. Extend `wxkanban-agent/tests/unit/implement-prompt.test.ts` to cover the new delete action in `parseProposal` and the updated `SYSTEM_PROMPT`. (FR-013)
4. Rewrite `wxkanban-agent/docs/implement.md` per FR-012 — correct step 3, add batch-mode synopsis and examples, document `--continue-on-error` and `--dry-run --verbose`, clarify the editor-AI-drives-loop contract. (FR-012)
5. Cleanup pass — bump `wxkanban-agent/package.json` minor version; add `CHANGELOG.md` entry documenting delete action + batch mode + docs correction; run `wxkanban-agent auditfences --strict` and confirm exit 0. (FR-014 #13, #15)

**Checkpoint**: all 15 acceptance criteria in FR-014 hold; manual smoke matrix from spec.md "User Scenarios & Testing" passes; full test suite green; fences clean.

---

## Pre-Implementation Gates

Two conditions must hold before Phase 1 begins. If either is not met, the implementation phase blocks.

| Gate | State as of 2026-05-16 | Action if not met |
|---|---|---|
| **Working direct-import wrapper for `implement`.** The wrapper is the only way to run early Phase 1 tasks before the enhanced `implement` exists — per memory entry `feedback_orchestrator_cli_broken`. | **State unverified** — memory entry confirms the wrapper exists; live verification deferred to the first Phase 1 task attempt. | If the wrapper turns out to be broken too, the bootstrap order needs different choreography (perhaps direct file edits + git, explicitly marked out-of-band by the user, with the fence audit pass deferred to Phase 3). Surface this immediately if discovered. |
| **Test runner functional.** Phase 1's checkpoint requires running existing tests to verify no regression. | **Assumed met** — vitest is the kit's test runner per the project tech stack; ran successfully for spec 028's tasks. | If the test runner is broken, fix it before Phase 1 begins. Cannot do TDD-style verification without it. |

No other gates. Unlike spec 030, spec 031 does not depend on another in-flight spec — it stands on its own.

---

## Hard Constraints

These are non-negotiable for the implementation phase. Violating any of them is a defect, not a tradeoff.

1. **All writes go through the orchestrator** — direct-import wrapper for Phase 1 tasks; enhanced `implement <scope>` for Phase 2 and Phase 3 (dogfooded once batch mode works). No direct file edits to fenced units. Per CLAUDE.md orchestrator-first rule.
2. **Fences emitted by the orchestrator, never hand-authored.** Per Spec 026. Even the wrapper writes fences; the implementer never types `// [SCOPE 031 / T0NN] BEGIN` by hand.
3. **Existing per-task contract is preserved exactly.** Every existing flag works as today. Every existing call site continues to function unchanged (FR-011). The only additive change is the `filesDeleted` field appearing when relevant (FR-010), which non-aware callers can safely ignore.
4. **No internal AI calls.** Per Spec 019 R6a. The kit does not generate proposals; the editor AI does. Batch mode's apply-then-prompt-next loop preserves this contract — proposals come from outside the kit, no exceptions.
5. **Byte-identical drift message preservation.** The drift error message that fires on delete (FR-003) is byte-identical to today's modify-path message. No "deletion-specific" wording. Tests assert exact equality.
6. **One PR, three phases, no partial deployment.** Phase 1 alone (delete action without batch mode) would technically be functional but creates an inconsistent surface — the kit gains a new action that's hard to exercise without batch mode for non-trivial refactors. Phases 1–3 ship together.
7. **No DB schema changes.** Spec 031 consumes the existing `taskfences`, `taskfencemodifications`, `taskfencehistory` tables exactly as they are today. The delete-action FRs add new row content patterns (`action: "delete"` / `"delete-with-drift"`) but no migrations.

---

## Open Questions Resolved During Buildscope

Recording decisions explicitly so future readers know what was deliberately chosen vs. accidentally inherited.

| Question | Decision | Rationale |
|---|---|---|
| Batch failure semantics — stop or continue? | **Stop on first failure (default)** + `--continue-on-error` flag opt-in | Primary use case is refactor scopes with hard dependencies; cascading silent failures produce garbage worse than a clean halt. The flag covers the rare independent-task scope. |
| Dry-run aggregation shape | **Summary table by default** + `--verbose` for per-task detail; future `--json` deferred | 17 tasks of per-task detail is unscannable; summary answers the most common dry-run question at a glance; `--verbose` preserves full fidelity when needed. |
| Mid-batch state visibility — pre-staged proposals or apply-then-prompt-next? | **Apply-then-prompt-next via stdin/stdout loop** | Only mode where cross-task dependencies work naturally without forcing the spec to spell out every detail. Maps onto today's per-task flow extended into a loop; no new transport. |
| Drift check granularity in batch mode | **Existing per-task drift check is sufficient** | Per-task transactions commit the content-hash atomically; subsequent tasks see consistent state. No new drift logic needed; FR documents the composition property explicitly. |
| Delete action drift handling | **Drift check applies; `--accept-drift` override logged as `"delete-with-drift"` in `taskfencehistory`** | Deletion is the most destructive operation; the safety net matters most here. Override path with audit trail satisfies the rare legitimate case. |
| Tasks.md status after delete | **Normal `done`** + new `filesDeleted: string[]` field on `ImplementResult` | The tasks.md status field tracks completion, not outcome. "What did this task do?" is answered by task title + `taskfencehistory`. Output field separation is the clean place to surface deletion counts. |
| Missing-file behavior in delete | **Hard fail with `ImplementError(2, ...)`** *(FR-002 #1 user override)* | Idempotency comes from tasks.md status; a delete of a missing file in surgical mode signals unexpected state worth investigating, not silent recovery. |
| Surgical `<scope>/<task>` form fate | **Preserved as optional surgical override** | Mandatory single-task mode is too restrictive (would force loops on the caller); making batch mandatory loses targeted re-run. Both modes are useful. |
| Parallel task execution? | **Explicitly out of scope** | Sequential is simpler, easier to reason about, sufficient for the kit's task sizes. Parallel adds DB contention, ordering complexity, partial-success ambiguity — defer to a future scope if ever needed. |
| Cross-scope batch mode (`implement` against multiple scopes)? | **Explicitly out of scope** | One scope at a time. Cross-scope is a different ergonomic concern that mixes refactor boundaries; defer. |
| Topological-sort helper — extract or inline? | **Implementer decides at FR-006 implementation time** | If existing `verifyTaskUnblocked` exposes enough; if not, extract. Either way it's a small implementation detail, not a design choice worth pre-committing. |
| "Claude coworker" enhancement | **Explicitly deferred to a future scope** | Significant ergonomic improvement; benefits from spec 031 being done first; design space is not yet clear. |

---

## Rollback Strategy

**Mechanism**: `git revert <commit-sha>` of the merged PR.

**Risk assessment**: Lower than spec 030.

- No DB schema changes. `taskfences`, `taskfencemodifications`, `taskfencehistory` stay as they are today.
- No data migration to undo. New row content patterns (`action: "delete"`, `"delete-with-drift"`) become inert if the code that reads them is reverted (they look like legacy unfamiliar action values to old code; pre-031 code never read them because pre-031 code never emitted them).
- The `ProposedFile.action` union expansion is the most consequential type change — but reverting it is safe because any proposals containing `"delete"` would never have been generated against pre-031 code (no AI prompt told them to).
- `ImplementResult.filesDeleted` field disappears on revert — callers consuming it gracefully (optional-chained access) survive; callers that assumed it exists hard-crash. The kit's own callers are updated as part of this spec, so they revert together.

**Detection**: post-merge, the manual smoke-test sequence from `spec.md` "User Scenarios & Testing" runs as the release gate (FR-014 #12). Specifically:

- **Batch mode runtime hang** (stdin-without-driver) is the most likely user-surfaced concern. The fix is a docs improvement (FR-012 already covers this), not a code revert. Add the warning more prominently if reports come in.
- **`--continue-on-error` masking failures** would manifest as users running with the flag in scripts and missing failures. The exit-code-propagation behavior (FR-007) prevents the worst case; if anyone reports it, harden the docs.
- **Delete-action drift false positives** would mean code that wasn't actually hand-edited is reporting drift. If reported, this is a content-hash bug (likely in the existing drift code) and should be diagnosed before any revert decision — the new delete code reuses the existing drift mechanism unchanged.

**Recovery from rollback**: If reverted, the kit returns to the pre-031 state — no delete action, no batch mode. Spec 030 stays in its current "blocked on 031" state (no regression there; it was already blocked). Next attempt re-runs the same implementation with whatever the rollback surfaced added to the test suite. The spec/plan/tasks documents do not need to change unless the rollback exposes a design flaw — the design is sound; only its application failed.

**Forward-only after spec 030 implementation lands**: once spec 030 ships using spec 031's enhancements, reverting 031 would also unimplement 030 (deletions can't be redone without delete action). From that point forward, fixes are forward-only.
