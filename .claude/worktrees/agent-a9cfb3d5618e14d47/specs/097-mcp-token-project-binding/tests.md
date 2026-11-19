# Test Plan: MCP Token/Project Binding Hardening

**Spec Number**: 097
**Date Generated**: 2026-07-13
**Spec**: [spec.md](spec.md) | **Tasks**: [tasks.md](tasks.md)

---

## Test Strategy

| Layer | Framework | Coverage Target |
|-------|-----------|-----------------|
| Unit | Vitest | Resolution precedence, health source, client token-passing |
| Integration | Vitest | Tool call under a token resolves to the token project |
| Regression | Vitest | Cross-project scope-mismatch guard unchanged |

---

## Unit Tests

### UT-001 — resolveProjectContext precedence + source "token"
**Linked Task**: T001

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | tokenProjectId given, no args projectId, no env, no file | returns tokenProjectId, source "token" | pending |
| 2 | args projectId AND tokenProjectId given | returns args projectId, source "args" | pending |
| 3 | no token, env + file present | env wins, then file — unchanged from today | pending |

### UT-002 — withResolvedProjectId threads mcpScope
**Linked Task**: T002

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | token call omitting projectId | resolvedArgs.projectId = token project, resolutionSource "token" | pending |
| 2 | dev-bypass (no mcpScope.projectId) | falls through env then file exactly as today | pending |

### UT-003 — project_mcp_health reports token project
**Linked Task**: T003

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | health under a token | projectContext.projectId = token project, source "token" | pending |
| 2 | dev-bypass (no token) | unchanged startup file/env readout | pending |

### UT-004 — cross-project write guard intact (regression)
**Linked Task**: T004

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | scoped insert, args projectId != token project | throws scope-mismatch | pending |
| 2 | check-no-direct-db guard | passes, 0 new violations | pending |

### UT-005 — http McpClient accepts legacy token
**Linked Task**: T005

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | new McpClient with legacy non-wxk_ token | does not throw | pending |
| 2 | hosted endpoint, no token | throws existing "no API token resolved" message | pending |

### UT-006 — both clients pass tokens through (parity)
**Linked Task**: T006

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | non-wxk_ token via core/http client | Authorization: Bearer <token> sent, no throw | pending |
| 2 | non-wxk_ token via core/orchestrator client | Authorization: Bearer <token> sent, no throw | pending |

## Integration Tests

| # | Scenario | Endpoint/Flow | Expected | Status |
|---|----------|--------------|----------|--------|
| 1 | Token-only tool call omits projectId | /call project-scoped tool | row + audit under token project, source "token" | pending |
| 2 | Explicit mismatched projectId | /call scoped write | scope-mismatch, nothing written | pending |

## E2E Tests

| # | User Story | Steps | Expected | Status |
|---|-----------|-------|----------|--------|
| 1 | YappChat diagnoses its project | call project_mcp_health with YappChat token | reports YappChat, not wxKanban Development | pending |

## Coverage Requirements

- All six FR acceptance criteria have at least one test
- Regression: cross-project safety (FR-003) proven unchanged before merge
- Both kit clients covered by the parity test (FR-006)
