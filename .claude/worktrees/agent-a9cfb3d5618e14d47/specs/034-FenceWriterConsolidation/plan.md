# Spec 034: Plan — Fence-Writer Consolidation

**See also**: [spec.md](spec.md), [tasks.md](tasks.md), [ADR-0001](../../wxkanban-agent/docs/adr/0001-cross-surface-concerns-live-in-one-canonical-module.md)

This file is the HOW. The WHAT is in [spec.md](spec.md). The task breakdown is in [tasks.md](tasks.md).

---

## Implementation Phasing

The refactor lands as **one PR in four sliced phases**, mirroring the A/B/C/D structure spec 030 established and spec 033 refined.

### Slice A — New canonical module (additive, no call sites touched)

1. Create `wxkanban-agent/core/fencing/internals/hash.ts` — relocated from `content-hash.ts`. Pure relocation; same content.
2. Create `wxkanban-agent/core/fencing/internals/emitter.ts` — relocated from `fence-emitter.ts`. Pure relocation. Internal import paths adjusted (e.g., for the hash helper).
3. Create `wxkanban-agent/core/fencing/internals/db.ts` — write-side from `fence-db.ts` (the `applyFenceDbWrites` function + related helpers; the read-side stays for now).
4. Create `wxkanban-agent/core/fencing/internals/drift.ts` — extract the drift-check logic from `implement.ts`'s inline block per FR-003.
5. Create `wxkanban-agent/core/fencing/writer.ts` — `applyFenceWrite` per FR-002. Uses the four internals. This is the new high-level API.
6. Create `wxkanban-agent/core/fencing/reader.ts` — read-side from `fence-db.ts` (`loadExistingFencesForFile` + new helpers `getFencesByOwner`, `getFenceHistory`, `listAllFences`) per FR-005.
7. Create `wxkanban-agent/core/fencing/drift-assert.ts` — module-load round-trip check per FR-007.

**Checkpoint after Slice A**: New code compiles. Existing tests still pass — no call sites changed. New module imported by zero files; the old `fence-emitter.ts` + `fence-db.ts` + `content-hash.ts` continue to serve all consumers (the new module's internals are independent copies — both exist briefly).

### Slice B — Tests + fixture bundle (additive)

1. Create `tests/unit/fencing/fixtures/**` with the fixture set per FR-011 — covers create, modify (< 80%), modify (≥ 80%), delete with fences, delete missing file, drift, multi-fence per file.
2. Create `tests/unit/fencing/golden/**` with expected output file bodies + expected `taskfences` row contents per fixture.
3. Write `tests/unit/fencing/writer.test.ts` — fixture-iteration end-to-end tests.
4. Write `tests/unit/fencing/emitter.test.ts` — decision-table tests for MODIFY/REPLACE threshold + fence-parsing edge cases.
5. Write `tests/unit/fencing/reader.test.ts` — each read function with stub `FenceDbClient`.
6. Write `tests/unit/fencing/drift-assert.test.ts` — verifies FR-007 assert fires when intentionally broken.
7. Port relevant behaviors from old `fence-emitter` / `fence-db` test files (if any standalone) into the fixture set.

**Checkpoint after Slice B**: New canonical module has full unit coverage. All new tests pass. Existing tests still pass. Old code still serves consumers.

### Slice C — Cutover all call sites

1. Update `wxkanban-agent/core/orchestrator/command-handlers/implement.ts` — replace inline drift check, fence-emitter calls, fence-db calls, delete-branch logic with a single `applyFenceWrite` call per file. The per-file loop body shrinks from ~80 LOC to ~15 LOC. Result-shape adapter maps `FenceWriteResult` into the existing `filesWritten` / `filesDeleted` / `filesSkipped` / `warnings` arrays. Run kit test suite after.
2. Update `wxkanban-agent/core/orchestrator/command-handlers/auditfences.ts` — replace imports from `fence-db.ts` with `core/fencing/reader.ts`. Verify no write-side calls remain. Run kit test suite after.
3. Audit any other consumers (grep for `from '../fence-emitter'`, `from '../fence-db'`, `from '../content-hash'`) — should be none remaining outside docs.

**Checkpoint after Slice C**: All call sites import from canonical module. Full kit test suite passes. Old modules still exist but unused.

### Slice D — Deletions + cleanup

1. Delete `wxkanban-agent/core/orchestrator/fence-emitter.ts`.
2. Delete `wxkanban-agent/core/orchestrator/fence-db.ts`.
3. Delete `wxkanban-agent/core/orchestrator/content-hash.ts`.
4. Delete or port old standalone test files for fence-emitter / fence-db (if any).
5. Grep verification: zero matches for old import paths outside `specs/` and `docs/`.
6. Update `wxkanban-agent/package.json` — version bump.
7. Update `wxkanban-agent/CHANGELOG.md` — entry covering the consolidation, `implement.ts` LOC reduction, read/write surface separation.
8. (Optional) Update `wxkanban-agent/docs/adr/0001-*.md` evidence section to reference 034 as the third concrete application.
9. Final verification: full kit test suite, `auditfences --strict`, manual smoke of `implement 999/T901` against the fixture.

---

## Pre-Implementation Gates

Three conditions must hold before Slice A begins.

| Gate | State as of 2026-05-17 | Action if not met |
|---|---|---|
| **Spec 033 has landed** — pattern is twice-validated; fixture-bundle test discipline established. | **Not met** — spec 033 is paper-only at session end. | Either ship spec 033 implementation first, OR accept that 034 implements before 033 (the pattern is once-validated by 030 alone — workable but less refined). |
| **Spec 032 (Track A) has landed** — kit reaches `auditfences --strict` exit 0 baseline; new files inherit clean fence state. | **Not met** — spec 032 is paper-only. | Either ship 032 first, OR accept that 034's new files add to the unfenced-declarations debt (fixed by a future fence-cleanup pass). |
| **Existing fence-related tests pass cleanly** — provides byte-identical witness for the cutover (FR-010). | **Met** — tests pass throughout this session. | n/a |

---

## Hard Constraints

These are non-negotiable for the implementation phase.

1. **All writes through the orchestrator** — `wxkanban-agent implement 034/T0NN` writes every fence; never hand-author markers.
2. **One PR, four slices** — A → B → C → D ship together. Mid-state where new module exists but old modules also exist is a state to pass through, not commit.
3. **Behavior preservation at each call-site cutover** — Spec 026 semantics byte-identical (FR-010). Existing tests pass unchanged after Slice C.
4. **No re-export shims** — `fence-emitter.ts`, `fence-db.ts`, `content-hash.ts` are deleted, not shimmed. Call sites swap directly to `core/fencing/`.
5. **Read surface is write-free** — `auditfences` and other audit consumers import only from `core/fencing/reader.ts`. No accidental mutation paths.
6. **DB-less mode preserves today's silent-skip semantics with one addition** — a warning is added to `FenceWriteResult.warnings`. Otherwise behavior is unchanged from today's `useDb` gating.

---

## Open Questions Resolved During Buildscope

| Question | Decision | Rationale |
|---|---|---|
| Shape of `applyFenceWrite` — logic-only or full lifecycle? | **(b) Full lifecycle** | Stops `implement.ts` from being a partial fence-writer. The point of this refactor. |
| Drift check ownership? | **(a) Inside canonical module** | Drift check IS a fence concern. Keeping it in implement.ts perpetuates the partial-fence-writer problem. |
| Delete-action fence-history writes — move inside? | **(a) Move inside** | Same reasoning as drift check. Spec 031's inline addition was a bootstrap exception; this refactor fixes it. |
| Read/write adapter separation? | **(b) Separate `reader.ts` + `writer.ts`** | Audit consumers can't accidentally mutate. Matches spec 030's adapter pattern. |
| DB-less mode shape? | **(a) Optional `db` param** | Preserves today's `useDb` gating semantics. (b) two-function variant would bloat the API. |
| Schema fix (`taskfencehistory.action` column)? | **(b) Out of scope** | Keeps 034 schema-change-free, consistent with 030 + 033. A small dedicated schema scope addresses cleanly. |

---

## Rollback Strategy

**Mechanism**: `git revert <PR-merge-sha>`.

**Risk assessment**:

- **Low** for Slice A & B (new module + tests; nothing depends on them yet).
- **Medium** for Slice C (cutover refactors implement.ts per-file loop; reverting restores the old multi-module orchestration). The strongest verification is the existing test suite — Spec 031 batch-mode integration test catches regressions end-to-end.
- **Low** for Slice D (deletions; revert restores deleted files).

**Detection**: post-merge, run `wxkanban-agent implement 999/T901` against the fixture scope — verifies the full fence-write lifecycle. If the operation produces different output (file content, taskfences rows, error messages) than pre-034, that's a regression; revert.

**Recovery from rollback**: All 4 slices revert as one unit. Kit returns to the pre-034 state with fence-emitter + fence-db + content-hash + inline implement.ts orchestration. Re-attempting after rollback uses the same plan with whatever the rollback surfaced added to the test suite.

**Forward-only after the schema scope lands**: If the queued `taskfencehistory.action` column scope ships after 034, it depends on 034's `internals/db.ts` for the writer update. Reverting 034 in isolation breaks that dependency. From that point fixes are forward-only.
