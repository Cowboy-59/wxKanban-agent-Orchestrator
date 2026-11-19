# Spec 151: Project Agent Connections

Implements SCOPE-132

**Implements**: SCOPE-132 Amendment D (`specs/Project-Scope/132-kain-autonomous-driver.md`, FR-058 – FR-063).
Fences for this spec are `[SCOPE 151 / Tnnn]`.
**Depends on**: SPEC-134 (project agent, room route, `agent-grant:` tokens), SPEC-145 (Allow remote),
SPEC-148 (the bridge's token holder), SPEC-150 (project-agent mode is the only bridge mode).
**Source**: Andy, 2026-10-28, answering SpokAI's `ChangeWxKanban.md`.
**Created**: 2026-10-28

## Overview

KAIN is Andy's voice and memory. From a phone or a laptop he asks KAIN about any project, and KAIN relays
his commands and answers to that project's agent through the project's YappChatt room. KAIN therefore needs
to know, with no project folder on hand, which project agents are connected now, from which machine and
repo, and what each is doing. This spec adds one table that records each connection, three project-agent
routes that open, refresh and close a record, the bridge code that calls them, and one hosted MCP tool that
lets KAIN read them.

## Business Problem

Nothing records whether a project agent is running. `projectrooms` says a room was bound once; it does not
say anyone is in it, on which machine, or whether it is busy. KAIN can only guess by posting and waiting.
Two machines can also run the same project's agent into one room at once, and nothing stops them.

## User Scenarios & Testing

**US1 — Andy asks KAIN which agents are up.** KAIN calls `project.list_agent_connections` with its KAIN token
and gets every allow-remote project of that company, each marked live or not, with machine, repo, state and
last-seen time.
- Acceptance: a started agent shows `live: true` within one heartbeat; a stopped agent shows
  `live: false`, `endReason: stopped`; a killed agent shows `live: false` 3 minutes after its last heartbeat.

**US2 — The same project on a second machine.** A developer starts the project agent on a second machine
while the first is live.
- Acceptance: the second agent prints `[project-agent] refused agent_already_connected`, names the first
  machine, and exits; the first is untouched. If the first has not been seen for 3 minutes, the second starts
  and the first row is closed `stale`.

**US3 — Restart after a crash on the same machine.** The agent is killed and started again within 3 minutes.
- Acceptance: it starts; the earlier row is closed `replaced`.

**US4 — An older app, or no server.** The agent starts against an app without the routes, or with the server
unreachable.
- Acceptance: the remote works as before; one warning line; no record.

**US5 — Tenant isolation.** A KAIN token of company A, and a plain project token.
- Acceptance: the KAIN token never returns a company-B project; the plain token returns its own project only.

## Functional Requirements

FR-058 – FR-063 as written in SCOPE-132 Amendment D. Summary:

| FR | What |
|---|---|
| FR-058 | `projectagentconnections` table, applied by hand; live = open and seen within 3 minutes; one open row per project |
| FR-059 | `POST /api/project-agent/connections` opens the record; closes stale and same-machine rows; 409 `agent_already_connected` for another live machine; 403 `remote_not_allowed`; any other failure lets the agent start without a record |
| FR-060 | `POST /api/project-agent/connections/:id/heartbeat` every 60 s with `{ state }`; 404 for another project's id; 410 `connection_closed` makes the agent reopen once |
| FR-061 | `POST /api/project-agent/connections/:id/close` on shutdown, inside the 5 s bound; a crash is closed `stale` later |
| FR-062 | `project.list_agent_connections`: a KAIN token sees its company's allow-remote projects, any other token its own project; never another company |
| FR-063 | `docs/kain-contract.md` documents it |

## Data Requirements

`projectagentconnections` — see `sql/0001-projectagentconnections.sql` (12 columns, 3 checks, unique open
row per project). Declared in `src/db/schema/projectagentconnection.ts` and exported from the schema index
only after the owner has applied the SQL and the column-level verification passes. The MCP server reads it
with explicit SQL (its schema mirror is partial), so it needs no declaration there.

## Success Metrics

- SC-1: 0 project folders read by KAIN to learn which agents are connected.
- SC-2: an agent's live/not-live state is correct within 60 seconds of start or clean stop, and within
  3 minutes of a crash.
- SC-3: 0 projects with two open connection rows.
- SC-4: 0 cross-company rows returned by `project.list_agent_connections` (US5 test).

## Out of Scope

As SCOPE-132 Amendment D: the per-project KAIN tick, whose-decision recording for relayed answers, and
SpokAI's room protocol — Amendment E.
