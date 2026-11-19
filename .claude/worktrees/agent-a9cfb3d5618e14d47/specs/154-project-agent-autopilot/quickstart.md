# Quickstart: Project Agent Autopilot

**Spec Number**: 154 (implements SCOPE-132 Amendment H)

## Setup

- Review [spec.md](spec.md) (FR-001 – FR-013, SC-37 – SC-41, the three FR-012 release-gate checks),
  [plan.md](plan.md) (phase order), [tasks.md](tasks.md) (T001 – T013) and [tests.md](tests.md)
  (27 cases).
- Note the waiting SQL: T001 declares `companyprojects.autopilotenabled` and
  `projectagentconnections.autopilotrunactive` in `src/db/schema/`, but neither column exists in
  the database yet. Andy applies the reviewed SQL by hand (SCOPE-117 manual-DDL convention) before
  T002 or T009 can be tested end-to-end against a real database. Do not run `drizzle-kit push`.
- Confirm the three FR-012 prerequisites' current status before starting T005 – T009 (they drive
  the pipeline this spec gates on release, not on build): the SPEC-149 `bridge.ts` handoff guard
  fix, SCOPE-102 FR-013 (`ANTHROPIC_API_KEY` stripped from the child session), and SCOPE-132
  Amendment G piece A (the rolling summary T008 reuses).

## Development

- Work tasks in the release order given in [plan.md](plan.md): T001 → T002 → T003 → T004 → T005 →
  T006 → T007 → T008 → T009 → T010 → T011 → T012 → T013.
- Fence every top-level unit `[SCOPE 154 / Tnnn]`, written by the orchestrator (`implement`) only —
  never hand-authored.
- Run `npm run db:drift` after T001's SQL is applied by hand, and record the change in
  `specs/117-production-schema-integrity/schema-change-log.md`.
- Run the relevant Vitest suite per task (see [tests.md](tests.md) for the layer each case belongs
  to); run the full-flow scripted test (case 27 / T013) last, after every other task lands.
- This spec's T005 – T009 touch `wxkanban-agent/apps/remote-bridge`. After any edit there, rebuild
  `wxkanban-agent` so `dist/remote-bridge.cjs` matches source — the Cockpit's project agent runs the
  built bundle, not the TypeScript source directly.

## Trying it

- With "Allow remote" on for a test project, turn the Autopilot switch on via
  `ProjectAgentAccessPanel` (or `PUT /api/projects/:projectId/autopilot`) and confirm the audit row.
- Start a run and confirm the startup list posts from the server `devplan` before any unit starts.
- Skip one scope with known dependents and confirm the cascade list.
- Watch for a 15-minute heartbeat; send `STATUS` and confirm it returns the same content early.
- Seed one unit whose test or migration targets production and confirm it parks untouched with a
  named reason, while the run continues with the next independent unit.
- Do not turn the switch on in any shared or production environment until T012 confirms all three
  FR-012 prerequisites are verifiably built.
