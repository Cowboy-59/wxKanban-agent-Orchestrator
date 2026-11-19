# Test Plan: Time and Billing

**Spec Number**: 005
**Date Generated**: 2026-11-01
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

### UT-001 — T001 Write schema SQL for Time and Billing (owner applies)

**Linked Task**: T001
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T001 Write schema SQL for Time and Billing (owner applies) — happy path | Success response | pending |
| 2 | T001 Write schema SQL for Time and Billing (owner applies) — validation error | Error with details | pending |
| 3 | T001 Write schema SQL for Time and Billing (owner applies) — edge case | Graceful handling | pending |

### UT-002 — T002 Declare the new columns in Drizzle after the DDL is live

**Linked Task**: T002
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T002 Declare the new columns in Drizzle after the DDL is live — happy path | Success response | pending |
| 2 | T002 Declare the new columns in Drizzle after the DDL is live — validation error | Error with details | pending |
| 3 | T002 Declare the new columns in Drizzle after the DDL is live — edge case | Graceful handling | pending |

### UT-003 — T003 Rounding and rate resolution helpers

**Linked Task**: T003
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T003 Rounding and rate resolution helpers — happy path | Success response | pending |
| 2 | T003 Rounding and rate resolution helpers — validation error | Error with details | pending |
| 3 | T003 Rounding and rate resolution helpers — edge case | Graceful handling | pending |

### UT-004 — T004 Time lines and totals query (TimeBillingService)

**Linked Task**: T004
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T004 Time lines and totals query (TimeBillingService) — happy path | Success response | pending |
| 2 | T004 Time lines and totals query (TimeBillingService) — validation error | Error with details | pending |
| 3 | T004 Time lines and totals query (TimeBillingService) — edge case | Graceful handling | pending |

### UT-005 — T005 Manual entries with locking and corrections

**Linked Task**: T005
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T005 Manual entries with locking and corrections — happy path | Success response | pending |
| 2 | T005 Manual entries with locking and corrections — validation error | Error with details | pending |
| 3 | T005 Manual entries with locking and corrections — edge case | Graceful handling | pending |

### UT-006 — T006 Side timer and automatic notes

**Linked Task**: T006
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T006 Side timer and automatic notes — happy path | Success response | pending |
| 2 | T006 Side timer and automatic notes — validation error | Error with details | pending |
| 3 | T006 Side timer and automatic notes — edge case | Graceful handling | pending |

### UT-007 — T007 Daily agent-run pull into Resource lines

**Linked Task**: T007
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T007 Daily agent-run pull into Resource lines — happy path | Success response | pending |
| 2 | T007 Daily agent-run pull into Resource lines — validation error | Error with details | pending |
| 3 | T007 Daily agent-run pull into Resource lines — edge case | Graceful handling | pending |

### UT-008 — T008 Rates and ACH settings with encryption

**Linked Task**: T008
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T008 Rates and ACH settings with encryption — happy path | Success response | pending |
| 2 | T008 Rates and ACH settings with encryption — validation error | Error with details | pending |
| 3 | T008 Rates and ACH settings with encryption — edge case | Graceful handling | pending |

### UT-009 — T009 Client statement generation

**Linked Task**: T009
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T009 Client statement generation — happy path | Success response | pending |
| 2 | T009 Client statement generation — validation error | Error with details | pending |
| 3 | T009 Client statement generation — edge case | Graceful handling | pending |

### UT-010 — T010 Statement summary page (Items Done)

**Linked Task**: T010
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T010 Statement summary page (Items Done) — happy path | Success response | pending |
| 2 | T010 Statement summary page (Items Done) — validation error | Error with details | pending |
| 3 | T010 Statement summary page (Items Done) — edge case | Graceful handling | pending |

### UT-011 — T011 Statement PDF

**Linked Task**: T011
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T011 Statement PDF — happy path | Success response | pending |
| 2 | T011 Statement PDF — validation error | Error with details | pending |
| 3 | T011 Statement PDF — edge case | Graceful handling | pending |

### UT-012 — T012 Time and Billing API routes with guard and audit

**Linked Task**: T012
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T012 Time and Billing API routes with guard and audit — happy path | Success response | pending |
| 2 | T012 Time and Billing API routes with guard and audit — validation error | Error with details | pending |
| 3 | T012 Time and Billing API routes with guard and audit — edge case | Graceful handling | pending |

### UT-013 — T013 Customer billing cycle

**Linked Task**: T013
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T013 Customer billing cycle — happy path | Success response | pending |
| 2 | T013 Customer billing cycle — validation error | Error with details | pending |
| 3 | T013 Customer billing cycle — edge case | Graceful handling | pending |

### UT-014 — T014 TimeBillingPage and route registration

**Linked Task**: T014
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T014 TimeBillingPage and route registration — happy path | Success response | pending |
| 2 | T014 TimeBillingPage and route registration — validation error | Error with details | pending |
| 3 | T014 TimeBillingPage and route registration — edge case | Graceful handling | pending |

### UT-015 — T015 Project list, time lines and range filter UI

**Linked Task**: T015
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T015 Project list, time lines and range filter UI — happy path | Success response | pending |
| 2 | T015 Project list, time lines and range filter UI — validation error | Error with details | pending |
| 3 | T015 Project list, time lines and range filter UI — edge case | Graceful handling | pending |

### UT-016 — T016 Entry dialog and timer panel UI

**Linked Task**: T016
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T016 Entry dialog and timer panel UI — happy path | Success response | pending |
| 2 | T016 Entry dialog and timer panel UI — validation error | Error with details | pending |
| 3 | T016 Entry dialog and timer panel UI — edge case | Graceful handling | pending |

### UT-017 — T017 Statement dialog UI

**Linked Task**: T017
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T017 Statement dialog UI — happy path | Success response | pending |
| 2 | T017 Statement dialog UI — validation error | Error with details | pending |
| 3 | T017 Statement dialog UI — edge case | Graceful handling | pending |

### UT-018 — T018 Rates and ACH settings UI

**Linked Task**: T018
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T018 Rates and ACH settings UI — happy path | Success response | pending |
| 2 | T018 Rates and ACH settings UI — validation error | Error with details | pending |
| 3 | T018 Rates and ACH settings UI — edge case | Graceful handling | pending |

### UT-019 — T019 i18n for all Time and Billing strings

**Linked Task**: T019
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T019 i18n for all Time and Billing strings — happy path | Success response | pending |
| 2 | T019 i18n for all Time and Billing strings — validation error | Error with details | pending |
| 3 | T019 i18n for all Time and Billing strings — edge case | Graceful handling | pending |

### UT-020 — T020 Contract and unit tests

**Linked Task**: T020
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T020 Contract and unit tests — happy path | Success response | pending |
| 2 | T020 Contract and unit tests — validation error | Error with details | pending |
| 3 | T020 Contract and unit tests — edge case | Graceful handling | pending |

### UT-021 — T021 Endpoint test as ADMIN in the running app

**Linked Task**: T021
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T021 Endpoint test as ADMIN in the running app — happy path | Success response | pending |
| 2 | T021 Endpoint test as ADMIN in the running app — validation error | Error with details | pending |
| 3 | T021 Endpoint test as ADMIN in the running app — edge case | Graceful handling | pending |

## Integration Tests

| # | Scenario | Endpoint/Flow | Expected | Status |
|---|----------|--------------|----------|--------|
| 1 | Full Time and Billing workflow | End-to-end | All steps succeed | pending |
| 2 | Error handling | Error paths | Proper error responses | pending |
| 3 | Auth/permissions | Protected routes | 401/403 as expected | pending |

## E2E Tests

| # | User Story | Steps | Expected | Status |
|---|-----------|-------|----------|--------|
| 1 | Primary flow | User completes Time and Billing | Success | pending |
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
