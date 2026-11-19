# Plan: Project Agent Autopilot

**Spec Number**: 154 (implements SCOPE-132 Amendment H)
**Date**: 2026-11-07

## Implementation Plan

### Phase 1 — Switch and schema (T001, T002)
Add `companyprojects.autopilotenabled` and `projectagentconnections.autopilotrunactive` to
`src/db/schema/`, hand off the DDL for Andy to apply (SCOPE-117 manual process), then build the
`PUT /api/projects/:projectId/autopilot` route gated on "Allow remote" and the existing
ADMIN/TEAM_MANAGER role check, with its audit row.

### Phase 2 — Startup list and skip cascade (T003, T004)
Read the server `devplan` (SCOPE-081) filtered by `scope_stage` (SCOPE-123) for the startup list;
post it to the room and K.A.I.N. Build the skip cascade on top of the existing
`_wxAI/impact/scope-impact.mjs`, writing skip/partial choices into the run-state file.

### Phase 3 — The unattended pipeline (T005, T006, T007)
Drive `validateScope` → `createSpecs` → `implement` per scope, one fresh session per unit
(reusing G.O.D.'s SCOPE-136 FR-014/FR-015 drive), one worktree per scope, local commit only. Wire
the existing push/production gate and one-agent-per-tree lock so a production-pointed unit parks
instead of running. A failed or timed-out unit parks with a short line; dependents marked waiting;
the run continues to the next independent unit.

### Phase 4 — Heartbeat and missed-heartbeat alert (T008, T009)
Reuse Amendment G piece A's masked rolling summary for the 15-minute post (full / heartbeat /
paused), `STATUS` on demand, the finish-of-list summary, and the 18:00 summary. Derive the
missed-heartbeat alert server-side from the SCOPE-151 connection record plus the new
`autopilotrunactive` field; post the alert and the "back" line.

### Phase 5 — Billing and help (T010, T011)
Tag every run/unit through the existing `agentruns` mechanism (SPEC-005 FR-007), scope+task, no
person attribution. Add the one help catalog entry (SCOPE-084 surface).

### Phase 6 — Release gate and contract (T012, T013)
Verify the three FR-012 prerequisites are built, not just specified (SPEC-149 guard fix, SCOPE-102
FR-013, SCOPE-132 Amendment G piece A); wire a release gate that keeps the switch unexposed until
all three pass. Extend `docs/kain-contract.md` with the new line shapes and run the full-flow
contract test (T013).

## Release order

1. T001 (DDL handed off, not applied by this plan — Andy applies by hand per SCOPE-117).
2. T002 → T003 → T004 (switch, startup list, skip cascade — each independently testable).
3. T005 → T006 → T007 (pipeline, push/production reuse, failed-unit parking — the core driver).
4. T008 → T009 (heartbeat, missed-heartbeat).
5. T010 → T011 (billing, help).
6. T012 (release gate) before any environment turns the switch on; T013 (contract + full-flow test)
   last, as it exercises every prior phase together.

Autopilot must not be exposed in any environment — including a demo — until T012 confirms the
three FR-012 prerequisites are verifiably complete.

## Known Issues

- **Two columns await manual DDL.** `companyprojects.autopilotenabled` and
  `projectagentconnections.autopilotrunactive` are declared in `src/db/schema/` by T001 but not
  applied; `drizzle-kit push` is prohibited against this database (production). Andy applies the
  reviewed SQL by hand and records it in
  `specs/117-production-schema-integrity/schema-change-log.md`; `npm run db:drift` confirms after.
- **FR-012 release gate is unresolved as of spec time.** Last checked 2026-11-07: SCOPE-102 FR-013
  (`ANTHROPIC_API_KEY` stripped from the child session) is specified but unbuilt
  (`remote-bridge/src/session.ts:143`, `triage-run.ts:223`); the SPEC-149 guard-fix and SCOPE-132
  Amendment G piece A statuses need reconfirming before T012 can pass.
- **Stale bridge `dist/` risk.** This spec's pipeline and heartbeat work touches
  `wxkanban-agent/apps/remote-bridge`; per house convention, rebuild `wxkanban-agent` after any
  bridge source edit so the Cockpit's project agent runs the updated bundle, not stale `dist/`.
- **MCP tests hit the production database.** Two known-false failures are expected in the existing
  suite unrelated to this spec; do not treat them as regressions introduced here.
- **Time & Billing plan-gate conflict (row 16 of the source brainstorm) is explicitly out of scope**
  for this spec — a separate fix, parked with the owner.
