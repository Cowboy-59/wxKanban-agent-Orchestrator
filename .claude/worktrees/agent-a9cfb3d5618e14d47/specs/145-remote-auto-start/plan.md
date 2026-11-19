# Plan: Remote Auto-Start

**Spec Number**: 145 (implements SCOPE-132 Amendment B)
**Date**: 2026-10-25

## Implementation Plan

Three areas, built in this order so each layer exists before the one that relies on it.

### Phase 1: Server (T001 – T004)

- T001 declares `companyprojects.allowremote`. The column is already in production, so this is safe
  to ship on its own.
- T002 the remote-access route and `allowRemote` in agent-access; T003 the 403 on the room route;
  T004 the settings route for the Cockpit.
- Tests: route tests with services stubbed, plus a service test proving a refused start touches
  nothing.

### Phase 2: Web app and kit (T005, T006)

- T005 the "Allow remote" switch in `ProjectAgentAccessPanel` (shadcn `Switch`).
- T006 the bridge's ready line, its fixed refusal lines, and a graceful shutdown that posts the
  disconnect notice and releases the worktree lock.

### Phase 3: Cockpit (T007 – T010)

- T007 start on open where allowed; T008 the ready watch and named failures; T009 the status bar
  item; T010 a stop that ends the whole process tree.
- Tests with the child process, fetch and timers stubbed; a live Windows check for T010.

### Phase 4: Docs and acceptance (T011, T012)

- T011 the KAIN contract, help and Manual.
- T012 US1 – US6 live, then the client-first release.

## Release order

The Cockpit and the kit go out **before** the server push. A server that answers 403
`remote_not_allowed` to an old Cockpit shows the developer an unexplained "the project agent
stopped". Every project starts with "Allow remote" off, so the server push also stops every
project-agent start until an ADMIN or the project's TEAM_MANAGER turns it on. Turn it on for the
projects that use the remote (wxKanban Development first) right after deploying.

## Known Issues

- `child.kill('SIGTERM')` on Windows ends only the direct child; the ts-node bridge grandchild keeps
  running (seen 2026-10-25). T010 fixes this.
- Plain GO REMOTE is not covered: it binds the fixed `.env` room and never calls the server.
