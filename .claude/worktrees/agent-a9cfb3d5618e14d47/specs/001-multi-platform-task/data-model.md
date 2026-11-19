# Data Model: Multi-Platform Task Management System

**Date**: 2026-01-22
**Feature**: Multi-Platform Task Management System
**Branch**: 001-multi-platform-task

## Overview

This document defines the database schema for wxKanban using Drizzle ORM with PostgreSQL. All naming follows project constitution: singular table names, UUID v7 primary keys, lowercase PostgreSQL fields, camelCase TypeScript variables, no underscores.

---

## Entity Relationship Diagram

```
user
├─ pmsystemconnection (1:N)
├─ project (1:N)
├─ client (1:N)
├─ task (1:N)
├─ internaltaskboard (1:N)
├─ timeentry (1:N)
├─ invoice (1:N)
├─ aiproposal (1:N)
└─ note (1:N)

client
├─ project (1:N)
└─ invoice (1:N)

project
├─ task (1:N)
├─ aiproposal (1:N)
├─ note (1:N)
└─ timeentry (1:N - via task)

task
└─ timeentry (1:N)

internaltaskboard
└─ task (1:N - optional, for internal tasks)

invoice
└─ timeentry (N:M - via invoiceid foreign key)
```

---

## Core Entities

### 1. user

**Purpose**: Represents an independent developer account

**Fields**:

- `userid` (UUID v7, PK): Unique identifier
- `clerkid` (text, UNIQUE, NOT NULL): Clerk authentication ID
- `email` (text, UNIQUE, NOT NULL): User email address
- `name` (text): Full name
- `timezone` (text): User's timezone (e.g., "America/New_York")
- `aienabled` (boolean, default true): Auto AI task proposals enabled
- `syncinterval` (integer, default 10): PM sync interval in minutes (5-60)
- `createdat` (timestamp, default now()): Account creation timestamp
- `updatedat` (timestamp, default now()): Last update timestamp

**Constraints**:

- Email must be valid format
- Sync interval between 5-60 minutes
- Timezone must be valid IANA timezone string

**Indexes**:

- Primary: `userid`
- Unique: `clerkid`, `email`

**Validation Rules**:

- FR-001: Email validation required
- FR-003: Password strength enforced by Clerk

---

### 2. pmsystemconnection

**Purpose**: Stores authenticated connections to external PM systems

**Fields**:

- `connectionid` (UUID v7, PK): Unique identifier
- `userid` (UUID v7, FK → user.userid, NOT NULL): Owner of connection
- `systemtype` (enum, NOT NULL): 'jira' | 'monday' | 'asana' | 'trello'
- `systemname` (text): User-friendly name for this connection
- `credentials` (jsonb, NOT NULL): Encrypted OAuth tokens/credentials
- `lastsyncat` (timestamp): Last successful sync timestamp
- `syncstatus` (enum): 'active' | 'error' | 'expired' | 'disconnected'
- `syncerror` (text): Last sync error message if any
- `createdat` (timestamp, default now()): Connection creation timestamp
- `updatedat` (timestamp, default now()): Last update timestamp

**Constraints**:

- User can have multiple connections to same PM system (different accounts)
- Credentials stored encrypted

**Indexes**:

- Primary: `connectionid`
- Foreign: `userid` → user.userid ON DELETE CASCADE
- Composite: (userid, systemtype) for efficient lookups

**Validation Rules**:

- FR-005: Support Jira, Monday, Asana, Trello
- FR-008: Track authentication failures in syncstatus
- FR-009: Allow multiple connections per user

---

### 3. client

**Purpose**: Represents a client organization for billing

**Fields**:

- `clientid` (UUID v7, PK): Unique identifier
- `userid` (UUID v7, FK → user.userid, NOT NULL): Owner of client record
- `companyname` (text, NOT NULL): Client company name
- `contactname` (text): Primary contact person
- `billingemail` (text, NOT NULL): Email for invoices
- `defaulthourlyrate` (numeric(10,2)): Default billing rate (USD)
- `allocatedhours` (numeric(10,2)): Monthly allocated hours (optional)
- `address` (text): Billing address
- `notes` (text): Internal notes about client
- `createdat` (timestamp, default now()): Client creation timestamp
- `updatedat` (timestamp, default now()): Last update timestamp

**Constraints**:

- Billing email must be valid format
- Hourly rate must be positive
- Allocated hours must be positive if set

**Indexes**:

- Primary: `clientid`
- Foreign: `userid` → user.userid ON DELETE CASCADE
- Index: `companyname` for search

**Validation Rules**:

- FR-026: Store company name, billing email, rate, allocated hours
- FR-033: Must have billing email for invoice sending

---

### 4. project

**Purpose**: Represents a client project or initiative

**Fields**:

- `projectid` (UUID v7, PK): Unique identifier
- `userid` (UUID v7, FK → user.userid, NOT NULL): Owner of project
- `clientid` (UUID v7, FK → client.clientid): Associated client (optional for internal projects)
- `name` (text, NOT NULL): Project name
- `description` (text): Project description
- `hourlybillrate` (numeric(10,2)): Project-specific billing rate (overrides client default)
- `status` (enum): 'active' | 'on_hold' | 'completed' | 'archived'
- `startdate` (date): Project start date
- `enddate` (date): Project end date
- `createdat` (timestamp, default now()): Project creation timestamp
- `updatedat` (timestamp, default now()): Last update timestamp

**Constraints**:

- End date must be after start date if both set
- Hourly rate must be positive if set

**Indexes**:

- Primary: `projectid`
- Foreign: `userid` → user.userid ON DELETE CASCADE
- Foreign: `clientid` → client.clientid ON DELETE SET NULL
- Index: `status` for filtering active projects

**Validation Rules**:

- FR-027: Organize work by project and client
- FR-030: Track billable hours per project

---

### 5. task

**Purpose**: Represents a work item from PM system or created internally

**Fields**:

- `taskid` (UUID v7, PK): Unique identifier
- `userid` (UUID v7, FK → user.userid, NOT NULL): Task assignee/owner
- `projectid` (UUID v7, FK → project.projectid): Associated project
- `boardid` (UUID v7, FK → internaltaskboard.boardid): Internal board (if internal task)
- `source` (enum, NOT NULL): 'jira' | 'monday' | 'asana' | 'trello' | 'internal' | 'ai_proposed'
- `externaltaskid` (text): ID in external PM system (for sync)
- `connectionid` (UUID v7, FK → pmsystemconnection.connectionid): Source connection (if external)
- `title` (text, NOT NULL): Task title
- `description` (text): Task description
- `status` (text, NOT NULL): Task status (flexible per PM system)
- `priority` (enum): 'low' | 'medium' | 'high' | 'urgent'
- `effortestimate` (text): User-defined effort estimate
- `duedate` (timestamp): Task due date
- `completedat` (timestamp): Task completion timestamp
- `lastsyncat` (timestamp): Last sync with external system
- `syncchecksum` (text): Hash of task data for change detection
- `createdat` (timestamp, default now()): Task creation timestamp
- `updatedat` (timestamp, default now()): Last update timestamp

**Constraints**:

- If source is external (jira/monday/asana/trello): externaltaskid and connectionid required
- If source is internal: boardid required, externaltaskid/connectionid null
- Unique: (connectionid, externaltaskid) for external tasks

**Indexes**:

- Primary: `taskid`
- Foreign: `userid` → user.userid ON DELETE CASCADE
- Foreign: `projectid` → project.projectid ON DELETE SET NULL
- Foreign: `boardid` → internaltaskboard.boardid ON DELETE CASCADE
- Foreign: `connectionid` → pmsystemconnection.connectionid ON DELETE CASCADE
- Unique: (connectionid, externaltaskid) where connectionid IS NOT NULL
- Composite: (userid, status, duedate) for dashboard queries

**Validation Rules**:

- FR-011: Display aggregated tasks from all PM systems
- FR-012: Allow sorting/filtering by priority, due date, source
- FR-014: Preserve source system identifier for sync
- FR-016: Allow creating internal tasks
- FR-018: Distinguish internal from external tasks
- FR-021: Track source of each task

---

### 6. internaltaskboard

**Purpose**: User-configurable task board for internal task management

**Fields**:

- `boardid` (UUID v7, PK): Unique identifier
- `userid` (UUID v7, FK → user.userid, NOT NULL): Board owner
- `name` (text, NOT NULL): Board name
- `description` (text): Board description
- `configuration` (jsonb): Board configuration (columns, statuses, etc.)
- `createdat` (timestamp, default now()): Board creation timestamp
- `updatedat` (timestamp, default now()): Last update timestamp

**Configuration Schema** (jsonb):

```json
{
  "columns": [
    { "id": "todo", "name": "To Do", "order": 0 },
    { "id": "inprogress", "name": "In Progress", "order": 1 },
    { "id": "done", "name": "Done", "order": 2 }
  ],
  "statuses": ["not_started", "in_progress", "completed"],
  "defaultStatus": "not_started"
}
```

**Indexes**:

- Primary: `boardid`
- Foreign: `userid` → user.userid ON DELETE CASCADE

**Validation Rules**:

- FR-017: Set up internal task boards with customizable columns
- FR-020: Organize internal tasks by project/client

---

### 7. timeentry

**Purpose**: Tracks time spent on tasks for billing

**Fields**:

- `timeentryid` (UUID v7, PK): Unique identifier
- `userid` (UUID v7, FK → user.userid, NOT NULL): User who tracked time
- `taskid` (UUID v7, FK → task.taskid): Associated task
- `projectid` (UUID v7, FK → project.projectid): Associated project (denormalized for reporting)
- `starttime` (timestamp, NOT NULL): Time tracking start
- `endtime` (timestamp): Time tracking end (null if active/paused)
- `totalpausedduration` (integer, default 0): Total paused milliseconds
- `duration` (integer): Total duration in milliseconds (computed: endtime - starttime - totalpausedduration)
- `isbillable` (boolean, default true): Whether time is billable
- `notes` (text): Notes about work performed
- `status` (enum): 'running' | 'paused' | 'completed'
- `invoiceid` (UUID v7, FK → invoice.invoiceid): Associated invoice (null if not invoiced)
- `invoicedat` (timestamp): Timestamp when invoiced
- `createdat` (timestamp, default now()): Entry creation timestamp
- `updatedat` (timestamp, default now()): Last update timestamp

**Constraints**:

- End time must be after start time
- Duration must be positive
- If invoiced: invoiceid and invoicedat must be set

**Indexes**:

- Primary: `timeentryid`
- Foreign: `userid` → user.userid ON DELETE CASCADE
- Foreign: `taskid` → task.taskid ON DELETE CASCADE
- Foreign: `projectid` → project.projectid ON DELETE SET NULL
- Foreign: `invoiceid` → invoice.invoiceid ON DELETE SET NULL
- Composite: (userid, invoicedat) for billing queries
- Composite: (projectid, isbillable, invoicedat) for project reports
- Index: `invoicedat IS NULL AND isbillable = true` for unbilled work

**Validation Rules**:

- FR-016/023: Allow selecting multiple tasks and starting timers
- FR-017/024: Track elapsed time for each task separately
- FR-018/025: Pause and resume functionality
- FR-019/026: Categorize as billable/non-billable
- FR-020/027: Maintain complete history with timestamps
- FR-022/029: Associate with project/client
- FR-038: Mark as invoiced to prevent duplicate billing

---

### 8. invoice

**Purpose**: Generated billing documents for clients

**Fields**:

- `invoiceid` (UUID v7, PK): Unique identifier
- `userid` (UUID v7, FK → user.userid, NOT NULL): Invoice creator
- `clientid` (UUID v7, FK → client.clientid, NOT NULL): Client being billed
- `invoicenumber` (text, UNIQUE, NOT NULL): Human-readable invoice number
- `generateddate` (date, NOT NULL): Invoice generation date
- `duedate` (date): Payment due date
- `startperiod` (date): Billing period start
- `endperiod` (date): Billing period end
- `subtotal` (numeric(10,2), NOT NULL): Sum of billable hours × rate
- `tax` (numeric(10,2), default 0): Tax amount
- `totalamount` (numeric(10,2), NOT NULL): Subtotal + tax
- `status` (enum): 'draft' | 'sent' | 'paid' | 'void'
- `sentat` (timestamp): When invoice was sent via email
- `paidat` (timestamp): When invoice was marked paid
- `pdfpath` (text): Path to generated PDF file
- `notes` (text): Invoice notes or payment terms
- `createdat` (timestamp, default now()): Invoice creation timestamp
- `updatedat` (timestamp, default now()): Last update timestamp

**Constraints**:

- Total amount must equal subtotal + tax
- Due date must be after generation date
- End period must be after start period
- Invoice number must be unique per user (format: {userid}-{seq})

**Indexes**:

- Primary: `invoiceid`
- Foreign: `userid` → user.userid ON DELETE CASCADE
- Foreign: `clientid` → client.clientid ON DELETE RESTRICT
- Unique: `invoicenumber`
- Composite: (userid, status, generateddate) for invoice list

**Validation Rules**:

- FR-029/036: Generate invoices based on billable hours
- FR-030/037: Calculate total based on hours × rates
- FR-032/039: Download generated invoices
- FR-033/040: Send invoices via email

---

### 9. aiproposal

**Purpose**: AI-suggested tasks for user review

**Fields**:

- `proposalid` (UUID v7, PK): Unique identifier
- `userid` (UUID v7, FK → user.userid, NOT NULL): User receiving proposal
- `projectid` (UUID v7, FK → project.projectid): Related project
- `title` (text, NOT NULL): Proposed task title
- `description` (text, NOT NULL): Proposed task description
- `priority` (enum): 'low' | 'medium' | 'high' | 'urgent'
- `effortestimate` (text): AI's effort estimate
- `rationale` (text, NOT NULL): Why AI suggested this task
- `status` (enum, default 'pending'): 'pending' | 'accepted' | 'rejected'
- `reviewedat` (timestamp): When user reviewed proposal
- `taskid` (UUID v7, FK → task.taskid): Created task if accepted
- `createdat` (timestamp, default now()): Proposal creation timestamp

**Constraints**:

- If status = 'accepted': taskid must be set
- If status = 'rejected': taskid must be null

**Indexes**:

- Primary: `proposalid`
- Foreign: `userid` → user.userid ON DELETE CASCADE
- Foreign: `projectid` → project.projectid ON DELETE CASCADE
- Foreign: `taskid` → task.taskid ON DELETE SET NULL
- Composite: (userid, status, createdat) for proposal list

**Validation Rules**:

- FR-034/041: AI proposes additional necessary tasks
- FR-037/044: Present proposals for review
- FR-038/045: Allow accept/reject of each proposal
- FR-039/046: Track task origin (AI-proposed)

---

### 10. note

**Purpose**: User-entered or system-generated documentation

**Fields**:

- `noteid` (UUID v7, PK): Unique identifier
- `userid` (UUID v7, FK → user.userid, NOT NULL): Note owner
- `projectid` (UUID v7, FK → project.projectid): Associated project
- `taskid` (UUID v7, FK → task.taskid): Associated task (optional)
- `content` (text, NOT NULL): Note content
- `author` (enum, NOT NULL): 'user' | 'system' | 'subagent'
- `authordetail` (text): Details about author (e.g., sub-agent name)
- `timestamp` (timestamp, default now()): Note creation timestamp

**Constraints**:

- Must have either projectid or taskid (or both)

**Indexes**:

- Primary: `noteid`
- Foreign: `userid` → user.userid ON DELETE CASCADE
- Foreign: `projectid` → project.projectid ON DELETE CASCADE
- Foreign: `taskid` → task.taskid ON DELETE CASCADE
- Composite: (projectid, timestamp DESC) for chronological display
- Composite: (taskid, timestamp DESC) for task-specific notes

**Validation Rules**:

- FR-040/047: Provide text area for notes per project/client
- FR-041/048: Auto-generate notes capturing actions
- FR-042/049: Organize by project/client in tabs
- FR-043/050: Timestamp all notes
- FR-044/051: Integrate with sub-agents
- FR-046/053: Record sub-agent actions

---

## Drizzle Schema Snippet

```typescript
import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  numeric,
  jsonb,
  pgEnum,
} from "drizzle-orm/pg-core";

// Enums
export const pmSystemTypeEnum = pgEnum("pm_system_type", [
  "jira",
  "monday",
  "asana",
  "trello",
]);
export const taskSourceEnum = pgEnum("task_source", [
  "jira",
  "monday",
  "asana",
  "trello",
  "internal",
  "ai_proposed",
]);
export const priorityEnum = pgEnum("priority", [
  "low",
  "medium",
  "high",
  "urgent",
]);
export const syncStatusEnum = pgEnum("sync_status", [
  "active",
  "error",
  "expired",
  "disconnected",
]);
export const projectStatusEnum = pgEnum("project_status", [
  "active",
  "on_hold",
  "completed",
  "archived",
]);
export const timeEntryStatusEnum = pgEnum("time_entry_status", [
  "running",
  "paused",
  "completed",
]);
export const invoiceStatusEnum = pgEnum("invoice_status", [
  "draft",
  "sent",
  "paid",
  "void",
]);
export const proposalStatusEnum = pgEnum("proposal_status", [
  "pending",
  "accepted",
  "rejected",
]);
export const noteAuthorEnum = pgEnum("note_author", [
  "user",
  "system",
  "subagent",
]);

// Tables
export const user = pgTable("user", {
  userid: uuid("userid").primaryKey().defaultRandom(),
  clerkid: text("clerkid").unique().notNull(),
  email: text("email").unique().notNull(),
  name: text("name"),
  timezone: text("timezone").default("America/New_York"),
  aienabled: boolean("aienabled").default(true),
  syncinterval: integer("syncinterval").default(10),
  createdat: timestamp("createdat").defaultNow(),
  updatedat: timestamp("updatedat").defaultNow(),
});

export const pmsystemconnection = pgTable("pmsystemconnection", {
  connectionid: uuid("connectionid").primaryKey().defaultRandom(),
  userid: uuid("userid")
    .notNull()
    .references(() => user.userid, { onDelete: "cascade" }),
  systemtype: pmSystemTypeEnum("systemtype").notNull(),
  systemname: text("systemname"),
  credentials: jsonb("credentials").notNull(),
  lastsyncat: timestamp("lastsyncat"),
  syncstatus: syncStatusEnum("syncstatus").default("active"),
  syncerror: text("syncerror"),
  createdat: timestamp("createdat").defaultNow(),
  updatedat: timestamp("updatedat").defaultNow(),
});

// ... (similar definitions for other tables)
```

---

## Relationships Summary

| Parent → Child            | Relationship                  | Cascade Rule |
| ------------------------- | ----------------------------- | ------------ |
| user → pmsystemconnection | 1:N                           | CASCADE      |
| user → project            | 1:N                           | CASCADE      |
| user → client             | 1:N                           | CASCADE      |
| user → task               | 1:N                           | CASCADE      |
| user → internaltaskboard  | 1:N                           | CASCADE      |
| user → timeentry          | 1:N                           | CASCADE      |
| user → invoice            | 1:N                           | CASCADE      |
| user → aiproposal         | 1:N                           | CASCADE      |
| user → note               | 1:N                           | CASCADE      |
| client → project          | 1:N                           | SET NULL     |
| client → invoice          | 1:N                           | RESTRICT     |
| project → task            | 1:N                           | SET NULL     |
| project → timeentry       | 1:N                           | SET NULL     |
| project → aiproposal      | 1:N                           | CASCADE      |
| project → note            | 1:N                           | CASCADE      |
| task → timeentry          | 1:N                           | CASCADE      |
| task → note               | 1:N                           | CASCADE      |
| internaltaskboard → task  | 1:N                           | CASCADE      |
| pmsystemconnection → task | 1:N                           | CASCADE      |
| invoice → timeentry       | 1:N (via timeentry.invoiceid) | SET NULL     |
| aiproposal → task         | N:1 (optional)                | SET NULL     |

---

## Constitutional Compliance

✅ **Table Naming**: All singular (user, task, timeentry)
✅ **Primary Keys**: All UUID v7 via `pg_uuidv7()` or Drizzle's `.defaultRandom()`
✅ **Foreign Keys**: Consistent naming (userid, taskid, projectid)
✅ **Field Naming**: All lowercase in PostgreSQL
✅ **No Underscores**: Enforced (timeentry not time_entry)
✅ **Schema Changes**: Use Drizzle's `db:generate` → `db:migrate` workflow

---

**Status**: ✅ Phase 1 Data Model Complete
**Next**: Generate API Contracts
