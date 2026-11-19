# Task Breakdown: Fence-Writer Consolidation — Single Canonical Fence Module

**Feature**: Fence-Writer Consolidation (ADR-0001 third application)
**Spec**: 034
**Date Generated**: 2026-05-17
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **ADR**: [ADR-0001](../../wxkanban-agent/docs/adr/0001-cross-surface-concerns-live-in-one-canonical-module.md)

---

## Tasks

| #  | Slice | Task | Priority | Status |
|----|-------|------|----------|--------|
| 1  | A | T001: Create `wxkanban-agent/core/fencing/internals/hash.ts` — relocate from content-hash.ts | high | todo |
| 2  | A | T002: Create `wxkanban-agent/core/fencing/internals/emitter.ts` — relocate from fence-emitter.ts | high | todo |
| 3  | A | T003: Create `wxkanban-agent/core/fencing/internals/db.ts` — write-side from fence-db.ts | high | todo |
| 4  | A | T004: Create `wxkanban-agent/core/fencing/internals/drift.ts` — extract from implement.ts inline drift check (FR-003) | high | todo |
| 5  | A | T005: Create `wxkanban-agent/core/fencing/writer.ts` — `applyFenceWrite` (FR-002) | high | todo |
| 6  | A | T006: Create `wxkanban-agent/core/fencing/reader.ts` — read API; ports loadExistingFencesForFile + adds getFencesByOwner / getFenceHistory / listAllFences (FR-005) | high | todo |
| 7  | A | T007: Create `wxkanban-agent/core/fencing/drift-assert.ts` — module-load round-trip check (FR-007) | high | todo |
| 8  | B | T008: Create fixture directories under `tests/unit/fencing/fixtures/` (FR-011) | high | todo |
| 9  | B | T009: Create golden output files under `tests/unit/fencing/golden/` (FR-011) | high | todo |
| 10 | B | T010: Write `tests/unit/fencing/writer.test.ts` — fixture-iteration end-to-end | high | todo |
| 11 | B | T011: Write `tests/unit/fencing/emitter.test.ts` — decision-table for MODIFY/REPLACE | high | todo |
| 12 | B | T012: Write `tests/unit/fencing/reader.test.ts` — read-surface with stub FenceDbClient | high | todo |
| 13 | B | T013: Write `tests/unit/fencing/drift-assert.test.ts` — verifies FR-007 fires when broken | high | todo |
| 14 | B | T014: Port behaviors from old fence-emitter / fence-db tests into the new fixture set | medium | todo |
| 15 | C | T015: Cutover `wxkanban-agent/core/orchestrator/command-handlers/implement.ts` — per-file loop body collapses to single applyFenceWrite call (FR-008) | high | todo |
| 16 | C | T016: Cutover `wxkanban-agent/core/orchestrator/command-handlers/auditfences.ts` — imports from core/fencing/reader.ts only (FR-008) | high | todo |
| 17 | C | T017: Audit for any other consumers of fence-emitter / fence-db / content-hash; cutover or remove | medium | todo |
| 18 | D | T018: Delete `wxkanban-agent/core/orchestrator/fence-emitter.ts`, `fence-db.ts`, `content-hash.ts` (FR-009) | high | todo |
| 19 | D | T019: Delete or port old standalone test files for fence-emitter / fence-db | medium | todo |
| 20 | D | T020: Update `wxkanban-agent/package.json` — version bump; update `wxkanban-agent/CHANGELOG.md` | high | todo |
| 21 | D | T021: Final verification — full kit test suite, `auditfences --strict`, manual smoke of `implement 999/T901`; optional ADR-0001 update | high | todo |

## Dependencies

- **T001 first** — hash is the foundation everything else uses.
- **T002 depends on T001** — emitter uses the hash helper.
- **T003 depends on T001** — db helper writes content hashes.
- **T004 depends on T001 + T002** — drift check uses hash + fence parsing from emitter internals.
- **T005 depends on T002, T003, T004** — `writer.ts` orchestrates emitter + db + drift.
- **T006 depends on T003** — reader uses the same DB primitives. Can run parallel with T005.
- **T007 depends on T002** — round-trip uses emitter internals.
- **T008 + T009 can run in parallel** — fixture content + golden output files. Both depend only on the schema being clear (T001-T007 give shape).
- **T010 depends on T005 + T008 + T009**.
- **T011 depends on T002 + T008 + T009**.
- **T012 depends on T006**.
- **T013 depends on T007**.
- **T014 depends on T010 + T011 + T012 + T013** (porting old tests into the new infrastructure).
- **T015 depends on Slice A + B complete** — implement.ts cutover needs new module + tests.
- **T016 depends on Slice A + B complete** — auditfences cutover needs reader.
- **T017 depends on T015 + T016**.
- **T018 depends on T015 + T016 + T017** — can only delete after all call sites cut over.
- **T019 depends on T018**.
- **T020 depends on T018**.
- **T021 last** — depends on everything.

**Critical path**: T001 → T002 → T003 → T004 → T005 → T010/T011 → T015 → T018 → T020 → T021.

**Parallelizable**: T003 + T004 (after T001/T002); T006 + T007 (after dependencies satisfied); T010/T011/T012/T013 (after dependencies); T015 + T016 within Slice C (independent cutover sites).

**Phase boundaries** (per [plan.md](plan.md)):

- **Slice A**: T001-T007 — new canonical module.
- **Slice B**: T008-T014 — tests + fixture bundle.
- **Slice C**: T015-T017 — cutover all call sites.
- **Slice D**: T018-T021 — deletions + cleanup + final verification.

---

## Task Details

### T001 — `internals/hash.ts`

**Creates**: `wxkanban-agent/core/fencing/internals/hash.ts`

Pure relocation of `wxkanban-agent/core/orchestrator/content-hash.ts`. Same exports (`sha256`, `isDriftDetected` if it lives in that file today). Internal — never imported by external callers.

**Reference**: FR-001 in [spec.md](spec.md).

### T002 — `internals/emitter.ts`

**Creates**: `wxkanban-agent/core/fencing/internals/emitter.ts`

Pure relocation of `wxkanban-agent/core/orchestrator/fence-emitter.ts`. Internal import paths adjusted (hash helper at `./hash`).

**Reference**: FR-001 in [spec.md](spec.md).

### T003 — `internals/db.ts`

**Creates**: `wxkanban-agent/core/fencing/internals/db.ts`

Write-side relocation from `wxkanban-agent/core/orchestrator/fence-db.ts`. Includes `applyFenceDbWrites` plus the delete-branch logic (FR-004) — for each `taskfences` row tied to a deleted file's path, insert `taskfencehistory` row then delete `taskfences` + `taskfencemodifications` rows. The read-side (`loadExistingFencesForFile`) is NOT here; it moves to `reader.ts` in T006.

**Reference**: FR-001, FR-004 in [spec.md](spec.md).

### T004 — `internals/drift.ts`

**Creates**: `wxkanban-agent/core/fencing/internals/drift.ts`

Extracts the drift-check logic from `wxkanban-agent/core/orchestrator/command-handlers/implement.ts`'s inline block (the loop that iterates existing fences, extracts body from `currentContent`, computes hash, compares to `fence.contenthash`). Exports `checkDrift(filepath, currentContent, existingFences): DriftDetection`.

Returns a structured detection result (per-fence drift booleans). Does not throw — the caller (`applyFenceWrite` in T005) decides based on `acceptDrift` option.

**Reference**: FR-003 in [spec.md](spec.md).

### T005 — `writer.ts`

**Creates**: `wxkanban-agent/core/fencing/writer.ts`

Implements `applyFenceWrite(options): Promise<FenceWriteResult>` per FR-002. Full lifecycle per Q1(b):

1. Validate options shape.
2. Load `currentContent` from filesystem (or null if `action === 'create'` and file doesn't exist).
3. Load `existingFences` from DB (via `loadExistingFencesForFile` from `reader.ts` once available, or directly from `internals/db.ts` query — implementer's choice).
4. Run `checkDrift` (FR-003); if drift detected and `!acceptDrift`, throw `ImplementError(1, ...)` byte-identical message.
5. Branch by action:
   - `"create"` or `"modify"`: call `emitFence` from internals → atomic file write (tmp + rename) → `applyFenceDbWrites` from internals.
   - `"delete"`: hard-fail if file missing (`ImplementError(2, "cannot delete <path>: file does not exist")`); `unlinkSync` the file; delete-branch DB writes from FR-004.
6. Handle `dryRun: true` — no FS or DB side effects; push to `filesSkipped`.
7. Handle DB-less mode (FR-006) — file writes still happen; DB writes are no-ops; warning added to result.
8. Return `FenceWriteResult` with `filesWritten` / `filesDeleted` / `filesSkipped` / `warnings`.

The function is the kit's single high-level fence-write entry point.

**Reference**: FR-002, FR-003, FR-004, FR-006 in [spec.md](spec.md).

### T006 — `reader.ts`

**Creates**: `wxkanban-agent/core/fencing/reader.ts`

Read-side surface per FR-005:

- `getFencesForFile(db, projectId, filepath)` — relocate from `fence-db.ts`'s `loadExistingFencesForFile`. Same query, renamed for clarity.
- `getFencesByOwner(db, projectId, ownerScope, ownerTask?)` — new query for audit/inventory.
- `getFenceHistory(db, projectId, filepath?)` — queries `taskfencehistory` table.
- `listAllFences(db, projectId)` — full inventory for audit consumers.

Exports `FenceRecord` + `FenceHistoryRecord` types (mirrors row shapes from `taskfences` and `taskfencehistory`).

No write methods. `auditfences` and other audit consumers import from here only.

**Reference**: FR-005 in [spec.md](spec.md).

### T007 — `drift-assert.ts`

**Creates**: `wxkanban-agent/core/fencing/drift-assert.ts`

Module-load synchronous round-trip check per FR-007:

- Constructs in-memory file body + synthetic emitter call with action `"create"`, ownerScope `"999"`, ownerTask `"T999"`, description `"drift assert test"`.
- Runs `emitFence` from `internals/emitter.ts`.
- Asserts the result's fence-marker text matches the regex `reader.ts`-side parsing expects.
- Asserts a second cycle is idempotent (no duplicate markers, no new dbWrites).

Throws synchronously with a descriptive message if either assertion fails.

**Reference**: FR-007 in [spec.md](spec.md).

### T008 — Fixture directories

**Creates**: `wxkanban-agent/tests/unit/fencing/fixtures/<name>/` directories per FR-011.

Fixture set covers: create with detectable unit, modify (< 80% diff), modify (≥ 80% diff), delete with fences, delete missing file, drift detected, multi-fence per file, dry-run, DB-less mode. Each fixture is a small directory: input file body + applyFenceWrite options.

**Reference**: FR-011 in [spec.md](spec.md).

### T009 — Golden output files

**Creates**: `wxkanban-agent/tests/unit/fencing/golden/<name>.json`

For each fixture in T008, expected output: file body after applyFenceWrite + expected `taskfences` row contents + expected `taskfencehistory` row contents (for delete fixtures) + expected `FenceWriteResult` shape.

**Reference**: FR-011 in [spec.md](spec.md).

### T010 — `writer.test.ts`

**Creates**: `wxkanban-agent/tests/unit/fencing/writer.test.ts`

Iterates fixtures from T008, runs `applyFenceWrite()` on each, asserts result + post-write file content + DB row writes match the golden output from T009.

**Reference**: FR-011 in [spec.md](spec.md).

### T011 — `emitter.test.ts`

**Creates**: `wxkanban-agent/tests/unit/fencing/emitter.test.ts`

Decision-table tests for the internal emitter:

- MODIFY/REPLACE decision: 80% threshold (just under, just over).
- `--replace` / `--modify` override flags honored.
- Fence-parsing edge cases (BEGIN/END regex variants, comment styles per language-matrix).
- MODIFIED-BY annotation insertion correctness.

Inputs + expected outputs in arrays; iterate via `it.each`.

**Reference**: FR-011 in [spec.md](spec.md).

### T012 — `reader.test.ts`

**Creates**: `wxkanban-agent/tests/unit/fencing/reader.test.ts`

Each of the 4 reader functions exercised with a stub `FenceDbClient` returning canned rows. Asserts the function correctly transforms DB rows into `FenceRecord` / `FenceHistoryRecord` shapes.

**Reference**: FR-011 in [spec.md](spec.md).

### T013 — `drift-assert.test.ts`

**Creates**: `wxkanban-agent/tests/unit/fencing/drift-assert.test.ts`

Verifies the FR-007 assert behaves correctly: passes on normal import; throws when intentionally broken (e.g., test stub mutates emitter to emit different marker format).

**Reference**: FR-007, FR-011 in [spec.md](spec.md).

### T014 — Port old test behaviors

**Modifies**: `wxkanban-agent/tests/unit/fencing/fixtures/**` + `golden/**` (additive).

Audit `wxkanban-agent/tests/` for tests that exercised the deleted `fence-emitter.ts`, `fence-db.ts`, or `content-hash.ts`. Each meaningful test assertion becomes a new fixture + golden pair OR a new test case in the appropriate test file.

**Reference**: FR-011 in [spec.md](spec.md).

### T015 — Cutover `implement.ts`

**Modifies**: `wxkanban-agent/core/orchestrator/command-handlers/implement.ts`

The per-file loop body collapses. Pre-034:

- Load `currentContent`, `existingFences`.
- Inline drift check block (~17 LOC).
- Inline delete-branch (~36 LOC from spec 031 Phase 1).
- Inline emitFence + applyFenceDbWrites + tmp/rename file write (~30 LOC).

Post-034:

```ts
const result = await applyFenceWrite({
  filepath: file.path,
  action: file.action,
  proposedContent: file.body,
  ownerScope: options.scope,
  ownerTask: options.task,
  description: task.title,
  mode: options.replace ? 'replace' : options.modify ? 'modify' : 'auto',
  acceptDrift: options.acceptDrift,
  db: options.dbClient,
  projectId: options.projectId,
  dryRun: options.dryRun,
});
filesWritten.push(...result.filesWritten);
filesDeleted.push(...result.filesDeleted);
filesSkipped.push(...result.filesSkipped);
warnings.push(...result.warnings);
```

That's ~15 LOC replacing ~80. Imports collapse from 3-4 fence-related to 1 (`applyFenceWrite`).

Run kit test suite after — all should pass per FR-010 byte-identical preservation.

**Reference**: FR-008 in [spec.md](spec.md).

### T016 — Cutover `auditfences.ts`

**Modifies**: `wxkanban-agent/core/orchestrator/command-handlers/auditfences.ts`

Replace any imports from `fence-db.ts` with `core/fencing/reader.ts`. Specifically:

- `loadExistingFencesForFile` → `getFencesForFile`.
- Any inventory queries → `listAllFences` or `getFencesByOwner`.
- Verify no write-side calls remain (audit should be read-only).

Run kit test suite + manual smoke (`auditfences` invocation against kit).

**Reference**: FR-008 in [spec.md](spec.md).

### T017 — Audit for other consumers

Grep for `from '../fence-emitter'`, `from '../fence-db'`, `from '../content-hash'` across the workspace (outside `specs/` and `docs/`). Cut over any remaining consumers; expected to be none after T015 + T016 but verify.

**Reference**: FR-008 in [spec.md](spec.md).

### T018 — Delete old surfaces

**Deletes**:

- `wxkanban-agent/core/orchestrator/fence-emitter.ts`
- `wxkanban-agent/core/orchestrator/fence-db.ts`
- `wxkanban-agent/core/orchestrator/content-hash.ts`

Verify zero matches in grep for old import paths outside docs.

**Reference**: FR-009 in [spec.md](spec.md).

### T019 — Delete or port old standalone test files

If `tests/unit/` contains test files specifically for the deleted modules (e.g., `tests/unit/fence-emitter.test.ts`), delete them after confirming their behaviors are captured in T010-T014's fixture set.

**Reference**: FR-009 in [spec.md](spec.md).

### T020 — Version bump + CHANGELOG

**Modifies**:

- `wxkanban-agent/package.json` — version bump (`0.8.0` → `0.9.0` if 032 + 033 shipped first; otherwise adjusted).
- `wxkanban-agent/CHANGELOG.md` — entry covering the consolidation, `implement.ts` LOC reduction (~80 → ~15 in per-file loop body), read/write surface separation, the `applyFenceWrite` single high-level API.

**Reference**: FR-012 #10 in [spec.md](spec.md).

### T021 — Final verification

**Verifies**:

- Full kit test suite green (`npx vitest run` in `wxkanban-agent/`).
- `wxkanban-agent auditfences --strict` exits 0.
- Manual smoke: `wxkanban-agent implement 999/T901 --print-prompt` (verifies fence-write end-to-end via the existing fixture scope from spec 031 Phase 3).
- Optional: update `wxkanban-agent/docs/adr/0001-cross-surface-concerns-live-in-one-canonical-module.md` evidence section to note spec 034 as the third concrete application. Add "pattern is mature" note.

**Reference**: FR-012 in [spec.md](spec.md).

---

## Notes for `wxkanban-agent implement 034`

The 21 tasks run in dependency order via `wxkanban-agent implement 034` (the v0.5.0+ batch mode shipped by spec 031). Surgical reruns use `wxkanban-agent implement 034/T0NN`.

Each task's fence header reads `// [SCOPE 034 / T0NN] BEGIN — <task title>` and is written by the orchestrator. If spec 032 (Track A) has already shipped, every new file in `core/fencing/` is properly fenced via the standard flow.

Pre-implementation gates per [plan.md](plan.md):

- Spec 033 shipped (preferred — twice-validated pattern). If not, 034 still ships with the once-validated pattern from 030.
- Spec 032 shipped (for clean fence baseline). If not, adds to unfenced-declarations debt.

The largest risk is **byte-identical preservation of Spec 026 semantics (FR-010)**. The cutover refactors `implement.ts`'s per-file loop body significantly; the existing test suite is the byte-identical witness. If any test that passed pre-034 fails post-034, the refactor has a regression — fix the code, never the assertion.

Once 034 ships, **ADR-0001 has three concrete applications** (Stage Gate, spec parser, fence writer). The pattern is established kit-wide; any future cross-surface concern in the kit defaults to its own `wxkanban-agent/core/<concern>/` module.
