# Data Model: wxKanban Multi-Platform Task Management

**Phase 1 Design Output** — Database schema, entity relationships, validation rules

**Date**: 2026-02-12 | **Status**: ✅ Complete

---

## Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  user ◄──────┐                                                 │
│  ├─ userid (PK)                                                │
│  ├─ email                                                       │
│  ├─ passwordhash                                               │
│  └─ createdAt, updatedAt                                       │
│                                                                 │
│     ├──→ pmSystemConnection (1:N)                             │
│     ├──→ project (1:N)                                        │
│     └──→ timeEntry (1:N)                                      │
│                                                                 │
└──────────────┬──────────────────────────────────────────────────┘
               │
        ┌──────┴──────┬──────────┬──────────┬──────────┐
        │             │          │          │          │
   project ────→ task        phase    specification  feedback
   ├─ projectid         ├─ taskid   ├─ phaseid  ├─ specid    ├─ feedbackid
   ├─ userid (FK)       ├─ projectid├─ projectid├─ projectid ├─ phaseid
   ├─ name              ├─ externalId├─ phaseName├─ specNumber├─ category
   └─ createdAt         └─ createdAt └─ status   └─ status    └─ status
        │                    │            │          │             │
        ├──→ pmSystemConnection  │   ├──→ testPlan  │
        ├──→ timeEntry           │   │              │
        ├──→ invoice             │   └──→ feedback ──┘
        └──→ note                │

pmSystemConnection              timeEntry              invoice
├─ connectionid (PK)            ├─ entryid (PK)        ├─ invoiceid (PK)
├─ userid (FK)                  ├─ taskid (FK)         ├─ projectid (FK)
├─ pmSystem                      ├─ projectid (FK)      ├─ totalAmount
├─ accessToken (encrypted)       ├─ startTime           ├─ hoursWorked
├─ refreshToken (encrypted)      ├─ duration (minutes)  ├─ downloadUrl
└─ lastSyncAt                    ├─ billable            └─ generatedAt
                                 └─ invoiced

note                           testPlan
├─ noteid (PK)                 ├─ testplanid (PK)
├─ projectid (FK)              ├─ specid (FK)
├─ content                      ├─ testCases (JSON)
├─ author                       └─ results (JSON)
└─ createdAt
```

---

## Core Entities

### 1. User

**Purpose**: Represents an independent developer account with authentication and preferences

**Fields**:
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| userid | UUID | PK, NOT NULL | Primary key, generated as UUID v7 |
| email | VARCHAR(255) | UNIQUE, NOT NULL | Email address, unique per user |
| passwordhash | VARCHAR(255) | NOT NULL | bcrypt hash (12 salt rounds) |
| createdAt | TIMESTAMP | DEFAULT NOW() | Account creation timestamp |
| updatedAt | TIMESTAMP | DEFAULT NOW() | Last update timestamp |

**Validation**:

- Email must be valid format (RFC 5322)
- Email must be unique across system
- Password must be 8+ characters
- Password must contain: uppercase, lowercase, number, special character
- Password never stored in plaintext

**Relationships**:

- 1:N with PMSystemConnection (user has many PM connections)
- 1:N with Project (user has many projects)
- 1:N with TimeEntry (user has many time entries via project)

**State**: Active (no soft delete for MVP)

---

### 2. PM System Connection

**Purpose**: Stores authenticated OAuth2 connections to external PM systems (Jira, Monday, Asana, Trello)

**Fields**:
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| connectionid | UUID | PK, NOT NULL | Primary key, UUID v7 |
| userid | UUID | FK, NOT NULL | References user.userid |
| pmsystem | VARCHAR(50) | NOT NULL | 'jira', 'monday', 'asana', 'trello' |
| accesstoken | VARCHAR(1024) | NOT NULL | OAuth2 access token (AES-256-GCM encrypted) |
| refreshtoken | VARCHAR(1024) | NOT NULL | OAuth2 refresh token (AES-256-GCM encrypted) |
| expiresat | TIMESTAMP | NOT NULL | Access token expiration timestamp |
| lastsyncsat | TIMESTAMP | | Last successful sync timestamp |
| syncstatus | VARCHAR(50) | DEFAULT 'active' | 'active', 'expired', 'failed' |
| createdAt | TIMESTAMP | DEFAULT NOW() | Connection creation timestamp |
| updatedat | TIMESTAMP | DEFAULT NOW() | Last update timestamp |

**Validation**:

- pmSystem must be one of: 'jira', 'monday', 'asana', 'trello'
- accesstoken and refreshtoken must be non-empty after encryption
- expiresAt must be in future
- One connection per (userid, pmsystem) pair (unique constraint)

**Encryption**:

- Algorithm: AES-256-GCM (Galois/Counter Mode)
- Key: From KMS (production) or env var (development)
- Tokens stored as base64-encoded encrypted blobs

**Relationships**:

- N:1 with User (many connections per user)
- 1:N with Task (tasks synced from this connection)

**State**: active | expired | failed

---

### 3. Project

**Purpose**: Represents a client project or internal initiative with phase lifecycle

**Fields**:
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| projectid | UUID | PK, NOT NULL | Primary key, UUID v7 |
| userid | UUID | FK, NOT NULL | References user.userid |
| name | VARCHAR(255) | NOT NULL | Project name (e.g., "Client X - Product Y") |
| description | TEXT | | Project description/notes |
| pmsystems | VARCHAR(255) | | Comma-separated list of connected PM systems |
| hourlyrate | NUMERIC(10,2) | | Billable rate per hour (nullable for internal projects) |
| allocatedhours | INT | | Total hours allocated to project (nullable) |
| currentphase | VARCHAR(50) | DEFAULT 'Design' | Current phase name |
| createdAt | TIMESTAMP | DEFAULT NOW() | Project creation timestamp |
| updatedat | TIMESTAMP | DEFAULT NOW() | Last update timestamp |

**Validation**:

- name must be non-empty, 1-255 characters
- hourlyRate, if provided, must be >= 0
- currentPhase must be one of: Design, Implementation, QA, HumanTesting, Beta, Release
- Project belongs to exactly one user

**Relationships**:

- N:1 with User (many projects per user)
- 1:N with Task (many tasks per project)
- 1:N with TimeEntry (aggregated across project's tasks)
- 1:N with ProjectPhase (exactly 6 phases per project)
- 1:N with Specification (phase 1 specs)
- 1:N with Invoice (billing documents)
- 1:N with Note (project notes)

**Lifecycle**: Starts in "Design" phase, progresses through 6 phases sequentially

---

### 4. Task

**Purpose**: Represents a work item from external PM system or internally created

**Fields**:
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| taskid | UUID | PK, NOT NULL | Primary key, UUID v7 |
| projectid | UUID | FK, NOT NULL | References project.projectid |
| sourcepmssystem | VARCHAR(50) | | 'jira', 'monday', 'asana', 'trello', NULL for internal |
| externalid | VARCHAR(255) | | External PM system task ID (e.g., "JIRA-123") |
| title | VARCHAR(255) | NOT NULL | Task title |
| description | TEXT | | Task description |
| priority | VARCHAR(50) | DEFAULT 'medium' | 'low', 'medium', 'high', 'critical' |
| duedate | DATE | | Task due date (from PM system or manual) |
| status | VARCHAR(50) | DEFAULT 'open' | 'open', 'in_progress', 'completed', 'orphaned' |
| effort | VARCHAR(50) | | 'small', 'medium', 'large', 'unknown' |
| sourceoforigin | VARCHAR(50) | DEFAULT 'external' | 'external', 'internal', 'ai_proposed' |
| createdAt | TIMESTAMP | DEFAULT NOW() | Task creation timestamp |
| updatedat | TIMESTAMP | DEFAULT NOW() | Last sync/update timestamp |

**Validation**:

- title must be non-empty, 1-255 characters
- priority must be one of: low, medium, high, critical
- status must be one of: open, in_progress, completed, orphaned
- effort must be one of: small, medium, large, unknown (or null)
- sourceOfOrigin must be one of: external, internal, ai_proposed
- External tasks must have: sourcepmSystem, externalId
- Internal/AI tasks must have: sourcepmSystem = NULL

**Relationships**:

- N:1 with Project (many tasks per project)
- 1:N with TimeEntry (many time entries per task)
- 1:N with Note (task notes from project)

**State Transitions**:

- open → in_progress → completed
- Any state → orphaned (when deleted in source PM)
- orphaned → open (if task re-added to PM)

**Special Cases**:

- **Orphaned**: Task marked as "orphaned" when deleted/reassigned in source PM. Hidden from active view but all time entries preserved for billing.

---

### 5. Time Entry

**Purpose**: Tracks work sessions on one or more tasks with billable categorization

**Fields**:
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| entryid | UUID | PK, NOT NULL | Primary key, UUID v7 |
| taskid | UUID | FK, NOT NULL | References task.taskid |
| projectid | UUID | FK, NOT NULL | References project.projectid |
| starttime | TIMESTAMP | NOT NULL | Timer start time (UTC) |
| endtime | TIMESTAMP | NOT NULL | Timer end time (UTC) |
| duration | INT | NOT NULL | Duration in minutes (calculated: endTime - startTime) |
| billable | BOOLEAN | DEFAULT true | Whether hours are billable to client |
| notes | TEXT | | User notes on work performed |
| invoiced | BOOLEAN | DEFAULT false | Whether included in generated invoice |
| invoicedat | TIMESTAMP | | Timestamp of invoice generation |
| createdAt | TIMESTAMP | DEFAULT NOW() | Time entry creation timestamp |
| updatedat | TIMESTAMP | DEFAULT NOW() | Last update timestamp |

**Validation**:

- startTime must be before endTime
- duration must equal (endTime - startTime) in minutes ±60 seconds tolerance
- billable must be true or false
- If duration > 480 minutes (8 hours): flag for user confirmation (FR-028a)
- Timestamps must be in UTC

**Relationships**:

- N:1 with Task (many entries per task)
- N:1 with Project (many entries per project)
- N:M with Invoice (many entries per invoice, many invoices per entry via m2m table)

**Inactivity Handling**:

- If timer running > 8 hours (default, configurable 2-16h): Prompt user to:
  - Confirm full duration, or
  - Trim to specific end time, or
  - Cancel and discard

---

### 6. Invoice

**Purpose**: Represents a generated billing document (timesheet + invoice)

**Fields**:
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| invoiceid | UUID | PK, NOT NULL | Primary key, UUID v7 |
| projectid | UUID | FK, NOT NULL | References project.projectid |
| clientemail | VARCHAR(255) | | Email to send invoice to (from PM system or manual) |
| generatedAt | TIMESTAMP | DEFAULT NOW() | Invoice generation timestamp |
| totalamount | NUMERIC(12,2) | NOT NULL | Total due (calculated: hours × rate) |
| hoursworked | NUMERIC(10,2) | NOT NULL | Total billable hours |
| downloadurl | VARCHAR(1024) | | URL to download PDF (if stored in S3 or similar) |
| emailsent | BOOLEAN | DEFAULT false | Whether email sent to client |
| sentat | TIMESTAMP | | Email sent timestamp |
| createdAt | TIMESTAMP | DEFAULT NOW() | Invoice creation timestamp |

**Validation**:

- projectid must exist
- totalAmount must be >= 0
- hoursWorked must be >= 0
- totalAmount should equal hoursWorked × project.hourlyRate (validate in service layer)

**Relationships**:

- N:1 with Project (many invoices per project)
- N:M with TimeEntry (invoice includes many time entries, time entry belongs to one invoice)

**Workflow**:

1. User selects project + date range
2. System queries TimeEntry for billable entries in range
3. System calculates: hours × rate = total
4. System generates PDF via Puppeteer
5. System creates Invoice record
6. User can download PDF or send via email
7. TimeEntry.invoiced flag set to true, invoicedAt timestamp recorded

---

### 7. Project Phase

**Purpose**: Tracks the 6-phase lifecycle state for a project

**Fields**:
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| phaseid | UUID | PK, NOT NULL | Primary key, UUID v7 |
| projectid | UUID | FK, NOT NULL | References project.projectid |
| phasename | VARCHAR(50) | NOT NULL | 'Design', 'Implementation', 'QA', 'HumanTesting', 'Beta', 'Release' |
| status | VARCHAR(50) | DEFAULT 'pending' | 'pending', 'in_progress', 'complete', 'reopened' |
| enteredat | TIMESTAMP | | Timestamp when phase entered |
| completedat | TIMESTAMP | | Timestamp when phase completed |
| reason | TEXT | | Reason for reopening (if reopened) |
| createdAt | TIMESTAMP | DEFAULT NOW() | Record creation timestamp |

**Validation**:

- phaseName must be one of: Design, Implementation, QA, HumanTesting, Beta, Release
- status must be one of: pending, in_progress, complete, reopened
- Exactly 6 phases per project (one for each phase name)
- Phases are created at project creation with status='pending'
- Transition validation: enforced in service layer (see Phase Workflow Rules)

**Relationships**:

- N:1 with Project (6 phases per project)
- 1:N with Specification (only for Design phase)
- 1:N with Feedback (Phase 4 and 5 only)

**Phase Workflow Rules**:

1. Design (Phase 1): All specs must be approved → Implementation
2. Implementation (Phase 2): All tasks complete → QA
3. QA (Phase 3): All tests pass → HumanTesting
4. HumanTesting (Phase 4): No open critical feedback → Beta
5. Beta (Phase 5): All beta feedback resolved → Release
6. Release (Phase 6): All prior phases complete

**Reopening**:

- User can reopen any completed phase from later phases
- Reopening logs reason and timestamp
- Project cannot advance past reopened phase until re-completed

---

### 8. Specification

**Purpose**: Phase 1 design document (numbered by specification number)

**Fields**:
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| specid | UUID | PK, NOT NULL | Primary key, UUID v7 |
| projectid | UUID | FK, NOT NULL | References project.projectid |
| specnumber | VARCHAR(10) | NOT NULL | Sequence: '001', '002', '003'... |
| title | VARCHAR(255) | NOT NULL | Specification title |
| content | TEXT | NOT NULL | Full specification document |
| status | VARCHAR(50) | DEFAULT 'draft' | 'draft', 'review', 'approved' |
| createdat | TIMESTAMP | DEFAULT NOW() | Creation timestamp |
| approvedat | TIMESTAMP | | Approval timestamp |
| updatedat | TIMESTAMP | DEFAULT NOW() | Last update timestamp |

**Validation**:

- specNumber must be unique per project and sequentially formatted (001, 002...)
- title must be non-empty, 1-255 characters
- content must be non-empty
- status must be one of: draft, review, approved
- specNumber auto-generated on creation (count existing + 1)

**Relationships**:

- N:1 with Project (many specs per project)
- 1:N with TestPlan (one test plan per spec)
- 1:N with Feedback (feedback can reference spec)

**Workflow**:

1. User creates spec in Phase 1: Design (status='draft')
2. User updates spec content (still 'draft')
3. User marks spec 'review'
4. User approves spec (status='approved')
5. Phase 1 completion requires all specs 'approved'

---

### 9. Test Plan

**Purpose**: QA test plan mapped to Phase 1 specification

**Fields**:
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| testplanid | UUID | PK, NOT NULL | Primary key, UUID v7 |
| specid | UUID | FK, NOT NULL | References specification.specid |
| testcases | JSON | NOT NULL | Array of test cases (schema defined below) |
| results | JSON | | Array of test results (pass/fail) |
| createdat | TIMESTAMP | DEFAULT NOW() | Creation timestamp |
| updatedat | TIMESTAMP | DEFAULT NOW() | Last update timestamp |

**Test Case Schema** (in JSON):

```json
{
  "testcases": [
    {
      "id": "TC-001",
      "title": "User registration with valid email",
      "steps": [
        "Navigate to register page",
        "Enter email",
        "Enter password",
        "Submit"
      ],
      "expectedResult": "Account created successfully"
    }
  ]
}
```

**Test Results Schema** (in JSON):

```json
{
  "results": [
    {
      "testcaseId": "TC-001",
      "status": "pass",
      "testedAt": "2026-02-12T10:00:00Z",
      "notes": "Verified email validation"
    }
  ]
}
```

**Validation**:

- testCases must be valid JSON array
- Each test case must have: id, title, steps, expectedResult
- Results, when present, must have: testcaseId, status, testedAt
- status must be 'pass' or 'fail'

**Relationships**:

- N:1 with Specification (one plan per spec)

**Workflow**:

1. Test plan created automatically when spec approved (Phase 1 → 2)
2. Tester enters test cases and expected results (Phase 3: QA)
3. Tester executes tests and records pass/fail results
4. Phase 3 completion requires all tests documented

---

### 10. Feedback Entry

**Purpose**: Issues or suggestions from Phase 4 (Human Testing) or Phase 5 (Beta Release)

**Fields**:
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| feedbackid | UUID | PK, NOT NULL | Primary key, UUID v7 |
| phaseid | UUID | FK, NOT NULL | References projectphase.phaseid (Phase 4 or 5) |
| category | VARCHAR(50) | NOT NULL | 'bug', 'enhancement', 'usability' |
| description | TEXT | NOT NULL | Feedback description |
| status | VARCHAR(50) | DEFAULT 'open' | 'open', 'accepted', 'rejected', 'resolved' |
| linkedspecid | UUID | | References specification.specid (if feedback → new spec) |
| createdat | TIMESTAMP | DEFAULT NOW() | Feedback submission timestamp |
| resolvedat | TIMESTAMP | | Feedback resolution timestamp |
| updatedat | TIMESTAMP | DEFAULT NOW() | Last update timestamp |

**Validation**:

- category must be one of: bug, enhancement, usability
- status must be one of: open, accepted, rejected, resolved
- description must be non-empty, 1-5000 characters
- linkedSpecId, if provided, must reference existing spec
- feedbackId must reference Phase 4 or 5

**Relationships**:

- N:1 with ProjectPhase (many feedback entries per phase)
- 1:N with Specification (feedback can reference or create new spec)

**Workflow**:

1. Tester submits feedback during Phase 4 or 5 (status='open')
2. User reviews feedback (can accept/reject/defer)
3. If feedback triggers new feature: create new Specification (linkedSpecId set)
4. User marks feedback 'resolved'
5. Phase transition rules:
   - Phase 4 → Beta: No open critical bugs
   - Phase 5 → Release: All feedback must be 'resolved' (accepted/rejected/deferred)
   - Phase 6 (Release) blocked if unresolved feedback exists

---

### 11. Note

**Purpose**: User-entered or system-generated documentation for projects/clients

**Fields**:
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| noteid | UUID | PK, NOT NULL | Primary key, UUID v7 |
| projectid | UUID | FK, NOT NULL | References project.projectid |
| content | TEXT | NOT NULL | Note content |
| author | VARCHAR(50) | DEFAULT 'user' | 'user' or 'system' |
| createdat | TIMESTAMP | DEFAULT NOW() | Note creation timestamp |
| updatedat | TIMESTAMP | DEFAULT NOW() | Last update timestamp |

**Validation**:

- content must be non-empty
- author must be 'user' or 'system'
- projectid must exist

**Relationships**:

- N:1 with Project (many notes per project)

**System Notes Generated For**:

- Project created
- Phase transition
- Spec created/approved
- Task status change
- Invoice generated

---

## Indexes & Performance

**Recommended Indexes**:

```sql
-- User lookups
CREATE INDEX idx_user_email ON user(email);

-- PM System connections
CREATE INDEX idx_pmconnection_userid ON pmSystemConnection(userid);
CREATE INDEX idx_pmconnection_userid_system ON pmSystemConnection(userid, pmsystem);

-- Project queries
CREATE INDEX idx_project_userid ON project(userid);

-- Task queries
CREATE INDEX idx_task_projectid ON task(projectid);
CREATE INDEX idx_task_status ON task(status);
CREATE INDEX idx_task_duedate ON task(duedate);

-- Time entry queries
CREATE INDEX idx_timeentry_taskid ON timeEntry(taskid);
CREATE INDEX idx_timeentry_projectid ON timeEntry(projectid);
CREATE INDEX idx_timeentry_starttime ON timeEntry(starttime);
CREATE INDEX idx_timeentry_invoiced ON timeEntry(invoiced);

-- Invoice queries
CREATE INDEX idx_invoice_projectid ON invoice(projectid);
CREATE INDEX idx_invoice_generatedat ON invoice(generatedAt);

-- Phase queries
CREATE INDEX idx_phase_projectid ON projectPhase(projectid);
CREATE INDEX idx_phase_status ON projectPhase(status);

-- Specification queries
CREATE INDEX idx_spec_projectid ON specification(projectid);
CREATE INDEX idx_spec_status ON specification(status);

-- Feedback queries
CREATE INDEX idx_feedback_phaseid ON feedback(phaseid);
CREATE INDEX idx_feedback_status ON feedback(status);

-- Note queries
CREATE INDEX idx_note_projectid ON note(projectid);
```

---

## Data Integrity Constraints

**Foreign Key Constraints**:

```sql
ALTER TABLE pmSystemConnection ADD CONSTRAINT fk_pmconn_user
  FOREIGN KEY (userid) REFERENCES user(userid) ON DELETE CASCADE;

ALTER TABLE project ADD CONSTRAINT fk_project_user
  FOREIGN KEY (userid) REFERENCES user(userid) ON DELETE CASCADE;

ALTER TABLE task ADD CONSTRAINT fk_task_project
  FOREIGN KEY (projectid) REFERENCES project(projectid) ON DELETE CASCADE;

ALTER TABLE timeEntry ADD CONSTRAINT fk_timeentry_task
  FOREIGN KEY (taskid) REFERENCES task(taskid) ON DELETE CASCADE;

ALTER TABLE timeEntry ADD CONSTRAINT fk_timeentry_project
  FOREIGN KEY (projectid) REFERENCES project(projectid) ON DELETE CASCADE;

ALTER TABLE invoice ADD CONSTRAINT fk_invoice_project
  FOREIGN KEY (projectid) REFERENCES project(projectid) ON DELETE CASCADE;

ALTER TABLE projectPhase ADD CONSTRAINT fk_phase_project
  FOREIGN KEY (projectid) REFERENCES project(projectid) ON DELETE CASCADE;

ALTER TABLE specification ADD CONSTRAINT fk_spec_project
  FOREIGN KEY (projectid) REFERENCES project(projectid) ON DELETE CASCADE;

ALTER TABLE testPlan ADD CONSTRAINT fk_testplan_spec
  FOREIGN KEY (specid) REFERENCES specification(specid) ON DELETE CASCADE;

ALTER TABLE feedback ADD CONSTRAINT fk_feedback_phase
  FOREIGN KEY (phaseid) REFERENCES projectPhase(phaseid) ON DELETE CASCADE;

ALTER TABLE note ADD CONSTRAINT fk_note_project
  FOREIGN KEY (projectid) REFERENCES project(projectid) ON DELETE CASCADE;
```

**Unique Constraints**:

```sql
ALTER TABLE user ADD CONSTRAINT uk_user_email UNIQUE (email);

ALTER TABLE pmSystemConnection ADD CONSTRAINT uk_pmconn_user_system
  UNIQUE (userid, pmsystem);

ALTER TABLE specification ADD CONSTRAINT uk_spec_project_number
  UNIQUE (projectid, specnumber);

ALTER TABLE projectPhase ADD CONSTRAINT uk_phase_project_name
  UNIQUE (projectid, phasename);
```

---

## Migration & Implementation Notes

**Drizzle ORM Schema Files**:

```
src/db/schema/
├── user.ts                    # User table + indexes
├── pmSystemConnection.ts      # PM OAuth connections
├── project.ts                 # Project + current phase
├── task.ts                    # Task items
├── timeEntry.ts               # Time tracking
├── invoice.ts                 # Billing documents
├── projectPhase.ts            # 6-phase lifecycle
├── specification.ts           # Phase 1 specs
├── testPlan.ts                # QA test plans
├── feedback.ts                # Phase 4/5 feedback
└── note.ts                    # Project notes
```

**Migration Generation**:

```bash
npm run db:generate    # Generates migration based on schema changes
npm run db:migrate     # Applies migration (DEV only, requires approval for PROD)
```

---

## Summary

- **10 Core Entities** with full relationship definitions
- **UUID v7 Primary Keys** for better database performance
- **Encryption at Rest** for sensitive credentials (AES-256-GCM)
- **Audit Trail** via timestamps on all entities
- **State Machines** for Task, TimeEntry, Specification, Feedback workflows
- **Foreign Key Constraints** for referential integrity
- **Optimized Indexes** for common query patterns
- **Drizzle ORM** for type-safe schema management

**Ready for Phase 1 → Phase 2: API Contracts** ✅

---

## Spec 020 Additions (Consultant Work Hub)

Migration: `0006_spec020_consultant_hub.sql` (applied 2026-05-12).

### Extended: `projecttimeentries`

New columns:

- `source VARCHAR(20) NOT NULL DEFAULT 'manual'` — `'manual'` or `'ai'` (FR-004/FR-005)
- `completionnotesummary TEXT` — AI-generated summary at session close (FR-005)
- `aispecsessionid UUID REFERENCES aispecsessions(id) ON DELETE SET NULL` — links AI entries to their session

New index: `idx_projecttimeentries_aisession` partial on `(aispecsessionid)` where not null.

### Extended: `projecttasks`

New index for FR-001 de-duplication (column `externalid` already existed):

- `idx_projecttasks_external` partial on `(sourcepmssystem, externalid)` where `externalid IS NOT NULL`

### New: `aispecsessions` (FR-005)

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | gen_random_uuid() |
| specid | VARCHAR(50) | spec slug (e.g., '020-consultant') |
| projectid | UUID FK → companyprojects | cascade |
| userid | UUID FK → userprofiles | cascade |
| companyid | UUID FK → companies | cascade |
| status | VARCHAR(20) | 'active' \| 'completed' \| 'timeout' \| 'cancelled' |
| starttime | TIMESTAMP | defaults now() |
| endtime | TIMESTAMP | nullable |
| overheadduration | INTEGER | minutes of Q&A / non-task time |
| totalduration | INTEGER | minutes; computed at close |
| taskcount | INTEGER | distinct tasks touched |
| summary | TEXT | session-level rollup |
| createdat / updatedat | TIMESTAMP | |

Partial index `idx_aispecsessions_active` on `(specid, userid)` WHERE `status = 'active'` for fast resume.

### New: `taskstateoverrides` (FR-007)

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| taskid | UUID FK → projecttasks | cascade |
| userid | UUID FK → userprofiles | set null |
| status | VARCHAR(20) | 'blocked' \| 'suspended' \| 'active' |
| reason | TEXT | required for blocked/suspended |
| resolvedat | TIMESTAMP | stamped when state returns to active |
| createdat | TIMESTAMP | |

Index `idx_taskstateoverrides_taskid` on `(taskid)`.

### New: `tasksyncrecords` (FR-006)

Outbound queue for PM status sync-back.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| taskid | UUID FK → projecttasks | cascade |
| pmconnectionid | UUID FK → pmsystemconnections | cascade |
| pendingstatus | VARCHAR(20) | status to push |
| lastsyncedat | TIMESTAMP | nullable |
| lastsyncstatus | VARCHAR(20) | 'pending' \| 'success' \| 'failed' |
| lastsyncerror | TEXT | nullable |
| retrycount | INTEGER | max 5 then 'failed' |
| createdat / updatedat | TIMESTAMP | |

Partial index `idx_tasksyncrecords_pending` on `(lastsyncstatus)` WHERE `lastsyncstatus = 'pending'` for the outbound sweep.

### Deferred to Scope 021

`consultantteammembers` is intentionally NOT added in this migration. Team-lead management ships in a separate scope.
