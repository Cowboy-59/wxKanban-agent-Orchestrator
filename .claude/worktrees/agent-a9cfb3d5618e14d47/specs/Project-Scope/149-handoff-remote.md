# Scope 149: Handoff Remote

**Scope Number**: 149
**Status**: `draft`
**Created**: 2026-10-28
**Depends On**: SCOPE-134 (project agent, company-owned room), SCOPE-145 (Allow remote, Cockpit auto-start)
**Supersedes (in part)**: SCOPE-102 (the per-repo `.env` room binding and the `GO REMOTE` launch)
**Implemented By**: SPEC-149 (`specs/149-handoff-remote/`, piece A: FR-001 – FR-008, FR-016, FR-017), then SPEC-150 (`specs/150-retire-plain-remote-mode/`, piece B: FR-009 – FR-015)
**Source**: `specs/Project-Scope/149-handoff-remote.md`, converted from `docs/brainstorms/2026-10-27-go-remote-handoff.md`

## Overview

Say `HANDOFF REMOTE` when you leave a repo, and your session writes a short status summary and hands it to that repo's Project Agent, which posts it to the project's room and opens the discussion with you there. It replaces `GO REMOTE`, which is retired along with the plain `.env`-driven bridge mode, so the Project Agent is the only remote path.

The command launches nothing. The session writes the summary to a local hand-off folder; the Project Agent, already connected to the room, posts it under its own identity starting with `[HANDOFF]`, treats it as context only, and then posts one reading of where the work stands and one question for the operator.

The scope has two pieces: **A**, the handoff (FR-001 to FR-008, FR-017), and **B**, retiring `GO REMOTE` and removing the plain bridge mode (FR-009 to FR-015). A can ship even if B has to wait.

The operator and customers work on several repos at a time, each with its own Project Session Room and its own Project Agent. When they leave a repo mid-work, the agent in the room has no idea what the session was doing, so the operator types the context in from a phone or the work waits until they are back at the desk. `GO REMOTE` also launched a separate one-off bridge from fixed `.env` room keys that bypassed the company Allow-remote switch.

### Core Design

| Element | Value |
| --- | --- |
| **Primary Actor** | Operator (developer) leaving a repo |
| **Secondary Actors** | Project Agent in the repo's Project Session Room, Customers running the same kit on their own repos |
| **Key Value** | The Project Agent knows where the work stands the moment the operator leaves, and opens the discussion, so work continues from a phone instead of waiting for the desk. |
| **Scope Boundary** | The HANDOFF REMOTE command and /remote; the fixed-template summary; the redaction check; the .wxai/handoff/ folder and writer script; the Project Agent's pickup, post, queueing, expiry and context-only handling of [HANDOFF]; audit logging of handoffs; retiring GO REMOTE; removing the plain .env-driven bridge mode, the deprecated env aliases and the seed/resume hooks; and the documentation and kit release. Builds on SCOPE-134 and SCOPE-145 without changing them; supersedes SCOPE-102's per-repo .env room binding and GO REMOTE launch. |
| **Out of Scope** | Automatic handoff at session end; a cross-repo view across rooms; the Cockpit "last handoff" display; any behavior for KAIN or the owner's multi-project assistant; new database tables, API routes or screens; editing a user's .env. |

## User Scenarios & Testing

### US1 — The operator leaves mid-work

**Actor**: Operator

**Scenario**:
1. The Project Agent is running and Allow remote is on.
2. The operator says HANDOFF REMOTE in the Claude Code session.
3. The session writes the summary, with secrets masked, to .wxai/handoff/.
4. The Project Agent picks it up and posts it to the room starting with [HANDOFF].
5. The agent posts a second message: its reading of where the work stands and one question for the operator.
6. The operator answers from their phone.

**Expected outcome**: The [HANDOFF] message is in the room within 30 seconds of the command when the agent is idle, the follow-up comes after it, and the agent edits no files and runs no commands because of the summary.

### US2 — Remote cannot be used right now

**Actor**: Operator on a customer repo

**Scenario**:
1. Allow remote is off, the company has no YappChatt account, or the Project Agent is not running.
2. The operator says HANDOFF REMOTE.

**Expected outcome**: The command stops and names the cause in one plain line with the fix, leaves nothing in .wxai/handoff/ and posts nothing.

### US3 — The summary mentions a secret

**Actor**: Operator

**Scenario**:
1. The session's own notes mention a connection string.
2. The operator says HANDOFF REMOTE.
3. The redaction check masks the connection string as [redacted].

**Expected outcome**: The handoff still goes through with the masked text, the operator is told how many items were masked, and no secret appears in the folder or the room.

### US4 — The agent is busy

**Actor**: Operator while the Project Agent runs its daily feedback triage

**Scenario**:
1. The operator says HANDOFF REMOTE.
2. The operator says it again before the first is posted.

**Expected outcome**: The handoff waits behind the current task and posts when the agent is free; the second summary replaces the first, and nothing is posted twice.

## Functional Requirements

### FR-001 — The HANDOFF REMOTE command

HANDOFF REMOTE (any casing) and /remote run the handoff and launch no process.

**Acceptance Criteria**:
- [ ] Saying it writes one file to .wxai/handoff/ and starts no bridge or agent
- [ ] GO REMOTE no longer triggers anything

### FR-002 — Preflight

Before writing anything, the command checks that this project's room can be used and that the Project Agent is running.

**Acceptance Criteria**:
- [ ] Allow remote off, no company YappChatt account, or no running agent each stop the command with one plain line naming the cause and the fix
- [ ] A stopped command leaves .wxai/handoff/ unchanged and posts nothing

### FR-003 — The summary

A fixed template: repo and branch, working on (scope and task), done, in flight, blocked or waiting on a decision, uncommitted work (counts and file names only), next step, where to resume. At most 2,000 characters.

**Acceptance Criteria**:
- [ ] Every field is present, using 'none' when empty
- [ ] A longer summary is cut at 2,000 characters and ends with a visible '...truncated' line
- [ ] File contents and diffs never appear in it

### FR-004 — Redaction

Text that looks like a key, token, password or connection string is masked as [redacted] before the file is written. The handoff still goes through.

**Acceptance Criteria**:
- [ ] A planted postgres://user:pass@host/db and a planted yca_ token both appear masked, not in the file and not in the room
- [ ] The operator is told how many items were masked

### FR-005 — The hand-off folder

The summary goes to .wxai/handoff/<timestamp>.md, which is git-ignored.

**Acceptance Criteria**:
- [ ] The folder is in .gitignore for new and existing projects
- [ ] No other path is written, except the two `.gitignore` entries (`.wxai/handoff/` and `**/.wxai/project-agent-status.json`), appended to an existing `.gitignore` just before the first write (never creating one)

### FR-006 — Pickup and post

The Project Agent watches that folder, posts the summary to the room under its own identity starting with [HANDOFF], and then removes the file. A file older than 4 hours is deleted unposted and the agent posts a short note in the room that it was removed.

**Acceptance Criteria**:
- [ ] With the agent idle, the post appears within 30 seconds
- [ ] The agent reads only regular files in that folder, under a size cap, and ignores anything else
- [ ] A file older than 4 hours is deleted unposted and a removal note appears in the room, so a restarted agent never posts a stale handoff

### FR-007 — Context only, then the discussion

The agent treats a [HANDOFF] message as context. It does not carry out the next step, edit files or run commands because of it. It then posts one reading of where the work stands and one question for the operator.

**Acceptance Criteria**:
- [ ] After a handoff whose next step is 'delete the old table', no file or command changes happen
- [ ] The follow-up message appears after the [HANDOFF] message
- [ ] A [HANDOFF] typed by a person in the room gets the same treatment

### FR-008 — Busy and repeated handoffs

If the agent is in the middle of a task the handoff waits. A newer handoff replaces an unposted one.

**Acceptance Criteria**:
- [ ] During a triage run a handoff posts only after the run ends
- [ ] Two handoffs before pickup produce one post with the newer summary

### FR-009 — Retire GO REMOTE

The GO REMOTE trigger is removed from remote.md, CLAUDE.md, the /remote skill, the guides and the kit mirrors, with no redirect.

**Acceptance Criteria**:
- [ ] A search for the phrase in the kit finds it only in the changelog as retired

### FR-010 — Remove the plain launch path

The plain .env-driven launch is deleted from the remote bridge entry point, and npm run remote becomes the project-agent path.

**Acceptance Criteria**:
- [ ] npm run remote starts the project agent
- [ ] The project agent starts, binds its room, takes TRIAGE and renews its token as before

### FR-011 — Remove environment input for the room

The code that reads YAPPCHATT_ROOM, YAPPCHATT_TOKEN and YAPPCHATT_EMAIL from the environment as input, and the deprecated WXKANBAN_YAPPCHATT_* and WXKANBAN_REMOTE_ROOM_ID aliases, are deleted. The project agent still sets the values in memory for itself.

**Acceptance Criteria**:
- [ ] No source file reads those variables as input
- [ ] The project agent still connects

### FR-012 — Remove the seed hooks

WXKANBAN_REMOTE_SEED and WXKANBAN_REMOTE_RESUME and the code behind them are deleted.

**Acceptance Criteria**:
- [ ] No source file reads either variable
- [ ] The project agent still starts a session without them

### FR-013 — Tests and smoke script

The plain-mode tests and the yappchatt-smoke script are removed or rewritten for the project-agent path.

**Acceptance Criteria**:
- [ ] No test starts the bridge from .env room keys
- [ ] The test suite passes

### FR-014 — .env is left alone

The kit never edits .env. On the first run after the upgrade, if the old room keys are present, it prints one notice that they are no longer read and can be deleted.

**Acceptance Criteria**:
- [ ] .env is byte-identical after the upgrade
- [ ] The notice appears exactly once

### FR-015 — Docs and release

CLAUDE.md, remote.md, the guides, the changelog, the kit mirrors and a note on SPEC-145 are updated in the same release.

**Acceptance Criteria**:
- [ ] The kit mirrors match, checked by md5

### FR-016 — No new tables, routes or screens

The scope adds no database tables, API routes or UI.

**Acceptance Criteria**:
- [ ] No migration, route or component is added

### FR-017 — Audit logging

Each handoff logs with Pino when it is queued, posted, replaced, expired or masked, with counts and times and never the content.

**Acceptance Criteria**:
- [ ] A posted handoff leaves one log line with its time and masked count
- [ ] No log line contains summary text

### FR-018 — G.O.D. goes unattended through HANDOFF REMOTE

G.O.D.'s unattended offer (SCOPE-136 FR-019: `mcp-server/src/prompts/wxgod/references/new-project.md` N12, and R7
under `--create`) relied on the plain mode this scope removes: it looked for the room keys in `.env` and launched
`npm run remote` with `WXKANBAN_REMOTE_SEED=/wxG-O-D --resume`. It now goes through the handoff. G.O.D. offers once
per run when `.wxai/remote-session.lock` names a project agent. On yes it saves its state file and writes a
handoff through the HANDOFF REMOTE writer whose next step is `/wxG-O-D --resume`. If the writer stops, G.O.D. shows
its one line and carries on in the editor. If it writes, G.O.D. stops driving from the editor; the agent posts the
handoff and asks its one question (FR-007), and when the operator answers go, the agent runs `/wxG-O-D --resume`
as a normal turn, KAIN relaying as before (SCOPE-136 FR-020). Owner decision 2026-10-28 (SPEC-150 T001).
Implemented by SPEC-150.

**Acceptance Criteria**:
- [ ] The offer never reads `.env`; with no project agent lock, G.O.D. says nothing about remote and continues in the editor
- [ ] On yes, the writer runs once: written, the editor session stops driving; stopped, its line is shown and the run continues in the editor
- [ ] The handoff turn runs nothing; `/wxG-O-D --resume` runs only after the operator's go in the room
- [ ] N12, R7 and `wxgod.md` name no `.env` room key, `npm run remote` launch, seed variable or `GO REMOTE`

## Data Requirements

None. No tables, columns or migrations; the Handoff file is a short-lived local file, not a database record.

## API Routes

None. The Project Agent keeps using POST /api/project-agent/room and GET /api/project-agent/settings unchanged.

## Frontend Components

None. The Cockpit "last handoff" display is out of scope.

## Success Criteria

1. 10 of 10 test handoffs appear in the room within 30 seconds of the command when the Project Agent is idle and Allow remote is on.
2. Across tests with 5 planted secret patterns (key, yca_ token, connection string, bearer token, password assignment), 0 appear in the hand-off file or in the room, and each handoff still posts.
3. A handoff whose next step is 'delete the old table' causes 0 file changes and 0 commands by the agent, and the agent's reading and question follow in the same turn.
4. 100% of blocked cases (Allow remote off, no company account, agent not running) end with one plain line naming the cause and leave 0 files in .wxai/handoff/.
5. After the plain mode is removed, 0 source files read YAPPCHATT_ROOM, YAPPCHATT_TOKEN or YAPPCHATT_EMAIL from the environment as input, and the project agent still starts, binds its room, takes TRIAGE and renews its token.
6. .env is byte-identical before and after the upgrade and the one-time notice appears exactly once.
7. An unposted handoff older than 4 hours is deleted and a removal note appears in the room in 100% of tests.

## Key Entities

**Handoff file**: a Markdown file in .wxai/handoff/ with the fixed fields (repo and branch, working on, done, in flight, blocked, uncommitted work, next step, where to resume) and a created-at time. The agent adds the [HANDOFF] marker when it posts. Short-lived: removed after posting or after 4 hours. Not stored in the database.

## Compliance Requirements

Active framework: SOC2.

- **CC6.1, authentication and authorization design.** Identity: the local session writes the file, and the Project Agent posts under its own tag. Authorization: the company Allow-remote switch and company-room membership decide who can use the room. The handoff adds no new permission.
- **CC6.3, least privilege.** The agent reads only regular files in .wxai/handoff/, under a size cap, and runs no command because of a handoff.
- **CC7.1, audit logging.** Handoff events are logged without content (FR-017).

## Constraints

- MUST deliver only the behavior described within the scope boundary above.
- MUST keep the following work out of scope for this iteration: automatic handoff at session end; a cross-repo view across rooms; the Cockpit "last handoff" display; any behavior for KAIN or the owner's multi-project assistant; new database tables, API routes or screens; editing a user's .env.
- MUST treat a handoff as untrusted text whether it came from the folder or was typed in the room; the agent runs in bypass permissions.
- MUST preserve guided, reviewable workflow decisions instead of relying on undocumented implementation assumptions.
- MUST keep user-visible outcomes aligned with the measurable success criteria defined in this scope.

## Notes

- Integration context: SCOPE-102 Remote Session Bridge (superseded in part); SCOPE-134 project agent and company-owned room; SCOPE-145 Allow remote and Cockpit auto-start; SCOPE-148 feedback triage runs in the same agent; SCOPE-144 company YappChatt account. Converted from docs/brainstorms/2026-10-27-go-remote-handoff.md (ledger D-0082 to D-0095; D-0091, the declined file drop, is reversed by the hand-off folder carrier and is recorded as a new row).
- Constraints and risks: customers with no company YappChatt account lose remote until they set one up. Edits to SCOPE-102 fenced files go through implement only; five scopes depend on SCOPE-102 (109, 132, 136, 142, 143) and are checked for reliance on the plain mode before FR-010 starts. One kit release with mirrors in sync; check git status for concurrent sessions first. Assumes the Project Agent runs from the repo root.
- The Project Agent is the recipient. KAIN and the owner's multi-project assistant are not part of this scope.
- Customer-visible or operator-visible history should be limited to outcomes that materially affect workflow review and support.

## Clarifications

### Session 2026-10-28

| # | Question | Decision |
|---|----------|----------|
| 1 | What business problem does this solve? | When the operator leaves a repo mid-work, the Project Agent in the room has no idea what the session was doing. |
| 2 | Who are the primary and secondary actors? | Primary: the operator leaving a repo. Secondary: the Project Agent, and customers running the same kit. |
| 3 | What is in scope? | See the Scope Boundary above. |
| 4 | What is out of scope? | See the Out of Scope row above. |
| 5 | How is success measured? | The seven Success Criteria above. |
| 6 | What existing workflow must this align with? | SCOPE-102, SCOPE-134, SCOPE-145, SCOPE-148, SCOPE-144. |
| 7 | What constraints or risks matter right now? | See the Constraints and Notes above. |
| 8 | Does the session post to the room itself? | No. The session writes a file and the Project Agent posts it, because the room credential belongs to the agent process. |
