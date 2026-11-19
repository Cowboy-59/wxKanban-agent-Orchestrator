# API Contracts: wxKanban Multi-Platform Task Management

**Date**: 2026-01-22
**OpenAPI Version**: 3.0.3
**Base URL**: https://api.wxkanban.com/v1

## Overview

This document outlines all API endpoints for the wxKanban system. Full OpenAPI YAML specifications will be generated during implementation phase.

---

## 1. Authentication API

**Base Path**: `/api/auth`

### Endpoints

#### POST /api/auth/sign-up

**Purpose**: Register new user account

**Request Body**:

```json
{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "name": "John Doe"
}
```

**Response** (201):

```json
{
  "userid": "uuid-v7",
  "email": "user@example.com",
  "name": "John Doe"
}
```

**Validation**:

- FR-001: Email validation
- FR-003: Password strength requirements

---

#### POST /api/auth/sign-in

**Purpose**: Authenticate existing user

**Request Body**:

```json
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

**Response** (200):

```json
{
  "accessToken": "jwt-token",
  "refreshToken": "refresh-token",
  "user": {
    "userid": "uuid-v7",
    "email": "user@example.com",
    "name": "John Doe"
  }
}
```

**Validation**:

- FR-002: Secure authentication

---

#### POST /api/auth/reset-password

**Purpose**: Initiate password reset

**Request Body**:

```json
{
  "email": "user@example.com"
}
```

**Response** (200):

```json
{
  "message": "Password reset email sent"
}
```

**Validation**:

- FR-004: Password reset flow

---

## 2. PM Integrations API

**Base Path**: `/api/pm`
**Authentication**: Required (Bearer token)

### Endpoints

#### GET /api/pm/connections

**Purpose**: List user's PM system connections

**Response** (200):

```json
{
  "connections": [
    {
      "connectionid": "uuid-v7",
      "systemtype": "jira",
      "systemname": "Work Jira",
      "syncstatus": "active",
      "lastsyncat": "2026-01-22T10:30:00Z"
    }
  ]
}
```

**Validation**:

- FR-005: Show all user connections

---

#### POST /api/pm/connections

**Purpose**: Add new PM system connection

**Request Body**:

```json
{
  "systemtype": "jira",
  "systemname": "Work Jira",
  "credentials": {
    "accessToken": "oauth-token",
    "refreshToken": "refresh-token",
    "instanceUrl": "https://company.atlassian.net"
  }
}
```

**Response** (201):

```json
{
  "connectionid": "uuid-v7",
  "systemtype": "jira",
  "systemname": "Work Jira",
  "syncstatus": "active"
}
```

**Validation**:

- FR-005: Support Jira, Monday, Asana, Trello
- FR-009: Add connections at any time

---

#### DELETE /api/pm/connections/:connectionid

**Purpose**: Remove PM system connection

**Response** (204): No content

**Validation**:

- FR-010: Disconnect/remove integrations

---

#### POST /api/pm/sync

**Purpose**: Trigger manual sync of all connections

**Request Body** (optional):

```json
{
  "connectionid": "uuid-v7"
}
```

**Response** (200):

```json
{
  "syncStarted": true,
  "connectionsProcessed": 4,
  "tasksUpdated": 23
}
```

**Validation**:

- FR-015: Refresh task data on user request

---

#### GET /api/pm/:system/tasks

**Purpose**: Get tasks from specific PM system

**Parameters**:

- `system`: jira | monday | asana | trello

**Response** (200):

```json
{
  "tasks": [
    {
      "externaltaskid": "PROJ-123",
      "title": "Implement feature X",
      "status": "In Progress",
      "priority": "high",
      "duedate": "2026-01-25T00:00:00Z"
    }
  ]
}
```

**Validation**:

- FR-006: Retrieve tasks from connected PM systems

---

## 3. Tasks API

**Base Path**: `/api/tasks`
**Authentication**: Required (Bearer token)

### Endpoints

#### GET /api/tasks

**Purpose**: Get unified task list (all sources)

**Query Parameters**:

- `source`: Filter by source (jira|monday|asana|trello|internal|ai_proposed)
- `status`: Filter by status
- `priority`: Filter by priority (low|medium|high|urgent)
- `projectid`: Filter by project
- `sortBy`: Sort field (duedate|priority|createdat)
- `sortOrder`: asc|desc

**Response** (200):

```json
{
  "tasks": [
    {
      "taskid": "uuid-v7",
      "source": "jira",
      "title": "Implement feature X",
      "description": "Full description...",
      "status": "In Progress",
      "priority": "high",
      "duedate": "2026-01-25T00:00:00Z",
      "project": {
        "projectid": "uuid-v7",
        "name": "Client Project A"
      }
    }
  ],
  "total": 42
}
```

**Validation**:

- FR-011: Display aggregated tasks from all PM systems
- FR-012: Sort and filter by priority, due date, source

---

#### POST /api/tasks

**Purpose**: Create internal task

**Request Body**:

```json
{
  "projectid": "uuid-v7",
  "boardid": "uuid-v7",
  "title": "Internal task",
  "description": "Task description",
  "priority": "medium",
  "duedate": "2026-01-30T00:00:00Z",
  "effortestimate": "4 hours"
}
```

**Response** (201):

```json
{
  "taskid": "uuid-v7",
  "source": "internal",
  "title": "Internal task",
  "status": "not_started",
  "createdat": "2026-01-22T12:00:00Z"
}
```

**Validation**:

- FR-016: Create tasks manually within wxKanban
- FR-019: Assign priority, due dates, descriptions

---

#### PATCH /api/tasks/:taskid

**Purpose**: Update task details

**Request Body**:

```json
{
  "status": "completed",
  "priority": "high",
  "notes": "Work completed"
}
```

**Response** (200):

```json
{
  "taskid": "uuid-v7",
  "status": "completed",
  "updatedat": "2026-01-22T14:00:00Z"
}
```

**Validation**:

- FR-007: Sync task updates back to source PM system
- FR-013: Manually adjust priority

---

#### GET /api/tasks/:taskid

**Purpose**: Get detailed task information

**Response** (200):

```json
{
  "taskid": "uuid-v7",
  "source": "jira",
  "externaltaskid": "PROJ-123",
  "title": "Task title",
  "description": "Full description",
  "status": "In Progress",
  "priority": "high",
  "duedate": "2026-01-25T00:00:00Z",
  "project": { "projectid": "uuid-v7", "name": "Project A" },
  "timeEntries": [],
  "notes": []
}
```

---

#### DELETE /api/tasks/:taskid

**Purpose**: Delete internal task (cannot delete external tasks)

**Response** (204): No content

**Validation**:

- Only internal tasks can be deleted
- External tasks must be deleted in source system

---

## 4. Time Tracking API

**Base Path**: `/api/time`
**Authentication**: Required (Bearer token)

### Endpoints

#### POST /api/time/start

**Purpose**: Start timer for one or more tasks

**Request Body**:

```json
{
  "taskids": ["uuid-v7-1", "uuid-v7-2"],
  "isbillable": true
}
```

**Response** (201):

```json
{
  "timeentries": [
    {
      "timeentryid": "uuid-v7",
      "taskid": "uuid-v7-1",
      "starttime": "2026-01-22T10:00:00Z",
      "status": "running"
    }
  ]
}
```

**Validation**:

- FR-023: Select one or more tasks and start timer
- FR-024: Track elapsed time separately

---

#### POST /api/time/pause

**Purpose**: Pause active timer

**Request Body**:

```json
{
  "timeentryid": "uuid-v7"
}
```

**Response** (200):

```json
{
  "timeentryid": "uuid-v7",
  "status": "paused",
  "totalpausedduration": 120000
}
```

**Validation**:

- FR-025: Pause and resume functionality

---

#### POST /api/time/resume

**Purpose**: Resume paused timer

**Request Body**:

```json
{
  "timeentryid": "uuid-v7"
}
```

**Response** (200):

```json
{
  "timeentryid": "uuid-v7",
  "status": "running"
}
```

**Validation**:

- FR-025: Pause and resume functionality

---

#### POST /api/time/stop

**Purpose**: Stop active or paused timer

**Request Body**:

```json
{
  "timeentryid": "uuid-v7",
  "notes": "Completed feature implementation"
}
```

**Response** (200):

```json
{
  "timeentryid": "uuid-v7",
  "duration": 7200000,
  "status": "completed"
}
```

**Validation**:

- FR-024: Track elapsed time

---

#### GET /api/time/entries

**Purpose**: Get time entry history

**Query Parameters**:

- `projectid`: Filter by project
- `taskid`: Filter by task
- `startdate`: Filter by date range start
- `enddate`: Filter by date range end
- `isbillable`: Filter by billable status
- `invoiced`: Filter by invoiced status

**Response** (200):

```json
{
  "entries": [
    {
      "timeentryid": "uuid-v7",
      "task": { "taskid": "uuid-v7", "title": "Task title" },
      "starttime": "2026-01-22T10:00:00Z",
      "endtime": "2026-01-22T12:00:00Z",
      "duration": 7200000,
      "isbillable": true,
      "invoiced": false
    }
  ],
  "totalhours": 24.5,
  "billablehours": 18.0
}
```

**Validation**:

- FR-027: Maintain complete history
- FR-030: View total hours per task/project
- FR-031: Distinguish billable vs non-billable

---

#### POST /api/time/entries

**Purpose**: Manually add/edit time entry

**Request Body**:

```json
{
  "taskid": "uuid-v7",
  "starttime": "2026-01-20T09:00:00Z",
  "endtime": "2026-01-20T11:30:00Z",
  "isbillable": true,
  "notes": "Manual entry for past work"
}
```

**Response** (201):

```json
{
  "timeentryid": "uuid-v7",
  "duration": 9000000,
  "status": "completed"
}
```

**Validation**:

- FR-028: Manually add or edit time entries

---

#### PATCH /api/time/entries/:timeentryid

**Purpose**: Update existing time entry

**Request Body**:

```json
{
  "isbillable": false,
  "notes": "Updated notes"
}
```

**Response** (200):

```json
{
  "timeentryid": "uuid-v7",
  "isbillable": false,
  "updatedat": "2026-01-22T15:00:00Z"
}
```

**Validation**:

- FR-026: Categorize time entries
- FR-028: Edit time entries

---

## 5. Invoicing API

**Base Path**: `/api/invoices`
**Authentication**: Required (Bearer token)

### Endpoints

#### POST /api/invoices/generate

**Purpose**: Generate invoice for client/project

**Request Body**:

```json
{
  "clientid": "uuid-v7",
  "projectid": "uuid-v7",
  "startperiod": "2026-01-01",
  "endperiod": "2026-01-31",
  "includeunbilledonly": true
}
```

**Response** (201):

```json
{
  "invoiceid": "uuid-v7",
  "invoicenumber": "INV-2026-001",
  "clientid": "uuid-v7",
  "subtotal": 4500.0,
  "totalamount": 4500.0,
  "pdfurl": "/invoices/uuid-v7/download",
  "timeentries": 25
}
```

**Validation**:

- FR-035: Generate timesheets for client/project
- FR-036: Generate invoices based on billable hours
- FR-037: Calculate total amounts
- FR-038: Mark time entries as invoiced

---

#### GET /api/invoices

**Purpose**: List user's invoices

**Query Parameters**:

- `clientid`: Filter by client
- `status`: Filter by status (draft|sent|paid|void)
- `startdate`: Filter by date range

**Response** (200):

```json
{
  "invoices": [
    {
      "invoiceid": "uuid-v7",
      "invoicenumber": "INV-2026-001",
      "client": { "clientid": "uuid-v7", "companyname": "ACME Corp" },
      "totalamount": 4500.0,
      "status": "sent",
      "generateddate": "2026-01-22",
      "duedate": "2026-02-05"
    }
  ]
}
```

---

#### GET /api/invoices/:invoiceid

**Purpose**: Get detailed invoice information

**Response** (200):

```json
{
  "invoiceid": "uuid-v7",
  "invoicenumber": "INV-2026-001",
  "client": {
    "companyname": "ACME Corp",
    "billingemail": "billing@acme.com"
  },
  "timeentries": [
    {
      "task": "Feature implementation",
      "date": "2026-01-15",
      "duration": 7200000,
      "rate": 150.0,
      "amount": 300.0
    }
  ],
  "subtotal": 4500.0,
  "totalamount": 4500.0,
  "status": "sent",
  "pdfurl": "/invoices/uuid-v7/download"
}
```

**Validation**:

- FR-039: Download generated invoices

---

#### POST /api/invoices/:invoiceid/send

**Purpose**: Send invoice via email to client

**Request Body**:

```json
{
  "to": "billing@acme.com",
  "message": "Please find attached invoice for January 2026."
}
```

**Response** (200):

```json
{
  "sent": true,
  "sentat": "2026-01-22T16:00:00Z",
  "recipient": "billing@acme.com"
}
```

**Validation**:

- FR-040: Send invoices via email

---

#### GET /api/timesheets/generate

**Purpose**: Generate timesheet report (not invoice)

**Query Parameters**:

- `clientid`: Client to generate for
- `projectid`: Project to generate for
- `startdate`: Period start
- `enddate`: Period end

**Response** (200):

```json
{
  "pdfurl": "/timesheets/uuid-v7/download",
  "summary": {
    "totalhours": 45.5,
    "billablehours": 38.0,
    "nonbillablehours": 7.5
  }
}
```

**Validation**:

- FR-035: Generate timesheets

---

## 6. AI Proposals API

**Base Path**: `/api/ai`
**Authentication**: Required (Bearer token)

### Endpoints

#### POST /api/ai/propose-tasks

**Purpose**: Request AI task proposals

**Request Body**:

```json
{
  "projectid": "uuid-v7",
  "context": "Working on user authentication feature"
}
```

**Response** (200):

```json
{
  "proposals": [
    {
      "proposalid": "uuid-v7",
      "title": "Write unit tests for auth service",
      "description": "Comprehensive test coverage for authentication logic",
      "priority": "high",
      "effortestimate": "4-6 hours",
      "rationale": "Testing is essential for security-critical features"
    }
  ]
}
```

**Validation**:

- FR-041: AI analyzes context and proposes tasks
- FR-042: Auto-trigger when starting work (if enabled)

---

#### GET /api/ai/proposals

**Purpose**: List pending AI proposals

**Response** (200):

```json
{
  "proposals": [
    {
      "proposalid": "uuid-v7",
      "title": "Write unit tests",
      "status": "pending",
      "createdat": "2026-01-22T10:00:00Z"
    }
  ]
}
```

**Validation**:

- FR-044: Present proposals for review

---

#### POST /api/ai/proposals/:proposalid/accept

**Purpose**: Accept AI proposal and create task

**Response** (200):

```json
{
  "proposalid": "uuid-v7",
  "status": "accepted",
  "taskid": "uuid-v7",
  "task": {
    "taskid": "uuid-v7",
    "title": "Write unit tests for auth service",
    "source": "ai_proposed"
  }
}
```

**Validation**:

- FR-045: Accept proposals individually
- FR-046: Track task source

---

#### POST /api/ai/proposals/:proposalid/reject

**Purpose**: Reject AI proposal

**Request Body**:

```json
{
  "reason": "Not relevant to current priorities"
}
```

**Response** (200):

```json
{
  "proposalid": "uuid-v7",
  "status": "rejected"
}
```

**Validation**:

- FR-045: Reject proposals individually

---

## Error Responses

All endpoints use standard HTTP status codes and return errors in this format:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid email format",
    "field": "email"
  }
}
```

### Common Error Codes

- `400 Bad Request`: Invalid request data
- `401 Unauthorized`: Authentication required
- `403 Forbidden`: Insufficient permissions
- `404 Not Found`: Resource not found
- `409 Conflict`: Resource conflict (e.g., duplicate)
- `422 Unprocessable Entity`: Validation error
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Server error

---

## Rate Limiting

- **Default**: 100 requests per minute per user
- **Burst**: 20 requests per 10 seconds
- **Headers**:
  - `X-RateLimit-Limit`: Total requests allowed
  - `X-RateLimit-Remaining`: Requests remaining
  - `X-RateLimit-Reset`: Time until reset (UTC)

---

## Authentication

All endpoints (except `/api/auth/*`) require Bearer token authentication:

```
Authorization: Bearer <jwt-token>
```

Tokens are obtained via `/api/auth/sign-in` and expire after 24 hours. Refresh tokens can be used to obtain new access tokens.

---

**Status**: ✅ API Contracts Defined
**Next**: Create Quickstart Test
