# Test Plan: User Feedback

**Spec Number**: 043
**Date Generated**: 2026-05-31
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

### UT-001 — feedbacksubmissions table + migration

**Linked Task**: T001
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | feedbacksubmissions table + migration — happy path | Success response | pending |
| 2 | feedbacksubmissions table + migration — validation error | Error with details | pending |
| 3 | feedbacksubmissions table + migration — edge case | Graceful handling | pending |

### UT-002 — project.submit_feedback MCP tool

**Linked Task**: T002
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | project.submit_feedback MCP tool — happy path | Success response | pending |
| 2 | project.submit_feedback MCP tool — validation error | Error with details | pending |
| 3 | project.submit_feedback MCP tool — edge case | Graceful handling | pending |

### UT-003 — Lifecycle artifact rendering

**Linked Task**: T003
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Lifecycle artifact rendering — happy path | Success response | pending |
| 2 | Lifecycle artifact rendering — validation error | Error with details | pending |
| 3 | Lifecycle artifact rendering — edge case | Graceful handling | pending |

### UT-004 — VS Code command + persona-led capture

**Linked Task**: T004
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | VS Code command + persona-led capture — happy path | Success response | pending |
| 2 | VS Code command + persona-led capture — validation error | Error with details | pending |
| 3 | VS Code command + persona-led capture — edge case | Graceful handling | pending |

### UT-005 — Background AI triage

**Linked Task**: T005
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Background AI triage — happy path | Success response | pending |
| 2 | Background AI triage — validation error | Error with details | pending |
| 3 | Background AI triage — edge case | Graceful handling | pending |

### UT-006 — SysAdmin triage surface

**Linked Task**: T006
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | SysAdmin triage surface — happy path | Success response | pending |
| 2 | SysAdmin triage surface — validation error | Error with details | pending |
| 3 | SysAdmin triage surface — edge case | Graceful handling | pending |

### UT-007 — Needs-info round + submitter status in Dev Cockpit

**Linked Task**: T007
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Needs-info round + submitter status in Dev Cockpit — happy path | Success response | pending |
| 2 | Needs-info round + submitter status in Dev Cockpit — validation error | Error with details | pending |
| 3 | Needs-info round + submitter status in Dev Cockpit — edge case | Graceful handling | pending |

### UT-008 — Notification channels (in-app + email) with pending + retry

**Linked Task**: T008
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Notification channels (in-app + email) with pending + retry — happy path | Success response | pending |
| 2 | Notification channels (in-app + email) with pending + retry — validation error | Error with details | pending |
| 3 | Notification channels (in-app + email) with pending + retry — edge case | Graceful handling | pending |

## Integration Tests

| # | Scenario | Endpoint/Flow | Expected | Status |
|---|----------|--------------|----------|--------|
| 1 | Full User Feedback workflow | End-to-end | All steps succeed | pending |
| 2 | Error handling | Error paths | Proper error responses | pending |
| 3 | Auth/permissions | Protected routes | 401/403 as expected | pending |

## E2E Tests

| # | User Story | Steps | Expected | Status |
|---|-----------|-------|----------|--------|
| 1 | Primary flow | User completes User Feedback | Success | pending |
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
