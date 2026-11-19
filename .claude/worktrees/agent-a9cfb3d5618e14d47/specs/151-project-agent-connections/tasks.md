# Task Breakdown: Project Agent Connections

**Feature**: Project Agent Connections
**Spec**: 151
**Date Generated**: 2026-10-28
**Spec**: [spec.md](spec.md)

---

## Tasks

| # | Task | Priority | Status |
|---|------|----------|--------|
| 1 | T001 projectagentconnections SQL for the owner to apply (FR-058) | critical | done |
| 2 | T002 Declare the table after it exists; record it in the schema change log (FR-058) | critical | done |
| 3 | T003 Connection service and the open / heartbeat / close routes (FR-059 - FR-061) | critical | done |
| 4 | T004 The project agent opens, refreshes and closes its record (FR-059 - FR-061) | high | done |
| 5 | T005 project.list_agent_connections for KAIN (FR-062) | high | done |
| 6 | T006 KAIN contract and the reply to SpokAI (FR-063) | medium | in progress |
| 7 | T007 Acceptance: US1 - US5 against the real routes and the hosted MCP | high | in progress |

## Task Details

### T001 — projectagentconnections SQL for the owner to apply (FR-058)
`sql/0001-projectagentconnections.sql`: CREATE TABLE IF NOT EXISTS, unique open row per project, history
index, GRANT to `wxkanban_app`, and a column-level verification query. Andy applies it by hand.

### T002 — Declare the table after it exists; record it in the schema change log (FR-058)
`src/db/schema/projectagentconnection.ts`, exported from `src/db/schema/index.ts` only after T001's
verification passes. Entry in `specs/117-production-schema-integrity/schema-change-log.md`; `npm run db:drift`.

### T003 — Connection service and the open / heartbeat / close routes (FR-059 - FR-061)
`ProjectAgentConnectionService` (store interface + Drizzle store, transaction for open), and three routes in
`src/server/routes/projectAgent.ts`, kit-token authenticated, project and room from the token. Unit tests on
the service rules with an in-memory store.

### T004 — The project agent opens, refreshes and closes its record (FR-059 - FR-061)
`apps/remote-bridge/src/connection-record.ts`; `main.ts` opens after the room binds (409 refuses the start),
heartbeats every 60 s with the bridge's state, closes on shutdown. Unit tests with a fake fetch.

### T005 — project.list_agent_connections for KAIN (FR-062)
Tool definition, handler, input schema, PERMISSION_MATRIX entry, project-scoped. KAIN token
(`agent-grant:`) = company-wide over allow-remote projects; any other token = own project. Tests for both and
for cross-company isolation.

### T006 — KAIN contract and the reply to SpokAI (FR-063)
`docs/kain-contract.md` section; a reply document answering `ChangeWxKanban.md`.

### T007 — Acceptance: US1 - US5 against the real routes and the hosted MCP
After deploy: start, stop, kill, second machine, older app; the MCP tool from a KAIN token and a plain token.

## Evidence

**2026-10-28, local, against production data.**
- T001: applied by Andy; verified 12 columns, 3 checks, 3 indexes, 0 rows. The app role holds DELETE as well as INSERT, SELECT, UPDATE, from the schema's default privileges (logged in the schema change log).
- T002: exported from `src/db/schema/index.ts`; `npm run db:drift` exit 0.
- T007 (local half): real app on :5199 with the project's kit token, 13/13 — 401 no token, 400 project in body, 201 open, 409 `agent_already_connected` naming the other machine, 200 heartbeat, 400 unknown state, 201 re-open on the same machine (case-insensitive) with the old record `replaced`, 410 on the replaced record, 404 unknown id, 200 close, 410 close again, 201 second machine after the close. The real `project.list_agent_connections` handler against the same database: a KAIN token listed the company's 2 allow-remote projects with rooms and all 3 test connections in history; a plain token listed its own project only; 1 distinct company. Test rows deleted afterwards (3, by id).
- Remaining for T007: the hosted MCP after deploy, and a real project agent start/stop/kill.
