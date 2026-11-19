# Test Plan: Public Surfaces Localization

**Spec Number**: 054
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

### UT-001 — Public surfaces resolve active locale from the user's language preference when logged in, browser `Accept-Language` when logged out

**Linked Task**: T001
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Locale resolution — happy path | Success response | pending |
| 2 | Locale resolution — validation error | Error with details | pending |
| 3 | Locale resolution — edge case | Graceful handling | pending |

### UT-002 — Reuse/extend the existing marketing locale-keyed string path for landing + marketing copy — no parallel i18n system

**Linked Task**: T002
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Marketing i18n reuse — happy path | Success response | pending |
| 2 | Marketing i18n reuse — validation error | Error with details | pending |
| 3 | Marketing i18n reuse — edge case | Graceful handling | pending |

### UT-003 — en-US per-key fallback on all public pages/assets — never 404 a page or asset on a missing translation

**Linked Task**: T003
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | en-US per-key fallback — happy path | Success response | pending |
| 2 | en-US per-key fallback — validation error | Error with details | pending |
| 3 | en-US per-key fallback — edge case | Graceful handling | pending |

### UT-004 — Docs pages localization wiring (the public `/docs` surface follows the same locale resolution + fallback)

**Linked Task**: T004
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Docs localization wiring — happy path | Success response | pending |
| 2 | Docs localization wiring — validation error | Error with details | pending |
| 3 | Docs localization wiring — edge case | Graceful handling | pending |

## Integration Tests

| # | Scenario | Endpoint/Flow | Expected | Status |
|---|----------|--------------|----------|--------|
| 1 | Full Public Surfaces Localization workflow | End-to-end | All steps succeed | pending |
| 2 | Error handling | Error paths | Proper error responses | pending |
| 3 | Auth/permissions | Protected routes | 401/403 as expected | pending |

## E2E Tests

| # | User Story | Steps | Expected | Status |
|---|-----------|-------|----------|--------|
| 1 | Primary flow | User completes Public Surfaces Localization | Success | pending |
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
