# Test Plan: Kit auto-update — notify + confirm-apply at session start

**Spec Number**: 083
**Date Generated**: 2026-07-01
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

### UT-001 — T001: Session-start kit-update check (ensureKitUpToDate) + entry-point wiring

**Linked Task**: T001
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T001: Session-start kit-update check (ensureKitUpToDate) + entry-point wiring — happy path | Success response | pending |
| 2 | T001: Session-start kit-update check (ensureKitUpToDate) + entry-point wiring — validation error | Error with details | pending |
| 3 | T001: Session-start kit-update check (ensureKitUpToDate) + entry-point wiring — edge case | Graceful handling | pending |

### UT-002 — T002: upgrade-kit --from-server download/extract apply mode

**Linked Task**: T002
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T002: upgrade-kit --from-server download/extract apply mode — happy path | Success response | pending |
| 2 | T002: upgrade-kit --from-server download/extract apply mode — validation error | Error with details | pending |
| 3 | T002: upgrade-kit --from-server download/extract apply mode — edge case | Graceful handling | pending |

### UT-003 — T003: Dev Cockpit "Kit update available" row + upgradeKit command

**Linked Task**: T003
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T003: Dev Cockpit "Kit update available" row + upgradeKit command — happy path | Success response | pending |
| 2 | T003: Dev Cockpit "Kit update available" row + upgradeKit command — validation error | Error with details | pending |
| 3 | T003: Dev Cockpit "Kit update available" row + upgradeKit command — edge case | Graceful handling | pending |

### UT-004 — T004: Cockpit self-update reliability — refresh bundled .vsix on upgrade

**Linked Task**: T004
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T004: Cockpit self-update reliability — refresh bundled .vsix on upgrade — happy path | Success response | pending |
| 2 | T004: Cockpit self-update reliability — refresh bundled .vsix on upgrade — validation error | Error with details | pending |
| 3 | T004: Cockpit self-update reliability — refresh bundled .vsix on upgrade — edge case | Graceful handling | pending |

### UT-005 — T005: Fence traceability + auditfences baseline re-capture

**Linked Task**: T005
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T005: Fence traceability + auditfences baseline re-capture — happy path | Success response | pending |
| 2 | T005: Fence traceability + auditfences baseline re-capture — validation error | Error with details | pending |
| 3 | T005: Fence traceability + auditfences baseline re-capture — edge case | Graceful handling | pending |

## Integration Tests

| # | Scenario | Endpoint/Flow | Expected | Status |
|---|----------|--------------|----------|--------|
| 1 | Full Kit auto-update — notify + confirm-apply at session start workflow | End-to-end | All steps succeed | pending |
| 2 | Error handling | Error paths | Proper error responses | pending |
| 3 | Auth/permissions | Protected routes | 401/403 as expected | pending |

## E2E Tests

| # | User Story | Steps | Expected | Status |
|---|-----------|-------|----------|--------|
| 1 | Primary flow | User completes Kit auto-update — notify + confirm-apply at session start | Success | pending |
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
