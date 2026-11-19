# Test Plan: Multi-Framework Crosswalk and Evidence

**Spec Number**: 113
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

### UT-001 — Create compliancecontrolmappings and map existing checks

**Linked Task**: T001
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Create compliancecontrolmappings and map existing checks — happy path | Success response | pending |
| 2 | Create compliancecontrolmappings and map existing checks — validation error | Error with details | pending |
| 3 | Create compliancecontrolmappings and map existing checks — edge case | Graceful handling | pending |

### UT-002 — Resolve checks through the mapping so each runs once

**Linked Task**: T002
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Resolve checks through the mapping so each runs once — happy path | Success response | pending |
| 2 | Resolve checks through the mapping so each runs once — validation error | Error with details | pending |
| 3 | Resolve checks through the mapping so each runs once — edge case | Graceful handling | pending |

### UT-003 — Build the evidence resolution service with three states

**Linked Task**: T003
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Build the evidence resolution service with three states — happy path | Success response | pending |
| 2 | Build the evidence resolution service with three states — validation error | Error with details | pending |
| 3 | Build the evidence resolution service with three states — edge case | Graceful handling | pending |

### UT-004 — Create compliancecontrolexclusions for not-applicable justifications

**Linked Task**: T004
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Create compliancecontrolexclusions for not-applicable justifications — happy path | Success response | pending |
| 2 | Create compliancecontrolexclusions for not-applicable justifications — validation error | Error with details | pending |
| 3 | Create compliancecontrolexclusions for not-applicable justifications — edge case | Graceful handling | pending |

### UT-005 — Render the evidence bundle to PDF

**Linked Task**: T005
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Render the evidence bundle to PDF — happy path | Success response | pending |
| 2 | Render the evidence bundle to PDF — validation error | Error with details | pending |
| 3 | Render the evidence bundle to PDF — edge case | Graceful handling | pending |

### UT-006 — Seed the NIST SSDF control catalog with mappings

**Linked Task**: T006
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Seed the NIST SSDF control catalog with mappings — happy path | Success response | pending |
| 2 | Seed the NIST SSDF control catalog with mappings — validation error | Error with details | pending |
| 3 | Seed the NIST SSDF control catalog with mappings — edge case | Graceful handling | pending |

### UT-007 — Seed the ISO 27001 development control catalog with mappings

**Linked Task**: T007
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Seed the ISO 27001 development control catalog with mappings — happy path | Success response | pending |
| 2 | Seed the ISO 27001 development control catalog with mappings — validation error | Error with details | pending |
| 3 | Seed the ISO 27001 development control catalog with mappings — edge case | Graceful handling | pending |

### UT-008 — Backfill HIPAA and GDPR checks into the crosswalk

**Linked Task**: T008
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Backfill HIPAA and GDPR checks into the crosswalk — happy path | Success response | pending |
| 2 | Backfill HIPAA and GDPR checks into the crosswalk — validation error | Error with details | pending |
| 3 | Backfill HIPAA and GDPR checks into the crosswalk — edge case | Graceful handling | pending |

### UT-009 — Build the evidence export UI

**Linked Task**: T009
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Build the evidence export UI — happy path | Success response | pending |
| 2 | Build the evidence export UI — validation error | Error with details | pending |
| 3 | Build the evidence export UI — edge case | Graceful handling | pending |

### UT-010 — Disclose coverage boundary across all surfaces

**Linked Task**: T010
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Disclose coverage boundary across all surfaces — happy path | Success response | pending |
| 2 | Disclose coverage boundary across all surfaces — validation error | Error with details | pending |
| 3 | Disclose coverage boundary across all surfaces — edge case | Graceful handling | pending |

### UT-011 — Add compliance awareness to validateScope

**Linked Task**: T011
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Add compliance awareness to validateScope — happy path | Success response | pending |
| 2 | Add compliance awareness to validateScope — validation error | Error with details | pending |
| 3 | Add compliance awareness to validateScope — edge case | Graceful handling | pending |

## Integration Tests

| # | Scenario | Endpoint/Flow | Expected | Status |
|---|----------|--------------|----------|--------|
| 1 | Full Multi-Framework Crosswalk and Evidence workflow | End-to-end | All steps succeed | pending |
| 2 | Error handling | Error paths | Proper error responses | pending |
| 3 | Auth/permissions | Protected routes | 401/403 as expected | pending |

## E2E Tests

| # | User Story | Steps | Expected | Status |
|---|-----------|-------|----------|--------|
| 1 | Primary flow | User completes Multi-Framework Crosswalk and Evidence | Success | pending |
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
