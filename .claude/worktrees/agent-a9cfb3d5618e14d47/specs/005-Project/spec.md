# Feature Specification: Project Lifecycle Management

**Feature Branch**: `005-project-lifecycle`
**Created**: 2026-02-15
**Status**: Draft
**Input**: User description: "Project definitions with internal/external designation, lifecycle phases (Design, Coding, QA, Human Testing, Beta, Release), and project task management tied to specs"

---

## Clarifications

### Session 2026-02-15

- Q: Should phase status advance automatically when all tasks in a phase are completed, or must Project Managers manually mark phases as complete? → A: Automatic phase completion when all tasks are done
- Q: How should the system handle concurrent modifications when two Project Managers attempt to edit the same project simultaneously? → A: Last-write-wins conflict resolution strategy
- Q: When a project is deleted, should data be permanently removed immediately or should there be a recovery period? → A: Soft-delete with 30-day recovery window before permanent purge

---

## Overview

This feature enables wxKanban to manage projects through a complete 6-phase lifecycle, from initial design through release. Projects can be designated as internal (company-managed) or external (client-managed), with automatic or manual company information display. Each project is organized with tasks tied to specification folders, ensuring clear alignment between project work and feature specifications.

---

## User Scenarios & Testing

### Primary User Story

**Project Manager creates and manages an internal project**
- Project Manager creates a new project and designates it as "internal"
- Company information is automatically populated from the account's company profile
- The system creates 6 default lifecycle phases (Design, Coding, QA, Human Testing, Beta, Release)
- For each specification in the system, default tasks are automatically created in the Design phase
- Documentation is added as a default task for the project
- Project Manager can view and update project status as work progresses through each phase

### Acceptance Scenarios

1. **Given** a Project Manager in an active company, **When** they create a new internal project, **Then** the company information is automatically populated and cannot be manually edited

2. **Given** a new project, **When** it is created, **Then** all 6 lifecycle phases are automatically initialized with appropriate status

3. **Given** a project with existing specifications in the system, **When** the project is created, **Then** default tasks are created for each specification under the Design phase

4. **Given** a project, **When** viewing the project details, **Then** documentation is visible as a default task that can be managed like any other task

5. **Given** an external project, **When** a Project Manager views the project, **Then** they can manually enter or override company information

6. **Given** a project in any lifecycle phase, **When** the Project Manager marks tasks as complete, **Then** the phase status updates automatically based on task completion

### Edge Cases

- What happens when a specification is added to the system after a project has been created? (New specs should not retroactively create tasks in existing projects)
- How does the system handle projects with no specifications defined? (Project should still be creatable with only documentation task)
- What happens when a project is deleted? (Soft-delete: project marked as deleted; recoverable for 30 days; automatically purged after 30 days; all associated tasks and phase data deleted with project)
- How does the system handle external projects without company information? (Company info should be optional for external projects; system should allow projects to proceed without it)
- What happens if two Project Managers try to move the same task between phases simultaneously? (Last-write-wins: both operations succeed; final state reflects the operation completed most recently)

---

## Requirements

### Functional Requirements

- **FR-001**: System MUST support two project types: internal and external
- **FR-002**: Internal projects MUST automatically populate company information from the authenticated user's company profile
- **FR-003**: Internal projects MUST prevent manual editing of auto-populated company information
- **FR-004**: External projects MUST allow Project Managers to manually enter company information
- **FR-005**: System MUST create 6 default lifecycle phases for every new project: Design (Phase 1), Coding (Phase 2), QA (Phase 3), Human Testing (Phase 4), Beta (Phase 5), and Release (Phase 6)
- **FR-006**: Each lifecycle phase MUST be initialized with a default status (e.g., "not started" for Design, "blocked" for dependent phases)
- **FR-006a**: When all tasks in a lifecycle phase are marked complete, the system MUST automatically update the phase status to "completed" without requiring manual intervention
- **FR-007**: System MUST automatically create default tasks in the Design phase for each existing specification (one task per spec folder)
- **FR-008**: System MUST create a "Documentation" task as a default task for every project
- **FR-009**: Project tasks MUST be associated with their corresponding specification folder/section
- **FR-010**: System MUST disable/hide the BaseRate field on project creation forms
- **FR-011**: Project Managers MUST be able to view all 6 lifecycle phases and their associated tasks
- **FR-012**: Project Managers MUST be able to move tasks between lifecycle phases
- **FR-013**: System MUST track which lifecycle phase a project is currently in
- **FR-014**: System MUST support updating a project's metadata (name, description, status)
- **FR-015**: System MUST allow any authenticated user — regardless of user type (TEAM_MEMBER, TEAM_MANAGER, ADMIN, SYSADMIN) — to create a project. *(Changed 2026-06-01: previously restricted creation to Project Managers and Admins only.)*
- **FR-015a**: System MUST allow any authenticated user in the company to **edit** a project's metadata (name, description, rate, hours, PM systems, compliance). *(Changed 2026-06-01: previously ADMIN-only.)* Editing a project accessed via a consulting engagement (cross-company) remains disallowed. Phase reassignment within the edit flow stays role-gated (ADMIN, or the TEAM_MANAGER who owns the phase).
- **FR-015b**: System MUST prevent creating a project whose name (case-insensitive, trimmed) duplicates an existing non-archived project in the **same company**. The duplicate guard MAY be overridden by the creator with an explicit "create anyway" confirmation (`allowduplicate`). *(Added 2026-06-01.)*
- **FR-015c**: Non-ADMIN users MUST see only projects assigned to them by default, with an opt-in "Show all" control to list every project in their company. ADMIN users always see all company projects. *(Added 2026-06-01.)*
- **FR-016**: When concurrent modifications occur on the same project, the system MUST use last-write-wins conflict resolution (later change overwrites earlier change)
- **FR-017**: Project deletion supports two paths: (a) **Archive** — any non-destructive hide from the project list (sets the project to ARCHIVED); and (b) **permanent Delete** — ADMIN-only, irreversibly removes the project and cascades all dependent records (tasks, phases, specs, documents, time entries). *(Changed 2026-06-01: added ADMIN-only permanent delete; the originally-specified 30-day soft-delete recovery window is not implemented.)*

### Key Entities

- **Project**: Represents a work initiative with lifecycle phases and associated tasks
  - `projectid` (UUID): Unique identifier
  - `companyid` (UUID): Associated company
  - `name` (string): Project name
  - `description` (text): Project description
  - `projecttype` (enum): "internal" or "external"
  - `status` (enum): Current lifecycle phase status
  - `companyinfo` (object): Company information (auto-populated for internal, manual for external)
  - `isdeleted` (boolean): Soft-delete flag (default: false)
  - `deletedat` (timestamp, nullable): When project was deleted (null if not deleted; used to track 30-day recovery window)
  - `createdat`, `updatedat` (timestamps): Audit timestamps

- **LifecyclePhase**: Represents one of the 6 project phases
  - `phaseid` (UUID): Unique identifier
  - `projectid` (UUID): Parent project
  - `phasenumber` (int): 1-6 representing Design through Release
  - `phasename` (string): "Design", "Coding", "QA", "Human Testing", "Beta", or "Release"
  - `status` (enum): "not started", "in progress", "blocked", "completed"
  - `createdbyid` (UUID): Who created this phase
  - `createdat`, `updatedat` (timestamps): Audit timestamps

- **ProjectTask**: Task tied to a specification within a project
  - `taskid` (UUID): Unique identifier
  - `projectid` (UUID): Parent project
  - `phaseid` (UUID): Associated lifecycle phase
  - `specificationid` (UUID): Linked specification (if applicable)
  - `title` (string): Task title
  - `description` (text): Task description
  - `status` (enum): "pending", "in progress", "completed", "blocked"
  - `createdbyid` (UUID): Who created this task
  - `createdat`, `updatedat` (timestamps): Audit timestamps

- **Company** (enhanced): Updated to support project company display
  - Ensure `name`, `address`, `contactemail` are populated for internal project display
  - Support null values for external projects

---

## Success Criteria

1. Project Managers can create internal projects with company information auto-populated within 30 seconds
2. External projects can be created with manually entered company information
3. All 6 lifecycle phases are created automatically for new projects with appropriate initial statuses
4. Default tasks are created for each specification (target: < 2 seconds for 10+ specifications)
5. Documentation task is always present and visible in project views
6. BaseRate field is hidden/disabled on the project creation form
7. Project Managers can navigate between all 6 phases and view associated tasks
8. Task movement between phases is possible without data loss
9. Project creation fails gracefully with user-friendly error messages for invalid inputs
10. Role-based access control prevents unauthorized project modifications
11. Deleted projects can be recovered within 30 days of deletion
12. Projects deleted more than 30 days ago are permanently purged from the system

---

## Assumptions & Dependencies

### Assumptions

- Specifications already exist in the system when projects are created (default tasks will only be created for existing specs)
- Project Managers have already been assigned roles with appropriate permissions
- Company information fields are required for internal projects but optional for external projects
- The system has a reliable way to identify the authenticated user's company (via JWT token or session)
- Lifecycle phases are always created in order (1-6) with no gaps or duplicates

### Dependencies

- **Specification Feature** (001-multi-platform-task): Projects depend on specifications existing in the system
- **Company & User Management** (002-admin-Management): Projects depend on company info and user roles
- **Role-Based Access Control**: Project **management** actions require role validation (creation is open to any authenticated user — see FR-015)
- **Database Schema**: New tables for Project, LifecyclePhase, and ProjectTask

---

## Out of Scope

- Real-time collaboration features (comments, notifications)
- Project scheduling or deadline tracking
- Resource allocation or capacity planning
- Third-party project integration (Jira, Asana, etc.)
- Project templates or cloning
- Archive/restore functionality for deleted projects

---

## Glossary

- **Internal Project**: A project where company information is managed by the wxKanban account owner
- **External Project**: A project where company information can be manually entered and edited by the Project Manager
- **Lifecycle Phase**: One of 6 sequential phases in project execution (Design → Coding → QA → Human Testing → Beta → Release)
- **Default Task**: Tasks automatically created by the system (one per specification, plus documentation)
- **BaseRate**: Hourly rate field that should be hidden/disabled in this feature (retained for backward compatibility)

