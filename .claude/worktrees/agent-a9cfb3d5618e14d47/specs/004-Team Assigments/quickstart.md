# Phase 1: Quickstart Integration Tests — Team Assignments & Duties Management

**Feature**: 004-team-assignments | **Date**: 2026-02-15 | **Type**: Integration Test Scenarios

---

## Overview

These integration test scenarios validate the core user journeys from the feature specification. Each scenario is executable and will be mapped to automated tests in Phase 4 (Implementation).

---

## Scenario 1: Basic Duty Assignment (Happy Path)

**Objective**: Assign Developer duty to a team member on a SOC 2 project — should succeed without warnings.

**Setup**:
- Create a SOC 2-classified project
- Create 2 team members (Alice, Bob)
- Alice is Team Manager on the project

**Steps**:
1. Alice navigates to Project Settings → Team Management → Duty Assignments
2. Alice clicks "Assign Duties"
3. Alice selects Bob from team member list
4. Alice selects "Developer" from available duties
5. Alice clicks "Assign"

**Expected Result**:
- ✅ Assignment succeeds without warnings
- ✅ UI shows confirmation: "Developer duty assigned to Bob"
- ✅ Bob now appears in "Team" section under Developer duty
- ✅ API response includes `dutyAssignmentId`, `createdAt`
- ✅ Assignment appears in duty list: `GET /api/projects/{projectId}/duties/assignments`

**Test Assertions**:
- `POST /api/projects/{projectId}/duties/assign` returns 201 with DutyAssignment object
- `GET /api/projects/{projectId}/duties/assignments` includes the new assignment
- Assignment does not have a ComplianceOverride record (clean assignment)

---

## Scenario 2: Compliance Violation Detection (SOC 2)

**Objective**: Attempt to assign Developer + QA to same person on SOC 2 project — should show warning but allow override with reason.

**Setup**:
- Create SOC 2-classified project
- Bob already assigned as Developer
- Alice is Team Manager

**Steps**:
1. Alice attempts to assign Bob to "QA" duty as well
2. System validates: Developer + QA violates SOC 2 rules
3. UI shows warning: "Violates SOC2_DEV_QA_SEPARATION: Developer cannot also be QA"
4. Dialog offers two options:
   - Option A: Cancel assignment
   - Option B: Override with documented reason
5. Alice selects Option B
6. Alice enters reason: "Small team requires overlap for this sprint. Risk accepted by project lead."
7. Alice clicks "Approve Override"

**Expected Result**:
- ✅ Warning displayed with specific rule violation
- ✅ Override dialog shown with reason input field
- ✅ Assignment succeeds after override approval
- ✅ UI shows badge on assignment: "Override: {reason truncated}"
- ✅ Assignment linked to ComplianceOverride record

**Test Assertions**:
- `POST /api/compliance/validate` returns 400 with violations list
- Violations include: `ruleId: 'SOC2_DEV_QA_SEPARATION'`
- `POST /api/projects/{projectId}/duties/assign` with `overrideReason` succeeds (201)
- ComplianceOverride record created with full audit trail
- `GET /api/compliance/overrides` includes the override with reason

---

## Scenario 3: Compliance Violation Detection (HiTrust)

**Objective**: Verify that HiTrust has stricter rules than SOC 2 — prohibits Developer + Publisher.

**Setup**:
- Create HiTrust-classified project
- Carol assigned as Developer
- Alice is Team Manager

**Steps**:
1. Alice attempts to assign Carol to "Publisher" duty
2. System validates: Developer + Publisher violates HiTrust rules (stricter than SOC 2)
3. UI shows warning: "Violates HITRUST_DEV_PUBLISHER_SEPARATION"
4. Note: SOC 2 allows this combination, but HiTrust prohibits it
5. Alice provides override reason: "Project exception approved by Security Team Manager"
6. Alice approves override

**Expected Result**:
- ✅ HiTrust stricter rules enforced (prohibits combinations SOC 2 allows)
- ✅ Override recorded with HiTrust standard noted
- ✅ Assignment succeeds with documented reason
- ✅ Security Team Manager can view this override in compliance reports

**Test Assertions**:
- HiTrust project validates against HiTrust rules (not SOC 2)
- Violation message references HiTrust standard
- Override record includes `standard: 'HITRUST'`

---

## Scenario 4: Automatic Task Routing (Single Team Member)

**Objective**: When Developer completes a task, system auto-assigns to Design Coordinator (if only one available).

**Setup**:
- SOC 2 project with task workflow
- Bob assigned as Developer
- Carol assigned as Design Coordinator
- Task created and assigned to Bob (Developer duty)

**Steps**:
1. Bob completes the task (marks as complete)
2. System detects task completion in Developer stage
3. System checks next duty in sequence: Design Coordinator
4. System finds one team member (Carol) with Design Coordinator duty
5. System auto-assigns task to Carol without prompting
6. Bob receives notification: "Task moved to Design Coordinator stage (Carol)"
7. Carol receives notification: "New task assigned to you (Design Coordinator)"

**Expected Result**:
- ✅ Task automatically routed to next duty (Developer → Design Coordinator)
- ✅ Only one available → no prompting required
- ✅ UI updated in real-time showing task moved to Carol
- ✅ Task assignment history shows transition

**Test Assertions**:
- `POST /api/tasks/{taskId}/route-next-duty` returns 200 with `status: 'autoAssigned'`
- Response includes `nextDuty: 'Design Coordinator'`, `assignedToUserId: {carol_id}`
- Task record updated with new duty and assignee
- Audit trail shows transition timestamp

---

## Scenario 5: Manual Task Routing (Multiple Team Members)

**Objective**: When multiple team members have the same duty, system prompts for selection instead of auto-assigning.

**Setup**:
- SOC 2 project
- Task in QA stage, assigned to Dan (QA)
- Both Eve and Frank assigned as QA testers
- Task complete, needs to move to Final Acceptance Review
- Only George assigned as Final Acceptance Reviewer

**Steps**:
1. Dan completes the task (QA stage)
2. System detects next duty: Final Acceptance Review
3. System finds exactly one team member (George) available
4. System auto-assigns to George

Alternative scenario:
1. Dan completes the task (QA stage) before Review stage
2. System detects next duty: System Review
3. System finds TWO team members (Eve and Frank) available for System Review
4. UI prompts Dan (or project manager): "Select reviewer: [Eve] [Frank]"
5. Dan selects Frank
6. Task assigned to Frank

**Expected Result**:
- Single member available → auto-assign (no prompt)
- Multiple members available → return options, require selection
- Manual selection respected in task assignment

**Test Assertions**:
- `POST /api/tasks/{taskId}/route-next-duty` with single option returns `status: 'autoAssigned'`
- `POST /api/tasks/{taskId}/route-next-duty` with multiple options returns `status: 'requiresManualSelection'` with `availableTeamMembers` array
- `POST /api/tasks/{taskId}/route-next-duty` with `manualAssigneeId` selects specified user

---

## Scenario 6: Task Complete (All Duties Executed)

**Objective**: Task completed all duty stages — should mark task as fully complete.

**Setup**:
- Task progressed through: Dev → Design → Review → QA → Final Review → Publish
- George (Publisher) just completed the task

**Steps**:
1. George marks the task as complete (Publisher stage, final stage)
2. System checks next duty in sequence
3. No more duties after Publisher
4. System marks task as fully complete/closed

**Expected Result**:
- ✅ Task marked as `status: 'complete'`
- ✅ No further routing possible
- ✅ Task can be archived or moved to completed section
- ✅ UI shows: "Task completed all workflow stages"

**Test Assertions**:
- `POST /api/tasks/{taskId}/route-next-duty` returns `status: 'complete'` with message
- Task record shows completion timestamp
- No DutyAssignment created for next stage

---

## Scenario 7: ALL Duty (Single-Source Project)

**Objective**: Project with only "ALL" duty → task auto-assigned to all team members without prompting.

**Setup**:
- Create small project with "ALL" as only available duty
- 3 team members (Henry, Iris, Jack) all assigned to ALL duty

**Steps**:
1. Task created and assigned to Henry (ALL duty)
2. Henry completes the task
3. System checks next duty: still ALL (no progression)
4. System detects "ALL" duty and auto-assigns to all remaining team members

**Expected Result**:
- ✅ Task auto-assigned to all team members (Iris, Jack)
- ✅ No user selection required
- ✅ Task appears in all team member inboxes
- ✅ Response includes `status: 'assignAllTeamMembers'`, `assignedCount: 3`

**Test Assertions**:
- `POST /api/tasks/{taskId}/route-next-duty` with ALL duty returns `status: 'assignAllTeamMembers'`
- Response includes `assignedCount: 3` (all team members)

---

## Scenario 8: Subscription Duty Type Customization

**Objective**: Admin adds custom duty type to subscription → appears in all projects.

**Setup**:
- Admin account with subscription access
- 2 existing SOC 2 projects (Project A, Project B)
- Both projects have default duty set

**Steps**:
1. Admin navigates to Account Settings → Subscription → Duty Types
2. Admin clicks "Add Custom Duty Type"
3. Admin enters: Name: "Code Reviewer", Allowed For: "SOC2"
4. Admin clicks "Save"
5. System adds duty to subscription
6. Admin navigates to Project A
7. Project A should now have "Code Reviewer" in available duties

**Expected Result**:
- ✅ Custom duty type created at subscription level
- ✅ Duty appears in all existing projects immediately
- ✅ New projects created will include custom duty
- ✅ "Code Reviewer" available for assignment in both Project A and B

**Test Assertions**:
- `POST /api/subscriptions/{subId}/duty-types` creates custom duty (requires admin role)
- `GET /api/projects/{projectId}/duties/available` includes "Code Reviewer"
- Query returns both default and custom duties

---

## Scenario 9: Invalid Duty Assignment Errors

**Objective**: Validate error handling for invalid requests.

**Setup**:
- Project with standard duty setup
- Alice is Team Manager

**Cases**:

### Case A: User not on project
1. Alice attempts to assign duty to unknown user (not project member)
2. System validates: User not in project
3. Error returned: 404 "User not found on project"

### Case B: Insufficient permissions
1. Bob (Developer, not Team Manager) attempts to assign duty to self
2. System validates: Bob not Team Manager
3. Error returned: 403 "INSUFFICIENT_PERMISSIONS - Only Team Managers can assign duties"

### Case C: Duplicate assignment
1. Alice assigns Bob to Developer
2. Alice attempts to assign Bob to Developer again
3. System validates: Already assigned
4. Error returned: 409 "User already has Developer duty on this project"

### Case D: Override reason too short
1. Alice attempts to override with reason < 50 characters
2. Error returned: 400 "Override reason must be at least 50 characters"

**Expected Result**:
- ✅ Appropriate HTTP status codes (400, 403, 404, 409)
- ✅ Clear error messages
- ✅ No partial state changes on error

**Test Assertions**:
- Invalid user returns 404
- Non-Team Manager returns 403
- Duplicate assignment returns 409
- Short override reason returns 400 with specific message

---

## Scenario 10: Compliance Override Audit Trail

**Objective**: Generate compliance report showing all overrides with business justification.

**Setup**:
- Multiple projects with compliance overrides (from Scenarios 2, 3)
- Admin wants to audit all overrides for compliance review

**Steps**:
1. Admin navigates to Reports → Compliance Overrides
2. Filters: Project = Any, Standard = HITRUST, Date Range = Last 30 days
3. System returns list of all HiTrust overrides in timeframe
4. Admin views details of each override: who, when, why, user involved
5. Admin exports report as CSV for compliance auditor

**Expected Result**:
- ✅ Compliance override history queryable and reportable
- ✅ Each override shows: project, user assigned, duty, violated rule(s), approver, reason, timestamp
- ✅ Immutable audit trail (cannot edit/delete overrides)
- ✅ Exportable for compliance review

**Test Assertions**:
- `GET /api/compliance/overrides?standard=HITRUST&startDate=...&endDate=...` returns all matching
- Each override includes `complianceOverrideId`, `violatedRules`, `overriddenBy`, `reason`, `createdAt`
- Overrides cannot be modified (no PUT endpoint)
- Overrides cannot be deleted (no DELETE endpoint)

---

## Acceptance Criteria for All Scenarios

Each scenario MUST pass these criteria:

| Criterion | Validation |
|-----------|-----------|
| **API Contract Compliance** | Request/response match OpenAPI schemas |
| **Data Persistence** | Data persists across server restart |
| **Audit Trail** | All actions logged with timestamp/user |
| **Permission Enforcement** | Only Team Managers can assign/override |
| **Error Handling** | Appropriate status codes and messages |
| **State Consistency** | No orphaned/inconsistent state after errors |
| **Performance** | API responses < 2 seconds (P95) |
| **Compliance Validation** | Rules enforced correctly per standard |

---

## Test Execution Order

Run scenarios in this order to ensure dependencies:

1. **Setup Tests** (scenarios 1, 7)
2. **Validation Tests** (scenarios 2, 3, 9)
3. **Workflow Tests** (scenarios 4, 5, 6)
4. **Admin Tests** (scenario 8)
5. **Audit Tests** (scenario 10)

---

## Test Data Requirements

**Users**:
- Alice (Team Manager)
- Bob, Carol, Dan, Eve, Frank, George (team members)
- Henry, Iris, Jack (ALL-duty team)

**Projects**:
- SOC 2 project with 5+ team members
- HiTrust project with 5+ team members
- ALL-duty project with 3 team members

**Tasks**:
- Pre-created tasks in various stages
- Tasks with full workflow history

**Pre-setup Commands**:
```bash
# Seed test data
npm run test:seed -- --feature 004-team-assignments --profile full

# Run quickstart tests
npm run test:quickstart -- specs/004-Team\ Assigments/quickstart.md
```

---

## Success Definition

All 10 scenarios execute successfully with:
- ✅ Zero API failures (all responses as specified)
- ✅ Zero data consistency issues
- ✅ Compliance rules correctly enforced
- ✅ Audit trail complete and immutable
- ✅ UI matches expected states
- ✅ Performance within targets

---

*Ready for Phase 2 task generation and Phase 4 implementation.*
