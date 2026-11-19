# Test Plan: Agent Model Routing and Metering

**Spec Number**: 143
**Date Generated**: 2026-10-23
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

### UT-001 — T001 Spike: subagent hooks report model, tokens and timing; is /usage window data readable (FR-001)

**Linked Task**: T001
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T001 Spike: subagent hooks report model, tokens and timing; is /usage window data readable (FR-001) — happy path | Success response | pending |
| 2 | T001 Spike: subagent hooks report model, tokens and timing; is /usage window data readable (FR-001) — validation error | Error with details | pending |
| 3 | T001 Spike: subagent hooks report model, tokens and timing; is /usage window data readable (FR-001) — edge case | Graceful handling | pending |

### UT-002 — T002 Spike: per-command model setting honored for slash commands (FR-016)

**Linked Task**: T002
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T002 Spike: per-command model setting honored for slash commands (FR-016) — happy path | Success response | pending |
| 2 | T002 Spike: per-command model setting honored for slash commands (FR-016) — validation error | Error with details | pending |
| 3 | T002 Spike: per-command model setting honored for slash commands (FR-016) — edge case | Graceful handling | pending |

### UT-003 — T003 agentruns table: reviewed SQL for manual apply, then schema declaration (FR-002)

**Linked Task**: T003
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T003 agentruns table: reviewed SQL for manual apply, then schema declaration (FR-002) — happy path | Success response | pending |
| 2 | T003 agentruns table: reviewed SQL for manual apply, then schema declaration (FR-002) — validation error | Error with details | pending |
| 3 | T003 agentruns table: reviewed SQL for manual apply, then schema declaration (FR-002) — edge case | Graceful handling | pending |

### UT-004 — T004 Run capture hooks writing the local run log (FR-003)

**Linked Task**: T004
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T004 Run capture hooks writing the local run log (FR-003) — happy path | Success response | pending |
| 2 | T004 Run capture hooks writing the local run log (FR-003) — validation error | Error with details | pending |
| 3 | T004 Run capture hooks writing the local run log (FR-003) — edge case | Graceful handling | pending |

### UT-005 — T005 Consultant-hub routes POST and GET /api/consultant-hub/agent-runs (API)

**Linked Task**: T005
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T005 Consultant-hub routes POST and GET /api/consultant-hub/agent-runs (API) — happy path | Success response | pending |
| 2 | T005 Consultant-hub routes POST and GET /api/consultant-hub/agent-runs (API) — validation error | Error with details | pending |
| 3 | T005 Consultant-hub routes POST and GET /api/consultant-hub/agent-runs (API) — edge case | Graceful handling | pending |

### UT-006 — T006 Run capture forwards the local log to agentruns (FR-003)

**Linked Task**: T006
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T006 Run capture forwards the local log to agentruns (FR-003) — happy path | Success response | pending |
| 2 | T006 Run capture forwards the local log to agentruns (FR-003) — validation error | Error with details | pending |
| 3 | T006 Run capture forwards the local log to agentruns (FR-003) — edge case | Graceful handling | pending |

### UT-007 — T007 Difficulty class rule with owner override (FR-004)

**Linked Task**: T007
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T007 Difficulty class rule with owner override (FR-004) — happy path | Success response | pending |
| 2 | T007 Difficulty class rule with owner override (FR-004) — validation error | Error with details | pending |
| 3 | T007 Difficulty class rule with owner override (FR-004) — edge case | Graceful handling | pending |

### UT-008 — T008 Tier table: kit default, project override, reader, write guard (FR-005)

**Linked Task**: T008
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T008 Tier table: kit default, project override, reader, write guard (FR-005) — happy path | Success response | pending |
| 2 | T008 Tier table: kit default, project override, reader, write guard (FR-005) — validation error | Error with details | pending |
| 3 | T008 Tier table: kit default, project override, reader, write guard (FR-005) — edge case | Graceful handling | pending |

### UT-009 — T009 Escalation after two failed test cycles (FR-006)

**Linked Task**: T009
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T009 Escalation after two failed test cycles (FR-006) — happy path | Success response | pending |
| 2 | T009 Escalation after two failed test cycles (FR-006) — validation error | Error with details | pending |
| 3 | T009 Escalation after two failed test cycles (FR-006) — edge case | Graceful handling | pending |

### UT-010 — T010 Provider policy with refusal fallback (FR-007)

**Linked Task**: T010
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T010 Provider policy with refusal fallback (FR-007) — happy path | Success response | pending |
| 2 | T010 Provider policy with refusal fallback (FR-007) — validation error | Error with details | pending |
| 3 | T010 Provider policy with refusal fallback (FR-007) — edge case | Graceful handling | pending |

### UT-011 — T011 OmniRoute install, start and status scripts with the features-off check (FR-008)

**Linked Task**: T011
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T011 OmniRoute install, start and status scripts with the features-off check (FR-008) — happy path | Success response | pending |
| 2 | T011 OmniRoute install, start and status scripts with the features-off check (FR-008) — validation error | Error with details | pending |
| 3 | T011 OmniRoute install, start and status scripts with the features-off check (FR-008) — edge case | Graceful handling | pending |

### UT-012 — T012 Guard: the Claude subscription never goes through OmniRoute (FR-009)

**Linked Task**: T012
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T012 Guard: the Claude subscription never goes through OmniRoute (FR-009) — happy path | Success response | pending |
| 2 | T012 Guard: the Claude subscription never goes through OmniRoute (FR-009) — validation error | Error with details | pending |
| 3 | T012 Guard: the Claude subscription never goes through OmniRoute (FR-009) — edge case | Graceful handling | pending |

### UT-013 — T013 Comparison mode: two routes, same task, third-model review (FR-010)

**Linked Task**: T013
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T013 Comparison mode: two routes, same task, third-model review (FR-010) — happy path | Success response | pending |
| 2 | T013 Comparison mode: two routes, same task, third-model review (FR-010) — validation error | Error with details | pending |
| 3 | T013 Comparison mode: two routes, same task, third-model review (FR-010) — edge case | Graceful handling | pending |

### UT-014 — T014 Cost report and forecast with a dated price table (FR-011)

**Linked Task**: T014
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T014 Cost report and forecast with a dated price table (FR-011) — happy path | Success response | pending |
| 2 | T014 Cost report and forecast with a dated price table (FR-011) — validation error | Error with details | pending |
| 3 | T014 Cost report and forecast with a dated price table (FR-011) — edge case | Graceful handling | pending |

### UT-015 — T015 Project-tagged summary to the bridge outbox for wxHub and myndSynergy (FR-012)

**Linked Task**: T015
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T015 Project-tagged summary to the bridge outbox for wxHub and myndSynergy (FR-012) — happy path | Success response | pending |
| 2 | T015 Project-tagged summary to the bridge outbox for wxHub and myndSynergy (FR-012) — validation error | Error with details | pending |
| 3 | T015 Project-tagged summary to the bridge outbox for wxHub and myndSynergy (FR-012) — edge case | Graceful handling | pending |

### UT-016 — T016 Tier proposals with evidence for owner approval (FR-013)

**Linked Task**: T016
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T016 Tier proposals with evidence for owner approval (FR-013) — happy path | Success response | pending |
| 2 | T016 Tier proposals with evidence for owner approval (FR-013) — validation error | Error with details | pending |
| 3 | T016 Tier proposals with evidence for owner approval (FR-013) — edge case | Graceful handling | pending |

### UT-017 — T017 Billable active minutes into time entries (FR-014)

**Linked Task**: T017
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T017 Billable active minutes into time entries (FR-014) — happy path | Success response | pending |
| 2 | T017 Billable active minutes into time entries (FR-014) — validation error | Error with details | pending |
| 3 | T017 Billable active minutes into time entries (FR-014) — edge case | Graceful handling | pending |

### UT-018 — T018 Audit log of model choices and approvals (FR-015)

**Linked Task**: T018
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T018 Audit log of model choices and approvals (FR-015) — happy path | Success response | pending |
| 2 | T018 Audit log of model choices and approvals (FR-015) — validation error | Error with details | pending |
| 3 | T018 Audit log of model choices and approvals (FR-015) — edge case | Graceful handling | pending |

### UT-019 — T019 Per-command tiers in the kit command files (FR-016)

**Linked Task**: T019
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T019 Per-command tiers in the kit command files (FR-016) — happy path | Success response | pending |
| 2 | T019 Per-command tiers in the kit command files (FR-016) — validation error | Error with details | pending |
| 3 | T019 Per-command tiers in the kit command files (FR-016) — edge case | Graceful handling | pending |

### UT-020 — T020 Acceptance run: US1 to US10 and the success metrics

**Linked Task**: T020
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T020 Acceptance run: US1 to US10 and the success metrics — happy path | Success response | pending |
| 2 | T020 Acceptance run: US1 to US10 and the success metrics — validation error | Error with details | pending |
| 3 | T020 Acceptance run: US1 to US10 and the success metrics — edge case | Graceful handling | pending |

### UT-021 — T021 Help and docs for routing, metering, the cost report and OmniRoute

**Linked Task**: T021
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T021 Help and docs for routing, metering, the cost report and OmniRoute — happy path | Success response | pending |
| 2 | T021 Help and docs for routing, metering, the cost report and OmniRoute — validation error | Error with details | pending |
| 3 | T021 Help and docs for routing, metering, the cost report and OmniRoute — edge case | Graceful handling | pending |

## Integration Tests

| # | Scenario | Endpoint/Flow | Expected | Status |
|---|----------|--------------|----------|--------|
| 1 | Full Agent Model Routing and Metering workflow | End-to-end | All steps succeed | pending |
| 2 | Error handling | Error paths | Proper error responses | pending |
| 3 | Auth/permissions | Protected routes | 401/403 as expected | pending |

## E2E Tests

| # | User Story | Steps | Expected | Status |
|---|-----------|-------|----------|--------|
| 1 | Primary flow | User completes Agent Model Routing and Metering | Success | pending |
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
