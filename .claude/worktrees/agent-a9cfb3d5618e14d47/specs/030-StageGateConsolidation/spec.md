# Spec 030: Stage Gate Consolidation — Single Canonical Policy Across CLI + MCP

**Spec Number**: 030
**Status**: `proposed`
**Created**: 2026-05-16
**Depends On**: 019-agent-orchestrator-kit (the kit being refactored), 026-CodeFencing (fence convention all new units follow), 031-ImplementEnhancements (required at implementation time, not for spec/plan/tasks docs)
**Governed By**: [ADR-0001](../../wxkanban-agent/docs/adr/0001-cross-surface-concerns-live-in-one-canonical-module.md) — this is the first concrete application of the cross-surface-concerns-live-in-one-canonical-module rule
**Source**: in-conversation buildscope, 2026-05-16, following architecture review via the `improve-codebase-architecture` skill

---

## Overview

The wxKanban-agent kit gates workflow operations by Lifecycle Phase: certain commands are only valid in certain phases (`buildscope` in Design, `implement` in Implementation, etc.). Today this Stage Gate logic exists in **three drifting implementations** across the kit's two permanent surfaces (CLI and MCP), with a third local copy of the phase ordering in the transition engine.

Concrete drift observed in the codebase as of 2026-05-16:

1. **Disagreeing string values for the same Lifecycle Phase.** The CLI canonical `LifecycleStage` enum stores `'QA Testing'` and `'Human Testing'`. The MCP server defines its own local type with `'QA'` and `'HumanTesting'`. The database stores `'QA'` and `'HumanTesting'`. Anywhere the CLI compares its enum against a stored phase, the comparison silently fails — a latent correctness bug that has gone unnoticed because most CLI code paths take the phase as a parameter rather than reading it from the DB.
2. **Disagreeing keys for the same operation.** The CLI gate keys by command name (`'implement'`); the MCP gate keys by tool name (`'project.implement'`). Adding or modifying a gate today requires synchronized edits in two unconnected files.
3. **A third drift class — gate table vs MCP tool registry.** The MCP gate table protects 8 stage-gated tools, but only 3 are actually registered as MCP endpoints today (`project.buildscope`, `project.create_specs`, `project.implement`). The other 5 entries protect phantom tools. Cross-cutting tools have no MCP registrations at all (one — `project.kit_status` — has a name entry but no handler, a pre-existing bug).
4. **A separate stacked gate.** The CLI applies a second gate (spec-first verification: `SPEC_GATED_COMMANDS`) on top of stage gating. MCP has no equivalent. A tool can pass MCP enforcement and then fail at the CLI underneath for unrelated reasons.

This spec consolidates the three implementations into a single canonical policy module with thin per-surface adapters, per [ADR-0001](../../wxkanban-agent/docs/adr/0001-cross-surface-concerns-live-in-one-canonical-module.md). After this spec:

- `wxkanban-agent/core/policy/` is the only place that defines which operations are gated to which phases.
- The CLI and MCP surfaces each have a thin adapter (~30 lines) that translates surface-specific names to a canonical internal **Capability** key and delegates to the same pure decision function.
- The string values in the canonical `LifecycleStage` enum match the database (Path A — enum bends to DB; no data migration).
- The stage-gate logic and the spec-first logic both live behind one `policy.evaluate()` call.
- A shared `resolveCurrentPhase(db, projectId)` helper owns the "no active phase → default Design" rule that the MCP adapter inlines today.
- **Spec-first verification is enforced uniformly on both surfaces.** The pre-refactor asymmetry — CLI enforced spec-first, MCP did not — is closed. The principle: cannot implement without a full spec.

This spec ships:

- A new internal module `wxkanban-agent/core/policy/` containing the `Capability` enum, the gate table, the pure `policy.evaluate()` function, `resolveCurrentPhase()` and `resolveSpecVerification()` helpers, and two adapter files (`cli-adapter.ts`, `mcp-adapter.ts`).
- Deletion of the three pre-existing surfaces (`command-policy.ts`, `mcp-server/src/utils/stage-enforcement.ts`, the local `STAGE_ORDER` in `transitions.ts`).
- Corrected string values in the canonical `LifecycleStage` enum (`QATesting = 'QA'`, `HumanTesting = 'HumanTesting'`) to match the database.
- A decision-table unit test for `policy.evaluate()` — every Capability × phase × verification-state → expected Decision.
- A module-load drift assert in `capabilities.ts` — every Capability has exactly one gate-table row, every row references a real Capability.
- Updated call sites in `workflow-engine.ts`, `cli.ts`, `spec-verification.ts`, `verify-install.ts`, and `mcp-server/src/server.ts` — all importing from the new adapters.

**This spec is a pure refactor by design.** It does not register new MCP tools, does not introduce a public TypeScript API, and does not modify the 6-phase lifecycle. It does close a real behavior gap: the MCP surface will now enforce spec-first verification for the 6 spec-gated capabilities. The MCP tool parity gap (5 missing stage-gated tools + 4 missing cross-cutting tools + the `kit_status` handler bug) is queued as a separate immediate-next scope.

### Core Design

| Element | Value |
| --- | --- |
| **Primary Actors** | wxkanban-agent kit maintainers (refactor target); the kit's CLI and MCP surfaces (consumers of the new policy module); the wxkanban-agent `implement` orchestrator (writes the code with fences per spec 026). |
| **Key Value** | Stage Gate logic stops drifting. One change, one place, both surfaces inherit. The latent CLI-vs-DB string mismatch is fixed. Spec-first verification applies uniformly — no path bypasses it. The decision logic becomes pure and testable for the first time. The kit gains its first worked example of the ADR-0001 pattern, which the next two refactors (spec parser, fence writer) will copy. |
| **Scope Boundary (IN)** | Creation of `core/policy/` with `capabilities.ts`, `policy.ts`, `resolve-current-phase.ts`, `resolve-spec-verification.ts`, and `adapters/{cli,mcp}-adapter.ts`. Deletion of `command-policy.ts`, `stage-enforcement.ts`, and local `STAGE_ORDER` in `transitions.ts`. Path A enum string correction. Decision-table unit test for `policy.evaluate()`. Module-load drift assert. Port of all 5 call sites (workflow-engine, cli, spec-verification, verify-install, mcp server) onto the new adapters. Port of the existing `command-policy.test.ts` assertions onto the new shape. Byte-identical preservation of all existing error/block message strings. Uniform spec-first enforcement across CLI and MCP (closes a real pre-refactor gap). |
| **Scope Boundary (OUT)** | New MCP tool registrations (deferred to follow-up scope). Fixing the `project.kit_status` handler bug (deferred). MCP tool naming convention rationalization (deferred — naming is mixed flat/snake_case/camelCase today). The 5 stage-gated tools not currently registered as MCP endpoints (deferred). Any change to the 6-phase lifecycle. Any consumer-facing TypeScript API. Any change to fence-emission rules from spec 026. The spec-parser and fence-writer refactors (separate scopes, same pattern). Database schema changes — the DB string values stay as they are today. The "Claude coworker" enhancement to `implement` (deferred to a future scope after 031). |

---

## Functional Requirements

### FR-001 — Single canonical policy module
All Stage Gate decision logic for the wxkanban-agent kit lives under `wxkanban-agent/core/policy/`. No other directory — in either `wxkanban-agent` or `mcp-server` — contains a parallel implementation, a local mapping of commands/tools to phases, or a local definition of the `LifecycleStage` value set. Adding or modifying a gate is a one-file edit.

### FR-002 — Capability enum and gate table
`wxkanban-agent/core/policy/capabilities.ts` exports:

- A `Capability` enum with exactly 12 members: `BuildScope`, `CreateSpecs`, `ImplementTask`, `CreateTestTasks`, `RunQa`, `RunHuman`, `PrepareRelease`, `FinalizeRelease`, `DbPush`, `PipelineAgent`, `AuditFences`, `KitStatus`. Enum values are the member names as strings.
- A `gateTable` (readonly) with exactly 12 rows, keyed by `Capability`. Each row has the shape `{ allowedPhases: LifecycleStage[] | 'all', requiresVerifiedSpec: boolean, allowsEscalation: boolean }`. The 8 stage-gated capabilities have `allowedPhases` set to the single permitted phase; the 4 cross-cutting capabilities (`DbPush`, `PipelineAgent`, `AuditFences`, `KitStatus`) have `'all'`. The 6 capabilities currently subject to spec-first verification (`ImplementTask`, `CreateTestTasks`, `RunQa`, `RunHuman`, `PrepareRelease`, `FinalizeRelease`) have `requiresVerifiedSpec: true`; the other 6 have `false`. All 12 rows have `allowsEscalation: false` (preserving today's "force overrides are logged but never bypass" contract from `command-policy.ts`).

### FR-003 — Pure policy.evaluate()
`wxkanban-agent/core/policy/policy.ts` exports a function `evaluate(capability: Capability, currentPhase: LifecycleStage, verification?: SpecVerification, override?: ForceOverride): Decision` that:

- Performs no IO (no DB queries, no filesystem access, no network calls, no global state reads).
- Returns a `Decision` containing `{ allowed: boolean, reason?: string, capability, currentPhase, requiresSpecCheck: boolean, overrideUsed: boolean }`.
- Handles stage-gate checking, spec-first verification, and escalation/override messaging in a single call. Both gate concerns (stage and spec-first) are evaluated based on the gate-table row for the supplied capability — there is no separate "spec-first engine" outside this function.
- Preserves today's block-message and escalation-message strings byte-identically (the existing `formatBlockMessage` and `formatEscalationMessage` from `command-policy.ts` are ported into `policy.ts` unchanged).

### FR-004 — Phase + spec verification resolvers
`wxkanban-agent/core/policy/resolve-current-phase.ts` exports `resolveCurrentPhase(db, projectId): Promise<LifecycleStage>` that:

- Queries `projectphases` for rows matching `projectid = $projectId` AND `status IN ('in_progress', 'reopened')`.
- If a matching row exists, returns the `LifecycleStage` corresponding to its `phasename`.
- If no matching row exists, verifies the project exists in `companyprojects`; if so, returns `LifecycleStage.Design` (the kit-wide default for projects with no active phase); if the project does not exist, throws an error with a message naming the missing project ID.
- Is the only code path in the kit that converts a stored `projectphases.phasename` value into a `LifecycleStage`. Both adapters use this helper; neither queries `projectphases` directly.

Additionally, a sibling module `wxkanban-agent/core/policy/resolve-spec-verification.ts` exports `resolveSpecVerification(db, projectId): Promise<SpecVerification>` that:

- Resolves the project's currently active scope. "Active scope" is the row in the kit's scope-tracking table whose status indicates work-in-progress for this project. (Implementer note: confirm the exact table/column at start of implementation; if multiple scopes are simultaneously active for one project, treat as a precondition violation and return verification with all fields false.)
- For the resolved scope, queries the kit's spec/task/document state and returns `{ specExists: boolean, tasksExist: boolean, documentsExist: boolean, specStatus?: string }`.
- If no active scope is found, the project does not exist, or multiple scopes are simultaneously active, returns `{ specExists: false, tasksExist: false, documentsExist: false }` — `policy.evaluate()` will then block with the existing "missing spec" message. The MCP surface never silently allows in these cases.
- Is the only code path in the kit that converts active-scope/spec state into a `SpecVerification` value. Both adapters use it (MCP always; CLI when its caller has not pre-fetched verification).

**Amendment (2026-10-04, SCOPE-123 FR-001 / SPEC-136 FR-017, shipped in kit v1.7.72).** The
"one active scope per project" rule above refused every spec-gated command in any project with two
or more specs in progress (68 such specs existed), whichever spec the command named. It is replaced:

- Verification checks the **named** scope: `resolveScopeVerification(db, scope)` in the same module
  takes the scope the command names and reports that scope's own tasks and documents. Multiple
  active specs no longer block each other. A named spec that does not exist, or has no tasks, or has
  no documents, still blocks with the existing "missing" message.
- `resolveSpecVerification(db, projectId)` is retained for callers outside the policy layer; no gate
  calls it.
- No gate calls `resolveCurrentPhase` either. Stage now belongs to each scope (`specificationphases`,
  SCOPE-123); `resolveCurrentPhase` and `projectphases` remain for display only.
- Covered by `wxkanban-agent/tests/unit/policy/mcp-adapter.test.ts` ("verification checks the NAMED
  scope": two specs in progress both pass; a named scope with no documents blocks) and the structural
  guard in `wxkanban-agent/tests/unit/stage/regression-guards.test.ts`.

### FR-005 — CLI adapter
`wxkanban-agent/core/policy/adapters/cli-adapter.ts` exports `evaluateCommand(stage: LifecycleStage, commandName: string, verification?: SpecVerification, override?: ForceOverride, customCommands?: string[]): PolicyEvaluation` that:

- Maps `commandName` to a `Capability` via a complete, exhaustive table covering all 12 capabilities — every member of the `Capability` enum has exactly one CLI command name in this table:
  - `buildscope` → `BuildScope`
  - `createspecs` → `CreateSpecs`
  - `implement` → `ImplementTask`
  - `createtesttasks` → `CreateTestTasks`
  - `runqa` → `RunQa`
  - `runhuman` → `RunHuman`
  - `prepareRelease` → `PrepareRelease`
  - `finalizeRelease` → `FinalizeRelease`
  - `dbpush` → `DbPush`
  - `pipeline-agent` → `PipelineAgent`
  - `auditfences` → `AuditFences`
  - `kit:status` → `KitStatus`
- If `commandName` matches the `customCommands` list (an opaque allow-list passed by the caller, preserved from today's `CommandPolicyEngine` interface), returns `{ allowed: true }` shaped as `PolicyEvaluation` without consulting the gate table — preserving today's behavior for project-defined custom commands.
- If `commandName` is neither in the mapping nor in `customCommands`, returns `{ allowed: false, reason: "Command '<name>' is not permitted in the '<stage>' stage." }` — byte-identical to today's `CommandPolicyEngine.evaluateWithDetails` rejection message for unknown commands.
- Otherwise calls `policy.evaluate(capability, stage, verification, override)` and shapes the returned `Decision` into a `PolicyEvaluation` with all fields populated (`allowed`, `reason`, `stage`, `command`, `allowedCommands`, `requiresSpecCheck`, `overrideUsed`) — the same external shape today's CLI call sites already consume, so no call-site changes other than the import path.
- Contains no decision logic of its own beyond the name lookup. All allow/deny reasoning happens inside `policy.evaluate()`.

### FR-006 — MCP adapter
`wxkanban-agent/core/policy/adapters/mcp-adapter.ts` exports `enforceTool(db, projectId, toolName): Promise<StageEnforcementResult>` that:

- Maps `toolName` to a `Capability` via a table that includes both the 3 currently-registered stage-gated MCP tools and rows reserved for the 9 tools queued for the follow-up MCP parity scope. The mappings finalized in this spec are:
  - `project.buildscope` → `BuildScope`
  - `project.create_specs` → `CreateSpecs`
  - `project.implement` → `ImplementTask`
  - `project.createtesttasks` → `CreateTestTasks` *(no current MCP handler — row inert until parity scope lands)*
  - `project.runqa` → `RunQa` *(no current MCP handler — row inert)*
  - `project.runhuman` → `RunHuman` *(no current MCP handler — row inert)*
  - `project.prepareRelease` → `PrepareRelease` *(no current MCP handler — row inert)*
  - `project.finalizeRelease` → `FinalizeRelease` *(no current MCP handler — row inert)*
  - `project.dbpush` → `DbPush` *(no current MCP handler — row inert)*
  - `project.pipeline_agent` → `PipelineAgent` *(no current MCP handler — row inert)*
  - `project.auditfences` → `AuditFences` *(no current MCP handler — row inert)*
  - `project.kit_status` → `KitStatus` *(MCP tool registered but handler missing — pre-existing bug, fixed in parity scope)*
- If `toolName` is not in the mapping table, returns `{ allowed: true, currentStage: null, requestedTool: toolName }` — preserving today's `enforceStage` behavior that any unmapped tool name passes through ungated. This keeps the 30+ other MCP tools (`project.help`, `project.create_task`, `project.session_start`, `project.capture_event`, `project.upsert_document`, etc.) working without any registration on the policy side.
- Otherwise calls `resolveCurrentPhase(db, projectId)` AND `resolveSpecVerification(db, projectId)` **in parallel**, then calls `policy.evaluate(capability, currentPhase, verification)`. **Both surfaces now feed `policy.evaluate` the same shape; spec-first verification applies uniformly.**
- Shapes the returned `Decision` into a `StageEnforcementResult` with `{ allowed, currentStage, requestedTool, reason? }` — byte-identical to today's `enforceStage` return shape, so the call site in `mcp-server/src/server.ts` needs only an import-path change.
- Contains no decision logic of its own beyond the name lookup and resolver coordination.

**Behavior change recorded here**: any caller (including the editor AI via MCP) that invokes a spec-gated tool (`project.implement` and friends) against a project whose active scope has not completed Phase 4.5 of the wxAI pipeline will be blocked at the MCP layer with the existing "IMPLEMENTATION BLOCKED" message. This matches the principle "cannot implement without a full spec."

### FR-007 — LifecycleStage enum strings match the database
`wxkanban-agent/core/schemas/lifecycle.ts` defines the `LifecycleStage` enum with string values that match `projectphases.phasename` byte-for-byte:

- `LifecycleStage.Design = 'Design'`
- `LifecycleStage.Implementation = 'Implementation'`
- `LifecycleStage.QATesting = 'QA'` *(corrected from `'QA Testing'`)*
- `LifecycleStage.HumanTesting = 'HumanTesting'` *(corrected from `'Human Testing'`)*
- `LifecycleStage.Beta = 'Beta'`
- `LifecycleStage.Release = 'Release'`

No string normalization, mapping, or fixup is performed at any call site or in either adapter. A value read from `projectphases.phasename` is comparable to a `LifecycleStage` value via direct equality. Enum **member names** (`LifecycleStage.QATesting`, `LifecycleStage.HumanTesting`) are unchanged; only string values shift. A single-line comment in the enum file documents the choice: `// Storage strings; domain names live in CONTEXT.md.` The existing `AllowedCommandsByStage` and `CrossCuttingCommands` exports from this file are removed (replaced by the gate table in `capabilities.ts`).

### FR-008 — Spec-first verification is uniform across surfaces
Both the CLI adapter (FR-005) and the MCP adapter (FR-006) call `policy.evaluate()` with a fully populated `SpecVerification` argument for any capability where `gateTable[capability].requiresVerifiedSpec === true`. The pre-refactor asymmetry — CLI enforced spec-first, MCP did not — is closed by this spec.

- The 6 capabilities with `requiresVerifiedSpec: true` (`ImplementTask`, `CreateTestTasks`, `RunQa`, `RunHuman`, `PrepareRelease`, `FinalizeRelease`) are spec-gated on both surfaces.
- The 6 capabilities with `requiresVerifiedSpec: false` (the 2 Design-phase capabilities and 4 cross-cutting capabilities) are not spec-gated on either surface — verifying a spec before the command that creates the spec is logically circular, and cross-cutting utilities don't depend on spec state.
- No surface has a path to invoke a spec-gated capability without the verification call. There is no flag, environment variable, command-line option, or MCP argument that bypasses spec-first verification. Force overrides remain logged-only and never bypass enforcement (preserving today's `command-policy.ts` contract).

### FR-009 — Error message preservation
All user-facing block messages, escalation messages, and rejection reasons produced by `policy.evaluate()` are byte-identical to those produced by today's `CommandPolicyEngine` for equivalent decisions:

- The "Command '<name>' is not permitted in the '<stage>' stage." rejection.
- The "IMPLEMENTATION BLOCKED - DATABASE VERIFICATION FAILED" multi-line block message, including the numbered "Required Actions" list and the `_wxAI/commands/wxAI-pipeline-mandatory-database.md` reference.
- The "ESCALATION REQUESTED — COMMAND STILL BLOCKED" multi-line escalation message, including the reason interpolation and the numbered admin-action list.

The `formatBlockMessage` and `formatEscalationMessage` functions from `command-policy.ts` are ported into `policy.ts` (or a sibling internal module imported by `policy.ts`) without modification. Tests verifying message content are ported alongside; new tests are added that assert byte-equality for the MCP path's new block messages (since MCP did not previously produce these messages, the assertion is "the message MCP now emits is byte-identical to what CLI emits for the same Decision").

### FR-010 — Module-load drift assert
`wxkanban-agent/core/policy/capabilities.ts` performs a runtime self-consistency check at module load time:

- For every member of the `Capability` enum, assert that `gateTable[capability]` exists. If any is missing, throw a synchronous error naming the offending capability and the file.
- For every key in `gateTable`, assert it is a valid `Capability` member. If any is not, throw a synchronous error naming the spurious key.
- This check runs once per process at first import of `capabilities.ts`. The cost is one-time and trivial.
- A future contributor who adds a Capability and forgets the gate row (or vice versa) gets a hard, immediate, descriptive failure — not a silent runtime fallthrough.

### FR-011 — Transitions module uses canonical phase order
`wxkanban-agent/core/orchestrator/transitions.ts` no longer defines a local `STAGE_ORDER` array. The canonical phase ordering is exported from `wxkanban-agent/core/schemas/lifecycle.ts` (either as a `STAGE_ORDER: readonly LifecycleStage[]` constant or via a `getStageOrder(): readonly LifecycleStage[]` helper — implementer chooses; both surfaces work). `transitions.ts` imports and uses that canonical ordering. The public functions exported from `transitions.ts` (`canTransition`, `getNextStage`, `getStageIndex`, `getStageOrder`) keep their signatures and behavior.

### FR-012 — Deletion of old surfaces
After this spec lands, these files do not exist in the workspace:

- `wxkanban-agent/core/policy/command-policy.ts`
- `mcp-server/src/utils/stage-enforcement.ts`
- `wxkanban-agent/tests/unit/command-policy.test.ts` *(replaced by `tests/unit/policy/policy.test.ts`)*

No re-exports, no deprecation shims, no `// removed — see SCOPE 030` comments. A grep for `CommandPolicyEngine`, `enforceStage`, `STAGE_GATED_TOOLS`, or `AllowedCommandsByStage` returns zero matches outside of the spec/refactor documentation.

### FR-013 — All call sites use the new adapters
After this spec lands, every consumer of Stage Gate decision logic imports from exactly one of:

- `wxkanban-agent/core/policy/adapters/cli-adapter.ts` (CLI path consumers)
- `wxkanban-agent/core/policy/adapters/mcp-adapter.ts` (MCP server)

The complete list of updated call sites is:

- `wxkanban-agent/core/orchestrator/workflow-engine.ts`
- `wxkanban-agent/apps/command-gateway/src/cli.ts`
- `wxkanban-agent/apps/command-gateway/src/spec-verification.ts`
- `wxkanban-agent/scripts/verify-install.ts`
- `mcp-server/src/server.ts`

The CLI README is updated to remove any reference to `CommandPolicyEngine`; the MCP server has no doc references to update beyond inline comments.

### FR-014 — Decision-table unit test for policy.evaluate()
A test file at `wxkanban-agent/tests/unit/policy/policy.test.ts` exercises `policy.evaluate()` against an exhaustive table covering every Capability across every meaningful (currentPhase, verification-state) combination. The table is the executable specification of the gate.

Minimum coverage:

- All 12 capabilities × all 6 phases × {missing-verification, valid-verification, invalid-verification, partial-verification} — the cells that matter assert the expected `Decision` shape; cells where `requiresVerifiedSpec === false` are tested with the missing-verification case to confirm verification is not consulted.
- All escalation/override paths covered: a force override against a spec-gated capability with missing verification returns `{ allowed: false, overrideUsed: true }` with the escalation message — never `allowed: true`.
- The expected `reason` text is asserted byte-identical to the strings the existing `command-policy.ts` produces for the equivalent inputs.

The table is structured so adding a new Capability requires adding new rows; CI failures on the new test point straight at the unspecified cells. The test runs with whatever runner the kit currently uses (vitest per the project tech stack); no new test infrastructure is introduced.

### FR-015 — MCP adapter coverage
A test file at `wxkanban-agent/tests/unit/policy/mcp-adapter.test.ts` covers `enforceTool()` with:

- A test for each of the 3 currently-registered MCP tool names (`project.buildscope`, `project.create_specs`, `project.implement`) asserting correct mapping to `Capability` and correct gate behavior under each phase.
- A test for an unmapped tool name (e.g. `project.help`) asserting pass-through with `{ allowed: true, currentStage: null }`.
- A test for a mapped-but-inert tool name (e.g. `project.runqa`) asserting the mapping resolves and the gate is consulted even though no current MCP handler exists — when the parity scope lands, gate behavior is already validated.
- Mocking strategy: `resolveCurrentPhase` and `resolveSpecVerification` are stubbed to return controlled values; the adapter is tested as a pure function over those stubs. No live DB needed for these unit tests.

A separate small CLI adapter test (`tests/unit/policy/cli-adapter.test.ts`) covers the analogous concerns for the CLI surface — name-to-Capability mapping, `customCommands` pass-through behavior, and result-shape preservation.

### FR-016 — Acceptance criteria
This spec is complete when all the following hold:

1. `wxkanban-agent/core/policy/` contains `capabilities.ts`, `policy.ts`, `resolve-current-phase.ts`, `resolve-spec-verification.ts`, `adapters/cli-adapter.ts`, `adapters/mcp-adapter.ts`. No other policy or stage-gate logic exists anywhere in the workspace.
2. `wxkanban-agent/core/policy/command-policy.ts` and `mcp-server/src/utils/stage-enforcement.ts` do not exist.
3. `LifecycleStage` enum string values match `projectphases.phasename` byte-for-byte (Path A applied).
4. Every member of `Capability` has exactly one row in `gateTable`; every row in `gateTable` references a real `Capability` (module-load assert in `capabilities.ts` passes).
5. All 5 call sites enumerated in FR-013 import from the new adapters; grep for `CommandPolicyEngine`, `enforceStage`, `STAGE_GATED_TOOLS`, or `AllowedCommandsByStage` outside of documentation returns no matches.
6. `transitions.ts` uses canonical phase ordering and has no local `STAGE_ORDER` array.
7. The 6 spec-gated capabilities are enforced on **both** CLI and MCP surfaces (FR-008); no surface has a path to invoke a spec-gated capability without verification.
8. The decision-table test (FR-014) and the two adapter tests (FR-015) exist and pass.
9. The pre-merge manual smoke-test sequence from the User Scenarios section passes (allow/block on each surface for each phase; spec-first block on MCP surface for `project.implement` against a Design-phase project; transitions still allow forward-only).
10. All new top-level code units carry the `// [SCOPE 030 / T0NN] BEGIN/END` fence written by `wxkanban-agent implement` (per spec 026); a `wxkanban-agent auditfences --strict` run on the final state returns exit 0.
11. The kit's package version is bumped one minor revision (per the kit's existing versioning convention); APP_VERSION in `src/client/version.ts` is bumped one patch revision (per project memory entry `feedback_version_number_location`).

---

## User Scenarios & Testing

This section enumerates **behavioral preservation scenarios** — concrete cases that must produce specific outputs before and after the refactor. These are the manual smoke gate (FR-016 #9). Unit-level coverage is FR-014 (`policy.evaluate()`) and FR-015 (adapters).

### CLI surface

| Scenario | Setup | Expected outcome |
|---|---|---|
| Allowed command in current phase | Project in `Design`; run `wxkanban-agent buildscope` | Command proceeds. No block message. |
| Disallowed command in current phase | Project in `Design`; run `wxkanban-agent implement` | Blocks with the byte-identical "Command 'implement' is not permitted in the 'Design' stage." rejection. |
| Spec-first block (missing spec) | Project in `Implementation`; no `specs/030-*/spec.md` present; run `wxkanban-agent implement 030/T001` | Blocks with the byte-identical "IMPLEMENTATION BLOCKED - DATABASE VERIFICATION FAILED" message including the numbered Required Actions list. |
| Cross-cutting command in any phase | Project in `Beta`; run `wxkanban-agent dbpush --dry-run` | Command is not gate-blocked. (May still fail for unrelated reasons — Spec 019 broken-commands list — but the gate does not reject it.) |
| Unknown command | Run `wxkanban-agent madeupcommand` | Blocks with the standard rejection message; no exception thrown. |
| Force override against spec-gated capability | Project in `Implementation`; spec missing; run with override flag and reason | Blocks with the byte-identical "ESCALATION REQUESTED — COMMAND STILL BLOCKED" message. Never allows. |

### MCP surface

| Scenario | Setup | Expected outcome |
|---|---|---|
| Allowed tool in current phase | Project in `Design` (DB `projectphases.phasename = 'Design'`); MCP call `project.buildscope` | Tool proceeds. `enforceTool` returns `{ allowed: true }`. |
| Disallowed tool in current phase | Project in `Design`; MCP call `project.implement` | Blocks with the existing stage-gate rejection message. |
| Spec-first block on MCP (**NEW behavior** per FR-008) | Project in `Implementation`; no active scope with verified spec; MCP call `project.implement` | Blocks. This is the new uniform-spec-first behavior; pre-refactor MCP would have allowed. |
| Unmapped tool passes through | MCP call `project.help` or any tool not in the adapter mapping table | `{ allowed: true, currentStage: null, requestedTool: 'project.help' }` — preserves today's pass-through. |
| Inert mapped tool (no current MCP handler) | MCP call `project.runqa` (mapped to `RunQa` but no handler exists today) | The mapping resolves, the gate is consulted, but the MCP server returns its standard "unknown tool" response since no handler is registered. When the parity scope lands, the gate is already correct. |
| No active phase for project | Project exists in `companyprojects` but no row in `projectphases`; MCP call `project.buildscope` | Defaults to `Design`; `project.buildscope` proceeds. |
| Project not found | MCP call against non-existent `projectId` | Blocks with error naming the missing project ID; no silent allow. |

### Transitions

| Scenario | Setup | Expected outcome |
|---|---|---|
| Forward transition by one phase | Project in `Design`; advance to `Implementation` | Allowed. |
| Backward transition | Project in `Implementation`; attempt advance to `Design` | Blocked. Message: "Cannot move backward from 'Implementation' to 'Design'. Stages progress forward only." |
| Skip a phase | Project in `Design`; attempt advance to `QATesting` | Blocked. Message: "Cannot skip from 'Design' to 'QATesting'. Must progress through intermediate stages." |
| Same-phase "transition" | Project in `QATesting`; advance to `QATesting` | Allowed (idempotent). |

---

## New / Modified / Deleted Modules

| Path | Status | Notes |
|---|---|---|
| `wxkanban-agent/core/policy/capabilities.ts` | **New** | Capability enum + gate table + module-load drift assert (FR-002, FR-010) |
| `wxkanban-agent/core/policy/policy.ts` | **New** | Pure `evaluate()` (FR-003); ports `formatBlockMessage` + `formatEscalationMessage` byte-identical |
| `wxkanban-agent/core/policy/resolve-current-phase.ts` | **New** | DB phase resolver with default-to-Design fallback (FR-004) |
| `wxkanban-agent/core/policy/resolve-spec-verification.ts` | **New** | DB spec/task/doc verification resolver, active-scope inference (FR-004) |
| `wxkanban-agent/core/policy/adapters/cli-adapter.ts` | **New** | CLI command-name → Capability translation (FR-005) |
| `wxkanban-agent/core/policy/adapters/mcp-adapter.ts` | **New** | MCP tool-name → Capability translation; calls both resolvers in parallel (FR-006) |
| `wxkanban-agent/core/schemas/lifecycle.ts` | **Modified** | `QATesting = 'QA'`, `HumanTesting = 'HumanTesting'` (Path A, FR-007); remove `AllowedCommandsByStage` + `CrossCuttingCommands` exports |
| `wxkanban-agent/core/orchestrator/workflow-engine.ts` | **Modified** | Import from `cli-adapter` instead of `command-policy` (FR-013) |
| `wxkanban-agent/apps/command-gateway/src/cli.ts` | **Modified** | Same import swap (FR-013) |
| `wxkanban-agent/apps/command-gateway/src/spec-verification.ts` | **Modified** | Same import swap (FR-013) |
| `wxkanban-agent/scripts/verify-install.ts` | **Modified** | Same import swap (FR-013) |
| `wxkanban-agent/core/orchestrator/transitions.ts` | **Modified** | Delete local `STAGE_ORDER`; import canonical (FR-011) |
| `mcp-server/src/server.ts` | **Modified** | Import from `mcp-adapter` instead of `./utils/stage-enforcement` (FR-013) |
| `wxkanban-agent/README.md` | **Modified** | Remove references to `CommandPolicyEngine` |
| `wxkanban-agent/tests/unit/policy/policy.test.ts` | **New** | Decision-table test (FR-014) |
| `wxkanban-agent/tests/unit/policy/cli-adapter.test.ts` | **New** | CLI adapter unit test (FR-015) |
| `wxkanban-agent/tests/unit/policy/mcp-adapter.test.ts` | **New** | MCP adapter unit test (FR-015) |
| `wxkanban-agent/core/policy/command-policy.ts` | **Deleted** | Replaced by `policy.ts` + `cli-adapter.ts` (FR-012) |
| `mcp-server/src/utils/stage-enforcement.ts` | **Deleted** | Replaced by `mcp-adapter.ts` (FR-012) |
| `wxkanban-agent/tests/unit/command-policy.test.ts` | **Deleted** | Replaced by `tests/unit/policy/*` (FR-012) |
| `src/client/version.ts` | **Modified** | APP_VERSION patch bump (FR-016 #11) |
| `wxkanban-agent/package.json` | **Modified** | Kit minor version bump (FR-016 #11) |

---

## Risks & Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Behavior change from porting message strings | Medium — any test or consumer string-matching on error messages breaks | Port `formatBlockMessage` and `formatEscalationMessage` byte-identical; FR-014 asserts exact string equality; grep for string matches in tests before merging. |
| `transitions.ts` consumers depending on local `STAGE_ORDER` | Low | Run full test suite after Step 5; the public functions (`canTransition`, `getNextStage`, `getStageIndex`, `getStageOrder`) keep their signatures, only the internal source of truth shifts. |
| New MCP spec-first block surprises kit consumers | Medium — kit consumers whose editor AI calls `project.implement` against projects without verified specs will start being blocked | Document the behavior change in the kit's CHANGELOG entry alongside the minor version bump; the principle "cannot implement without a full spec" is the explicit user directive. |
| Active-scope resolution corner cases | Medium — `resolveSpecVerification` must correctly handle "no active scope," "multiple active scopes," "project not found"; getting any wrong silently allows MCP calls that should block | All three corner cases enumerated in FR-004 and verified by FR-015 mocked tests; corner-case test rows are mandatory in `mcp-adapter.test.ts`. |
| Spec 031 prerequisite delay | Medium — spec 030 implementation cannot run until 031 ships (delete action + batch mode) | Spec 031 is a small, focused enhancement scope; can land same-day once buildscoped. Spec 030's paper-only work (spec.md, plan.md, tasks.md, tests.md, quickstart.md) is unblocked. |
| Inert mapping rows mistaken for live behavior | Low — the MCP adapter has 9 mapping rows for tools not yet registered; reviewer may not realize they're inert | Each inert row is annotated in the adapter source (`// inert until spec for MCP parity audit`); FR-015 includes a test that exercises one inert row to confirm gate behavior is correct when the handler eventually lands. |
| Orchestrator `implement` CLI broken at refactor time | Medium — the kit's `implement` CLI is reportedly non-functional today (filed against scope 019) | Implementation flow uses direct-import wrapper per project memory entry `feedback_orchestrator_cli_broken` until `implement` is fixed; spec 031 will also fix this as part of its scope. |

---

## Dependencies

| Spec | Why |
|---|---|
| **019 — agent-orchestrator-kit** | The kit being refactored. This spec modifies kit-internal modules. |
| **026 — CodeFencing** | All new top-level code units carry the `// [SCOPE 030 / T0NN] BEGIN/END` fence per spec 026 FR-001..010. The orchestrator (or its direct-import wrapper) writes the fences. |
| **031 — ImplementEnhancements** | Spec 031 adds delete action + batch-by-scope mode to `implement`. Spec 030 implementation requires both (FR-012 deletes three files; T-many tasks benefit from batch). Spec 030 spec/plan/tasks/tests/quickstart docs are independent — only the implementation phase depends. |

---

## Out-of-Band Issues to Track Separately

Issues discovered during this spec's buildscope that are real, distinct, and **not in scope for spec 030**:

1. **MCP tool parity gap.** The MCP server registers only 3 of the 8 stage-gated tools (`project.buildscope`, `project.create_specs`, `project.implement`) and 0 of the 4 cross-cutting tools. The other 9 are CLI-only. Plus `project.kit_status` has a name entry but no `case` handler. Track as the immediate next architectural scope after 030 lands.
2. **Stale `wxkanban-agent/docs/implement.md`.** Step 3 of the documented flow still says "Builds an AI prompt and calls Gemini." Contradicts Spec 019 R6a ("kit is workflow engine, not AI client") which the code already enforces. The docs must be updated. Track as a small follow-up doc-only scope or fold into spec 031.
3. **Inconsistent MCP tool naming convention.** Currently mixes flat (`project.buildscope`), snake_case (`project.create_specs`), and camelCase (`project.prepareRelease`). The MCP parity scope should rationalize this deliberately before adding 9 new registrations that would otherwise compound the inconsistency.
4. **Pre-existing broken commands per Spec 019.** `buildscope --edit`, `createspecs`, `dbpush`, and `implement` are all reportedly broken at the CLI layer per project memory. Spec 030 does not fix them; spec 031 fixes `implement`. The others remain Spec 019's responsibility.
5. **Spec parser drift (next ADR-0001 application).** Six modules independently parse or generate the spec markdown format (FR-001 of the kit). Already analyzed in the architecture review; queued as the next refactor scope after 030 + 031 land.
6. **Fence writer drift (third ADR-0001 application).** `fence-emitter.ts`, `fence-db.ts`, and inline `implement.ts` calls split the fence-writer logic. Queued as the third refactor scope.

---

## Data Model

N/A. This spec introduces no new database tables and no schema changes. The single database-adjacent change is the `LifecycleStage` enum string-value correction documented in FR-007 — purely a code-side change matching values already in `projectphases.phasename`.

## Acceptance Criteria

See **FR-016**. The 11 numbered conditions there are the canonical acceptance gate.

## Out of Scope

See the **Scope Boundary (OUT)** row of the Core Design table in the Overview section, and the **Out-of-Band Issues to Track Separately** section above for explicit non-goals.

---

## Post-Implementation Amendments

### 2026-05-17 — `mcp-server/src/utils/stage-enforcement.ts` reintroduced as a thin wrapper

Slice C (commit `b58c771`) deleted `mcp-server/src/utils/stage-enforcement.ts` and changed `mcp-server/src/server.ts` to import `enforceTool` directly from `../../wxkanban-agent/core/policy/adapters/mcp-adapter.js`. That edit was verified under `tsx watch` (dev) but `tsc` (build) was not re-run.

When `npm run build` was exercised in mcp-server, the direct cross-package import broke the build with TS6059: the kit ships `.ts` source alongside its `.d.ts` declarations, TypeScript's NodeNext resolver prefers `.ts`, and the kit's `.ts` sits outside mcp-server's `rootDir: "./src"`. Six files cascaded into the error.

Resolved by reintroducing `mcp-server/src/utils/stage-enforcement.ts` as a **thin local wrapper** (not the pre-refactor implementation):

- Loads the kit's compiled `mcp-adapter.js` via `createRequire(import.meta.url)`, so TypeScript never resolves into the kit's source tree.
- Re-exports `enforceTool(db, projectId, toolName)` with a locally-mirrored `StageEnforcementResult` interface.
- `mcp-server/src/server.ts` imports from `./utils/stage-enforcement.js` again.

**What this changes about spec 030:**

- The Files Modified/Deleted table row "`mcp-server/src/utils/stage-enforcement.ts` — **Deleted**" is no longer accurate. The file exists as a wrapper. The spec's invariant — "Stage Gate decision logic lives in exactly one place" (FR-001) — still holds: the wrapper contains no decision logic, only a runtime-resolution shim around the canonical `mcp-adapter`.
- The phrase "one-file edit" (FR-001) still applies for changing a gate. Changing the adapter signature is now a two-file edit (kit adapter + the wrapper's type mirror). Future work should explore whether the kit can ship a layout that lets TypeScript resolvers prefer `.d.ts` (e.g., separate `src/` and `dist/` trees, or a `package.json` `exports` map) so the wrapper can be deleted again.
- The wrapper is currently **un-fenced**. Per spec 026, top-level functions must carry `[SCOPE 030 / Tnn]` fences written by `wxkanban-agent implement`. This is a known gap to remediate when the `implement` CLI is healthy. Track alongside the existing "Pre-existing broken commands per Spec 019" out-of-band issue.
