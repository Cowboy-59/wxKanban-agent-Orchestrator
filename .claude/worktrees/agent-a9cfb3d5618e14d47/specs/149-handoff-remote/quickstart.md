# Quickstart: Handoff Remote

**Spec Number**: 149

## Setup

1. Review the spec: `specs/149-handoff-remote/spec.md` (and SCOPE-149 in
   `specs/Project-Scope/149-handoff-remote.md`)
2. Review the plan: `plan.md`
3. Review tasks: `tasks.md`
4. Review tests: `tests.md`

No SQL is waiting: this spec has no DDL, no route and no screen.

## Development

1. Start with T001 (verify the preflight sources); then the writer (T002 – T004), then the agent (T005 – T008)
2. Fence new code `[SCOPE 149 / Tnnn]` through `implement`
3. Run `npm test` in `wxkanban-agent/`
4. After bridge edits, rebuild `wxkanban-agent` so `dist/` matches the source

## Trying it

1. Turn Allow remote on for the project and let the Cockpit start the project agent
2. In the Claude Code session, say `HANDOFF REMOTE`
3. The session reports the file path and the masked count; within 30 seconds the room shows a `[HANDOFF]`
   post from the agent, then its reading of where the work stands and one question
