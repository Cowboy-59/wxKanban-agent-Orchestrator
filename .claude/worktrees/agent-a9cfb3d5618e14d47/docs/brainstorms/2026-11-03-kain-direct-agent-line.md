# Brainstorm: K.A.I.N. connects directly to the repo agent

- **Status:** closed
- **Opened / last updated:** 2026-11-03 / 2026-11-03
- **Source:** internal (operator idea)
- **Asked for by:** the operator; K.A.I.N. is still under development, so there are no K.A.I.N. clients in the field
- **Level:** senior
- **Next item:** none

## The request

Give K.A.I.N. a way to reach a repo's Project Agent directly, without HANDOFF REMOTE and without YappChatt. The repo agent and K.A.I.N. each connect to a meeting point with enough information to say who they are, and talk there. The problem behind it: a handoff is a one-time snapshot, so everything said in the operator's session afterwards never reaches the agent; and the YappChatt room has been missing things that should be happening, which the operator suspects is the room connection dropping and nothing reacting. The agent should follow the session continuously, keep a rolling summary and the last entry, and give them to K.A.I.N. on demand. HANDOFF REMOTE stays, for YappChatt only.

## What already exists

| Item | Status | Evidence | Confidence |
|---|---|---|---|
| A wxKanban-hosted `/bridge` WebSocket agents can join | Not found | searched `src/server`, `wxkanban-agent`, `mcp-server` | Likely |
| The only live agent transport is the YappChatt room WebSocket | Built | `wxkanban-agent/core/yappchatt/client.ts:1`; `wxkanban-agent/apps/remote-bridge/src/bridge.ts:110-136` | Confirmed |
| App Socket.IO server: JWT check is a `TODO`, and `initializeSocketIO` is never called | Built, dead code | `src/server/lib/socket.ts:14, 26-39` | Confirmed |
| HANDOFF REMOTE: one-shot file drop to `.wxai/handoff/`, posted once, 4-hour expiry | Built (SCOPE-149) | `wxkanban-agent/apps/remote-bridge/src/handoff-watch.ts:7-25` | Confirmed |
| The Project Agent is its own headless SDK session and cannot see the operator's session | Built (SCOPE-102) | `wxkanban-agent/apps/remote-bridge/src/session.ts:5-12` | Confirmed |
| Session → agent local file channel (Ask Gate outbox) | Built (SPEC-142) | `wxkanban-agent/apps/remote-bridge/src/outbox.ts:5-8` | Confirmed |
| Agent connection record refreshed each heartbeat with idle/working/waiting; one agent per project (409) | Built (SCOPE-132 Amendment D, SPEC-151) | `wxkanban-agent/apps/remote-bridge/src/connection-record.ts:1-24` | Confirmed |
| K.A.I.N. device token + 12-hour project MCP token; reach worked out per call | Built (SCOPE-132 Amendment F, SPEC-152) | `docs/kain-contract.md` sections 1-3 | Confirmed |
| K.A.I.N.'s connect creates the room first and returns 409 `no_company_account` without YappChatt | Built | `src/server/services/AgentConnectService.ts:115, 286` | Confirmed |
| K.A.I.N.'s identity in the room is a `[KAIN]` text tag on a shared agent user | Built | `wxkanban-agent/apps/remote-bridge/src/bridge.ts:335-345` | Confirmed |
| All gates (push, override approval, DQ/KR decisions, control words, handoff guard) run on one inbound path | Built | `wxkanban-agent/apps/remote-bridge/src/bridge.ts:346-375`; `override-gate.ts:1-22` | Confirmed |
| "K.A.I.N. and the project agent talk in the room" | Decided before (SCOPE-132 FR-032) | `specs/Project-Scope/132-kain-autonomous-driver.md:456` | Confirmed |
| Automatic handoff at session end; Cockpit last-handoff display | Parked before | `docs/brainstorms/2026-10-27-go-remote-handoff.md` rows 12, 14 | Confirmed |
| YappChatt client ignores `heartbeat_ack`, so a half-open socket is never detected | Built (defect) | `wxkanban-agent/core/yappchatt/client.ts:313, 348-357` | Likely |
| YappChatt session provisioned once; reconnects reuse an expired cookie forever | Built (defect) | `wxkanban-agent/core/yappchatt/client.ts:139, 270-277` | Likely |
| Reconnect replays only a 5-minute window, silently | Built (defect) | `wxkanban-agent/core/yappchatt/client.ts:286-287` | Confirmed |
| The bridge reacts only to `connected`; reconnecting/error go to a log line | Built (defect) | `wxkanban-agent/apps/remote-bridge/src/bridge.ts:141-146` | Confirmed |
| App Runner supports long-lived WebSockets | Unknown | not checked | Unknown |

## Panel

Spoke: Lead Architect, Domain Analyst, Backend, Frontend, DevOps, Security, QA, Documentation, Database (called in at item 3) · Sat out: Legacy, Migration

## Decisions

| # | Item | Decision | Kind | To scope? | Date |
|---|---|---|---|---|---|
| 1 | The need | A two-way direct line: K.A.I.N. reads the agent's state and directs the agent, and does not use the room at all. HANDOFF REMOTE stays, YappChatt only. (The request began as a read-only summary; the chair suggested read-only) | Changed | yes | 2026-11-03 |
| 2 | Who uses it | The operator now; later any person in the existing K.A.I.N. reach table, consultants included, with no new access rules. Many read, one directs: an explicit directing hold, released on stop, lapsing after 3 minutes of silence. Every direction audited with person and device; the Agent Access panel shows the current director | Agreed | yes | 2026-11-03 |
| 3 | Reuse or build new | An agent mailbox on the wxKanban app: both sides long-poll over HTTPS with the credentials they already hold, through the existing reach, Allow-remote and audit rules; a small mailbox table; a transport-neutral message format so a WebSocket can replace long-polling later | Agreed | yes | 2026-11-03 |
| 4 | Smallest useful version | Piece A (read): a per-turn masked kit hook appends to `.wxai/session-feed.jsonl`; the agent keeps a rolling summary and the last entry (cheap model per routing tiers); they ride the SCOPE-151 connection-record heartbeat; K.A.I.N. reads them through one MCP tool / GET. Piece B (direct): mailbox, directing hold, gates, audit and panel. Out of the first build: WebSocket, raw transcript, history, Cockpit live view | Agreed | yes | 2026-11-03 |
| 5 | Reversing SCOPE-132 FR-032 | SCOPE-132 Amendment G: FR-032 narrowed (the room is for people and HANDOFF REMOTE; K.A.I.N. directs through the mailbox) with a superseded note; new FRs for pieces A and B; `docs/kain-contract.md` updated in the same release; K.A.I.N.'s connect no longer creates or requires a room | Agreed | yes | 2026-11-03 |
| 6 | Session content leaving the machine | Only the rolling summary (at most 1,500 characters), the last entry (at most 500) and open-blocker titles leave, masked twice (feed line and before upload) with the handoff masker; the feed file is gitignored; overwrite-only on the connection record, no history, cleared on stop or lapse; runs when Allow remote is on and the agent runs; on by default with a local per-repo off switch; Cockpit shows "Remote: live · sharing status"; K.A.I.N. reads audited | Agreed | yes | 2026-11-03 |
| 7 | App Runner WebSocket support | Defused by the mailbox: long-polls held about 50 seconds, inside the App Runner request limit (believed 120 seconds, to confirm at spec time); WebSocket support is a later fact, not a blocker | Agreed | yes | 2026-11-03 |
| 8 | Identity on the mailbox | The agent uses its existing project kit token; a project's mailbox is served only to the agent holding the open connection record, so the single-agent rule carries over. K.A.I.N.'s identity is stamped by the server (person and device) from the device token; reach and the hold are checked on every post | Agreed | yes | 2026-11-03 |
| 9 | Regression | The per-turn hook runs under 200 ms, always exits cleanly, never blocks or fails a turn, does nothing when `WXAI_REMOTE=1` (the agent's own session), keeps the feed to 200 lines, and ships through the kit hook sync. The mailbox poll loop is isolated from the room socket, triage, handoff watcher and outbox. HANDOFF REMOTE unchanged | Agreed | yes | 2026-11-03 |
| 10 | Gates on the direct line | Room and mailbox messages enter one inbound path, so every gate, control word and decision handler applies unchanged. A gate answer on the mailbox needs the directing hold and Room Approver (the SPEC-144 list). A waiting gate is announced on both channels; the first valid answer wins, the other channel is told, and the audit records channel, person and device | Added | yes | 2026-11-03 |
| 11 | Mailbox reliability | Every poll is a heartbeat; the server keeps last-seen for both sides (live within 90 seconds, stale, gone after the 3-minute lapse). A 401 goes to the existing token renewal (agent) or a new sign-in (K.A.I.N.), never a silent loop. Messages are sequenced, acknowledged and redelivered; they expire after 24 hours with an "N expired unread" notice. A direction delivered more than 10 minutes after it was sent needs the holder to reconfirm it | Added | yes | 2026-11-03 |
| 12 | Fit and priority | Now, in order: the YappChatt reconnect fix; SCOPE-132 Amendment G through /buildscope then the G.O.D. flow; piece A released; piece B released with the K.A.I.N.-side mailbox client | Agreed | yes | 2026-11-03 |
| 13 | WebSocket `/bridge` on the app | Declined: App Runner WebSocket support is unknown, and two instances may never meet | Declined | no | 2026-11-03 |
| 14 | Separate relay service | Declined: a new service to run, and it would duplicate reach, Allow-remote and audit | Declined | no | 2026-11-03 |
| 15 | Raw transcript or `.remember` as the source | Declined: the transcript holds too much to send off the machine, and `.remember` is a third-party plugin | Declined | no | 2026-11-03 |
| 16 | YappChatt reconnect defect | Parked: a separate fix, done first (heartbeat ack ignored, session never renewed, 5-minute replay gap, status never shown) | Parked | no | 2026-11-03 |
| 17 | Agent runs mailbox-only without a company YappChatt account | Parked: a separate topic; it changes how the agent starts for every customer | Parked | no | 2026-11-03 |

## Open items

- Confirm the App Runner request time limit at spec time (row 7).
- Confirm where the SPEC-144 Room Approver list is stored before the gate rule is specified (row 10).
- `buildscope` EDIT is known to drop added FRs silently; check Amendment G's FRs after it runs.

## Next step

Taken to `/buildscope` as SCOPE-132 Amendment G (rows 1-12).
