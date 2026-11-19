# Quickstart: Task and Lifecycle Management

**Branch**: `009-task-and-lifecycle`
**Date**: 2026-02-21

Five integration test scenarios that validate the core workflows end-to-end.

---

## Prerequisites

- Dev server running (`npm run dev:server` on port 3001)
- Authenticated as ADMIN user (`TEST_ADMIN_EMAIL` / `TEST_ADMIN_PASSWORD` from `.env`)
- A project exists with Phase 1 assignee set and at least Phase 2 assignee set
- Note the project `id` (UUID) for use in all requests below

---

## Scenario 1: Scope Approval Gate (FR-001, FR-018, FR-021, FR-022)

**Goal**: Verify two-gate approval flow: submit → approve → clarified.

```bash
PROJECT_ID="<your-project-uuid>"

# Step 1: Create a scope stub
curl -s -X POST http://localhost:3001/api/projects/$PROJECT_ID/scopes \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title": "authentication", "content": "Handles user login and JWT tokens."}' \
  | jq '{id, specnumber, status}'
# Expected: {"id": "...", "specnumber": "001", "status": "draft"}

SCOPE_ID="<scope-id-from-above>"

# Step 2: Submit for review (Gate 1)
curl -s -X POST http://localhost:3001/api/projects/$PROJECT_ID/scopes/$SCOPE_ID/submit \
  -H "Authorization: Bearer $TOKEN" \
  | jq '{status: .scope.status, conflicts: .conflicts}'
# Expected: {"status": "in_review", "conflicts": []}

# Step 3: Approve (Gate 2 — as ADMIN)
curl -s -X POST http://localhost:3001/api/projects/$PROJECT_ID/scopes/$SCOPE_ID/approve \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action": "approve"}' \
  | jq '.status'
# Expected: "clarified"
```

**Pass criteria**: Scope `status` is `clarified` after approval. Notification created for scope creator. Audit log entry present in `companyauditlogs`.

---

## Scenario 2: AI Task Generation and Approval (FR-024, FR-025, FR-029)

**Goal**: Generate tasks for an approved scope, approve a subset, and verify task creation.

```bash
# Prereq: SCOPE_ID is in 'clarified' status from Scenario 1

# Step 1: Generate task proposals
curl -s -X POST http://localhost:3001/api/projects/$PROJECT_ID/scopes/$SCOPE_ID/generate-tasks \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.proposals | length'
# Expected: > 0 proposals

# Step 2: Approve first two proposals
PROPOSALS=$(curl -s -X POST http://localhost:3001/api/projects/$PROJECT_ID/scopes/$SCOPE_ID/generate-tasks \
  -H "Authorization: Bearer $TOKEN" | jq '.proposals[:2]')

curl -s -X POST http://localhost:3001/api/projects/$PROJECT_ID/scopes/$SCOPE_ID/approve-tasks \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"approvedtasks\": $PROPOSALS}" \
  | jq '.created | length'
# Expected: 2

# Step 3: Verify tasks appear in Implementation phase task list
IMPL_PHASE_ID="<implementation-phase-uuid>"
curl -s http://localhost:3001/api/projects/$PROJECT_ID/phases/$IMPL_PHASE_ID/tasks \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.groups[0].tasks | length'
# Expected: 2

# Step 4: Idempotency check — re-run generation, no duplicates proposed
curl -s -X POST http://localhost:3001/api/projects/$PROJECT_ID/scopes/$SCOPE_ID/generate-tasks \
  -H "Authorization: Bearer $TOKEN" \
  | jq '[.proposals[] | select(.isDuplicate == true)] | length'
# Expected: 2 (the already-created tasks flagged as duplicates)
```

**Pass criteria**: Tasks created with `specid` pointing to the scope. Duplicate detection works on re-run.

---

## Scenario 3: Task Dependency + Blocked Badge (FR-028, FR-033)

**Goal**: Create a dependency between two tasks and verify blocked status.

```bash
TASK_A_ID="<task-a-uuid>"  # The blocking task (incomplete)
TASK_B_ID="<task-b-uuid>"  # The task to be blocked

# Step 1: Add dependency: B is blocked by A
curl -s -X POST http://localhost:3001/api/projects/$PROJECT_ID/tasks/$TASK_B_ID/dependencies \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"blockedbyid\": \"$TASK_A_ID\"}" \
  | jq '{id, taskid, blockedbyid}'
# Expected: dependency record created

# Step 2: Fetch task B detail — should show blocked state
curl -s http://localhost:3001/api/projects/$PROJECT_ID/tasks/$TASK_B_ID \
  -H "Authorization: Bearer $TOKEN" \
  | jq '{isblocked: (.blockedby | length > 0), blockedby: [.blockedby[] | .name]}'
# Expected: {"isblocked": true, "blockedby": ["<task A name>"]}

# Step 3: Complete task A, verify B unblocks
curl -s -X PATCH http://localhost:3001/api/projects/$PROJECT_ID/tasks/$TASK_A_ID \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "completed"}' | jq '.status'
# Expected: "completed"

curl -s http://localhost:3001/api/projects/$PROJECT_ID/tasks/$TASK_B_ID \
  -H "Authorization: Bearer $TOKEN" \
  | jq '[.blockedby[] | select(.status != "completed")] | length'
# Expected: 0 (no incomplete blockers)
```

**Pass criteria**: Dependency created. Task B shows `blockedby` list. After A completes, B is no longer blocked.

---

## Scenario 4: QA Fail → Auto-Bug Creation (FR-030, FR-039)

**Goal**: Fail a QA task and verify auto-bug task is created in Phase 2.

```bash
QA_PHASE_ID="<qa-phase-uuid>"
QA_TASK_ID="<qa-task-uuid>"   # Must have specid set to a scope

# Step 1: Set QA task to in_progress
curl -s -X PATCH http://localhost:3001/api/projects/$PROJECT_ID/tasks/$QA_TASK_ID \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "in_progress"}' | jq '.status'
# Expected: "in_progress"

# Step 2: Set result to fail
curl -s -X PATCH http://localhost:3001/api/projects/$PROJECT_ID/tasks/$QA_TASK_ID \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"result": "fail"}' | jq '{status, result}'
# Expected: {"status": "in_progress", "result": "fail"}

# Step 3: Check Phase 2 for auto-created bug
IMPL_PHASE_ID="<implementation-phase-uuid>"
curl -s http://localhost:3001/api/projects/$PROJECT_ID/phases/$IMPL_PHASE_ID/tasks \
  -H "Authorization: Bearer $TOKEN" \
  | jq '[.groups[].tasks[] | select(.name | startswith("[QA Fail]"))] | length'
# Expected: 1

# Step 4: Verify bug has same specid and no assignee
curl -s http://localhost:3001/api/projects/$PROJECT_ID/phases/$IMPL_PHASE_ID/tasks \
  -H "Authorization: Bearer $TOKEN" \
  | jq '[.groups[].tasks[] | select(.name | startswith("[QA Fail]"))] | .[0] | {issuetype, assignedtoid, specid}'
# Expected: {"issuetype": "bug", "assignedtoid": null, "specid": "<same scope id>"}
```

**Pass criteria**: Bug task with `[QA Fail]` prefix created in Phase 2. No auto-assignee. Same `specid` as QA task. Phase 2 assignee notification created.

---

## Scenario 5: Phase Completion Validation (FR-034, FR-035, FR-036)

**Goal**: Verify phase cannot advance with open tasks; succeeds after all complete.

```bash
IMPL_PHASE_ID="<implementation-phase-uuid>"

# Step 1: Attempt completion with open tasks — should fail
curl -s -X GET http://localhost:3001/api/projects/$PROJECT_ID/phases/$IMPL_PHASE_ID/validate \
  -H "Authorization: Bearer $TOKEN" \
  | jq '{canadvance, blockingtaskcount: (.blockingtasks | length)}'
# Expected: {"canadvance": false, "blockingtaskcount": >0}

curl -s -X POST http://localhost:3001/api/projects/$PROJECT_ID/phases/$IMPL_PHASE_ID/complete \
  -H "Authorization: Bearer $TOKEN" | jq '.error'
# Expected: "Phase cannot advance"

# Step 2: Complete all remaining open tasks
# (mark each blocking task as completed via PATCH /tasks/:id)

# Step 3: Validate again — should pass
curl -s -X GET http://localhost:3001/api/projects/$PROJECT_ID/phases/$IMPL_PHASE_ID/validate \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.canadvance'
# Expected: true

# Step 4: Mark phase complete
curl -s -X POST http://localhost:3001/api/projects/$PROJECT_ID/phases/$IMPL_PHASE_ID/complete \
  -H "Authorization: Bearer $TOKEN" \
  | jq '{currentstatus: .phase.status, nextstatus: .nextphase.status}'
# Expected: {"currentstatus": "complete", "nextstatus": "in_progress"}
```

**Pass criteria**: Validation blocks advancement with open tasks. Phase advances after all tasks complete. Audit log entry written. Next phase assignee notification created.
