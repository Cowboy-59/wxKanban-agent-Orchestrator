# Task and Lifecycle Management

A project in wxKanban is subdivided into **Scopes** — one per functional section. A project for an accounting system might have scopes for Chart of Accounts, Invoicing, Payroll, Reports, and Admin. Each scope independently moves through the 6-phase lifecycle. Task management is the engine that drives this: tasks are created from scopes, worked in phases, and phase advancement is gated by task completion.

This document defines how tasks and the lifecycle process operate across all scopes within a project.

> **Terminology note**: User-facing term is "scope." The DB table is `specifications`; `specid` FK on tasks maps to `specifications.id`. This is an internal naming detail only.

---

## Scope Naming Convention

Each scope in a project follows the pattern: `NNN-short-name`

- `NNN` = zero-padded integer (001, 002, ..., 099, 100...)
- `short-name` = kebab-case descriptor, as specific as needed

Examples:

- `001-authentication`
- `002-accounting`
- `003-accounting-invoices`
- `004-accounting-payroll`
- `005-reports`
- `006-admin`

The number is globally unique within the project and never reused. When a scope is split, the extracted content gets the next available number. The original scope keeps its number and name unchanged.

These numbers map directly to `specifications.number` in the DB and to the display label in the Scope Matrix view.

---

> Scope Chat (conversational scope creation, split detection, `scopeconversations` table) is defined in [009-scope-chat.md](009-scope-chat.md). Status: draft.

---

## Scope Lifecycle States

Each scope record has a `status` field that tracks its position in the pipeline:

| Status | Meaning |
|---|---|
| `draft` | AI stub or manually created — needs review |
| `in_review` | Submitted for approval |
| `pending_clarification` | Approver requested discussion or meeting before approving |
| `clarified` | Requirements confirmed — ready for planning |
| `planned` | Data model, API contracts, and design artifacts exist |
| `tasks_generated` | Implementation and QA tasks have been created |
| `implemented` | All Phase 2 (Implementation) tasks for this scope are complete |
| `qa_passed` | All Phase 3 (QA) test tasks for this scope passed |
| `human_tested` | All Phase 4 feedback items resolved or deferred |
| `beta_cleared` | All Phase 5 items resolved or deferred |
| `released` | Included in a Release record |

Transitions are triggered automatically when the relevant tasks complete. Manual override by ADMIN is allowed (with audit log entry).

### Scope Title Color by Status

Scope titles are color-coded everywhere they appear (Phase 1 list, Scope Matrix rows, phase view group headers):

| Status | Title color |
|---|---|
| `draft` | Blue |
| `in_review` | Amber/yellow |
| `clarified` | Default (neutral) |
| `planned` | Default (neutral) |
| `tasks_generated` | Default (neutral) |
| `implemented` | Green |
| `qa_passed` | Green |
| `human_tested` | Green |
| `beta_cleared` | Green |
| `released` | Muted/gray |
| `deferred` | Muted/gray italic |

Blue = needs attention (not yet discussed). Amber = awaiting approval. Green = milestone reached. Gray/muted = done or excluded.

---

## Phase Advancement Rules (per scope)

Phase advancement for a project is governed by scope completion across all scopes. A phase is **complete** when every active scope in the project satisfies the criteria for that phase:

| Phase | Criteria (all active scopes must meet) |
|---|---|
| Phase 1 — Design | At least 1 scope at `clarified` or later; no scope stuck in `draft` without an owner |
| Phase 2 — Implementation | All tasks for all scopes in status `completed` |
| Phase 3 — QA Testing | All QA tasks for all scopes completed with `result = pass` |
| Phase 4 — Human Testing | No tasks with `status = open` across all scopes |
| Phase 5 — Beta Release | No open tasks; any new tasks require ADMIN approval before creation |
| Phase 6 — Release | Release record exists with version, release method, and release notes |

ADMIN can mark a scope as **optional** (does not block phase advancement) or **deferred** (excluded from current release).

---

## Scope-to-Task Relationship

Each task is linked to exactly one scope via `specid` FK (nullable for tasks not tied to a scope). This link enables:

- Filtering tasks by scope within a phase view
- Tracking which scope owns the work
- Generating the per-scope completion status

When a new scope is created (AI-generated stub or manually), the system offers an **AI Task Generation** action. The AI analyzes the scope content and proposes:

- Implementation tasks for Phase 2 (each task = one deliverable unit of work)
- QA test tasks for Phase 3 (one test case per major requirement)

Proposed tasks require ADMIN or phase-assignee approval before they are created as real task records.

---

## Multi-Scope Project Management

### Scope Matrix View

Available from the project workspace as a tab alongside the phase view. Displays a matrix:

- **Rows** = Scopes (001-authentication, 002-billing... with title)
- **Columns** = Phases (Design to Release)
- **Cell** = status indicator: pending / active / complete / blocked / deferred

This gives the ADMIN a single-page view of overall project health — which scopes are ahead, which are blocking, and where attention is needed.

### Scope Grouping in Phase Views

In Phase 2-5 views, tasks are grouped by scope:

```text
> [001] Authentication (3 tasks, 1 complete)
  [ ] Implement JWT refresh token rotation
  [x] Set up bcrypt password hashing
  [ ] Build password reset flow

> [002] Billing (5 tasks, 0 complete)
  [ ] Stripe subscription setup
  ...
```

Collapsible per-scope groups. Completed scopes can be collapsed to reduce noise.

### Scope Priority and Ordering

Scopes have an `order` field (integer) that controls display order in the matrix and phase views. ADMIN can reorder scopes (drag or manual entry). Higher-priority scopes appear first and serve as a natural sequencing signal for the team.

---

## Task Detail View

Accessible by clicking any task in a phase view. Opens as a right-side drawer panel (does not navigate away from the phase view).

### Fields

| Section | Content |
|---|---|
| Header | Task title (editable inline), status badge, priority badge |
| Meta | Linked scope (clickable — opens scope), phase, project, created by, created at |
| Description | Markdown-capable text area with design notes |
| Status | Dropdown: open / in_progress / completed (Phase 3 also shows: pass / fail) |
| Priority | low / medium / high / critical |
| Issue Type | task / bug / feature |
| Assignee | Select from project team roster |
| Effort | small / medium / large / unknown |
| Due Date | Optional date picker |
| External Ref | Read-only if synced from PM system (e.g. JIRA-123) |

### Sub-panels (tabs within drawer)

**Activity** — Chronological log of all changes: status transitions, field edits, time entries, comments. Each entry shows: actor, timestamp, change description.

**Time** — List of time entries for this task. Shows: date, duration, billable flag, note. Running total at top. "Start timer on this task" button links workspace sidebar timer to this task.

**Dependencies** — Lists tasks this task blocks, and tasks blocking this task. Add/remove dependency links. A task with incomplete dependencies shows a "Blocked" badge in the phase view.

**Notes** — Free-form notes scoped to this task (separate from project-level notes).

---

## Task Status Workflows by Phase

Status transitions differ by phase to reflect each phase's purpose:

### Phase 2 — Implementation

```text
open -> in_progress -> completed
             |
         (re-open if needed)
```

Any team member can move their assigned task. ADMIN can move any task.

### Phase 3 — QA Testing

```text
open -> in_progress -> pass
                    -> fail -> (creates linked bug task in Phase 2 for the assigned scope)
```

When a QA task fails, the system automatically creates a new `bug` task in Phase 2 linked to the same scope with title prefixed `[QA Fail]`. The QA task remains `fail` until the bug task is completed and the QA task is re-run.

### Phase 4 — Human Testing

```text
open -> resolved
     -> deferred
     -> escalated (creates new scope at draft status for next release cycle)
```

### Phase 5 — Beta Release

Same as Phase 4. New task creation requires ADMIN approval — system prompts for confirmation before inserting the record, and logs the approval to `companyauditlogs`.

---

## Phase Completion Validation

When ADMIN clicks "Mark Phase Complete", the system runs a validation check before allowing the transition.

Validation checklist (shown to ADMIN before confirming):

- [ ] All tasks in this phase across all scopes are in a terminal status
- [ ] No tasks in `open` or `in_progress` state
- [ ] Phase 3 only: no tasks with `result = fail`
- [ ] Phase 4/5: no tasks with `status = open`
- [ ] All phase-required scopes are at or past the required scope status

If validation fails, ADMIN sees a list of blocking items with links to each. ADMIN cannot advance until resolved (or explicitly marks the blocking scope as `deferred`).

On success: phase `status` changes to `complete`, next phase `status` changes to `in_progress`, audit log entry written, in-app notification sent to next phase assignee.

---

## Scope Approval Workflow (Phase 1)

Scopes must be **approved** before Phase 1 can be marked complete.

- Any team member can submit a scope for review: `draft` to `in_review`
- ADMIN (or designated phase assignee) approves: `in_review` to `approved`
- Approval is logged to `companyauditlogs` (who approved, timestamp)
- Rejected scopes return to `draft` with a rejection note

Once a scope is `approved`, the AI task generation offer appears (if not already run).

---

## Notifications

In-app notifications (bell icon in header) for:

| Event | Recipients |
|---|---|
| Task assigned to you | Assignee |
| Task due date tomorrow | Assignee |
| Phase assigned to you | Phase assignee |
| All tasks complete in your phase | Phase assignee + ADMIN |
| Phase advanced to next phase | New phase assignee |
| Scope submitted for review | ADMIN + phase 1 assignee |
| Scope approved | Scope creator |
| QA task failed (new bug created) | Phase 2 assignee for that scope |
| New task requires approval (Phase 5) | ADMIN |

Email digest (daily, if enabled in settings): summary of your open tasks across all projects with due dates.

---

## DB Additions Required

### `specifications` — add `status` field

```sql
status  VARCHAR(50)  DEFAULT 'draft'
-- values: draft, in_review, clarified, planned, tasks_generated,
--         implemented, qa_passed, human_tested, beta_cleared, released
```

### `specifications` — add `specorder` field

```sql
specorder  INTEGER  DEFAULT 0  -- display/priority ordering within project
```

### `tasks` — add `specid` field (scope link)

```sql
specid  UUID  FK -> specifications.id  NULLABLE  ON DELETE SET NULL
-- Links a task to its parent scope. Nullable for tasks not tied to a specific scope.
```

### New table — `taskdependencies`

```sql
id          UUID PK
taskid      UUID FK -> tasks.id  ON DELETE CASCADE
blockedbyid UUID FK -> tasks.id  ON DELETE CASCADE
createdat   TIMESTAMP
```

---

## Routes Required

| Route | Component | Notes |
|---|---|---|
| `/projects/:id/scopes` | Scope matrix view | All scopes x all phases |
| `/projects/:id/phase/:slug?task=:taskId` | Task detail drawer | Deep-link to task within phase view |

---

## Project Card Display (Project List & Admin Dashboard)

Each project card in the list and admin dashboard surfaces lifecycle progress without requiring the user to open the project.

### Phase Display Names

Internal phase values (stored in `projects.currentphase`) map to human-readable labels everywhere they are shown in the UI:

| DB value | Display label |
|---|---|
| `Design` | Design |
| `Implementation` | Implementation |
| `QA` | QA Testing |
| `HumanTesting` | Human Testing |
| `Beta` | Beta Release |
| `Release` | Release |

### Project List Card — Required Fields

| Field | Source | Display |
|---|---|---|
| Phase label | `projects.currentphase` → display map | Colored badge |
| Days in phase | `projectphases.enteredat` (active phase) | "Day N" next to badge |
| Task completion | `tasks` COUNT grouped by phase | "M / N tasks completed" + progress bar |
| Phase assignee | `projectphases.assigneduserid` → user | Avatar + name |
| Last updated | `projects.updatedat` | Relative time ("2h ago") |

### Task Completion Query

`currentphasetotal` and `currentphasecompleted` are computed in `ProjectService.buildProjectCards()`:

```sql
SELECT tasks.projectid, projectphases.phasename,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE tasks.status = 'completed') AS completed
FROM tasks
INNER JOIN projectphases ON tasks.phaseid = projectphases.id
WHERE tasks.projectid IN (:ids)
GROUP BY tasks.projectid, projectphases.phasename
```

Only the current phase's stats are exposed on `ProjectCard`. The project detail/workspace page handles per-scope breakdown.

### Admin Dashboard — Project Overview Cards

The admin dashboard shows all 6 phases per project card:

- Phases before `currentphase`: `✓ Complete`
- `currentphase`: task count ("N tasks · M completed") or "In Progress" if no tasks yet
- Phases after `currentphase`: `Not Started`

---

## Notes

- Scope ordering (`specorder`) is the primary tool for sequencing work. Teams should order scopes to front-load foundation work (auth, DB schema) before dependent features.
- The QA fail to bug creation flow is automatic but the resulting bug task is created as `open` and requires manual assignment. Do not auto-assign to the original implementer.
- Phase 5 new task approval is logged but does not require a secondary approval UI — ADMIN confirming the modal is sufficient. The audit log is the record.
- "Deferred" scopes do not block phase advancement but do appear in the Scope Matrix with a `deferred` badge. They accumulate for the next release cycle.
- AI task generation is idempotent: if run twice on the same scope, the second run proposes only tasks that don't already exist (matched by title similarity). ADMIN reviews before any are created.
- Scope Chat and split detection workflow: see [009-scope-chat.md](009-scope-chat.md).
