# Test Plan: Remote Auto-Start

**Spec Number**: 145
**Date Generated**: 2026-10-25
**Spec**: [spec.md](spec.md) | **Tasks**: [tasks.md](tasks.md)

---

## Test Strategy

| Layer | Framework | Coverage Target |
|-------|-----------|-----------------|
| Server routes and services | Vitest, services and db stubbed | Every FR-002 – FR-004 acceptance criterion |
| Web panel | Vitest, react-dom/server render + readers | FR-002 switch states |
| Kit bridge | Vitest (wxkanban-agent) | FR-005 ready and refusal lines; FR-007 shutdown |
| Cockpit | Vitest (vscode-extension), child process, fetch and timers stubbed | FR-001, FR-005, FR-006, FR-007 |
| Live | Real project, production server after deploy | US1 – US6 (T012) |

## Cases

| # | Case | FR | Expected |
|---|------|----|----------|
| 1 | ADMIN switches Allow remote on | FR-002 | 200; `project.remote.allowed` audit row naming them |
| 2 | TEAM_MANAGER on the project switches it off | FR-002 | 200; `project.remote.disallowed` row |
| 3 | TEAM_MANAGER on another project, TEAM_MEMBER | FR-002 | 403; nothing changes; no audit row |
| 4 | Same value sent again | FR-002 | 200; no audit row |
| 5 | Room route, project not allowed | FR-003 | 403 `remote_not_allowed`; no room call, no mint; one `project.remote.refused` row |
| 6 | Room route, project allowed | FR-003 | unchanged behaviour |
| 7 | Settings route: no, bad, expired token | FR-004 | 401 |
| 8 | Settings route: valid token | FR-004 | `{ allowRemote, projectName }` |
| 9 | Bridge after the connected post | FR-005 | prints the ready line once, no token in it |
| 10 | Bridge on 409 / 403 / lock | FR-005 | prints `[project-agent] refused <code>` |
| 11 | Bridge on SIGTERM / SIGBREAK / stdin close | FR-007 | disconnect post, lock released, exit within 5 s |
| 12 | Cockpit open: allowed + switch on | FR-001 | starts; Starting → Live on the ready line; one notification |
| 13 | Cockpit open: not allowed / switch off / server down | FR-001 | no start, no pop-up; Off with the reason |
| 14 | Cockpit: ready timeout, early exit, each refusal | FR-005 | Failed with the named cause and next step |
| 15 | Cockpit stop on Windows | FR-007 | graceful signal, then tree kill; no remote-bridge process left |
