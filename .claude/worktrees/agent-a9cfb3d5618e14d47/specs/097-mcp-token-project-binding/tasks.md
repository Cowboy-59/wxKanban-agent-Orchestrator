# Task Breakdown: MCP Token/Project Binding Hardening

**Feature**: MCP Token/Project Binding Hardening
**Spec**: 097
**Date Generated**: 2026-07-13
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

---

## Tasks

| # | Task | Priority | Status |
|---|------|----------|--------|
| 1 | Add token-project param and source "token" to resolveProjectContext | high | done |
| 2 | Thread mcpScope.projectId into withResolvedProjectId with new precedence | high | done |
| 3 | Make project_mcp_health report the per-request token project | high | done |
| 4 | Regression tests: cross-project write guard intact | high | done |
| 5 | Remove client-side TOKEN_RE throw in core/http/mcp-client.ts | high | done |
| 6 | Policy-parity test across both kit MCP clients | medium | done |
| 7 | Server unit tests for resolution precedence and health source | medium | done |

## Task Details

### T001 — Add token-project param and source "token" to resolveProjectContext

In mcp-server/src/utils/project-context.ts, extend ProjectContextResolution.source to include 'token' and add an optional tokenProjectId param to resolveProjectContext so precedence lives in one function: args projectId, then tokenProjectId, then WXKANBAN_PROJECT_ID env, then .wxkanban-project.json file. Return source 'token' when the token project is used. Implements FR-001 and FR-004. (task-id: 398d87ca-7b90-4453-8081-b0d3587bb8f2)

### T002 — Thread mcpScope.projectId into withResolvedProjectId with new precedence

In mcp-server/src/server.ts, pass request.params._meta.mcpScope.projectId into withResolvedProjectId (rather than relying on call ordering vs the L548 mcpScope read) and forward it to resolveProjectContext as the priority-2 default. Preserve explicit-args-wins and dev-bypass fall-through behavior. Implements FR-001. (task-id: 9768c7a3-4d75-4144-8ec7-5711e8831cb1)

### T003 — Make project_mcp_health report the per-request token project

In mcp-server/src/utils/mcp-health.ts (and the project_mcp_health handler), add 'token' to ProjectContextSource and resolve the reported projectContext per request under the caller's token instead of reading the frozen module-level startup state. Under dev-bypass, keep the current startup file/env readout. Implements FR-002 and FR-004. (task-id: 085fc905-c879-4c9c-b4d1-2c6573c14d7e)

### T004 — Regression tests: cross-project write guard intact

Add/keep server unit tests proving a scoped write with args projectId != token project still throws scope-mismatch, no project-scoped handler bypasses the scoped helpers, and scripts/check-no-direct-db.sh still passes. Guards FR-003 so the resolution change cannot regress cross-project safety. (task-id: bd569a9c-49f7-4495-9642-07e2351b16f3)

### T005 — Remove client-side TOKEN_RE throw in core/http/mcp-client.ts

In wxkanban-agent/core/http/mcp-client.ts remove the TOKEN_RE constant (L44) and the constructor throw (L144-148) so a server-valid legacy token is not rejected client-side. Keep the no-token-for-hosted-endpoint fast-fail with its existing actionable message. Update tests/unit/mcp-client.test.ts to assert a legacy token is accepted instead of throwing. Implements FR-005. (task-id: ca4dc434-b122-4889-8337-93c2ed1d51c0)

### T006 — Policy-parity test across both kit MCP clients

Add a test asserting a non-wxk_ token is passed through unchanged by both wxkanban-agent/core/http/mcp-client.ts and wxkanban-agent/core/orchestrator/mcp-client.ts, and that neither applies a token-shape regex gate. Document the single token precedence in one place. Implements FR-006. (task-id: a1793dfe-2008-4dcf-9098-6e479658a641)

### T007 — Server unit tests for resolution precedence and health source

Add mcp-server unit tests covering withResolvedProjectId precedence (args > token > env > file) and project_mcp_health returning the token project with source 'token' under a token, plus the dev-bypass unchanged path. Verifies FR-001, FR-002, FR-004. (task-id: bf318a3b-9c3e-47c4-b794-0e09d765b0e5)
