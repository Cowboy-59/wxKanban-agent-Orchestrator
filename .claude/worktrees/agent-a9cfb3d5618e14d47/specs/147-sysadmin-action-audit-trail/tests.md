# Test Plan: SysAdmin Action Audit Trail

**Spec Number**: 147
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

### UT-001 — SysAdmin write registry and route-enumeration test (FR-002)

**Linked Task**: T001
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | SysAdmin write registry and route-enumeration test (FR-002) — happy path | Success response | pending |
| 2 | SysAdmin write registry and route-enumeration test (FR-002) — validation error | Error with details | pending |
| 3 | SysAdmin write registry and route-enumeration test (FR-002) — edge case | Graceful handling | pending |

### UT-002 — Record mechanism: one row per successful change, before/after, loud failure (FR-001, FR-003, FR-005)

**Linked Task**: T002
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Record mechanism: one row per successful change, before/after, loud failure (FR-001, FR-003, FR-005) — happy path | Success response | pending |
| 2 | Record mechanism: one row per successful change, before/after, loud failure (FR-001, FR-003, FR-005) — validation error | Error with details | pending |
| 3 | Record mechanism: one row per successful change, before/after, loud failure (FR-001, FR-003, FR-005) — edge case | Graceful handling | pending |

### UT-003 — Secret redaction (FR-004)

**Linked Task**: T003
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Secret redaction (FR-004) — happy path | Success response | pending |
| 2 | Secret redaction (FR-004) — validation error | Error with details | pending |
| 3 | Secret redaction (FR-004) — edge case | Graceful handling | pending |

### UT-004 — Wire the 34 sysadmin.ts routes into the registry (FR-001, FR-003)

**Linked Task**: T004
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Wire the 34 sysadmin.ts routes into the registry (FR-001, FR-003) — happy path | Success response | pending |
| 2 | Wire the 34 sysadmin.ts routes into the registry (FR-001, FR-003) — validation error | Error with details | pending |
| 3 | Wire the 34 sysadmin.ts routes into the registry (FR-001, FR-003) — edge case | Graceful handling | pending |

### UT-005 — Wire the 50 marketing, newsletter, welcome and bio routes (FR-001, FR-003)

**Linked Task**: T005
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Wire the 50 marketing, newsletter, welcome and bio routes (FR-001, FR-003) — happy path | Success response | pending |
| 2 | Wire the 50 marketing, newsletter, welcome and bio routes (FR-001, FR-003) — validation error | Error with details | pending |
| 3 | Wire the 50 marketing, newsletter, welcome and bio routes (FR-001, FR-003) — edge case | Graceful handling | pending |

### UT-006 — GET /api/sysadmin/audit (FR-006)

**Linked Task**: T006
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | GET /api/sysadmin/audit (FR-006) — happy path | Success response | pending |
| 2 | GET /api/sysadmin/audit (FR-006) — validation error | Error with details | pending |
| 3 | GET /api/sysadmin/audit (FR-006) — edge case | Graceful handling | pending |

### UT-007 — /sysadmin/audit page (FR-007)

**Linked Task**: T007
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | /sysadmin/audit page (FR-007) — happy path | Success response | pending |
| 2 | /sysadmin/audit page (FR-007) — validation error | Error with details | pending |
| 3 | /sysadmin/audit page (FR-007) — edge case | Graceful handling | pending |

### UT-008 — Route tests: one row per change, none on failure, no secrets (SM 2-3)

**Linked Task**: T008
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Route tests: one row per change, none on failure, no secrets (SM 2-3) — happy path | Success response | pending |
| 2 | Route tests: one row per change, none on failure, no secrets (SM 2-3) — validation error | Error with details | pending |
| 3 | Route tests: one row per change, none on failure, no secrets (SM 2-3) — edge case | Graceful handling | pending |

### UT-009 — Append-only SQL for the owner, applied after deploy (FR-008)

**Linked Task**: T009
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Append-only SQL for the owner, applied after deploy (FR-008) — happy path | Success response | pending |
| 2 | Append-only SQL for the owner, applied after deploy (FR-008) — validation error | Error with details | pending |
| 3 | Append-only SQL for the owner, applied after deploy (FR-008) — edge case | Graceful handling | pending |

### UT-010 — Live verification on the test company (FR-009)

**Linked Task**: T010
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Live verification on the test company (FR-009) — happy path | Success response | pending |
| 2 | Live verification on the test company (FR-009) — validation error | Error with details | pending |
| 3 | Live verification on the test company (FR-009) — edge case | Graceful handling | pending |

## Integration Tests

| # | Scenario | Endpoint/Flow | Expected | Status |
|---|----------|--------------|----------|--------|
| 1 | Full SysAdmin Action Audit Trail workflow | End-to-end | All steps succeed | pending |
| 2 | Error handling | Error paths | Proper error responses | pending |
| 3 | Auth/permissions | Protected routes | 401/403 as expected | pending |

## E2E Tests

| # | User Story | Steps | Expected | Status |
|---|-----------|-------|----------|--------|
| 1 | Primary flow | User completes SysAdmin Action Audit Trail | Success | pending |
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
