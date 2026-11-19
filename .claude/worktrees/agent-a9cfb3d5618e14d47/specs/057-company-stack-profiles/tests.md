# Test Plan: Company-Wide Stack Profiles

**Spec Number**: 057
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

### UT-001 — companystackprofiles table + migration

**Linked Task**: T001
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | companystackprofiles table + migration — happy path | Success response | pending |
| 2 | companystackprofiles table + migration — validation error | Error with details | pending |
| 3 | companystackprofiles table + migration — edge case | Graceful handling | pending |

### UT-002 — Promote-to-company-wide action (kit/MCP, ADMIN-gated)

**Linked Task**: T002
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Promote-to-company-wide action (kit/MCP, ADMIN-gated) — happy path | Success response | pending |
| 2 | Promote-to-company-wide action (kit/MCP, ADMIN-gated) — validation error | Error with details | pending |
| 3 | Promote-to-company-wide action (kit/MCP, ADMIN-gated) — edge case | Graceful handling | pending |

### UT-003 — Resolve/seed company profile by apptype

**Linked Task**: T003
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Resolve/seed company profile by apptype — happy path | Success response | pending |
| 2 | Resolve/seed company profile by apptype — validation error | Error with details | pending |
| 3 | Resolve/seed company profile by apptype — edge case | Graceful handling | pending |

### UT-004 — Web ADMIN screen — manage the up-to-3 profiles

**Linked Task**: T004
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Web ADMIN screen — manage the up-to-3 profiles — happy path | Success response | pending |
| 2 | Web ADMIN screen — manage the up-to-3 profiles — validation error | Error with details | pending |
| 3 | Web ADMIN screen — manage the up-to-3 profiles — edge case | Graceful handling | pending |

### UT-005 — ADMIN authorization + tenant isolation enforcement

**Linked Task**: T005
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | ADMIN authorization + tenant isolation enforcement — happy path | Success response | pending |
| 2 | ADMIN authorization + tenant isolation enforcement — validation error | Error with details | pending |
| 3 | ADMIN authorization + tenant isolation enforcement — edge case | Graceful handling | pending |

### UT-006 — Non-destructive change semantics

**Linked Task**: T006
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Non-destructive change semantics — happy path | Success response | pending |
| 2 | Non-destructive change semantics — validation error | Error with details | pending |
| 3 | Non-destructive change semantics — edge case | Graceful handling | pending |

## Integration Tests

| # | Scenario | Endpoint/Flow | Expected | Status |
|---|----------|--------------|----------|--------|
| 1 | Full Company-Wide Stack Profiles workflow | End-to-end | All steps succeed | pending |
| 2 | Error handling | Error paths | Proper error responses | pending |
| 3 | Auth/permissions | Protected routes | 401/403 as expected | pending |

## E2E Tests

| # | User Story | Steps | Expected | Status |
|---|-----------|-------|----------|--------|
| 1 | Primary flow | User completes Company-Wide Stack Profiles | Success | pending |
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
