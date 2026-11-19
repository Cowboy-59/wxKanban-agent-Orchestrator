# Quickstart: Retire Plain Remote Mode

**Spec Number**: 150

## Setup

1. Review the spec: `specs/150-retire-plain-remote-mode/spec.md` (and SCOPE-149 in
   `specs/Project-Scope/149-handoff-remote.md`)
2. Confirm SPEC-149 has landed: this spec edits the same `main.ts` and `bridge.ts`
3. Review the plan: `plan.md`, tasks: `tasks.md`, tests: `tests.md`

No SQL is waiting: this spec has no DDL, no route and no screen.

## Development

1. Start with T001 (the dependent-scope check); stop and ask if any scope relies on the plain mode
2. Then T002 – T005 (code), T006 – T007 (notice and docs), T008 – T009 (mirrors and acceptance)
3. Fence through `implement` (`[SCOPE 150 / Tnnn]`)
4. Run `npm test` in `wxkanban-agent/`; rebuild so `dist/` matches the source

## Trying it

1. Run `npm run remote` in `wxkanban-agent/`: the project agent starts and binds the company room
2. Leave the old `YAPPCHATT_*` keys in a test repo's `.env`: one notice on the first run, none after, `.env` unchanged
3. Say `GO REMOTE`: nothing happens
