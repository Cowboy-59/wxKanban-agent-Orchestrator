# SCOPE-102: Remote Session Bridge

**Spec Number**: 102 (SCOPE namespace)
**Status**: `draft`
**Created**: 2026-07-18
**Depends On**: SCOPE-079 (YappChatt broker + ChatSocket transport)
**Related**: SCOPE-097 (token↔project binding pattern), SCOPE-043 (feedback needs-info round-trip)
**Source**: `specs/Project-Scope/102-remote-session-bridge.md`

> Numbering note: `project.buildscope` auto-registered a genericized draft as DB spec "100"
> (collides with the founder-bio scope) and wrote nothing to disk. This hand-materialized file is
> the authoritative artifact at the correct next SCOPE number (102). See CLAUDE.md
> "Scope vs Spec Numbering" and SCOPE-089.

---

## Overview

A per-project **Remote Session Bridge** — a process launched by saying **`GO REMOTE`** to Claude —
hands off the current conversation to a headless, bypass-mode Claude session and relays it to that
project's **private YappChatt room**. It streams the session's output to the operator's phone and
turns the operator's messages in that room into live input: answer (continue-and-fold), steer,
`STATUS`, `VERBOSE`/`CONCISE`, `STOP`/`CONTINUE`, a review-gated `CONFIRMED`/`NO` push, and
`CANCEL REMOTE`. Because each project has its own room, several concurrent sessions can be monitored
and driven independently from the phone while the operator is away from the desk. The phone runs
nothing but the YappChatt app.

## Business Problem

A developer starts a Claude build at the desk, then leaves (a meeting, out of office). The session
freezes at the first question or native permission prompt and sits idle until the developer is
physically back — worse when several projects run at once, so multiple sessions stall together. The
result is dead throughput: work that could finish in the background instead halts the moment it needs
a decision, and a day's output shrinks to whatever fits between desk sessions.

## Actors

- Primary: Developer/operator running Claude coding sessions locally across one or more projects.
- Secondary: The YappChatt service and the operator's phone chat client, which host the room and carry messages; and kit maintainers who own the reused broker, the ported transport, and the wxUIUXCodeReview push gate.

## Scope Boundary

- The per-project bridge process and its two-way relay to that project's private room.
- `GO REMOTE` launch that seeds/resumes the headless session from the current conversation.
- Per-project room binding via a per-repo env var — the room `conversationId` in `WXKANBAN_REMOTE_ROOM_ID` in the project's `.env` (per-project falls out because `.env` is per-repo; `.wxai/project.json` accepted as an optional fallback for parity with the API token). Keeps room ids out of git.
- Running multiple bridges concurrently, one per project, each bound to its own room.
- Session lifecycle control from the room: start when idle, answer (continue-and-fold), steer, `STATUS`, `VERBOSE`/`CONCISE`, `STOP`/`CONTINUE`, and `CANCEL REMOTE`.
- Bypass-permissions execution with steer-by-message.
- Review-gated push: wxUIUXCodeReview must be clean, the bridge asks, the operator replies `CONFIRMED` or `NO`.
- Resilience/reconnect with resume, and secret-safe identity via the existing broker-minted `yc_session`.

## Out of Scope

- Cloud or always-on hosting — dev-machine only.
- Any cockpit UI change or button.
- A hard native-permission approval gate (full bypass is chosen instead).
- YappChatt product changes — the operator provisions each project's private room inside YappChatt.
- Multi-participant or team rooms — single operator per room.
- Central server-side project→room mapping — deferred as a future Option-B scope.
- New wxKanban database tables, API routes, or frontend.

## User Scenarios & Testing

### US1 — Monitor and answer while away (happy path)

The operator starts a build on wxKanban at the desk, says `GO REMOTE`, and leaves. In the wxKanban
room on the phone, progress streams in (assistant text; one summarized line per tool action). The
session hits a decision — "Refactor the shared client, or duplicate it? A/B." The operator replies
`B`; the bridge folds it into the running session, which continues and posts a turn summary. When
done, the operator says `CANCEL REMOTE` to end remote mode.
**Expected:** the reply reaches the running session within a few seconds and it resumes; the room
shows the question, the answer, and the summary in order; `CANCEL REMOTE` cleanly ends the session.

### US2 — Two projects at once, steer one mid-run (secondary)

Bridges run for wxKanban and Blue Cube — two rooms on the phone. Blue Cube streams a long edit;
wxKanban's room shows a question. The operator answers wxKanban, then tells Blue Cube "stop — use the
existing helper instead of a new one," and that session redirects. The two never cross.
**Expected:** a message in one project's room only ever affects that project's session; both sessions
progress independently in parallel.

### US3 — Start fresh, abort, and a dropped connection (edge cases)

The wxKanban session is idle. From the phone the operator types a new instruction and the bridge
starts exactly one new task. A minute in, it heads the wrong way, so the operator sends `STOP` and it
halts. Separately, the phone briefly loses signal; on reconnect the room catches up with no lost
messages and the bridge is still attached to the same session.
**Expected:** an idle message starts one task; `STOP` halts within seconds; reconnect resumes cleanly
with no lost messages.

## Functional Requirements

### FR-001 — Launch & room binding (`GO REMOTE`)

Saying `GO REMOTE` to Claude starts the per-project bridge. It reads `projectId`, the MCP API token,
and the room `conversationId` from local config (the kit's existing bootstrap path — `.wxai/project.json`
then `.env`), seeds/resumes the headless session from the current conversation, joins that project's
Project Session Room as participant "Claude," and confirms the room is live so the operator can leave.
One `GO REMOTE` per project gives one bridge and one room.
**Acceptance:** starts from local config; seeds from the current conversation; joins the correct room;
refuses to start with a clear error if the room id is missing; two repos launch two bridges bound to
two different rooms; the bridge echoes room/project identity on launch.

### FR-002 — Outbound streaming to the room

Relay session activity into the room: assistant text as-is; each tool action as one concise
summarized line (not raw dumps); questions as visibly distinct messages; a short turn-end summary.
Concise by default; `VERBOSE` shows the fuller stream, `CONCISE` returns to summarized. On connect it
posts a `Claude on project <name> is connected` announce so the operator sees the bridge come alive
(the symmetric disconnect notice is FR-009).
**Acceptance:** assistant text and summarized tool lines appear in order; a question is clearly
marked; output is readable, not a flood; no credential or secret is ever posted.

### FR-003 — Inbound control: start / answer / steer (continue-and-fold)

A room message routes by session state: when idle it starts one new task; when running it is injected
as steering or answer input without hard-blocking — the session keeps doing whatever it can and folds
the answer in when it arrives.
**Acceptance:** an idle message starts exactly one task; a running message is folded into the live
session; the session never sits frozen waiting when other work is available; the answer is reflected
in later output.

### FR-004 — Control vocabulary

Exact, case-insensitive control signals, treated as control rather than task text:
`STOP` halts the running task, `CONTINUE` resumes a stopped task, `STATUS` returns a current-activity
summary, `VERBOSE`/`CONCISE` set output detail, `PUSH` requests a review-gated push, `CONFIRMED`/`NO`
approve or decline a pending push (FR-006), and `CANCEL REMOTE` ends remote mode (FR-009).
**Acceptance:** each is recognized as control, not task input; `STATUS` returns within a few seconds;
toggles change verbosity; `CONFIRMED`/`NO` are only meaningful against an open push request; any
non-keyword message passes through as a task or answer.

### FR-005 — Bypass-with-steer execution

The session runs in bypass-permissions mode so native permission prompts never freeze it; the
operator steers by messaging rather than approving each action.
**Acceptance:** no native prompt blocks the session; actions proceed unless `STOP`ped or
`CANCEL REMOTE`d; the operator can redirect at any point via a room message.

### FR-006 — Review-gated push

Push is **operator-initiated** (the session can never `git push` itself — it is blocked at the SDK
level): the operator sends `PUSH`. Then, in order: first wxUIUXCodeReview runs and must be clean (zero
findings) — if it is not clean, push is not offered and the findings are posted; then, once clean, the
bridge asks in the room, naming the exact branch and remote; then the *bridge itself* runs `git push`
only on an explicit `CONFIRMED`. `NO`, or any other reply, cancels. The bridge never pushes unattended.
**Acceptance:** a push runs only when review is clean and the operator replied `CONFIRMED`; a
non-clean review blocks the offer and surfaces findings; `NO` cancels; the ask names the exact target.

### FR-007 — Resilience / reconnect

Websocket drops (signal loss, phone sleep) reconnect with resume and heartbeat; the bridge stays
attached to the same session across reconnects and no room messages are lost.
**Acceptance:** after a dropped connection the room catches up with missed messages and the session
continues; the socket is kept alive by heartbeat.

### FR-008 — Secret-safe identity

The bridge authenticates as the operator via a per-user `yc_session` minted by the existing server
broker; the YappChatt consumer secret never touches the bridge — only the `yc_session` and the
project's local API token live locally.
**Acceptance:** no consumer secret appears in bridge config, logs, or any room message; the bridge
posts using the brokered `yc_session`; the broker mints the session server-side.

### FR-009 — Cancel Remote (end handoff)

`CANCEL REMOTE` ends remote mode entirely: it stops any running task, tears down the session and
handoff, posts a final "remote ended" notice to the room, and disconnects — returning control to the
desk. This is distinct from `STOP`, which halts only the current task and leaves the bridge live for
`CONTINUE` or a new task.
**Acceptance:** `CANCEL REMOTE` halts any running task and closes the bridge within a few seconds; the
room shows a final notice; afterward room messages no longer drive a session; `STOP` alone never
closes the bridge.

## Success Criteria

1. End-to-end phone-only: for at least 5 representative tasks, the full loop (`GO REMOTE`, watch output, answer at least 1 question, session finishes the turn) completes with zero desk interaction after `GO REMOTE` — target 5 of 5.
2. Round-trip latency: a room message (answer, steer, or control) takes effect within 5 seconds, and `STATUS` returns within 5 seconds, measured across at least 20 messages.
3. Per-project isolation: with two bridges running, a message in one project's room affects only that project's session — 0 cross-talk across at least 10 interleaved messages.
4. Push gate holds with zero tolerance: 0 pushes occur unless review was clean and the operator replied `CONFIRMED`; 100% of non-clean reviews block the offer; 100% of `NO` replies cancel.
5. Resilience: after a forced disconnect, the room catches up with 100% of missed messages and the session continues, across at least 5 trials.
6. Secret safety: the YappChatt consumer secret appears in 0 places on the bridge (config, logs, room), verified by inspection.
7. Clean teardown: `CANCEL REMOTE` ends the session and disconnects the room in 100% of trials with no orphaned session or lingering socket.

## Data Requirements

None. The room `conversationId` lives in local per-project config (Option A); this scope adds no
tables and no persistence. A future Option-B scope may add a server-side project→room mapping.

## API Routes

None new. The bridge reuses the existing broker endpoint `POST /api/community/session` (SCOPE-079)
to mint the `yc_session`, then talks to YappChatt's own REST and WebSocket directly.

## Frontend Components

None. The phone uses the existing YappChatt app; there is no cockpit or web UI change in this scope.

## Technical Notes

New code is kit-only, under `wxkanban-agent/`: a `remote-bridge` app at
`wxkanban-agent/apps/remote-bridge/`; a shared YappChatt client ported from
`vscode-extension/src/services/chatSocket.ts` into `wxkanban-agent/core/`; the `GO REMOTE` handoff
via the Claude Agent SDK (session resume/seed, with transcript-replay fallback); and the room
`conversationId` read from a per-repo env var `WXKANBAN_REMOTE_ROOM_ID` (in `.env`), resolved the same
way the ported transport already reads `WXKANBAN_WS_URL` / `WXKANBAN_YAPPCHAT_BASE_URL`, with
`.wxai/project.json` as an optional fallback. This aligns with existing workflows: it
reuses the SCOPE-079 broker and transport, mirrors SCOPE-097 (token↔project binding) as the pattern a
future central room mapping would follow, and reuses the SCOPE-043 feedback needs-info round-trip as
the proven question-to-answer precedent.

## Constraints & Risks

- Dev-machine only — if the machine sleeps or loses network, the session stops (no failover).
- The private room is the security boundary. Under bypass, anyone who can post in a Project Session
  Room can run code on the operator's machine, so rooms must be strictly private and single-operator.
- Push is the sole gated action (clean wxUIUXCodeReview plus explicit `CONFIRMED`), upholding the
  standing rule that commits accrue locally and nothing pushes without an explicit human word.
- Wrong-room risk under Option A: a mistyped `conversationId` would stream output to the wrong room;
  mitigated by the bridge echoing room/project identity on launch (FR-001).
- Out-of-repo dependencies: the existing broker, a private YappChatt conversation the operator
  provisions, and the YappChatt-side `POST /api/consumer/session` endpoint (flagged pending in
  SCOPE-079). The bridge cannot be fully verified until that room exists.
- Handoff depends on the Agent SDK exposing session resume/seed; transcript replay is the fallback.
- Definition: "clean review" means wxUIUXCodeReview returns zero findings.

## Deferred (each its own future scope)

- Option B: central server-side project→room mapping (mirrors SCOPE-097).
- Multi-participant or team rooms.
- Cloud or always-on hosting.
- A cockpit "Go Remote" button.
- A hard native-permission approval gate.

## Clarifications

### Session 2026-07-18 (interactive buildscope with the operator)

- Rooms are per-Project (e.g. wxKanban, Blue Cube), so concurrent sessions are each monitored separately.
- Room-to-project mapping uses local config (Option A): a per-repo env var `WXKANBAN_REMOTE_ROOM_ID` in `.env` (per-project because `.env` is per-repo; keeps room ids out of git), resolved like the transport's other `WXKANBAN_*` env config, with `.wxai/project.json` as optional fallback. A central server mapping is deferred (Option B). Multiple rooms per project would need distinct env names — deferred.
- Answers use continue-and-fold: the session does not hard-pause; it folds a reply in when it lands.
- Control words are STOP, CONTINUE, STATUS, VERBOSE/CONCISE, CONFIRMED/NO, and CANCEL REMOTE.
- Push is allowed remotely only when wxUIUXCodeReview is clean and the operator replies CONFIRMED; otherwise no push.
- CANCEL REMOTE ends the whole remote handoff, distinct from STOP which only halts the current task.
- `GO REMOTE` is said to Claude and hands off the current conversation's context to the headless bridge session.
- Single operator per room; the socket is symmetric but multi-participant rooms are out of scope.

## Amendment A — Selective approval gating & API-key isolation (2026-10-25)

**Evidence.** On 2026-10-25 the operator drove a live SPEC-037 T081 endpoint test from the desk while
deliberately emulating remote, to find out what remote can actually carry. The task took roughly eight
Bash calls — most of them read-only (grep, schema lookups, log reads) and exactly one that mutated
production (the bulk assignment add). Two findings came out of it:

1. Under FR-005 the session runs in bypass mode, so nothing asked — which is fine at the desk but means
   a remote operator gets **no** say over the one call that mattered.
2. When the harness *does* surface a prompt per call, the operator's verdict was blunt: eight approval
   prompts on a phone are "useless remote". Per-call approval is the wrong unit of consent.

So the gap is not "more prompts" or "no prompts" — it is that consent is being asked at the wrong
granularity. This amendment adds a **selective** gate: silence for read-safe work, one question for a
mutation, and one question for a planned batch.

**Scope-boundary note.** "A hard native-permission approval gate" is listed under *Deferred* above, and
stays deferred: native prompts remain off and FR-005's bypass-with-steer is unchanged. What this
amendment promotes into scope is narrower — a bridge-owned gate on a classified subset of calls. It is
explicitly not a general permission UI.

### FR-010 — Command classification (read-safe vs mutating)

The bridge classifies each intercepted tool call as **read-safe** or **mutating** before it runs.
Read-safe means it cannot change repo files, the database, or any remote system — searches, file reads,
schema and log inspection, test runs, type checks, dry-run commands. Mutating means anything else:
writes to tracked files, any command that reaches a production database or external API, package
installs, and anything already gated by FR-006. Classification is allow-list by shape, and anything the
bridge cannot classify is treated as **mutating** — the safe default, because a misread read is cheap and
a misread write is not.
**Acceptance:** a session of read-only inspection asks nothing; an unrecognised command is gated, not
waved through; the classifier's verdict for each call is visible in `VERBOSE` mode.

### FR-011 — Mutation gate: one question, in the room, with the blast radius

A mutating call suspends and the bridge asks in the room before it runs. The ask names the operation in
plain words, the target (database, branch, remote, file count), and — where the bridge can compute it
cheaply — **what will change**: row counts, project names, how many records a bulk operation touches.
`YES` runs it, `NO` skips it and continues the task, `STOP` halts the task as in FR-004. No reply inside
the gate timeout = not approved: the call is skipped and the room is told it timed out.
**Acceptance:** a prod-mutating call never runs without an explicit `YES`; the ask states the target and
the measured blast radius, not just the command text; silence never approves; `NO` leaves the session
alive and working.

### FR-012 — Plan approval for a batch

Before a multi-step task the bridge may post a numbered plan of the mutating steps it expects and ask
once. `APPROVE PLAN` pre-authorises exactly those steps, so they run without further asks; any step not
on the approved plan still gates under FR-011. The approval dies with the task — it is never a standing
grant for the session.
**Acceptance:** an approved plan runs its listed mutations unprompted; a step that deviates from the plan
raises a fresh ask naming the deviation; a new task starts with no inherited approval.

### FR-013 — The bridge child never inherits the Anthropic API key

The headless CLI the bridge spawns must run on the operator's subscription, not a metered API key.
`ANTHROPIC_API_KEY` is stripped from the child environment unless `WXKANBAN_REMOTE_USE_API_KEY=1` is set
deliberately. Stripping is done when building the child env, so it holds no matter what the parent shell
or the Windows user environment carries.
**Acceptance:** with an `ANTHROPIC_API_KEY` present in the parent environment the bridge child still bills
the subscription; setting `WXKANBAN_REMOTE_USE_API_KEY=1` restores the old behavior; the room shows which
billing path is in use at session start.

*Defect this closes:* on 2026-10-25 the bridge's headless CLI picked up `ANTHROPIC_API_KEY` from the
Windows user environment and failed with "Credit balance is too low" instead of using the subscription.

**Status 2026-11-07 (T014):** the strip itself is built and verified — `buildChildEnv()`
(`remote-bridge/src/child-env.ts`) is wired into both spawn sites (`session.ts:143`,
`triage-run.ts:223`) and this is what SPEC-154's release gate now checks. The room-announcement half
of this acceptance criterion ("the room shows which billing path is in use at session start") is
**not yet implemented** — `buildChildEnv()` computes `billingPath` but nothing currently surfaces it
to the room. Tracked as a follow-up task, not re-opening the gate (the gate only ever checked the
strip, not the announcement).
The operator had to remove the variable from his user environment and restart VS Code to recover.

### Technical note — the gate is a `PreToolUse` hook, never `canUseTool`

`canUseTool` is **not consulted** under `permissionMode: "bypassPermissions"`. This was found live on
2026-09-25: the review gate was wired to `canUseTool`, never ran, and push went ungated. FR-010 to
FR-012 must therefore be implemented as `PreToolUse` hooks with an explicit timeout, matching the
existing `push-gate.ts` / `override-gate.ts` pattern in `apps/remote-bridge/src/`, and the matcher must
cover the file-writing tools, not only `Bash`. Any future work that reaches for `canUseTool` here is a
regression.

### Deferred by this amendment

- Learning the classification from operator decisions (an "always allow this shape" memory).
- Gating on a cost or time estimate rather than a mutation/read distinction.
- Approving a plan once and reusing it across sessions.
