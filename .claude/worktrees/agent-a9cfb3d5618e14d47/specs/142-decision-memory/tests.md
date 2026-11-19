# Test Plan: Decision Memory

**Spec Number**: 142
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

### UT-001 — T001 Spike: can a Stop hook catch a plain-text question and resume the agent (FR-006)

**Linked Task**: T001
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T001 Spike: can a Stop hook catch a plain-text question and resume the agent (FR-006) — happy path | Success response | pending |
| 2 | T001 Spike: can a Stop hook catch a plain-text question and resume the agent (FR-006) — validation error | Error with details | pending |
| 3 | T001 Spike: can a Stop hook catch a plain-text question and resume the agent (FR-006) — edge case | Graceful handling | pending |

### UT-002 — T002 Ledger format and the owner-path ledger script (FR-001, FR-002)

**Linked Task**: T002
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T002 Ledger format and the owner-path ledger script (FR-001, FR-002) — happy path | Success response | pending |
| 2 | T002 Ledger format and the owner-path ledger script (FR-001, FR-002) — validation error | Error with details | pending |
| 3 | T002 Ledger format and the owner-path ledger script (FR-001, FR-002) — edge case | Graceful handling | pending |

### UT-003 — T003 Deny direct agent writes to decisions/ledger.yaml (FR-002)

**Linked Task**: T003
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T003 Deny direct agent writes to decisions/ledger.yaml (FR-002) — happy path | Success response | pending |
| 2 | T003 Deny direct agent writes to decisions/ledger.yaml (FR-002) — validation error | Error with details | pending |
| 3 | T003 Deny direct agent writes to decisions/ledger.yaml (FR-002) — edge case | Graceful handling | pending |

### UT-004 — T004 /wxLedger command: check, check --global, search, import (FR-004, FR-018)

**Linked Task**: T004
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T004 /wxLedger command: check, check --global, search, import (FR-004, FR-018) — happy path | Success response | pending |
| 2 | T004 /wxLedger command: check, check --global, search, import (FR-004, FR-018) — validation error | Error with details | pending |
| 3 | T004 /wxLedger command: check, check --global, search, import (FR-004, FR-018) — edge case | Graceful handling | pending |

### UT-005 — T005 wxBrainstorm close writes the ledger (FR-003)

**Linked Task**: T005
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T005 wxBrainstorm close writes the ledger (FR-003) — happy path | Success response | pending |
| 2 | T005 wxBrainstorm close writes the ledger (FR-003) — validation error | Error with details | pending |
| 3 | T005 wxBrainstorm close writes the ledger (FR-003) — edge case | Graceful handling | pending |

### UT-006 — T006 Search interface, file-search backend, and the answer rules (FR-008)

**Linked Task**: T006
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T006 Search interface, file-search backend, and the answer rules (FR-008) — happy path | Success response | pending |
| 2 | T006 Search interface, file-search backend, and the answer rules (FR-008) — validation error | Error with details | pending |
| 3 | T006 Search interface, file-search backend, and the answer rules (FR-008) — edge case | Graceful handling | pending |

### UT-007 — T007 Keyword classifier and the 30-question labelled test set (FR-009)

**Linked Task**: T007
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T007 Keyword classifier and the 30-question labelled test set (FR-009) — happy path | Success response | pending |
| 2 | T007 Keyword classifier and the 30-question labelled test set (FR-009) — validation error | Error with details | pending |
| 3 | T007 Keyword classifier and the 30-question labelled test set (FR-009) — edge case | Graceful handling | pending |

### UT-008 — T008 Ask Gate PreToolUse hook on AskUserQuestion, installed beside the impact hook (FR-005)

**Linked Task**: T008
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T008 Ask Gate PreToolUse hook on AskUserQuestion, installed beside the impact hook (FR-005) — happy path | Success response | pending |
| 2 | T008 Ask Gate PreToolUse hook on AskUserQuestion, installed beside the impact hook (FR-005) — validation error | Error with details | pending |
| 3 | T008 Ask Gate PreToolUse hook on AskUserQuestion, installed beside the impact hook (FR-005) — edge case | Graceful handling | pending |

### UT-009 — T009 Ask Gate on plain-text questions: Stop hook, or the fallback rule (FR-006)

**Linked Task**: T009
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T009 Ask Gate on plain-text questions: Stop hook, or the fallback rule (FR-006) — happy path | Success response | pending |
| 2 | T009 Ask Gate on plain-text questions: Stop hook, or the fallback rule (FR-006) — validation error | Error with details | pending |
| 3 | T009 Ask Gate on plain-text questions: Stop hook, or the fallback rule (FR-006) — edge case | Graceful handling | pending |

### UT-010 — T010 Blocker routing: decision queue, bridge room, or pass-through (FR-010)

**Linked Task**: T010
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T010 Blocker routing: decision queue, bridge room, or pass-through (FR-010) — happy path | Success response | pending |
| 2 | T010 Blocker routing: decision queue, bridge room, or pass-through (FR-010) — validation error | Error with details | pending |
| 3 | T010 Blocker routing: decision queue, bridge room, or pass-through (FR-010) — edge case | Graceful handling | pending |

### UT-011 — T011 Assumption routing and decisions/assumptions.yaml (FR-011)

**Linked Task**: T011
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T011 Assumption routing and decisions/assumptions.yaml (FR-011) — happy path | Success response | pending |
| 2 | T011 Assumption routing and decisions/assumptions.yaml (FR-011) — validation error | Error with details | pending |
| 3 | T011 Assumption routing and decisions/assumptions.yaml (FR-011) — edge case | Graceful handling | pending |

### UT-012 — T012 Settings, observe and enforce modes, and the gate-log audit trail (FR-013, FR-014)

**Linked Task**: T012
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T012 Settings, observe and enforce modes, and the gate-log audit trail (FR-013, FR-014) — happy path | Success response | pending |
| 2 | T012 Settings, observe and enforce modes, and the gate-log audit trail (FR-013, FR-014) — validation error | Error with details | pending |
| 3 | T012 Settings, observe and enforce modes, and the gate-log audit trail (FR-013, FR-014) — edge case | Graceful handling | pending |

### UT-013 — T013 Hook precedence fixture and live runs per permission mode (FR-012)

**Linked Task**: T013
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T013 Hook precedence fixture and live runs per permission mode (FR-012) — happy path | Success response | pending |
| 2 | T013 Hook precedence fixture and live runs per permission mode (FR-012) — validation error | Error with details | pending |
| 3 | T013 Hook precedence fixture and live runs per permission mode (FR-012) — edge case | Graceful handling | pending |

### UT-014 — T014 G.O.D. consults the ledger and the run report lists ledger answers (FR-007, FR-015)

**Linked Task**: T014
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T014 G.O.D. consults the ledger and the run report lists ledger answers (FR-007, FR-015) — happy path | Success response | pending |
| 2 | T014 G.O.D. consults the ledger and the run report lists ledger answers (FR-007, FR-015) — validation error | Error with details | pending |
| 3 | T014 G.O.D. consults the ledger and the run report lists ledger answers (FR-007, FR-015) — edge case | Graceful handling | pending |

### UT-015 — T015 Verify OpenViking: install, Windows support, API, license (FR-016)

**Linked Task**: T015
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T015 Verify OpenViking: install, Windows support, API, license (FR-016) — happy path | Success response | pending |
| 2 | T015 Verify OpenViking: install, Windows support, API, license (FR-016) — validation error | Error with details | pending |
| 3 | T015 Verify OpenViking: install, Windows support, API, license (FR-016) — edge case | Graceful handling | pending |

### UT-016 — T016 OpenViking backend: install script, detached launcher, namespaces, auth (FR-016)

**Linked Task**: T016
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T016 OpenViking backend: install script, detached launcher, namespaces, auth (FR-016) — happy path | Success response | pending |
| 2 | T016 OpenViking backend: install script, detached launcher, namespaces, auth (FR-016) — validation error | Error with details | pending |
| 3 | T016 OpenViking backend: install script, detached launcher, namespaces, auth (FR-016) — edge case | Graceful handling | pending |

### UT-017 — T017 Fallback within 2 seconds and the health status line (FR-017)

**Linked Task**: T017
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T017 Fallback within 2 seconds and the health status line (FR-017) — happy path | Success response | pending |
| 2 | T017 Fallback within 2 seconds and the health status line (FR-017) — validation error | Error with details | pending |
| 3 | T017 Fallback within 2 seconds and the health status line (FR-017) — edge case | Graceful handling | pending |

### UT-018 — T018 Global tier: seed from god-learnings, repo links, no cross-repo reads (FR-018)

**Linked Task**: T018
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T018 Global tier: seed from god-learnings, repo links, no cross-repo reads (FR-018) — happy path | Success response | pending |
| 2 | T018 Global tier: seed from god-learnings, repo links, no cross-repo reads (FR-018) — validation error | Error with details | pending |
| 3 | T018 Global tier: seed from god-learnings, repo links, no cross-repo reads (FR-018) — edge case | Graceful handling | pending |

### UT-019 — T019 minimal-code rule with on, lite, off (FR-019)

**Linked Task**: T019
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T019 minimal-code rule with on, lite, off (FR-019) — happy path | Success response | pending |
| 2 | T019 minimal-code rule with on, lite, off (FR-019) — validation error | Error with details | pending |
| 3 | T019 minimal-code rule with on, lite, off (FR-019) — edge case | Graceful handling | pending |

### UT-020 — T020 Kit sync keeps decisions/** and settings project-owned (FR-020)

**Linked Task**: T020
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T020 Kit sync keeps decisions/** and settings project-owned (FR-020) — happy path | Success response | pending |
| 2 | T020 Kit sync keeps decisions/** and settings project-owned (FR-020) — validation error | Error with details | pending |
| 3 | T020 Kit sync keeps decisions/** and settings project-owned (FR-020) — edge case | Graceful handling | pending |

### UT-021 — T021 Acceptance run: US1 to US8 end to end and the success metrics

**Linked Task**: T021
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T021 Acceptance run: US1 to US8 end to end and the success metrics — happy path | Success response | pending |
| 2 | T021 Acceptance run: US1 to US8 end to end and the success metrics — validation error | Error with details | pending |
| 3 | T021 Acceptance run: US1 to US8 end to end and the success metrics — edge case | Graceful handling | pending |

### UT-022 — T022 Manual and help for /wxLedger, the Ask Gate, and OpenViking setup

**Linked Task**: T022
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T022 Manual and help for /wxLedger, the Ask Gate, and OpenViking setup — happy path | Success response | pending |
| 2 | T022 Manual and help for /wxLedger, the Ask Gate, and OpenViking setup — validation error | Error with details | pending |
| 3 | T022 Manual and help for /wxLedger, the Ask Gate, and OpenViking setup — edge case | Graceful handling | pending |

## Integration Tests

| # | Scenario | Endpoint/Flow | Expected | Status |
|---|----------|--------------|----------|--------|
| 1 | Full Decision Memory workflow | End-to-end | All steps succeed | pending |
| 2 | Error handling | Error paths | Proper error responses | pending |
| 3 | Auth/permissions | Protected routes | 401/403 as expected | pending |

## E2E Tests

| # | User Story | Steps | Expected | Status |
|---|-----------|-------|----------|--------|
| 1 | Primary flow | User completes Decision Memory | Success | pending |
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
