# Spec 149: Handoff Remote

Implements SCOPE-149

**Implements**: SCOPE-149 piece A (`specs/Project-Scope/149-handoff-remote.md`, FR-001 – FR-008, FR-016, FR-017).
Fences for this spec are `[SCOPE 149 / Tnnn]`, written by `implement` only.
**Followed by**: SPEC-150 (SCOPE-149 piece B: retire `GO REMOTE` and remove the plain bridge mode). This spec
ships first; SPEC-150 follows because both edit the remote bridge's `main.ts` and `bridge.ts`.
**Depends on**: SPEC-134 (project agent, company-owned room), SPEC-145 (Allow remote, Cockpit auto-start,
`GET /api/project-agent/settings`), SPEC-148 (feedback triage in the same agent; token renewal, commit 2227bbfc).
**Source**: `docs/brainstorms/2026-10-27-go-remote-handoff.md` (D-0082 – D-0095).
**Created**: 2026-10-28

## Overview

Say `HANDOFF REMOTE` (any casing) or `/remote` when you leave a repo, and your session writes a short,
fixed-template status summary to `.wxai/handoff/<timestamp>.md`, with anything that looks like a secret
masked. The command launches nothing and never posts to the room itself. The repo's Project Agent, already
connected to the project's room, picks the file up, posts it under its own tag starting with `[HANDOFF]`,
treats it as context only, and then posts one reading of where the work stands and one question for the
operator, so the discussion continues from a phone.

This spec is piece A of SCOPE-149. It can ship even if piece B (SPEC-150) has to wait. Because piece A
already makes `HANDOFF REMOTE` the meaning of `/remote`, it also removes the `GO REMOTE` trigger from the
two rule surfaces that define it (`_wxAI/rules/remote.md`, the `/remote` command) and from the CLAUDE.md
AI Behavior bullet, so FR-001's "GO REMOTE no longer triggers anything" holds on its own. The full sweep of
guides, manuals, kit mirrors and the changelog is SPEC-150.

## Business Problem

The operator and customers work on several repos at a time, each with its own Project Session Room and its
own Project Agent. When they leave a repo mid-work, the agent in the room has no idea what the session was
doing, so the operator types the context in from a phone or the work waits until they are back at the desk.
`GO REMOTE` launched a separate one-off bridge from fixed `.env` room keys instead of handing anything to the
agent that is already connected, and it bypassed the company Allow-remote switch. The room credential belongs
to the Project Agent process, so the session cannot post to the room itself; it needs a local carrier the agent
can pick up.

## Actors

- Primary: Operator (developer) leaving a repo, who says `HANDOFF REMOTE` in the Claude Code session
- Secondary: The Project Agent (the Remote Session Bridge in `--project-agent` mode) in the repo's Project Session Room, which posts the handoff and opens the discussion; customers running the same kit on their own repos

## Success Metrics

1. 10 of 10 test handoffs appear in the room within 30 seconds of the command when the Project Agent is idle and Allow remote is on.
2. Across tests with 5 planted secret patterns (key, `yca_` token, connection string, bearer token, password assignment), 0 appear in the hand-off file or in the room, and each handoff still posts.
3. A handoff whose next step is "delete the old table" causes 0 file changes and 0 commands by the agent, and the agent's reading and question follow in the same turn.
4. 100% of blocked cases (Allow remote off, no company account, agent not running) end with one plain line naming the cause and leave 0 files in `.wxai/handoff/`.
5. An unposted handoff older than 4 hours is deleted and a removal note appears in the room in 100% of tests.
6. 100% of handoff events (queued, posted, replaced, expired, masked) leave one Pino line with counts and times, and 0 log lines contain summary text.

## Scope Boundary

- The `HANDOFF REMOTE` trigger and `/remote`: the rewritten `/remote` command (`.claude/commands/remote.md`,
  `_wxAI/commands/remote.md`), the rewritten `_wxAI/rules/remote.md`, and the CLAUDE.md AI Behavior bullet.
- The writer: one kit script under `wxkanban-agent/` that runs the preflight, renders the fixed template,
  truncates at 2,000 characters, masks secrets and writes `.wxai/handoff/<timestamp>.md`.
- `.wxai/handoff/` git-ignored for this repo, for new projects (kit template) and for existing projects
  (appended by the kit, as `.wxai/.entitlement` is today), and never included in a kit mirror.
- In `wxkanban-agent/apps/remote-bridge/src/` (project-agent mode only): the folder watcher, safe reads,
  4-hour expiry with a removal note, `[HANDOFF]` posting under the agent's own tag, busy/replace queueing
  (including during the daily TRIAGE run), context-only handling (also for a `[HANDOFF]` typed by a person),
  the one-reading-one-question follow-up, and Pino audit lines without content.

## Out of Scope

- Retiring `GO REMOTE` from the guides, manuals, MCP prompt references, README, changelog and kit mirrors;
  removing the plain `.env` launch, the env resolver and aliases, the seed/resume hooks, the plain-mode tests,
  the smoke script and the `.env` notice — all SPEC-150 (FR-009 – FR-015).
- Automatic handoff at session end; a cross-repo view across rooms; the Cockpit "last handoff" display; any
  behavior for KAIN or the owner's multi-project assistant.
- New database tables, API routes or screens (FR-016); editing a user's `.env`.
- The session posting to the room itself: it never does.

## Open Questions

None blocking. Decided in the brainstorm and the buildscope review (D-0082 – D-0095, Clarifications 1 – 8 of
SCOPE-149): the session writes a file and the Project Agent posts it; `GO REMOTE` is retired with no redirect;
expiry is 4 hours with a removal note; redaction masks and never blocks. One point is verified first in T001
rather than assumed: which existing surface tells "no company YappChatt account" apart from "agent not
running" without a new route (FR-016). If none does, T001 stops and raises it before T002.

## User Scenarios & Testing

### US1 — The operator leaves mid-work

Given the Project Agent is running and Allow remote is on, when the operator says `HANDOFF REMOTE`, then the
session writes the summary with secrets masked to `.wxai/handoff/`, the agent picks it up and posts it starting
with `[HANDOFF]` within 30 seconds, then posts its reading of where the work stands and one question, and edits
no files and runs no commands because of the summary. The operator answers from their phone.

### US2 — Remote cannot be used right now

Given Allow remote is off, the company has no YappChatt account, or the Project Agent is not running, when the
operator says `HANDOFF REMOTE`, then the command stops with one plain line naming the cause and the fix, leaves
nothing in `.wxai/handoff/` and posts nothing.

### US3 — The summary mentions a secret

Given the session's notes mention a connection string, when the operator says `HANDOFF REMOTE`, then the
connection string is masked as `[redacted]`, the handoff still goes through, the operator is told how many
items were masked, and no secret appears in the folder or the room.

### US4 — The agent is busy

Given the Project Agent is running its daily feedback triage, when the operator says `HANDOFF REMOTE` twice
before the first is posted, then the handoff waits behind the run and posts when the agent is free, the second
summary replaces the first, and nothing is posted twice.

## Functional Requirements

### FR-001 — The HANDOFF REMOTE command

`HANDOFF REMOTE` (any casing) and `/remote` run the handoff and launch no process.

**Acceptance Criteria**:
- [ ] Saying it writes one file to `.wxai/handoff/` and starts no bridge or agent
- [ ] `GO REMOTE` no longer triggers anything

### FR-002 — Preflight

Before writing anything, the command checks that this project's room can be used and that the Project Agent is running.

The only source for "no company YappChatt account" is the Project Agent's own refusal when it starts, which today leaves no trace once the agent exits. So when the agent refuses to start, it records the refusal code and time in a small local git-ignored status file, `.wxai/project-agent-status.json` (owner decision, 2026-10-27: no new route, table or screen). The preflight reads that file when it finds no running agent, so each cause is named. The file holds a code and a time only, never a token or a name.

The preflight finds the project's kit token where the Project Agent does: the workspace config first, then
the process environment, then the repo's `.env`. From `.env` it reads only `WXKANBAN_API_TOKEN`,
`WXKANBAN_APP_BASE_URL` and `WXKANBAN_MCP_URL`, a real environment variable still wins, and none of those
values reaches the hand-off file or a log line (owner decision 2026-10-28, after the live test found the
writer reporting "no token" in a repo whose token lives only in `.env`).

**Acceptance Criteria**:
- [ ] Allow remote off, no company YappChatt account, or no running agent each stop the command with one plain line naming the cause and the fix
- [ ] A stopped command leaves `.wxai/handoff/` unchanged and posts nothing
- [ ] After the agent refuses with `no_company_account`, the preflight names that cause and not "agent not running"; with no refusal on record it says the agent is not running
- [ ] A successful agent start clears the recorded refusal, and the status file holds only a refusal code and a time
- [ ] With the token only in the repo's `.env`, the preflight passes; no other `.env` key is read and the token
  appears in neither the hand-off file nor the log

### FR-003 — The summary

A fixed template: repo and branch, working on (scope and task), done, in flight, blocked or waiting on a
decision, uncommitted work (counts and file names only), next step, where to resume. At most 2,000 characters.

**Acceptance Criteria**:
- [ ] Every field is present, using `none` when empty
- [ ] A longer summary is cut at 2,000 characters and ends with a visible `...truncated` line
- [ ] File contents and diffs never appear in it

### FR-004 — Redaction

Text that looks like a key, token, password or connection string is masked as `[redacted]` before the file is
written. The handoff still goes through.

**Acceptance Criteria**:
- [ ] A planted `postgres://user:pass@host/db` and a planted `yca_` token both appear masked, not in the file and not in the room
- [ ] The operator is told how many items were masked

### FR-005 — The hand-off folder

The summary goes to `.wxai/handoff/<timestamp>.md`, which is git-ignored.

**Acceptance Criteria**:
- [ ] The folder is in `.gitignore` for new and existing projects
- [ ] No other path is written, except the two `.gitignore` entries (`.wxai/handoff/` and `**/.wxai/project-agent-status.json`), appended to an existing `.gitignore` just before the first write (never creating one)

### FR-006 — Pickup and post

The Project Agent watches that folder, posts the summary to the room under its own identity starting with
`[HANDOFF]`, and then removes the file. A file older than 4 hours is deleted unposted and the agent posts a
short note in the room that it was removed.

**Acceptance Criteria**:
- [ ] With the agent idle, the post appears within 30 seconds
- [ ] The agent reads only regular files in that folder, under a size cap, and ignores anything else
- [ ] A file older than 4 hours is deleted unposted and a removal note appears in the room, so a restarted agent never posts a stale handoff

### FR-007 — Context only, then the discussion

The agent treats a `[HANDOFF]` message as context. It does not carry out the next step, edit files or run
commands because of it. It then posts one reading of where the work stands and one question for the operator.

**Acceptance Criteria**:
- [ ] After a handoff whose next step is "delete the old table", no file or command changes happen
- [ ] The follow-up message appears after the `[HANDOFF]` message
- [ ] A `[HANDOFF]` typed by a person in the room gets the same treatment
- [ ] `STOP` during a handoff turn lifts the context-only guard at once (it does not wait for the interrupted
  turn to report), drops the messages held behind that turn and any deferred handoff, and posts how many were
  dropped so the operator can resend them. After it, the next room message runs as a normal turn (owner
  decision 2026-10-28)

### FR-008 — Busy and repeated handoffs

If the agent is in the middle of a task the handoff waits. A newer handoff replaces an unposted one.

**Acceptance Criteria**:
- [ ] During a triage run a handoff posts only after the run ends
- [ ] Two handoffs before pickup produce one post with the newer summary

### FR-016 — No new tables, routes or screens

The scope adds no database tables, API routes or UI.

**Acceptance Criteria**:
- [ ] No migration, route or component is added

### FR-017 — Audit logging

Each handoff logs with Pino when it is queued, posted, replaced, expired or masked, with counts and times and
never the content.

**Acceptance Criteria**:
- [ ] A posted handoff leaves one log line with its time and masked count
- [ ] No log line contains summary text

### Acceptance — the Project Agent keeps working

Piece A adds to the agent; it must not regress it. After every piece A task that touches the bridge:

- [ ] The project agent starts and binds its room (`POST /api/project-agent/room`) as before
- [ ] `TRIAGE` still runs the feedback sweep on the sink project (SPEC-148)
- [ ] The agent's MCP token still renews on 401 (SPEC-148 FR-016, commit 2227bbfc)
- [ ] The control words (`STOP`, `CONTINUE`, `STATUS`, `VERBOSE`/`CONCISE`, `PUSH` → `CONFIRMED`/`NO`, `CANCEL REMOTE`) behave as before

## Data Requirements

None. No tables, columns or migrations. The Handoff file is a short-lived local Markdown file in
`.wxai/handoff/` with the fixed fields and a created-at time; it is removed after posting or after 4 hours and
is never stored in the database. The agent adds the `[HANDOFF]` marker when it posts.

## API Routes

None added. The writer's preflight and the Project Agent keep using the existing `GET /api/project-agent/settings`
(Allow remote) and `POST /api/project-agent/room` unchanged.

## Frontend Components

None. The Cockpit "last handoff" display is out of scope.

## Integration Context

SCOPE-102 Remote Session Bridge (superseded in part; its control vocabulary, self-echo handling and push gate
are untouched here); SCOPE-134 / SPEC-134 project agent and company-owned room (the agent's own tag, the
worktree lock `.wxai/remote-session.lock`); SCOPE-145 / SPEC-145 Allow remote and Cockpit auto-start; SPEC-148
feedback triage (the TRIAGE run the handoff queues behind, and the token holder); SCOPE-144 company YappChatt
account.

## Compliance

SOC 2 is the only framework enabled on this project.

- **CC6.1, authentication and authorization design.** Identity: the local session writes the file; the Project
  Agent posts under its own tag with the room credential it already holds. Authorization: the company
  Allow-remote switch and company-room membership decide who can use the room. The handoff adds no new permission.
- **CC6.1, input validation.** The agent parses each hand-off file at the boundary: regular file, under the size
  cap, in the expected folder, fixed fields; anything else is ignored.
- **CC6.3, least privilege.** The agent reads only regular files in `.wxai/handoff/`, under a size cap, and runs
  no command because of a handoff; this is enforced for the handoff turn, not only asked for.
- **CC7.2, security log monitoring.** Handoff events emit structured Pino lines (queued, posted, replaced,
  expired, masked) with counts and times and never the content (FR-017).

## Constraints

- MUST deliver only the behavior described within the scope boundary above.
- MUST treat a handoff as untrusted text whether it came from the folder or was typed in the room; the agent
  runs in `bypassPermissions`, where `canUseTool` is never consulted, so "no edits, no commands" for the
  handoff turn must be enforced by a PreToolUse hook (the SPEC-148 triage-hook pattern), not by prompt wording alone.
- The session NEVER posts to the room; only the Project Agent posts.
- Redaction masks and never blocks.
- The kit never edits `.env`.
- House rules: 100% TypeScript, no `any`, no `@ts-ignore`, Pino for the new logging, no `console.log` in new code.
  Fences `[SCOPE 149 / Tnnn]` are written by `implement` only.
- Edits to SCOPE-102 / SCOPE-134 / SPEC-148 fenced files go through `implement` (MODIFIED-BY lines).
- After bridge edits, rebuild `wxkanban-agent` so `dist/remote-bridge.cjs` matches the source (the Cockpit runs `dist/` first).
- Assumes the Project Agent runs from the repo root.

## Phase

**Current Phase**: design
**Priority**: high

## Status

- **Date**: 2026-10-28
- **Phase**: design
