# Spec 033: Plan — Spec-Parser Consolidation

**See also**: [spec.md](spec.md), [tasks.md](tasks.md), [ADR-0001](../../wxkanban-agent/docs/adr/0001-cross-surface-concerns-live-in-one-canonical-module.md)

This file is the HOW. The WHAT is in [spec.md](spec.md). The task breakdown is in [tasks.md](tasks.md).

---

## Implementation Phasing

The refactor lands as **one PR in four sliced phases**, mirroring spec 030's A/B/C/D structure (the worked example this scope copies).

### Slice A — New canonical module (additive, no call sites touched)

1. Write `wxkanban-agent/core/spec-io/schema.ts` — `SpecBundle`, `SpecTask`, `SpecMetadata` types per FR-004.
2. Write `wxkanban-agent/core/spec-io/format.ts` — canonical regexes, column orders, format constants.
3. Write `wxkanban-agent/core/spec-io/parser.ts` — `loadSpecBundle()` per FR-002. Audit `spec-loader.ts` AND `spec-md-parser.ts` first; design parser to handle the union of inputs both accepted. Re-export error classes.
4. Write `wxkanban-agent/core/spec-io/writer.ts` — `markTaskDone()` + `writeTasksMarkdown()` per FR-003. Use canonical format.ts constants.
5. Write `wxkanban-agent/core/spec-io/drift-assert.ts` — module-load round-trip check per FR-009.

**Checkpoint after Slice A**: New code compiles. Existing tests still pass — no call sites changed. New module imported by zero files; the old parsers/writers continue to serve all consumers.

### Slice B — Tests + fixture bundle (additive)

1. Create `tests/unit/spec-io/fixtures/` with fixture directories per FR-010 (minimal, full, legacy-4col, new-5col, edge-task-ids, edge-status-cells, malformed-tasks-md).
2. Create `tests/unit/spec-io/golden/` with expected SpecBundle JSON outputs per fixture.
3. Write `tests/unit/spec-io/parser.test.ts` — iterate fixtures, assert parsed SpecBundle matches golden.
4. Write `tests/unit/spec-io/writer.test.ts` — round-trip tests + emission tests.
5. Write `tests/unit/spec-io/drift-assert.test.ts` — verifies the FR-009 assert fires when intentionally broken.
6. Audit existing `spec-loader` / `spec-md-parser` tests; port their behaviors into the fixture set.

**Checkpoint after Slice B**: New canonical module has full unit coverage. All new tests pass. Existing tests still pass. Old parsers still serve consumers.

### Slice C — Cutover all call sites + migration validation

1. Update `wxkanban-agent/core/orchestrator/command-handlers/implement.ts` — import path swap from `'../spec-loader'` to `'../../spec-io/parser'`. Test.
2. Update `wxkanban-agent/dbpush.ts` — replace inline regex parsing with `loadSpecBundle()` call. Test (manual + any existing dbpush tests).
3. Update `wxkanban-agent/core/orchestrator/command-handlers/createspecs.ts` — replace inline task generation with `writeTasksMarkdown()` call. Test.
4. Update `wxkanban-agent/core/orchestrator/task-id-index.ts` — iterate scopes via canonical parser. Test.
5. Update `mcp-server/src/server.ts` — `createTasksMarkdown` replaced with cross-workspace call. Manual smoke (start MCP server, invoke a tool that exercises it).
6. Update test files (`implement-end-to-end.test.ts`, `spec026-qt.test.ts`, `implement-command.test.ts`) — import path swaps. Run each test file individually after its swap.
7. Write `scripts/spec-migration-check.ts` per FR-011. Run it against every spec under `specs/`. Fix any failures in this PR (spec text edits OR parser relaxation + new fixture).

**Checkpoint after Slice C**: All 7 call sites import from canonical module. `npm run spec:check` exits 0. Full kit test suite passes. Old parsers still exist but unused.

### Slice D — Deletions + cleanup

1. Delete `wxkanban-agent/core/orchestrator/spec-loader.ts`.
2. Delete `wxkanban-agent/core/orchestrator/spec-md-parser.ts`.
3. Delete `wxkanban-agent/core/orchestrator/tasks-md-writer.ts`.
4. Grep for old import paths (`from '../spec-loader'`, `from './tasks-md-writer'`) outside docs — expect zero matches. Fix any stragglers.
5. Update `wxkanban-agent/package.json` — add `spec:check` script entry, version bump.
6. Update `wxkanban-agent/CHANGELOG.md` — entry covering consolidation + new 5-column format + migration gate.
7. (Optional) Update `wxkanban-agent/docs/adr/0001-*.md` evidence section to reference 033 as the second concrete application.
8. Final verification: full kit test suite, `npm run spec:check`, manual smoke of CLI + MCP paths.

---

## Pre-Implementation Gates

Three conditions must hold before Slice A begins.

| Gate | State as of 2026-05-17 | Action if not met |
|---|---|---|
| **Spec 032 (Track A) has landed** — kit reaches `auditfences --strict` exit 0 baseline. New `core/spec-io/` files inherit the clean fence state via standard implement flow. | **Not met** — spec 032 is paper-only at session end. | Either ship spec 032 implementation first, OR accept that spec 033's new files inherit the same bootstrap exception (unfenced; fixed by a future fence-cleanup pass). |
| **Spec 031 v0.5.0+ is functional** — delete action + batch mode shipped. Required for `implement 033` to delete spec-loader.ts + spec-md-parser.ts + tasks-md-writer.ts. | **Met** — shipped earlier this session (commits d3c011e, 8551aed, 053ef4c). | n/a |
| **Test runner functional.** Slice B + C checkpoints rely on running tests. | **Met** — vitest works throughout this session. | n/a |

---

## Hard Constraints

These are non-negotiable for the implementation phase.

1. **All writes through the orchestrator** — `wxkanban-agent implement 033/T0NN` writes every fence; never hand-author markers.
2. **One PR, four slices** — A → B → C → D ship together. Mid-state where new module exists but old parsers also exist is a state to pass through, not commit.
3. **Behavior preservation at each call-site cutover** — the canonical module's outputs match what the inline parsers produced for valid inputs. Tests at each call site continue to pass after its import swap.
4. **Strict-by-default parsing** — `SpecFormatError` is thrown, not swallowed. The FR-011 CI gate is what makes this safe (pre-merge discovery of any existing-spec quirks).
5. **No re-export shims** — `spec-loader.ts`, `spec-md-parser.ts`, `tasks-md-writer.ts` are deleted, not shimmed. Call sites swap directly.
6. **5-column with 4-column fallback** — per-file detection (FR-005). Spec 030/031/032 tasks.md continue parsing unchanged.
7. **Cross-workspace import for MCP server** — `'../../wxkanban-agent/core/spec-io/writer.js'` mirrors spec 030 Slice C precedent.

---

## Open Questions Resolved During Buildscope

| Question | Decision | Rationale |
|---|---|---|
| Two parsers (`spec-loader.ts` vs `spec-md-parser.ts`) — which to keep? | **(c) Fresh implementation drawing from both** | The two coexisting suggests neither felt complete. Fresh design captures lessons from both; old test suites become fixtures. |
| Dependency parsing syntax in tasks.md? | **(a) Dedicated column with fallback** | Explicit, machine-readable, no prose scraping. Legacy 4-column tasks.md still parses cleanly. |
| MCP-side `createTasksMarkdown` — surface-specific or canonical? | **(a) Canonical** | If the canonical module owns format knowledge, generation belongs there too. |
| Migration of existing specs? | **(a) Yes, CI gate** | Catches format quirks early. Pre-merge fix is better than post-merge debugging. |
| Canonical `SpecBundle` shape? | **Rich shape with optional fields** | Captures plan.md, tests.md, quickstart.md, etc. — fields the kit increasingly needs. Optional fields stay optional. |
| Test discipline? | **(b) Fixture-bundle** | Parsers operate on whole markdown files; fixtures read naturally. Extends spec 031's 999-Fixture precedent. |

---

## Rollback Strategy

**Mechanism**: `git revert <PR-merge-sha>`.

**Risk assessment**:

- **Low** for Slice A & B (new module + tests; nothing depends on them yet).
- **Medium** for Slice C (call sites swapped; reverting restores old parsers). The cross-workspace import in `mcp-server/src/server.ts` may have unique git-revert behavior depending on how it was merged.
- **Low** for Slice D (deletions; revert restores deleted files).

**Detection**: post-merge, the FR-011 CI gate `npm run spec:check` runs as the release gate. If post-merge consumers report behavior changes from strict-by-default parsing, the assertion config can be relaxed in a patch release before considering full revert.

**Recovery from rollback**: All 4 slices revert as one unit. The kit returns to the pre-033 state with six parsers + `spec-loader.ts`. Re-attempting after rollback is straightforward — the failure modes that caused rollback inform the next attempt's design.

**Forward-only after spec 034 lands**: Spec 034 (fence-writer consolidation) follows the same pattern; reverting 033 in isolation after 034 ships breaks the pattern's first application of 034's lessons.
