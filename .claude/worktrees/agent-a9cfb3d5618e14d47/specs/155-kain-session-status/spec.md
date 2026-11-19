# Spec 155: KAIN Session Status

**Implements**: SCOPE-132 Amendment G, piece A only (`specs/Project-Scope/132-kain-autonomous-driver.md`,
FR-076 – FR-080). Fences for this spec are `[SCOPE 155 / Tnnn]`.
**Depends on**: SCOPE-151 (the project-agent connection record and its heartbeat, extended here),
SPEC-143 (routing tiers — the cheap model tier summarizes), the existing handoff masker
(`apps/remote-bridge/src/handoff-writer.ts`, `redactSecrets`), SCOPE-152 FR-066 (`agentReach`),
SCOPE-117 (manual schema-change process). **Excludes** Amendment G piece B (FR-081 – FR-091, the
agent mailbox and K.A.I.N.-directs-the-agent mechanism) per decision D-0100 — a separate, later
spec. **Feeds**: SPEC-154 (Project Agent Autopilot) — its heartbeat already carries a reuse
placeholder for this mechanism. SPEC-154's release gate (`AutopilotReleaseGate.ts`) originally
named a `rollingSummaryBuilt` prerequisite tied to this spec; that prerequisite was descoped
2026-11-07 (SCOPE-154, with Andy) once it was confirmed the heartbeat derives its content from
`AutopilotRunState`, not from this mechanism — so this spec is no longer a precondition for the
Autopilot switch. This spec remains specified and may still ship on its own schedule.
**Source**: `specs/Project-Scope/132-kain-autonomous-driver.md` (Amendment G, decisions D-0100,
D-0102) and `docs/brainstorms/2026-11-03-kain-direct-agent-line.md`.
**Created**: 2026-11-07

## Overview

HANDOFF REMOTE is a one-time snapshot; nothing the developer's session says afterward reaches
anyone checking in remotely. This spec gives K.A.I.N. (or anyone reading a project's agent status
through the MCP or the Cockpit) a live, masked view of where that session stands: a per-turn kit
hook records a capped, masked line locally, the agent rolls it into a short summary, and that
summary rides the existing SCOPE-151 heartbeat to the server, where one MCP tool and one REST route
read it back. It invents no new transport, relay, or history store — everything travels on
mechanisms that already exist.

## Business Problem

The room HANDOFF REMOTE would otherwise post through has been dropping messages with nothing
reacting, and even when it worked, it only ever carried a point-in-time snapshot. K.A.I.N. has no
way to ask "where does this session actually stand right now" — it either waits for the developer
to say so, or gets nothing. Separately, SPEC-154's Autopilot heartbeat was written to reuse a
rolling-summary mechanism that does not yet exist anywhere in the codebase
(`wxkanban-agent/apps/remote-bridge/src/autopilot-heartbeat.ts`), so its release gate cannot close
its third prerequisite until this ships.

## Actors

- Primary: K.A.I.N. (reads session status via the MCP tool or the REST route; the consumer this
  spec exists for)
- Secondary: the developer's local kit session (the per-turn hook author and rolling-summary
  maintainer), the Project Agent process (carries the summary on its existing heartbeat), the
  wxKanban app (stores it on the open connection record and serves the read)

## Success Metrics

- **SC-27** (SCOPE-132): while an agent is live and sharing, 100% of K.A.I.N. status reads return a
  summary at most 60 seconds old.
- **SC-28** (SCOPE-132): 0 unmasked secrets — a seeded test with 10 secret patterns (keys, tokens,
  connection strings) across session turns finds none in `.wxai/session-feed.jsonl`, on the
  connection record, or in any status response.
- **SC-29** (SCOPE-132): over 100 turns, the per-turn hook's 95th-percentile run time is under
  200 ms; 100% of runs exit 0; 0 turns blocked or failed by it.
- **New**: 100% of connection records have `sessionsummary`, `lastentry` and `blockers` cleared
  within one heartbeat of the connection closing, lapsing stale, or a heartbeat reporting
  `sharing: false`.

## Scope Boundary

- A per-turn kit hook that appends one masked line to `.wxai/session-feed.jsonl` (gitignored),
  shipped through the existing kit hook sync.
- The agent maintaining a rolling summary (≤1,500 chars), last entry (≤500 chars), and open-blocker
  titles from new feed lines, via the cheap model tier (SPEC-143 routing).
- Five new columns on `projectagentconnections` (`sessionsummary`, `lastentry`, `blockers`,
  `sharing`, `summaryat`), applied by hand under SCOPE-117 and declared in both the application
  schema and the `mcp-server` schema mirror.
- Extending the existing SCOPE-151 heartbeat POST to carry `{ summary, lastEntry, blockers, sharing }`,
  overwrite-only, cleared on close/stale/sharing-off.
- `GET /api/agent/projects/:projectId/status` (device token, reach-checked, audited) and MCP
  `project.get_session_status { projectId }` returning the same shape.
- The Cockpit per-workspace setting `wxkanban.projectAgent.shareStatus` (default on) and the status
  bar text addition ("Remote: live · sharing status" / "Remote: live").

## Out of Scope

- Amendment G piece B in full (FR-081 – FR-091): the agent mailbox, the directing hold, K.A.I.N.
  sending directions, the Room-Approver gate-answer path, mailbox reliability/expiry, and the
  room-less `connect` change. A separate, later spec per decision D-0100.
- A WebSocket `/bridge` on the app, or a separate relay service.
- The raw transcript or `.remember` as the summary source.
- Summary history or a Cockpit live view of the running session (the connection record stays
  overwrite-only with no history kept).
- The YappChatt reconnect defect (tracked as a separate SCOPE-144 amendment).
- Running the agent mailbox-only without a company YappChatt account; K.A.I.N.'s own mailbox client
  (lives in SpokAI); widening the Room Approver rule.
- Flipping SPEC-154's `AUTOPILOT_RELEASE_GATE_OPEN` prerequisites — moot as of 2026-11-07: this
  spec's mechanism was descoped out of that gate entirely (see **Feeds**, above), so this spec's
  shipping has no effect on the gate either way.

## Open Questions

None blocking. FR-076 – FR-080 were decided by Andy in the 2026-11-03 wxBrainstorm
(`docs/brainstorms/2026-11-03-kain-direct-agent-line.md`, rows 1 – 12) and confirmed by the clean
`/validateScope` pass on SCOPE-132 Amendment G. The item previously carried forward here — confirming
and flipping `AutopilotReleaseGate.ts`'s `rollingSummaryBuilt` flag after this spec ships — is moot:
that prerequisite was removed from the gate entirely on 2026-11-07 (see **Feeds**, above), so no
flag flip is pending on this spec. FR-079's "current director" field is a piece-B concept (FR-084); this spec's
status read returns `director: null` and documents that it is reserved for piece B, rather than
leaving it a TBD.

## User Scenarios & Testing

### US1 — A normal turn, sharing on (SC-29)
Given an agent connection is live with sharing on, when the developer's session finishes a turn,
then the hook appends one masked line to `.wxai/session-feed.jsonl` in under 200 ms and exits 0.
- Edge: `WXAI_REMOTE=1` (the agent's own session) — nothing is written.

### US2 — K.A.I.N. reads status (SC-27)
Given a live, sharing connection with a recent feed update, when K.A.I.N. calls the status route or
MCP tool, then it receives a summary at most 60 seconds old, the last entry, blocker titles, state,
last-seen, and `live`/`stale`/`gone`; one `agent.status.read` audit row is written.
- Edge: the caller is out of `agentReach` — `404 not_granted`.

### US3 — Sharing off (SC-28, FR-005)
Given the Cockpit `shareStatus` setting is off, when a turn ends or a status read runs, then no
feed line is written, no summary rides the heartbeat, and the read returns `{ sharing: false }`
with no summary content; the status bar shows "Remote: live" only.

### US4 — A secret in a turn (SC-28)
Given a turn's last assistant message contains a secret pattern, when the hook writes the feed
line and the agent later uploads the summary, then the secret is masked on write and masked again
before upload, and never appears unmasked in the feed file, the connection record, or any response.

### US5 — A connection closes or lapses stale
Given a connection with sharing on and summary content set, when it closes or lapses stale, then
`sessionsummary`, `lastentry` and `blockers` are cleared on the next write to that record.

## Functional Requirements

### FR-001 — A per-turn hook writes the session feed (SCOPE-132 FR-076)
A kit hook runs at the end of each turn of the developer's session and appends one line to
`.wxai/session-feed.jsonl` (gitignored): the time and the turn's last assistant message, capped at
500 characters, masked with the existing handoff masker (`redactSecrets`,
`apps/remote-bridge/src/handoff-writer.ts`). The developer's prompt is never recorded.

**Acceptance Criteria**:
- [ ] Finishes in under 200 ms, always exits 0, and never blocks or fails a turn.
- [ ] Writes nothing when `WXAI_REMOTE=1` (the agent's own session), when sharing is off (FR-005
      below), or when no project agent is running for the repo.
- [ ] The file keeps only its last 200 lines.
- [ ] Ships through the kit hook sync (`core/orchestrator/routing-hooks-sync.ts`).

### FR-002 — The agent keeps a rolling summary (SCOPE-132 FR-077)
On new feed lines, the agent updates a rolling summary (at most 1,500 characters), the last entry
(at most 500 characters), and the open-blocker titles — its pending gates plus anything the summary
marks as blocked — written by the cheap model its routing tiers assign (SPEC-143).

**Acceptance Criteria**:
- [ ] No new lines: nothing is summarized and no model is called.
- [ ] Everything is masked a second time before upload (defense in depth against the first mask
      missing a plain-word secret).

### FR-003 — The summary rides the heartbeat (SCOPE-132 FR-078)
The existing SCOPE-151 heartbeat (FR-060) adds `{ summary, lastEntry, blockers, sharing }`. The
server overwrites them on the open connection record and keeps no history.

**Acceptance Criteria**:
- [ ] Five new `projectagentconnections` columns exist in both the application schema and the
      `mcp-server` schema mirror: `sessionsummary varchar(1500)`, `lastentry varchar(500)`,
      `blockers jsonb`, `sharing boolean NOT NULL DEFAULT false`, `summaryat timestamptz`.
- [ ] `sessionsummary`, `lastentry` and `blockers` are cleared when the record closes, lapses as
      stale, or a heartbeat reports `sharing: false`.
- [ ] A server that ignores the new fields changes nothing in the agent (backward compatible).
- [ ] Columns are applied by hand under SCOPE-117 and recorded in the schema-change-log before the
      Drizzle declaration ships, per CLAUDE.md's manual-schema-change convention.

### FR-004 — K.A.I.N. reads the summary (SCOPE-132 FR-079)
MCP `project.get_session_status { projectId }`, or `GET /api/agent/projects/:projectId/status` with
the device token. Returns the summary, last entry, blockers, state, last-seen, `live` / `stale` /
`gone`, and whether sharing is on.

**Acceptance Criteria**:
- [ ] Reach is checked against `agentReach` (SCOPE-132 FR-066) on every call; out of reach answers
      `404 not_granted`.
- [ ] Each read writes one `agent.status.read` audit row naming person and device.
- [ ] Sharing off returns `{ sharing: false }` and no summary content.
- [ ] The MCP tool and the REST route return the identical shape, with `director: null` (reserved
      for piece B, FR-084).

### FR-005 — Sharing is on by default, with a local off switch (SCOPE-132 FR-080)
The Cockpit setting `wxkanban.projectAgent.shareStatus` (per workspace, default on) turns sharing
off for a repo. The existing remote status bar item (SCOPE-132 FR-040) reads "Remote: live · sharing
status" while sharing, and "Remote: live" when not.

**Acceptance Criteria**:
- [ ] Setting defaults to on and is readable by the per-turn hook (FR-001) without a network call.
- [ ] Turning it off takes effect on the next heartbeat (FR-003 clears the content columns).
- [ ] Status bar text matches exactly as specified for both states.

### FR-006 — No regression to existing agent-connection behavior (SCOPE-132 FR-091, scoped to piece A)
Piece A ships independently of piece B and must not change existing HANDOFF REMOTE, room-path, or
SCOPE-151 connection-record behavior for any project that does not opt into or exercise these new
fields.

**Acceptance Criteria**:
- [ ] A test runs an existing HANDOFF REMOTE and a SCOPE-151 heartbeat cycle unmodified, with the
      new columns present but unused, and both behave exactly as before.
- [ ] The per-turn hook never touches `.remember` or any transcript file — only
      `.wxai/session-feed.jsonl`.

## Data Requirements

`projectagentconnections` — five new columns (FR-003), overwritten each heartbeat, never kept as
history: `sessionsummary varchar(1500)`, `lastentry varchar(500)`, `blockers jsonb`,
`sharing boolean NOT NULL DEFAULT false`, `summaryat timestamptz`. No new tables in this spec (the
`agentmailboxmessages` and `projectagentholds` tables belong to piece B, out of scope here).

## API Routes

| Surface | Route | Change |
|---|---|---|
| wxKanban app | `POST /api/project-agent/connections/:id/heartbeat` | **extended** — adds `summary`, `lastEntry`, `blockers`, `sharing` (FR-003) |
| wxKanban app | `GET /api/agent/projects/:projectId/status` | **new** — device token; reach-checked; audited (FR-004) |
| MCP | `project.get_session_status` | **new** — same result shape as the status GET (FR-004) |

## Frontend Components

- **Cockpit — project agent settings panel**: a `shareStatus` toggle (shadcn `Switch`, default on)
  beside the existing remote/autopilot switches (FR-005).
- **Cockpit — remote status bar item**: text updated to "Remote: live · sharing status" while
  sharing, "Remote: live" when off (FR-005). No other UI surface changes.

## Integration Context

Extends SCOPE-151's connection record and heartbeat rather than building a parallel channel; reuses
the existing handoff masker instead of a second masking implementation; summarization runs on the
SPEC-143 cheap model tier, never the session's own model. SPEC-154 (Project Agent Autopilot)
depends on this spec for its own 15-minute heartbeat content and for its `rollingSummaryBuilt`
release-gate prerequisite — this spec does not flip that flag itself; a human verifies it built and
flips it separately.

## Compliance

SOC 2 is the only framework currently enabled on this project.

- **CC6.1, CC6.3** — every status read is reach-checked against `agentReach` on every call; no
  standing grant is implied by a prior successful read.
- **CC7.2** — every status read writes one `agent.status.read` audit row naming person and device.
- **Known gap**: none introduced by this spec. SPEC-154's own release-gate gap (two of its three
  prerequisites unbuilt) is tracked there, not here; this spec only removes one of its three
  blockers once independently verified.

## Constraints

- Schema changes are applied by hand per CLAUDE.md (no migration ledger in production); declare in
  Drizzle only after the DDL is applied and verified, and record it in
  `specs/117-production-schema-integrity/schema-change-log.md`.
- TypeScript strict, no `any`, no `@ts-ignore`; Pino logging only, no `console.log`.
- Every top-level code unit fenced `[SCOPE 155 / Tnnn]`, written by the orchestrator (`implement`)
  only.
- The per-turn hook ships to every consumer repo through kit hook sync, including repos that have
  never heard of Autopilot or K.A.I.N. — it must be inert and harmless there (FR-001's exclusion
  rules exist specifically for this).
- Masking reuses the existing handoff masker; this spec does not invent a second masking
  implementation.
- This spec's bridge-side work lands in `wxkanban-agent/apps/remote-bridge`; after any edit there,
  rebuild `wxkanban-agent` so `dist/remote-bridge.cjs` matches source — the Cockpit's project agent
  runs the built bundle, not the TypeScript source.

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| R-23 (SCOPE-132) Session content leaves the machine carrying a secret or a client's confidential detail | High | Masked twice, capped, overwrite-only, local off switch, cleared on stop (FR-001, FR-002, FR-003, FR-005); SC-28 |
| R-24 (SCOPE-132) The hook slows or breaks turns in every consumer repo | High | Under 200 ms, always exits 0, does nothing without a running agent (FR-001); SC-29 |
| ~~New: `rollingSummaryBuilt` gets marked true in `AutopilotReleaseGate.ts` without independent verification~~ | — | Moot as of 2026-11-07: the prerequisite was removed from the gate entirely (see **Feeds**, above); there is no flag left to mark true without verification |
