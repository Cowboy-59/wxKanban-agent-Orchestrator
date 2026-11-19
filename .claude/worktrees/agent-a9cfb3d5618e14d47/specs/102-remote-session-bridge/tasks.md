# Tasks: Remote Session Bridge (Spec 102)

Mirrors the tasks created in the DB under spec 102 (`46d174ea-bc15-4357-8c00-5babcf2d7cf8`).
Fences on delivered code are written by `implement`, not by hand.

| Task | Title | FRs | Depends |
|------|-------|-----|---------|
| T001 | Port ChatSocket transport → `wxkanban-agent/core/yappchatt/` (plain-Node client: provision, ws-token, subscribe/heartbeat/resume, send, history; explicit conversationId) | FR-002, FR-007, FR-008 | — |
| T002 | Config bootstrap: projectId + apiToken via kit path; room conversationId from per-repo env var `WXKANBAN_REMOTE_ROOM_ID` (`.env`; `.wxai/project.json` fallback) + echo room/project identity on launch | FR-001 | T001 |
| T003 | remote-bridge scaffold: headless Agent SDK session (`bypassPermissions`, streaming I/O, cwd=repo), lifecycle | FR-005 | — |
| T004 | `GO REMOTE` handoff: capture current session, seed/resume the headless session (transcript-replay fallback) | FR-001 | T003 |
| T005 | Outbound relay: SDK events → concise room messages; `VERBOSE`/`CONCISE` toggle; no-secret guard | FR-002 | T001, T003 |
| T006 | Inbound routing + continue-and-fold: idle→start one task; running→fold answer/steer without hard-block | FR-003 | T003 |
| T007 | Control-word parser: `STOP` `CONTINUE` `STATUS` `VERBOSE` `CONCISE` `CONFIRMED` `NO` `CANCEL REMOTE` | FR-004 | T006 |
| T008 | Review-gated push: run wxUIUXCodeReview headless; block unless clean; ask; push only on `CONFIRMED`; `NO`/`STOP` cancel; never unattended | FR-006 | T007 |
| T009 | `CANCEL REMOTE` teardown: stop task, close session, final notice, disconnect | FR-009 | T007 |
| T010 | Resilience: reconnect with resume + heartbeat; no lost messages across drop/restore | FR-007 | T001 |
| T011 | Secret-safety audit: consumer secret never on bridge/logs/room; identity via `yc_session` | FR-008 | T001 |
| T012 | End-to-end verification harness against the 7 success criteria (needs the room) | all | T002–T011 |
| T013 | Config sample + docs (`.wxai` room key, `GO REMOTE` usage, safety notes) | — | T002 |
| T014 | `buildChildEnv()` (`remote-bridge/src/child-env.ts`): strip `ANTHROPIC_API_KEY` from the Agent SDK child session's env unless `WXKANBAN_REMOTE_USE_API_KEY=1`; wired into `session.ts:143` and `triage-run.ts:223` | FR-013 | T003 |

**Blocked on externals (T012 end-to-end):** operator-provisioned private room `conversationId`;
YappChatt-side `POST /api/consumer/session` (SCOPE-079 pending).
