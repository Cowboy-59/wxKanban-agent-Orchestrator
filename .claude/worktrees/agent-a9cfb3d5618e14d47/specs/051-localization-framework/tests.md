# Test Plan: Localization Framework & Preference

**Spec Number**: 051
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

### UT-001 — i18n framework init + provider + en-US locale-bundle loader

**Linked Task**: T001
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | i18n framework init + provider + en-US locale-bundle loader — happy path | Success response | pending |
| 2 | i18n framework init + provider + en-US locale-bundle loader — validation error | Error with details | pending |
| 3 | i18n framework init + provider + en-US locale-bundle loader — edge case | Graceful handling | pending |

### UT-002 — `users.language` column + Drizzle migration + browser-seed on first login

**Linked Task**: T002
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | `users.language` column + Drizzle migration + browser-seed on first login — happy path | Success response | pending |
| 2 | `users.language` column + Drizzle migration + browser-seed on first login — validation error | Error with details | pending |
| 3 | `users.language` column + Drizzle migration + browser-seed on first login — edge case | Graceful handling | pending |

### UT-003 — Language selector in profile settings

**Linked Task**: T003
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Language selector in profile settings — happy path | Success response | pending |
| 2 | Language selector in profile settings — validation error | Error with details | pending |
| 3 | Language selector in profile settings — edge case | Graceful handling | pending |

### UT-004 — Per-key en-US fallback guarantee

**Linked Task**: T004
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Per-key en-US fallback guarantee — happy path | Success response | pending |
| 2 | Per-key en-US fallback guarantee — validation error | Error with details | pending |
| 3 | Per-key en-US fallback guarantee — edge case | Graceful handling | pending |

### UT-005 — Locale-aware date/number formatting helper (Intl)

**Linked Task**: T005
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Locale-aware date/number formatting helper (Intl) — happy path | Success response | pending |
| 2 | Locale-aware date/number formatting helper (Intl) — validation error | Error with details | pending |
| 3 | Locale-aware date/number formatting helper (Intl) — edge case | Graceful handling | pending |

### UT-006 — Hardcoded-string guardrail lint/check

**Linked Task**: T006
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Hardcoded-string guardrail lint/check — happy path | Success response | pending |
| 2 | Hardcoded-string guardrail lint/check — validation error | Error with details | pending |
| 3 | Hardcoded-string guardrail lint/check — edge case | Graceful handling | pending |

### UT-007 — Extend profile/me read to expose `language`

**Linked Task**: T007
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Extend profile/me read to expose `language` — happy path | Success response | pending |
| 2 | Extend profile/me read to expose `language` — validation error | Error with details | pending |
| 3 | Extend profile/me read to expose `language` — edge case | Graceful handling | pending |

## Integration Tests

| # | Scenario | Endpoint/Flow | Expected | Status |
|---|----------|--------------|----------|--------|
| 1 | Full Localization Framework & Preference workflow | End-to-end | All steps succeed | pending |
| 2 | Error handling | Error paths | Proper error responses | pending |
| 3 | Auth/permissions | Protected routes | 401/403 as expected | pending |

## E2E Tests

| # | User Story | Steps | Expected | Status |
|---|-----------|-------|----------|--------|
| 1 | Primary flow | User completes Localization Framework & Preference | Success | pending |
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
