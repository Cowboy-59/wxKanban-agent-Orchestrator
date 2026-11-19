# Test Plan: Delete Scope on Project Detail

**Spec Number**: 098
**Date Generated**: 2026-07-13
**Spec**: [spec.md](spec.md) | **Tasks**: [tasks.md](tasks.md)

---

## Test Strategy

| Layer | Framework | Coverage Target |
|-------|-----------|-----------------|
| Unit | Vitest | ScopeService.deleteScope (atomic, project-scoped, not-found) |
| Integration | Vitest + Supertest | DELETE route status codes + auth |
| Component | Vitest + RTL | Delete confirm counts, cancel, refetch |

---

## Unit Tests

### UT-001 — ScopeService.deleteScope
**Linked Task**: T002

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | delete scope with N tasks | 0 tasks with that specid; scope row gone | pending |
| 2 | cross-project scopeid | not deleted; returns not-found | pending |
| 3 | mid-transaction failure | full rollback, nothing deleted | pending |

## Integration Tests

| # | Scenario | Endpoint/Flow | Expected | Status |
|---|----------|--------------|----------|--------|
| 1 | delete a scope in the project | DELETE /:id/scopes/:scopeid | 200 { success: true } | pending |
| 2 | stale/foreign scopeid | DELETE /:id/scopes/:scopeid | 404, nothing deleted | pending |
| 3 | unauthenticated / no access | DELETE /:id/scopes/:scopeid | 401 / 403 | pending |

## Component Tests

| # | Scenario | Steps | Expected | Status |
|---|----------|-------|----------|--------|
| 1 | confirm shows impact | open delete confirm | names scope + shows task/doc counts | pending |
| 2 | cancel confirm | dismiss the confirm | no request, no change | pending |
| 3 | success refetch | confirm delete → 200 | panel refetches, scope gone | pending |

## Coverage Requirements

- Atomicity + project-scoping (FR-002) proven before merge
- Route status codes 200/404/401-403 covered (FR-001)
- Confirm-counts + cancel + refetch covered (FR-003, FR-004)
