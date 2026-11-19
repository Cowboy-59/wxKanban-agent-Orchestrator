# Spec 033: Spec-Parser Consolidation — Single Canonical Spec-Format Module

**Spec Number**: 033
**Status**: `proposed`
**Created**: 2026-05-17
**Depends On**: 019-agent-orchestrator-kit (the kit being refactored), 026-CodeFencing (fence convention all new units follow), 030-StageGateConsolidation (first concrete ADR-0001 application; this is the second — same pattern), 031-ImplementEnhancements (delete + batch needed for the refactor itself), 032-KitHousekeeping (clean fenced baseline before this scope touches the same files)
**Governed By**: [ADR-0001](../../wxkanban-agent/docs/adr/0001-cross-surface-concerns-live-in-one-canonical-module.md) — **second concrete application** of the cross-surface-concerns-live-in-one-canonical-module rule
**Source**: in-conversation buildscope, 2026-05-17, queued during spec 030 buildscope as the next ADR-0001 application

---

## Overview

The wxkanban-agent kit has **six independent implementations** of spec markdown format parsing/generation, each with subtly different assumptions about task ID format, status column position, dependency representation, and markdown table edge cases. When the format evolves, files have to change in lockstep — and they don't.

Inventory of the duplication (verified during spec 030's architecture review):

1. `wxkanban-agent/core/orchestrator/spec-loader.ts` — `loadSpecBundle`, `parseTasks`, `findTask`, `verifyTaskUnblocked`. The primary parser used by `implement`.
2. `wxkanban-agent/core/orchestrator/spec-md-parser.ts` — a parallel parser that coexists with #1 in the same package. Its tests survive; the differences between #1 and #2 are not fully cataloged.
3. `wxkanban-agent/dbpush.ts` — inline parser for the `dbpush` command (~line 49–72 at time of spec writing).
4. `wxkanban-agent/core/orchestrator/command-handlers/createspecs.ts` — inline parser for the `createspecs` command's task table writing.
5. `wxkanban-agent/core/orchestrator/task-id-index.ts` — parses task IDs from tasks.md for cross-spec lookup.
6. `mcp-server/src/server.ts` — `createTasksMarkdown` (a generator, not a parser, but lives in the same format-knowledge surface — line ~183).

Six files, six implementations of the same concern. Same architectural shape as spec 030's Stage Gate problem. Same fix: **collapse into a single canonical module at `wxkanban-agent/core/spec-io/` with thin per-consumer surfaces.**

After this spec lands:

- `wxkanban-agent/core/spec-io/` is the only place that knows the spec markdown format. Adding a new spec field, changing the task table layout, or evolving the dependency syntax is a one-file edit.
- `spec-loader.ts` is deleted entirely; call sites swap to importing from `core/spec-io/parser.ts` directly. No shim layer.
- `spec-md-parser.ts` is deleted.
- `tasks-md-writer.ts` is deleted; its `markTaskDone` moves to `core/spec-io/writer.ts`.
- `dbpush.ts`, `createspecs.ts`, `task-id-index.ts`, and `mcp-server/src/server.ts`'s `createTasksMarkdown` consume the canonical module's parser/writer instead of their own.
- **Dependency parsing finally lands** as part of the canonical parser — resolving spec 030's deferred FR-006 about topological task ordering in batch-mode `implement <scope>` (FR-006 stated "spec-loader returns `dependencies: []` always"; that gets fixed here).
- Module-load drift assertions (same pattern as spec 030's `capabilities.ts`) catch desynchronization between the parser and the writer.

This spec is **the second concrete application of [ADR-0001](../../wxkanban-agent/docs/adr/0001-cross-surface-concerns-live-in-one-canonical-module.md)**. The pattern from spec 030 (canonical core module + adapters + delete old surfaces + uniform behavior across surfaces) applies cleanly. Slice-style implementation (A: new module, B: cutover, C: delete, D: tests) is expected to mirror spec 030's structure.

### Core Design

| Element | Value |
| --- | --- |
| **Primary Actors** | wxkanban-agent kit maintainers (refactor target); every command that reads or writes spec files (`implement`, `dbpush`, `createspecs`, `buildscope`, `auditfences`, the MCP server's spec-document handlers); future scopes that evolve the spec format (one-file edit instead of six). |
| **Key Value** | Spec format drift is structurally eliminated. Adding a new field to spec.md or tasks.md is a single-file change. The deferred topological dependency sort from spec 030 FR-006 is finally implementable (and lands as part of this scope). The kit gains its second worked example of ADR-0001, refining the pattern for spec 034 (fence-writer) which lands after. |
| **Scope Boundary (IN)** | New canonical module `wxkanban-agent/core/spec-io/` with `parser.ts`, `writer.ts`, `schema.ts`, `format.ts`, `drift-assert.ts`. Cutover of all 6+ consumer sites. Deletion of `spec-loader.ts`, `spec-md-parser.ts`, `tasks-md-writer.ts`. Dependency parsing in tasks.md (resolves spec 030 deferred FR-006). Module-load drift assertions. Migration validation — every existing `specs/**/spec.md` and `tasks.md` parses cleanly via the new module (CI gate). Fixture-bundle test discipline. Version bump + CHANGELOG. |
| **Scope Boundary (OUT)** | New spec format syntax. The canonical parser must accept all 6 dialects' valid input on first pass; format unification can be a follow-up. Changes to spec format conventions documented in CLAUDE.md or elsewhere. The fence-writer concern (Spec 034). The CLI/MCP user-facing surface. The `taskfencehistory.action` column addition (spec 031 FR-004 deviation; separate concern). The topological-sort upgrade of `handleImplementBatchCommand` consuming the new dependencies (could be folded in per implementer choice, otherwise separate follow-up). |

---

## Functional Requirements

### FR-001 — Single canonical module at `wxkanban-agent/core/spec-io/`
All spec markdown format knowledge (read AND write) for the wxkanban-agent kit lives under `wxkanban-agent/core/spec-io/`. No other directory in `wxkanban-agent/` or `mcp-server/` contains spec-format parsing, generation, or format-aware regex. Adding a field, changing a column, or evolving a section is a one-file edit.

Directory layout:

```text
wxkanban-agent/core/spec-io/
  parser.ts           — read spec.md, tasks.md, plan.md, tests.md, quickstart.md into SpecBundle
  writer.ts           — emit SpecBundle / SpecTask updates back to markdown
  schema.ts           — SpecBundle, SpecTask, SpecMetadata type definitions
  format.ts           — canonical regexes, column orders, comment-form prefixes (single source of truth)
  drift-assert.ts     — module-load self-consistency check (parser/writer round-trip on a known fixture)
```

### FR-002 — Parser API
`parser.ts` exports `loadSpecBundle(specsRoot: string, scope: string): SpecBundle` as the canonical entry point. The function:

- Resolves the spec directory (`specs/<scope>-*/`) using the existing pattern.
- Reads every present spec file (`spec.md` mandatory; `plan.md`, `tasks.md`, `tests.md`, `quickstart.md`, `data-model.md`, `contracts/*` all optional) and populates the corresponding `SpecBundle` field.
- Parses the spec.md header into `SpecMetadata` (status, scope number, slug, dependsOn, source, created date).
- Parses tasks.md into `SpecTask[]` via the canonical regex from `format.ts`.
- Throws `SpecNotFoundError` (an existing error class — port from `spec-loader.ts`) if the scope directory does not exist.
- Throws `SpecFormatError` (new) with a precise location (file path + line number + violating content) if any present file fails to parse — replacing today's silent fallbacks.

The function is **a fresh implementation drawing from both `spec-loader.ts` and `spec-md-parser.ts`**. The implementer reads both files first, catalogs their behavioral differences (e.g., task-ID regex variants, status-cell trimming), and designs the canonical parser to handle the **union** of inputs both accepted. Both files' test suites are ported as fixtures — every behavior either old parser supported continues to work.

### FR-003 — Writer API
`writer.ts` exports two write functions:

- `markTaskDone(bundle: SpecBundle, taskId: string): SpecBundle` — flips a task's status from `todo` to `done` in the in-memory bundle AND writes the modified tasks.md back to disk (matches today's `markTaskDone` from `tasks-md-writer.ts`).
- `writeTasksMarkdown(bundle: SpecBundle, tasksMdPath: string): void` — emits tasks.md from scratch given a `SpecBundle.tasks` array. This is the canonical replacement for `mcp-server/src/server.ts`'s `createTasksMarkdown` — MCP server calls this instead of its own generator.

Both writers use the same canonical regexes and column orders from `format.ts` — by construction, what the parser reads, the writer produces.

### FR-004 — Canonical schema
`schema.ts` exports the typed interfaces:

```ts
export interface SpecBundle {
  scope: string;             // "030"
  slug: string;              // "StageGateConsolidation"
  specText: string;          // full spec.md content
  planText?: string;         // full plan.md content
  tasksMdText: string;       // full tasks.md content (mandatory — every scope has tasks)
  tasksMdPath: string;       // for writer ops
  testsText?: string;
  quickstartText?: string;
  dataModelText?: string;
  contractsText?: string;
  tasks: SpecTask[];
  metadata: SpecMetadata;
}

export interface SpecTask {
  id: string;                // "T013"
  title: string;             // "Delete old surfaces"
  status: string;            // "todo" | "done" | "in-progress" | (other)
  priority?: string;         // "high" | "medium" | "low"
  dependencies: string[];    // [] when dependency column absent (FR-005 fallback)
  description?: string;      // optional fuller description if present in a per-task detail section
}

export interface SpecMetadata {
  scopeNumber: string;       // "030"
  status: string;            // "proposed" | "implementing" | "implemented" | (other)
  slug: string;
  dependsOn: string[];       // parsed from "**Depends On**:" line in spec.md header
  source?: string;           // "in-conversation buildscope, 2026-05-16" or similar
  createdDate?: string;      // ISO date if present
}
```

Optional fields are `undefined` (not empty string) when the corresponding file or content is absent. `dependencies` defaults to `[]` for backwards compatibility with tasks.md files written before the FR-005 column.

### FR-005 — Dependency parsing syntax (5-column with 4-column fallback)
The canonical parser supports a new optional `Dependencies` column in the tasks.md task table:

```markdown
| # | Task | Priority | Status | Dependencies |
|---|------|----------|--------|--------------|
| 1 | T001: Foo | high | done |  |
| 2 | T002: Bar | high | todo | T001 |
| 3 | T003: Baz | high | todo | T001, T002 |
```

Parser behavior:

- If the table header line contains `Dependencies` (case-insensitive, exact column name), the parser reads that column as a comma-separated list of task IDs. Empty cell → `dependencies: []`.
- If the header line does NOT contain `Dependencies`, the parser defaults every task's `dependencies` to `[]` and reads the 4-column form (matches today's `spec-loader.parseTasks` shape exactly).
- The presence of the column is detected per-file at parse time. Specs 030, 031, 032 (which have 4-column tasks.md) continue to parse cleanly with empty dependencies; new specs adopt the 5-column form.

This resolves **spec 030's deferred FR-006** about topological task ordering: once `SpecTask.dependencies` is populated, the batch-mode `implement <scope>` in spec 031 can topologically sort instead of walking file order. (That upgrade is a small additive change to `handleImplementBatchCommand`; not part of this spec's scope but enabled by it.)

The writer emits the 5-column form for new specs by default; legacy 4-column tasks.md files are preserved as-is on round-trip (writer detects existing column count and preserves it).

### FR-006 — All call sites consume the canonical module
Every site in the workspace that currently parses or generates spec markdown is updated to import from `wxkanban-agent/core/spec-io/`. Inventory of changed call sites:

| Call site | Today | After cutover |
|---|---|---|
| `wxkanban-agent/core/orchestrator/command-handlers/implement.ts` | Imports `loadSpecBundle, findTask, verifyTaskUnblocked, SpecNotFoundError, TaskNotFoundError, TaskBlockedByDependenciesError` from `'../spec-loader'` | Same exports, imported from `'../../spec-io/parser'` |
| `wxkanban-agent/dbpush.ts` | Inline regex parsing of `tasks.md` (line ~49–72) | Calls `loadSpecBundle()` from canonical module; operates on the typed `SpecTask[]` |
| `wxkanban-agent/core/orchestrator/command-handlers/createspecs.ts` | Inline task table generation | Calls `writeTasksMarkdown()` from canonical writer |
| `wxkanban-agent/core/orchestrator/task-id-index.ts` | Inline parsing of task IDs across all specs | Iterates scopes, calls `loadSpecBundle()` per scope, reads `bundle.tasks.map(t => t.id)` |
| `mcp-server/src/server.ts` (`createTasksMarkdown`) | Inline generator | Calls `writeTasksMarkdown()` from canonical writer (cross-workspace import per FR-008) |
| `wxkanban-agent/core/orchestrator/tasks-md-writer.ts` (`markTaskDone`) | Independent writer for status flips | Becomes a re-export from `core/spec-io/writer.ts`'s `markTaskDone` (the two are functionally identical; consolidate) |
| **Test files**: `implement-end-to-end.test.ts`, `spec026-qt.test.ts`, `command-handlers.test.ts`, etc. that import any of the above | Same as their consumers | Import path swap only; assertions unchanged |

The cutover is a per-file mechanical swap of import paths plus, for the 3 inline-parser call sites (dbpush, createspecs, task-id-index), a small refactor to consume typed data instead of raw regex matches. Behavioral contract preserved at each call site — the canonical module's outputs match what the inline parsers produced for valid inputs.

### FR-007 — Old surfaces deleted
After this spec lands, these files do not exist in the workspace:

- `wxkanban-agent/core/orchestrator/spec-loader.ts` — fully deleted (not a re-export shim). Its error classes (`SpecNotFoundError`, `TaskNotFoundError`, `TaskBlockedByDependenciesError`) move to `core/spec-io/parser.ts` and are re-exported from there.
- `wxkanban-agent/core/orchestrator/spec-md-parser.ts` — fully deleted. Its parsing behavior is subsumed by `core/spec-io/parser.ts`.
- `wxkanban-agent/core/orchestrator/tasks-md-writer.ts` — fully deleted. Its `markTaskDone` moves to `core/spec-io/writer.ts`.

No re-export shims. No `// removed — see SCOPE 033` comments. A grep for the old import paths (e.g., `from '../spec-loader'`, `from './tasks-md-writer'`) outside of git history returns zero matches.

The inline-parser call sites (`dbpush.ts`, `createspecs.ts`, `task-id-index.ts`) keep their files but their inline parsing code is replaced with calls to the canonical module — no file deletion, just internal refactor.

### FR-008 — Cross-workspace import for MCP server
`mcp-server/src/server.ts`'s `createTasksMarkdown` is replaced with a call to `writeTasksMarkdown` from `wxkanban-agent/core/spec-io/writer.ts`. The import path is `'../../wxkanban-agent/core/spec-io/writer.js'` (workspace-relative, mirroring the spec 030 Slice C pattern for cross-package imports — see `mcp-server/src/server.ts`'s existing import of `enforceTool` from the mcp-adapter).

This is the same workspace-coupling shape spec 030 used; no new import-path mechanism is introduced.

### FR-009 — Module-load drift assert
`wxkanban-agent/core/spec-io/drift-assert.ts` runs a synchronous round-trip check at first import:

- Constructs a known `SpecBundle` fixture (in-memory, no IO).
- Passes it through `writeTasksMarkdown` to produce a tasks.md string.
- Parses that string back through the canonical parser's `parseTasks` (internal helper).
- Asserts the resulting `SpecTask[]` equals the input fixture's `tasks` array.

If the round-trip fails, throws synchronously with a descriptive message naming the deviation field. Catches the most common future regression: parser and writer drifting (e.g., parser adds a new column expectation but writer doesn't emit it).

Pattern mirrors spec 030's `capabilities.ts` module-load drift assert. The cost is one-time and trivial.

### FR-010 — Fixture-bundle test discipline
Tests for `core/spec-io/` use the fixture-bundle pattern extending spec 031's `tests/fixtures/specs/999-Fixture/` precedent. Test layout:

```text
wxkanban-agent/tests/unit/spec-io/
  parser.test.ts         — exercises canonical parser against fixture bundle
  writer.test.ts         — round-trip + emission tests
  drift-assert.test.ts   — verifies the module-load assert fires when intentionally broken
  fixtures/              — each fixture is a small directory mimicking a spec scope
    minimal/              — bare minimum: spec.md + tasks.md, no optional files
    full/                 — every optional file present
    legacy-4col/          — 4-column tasks.md (pre-FR-005 format), tests fallback path
    new-5col/             — 5-column tasks.md with Dependencies column
    edge-task-ids/        — exercises task ID regex edge cases
    edge-status-cells/    — trailing whitespace, mixed case, etc.
    malformed-tasks-md/   — used in expected-throw tests for SpecFormatError
  golden/                 — expected SpecBundle JSON outputs per fixture
    minimal.json
    full.json
    ...
```

Parser tests iterate fixtures: load each via canonical parser, assert resulting `SpecBundle` matches the golden JSON. Adding a new format quirk = add a new fixture + golden JSON; the test loop picks it up automatically. Writer tests use the same fixtures: parse → write → parse again, assert round-trip equality.

**The test suites of the two deleted parsers** (`spec-loader.ts`'s tests and `spec-md-parser.ts`'s tests, wherever they live today — implementer audits and ports) **feed into the fixture set**. Every behavior either old parser supported is captured as a fixture; behavior compatibility is verified by the new parser passing every old test's assertions, restructured as fixture comparisons.

### FR-011 — Migration validation as a CI gate
A new validation script at `wxkanban-agent/scripts/spec-migration-check.ts` walks every `specs/**/spec.md` and `specs/**/tasks.md` in the repository, runs the canonical parser against each, and exits non-zero if any spec fails to parse.

- The script lives in `scripts/` alongside `doc-validation.ts` (spec 032 Track B) and follows the same conventions.
- Wired into the kit's normal CI flow via `npm run spec:check` (a new entry in `wxkanban-agent/package.json`).
- Run as part of the spec 033 PR before merge: the merge gate is "every existing spec under `specs/` parses cleanly via the new module."
- For each failure, the script emits the offending spec, the parser error message (file + line + violating content), and a one-line hint for the most likely fix.

The intent: discover spec-format quirks the old parsers tolerated silently. These get fixed in two ways:

- **Spec text fixed**: if the offender violates the documented format (e.g., a tasks.md missing a column the format requires), the spec itself is updated.
- **Parser relaxed**: if the offender represents a legitimate dialect the strict parser shouldn't reject, a new fixture is added and the parser is updated to accept it (with a new golden JSON).

Implementer judgement per case; document each decision in the spec 033 PR description.

### FR-012 — Acceptance criteria
This spec is complete when:

1. `wxkanban-agent/core/spec-io/` contains `parser.ts`, `writer.ts`, `schema.ts`, `format.ts`, `drift-assert.ts`. All other spec-format parsing or generation code is consolidated here.
2. `wxkanban-agent/core/orchestrator/spec-loader.ts`, `spec-md-parser.ts`, and `tasks-md-writer.ts` do not exist (FR-007).
3. All 7 call sites enumerated in FR-006 import from the canonical module; grep for `from '../spec-loader'`, `from '../spec-md-parser'`, `from './tasks-md-writer'` outside of docs returns no matches.
4. The MCP server's `createTasksMarkdown` is replaced by a call to the canonical writer (FR-008).
5. The new 5-column `Dependencies` parser path works AND the 4-column fallback works (FR-005). Spec 030, 031, 032 tasks.md files continue to parse cleanly with empty `dependencies: []`.
6. Module-load drift assert in `drift-assert.ts` fires when intentionally broken (FR-009).
7. `npm run spec:check` (FR-011) exits 0 against every spec currently under `specs/`. Where a spec required text edits to pass, the edits are part of the spec 033 PR.
8. Fixture-bundle test files in `tests/unit/spec-io/` exist and pass. Every old parser's test behaviors have been ported as fixtures (FR-010).
9. The full kit test suite passes (existing tests via the cutover paths + new fixture tests).
10. All new top-level code units in `core/spec-io/` carry the `// [SCOPE 033 / T0NN] BEGIN/END` fence written by the orchestrator (per Spec 026). This is automatic if spec 032 (Track A) lands before 033 implementation — every new file goes through the same fence flow Track A established.
11. Kit version bumped one minor (`0.7.0` → `0.8.0` assuming spec 032 ships first; otherwise `0.6.0` → `0.7.0`). `CHANGELOG.md` entry documents the consolidation + the new 5-column tasks.md format + the migration CI gate.
12. ADR-0001 updated (if needed) to reference spec 033 as the second concrete application — pattern is now confirmed across two refactors.

---

## User Scenarios & Testing

### Parser behavior

| Scenario | Setup | Expected outcome |
|---|---|---|
| Load valid spec (5-column tasks.md) | `loadSpecBundle('033', specsRoot)` against a clean spec dir | Returns SpecBundle with all 12 fields populated; `tasks` array has correct ids, titles, statuses, AND non-empty dependencies array per row. |
| Load valid spec (4-column tasks.md) | Same call against spec 030, 031, 032 | Returns SpecBundle; `tasks` array populated; every task's `dependencies` is `[]`. No error. |
| Load malformed tasks.md | tasks.md table missing the status column | Throws `SpecFormatError` with file path, line number, and content of the malformed row. |
| Load with missing optional files | spec.md present; no plan.md, tests.md, etc. | Returns SpecBundle with `specText` populated; optional fields `undefined`. No error. |
| Load with all optional files | Every optional file present | Returns SpecBundle with all optional fields populated as strings. |
| Spec not found | `loadSpecBundle('999')` against a directory with no 999-* scope | Throws `SpecNotFoundError` naming the missing scope. |
| Round-trip: parser ↔ writer | `bundle = load(scope); write(bundle); load(scope)` produces identical bundle | Equal by deep-equality. (Also enforced at module load by FR-009 drift assert.) |

### Writer behavior

| Scenario | Setup | Expected outcome |
|---|---|---|
| Mark task done preserves format | tasks.md with 5-column format; call `markTaskDone(bundle, 'T013')` | T013's status cell flips to `done`; file re-written with 5 columns preserved, other rows unchanged. |
| markTaskDone on 4-column tasks.md | Legacy 4-column format | Status cell flips; file re-written with 4 columns preserved (writer detects existing column count). |
| Generate new tasks.md from scratch | `writeTasksMarkdown(bundle, path)` with `bundle.tasks[0].dependencies = ['T001']` | Emits 5-column tasks.md (writer's default for new files when dependencies are non-empty); the row's dependency column reads "T001". |
| Generate new tasks.md with empty deps everywhere | All tasks have `dependencies: []` | Writer emits 4-column tasks.md (no Dependencies column needed); deps column is omitted as a courtesy. |

### Cross-workspace import

| Scenario | Setup | Expected outcome |
|---|---|---|
| MCP server uses canonical writer | MCP tool call (e.g., the parity scope's `project.create_specs`) generates a tasks.md | The generated file format matches what `wxkanban-agent createspecs` produces — no drift between MCP-side and CLI-side spec creation. |

### Migration validation

| Scenario | Setup | Expected outcome |
|---|---|---|
| Run `npm run spec:check` against repo | After this spec lands | Exits 0; every spec under `specs/` parses cleanly. |
| Run against a hypothetical malformed spec | Insert a corrupt tasks.md into `specs/099-Demo/tasks.md` | Exits non-zero; output names the offending file and the parser error. |

---

## New / Modified / Deleted Modules

| Path | Status | Notes |
|---|---|---|
| `wxkanban-agent/core/spec-io/parser.ts` | **New** | Canonical parser (FR-002); ports SpecNotFoundError, TaskNotFoundError, TaskBlockedByDependenciesError; adds SpecFormatError |
| `wxkanban-agent/core/spec-io/writer.ts` | **New** | Canonical writer (FR-003); markTaskDone + writeTasksMarkdown |
| `wxkanban-agent/core/spec-io/schema.ts` | **New** | SpecBundle, SpecTask, SpecMetadata types (FR-004) |
| `wxkanban-agent/core/spec-io/format.ts` | **New** | Canonical regexes, column orders, format constants |
| `wxkanban-agent/core/spec-io/drift-assert.ts` | **New** | Module-load round-trip check (FR-009) |
| `wxkanban-agent/core/orchestrator/command-handlers/implement.ts` | **Modified** | Import path swap from `'../spec-loader'` to `'../../spec-io/parser'` |
| `wxkanban-agent/dbpush.ts` | **Modified** | Replace inline regex parsing with `loadSpecBundle()` call (FR-006) |
| `wxkanban-agent/core/orchestrator/command-handlers/createspecs.ts` | **Modified** | Replace inline task generation with `writeTasksMarkdown()` call |
| `wxkanban-agent/core/orchestrator/task-id-index.ts` | **Modified** | Iterate scopes via canonical parser; consume `bundle.tasks[].id` |
| `mcp-server/src/server.ts` | **Modified** | `createTasksMarkdown` replaced with cross-workspace call to canonical writer (FR-008) |
| `wxkanban-agent/tests/integration/implement-end-to-end.test.ts` | **Modified** | Import path swap |
| `wxkanban-agent/tests/integration/spec026-qt.test.ts` | **Modified** | Import path swap |
| `wxkanban-agent/tests/unit/implement-command.test.ts` | **Modified** | Import path swap |
| `wxkanban-agent/scripts/spec-migration-check.ts` | **New** | Migration validation script (FR-011) |
| `wxkanban-agent/package.json` | **Modified** | Add `spec:check` script entry; version bump |
| `wxkanban-agent/tests/unit/spec-io/parser.test.ts` | **New** | Fixture-bundle parser tests (FR-010) |
| `wxkanban-agent/tests/unit/spec-io/writer.test.ts` | **New** | Fixture-bundle writer tests (FR-010) |
| `wxkanban-agent/tests/unit/spec-io/drift-assert.test.ts` | **New** | Drift assert tests (FR-010) |
| `wxkanban-agent/tests/unit/spec-io/fixtures/**` | **New** | Fixture directories per FR-010 |
| `wxkanban-agent/tests/unit/spec-io/golden/**` | **New** | Golden JSON outputs per FR-010 |
| `wxkanban-agent/core/orchestrator/spec-loader.ts` | **Deleted** | Replaced by `core/spec-io/parser.ts` (FR-007) |
| `wxkanban-agent/core/orchestrator/spec-md-parser.ts` | **Deleted** | Replaced by `core/spec-io/parser.ts` (FR-007) |
| `wxkanban-agent/core/orchestrator/tasks-md-writer.ts` | **Deleted** | Replaced by `core/spec-io/writer.ts` markTaskDone (FR-007) |
| `wxkanban-agent/CHANGELOG.md` | **Modified** | Version entry covering consolidation + 5-column format + migration gate |
| Existing `specs/**/spec.md` or `tasks.md` files | **Potentially modified** | Any spec that fails FR-011 migration validation gets text edits as part of this PR |
| `wxkanban-agent/docs/adr/0001-cross-surface-concerns-live-in-one-canonical-module.md` | **Modified (optional)** | Update evidence section to note 033 as the second concrete application |

---

## Risks & Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| **Strict-by-default behavior breaks consumers** — `SpecFormatError` throws where old parsers silently returned empty results | Medium — existing consumer scripts may depend on silent-fallback behavior | FR-011 CI gate runs the new parser against every existing spec PRE-merge; any failure is fixed in the same PR. Post-merge, downstream consumers see clean parses or explicit errors with precise locations. Lower risk than silent corruption. |
| **30+ existing specs reveal format quirks** — the old parsers tolerated edge cases the strict parser rejects | Medium — could discover specs whose tasks.md doesn't match the documented format | Each discovered quirk gets one of two fixes (per FR-011): spec text fix, or parser relaxation with new fixture + golden. Both are mechanical; the workload scales with how many quirks exist (unknown until inventory). |
| **Cross-workspace import brittleness (FR-008)** — `'../../wxkanban-agent/core/spec-io/writer.js'` from mcp-server breaks if mcp-server is extracted to a separate published package | Low — same brittleness spec 030 Slice C accepted; revisited if/when the kit topology changes | Documented as known constraint. No new mitigation needed. |
| **Cutover sequencing — call sites mid-refactor** | Medium — if implement.ts cuts over but task-id-index.ts hasn't, intermediate state has both old and new spec-loader imports | Implementation slice plan (per plan.md) cuts over all 7 call sites within one slice; no per-site partial commits. |
| **`SpecTask.description` parsing from per-task detail sections (FR-004)** — scraping prose for per-task description is brittle if section headings don't follow exact format | Low — `description` is optional; parser leaves it `undefined` rather than throwing if scraping fails | Document the heading format the scraper looks for in `format.ts` comments; specs that want machine-readable per-task descriptions follow the format, others don't. |
| **Spec 030's deferred FR-006 (topological dependency sort) — does this scope land it?** | N/A risk; consequential design decision | Per FR-005, this scope **enables** topological sort by populating `SpecTask.dependencies`, but doesn't change `handleImplementBatchCommand`. That upgrade is its own small follow-up scope (or could be folded into this spec's PR — implementer's call). Documented as out-of-band #1. |
| **Pre-existing implement.ts spec-loader imports may have multiple variants** — `loadSpecBundle`, `findTask`, etc. — risk that the new parser's API doesn't precisely match | Low — FR-002 explicitly states the canonical parser re-exports the existing error classes and offers the same entry-point shape | Implementer audits all imports before cutover; any API gap is closed in `core/spec-io/parser.ts` before swapping. |

---

## Dependencies

| Spec | Why |
|---|---|
| **019 — agent-orchestrator-kit** | The kit being refactored. All consolidated parsers live in kit-internal modules. |
| **026 — CodeFencing** | All new top-level code units in `core/spec-io/` carry `// [SCOPE 033 / T0NN] BEGIN/END` fences. |
| **030 — StageGateConsolidation** | First concrete ADR-0001 application; this spec is the second, copying the pattern. |
| **031 — ImplementEnhancements** | Delete action + batch mode required to perform this refactor cleanly via `wxkanban-agent implement 033`. |
| **032 — KitHousekeeping** | Track A's fence cleanup establishes the clean baseline this scope's new files inherit. Running 033 after 032 means every new declaration in `core/spec-io/` is properly fenced via the standard implement flow (no bootstrap exception). |

This spec is **a dependency of**: every future scope that touches spec parsing (no specific scopes today, but the spec-format is a foundational concern).

---

## Out-of-Band Issues to Track Separately

1. **Spec 030's deferred FR-006 — topological dependency sort in batch-mode `implement <scope>`.** This spec populates `SpecTask.dependencies`; the small upgrade to `handleImplementBatchCommand` to consume them and sort topologically (instead of walking file order) is a separate small follow-up. Could be folded into this PR per implementer choice.
2. **Spec 034 — Fence-Writer Consolidation.** Third concrete ADR-0001 application. Sequenced after this spec.
3. **Other broken commands per Spec 019.** `buildscope --edit` and `createspecs` (after this refactor `createspecs` consumes the canonical writer, may incidentally improve but not in scope).
4. **"Claude coworker" enhancement.** Deferred from spec 031.
5. **MCP-side batch mode question.** Deferred.
6. **`taskfencehistory.action` column.** Deferred (spec 031 FR-004 deviation).
7. **CI gate for `auditfences --strict` + `npm run doc:check` + `npm run spec:check`.** The kit now has three validation gates (one per recent spec); wiring them as required CI checks is a small follow-up scope.

---

## Data Model

N/A. This spec introduces no new database tables or schema changes. The parser/writer consume the existing on-disk markdown format.

## Acceptance Criteria

See **FR-012**. The 12 numbered conditions there are the canonical acceptance gate.

## Out of Scope

See the **Scope Boundary (OUT)** row of the Core Design table in the Overview section, and the **Out-of-Band Issues to Track Separately** section above for explicit non-goals.
