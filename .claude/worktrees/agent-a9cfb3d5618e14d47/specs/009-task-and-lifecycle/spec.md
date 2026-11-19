# Feature Specification: Task and Lifecycle Management

**Feature Branch**: `009-task-and-lifecycle`
**Created**: 2026-02-21
**Status**: Draft
**Source Scope**: `specs/Project-Scope/008-scope.md`, `specs/Project-Scope/009-scope-chat.md`

---

## User Scenarios & Testing _(mandatory)_

### Primary User Story

A project ADMIN creates a new project and divides it into named **scopes** (e.g., `001-authentication`, `002-billing`). Each scope independently progresses through six lifecycle phases — Design, Implementation, QA, Human Testing, Beta, and Release. The ADMIN can open any scope in a conversational AI chat to collaboratively write its requirements, then finalize and approve it before implementation tasks are generated. Team members work tasks linked to scopes, and the ADMIN monitors overall project health via a Scope Matrix that shows every scope's status across every phase.

### Acceptance Scenarios

1. **Given** a new project exists, **When** the ADMIN creates a scope named `001-authentication`, **Then** the scope appears with status `draft` and a blue title indicator.

2. **Given** a scope is in `draft` status, **When** the ADMIN opens it and clicks "Discuss this scope", **Then** a split-panel view opens with an AI chat on the left and a live-editable scope document on the right.

3. **Given** a Scope Chat session is active, **When** the AI identifies a distinct sub-feature (e.g., invoicing within an accounting scope), **Then** the AI proposes splitting it, and if accepted, a new `draft` scope is created with the extracted content and the original scope is updated.

4. **Given** a scope chat is complete, **When** the ADMIN clicks "Finalize Scope", **Then** the scope status moves to `clarified` and the chat is locked for further AI messages.

5. **Given** a scope is `clarified`, **When** any user with edit access modifies the scope content, **Then** the status automatically reverts to `draft`, requiring re-finalization.

6. **Given** a scope is `in_review`, **When** the Phase 1 assignee (or ADMIN) approves it, **Then** status moves to `clarified` (the approved state) and AI task generation is offered.

7. **Given** generated tasks are approved, **When** all Phase 2 implementation tasks for a scope are completed, **Then** the scope status advances to `implemented`.

8. **Given** a QA task fails, **When** the tester marks it as failed, **Then** a linked `[QA Fail]` bug task is automatically created in Phase 2 for the same scope.

9. **Given** the ADMIN opens the Scope Matrix view, **When** the page loads, **Then** a grid shows all scopes as rows and all phases as columns, with a status indicator in each cell.

10. **Given** a scope is in `in_review` status, **When** the approver chooses "Request a meeting", **Then** the scope enters `pending_clarification` hold state and no tasks can be generated until resolved.

### Edge Cases

- What happens when a scope has no tasks? The scope cannot advance past `tasks_generated` — it must have at least one task created and approved.
- What if the AI proposes a split but the user declines? The AI records the decision and never re-suggests the same split.
- What if a scope is marked `deferred`? It no longer blocks phase advancement but remains visible in the Scope Matrix with a muted indicator.
- What if the ADMIN tries to mark a phase complete with open tasks? The system shows a blocking checklist of unresolved items and prevents advancement until they are resolved or the blocking scope is marked `deferred`.

---

## Requirements _(mandatory)_

### Functional Requirements — Scope Management

- **FR-001**: System MUST support naming scopes using a zero-padded number prefix and a kebab-case short name (e.g., `001-authentication`, `003-accounting-invoices`). Numbers must be globally unique within a project and never reused.
- **FR-002**: System MUST track each scope through lifecycle states: `draft`, `in_review`, `pending_clarification`, `clarified`, `planned`, `tasks_generated`, `implemented`, `qa_passed`, `human_tested`, `beta_cleared`, `released`, and `deferred`.
- **FR-003**: System MUST display scope titles with color coding by status: blue for `draft`, amber for `in_review`, green for milestone states (`implemented`, `qa_passed`, `human_tested`, `beta_cleared`), muted/gray for `released` and `deferred`.
- **FR-004**: ADMIN MUST be able to set a boolean `optional` flag on a scope (stored as `isoptional` column — does not block phase advancement regardless of lifecycle status). `deferred` remains a lifecycle status value (scope excluded from current release). A scope can be `optional=true` while still having any lifecycle status.
- **FR-005**: System MUST allow ADMIN to reorder scopes within a project, with order persisted and used as the display sequence in all views.
- **FR-006**: State transitions MUST be triggered automatically when relevant tasks complete; ADMIN may manually override with an audit log entry.

### Functional Requirements — Scope Chat (AI-Assisted)

- **FR-007**: System MUST provide a split-panel Scope Chat interface accessible by clicking "Discuss this scope" on any `draft` scope.
- **FR-008**: The AI MUST receive full project context before the first message: the project overview document, all existing scopes (number, title, content), the current scope stub, and phase assignments.
- **FR-009**: The left panel MUST be a chat interface for AI-driven conversation; the right panel MUST be a fully editable Markdown preview of the scope document, editable at all times without a mode switch.
- **FR-010**: The AI MUST write to the scope document in real time (token-by-token streaming). The section currently being written MUST be temporarily locked for user editing, with a visual indicator (blinking cursor and subtle highlight). All other sections remain editable.
- **FR-011**: If a user clicks into a section the AI is streaming to and begins typing, the AI MUST immediately stop writing to that section and release the lock. The user's input takes priority; the AI may leave the section partially written.
- **FR-012**: On desktop, panels MUST be separated by a draggable divider defaulting to 50/50 split, with a minimum panel width of 320px. The divider position MUST be saved per user. On mobile, panels MUST stack vertically (chat above, preview below) with no tab switching.
- **FR-013**: A "Export conversation" button MUST allow exporting the full chat transcript in Markdown (default) or plain text, including all turns with role labels and timestamps.

### Functional Requirements — Scope Split Detection

- **FR-014**: The AI MUST monitor conversations for split signals: (a) a distinct user-facing module emerges, (b) estimated task count exceeds ~15, (c) the area logically belongs to a different phase assignee, or (d) the area belongs to a different delivery timeline.
- **FR-015**: When a split signal is detected, the AI MUST ask once per topic area: "This area — [topic] — looks like it could stand alone as its own scope. Suggested name: `NNN-short-name`. Should I split it out?"
- **FR-016**: If the user confirms a split, the system MUST: extract the relevant content from the current scope, create a new scope record with the next available number and extracted content at `draft` status, update the current scope to remove the extracted content, and post a single notification in chat. The conversation continues without pause.
- **FR-017**: If the user declines a split, the AI MUST record the decision and MUST NOT re-suggest the same split again.

### Functional Requirements — Scope Finalization and Approval

**Approval model**: Two distinct gates. Gate 1 — any team member submits the scope for review (`draft → in_review`). Gate 2 — the Phase 1 assignee or ADMIN approves (`in_review → clarified`). Scope Chat is optional tooling used during the `draft` stage. `clarified` IS the approved state — there is no separate `approved` status.

- **FR-018**: Clicking "Finalize Scope" in the Scope Chat MUST submit the scope for review, moving status from `draft` to `in_review`. Any team member may do this. If the scope has never been through Scope Chat, a manual "Submit for Review" button on the scope record performs the same transition.
- **FR-019**: Before the `draft → in_review` transition is allowed, the system MUST run a conflict check against all other project scopes (functional overlap, contradictory data model ownership, missing integration dependencies). Detected conflicts MUST be shown to the submitter before submission is confirmed. Submitter may acknowledge and override; override is logged to `companyauditlogs`.
- **FR-020**: If scope content is edited after reaching `in_review` or `clarified` status by any user with edit access, the status MUST automatically revert to `draft` without notification (the revert is visible in the scope list and audit log).
- **FR-021**: The Phase 1 assignee or ADMIN reviews scopes in `in_review` state. The reviewer MUST have three actions: (a) **Approve** — moves status to `clarified`, logged to `companyauditlogs`, scope creator notified; (b) **Request changes** — reverts to `draft` with a rejection note, scope creator notified; (c) **Request clarification** — either reopens Scope Chat with a note (status stays `in_review`) or requests a meeting (status moves to `pending_clarification`, blocking further progression until ADMIN resolves).
- **FR-022**: All active scopes MUST be at `clarified` or later before Phase 1 can be marked complete. AI task generation is offered once a scope reaches `clarified`.

### Functional Requirements — Task Management

- **FR-023**: Each task MUST be linkable to exactly one scope. Tasks not tied to a scope are permitted (nullable scope link).
- **FR-024**: When a scope is approved, the system MUST offer AI task generation. The AI analyzes scope content and proposes implementation tasks (Phase 2) and QA test tasks (Phase 3). Proposed tasks require ADMIN or phase-assignee approval before creation.
- **FR-025**: AI task generation MUST be idempotent: re-running on the same scope proposes only tasks that don't already exist (matched by title similarity).
- **FR-026**: Tasks MUST support the following fields: title, description (Markdown), status, priority (low/medium/high/critical), issue type (task/bug/feature), assignee, effort (small/medium/large/unknown), due date, and external reference (read-only when synced from PM system).
- **FR-027**: The task detail view MUST open as a right-side drawer (without navigating away from the phase view) and include sub-panels for Activity log, Time entries, Dependencies, and Notes.
- **FR-028**: Tasks MUST support dependency links: a task can block other tasks or be blocked by other tasks. Tasks with incomplete dependencies MUST display a "Blocked" badge in the phase view.
- **FR-029**: In Phase 2 (Implementation), task statuses MUST be: `open → in_progress → completed` (with ability to re-open).
- **FR-030**: In Phase 3 (QA Testing), task statuses MUST be: `open → in_progress → pass` or `fail`. A `fail` result MUST automatically create a linked `[QA Fail]` bug task in Phase 2 for the same scope, assigned as `open` (no auto-assignment to original implementer).
- **FR-031**: In Phase 4 (Human Testing), task statuses MUST be: `open → resolved`, `deferred`, or `escalated`. An `escalated` status MUST create a new `draft` scope stub containing: the task title as the scope name candidate, the task description as the scope body, and a header note "Escalated from Phase 4 of [project name] on [date]." ADMIN assigns the scope number and finalizes it in the next release cycle. The escalated task's status remains `escalated`.
- **FR-032**: In Phase 5 (Beta), creating new tasks MUST require ADMIN confirmation (logged to audit log). Status transitions are the same as Phase 4.
- **FR-033**: Tasks in Phase 2 and above MUST be grouped by scope in all phase views, with each group showing scope number, scope name, task count, and completion count. Groups MUST be collapsible.

### Functional Requirements — Phase Advancement

- **FR-034**: A phase is complete when all active scopes satisfy its criteria: Phase 1 requires at least one scope at `clarified` or later and no `draft` scope with a null `createdbyid` (i.e., every draft scope must have a creator/owner); Phase 2 requires all tasks completed; Phase 3 requires all QA tasks at `pass`; Phases 4 and 5 require no `open` tasks; Phase 6 requires a Release record.
- **FR-035**: When ADMIN clicks "Mark Phase Complete", the system MUST run a validation checklist and show all blocking items with links before allowing the transition.
- **FR-036**: On successful phase completion, the current phase status MUST change to `complete`, the next phase MUST change to `in_progress`, an audit log entry MUST be written, and the next phase assignee MUST receive an in-app notification.

### Functional Requirements — Scope Matrix View

- **FR-037**: A Scope Matrix view MUST be available from the project workspace as a tab alongside the phase view.
- **FR-038**: The matrix MUST display scopes as rows and phases as columns. Each cell MUST show a status indicator: pending, active, complete, blocked, or deferred.

### Functional Requirements — Notifications

- **FR-039**: In-app notifications (bell icon) MUST be sent for: task assigned to user, task due tomorrow, phase assigned to user, all tasks complete in a phase, phase advanced, scope submitted for review, scope approved, QA task failure (new bug created), new task requires approval (Phase 5).
- **FR-040**: A daily email digest MUST summarize open tasks across all projects with due dates (when email digest is enabled in user settings).

### Access Control Requirements

- **FR-041**: Scope Chat MUST be accessible only to the Phase 1 assignee and ADMIN. Other project members may read the conversation history and leave threaded comments on individual turns. Non-project users have no access.
- **FR-042**: The scope preview panel in Scope Chat is editable only by the Phase 1 assignee and ADMIN.

<<<<<<< HEAD
### Functional Requirements — Phase Assignment Management

- **FR-043**: ADMIN MUST be able to reassign any phase owner from the Project Edit modal. The modal MUST display all six phases (Design, Implementation, QA, Human Testing, Beta, Release) with dropdown selectors showing current assignees and available team members.

- **FR-044**: TEAM_MANAGER MUST be able to reassign phases where they are the current assignee. They MUST NOT be able to reassign phases assigned to other team members.

- **FR-045**: When a phase is reassigned, the new assignee MUST receive an in-app notification with the project name, phase name, and who made the assignment.

- **FR-046**: All phase reassignments MUST be logged to `companyauditlogs` with action type `phase_reassigned`, including the previous assignee, new assignee, phase name, and project ID.

- **FR-047**: The Project Edit modal MUST display the current phase assignee for each phase, showing their full name and email address.

- **FR-048**: Phase reassignment MUST be immediate upon saving the project edit form. The system MUST call `PATCH /api/projects/:id/phases/:phaseid/assign` for each changed phase assignment.

### Key Entities _(include if feature involves data)_


=======
### Key Entities _(include if feature involves data)_

>>>>>>> origin/014-sysadmin-platform-admin
- **Scope (specifications)**: A named section of a project that passes through all six lifecycle phases. Has a unique number, short name, Markdown body content, status, display order, and links to tasks.
- **Scope Conversation (scopeconversations)**: A single turn in the Scope Chat. Belongs to one scope. Has a role (user or assistant), content, and timestamp. Deleted when the scope is deleted.
- **Task**: A unit of work linked to a scope and a lifecycle phase. Has title, description, status, priority, issue type, assignee, effort, due date, and optional PM system reference.
- **Task Dependency (taskdependencies)**: A directed blocking relationship between two tasks. A task may have zero or more blocking dependencies; a task may block zero or more other tasks.
- **Project Phase**: One of six named phases in the project lifecycle. Has an assigned team member, current status, and completion timestamp.

---

## Review & Acceptance Checklist

### Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

### Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

---

## Clarifications

### Session 2026-02-21

**Q1 — Approval flow model (affects lifecycle states and data model)**
Chosen: Two distinct gates. Gate 1: any member submits (`draft → in_review`). Gate 2: Phase 1 assignee/ADMIN approves (`in_review → clarified`). Scope Chat is optional tooling within the `draft` stage. `clarified` IS the approved state — no separate `approved` status. Applied to FR-018–FR-022, Acceptance Scenario 6.

**Q2 — `optional` flag representation (affects DB schema)**
Chosen: Boolean `isoptional` column on `specifications`. A scope can be `optional=true` with any lifecycle status. `deferred` remains a lifecycle status value. Applied to FR-004.

**Q3 — "Owner" definition for Phase 1 gate (affects validation logic)**
Chosen: Owner = `createdbyid` (scope creator). No new column. Phase 1 gate: no `draft` scope with null `createdbyid`. Applied to FR-034.

**Q4 — Escalated scope stub content (affects auto-creation logic)**
Chosen: Stub contains task title as scope name candidate, task description as body, header note "Escalated from Phase 4 of [project name] on [date]." ADMIN assigns number and finalizes. Applied to FR-031.

---

## Execution Status

- [x] User description parsed
- [x] Key concepts extracted
- [x] Ambiguities marked
- [x] User scenarios defined
- [x] Requirements generated
- [x] Entities identified
- [x] Review checklist passed
