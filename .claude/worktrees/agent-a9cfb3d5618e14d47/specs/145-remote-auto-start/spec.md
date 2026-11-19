# Spec 145: Remote Auto-Start

**Implements**: SCOPE-132 Amendment B (`specs/Project-Scope/132-kain-autonomous-driver.md`, FR-034
amended, FR-036 – FR-041). Fences for this spec are `[SCOPE 145 / Tnnn]`.
**Depends on**: SPEC-134 (the project agent and `POST /api/project-agent/room`), SPEC-144 (the
company-owned project room and the Room Approver rule).
**Created**: 2026-10-25

## Overview

Opening a wxKanban project in VS Code should bring its remote up by itself, but only where the
company has said remote is allowed. In `--project-agent` mode the project agent and the Remote
Session Bridge are one process, bound to the company-owned room (SPEC-144), so starting the agent
*is* starting the remote. This spec adds a per-project "Allow remote" setting that the server
enforces on every start, a Cockpit that starts the agent on open where it is allowed and reports
when the remote is actually live, and a stop that leaves no process behind.

## Business Problem

Today the remote has to be started by hand: the developer types GO REMOTE or runs Start Project
Agent every time they open a project. The Cockpit can auto-start the agent, but only behind a
per-developer setting that is off by default, with no say for the company, and nothing tells the
developer whether the remote actually came up — a failure shows only as a stopped process in an
output channel. Any holder of the project's kit token can start the agent, whether or not the
company wants remote access on that project. And stopping it from the Cockpit on Windows leaves the
bridge running: on 2026-10-25 a stopped agent's bridge process kept the worktree lock and never
posted its disconnect notice.

## Actors

- Primary: Developer who opens a wxKanban project in VS Code and expects its remote to be ready
- Secondary: Company ADMIN or the project's TEAM_MANAGER, who decides whether remote is allowed; KAIN, the supervising agent that meets the project agent in the room; the wxKanban server, which enforces the setting

## Success Metrics

- **SC-10** — On a project that allows remote, opening it in VS Code reaches **Remote is live** with **0** commands typed, within the ready timeout (default 90 seconds).
- **SC-11** — **0** project-agent rooms bound, retired or minted for a project with "Allow remote" off; 100% of those starts answer 403 `remote_not_allowed` with one audit row.
- **SC-12** — 100% of "Allow remote" changes write one audit row naming the actor; **0** changes by anyone other than a company ADMIN or that project's TEAM_MANAGER.
- **SC-13** — **0** bridge processes left running after a Cockpit stop, on Windows included.

## Scope Boundary

- `companyprojects.allowremote` declared in `src/db/schema` (the column was applied by hand and verified 2026-10-25).
- `PUT /api/projects/:projectId/remote-access` (role-guarded, audited) and `allowRemote` in `GET /api/projects/:projectId/agent-access`.
- `POST /api/project-agent/room` refusing 403 `remote_not_allowed` before any YappChatt call.
- `GET /api/project-agent/settings` for the Cockpit, on the kit token.
- The "Allow remote" switch in `src/client/components/Settings/ProjectAgentAccessPanel.tsx`.
- The bridge's machine-readable ready line, and a clean shutdown that posts its disconnect notice.
- The Cockpit: start on open where allowed, the ready watch with named failures, the remote status bar item, the settings, and a stop that ends the whole process tree.

## Out of Scope

- Plain GO REMOTE (`npm run remote` without `--project-agent`), which binds the fixed `.env` room and never calls the server.
  *Note (2026-10-28):* the plain mode was later removed by SCOPE-149 / SPEC-150; `npm run remote` now runs the project-agent path.
- KAIN's own `POST /api/agent/connect`; agent grants (SCOPE-132 FR-027 – FR-029) still govern it.
- A Cockpit "Go Remote" button for plain mode (SCOPE-102 still defers it), and starting KAIN itself.
- The Cockpit opening its own room read session: readiness comes from the agent's output.
- Any DDL beyond `companyprojects.allowremote`.

## Open Questions

None. Decided by Andy, 2026-10-25: one process; the setting is per project **and** a personal
opt-out; the server enforces it on every start, manual included; readiness is read from the agent's
own output; a company ADMIN or a TEAM_MANAGER on that project may change it; the personal switch
defaults to on.

## User Scenarios & Testing

### US1 — An ADMIN or the project's TEAM_MANAGER allows remote

Given a project with "Allow remote" off, when a company ADMIN, or a TEAM_MANAGER on that project,
switches it on in the project agent access panel, then it is saved and one `project.remote.allowed`
audit row names them; and when a TEAM_MEMBER tries, then they get 403 and nothing changes.

### US2 — Opening an allowed project brings the remote up by itself

Given a project that allows remote, a linked company YappChatt account and the developer's switch
on, when they open the project in VS Code, then the project agent starts, binds the company room,
posts that it is connected, and the status bar shows **Live** with one notification — with no
command typed.

### US3 — A project that does not allow remote starts nothing

Given "Allow remote" off, when the developer opens the project, then nothing starts and the status
bar shows Off (not allowed); and when they run Start Project Agent anyway, then the server answers
403 `remote_not_allowed`, nothing is created or minted, and the Cockpit shows the reason.

### US4 — Edge: the missing company account is named

Given an allowed project whose company has no YappChatt account, when the agent auto-starts, then
the room route answers 409 `no_company_account` and the Cockpit shows Failed with "ask an ADMIN to
link the company YappChatt account on the Company page".

### US5 — Edge: a developer who opted out is left alone

Given an allowed project and `wxkanban.projectAgent.autoStart` set off, when the developer opens it,
then nothing starts and the status bar shows Off (switched off); Start Project Agent still works.

### US6 — Edge: stopping leaves nothing behind

Given a running project agent, when the developer runs Stop or closes the window, then the agent
posts its disconnect notice and no bridge process remains, on Windows included.

## Functional Requirements

### FR-001 — Auto-start on open follows the project's setting (SCOPE-132 FR-034, amended)

When a wxKanban workspace opens, the Cockpit asks the server whether the project allows remote
(FR-004). It starts the project agent only when the project allows it **and** the developer's
`wxkanban.projectAgent.autoStart` is not off. The setting's default changes to **on**: it now means
"start automatically where the project allows it".

**Acceptance Criteria**:
- [ ] A project that does not allow remote: nothing starts, no pop-up; the status bar says why.
- [ ] A developer who set the switch off: nothing starts on any project.
- [ ] Manual Start still works on an allowed project, whatever the switch says.

### FR-002 — "Allow remote" is a per-project setting (SCOPE-132 FR-036)

`companyprojects.allowremote`, `boolean NOT NULL DEFAULT false`. It is changed in the web app's
project agent access panel by a **company ADMIN, or a TEAM_MANAGER on that project**, through
`PUT /api/projects/:projectId/remote-access` `{ allowRemote }`. The project comes from the path and
must belong to the caller's company.

**Acceptance Criteria**:
- [ ] Anyone else gets 403; nothing changes and no audit row is written.
- [ ] A TEAM_MANAGER on a different project of the same company gets 403.
- [ ] Each change writes one `companyauditlogs` row, `project.remote.allowed` or `project.remote.disallowed`, naming the actor, the project and the old and new value.
- [ ] `GET /api/projects/:projectId/agent-access` also returns `allowRemote`.

### FR-003 — The server enforces it on every start (SCOPE-132 FR-037)

`POST /api/project-agent/room` answers **403 `remote_not_allowed`** `{ message }` when the token's
project has `allowremote` off. The check runs before any YappChatt call, room change or token mint,
and the refusal writes one `project.remote.refused` audit row.

**Acceptance Criteria**:
- [ ] A refused call creates, retires and mints nothing.
- [ ] Manual Start and auto-start are refused alike.
- [ ] `POST /api/agent/connect` (KAIN) is unchanged.

### FR-004 — The Cockpit learns the setting from the server (SCOPE-132 FR-038)

`GET /api/project-agent/settings`, authenticated by the project's kit API token, returns
`{ allowRemote, projectName }`. The project is taken from the token, never from the request.

**Acceptance Criteria**:
- [ ] No token, or an unknown, revoked or expired one: 401.
- [ ] If the server cannot be reached, the Cockpit starts nothing and says so in the status bar.

### FR-005 — The Cockpit reports when the remote is live (SCOPE-132 FR-039)

After the agent's "Claude on project X is connected" post succeeds, the agent prints one fixed,
machine-readable ready line to its output. The Cockpit, which started the process, watches that
output; on the ready line it shows **"Remote is live"** in the status bar and one notification.

**Acceptance Criteria**:
- [ ] If the ready line has not appeared within `wxkanban.projectAgent.readyTimeoutSeconds` (default 90), or the agent exits first, the Cockpit shows a plain error with the cause and the next step.
- [ ] Named causes: 409 `no_company_account` ("ask an ADMIN to link the company YappChatt account on the Company page"), 403 `remote_not_allowed`, the worktree lock ("another session is running on this folder"), an unreachable server.
- [ ] The ready line carries no token or secret.

### FR-006 — One status bar item for the remote (SCOPE-132 FR-040)

It shows **Off** (with the reason: not allowed, or switched off), **Starting**, **Live**, **Failed**
or **Stopped**. Clicking it opens the agent's output.

**Acceptance Criteria**:
- [ ] Each state appears in exactly the situation it names.
- [ ] Live clears when the agent exits.

### FR-007 — Stopping ends the whole process tree, cleanly (SCOPE-132 FR-041)

The Stop command, and closing the window, end the agent and every process it started, on Windows
included. The agent first posts its disconnect notice and releases the worktree lock.

**Acceptance Criteria**:
- [ ] No bridge process is left running after a stop.
- [ ] The disconnect post appears in the room.
- [ ] A forced stop after a grace period is allowed; a lock held by a dead process is already treated as free.

## Data Requirements

`companyprojects.allowremote` — `boolean NOT NULL DEFAULT false`. **Applied by hand and verified
2026-10-25** (SCOPE-117 change log: 192 projects, 0 allowed, 0 NULL). Declare it in
`src/db/schema` only; it already exists, so the declaration ships safely. No new table.

## API Routes

| Method | Path | Auth | Change |
|---|---|---|---|
| PUT | `/api/projects/:projectId/remote-access` | user JWT; company ADMIN or that project's TEAM_MANAGER | **new** — `{ allowRemote: boolean }`; audited |
| GET | `/api/projects/:projectId/agent-access` | user JWT | **extended** — also returns `allowRemote` |
| GET | `/api/project-agent/settings` | kit token | **new** — `{ allowRemote, projectName }` |
| POST | `/api/project-agent/room` | kit token | **extended** — 403 `remote_not_allowed` before any YappChatt call |

## Frontend Components

- **Web app — `ProjectAgentAccessPanel`**: an "Allow remote" switch (shadcn `Switch`), enabled for a company ADMIN or that project's TEAM_MANAGER and read-only for everyone else, with a one-line explanation.
- **Cockpit**: the remote status bar item; the "Remote is live" and failure notifications; the `wxkanban.projectAgent.autoStart` default and description; the new `wxkanban.projectAgent.readyTimeoutSeconds` setting.

## Compliance

SOC 2 is the only framework enabled on this project.
- **CC6.1** — who may start a remote is decided by the server from `allowremote` and the kit token's project, not by the client.
- **CC6.3** — the remote-access route has an explicit role guard: company ADMIN or that project's TEAM_MANAGER.
- **CC7.2** — every allow, disallow and refused start writes a `companyauditlogs` row naming the actor.

## Constraints

- The Cockpit gains no write action on project data (SCOPE-132 FR-022 holds): the switch lives in the web app; the Cockpit only reads the setting and starts or stops a local process.
- House rules: 100% TypeScript, no `any`, no `@ts-ignore`, Pino in the server, fences `[SCOPE 145 / Tnnn]`.
- A push deploys the app and the MCP together. Client-first release order: the Cockpit and the kit ship before the server's 403, or old clients see an unexplained refusal.
