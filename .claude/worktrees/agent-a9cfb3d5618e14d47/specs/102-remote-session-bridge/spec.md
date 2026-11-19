# Spec 102: Remote Session Bridge

**Spec Number**: 102
**Status**: planned
**Created**: 2026-07-18
**Scope**: `specs/Project-Scope/102-remote-session-bridge.md` (SCOPE-102)
**Depends On**: SCOPE-079 (YappChatt broker + ChatSocket transport)
**Related**: SCOPE-097 (token↔project binding), SCOPE-043 (feedback needs-info round-trip)

> Implementation spec. The full narrative, scenarios, and success criteria live in the SCOPE-102
> scope doc; this file is the build-facing view — components, interfaces, and FR→task mapping. It
> mirrors the DB spec created by `project.create_specs` (spec id `46d174ea-bc15-4357-8c00-5babcf2d7cf8`).

## Summary

A per-project **Remote Session Bridge** launched by saying `GO REMOTE` to Claude. It hands off the
current conversation to a headless, bypass-mode Claude session (Agent SDK) and relays it to that
project's **private YappChatt room**: streaming output to the operator's phone and turning room
messages into live input (answer/steer/start/stop/status/cancel, plus a review-gated push).

## Functional Requirements (build view)

| FR | Requirement | Primary tasks |
|----|-------------|---------------|
| FR-001 | `GO REMOTE` launch, local-config room binding, seed/resume from current conversation, echo identity | T002, T003, T004 |
| FR-002 | Outbound streaming (concise default; `VERBOSE`/`CONCISE`); no secret ever posted | T001, T005 |
| FR-003 | Inbound routing: idle→start one task, running→continue-and-fold answer/steer | T006 |
| FR-004 | Control vocabulary: `STOP` `CONTINUE` `STATUS` `VERBOSE` `CONCISE` `CONFIRMED` `NO` `CANCEL REMOTE` | T007 |
| FR-005 | Bypass-with-steer execution (headless Agent SDK, `bypassPermissions`) | T003 |
| FR-006 | Review-gated push: clean wxUIUXCodeReview → ask → push only on `CONFIRMED`; never unattended | T008 |
| FR-007 | Resilience: reconnect with resume + heartbeat; no lost messages | T001, T010 |
| FR-008 | Secret-safe identity via broker-minted `yc_session`; consumer secret never on the bridge | T001, T011 |
| FR-009 | `CANCEL REMOTE` teardown (stop task, close session, final notice, disconnect) | T009 |

## Components & interfaces

1. **Shared YappChatt client** — `wxkanban-agent/core/yappchatt/` (ported from
   `vscode-extension/src/services/chatSocket.ts`). Plain-Node, no VS Code dependency. Surface:
   `provisionSession(cfg)`, `wsToken(session)`, `connect({conversationId, onEvent})`,
   `send(conversationId, text)`, `loadHistory(conversationId)`, `resolveChatConfig(env)`.
   `conversationId` is an explicit input (not the broker default).
2. **remote-bridge app** — `wxkanban-agent/apps/remote-bridge/`. Owns the Agent SDK session
   (`bypassPermissions`, streaming I/O, `cwd`=repo, resume/seed), the room↔session router, the
   control-word parser, and the push gate.
3. **Config bootstrap** — room `conversationId` from a per-repo env var `WXKANBAN_REMOTE_ROOM_ID`
   (in `.env`), resolved like the transport's other `WXKANBAN_*` config; `.wxai/project.json` optional
   fallback. Per-project falls out because `.env` is per-repo; keeps room ids out of git.
4. **`GO REMOTE` trigger** — recognized when said to Claude; the assistant runs the bridge launcher
   with the current session id; the bridge seeds/resumes from it (transcript-replay fallback).

## Non-goals (this spec)

No DB tables, no new server route, no frontend, no cloud hosting, no multi-participant rooms, no hard
native-permission gate. See the scope's Out of Scope + Deferred sections.

## Acceptance

Governed by the 7 Success Criteria in the scope doc (phone-only loop, ≤5s round-trip, per-project
isolation, zero-tolerance push gate, resilience, secret safety, clean teardown).
