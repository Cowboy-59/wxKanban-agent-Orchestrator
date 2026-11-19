# Plan: K.A.I.N. Sign-in and Agent Reach

**Spec Number**: 152 (implements SCOPE-132 Amendment F)
**Date**: 2026-10-28

## Implementation Plan

Reach is decided in one place before anything acts on it. The sign-in and the device token come next, then
the four places switch to `agentReach` together, then the retirement and the UI. Nothing ships until the
cross-company tests pass.

### Phase 1: Verify and data (T001 – T003)

- T001 first, evidence only: MCP token tenancy for a client Project (OQ-1), every password-setting path
  (OQ-2), every reader of grants, company tokens and the `agent-grant:` prefix. Findings in `research.md`.
- T002 the SQL; Andy applies `0001` by hand and verifies; `0002` waits for release.
- T003 declares the table in both schemas only after it exists (a declared-but-missing column 500s).

### Phase 2: Reach and sign-in (T004, T005)

- T004 `agentReach` with no I/O beyond Drizzle reads; unit-tested branch by branch. Independent of T002.
- T005 sign-in reuses `signInUser`; device tokens hashed; revoke-all wired into every password path from T001.

### Phase 3: The four places (T006, T007)

- T006 grants and connect (app); T007 the MCP auth re-check and `list_agent_connections` (MCP), with a
  mirrored reach function and a drift test. They change together: a release with only one switched leaves
  the places disagreeing, which brainstorm row 12 declined.

### Phase 4: Retire and show (T008 – T011)

- T008 410 on issuing; tick and token UIs removed; no reader of `projectagentgrants` left.
- T009 device lists and revoke; T010 the "Reachable by" line; T011 help and the KAIN contract.

### Phase 5: Gate and acceptance (T012, T013)

- T012 the seven-test matrix (1 – 6 automated); tests 1, 3, 6 block release.
- T013 by hand after deploy, with SpokAI SCOPE-002 Amendment A live.

## Release order

`0001` applied and verified → app + MCP deploy (one push does both) → `0002` applied → SpokAI release with its
sign-in panel. Never push or release without the owner's go.

## Known Issues

- Production DB is the local `.env` database; unit tests that hit it are not regressions of this spec.
- `db:drift` is table-level only: verify columns by query after applying `0001`.
- The MCP schema mirror is partial; declare `agentdevicetokens` there before reading it with Drizzle, or read
  it with explicit SQL.
- `implement`'s MODIFY path has corrupted UTF-8 before; edit fenced files directly and check fences with
  `auditfences`.
