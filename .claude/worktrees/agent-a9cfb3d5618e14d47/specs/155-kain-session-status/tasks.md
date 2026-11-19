# Task Breakdown: KAIN Session Status

**Feature**: KAIN Session Status
**Spec**: 155 (implements SCOPE-132 Amendment G, piece A)
**Date Generated**: 2026-11-07
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

---

## Tasks

| # | Task | Priority | Status |
|---|------|----------|--------|
| 1 | T001 Declare the five `projectagentconnections` columns | high | done — all 5 columns applied and verified (schema-change-log 0079, `npm run db:drift` exit 0) |
| 2 | T002 Per-turn session-feed hook (FR-001) | high | done — `_wxAI/remote/session-feed-hook.mjs` + `session-feed-worker.mjs`, masks via redact.cjs, 200-line cap |
| 3 | T003 Agent-side rolling summary maintenance (FR-002) | high | done — `SessionSummaryTracker` in `session-summary.ts`, haiku-tier, unit-tested (see T008) |
| 4 | T004 Wire the summary onto the existing heartbeat (FR-003) | high | partial — server done, bridge blocked (impact gate, needs Andy) |
| 5 | T005 `GET /api/agent/projects/:projectId/status` route (FR-004) | high | done — route in `agentConnect.ts`, reach+audit, 32/32 tests pass (`agentConnect.route.test.ts`, `projectAgentConnectionStatus.test.ts`) |
| 6 | T006 MCP `project.get_session_status` tool (FR-004) | high | done — found already written uncommitted (`mcp-server/src/tools/session-status.ts`), wired into server.ts dispatcher+registry, typecheck clean |
| 7 | T007 Cockpit sharing setting and status bar text (FR-005) | medium | done — `wxkanban.projectAgent.shareStatus` setting, `shareStatusEnabled()`, status bar text updated, 18/18 tests pass (`remoteStartup.test.ts`) |
| 8 | T008 Tests: hook budget, masking, clear-on-close, reach and audit | high | partial — T003 unit-tested (9/9, `session-summary.test.ts`), T005 reach/audit covered (32/32); hook p95-timing, end-to-end masking, and clear-on-close NOT built — needs Andy's call on scope (see Task Details) |
| 9 | T009 Docs and help | medium | todo — `docs/kain-contract.md` and Agent Access help page entry not started |

## Task Details

### T001 — Declare the five `projectagentconnections` columns
Apply `sessionsummary varchar(1500)`, `lastentry varchar(500)`, `blockers jsonb`,
`sharing boolean NOT NULL DEFAULT false`, and `summaryat timestamptz` by hand under SCOPE-117
(verify via `npm run db:drift`), record in `schema-change-log.md`, then declare in
`src/db/schema/projectagentconnection.ts` AND the `mcp-server` schema mirror. FR-003.

### T002 — Per-turn session-feed hook
Kit hook appending one masked line (time + last assistant message, capped 500 chars, via
`redactSecrets` from `apps/remote-bridge/src/handoff-writer.ts`) to `.wxai/session-feed.jsonl` at
the end of each turn. Excludes `WXAI_REMOTE=1`, sharing-off, and no-agent-running. 200-line cap.
Ships via `core/orchestrator/routing-hooks-sync.ts`. FR-001.

### T003 — Agent-side rolling summary maintenance
On new session-feed lines, update a rolling summary (≤1500 chars), last entry (≤500 chars), and
open-blocker titles using the cheap SPEC-143 model tier. Second masking pass before upload. No-op
when there are no new lines. FR-002.

### T004 — Wire the summary onto the existing heartbeat
Extend `POST /api/project-agent/connections/:id/heartbeat` to accept
`{ summary, lastEntry, blockers, sharing }`, overwrite-only onto the connection record, no history
kept. Clear `sessionsummary`/`lastentry`/`blockers` on close, stale lapse, or `sharing: false`.
Backward compatible with servers that ignore the fields. FR-003.

### T005 — `GET /api/agent/projects/:projectId/status` route
Device-token authenticated route returning summary, last entry, blockers, state, last-seen,
live/stale/gone, `director: null`, and sharing. Reach-checked against `agentReach` (404
`not_granted` when out of reach). Writes one `agent.status.read` audit row per call naming person
and device. FR-004.

### T006 — MCP `project.get_session_status` tool
New MCP tool `{ projectId }` returning the identical shape as the REST status route (T005), sharing
the same service logic rather than re-implementing reach-checking or audit logic. FR-004.

### T007 — Cockpit sharing setting and status bar text
Add `wxkanban.projectAgent.shareStatus` Cockpit setting (per-workspace, default on). Update the
existing remote status bar item to read "Remote: live · sharing status" while sharing and
"Remote: live" when off. FR-005.

### T008 — Tests: hook budget, masking, clear-on-close, reach and audit
Automated tests for: hook p95 runtime <200ms over 100 simulated turns with 100% exit 0 (SC-29); 0
unmasked secrets across 10 seeded secret patterns in `session-feed.jsonl`, the connection record,
and status responses (SC-28); columns clear within one heartbeat of close/stale/sharing-off; 404
`not_granted` when out of reach; one audit row per status read; a HANDOFF REMOTE and SCOPE-151
heartbeat cycle unaffected by the new unused columns (FR-006).

### T009 — Docs and help
Update `docs/kain-contract.md` with the new status-read shape and route. Add the sharing toggle to
the Agent Access help page (Subscription-Aware Help, SCOPE-084). No gate flag to flip on completion:
`rollingSummaryBuilt` was removed from `src/server/services/AutopilotReleaseGate.ts` on 2026-11-07
(SCOPE-154) — this spec's Autopilot dependency is moot.
