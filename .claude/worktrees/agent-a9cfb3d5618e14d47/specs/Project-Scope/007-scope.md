# Project Layout #

The Projects section is the primary working area of wxKanban. It is where users create and manage projects, run the 6-phase quality lifecycle, track time, and collaborate with AI on task proposals and scope definition.

---

## Data Hierarchy ##

```text
Project
  └── Project Lifecycle Phase (6 phases, each assignable to a team member)
        └── Project Tasks (tasks scoped to a specific phase of a specific project)
        └── Specifications / Scopes (linked to Design phase, each with full lifecycle)
```

Tasks in wxKanban follow a standard structure — title, description/design notes, status, priority, issuetype, assignee — with additional fields: `projectid`, `phaseid`, `specid`, `assignedduty`, `nextduty`, `result`, `effort` to anchor each task to its phase and spec within a project.

---

## Schema (Current State) ##

### `projectphases` ###

```text
id              UUID PK
projectid       UUID FK → projects.id  ON DELETE CASCADE
phasename       VARCHAR(50)  -- 'Design', 'Implementation', 'QA', 'HumanTesting', 'Beta', 'Release'
status          VARCHAR(50)  -- 'pending', 'in_progress', 'complete', 'reopened'
assigneduserid  VARCHAR(100) NULLABLE  -- who owns this phase on this project
enteredat       TIMESTAMP NULLABLE
completedat     TIMESTAMP NULLABLE
reason          TEXT NULLABLE
createdat       TIMESTAMP
```

### `tasks` ###

```text
id              UUID PK
projectid       UUID FK → projects.id  ON DELETE CASCADE
phaseid         UUID FK → projectphases.id  ON DELETE SET NULL  NULLABLE
createdbyid     UUID FK → users.id  ON DELETE SET NULL  NULLABLE
assignedtoid    UUID FK → users.id  ON DELETE SET NULL  NULLABLE
specid          UUID FK → specifications.id  ON DELETE SET NULL  NULLABLE
sourcepmssystem VARCHAR(50)   -- 'jira', 'monday', 'asana', 'trello', NULL
externalid      VARCHAR(255)  -- e.g. JIRA-123
name            VARCHAR(255)  NOT NULL
description     TEXT
assignedduty    VARCHAR(255)  -- what the assignee should do
nextduty        VARCHAR(255)  -- what happens after task completes
issuetype       VARCHAR(50)   -- 'task', 'bug', 'feature'
priority        VARCHAR(50)   -- 'low', 'medium', 'high', 'critical'
duedate         DATE
status          VARCHAR(50)   -- 'open', 'in_progress', 'completed', 'orphaned'
result          VARCHAR(50)   -- 'pass', 'fail' (QA phase)
effort          VARCHAR(50)   -- 'small', 'medium', 'large', 'unknown'
sourceoforigin  VARCHAR(50)   -- 'external', 'internal', 'ai_proposed'
createdat       TIMESTAMP
updatedat       TIMESTAMP
```

### `taskdependencies` ###

```text
id           UUID PK
taskid       UUID FK → tasks.id  ON DELETE CASCADE
blockedbyid  UUID FK → tasks.id  ON DELETE CASCADE
createdat    TIMESTAMP
UNIQUE(taskid, blockedbyid)
```

### `specifications` (lifecycle-aware) ###

```text
id          UUID PK
projectid   UUID FK → projects.id  ON DELETE CASCADE
phaseid     UUID FK → projectphases.id  ON DELETE SET NULL  NULLABLE
specnumber  VARCHAR(10)  -- '001', '002', etc.
title       VARCHAR(255)
content     TEXT
status      VARCHAR(50)  -- see lifecycle values below
specorder   INTEGER
isoptional  BOOLEAN
createdbyid UUID FK → users.id
createdat   TIMESTAMP
approvedat  TIMESTAMP NULLABLE
updatedat   TIMESTAMP
```

**Spec lifecycle status values:**
`draft` → `in_review` → `pending_clarification` → `clarified` → `planned` → `tasks_generated` → `implemented` → `qa_passed` → `human_tested` → `beta_cleared` → `released` | `deferred`

### `scopeconversations` ###

```text
id        UUID PK
scopeid   UUID FK → specifications.id  ON DELETE CASCADE
role      VARCHAR(10)   -- 'user', 'assistant', 'system'
content   TEXT
createdat TIMESTAMP
```

AI chat history for scope clarification sessions, stored per spec.

### `projectdocuments` ###

```text
id          UUID PK (UUID v7)
projectid   UUID FK → projects.id  ON DELETE CASCADE
type        VARCHAR(50)   -- 'overview', 'readme', 'architecture'
title       VARCHAR(255)
content     TEXT
createdat   TIMESTAMP
updatedat   TIMESTAMP
createdbyid UUID FK → users.id
```

### `timeentries` ###

```text
id          UUID PK
taskid      UUID FK → tasks.id  ON DELETE CASCADE
projectid   UUID FK → projects.id  ON DELETE CASCADE
userid      UUID FK → users.id  ON DELETE CASCADE
companyid   UUID FK → companies.id  ON DELETE CASCADE
phaseid     UUID FK → projectphases.id  ON DELETE SET NULL  NULLABLE
starttime   TIMESTAMP
endtime     TIMESTAMP NULLABLE  (null = timer still running)
duration    INTEGER NULLABLE    (minutes; null while running)
billable    BOOLEAN
entryrate   NUMERIC(10,2)       (rate snapshot at creation)
notes       TEXT
invoiced    BOOLEAN
invoicedat  TIMESTAMP NULLABLE
createdat   TIMESTAMP
updatedat   TIMESTAMP
```

### `notifications` ###

```text
id          UUID PK
userid      UUID FK → users.id  ON DELETE CASCADE
type        VARCHAR(50)  -- see notification types below
entityid    UUID NULLABLE
entitytype  VARCHAR(50) NULLABLE  -- 'task', 'scope', 'phase'
message     TEXT
read        BOOLEAN
createdat   TIMESTAMP
```

**Notification types:** `task_assigned`, `task_due_tomorrow`, `phase_assigned`, `phase_tasks_complete`, `phase_advanced`, `scope_submitted`, `scope_approved`, `qa_fail_bug_created`, `task_approval_required`

---

## Project List Page (`/projects`) ##

### Visibility Rules ###

**ADMIN / TEAM_MANAGER users** see all projects in the company regardless of assignment or phase.

**TEAM_MEMBER** users only see projects where the currently active phase (`projectphases WHERE status='in_progress'`) has `assigneduserid = currentUser.id`.

**New Project** button is visible to ADMIN and TEAM_MANAGER users.

### Card Display ###

Each card shows:

- Project name
- Current phase badge (Design / Implementation / QA / Human Testing / Beta / Release)
- Assigned team member for current phase (avatar + name)
- Phase progress bar (1 of 6 through 6 of 6)
- Open task count for current phase
- Hours used vs. allocated (if `allocatedhours` is set)
- Connected PM systems (jira, monday, asana, trello icons)
- Last updated date

### Controls ###

- **New Project** button — ADMIN/MANAGER only, opens create project modal
- **Search** by project name
- **Sort** by last updated, created, or name (asc/desc toggle)

---

## Create / Edit Project Modal ##

**Implemented component**: `src/client/components/Projects/CreateProjectModal.tsx`

Fields:

- **Name** (required, VARCHAR 255)
- **Description** (optional, text)
- **Hourly Rate** (optional, numeric — for billing)
- **Allocated Hours** (optional, numeric)
- **PM System Links** (multi-select: jira, monday, asana, trello)
- **Security Classification** (optional: Internal / Confidential / Client-Facing)
- **Phase Assignments** — for each of the 6 phases, optionally select a team member from the company roster

On create: system auto-creates 6 `projectphases` records with `status='pending'` and the provided `assigneduserid` values (or null). Phase 1 is set to `status='in_progress'`. Response includes `scaffolding: 'pending'` — AI scaffolding runs asynchronously.

---

## Project Workspace (`/projects/:id`) ##

**Implemented page**: `src/client/pages/ProjectWorkspacePage.tsx`

Full-page view for a single project. ADMIN/MANAGER can access any project. Non-admin can only access projects currently in their assigned phase.

**Top bar**: Project name, current phase badge, back to list link, Edit project button (ADMIN only), Archive button (ADMIN only).

**Phase Tab Bar** (`PhaseTabBar.tsx`): Six tabs in order:

1. Design
2. Implementation
3. QA Testing
4. Human Testing
5. Beta Release
6. Release

Plus a **Scope Matrix** tab (cross-cutting view of all scopes across phases).

Each tab shows: phase name, assigned user avatar, status indicator (pending / active / complete / reopened). Active tab = current phase. Completed phases show checkmark. Pending future phases are muted.

**Phase Advance / Reopen controls** (ADMIN only):

- "Mark Phase Complete" — validates completion criteria, sets phase to 'complete', activates next phase, logs to `companyauditlogs`.
- "Reopen Phase" — returns a prior phase to 'in_progress'; does not destroy later phase work; logs reason.
- Phase cannot be skipped.

**Project Overview tab**: Displays `projectdocuments` of type 'overview' — AI-generated or manually authored overview doc. Editable by ADMIN.

---

## Phase Views (Implemented) ##

### Phase 1 — Design (`DesignPhaseView.tsx`) ###

- List of specification documents (`SpecList.tsx`) scoped to this project's Design phase
- Each spec: number, title, status badge, link to scope chat
- Scope chat per spec: AI clarification conversation stored in `scopeconversations`
- Create spec, edit spec, submit for review, approve spec
- Phase complete criteria: at least 1 spec with status ≥ 'approved' (implemented via completion check endpoint)

### Phase 2 — Implementation (`ImplementationPhaseView.tsx`) ###

- Task list (`TaskList.tsx`) for `phaseid = <implementation phase>`
- Each task: title, status, linked spec, priority, assignee, effort, time tracked
- Task fields: name, description, assignedduty, nextduty, issuetype, priority, effort, duedate, assignedtoid, specid
- Create task manually, from a spec, or accept AI-proposed tasks
- Task drawer (`TaskDrawer.tsx`) with tabs: details, notes, time, activity, dependencies
- Phase complete criteria: all tasks `status = 'completed'`

### Phase 3 — QA Testing (`QAPhaseView.tsx`) ###

- Task list for QA phase — test tasks
- Each task: title, linked spec, status, result (pass / fail)
- Failed tasks can auto-create bug tasks back in Implementation phase
- Phase complete criteria: all tasks `status = 'completed'` with `result = 'pass'`

### Phase 4 — Human Testing (`HumanTestingPhaseView.tsx`) ###

- Task list for human testing phase — feedback-driven tasks
- Each task: description, raised by, status (open / resolved / deferred)
- Resolved or deferred items can generate new specs (feeds back to Phase 1)
- Phase complete criteria: no tasks with `status = 'open'`

### Phase 5 — Beta Release (`BetaPhaseView.tsx`) ###

- Same task structure as Phase 4
- Task creation during Beta requires explicit ADMIN approval (logged to `companyauditlogs`, notification type `task_approval_required`)
- Phase complete criteria: all tasks resolved or deferred

### Phase 6 — Release (`ReleasePhaseView.tsx`) ###

- Release record: version number, release method, release date, release notes
- Cannot enter unless all prior phases complete
- Displays full lifecycle summary

### Scope Matrix View (`ScopeMatrixView.tsx`) ###

- Cross-phase view of all specifications and their lifecycle progression
- Shows each spec's current status across the full pipeline
- Filter and navigate to individual scope chat

### Scope Chat View (`ScopeChatView.tsx`) ###

- AI-assisted clarification chat per specification
- Stored in `scopeconversations`
- Export chat to markdown
- Split/refactor scope via AI suggestion

---

## Task Detail (Task Drawer) ##

**Implemented**: `TaskDrawer.tsx` + sub-tabs

| Tab | Component | Content |
| --- | --- | --- |
| Details | `TaskDrawer.tsx` | name, description, assignedduty, nextduty, status, priority, effort, duedate, issuetype, specid |
| Notes | `TaskDrawerNotes.tsx` | task-scoped notes |
| Time | `TaskDrawerTime.tsx` | time entries for this task, start/stop timer |
| Activity | `TaskDrawerActivity.tsx` | audit trail of changes |
| Dependencies | `TaskDrawerDeps.tsx` | blocked-by / blocking tasks via `taskdependencies` |

---

## Scope Lifecycle Routes (Implemented) ##

| Method | Route | Description |
| --- | --- | --- |
| GET | `/:id/scopes` | List all specs for project |
| GET | `/:id/scopes/matrix` | Scope matrix (all specs + phase status) |
| POST | `/:id/scopes` | Create spec |
| PATCH | `/:id/scopes/:scopeid` | Update spec |
| POST | `/:id/scopes/:scopeid/submit` | Submit spec for review |
| POST | `/:id/scopes/:scopeid/approve` | Approve spec (ADMIN) |
| PATCH | `/:id/scopes/:scopeid/status` | Update spec status |
| GET | `/:id/scopes/:scopeid/chat` | Get chat history |
| POST | `/:id/scopes/:scopeid/chat` | Post message to AI chat |
| POST | `/:id/scopes/:scopeid/chat/split` | AI-assisted scope split |
| GET | `/:id/scopes/:scopeid/chat/export` | Export chat as markdown |
| POST | `/:id/scopes/:scopeid/generate-tasks` | Generate tasks from spec (AI) |
| POST | `/:id/scopes/:scopeid/approve-tasks` | Accept AI-generated tasks |

---

## Full API Route Map ##

| Method | Route | Description |
| --- | --- | --- |
| GET | `/api/projects` | List projects (visibility-filtered) |
| POST | `/api/projects` | Create project (ADMIN) |
| GET | `/api/projects/:id` | Get project + phases |
| PATCH | `/api/projects/:id` | Update project (ADMIN) |
| POST | `/api/projects/:id/archive` | Archive project (ADMIN) |
| GET | `/api/projects/:id/phases` | List phases |
| PATCH | `/api/projects/:id/phases/:phaseid/assign` | Assign user to phase (ADMIN) |
| GET | `/api/projects/:id/phases/:phaseid/completion` | Check phase completion criteria |
| GET | `/api/projects/:id/phases/:phaseid/validate` | Alias for completion check |
| POST | `/api/projects/:id/phases/:phaseid/complete` | Alias for advance |
| POST | `/api/projects/:id/phases/:phaseid/advance` | Advance to next phase (ADMIN) |
| POST | `/api/projects/:id/phases/:phaseid/reopen` | Reopen phase (ADMIN) |
| GET | `/api/projects/:id/phases/:phaseid/tasks` | List phase tasks |
| POST | `/api/projects/:id/phases/:phaseid/tasks` | Create task in phase |
| PATCH | `/api/projects/:id/phases/:phaseid/tasks/:taskid` | Update task |
| GET | `/api/projects/:id/phases/:phaseid/specs` | List phase specs |
| POST | `/api/projects/:id/phases/:phaseid/specs` | Create spec in phase |
| PATCH | `/api/projects/:id/phases/:phaseid/specs/:specid` | Update spec |
| GET | `/api/projects/:id/documents` | List project documents |
| PATCH | `/api/projects/:id/documents/:docid` | Update document |
| GET | `/api/projects/:id/scaffold` | Pull scaffold data (project.init) |
| GET | `/api/projects/:id/tasks/:taskid` | Task detail |
| GET | `/api/projects/:id/tasks/:taskid/dependencies` | Task dependencies |
| PATCH | `/api/projects/:id/tasks/:taskid/status` | Update task status |
| GET | `/api/projects/:id/tasks/:taskid/time` | Time entries for task |
| POST | `/api/projects/:id/tasks/:taskid/time` | Create time entry |
| DELETE | `/api/projects/:id/tasks/:taskid/time/:entryid` | Delete time entry |
| GET/POST/PATCH | `/api/projects/:id/scopes/...` | Scope lifecycle (see table above) |

---

## Frontend Routes ##

| Route | Component |
| --- | --- |
| `/projects` | `ProjectListPage` |
| `/projects/:id` | `ProjectWorkspacePage` (defaults to current phase) |
| `/projects/:id/phase/:phaseSlug` | `ProjectWorkspacePage` with specific phase active |

Phase slugs: `design`, `implementation`, `qa`, `human-testing`, `beta`, `release`

---

## DB Tables Used ##

| Table | Status |
| --- | --- |
| `projects` | existing |
| `projectphases` | `assigneduserid` added |
| `tasks` | `phaseid`, `specid`, `assignedduty`, `nextduty`, `result`, `effort` added |
| `taskdependencies` | new table |
| `specifications` | full lifecycle status, `phaseid`, `specorder`, `isoptional`, `approvedat` added |
| `scopeconversations` | new table |
| `projectdocuments` | new table |
| `timeentries` | `phaseid`, `entryrate`, `invoiced`, `invoicedat` added |
| `notifications` | new table |
| `projectusers` | existing (team roster) |
| `companyauditlogs` | existing (phase transition logging) |

---

## AI Project Scaffolding (on Create) ##

When a new project is created, the system runs an AI scaffolding pass immediately after saving the DB record. Response includes `scaffolding: 'pending'` — scaffolding is async.

### Step 1 — Project Overview Generation ###

AI is called with: project name, description, tech stack (if provided), and domain/client context.

Output: `{ProjectName}-overview.md` stored in `projectdocuments` table with `type='overview'`. Content structure:

```text
# {ProjectName} — Overview
## What We Are Building
## Core Modules
## Target Users
## Integration Points
## Tech Stack
## Key Constraints
```

Editable by ADMIN in the Project Overview tab of the workspace.

### Step 2 — Spec Directory Scaffolding — **WITHDRAWN 2026-09-22** ###

> **This step no longer runs.** AI scaffolding stopped auto-generating scope stubs on
> 2026-09-22; SPEC-008 FR-008 is withdrawn (see its Clarification Q6). A new project is
> created with an **empty** scope list. Scopes are created only by an explicit act —
> `buildscope`, the web "new scope" action, an accepted feedback seed (SCOPE-043), or the
> bug-trapping install (SCOPE-063). The table below records what the withdrawn step used
> to produce; it is history, not behavior.

From the overview, AI generates numbered spec stubs in `specifications` with `status='draft'` linked to the Design phase.

Common auto-generated stubs:

| # | Module | Auto-generated when... |
| --- | --- | --- |
| 001 | Landing Page | project is client-facing or public |
| 002 | Authentication | always |
| 003 | Dashboard / Main App | always |
| 004+ | Project-specific modules | detected from description |

### Step 3 — DB Storage ###

| What | Table | Notes |
| --- | --- | --- |
| Project overview | `projectdocuments` | `type='overview'` |
| ~~Spec stubs~~ | ~~`specifications`~~ | **Withdrawn 2026-09-22** — nothing is written to `specifications` at project creation |

---

## Claude Code Project Initialization Command ##

### Command: `/project.init` ###

Stored as `.claude/commands/project.init.md`. When invoked by a developer:

1. Prompts for project ID or name (or reads from `.wxkanban-project` config file)
2. Calls `GET /api/projects/:id/scaffold` — returns overview, existing scopes, phase assignments (for a brand-new project the scope array is empty — see the withdrawal note on Step 2)
3. Creates local directory structure with `CLAUDE.md`, overview MD, and per-spec `scope.md` files
4. Generates project-scoped `CLAUDE.md` with: project name/ID/phase, team assignments, tech stack, current phase rules

### API Endpoint: `GET /api/projects/:id/scaffold` ###

Returns:

```json
{
  "project": { "id": "...", "name": "...", "description": "...", "currentphase": "..." },
  "overview": { "content": "..." },
  "specs": [{ "number": "...", "title": "...", "content": "..." }],
  "phases": [{ "phasename": "...", "status": "...", "assigneduser": { "fullname": "...", "email": "..." } }]
}
```

---

## Notes ##

- `projectusers` remains the roster (who is on the project). `projectphases.assigneduserid` is who owns the current phase — separate concerns.
- No external PM sync logic in this spec — handled by 003-PM-Integrations. This spec covers displaying synced and manual tasks.
- Invoice generation is in 005-Time-and-Billing.
- Security classification stored but not enforced at the route level in this scope.
- The `/project.init` command does NOT push local changes back to the DB — it is read-only pull. The DB is always the source of truth.
- `assigneduserid` in `projectphases` is stored as `VARCHAR(100)` (not UUID FK) to match the actual DB column type. Future migration should normalize to UUID FK.

---

## Project Detail Panel (Side Panel) ##

**Component**: `src/client/components/Projects/ProjectDetailPanel.tsx`

A collapsible side panel rendered on the Projects list page (`/projects`) that provides a quick-access summary of a single project without navigating away. The panel is phase-aware and renders different content depending on the project's current lifecycle phase.

### Panel Structure ###

```
ProjectDetailPanel
  └── Header (project name, phase badge, "Open" link, "All Projects" back button)
  └── Body (phase-specific content, scrollable)
        └── PhaseContent (router → DesignPanel | ImplementationPanel | QAPanel | ...)
              └── ExpandableScopeRow (per scope)
                    ├── ScopeHeader (specnumber, title, status badge — always visible)
                    └── Expanded content (documents, tasks)
```

### Scope Row — Documents Section ###

Each scope row expands to show document chips (one per `doctype`). Clicking a chip selects it as the "active doc" and reveals a detail row below the chips.

**Behavior by doctype:**

| doctype | Detail row rendered |
| --- | --- |
| `tasks` | `TaskStatsCard` — shows Total / Open / Closed counts; clicking opens `OpenTasksPopup` |
| all others | File button — shows document title + filepath; clicking opens `MarkdownEditorModal` |

### TaskStatsCard ###

Rendered when the **Tasks** chip is the active doc selection. Displays a 3-column stat grid:

| Column | Value | Color |
| --- | --- | --- |
| Total | All tasks for this scope | gray |
| Open | `status = 'open'` or `'in_progress'` | orange |
| Closed | `status = 'completed'` or `'dismissed'` | green |

The entire card is a button. Clicking it opens `OpenTasksPopup`.

While tasks are loading (fetched on first scope expand), a spinner is shown in place of the card.

### OpenTasksPopup ###

A minimalistic modal (`max-w-sm`) listing all open/in-progress tasks for the scope. Triggered by clicking `TaskStatsCard`.

- Header: CheckSquare icon + "Open Tasks" label + scope specnumber
- Body: scrollable list (`max-h-72`) of open tasks, each showing:
  - Status dot (color-coded)
  - Issue type icon (bug / feature / enhancement / task)
  - Task name (truncated)
  - Status label (right-aligned)
- Empty state: "No open tasks." centered italic text
- Dismiss: X button in header closes the popup

### Task Fetch Strategy ###

Tasks for a scope are fetched once on first expand via:

```
GET /api/projects/:projectId/scopes/:scopeId/tasks
```

Result is cached in component state (`scopeTasks`). A `fetchedRef` prevents duplicate fetches on re-expand. The same `scopeTasks` array is shared between `TaskStatsCard`, `OpenTasksPopup`, and the `TasksSection` (full task list below the documents section).
