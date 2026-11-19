# SCOPE-079: Cockpit Live Help — embedded wxKanban Community chat (YappChat-powered)

**Spec Number**: 079
**Status**: `implemented (cockpit side)` — built + committed 2026-07-05; pending YappChat endpoint deploy + end-to-end test
**Created**: 2026-06-28
**Amended**: 2026-07-04 (re-based onto YappChat's communities stack — Amendment A); 2026-07-05 (host-owned socket + build status — Amendment B); 2026-07-14 (server-side session broker — Amendment C: the consumer secret moves off the client)
**Depends On**: SPEC-042 (Dev Cockpit — the host surface); a small **new** YappChat consumer endpoint `POST /api/consumer/session` (provision-or-lookup + membership + session), plus YappChat's already-live communities + WS engine (external dependency)
**Source**: `specs/Project-Scope/079-cockpit-live-help.md` (originally converted from `YappChat/docs/integrations/wxkanban-cockpit-support.md`)

---

## Overview

The Cockpit gains a live help panel that drops the user straight into the **public group under the
"wxKanban Community" space** in YappChat, for real-time **community help** without leaving VS Code.

The extension Node host holds a dedicated wxKanban **consumer secret** (VS Code SecretStorage) and
calls a new YappChat endpoint `POST /api/consumer/session`, which **provisions-or-looks-up a YappChat
user keyed on the person's wxKanban email**, ensures they are a member of the wxKanban Community
space, and returns a `yc_session` token. The host keeps that session token, fetches a short-lived
(~60s) WS token from YappChat's existing `GET /api/ws/token`, and hands **only the WS token** to the
webview. The webview connects to the shared realtime engine at `wss://ws.wxperts.com`, subscribes to
the space's `conversation:{conversationId}` scope, renders the conversation, and sends messages
**back through the extension host** (host-proxied `POST /api/engine/conversations/{id}/messages`).
The consumer secret and the full session token never reach the browser/webview.

This re-base reuses YappChat's **existing** communities messaging, WS engine, and session/token
routes — the only new YappChat code is the one consumer endpoint. **Agent-assisted live support
(queues/agent console) is explicitly deferred** to a later spec.

### Core Design

| Element | Value |
| --- | --- |
| **Primary Actor** | wxKanban Cockpit user seeking community help |
| **Secondary Actors** | YappChat community members (external — read/answer in the wxKanban Community group); wxKanban extension host (holds the consumer secret + the returned `yc_session`, calls YappChat server-to-server); YappChat app/engine (external authority — provisions the user, grants membership, mints WS tokens, routes conversation events) |
| **Key Value** | Real-time community help inside the Cockpit, attributed to the real person, with the consumer secret + session kept server-side and only a 60s WS token exposed to the webview |
| **Scope Boundary** | **IN (wxKanban):** a Cockpit help-panel webview (open/close, status, scrollable message list, input) that stays `default-src 'none'`; the extension-host relay that calls `POST /api/consumer/session` with the consumer secret + the user's email, holds the `sessionToken`, fetches `GET /api/ws/token`, opens the WS, subscribes `conversation:{conversationId}`, renders `message.inbound/outbound` + typing, host-proxies sends via `POST /api/engine/conversations/{id}/messages`, and does heartbeat/reconnect/resume; a SecretStorage-backed consumer credential + set/clear commands; entry points (a Cockpit tree row + a button on the bug/suggestion screen). **IN (YappChat, new):** one endpoint `POST /api/consumer/session` (consumer-secret-guarded provision-or-lookup-by-email + space membership + session issuance). **OUT (reused, not built here):** the WS engine, `GET /api/ws/token`, `POST /api/engine/conversations/:id/messages`, community/space messaging + membership internals. **OUT (deferred):** agent-assisted live **support** (help queue + agent console), the wxKanban **web-app** surface + its server-side start route (this iteration lights up the VS Code Dev Cockpit only). |

---

## User Scenarios & Testing

### US1 — Happy path: get community help inside the Cockpit

**Actor**: wxKanban Cockpit user seeking community help

1. The user clicks **Community Help** in the Cockpit (or the button on the bug/suggestion screen).
2. The extension host provisions/looks-up their YappChat identity, ensures membership, and connects; the panel shows recent history and a live-connected state.
3. The user posts a question; community members reply; messages stream in real time.
4. The user closes the panel; the socket tears down.

**Expected outcome**: clicking Community Help → connected → two-way chat in the wxKanban Community group → close.

### US2 — Resilience: dropped connection mid-chat

**Actor**: wxKanban Cockpit user seeking community help

1. The connection drops while the user is mid-conversation.
2. The host re-fetches a fresh WS token (`GET /api/ws/token`, session still valid) and the webview reconnects and re-subscribes to `conversation:{conversationId}`.
3. It sends `resume` with the last event id and replays events missed within the 5-minute window.

**Expected outcome**: after reconnect, missed events within the window are replayed with no lost messages, and the conversation continues.

### US3 — Isolation & least exposure

**Actor**: any wxKanban Cockpit user

1. The user's connection only ever carries a **60s WS token** in the webview; the consumer secret and the `yc_session` live only in the extension host.
2. The webview subscribes only to the wxKanban Community space's `conversation:{conversationId}`.

**Expected outcome**: the consumer secret and session token appear nowhere in the webview/bundle; the user only receives that one conversation's events.

---

## Functional Requirements

### FR-001 — Extension-host consumer-session start path

The extension Node host holds `WXKANBAN_CONSUMER_SECRET` (VS Code SecretStorage), calls
`POST /api/consumer/session` with the user's `{ email, displayName }`, and receives
`{ sessionToken, userid, communityId, spaceId, conversationId }`. It keeps `sessionToken` host-side.

**Acceptance Criteria**:
- [ ] The host calls the consumer endpoint with the secret and the user's email, and retains the returned session + ids.
- [ ] `WXKANBAN_CONSUMER_SECRET` and the returned `sessionToken` are read/held only in the extension host and are never sent into the webview or any browser-bound payload.
- [ ] The user's email/display name is sourced from the wxKanban identity (or a one-time cached prompt) and forwarded.

### FR-002 — Help-panel UI in the Cockpit

The Cockpit exposes a help panel that opens/closes and shows session status, a scrollable message
list, and a message input, in a webview locked to `default-src 'none'` (scripts via nonce only).

**Acceptance Criteria**:
- [ ] The user can open and close the panel from the Cockpit (tree row and the bug/suggestion-screen button).
- [ ] The panel shows the current status (connecting, connected, disconnected/reconnecting).
- [ ] The message list and input render and scroll correctly during a conversation.

### FR-003 — WebSocket connect and subscribe

The host fetches a WS token via `GET /api/ws/token` (using the held `yc_session`) and passes it to
the webview, which connects to `wss://ws.wxperts.com?token=…` and subscribes to the space's
`conversation:{conversationId}`.

**Acceptance Criteria**:
- [ ] On open, the webview sends `{ action: "subscribe", scope: "conversation:{conversationId}" }` and receives `subscribed` (not `unauthorized_scope`).
- [ ] It handles `connected`, `subscribed`, `event`, and `replay_start`/`replay_end` frames.
- [ ] Only the 60s WS token is placed into the webview; the session token stays in the host.

### FR-004 — Render community messages

Events on `conversation:{conversationId}` are rendered; recent history is loaded on open.

**Acceptance Criteria**:
- [ ] `message.inbound` / `message.outbound` show sender + text; `message.deleted` tombstones are handled; typing events show/hide an indicator.
- [ ] On open, the panel loads recent history via the conversation history `GET` (host-proxied) and renders it before live events.

### FR-005 — Send messages (host-proxied REST)

The webview sends the user's message to the host, which posts it to YappChat with the held session —
not over the WS, and not directly from the webview.

**Acceptance Criteria**:
- [ ] A user message triggers, in the host, `POST /api/engine/conversations/{conversationId}/messages` with the `yc_session` and the text body.
- [ ] The webview never holds the session token and never posts to YappChat directly.

### FR-006 — Keep-alive, reconnect, and replay

The connection is kept alive, reconnects after a drop, and replays missed events.

**Acceptance Criteria**:
- [ ] The webview sends `{ action: "heartbeat" }` ~every 30s and tolerates `heartbeat_ack`.
- [ ] On reconnect the host re-fetches `GET /api/ws/token` and the webview re-subscribes.
- [ ] It sends `{ action: "resume", lastEventId: "…" }` and replays events missed within the 5-minute window.

### FR-007 — Close the panel

Closing the panel tears down the connection cleanly (community chat is persistent — there is no
help-session "end").

**Acceptance Criteria**:
- [ ] Closing unsubscribes and closes the socket; the host drops the in-memory session.
- [ ] Re-opening re-runs the start path from FR-001.

### FR-008 — Server-side session broker (Amendment C — supersedes the client-held secret in FR-001)

The consumer secret MUST NOT live on any client. A new wxKanban HTTP route `POST /api/community/session`
holds `WXKANBAN_CONSUMER_SECRET` server-side, calls YappChat's `POST /api/consumer/session` on the
caller's behalf with `{ email, displayName }`, and returns
`{ sessionToken, userid, communityId, spaceId, conversationId }` to the extension host. The route is
**open (no wxKanban login)** — the email is the identity key — and **rate-limited** to blunt abuse.
The extension host no longer prompts for or stores a consumer credential; a new user supplies only
their **email** (one-time cached). Steps 2–5 (history, `GET /api/ws/token`, WS, host-proxied send)
are unchanged — they use the returned per-user `sessionToken`, not the secret.

**Acceptance Criteria**:
- [ ] `WXKANBAN_CONSUMER_SECRET` appears 0 times in the extension host, the webview, and the built VSIX; it exists only in the wxKanban server env.
- [ ] A brand-new user opens Community Help and reaches connected by supplying only their email — no token prompt.
- [ ] `POST /api/community/session` is reachable without a wxKanban session and is rate-limited (repeated calls beyond the cap get a 429).
- [ ] The route returns the same `{ sessionToken, userid, communityId, spaceId, conversationId }` shape the host previously got directly, so steps 2–5 are unchanged.

---

## Data Requirements

This scope adds **no persistent wxKanban tables**. The YappChat user, `communitymembers`, and
`conversationmembers` rows live in YappChat (created by the consumer endpoint). The extension host
holds the current `sessionToken` + ids in memory for the panel's lifetime; the webview holds the
active `conversationId`, the 60s WS token, and the message list in memory only.

## API Routes

**No new wxKanban HTTP route.** One **new YappChat** route `POST /api/consumer/session`
(consumer-secret-guarded; provision-or-lookup user by email → ensure wxKanban Community + space
membership → issue session → `{ sessionToken, userid, communityId, spaceId, conversationId }`). The
host then uses YappChat's **existing** `GET /api/ws/token` and
`POST /api/engine/conversations/{id}/messages` (+ history `GET`). Deferred: a wxKanban web-server
start route for the web-app surface.

## Frontend Components

A Cockpit help-panel webview (panel container: open/close, status, scrollable message list, input +
send) copied from the existing feedback webview pattern (nonce CSP, `postMessage` bridge,
`retainContextWhenHidden`), plus an **extension-host relay** (`chatSocket`): calls the consumer
endpoint, holds the session, fetches the WS token, owns the `WebSocket` (Node global), dispatches
frames to/from the webview, proxies sends, and does heartbeat/reconnect/resume. Components land under
`vscode-extension/`.

---

## Success Criteria

1. End-to-end path passes: a Cockpit user goes from clicking Community Help to connected, sees recent history, exchanges messages live with the wxKanban Community group, and closes cleanly.
2. `WXKANBAN_CONSUMER_SECRET` and the `yc_session` token each appear **0 times** in the webview HTML and the built client bundle and in any browser-bound response; only the 60s WS token is ever posted to the webview.
3. After a forced disconnect mid-chat, the webview reconnects and replays missed events within the 5-minute window with **0** lost messages.
4. Time from clicking Community Help to the connected state is under ~3 seconds on a normal connection.

## Key Entities

- **YappChat user** (external, YappChat-owned) — one per person, keyed on the wxKanban email; provisioned-or-looked-up by the consumer endpoint.
- **community/space membership** (external, YappChat-owned) — `communitymembers` + `conversationmembers` rows granting access to the space's `conversation:{conversationId}`.
- **Client session state** (wxKanban, in-memory) — host: `sessionToken` + ids; webview: `conversationId`, WS token, message list.

---

## Constraints

- Consumer secret + session server-side only — the browser/webview only ever holds the ~60s WS token; the consumer secret and `yc_session` live only in the extension host.
- Least exposure — the webview subscribes to exactly one `conversation:{conversationId}` (the wxKanban Community space); sends are host-proxied.
- Receive over WebSocket, send over REST — the webview reads the conversation over WS and hands sends to the host, which posts via YappChat's REST message endpoint.
- Real per-user identity — users are provisioned/looked-up by email so posts are attributed to the person (locked decision, 2026-07-04).
- Dedicated consumer secret — a wxKanban-specific `WXKANBAN_CONSUMER_SECRET`, not the engine's `WS_INTERNAL_SECRET`, so wxKanban access is revocable in isolation (locked decision, 2026-07-04).
- Community help only — agent-assisted live support (help queue + agent console) is deferred (locked decision, 2026-07-04).
- Host coupling — only the VS Code extension host holds the consumer secret this iteration; the web-app surface cannot light up until its own server route ships.

## Notes

- Integration context: consumes a new YappChat consumer endpoint at `https://www.yappchatt.com/api/consumer/session` plus the existing `GET /api/ws/token` and `POST /api/engine/conversations/{id}/messages`, and the shared WebSocket engine at `wss://ws.wxperts.com`. Target group ids: community `019f1f30-9005-7678-847f-6217d13684ef`, space `019f1f32-0f0a-7ad6-8810-eaa6af97bec7` (env-overridable on the YappChat side). Hosts on the existing Dev Cockpit (SPEC-042).
- The original `/api/help/*` scoped-ticket + `helpqueue`/`helpsession` design was replaced (Amendment A) after the live YappChat code showed no such layer existed and the communities stack already provides everything needed.

## Clarifications

### Session 2026-06-28

| # | Question | Decision |
|---|----------|----------|
| 1 | Scope boundary — both sides or wxKanban only? | wxKanban side + one small new YappChat endpoint; the rest of YappChat is reused. |
| 2 | Scope number? | SCOPE-079. |
| 3 | Cockpit host? | Host-agnostic-ish widget; first (and only, this iteration) surface = VS Code Dev Cockpit. Components under `vscode-extension/`. |

### Session 2026-07-04 — Amendment A (re-base onto communities)

| # | Question | Decision |
|---|----------|----------|
| A1 | The `/api/help/*` scoped-ticket + `helpqueue`/`helpsession` protocol doesn't exist in YappChat. Build it, or reuse what's there? | **Reuse the existing communities stack.** Drop the user into the public wxKanban Community group; the only new YappChat code is one consumer endpoint. |
| A2 | How does a cockpit user appear in the community? | **Real per-user identity, keyed on the wxKanban email** (provision-or-lookup). |
| A3 | How does wxKanban authenticate to YappChat? | **A dedicated `WXKANBAN_CONSUMER_SECRET`**, revocable in isolation (not `WS_INTERNAL_SECRET`). |
| A4 | Support vs community help? | **Community help only** this pass; agent-assisted live support deferred to a later spec. |
| A5 | Where does the WS auth happen? | In the **handshake URL** (`?token=<WS token>`); the host mints/fetches it via `GET /api/ws/token` using the held session. Sends require a real `yc_session` and are **host-proxied**. |

### Session 2026-07-05 — Amendment B (host-owned socket + build status)

| # | Question | Decision |
|---|----------|----------|
| B1 | FR-003 has the **webview** open `wss://…` with the 60s WS token. The implementation instead keeps the **WebSocket in the extension host** (Node `ws`) and relays only rendered messages to the webview. Keep it? | **Yes — host-owned socket.** The webview never holds the consumer secret, the `yc_session`, *or* the WS token; it receives only `status/history/message/typing/error` payloads over `postMessage`. This is strictly safer than the written FR-003 and over-satisfies Success Criterion 2. FR-003's "webview connects" wording is **superseded** by this. |

**Build status (2026-07-05):** the wxKanban **cockpit side is implemented and committed** — `chatSocket.ts` (host relay + WebSocket), `chatPanel.ts` (webview, `default-src 'none'` + nonce), `auth.ts` consumer-credential + chat-user storage, a "Community Help" cockpit tree row, and a link on the bug/suggestion screen (all fenced `[SCOPE 079 / …]`). It compiles/bundles clean and fails gracefully when the endpoint is absent. **Remaining before it works for users:** deploy YappChat's `POST /api/consumer/session` (separate repo) and set `WXKANBAN_CONSUMER_SECRET`, then a manual end-to-end cockpit test. Ships (inert until the endpoint is live) with the next kit + cockpit release. Web-app surface remains **deferred**.

### Session 2026-07-14 — Amendment C (server-side session broker)

| # | Question | Decision |
|---|----------|----------|
| C1 | A new user clicking Community Help was prompted for a **token** (the consumer secret) then email — but the secret only exists on the app operator's machine, so new users were stuck. Where should the secret live? | **On the wxKanban server, brokered.** Add `POST /api/community/session`; the server holds `WXKANBAN_CONSUMER_SECRET` and calls YappChat's consumer endpoint on the user's behalf. The client never holds it. |
| C2 | How is the broker protected, given a new user has no wxKanban token? | **Open (no login) + rate-limited.** The email is the identity key; a per-IP/email rate limit blunts abuse. |
| C3 | What changes on the client? | The extension host drops the consumer-secret prompt/SecretStorage entirely and calls the wxKanban broker with `{ email, displayName }`. Only the **email** is prompted (one-time). Steps 2–5 unchanged. |
| C4 | Where does `WXKANBAN_CONSUMER_SECRET` live now? | The **wxKanban app server env** (App Runner console) — removed from the client. |

**Amendment C build status (2026-07-14):** FR-008 broker + the cockpit rewire implemented this pass. The secret moves to the wxKanban server env; the Cockpit prompts email only. Deploy note: set `WXKANBAN_CONSUMER_SECRET` (and the YappChat base URL) on the **wxKanban App Runner** service; repackage + publish the Cockpit.
