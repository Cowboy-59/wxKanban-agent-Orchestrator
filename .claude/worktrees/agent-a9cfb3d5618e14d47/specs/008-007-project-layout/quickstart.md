# Quickstart: Project Layout & Lifecycle Workspace

**Feature**: 008-007-project-layout
**Date**: 2026-02-21

Test scenarios are written as sequential integration test flows. Each scenario uses real API calls (no mocks).

---

## Prerequisites

```bash
# Environment
WXKANBAN_API_URL=http://localhost:3001
TEST_ADMIN_EMAIL=<from .env>
TEST_ADMIN_PASSWORD=<from .env>
TEST_MEMBER_EMAIL=<team member account>
TEST_MEMBER_PASSWORD=<team member password>
```

---

## Scenario 1 — ADMIN Creates Project, Phases Auto-Created

**Story**: ADMIN creates a project and sees all 6 phases initialized.

```
POST /api/auth/signin
  body: { email: TEST_ADMIN_EMAIL, password: TEST_ADMIN_PASSWORD }
  → extract: adminToken

POST /api/projects
  auth: adminToken
  body: { name: "E2E Test Project", description: "Quickstart test project" }
  → assert: 201, body.project.id exists
  → assert: body.scaffolding === "pending"
  → store: projectId = body.project.id

GET /api/projects/{projectId}/phases
  auth: adminToken
  → assert: 200, body.phases.length === 6
  → assert: phases[0].phasename === "Design" AND phases[0].status === "in_progress"
  → assert: phases[1..5].status === "pending"
  → assert: phases[0].assigneduserid === null (no phase assignments in this test)
```

---

## Scenario 2 — Project List Visibility (ADMIN vs TEAM_MEMBER)

**Story**: ADMIN sees all projects; TEAM_MEMBER sees only projects where they own the active phase.

```
# Setup: create 2 projects and assign member to phase 1 of project A only
POST /api/auth/signin { email: TEST_MEMBER_EMAIL, ... }
  → extract: memberUserId (from GET /api/auth/me or decoded JWT)
  → extract: memberToken

POST /api/projects (adminToken)
  body: { name: "Project A", phaseassignments: { "Design": memberUserId } }
  → store: projectA_id

POST /api/projects (adminToken)
  body: { name: "Project B" }
  → store: projectB_id

GET /api/projects
  auth: adminToken
  → assert: response includes both projectA_id and projectB_id

GET /api/projects
  auth: memberToken
  → assert: response includes projectA_id
  → assert: response does NOT include projectB_id

# Advance Project A to Implementation (where member is not assigned)
POST /api/projects/{projectA_id}/phases/{designPhaseId}/advance
  auth: adminToken
  → assert: 200

GET /api/projects
  auth: memberToken
  → assert: response does NOT include projectA_id (member not assigned to Implementation)
```

---

## Scenario 3 — Phase Completion Gate

**Story**: ADMIN cannot advance Design phase until at least one spec is approved.

```
GET /api/projects/{projectId}/phases/{designPhaseId}/completion
  auth: adminToken
  → assert: body.completion.canAdvance === false
  → assert: criteria contains { label: "Approved specifications", passed: false }

POST /api/projects/{projectId}/phases/{designPhaseId}/advance
  auth: adminToken
  → assert: 409 (criteria not met)

# Create and approve a spec
POST /api/projects/{projectId}/phases/{designPhaseId}/specs
  auth: adminToken
  body: { title: "Core Module", content: "Spec content..." }
  → store: specId

PATCH /api/projects/{projectId}/phases/{designPhaseId}/specs/{specId}
  auth: adminToken
  body: { status: "approved" }
  → assert: 200

GET /api/projects/{projectId}/phases/{designPhaseId}/completion
  auth: adminToken
  → assert: body.completion.canAdvance === true

POST /api/projects/{projectId}/phases/{designPhaseId}/advance
  auth: adminToken
  → assert: 200
  → assert: body.completedphase.status === "complete"
  → assert: body.activatedphase.phasename === "Implementation"
```

---

## Scenario 4 — Phase Reopen with Audit Log

**Story**: ADMIN reopens Design phase after advancing, with a reason.

```
# Assumes Design phase is complete from Scenario 3

POST /api/projects/{projectId}/phases/{designPhaseId}/reopen
  auth: adminToken
  body: { reason: "Missed a module in initial design" }
  → assert: 200

GET /api/projects/{projectId}/phases
  auth: adminToken
  → assert: phases[0].status === "reopened"
  → assert: phases[0].reason === "Missed a module in initial design"

# Verify audit log entry
GET /api/company/audit-log (or check DB)
  → assert: entry with action="phase_reopened" exists
  → assert: entry description includes projectId
```

---

## Scenario 5 — Scaffold Endpoint for project.init

**Story**: Developer calls scaffold endpoint and receives all data needed for local init.

```
GET /api/projects/{projectId}/scaffold
  auth: adminToken
  → assert: 200
  → assert: body.project.id === projectId
  → assert: body.project.name is string
  → assert: body.phases.length === 6
  → assert: body.phases[0].assigneduser is null OR { fullname, emailaddr }

# If AI scaffolding has completed (may need short wait in test):
  → assert: body.overview.content is non-empty string
  → assert: body.specs is array (may be empty if AI not yet complete)
```

---

## Scenario 6 — Task Scoping Per Phase

**Story**: Task created in Implementation phase appears only in that phase's task list.

```
# Get Implementation phase id
GET /api/projects/{projectId}/phases → store: implPhaseId (phasename=Implementation, status=in_progress)

POST /api/projects/{projectId}/phases/{implPhaseId}/tasks
  auth: adminToken
  body: { name: "Build login form", issuetype: "task", priority: "high" }
  → assert: 201
  → store: taskId

GET /api/projects/{projectId}/phases/{implPhaseId}/tasks
  auth: adminToken
  → assert: task with taskId is present

# Design phase tasks should NOT contain implPhaseId tasks
GET /api/projects/{projectId}/phases/{designPhaseId}/tasks
  auth: adminToken
  → assert: task with taskId is NOT present
```

---

## Scenario 7 — Non-Admin Gets 403 for Unassigned Project

**Story**: TEAM_MEMBER cannot access project workspace if not assigned to active phase.

```
# Project B has no phase assignments
GET /api/projects/{projectB_id}
  auth: memberToken
  → assert: 403
```
