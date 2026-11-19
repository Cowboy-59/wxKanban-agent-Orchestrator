# Test Plan: Audit Route Access Control

**Spec Number**: 146
**Date Generated**: 2026-10-25
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

### UT-001 — Audit route access table and route-enumeration test (FR-004)

**Linked Task**: T001
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Audit route access table and route-enumeration test (FR-004) — happy path | Success response | pending |
| 2 | Audit route access table and route-enumeration test (FR-004) — validation error | Error with details | pending |
| 3 | Audit route access table and route-enumeration test (FR-004) — edge case | Graceful handling | pending |

### UT-002 — SYSADMIN guards on library writes, self-audit and reports (FR-001, FR-002)

**Linked Task**: T002
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | SYSADMIN guards on library writes, self-audit and reports (FR-001, FR-002) — happy path | Success response | pending |
| 2 | SYSADMIN guards on library writes, self-audit and reports (FR-001, FR-002) — validation error | Error with details | pending |
| 3 | SYSADMIN guards on library writes, self-audit and reports (FR-001, FR-002) — edge case | Graceful handling | pending |

### UT-003 — Framework-only document reads for non-SYSADMIN (FR-003)

**Linked Task**: T003
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Framework-only document reads for non-SYSADMIN (FR-003) — happy path | Success response | pending |
| 2 | Framework-only document reads for non-SYSADMIN (FR-003) — validation error | Error with details | pending |
| 3 | Framework-only document reads for non-SYSADMIN (FR-003) — edge case | Graceful handling | pending |

### UT-004 — Re-extract replaces a document's tasks; 0-task parse refused (FR-006)

**Linked Task**: T004
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Re-extract replaces a document's tasks; 0-task parse refused (FR-006) — happy path | Success response | pending |
| 2 | Re-extract replaces a document's tasks; 0-task parse refused (FR-006) — validation error | Error with details | pending |
| 3 | Re-extract replaces a document's tasks; 0-task parse refused (FR-006) — edge case | Graceful handling | pending |

### UT-005 — Record denials and SYSADMIN writes (FR-005)

**Linked Task**: T005
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Record denials and SYSADMIN writes (FR-005) — happy path | Success response | pending |
| 2 | Record denials and SYSADMIN writes (FR-005) — validation error | Error with details | pending |
| 3 | Record denials and SYSADMIN writes (FR-005) — edge case | Graceful handling | pending |

### UT-006 — Client shows only what the role can use (FR-007)

**Linked Task**: T006
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Client shows only what the role can use (FR-007) — happy path | Success response | pending |
| 2 | Client shows only what the role can use (FR-007) — validation error | Error with details | pending |
| 3 | Client shows only what the role can use (FR-007) — edge case | Graceful handling | pending |

### UT-007 — Route tests per role for all 22 audit routes

**Linked Task**: T007
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Route tests per role for all 22 audit routes — happy path | Success response | pending |
| 2 | Route tests per role for all 22 audit routes — validation error | Error with details | pending |
| 3 | Route tests per role for all 22 audit routes — edge case | Graceful handling | pending |

### UT-008 — Live endpoint test per role against the deployed app (FR-008)

**Linked Task**: T008
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Live endpoint test per role against the deployed app (FR-008) — happy path | Success response | pending |
| 2 | Live endpoint test per role against the deployed app (FR-008) — validation error | Error with details | pending |
| 3 | Live endpoint test per role against the deployed app (FR-008) — edge case | Graceful handling | pending |

## Integration Tests

| # | Scenario | Endpoint/Flow | Expected | Status |
|---|----------|--------------|----------|--------|
| 1 | Full Audit Route Access Control workflow | End-to-end | All steps succeed | pending |
| 2 | Error handling | Error paths | Proper error responses | pending |
| 3 | Auth/permissions | Protected routes | 401/403 as expected | pending |

## E2E Tests

| # | User Story | Steps | Expected | Status |
|---|-----------|-------|----------|--------|
| 1 | Primary flow | User completes Audit Route Access Control | Success | pending |
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
