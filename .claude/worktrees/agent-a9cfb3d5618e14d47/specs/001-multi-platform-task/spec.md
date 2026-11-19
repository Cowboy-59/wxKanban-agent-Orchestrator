# Feature Specification: Multi-Platform Task Management System

**Feature Branch**: `001-multi-platform-task`
**Created**: 2026-01-22
**Status**: Draft
**Input**: User description from DesignDesc.txt

---

## Overview

wxKanban is a unified task management and time tracking system designed for independent developers who work across multiple project management platforms. The system aggregates tasks from various PM systems (Jira, Monday.com, etc.), provides centralized time tracking with billing capabilities, uses AI to suggest additional necessary tasks, and optionally allows users to create and manage their own tasks directly within wxKanban for projects not connected to external PM systems.

**Target Users**: Independent software developers, freelance developers, consultants managing multiple clients

**Core Value**: Eliminate context switching between multiple PM tools while maintaining accurate time tracking and billing records across all client projects. Additionally, provide a standalone task management system for work that doesn't originate from external PM platforms.

**Interface Style**: Monday.com-inspired layout where each area represents a project. Under each project, work is organized into a 6-phase lifecycle that enforces quality methodology from design through release.

**Quality Methodology**: Every project follows a structured 6-phase lifecycle to ensure specifications are properly organized, testing is comprehensive, and nothing ships without passing through design, implementation, QA, human testing, beta, and release phases.

---

## User Scenarios & Testing

### Primary User Story

As an independent developer working with multiple clients, I need to see all my assigned tasks from different project management systems in one place, track time spent on each task, and generate accurate timesheets and invoices for billing purposes.

### Acceptance Scenarios

1. **Given** a user has registered and connected their Jira and Monday.com accounts, **When** they view their task dashboard, **Then** they see all assigned tasks from both systems aggregated in a single view with priority and due date information.

2. **Given** a user is viewing their task list, **When** they select one or more tasks and start a timer, **Then** the system tracks elapsed time for each task separately and allows pause/resume functionality.

3. **Given** a user has tracked time on multiple tasks across different projects, **When** they generate a timesheet for a specific client and date range, **Then** the system produces a PDF document showing all time entries with task names, hours, rates, and total amount.

4. **Given** a user has unbilled time entries for a client, **When** they generate an invoice, **Then** the system creates a unique invoice number, marks time entries as invoiced, and produces a PDF invoice with itemized entries and total amount.

5. **Given** a user is working on a project with multiple tasks, **When** they start a timer on that project, **Then** the AI system analyzes the project context and proposes 3-5 additional related tasks that might be needed.

6. **Given** a user has AI-proposed tasks, **When** they review the proposals, **Then** they can accept or reject each proposal individually, and accepted proposals become new tasks in the system.

7. **Given** a user updates a task status in wxKanban, **When** the change is saved, **Then** the system synchronizes the status update back to the source PM system (Jira/Monday) within 5 minutes.

8. **Given** a user creates a new project, **When** the project is initialized, **Then** the system creates all 6 phases (Design, Implementation, QA, Human Testing, Beta, Release) with the Design phase set as active.

9. **Given** a user is in Phase 1 (Design) with approved specifications, **When** they complete the phase, **Then** the system advances to Phase 2 (Implementation) and logs the transition.

10. **Given** a user receives feedback during Phase 4 (Human Testing), **When** they submit the feedback, **Then** the system can generate a new specification in Phase 1 and optionally reopen earlier phases.

11. **Given** a user is in Phase 5 (Beta), **When** they want to make modifications, **Then** the system requires explicit approval from the Project Manager before allowing changes.

---

## Functional Requirements

### Authentication & User Management

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-001 | Users can register new accounts with email and password | P1 |
| FR-002 | Users can sign in to existing accounts | P1 |
| FR-003 | System validates email format and password strength | P1 |
| FR-004 | Users can reset forgotten passwords via email | P1 |
| FR-005 | System supports OAuth 2.0 for Jira, Monday.com, Asana, and Trello | P1 |

### PM System Integration

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-006 | System retrieves all assigned tasks from connected PM systems | P1 |
| FR-007 | System synchronizes task updates bidirectionally with PM systems | P2 |
| FR-008 | System handles authentication failures gracefully with reconnection prompts | P1 |
| FR-009 | Users can add multiple PM system connections | P1 |
| FR-010 | Users can disconnect PM systems without losing time tracking data | P1 |
| FR-011 | System displays unified task view from all connected PM systems | P1 |
| FR-012 | Users can filter and sort tasks by priority, source system, status, due date | P1 |
| FR-013 | Users can adjust task priority within wxKanban (syncs to PM system) | P2 |
| FR-014 | System clearly identifies task source (Jira, Monday, Asana, Trello) | P1 |
| FR-014a | When a task is deleted or reassigned in source PM, mark as "orphaned" and preserve time entries | P1 |
| FR-015 | Users can manually trigger task synchronization | P1 |

### Internal Task Management

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-016 | Users can create and manage tasks directly in wxKanban without PM connection | P2 |
| FR-017 | Users can organize internal tasks into custom boards | P2 |
| FR-018 | System distinguishes internal tasks from external PM tasks | P2 |
| FR-019 | Internal tasks support all standard fields: title, description, priority, due date, status | P2 |
| FR-020 | Users can organize tasks by project and client | P1 |
| FR-021 | System tracks task origin (external PM vs internal) | P1 |
| FR-022 | Internal tasks support time tracking same as external tasks | P2 |

### Time Tracking

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-023 | Users can start timer on one or more tasks simultaneously | P1 |
| FR-024 | System tracks elapsed time for each active timer separately | P1 |
| FR-025 | Users can pause and resume timers | P1 |
| FR-026 | Users can mark time entries as billable or non-billable | P1 |
| FR-027 | System displays time entry history with task names and durations | P1 |
| FR-028 | Users can manually add time entries for past work | P1 |
| FR-028a | System detects inactivity (default 8 hours, configurable) and prompts user to confirm or trim duration | P1 |
| FR-029 | Time entries are associated with specific projects and clients | P1 |
| FR-030 | Users can view total hours per project and client | P1 |
| FR-031 | System separates billable and non-billable hours in reports | P1 |

### Client & Project Management

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-032 | System retrieves company information from connected PM systems | P2 |
| FR-033 | Users can manually enter client information (company name, billing email) | P1 |
| FR-034 | Users can organize projects by client with hourly billing rates | P1 |
| FR-035 | Users can generate timesheets for specific clients and date ranges | P1 |
| FR-036 | Users can generate invoices based on billable hours | P1 |
| FR-037 | System calculates invoice totals using project or client hourly rates | P1 |
| FR-038 | System prevents duplicate billing by tracking invoiced time entries | P1 |
| FR-039 | Users can download timesheets and invoices as PDF documents | P1 |
| FR-039a | Users can export data (tasks, time entries, invoices, clients) as CSV files | P1 |
| FR-040 | Users can send invoices via email to client billing addresses | P2 |

### AI Task Proposals

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-041 | AI analyzes project context and proposes 3-5 additional related tasks | P3 |
| FR-042 | AI proposals trigger automatically when user starts work on project (if enabled) | P3 |
| FR-043 | Users can disable automatic AI proposals in account settings | P3 |
| FR-044 | Users can manually trigger AI proposals from project page | P3 |
| FR-045 | Users can accept or reject each AI proposal individually | P3 |
| FR-046 | Accepted AI proposals create new tasks with source='ai_proposed' | P3 |

### Notes & Documentation

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-047 | Users can add notes to projects | P2 |
| FR-048 | System auto-generates notes when timer started/stopped | P2 |
| FR-049 | Users can organize notes by project and client | P2 |
| FR-050 | System timestamps all notes with author and date | P2 |

### Sub-Agent Integration (Deferred to Post-MVP)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-051 | System supports sub-agent task delegation (DEFERRED) | P4 |
| FR-052 | Sub-agents can update task status (DEFERRED) | P4 |
| FR-053 | Parent agents can review sub-agent work (DEFERRED) | P4 |

### Version Control & Updates

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-054 | System tracks task version history | P3 |
| FR-055 | Users receive notifications when tasks are updated in source PM | P3 |
| FR-056 | System integrates with tasks.md files for specification tracking | P3 |

### Phase Lifecycle Management (FR-057 to FR-082)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-057 | All projects follow 6-phase structure: Design → Implementation → QA → Human Testing → Beta → Release | P2 |
| FR-058 | System displays current phase indicator on all project views | P2 |
| FR-059 | Users can advance project phases with completion criteria check | P2 |
| FR-060 | System enforces no phase skipping (must complete each phase sequentially) | P2 |
| FR-061 | Phase 1 (Design) has dedicated area for specification documents | P2 |
| FR-062 | System auto-numbers specifications (001, 002, etc.) within project | P2 |
| FR-063 | Users can create, edit, and delete specifications in Phase 1 | P2 |
| FR-064 | Specifications require explicit approval before phase can advance (approved by user/PM, no auto-approve) | P2 |
| FR-065 | Phase 2 (Implementation) links tasks to Phase 1 specifications | P2 |
| FR-066 | System tracks implementation progress against specifications | P2 |
| FR-067 | Phase 3 (QA Testing) auto-generates test plans from specifications | P2 |
| FR-068 | System records test results and coverage | P2 |
| FR-069 | Phase 3 requires test results before advancement | P2 |
| FR-070 | Phase 4 (Human Testing) includes feedback capture mechanism | P2 |
| FR-071 | Feedback categorized as: Bug, Enhancement, Question, or Documentation | P2 |
| FR-072 | System can convert feedback to new Phase 1 specifications | P2 |
| FR-073 | Feedback tracks resolution status | P2 |
| FR-074 | Phase 5 (Beta Release) includes feedback capture with approval gate | P2 |
| FR-075 | Beta modifications require explicit approval from Project Manager | P2 |
| FR-076 | System tracks beta audit trail separately | P2 |
| FR-077 | Phase 6 (Release) supports multiple deployment methods | P2 |
| FR-078 | System records release details and artifacts | P2 |
| FR-079 | Release phase can be blocked by unresolved feedback | P2 |
| FR-080 | Users can reopen phases from feedback (multiple phases can be active if no conflict, reopening resets completion, Release cannot be reopened - new release required) | P2 |
| FR-081 | System logs all phase transitions with timestamp and reason | P2 |
| FR-082 | Project health dashboard shows phase status and blockers | P2 |

### Subscription Tier Gating (FR-083)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-083 | Time Tracking (US3), Timesheet Generation (US5), and Invoice Generation (US6, US9) features MUST be gated behind the `CONSULTANT` billing plan. Users on lower tiers (FREE, TEAM) see an upgrade prompt via the existing `UpgradeLock` component rather than the feature. Server-side endpoints under the gated feature areas MUST also refuse access for non-CONSULTANT users, not just hide the UI. | P1 |

---

## Success Criteria

1. **Task Aggregation Performance**: User can view all tasks from multiple PM systems in a single dashboard within 10 seconds of page load
2. **Time Tracking Accuracy**: Timer tracks time with 1-second precision; no time entries lost due to browser refresh or network issues
3. **Billing Productivity**: User can generate accurate invoice for any client in under 2 minutes
4. **PM Sync Reliability**: Bidirectional sync completes within 5 minutes with 99% success rate for status updates
5. **AI Proposal Acceptance**: 60% of AI-proposed tasks are accepted by users (tracked via 30-day rolling average shown in dashboard)
6. **User Adoption**: Target users report 50% reduction in context switching between PM tools
7. **Billing Accuracy**: 100% of invoiced time entries are correctly associated with the right client and project
8. **Phase Compliance**: 100% of projects follow the 6-phase workflow with no skipped phases
9. **Specification Traceability**: 100% of implementation tasks traceable to Phase 1 specifications
10. **Feedback Loop Efficiency**: Feedback-to-specification conversion requires no more than 2 user actions

---

## Key Entities

1. **User** - Account holder with authentication credentials and preferences
2. **PMSystemConnection** - OAuth connection to external PM system (Jira, Monday, etc.)
3. **Project** - Client project with billing rate and phase tracking
4. **Client** - Customer with billing information
5. **Task** - Work item from external PM or created internally
6. **InternalTaskBoard** - Custom board for organizing internal tasks
7. **TimeEntry** - Record of time spent on a task with billable flag
8. **Invoice** - Bill generated from billable time entries
9. **AIProposal** - Suggested task generated by AI analysis
10. **Note** - Project documentation and comments
11. **ProjectPhase** - One of 6 phases (Design, Implementation, QA, Human Testing, Beta, Release)
12. **Specification** - Design document in Phase 1 with auto-numbering
13. **TestPlan** - QA test cases linked to specifications
14. **FeedbackEntry** - User feedback captured in Phases 4 and 5
15. **PhaseTransitionLog** - Audit trail of phase changes

---

## Technical Constraints

- Must respect external PM system API rate limits (Jira: 150 req/min, Monday: 100 req/min)
- Must handle OAuth token expiration gracefully with automatic refresh where possible
- Must maintain data consistency when synchronizing bidirectionally with PM systems
- All timestamps stored in UTC, displayed in user's timezone
- Internal tasks are wxKanban-only (no export to external PM systems)

### Business Constraints

- Initial release should focus on most commonly used PM systems to maximize user value
- AI task proposal feature should provide clear value without generating excessive noise
- Time tracking must be simple enough to not disrupt developer workflow

---

## Clarifications

### Session 2026-02-12

- Q: How should conflicts be resolved when wxKanban and source PM system both modify a task since last sync? → A: Last-write-wins — wxKanban change overwrites PM system (user's intent prevails)
- Q: When a task is deleted or reassigned in the source PM system, what should wxKanban do with the local copy? → A: Mark as "orphaned" — hide from active view, preserve all time entries for billing
- Q: Should Sub-Agent Integration (FR-051 to FR-053) be included in MVP? → A: Defer to post-MVP — remove from initial scope, add to future roadmap
- Q: What should the system do when a timer has been running for an unusually long period (left running accidentally)? → A: Configurable inactivity threshold (default 8 hours) — prompt user to confirm or trim duration when exceeded
- Q: Can users export their data in a portable format beyond PDF invoices? → A: Full CSV export for all entities (tasks, time entries, invoices, clients) — separate files per entity type
- Q: Is the 6-phase workflow (Design → Implementation → QA → Human Testing → Beta → Release) an organizational concept or a system-enforced feature? → A: System-enforced — specifications must be placed in correct phase areas, and the method flow must be adhered to ensure quality products. Phase progression is tracked and enforced.
- Q: Is the Feedback button (Phases 4 & 5) part of MVP? → A: Yes — feedback capture is integral to the quality methodology. Phase 4 and 5 feedback can generate new Phase 1 specifications. Phase 5 modifications require explicit approval.
- Q: Should tasks be allowed without client/project association? → A: No — all tasks must be associated with a project and client
- Q: How should timezones be handled? → A: All timestamps stored in UTC, displayed in user's timezone. Due dates from external PM systems converted to UTC on import.
- Q: Can internal tasks be exported to external PM systems? → A: No — internal tasks are wxKanban-only
- Q: How is AI acceptance rate measured? → A: Store acceptance rate in aiproposal table with accepted/rejected/expired statuses. Calculate 30-day rolling average per user and display in dashboard.
- Q: Can multiple phases be active simultaneously? → A: Yes, as long as no conflict. Reopening resets completion timestamp. Release phase cannot be reopened — new release required.
- Q: Who can approve specifications? → A: User or PM can approve. No auto-approve.
- Q: Who approves Beta modifications? → A: Separate Project Manager role required for approval.
- Q: Should CSV export be filtered or complete? → A: Separate files per entity type. Include all historical data with date range filter option.

---

## Resolved Questions

All specification questions have been clarified and incorporated into the functional requirements:

1. **PM System Priority** [FR-005]: **RESOLVED** - Initial release will support Jira, Monday.com, Asana, and Trello

2. **Invoice Delivery** [FR-032, FR-033]: **RESOLVED** - System will support both download and email delivery of invoices and timesheets

3. **AI Trigger Strategy** [FR-035, FR-036]: **RESOLVED** - AI task proposals will trigger automatically when users start work on a project, with user preference to disable this feature

4. **6-Phase Workflow**: **RESOLVED** - System-enforced quality methodology — specifications must be placed in correct phase areas, method flow is enforced

5. **Feedback Button**: **RESOLVED** - MVP feature — integral to quality methodology in Phases 4 and 5

6. **Task Association**: **RESOLVED** - All tasks must have project and client association

7. **Timezone Handling**: **RESOLVED** - UTC storage, user timezone display

8. **Internal Task Export**: **RESOLVED** - wxKanban-only, no external export

9. **AI Acceptance Rate**: **RESOLVED** - 30-day rolling average stored in aiproposal table, displayed in dashboard

10. **Phase Reopening**: **RESOLVED** - Multiple phases can be active if no conflict, Release cannot be reopened

11. **Specification Approval**: **RESOLVED** - User or PM approval required, no auto-approve

12. **Beta Approval**: **RESOLVED** - Project Manager role required for approval

13. **CSV Export**: **RESOLVED** - Separate files per entity, all data with date range filter

---
