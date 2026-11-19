# Spec 024: Pending Projects — Proposal Pipeline & Task Management

**Spec Number**: 024
**Status**: `draft`
**Created**: 2026-04-16
**Depends On**: Admin Dashboard (002-Scope), New Project (011-Scope), MCP Server (017)
**Source**: `specs/Project-Scope/024-pending-projects.md`

---

## Overview

Two new panels on the Admin Dashboard providing visibility into work that hasn't started yet and work that's outstanding:

1. **Project Proposals** — A planning pipeline where Admins, Team Managers, and AI agents submit ideas for new projects. Each proposal captures a title, description, priority, estimated effort, proposed date, and source. Proposals move through a defined status flow: Pending -> Good Idea -> Accepted -> Create Project (or Rejected at any point).

2. **Pending Tasks by Project** — A management/priority view showing outstanding tasks across active projects. Admins and Team Managers see all tasks with team member filtering; Team Members see only their own. Clicking a project opens a new browser tab with the full task list grouped by scope (specification).

### Core Design

| Element | Value |
| --- | --- |
| **Primary Actor** | Admin |
| **Secondary Actors** | Team Manager, Team Member (filtered view), AI Agent (proposal submission) |
| **Key Value** | Single-glance pipeline visibility for planning (proposals) and priority management (pending tasks) |
| **Scope Boundary** | Dashboard panels + pending tasks page. Does NOT include task creation, task editing, or project creation (those use existing flows). |

### Proposal Status Flow

```
┌─────────┐     ┌───────────┐     ┌──────────┐
│ Pending  │────>│ Good Idea │────>│ Accepted │──> Create Project
└─────────┘     └───────────┘     └──────────┘
     │               │
     │               └──────────>┌──────────┐
     │                           │ Rejected │
     └──────────────────────────>└──────────┘
```

**Statuses:**

- **Pending** — Just submitted, awaiting review (DEFAULT)
- **Good Idea** — Reviewed and worth considering, needs planning
- **Accepted** — Approved for project creation
- **Rejected** — Not moving forward (reason required)

**Valid Transitions:**

- Pending -> Good Idea, Rejected
- Good Idea -> Accepted, Rejected
- Accepted -> triggers Create Project flow
- Rejected -> can be reopened to Pending (not final)

---

## User Scenarios & Testing

### US1 — Admin Reviews and Accepts a Project Proposal

**Actor**: Admin

**Scenario**:
1. Admin opens Admin Dashboard
2. "Project Proposals" panel shows 3 entries — 2 Pending, 1 Good Idea
3. Admin clicks a Pending proposal "Mobile App Redesign" submitted by AI Agent on 2026-04-10
4. Admin reads the description, changes status to "Good Idea"
5. Later, Admin returns and moves it to "Accepted"
6. A "Create Project" button appears — Admin clicks it
7. CreateProjectModal opens pre-filled with the proposal's title and description
8. Admin completes project creation
9. Proposal shows linked project and is no longer editable

**Expected outcome**: Proposal moves through Pending -> Good Idea -> Accepted -> project created. Full audit trail of status changes. ProjectOverview.md generated automatically from proposal content.

---

### US2 — Team Manager Submits a Proposal

**Actor**: Team Manager

**Scenario**:
1. Team Manager navigates to Admin Dashboard
2. Clicks "Add Proposal" in the Project Proposals panel
3. Fills in: title "Client Portal v2", description, priority "High", estimated effort "3 weeks"
4. Proposed date auto-fills to today, source shows their name
5. Proposal appears in the panel with status "Pending"
6. Admin later sees it and triages it

**Expected outcome**: Team Manager can submit proposals. They appear as Pending for Admin review. Proposed date and source are automatically captured.

---

### US3 — Admin Views Pending Tasks and Drills Into a Project

**Actor**: Admin

**Scenario**:
1. Admin sees "Pending Tasks" panel on Admin Dashboard
2. Panel shows: "wxKanban Core" — 12 open, 4 in-progress; "Client Portal" — 8 open, 2 in-progress
3. Admin clicks "wxKanban Core" row
4. New browser tab opens at /admin/projects/:id/pending-tasks
5. Page shows tasks grouped by scope: [001] Auth & Registration — 3 open tasks; [002] Admin Dashboard — 5 open tasks; Unscoped Tasks — 4 tasks with no spec assigned
6. Admin filters by "High priority" — list narrows
7. Admin filters by team member "Jane" — sees only her tasks

**Expected outcome**: One-click drill-down from dashboard to full task breakdown by scope. Filters by priority and team member work. Page is fully standalone in its own tab.

---

## Functional Requirements

### Project Proposals

#### FR-001 — Proposals Panel on Admin Dashboard

The Admin Dashboard MUST include a "Project Proposals" panel displaying all proposals for the user's company.

**Acceptance Criteria**:
- [ ] Panel visible to Admin and Team Manager roles
- [ ] Proposals sorted: Pending first, then Good Idea, then Accepted, then Rejected — within each group sorted by proposed date (newest first)
- [ ] Status badges: Pending (yellow), Good Idea (blue), Accepted (green), Rejected (gray)
- [ ] Each row shows: title, source, proposed date, priority, status badge
- [ ] Panel is collapsible (default expanded)
- [ ] "Add Proposal" button visible to Admin and Team Manager

---

#### FR-002 — Proposal Creation

Admins, Team Managers, and AI agents MUST be able to create proposals with required and optional fields.

**Acceptance Criteria**:
- [ ] Required: title
- [ ] Optional: description, priority (low/medium/high, default medium), estimated effort (free text, e.g. "2 weeks", "40 hours")
- [ ] proposeddate auto-set to current date on creation
- [ ] source auto-set to current user's name (or "AI Agent" when submitted via MCP tool)
- [ ] Status defaults to "Pending"
- [ ] Team Members (non-manager) cannot create proposals

---

#### FR-003 — Proposal Status Transitions

The system MUST enforce valid status transitions with audit.

**Acceptance Criteria**:
- [ ] Pending -> Good Idea (Admin only)
- [ ] Pending -> Rejected (Admin only, reason required)
- [ ] Good Idea -> Accepted (Admin only)
- [ ] Good Idea -> Rejected (Admin only, reason required)
- [ ] Rejected -> Pending (Admin only — reopening)
- [ ] No other transitions permitted
- [ ] Each transition logged with timestamp, actor, and previous status
- [ ] Team Managers can view but NOT change status

---

#### FR-004 — Accepted Proposal -> Create Project

When a proposal reaches "Accepted" status, a "Create Project" action MUST be available that pre-fills the project creation modal and generates the initial ProjectOverview document.

**Acceptance Criteria**:
- [ ] "Create Project" button appears only on Accepted proposals
- [ ] Opens existing CreateProjectModal with title and description pre-filled from proposal
- [ ] After project creation, the proposal's title, description, priority, estimated effort, source, and proposed date are used to generate specs/projectoverview.md for the new project
- [ ] The generated ProjectOverview is also upserted into the projectdocuments table (doctype='ProjectOverview', specid=NULL) so it appears in the project's document panel immediately
- [ ] Proposal links to the created project via projectid and becomes read-only
- [ ] Converted proposals show the linked project name

**Generated ProjectOverview.md structure**:
```markdown
# Project Overview: {title}

## Description
{proposal description}

## Origin
- **Proposed by**: {source}
- **Proposed date**: {proposeddate}
- **Priority**: {priority}
- **Estimated effort**: {estimatedeffort}
- **Accepted by**: {admin who accepted}
- **Accepted date**: {transition timestamp}

## Target Users
<!-- To be completed during Design phase -->

## Core Modules / Features
<!-- To be completed during Design phase -->

## Key Constraints
<!-- To be completed during Design phase -->
```

---

#### FR-005 — Proposal Data Storage

Proposals MUST be stored in a new `projectproposals` table.

**Schema**:
```
projectproposals
  id              UUID v7 PK
  companyid       FK -> companies.id
  title           varchar(255) NOT NULL
  description     text
  priority        varchar(20) DEFAULT 'medium'
  estimatedeffort varchar(100)
  status          varchar(20) DEFAULT 'pending'
  rejectionreason text (required when status = 'rejected')
  proposeddate    timestamp DEFAULT now()
  source          varchar(255) NOT NULL
  projectid       UUID nullable FK -> companyprojects.id
  createdbyid     FK -> users.id
  createdat       timestamp DEFAULT now()
  updatedat       timestamp DEFAULT now()
```

---

### Pending Tasks

#### FR-006 — Pending Tasks Summary Panel

The Admin Dashboard MUST include a "Pending Tasks" panel showing outstanding task counts per active project.

**Acceptance Criteria**:
- [ ] One row per ACTIVE project for the company
- [ ] Each row: project name, open count, in-progress count, total pending (open + in_progress)
- [ ] Sorted by total pending descending (busiest first)
- [ ] Projects with zero pending shown at bottom, muted
- [ ] Visible to Admin and Team Manager
- [ ] Panel is collapsible (default expanded)
- [ ] Each row is a link opening new browser tab

---

#### FR-007 — Pending Tasks Page (New Tab)

A standalone page at `/admin/projects/:id/pending-tasks` MUST display all non-completed tasks grouped by scope.

**Acceptance Criteria**:
- [ ] Header: project name, current phase, total pending count
- [ ] Tasks grouped under scope headings: "[specnumber] — [title]" with scope status badge
- [ ] Each scope section: task table with name, priority badge, status badge, assignee, due date
- [ ] Tasks without specid grouped under "Unscoped Tasks" at bottom
- [ ] Page uses AppShell layout (sidebar + header)
- [ ] Works as standalone route (no dashboard dependency)

---

#### FR-008 — Role-Based Task Filtering

The pending tasks view MUST respect role-based visibility.

**Acceptance Criteria**:
- [ ] Admin: sees all tasks, can filter by team member
- [ ] Team Manager: sees all tasks for their assigned projects, can filter by team member
- [ ] Team Member: sees only tasks assigned to them
- [ ] Filter dropdowns: priority (all/high/critical), status (open/in_progress/both), assignee
- [ ] Sort: priority, due date, status
- [ ] "Show completed" toggle (default off)

---

#### FR-009 — New Tab Link Behavior

Clicking a project in the Pending Tasks panel MUST open the pending tasks page in a new browser tab.

**Acceptance Criteria**:
- [ ] Uses `target="_blank"` with `rel="noopener noreferrer"`
- [ ] Subtle external-link icon on each row
- [ ] Middle-click and right-click "Open in new tab" work

---

### API Endpoints

#### FR-010 — API Endpoints

**Proposals**:
- `GET /api/admin/proposals` — list proposals for company
- `POST /api/admin/proposals` — create proposal
- `PUT /api/admin/proposals/:id` — update fields and/or status
- `DELETE /api/admin/proposals/:id` — soft-delete/archive

**Pending Tasks**:
- `GET /api/admin/pending-tasks-summary` — per-project counts: `{ projects: [{ id, name, opencount, inprogresscount, totalpending }] }`
- `GET /api/projects/:id/pending-tasks` — tasks grouped by scope: `{ project: {...}, scopes: [{ id, specnumber, title, status, tasks: [...] }], unscopedtasks: [...] }`
  - Query params: `priority`, `status`, `assignee`, `sort`, `order`, `showcompleted`

---

### MCP Tool

#### FR-011 — project.submit_proposal MCP Tool

AI agents MUST be able to submit proposals programmatically via a new MCP tool.

**Tool Definition**:

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| title | string | yes | Proposal title |
| description | string | no | Proposal description |
| priority | "low" / "medium" / "high" | no | Default "medium" |
| estimatedEffort | string | no | E.g. "2 weeks", "40 hours" |
| projectId | UUID | yes | Company context |
| source | string | no | Auto-set to "AI Agent" if omitted |

**Behavior**:
- Creates proposal with status "Pending"
- Sets proposeddate to now()
- Logs an event via project.capture_event
- Returns: `{ success, proposalId, title, status }`

**Permissions**:
- Role: editor, admin
- Stage: cross-cutting (allowed in any lifecycle stage)

---

## Success Criteria

1. Dashboard panels load within 3 seconds. Lists exceeding 50 items use server-side pagination (page size 25).
2. Pending tasks summary panel shows accurate counts matching actual DB task statuses.
3. Pending tasks page (new tab) loads with tasks correctly grouped by scope.
4. 100% of status transitions enforce the valid transition rules — invalid transitions return 422 error.
5. Role-based filtering is enforced server-side — Team Members cannot see other members' tasks even via direct API call.
6. AI agents can submit proposals via project.submit_proposal and they appear in the dashboard within 1 refresh cycle (5 minutes auto-refresh or manual).
7. Accepted proposal -> Create Project flow pre-fills the modal AND generates a ProjectOverview document with all proposal fields in structured sections and stub markers for Design-phase fields to be completed later.

---

## Constraints

1. Proposals are company-scoped — a user can only see proposals for their own company. Server-side enforcement required.
2. The pending tasks page queries existing projecttasks and projectspecifications tables — no data duplication. Counts are computed at query time, not cached.
3. The projectproposals table follows wxKanban DB conventions: lowercase, no underscores, UUID v7 PKs, plural table name.
4. Status transition enforcement is server-side (not just UI). PUT /api/admin/proposals/:id validates transitions and returns 422 for invalid ones.
5. The new-tab pending tasks page must work independently — no dependency on dashboard state or session storage. All data fetched fresh from API on page load.
6. project.submit_proposal MCP tool is cross-cutting (not stage-gated) and must be registered in the stage-enforcement allowlist.

---

## Dependencies

- Admin Dashboard (002-Scope) — panels added to existing page
- CreateProjectModal (011-Scope) — pre-fill flow
- ProjectOverview document generation (existing pattern)
- MCP Server (017) — new tool registration

---

## Out of Scope

- Task creation or editing from the pending tasks page
- Bulk task operations
- Notifications when proposal status changes
- Export proposals to CSV
- Proposal comments/discussion threads

---

## Key Components to Build

| Component | Purpose |
| --- | --- |
| `ProposedProjectsPanel` | Dashboard panel listing project proposals with CRUD |
| `AddProposalDialog` | Dialog/form for creating new proposals |
| `PendingTasksSummaryPanel` | Dashboard panel showing per-project pending task counts |
| `PendingTasksByScope` | Standalone page `/admin/projects/:id/pending-tasks` with grouped task view |
| `ScopeTaskGroup` | Reusable component rendering a scope heading + task table |
