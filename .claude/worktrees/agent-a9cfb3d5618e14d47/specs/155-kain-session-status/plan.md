# Plan: KAIN Session Status

**Spec Number**: 155 (implements SCOPE-132 Amendment G, piece A)
**Date**: 2026-11-07

## Implementation Plan

### Phase 1 — Schema (T001)
Declare the five new `projectagentconnections` columns in `src/db/schema/` and the `mcp-server`
schema mirror. Produce the reviewed SQL for Andy to apply by hand (SCOPE-117); do not run
`drizzle-kit push`. Confirm with `npm run db:drift` after, and record the change in
`specs/117-production-schema-integrity/schema-change-log.md` before any code declares the columns.

### Phase 2 — Per-turn hook and rolling summary (T002, T003)
Build the per-turn kit hook that appends one masked line to `.wxai/session-feed.jsonl`, respecting
the `WXAI_REMOTE`/sharing-off/no-agent exclusions and the 200-line cap, shipped via the existing
hook sync. Build the agent-side rolling-summary maintenance on the cheap SPEC-143 model tier, with
a second masking pass before anything uploads.

### Phase 3 — Heartbeat and reads (T004, T005, T006)
Wire the summary fields onto the existing heartbeat, overwrite-only, with clearing on
close/stale/sharing-off. Build the new `GET /api/agent/projects/:projectId/status` route and the
matching `project.get_session_status` MCP tool, both reach-checked and audited.

### Phase 4 — Local control and visibility (T007)
Add the Cockpit `shareStatus` setting and update the remote status bar item text.

### Phase 5 — Tests and docs (T008, T009)
Cover the hook's runtime budget, the masking guarantee, the clear-on-close behavior, the reach
check, and the audit row — plus a regression check that an unmodified HANDOFF REMOTE / SCOPE-151
heartbeat cycle is unaffected. Update `docs/kain-contract.md` and the Agent Access help entry.

## Release order

1. T001 (DDL handed off, not applied by this plan — Andy applies by hand per SCOPE-117).
2. T002 → T003 (hook, then the summarizer it feeds).
3. T004 → T005 → T006 (heartbeat extension, then both read surfaces, which depend on it).
4. T007 (Cockpit setting and status bar — independently testable once T004 exists).
5. T008 → T009 (tests, then docs/help, as the closing pass).

This spec carries no release gate of its own (unlike SPEC-154). It also no longer unblocks SPEC-154's
gate: the `rollingSummaryBuilt` prerequisite that tied the two together was removed from
`AutopilotReleaseGate.ts` on 2026-11-07 (SCOPE-154, with Andy) — the heartbeat turned out to derive
its content from `AutopilotRunState`, not from this spec's mechanism. This spec ships on its own
schedule now, independent of SPEC-154.

## Known Issues

- **Five columns await manual DDL.** None of `sessionsummary`, `lastentry`, `blockers`, `sharing`,
  `summaryat` exist in the database yet. Andy applies the reviewed SQL by hand and records it in
  `specs/117-production-schema-integrity/schema-change-log.md`; `npm run db:drift` confirms after.
  `drizzle-kit push` is prohibited against this database (production).
- **Stale bridge `dist/` risk.** T002 – T004 touch `wxkanban-agent/apps/remote-bridge`; rebuild
  `wxkanban-agent` after any bridge source edit so the Cockpit's project agent runs the updated
  bundle, not stale `dist/`.
- **MCP tests hit the production database.** Two known-false failures are expected in the existing
  suite unrelated to this spec; do not treat them as regressions introduced here.
- **Downstream flag removed, not just descoped from this plan.** `rollingSummaryBuilt` no longer
  exists in `src/server/services/AutopilotReleaseGate.ts` (removed 2026-11-07) — there is nothing
  left for this spec to unblock there.
