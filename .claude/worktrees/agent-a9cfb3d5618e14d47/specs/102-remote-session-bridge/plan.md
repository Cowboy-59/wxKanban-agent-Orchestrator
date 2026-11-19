# Plan: Remote Session Bridge (Spec 102)

**Scope**: SCOPE-102 · **Spec id**: `46d174ea-bc15-4357-8c00-5babcf2d7cf8`

## Approach

Kit-only build under `wxkanban-agent/`. Two units: a **shared YappChatt client** (ported from the
extension's `ChatSocket`) and a **remote-bridge app** that owns a headless Claude Agent SDK session
and wires the room to it. No DB, no server route, no frontend. Reuse the SCOPE-079 broker for
secret-safe session minting; the bridge holds only a per-user `yc_session` + the project's local API
token.

## Known gates / dependencies

- **Blocked for end-to-end:** a private YappChatt room (`conversationId`, operator-provisioned) and
  the YappChatt-side `POST /api/consumer/session` endpoint (pending in SCOPE-079). Unit/integration
  work on the transport and bridge can proceed without them.
- **Agent SDK handoff:** confirm the SDK exposes session resume/seed; if not, use transcript replay.
- **wxUIUXCodeReview headless:** the push gate (T008) needs the review runnable non-interactively.
- **Safety:** bridge runs on a working branch and never pushes except through the FR-006 gate.

## Phases

**Phase 1 — Transport (no external deps).**
T001 port `ChatSocket` → `core/yappchatt/`; T002 config bootstrap + identity echo. Unit-test send,
subscribe, heartbeat, resume, history against a mock socket.

**Phase 2 — Bridge core.**
T003 Agent SDK headless session (bypass, streaming); T004 `GO REMOTE` handoff (seed/resume);
T005 outbound relay (concise/verbose, no-secret guard); T006 inbound routing + continue-and-fold.

**Phase 3 — Control & safety.**
T007 control-word parser; T008 review-gated push; T009 `CANCEL REMOTE` teardown; T010 resilience;
T011 secret-safety audit.

**Phase 4 — Verify.**
T012 end-to-end harness against the 7 success criteria (needs the room); T013 config sample + docs.

## File targets

- `wxkanban-agent/core/yappchatt/` — client, config resolver, types (ported).
- `wxkanban-agent/apps/remote-bridge/` — bridge entry, session owner, router, control parser, push gate.
- `.wxai/project.json` — room `conversationId` key (per project; documented, not committed with a real id).

## Rollout

Kit code only → no app/MCP redeploy required to build/test locally. Shipping to consumers follows the
normal kit-release path when ready. Nothing pushed without explicit instruction.
