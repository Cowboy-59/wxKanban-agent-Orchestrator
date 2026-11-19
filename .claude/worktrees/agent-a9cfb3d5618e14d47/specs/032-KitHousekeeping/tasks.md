# Task Breakdown: Kit Housekeeping — Fence Cleanup + Doc-Validation + MCP Tool Parity + Bootstrap Defaults

**Feature**: Kit Housekeeping (4 tracks)
**Spec**: 032
**Date Generated**: 2026-05-17
**Amended**: 2026-05-19 (Track D — kit bootstrap defaults)
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **ADR**: [ADR-0001](../../wxkanban-agent/docs/adr/0001-cross-surface-concerns-live-in-one-canonical-module.md)

---

## Tasks

| #  | Track | Task | Priority | Status |
|----|-------|------|----------|--------|
| 1  | A | T001: Generate fence inventory via `auditfences --strict`; capture to inventory.md | high | todo |
| 2  | A | T002: Fence `wxkanban-agent/core/policy/capabilities.ts` | high | todo |
| 3  | A | T003: Fence `wxkanban-agent/core/policy/policy.ts` | high | todo |
| 4  | A | T004: Fence `wxkanban-agent/core/policy/resolve-current-phase.ts` | high | todo |
| 5  | A | T005: Fence `wxkanban-agent/core/policy/resolve-spec-verification.ts` | high | todo |
| 6  | A | T006: Fence `wxkanban-agent/core/policy/adapters/cli-adapter.ts` | high | todo |
| 7  | A | T007: Fence `wxkanban-agent/core/policy/adapters/mcp-adapter.ts` | high | todo |
| 8  | A | T008: Fence `wxkanban-agent/core/orchestrator/command-handlers/implement.ts` (spec 031 batch additions) | high | todo |
| 9  | A | T009: Fence `wxkanban-agent/apps/command-gateway/src/cli.ts` (`createFileBasedProposalSource`) | high | todo |
| 10 | A | T010: Fence `wxkanban-agent/workers/ai/buildscope-worker.ts` (mandatory per FR-003) | high | todo |
| 11 | A | T011: Fence additional foundational files surfaced by T001 inventory (one sub-task per file; spawn as T011a, T011b, ... as needed) | high | todo |
| 12 | A | T012: Verification — run `auditfences --strict`, confirm exit 0 (FR-005) | high | todo |
| 13 | B | T013: Create `wxkanban-agent/scripts/doc-validation.ts` (FR-006); implement the 5 assertion types from FR-007 | high | todo |
| 14 | B | T014: Create `wxkanban-agent/scripts/doc-validation.config.ts` with the FR-010 minimum assertion set | high | todo |
| 15 | B | T015: Wire `npm run doc:check` in `wxkanban-agent/package.json`; decide auditfences integration per FR-009 implementer-note | medium | todo |
| 16 | C | T016: Register 9 new MCP tool handlers in `mcp-server/src/server.ts` (FR-011); fix `project.kit_status` handler bug (FR-012) | high | todo |
| 17 | C | T017: Apply snake_case rename to existing 7 inconsistently-named MCP tools (FR-013) | high | todo |
| 18 | C | T018: Register 7 deprecation aliases (FR-014) | high | todo |
| 19 | C | T019: Update `wxkanban-agent/core/policy/adapters/mcp-adapter.ts` MCP_TOOL_MAP (FR-015) | high | todo |
| 20 | C | T020: Write MCP handler tests + alias tests + naming-convention assertion test (FR-016) | high | todo |
| 21 | D | T021: Create `wxkanban-agent/templates/shadcn-baseline/components.json` (FR-019) | high | todo |
| 22 | D | T022: Create `wxkanban-agent/templates/shadcn-baseline/tailwind.config.ts` (FR-020) | high | todo |
| 23 | D | T023: Create `wxkanban-agent/templates/shadcn-baseline/globals.css` (FR-021) | high | todo |
| 24 | D | T024: Create the 5 canonical components + `lib/utils.ts` `cn` helper under `wxkanban-agent/templates/shadcn-baseline/components/` (FR-022) | high | todo |
| 25 | D | T025: Create `wxkanban-agent/templates/shadcn-baseline/deps.json` (FR-024) | high | todo |
| 26 | D | T026: Implement `wxkanban-agent/core/orchestrator/command-handlers/kit-bootstrap-ui.ts` handler (FR-023) — idempotent copy, deps install via detected package manager, `--dry-run` + `--force` + `--no-install` flags | high | todo |
| 27 | D | T027: Wire CLI subcommand `kit:bootstrap-ui` in `core/policy/adapters/cli-adapter.ts`; add `Capability.KitBootstrapUi` to `capabilities.ts` with all-stages allow row | high | todo |
| 28 | D | T028: Register MCP tool `project.kit_bootstrap_ui` in `mcp-server/src/server.ts`; add mapping row in `core/policy/adapters/mcp-adapter.ts` | high | todo |
| 29 | D | T029: Handler tests — happy path, conflict-without-force, `--dry-run`, `--no-install`, MCP tool dispatch | high | todo |
| 30 | D | T030: Smoke test — bootstrap into an empty fixture project; `tsc --noEmit` + `vite build` pass; button-on-card-with-dialog renders (FR-017 #4) | high | todo |
| 31 | D | T031: Create `wxkanban-agent/docs/kit-bootstrap-ui.md` (FR-025); add assertion entry to `scripts/doc-validation.config.ts` (Track B integration) | medium | todo |
| 32 | R | T032: Release — version bump 0.6.0 → 0.7.0; CHANGELOG entry covering all 4 tracks; final verification (FR-017 #6, #7) | high | todo |

## Dependencies

- **T001 first** — inventory is the source of truth for the per-file plan. T002–T011 cannot be scoped without it.
- **T002–T011 can run in any order** after T001. Each is independent (per-file `implement` invocation).
- **T012 depends on T002–T011** — verification runs after all Track A fence tasks complete.
- **T013, T014, T015** (Track B) can run after Slice A checkpoint passes (T012). T014 depends on T013 (config references the assertion API). T015 depends on T013.
- **T016 (handler registrations) depends on Slice A checkpoint** — handlers live in `mcp-server/src/server.ts` which Track A fences (in T011 — that file is in Track A's inventory).
- **T017 (rename) depends on T016** — renaming after registering is cleaner than renaming inline.
- **T018 (aliases) depends on T017** — aliases reference the new canonical names.
- **T019 (mcp-adapter map update) depends on T016 + T017 + T018** — keeps the kit's policy and MCP server in sync.
- **T020 (tests) depends on T016 through T019**.
- **Track D**: T021–T025 (template files) can run in parallel after Slice A checkpoint (T012) — they touch new files only. T026 (handler) depends on T021–T025 existing. T027 depends on T026 and shares `capabilities.ts` / `cli-adapter.ts` with Track A's T002/T006 — sequence after those. T028 depends on T026 and shares `mcp-server/src/server.ts` / `mcp-adapter.ts` with T016/T019 — sequence after Track C. T029 depends on T028. T030 depends on T029. T031 depends on T026 + Track B's T014 (assertion config).
- **T032 (release) depends on Tracks A, B, C, and D all complete**.

**Critical path**: T001 → T002–T011 → T012 → T013 → T014 → T015 → T016 → T017 → T018 → T019 → T020 → T021–T025 (parallel) → T026 → T027 → T028 → T029 → T030 → T031 → T032.

**Phase boundaries** (per [plan.md](plan.md)):

- **Slice A**: T001 through T012 — fence cleanup.
- **Slice B**: T013, T014, T015 — doc-validation tooling.
- **Slice C**: T016 through T020 — MCP parity.
- **Slice D**: T021 — cleanup pass + final verification.

---

## Task Details

### T001 — Generate fence inventory

**Generates**: `specs/032-KitHousekeeping/inventory.md`

Runs `wxkanban-agent auditfences --strict` against the kit. Captures the full output (every unfenced top-level declaration: file path + line + declaration name + kind). The output is the source of truth for tasks T002–T011 — the per-file plan reflects whatever the inventory surfaces.

If the inventory contains files NOT pre-allocated to T002–T010, additional sub-tasks (T011a, T011b, etc.) are spawned to cover them.

**Reference**: FR-001 in [spec.md](spec.md).

### T002 through T010 — Per-file fence tasks (known files)

**Modifies**: one file per task, per the table above.

Each task is a `wxkanban-agent implement 032/T0NN` invocation:

1. Generate proposal: `[{ path: "<file>", body: "<current file source, unchanged>", action: "modify" }]`.
2. The orchestrator's `parseProposal` accepts the proposal.
3. `emitFence` detects top-level declarations in the file and wraps each in `// [SCOPE 032 / T0NN] BEGIN — <description>` / `END` markers. For files with existing top-level declarations that pre-date the 2026-05-13 baseline, ownership attribution is per-task (per the spec.md "Per-task ownership attribution" note — acceptable for "this scope adopted this file" semantic).
4. `taskfences` rows are written inside the per-task DB transaction.
5. tasks.md status flips to `done`.

**Reference**: FR-002, FR-003, FR-004 in [spec.md](spec.md).

### T011 — Per-file fence tasks for foundational files surfaced by inventory

**Modifies**: foundational orchestrator files identified by T001 inventory that aren't pre-allocated in T002–T010.

Likely candidates based on the codebase: `spec-loader.ts`, `spec-md-parser.ts`, `command-handlers/buildscope.ts`, `command-handlers/createspecs.ts`, `command-handlers/dbpush.ts`, `command-handlers/createtesttasks.ts`, `command-handlers/runqa.ts` (if exists), `command-handlers/wxht.ts`, `command-handlers/auditfences.ts`, `command-handlers/kit-status.ts`, `command-handlers/pipeline-agent.ts`, `command-handlers/pipeline-agent-run.ts`, `fence-emitter.ts`, `fence-db.ts`, `language-matrix.ts`, `declaration-detector.ts`, `content-hash.ts`, `tasks-md-writer.ts`, `workflow-engine.ts`, `transitions.ts`, `implement-prompt.ts`, possibly `task-id-index.ts`. Many of these will have multiple top-level declarations.

Each file's fence task follows the same shape as T002–T010. Spawn as sub-tasks `T011a`, `T011b`, etc., one per file. The implementer adjusts tasks.md to add these rows once the inventory is in hand.

**Reference**: FR-001, FR-002, FR-003 in [spec.md](spec.md).

### T012 — Slice A verification

Runs `wxkanban-agent auditfences --strict` after all Track A fence tasks complete. Expects exit 0 with no error-severity diagnostics. Also runs `npx vitest run` in `wxkanban-agent/` to confirm full kit test suite passes unchanged (FR-004 behavior preservation).

If `auditfences --strict` flags any remaining unfenced declarations, surface them — they are inventory entries that should have been covered. Either spawn a sub-task to fence them, or investigate why they weren't in the original T001 inventory.

**Reference**: FR-005 in [spec.md](spec.md).

### T013 — Doc-validation script

**Creates**: `wxkanban-agent/scripts/doc-validation.ts`

Implements the validation script per FR-006:

- Top-level `main()` that reads `scripts/doc-validation.config.ts`, iterates over the configured doc + assertion list, runs each assertion, accumulates failures, prints summary, exits with appropriate code.
- The 5 assertion types from FR-007 implemented as individual functions:
  - `mentionsForbidden(docText, forbidden[])` — substring / regex match
  - `flagExistsInCli(flag, cliSourcePath)` — parses the cli.ts for `'--<flag>'` references
  - `envVarReadByCode(varName, codeGlob)` — uses glob + grep for `process.env['<var>']`
  - `commandHasHandler(commandName, registrySourcePath)` — parses workflow-engine or cli for command registration
  - `exitCodeDocumented(code, codeGlob)` — uses glob + grep for `exitCode: <N>`, `process.exit(<N>)`, or `ImplementError(<N>, ...)`
- CLI: `--docs <glob>` override, `--verbose` per-assertion output.
- Exit codes: 0 = all pass; 1 = at least one assertion failed; 2 = config error or doc file missing.

Estimated ~200 LOC.

**Reference**: FR-006, FR-007 in [spec.md](spec.md).

### T014 — Assertion config

**Creates**: `wxkanban-agent/scripts/doc-validation.config.ts`

Declarative array of `{ doc, assertions[] }` entries. At minimum the FR-010 set:

- `docs/implement.md`: `mentionsForbidden(['Gemini', 'OpenAI', 'GROQ', 'AI client'])`
- `docs/implement.md`: `flagExistsInCli('--dry-run')`, `flagExistsInCli('--input')`, `flagExistsInCli('--continue-on-error')`, `flagExistsInCli('--verbose')`, `flagExistsInCli('--accept-drift')` (one per documented flag).
- `docs/command.md`: at least one assertion (e.g., `mentionsForbidden(['<obsolete-term>'])` — implementer picks a sensible one).
- `docs/fencing.md`: at least one assertion.

Comment annotations explain the rationale for each assertion (especially `mentionsForbidden` lists, which are easy to over-tune).

**Reference**: FR-007, FR-010 in [spec.md](spec.md).

### T015 — Wire `npm run doc:check`

**Modifies**: `wxkanban-agent/package.json` (add `"doc:check": "tsx scripts/doc-validation.ts"` or equivalent under `scripts`).

Optionally also wires into `wxkanban-agent/core/orchestrator/command-handlers/auditfences.ts` per FR-009 implementer-note. The decision (integrated step vs sibling command) is the implementer's choice; document the choice via inline comment.

**Reference**: FR-009 in [spec.md](spec.md).

### T016 — Register 9 new MCP tool handlers + fix kit_status bug

**Modifies**: `mcp-server/src/server.ts`

Adds:

- 9 `case` branches in the `tools/call` dispatch — one per new MCP tool from FR-011.
- 9 `name:` entries in the `tools/list` handler — declaring each new tool's name, description, and inputSchema.
- The `project.kit_status` case branch (FR-012 fix) — delegating to `handleKitStatusCommand` (already imported).

Each handler follows the existing `project.implement` template:

1. Extract `args` from request.
2. Validate via zod schema.
3. Resolve `projectId`, `user`, build `dispatchOptions` (with `specVerification` for spec-gated tools).
4. Dispatch to `WorkflowEngine.dispatch(context, '<cli-command-name>', args, user, dispatchOptions)` OR call the handler directly (per FR-011 implementer-note).
5. Shape response as `{ success, result, error?, audit? }`.

**Reference**: FR-011, FR-012 in [spec.md](spec.md).

### T017 — Apply snake_case rename

**Modifies**: `mcp-server/src/server.ts`

Renames in both `tools/list` and `tools/call`:

| Old | New |
|---|---|
| `project.buildscope` | `project.build_scope` |
| `project.prepareRelease` | `project.prepare_release` |
| `project.finalizeRelease` | `project.finalize_release` |
| `project.createtesttasks` | `project.create_test_tasks` |
| `project.runqa` | `project.run_qa` |
| `project.runhuman` | `project.run_human` |
| `project.auditfences` | `project.audit_fences` |

After this task, every MCP tool name matches `^project\.[a-z_]+$`.

**Reference**: FR-013 in [spec.md](spec.md).

### T018 — Register deprecation aliases

**Modifies**: `mcp-server/src/server.ts`

For each renamed tool from T017, register an alias entry in `tools/list` (with `[DEPRECATED]` prefix in the description) and a `case` branch in `tools/call` that:

1. Logs the deprecation warning: `logger.warn("MCP tool '<oldName>' is deprecated; use '<newName>' instead. Aliases will be removed in v0.8.0.")`.
2. Falls through to the canonical handler (e.g., `case 'project.buildscope': case 'project.build_scope': { ... }` or equivalent fallthrough pattern).

**Reference**: FR-014 in [spec.md](spec.md).

### T019 — Update mcp-adapter MCP_TOOL_MAP

**Modifies**: `wxkanban-agent/core/policy/adapters/mcp-adapter.ts`

Updates `MCP_TOOL_MAP`:

- All 12 existing entries renamed to snake_case keys (matching T017's rename).
- Add 7 deprecation alias entries (the old names from T018) sharing the same `Capability` and `displayName` as their canonical counterparts.
- Total entries during v0.7.0 lifetime: 19 (12 canonical + 7 deprecated).

**Reference**: FR-015 in [spec.md](spec.md).

### T020 — MCP handler tests + alias tests + naming-convention assertion

**Modifies / creates**: `mcp-server/tests/server.test.ts` (extend) or `mcp-server/tests/parity.test.ts` (new)

Per FR-016:

- 9 per-handler tests: each new tool invoked with valid args; expects successful response and the appropriate dispatch (mocked at the WorkflowEngine layer).
- `project.kit_status` regression test: would have failed before T016/T012 — confirms the bug is fixed.
- 7 deprecation alias tests: invoking each old name dispatches identically to the new name + logs the deprecation warning.
- Naming-convention assertion test: every entry in the `tools/list` response matches `^project\.[a-z_]+$`.

**Reference**: FR-016 in [spec.md](spec.md).

### T021 — Cleanup pass

**Modifies**:

- `wxkanban-agent/package.json` — version 0.6.0 → 0.7.0.
- `wxkanban-agent/CHANGELOG.md` — v0.7.0 entry covering all 3 tracks + FR-013 breaking change + FR-014 deprecation window.

**Verifies**:

- Full kit test suite green.
- `wxkanban-agent auditfences --strict` exits 0.
- `npm run doc:check` exits 0.
- Manual smoke test: invoke one new MCP tool per category (one stage-gated like `project.run_qa`; one cross-cutting like `project.dbpush`; one alias like `project.buildscope`) — verify response shape + behavior.

**Reference**: FR-017 in [spec.md](spec.md).

---

## Notes for `wxkanban-agent implement 032`

Once the implementation begins, all 21 tasks can run in dependency order via `wxkanban-agent implement 032` (the v0.5.0 batch mode shipped by spec 031). Surgical reruns of individual tasks use `wxkanban-agent implement 032/T0NN`.

Each task's fence header reads `// [SCOPE 032 / T0NN] BEGIN — <task title>` and is written by the orchestrator (per [spec 026](../026-CodeFencing/spec.md)) — Track A's whole point is that the orchestrator writes these markers.

Pre-implementation, run the [plan.md](plan.md) Pre-Implementation Gates table to confirm the kit's dist is built (`npm run build` in `wxkanban-agent/`). Then start at T001.

The FR-001 inventory step is the single most important pre-implementation action — it determines the actual scope of Track A.
