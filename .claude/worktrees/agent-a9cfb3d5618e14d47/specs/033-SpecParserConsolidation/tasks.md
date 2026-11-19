# Task Breakdown: Spec-Parser Consolidation — Single Canonical Spec-Format Module

**Feature**: Spec-Parser Consolidation (ADR-0001 second application)
**Spec**: 033
**Date Generated**: 2026-05-17
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **ADR**: [ADR-0001](../../wxkanban-agent/docs/adr/0001-cross-surface-concerns-live-in-one-canonical-module.md)

---

## Tasks

| #  | Slice | Task | Priority | Status |
|----|-------|------|----------|--------|
| 1  | A | T001: Create `wxkanban-agent/core/spec-io/schema.ts` — SpecBundle, SpecTask, SpecMetadata types (FR-004) | high | todo |
| 2  | A | T002: Create `wxkanban-agent/core/spec-io/format.ts` — canonical regexes, column orders, format constants | high | todo |
| 3  | A | T003: Create `wxkanban-agent/core/spec-io/parser.ts` — loadSpecBundle, error classes, fresh implementation drawing from both spec-loader.ts and spec-md-parser.ts (FR-002) | high | todo |
| 4  | A | T004: Create `wxkanban-agent/core/spec-io/writer.ts` — markTaskDone + writeTasksMarkdown (FR-003) | high | todo |
| 5  | A | T005: Create `wxkanban-agent/core/spec-io/drift-assert.ts` — module-load round-trip check (FR-009) | high | todo |
| 6  | B | T006: Create fixture directories under `tests/unit/spec-io/fixtures/` per FR-010 (minimal, full, legacy-4col, new-5col, edge-task-ids, edge-status-cells, malformed-tasks-md) | high | todo |
| 7  | B | T007: Create golden JSON outputs under `tests/unit/spec-io/golden/` per FR-010 | high | todo |
| 8  | B | T008: Create `tests/unit/spec-io/parser.test.ts` — fixture-iteration tests | high | todo |
| 9  | B | T009: Create `tests/unit/spec-io/writer.test.ts` — round-trip + emission tests | high | todo |
| 10 | B | T010: Create `tests/unit/spec-io/drift-assert.test.ts` — verifies FR-009 assert fires when intentionally broken | high | todo |
| 11 | B | T011: Port behaviors from old `spec-loader` / `spec-md-parser` tests into the fixture set | medium | todo |
| 12 | C | T012: Cutover `wxkanban-agent/core/orchestrator/command-handlers/implement.ts` — import path swap | high | todo |
| 13 | C | T013: Cutover `wxkanban-agent/dbpush.ts` — replace inline regex parsing with `loadSpecBundle()` | high | todo |
| 14 | C | T014: Cutover `wxkanban-agent/core/orchestrator/command-handlers/createspecs.ts` — replace inline task generation with `writeTasksMarkdown()` | high | todo |
| 15 | C | T015: Cutover `wxkanban-agent/core/orchestrator/task-id-index.ts` — iterate via canonical parser | high | todo |
| 16 | C | T016: Cutover `mcp-server/src/server.ts` — cross-workspace call to canonical writer (FR-008) | high | todo |
| 17 | C | T017: Cutover test files (implement-end-to-end.test.ts, spec026-qt.test.ts, implement-command.test.ts) — import path swaps | high | todo |
| 18 | C | T018: Create `wxkanban-agent/scripts/spec-migration-check.ts` (FR-011); run against every spec under `specs/`; fix any failures in this PR | high | todo |
| 19 | D | T019: Delete `wxkanban-agent/core/orchestrator/spec-loader.ts`, `spec-md-parser.ts`, `tasks-md-writer.ts` (FR-007) | high | todo |
| 20 | D | T020: Update `wxkanban-agent/package.json` — `spec:check` script + version bump; update `wxkanban-agent/CHANGELOG.md` | high | todo |
| 21 | D | T021: Final verification — full kit test suite, `npm run spec:check`, manual smoke of CLI + MCP paths; optional ADR-0001 update | high | todo |

## Dependencies

- **T001 first** — schema is the foundation everything else uses.
- **T002 depends on T001** — format constants reference schema types.
- **T003 depends on T001 + T002** — parser produces SpecBundle, uses format constants.
- **T004 depends on T001 + T002** — writer produces SpecBundle-shaped output.
- **T005 depends on T003 + T004** — drift-assert round-trips through both.
- **T006 + T007 can run in parallel** with each other; both depend only on T001 (need the schema for golden JSON structure).
- **T008 depends on T003 + T006 + T007**.
- **T009 depends on T004 + T006 + T007**.
- **T010 depends on T005**.
- **T011 depends on T008 + T009** — porting old tests means adapting them to the new fixture style.
- **T012-T017 each depend on Slice A + B complete** — new module + tests must exist before cutover. Within Slice C, the 6 cutover tasks can run in any order (each is independent), but run tests after each.
- **T018 depends on T003 (parser exists)** — migration check uses the canonical parser. Can run after Slice A or after Slice C; placing in Slice C keeps the validation gate close to the cutover work.
- **T019 depends on T012-T017** — can only delete old surfaces after all call sites cut over.
- **T020 depends on T019** — version bump + changelog reflect the final state.
- **T021 last** — depends on everything.

**Critical path**: T001 → T002 → T003 → T004 → T005 (Slice A) → T008-T010 (Slice B, parallelizable in part) → T012-T017 (Slice C cutover) → T018 → T019 → T020 → T021.

**Parallelizable**: T006 + T007 (after T001); T008/T009/T010 (after dependencies satisfied); T012-T017 within Slice C (independent cutover sites).

**Phase boundaries** (per [plan.md](plan.md)):

- **Slice A**: T001-T005 — new canonical module.
- **Slice B**: T006-T011 — tests + fixture bundle.
- **Slice C**: T012-T018 — cutover all call sites + migration validation.
- **Slice D**: T019-T021 — deletions + cleanup + final verification.

---

## Task Details

### T001 — `schema.ts`

**Creates**: `wxkanban-agent/core/spec-io/schema.ts`

Defines `SpecBundle`, `SpecTask`, `SpecMetadata` interfaces per FR-004. Pure types, no runtime code. Importable by every other module in the package.

**Reference**: FR-004 in [spec.md](spec.md).

### T002 — `format.ts`

**Creates**: `wxkanban-agent/core/spec-io/format.ts`

Canonical regexes, column orders, comment-form prefixes — single source of truth for what the spec format IS. Includes:

- `TASK_ROW_REGEX_4COL` — matches the 4-column form (legacy).
- `TASK_ROW_REGEX_5COL` — matches the 5-column form (with Dependencies).
- `TASK_ID_REGEX` — `^T\d+$` baseline (audit both old parsers for variants).
- `STATUS_VALUES` — set of valid status strings (`todo`, `done`, `in-progress`, etc.).
- `SPEC_HEADER_REGEX` — parses spec.md `**Field**: value` lines.
- Column order constants for writer.ts to emit consistently.

**Reference**: FR-002, FR-005 in [spec.md](spec.md).

### T003 — `parser.ts`

**Creates**: `wxkanban-agent/core/spec-io/parser.ts`

**Implementer first step**: read `wxkanban-agent/core/orchestrator/spec-loader.ts` AND `spec-md-parser.ts` in full. Catalog every behavioral difference between them (task-ID regex variants, status-cell trimming, fallback behavior, error throwing vs silent return). Document the union of accepted inputs.

Then implement `loadSpecBundle(specsRoot, scope): SpecBundle` per FR-002 to handle that union. Re-export error classes (`SpecNotFoundError`, `TaskNotFoundError`, `TaskBlockedByDependenciesError`). Add the new `SpecFormatError` with precise location info.

The dependency column detection (FR-005 fallback) lives in the task-table parsing helper.

**Reference**: FR-002, FR-005 in [spec.md](spec.md).

### T004 — `writer.ts`

**Creates**: `wxkanban-agent/core/spec-io/writer.ts`

Exports `markTaskDone(bundle, taskId): SpecBundle` and `writeTasksMarkdown(bundle, tasksMdPath): void`. Uses canonical regexes + column orders from `format.ts`.

Writer detects existing tasks.md column count (4 vs 5) before emitting and preserves the format on round-trip. For brand-new tasks.md files: emit 5-column form by default IF any task has non-empty dependencies; otherwise emit 4-column form.

**Reference**: FR-003, FR-005 in [spec.md](spec.md).

### T005 — `drift-assert.ts`

**Creates**: `wxkanban-agent/core/spec-io/drift-assert.ts`

Module-load synchronous round-trip check per FR-009. Constructs a known SpecBundle in-memory, writes it to a string via the writer's internal helper, parses it back, asserts equality. Throws synchronously with a descriptive message if drift is detected.

**Reference**: FR-009 in [spec.md](spec.md).

### T006 — Fixture directories

**Creates**: `wxkanban-agent/tests/unit/spec-io/fixtures/<name>/` directories per FR-010.

Each fixture is a small directory mimicking a spec scope: `spec.md` + `tasks.md` + optional other files. Fixtures cover the minimum named set plus any quirks discovered from the spec 030/031/032 paper.

**Reference**: FR-010 in [spec.md](spec.md).

### T007 — Golden JSON outputs

**Creates**: `wxkanban-agent/tests/unit/spec-io/golden/<name>.json`

For each fixture in T006, the expected `SpecBundle` JSON output from the canonical parser. These files are the test contract — adding a new fixture means adding a new golden file.

**Reference**: FR-010 in [spec.md](spec.md).

### T008 — `parser.test.ts`

**Creates**: `wxkanban-agent/tests/unit/spec-io/parser.test.ts`

Iterates fixtures from T006, runs `loadSpecBundle()` on each, asserts result matches the golden JSON from T007. Also covers expected-throw tests (malformed-tasks-md fixture throws SpecFormatError; spec-not-found throws SpecNotFoundError).

**Reference**: FR-010 in [spec.md](spec.md).

### T009 — `writer.test.ts`

**Creates**: `wxkanban-agent/tests/unit/spec-io/writer.test.ts`

Round-trip tests: parse fixture → markTaskDone → write → parse again → assert deep equality with expected post-write state. Emission tests: build SpecBundle in memory → writeTasksMarkdown → parse back → assert.

**Reference**: FR-010 in [spec.md](spec.md).

### T010 — `drift-assert.test.ts`

**Creates**: `wxkanban-agent/tests/unit/spec-io/drift-assert.test.ts`

Verifies the FR-009 module-load assert behaves correctly: passes on normal load; throws when intentionally broken (e.g., a test stub that mutates the writer to emit a different column order, then re-runs the assert).

**Reference**: FR-009, FR-010 in [spec.md](spec.md).

### T011 — Port old parser test behaviors

**Modifies**: `wxkanban-agent/tests/unit/spec-io/fixtures/**` + `golden/**` (additive).

Audit `wxkanban-agent/tests/unit/` for tests that exercised the deleted `spec-loader.ts` or `spec-md-parser.ts`. Each meaningful test assertion becomes a new fixture + golden pair (or a new test case in `parser.test.ts` / `writer.test.ts`).

**Reference**: FR-010 in [spec.md](spec.md).

### T012 — Cutover `implement.ts`

**Modifies**: `wxkanban-agent/core/orchestrator/command-handlers/implement.ts`

Replace `import { loadSpecBundle, findTask, verifyTaskUnblocked, SpecNotFoundError, TaskNotFoundError, TaskBlockedByDependenciesError } from '../spec-loader'` with `from '../../spec-io/parser'`. Run tests after.

**Reference**: FR-006 in [spec.md](spec.md).

### T013 — Cutover `dbpush.ts`

**Modifies**: `wxkanban-agent/dbpush.ts`

Replace inline regex parsing of `tasks.md` (line ~49–72) with a call to `loadSpecBundle()` from `wxkanban-agent/core/spec-io/parser.ts`. Operate on the typed `SpecTask[]` for the dbpush logic. Run tests / manual smoke after.

**Reference**: FR-006 in [spec.md](spec.md).

### T014 — Cutover `createspecs.ts`

**Modifies**: `wxkanban-agent/core/orchestrator/command-handlers/createspecs.ts`

Replace inline task table generation with `writeTasksMarkdown()` from the canonical writer. The createspecs handler builds a SpecBundle (or a partial SpecBundle with just `tasks` populated) and passes it to the writer.

**Reference**: FR-006 in [spec.md](spec.md).

### T015 — Cutover `task-id-index.ts`

**Modifies**: `wxkanban-agent/core/orchestrator/task-id-index.ts`

Replace inline task ID parsing with iteration: for each spec directory, call `loadSpecBundle(specsRoot, scope)` and read `bundle.tasks.map(t => t.id)`. Index from the typed data.

**Reference**: FR-006 in [spec.md](spec.md).

### T016 — Cutover `mcp-server/src/server.ts`

**Modifies**: `mcp-server/src/server.ts`

Replace `createTasksMarkdown` (the inline generator) with a cross-workspace call to `writeTasksMarkdown` from `wxkanban-agent/core/spec-io/writer.ts`. Import path: `'../../wxkanban-agent/core/spec-io/writer.js'`. Same workspace-coupling pattern as spec 030's enforceTool import.

Start the MCP server after the change; manually invoke a tool that exercises tasks.md generation (e.g., `project.create_specs` once Track C of spec 032 has registered it; otherwise verify via existing implicit callers).

**Reference**: FR-006, FR-008 in [spec.md](spec.md).

### T017 — Cutover test files

**Modifies**: `wxkanban-agent/tests/integration/implement-end-to-end.test.ts`, `wxkanban-agent/tests/integration/spec026-qt.test.ts`, `wxkanban-agent/tests/unit/implement-command.test.ts`, plus any other test file importing from the soon-to-be-deleted modules.

Import path swaps only; assertions unchanged. Run each test file individually after its swap.

**Reference**: FR-006 in [spec.md](spec.md).

### T018 — `spec-migration-check.ts`

**Creates**: `wxkanban-agent/scripts/spec-migration-check.ts`

Walks every `specs/**/spec.md` + `specs/**/tasks.md`, runs canonical parser, exits non-zero on any failure. For each failure: name the offending spec, the parser error message (file + line + violating content), and a one-line hint.

After writing the script, run it. For each failure: fix the spec text OR relax the parser + add a new fixture + golden. Document each decision in the PR description.

Wire `npm run spec:check` in `wxkanban-agent/package.json`.

**Reference**: FR-011 in [spec.md](spec.md).

### T019 — Delete old surfaces

**Deletes**:

- `wxkanban-agent/core/orchestrator/spec-loader.ts`
- `wxkanban-agent/core/orchestrator/spec-md-parser.ts`
- `wxkanban-agent/core/orchestrator/tasks-md-writer.ts`

After deletion, grep for `from '../spec-loader'`, `from '../spec-md-parser'`, `from './tasks-md-writer'` outside `specs/` and `docs/` — expect zero matches. Fix any stragglers.

**Reference**: FR-007 in [spec.md](spec.md).

### T020 — Version bump + CHANGELOG

**Modifies**:

- `wxkanban-agent/package.json` — version bump (`0.7.0` → `0.8.0` if spec 032 shipped first, else `0.6.0` → `0.7.0`). Add `"spec:check": "tsx scripts/spec-migration-check.ts"` to scripts.
- `wxkanban-agent/CHANGELOG.md` — entry covering consolidation, the new 5-column tasks.md format with backwards-compat fallback, the migration CI gate, the strict-by-default `SpecFormatError`.

**Reference**: FR-012 #11 in [spec.md](spec.md).

### T021 — Final verification

**Verifies**:

- Full kit test suite green (`npx vitest run` in `wxkanban-agent/`).
- `npm run spec:check` exits 0.
- Manual smoke test: `wxkanban-agent implement 030/T001 --print-prompt` (verifies parser end-to-end via implement). For MCP: start the server, invoke a tool that exercises createTasksMarkdown.
- Optional: update `wxkanban-agent/docs/adr/0001-cross-surface-concerns-live-in-one-canonical-module.md` evidence section to note spec 033 as the second concrete application.

**Reference**: FR-012 in [spec.md](spec.md).

---

## Notes for `wxkanban-agent implement 033`

The 21 tasks run in dependency order via `wxkanban-agent implement 033` (the v0.5.0+ batch mode shipped by spec 031). Surgical reruns use `wxkanban-agent implement 033/T0NN`.

Each task's fence header reads `// [SCOPE 033 / T0NN] BEGIN — <task title>` and is written by the orchestrator. If spec 032 (Track A) has already shipped, every new file in `core/spec-io/` is properly fenced via the standard flow — no bootstrap exception.

Pre-implementation, run the [plan.md](plan.md) Pre-Implementation Gates table. The most important gate: spec 032 shipping first (for clean fence baseline). If 032 hasn't shipped, the 033 implementation can still proceed but adds to the unfenced-declarations debt (folded into the next fence-cleanup pass).

The single most important pre-implementation action is the **T003 audit of both old parsers** — the design quality of the fresh parser depends on understanding what the two existing parsers tolerated.

Once 033 ships, spec-format drift in the kit is structurally eliminated. The pattern is then established across two refactors (030 + 033), and the third application (spec 034 fence-writer) inherits both worked examples.
