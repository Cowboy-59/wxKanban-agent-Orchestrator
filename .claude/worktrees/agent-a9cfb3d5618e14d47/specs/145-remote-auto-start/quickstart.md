# Quickstart: Remote Auto-Start

**Spec Number**: 145

## Setup

1. Review the spec: `specs/145-remote-auto-start/spec.md` (and SCOPE-132 Amendment B in
   `specs/Project-Scope/132-kain-autonomous-driver.md`)
2. Review the plan: `plan.md`
3. Review tasks: `tasks.md`
4. Review tests: `tests.md`

`companyprojects.allowremote` is already in production (`boolean NOT NULL DEFAULT false`), so no
SQL is waiting.

## Development

1. Pick a task from `tasks.md`, in plan order (server, then web and kit, then Cockpit)
2. Fence new code `[SCOPE 145 / Tnnn]`
3. Run the suites for the area you touched: `npx vitest run tests/...` at the repo root,
   `npm test` in `wxkanban-agent/` and in `vscode-extension/`

## Trying it

1. Turn "Allow remote" on for the project (Settings → the project's agent access panel)
2. Open the project in VS Code with the new Cockpit
3. The status bar goes Starting → Live, with one "Remote is live" notification
