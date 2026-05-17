# Refactor 0001 — Stage Gate consolidation

**Status**: Drafted, awaiting implementation
**Date**: 2026-05-16
**Governing rule**: [ADR-0001](../adr/0001-cross-surface-concerns-live-in-one-canonical-module.md)
**Estimated effort**: One focused PR, ~1 day

---

## Goal

Collapse the three drifting Stage Gate implementations into a single canonical policy module with thin per-surface adapters. Eliminate the silent string mismatches between `wxkanban-agent` and `mcp-server` that cause gate enforcement to behave inconsistently across CLI and MCP surfaces.

## Why now

- The CLI canonical `LifecycleStage` enum has string values (`'QA Testing'`, `'Human Testing'`) that **do not match what is stored in `projectphases.phaseName`**. The DB stores `'QA'` and `'HumanTesting'`. Anywhere the CLI compares its enum against a DB-stored phase, the comparison silently fails. This has been latent.
- `mcp-server/src/utils/stage-enforcement.ts` defines its own local `LifecycleStage` type and its own `STAGE_GATED_TOOLS` table. Adding or modifying a gate today requires synchronized edits in two unconnected files.
- `wxkanban-agent/core/orchestrator/transitions.ts` keeps its own local `STAGE_ORDER` array, a third source of truth for the phase sequence.

## Decisions already made (from design grilling)

| Decision | Choice |
|---|---|
| Capability set | Fixed by kit (extensible later if needed) |
| Phase set | Fixed by kit (extensible later if needed) |
| Public TS API | None — kit ships as installable behavior; consumers consume CLI/MCP names + spec formats, not types |
| Phase resolver | Internal helper, both adapters share it |
| Canonical string set | **Path A** — enum string values bend to match DB (`QATesting = 'QA'`, `HumanTesting = 'HumanTesting'`). No data migration. |
| Test discipline | One decision-table test for `policy.evaluate()` + module-load no-drift assert; defer adapter sweep tests to the AI-driven test environment shipping next release |
| Bundle spec-parser refactor? | No — sequence; this refactor first establishes the pattern |
| Route through `wxkanban-agent implement`? | Yes — all writes via orchestrator; fences emitted by `implement`, not hand-authored |
| Workspace topology | `mcp-server` and `wxkanban-agent` are one workspace; import paths are relative / workspace aliases, no separate package publishing needed |
| Cross-cutting commands as MCP tools | **(A) Pure refactor.** Gate table contains rows for the 4 cross-cutting Capabilities, but **this PR does not add new MCP tool registrations.** A separate follow-up scope addresses MCP tool parity (registering the 5 stage-gated and 4 cross-cutting tools that exist on CLI but not on MCP today). |

## Canonical data

### Capability enum (final)

```ts
export enum Capability {
  // Stage-gated
  BuildScope        = 'BuildScope',
  CreateSpecs       = 'CreateSpecs',
  ImplementTask     = 'ImplementTask',
  CreateTestTasks   = 'CreateTestTasks',
  RunQa             = 'RunQa',
  RunHuman          = 'RunHuman',
  PrepareRelease    = 'PrepareRelease',
  FinalizeRelease   = 'FinalizeRelease',
  // Cross-cutting (allowed in every phase)
  DbPush            = 'DbPush',
  PipelineAgent     = 'PipelineAgent',
  AuditFences       = 'AuditFences',
  KitStatus         = 'KitStatus',
}
```

### Gate table (one row per Capability)

| Capability | allowedPhases | requiresVerifiedSpec | allowsEscalation |
|---|---|---|---|
| BuildScope | `[Design]` | false | false |
| CreateSpecs | `[Design]` | false | false |
| ImplementTask | `[Implementation]` | true | false |
| CreateTestTasks | `[Implementation]` | true | false |
| RunQa | `[QATesting]` | true | false |
| RunHuman | `[HumanTesting]` | true | false |
| PrepareRelease | `[Beta]` | true | false |
| FinalizeRelease | `[Release]` | true | false |
| DbPush | `'all'` | false | false |
| PipelineAgent | `'all'` | false | false |
| AuditFences | `'all'` | false | false |
| KitStatus | `'all'` | false | false |

`allowsEscalation: false` everywhere preserves existing behavior — force overrides are logged but **never** bypass enforcement, per the current `command-policy.ts` contract.

### LifecycleStage enum (post-Path-A)

```ts
export enum LifecycleStage {
  Design         = 'Design',
  Implementation = 'Implementation',
  QATesting      = 'QA',            // was 'QA Testing' — corrected to match DB
  HumanTesting   = 'HumanTesting',  // was 'Human Testing' — corrected to match DB
  Beta           = 'Beta',
  Release        = 'Release',
}
```

Add a one-line comment in the enum file: `// Storage strings; domain names live in CONTEXT.md.`

### Surface name → Capability mappings

**CLI adapter** (translate `argv` command → Capability):

| CLI command | Capability |
|---|---|
| `buildscope` | BuildScope |
| `createspecs` | CreateSpecs |
| `implement` | ImplementTask |
| `createtesttasks` | CreateTestTasks |
| `runqa` | RunQa |
| `runhuman` | RunHuman |
| `prepareRelease` | PrepareRelease |
| `finalizeRelease` | FinalizeRelease |
| `dbpush` | DbPush |
| `pipeline-agent` | PipelineAgent |
| `auditfences` | AuditFences |
| `kit:status` | KitStatus |

**MCP adapter** (translate MCP tool name → Capability):

| MCP tool | Capability |
|---|---|
| `project.buildscope` | BuildScope |
| `project.create_specs` | CreateSpecs |
| `project.implement` | ImplementTask |
| `project.createtesttasks` | CreateTestTasks |
| `project.runqa` | RunQa |
| `project.runhuman` | RunHuman |
| `project.prepareRelease` | PrepareRelease |
| `project.finalizeRelease` | FinalizeRelease |

**Resolved**: Audit of current MCP registrations shows the gate table protects 8 stage-gated tools but only 3 are registered as MCP endpoints today (`project.buildscope`, `project.create_specs`, `project.implement`). The other 5 are gating phantom tools. Cross-cutting tools have no MCP registrations either (except `project.kit_status` which has a `name:` entry but no `case` handler — pre-existing bug).

Per the (A) scope decision: this PR populates the gate table with all 12 Capabilities and includes mapping rows in the MCP adapter for all 12. Tools that aren't currently registered as MCP endpoints simply never trigger the gate at runtime — the rows are ready for when the tools land. **No new MCP tool handlers are added in this PR.** A separate follow-up scope ("MCP tool parity audit") addresses the registration gap, the `kit_status` handler bug, and the naming-convention inconsistency (`buildscope` flat vs `create_specs` snake_case vs `prepareRelease` camelCase) deliberately.

## Module map

### New files

| Path | Purpose |
|---|---|
| `wxkanban-agent/core/policy/capabilities.ts` | `Capability` enum + gate table + module-load no-drift assert |
| `wxkanban-agent/core/policy/policy.ts` | Pure `evaluate(capability, currentPhase, verification?) → Decision` |
| `wxkanban-agent/core/policy/resolve-current-phase.ts` | `resolveCurrentPhase(db, projectId) → Promise<LifecycleStage>`, owns the "no active phase → default Design" rule |
| `wxkanban-agent/core/policy/adapters/cli-adapter.ts` | CLI command name → Capability, calls `policy.evaluate` |
| `wxkanban-agent/core/policy/adapters/mcp-adapter.ts` | MCP tool name → Capability, calls `resolveCurrentPhase` then `policy.evaluate` |
| `wxkanban-agent/tests/unit/policy/policy.test.ts` | Decision-table test (~40 rows) |

### Modified files

| Path | Change |
|---|---|
| `wxkanban-agent/core/schemas/lifecycle.ts` | Change `QATesting` and `HumanTesting` string values per Path A. Remove `AllowedCommandsByStage` and `CrossCuttingCommands` (replaced by the gate table). |
| `wxkanban-agent/core/orchestrator/workflow-engine.ts` | Import from `core/policy/adapters/cli-adapter` instead of `core/policy/command-policy` |
| `wxkanban-agent/apps/command-gateway/src/cli.ts` | Same import swap |
| `wxkanban-agent/apps/command-gateway/src/spec-verification.ts` | Same import swap |
| `wxkanban-agent/scripts/verify-install.ts` | Same import swap |
| `wxkanban-agent/core/orchestrator/transitions.ts` | Delete local `STAGE_ORDER`; import canonical order from `core/schemas/lifecycle` |
| `mcp-server/src/server.ts` | Import from `wxkanban-agent/core/policy/adapters/mcp-adapter` (whatever import path the kit packaging exposes) instead of `./utils/stage-enforcement` |
| `wxkanban-agent/README.md` | Update any references to `CommandPolicyEngine` |

### Deleted files

| Path | Reason |
|---|---|
| `wxkanban-agent/core/policy/command-policy.ts` | Replaced by `policy.ts` + `cli-adapter.ts` |
| `mcp-server/src/utils/stage-enforcement.ts` | Replaced by `mcp-adapter.ts` |
| `wxkanban-agent/tests/unit/command-policy.test.ts` | Replaced by `policy.test.ts` (most assertions port directly) |

## Step-by-step plan

### Step 1 — Create the new core (additive, no call sites touched)

1. Write `capabilities.ts` with the `Capability` enum, gate table, and a module-load assert: `for each Capability c, assert gateTable[c] exists; for each gateTable key, assert it's a valid Capability`. Throw at module load if violated.
2. Write `policy.ts` with `evaluate(capability, currentPhase, verification?) → Decision`. **Port the existing message format functions (`formatBlockMessage`, `formatEscalationMessage`) verbatim** from [command-policy.ts](../../core/policy/command-policy.ts) to preserve byte-identical error output.
3. Write `resolve-current-phase.ts` by extracting lines 67–105 from [stage-enforcement.ts](../../../mcp-server/src/utils/stage-enforcement.ts) — the active-phase query, the "no active phase → Design" fallback, and the "project not found" error.
4. Update `lifecycle.ts`: change `QATesting` and `HumanTesting` enum values; delete `AllowedCommandsByStage` and `CrossCuttingCommands`.

**Checkpoint**: Run existing test suite. Nothing should fail — no call sites have changed yet. The deleted exports from `lifecycle.ts` will break `command-policy.ts` at compile time; fix that by leaving a temporary inline copy in `command-policy.ts` (will be deleted in Step 4).

### Step 2 — Build adapters (additive)

1. Write `adapters/cli-adapter.ts`:
   - Export `evaluateCommand(stage, commandName, customCommands?, verification?, override?) → PolicyEvaluation`.
   - Internally: look up `Capability` by command name; if not found, return `{ allowed: false, reason: 'Unknown command' }` shaped like today's `PolicyEvaluation`; otherwise call `policy.evaluate` and shape the result back into `PolicyEvaluation` so existing call sites need no changes.
2. Write `adapters/mcp-adapter.ts`:
   - Export `enforceTool(db, projectId, toolName) → Promise<StageEnforcementResult>`.
   - Internally: look up `Capability` by MCP tool name; if not found, allow (cross-cutting); otherwise call `resolveCurrentPhase`, then `policy.evaluate`, shape into today's `StageEnforcementResult`.

**Checkpoint**: New code compiles. No call sites changed yet. Old surfaces still live.

### Step 3 — Cut over call sites (one file at a time, validating after each)

In order:

1. `wxkanban-agent/core/orchestrator/workflow-engine.ts` → import from `cli-adapter`. Run tests.
2. `wxkanban-agent/apps/command-gateway/src/cli.ts` → import from `cli-adapter`. Run tests.
3. `wxkanban-agent/apps/command-gateway/src/spec-verification.ts` → import from `cli-adapter`. Run tests.
4. `wxkanban-agent/scripts/verify-install.ts` → import from `cli-adapter`. Run script manually.
5. `mcp-server/src/server.ts` → import from `mcp-adapter`. Confirm MCP server starts; smoke-test one tool call.

**Checkpoint**: All call sites on the new adapters. Old `command-policy.ts` and `stage-enforcement.ts` still exist but unused.

### Step 4 — Delete the old surfaces

1. Delete `wxkanban-agent/core/policy/command-policy.ts`.
2. Delete `mcp-server/src/utils/stage-enforcement.ts`.
3. Delete `wxkanban-agent/tests/unit/command-policy.test.ts` after porting (Step 6).
4. Run the full test suite. Expect green.

### Step 5 — Reconcile transitions.ts

1. Delete local `STAGE_ORDER` from [transitions.ts](../../core/orchestrator/transitions.ts).
2. Import `LifecycleStage` and define `STAGE_ORDER` from the canonical enum (or expose a `getStageOrder()` helper from `lifecycle.ts`).
3. Run tests.

### Step 6 — Tests

1. Write `tests/unit/policy/policy.test.ts` with the decision table (≈40 rows: every Capability × current-phase × verification-state → expected Decision).
2. Port any still-relevant assertions from `command-policy.test.ts`, then delete it.
3. Confirm the module-load no-drift assert fires when intentionally desynchronized (add a Capability, omit its gate row → expect throw at import time).

## Acceptance criteria

- `wxkanban-agent/core/policy/` is the only place defining what commands/tools are gated to which phases.
- `LifecycleStage` enum values match `projectphases.phaseName` values in the DB exactly. No string normalization needed at any call site.
- `command-policy.ts` and `stage-enforcement.ts` no longer exist.
- All existing call sites compile and pass tests through the new adapters.
- The `policy.evaluate()` decision-table test exists and passes.
- The module-load no-drift assert in `capabilities.ts` exists.
- `transitions.ts` uses the canonical phase order.
- No new top-level code unit is unfenced — every new function/module gets a `// [SCOPE ??? / T??] BEGIN/END` fence written by `wxkanban-agent implement`. (See "Fencing" risk below.)

## Manual smoke test plan

10-minute check before merging:

1. **CLI gate, allowed**: With a project in Design phase, run `wxkanban-agent buildscope`. Confirm it proceeds.
2. **CLI gate, blocked**: With the same project, run `wxkanban-agent implement`. Confirm it blocks with a message byte-identical to today's.
3. **CLI spec-first gate**: With a project in Implementation phase but no spec/tasks in DB, run `wxkanban-agent implement`. Confirm it blocks with the "IMPLEMENTATION BLOCKED - DATABASE VERIFICATION FAILED" message, again byte-identical.
4. **MCP gate, allowed**: From the editor AI surface (or via direct MCP call), invoke `project.buildscope` against a Design-phase project. Confirm allowed.
5. **MCP gate, blocked**: Invoke `project.implement` against a Design-phase project. Confirm blocked with the stage-enforcement message.
6. **Cross-cutting unchanged**: Run `wxkanban-agent dbpush --dry-run` (note: separately tracked as broken; this confirms the failure mode is unchanged, not fixed by this refactor).
7. **Transitions still work**: Advance a project from Design → Implementation via the normal transition path. Confirm success.

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Behavior change from porting message strings | Medium — anything string-matching on error messages breaks | Port format functions byte-identical; grep for string matches in tests before merging |
| `transitions.ts` consumers | Low | Run full test suite after Step 5; only `STAGE_ORDER` shape changes, public functions stay |
| Orchestrator `implement` command currently broken | Medium — the kit's `implement` CLI is reportedly non-functional today (filed against scope 019) | If `implement` cannot be invoked at refactor time, use the direct-import wrapper approach noted in project memory, OR fix `implement` first as a prerequisite. The fence-emission semantics still apply: every new top-level code unit gets a `// [SCOPE ??? / T??] BEGIN/END` fence; the orchestrator writes them, not the editor AI. |
| MCP adapter mapping for unregistered tools | Low | The adapter has mapping rows for tools that don't exist as MCP endpoints yet (5 stage-gated, 4 cross-cutting). At runtime, lookups on missing names never happen, so the rows are inert. Once the follow-up MCP parity scope lands, the rows activate automatically. |

## Out of scope (do not bundle)

- **Spec parser consolidation** — separate refactor, scheduled next. Same architectural shape, different module.
- **Fence writer consolidation** — separate refactor.
- **The broken `dbpush`, `buildscope --edit`, `createspecs`, `implement` commands** — orthogonal bugs; may be incidentally improved by Stage Gate fix but should not be conflated with it.
- **Public TS API for kit consumers** — not designed per ADR-0001.
- **Capability extensibility** — kit-fixed today; future decision.

## Follow-ups this enables

- **MCP tool parity audit** *(immediate next scope)* — register the 5 missing stage-gated MCP tools (`project.createtesttasks`, `project.runqa`, `project.runhuman`, `project.prepareRelease`, `project.finalizeRelease`) and the 4 cross-cutting tools (`project.dbpush`, `project.pipeline_agent`, `project.auditfences`, plus fixing the existing `project.kit_status` handler bug). Decide the MCP naming convention deliberately as part of this scope (current state mixes flat / snake_case / camelCase).
- **Spec parser consolidation** — second application of the [ADR-0001](../adr/0001-cross-surface-concerns-live-in-one-canonical-module.md) pattern. Copies the shape of `core/policy/` into `core/spec-io/`.
- **Fence writer consolidation** — third application of the pattern.
- The decision-table test in `policy.test.ts` becomes the source of truth that the next-release AI-driven test environment can sweep automatically.
- Once Capability is the canonical key, exposing a `project.capabilities()` introspection endpoint (so the editor AI can ask "what can I do right now?") becomes a one-day addition.

---

*To pick this up: read this doc, then [ADR-0001](../adr/0001-cross-surface-concerns-live-in-one-canonical-module.md), then start at Step 1. If anything in the "Decisions already made" table feels wrong, stop and reopen the design conversation before writing code.*
