# Test Plan: Certification and Access Hardening

**Spec Number**: 114
**Date Generated**: 2026-07-27
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

### UT-001 — Close H-3 by resolving token role from the record

**Linked Task**: T001
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Close H-3 by resolving token role from the record — happy path | Success response | pending |
| 2 | Close H-3 by resolving token role from the record — validation error | Error with details | pending |
| 3 | Close H-3 by resolving token role from the record — edge case | Graceful handling | pending |

### UT-002 — Add a role column to mcpapitokens and set it at issuance

**Linked Task**: T002
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Add a role column to mcpapitokens and set it at issuance — happy path | Success response | pending |
| 2 | Add a role column to mcpapitokens and set it at issuance — validation error | Error with details | pending |
| 3 | Add a role column to mcpapitokens and set it at issuance — edge case | Graceful handling | pending |

### UT-003 — Restrict token issuance to admin so a token cannot mint a token

**Linked Task**: T003
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Restrict token issuance to admin so a token cannot mint a token — happy path | Success response | pending |
| 2 | Restrict token issuance to admin so a token cannot mint a token — validation error | Error with details | pending |
| 3 | Restrict token issuance to admin so a token cannot mint a token — edge case | Graceful handling | pending |

### UT-004 — Build TOTP MFA enrolment with recovery codes

**Linked Task**: T004
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Build TOTP MFA enrolment with recovery codes — happy path | Success response | pending |
| 2 | Build TOTP MFA enrolment with recovery codes — validation error | Error with details | pending |
| 3 | Build TOTP MFA enrolment with recovery codes — edge case | Graceful handling | pending |

### UT-005 — Gate interactive admin operations on MFA with zero non-interactive prompts

**Linked Task**: T005
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Gate interactive admin operations on MFA with zero non-interactive prompts — happy path | Success response | pending |
| 2 | Gate interactive admin operations on MFA with zero non-interactive prompts — validation error | Error with details | pending |
| 3 | Gate interactive admin operations on MFA with zero non-interactive prompts — edge case | Graceful handling | pending |

### UT-006 — Close Critical and High findings C-2 and H-1, H-4 through H-9

**Linked Task**: T006
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Close Critical and High findings C-2 and H-1, H-4 through H-9 — happy path | Success response | pending |
| 2 | Close Critical and High findings C-2 and H-1, H-4 through H-9 — validation error | Error with details | pending |
| 3 | Close Critical and High findings C-2 and H-1, H-4 through H-9 — edge case | Graceful handling | pending |

### UT-007 — Make bounded expiry mandatory on new token issuance

**Linked Task**: T007
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Make bounded expiry mandatory on new token issuance — happy path | Success response | pending |
| 2 | Make bounded expiry mandatory on new token issuance — validation error | Error with details | pending |
| 3 | Make bounded expiry mandatory on new token issuance — edge case | Graceful handling | pending |

### UT-008 — Apply staged expiry to the 175 existing never-expiring tokens

**Linked Task**: T008
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Apply staged expiry to the 175 existing never-expiring tokens — happy path | Success response | pending |
| 2 | Apply staged expiry to the 175 existing never-expiring tokens — validation error | Error with details | pending |
| 3 | Apply staged expiry to the 175 existing never-expiring tokens — edge case | Graceful handling | pending |

### UT-009 — Auto-revoke dormant tokens

**Linked Task**: T009
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Auto-revoke dormant tokens — happy path | Success response | pending |
| 2 | Auto-revoke dormant tokens — validation error | Error with details | pending |
| 3 | Auto-revoke dormant tokens — edge case | Graceful handling | pending |

### UT-010 — Close Medium findings M-1 through M-12

**Linked Task**: T010
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Close Medium findings M-1 through M-12 — happy path | Success response | pending |
| 2 | Close Medium findings M-1 through M-12 — validation error | Error with details | pending |
| 3 | Close Medium findings M-1 through M-12 — edge case | Graceful handling | pending |

### UT-011 — Produce the ISMS document set and Statement of Applicability

**Linked Task**: T011
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Produce the ISMS document set and Statement of Applicability — happy path | Success response | pending |
| 2 | Produce the ISMS document set and Statement of Applicability — validation error | Error with details | pending |
| 3 | Produce the ISMS document set and Statement of Applicability — edge case | Graceful handling | pending |

### UT-012 — Gate public certification claims on a clean register

**Linked Task**: T012
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Gate public certification claims on a clean register — happy path | Success response | pending |
| 2 | Gate public certification claims on a clean register — validation error | Error with details | pending |
| 3 | Gate public certification claims on a clean register — edge case | Graceful handling | pending |

## Integration Tests

| # | Scenario | Endpoint/Flow | Expected | Status |
|---|----------|--------------|----------|--------|
| 1 | Full Certification and Access Hardening workflow | End-to-end | All steps succeed | pending |
| 2 | Error handling | Error paths | Proper error responses | pending |
| 3 | Auth/permissions | Protected routes | 401/403 as expected | pending |

## E2E Tests

| # | User Story | Steps | Expected | Status |
|---|-----------|-------|----------|--------|
| 1 | Primary flow | User completes Certification and Access Hardening | Success | pending |
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
