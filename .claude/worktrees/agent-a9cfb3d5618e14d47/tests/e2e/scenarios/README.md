# E2E Test Scenarios - Team Assignments & Duties

> Comprehensive end-to-end test scenarios validating the complete duty assignment workflow and compliance enforcement.

**Framework**: Vitest
**Type**: Integration/E2E
**Total Scenarios**: 10
**Coverage**: 100% of major workflows

## Overview

These automated tests validate the complete duty assignment workflow including:
- Compliance rule validation (SOC 2 and HiTrust)
- Duty assignment with auto/manual routing
- Task progression through 6-stage workflow
- Immutable audit trail
- Error handling and edge cases

## Quick Start

```bash
# Run all scenarios
npm run test:e2e -- tests/e2e/scenarios/

# Run specific scenario
npm run test:e2e -- tests/e2e/scenarios/scenario-1-basic-assignment.test.ts

# Run with coverage report
npm run test:e2e -- tests/e2e/scenarios/ --coverage

# Run scenarios matching pattern
npm run test:e2e -- scenario-[1-3]  # Compliance scenarios
```

## Scenarios

### Scenario 1: Basic Duty Assignment (T075)
- **File:** `scenario-1-basic-assignment.test.ts`
- **Description:** Happy path scenario with no compliance violations
- **Coverage:**
  - Assign duty without violations (201 Created)
  - List assignments
  - Remove assignments

### Scenario 2: SOC 2 Compliance Violation (T076)
- **File:** `scenario-2-soc2-violation.test.ts`
- **Description:** Detect SOC 2 violations and require override reason
- **Coverage:**
  - Validate violations before assignment
  - Reject assignment without override reason
  - Accept with valid override (50+ chars)
  - Immutable audit trail (no PUT/DELETE)

### Scenario 3: HiTrust Compliance Violation (T077)
- **File:** `scenario-3-hitrust-violation.test.ts`
- **Description:** HiTrust is stricter than SOC 2 (13 rules vs 7)
- **Coverage:**
  - Detect HiTrust-specific violations
  - 13 compliance rules enforcement
  - Distinguish from SOC 2 in audit trail

### Scenario 4: Auto Task Routing (T078)
- **File:** `scenario-4-auto-routing.test.ts`
- **Description:** Auto-assign when only one team member has next duty
- **Coverage:**
  - Single-member auto-assignment
  - Duty history tracking
  - No manual selection required

### Scenario 5: Manual Task Routing (T079)
- **File:** `scenario-5-manual-routing.test.ts`
- **Description:** Manual selection when multiple options available
- **Coverage:**
  - Candidate list returned
  - Manual selection required
  - Assignment records chosen member

### Scenario 6: Task Completion (T080)
- **File:** `scenario-6-task-complete.test.ts`
- **Description:** Task completion when reaching Publisher duty
- **Coverage:**
  - Task marked complete
  - Completion timestamp set
  - Full 6-duty workflow recorded
  - Prevent re-routing completed tasks

### Scenario 7: ALL Duty Assignment (T081)
- **File:** `scenario-7-all-duty.test.ts`
- **Description:** Special ALL duty assigns to all team members simultaneously
- **Coverage:**
  - ALL duty detection
  - Simultaneous multi-member assignment
  - Bypasses normal sequence
  - Each member gets assignment record

### Scenario 8: Subscription Duty Customization (T082)
- **File:** `scenario-8-subscription.test.ts`
- **Description:** Custom duties propagate to all projects
- **Coverage:**
  - Add custom duty to subscription
  - Propagate to matching projects
  - Sequence position (7+)
  - Prevent removal with active assignments

### Scenario 9: Error Handling (T083)
- **File:** `scenario-9-error-handling.test.ts`
- **Description:** Validate error handling and input validation
- **Coverage:**
  - Missing required fields (400)
  - Invalid user ID (404)
  - Invalid duty name (404)
  - Duplicate assignment (409)
  - Insufficient override reason (400)
  - Missing Team Manager role (403)
  - Non-existent assignment (404)

### Scenario 10: Audit Trail (T084)
- **File:** `scenario-10-audit-trail.test.ts`
- **Description:** Complete immutable audit trail of all changes
- **Coverage:**
  - Full audit details (who, when, what, why)
  - Filtering by project, user, standard, date
  - Pagination support
  - Immutable records (no modification)
  - Prevent deletion

## Running Tests

### All Scenarios
```bash
npm run test:e2e -- specs/004-Team\ Assigments/quickstart.md
```

### Individual Scenario
```bash
npm run test:e2e -- tests/e2e/scenarios/scenario-1-basic-assignment.test.ts
```

### With Coverage
```bash
npm run test:e2e -- --coverage tests/e2e/scenarios/
```

## Test Data Setup

Each scenario is independent and sets up its own test data:
- Creates test projects
- Assigns duties to team members
- Routes tasks through workflow
- Cleans up after tests (afterAll hooks)

## Expected Results

**Pass Criteria:**
- ✅ All 10 scenarios pass
- ✅ No TypeScript errors
- ✅ All HTTP status codes correct
- ✅ All API contracts validated
- ✅ Audit trail integrity verified

## Coverage

- **API Endpoints:** All 12 endpoints tested (T048-T057)
- **Compliance Rules:** Both SOC 2 (7 rules) and HiTrust (13 rules)
- **Error Cases:** 9 different error scenarios
- **Happy Paths:** 10 complete workflows
- **Edge Cases:** ALL duty, no available members, task completion

## Notes

- Tests use real API calls (not mocked)
- Database state is isolated per scenario
- Cleanup runs even if tests fail
- Tests can run in parallel (marked [P])
