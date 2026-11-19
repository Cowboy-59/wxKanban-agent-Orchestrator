# Tasks: Agent Orchestrator Kit — Amendment B

Source of truth for status is the DB (SPEC-019). Fences use `[SCOPE 019 / Tnnn]`.
Scope: `specs/Project-Scope/019-agent-orchestrator-kit.md`, section **Amendment B** (R4 AC6–AC14).

## Tasks

| # | Task | Priority | Status |
|---|------|----------|--------|
| 1 | T001 — A help flag never dispatches a command (R4 AC6-AC8) | critical | todo |
| 2 | T002 — Per-command option registry and help text (R4 AC9) | high | todo |
| 3 | T003 — Unknown options refused before any network call; buildscope forwards only declared options (R4 AC10, AC12) | critical | todo |
| 4 | T004 — dbpush has one option parser; --scope works through the gateway (R4 AC11) | critical | todo |
| 5 | T005 — Hosted MCP write tools reject undeclared input fields (R4 AC13) | high | todo |
| 6 | T006 — Real-path regression tests and a live probe (R4 AC14) | critical | todo |
| 7 | T007 — Release: kit and Cockpit first, then the server (Release order) | high | todo |

## Task Details

### T001 — A help flag never dispatches a command (R4 AC6-AC8)

--help or -h anywhere on a command line that names a command prints that command's help and exits 0 with no dispatch, no network call and no file write — every command, including kit:configure (cli.ts 293, before the help check) and implement <scope> batch mode. Enforce in cli.ts before option parsing and in WorkflowEngine.dispatch (core/orchestrator/workflow-engine.ts 588), the point both the CLI and http.ts /dispatch pass through. Bare --help with no command prints the command list including outside a configured project (no throw at cli.ts 298) and keeps its session-start update checks (ensureCockpitUpToDate / ensureKitUpToDate — owner decision 2026-10-25). Classification: heavy.

### T002 — Per-command option registry and help text (R4 AC9)

Every command declares its options (name, value type, whether the command writes) in one registry; it drives the AC6 help output (extend describeCommands, core/policy/adapters/cli-adapter.ts 119) and the AC10 unknown-option check. Cover every write command listed in the amendment's research (buildscope, implement, createspecs, kit:configure, scaffold:frontend, archive:files, auditfences --baseline, the conversion commands, materialize-seeds, materialize-stack, dbpush). Classification: heavy (more than 5 files).

### T003 — Unknown options refused before any network call; buildscope forwards only declared options (R4 AC10, AC12)

A write command given an option not in its registry exits non-zero before any network call, naming the valid options and the nearest match; a read-only command warns and continues. workers/ai/buildscope-worker.ts 18-27 forwards only declared options (today it forwards every key, help and _ included). Classification: moderate.

### T004 — dbpush has one option parser; --scope works through the gateway (R4 AC11)

One parser shared by dbpush.ts (parseDbPushArgv 1039-1056) and WorkflowEngine.runDbPush (workflow-engine.ts 80-86). --scope honoured on both paths (the gateway drops it today, so dbpush --scope 017 pushes every spec). --skip-lifecycle implemented or removed from the parser and _wxAI/commands/dbpush.md. Unknown options refused inside the parser before the first network call (project.list_open_items, dbpush.ts 812), dry run included. Classification: heavy.

### T005 — Hosted MCP write tools reject undeclared input fields (R4 AC13)

At the tool dispatch point (mcp-server/src/server.ts, between the stage check ~709 and the switch ~711) reject any input field a write tool's schema does not declare, from a tool-name → schema map (apply .strict() to the inner z.object where a schema is wrapped in .refine()), returning InvalidParams naming the field. Include the test-lifecycle tools (hand-written JSON schemas). Allow the envelope keys projectId, projectid and _ (deployed kits add them: withResolvedProjectId server.ts 545-558, core/http/mcp-client.ts 162-174); help is not an envelope key. Advertise additionalProperties:false on write tools' ListTools schemas. Write tools: role-checker.ts editor/admin entries plus capture_event, submit_feedback, answer_feedback, triage_feedback, manage_my_feedback. Classification: heavy.

### T006 — Real-path regression tests and a live probe (R4 AC14)

Through the CLI entry point with a recording MCP endpoint: dbpush --help, dbpush -h, dbpush --helo, buildscope --help, implement NNN --help, kit:configure --help each produce zero hub writes; dbpush --scope NNN pushes only NNN. Each test shown failing without its fix. Live probe after deploy: an unknown field on project.upsert_document is refused by the deployed server. Classification: moderate.

### T007 — Release: kit and Cockpit first, then the server (Release order)

Kit release (sync-to-orchestrator; verify the published asset) carrying T001-T004 and T006, Cockpit if its bundled kit changed, then the server push with T005 (safe for deployed kits via the envelope allowance). Answer the open reports in this class after the live probe. Classification: moderate.
