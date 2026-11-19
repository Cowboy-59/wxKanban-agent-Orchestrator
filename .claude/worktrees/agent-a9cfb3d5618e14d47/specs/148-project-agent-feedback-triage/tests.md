# Test Plan: Project Agent Feedback Triage

**Spec Number**: 148
**Date Generated**: 2026-10-26
**Spec**: [spec.md](spec.md) | **Tasks**: [tasks.md](tasks.md)

---

## Test Strategy

| Layer | Framework | Coverage Target |
|-------|-----------|-----------------|
| MCP tool | Vitest (mcp-server), database and notifications stubbed | FR-009, FR-010, FR-012, FR-013 |
| App route and services | Vitest, services stubbed | FR-001, FR-009 parity, FR-014 labels |
| Cockpit | Vitest (vscode-extension) | FR-014 |
| Kit bridge | Vitest (wxkanban-agent), SDK, timers, fetch and room stubbed | FR-002 – FR-005, FR-007, FR-008 |
| Repo | Vitest | FR-015 |
| Live | Sink project, production server after deploy | US1 – US6 (T016), T001 token check |

## Cases

| # | Case | FR | Expected |
|---|------|----|----------|
| 1 | Live: agent token calls update_feedback_status | FR-005 | accepted; actor is the issuer (T001) |
| 2 | Status change, manual token | FR-013 | one `feedback.status.changed` row, `via` manual |
| 3 | Status change, `project-agent:` token | FR-013 | one row, `via` project-agent |
| 4 | Audit insert forced to fail | FR-013 | status change rolled back |
| 5 | `resolved` + kit/cockpit/hosted template | FR-010 | server-rendered text only |
| 6 | Template + note; bad semver; kit without version | FR-010 | refused; nothing written |
| 7 | Agent `resolved` without a template | FR-010 | refused |
| 8 | Recorded version below / equal / above / missing; hosted | FR-012 | ok / refused / refused / ok / ok |
| 9 | Both `triaged` builders | FR-009 | identical new text |
| 10 | Settings route: sink token, other token | FR-001 | `feedbackSink` true / false |
| 11 | Cockpit report with and without kit config | FR-014 | `kitversion` set / null |
| 12 | Mirror set includes `docs/triage/` or `.claude/agents/` | FR-015 | regression test fails |
| 13 | Hook: each allow row; each deny row; traversal; chained Bash | FR-005 | allowed / blocked and logged |
| 14 | Session failure mid-run | FR-004 | room told the cause; no partial report |
| 15 | 06:00, catch-up, TRIAGE; second trigger during a run | FR-002 | one run; "Triage already running (started HH:MM)" |
| 16 | Non-sink project: start and TRIAGE | FR-001 | no schedule; fixed refusal text |
| 17 | Unchanged fingerprint at 06:00; TRIAGE | FR-003 | no model, "no change" note / full run |
| 18 | Report titled with an injection string | FR-008 | string absent from the room post |
| 19 | Label over 8 words or equal to a title | FR-008 | replaced with the group key |

## Evidence

### T001 — the project-agent token on update_feedback_status (2026-10-26)

Code trace, recorded in place of the live call (Andy's choice, 2026-10-26; the live call moves to
the first step of T016). A `project-agent:` token minted for the sink project passes every check:

- Role: the HTTP transport assigns `editor` to every token caller (`mcp-server/src/index-http.ts`),
  and the permission matrix allows `editor` (`mcp-server/src/auth/role-checker.ts`).
- User: `userId` is the token's `issuedbyid` (`mcp-server/src/middleware/auth.ts`), which the room
  route sets to the kit token's issuer (`AgentConnectService.projectAgentRoom`), never null.
- Project access: the token's company owns the sink project (`ba924193…`), so
  `assertCallerCanViewProject` allows it.

Gap found and closed in T002: `McpScope` carried no token name, so the server could not derive
`via`; it now carries `tokenName`, set by the auth middleware only.

### Suites (2026-10-26)

- mcp-server: 627 passed, 2 skipped; 10 failed in 3 files that need a local Postgres login
  (`integration.test.ts`, `server.test.ts`) or read a file relative to the wrong folder
  (`project-kit-scope-flow.test.ts`) — none touches SPEC-148 code.
- App: `tests/backend/remoteAccess.route.test.ts`, `projectAgent.route.test.ts`,
  `tests/unit/scope148-feedback-version-labels.test.ts` — all pass.
- Cockpit: `tests/feedbackContext.test.ts`, `kitUpdate.test.ts` — all pass; `tsc --noEmit` clean.
