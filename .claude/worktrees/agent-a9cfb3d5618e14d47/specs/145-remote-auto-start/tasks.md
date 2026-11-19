# Task Breakdown: Remote Auto-Start

**Feature**: Remote Auto-Start
**Spec**: 145
**Date Generated**: 2026-10-25
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

---

## Tasks

| # | Task | Priority | Status |
|---|------|----------|--------|
| 1 | T001 Declare companyprojects.allowremote in src/db/schema (FR-002) | high | done |
| 2 | T002 PUT /api/projects/:projectId/remote-access, and allowRemote in GET agent-access (FR-002) | high | done |
| 3 | T003 POST /api/project-agent/room refuses 403 remote_not_allowed (FR-003) | critical | done |
| 4 | T004 GET /api/project-agent/settings on the kit token (FR-004) | high | done |
| 5 | T005 Allow remote switch in ProjectAgentAccessPanel (FR-002) | medium | done |
| 6 | T006 Bridge: ready line after the connected post, and a clean shutdown (FR-005, FR-007) | high | done |
| 7 | T007 Cockpit: start on open where the project allows it (FR-001, FR-004) | high | done |
| 8 | T008 Cockpit: watch for the ready line and name each failure (FR-005) | high | done |
| 9 | T009 Cockpit: the remote status bar item (FR-006) | medium | done |
| 10 | T010 Cockpit: stop ends the whole process tree, Windows included (FR-007) | high | done |
| 11 | T011 Docs: KAIN contract, help and the Manual for Allow remote and auto-start | medium | todo |
| 12 | T012 Acceptance: US1-US6 live, and the client-first release | high | todo |

## Task Details

### T001 — T001 Declare companyprojects.allowremote in src/db/schema (FR-002)

The column exists in production (boolean NOT NULL DEFAULT false, verified 2026-10-25), so the declaration ships safely. Declare it in src/db/schema/companyproject.ts with a [SCOPE 145 / T001] fence. Check the mcp-server schema mirror: declare it there too only if that mirror declares companyprojects and something there reads it.

### T002 — T002 PUT /api/projects/:projectId/remote-access, and allowRemote in GET agent-access (FR-002)

In src/server/routes/agentGrants.ts beside the agent-access routes. Role guard: a company ADMIN, or a TEAM_MANAGER on that project (the SPEC-144 Room Approver rule); the project must belong to the caller's company. Body { allowRemote: boolean }, strict. One companyauditlogs row per change: project.remote.allowed or project.remote.disallowed with actor, project, old and new value; a no-op change writes nothing. GET /:projectId/agent-access also returns allowRemote. Route tests: ADMIN ok, project TEAM_MANAGER ok, other-project TEAM_MANAGER 403, TEAM_MEMBER 403, other company 403/404, audit row content.

### T003 — T003 POST /api/project-agent/room refuses 403 remote_not_allowed (FR-003)

In AgentConnectService.projectAgentRoom, after the token checks and the project lookup and BEFORE resolveRoom (no YappChatt call, no room change, no MCP or room token mint): when companyprojects.allowremote is false, throw 403 remote_not_allowed { message } and write one project.remote.refused audit row. KAIN's connect() path is unchanged. Tests: refused call touches nothing (ensureCompanyRoom and the token mint never called), allowed call unchanged.

### T004 — T004 GET /api/project-agent/settings on the kit token (FR-004)

In src/server/routes/projectAgent.ts: Bearer kit token via apiTokenService.validateToken, expiry checked like /approver; returns { allowRemote, projectName } for the token's project. 401 missing-token / invalid-token / token_expired. Route tests.

### T005 — T005 Allow remote switch in ProjectAgentAccessPanel (FR-002)

src/client/components/Settings/ProjectAgentAccessPanel.tsx: a shadcn Switch labelled Allow remote with a one-line explanation ("Lets this project's agent start the remote automatically when someone opens it in VS Code"). Enabled for a company ADMIN or this project's TEAM_MANAGER, read-only otherwise; reads allowRemote from GET agent-access, writes through PUT remote-access; shows the 403 message on refusal. Use the shadcn-ui MCP per _wxAI/rules/shadcn.md. Panel tests.

### T006 — T006 Bridge: ready line after the connected post, and a clean shutdown (FR-005, FR-007)

wxkanban-agent/apps/remote-bridge: after the 'Claude on project X is connected' post succeeds, print one fixed machine-readable line to stdout (e.g. '[bridge] ready project=<name>'), never a token. On SIGINT, SIGTERM, SIGBREAK (Windows) and stdin close: post the disconnect notice, release the worktree lock, exit within 5 seconds. Room-route refusals (409 no_company_account, 403 remote_not_allowed) and the worktree-lock refusal print a fixed '[project-agent] refused <code>' line the Cockpit can match. Kit tests.

### T007 — T007 Cockpit: start on open where the project allows it (FR-001, FR-004)

vscode-extension/src/extension.ts + services/projectAgent.ts: on activation, resolve the project token (as chatPanel does), call GET /api/project-agent/settings, and start the project agent only when allowRemote is true and wxkanban.projectAgent.autoStart is not false. Change the setting's default to true and its description to 'start automatically where the project allows it'; add wxkanban.projectAgent.readyTimeoutSeconds (default 90). Not allowed / switched off / server unreachable: no start, no pop-up, status bar reason (T009). Tests with the fetch and spawn stubbed.

### T008 — T008 Cockpit: watch for the ready line and name each failure (FR-005)

In ProjectAgentProcess: parse the agent's stdout lines; on the ready line set Live and show one 'Remote is live' notification; on a '[project-agent] refused <code>' line, an early exit, or the ready timeout, set Failed and show the named cause and next step (no_company_account, remote_not_allowed, worktree lock, unreachable server). Never echo a token from the output. Tests with a fake child process.

### T009 — T009 Cockpit: the remote status bar item (FR-006)

One status bar item: Off (not allowed | switched off), Starting, Live, Failed, Stopped; clicking opens the 'wxKanban Project Agent' output. Live clears when the agent exits. Tests for each transition.

### T010 — T010 Cockpit: stop ends the whole process tree, Windows included (FR-007)

ProjectAgentProcess.stop() and dispose(): send the graceful signal first (T006 posts the disconnect notice), then after a grace period end the whole tree (on Windows taskkill /T /F on the child pid; elsewhere kill the process group). Found 2026-10-25: child.kill('SIGTERM') left the ts-node bridge grandchild running with the worktree lock held. Tests with the process tree stubbed; a live check on Windows that no remote-bridge node process remains.

### T011 — T011 Docs: KAIN contract, help and the Manual for Allow remote and auto-start

docs/kain-contract.md (403 remote_not_allowed on the project-agent room route), the help section for the project agent / remote (docs-workspace/sections), and the Manual: what Allow remote does, who can change it, what the status bar states mean, and how to opt out.

### T012 — T012 Acceptance: US1-US6 live, and the client-first release

Run US1-US6 against a real project: allow remote as ADMIN and as the project's TEAM_MANAGER (TEAM_MEMBER refused), open VS Code and reach Live with no command, a not-allowed project starts nothing and a manual start gets 403 with nothing minted, the missing-account message, the opt-out, and a stop that leaves no process and posts the disconnect notice. Release order: Cockpit + kit before the server push. Record results in acceptance.md.
