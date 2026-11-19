# Test Plan: Stack Capture & /buildstack

**Spec Number**: 055
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

### UT-001 — /buildstack consumer-side slash command

**Linked Task**: T001
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | /buildstack consumer-side slash command — happy path | Success response | pending |
| 2 | /buildstack consumer-side slash command — validation error | Error with details | pending |
| 3 | /buildstack consumer-side slash command — edge case | Graceful handling | pending |

### UT-002 — Dual file+DB persistence of stack.md + projectdocuments

**Linked Task**: T002
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Dual file+DB persistence — happy path | Success response | pending |
| 2 | Dual file+DB persistence — validation error | Error with details | pending |
| 3 | Dual file+DB persistence — edge case | Graceful handling | pending |

### UT-003 — Application-type gate + kit built-in default stacks

**Linked Task**: T003
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Application-type gate + default stacks — happy path | Success response | pending |
| 2 | Application-type gate + default stacks — validation error | Error with details | pending |
| 3 | Application-type gate + default stacks — edge case | Graceful handling | pending |

### UT-004 — Full target-stack capture with per-choice rationale

**Linked Task**: T004
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Full target-stack capture — happy path | Success response | pending |
| 2 | Full target-stack capture — validation error | Error with details | pending |
| 3 | Full target-stack capture — edge case | Graceful handling | pending |

### UT-005 — Curated galleries constant + token derivation

**Linked Task**: T005
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Galleries + token derivation — happy path | Success response | pending |
| 2 | Galleries + token derivation — validation error | Error with details | pending |
| 3 | Galleries + token derivation — edge case | Graceful handling | pending |

### UT-006 — Edit / re-run flow (idempotent, non-destructive)

**Linked Task**: T006
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Edit / re-run flow — happy path | Success response | pending |
| 2 | Edit / re-run flow — validation error | Error with details | pending |
| 3 | Edit / re-run flow — edge case | Graceful handling | pending |

### UT-007 — Read view (ProjectStack document panel)

**Linked Task**: T007
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Read view — happy path | Success response | pending |
| 2 | Read view — validation error | Error with details | pending |
| 3 | Read view — edge case | Graceful handling | pending |

## Integration Tests

| # | Scenario | Endpoint/Flow | Expected | Status |
|---|----------|--------------|----------|--------|
| 1 | Full Stack Capture & /buildstack workflow | End-to-end | All steps succeed | pending |
| 2 | Error handling | Error paths | Proper error responses | pending |
| 3 | Auth/permissions | Protected routes | 401/403 as expected | pending |

## E2E Tests

| # | User Story | Steps | Expected | Status |
|---|-----------|-------|----------|--------|
| 1 | Primary flow | User completes Stack Capture & /buildstack | Success | pending |
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
