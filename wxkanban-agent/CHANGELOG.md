# Changelog

All notable changes to `wxkanban-agent` are documented in this file.

## v1.2.5 — 2026-05-24

### Fixed — `dbpush` tasks.md parser format mismatch (BUG-2026-05-24)

`createspecs` emits the tasks summary table as `| # | Task | Priority | Status |`
— integer in col 1, bare title in col 2, no `T###` token anywhere in
the table (the canonical T### id lives on the `### T001 — Title`
headings under `## Task Details`). The pre-fix `dbpush.parseTasksMd`
regex required `T\d+` in col 2 and matched zero rows on every
createspecs-produced tasks.md, silently reporting `tasksCreated: 0`
while exiting success. Consumers had to hand-roll push scripts.

+ Loosened the row regex to match createspecs's actual format.
+ Synthesize the T### id from the column-1 integer
  (`'T' + String(num).padStart(3, '0')`) for downstream consumers.
+ Skip the header (`| # | Task | …`) and separator rows explicitly so
  they never produce phantom T-prefix entries.
+ Exported both `parseTasksMd` (dbpush.ts) and `generateTasksMarkdown`
  (createspecs.ts) so a round-trip regression test can hold them
  together.
+ New unit test `tests/unit/dbpush-tasks-roundtrip.test.ts` (4 tests)
  pins createspecs → tasks.md → parseTasksMd. Adding a column or
  changing the table shape will fail it loudly.

## v1.2.4 — 2026-05-24

### Changed — kit README cleanup

Removed the obsolete v1.0.5 upgrade warning, the "What's NOT in v1.1.0"
subsection, and the Release log section from the kit-shipped README.
Maintainer guide step 3 now points at `CHANGELOG.md`. Source unchanged
from v1.2.3.

## v1.2.3 — 2026-05-24

### Fixed — `init.mjs` now auto-installs missing dependencies

Consumers running `init.mjs` (or `wxai-http.mjs` directly) on a fresh
extract hit `wxai-http: tsx not found in either of: …` because the kit
ships without `node_modules` and the install was never automated despite
the README claiming it was. `init.mjs` now probes for tsx at the kit
root and runs `npm install` if missing. README troubleshooting note
added. Source unchanged from v1.2.2.

## v1.2.2 — 2026-05-24

### Fixed — dead local-MCP references (kit shipping cleanup)

VSCode "Start MCP Server" folderOpen task and 8 `kit:*` npm scripts pointed
to files removed in the v1.1.0 hosted-MCP cutover (setup-mcp.mjs,
setup-gateway.mjs, mcp-health-check.mjs, kit-status.mjs, kit-stop.mjs,
mcp-server/). They've been failing silently for shipped kits since v1.1.0.

This release ships the cleanup so freshly-downloaded kits no longer
reference missing files.

(`wxkanban-agent/` source unchanged from v1.2.1.)

## v1.2.1 — 2026-05-23

### Added — Frontend Scaffolding (spec 036)

(Version line reconciled with the published Cowboy-59/wxKanban-agent-Orchestrator
series. Local kit jumped from 0.8.0 to 1.2.1 to land on the next slot after
the published v1.1.1.)

New cross-cutting `scaffold:frontend` command produces a working Tailwind v4
+ shadcn/ui foundation in a consumer project with no manual `npx shadcn init`
or hand-authored configs required.

+ **19 templates** under `templates/frontend/`: Tailwind v4 config, PostCSS
  config, `components.json`, `globals.css` (hybrid `@theme` + CSS vars),
  `cn()` helper, 11 stock shadcn primitives (button, card, input, label,
  dialog, dropdown-menu, table, form, select, toast, calendar), a
  Tailwind-styled `ResourceCalendar` wrapping `react-big-calendar` (no
  library CSS imported), and a `ThemeProvider` + `ModeToggle` pair for
  light/dark/system mode.
+ **Centralized deps** in `templates/frontend/deps.json` — 17 runtime + 3
  dev deps pinned at `^major.minor`.
+ **Scaffold modules** under `core/scaffold/`: `consumer-detect`,
  `template-copy`, `deps-merge`, `prompt` — atomic, idempotent, TTY-aware.
+ **CLI handler** at `core/orchestrator/command-handlers/scaffold-frontend.ts`
  registered in `WorkflowEngine.dispatch` and policy capability table
  (cross-cutting, all phases). Flags: `--dry-run`, `--force`, `--yes`;
  exit codes `0`/`1`/`2`/`3`.
+ **Idempotent** — second run on a fully-scaffolded project writes nothing,
  mutates no `package.json`, does not duplicate the `CLAUDE.md` note.
+ **CLAUDE.md note** appended on first run (marker-guarded) documenting
  primitive ownership, dark-mode wiring, and the `npx shadcn@latest add`
  escape hatch.
+ **Docs**: `docs/scaffold-frontend.md`, README "Frontend Stack" section,
  `templates/frontend/verify-scaffold.md` copy-paste smoke snippet.
+ **Tests**: 25 unit tests for scaffold modules + 12 handler tests
  covering flag matrix, idempotency, partial-state preservation, and
  CLAUDE.md round-tripping.

Spec 036 marked `released`. See `specs/036-KitFrontendScaffolding/` for
the full FR / AC / risk register.

## v0.7.0 — 2026-05-19

### Added — Hosted MCP (spec 028, partial)

The kit pivots from "consumer runs a local MCP server with direct DB access"
to "consumer calls the hosted MCP at `mcp.wxperts.com` over HTTPS with a
bearer token." This release ships the bulk of spec 028; see
`specs/028-HostedMCPDeployment/tasks.md` for the per-task status.

- **DB schema** (T001–T004) — new `mcpapitokens` + `mcprequestaudit` tables;
  migrations under `src/db/migrations/0020_*.sql` + `0021_*.sql`; live DB
  verified.
- **MCP middleware** (T005–T009, T011) — bearer-auth, per-token rate-limit,
  async per-request audit, security headers, scoped-query wrapper, CI grep
  gate (`mcp-server/scripts/check-no-direct-db.sh`).
- **Kit HTTP client** (T018–T024) — `wxkanban-agent/core/http/mcp-client.ts`
  centralizes every MCP call site: bearer header, 429-retry with
  `Retry-After`, 5xx clean-error surface, token-resolution precedence
  (env → `kit` block → legacy file), strict token-format guard. The
  `buildscope-worker` and `lifecycle-client` are refactored onto it.
- **`kit:configure`** (T020) — new orchestrator command writes
  `kit.mcpBaseUrl` / `kit.apiToken` / `kit.projectId` atomically into
  `.wxai/project.json` (or `.env` with `--write-to=.env`). Token masked in
  stdout; malformed tokens / non-https URLs rejected with exit 2.
- **`resolveServiceUrl`** (T019) — gained a tier that reads
  `.wxai/project.json` `kit.mcpBaseUrl` between explicit env vars and the
  legacy port default.
- **Admin UI** (T013–T017) — new endpoints under
  `/api/admin/projects/:projectid/tokens` (issue / list / revoke / rotate)
  plus `ProjectTokensPage.tsx` + `TokenDisplayModal.tsx`. Role-check
  middleware accepts `COMPANY_ADMIN` (same company) or the project owner.
- **`setup-mcp.mjs` deprecation** (T025) — banner on every run; early-exit
  within 1 s when `MCP_BASE_URL` is `https://`. `kit:start` now routes
  through `scripts/kit-start.mjs`; `kit:start:legacy` preserves the
  spec-027 chain.
- **Deployment infra** (T029, T032, T033) — `apprunner-mcp.yaml` for App
  Runner source-code mode; `Makefile` with tag-gated
  `make deploy-mcp-prod TAG=vX.Y.Z`; full `infra/secrets-rotation-runbook.md`
  (DB rotation, token revocation, deploy rollback).
- **Docs** (T027, T034, T035) — `docs/hosted-mcp-migration.md` (v0.3.x →
  v0.4.0 consumer migration guide), `docs/hosted-mcp.md` (reference),
  `templates/.gitignore.snippet` updated for the new secret-bearing
  `.wxai/project.json`.

### Deferred from spec 028 (tracked in tasks.md)

- **T010** — refactoring the 24 direct `db.*` call sites in
  `mcp-server/src/server.ts` onto the new `withScope` wrapper. The CI
  grep gate exists and currently fails; the boundary is auditable but
  not yet enforced at the handler layer.
- **T012** partial — audit + scoped-query middleware tests still pending.
- **T028** — v0.3.x → v0.4.0 consumer migration smoke test.
- **Phase 8** (T037–T044) — 8 integration tests require live staging
  endpoint to actually run.

### Blocked on AWS operator action

- **T030 / T031** — App Runner service provisioning + Route53/ACM cert.
- **Phase 9 + T047** — live-infra dogfood + lifecycle close to `Released`.

### Spec 032 amendment

Track D added to spec 032 (kit shadcn/CSS bootstrap defaults). FRs and
tasks land in `specs/032-KitHousekeeping/`; the new
`templates/shadcn-baseline/` tree and `kit:bootstrap-ui` command are
**not yet implemented** — they're the next planned scope of work and
will ship in a follow-up release.

### Breaking changes

- `setup-mcp.mjs` now prints a deprecation warning on every invocation;
  future kit releases will remove it. Use `kit:start:legacy` if you need
  the pre-028 behavior intact.

## v0.6.2 — 2026-05-17

### Added — kit-shipped wxICA skill

The `improve-codebase-architecture` skill (renamed to **wxICA** — wxKanban Improve Codebase Architecture) now ships with the kit at `templates/skills/wxICA/`. Consumer projects install it by copying `SKILL.md` into their own `.claude/wxICA/` directory; see `templates/skills/wxICA/README.md` for the one-line install command.

Why ship the skill: v0.6.1 introduced the Drift Audit recipes in `docs/drift-audit.md` after three real defects shipped between v0.6.0 and v0.6.1. The recipes are only useful if an agent actually runs them — the skill is the trigger. Shipping the skill with the kit gives every kit consumer the same drift-detection discipline by default.

### Renamed

- `.claude/improve-codebase-architecture/` → `.claude/wxICA/` (consumer-side; kit ships the new layout)
- Cross-references in `.claude/diagnose/SKILL.md`, `scripts/seed-learnings.ts`, and `wxkanban-agent/docs/drift-audit.md` updated to point at `/wxICA`.

The historical name appears in `skills-lock.json` (external-skill sync record), `specs/030-StageGateConsolidation/spec.md` (as part of the buildscope provenance), and `.wxai/auditfences-legacy.json` (snapshot) — these are deliberately left untouched as historical record.

## v0.6.1 — 2026-05-17

### Fixed — spec 030 follow-up: mcp-server consumption boundary

Spec 030 Slice C (v0.6.0) cut `mcp-server/src/server.ts` over to a direct cross-package import of `wxkanban-agent/core/policy/adapters/mcp-adapter.js`. The import worked under `tsx watch` but broke `tsc` with TS6059 because the kit ships `.ts` source alongside `.d.ts` and TypeScript's NodeNext resolver picks `.ts` ahead of `.d.ts` — landing outside mcp-server's `rootDir: "./src"`.

- `mcp-server/src/utils/stage-enforcement.ts` reintroduced as a thin wrapper. It loads the kit's compiled `mcp-adapter.js` via `createRequire(import.meta.url)`, so TypeScript never resolves into the kit's source tree. Re-exports `enforceTool` with a locally-mirrored `StageEnforcementResult` interface. No decision logic — invariant FR-001 ("one canonical location") still holds.
- `mcp-server/src/server.ts` reverted to importing from `./utils/stage-enforcement.js`.
- Spec 030 spec.md amended with a `Post-Implementation Amendments` section documenting the wrapper and the (non-)impact on FR-001.

### Added — docs/drift-audit.md

New kit-shipped doc with four mechanical recipes for catching the class of defects that produced v0.6.1's hotfixes — dangling references, cross-package source imports, dev-vs-build divergence, and spec-interaction conflicts. Companion to the `improve-codebase-architecture` skill's new Step 0 Drift Audit. Surfaced as a future `wxkanban-agent auditdrift` automated command, queued as a 030 follow-up.

### Known: parent-watcher × detached-spawn interplay (spec 027 T008 × spec 019 R18)

The parent watcher added in spec 027 T008 polls `KIT_PARENT_PID` and self-terminates when the parent dies. `scripts/setup-mcp.mjs` (spec 019 R18) sets `KIT_PARENT_PID = process.pid` then exits ~3 seconds later — so the watcher fires and kills the MCP it just spawned. Production (App Runner, PID 1) auto-skips per the watcher code; every local dev machine hits it.

Worked around for local dev by setting `MCP_SKIP_PARENT_WATCHER=true` in `.env`. Root-cause fix (probably: setup-mcp shouldn't claim parentage of a detached child) is open as a kit follow-up. Tracked alongside the broader `improve-codebase-architecture` skill upgrade — see `.agents/skills/improve-codebase-architecture/DRIFT-AUDIT.md` Check 4 for the spec-interaction recipe that should have caught this at design time.

## v0.6.0 — 2026-05-17

### Changed — spec 030: Stage Gate Consolidation

Three drifting Stage Gate implementations (CLI `command-policy.ts`, MCP `stage-enforcement.ts`, and the local `STAGE_ORDER` in `transitions.ts`) collapsed into a single canonical policy module with thin per-surface adapters. The first concrete application of ADR-0001.

**New canonical module** at `wxkanban-agent/core/policy/`:

- `capabilities.ts` — `Capability` enum (12 members) + `gateTable` (allowedPhases / requiresVerifiedSpec / allowsEscalation) + module-load drift assert.
- `policy.ts` — pure `evaluate(input)` that handles both stage-gate and spec-first verification. No IO. Message formats (`formatBlockMessage`, `formatEscalationMessage`) ported byte-identical from the pre-refactor `command-policy.ts`.
- `resolve-current-phase.ts` — `resolveCurrentPhase(db, projectId)`: queries `projectphases` for `status IN ('in_progress', 'reopened')`; defaults to `Design` if no active phase; throws `ProjectNotFoundError` if project missing.
- `resolve-spec-verification.ts` — `resolveSpecVerification(db, projectId)`: finds active scope via `projectspecifications.status IN ('planned', 'tasks_generated', 'implementing')`; verifies `tasksExist` via `projecttasks.specid` and `documentsExist` via `projectdocuments.specid`. Returns all-false verification on corner cases (no active scope, multiple active scopes, project missing) — `policy.evaluate()` then blocks.
- `adapters/cli-adapter.ts` — translates CLI command names to `Capability` and delegates to `policy.evaluate()`. Returns the legacy `PolicyEvaluation` shape. Exports `evaluateCommand`, `evaluateStageOnly`, `evaluateCommandAllowed`, `isSpecGatedCommand`, `getAllowedCommandsForStage`.
- `adapters/mcp-adapter.ts` — translates MCP tool names to `Capability`; calls both resolvers in parallel via `Promise.all`; delegates to `policy.evaluate()`. Returns the legacy `StageEnforcementResult` shape. 3 mapping rows are live + 9 inert (reserved for the queued MCP parity scope).

**Schema corrections (Path A — DB strings win)**:

- `LifecycleStage.QATesting` changed from `'QA Testing'` to `'QA'` (matches stored `projectphases.phasename`).
- `LifecycleStage.HumanTesting` changed from `'Human Testing'` to `'HumanTesting'`.
- Comment added documenting the choice. The pre-refactor strings never matched DB values — anywhere the CLI compared its enum against a stored phase was silently broken.

**Behavior change — uniform spec-first verification (FR-008)**:

- The MCP surface now enforces spec-first verification for the 6 spec-gated capabilities (`ImplementTask`, `CreateTestTasks`, `RunQa`, `RunHuman`, `PrepareRelease`, `FinalizeRelease`). Pre-refactor, MCP allowed these without verification. Any caller that invokes `project.implement` against a project whose active scope is missing spec/tasks/documents will now block at the MCP layer with the existing "IMPLEMENTATION BLOCKED" message. This matches the explicit principle "cannot implement without a full spec."

**Cutover (6 call sites swapped to the new adapters)**:

- `wxkanban-agent/core/orchestrator/workflow-engine.ts` (7 internal sites; 6 `evaluateWithDetails` → `evaluateStageOnly`, 1 `evaluateSpecFirst` → `evaluateCommand`)
- `wxkanban-agent/apps/command-gateway/src/cli.ts`
- `wxkanban-agent/apps/command-gateway/src/spec-verification.ts`
- `wxkanban-agent/scripts/verify-install.ts`
- `wxkanban-agent/adapters/mcp/server.ts` (`OrchestratorMcpAdapter` — not in spec 030's call-site inventory; discovered during cutover)
- `mcp-server/src/server.ts` (passes the existing `pg.Pool` to the new adapter — pool's native `.query(sql, params)` satisfies `McpDbClient` directly; no Drizzle wrapper needed)

**Deleted**:

- `wxkanban-agent/core/policy/command-policy.ts`
- `mcp-server/src/utils/stage-enforcement.ts`
- `wxkanban-agent/tests/unit/command-policy.test.ts` (replaced by `tests/unit/policy/*` — see below)
- `AllowedCommandsByStage` + `CrossCuttingCommands` exports from `core/schemas/lifecycle.ts` (replaced by `gateTable` in `capabilities.ts`)

**Transitions reconciled (FR-011)**:

- `wxkanban-agent/core/orchestrator/transitions.ts` no longer declares a local `STAGE_ORDER`; imports the canonical ordering from `core/schemas/lifecycle.ts` (new `STAGE_ORDER` export added there). All public functions (`canTransition`, `getNextStage`, `getStageIndex`, `getStageOrder`) keep their signatures unchanged.

**Tests added**:

- `tests/unit/policy/policy.test.ts` (92 tests) — decision-table coverage: every Capability × every phase × verification states; force-override-never-bypasses; byte-identical message preservation.
- `tests/unit/policy/cli-adapter.test.ts` (22 tests) — name mapping (12 commands), `customCommands` pass-through, result-shape preservation, `evaluateStageOnly` vs `evaluateCommand` distinction.
- `tests/unit/policy/mcp-adapter.test.ts` (14 tests) — live + inert tool-name mappings, unmapped-tool pass-through, stubbed resolvers, project-not-found path.

**Verification**: 359 kit tests pass (was 257 before this refactor; net +102 after also deleting the 25-test `command-policy.test.ts`). 1 pre-existing flaky test (`spec027-qt` port resolution, unrelated to this work) is the only failure. Grep for `CommandPolicyEngine`, `enforceStage`, `STAGE_GATED_TOOLS`, or `AllowedCommandsByStage` outside of `specs/` and `docs/` returns no matches.

**Known follow-ups**:

- New top-level declarations added by this refactor (capabilities, policy, resolvers, adapters) are not yet fenced — same bootstrap exception as spec 031 Phase 2. A queued fence-cleanup scope can fence them via the now-working `implement <scope>`.
- FR-006 (topological dependency sort in batch mode) deferred — `spec-loader` doesn't parse dependencies yet; batch walks file order. Upgrades cleanly when dependency parsing lands.
- The MCP parity scope (registering the 9 missing MCP tool handlers + fixing the `kit_status` handler bug + rationalizing MCP tool naming convention) remains the next immediate-priority architectural scope.

---

## v0.5.0 — 2026-05-16

### Added — spec 031: `implement` command enhancements

The orchestrator's `implement` command gains two capabilities so refactor-shaped scopes (Spec 030 Stage Gate Consolidation, queued spec-parser/fence-writer consolidations) can run end-to-end through the orchestrator rather than via out-of-band `git rm` or N separate CLI invocations.

**Delete action**:

- `ProposedFile.action` accepts `"create" | "modify" | "delete"` (was two values).
- `parseProposal` validates the three-value vocabulary; rejection messages list all three valid actions.
- `SYSTEM_PROMPT` instructs the editor AI: use `"delete"` with empty body to remove a file.
- New handler branch in `handleImplementCommand`:
  - Hard-fails with `ImplementError(2)` when the target file does not exist (no silent recovery — surgical re-runs that fail with missing-file signal unexpected state).
  - Reuses the existing drift check against existing fences; `--accept-drift` records overrides in `taskfencehistory`.
  - Atomic FS removal via `unlinkSync`.
  - DB cleanup inside the per-task transaction: history row + `taskfences` + `taskfencemodifications` row removal.
- New `filesDeleted: string[]` field on `ImplementResult`; success message includes "deleted N" when non-empty (omitted when zero to preserve message format for create/modify-only tasks).

**Batch-by-scope mode**:

- New invocation form: `wxkanban-agent implement <scope>` walks all `todo` tasks in `tasks.md` for the scope, in file order. Surgical form `<scope>/<task>` is preserved as an optional override.
- Argument-shape disambiguation in cli.ts: `^\d{3}$` is batch; `^\d{3}/T\d+$` is surgical; anything else with `implement` exits with code 2.
- New `--continue-on-error` flag (batch-only) proceeds past failures; default semantics halt on first failure.
- New `--verbose` flag expands the batch `--dry-run` summary table with per-task detail.
- Per-task transactions preserve today's shape; batch-wide rollback is intentionally not provided (git is the rollback surface).
- File-based proposal source convention: `.wxai/proposals/<scope>/<taskId>.json` per task. Tests pass their own `proposalSource` function programmatically.
- New exports: `handleImplementBatchCommand`, `formatBatchSummaryTable`, `BatchImplementOptions`, `BatchImplementResult`, `BatchTaskOutcome`.

**Docs**: `docs/implement.md` rewritten — fixes the stale "calls Gemini" line (contradicted Spec 019 R6a in code since that spec landed), documents batch mode, delete action, `--continue-on-error`, `--verbose`, the file-based proposal convention.

**Tests**: 13 new tests in `tests/unit/implement-command.test.ts` (delete action + parser + batch mode + dry-run summary); 2 new tests in `tests/integration/implement-end-to-end.test.ts` against the new fixture scope at `tests/fixtures/specs/999-Fixture/`.

### Known deviations from spec 031 (track in tasks.md)

- FR-004 (rich `taskfencehistory` row shape): current schema only has `priorownerscope/priortask` + `replacedbyscope/replacedbytask`; delete branch uses what's available. Future small schema addition would close the gap.
- FR-006 (topological dependency sort): spec-loader returns `dependencies: []` always; batch walks file order. Cycle detection reduced to "no duplicate task IDs." Upgrades cleanly when spec-loader gains dependency parsing.
- FR-008 (stdin proposal source): implemented as file-based convention instead. Stdin between async tasks is awkward; file-based is testable, deterministic, survives the future Claude-coworker scope.
- New test files (delete-action.test.ts, batch-mode.test.ts, etc.): test cases landed in existing legacy test files instead, bypassing the fence-bootstrap chicken-and-egg.

This release unblocks **Spec 030 implementation** (was blocked on 031 shipping).

---

## v0.4.0 — 2026-05-15

### Changed — orchestrator R6a: handlers no longer call AI

Command handlers (`buildscope`, `createspecs`, `implement`, `createtesttasks`, `runqa`, `runhuman`, `prepareRelease`, `finalizeRelease`) are now pure workflow code: they validate stage gates, pull/write spec metadata, fence code, and audit — they do not invoke any LLM directly. AI generation is the editor's responsibility (VS Code commands hand the user's editor AI the prompt + context; the kit validates and persists the result via MCP). The web editor is the only consumer that still uses a kit-internal AI client.

This codifies the "kit is a workflow engine, not an AI client" contract that consumer projects (kit-built apps) had been relying on implicitly. No public CLI surface change; behavior change is purely "handlers stop reaching for `GEMINI_API_KEY` / `GROQ_API_KEY` on the workflow path."

### Fixed

- **`dbpush` rewritten as proper spec-metadata sync (bugreport 2026-05-15).** The previous implementation conflated spec parsing with migration helper logic, leaving the command broken for both purposes. The rewrite scopes `dbpush` to its actual job: read each `specs/###-*/spec.md`, parse the front-matter + lifecycle metadata, and upsert the matching `specs` row. Migration generation stays in Drizzle.
- **CLI now passes `SpecVerification` to `dispatch`.** The gateway CLI was constructing handler context without the spec-verification payload, so every stage-gated command (`buildscope`, `createspecs`, `implement`, `runqa`, `runhuman`, `prepareRelease`, `finalizeRelease`) returned "spec not verified" regardless of state. Fix unblocks the full lifecycle from the CLI entry point.

---

## v0.3.1 — 2026-05-14

### Fixed

- **`setup-mcp.mjs` partial-install detection (TCI-ExpenseManager bugreport Bug 1)** — The previous "is `mcp-server/node_modules` present" guard let partially-installed deps slip through. If a prior `npm install` ran from WSL or partially completed, Windows shims (`tsc.cmd`, etc.) might be missing while `node_modules/` exists. The script now also checks for the platform-specific build shim and re-runs `npm install` if missing.

- **Parent-watcher fires in containers (spec 027 FR-005 regression discovered during App Runner deploy)** — The watcher I designed to handle "VS Code closes → kill local MCP" was killing production deployments. In containers, `process.ppid` returns 0 because the Node process is PID 1. The watcher saw "parent dead" within 4 seconds and shut down the running service. Two new guards in `startParentWatcher`:
  - `MCP_SKIP_PARENT_WATCHER=true` env var disables the watcher entirely (recommended for container deployments).
  - Auto-detect: if `process.pid === 1 && parentpid in (0, 1)`, skip the watcher without needing the env var.
  - Both the kit (`core/runtime/parent-watcher.ts`) and the mcp-server ESM mirror (`mcp-server/src/runtime/kit-hygiene.ts`) get the same fix.

### Notes for consumers still on v0.1.x / v0.2.x

The TCI-ExpenseManager bugreport (port collisions, stale `mcpHttpUrl`) is largely solved by upgrading to v0.3.0+:

- **Port `:3002` collision with another project's MCP** — v0.3.0 introduced port autoselect (FR-002). MCP scans the next 50 ports and picks the first free one, so no more "kill the foreign listener" gymnastics.
- **Port `:3003` collision with own gateway** — Same autoselect mechanism applies to the gateway.
- **Stale `mcpHttpUrl` in `.wxkanban-project.json`** — v0.3.0's `resolveServiceUrl()` reads the live port from `.wxai/kit-runtime.json` (written at bind time, deleted on shutdown). The `.wxkanban-project.json` `mcpHttpUrl` field is now effectively legacy.

### Companion infra changes (not shipped in the npm kit, lives in `infra/`)

Real bugs in the spec-028 Terraform that bit during the initial App Runner deploy:

- Default region: `us-east-1` → `us-east-2` (matches `wxkanban.wxperts.com`).
- Removed non-existent `data "aws_apprunner_connection"` data source (provider only exposes the managed resource); pass the connection ARN directly via `var.github_connection_arn`.
- Added required variable declarations: `api_key`, `jwt_secret`, `encryption_key`.
- Added App Runner per-service certificate validation CNAMEs (`certificate_validation_records` for_each) — without these the custom domain hangs forever in `pending_certificate_dns_validation`.
- Fixed `build_command` to actually build mcp-server: `npm install && cd mcp-server && npm install && npm run build`.
- Flipped `configuration_source` from `REPOSITORY` to `API` so Terraform's `code_configuration_values` actually take effect (the sibling `apprunner-mcp.yaml` is never read — App Runner only reads the literal filename `apprunner.yaml`).
- Added container-deployment env vars (`KIT_PARENT_PID=1`, `MCP_SKIP_PARENT_WATCHER=true`) belt-and-suspenders with the kit-side parent-watcher fix above.

These changes are in `infra/` (Terraform) and the example `terraform.tfvars.example`. No state migration needed.

---

## v0.3.0 — 2026-05-13

### Added — spec 027: Kit Runtime Hygiene

- **Port autoselect** for both MCP server and orchestrator HTTP gateway. Each service tries its configured port (`MCP_HTTP_PORT` / `GATEWAY_HTTP_PORT`), then scans forward through 50 consecutive ports and binds the first free one. `EADDRINUSE` startup failures are gone.
- **Parent-process watcher** on every spawned service. Polls the parent PID (the VS Code integrated terminal that spawned it) every 2 seconds; on 2 consecutive misses, runs graceful shutdown (close server → 5s in-flight grace → remove entry from runtime-state → exit 0). VS Code window close now cleans up MCP + gateway within ~7s.
- **Runtime-state file** at `.wxai/kit-runtime.json` — single source of truth recording `{port, pid, parentpid, startedAt, cmd}` per service. Atomic writes (tmp + rename). Auto-deleted when the last service exits.
- **`kit:status` command** (cross-cutting, every stage). Reports per-service liveness with text or `--format=json` output. Exit codes: `0` healthy, `1` stale/missing, `2` runtime-state file unreadable. `--strict` promotes stale entries to errors.
- **`kit:stop` command** rewritten to read the runtime-state file: SIGTERM → 5s grace → SIGKILL each recorded PID. Legacy `.mcp-server.pid` honored as fallback. Both files deleted on success.
- **Client-side URL discovery** via `resolveServiceUrl(service)` helper. Precedence: runtime-state file (alive PID) → `MCP_BASE_URL` / `GATEWAY_HTTP_PORT` env → default `localhost:3002`/`localhost:3003`. Replaces hard-coded literals in `buildscope-worker`, `lifecycle-client`, `verify-install`.
- **Five new core modules**:
  - `core/runtime/state-file.ts` — atomic JSON read/write + `isPidAlive` helper.
  - `core/runtime/port-autoselect.ts` — `bindWithAutoselect`, `findFreePort`, `PortRangeExhaustedError`.
  - `core/runtime/parent-watcher.ts` — `startParentWatcher` with 2-miss hysteresis.
  - `core/context/runtime-state.ts` — `resolveServiceUrl`, `resolveServicePort`, `DEFAULT_PORTS`.
  - `core/orchestrator/command-handlers/kit-status.ts` — handler + renderers.
- **MCP-side mirror** at `mcp-server/src/runtime/kit-hygiene.ts` — ESM-native version of the same helpers (MCP is a separate package and can't cross-import the kit's CJS modules).
- **New consumer-facing scripts**:
  - `scripts/setup-gateway.mjs` — spawns the gateway with `KIT_PARENT_PID`, cleans stale runtime-state entries.
  - `scripts/kit-stop.mjs` — promoted from the inline one-liner; runtime-state-first with legacy fallback.
  - `scripts/kit-status.mjs` — standalone ESM entry for `npm run kit:status` (no CLI gateway dependency).
- **Template** at `templates/.gitignore.snippet` — recommended `.gitignore` entries including `.wxai/kit-runtime.json` and the spec-026 `.wxai/auditfences-legacy.json`.
- **Docs** at `docs/kit-runtime.md` — full reference for runtime-state file, autoselect, watcher, kit:status, kit:stop, troubleshooting.

### Changed

- `setup-mcp.mjs` now passes `KIT_PARENT_PID=process.pid` to the spawned MCP and cleans stale `mcp` entries from `.wxai/kit-runtime.json` before spawn.
- `mcp-server/src/index-http.ts` resolves its actual bound port via `findFreePort` before printing the startup banner, writes its runtime-state entry after bind, and starts a parent-watcher.
- `apps/command-gateway/src/http.ts` uses `http.createServer(app)` + `bindWithAutoselect` (Express's `app.listen()` can't be re-bound), writes its runtime-state entry, starts a parent-watcher, and registers a unified graceful shutdown for SIGTERM / SIGINT / parent-gone.
- `mcp-health-check.mjs` resolves the MCP port from `.wxai/kit-runtime.json` first (with PID liveness check) before falling back to env / default — works after autoselect picks a non-default port.
- `package.json` scripts:
  - `kit:start` now runs setup-mcp **and** setup-gateway sequentially.
  - `kit:stop` invokes `scripts/kit-stop.mjs` (legacy one-liner moved to `kit:stop:legacy`).
  - New: `kit:start:mcp`, `kit:start:gateway`, `kit:status`.
- `verify-install.ts` gains a `kit-status` step that calls `handleKitStatusCommand` and reports pass/fail/skip based on exit code.
- `buildscope-worker.ts`, `lifecycle-client.ts`, `verify-install.ts` all replace inline `localhost:3002/3003` literals with `resolveServiceUrl(...)`. The pre-existing default of `localhost:3003` for MCP calls in those files was incorrect (MCP is `:3002`); the resolver fixes that bug.

### Behavioral notes

- **Two-miss hysteresis**: the watcher waits for 2 consecutive failed liveness probes before firing graceful shutdown. This avoids false-positive shutdowns on transient `kill(pid, 0)` flakes. Worst-case detection: ~4s. Plus the 5s graceful window → ~9s total.
- **Multi-instance**: two consumer projects can run kits concurrently. Each repo's `.wxai/kit-runtime.json` is independent; port autoselect resolves any collision; each watcher monitors only its own spawn parent.
- **Windows graceful shutdown**: `process.kill(pid, 'SIGTERM')` on Windows bypasses JS signal handlers (Node quirk). The parent-watcher path is unaffected; `kit:stop` uses SIGTERM then SIGKILL after 5s.

### Migration notes for v0.2.x consumers

No required action. Behavior is additive:
- Existing `.mcp-server.pid` flow continues to work; `kit:stop` reads both files.
- Existing `MCP_BASE_URL` / `GATEWAY_HTTP_PORT` env vars still override (precedence below runtime-state file).
- Drop `templates/.gitignore.snippet` into your `.gitignore` so the new runtime-state files don't get committed.

### Known limitations at v0.3.0

- `KIT_PORT_SCAN_RANGE` env var is reserved in CLI Contracts but not honored (scan range hard-coded to 50). Tune in a follow-on if needed.
- Watcher does not detect `SIGSTOP`-paused parents — `kill(pid, 0)` returns success for stopped processes. In practice VS Code never stops its own terminal.
- Non-VS-Code editors (Cursor, JetBrains, raw shells) use the same parent-process mechanism; they happen to work but aren't tested targets.

---

## v0.2.0 — 2026-05-13

### Added — spec 026: Code Fencing / Spec-Task Traceability Markers

- **`implement <scope>/<task>` command** (previously documented but never shipped). Reads a spec bundle, calls Gemini (OpenAI fallback) for code generation, fences every generated unit with its owning spec/task, writes files atomically, applies DB rows in a transaction, and flips the task's status in `tasks.md` from `todo` to `done`.
  - Flags: `--dry-run`, `--replace`, `--modify`, `--accept-drift`, `--file <path>`, `--specs-root <dir>`, `--project-id <uuid>`.
  - Exit codes: `0` success, `1` drift/blocked, `2` spec or task not found, `3` filesystem / DB / AI error.
- **`auditfences` command** — cross-cutting, allowed in every lifecycle stage.
  - Scans the repo, parses every fence, cross-references task IDs against `specs/*/tasks.md`, reports un-fenced declarations, malformed fences, and unknown task IDs.
  - Flags: `--path <dir>`, `--format text|json`, `--strict`, `--baseline`, `--history <scope>/<task>`.
  - `--baseline` captures the current tree's content hashes so legacy un-fenced code is reported as `info` rather than `error`.
- **Code fencing convention** — every top-level function, class, route handler, Drizzle table, React component, and SQL migration body is wrapped with a single-line BEGIN/END comment naming its owning spec/task.
  - MODIFIED-BY rule when a later task partially edits a fence.
  - Full-replacement rule (≥ 80% diff) transfers ownership.
  - SHA-256 drift detection rejects out-of-band edits unless `--accept-drift`.
  - Per-language comment syntax matrix (`.ts`, `.sql`, `.css`, `.md`, `.yaml`, `.html`, etc.); `.json` is exempt.
- **Four new DB tables** in the consumer's `DATABASE_URL`:
  - `taskfences` — current fence ownership per code unit.
  - `taskfencemodifications` — append-only MODIFIED-BY history.
  - `taskfencehistory` — closed ownership records after full replacement.
  - `taskfenceslegacy` — pre-fencing baseline hashes.
- **Bundled migration** at `templates/migrations/0001-026-codefencing.sql`. Applied automatically by `wxkanban-agent dbpush` when `DATABASE_URL` is set; tracked in a `kitmigrations` table.
- **Kit templates** for consumer projects:
  - `templates/CLAUDE.md.fencing-snippet.md` — paste into the consumer's CLAUDE.md.
  - `templates/auditfences-github-action.yml` — drop-in CI step.
  - `templates/schema/*.ts` — Drizzle schemas matching the bundled migration.
- **Documentation** at `docs/implement.md` and `docs/fencing.md`.
- **`scripts/pack-kit.sh`** — produces `wxkanban-agent-vX.Y.Z.tgz` for `npm install` distribution.
- **`scripts/verify-install.ts`** — extended with five spec 026 install-time checks.

### Changed

- CLI gateway (`apps/command-gateway/src/cli.ts`) now captures positional arguments as `rawOptions._` so commands like `wxkanban-agent implement 026/T010` work.
- `CrossCuttingCommands` in `core/schemas/lifecycle.ts` includes `auditfences`.
- `package.json` declares runtime dependencies (`pg`, `uuid`) and dev types — previously the kit relied implicitly on the parent project's `node_modules`.
- `package.json` adds a `files` field so `npm pack` ships only the intended kit assets.
- `dbpush` now applies bundled kit migrations to the consumer's `DATABASE_URL` before its existing validate/push flow. Pre-existing dbpush behavior unchanged otherwise.

### Migration notes for v0.1.x consumers

1. `npm install wxkanban-agent@^0.2.0`.
2. `wxkanban-agent dbpush` — applies the bundled spec 026 migration to your `DATABASE_URL`. The four orchestrator tables are created if absent.
3. `wxkanban-agent auditfences --baseline` — captures your current tree's content hashes as legacy. Without this, post-upgrade `auditfences` runs would flag every existing un-fenced declaration as an error.
4. Inject `templates/CLAUDE.md.fencing-snippet.md` into your project's CLAUDE.md.
5. Optional: add `templates/auditfences-github-action.yml` to your CI.

### Known limitations at v0.2.0

- Retroactive fencing of pre-spec-026 code is out of scope (a follow-on scope will handle it).
- `auditfences --history` requires DB access; without it the command reports a placeholder. Full timeline rendering lands in v0.3.x.
- The fence-emitter detects declarations via regex per FR-002; very unusual TypeScript patterns may not match. AST-based detection is a future enhancement.
- `implement` AI prompt is unconditional minimum-viable; prompt tuning rides on `pipeline-agent` improvements in future releases.

---

## v0.1.7 — earlier

Pre-spec-026 release. `implement` was listed in the lifecycle table but had no handler; consumer projects relying on the documented behavior would fall through to `No handler registered`. v0.2.0 closes this gap.
