# Test Plan: AI Content Localization & Cross-Language Review

**Spec Number**: 053
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

### UT-001 — Protected methodology-term list — one shared source

**Linked Task**: T001
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Protected methodology-term list — happy path | Success response | pending |
| 2 | Protected methodology-term list — validation error | Error with details | pending |
| 3 | Protected methodology-term list — edge case | Graceful handling | pending |

### UT-002 — `authoredlanguage` column + Drizzle migration

**Linked Task**: T002
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | `authoredlanguage` column + migration — happy path | Success response | pending |
| 2 | `authoredlanguage` column + migration — validation error | Error with details | pending |
| 3 | `authoredlanguage` column + migration — edge case | Graceful handling | pending |

### UT-003 — Inject `{{language}}` into command prompt templates

**Linked Task**: T003
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Inject `{{language}}` into command templates — happy path | Success response | pending |
| 2 | Inject `{{language}}` into command templates — validation error | Error with details | pending |
| 3 | Inject `{{language}}` into command templates — edge case | Graceful handling | pending |

### UT-004 — AI generates content in the user's language (web editor)

**Linked Task**: T004
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | AI generates content in-language (web) — happy path | Success response | pending |
| 2 | AI generates content in-language (web) — validation error | Error with details | pending |
| 3 | AI generates content in-language (web) — edge case | Graceful handling | pending |

### UT-005 — VS Code resolves generation language + injects into templates

**Linked Task**: T005
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | VS Code resolves generation language — happy path | Success response | pending |
| 2 | VS Code resolves generation language — validation error | Error with details | pending |
| 3 | VS Code resolves generation language — edge case | Graceful handling | pending |

### UT-006 — On-demand translation endpoint (non-destructive)

**Linked Task**: T006
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | On-demand translation endpoint — happy path | Success response | pending |
| 2 | On-demand translation endpoint — validation error | Error with details | pending |
| 3 | On-demand translation endpoint — edge case | Graceful handling | pending |

### UT-007 — "View in your language" affordance

**Linked Task**: T007
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | "View in your language" affordance — happy path | Success response | pending |
| 2 | "View in your language" affordance — validation error | Error with details | pending |
| 3 | "View in your language" affordance — edge case | Graceful handling | pending |

### UT-008 — Supported-language set config + graceful fallback

**Linked Task**: T008
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Supported-language set + fallback — happy path | Success response | pending |
| 2 | Supported-language set + fallback — validation error | Error with details | pending |
| 3 | Supported-language set + fallback — edge case | Graceful handling | pending |

## Integration Tests

| # | Scenario | Endpoint/Flow | Expected | Status |
|---|----------|--------------|----------|--------|
| 1 | Full AI Content Localization & Cross-Language Review workflow | End-to-end | All steps succeed | pending |
| 2 | Error handling | Error paths | Proper error responses | pending |
| 3 | Auth/permissions | Protected routes | 401/403 as expected | pending |

## E2E Tests

| # | User Story | Steps | Expected | Status |
|---|-----------|-------|----------|--------|
| 1 | Primary flow | User completes AI Content Localization & Cross-Language Review | Success | pending |
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
