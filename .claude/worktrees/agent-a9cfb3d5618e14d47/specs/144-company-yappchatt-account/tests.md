# Test Plan: Company YappChatt Account

**Spec Number**: 144
**Date Generated**: 2026-10-24
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

### UT-001 — T001 Freeze the contracts: YappChatt consumer API, columns SQL, wxKanban routes, bridge approver call (FR-011)

**Linked Task**: T001
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T001 Freeze the contracts: YappChatt consumer API, columns SQL, wxKanban routes, bridge approver call (FR-011) — happy path | Success response | pending |
| 2 | T001 Freeze the contracts: YappChatt consumer API, columns SQL, wxKanban routes, bridge approver call (FR-011) — validation error | Error with details | pending |
| 3 | T001 Freeze the contracts: YappChatt consumer API, columns SQL, wxKanban routes, bridge approver call (FR-011) — edge case | Graceful handling | pending |

### UT-002 — T002 Security gate: community sessions only for the token's company (FR-009, FR-010)

**Linked Task**: T002
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T002 Security gate: community sessions only for the token's company (FR-009, FR-010) — happy path | Success response | pending |
| 2 | T002 Security gate: community sessions only for the token's company (FR-009, FR-010) — validation error | Error with details | pending |
| 3 | T002 Security gate: community sessions only for the token's company (FR-009, FR-010) — edge case | Graceful handling | pending |

### UT-003 — T003 Reviewed SQL for the new columns and the projectrooms partial unique index (FR-001, FR-003, FR-005, FR-007)

**Linked Task**: T003
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T003 Reviewed SQL for the new columns and the projectrooms partial unique index (FR-001, FR-003, FR-005, FR-007) — happy path | Success response | pending |
| 2 | T003 Reviewed SQL for the new columns and the projectrooms partial unique index (FR-001, FR-003, FR-005, FR-007) — validation error | Error with details | pending |
| 3 | T003 Reviewed SQL for the new columns and the projectrooms partial unique index (FR-001, FR-003, FR-005, FR-007) — edge case | Graceful handling | pending |

### UT-004 — T004 Declare the new columns in src/db/schema after they exist in production (FR-001)

**Linked Task**: T004
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T004 Declare the new columns in src/db/schema after they exist in production (FR-001) — happy path | Success response | pending |
| 2 | T004 Declare the new columns in src/db/schema after they exist in production (FR-001) — validation error | Error with details | pending |
| 3 | T004 Declare the new columns in src/db/schema after they exist in production (FR-001) — edge case | Graceful handling | pending |

### UT-005 — T005 YappChatt broker client for the companion endpoints, with 'companion not available' (FR-011)

**Linked Task**: T005
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T005 YappChatt broker client for the companion endpoints, with 'companion not available' (FR-011) — happy path | Success response | pending |
| 2 | T005 YappChatt broker client for the companion endpoints, with 'companion not available' (FR-011) — validation error | Error with details | pending |
| 3 | T005 YappChatt broker client for the companion endpoints, with 'companion not available' (FR-011) — edge case | Graceful handling | pending |

### UT-006 — T006 Company account service and POST/GET /api/companies/:id/yappchatt (FR-001, FR-002, FR-003)

**Linked Task**: T006
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T006 Company account service and POST/GET /api/companies/:id/yappchatt (FR-001, FR-002, FR-003) — happy path | Success response | pending |
| 2 | T006 Company account service and POST/GET /api/companies/:id/yappchatt (FR-001, FR-002, FR-003) — validation error | Error with details | pending |
| 3 | T006 Company account service and POST/GET /api/companies/:id/yappchatt (FR-001, FR-002, FR-003) — edge case | Graceful handling | pending |

### UT-007 — T007 Membership sync: on account creation, user add/remove, engagement start/end and every agent connect (FR-004)

**Linked Task**: T007
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T007 Membership sync: on account creation, user add/remove, engagement start/end and every agent connect (FR-004) — happy path | Success response | pending |
| 2 | T007 Membership sync: on account creation, user add/remove, engagement start/end and every agent connect (FR-004) — validation error | Error with details | pending |
| 3 | T007 Membership sync: on account creation, user add/remove, engagement start/end and every agent connect (FR-004) — edge case | Graceful handling | pending |

### UT-008 — T008 Rooms under the company account; no-account 409; retire old rooms (FR-005, FR-006, FR-007)

**Linked Task**: T008
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T008 Rooms under the company account; no-account 409; retire old rooms (FR-005, FR-006, FR-007) — happy path | Success response | pending |
| 2 | T008 Rooms under the company account; no-account 409; retire old rooms (FR-005, FR-006, FR-007) — validation error | Error with details | pending |
| 3 | T008 Rooms under the company account; no-account 409; retire old rooms (FR-005, FR-006, FR-007) — edge case | Graceful handling | pending |

### UT-009 — T009 GET /api/project-agent/approver: is this YappChatt user a Room Approver on the token's project (FR-008)

**Linked Task**: T009
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T009 GET /api/project-agent/approver: is this YappChatt user a Room Approver on the token's project (FR-008) — happy path | Success response | pending |
| 2 | T009 GET /api/project-agent/approver: is this YappChatt user a Room Approver on the token's project (FR-008) — validation error | Error with details | pending |
| 3 | T009 GET /api/project-agent/approver: is this YappChatt user a Room Approver on the token's project (FR-008) — edge case | Graceful handling | pending |

### UT-010 — T010 Bridge records DQ answers and KR reviews only from Room Approvers, under their name (FR-008)

**Linked Task**: T010
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T010 Bridge records DQ answers and KR reviews only from Room Approvers, under their name (FR-008) — happy path | Success response | pending |
| 2 | T010 Bridge records DQ answers and KR reviews only from Room Approvers, under their name (FR-008) — validation error | Error with details | pending |
| 3 | T010 Bridge records DQ answers and KR reviews only from Room Approvers, under their name (FR-008) — edge case | Graceful handling | pending |

### UT-011 — T011 Project agent asks to create the company account when none exists (FR-006)

**Linked Task**: T011
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T011 Project agent asks to create the company account when none exists (FR-006) — happy path | Success response | pending |
| 2 | T011 Project agent asks to create the company account when none exists (FR-006) — validation error | Error with details | pending |
| 3 | T011 Project agent asks to create the company account when none exists (FR-006) — edge case | Graceful handling | pending |

### UT-012 — T012 Company page 'Team chat (YappChatt)' panel (FR-001, FR-002)

**Linked Task**: T012
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T012 Company page 'Team chat (YappChatt)' panel (FR-001, FR-002) — happy path | Success response | pending |
| 2 | T012 Company page 'Team chat (YappChatt)' panel (FR-001, FR-002) — validation error | Error with details | pending |
| 3 | T012 Company page 'Team chat (YappChatt)' panel (FR-001, FR-002) — edge case | Graceful handling | pending |

### UT-013 — T013 Audit every action to companyauditlogs (FR-010)

**Linked Task**: T013
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T013 Audit every action to companyauditlogs (FR-010) — happy path | Success response | pending |
| 2 | T013 Audit every action to companyauditlogs (FR-010) — validation error | Error with details | pending |
| 3 | T013 Audit every action to companyauditlogs (FR-010) — edge case | Graceful handling | pending |

### UT-014 — T014 KAIN contract, help pages and the Manual for the company account, rooms and approvers

**Linked Task**: T014
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T014 KAIN contract, help pages and the Manual for the company account, rooms and approvers — happy path | Success response | pending |
| 2 | T014 KAIN contract, help pages and the Manual for the company account, rooms and approvers — validation error | Error with details | pending |
| 3 | T014 KAIN contract, help pages and the Manual for the company account, rooms and approvers — edge case | Graceful handling | pending |

### UT-015 — T015 Acceptance: US1 to US6 live in a test company and the success metrics

**Linked Task**: T015
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T015 Acceptance: US1 to US6 live in a test company and the success metrics — happy path | Success response | pending |
| 2 | T015 Acceptance: US1 to US6 live in a test company and the success metrics — validation error | Error with details | pending |
| 3 | T015 Acceptance: US1 to US6 live in a test company and the success metrics — edge case | Graceful handling | pending |

## Integration Tests

| # | Scenario | Endpoint/Flow | Expected | Status |
|---|----------|--------------|----------|--------|
| 1 | Full Company YappChatt Account workflow | End-to-end | All steps succeed | pending |
| 2 | Error handling | Error paths | Proper error responses | pending |
| 3 | Auth/permissions | Protected routes | 401/403 as expected | pending |

## E2E Tests

| # | User Story | Steps | Expected | Status |
|---|-----------|-------|----------|--------|
| 1 | Primary flow | User completes Company YappChatt Account | Success | pending |
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
