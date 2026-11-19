# Quickstart: KAIN Session Status

**Spec Number**: 155 (implements SCOPE-132 Amendment G, piece A)

## Setup

- Review [spec.md](spec.md) (FR-001 – FR-006, SC-27 – SC-29, plus the new clear-on-close metric),
  [plan.md](plan.md) (phase order), [tasks.md](tasks.md) (T001 – T009) and [tests.md](tests.md)
  (25 cases).
- Note the waiting SQL: T001 declares five new columns on `projectagentconnections` in
  `src/db/schema/` and the `mcp-server` mirror, but none exist in the database yet. Andy applies
  the reviewed SQL by hand (SCOPE-117 manual-DDL convention) before T004 – T006 can be tested
  end-to-end against a real database. Do not run `drizzle-kit push`.
- SPEC-154 (Project Agent Autopilot) no longer depends on this spec for its release gate: the
  `rollingSummaryBuilt` prerequisite was removed from `AutopilotReleaseGate.ts` on 2026-11-07 (the
  heartbeat turned out to derive its content from `AutopilotRunState`, not this mechanism). This
  spec may still ship on its own schedule; there is no gate flag to flip for it.

## Development

- Work tasks in the release order given in [plan.md](plan.md): T001 → T002 → T003 → T004 → T005 →
  T006 → T007 → T008 → T009.
- Fence every top-level unit `[SCOPE 155 / Tnnn]`, written by the orchestrator (`implement`) only —
  never hand-authored.
- Run `npm run db:drift` after T001's SQL is applied by hand, and record the change in
  `specs/117-production-schema-integrity/schema-change-log.md`.
- Run the relevant Vitest suite per task (see [tests.md](tests.md) for the layer each case belongs
  to); run the regression case (23) and the full secret-sweep case (25) last, after every other
  task lands.
- T002 – T004 touch `wxkanban-agent/apps/remote-bridge`. After any edit there, rebuild
  `wxkanban-agent` so `dist/remote-bridge.cjs` matches source — the Cockpit's project agent runs
  the built bundle, not the TypeScript source directly.
- Reuse `redactSecrets` (`apps/remote-bridge/src/handoff-writer.ts`) for both masking passes
  (FR-001 and FR-002) rather than writing a second masking implementation.

## Trying it

- With a project agent connection live and the Cockpit `shareStatus` setting on, finish a turn in
  the developer's session and confirm one masked line lands in `.wxai/session-feed.jsonl`.
- Call `GET /api/agent/projects/:projectId/status` (or the MCP `project.get_session_status` tool)
  with a device token in reach of the project, and confirm the summary, last entry, blockers,
  state, and `live`/`stale`/`gone` come back, with one new `agent.status.read` audit row.
- Turn `shareStatus` off, send a heartbeat, and confirm the status bar reads "Remote: live" and the
  connection record's summary columns clear.
- Seed a turn containing a fake secret pattern and confirm it never appears unmasked in the feed
  file, the connection record, or the status response.
- No gate flag to report here — `rollingSummaryBuilt` was removed from `AutopilotReleaseGate.ts`
  (see Setup, above).
