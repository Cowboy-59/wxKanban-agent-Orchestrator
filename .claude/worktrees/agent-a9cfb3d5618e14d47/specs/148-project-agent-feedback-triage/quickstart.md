# Quickstart: Project Agent Feedback Triage

**Spec Number**: 148

## Setup

1. Review the spec: `specs/148-project-agent-feedback-triage/spec.md` (and SCOPE-132 Amendment C in
   `specs/Project-Scope/132-kain-autonomous-driver.md`)
2. Review the plan: `plan.md`
3. Review tasks: `tasks.md`
4. Review tests: `tests.md`

No SQL is waiting: Amendment C has no DDL.

## Development

1. Start with T001 (the live token check); pick the rest in plan order (server, inputs, bridge)
2. Fence new code `[SCOPE 148 / Tnnn]`
3. Run the suites for the area you touched: `npx vitest run tests/...` at the repo root, and
   `npm test` in `mcp-server/`, `wxkanban-agent/` and `vscode-extension/`
4. After bridge edits, rebuild `wxkanban-agent` so `dist/` matches the source

## Trying it

1. Start the project agent on the wxKanban Development project (the feedback sink)
2. Send `TRIAGE` in the room
3. A summary with counts and the top 5 groups is posted, and `docs/triage/BUG-Triage-YYYY-MM-DD.md`
   is written
