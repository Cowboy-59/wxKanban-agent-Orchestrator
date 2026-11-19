# Spec 030: Plan — Stage Gate Consolidation

**See also**: [spec.md](spec.md), [tasks.md](tasks.md), [ADR-0001](../../wxkanban-agent/docs/adr/0001-cross-surface-concerns-live-in-one-canonical-module.md), [kickoff doc](../../wxkanban-agent/docs/refactors/0001-stage-gate-consolidation.md)

This file is the HOW. The WHAT is in [spec.md](spec.md). The task breakdown is in [tasks.md](tasks.md).

---

## Implementation Phasing

The refactor lands as **one PR in six sequenced steps**. Half-migrated state — where old and new policy surfaces coexist live — is strictly worse than today's drift. Do not split.

### Step 1 — Create the new core (additive, no call sites touched)

1. Write `wxkanban-agent/core/policy/capabilities.ts` — `Capability` enum (12 members), `gateTable` (12 rows), module-load drift assert (FR-002, FR-010).
2. Write `wxkanban-agent/core/policy/policy.ts` — pure `evaluate(capability, currentPhase, verification?, override?) → Decision` (FR-003). **Port `formatBlockMessage` and `formatEscalationMessage` byte-identical from `command-policy.ts`** (FR-009).
3. Write `wxkanban-agent/core/policy/resolve-current-phase.ts` — DB phase resolver, default-to-Design fallback (FR-004). Extracted from lines 67–105 of `mcp-server/src/utils/stage-enforcement.ts`.
4. Write `wxkanban-agent/core/policy/resolve-spec-verification.ts` — active-scope inference + spec/task/doc verification query (FR-004). **Confirm the exact scope-tracking table/column at start of work** — implementer note.
5. Update `wxkanban-agent/core/schemas/lifecycle.ts` — change `QATesting` and `HumanTesting` string values (FR-007); delete `AllowedCommandsByStage` and `CrossCuttingCommands` exports.

**Checkpoint**: Existing tests still green. New code compiles. No call sites changed. `command-policy.ts` may have temporary inline copies of the deleted lifecycle exports to keep compiling; those are removed in Step 4.

### Step 2 — Build adapters (additive)

1. Write `wxkanban-agent/core/policy/adapters/cli-adapter.ts` — `evaluateCommand(...)` shaped to return today's `PolicyEvaluation` (FR-005). 12 mapping rows.
2. Write `wxkanban-agent/core/policy/adapters/mcp-adapter.ts` — `enforceTool(...)` shaped to return today's `StageEnforcementResult` (FR-006). 12 mapping rows (3 live, 9 inert). Calls `resolveCurrentPhase` AND `resolveSpecVerification` in parallel.

**Checkpoint**: New adapters compile. No call sites changed yet. Old surfaces still live.

### Step 3 — Cut over call sites (one file at a time, validating after each)

In order:

1. `wxkanban-agent/core/orchestrator/workflow-engine.ts` → import from `cli-adapter`. Run tests.
2. `wxkanban-agent/apps/command-gateway/src/cli.ts` → import from `cli-adapter`. Run tests.
3. `wxkanban-agent/apps/command-gateway/src/spec-verification.ts` → import from `cli-adapter`. Run tests.
4. `wxkanban-agent/scripts/verify-install.ts` → import from `cli-adapter`. Run script manually.
5. `mcp-server/src/server.ts` → import from `mcp-adapter`. Confirm MCP server starts; smoke-test one tool call.

**Checkpoint**: All 5 call sites on the new adapters. Old `command-policy.ts` and `stage-enforcement.ts` still exist but unused. Run the full test suite — expect green except for tests that still target `CommandPolicyEngine` directly (those are deleted/ported in Step 6).

### Step 4 — Delete the old surfaces

1. Delete `wxkanban-agent/core/policy/command-policy.ts`.
2. Delete `mcp-server/src/utils/stage-enforcement.ts`.
3. Grep for `CommandPolicyEngine`, `enforceStage`, `STAGE_GATED_TOOLS`, `AllowedCommandsByStage` outside documentation — expect zero results.

### Step 5 — Reconcile transitions.ts

1. Delete local `STAGE_ORDER` from `wxkanban-agent/core/orchestrator/transitions.ts`.
2. Import canonical `LifecycleStage` ordering from `core/schemas/lifecycle.ts` (FR-011). Choose either a `STAGE_ORDER` constant or a `getStageOrder()` helper exported from `lifecycle.ts`.
3. Run tests. Public functions in `transitions.ts` keep their signatures.

### Step 6 — Tests

1. Write `wxkanban-agent/tests/unit/policy/policy.test.ts` — decision-table with 12 × 6 × {4 verification states} rows (FR-014).
2. Write `wxkanban-agent/tests/unit/policy/cli-adapter.test.ts` — name-mapping + result-shape + `customCommands` (FR-015).
3. Write `wxkanban-agent/tests/unit/policy/mcp-adapter.test.ts` — name-mapping + resolver stubs + inert-row coverage (FR-015).
4. Port still-relevant assertions from `wxkanban-agent/tests/unit/command-policy.test.ts`, then delete it.
5. Verify the module-load no-drift assert in `capabilities.ts` fires when intentionally desynchronized (add a Capability, omit its gate row → expect throw at import time).
6. Bump kit version in `wxkanban-agent/package.json` (minor) and `src/client/version.ts` APP_VERSION (patch).
7. Run `wxkanban-agent auditfences --strict`. Expect exit 0.

---

## Pre-Implementation Gates

Three conditions must hold before Step 1 begins. If any are not met, the implementation phase blocks.

| Gate | State as of 2026-05-16 | Action if not met |
|---|---|---|
| **Spec 031 (Implement Enhancements) is implemented.** Adds `"delete"` to `ProposedFile.action` and `implement <scope>` batch mode. | **Not met** — spec 031 is a `stub` only; full buildscope not yet run. | Complete spec 031 buildscope + implementation before spec 030 implementation starts. Spec 030 paper work (spec.md, plan.md, tasks.md, etc.) is unblocked and can proceed in parallel. |
| **`wxkanban-agent implement` runs.** Either via the published CLI or via the documented direct-import wrapper per memory entry `feedback_orchestrator_cli_broken`. | **Partially met** — CLI is reportedly broken; direct-import wrapper exists per memory. | Use the direct-import wrapper for spec 031's own implementation if needed (chicken-and-egg). After spec 031 ships, the CLI is itself fixed. |
| **DB ground truth confirmed.** `projectphases.phasename` actual stored values match the Path A target strings. | **Met** — confirmed during buildscope; DB stores `'QA'` and `'HumanTesting'`, which is what Path A targets. | No action. |

---

## Hard Constraints

These are non-negotiable for the implementation phase. Violating any of them is a defect, not a tradeoff.

1. **All writes go through `wxkanban-agent implement`** (or the documented direct-import wrapper). No hand-authored fence markers. No direct file edits to fenced code units. Per CLAUDE.md orchestrator-first rule and your explicit directive during buildscope.
2. **Fences emitted by the orchestrator, never hand-authored.** Per Spec 026 and the kit's fence-emitter contract. The implementer writes the body; the orchestrator wraps it.
3. **Spec-first verification is uniform across CLI and MCP** (FR-008). No flag, environment variable, or surface-specific argument bypasses it. Force overrides remain logged-only and never allow.
4. **Byte-identical message preservation** (FR-009). The block message, escalation message, and rejection messages are ported character-for-character. Tests assert byte-equality. If a message must change for a real reason, the change is its own commit with its own justification, separate from the structural refactor.
5. **One PR, six steps, no partial deployment.** Steps 1–6 ship together. Half-migrated state where both old and new policy surfaces live is strictly worse than today's drift. Do not merge intermediate states.
6. **No new MCP tool registrations in this spec.** The MCP adapter has mapping rows for inert tools to make the follow-up scope purely additive — but registering those tools as MCP endpoints is the parity scope's job, not this one's.
7. **No public TypeScript API.** All new modules are kit-internal. Consumers consume CLI command names + MCP tool names + spec formats; they don't import `Capability` or `evaluate` directly. Per ADR-0001.

---

## Open Questions Resolved During Buildscope

Recording decisions explicitly so future readers know what was deliberately chosen vs. accidentally inherited.

| Question | Decision | Rationale |
|---|---|---|
| Capability set: fixed or extensible? | **Fixed** (extensible later if needed) | Kit ships opinionated workflow; consumer projects don't invent new gated operations. Today's CLI `customCommands` parameter is preserved as an opaque allow-list; not a true Capability extension. |
| Lifecycle phases: fixed or configurable? | **Fixed** (extensible later if needed) | The 6 phases are the kit's core domain model. Per CONTEXT.md and spec 019. |
| Public TypeScript API? | **None — everything internal** | Kit ships as installable behavior, not a TS library. Consumers depend on CLI/MCP names + spec formats. |
| Phase resolver location? | **Internal helper, shared by adapters** | No need to design as an extension point because consumers don't build adapters. |
| DB string canonical: enum bends to DB, or DB bends to enum? | **Path A — enum bends to DB** (`'QA'`, `'HumanTesting'`) | DB is the source of truth; the CLI enum's `'QA Testing'` / `'Human Testing'` values have never matched stored data. No data migration. |
| Spec-first verification scope? | **Uniform across all surfaces; required, no bypass** | "Cannot implement without a full spec" — explicit user directive. Closes a real pre-refactor gap. |
| Bundle spec-parser refactor into this PR? | **No — sequence** | Same architectural shape but different seam; this refactor establishes the pattern, spec-parser copies it as a separate scope. |
| Test discipline given limited automation today? | **One decision-table test for `policy.evaluate()` + module-load drift assert; defer adapter sweep tests to AI-driven environment shipping next release** | Plays to current reality without imposing a testing burden the kit can't yet maintain. |
| MCP cross-cutting registrations: add in this scope? | **No — pure refactor (option A)** | Gate table has all 12 rows; the 9 currently-unregistered MCP tool handlers are deferred to a follow-up MCP parity scope. Keeps spec 030 focused on drift consolidation. |
| Route through `implement` or out-of-band edits? | **Through `implement`** (after spec 031 enhancements land) | Per orchestrator-first rule and your explicit directive. |
| Workspace topology? | **One workspace** (mcp-server + wxkanban-agent ship together) | Adapter imports are workspace-relative; no separate package publishing or import-path acrobatics. |

---

## Rollback Strategy

**Mechanism**: `git revert <commit-sha>` of the merged PR.

**Risk assessment**: Low.

- No data migration to undo. DB schema is unchanged.
- DB string values (`'QA'`, `'HumanTesting'`) stay as they are today, both before and after this refactor.
- No new tables, no schema migrations, no enum additions to revert.
- Reverting restores the pre-refactor three-surface state — with all its drift, but functionally operational at the level it has been operating.

**Detection**: post-merge, the manual smoke-test sequence from `spec.md` "User Scenarios & Testing" runs as the release gate (FR-016 #9). If any scenario fails, revert before continuing. Specifically:

- The **new MCP spec-first block** (FR-008) is the most likely place for downstream surprises — kit consumers whose editor AI was previously invoking `project.implement` against unverified projects will start being blocked. If this surfaces as an outage, revert restores pre-block behavior.
- The **byte-identical message preservation** is verified by FR-014 unit tests pre-merge. If a consumer somewhere is doing tighter message inspection than the tests cover, that consumer surfaces post-merge — fix forward in that case rather than revert (the structural refactor is correct; the message contract just got stricter than anyone realized).

**Recovery from rollback**: If reverted, the original three-surface drift is back in place. Next attempt re-runs the same implementation, optionally with additional tests added to cover whatever the rollback surfaced. The spec/plan/tasks documents do not need to change — the refactor design is sound; only its application failed.

**Forward-only after the next ADR-0001 application lands**: once the spec-parser refactor (next scope after 030 + 031) follows the same pattern, reverting 030 in isolation breaks the pattern's first worked example. From that point forward, fixes are forward-only.

---

## Post-Release Operational Note (2026-05-19) — MCP container packaging

When mcp-server was first deployed to App Runner as the hosted MCP service (`mcp.wxperts.com` / `staging.mcp.wxperts.com`, spec 028), the kit's policy adapter could not be loaded at runtime. The wrapper in [mcp-server/src/utils/stage-enforcement.ts](../../mcp-server/src/utils/stage-enforcement.ts) used the monorepo-relative require path `../../../wxkanban-agent/core/policy/adapters/mcp-adapter.js`, which only resolves when mcp-server and wxkanban-agent are sibling directories — not inside the App Runner container, which builds from repo root but starts node at `/app/mcp-server/dist/index-http.js`. Container exited with `MODULE_NOT_FOUND`; App Runner auto-rolled back.

**Compounding factor**: `wxkanban-agent/**/*.js` and `*.d.ts` are gitignored at repo root (the kit ships .ts; compiled artifacts are generated locally). So a first-pass fix that copied `.js` files from `wxkanban-agent/core/{policy,schemas}/` into `mcp-server/dist/_kit/` silently no-op'd in App Runner — the filter matched zero files because no `.js` was checked into git.

**Final fix** (commit a481eb2): mcp-server's `postbuild` script invokes esbuild to bundle `wxkanban-agent/core/policy/adapters/mcp-adapter.ts` and its transitive deps (policy, capabilities, resolvers, schemas/lifecycle) into a single self-contained CJS module at `dist/_kit/mcp-adapter.cjs` (~13 KB). The wrapper require path becomes `../_kit/mcp-adapter.cjs`. esbuild reads `.ts` directly and ignores NodeNext extension rules, so kit source compiles without modification. `pg` stays external (resolved from the container's `node_modules`).

This preserves the FR-006 wrapper boundary the file comment already documents as desirable — `enforceTool()` still delegates byte-for-byte to the kit's adapter — while severing the runtime path dependency on the monorepo layout. Behavior is unchanged.

**Implication for ADR-0001 (cross-surface concerns live in one canonical module)**: still holds. mcp-server consumes the canonical kit module; bundling at build time is a packaging detail, not a duplication. If the policy module gains new transitive deps outside `core/policy/` and `core/schemas/`, esbuild will pick them up automatically. If a future dep requires a runtime node module not currently bundled, add it to `--external:`.

**Deployed**: v1.5.27 (matches APP_VERSION), 2026-05-19. Both staging and prod healthy post-deploy.
