# Test Plan: App UI String Extraction

**Spec Number**: 052
**Date Generated**: 2026-06-13
**Spec**: [spec.md](spec.md) | **Tasks**: [tasks.md](tasks.md)

---

## Test Strategy

| Layer | Framework | Coverage Target |
|-------|-----------|-----------------|
| Unit | Vitest | Core logic, services, utilities |
| Integration | Vitest + Supertest | API endpoints, DB operations |
| E2E | Playwright | User workflows, critical paths |

---

## Unit Tests

### UT-001 — Extract strings: app shell + layout + navigation

**Linked Task**: T001
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Extract strings: app shell + layout + navigation — happy path | Success response | pending |
| 2 | Extract strings: app shell + layout + navigation — validation error | Error with details | pending |
| 3 | Extract strings: app shell + layout + navigation — edge case | Graceful handling | pending |

### UT-002 — Extract: auth — login, registration, settings entry

**Linked Task**: T002
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Extract: auth — login, registration, settings entry — happy path | Success response | pending |
| 2 | Extract: auth — login, registration, settings entry — validation error | Error with details | pending |
| 3 | Extract: auth — login, registration, settings entry — edge case | Graceful handling | pending |

### UT-003 — Extract: dashboard + admin dashboard surfaces

**Linked Task**: T003
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Extract: dashboard + admin dashboard surfaces — happy path | Success response | pending |
| 2 | Extract: dashboard + admin dashboard surfaces — validation error | Error with details | pending |
| 3 | Extract: dashboard + admin dashboard surfaces — edge case | Graceful handling | pending |

### UT-004 — Extract: projects, tasks, Kanban views

**Linked Task**: T004
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Extract: projects, tasks, Kanban views — happy path | Success response | pending |
| 2 | Extract: projects, tasks, Kanban views — validation error | Error with details | pending |
| 3 | Extract: projects, tasks, Kanban views — edge case | Graceful handling | pending |

### UT-005 — Extract: time tracking + invoices

**Linked Task**: T005
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Extract: time tracking + invoices — happy path | Success response | pending |
| 2 | Extract: time tracking + invoices — validation error | Error with details | pending |
| 3 | Extract: time tracking + invoices — edge case | Graceful handling | pending |

### UT-006 — Extract: consultant / engagement / work-hub surfaces

**Linked Task**: T006
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Extract: consultant / engagement / work-hub surfaces — happy path | Success response | pending |
| 2 | Extract: consultant / engagement / work-hub surfaces — validation error | Error with details | pending |
| 3 | Extract: consultant / engagement / work-hub surfaces — edge case | Graceful handling | pending |

### UT-007 — Extract: audit + compliance surfaces

**Linked Task**: T007
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Extract: audit + compliance surfaces — happy path | Success response | pending |
| 2 | Extract: audit + compliance surfaces — validation error | Error with details | pending |
| 3 | Extract: audit + compliance surfaces — edge case | Graceful handling | pending |

### UT-008 — Extract: SysAdmin surfaces

**Linked Task**: T008
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Extract: SysAdmin surfaces — happy path | Success response | pending |
| 2 | Extract: SysAdmin surfaces — validation error | Error with details | pending |
| 3 | Extract: SysAdmin surfaces — edge case | Graceful handling | pending |

### UT-009 — Extract: settings, integrations, help, notes panels

**Linked Task**: T009
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Extract: settings, integrations, help, notes panels — happy path | Success response | pending |
| 2 | Extract: settings, integrations, help, notes panels — validation error | Error with details | pending |
| 3 | Extract: settings, integrations, help, notes panels — edge case | Graceful handling | pending |

### UT-010 — Verify no hardcoded strings remain + extract en-US keys into bundle

**Linked Task**: T010
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Verify no hardcoded strings remain + extract en-US keys into bundle — happy path | Success response | pending |
| 2 | Verify no hardcoded strings remain + extract en-US keys into bundle — validation error | Error with details | pending |
| 3 | Verify no hardcoded strings remain + extract en-US keys into bundle — edge case | Graceful handling | pending |

## Integration Tests

| # | Scenario | Endpoint/Flow | Expected | Status |
|---|----------|--------------|----------|--------|
| 1 | Full App UI String Extraction workflow | End-to-end | All steps succeed | pending |
| 2 | Error handling | Error paths | Proper error responses | pending |
| 3 | Auth/permissions | Protected routes | 401/403 as expected | pending |

## E2E Tests

| # | User Story | Steps | Expected | Status |
|---|-----------|-------|----------|--------|
| 1 | Primary flow | User completes App UI String Extraction | Success | pending |
| 2 | Error recovery | User encounters and recovers from error | Guided recovery | pending |

## Test Automation

```bash
# Run unit tests
npm run test

# Run integration tests
npm run test:integration

# Run E2E tests
npm run test:e2e
```

## Coverage Requirements

- Unit test coverage: >= 80%
- All acceptance criteria from spec must have at least one test
- All API endpoints must have integration tests
- Critical user flows must have E2E tests
