# API Contracts: Task and Lifecycle Management

**Branch**: `009-task-and-lifecycle`
**Date**: 2026-02-21
**Base path**: `/api` (Express server, port 3001)
**Auth**: All endpoints require `Authorization: Bearer <token>` header via `authenticateToken` middleware.

---

## Scope Lifecycle Endpoints

### GET `/projects/:id/scopes`

Returns all scopes for a project with lifecycle status and matrix cell derivations.

**Response 200**:
```json
{
  "scopes": [
    {
      "id": "uuid",
      "specnumber": "001",
      "title": "authentication",
      "content": "...",
      "status": "clarified",
      "specorder": 0,
      "isoptional": false,
      "createdbyid": "uuid",
      "createdbyname": "Jane Smith",
      "createdat": "ISO8601",
      "updatedat": "ISO8601",
      "taskcount": 5,
      "completedtaskcount": 2
    }
  ]
}
```

---

### POST `/projects/:id/scopes`

Create a new scope stub.

**Request body**:
```json
{
  "title": "billing",
  "content": "Optional initial content"
}
```

**Response 201**: scope object (same shape as GET item)

**Side effects**: `specnumber` auto-assigned as next available (padded 3 digits). `createdbyid` = authenticated user. `specorder` = current max + 1.

---

### PATCH `/projects/:id/scopes/:scopeid`

Update scope fields (title, content, specorder, isoptional, status override by ADMIN).

**Request body** (all optional):
```json
{
  "title": "string",
  "content": "string",
  "specorder": 0,
  "isoptional": false
}
```

**Side effects**: If `content` is updated and current `status` is `in_review` or `clarified`, status auto-reverts to `draft` (logged to `companyauditlogs`).

**Response 200**: updated scope object

---

### POST `/projects/:id/scopes/:scopeid/submit`

Gate 1: Submit scope for review (`draft → in_review`). Triggers conflict check first.

**Request body**: none

**Response 200**:
```json
{
  "scope": { "...updated scope..." },
  "conflicts": [
    {
      "conflicttype": "functional_overlap",
      "withscope": "002-billing",
      "description": "Both scopes define invoice generation behavior"
    }
  ],
  "requiresOverride": true
}
```

If `requiresOverride: true`, client must call this endpoint again with `{ "override": true }` to confirm. Override logged to `companyauditlogs`.

---

### POST `/projects/:id/scopes/:scopeid/approve`

Gate 2: Approve, reject, or request clarification on a scope in `in_review`.
**Auth restriction**: Phase 1 assignee or ADMIN only.

**Request body**:
```json
{
  "action": "approve" | "request_changes" | "request_clarification",
  "note": "Optional note (required for request_changes and request_clarification)",
  "clarificationtype": "chat_note" | "meeting"
}
```

**Response 200**: updated scope object

**Side effects**:
- `approve`: status → `clarified`, audit log entry, notify scope `createdbyid`
- `request_changes`: status → `draft`, notify `createdbyid` with note
- `request_clarification` + `chat_note`: status stays `in_review`, chat re-opened with note
- `request_clarification` + `meeting`: status → `pending_clarification`

---

### PATCH `/projects/:id/scopes/:scopeid/status`

ADMIN override of scope status (any → any).

**Request body**:
```json
{
  "status": "deferred",
  "reason": "Moved to next release"
}
```

**Auth restriction**: ADMIN only.

**Response 200**: updated scope object. Audit log entry written.

---

### GET `/projects/:id/scopes/matrix`

Returns Scope Matrix data: all scopes × all phases with derived cell status.

**Response 200**:
```json
{
  "scopes": [
    {
      "id": "uuid",
      "specnumber": "001",
      "title": "authentication",
      "status": "clarified",
      "isoptional": false,
      "phases": {
        "Design": "complete",
        "Implementation": "active",
        "QA": "pending",
        "HumanTesting": "pending",
        "Beta": "pending",
        "Release": "pending"
      }
    }
  ],
  "phases": ["Design", "Implementation", "QA", "HumanTesting", "Beta", "Release"]
}
```

---

## Task Endpoints

### GET `/projects/:id/phases/:phaseid/tasks`

Returns tasks for a phase, grouped by scope.

**Query params**: `?scopeid=uuid` (filter to one scope)

**Response 200**:
```json
{
  "groups": [
    {
      "scopeid": "uuid",
      "scopenumber": "001",
      "scopetitle": "authentication",
      "scopestatus": "clarified",
      "tasks": [
        {
          "id": "uuid",
          "name": "Implement JWT refresh token",
          "status": "open",
          "priority": "high",
          "issuetype": "task",
          "effort": "medium",
          "assignedtoid": null,
          "assignedtoname": null,
          "duedate": null,
          "result": null,
          "specid": "uuid",
          "isblocked": false,
          "createdat": "ISO8601",
          "updatedat": "ISO8601"
        }
      ],
      "taskcount": 3,
      "completedcount": 0
    }
  ],
  "unscopedtasks": []
}
```

---

### GET `/projects/:id/tasks/:taskid`

Returns full task detail including dependencies, time entries count, and notes count.

**Response 200**:
```json
{
  "id": "uuid",
  "name": "string",
  "description": "Markdown string",
  "status": "open",
  "priority": "high",
  "issuetype": "task",
  "effort": "medium",
  "assignedtoid": "uuid",
  "assignedtoname": "Jane Smith",
  "duedate": "2026-03-01",
  "result": null,
  "specid": "uuid",
  "scopetitle": "authentication",
  "externalid": null,
  "sourcepmssystem": null,
  "blockedby": [{ "id": "uuid", "name": "Setup DB schema", "status": "open" }],
  "blocking": [],
  "timeentriescount": 2,
  "notescount": 1,
  "createdat": "ISO8601",
  "updatedat": "ISO8601"
}
```

---

### PATCH `/projects/:id/tasks/:taskid`

Update task fields.

**Request body** (all optional):
```json
{
  "name": "string",
  "description": "string",
  "status": "in_progress",
  "result": "fail",
  "priority": "critical",
  "issuetype": "bug",
  "effort": "large",
  "assignedtoid": "uuid",
  "duedate": "2026-03-01",
  "specid": "uuid"
}
```

**Side effects**:
- If `result = 'fail'` and task is in Phase 3: auto-creates bug task in Phase 2 for same scope; notifies Phase 2 assignee
- If `status = 'escalated'` and task is in Phase 4: auto-creates draft scope stub; creates notification for ADMIN

**Response 200**: updated task object (same shape as GET detail)

---

### GET `/projects/:id/tasks/:taskid/activity`

Returns chronological activity log for a task.

**Response 200**:
```json
{
  "entries": [
    {
      "id": "uuid",
      "actorid": "uuid",
      "actorname": "Jane Smith",
      "type": "status_change",
      "description": "Status changed from open to in_progress",
      "createdat": "ISO8601"
    }
  ]
}
```

---

## Task Dependency Endpoints

### POST `/projects/:id/tasks/:taskid/dependencies`

Add a dependency: `taskid` is blocked by `blockedbyid`.

**Request body**:
```json
{ "blockedbyid": "uuid" }
```

**Validation**: No circular dependency allowed (system checks transitive chain).

**Response 201**: `{ "id": "uuid", "taskid": "uuid", "blockedbyid": "uuid", "createdat": "ISO8601" }`

---

### DELETE `/projects/:id/tasks/:taskid/dependencies/:dependencyid`

Remove a dependency link.

**Response 204**: no body

---

## Scope Chat Endpoints

### GET `/projects/:id/scopes/:scopeid/chat`

Returns full conversation history for a scope.

**Response 200**:
```json
{
  "messages": [
    { "id": "uuid", "role": "user", "content": "string", "createdat": "ISO8601" },
    { "id": "uuid", "role": "assistant", "content": "string", "createdat": "ISO8601" }
  ],
  "scopecontent": "Current scope Markdown content",
  "scopestatus": "draft"
}
```

---

### POST `/projects/:id/scopes/:scopeid/chat`

Send a user message. Returns SSE stream.

**Request body**:
```json
{ "message": "string" }
```

**Response**: `Content-Type: text/event-stream`

SSE event types:
```
event: token
data: {"text": "partial token"}

event: section_lock
data: {"section": "## Requirements"}

event: section_unlock
data: {"section": "## Requirements"}

event: scope_update
data: {"content": "full updated scope markdown"}

event: split_proposal
data: {"topic": "invoicing", "suggestedname": "003-accounting-invoices"}

event: done
data: {}
```

**Auth restriction**: Phase 1 assignee or ADMIN only.

---

### POST `/projects/:id/scopes/:scopeid/chat/split`

Accept or decline a split proposal.

**Request body**:
```json
{
  "action": "accept" | "decline",
  "topic": "invoicing",
  "suggestedname": "003-accounting-invoices"
}
```

**Response 200** (accept):
```json
{
  "newscope": { "id": "uuid", "specnumber": "003", "title": "accounting-invoices", "status": "draft" },
  "updatescope": { "...updated current scope..." }
}
```

**Response 200** (decline): `{ "recorded": true }` — stores system event in `scopeconversations`

---

### GET `/projects/:id/scopes/:scopeid/chat/export`

Export conversation transcript.

**Query params**: `?format=markdown` (default) or `?format=text`

**Response 200**: file download (`Content-Disposition: attachment; filename="scope-NNN-conversation.md"`)

---

## AI Task Generation Endpoints

### POST `/projects/:id/scopes/:scopeid/generate-tasks`

Propose AI-generated tasks for a scope. Scope must be at `clarified` or later.

**Response 200**:
```json
{
  "proposals": [
    {
      "name": "Implement JWT refresh token rotation",
      "description": "...",
      "issuetype": "task",
      "priority": "high",
      "phase": "Implementation",
      "isDuplicate": false
    }
  ]
}
```

---

### POST `/projects/:id/scopes/:scopeid/approve-tasks`

Approve a subset of proposed tasks and create them as real records.

**Request body**:
```json
{
  "approvedtasks": [
    {
      "name": "Implement JWT refresh token rotation",
      "description": "...",
      "issuetype": "task",
      "priority": "high",
      "phase": "Implementation"
    }
  ]
}
```

**Response 201**: `{ "created": [ { task objects... } ] }`

---

## Phase Validation Endpoint

### GET `/projects/:id/phases/:phaseid/validate`

Returns phase completion validation checklist. Used before "Mark Phase Complete".

**Response 200**:
```json
{
  "canadvance": false,
  "criteria": [
    { "label": "All tasks completed", "passed": false, "detail": "3 tasks still open" },
    { "label": "No QA failures", "passed": true, "detail": "" },
    { "label": "All active scopes at required status", "passed": true, "detail": "" }
  ],
  "blockingtasks": [
    { "id": "uuid", "name": "Implement JWT refresh", "status": "in_progress", "scopetitle": "authentication" }
  ]
}
```

---

### POST `/projects/:id/phases/:phaseid/complete`

Mark phase complete. Runs validation first; rejects if not passing.

**Request body**: `{}`

**Response 200**:
```json
{
  "phase": { "...updated phase object with status: complete..." },
  "nextphase": { "...updated next phase object with status: in_progress..." }
}
```

**Response 422**: `{ "error": "Phase cannot advance", "criteria": [...] }`

**Side effects**: audit log entry, notification to next phase assignee

---

## Notifications Endpoints

### GET `/notifications`

Returns notifications for the authenticated user.

**Query params**: `?unreadonly=true`, `?limit=50`, `?offset=0`

**Response 200**:
```json
{
  "notifications": [
    {
      "id": "uuid",
      "type": "task_assigned",
      "entityid": "uuid",
      "entitytype": "task",
      "message": "You were assigned: Implement JWT refresh token",
      "read": false,
      "createdat": "ISO8601"
    }
  ],
  "unreadcount": 3
}
```

---

### PATCH `/notifications/:id/read`

Mark a single notification as read.

**Response 200**: `{ "read": true }`

---

### POST `/notifications/read-all`

Mark all notifications for authenticated user as read.

**Response 200**: `{ "updated": 5 }`
