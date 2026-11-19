# Feature Specification: Project Layout & Lifecycle Workspace

**Feature Branch**: `008-007-project-layout`
**Created**: 2026-02-21
**Status**: Draft
**Scope Reference**: `specs/007-Project-layout/scope.md`

---

## User Scenarios & Testing

### Primary User Story

As a company admin, I need a Projects section where I can create projects, assign team members to each lifecycle phase, and track work progressing through a structured 6-phase quality workflow — so that every deliverable goes through design, implementation, QA, human testing, beta, and release in a controlled, auditable way.

As a team member, I need to see only the projects where it is currently my turn to work — so I am not distracted by projects outside my responsibility and can focus on my active phase tasks.

### Acceptance Scenarios

**Project List — ADMIN visibility**
1. **Given** I am logged in as ADMIN, **When** I navigate to `/projects`, **Then** I see all projects belonging to my company regardless of which phase they are in.

**Project List — Team member visibility**
2. **Given** I am logged in as a TEAM_MEMBER, **When** I navigate to `/projects`, **Then** I see only projects where the currently active phase has me assigned as the responsible user.
3. **Given** I am a TEAM_MEMBER assigned to Phase 2 on Project A, **When** Project A advances to Phase 3 and I am not assigned to Phase 3, **Then** Project A disappears from my project list.

**Project Creation**
4. **Given** I am ADMIN, **When** I create a new project with a name and description, **Then** the system creates 6 lifecycle phase records and triggers AI to generate a project overview document. ~~and generates numbered specification stubs for common modules (landing page, auth, dashboard) and any project-specific modules detected from the description~~ — **withdrawn 2026-09-22, see Clarification Q6.** A new project starts with zero scopes.
5. **Given** a new project is created, **When** AI scaffolding completes, **Then** Phase 1 (Design) is set as active and all 6 phase records exist with status `pending` except Phase 1 which is `in_progress`.

**Phase Workspace**
6. **Given** I open a project, **When** I view the Phase Tab Bar, **Then** I see all 6 phases in order with visual indicators: completed phases show a checkmark, the active phase is highlighted, pending phases are muted, reopened phases show a reopen indicator.
7. **Given** I am ADMIN viewing an active phase, **When** all phase completion criteria are met, **Then** the "Mark Phase Complete" button is enabled and I can advance to the next phase.
8. **Given** a phase is marked complete, **When** the transition occurs, **Then** the next phase activates, the transition is logged with timestamp and reason, and the previously assigned user loses visibility of the project if not assigned to the new phase.

**Phase Assignment**
9. **Given** I am ADMIN creating or editing a project, **When** I assign a team member to a specific phase, **Then** that user becomes responsible for that phase on that project and will see the project in their list when that phase is active.
10. **Given** the same user (Alice) is assigned to Phase 2 on Project A and Phase 3 on Project B, **When** both phases are active simultaneously, **Then** Alice sees both projects in her list.

**Task Management**
11. **Given** I am viewing Phase 2 (Implementation) of a project, **When** I create a task, **Then** the task is scoped to Phase 2 and appears only in the Phase 2 task list, not in other phases.
12. **Given** I am viewing a phase, **When** I accept an AI-proposed task, **Then** the task is created in Phase 2 (Implementation) marked as AI-proposed.

**AI Scaffolding**
13. **Given** a project has just been created, **When** AI scaffolding completes, **Then** a project overview document is visible in the "Overview" tab of the project workspace, editable by ADMIN.
14. ~~**Given** the overview is generated, **When** I view Phase 1 (Design), **Then** I see numbered draft specification stubs (001-Landing Page, 002-Authentication, 003-Dashboard, and any project-specific modules) ready for review and expansion.~~ **WITHDRAWN 2026-09-22 (Clarification Q6).** Replaced by: **Given** the overview is generated, **When** I view Phase 1 (Design), **Then** I see an empty scope list until a scope is created by an explicit act (`buildscope`, the web "new scope" action, or an accepted feedback seed).

**Claude Code Init Command**
15. **Given** a developer opens the project directory in VSCode with Claude Code, **When** they run `/project.init`, **Then** the command fetches project data from the wxKanban API, creates a local directory structure with the overview MD, numbered scope.md files, and a project-scoped CLAUDE.md.
16. **Given** a `.wxkanban-project` config file exists in the working directory, **When** a new Claude Code session starts, **Then** the session startup hook displays the current project phase, open task count, and assigned team member for the active phase.

### Edge Cases

- What happens when no team member is assigned to the next phase when advancing? The phase becomes active but unassigned — ADMIN sees a warning indicator and the project is only visible to ADMIN until a user is assigned.
- What happens if AI scaffolding fails after project creation? The project is saved; the overview is left empty with a retry option visible to ADMIN. (Spec stubs no longer form part of scaffolding — Clarification Q6.)
- What happens when a non-admin tries to access a project URL they are not assigned to? System returns 403 and redirects to their project list.
- Can a phase be advanced if tasks exist with open or in-progress status? No — all tasks must be completed before a phase can be marked complete (Design exception: at least one spec must be approved).
- What if the same user is assigned to multiple phases of the same project? Allowed — they see the project during each of their active assigned phases.

---

## Requirements

### Functional Requirements

**Project List**
- **FR-001**: System MUST display a project list page at `/projects` showing all company projects to ADMIN users.
- **FR-002**: System MUST display to non-admin users only projects where the authenticated user is assigned as the responsible user for the currently active phase.
- **FR-003**: System MUST show on each project card: name, current phase badge, assigned user for active phase, phase progress (N of 6), open task count, last updated date.
- **FR-004**: System MUST restrict the "New Project" button to ADMIN users only.

**Project Creation**
- **FR-005**: System MUST allow ADMIN to create a project with: name (required), description, hourly rate, allocated hours, PM system links, security classification, and per-phase team member assignments.
- **FR-006**: System MUST auto-create exactly 6 lifecycle phase records on project creation, with Phase 1 set to `in_progress` and phases 2-6 set to `pending`.
- **FR-007**: System MUST trigger AI to generate a project overview document immediately after project creation and store it in the database linked to the project.
- **FR-008**: ~~System MUST trigger AI to generate numbered specification stubs for common modules and project-specific modules as draft specifications linked to the Design phase.~~ **WITHDRAWN 2026-09-22 — see Clarification Q6.** Superseded by: System MUST NOT auto-create scopes on project creation. A new project starts with an empty scope list; scopes are created only by an explicit act.

**Project Workspace**
- **FR-009**: System MUST provide a project workspace at `/projects/:id` with a 6-tab phase navigation bar, sidebar (notes, time tracker, AI proposals), and a top bar with project metadata.
- **FR-010**: System MUST return 403 when a non-admin user attempts to access a project workspace where they are not assigned to the currently active phase.
- **FR-011**: System MUST display phase tabs with state indicators: completed (checkmark), active (highlighted), pending (muted), reopened (indicator).
- **FR-012**: System MUST allow ADMIN to advance a project to the next phase only when current phase completion criteria are met.
- **FR-013**: System MUST prevent phase skipping — phases must complete sequentially.
- **FR-014**: System MUST allow ADMIN to reopen a prior phase without destroying work in later phases, requiring a reason, and logging the event.
- **FR-015**: System MUST log all phase transitions (source phase, target phase, timestamp, initiating user, reason) to the company audit log.

**Phase-Scoped Task Management**
- **FR-016**: System MUST scope tasks to a specific phase — tasks created in one phase are visible only in that phase's view.
- **FR-017**: System MUST allow users to create tasks with: title, description, status, priority, issue type (task/bug/feature), and assignee.
- **FR-018**: System MUST track task status through: open, in_progress, completed, orphaned.
- **FR-019**: System MUST allow AI-proposed tasks to be accepted (creating a task in Phase 2 marked AI-proposed) or dismissed (soft-deleted, preserved for audit).
- **FR-020**: System MUST display cumulative time tracked per task within the phase view.

**Phase-Specific Views**
- **FR-021**: Phase 1 (Design) MUST display specification documents with number, title, status (draft/review/approved), and support inline creation and editing.
- **FR-022**: Phase 2 (Implementation) MUST display tasks scoped to the implementation phase with linked spec reference, priority, assignee, and time tracked.
- **FR-023**: Phase 3 (QA Testing) MUST display test tasks with pass/fail result tracking per task.
- **FR-024**: Phase 4 (Human Testing) MUST display feedback-driven tasks with the ability to promote resolved items into new specification documents.
- **FR-025**: Phase 5 (Beta) MUST require ADMIN approval for any new task creation during beta, with each approval logged to the audit log.
- **FR-026**: Phase 6 (Release) MUST be blocked unless all prior phases show complete status, and MUST capture version number, release method, release date, and release notes.

**AI Project Overview**
- **FR-027**: System MUST display the AI-generated project overview in an "Overview" tab within the project workspace.
- **FR-028**: System MUST allow ADMIN to edit the project overview document.

**Claude Code Integration**
- **FR-029**: System MUST provide a `/project.init` Claude Code command that calls `GET /api/projects/:id/scaffold` and creates a local directory structure: project overview MD, numbered scope.md files per spec stub, and a project-scoped CLAUDE.md containing phase assignments, tech stack, and current phase context.
- **FR-030**: System MUST expose `GET /api/projects/:id/scaffold` returning project metadata, overview content, spec stub content, and phase assignments with assigned user names.
- **FR-031**: System MUST provide a Claude Code session startup hook that reads `.wxkanban-project` and displays current project phase, open task count, and active phase assignee at session start.

### Key Entities

- **Project**: A client project or internal initiative. Has name, description, billing rate, allocated hours, PM system connections, security classification, current phase, and belongs to a company.
- **Project Phase**: One of 6 sequential lifecycle phases per project. Has status (pending/in_progress/complete/reopened), an assigned responsible team member, entry/exit timestamps, and reopen reason. A user's phase assignment determines their project list visibility.
- **Project Task**: A unit of work scoped to a specific phase within a project. Has title, description/design notes, status, priority, issue type, assignee, and source (manual/AI-proposed/external PM sync). Linked to both project and phase.
- **Project Document**: A rich-text document attached to a project (type: overview/readme/architecture). Auto-generated by AI on project creation; editable by ADMIN. Stored in the database, not the filesystem.
- **Specification Stub**: A draft specification auto-generated by AI at project creation for each detected module. Linked to the project's Design phase. Has a sequential number (001, 002...) and pre-populated scope content.
- **Phase Transition Log**: Audit record of every phase advance or reopen: project, from-phase, to-phase, timestamp, initiating user, reason.

---

## Success Criteria

- An ADMIN can create a project and have AI-generated overview and spec stubs available within 30 seconds.
- A TEAM_MEMBER's project list shows only projects where it is currently their assigned phase — no noise from other projects.
- No project can reach Phase 6 (Release) with any prior phase in incomplete or open status.
- A developer running `/project.init` receives a fully scaffolded local workspace (CLAUDE.md, overview.md, specs/ directories) in one command.
- Every phase transition is logged with full metadata. Every Beta modification approval is logged.

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

**Q4 — TEAM_MANAGER Permissions**
TEAM_MANAGER has elevated authority over projects they are assigned to, but not global access. Specifically:
- Can advance or reopen phases on projects where they are the assigned phase lead
- Can create, edit, and assign tasks within their assigned phase
- Cannot create new projects, archive projects, or assign other users to phases (those are ADMIN-only)
- Project list visibility follows the same rule as TEAM_MEMBER: sees only projects where they are the current phase lead

Applied to: FR-004 (New Project = ADMIN only), FR-012 and FR-014 (phase advance/reopen = ADMIN or TEAM_MANAGER if assigned), FR-005 (create project = ADMIN only). All references to "ADMIN only" for phase controls updated to "ADMIN or assigned TEAM_MANAGER."

---

**Q3 — Phase Completion Enforcement**
The system enforces phase completion criteria automatically and strictly. The "Mark Phase Complete" button is disabled until all criteria pass. A checklist below the button shows each criterion with pass/fail status in real-time (e.g., "3 tasks still open", "0 specs approved"). ADMIN cannot advance until every criterion is met — no override or bypass. This is a hard gate.

Applied to: FR-012, Acceptance Scenario 7. Updates FR-012 to: "System MUST disable the phase advance action and display a blocking criteria checklist until all completion criteria for the current phase are met."

---

**Q2 — AI Scaffolding Timing**
AI overview and spec stub generation is asynchronous. The project record saves immediately and the user is redirected to the new project workspace. The Overview tab and Phase 1 Design view show skeleton/loading states while AI completes in the background. UI updates when content is ready — no page refresh required. If AI fails, a retry option appears for ADMIN.

Applied to: FR-007, FR-008, Acceptance Scenario 4 & 5 (stubs "appear" asynchronously, not on redirect).

> **Superseded in part, 2026-09-22 (Q6):** the spec-stub half of this answer no longer applies. Only the overview is generated asynchronously.

---

**Q6 — Auto-generated scope stubs withdrawn** *(2026-09-22)*
FR-008 is withdrawn. AI scaffolding no longer invents draft scopes at project creation.

*Why:* the generator produced three to six speculative scopes per new project — near-always Authentication, Dashboard and Landing Page — from a description the LLM had only just read. They were guesses, not requirements: nothing in them came from a scoping conversation, none carried FRs, and every one of them occupied a scope number. The owner of a new project had to find and delete them before real scopes from `buildscope` could be numbered cleanly, so the feature cost work rather than saving it.

*What changes:* `AIScaffoldingService.scaffold()` keeps Step 1 (the project overview document, FR-007) and drops Step 2 entirely. A new project is created with an empty scope list. Scopes are created only by an explicit act:
- `buildscope` (VS Code / orchestrator),
- the web "new scope" action (`POST /api/projects/:id/phases/:phaseid/specs`, `ScopeService.createScope`),
- an accepted feedback seed (SCOPE-043),
- the bug-trapping scope install (SCOPE-063, itself explicit).

*What does not change:* FR-007 (overview generation), the overview retry UI, `GET /api/projects/:id/scaffold` and FR-029/FR-030 (`/project.init`). The scaffold endpoint still returns whatever scopes exist — for a new project that is now an empty array, which is the correct answer.

Applied to: FR-008 (withdrawn), FR-007 (unchanged), Acceptance Scenarios 4 and 14, the AI-scaffolding-failure edge case, and Clarification Q2.

---

**Q1 — Phase Assignment Cardinality**
Each phase has a single `assigneduserid` — the developer in charge of (and accountable for) that phase. All users listed in `projectusers` (the project roster) can access and contribute to the phase workspace, but the `assigneduserid` is the designated lead. Non-admin visibility filtering is based on `assigneduserid` only — a user appears in the phase's project list only if they are the named lead, not merely a roster member.

Applied to: FR-002, Key Entities (Project Phase), schema (`projectphases.assigneduserid` remains a single FK).

---

**Q5 — `project.init` Authentication**
The `project.init` command authenticates with the wxKanban API using a personal access token stored in an environment variable (`WXKANBAN_API_TOKEN`). The token is generated once in the user's wxKanban account settings and placed in the developer's local `.env` file or shell profile. No interactive credential prompt occurs — the command reads the token automatically from the environment. If the variable is missing, the command halts with a clear error instructing the developer to generate and configure the token.

Applied to: FR-029, FR-030. The scaffold endpoint (`GET /api/projects/:id/scaffold`) requires Bearer token authentication using `WXKANBAN_API_TOKEN`.

---

## Execution Status

- [x] User description parsed
- [x] Key concepts extracted
- [x] Ambiguities marked (none — scope.md provided full context)
- [x] User scenarios defined
- [x] Requirements generated
- [x] Entities identified
- [x] Review checklist passed
