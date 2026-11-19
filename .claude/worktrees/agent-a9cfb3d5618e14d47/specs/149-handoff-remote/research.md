# Research: Handoff Remote (T001)

**Spec Number**: 149
**Task**: T001 — verify the preflight sources and the handoff hook points (FR-002, FR-016)
**Date**: 2026-10-27
**Status**: Done. Cause (3) could not be told apart from cause (2) without a new surface or a
mutating call; raised to the owner before T002.

**OWNER DECISION 2026-10-27: option B.** The agent records its start refusal (code and time only) in
the local git-ignored `.wxai/project-agent-status.json` (new task T010), and the writer's preflight
reads it when no live project agent holds the lock. No route, table or screen; the writer never calls
`POST /api/project-agent/room`.

## The three blocked causes

| # | Cause | Existing surface | Read-only? | Verdict |
| --- | --- | --- | --- | --- |
| 1 | Allow remote off | `GET /api/project-agent/settings` with the project's kit token (`resolveApiToken`), returns `{ allowRemote, projectName, feedbackSink }` (`src/server/routes/projectAgent.ts`, SCOPE 145 / T004) | yes, "never audited" | usable as is |
| 2 | Project Agent not running | `.wxai/remote-session.lock` (`agent-mode.ts` `lockPath` / `acquireWorktreeLock`): JSON `{ pid, owner, since }`; owner `"project agent"`; a lock whose pid is dead is stale | yes (local file) | usable as is |
| 3 | No company YappChatt account | see below | — | **not separable without a decision** |

### Cause 3 in detail

The only place the server says `no_company_account` is `POST /api/project-agent/room`
(409, raised from `CompanyYappchattService.ensureCompanyRoom` via `AgentConnectService.projectAgentRoom`).
The bridge turns it into the stdout line `[project-agent] refused no_company_account` (`refusedLine`,
`refusalCode` in `agent-mode.ts`) and then exits after **releasing the worktree lock** (`main.ts`,
exit 4). The Cockpit matches the line in memory only (`vscode-extension/src/services/projectAgent.ts`,
`refusedCode`); nothing is persisted.

So, after a refusal, the local state is identical to "agent not running": no lock, no pid.

Surfaces checked and rejected:

- `POST /api/project-agent/room` — answers the question, but it is not a read. When the account
  exists it resolves or creates the company-owned room, may retire and replace an unowned room
  (SCOPE-144 FR-007), and mints a new bound MCP token while **revoking the prior one with the same
  name** (`mintProjectToken`). Called by the writer while an agent is running, it would revoke the
  agent's live MCP token. When Allow remote is off it also writes a refusal audit row
  (`recordRefused`). A preflight with these side effects contradicts "posts nothing" in spirit and
  the SPEC-148 single-token-holder design.
- `GET /api/project-agent/settings` — no company-account field.
- `GET /api/project-agent/approver` — needs a YappChatt user id, does not report the account, and
  writes an audit row on every call.
- `.wxai/agent-room.json` (room-token state) — presence only proves a room was minted at some point
  on this machine (possibly before SCOPE-144's company-owned rooms); absence proves nothing (new
  machine). Not reliable.

What the existing surfaces DO give, read-only:

- Lock held by a live pid with owner `project agent` ⇒ the agent is running ⇒ it passed
  `POST /room` at start ⇒ a company account existed. Preflight passes.
- No live lock ⇒ "agent not running". Whether it is not running *because* the company has no
  YappChatt account cannot be read without one of the options below.

## Open question (raised to the owner before T002)

Cause (3) "no company YappChatt account" cannot be told apart from cause (2) "agent not running"
with existing read-only surfaces. Options, none of which adds a database table:

- **A.** Collapse: when no live agent is found, print one line naming "the Project Agent is not
  running" with the fix "start it from the Cockpit; if it refuses with no_company_account, set up the
  company YappChatt account". No new surface; US2/SC-4 are met for causes 1 and 2 but cause 3 is
  named only conditionally.
- **B.** Local refusal record: the agent, when it refuses to start, writes its refusal code to a
  small git-ignored file (e.g. `.wxai/project-agent-status.json`, code and time only); the writer
  reads it when no live lock is found. No route, table or screen (FR-016 holds), but it is new agent
  behavior not written in the spec, so the spec would be amended first.
- **C.** Add a read-only `companyAccount` field to the existing `GET /api/project-agent/settings`
  response. Not a new route, but an app (server) change and deploy, which the spec says piece A does
  not need.
- **D.** Call `POST /api/project-agent/room` from the writer. Rejected by T001: mutating (mints and
  revokes MCP tokens, can create or re-own the room).

## Busy signals and self-echo (for T006 / T007)

In `wxkanban-agent/apps/remote-bridge/src/bridge.ts`:

- `turnActive` (private boolean): set true when a room message or decision reply is sent to the
  session, false on `onResult` and on `STOP`.
- `pendingPush` (private `{ remote, branch } | undefined`): operator-initiated push awaiting
  CONFIRMED/NO.
- `pendingApproval` (private `{ resolve, request } | undefined`): agent-initiated gate awaiting an
  answer.
- Triage run: `TriageSchedule.isRunning` (`triage-schedule.ts`, `running` set for the whole run
  and cleared in `finally`); `this.triage` exists only in project-agent mode on the sink.
- Self-echo: posts go through `post()`, which records `client.formatOutgoing(text)` in `selfPosts`
  (60 s window); inbound drop is primarily `m.isAgent` (our own posts carry the project tag, only
  the supervisor's tag is input), with `consumeSelfEcho` as the fallback. A `[HANDOFF]` the agent
  posts through `post()` is therefore never re-processed as a person-typed one.
- Hooks: `session.ts` registers PreToolUse hooks with `matcher: "Bash"` only (the override gate).
  The handoff-turn guard (T007) needs a second, matcher-less PreToolUse entry, the pattern of
  `triage-run.ts` (`hooks: { PreToolUse: [{ hooks: [hook] }] }`) and `triage-hook.ts`.
