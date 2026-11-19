# Brainstorm: GO REMOTE becomes a status handoff to the project agent

- **Status:** closed
- **Opened / last updated:** 2026-10-27 / 2026-10-27
- **Source:** internal (operator idea)
- **Asked for by:** the operator; the same need applies to customers running several repos
- **Level:** senior
- **Next item:** none

## The request
Change GO REMOTE so that, instead of launching a separate one-off bridge, it switches over to the project agent that is already created and connected. Each repo has its own room, and the operator and customers manage several repos at a time. The problem: when the operator leaves a repo mid-work, the other side has no idea what is being worked on. GO REMOTE should hand that side a summary of where the work stands, so it can start the discussion through its own connection.

## What already exists
| Item | Status | Evidence | Confidence |
|---|---|---|---|
| GO REMOTE rule: `.env` preflight, `npm run remote` in the background, empty seed | Built | `_wxAI/rules/remote.md:1-31`; SCOPE-102 | Confirmed |
| Plain bridge mode binds the fixed `.env` room and never calls the server | Built | `specs/145-remote-auto-start/spec.md:53` | Confirmed |
| Project-agent mode gets a company-owned room from `POST /api/project-agent/room` | Built | `wxkanban-agent/apps/remote-bridge/src/main.ts:67-121` (SCOPE 134) | Confirmed |
| Cockpit starts, watches and stops the project agent, with a "Remote: live" status bar item | Built | `vscode-extension/src/services/projectAgent.ts:44-50, 91-243` (SPEC-145) | Confirmed |
| Per-project "Allow remote" switch enforced by the server (403 `remote_not_allowed`) | Built | `specs/145-remote-auto-start/spec.md:132` | Confirmed |
| Seed and resume on bridge start (`WXKANBAN_REMOTE_SEED`, `WXKANBAN_REMOTE_RESUME`) | Built, one direction only | `main.ts:143-144`, `session.ts:62-64, 111` | Confirmed |
| Room command parsing (`STATUS`, `CANCEL REMOTE`, `TRIAGE`) | Built | `bridge.ts:243-334` | Confirmed |
| YappChatt client with `send(text)` to post to a room | Built | `wxkanban-agent/core/yappchatt/client.ts:182` | Confirmed |
| Project agent sets the room keys in memory, so `.env` keys are not needed in that mode | Built | `main.ts:102-104` | Confirmed |
| One project, one room (no multi-room model) | Decided before | `specs/Project-Scope/132-kain-autonomous-driver.md:93` | Confirmed |
| A push path from a Claude Code session to a running agent | Not found | keyword search only | Likely |
| An earlier decision on this | Not found | `docs/brainstorms/`, `decisions/ledger.yaml`, scopes | Likely |

## Panel
Spoke: Lead Architect, Domain Analyst, Backend, Security, DevOps, Frontend, QA, Migration, Documentation · Sat out: Legacy, Database

## Decisions
| # | Item | Decision | Kind | To scope? | Date |
|---|---|---|---|---|---|
| 1 | The need | GO REMOTE becomes a status handoff into this repo's own room; one KAIN serves one room and each repo has its own room, so no cross-repo design | Agreed | yes | 2026-10-27 |
| 2 | Trigger | Explicit GO REMOTE only | Agreed | yes | 2026-10-27 |
| 3 | Carrier | The session posts the summary straight to the room; whoever listens (KAIN, the project agent or a human in YappChatt) reads it | Agreed | yes | 2026-10-27 |
| 4 | Smallest version | GO REMOTE checks the room, writes a fixed-template summary (about 2,000 characters), posts it starting with `[HANDOFF]`, and reports back; it launches no bridge. Build: template and rule text, a small post script, a `[HANDOFF]` guard in the bridge | Agreed | yes | 2026-10-27 |
| 5 | Risks | Stop with a plain message when Allow remote is off or there is no company room, with no fallback; redaction check before posting; the bridge treats `[HANDOFF]` as context only; the kit never edits `.env` and gives a one-time notice that the keys are no longer read | Agreed | yes | 2026-10-27 |
| 6 | Priority | Now, as one scope: the handoff (A) first, then removal of the plain mode (B). Order: spike, spec, A, B, kit release | Agreed | yes | 2026-10-27 |
| 7 | Spike | Confirm the session can post to the room with credentials it already has, before the spec is written | Added | yes | 2026-10-27 |
| 8 | Docs | Update `CLAUDE.md`, `remote.md`, `/remote`, the guides, the changelog and a SPEC-145 note in the same release | Added | yes | 2026-10-27 |
| 9 | Plain `.env` bridge | Remove the plain bridge mode and the `YAPPCHATT_*` room keys entirely (chair had recommended keeping the code and unlinking it) | Changed | yes | 2026-10-27 |
| 10 | File-drop carrier | Declined: the session posts to the room directly | Declined | no | 2026-10-27 |
| 11 | Keeping the `.env` fallback | Declined: it bypasses the company's Allow-remote switch | Declined | no | 2026-10-27 |
| 12 | Automatic handoff at session end | Parked: a separate topic once the summary format has proven itself | Parked | no | 2026-10-27 |
| 13 | Cross-repo view across rooms | Parked: a separate topic | Parked | no | 2026-10-27 |
| 14 | Cockpit "last handoff" display | Parked: a later enhancement | Parked | no | 2026-10-27 |
| 15 | Carrier (replaces row 3 and row 10) | During the buildscope review: the room credential belongs to the Project Agent process, so the session writes the summary to `.wxai/handoff/` and the Project Agent posts it as `[HANDOFF]`; the recipient is the Project Agent, not KAIN or Jarvis; the command is `HANDOFF REMOTE` and `GO REMOTE` is retired with no redirect; expiry is 4 hours with a removal note in the room | Changed | done (SCOPE-149) | 2026-10-27 |

## Open items
- Unknown: can the session post to the room with the credentials it already has? Resolved by the spike (row 7).
- The reference list for the `YAPPCHATT_*` keys (tests, the `yappchatt-smoke` script) comes from the spec stage, which searches source files only.

## Next step
`/buildscope` ran with this record as input and produced SCOPE-149 (`specs/Project-Scope/149-handoff-remote.md`, 17 FRs, pieces A then B). Rows 1 to 9 are marked `done (SCOPE-149)`; row 15 records what changed during the scope review. Next: `/validateScope 149`, then the G.O.D. flow (createSpecs, contracts, implement).
