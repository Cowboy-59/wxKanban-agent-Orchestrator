# Task Breakdown: Stage Gate Consolidation — Single Canonical Policy Across CLI + MCP

**Feature**: Stage Gate Consolidation
**Spec**: 030
**Date Generated**: 2026-05-16
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **ADR**: [ADR-0001](../../wxkanban-agent/docs/adr/0001-cross-surface-concerns-live-in-one-canonical-module.md)

---

## Tasks

| #  | Task | Priority | Status |
|----|------|----------|--------|
| 1  | T001: Create `wxkanban-agent/core/policy/capabilities.ts` — Capability enum + gate table + module-load drift assert | high | todo |
| 2  | T002: Create `wxkanban-agent/core/policy/policy.ts` — pure `evaluate()`; port `formatBlockMessage` + `formatEscalationMessage` byte-identical | high | todo |
| 3  | T003: Create `wxkanban-agent/core/policy/resolve-current-phase.ts` — DB phase resolver with default-to-Design fallback | high | todo |
| 4  | T004: Create `wxkanban-agent/core/policy/resolve-spec-verification.ts` — active-scope inference + spec/task/doc verification | high | todo |
| 5  | T005: Modify `wxkanban-agent/core/schemas/lifecycle.ts` — Path A string-value correction; remove `AllowedCommandsByStage` + `CrossCuttingCommands` exports | high | todo |
| 6  | T006: Create `wxkanban-agent/core/policy/adapters/cli-adapter.ts` — CLI command-name → Capability translation | high | todo |
| 7  | T007: Create `wxkanban-agent/core/policy/adapters/mcp-adapter.ts` — MCP tool-name → Capability + parallel resolver calls | high | todo |
| 8  | T008: Cutover `wxkanban-agent/core/orchestrator/workflow-engine.ts` to `cli-adapter` | high | todo |
| 9  | T009: Cutover `wxkanban-agent/apps/command-gateway/src/cli.ts` to `cli-adapter` | high | todo |
| 10 | T010: Cutover `wxkanban-agent/apps/command-gateway/src/spec-verification.ts` to `cli-adapter` | high | todo |
| 11 | T011: Cutover `wxkanban-agent/scripts/verify-install.ts` to `cli-adapter` | medium | todo |
| 12 | T012: Cutover `mcp-server/src/server.ts` to `mcp-adapter` | high | todo |
| 13 | T013: Delete `wxkanban-agent/core/policy/command-policy.ts` + `mcp-server/src/utils/stage-enforcement.ts` (requires spec 031 delete action) | high | todo |
| 14 | T014: Reconcile `wxkanban-agent/core/orchestrator/transitions.ts` — remove local `STAGE_ORDER`, import canonical | medium | todo |
| 15 | T015: Create `wxkanban-agent/tests/unit/policy/policy.test.ts` — decision-table coverage | high | todo |
| 16 | T016: Create `wxkanban-agent/tests/unit/policy/cli-adapter.test.ts` + `mcp-adapter.test.ts` — name-mapping + resolver-stub coverage | high | todo |
| 17 | T017: Cleanup pass — delete `tests/unit/command-policy.test.ts`, update `README.md`, bump kit version + APP_VERSION, run `auditfences --strict` | high | todo |

## Dependencies

- **T005 first** — string-value correction is the foundation; the rest of the new code uses the corrected `LifecycleStage` enum.
- **T001 depends on T005** — `capabilities.ts` references `LifecycleStage` in the gate table.
- **T002 depends on T001** — `policy.ts` consumes the `Capability` enum.
- **T003 and T004 depend on T005** — both resolvers return `LifecycleStage` / use it. Can run parallel with T001/T002.
- **T006 depends on T001, T002** — `cli-adapter` consumes `Capability` + `policy.evaluate`.
- **T007 depends on T001, T002, T003, T004** — `mcp-adapter` consumes all of them.
- **T008–T012 depend on T006 / T007** as relevant. T008–T011 (CLI call sites) depend on T006. T012 (MCP call site) depends on T007. Cutover order within the CLI batch is sequential — validate after each.
- **T013 depends on T008–T012 complete AND spec 031 implemented** — cannot delete files without the orchestrator's delete action (requires spec 031) and without all call sites already on the new adapters.
- **T014 is independent** — can run anywhere after T005. Place after T013 to keep the conceptual ordering clean (delete old → reconcile remaining).
- **T015 depends on T002** — exercises `policy.evaluate()`. Can run as soon as T002 lands.
- **T016 depends on T006, T007** — exercises adapters.
- **T017 is last** — version bumps, README, fence audit. Depends on everything else complete.

Critical path: T005 → T001 → T002 → T006 → T008 → T009 → T010 → T011 → T007 → T012 → T013 → T014 → T015/T016 → T017.

Parallelizable: T003 + T004 (parallel with T001/T002 after T005); T015 + T016 (parallel with each other after T002/T006/T007).

---

## Task Details

### T001 — `capabilities.ts`

**Creates**: `wxkanban-agent/core/policy/capabilities.ts`

Defines:

- `Capability` enum with exactly 12 string-valued members: `BuildScope`, `CreateSpecs`, `ImplementTask`, `CreateTestTasks`, `RunQa`, `RunHuman`, `PrepareRelease`, `FinalizeRelease`, `DbPush`, `PipelineAgent`, `AuditFences`, `KitStatus`.
- `CapabilityGate` interface: `{ allowedPhases: LifecycleStage[] | 'all', requiresVerifiedSpec: boolean, allowsEscalation: boolean }`.
- `gateTable: Readonly<Record<Capability, CapabilityGate>>` with exactly 12 rows per the table in FR-002.
- Module-load self-consistency check (FR-010): iterate `Object.values(Capability)`, assert each has a `gateTable` row; iterate `Object.keys(gateTable)`, assert each is a valid `Capability`. Throw synchronously with a descriptive message if either check fails.

**Reference**: FR-002, FR-010 in [spec.md](spec.md).

### T002 — `policy.ts`

**Creates**: `wxkanban-agent/core/policy/policy.ts`

Defines the pure `evaluate(capability, currentPhase, verification?, override?): Decision` function per FR-003. Folds stage-gate checking, spec-first verification, and escalation/override messaging into one call.

Ports verbatim from `wxkanban-agent/core/policy/command-policy.ts`:

- `formatBlockMessage(command, details)` — the "IMPLEMENTATION BLOCKED - DATABASE VERIFICATION FAILED" template.
- `formatEscalationMessage(command, reason, missing)` — the "ESCALATION REQUESTED — COMMAND STILL BLOCKED" template.

**Reference**: FR-003, FR-008, FR-009 in [spec.md](spec.md).

### T003 — `resolve-current-phase.ts`

**Creates**: `wxkanban-agent/core/policy/resolve-current-phase.ts`

Extracts the active-phase query logic from lines 67–105 of `mcp-server/src/utils/stage-enforcement.ts`:

- Query `projectphases` for `projectid = $projectId AND status IN ('in_progress', 'reopened')`.
- If found, return the corresponding `LifecycleStage` (now with correct string values per T005).
- If not found, verify project exists in `companyprojects`; default to `LifecycleStage.Design` if so; throw if not.

**Reference**: FR-004 in [spec.md](spec.md).

### T004 — `resolve-spec-verification.ts`

**Creates**: `wxkanban-agent/core/policy/resolve-spec-verification.ts`

**Implementer first step**: confirm the kit's active-scope table/column. Likely candidates: a `scopes` table with a `status` column, or `companyprojects.activespecid`. Inspect the schema before writing the query.

Resolves the project's active scope. For that scope, queries spec/task/document existence and returns `SpecVerification`. Returns all-false verification on corner cases (no active scope, project not found, multiple active scopes simultaneously).

**Reference**: FR-004 in [spec.md](spec.md).

### T005 — Modify `lifecycle.ts`

**Modifies**: `wxkanban-agent/core/schemas/lifecycle.ts`

Two changes:

1. String-value correction (FR-007):
   - `QATesting = 'QA'` (was `'QA Testing'`)
   - `HumanTesting = 'HumanTesting'` (was `'Human Testing'`)
   - Add comment: `// Storage strings; domain names live in CONTEXT.md.`
2. Remove obsolete exports — `AllowedCommandsByStage` and `CrossCuttingCommands`. Their replacement is the gate table in `capabilities.ts` (T001). Any temporary inline re-declarations needed to keep `command-policy.ts` compiling during the refactor go inside `command-policy.ts` itself, not back in this file.

**Reference**: FR-007 in [spec.md](spec.md).

### T006 — `cli-adapter.ts`

**Creates**: `wxkanban-agent/core/policy/adapters/cli-adapter.ts`

Exports `evaluateCommand(stage, commandName, verification?, override?, customCommands?): PolicyEvaluation`. Maps command names to `Capability` per the 12-row table in FR-005. Honors `customCommands` allow-list. Returns the existing `PolicyEvaluation` shape so call sites need only an import-path change.

**Reference**: FR-005 in [spec.md](spec.md).

### T007 — `mcp-adapter.ts`

**Creates**: `wxkanban-agent/core/policy/adapters/mcp-adapter.ts`

Exports `enforceTool(db, projectId, toolName): Promise<StageEnforcementResult>`. Maps MCP tool names to `Capability` per the 12-row table in FR-006 (3 live rows + 9 inert rows, each inert row annotated `// inert until spec for MCP parity audit`). Calls `resolveCurrentPhase` and `resolveSpecVerification` in parallel, then `policy.evaluate`. Returns the existing `StageEnforcementResult` shape.

Unmapped tool names pass through with `{ allowed: true, currentStage: null }` to preserve today's behavior for the 30+ non-gated MCP tools.

**Reference**: FR-006, FR-008 in [spec.md](spec.md).

### T008 — Cutover `workflow-engine.ts`

**Modifies**: `wxkanban-agent/core/orchestrator/workflow-engine.ts`

Replace import from `../policy/command-policy` with import from `../policy/adapters/cli-adapter`. The `evaluateCommand` signature matches today's `CommandPolicyEngine.evaluateWithDetails` so no other changes are needed. Run test suite after.

**Reference**: FR-013 in [spec.md](spec.md).

### T009 — Cutover `cli.ts`

**Modifies**: `wxkanban-agent/apps/command-gateway/src/cli.ts`

Same import swap. Run test suite after.

**Reference**: FR-013 in [spec.md](spec.md).

### T010 — Cutover `spec-verification.ts`

**Modifies**: `wxkanban-agent/apps/command-gateway/src/spec-verification.ts`

Same import swap. Run test suite after.

**Reference**: FR-013 in [spec.md](spec.md).

### T011 — Cutover `verify-install.ts`

**Modifies**: `wxkanban-agent/scripts/verify-install.ts`

Same import swap. Run the install verification script manually after.

**Reference**: FR-013 in [spec.md](spec.md).

### T012 — Cutover `mcp-server/src/server.ts`

**Modifies**: `mcp-server/src/server.ts`

Replace import from `./utils/stage-enforcement` with import from the workspace-relative path to `wxkanban-agent/core/policy/adapters/mcp-adapter`. The `enforceTool` signature matches today's `enforceStage` so call-site code changes are limited to the import line and the function name. Start the MCP server and smoke-test one tool call (e.g. `project.buildscope` against a Design-phase project — expect allow).

**Reference**: FR-013 in [spec.md](spec.md).

### T013 — Delete old surfaces

**Deletes**:

- `wxkanban-agent/core/policy/command-policy.ts`
- `mcp-server/src/utils/stage-enforcement.ts`

**Prerequisites**: T008–T012 complete (no remaining importers); **spec 031 implemented** (provides the `"delete"` action on the orchestrator's `ProposedFile` type — see [031-ImplementEnhancements/spec.md](../031-ImplementEnhancements/spec.md)).

After deletion, run: `grep -r "CommandPolicyEngine\|enforceStage\|STAGE_GATED_TOOLS\|AllowedCommandsByStage" --include='*.ts'` outside of `specs/` and `docs/`. Expect zero matches.

**Reference**: FR-012 in [spec.md](spec.md).

### T014 — Reconcile `transitions.ts`

**Modifies**: `wxkanban-agent/core/orchestrator/transitions.ts`

Remove local `STAGE_ORDER` constant. Import the canonical phase ordering from `wxkanban-agent/core/schemas/lifecycle.ts` — either a new `STAGE_ORDER: readonly LifecycleStage[]` constant exported from there or via a `getStageOrder()` helper. Implementer chooses. Public functions in `transitions.ts` (`canTransition`, `getNextStage`, `getStageIndex`, `getStageOrder`) keep their signatures.

**Reference**: FR-011 in [spec.md](spec.md).

### T015 — `policy.test.ts`

**Creates**: `wxkanban-agent/tests/unit/policy/policy.test.ts`

Decision-table test covering every Capability × every phase × every verification state. Asserts the expected `Decision` shape and byte-identical `reason` strings.

Minimum row count: 12 capabilities × 6 phases × 4 verification states = 288 cells. In practice many cells are equivalent ("not gated → always allowed") and table compression is welcome — the test structure must make adding a new Capability a "you must add N new rows" forcing function.

Includes the force-override-cannot-bypass test: a force override against a spec-gated capability with missing verification returns `{ allowed: false, overrideUsed: true }` and the escalation message. Never `allowed: true`.

**Reference**: FR-014 in [spec.md](spec.md).

### T016 — Adapter unit tests

**Creates**:

- `wxkanban-agent/tests/unit/policy/cli-adapter.test.ts` — name-mapping for all 12 CLI commands, `customCommands` pass-through, `PolicyEvaluation` shape fidelity, unknown-command rejection message byte-identical to today's.
- `wxkanban-agent/tests/unit/policy/mcp-adapter.test.ts` — name-mapping for 3 live + at least 1 inert MCP tool name, unmapped-tool pass-through (`project.help`), `resolveCurrentPhase` and `resolveSpecVerification` mocked, `StageEnforcementResult` shape fidelity, project-not-found error path.

**Reference**: FR-015 in [spec.md](spec.md).

### T017 — Cleanup pass

**Deletes**: `wxkanban-agent/tests/unit/command-policy.test.ts` (after porting any still-relevant assertions into T015 / T016).

**Modifies**:

- `wxkanban-agent/README.md` — remove references to `CommandPolicyEngine`.
- `wxkanban-agent/package.json` — bump kit minor version per FR-016 #11.
- `src/client/version.ts` — bump APP_VERSION patch per FR-016 #11.
- `wxkanban-agent/CHANGELOG.md` — entry documenting the structural refactor + the FR-008 behavior change (uniform spec-first verification across MCP).

**Verifies**:

- `wxkanban-agent auditfences --strict` exits 0.
- Module-load drift assert in `capabilities.ts` fires when intentionally desynchronized (manually try adding a 13th Capability member with no gate row → expect import-time throw → revert).
- Full manual smoke-test matrix from `spec.md` "User Scenarios & Testing" section passes.

**Reference**: FR-012, FR-016 in [spec.md](spec.md).

---

## Notes for `wxkanban-agent implement 030`

Once [spec 031](../031-ImplementEnhancements/spec.md) ships, the entire 17-task sequence runs as `wxkanban-agent implement 030` (batch mode walking dependencies). Surgical reruns of individual tasks use `wxkanban-agent implement 030/T0NN`.

Each task's fence header reads `// [SCOPE 030 / T0NN] BEGIN — <task title>` and is written by the orchestrator (per [spec 026](../026-CodeFencing/spec.md)), never hand-authored.

Pre-implementation, run the [plan.md](plan.md) Pre-Implementation Gates table to confirm all three gates are met. Then start at T005.
