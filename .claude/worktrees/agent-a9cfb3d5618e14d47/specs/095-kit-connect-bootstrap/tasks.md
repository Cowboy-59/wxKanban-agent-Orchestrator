# Tasks: Kit Connect Bootstrap (Spec 095)

Spec ID: 740f5cd0-9973-48db-978f-9e1ca808aa4e · 8 tasks · 8 done · **phase: implementation**

| # | Task | Priority | Status | FRs | Task ID |
|---|------|----------|--------|-----|---------|
| T001 | WS1: Server-inject .mcp.json at download | high | done | FR-001 | 55ff979c-fa5a-4d01-824e-18d087a04b2c |
| T002 | WS1: Strip .mcp.json on re-download (upgrade path) | medium | done | FR-002 | 956c516a-f047-4ca4-a7fa-902cfa8d9083 |
| T003 | WS3: Auto-run init.mjs on folderOpen | high | done | FR-003 | f8781e43-9a8e-4976-9f5a-c258c119e455 |
| T004 | WS2: Fix kit-configure token regex + error text | high | done | FR-004, FR-005 | 6b7e660b-ed3f-46c9-9eaa-6e35873bbbf7 |
| T005 | WS4: Reconcile setup docs | medium | done | FR-006 | 7b77f256-a166-4a39-9159-5d886418efc4 |
| T006 | Tests + e2e download verification | medium | done (unit) | Metrics 1 & 2 | 8e532f3a-3665-4610-9052-81982ef526dc |
| T007 | Amendment A: wire kit:configure into the CLI dispatch path | high | done | FR-007 | c0231a6b-5ba5-4537-9d2c-d629d6010b97 |
| T008 | Amendment B: exempt kit:configure from the entitlement preflight; hermetic kit tests | high | done | FR-008 | 656cffb1-91e9-4990-9a66-987370e8624d |

> **Amendment B / T008 implemented 2026-10-05.** NOT committed, NOT pushed. Evidence:
>
> | Check | Result |
> | --- | --- |
> | Kit suite, real expired cache still on disk | Before: 19 failed / 733 passed. After: 8 failed / 745 passed. The 11 named tests now pass. The 8 that remain are identical to the run with entitlement off (`dbpush-blocked-report`, `implement-end-to-end`, `spec026-qt`, `spec027-qt`, `auditfences`). |
> | New lockout test | Fails with the exemption removed, passes with it restored. `preflight` + `kit-configure-wiring` + `kit-configure`: 32/32. |
> | `tsc --noEmit` | 0 errors in touched files (8 elsewhere, pre-existing). |
> | Endpoint test, real gateway `app` over real HTTP | Scratch root, a production-signed `.wxai/.entitlement` that expired 2026-08-12, no resolvable token. `auditfences` → 422 with `entitlementBlocked` (`source=grace`). `kit:configure` → 200, writes `.wxai/project.json`, and the raw token is absent from the response. With the exemption removed, `kit:configure` → 422 with the reporter's exact message. The boot wrapper (port autoselect, registry, Cockpit/kit self-update) was skipped by serving the exported `app`. |
> | Fence baseline | Surgical re-capture of `preflight.ts` (6 restored) and `preflight.test.ts` (4 restored), with `amendments[]` entries. `vitest.config.ts` drifted with 0 findings, so it was not re-captured. `workflow-engine.ts`'s `class WorkflowEngine` error predates this task (the file had already drifted at HEAD). Repo errors 374 → 364, equal to HEAD. |
>
> **Amendment A / T007 implemented 2026-08-03.** All four registration points wired; new suite `tests/unit/policy/kit-configure-wiring.test.ts` 7/7 (test 6 pins the customer's exact rejection string as a regression guard); `tests/unit/policy` + `kit-configure` + `kit-status-integration` 159/159. Endpoint-tested against the real CLI: `kit:configure` succeeds on an empty directory with no `.wxkanban-project.json`, and on the reporter's exact Design-stage layout — `lifecycleStage` preserved (merge-safe), token masked in stdout and redacted from the audit record, and `--help` now lists the command in every stage. Pre-existing unrelated failures (`dbpush-*`, `auditfences` strict-mode, `implement` idempotency) confirmed identical with the change stashed. NOT committed, NOT pushed.
>
> Implemented + unit-tested 2026-07-10; unit suites green (buildMcpJsonDoc 6/6, kit-configure 9/9), tsc clean. NOT pushed. E2E real-download verification + ship (push deploys server WS1/WS2; kit release ships WS3/WS4) are user-gated. Pre-existing unrelated `dbpush-*` unit failures confirmed independent of 095.

## T001 — WS1: Server-inject .mcp.json at download
`src/server/services/KitProxyService.ts` `writePerProjectFiles`: after the token is minted (`apiToken`) and `mcpBaseUrl` resolved, write `.mcp.json` into `destDir` with `{ mcpServers: { wxkanban: { type:"http", url:`${mcpBaseUrl}/mcp`, headers:{ Authorization:`Bearer ${apiToken}` } } } }`. Merge-safe (preserve other `mcpServers`). Ensure `.mcp.json` gitignored in the archive. Reference shape: `init.mjs` `writeClaudeMcpRegistration`. Implements FR-001.

## T002 — WS1: Strip .mcp.json on re-download (upgrade path)
`src/server/services/KitProxyService.ts`: add `.mcp.json` to `UPGRADE_STRIP_FILES` so a re-download regenerates it with the fresh token. Implements FR-002.

## T003 — WS3: Auto-run init.mjs on folderOpen (orchestrator repo)
`..\wxKanban-agent-Orchestrator\.vscode\tasks.json`: add an `init.mjs` `folderOpen` task; reconcile with the existing "Start Orchestrator HTTP Gateway" task to avoid a double `:3003` bind (prefer init.mjs as the single first-run entry — it already starts the gateway, PID-guarded). init.mjs stays idempotent. Implements FR-003.

## T004 — WS2: Fix kit-configure token regex + error text
`wxkanban-agent/core/orchestrator/command-handlers/kit-configure.ts:16`: relax `TOKEN_RE` to accept the real base64url token (and a future `wxk_`-prefixed form), rejecting malformed input. Fix the wrong `wxk_live_<64hex>` guidance in `kit-configure.ts` and `..\wxKanban-agent-Orchestrator\scripts\init.mjs`. Verify against `generateApiToken()` (`crypto.randomBytes(32).toString('base64url')`) / `mint-project-token.ts`. Implements FR-004, FR-005.

## T005 — WS4: Reconcile setup docs
Purge `type:"sse"`; document the one true form (`.mcp.json`, `type:http`, `<base>/mcp`, literal token, gitignored, `/mcp`-approve + reload). Fix every `scripts/init.mjs` reference and token-format example; collapse to one canonical hosted-setup section. Files: `_wxAI/commands/wxAI-project-init.md`, `wxkanban-agent/docs/hosted-mcp*.md`, orchestrator `gettingStartedInstructions.md` + `wxKanban_Kit_Setup.md`. Implements FR-006.

## T007 — Amendment A: wire `kit:configure` into the CLI dispatch path
Four registration points, all currently missing (customer report `bd756151`):

1. `core/policy/capabilities.ts` — add `Capability.KitConfigure` with `allowedPhases: "all"`, `requiresVerifiedSpec: false`, `allowsEscalation: false`.
2. `core/policy/adapters/cli-adapter.ts` — add `"kit:configure": Capability.KitConfigure` to `CLI_COMMAND_TO_CAPABILITY` (this also makes `--help` list it via `computeAllowedCommands`).
3. `core/orchestrator/workflow-engine.ts` — `runKitConfigure` + a `case 'kit:configure'` in `dispatch()`, returning an `AuditRecord` like the other handlers. Never log the raw token.
4. `apps/command-gateway/src/cli.ts` — handle `kit:configure` at the top of `main()`, **before** `loadProjectConfig()`, which throws on the un-bootstrapped repo this command exists to fix. Accepts `--token`, `--project-id`, `--mcp-url`, `--write-to`, `--project-root` in both `--k v` and `--k=v` forms; exits with the handler's own 0/1/2 code.

Tests: unit coverage that the capability is allowed in every `LifecycleStage`, that `evaluateCommand` no longer returns the stage-violation string for `kit:configure`, and that the CLI path runs with no `.wxkanban-project.json` present. Implements FR-007.

## T008 — Amendment B: exempt `kit:configure` from the entitlement preflight
Feedback `669039df`. Implements FR-008.

1. `core/license/preflight.ts`: add `"kit:configure"` to `EXEMPT_COMMANDS`.
2. `core/orchestrator/workflow-engine.ts`: update the comment above `assertEntitled({ command })` in `dispatch()` to name `kit:configure`. Comment only; no logic change.
3. `tests/unit/license/preflight.test.ts`: add the lockout-state test. The fixture is a signed cache with `exp` in the past, `refresh: async () => null`, and `mode: "enforce"`. `kit:configure` is allowed (`source: "exempt"`) and `wxconversion` is denied (`source: "grace"`).
4. `vitest.config.ts`: set `test.env.WXKANBAN_ENTITLEMENT = "off"`, with a comment saying why. Then verify that the 11 named tests pass with the developer's real expired cache present, and that `preflight.test.ts` is unchanged at 9 explicit-`mode` calls.
5. Endpoint test. Run the real gateway (`apps/command-gateway/src/http.ts`) in a scratch project root that has an expired signed `.wxai/.entitlement` and no token.
   - `POST /dispatch` with `kit:configure` succeeds and writes `.wxai/project.json`.
   - `POST /dispatch` with a non-exempt command (`auditfences`) is denied with `entitlementBlocked`.

**Fence baseline.** `preflight.ts`, `preflight.test.ts` and `vitest.config.ts` are each baselined in `.wxai/auditfences-legacy.json` and currently match. These edits drift all three, which un-exempts each file's legacy declarations. Re-capture each file surgically: replace that one key's hash and append an `amendments[]` entry that grants nothing new. **Never** run `auditfences --baseline`. The edits add no new top-level declaration, so they need no new fence. `workflow-engine.ts` has already drifted at HEAD.

## T006 — Tests + e2e download verification
Unit: `KitProxyService` test asserting injected `.mcp.json` shape (`type:http`, url ends `/mcp`, `Bearer` token); `kit-configure` test accepting ≥2 real base64url tokens and rejecting ≥2 malformed. E2E: extract a real kit download and confirm `.mcp.json` present/valid/gitignored and the token authenticates via `POST <base>/call`. Covers Success Metrics 1 & 2.
