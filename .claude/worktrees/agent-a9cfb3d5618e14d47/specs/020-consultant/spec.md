# Spec 020: Consultant Work Hub

**Spec Number**: 020
**Status**: `scoping`
**Created**: 2026-04-01
**Last Refined**: 2026-05-12 (interactive buildscope)
**Depends On**: PM Integration spec, Compliance Rules Engine spec, Invoice Generation spec, wxAI command runtime
**Source**: `specs/Project-Scope/020-consultant.md`

---

## Overview

A unified consultant work hub that aggregates tasks from both internal wxKanban projects and connected external PM systems (Jira, Monday.com, Asana, Trello) into a single prioritized work queue. The hub provides integrated time tracking with billable capture, AI-assisted execution time and summary capture, compliance flag surfacing, PM status sync-back, and invoice-ready billing output — giving consultants everything they need to complete work and get paid.

### Core Design

| Element | Value |
|---|---|
| **Primary Actor** | Consultant |
| **Secondary Actors** | (deferred) Consultant team members — see scope 021 |
| **Key Value** | Faster task completion and invoice-ready billing output from a single work surface |
| **Scope Boundary** | Task view, project filtering, workload counters, manual time tracking with billable prompt, AI execution capture, blocked/suspended status with audit, compliance flag surfacing, PM status sync-back, invoice-ready billable preview. **Out**: PDF invoice rendering, PM OAuth setup, team-lead management (021), payment processing. |

---

## User Scenarios & Testing

### US1 — Consolidated Task Work Queue

**Actor**: Consultant

**Scenario**:
1. Consultant logs in and navigates to Consultant Work Hub (`/dashboard/work-hub`)
2. Hub displays all tasks assigned to the consultant across internal projects and connected PM systems
3. Tasks that exist in both internal and an external PM system (same `sourcepmssystem` + `externaltaskid`) are shown as a single card with both source badges
4. Consultant applies a project filter to narrow the view
5. Workload summary bar shows total / past-due / 30+ day aging / compliance-attention counts
6. Consultant selects a task and begins work

**Expected outcome**: Consultant sees their full workload in one place, de-duplicated, filtered to the active project, with aging and compliance indicators visible within 3 seconds of page load.

---

### US2 — Time Tracking with Stop-Time Billable Prompt

**Actor**: Consultant

**Scenario**:
1. Consultant opens a task in the hub
2. Consultant clicks "Start Timer" — a running timer begins (only one active timer per consultant; Start is disabled while one is running)
3. Consultant completes work and clicks "Stop Timer"
4. A `BillablePromptModal` opens: "Mark this entry billable?" Y/N + optional notes field
5. Entry is saved to `projecttimeentries` with start, end, duration, `billable`, `notes`, `source='manual'`

**Expected outcome**: Time entry is saved accurately with an explicit billable decision per session. Billable entries surface in the invoice preview.

---

### US3 — Blocked / Suspended Status with Audit + Sync-Back

**Actor**: Consultant

**Scenario**:
1. Consultant encounters a task blocked by an external dependency
2. Consultant clicks "Blocked" → `TaskStatusControl` modal opens with a required reason textarea
3. Consultant submits reason → `taskstateoverrides` row created (userid, status, reason, createdat); `projecttasks.status` updated; a `tasksyncrecords` row queued with `lastsyncstatus='pending'`
4. Within the next ≤15 min PM sync cycle, `pmSyncService` pushes the status to the external PM system
5. On sync success, `lastsyncstatus='success'`; on failure, `lastsyncerror` recorded and entry retried next cycle
6. Compliance rule engine evaluates the task; if a rule matches, a `complianceflags` row is added

**Expected outcome**: Both the local DB and the external PM reflect the new state; an auditable reason trail exists; compliance flags surface without blocking the workflow.

---

### US4 — AI Spec-Level Session with Per-Task Time Attribution

**Actor**: Consultant + wxAI

**Scenario**:
1. Consultant asks wxAI to develop against spec 0XX. wxAI invokes `/ai-session start <spec-id>` → an `aispecsessions` row is created with `status='active'`, `starttime=now`
2. wxAI enumerates the spec's task list and, for each task it begins work on, opens a `projecttimeentries` row with `source='ai'`, `aispecsessionid=<session>`, `taskid=<currenttask>`
3. As wxAI moves between tasks, it closes the prior task's time entry and opens the next one — only one task entry is "open" per session at a time
4. Q&A, clarifications, and follow-up asks during the session accumulate against an `aispecsessions.overheadduration` bucket (not attributed to any single task)
5. The session **stays active across multiple conversations and through any Q&A** until every `projecttasks` row linked to the spec reaches `status='completed'`
6. On auto-stop, wxAI generates a per-task summary (written to each entry's `completionnotesummary`) and a roll-up spec summary (written to `aispecsessions.summary`); `aispecsessions.totalduration` = sum of task entries + overhead
7. The session runs as a **separate channel** from any consultant manual timer — both can be active simultaneously (FR-012 governs manual only)

**Expected outcome**: AI-driven dev work is fully captured across the entire spec lifetime, attributed per-task for granular billing, with non-task Q&A time preserved at the session level, and rolled up into a single auditable spec summary.

---

## Functional Requirements

### FR-001 — Unified Consultant Task Queue (with de-duplication)

The system MUST aggregate all tasks assigned to the authenticated consultant from both internal wxKanban projects and connected external PM systems into a single hub view, de-duplicating tasks that exist in both.

**Acceptance Criteria**:
- [ ] Tasks from all connected PM systems (matched by `sourcepmssystem`) appear in the hub
- [ ] Internal wxKanban tasks appear in the hub
- [ ] When two `projecttasks` rows share the same `(sourcepmssystem, externalid)`, they collapse into a single card displaying both source badges
- [ ] Queue loads within 3 seconds for ≤500 assigned tasks

---

### FR-002 — Project-Based Task Filtering

The hub MUST allow the consultant to filter the task queue by project.

**Acceptance Criteria**:
- [ ] A project selector is available in the hub
- [ ] Selecting a project filters the task list to that project only
- [ ] "All Projects" is the default view
- [ ] Filter state persists during the session (client-side state)

---

### FR-003 — Dashboard Workload Indicators

The hub MUST display workload counters: total / past-due / 30+ day aging / compliance-attention.

**Acceptance Criteria**:
- [ ] Total task count is always visible
- [ ] Past-due count = open tasks whose `duedate` is before today
- [ ] 30+ day aging = open tasks whose `createdat` is older than 30 days
- [ ] Compliance-attention count = tasks with one or more unresolved `complianceflags`
- [ ] Counters update dynamically when filters change

---

### FR-004 — Manual Time Tracking with Stop-Prompt Billable Decision

The system MUST allow consultants to manually start and stop a time tracking session on any task, prompting for a billable decision on stop.

**Acceptance Criteria**:
- [ ] Start Timer button is available on each task
- [ ] Only one timer may be active at a time per consultant (FR-012)
- [ ] Stop Timer calculates duration in minutes from start → stop
- [ ] A `BillablePromptModal` opens on Stop; consultant selects Billable Y/N and may add notes
- [ ] Entry is saved to `projecttimeentries` with `source='manual'`

---

### FR-005 — AI Spec-Level Session with Per-Task Time Attribution

The system MUST automatically open a spec-level AI session when wxAI begins development work, attribute time per-task as wxAI moves through the spec's task list, accumulate non-task Q&A time as session overhead, and auto-close the session when all spec tasks reach `status='completed'`.

**Session Model**:
- An `aispecsessions` row represents one continuous AI engagement with a spec — it persists across multiple consultant conversations, Q&A exchanges, and clarifying asks
- For each task wxAI works on, a `projecttimeentries` row is opened with `source='ai'`, `aispecsessionid=<session>`, and `taskid=<currenttask>`
- Only **one task-level AI entry** is open per session at any moment; moving to a different task closes the prior entry and opens a new one
- Q&A, clarification, and non-task time accumulates against `aispecsessions.overheadduration` (not attributed to a specific task)
- Manual consultant timers run as a **separate concurrent channel** — FR-012's single-active-timer rule applies to `source='manual'` only

**Acceptance Criteria**:
- [ ] `/ai-session start <spec-id>` creates an `aispecsessions` row with `status='active'`, `starttime=now`, `companyid` + `userid` recorded
- [ ] Opening a task-level AI entry while another is open auto-closes the prior entry (cumulative; not destructive)
- [ ] Session time accumulates across consultant conversations — closing the chat does NOT stop the session
- [ ] Auto-stop fires within 60 seconds of the last `projecttask` for that spec hitting `status='completed'`
- [ ] On auto-stop: each per-task entry gets an AI-generated `completionnotesummary`; the session gets a roll-up `summary`; `totalduration` = SUM(task entries) + `overheadduration`
- [ ] Hard cap: any session with `(now - starttime) > 30 days` is force-stopped with `status='timeout'` and flagged for review
- [ ] AI-captured time entries are visually distinguishable from manual entries (icon + source label) in the `TimeLogDrawer`
- [ ] A short reference (attribution + session ID + timestamp) is appended to each touched task's completion notes

---

### FR-006 — External Task Status Sync-Back via Outbound Queue

The system MUST queue status changes for external PM tasks and push them to the originating PM system on the next sync cycle.

**Acceptance Criteria**:
- [ ] Status changes on tasks with non-NULL `sourcepmssystem` create a `tasksyncrecords` row with `lastsyncstatus='pending'`
- [ ] `pmSyncService.runOutbound()` processes pending rows on its existing cycle (≤15 min)
- [ ] Sync failures set `lastsyncstatus='failed'`, store the error, and increment `retrycount`
- [ ] Failed rows are retried on subsequent cycles (no manual intervention required)
- [ ] Sync-back never blocks the local task update

---

### FR-007 — Blocked and Suspended Task States with Audit Trail

The system MUST support two distinct non-active task states (`blocked`, `suspended`) and record each state transition in an auditable table.

- **Blocked**: external dependency prevents progress
- **Suspended**: consultant intentionally pauses for reassessment

**Acceptance Criteria**:
- [ ] Consultant can mark a task `blocked` or `suspended` via the `TaskStatusControl` modal with a required reason
- [ ] Each state transition writes a row to `taskstateoverrides` with `userid`, `status`, `reason`, `createdat`
- [ ] Transitions back to `active` write a row with `status='active'` and `resolvedat` set on the prior `blocked`/`suspended` row(s)
- [ ] Visual badges on the task card distinguish blocked / suspended states
- [ ] Reason history is queryable for compliance review (no longer stored in `projecttasks.description`)

---

### FR-008 — Compliance-Aware Surfacing

The system MUST surface HIPAA/SOC2 compliance flags on tasks that violate active rules.

**Acceptance Criteria**:
- [ ] Compliance rules engine evaluates tasks against active HIPAA/SOC2 rules (engine owned outside 020)
- [ ] Tasks with unresolved `complianceflags` display a badge on the task card
- [ ] Open flags are listed in a dedicated compliance review panel within the hub
- [ ] Flagged tasks are not blocked by default — surfaced for review

---

### FR-009 — Invoice-Ready Billable Preview

The system MUST provide a billable hours summary that consultants can use to initiate invoice generation.

**Acceptance Criteria**:
- [ ] Consultant can preview billable entries by project + date range
- [ ] Preview shows entries with task name, date, duration; excludes non-billable and already-invoiced entries
- [ ] Total billable hours computed and displayed
- [ ] Preview output is structured for handoff to the invoice generation scope

---

### FR-011 — Inactivity Prompt for Long-Running Timer

The system MUST prompt the consultant when an active timer exceeds 8 hours of continuous runtime.

**Acceptance Criteria**:
- [ ] When an active timer's elapsed duration crosses 8h, the UI surfaces a prompt: keep running, stop now, or discard
- [ ] Threshold is configurable per-company (default 8h)
- [ ] If the consultant takes no action within 15 min of the prompt, the system auto-stops and marks the entry `billable=false` with note "inactivity auto-stop"

---

### FR-012 — Single Active Timer per Consultant

The system MUST enforce that only one timer may be active per consultant at any time.

**Acceptance Criteria**:
- [ ] Start Timer button is disabled while any timer is active for the consultant
- [ ] Backend rejects a Start request if `projecttimeentries` has any row for this user with `endtime IS NULL`

---

### FR-013 — Authenticated + Company-Scoped Hub Access

All consultant hub endpoints MUST require a valid JWT and scope all data to the authenticated consultant's company.

**Acceptance Criteria**:
- [ ] Every hub route uses `authenticateToken` + `requireAuth` middleware
- [ ] Task / time / sync / compliance queries filter by `companyid = req.companyid`
- [ ] Task ownership checks (e.g., state update) verify `projecttasks.assignedtoid = req.userid`

---

### FR-010 — Team-Lead / Team-Member Management — **DEFERRED to scope 021**

Originally specified in 020, this requirement is intentionally deferred to a follow-up scope. 020 ships consultant-self workflow only.

---

## Data Requirements

### Schema Changes

```sql
-- 1. EXTEND existing projecttimeentries (replaces spec's earlier 'tasklogs' name)
ALTER TABLE projecttimeentries
  ADD COLUMN source VARCHAR(20) NOT NULL DEFAULT 'manual',  -- 'manual' | 'ai'
  ADD COLUMN completionnotesummary TEXT,
  ADD COLUMN aispecsessionid UUID REFERENCES aispecsessions(id) ON DELETE SET NULL;
CREATE INDEX idx_projecttimeentries_aisession
  ON projecttimeentries(aispecsessionid)
  WHERE aispecsessionid IS NOT NULL;

-- 2. INDEX existing projecttasks.externalid for FR-001 de-duplication
-- (column already exists from prior scope; only the index is new)
CREATE INDEX idx_projecttasks_external
  ON projecttasks(sourcepmssystem, externalid)
  WHERE externalid IS NOT NULL;

-- 3. NEW: aispecsessions (FR-005 spec-level AI engagement)
CREATE TABLE aispecsessions (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  specid VARCHAR(50) NOT NULL,           -- e.g., '020-consultant'
  projectid UUID NOT NULL REFERENCES companyprojects(id) ON DELETE CASCADE,
  userid UUID NOT NULL REFERENCES userprofiles(id),
  companyid UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'active',  -- 'active' | 'completed' | 'timeout' | 'cancelled'
  starttime TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  endtime TIMESTAMP,
  overheadduration INTEGER NOT NULL DEFAULT 0,   -- minutes of Q&A / non-task time
  totalduration INTEGER,                          -- minutes; computed at close = sum(task entries) + overhead
  taskcount INTEGER NOT NULL DEFAULT 0,           -- distinct tasks touched in this session
  summary TEXT,                                   -- AI-generated spec-level rollup, written at close
  createdat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedat TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_aispecsessions_active
  ON aispecsessions(specid, userid)
  WHERE status = 'active';

-- 4. NEW: taskstateoverrides (FR-007 audit trail)
CREATE TABLE taskstateoverrides (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  taskid UUID NOT NULL REFERENCES projecttasks(id) ON DELETE CASCADE,
  userid UUID NOT NULL REFERENCES userprofiles(id),
  status VARCHAR(20) NOT NULL,           -- 'blocked' | 'suspended' | 'active'
  reason TEXT,                            -- required when status in ('blocked','suspended')
  resolvedat TIMESTAMP,
  createdat TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_taskstateoverrides_taskid ON taskstateoverrides(taskid);

-- 4. NEW: tasksyncrecords (FR-006 outbound queue)
CREATE TABLE tasksyncrecords (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  taskid UUID NOT NULL REFERENCES projecttasks(id) ON DELETE CASCADE,
  pmconnectionid UUID NOT NULL REFERENCES pmsystemconnections(id),
  pendingstatus VARCHAR(20),              -- status awaiting sync to PM
  lastsyncedat TIMESTAMP,
  lastsyncstatus VARCHAR(20),             -- 'pending' | 'success' | 'failed'
  lastsyncerror TEXT,
  retrycount INTEGER NOT NULL DEFAULT 0,
  createdat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedat TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_tasksyncrecords_pending
  ON tasksyncrecords(lastsyncstatus)
  WHERE lastsyncstatus = 'pending';

-- Existing: complianceflags table is unchanged (already matches spec).
-- Deferred (021): consultantteammembers — NOT created in 020.
```

---

## API Routes

All routes under `/api/consultant-hub/*`. Authentication via JWT; company-scoped per FR-013.

| Method | Route | Description |
|---|---|---|
| GET | `/api/consultant-hub/tasks` | Unified task queue (project filter, counters, de-duplicated) |
| GET | `/api/consultant-hub/tasks/:taskid` | **NEW** — single task detail with sync state + override history |
| PATCH | `/api/consultant-hub/tasks/:taskid/state` | Update task state (`active` \| `blocked` \| `suspended`) with reason; queues sync-back |
| GET | `/api/consultant-hub/compliance-flags` | Open compliance flags on assigned tasks |
| GET | `/api/consultant-hub/invoice-preview` | Billable preview by project + date range |
| POST | `/api/consultant-hub/ai-session/start` | **NEW** — open an `aispecsessions` row for a spec (body: `{ specid, projectid }`); idempotent if active session exists |
| POST | `/api/consultant-hub/ai-session/:id/task-switch` | **NEW** — close current open task entry, open new one for `taskid` (body: `{ taskid }`) |
| POST | `/api/consultant-hub/ai-session/:id/overhead` | **NEW** — increment `overheadduration` by `minutes` (body: `{ minutes }`) for Q&A / non-task time |
| POST | `/api/consultant-hub/ai-session/:id/close` | **NEW** — explicit close (manual override of auto-stop); writes per-task and session summaries |
| GET | `/api/consultant-hub/ai-session/:id` | **NEW** — session detail with all per-task entries, durations, summaries |
| GET | `/api/consultant-hub/ai-session/active?specid=<id>` | **NEW** — return active session for spec + user (used to resume across conversations) |

**Time tracking** remains on its existing surface — referenced as a dependency, not relocated:

| Method | Route | Notes |
|---|---|---|
| POST | `/api/time-tracking/start` | Existing |
| POST | `/api/time-tracking/stop/:id` | Existing — invokes `BillablePromptModal` on the UI side |
| GET | `/api/time-tracking/active` | Existing |

---

## Frontend Components

### New / Extracted Components (Section 6 decisions)

| Component | Path | Purpose |
|---|---|---|
| `ConsultantWorkHubPage` | `pages/ConsultantWorkHubPage.tsx` | (Exists) Main hub page — keep as orchestrator |
| `TaskStatusControl` | `components/consultant/TaskStatusControl.tsx` | **NEW** — replaces `window.prompt()` for blocked/suspended reason capture (modal + textarea) |
| `TimeLogDrawer` | `components/consultant/TimeLogDrawer.tsx` | **NEW** — slide-out panel showing all `projecttimeentries` for a task; backed by `GET /tasks/:taskid` |
| `BillablePromptModal` | `components/consultant/BillablePromptModal.tsx` | **NEW** — opens on Stop Timer; captures billable Y/N + notes |
| `WorkloadSummaryBar` | `components/consultant/WorkloadSummaryBar.tsx` | **NEW** — extracted from inline counters |

### Components Remaining Inlined (no extraction needed for v1)

- Task queue list, project filter, compliance review panel, invoice preview panel.

### Modified Components

| Component | Change |
|---|---|
| `AppShell` | Existing nav link to `/dashboard/work-hub` confirmed (no change required) |
| `TaskCard` (project pages) | Add blocked/suspended badge + compliance flag indicator if surfaced outside the hub |

---

## wxAI Commands

### `/consultant-hub`

Open the Consultant Work Hub, optionally filtered by project.

```
/consultant-hub [--project <project-id>]
```

(`--member` flag removed; team-lead view deferred to scope 021.)

---

### `/track-time`

Start or stop a **manual** consultant time tracking session on a task. Manual-only — AI capture uses `/ai-session` (below).

```
/track-time start <task-id>
/track-time stop  <task-id>
```

Behavior:
- `start` — opens a manual timer if none is active; rejects if any `source='manual'` entry has `endtime IS NULL` for this user (FR-012)
- `stop` — closes the timer and opens `BillablePromptModal` for billable Y/N + notes

---

### `/ai-session`

Spec-level AI engagement session — opens once per spec, persists across conversations, attributes time per-task as wxAI works, accumulates Q&A as overhead, auto-stops when all spec tasks complete (FR-005).

```
/ai-session start <spec-id>
/ai-session task <spec-id> <task-id>      # switch the open task entry
/ai-session overhead <spec-id> <minutes>  # log Q&A / non-task time
/ai-session close <spec-id>               # explicit manual close
/ai-session status <spec-id>              # show session totals + per-task breakdown
```

Behavior:
- `start` — calls `POST /ai-session/start`; idempotent (returns existing active session if one exists for this spec+user)
- `task` — calls `POST /ai-session/:id/task-switch`; closes prior open `source='ai'` entry, opens new one for the named task
- `overhead` — calls `POST /ai-session/:id/overhead`; meant to be invoked by wxAI itself when accumulating Q&A time
- `close` — calls `POST /ai-session/:id/close`; triggers AI summary generation for each touched task and the session rollup
- `status` — read-only view of current durations

---

### `/suspend-task`

Mark a task as `blocked` or `suspended` with a reason via wxAI.

```
/suspend-task <task-id> --status <blocked|suspended> --reason "<text>"
```

Behavior: same as the `PATCH /tasks/:taskid/state` route — writes `taskstateoverrides`, queues `tasksyncrecords`, evaluates compliance.

---

## Success Criteria

1. Consultant views full task queue (internal + external PM, de-duplicated by `(sourcepmssystem, externaltaskid)`), filtered by project, within 3 seconds of page load.
2. Consultant starts/stops a timer; on Stop, `BillablePromptModal` prompts billable Y/N + notes → entry saved to `projecttimeentries`.
3. AI engagement opens an `aispecsessions` row that persists across consultant conversations, attributes per-task time to `projecttimeentries` (`source='ai'`), accumulates Q&A as `overheadduration`, and auto-closes within 60s of every spec task reaching `status='completed'` — writing per-task `completionnotesummary` and a session-level `summary`.
4. A task can be marked `blocked` / `suspended` / `active` with reason → `taskstateoverrides` row written → `tasksyncrecords` entry queued for PM sync-back.
5. Outbound sync processes within ≤15 min cycle; failures retry next cycle without manual intervention.
6. Compliance flags (HIPAA/SOC2) surface per task badge and in a compliance review panel.
7. Consultant previews billable hours by project + date range; output ready for invoice generation handoff.
8. Workload summary shows total / past-due / 30+ day aging / compliance-attention; updates dynamically with filters.
9. Inactivity prompt fires when an active timer exceeds 8 hours.

---

## Constraints & Notes

### Constraints

1. **Authentication**: All hub endpoints require a valid JWT; data is company-scoped (FR-013).
2. **External sync**: Sync-back is best-effort — local task updates always succeed even if PM API fails; retry on next cycle.
3. **Compliance enforcement**: HIPAA/SOC2 rule definitions live outside 020 — this scope only surfaces flags.
4. **AI time capture**: Relies on the existing wxAI execution context — 020 covers storage/display only, not AI runtime instrumentation.
5. **Single active timer**: Enforced both UI-side and server-side (FR-012).
6. **Invoice generation**: 020 covers billable preview only; PDF rendering is a separate spec.

### Out of Scope

- Billing / payment processing
- PDF invoice rendering (separate spec)
- PM system OAuth setup (covered by PM integration spec)
- **Team-lead / team-member management → deferred to scope 021**
- Role-based permission management beyond task ownership

### Dependencies

- `pmsystemconnections` must exist before sync-back operates
- Compliance rules engine must be active for `complianceflags` rows to be generated
- `/api/time-tracking/*` routes remain the canonical timer surface
- wxAI command runtime active (for `/track-time`, `/consultant-hub`, `/suspend-task`)
- `projecttasks` must carry `sourcepmssystem` (existing) and `externaltaskid` (new column added by this scope) for FR-001 de-duplication
