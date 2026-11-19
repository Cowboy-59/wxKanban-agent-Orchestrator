# Test Plan: Rescue-Tokens Global Distribution

**Spec Number**: 153
**Date Generated**: 2026-11-05
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

### UT-001 — T001 — Mirror rescue-tokens skill into kit trees

**Linked Task**: T001
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T001 — Mirror rescue-tokens skill into kit trees — happy path | Success response | pending |
| 2 | T001 — Mirror rescue-tokens skill into kit trees — validation error | Error with details | pending |
| 3 | T001 — Mirror rescue-tokens skill into kit trees — edge case | Graceful handling | pending |

### UT-002 — T002 — Build install-rescue-tokens.mjs installer

**Linked Task**: T002
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T002 — Build install-rescue-tokens.mjs installer — happy path | Success response | pending |
| 2 | T002 — Build install-rescue-tokens.mjs installer — validation error | Error with details | pending |
| 3 | T002 — Build install-rescue-tokens.mjs installer — edge case | Graceful handling | pending |

### UT-003 — T003 — Skill file placement logic (install mode)

**Linked Task**: T003
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T003 — Skill file placement logic (install mode) — happy path | Success response | pending |
| 2 | T003 — Skill file placement logic (install mode) — validation error | Error with details | pending |
| 3 | T003 — Skill file placement logic (install mode) — edge case | Graceful handling | pending |

### UT-004 — T004 — SessionStart hook wiring

**Linked Task**: T004
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T004 — SessionStart hook wiring — happy path | Success response | pending |
| 2 | T004 — SessionStart hook wiring — validation error | Error with details | pending |
| 3 | T004 — SessionStart hook wiring — edge case | Graceful handling | pending |

### UT-005 — T005 — Never shadow an existing rescue-tokens hook

**Linked Task**: T005
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T005 — Never shadow an existing rescue-tokens hook — happy path | Success response | pending |
| 2 | T005 — Never shadow an existing rescue-tokens hook — validation error | Error with details | pending |
| 3 | T005 — Never shadow an existing rescue-tokens hook — edge case | Graceful handling | pending |

### UT-006 — T006 — Wire installer into kit-configure.ts and upgrade-kit.mjs

**Linked Task**: T006
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T006 — Wire installer into kit-configure.ts and upgrade-kit.mjs — happy path | Success response | pending |
| 2 | T006 — Wire installer into kit-configure.ts and upgrade-kit.mjs — validation error | Error with details | pending |
| 3 | T006 — Wire installer into kit-configure.ts and upgrade-kit.mjs — edge case | Graceful handling | pending |

### UT-007 — T007 — Uninstall path

**Linked Task**: T007
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T007 — Uninstall path — happy path | Success response | pending |
| 2 | T007 — Uninstall path — validation error | Error with details | pending |
| 3 | T007 — Uninstall path — edge case | Graceful handling | pending |

### UT-008 — T008 — CLAUDE.md precedence bullet

**Linked Task**: T008
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T008 — CLAUDE.md precedence bullet — happy path | Success response | pending |
| 2 | T008 — CLAUDE.md precedence bullet — validation error | Error with details | pending |
| 3 | T008 — CLAUDE.md precedence bullet — edge case | Graceful handling | pending |

## Integration Tests

| # | Scenario | Endpoint/Flow | Expected | Status |
|---|----------|--------------|----------|--------|
| 1 | Full Rescue-Tokens Global Distribution workflow | End-to-end | All steps succeed | pending |
| 2 | Error handling | Error paths | Proper error responses | pending |
| 3 | Auth/permissions | Protected routes | 401/403 as expected | pending |

## E2E Tests

| # | User Story | Steps | Expected | Status |
|---|-----------|-------|----------|--------|
| 1 | Primary flow | User completes Rescue-Tokens Global Distribution | Success | pending |
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
