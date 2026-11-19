# Spec 020: Consultant Work Hub

**Spec Number**: 020  
**Status**: `draft`  
**Created**: 2026-04-01  
**Depends On**: PM Integration spec, Compliance Rules Engine spec, Invoice Generation spec  
**Source**: `specs/Project-Scope/020-consultant.md`

---

## Overview

A unified consultant work hub that aggregates tasks from both internal wxKanban projects and connected external PM systems (Jira, Monday.com, Asana, Trello) into a single prioritized work queue. The hub provides integrated time tracking, AI-assisted execution capture, compliance enforcement, and invoice-ready billing output — giving consultants everything they need to complete work and get paid.

### Core Design

| Element | Value |
|---------|-------|
| **Primary Actor** | Consultant |
| **Secondary Actors** | Consultant team members (when configured) |
| **Key Value** | Faster task completion and invoice-ready billing output from a single work surface |
| **Scope Boundary** | Task view, time tracking, status management, compliance surfacing, billable output, team management. PDF invoice rendering and PM OAuth setup are out of scope. |

---

## User Scenarios & Testing

### US1 — Consolidated Task Work Queue

**Actor**: Consultant

**Scenario**:
1. Consultant logs in and navigates to Consultant Work Hub
2. Hub displays all tasks assigned to the consultant across internal projects and connected PM systems
3. Consultant applies a project filter to narrow the view
4. Workload summary bar shows total tasks, past-due count, and 30+ day aging
5. Consultant selects a task and begins work

**Expected outcome**: Consultant sees their full workload in one place, filtered to the active project, with aging indicators visible within 3 seconds of page load.

---

### US2 — Time Tracking with Billable Flag

**Actor**: Consultant

**Scenario**:
1. Consultant opens a task in the hub
2. Consultant clicks "Start Timer" — a running timer begins on the task
3. Consultant completes work and clicks "Stop Timer"
4. System calculates duration and prompts: billable or non-billable?
5. Entry is saved to `tasklogs` with start time, end time, duration, and billable flag

**Expected outcome**: Time entry is saved accurately. Billable entries are visible in the invoice preview.

---

### US3 — External Task Sync with Blocked/Suspended Handling

**Actor**: Consultant

**Scenario**:
1. Consultant encounters a task that cannot proceed due to an unresolved dependency
2. Consultant marks the task `blocked` with a reason note
3. Later, the consultant intentionally pauses a different task for reassessment
4. Consultant marks that task `suspended` with a reason note
5. Both state changes are synced back to the external PM system on next sync cycle
6. If a compliance rule applies, a flag is automatically created

**Expected outcome**: Correct status is stored locally and synced externally. Compliance flags surface on the dashboard without blocking the workflow.

---

## Functional Requirements

### FR-001 — Unified Consultant Task Queue

The system MUST aggregate all tasks assigned to the authenticated consultant from both internal wxKanban projects and connected external PM systems into a single hub view.

**Acceptance Criteria**:
- [ ] Tasks from all connected PM systems appear in the hub
- [ ] Internal wxKanban tasks appear in the hub
- [ ] Tasks are de-duplicated when the same task exists in both systems
- [ ] Queue loads within 3 seconds

---

### FR-002 — Project-Based Task Filtering

The hub MUST allow the consultant to filter the task queue by project.

**Acceptance Criteria**:
- [ ] A project selector is available in the hub
- [ ] Selecting a project filters the task list to that project only
- [ ] "All Projects" is the default view
- [ ] Filter state persists during the session

---

### FR-003 — Dashboard Workload Indicators

The hub MUST display workload counters: total tasks, past-due tasks, and tasks with 30+ day aging.

**Acceptance Criteria**:
- [ ] Total task count is always visible
- [ ] Past-due count reflects tasks with a due date before today
- [ ] 30+ day aging count reflects tasks open for more than 30 days
- [ ] Counters update dynamically when filters change

---

### FR-004 — Manual Task Time Tracking

The system MUST allow consultants to manually start and stop a time tracking session on any task.

**Acceptance Criteria**:
- [ ] Start Timer button is available on each task
- [ ] Only one timer may be active at a time per consultant
- [ ] Stop Timer calculates duration from start to stop
- [ ] Consultant is prompted to mark the entry billable or non-billable before saving
- [ ] Entry is saved to `tasklogs`

---

### FR-005 — AI Execution Time Capture

The system MUST automatically record start and end timestamps when an AI-assisted operation is executed on a task and add that time to the timer active for that task.

The System MUST automatically add to a task completion note field, Summary of all changes or items accomplished for this time effort.

**Acceptance Criteria**:
- [ ] AI execution start time is captured without manual input
- [ ] AI execution end time is captured on completion
- [ ] Duration is calculated and stored in `tasklogs`
- [ ] AI-captured entries are visually distinguishable from manual entries
- [ ] An AI-generated completion summary is created for each AI-assisted time effort
- [ ] The AI-generated summary is appended to the task completion note field with attribution and timestamp

---

### FR-006 — External Task Status Sync-Back

The system MUST sync task status changes made in the hub back to the originating external PM system on the next sync cycle.

**Acceptance Criteria**:
- [ ] Status changes (active, blocked, suspended, complete) are queued for sync
- [ ] Sync-back occurs within the next scheduled sync cycle (≤ 15 minutes)
- [ ] Sync failures do not block local task updates
- [ ] Sync failures are retried on the next cycle

---

### FR-007 — Blocked and Suspended Task States

The system MUST support two distinct non-active task states: `blocked` and `suspended`.

- **Blocked**: An external dependency or constraint prevents the task from progressing (e.g., waiting on another team, unresolved PR, missing access)
- **Suspended**: The consultant intentionally pauses the task for reassessment, prioritization change, or later follow-up

**Acceptance Criteria**:
- [ ] Consultant can mark a task `blocked` with a required reason note
- [ ] Consultant can mark a task `suspended` with a required reason note
- [ ] Both states display distinct visual badges on the task card
- [ ] State transitions are stored in `taskstateoverrides` with timestamp and user
- [ ] Either state can be cleared by the consultant, returning the task to `active`

---

### FR-008 — Compliance-Aware Enforcement

The system MUST surface HIPAA/SOC2 compliance flags on tasks that violate active compliance rules.

**Acceptance Criteria**:
- [ ] Compliance rules engine evaluates tasks against active HIPAA/SOC2 rules
- [ ] Tasks with violations display a compliance badge in the hub
- [ ] Compliance flags are listed in a dedicated compliance review panel
- [ ] Flagged tasks are not blocked by default but are highlighted for review

---

### FR-009 — Invoice-Ready Work Output

The system MUST provide a billable hours summary that consultants can use to initiate invoice generation.

**Acceptance Criteria**:
- [ ] Consultant can open an invoice preview panel for a selected project and date range
- [ ] Preview shows all billable time entries with task, duration, and date
- [ ] Total billable hours are calculated and displayed
- [ ] Preview clearly excludes non-billable entries
- [ ] Data is ready for handoff to the invoice generation spec

---

### FR-010 — Consultant Team Member Management

The system MUST allow a consultant acting as a team lead to add team members, view their tasks, and monitor their workload.

**Acceptance Criteria**:
- [ ] Team lead can add a team member by user ID or email within the same company
- [ ] Team lead can remove a team member
- [ ] Team lead can view all tasks assigned to each team member
- [ ] Team task view supports the same project and status filters as the main hub
- [ ] Team member relationships are stored in `consultantteammembers`
- [ ] Team members do not see each other's tasks by default — only the team lead has the cross-member view

---

## Data Requirements

### Schema Changes

| Table | Purpose |
|-------|---------|
| `tasklogs` | Time entries per task per consultant (start/end/duration, billable flag) |
| `tasksyncrecords` | Tracks last external sync state per task per PM connection |
| `taskstateoverrides` | Stores `blocked` / `suspended` status with reason and timestamp |
| `complianceflags` | Per-task HIPAA/SOC2 enforcement markers |
| `consultantteammembers` | Links consultant (team lead) to team member users within a company |

**Schema Definitions**:

```sql
CREATE TABLE tasklogs (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  taskid UUID NOT NULL REFERENCES tasks(id),
  userid UUID NOT NULL REFERENCES users(id),
  starttime TIMESTAMP NOT NULL,
  endtime TIMESTAMP,
  duration INTEGER, -- seconds
  billable BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  completionnotesummary TEXT,
  source VARCHAR(20) NOT NULL DEFAULT 'manual', -- 'manual' | 'ai'
  createdat TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tasksyncrecords (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  taskid UUID NOT NULL REFERENCES tasks(id),
  pmconnectionid UUID NOT NULL REFERENCES pmsystemconnections(id),
  lastsyncedat TIMESTAMP,
  lastsyncstatus VARCHAR(20), -- 'success' | 'failed' | 'pending'
  externalstatus VARCHAR(100),
  createdat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedat TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE taskstateoverrides (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  taskid UUID NOT NULL REFERENCES tasks(id),
  userid UUID NOT NULL REFERENCES users(id),
  status VARCHAR(20) NOT NULL, -- 'blocked' | 'suspended'
  reason TEXT NOT NULL,
  resolvedat TIMESTAMP,
  createdat TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE complianceflags (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  taskid UUID NOT NULL REFERENCES tasks(id),
  ruletype VARCHAR(50) NOT NULL,
  triggeredbyid UUID REFERENCES users(id),
  flaggedat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolvedat TIMESTAMP
);

CREATE TABLE consultantteammembers (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  leaduserid UUID NOT NULL REFERENCES users(id),
  memberuserid UUID NOT NULL REFERENCES users(id),
  companyid UUID NOT NULL REFERENCES companies(id),
  createdat TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Indexes

```sql
CREATE INDEX idx_tasklogs_taskid ON tasklogs(taskid);
CREATE INDEX idx_tasklogs_userid ON tasklogs(userid);
CREATE INDEX idx_taskstateoverrides_taskid ON taskstateoverrides(taskid);
CREATE INDEX idx_complianceflags_taskid ON complianceflags(taskid);
CREATE INDEX idx_consultantteammembers_leaduserid ON consultantteammembers(leaduserid);
```

---

## API Routes

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/consultant/tasks` | Unified task queue — filtered by project, status, assignee |
| GET | `/api/consultant/tasks/:id` | Single task detail with sync state |
| PATCH | `/api/consultant/tasks/:id/status` | Update task status (blocked/suspended/active) |
| POST | `/api/consultant/tasks/:id/timelog/start` | Start a time tracking session |
| PATCH | `/api/consultant/tasks/:id/timelog/:logid/stop` | Stop active time session |
| GET | `/api/consultant/tasks/:id/timelogs` | All time entries for a task |
| POST | `/api/consultant/tasks/:id/sync` | Trigger manual sync-back to external PM |
| GET | `/api/consultant/team` | List team members under this consultant |
| POST | `/api/consultant/team` | Add a team member |
| DELETE | `/api/consultant/team/:memberid` | Remove a team member |
| GET | `/api/consultant/team/tasks` | View all tasks across team members |
| GET | `/api/consultant/compliance/flags` | List open compliance flags for review |
| GET | `/api/consultant/invoice/preview` | Preview billable hours summary for invoicing |

---

## Frontend Components

### New Components

| Component | Path | Description |
|-----------|------|-------------|
| `ConsultantWorkHub` | `pages/ConsultantWorkHub.tsx` | Main hub page — task queue, filters, workload counters |
| `TaskQueuePanel` | `components/consultant/TaskQueuePanel.tsx` | Filterable task list by project/status/assignee |
| `WorkloadSummaryBar` | `components/consultant/WorkloadSummaryBar.tsx` | Counters: total, past due, 30+ day aging |
| `TaskTimeTracker` | `components/consultant/TaskTimeTracker.tsx` | Manual timer start/stop + AI capture indicator |
| `TimeLogDrawer` | `components/consultant/TimeLogDrawer.tsx` | Slide-out panel showing all time entries for a task |
| `TaskStatusControl` | `components/consultant/TaskStatusControl.tsx` | Status selector: active / blocked / suspended + reason input |
| `ComplianceFlagBadge` | `components/consultant/ComplianceFlagBadge.tsx` | Visual indicator on tasks with open compliance flags |
| `TeamMemberPanel` | `components/consultant/TeamMemberPanel.tsx` | Add/remove team members, filter team task view |
| `InvoicePreviewDrawer` | `components/consultant/InvoicePreviewDrawer.tsx` | Billable hours summary pre-invoice |

### Modified Components

| Component | Change |
|-----------|--------|
| `ProjectSidebar` | Add "Consultant Hub" nav link |
| `TaskCard` | Add blocked/suspended badge and compliance flag indicator |

---

## wxAI Commands

### `/consultant-hub`

**Purpose**: Open the Consultant Work Hub filtered to a specific project or team member

**Usage**:
```
/consultant-hub [--project <project-id>] [--member <user-id>]
```

**Behavior**:
1. Loads task queue filtered to specified project or team member
2. Displays workload summary counters
3. Highlights any past-due or compliance-flagged tasks

---

### `/track-time`

**Purpose**: Start or stop a time tracking session on the current task

**Usage**:
```
/track-time start <task-id>
/track-time stop <task-id>
```

**Behavior**:
1. `start` — opens active timer on task, sets `starttime`
2. `stop` — closes timer, calculates `duration`, prompts billable Y/N
3. Saves entry to `tasklogs`

---

### `/suspend-task`

**Purpose**: Mark a task as blocked or suspended with a reason

**Usage**:
```
/suspend-task <task-id> --status <blocked|suspended> --reason "<text>"
```

**Behavior**:
1. Creates record in `taskstateoverrides`
2. Updates task status badge in UI
3. If compliance rule applies, creates `complianceflags` entry

---

## Success Criteria

1. A consultant can view their full task queue (internal + external PM) in a single hub, filtered by project, within 3 seconds of page load
2. A consultant can start and stop a time tracking session on any task, with the duration saved and marked billable or non-billable
3. AI execution time capture correctly records start/end timestamps and appends an AI-generated completion summary for AI-assisted tasks without manual input
4. A task can be marked `blocked` or `suspended` with a reason, and the status is reflected in the UI and synced back to the external PM system
5. Compliance rules (HIPAA/SOC2) automatically flag tasks that violate policy, surfacing them in the dashboard
6. A consultant can preview all billable hours for a project/date range and proceed to invoice generation
7. A team lead can add/remove team members and view all member tasks filtered by project and status
8. The workload summary bar accurately reflects total tasks, past-due count, and 30+ day aging at all times

---

## Constraints & Notes

### Constraints

1. **Authentication**: All consultant hub endpoints require valid JWT; team member access is scoped to company
2. **External sync**: Sync-back to PM systems is best-effort — failures do not block local task updates and retry on next cycle
3. **Compliance enforcement**: HIPAA/SOC2 flags are read from the existing compliance rules engine — this scope does not redefine those rules, only surfaces them in the consultant view
4. **AI time capture**: Relies on the existing AI execution context — scope covers storage and display, not AI runtime instrumentation
5. **Invoice generation**: This scope covers billable hours preview and data readiness only — actual PDF invoice generation is covered by a separate spec
6. **Team size**: Initial implementation targets small consultant teams (1 lead + up to 10 members); no pagination required at this scale
7. **Inactivity timer**: If a consultant's active time tracker runs > 8 hours without a stop, prompt to confirm or discard per existing time tracking policy

### Out of Scope

- Billing/payment processing
- PDF invoice rendering (separate spec)
- PM system OAuth setup (covered by PM integration spec)
- Role-based permission management beyond team lead / member

### Dependencies

- PM system connections must exist (`pmsystemconnections`) before external task sync operates
- Compliance rules engine must be active for flag generation
- Existing `timeentries` schema may require migration to support `tasklogs` if not already compatible
