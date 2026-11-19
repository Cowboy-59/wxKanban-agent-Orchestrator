# Plan: Agent Orchestrator Kit — Amendment B

**Spec Number**: 019
**Date**: 2026-10-25
**Scope**: `specs/Project-Scope/019-agent-orchestrator-kit.md`, section **Amendment B** (R4 AC6–AC14)
**Ships**: as part of the kit write-safety batch. Kit and Cockpit first, then the server (T007).

## Implementation Plan

1. **T002**, the option registry, comes first; T001 and T003 read from it.
2. **T001**, help flags: `cli.ts` before parsing, and `WorkflowEngine.dispatch` for both gateways.
3. **T003 and T004**: the unknown-option refusal, then dbpush's single parser.
4. **T005**, the strict MCP write schemas, ships in the server push after the kit release.
5. **T006**, the real-path tests, are written alongside each task, each shown failing first.
6. **T007**, the release.

## Gates

- Real-path tests (T006) green; `auditfences` clean on touched files.
- The kit release is verified in the **published** asset, not the local build.
- Server push only with owner approval (it deploys production); a live probe after deploy (T005).

## Known Issues

- **The SessionStart hook runs a bare `cli.ts --help`** (`.claude/settings.json:11`) and relies on its update checks (`cli.ts:305-306`). Bare help keeps them (owner, 2026-10-25); only `<command> --help` is locked down.
- **Two dbpush parsers disagree today:** `parseDbPushArgv` (`dbpush.ts:1039`) and `runDbPush` (`workflow-engine.ts:80-86`). The gateway drops `--scope`. Replace both with one; don't patch both.
- **Deployed kits add `projectId` to every MCP call** (`core/http/mcp-client.ts:162-174`), and the server adds `projectid`/`projectId` itself (`server.ts:545-558`). `update_task` and `delete_task` don't declare `projectId`. The strict check must allow these envelope keys, and `_` from older buildscope workers.
- **Schemas wrapped in `.refine()`** (DeleteScope, RecordOverride, ScopeStage, UpdateSpecStatus, UpdateTask, TaskSpecLink, UpdateFeedbackStatus) need `.strict()` on the inner `z.object`.
- **The test-lifecycle tools** (`mcp-server/src/tools/test-lifecycle.ts`) have no zod schema; they need their own strict check.
- **`kit:configure` is handled before the help check** (`cli.ts:293`), and its own parser turns `--help` into an ignored flag.
- **Kit `scripts/` has two lineages** (memory): consumers run the orchestrator copy. Confirm which tree ships before editing.
