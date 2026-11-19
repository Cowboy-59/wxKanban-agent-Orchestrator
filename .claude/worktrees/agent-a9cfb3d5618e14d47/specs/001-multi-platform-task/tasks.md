# Tasks: Multi-Platform Task Management System (wxKanban)

**Input**: Design documents from `/specs/001-multi-platform-task/`
**Prerequisites**: plan.md, research.md, data-model.md, contracts/api-contracts.md, quickstart.md
**Architecture**: React 18+ frontend + Express/Fastify backend (separate directories)
**Branch**: 001-multi-platform-task

---

## Overview

This document organizes implementation tasks by user story to enable independent, incremental delivery. Each user story represents a complete, testable feature increment that delivers value to users.

**MVP Scope**: User Stories 1-6 (Complete core workflow: authentication → task viewing → time tracking → billing)

**Total User Stories**: 10
**Total Tasks**: ~120 tasks across 12 phases

---

## Implementation Strategy

### Principles

1. **User Story Independence**: Each story can be implemented and tested independently
2. **Incremental Value**: Each completed story delivers working functionality
3. **Parallel Development**: Multiple stories can be developed simultaneously after foundational work
4. **Test Coverage**: Each story includes E2E validation against quickstart scenarios

### Execution Order

1. **Phase 1**: Setup - Project initialization and infrastructure
2. **Phase 2**: Foundational - Shared components required by all user stories
3. **Phase 3-12**: User Stories 1-10 in priority order
4. **Phase 13**: Polish & Cross-Cutting Concerns

---

## User Story Map

| Story | Priority | Description                      | Dependencies           |
| ----- | -------- | -------------------------------- | ---------------------- |
| US1   | P1       | Authentication & PM Connection   | Phase 2 (Foundational) |
| US2   | P1       | Task Aggregation Dashboard       | US1                    |
| US3   | P1       | Time Tracking (Start/Stop/Pause) | US2                    |
| US4   | P1       | Client & Project Management      | US1                    |
| US5   | P1       | Timesheet Generation             | US3, US4               |
| US6   | P1       | Invoice Generation               | US3, US4               |
| US7   | P2       | Bidirectional Task Sync          | US2                    |
| US8   | P2       | Internal Task Management         | US2, US3               |
| US9   | P2       | Invoice Email Delivery           | US6                    |
| US10  | P3       | AI Task Proposals                | US2, US4               |

---

## Phase 1: Setup & Infrastructure

**Goal**: Initialize project structure, configure build tools, and establish development environment

**Duration**: ~2-3 hours

### Project Initialization

- [x] T001 Create monorepo structure with frontend/, backend/, shared/ directories per plan.md
- [x] T002 [P] Initialize frontend React app with Vite in frontend/ directory (package.json, vite.config.ts, tsconfig.json)
- [x] T003 [P] Initialize backend Express/Fastify app in backend/ directory (package.json, tsconfig.json, nodemon.json)
- [x] T004 [P] Create shared types package in shared/ directory with package.json
- [x] T005 [P] Configure TypeScript strict mode for all packages (tsconfig.json in each directory)

### Development Tools

- [x] T006 [P] Configure Biome formatter with tab indentation and double quotes in biome.json (root)
- [x] T007 [P] Set up ESLint for React best practices in frontend/.eslintrc.json
- [x] T008 [P] Configure environment variable templates (.env.example files in frontend/ and backend/)
- [x] T009 [P] Create .gitignore for node_modules, .env, dist, build artifacts

### Database Setup

- [x] T010 Initialize PostgreSQL connection in backend/src/lib/db/client.ts using Drizzle ORM
- [x] T011 Create Drizzle configuration file backend/drizzle.config.ts for migrations
- [x] T012 Set up database migration scripts in backend/package.json (db:generate, db:migrate, db:studio)

### Dependency Installation

- [x] T013 [P] Install frontend dependencies: react, react-router-dom, @tanstack/react-query, axios, @clerk/clerk-react, shadcn/ui
- [x] T014 [P] Install backend dependencies: express or fastify, drizzle-orm, postgres, @clerk/express, zod, cors
- [x] T015 [P] Install shared dev dependencies: typescript, @types/node, tsx
- [x] T016 [P] Install testing dependencies: vitest, @playwright/test, supertest

---

## Phase 2: Foundational Infrastructure

**Goal**: Implement shared components and infrastructure required by all user stories

**Duration**: ~4-5 hours

**Blockers**: MUST complete before starting user story implementation

### Database Schema (All Entities)

- [x] T017 [P] Define user table schema in backend/src/lib/db/schema.ts (userid UUID v7 PK, clerkid, email, name, timezone, aienabled, syncinterval)
- [x] T018 [P] Define pmsystemconnection table schema in backend/src/lib/db/schema.ts (connectionid UUID v7 PK, userid FK, systemtype enum, credentials jsonb)
- [x] T019 [P] Define client table schema in backend/src/lib/db/schema.ts (clientid UUID v7 PK, userid FK, companyname, billingemail, defaulthourlyrate)
- [x] T020 [P] Define project table schema in backend/src/lib/db/schema.ts (projectid UUID v7 PK, userid FK, clientid FK, name, hourlybillrate, status enum)
- [x] T021 [P] Define task table schema in backend/src/lib/db/schema.ts (taskid UUID v7 PK, userid FK, projectid FK, source enum, externaltaskid, title, status, priority enum)
- [x] T022 [P] Define internaltaskboard table schema in backend/src/lib/db/schema.ts (boardid UUID v7 PK, userid FK, name, configuration jsonb)
- [x] T023 [P] Define timeentry table schema in backend/src/lib/db/schema.ts (timeentryid UUID v7 PK, userid FK, taskid FK, starttime, endtime, duration, isbillable, invoiceid FK)
- [x] T024 [P] Define invoice table schema in backend/src/lib/db/schema.ts (invoiceid UUID v7 PK, userid FK, clientid FK, invoicenumber, subtotal, totalamount, status enum)
- [x] T025 [P] Define aiproposal table schema in backend/src/lib/db/schema.ts (proposalid UUID v7 PK, userid FK, projectid FK, title, rationale, status enum, taskid FK)
- [x] T026 [P] Define note table schema in backend/src/lib/db/schema.ts (noteid UUID v7 PK, userid FK, projectid FK, content, author enum, createdat)
- [x] T027 Generate initial database migration with `npm run db:generate` in backend/
- [x] T028 Apply migration with `npm run db:migrate` and verify schema in database

### Backend Infrastructure

- [x] T029 Create Express/Fastify server entry point in backend/src/server.ts with CORS, JSON parsing, error handling middleware
- [x] T030 [P] Implement Clerk authentication middleware in backend/src/middleware/auth.ts to validate JWT tokens
- [x] T031 [P] Create global error handler middleware in backend/src/middleware/errorHandler.ts with safe error messages
- [x] T032 [P] Configure CORS middleware in backend/src/middleware/cors.ts with frontend URL whitelist
- [x] T033 [P] Create Zod validation middleware in backend/src/middleware/validation.ts for request validation

### Frontend Infrastructure

- [x] T034 Set up React Router in frontend/src/App.tsx with ClerkProvider wrapper and route structure
- [x] T035 [P] Configure TanStack Query client in frontend/src/lib/queryClient.ts with optimistic update defaults
- [x] T036 [P] Create Axios API client in frontend/src/lib/api/client.ts with auth token interceptor and base URL
- [x] T037 [P] Set up Clerk authentication provider in frontend/src/main.tsx with publishable key
- [x] T038 [P] Create protected route wrapper component in frontend/src/components/ProtectedRoute.tsx using Clerk's SignedIn

### Shared Types

- [x] T039 [P] Define Task type in shared/types/task.ts (taskid, userid, title, source, priority, status, duedate)
- [x] T039a [P] Define ProjectPhase type in shared/types/projectPhase.ts (phaseid, projectid, phasenumber, phasename, status, entryat, completedat)
- [x] T039b [P] Define Specification type in shared/types/specification.ts (specid, projectid, phaseid, specnumber, title, content, status)
- [x] T039c [P] Define FeedbackEntry type in shared/types/feedbackEntry.ts (feedbackid, projectid, phaseid, category, content, resolutionstatus)
- [x] T040 [P] Define TimeEntry type in shared/types/timeEntry.ts (timeentryid, taskid, starttime, endtime, duration, isbillable)
- [x] T041 [P] Define Invoice type in shared/types/invoice.ts (invoiceid, clientid, invoicenumber, totalamount, status)
- [x] T042 [P] Define Client type in shared/types/client.ts (clientid, companyname, billingemail, defaulthourlyrate)
- [x] T043 [P] Define Project type in shared/types/project.ts (projectid, clientid, name, hourlybillrate, status)
- [x] T044 [P] Define PMConnection type in shared/types/pmConnection.ts (connectionid, systemtype, systemname, syncstatus)
- [x] T045 [P] Define AIProposal type in shared/types/aiProposal.ts (proposalid, projectid, title, rationale, status)

### UI Foundation

- [x] T046 [P] Install and configure shadcn/ui components using CLI (button, input, card, dialog, select, table)
- [x] T047 [P] Create main layout component in frontend/src/components/layout/MainLayout.tsx with sidebar and header
- [x] T048 [P] Create sidebar navigation in frontend/src/components/layout/Sidebar.tsx with links to all main routes
- [x] T049 [P] Set up Tailwind CSS theme in frontend/src/styles/globals.css with semantic color classes
- [x] T050 [P] Create loading spinner component in frontend/src/components/ui/LoadingSpinner.tsx

---

## Phase 3: User Story 1 - Authentication & PM Connection (P1)

**Story Goal**: Users can register, sign in, and connect at least one PM system (Jira or Monday.com)

**Acceptance Criteria**:

- ✅ User can register new account with email/password
- ✅ User can sign in to existing account
- ✅ User can connect Jira account via OAuth 2.0
- ✅ User can connect Monday.com account via OAuth 2.0
- ✅ User sees connection status (active/error/expired)
- ✅ User can disconnect PM system

**Test Validation**: Quickstart Phase 1.1, 1.2, 1.3

**Duration**: ~6-8 hours

### Backend - Authentication

- [x] T051 [US1] Create POST /api/auth/register endpoint in backend/src/routes/auth.ts to create user record after Clerk signup
- [x] T052 [US1] Create GET /api/auth/me endpoint in backend/src/routes/auth.ts to return current user profile
- [x] T053 [US1] Create user service in backend/src/services/userService.ts with createUser(), getUserById(), updateUserPreferences()

### Backend - PM Connections

- [x] T054 [P] [US1] Create base PM adapter interface in backend/src/lib/pm-adapters/base.ts with authenticate(), getTasks(), updateTask() methods
- [x] T055 [P] [US1] Implement Jira OAuth 2.0 adapter in backend/src/lib/pm-adapters/jira.ts extending base adapter
- [x] T056 [P] [US1] Implement Monday.com OAuth 2.0 adapter in backend/src/lib/pm-adapters/monday.ts extending base adapter
- [x] T057 [US1] Create POST /api/pm/connections endpoint in backend/src/routes/pm/sync.ts to initiate OAuth flow
- [x] T058 [US1] Create GET /api/pm/connections/callback endpoint in backend/src/routes/pm/sync.ts to handle OAuth callback
- [x] T059 [US1] Create GET /api/pm/connections endpoint in backend/src/routes/pm/sync.ts to list user's PM connections
- [x] T060 [US1] Create DELETE /api/pm/connections/:id endpoint in backend/src/routes/pm/sync.ts to disconnect PM system
- [x] T061 [US1] Create PM connection service in backend/src/services/pmConnectionService.ts with saveConnection(), getConnections(), deleteConnection() — implemented as `src/server/services/pmSystemService.ts` (connectPMSystem, getUserPMConnections, disconnectPMSystem)

### Frontend - Authentication & PM Connections

> T062–T068 removed: superseded by custom JWT auth (CLAUDE.md) and the
> existing `src/client/pages/auth/` and `src/client/pages/integrations/`
> implementations, which cover the original Clerk-based scope.

### Testing & Validation

- [x] T069 [US1] Verify user can complete registration and sign in via the custom JWT auth pages (`/register`, `/login`)
- [ ] T070 [US1] Verify Jira OAuth flow completes and connection shows "active" status
- [x] T071 [US1] Verify Monday.com OAuth flow completes and connection shows "active" status
- [x] T072 [US1] Verify disconnect button removes PM connection

---

## Phase 4: User Story 2 - Task Aggregation Dashboard (P1)

**Story Goal**: Users can view all tasks from connected PM systems in a unified dashboard with filtering and sorting

**Acceptance Criteria**:

- ✅ Dashboard displays tasks from all connected PM systems
- ✅ Each task shows: title, source badge (Jira/Monday), priority, due date, status
- ✅ User can filter by: priority, source system, status
- ✅ User can sort by: due date, priority, title
- ✅ Tasks refresh on manual trigger
- ✅ Total task count displayed

**Test Validation**: Quickstart Phase 2.1, 2.2

**Duration**: ~8-10 hours

### Backend - Task Sync

- [x] T073 [US2] Implement Jira task retrieval in backend/src/lib/pm-adapters/jira.ts using JQL query for assignee=currentUser() — `src/server/lib/pm-adapters/jira.ts:203-287`
- [x] T074 [US2] Implement Monday.com task retrieval in backend/src/lib/pm-adapters/monday.ts using GraphQL boards query — `src/server/lib/pm-adapters/monday.ts:187-303`
- [x] T075 [US2] Create task synchronization service in backend/src/services/pmSyncService.ts with syncTasksFromPM(), detectChanges() — `src/server/services/pmSyncService.ts:32-162`
- [x] T076 [US2] Create background sync scheduler in backend/src/lib/sync/scheduler.ts using node-cron with configurable intervals — implemented via `setInterval` in `src/server/services/jobScheduler.ts:82-217` (node-cron not used, but interval-based scheduling works)
- [x] T077 [US2] Create POST /api/pm/sync endpoint in backend/src/routes/pm/sync.ts to trigger manual sync for all connections — `src/server/routes/sync.ts` (per-system) plus new `POST /api/tasks/sync` (all systems) in `src/server/routes/tasks.ts`
- [x] T078 [US2] Create GET /api/tasks endpoint in backend/src/routes/tasks.ts with query params for filtering (source, priority, status) and sorting — `src/server/routes/tasks.ts`

### Backend - Task Service

- [x] T079 [US2] Create task service in backend/src/services/taskService.ts with getTasks(), getTaskById(), updateTask(), createTask() — aggregated-list behavior provided by `GET /api/tasks`; per-project TaskService already has getTask/getTasksByPhase/updateTask (`src/server/services/taskService.ts`). Public `createTask()` not needed for US2 (PM-sync path uses `createTaskFromPM`).
- [x] T080 [US2] Implement delta sync logic in backend/src/services/pmSyncService.ts comparing syncchecksum to detect changes — implemented as title+status comparison in `shouldUpdateTask()` (`src/server/services/pmSyncService.ts:147-162`); schema does not yet store a checksum column (noted as future enhancement).
- [ ] T081 [US2] Implement rate limiting using token bucket in backend/src/lib/sync/rateLimiter.ts (150 req/min Jira, 100 req/min Monday) — deferred; not blocking US2 acceptance criteria

### Frontend - Dashboard

- [x] T082 [US2] Create dashboard page in frontend/src/routes/Dashboard.tsx as main task aggregation view — implemented as `src/client/pages/tasks/TasksPage.tsx` (new `/tasks` route; existing Dashboard already routes by user type)
- [x] T083 [US2] Create task list component in frontend/src/components/task/TaskList.tsx rendering tasks in card grid — card grid implemented inline in `TasksPage.tsx`
- [x] T084 [P] [US2] Create task card component in frontend/src/components/task/TaskCard.tsx showing title, source badge, priority, due date, status — `TaskCard` component in `src/client/pages/tasks/TasksPage.tsx`
- [x] T085 [P] [US2] Create task filters component in frontend/src/components/task/TaskFilters.tsx with dropdowns for priority, source, status — filter dropdowns in `TasksPage.tsx`
- [x] T086 [P] [US2] Create sort dropdown in frontend/src/components/task/TaskSort.tsx with options for due date, priority, title — sort dropdown + asc/desc toggle in `TasksPage.tsx`
- [x] T087 [US2] Create task API hooks in frontend/src/lib/hooks/useTasks.ts (useTasks with filters, useSyncTasks) — `src/client/hooks/useTasks.ts` (`useTasks`, `triggerSync`, `fetchSyncStatus`)
- [ ] T088 [US2] Implement optimistic updates in task hooks using TanStack Query's onMutate, onError, onSettled pattern — deferred; US2 is read-only aggregation, no task mutations yet. Revisit when task-edit UI lands.

### Frontend - Sync UI

- [x] T089 [US2] Add sync button to dashboard header triggering manual sync with loading spinner — `TasksPage.tsx` header "Sync now" button with animated spinner
- [x] T090 [US2] Display last sync timestamp and sync status in dashboard header — "Last sync: ..." relative-time label beside sync button, backed by `GET /api/tasks/sync-status`
- [x] T091 [US2] Show total task count badge in dashboard title — indigo count pill next to "My Tasks" heading

### Testing & Validation

- [ ] T092 [US2] Verify dashboard displays tasks from connected Jira account with correct details
- [ ] T093 [US2] Verify dashboard displays tasks from connected Monday.com account with correct details
- [ ] T094 [US2] Verify filtering by "High" priority shows only high-priority tasks
- [ ] T095 [US2] Verify sorting by due date orders tasks chronologically
- [ ] T096 [US2] Verify manual sync button triggers task refresh and updates last sync timestamp

---

## Phase 5: User Story 3 - Time Tracking (P1)

> **Tier requirement (FR-083)**: All tasks in this phase MUST be gated behind
> the `CONSULTANT` billing plan on both the UI (via `UpgradeLock`) and the
> server routes (reject non-CONSULTANT users with 403).

**Story Goal**: Users can start, stop, pause, and resume timers on tasks with multi-task support

**Acceptance Criteria**:

- ✅ User can start timer on one or more tasks simultaneously
- ✅ Timer displays running duration updating every second
- ✅ User can pause and resume timers
- ✅ User can stop timer and add notes
- ✅ User can mark time entries as billable/non-billable
- ✅ Time entries show in history with all details

**Test Validation**: Quickstart Phase 3.1, 3.2, 3.3, 3.4, 3.5

**Duration**: ~8-10 hours

### Backend - Time Tracking

- [ ] T097 [US3] Create POST /api/time/start endpoint in backend/src/routes/time.ts to start new time entry with taskid
- [ ] T098 [US3] Create POST /api/time/pause endpoint in backend/src/routes/time.ts to pause active time entry
- [ ] T099 [US3] Create POST /api/time/resume endpoint in backend/src/routes/time.ts to resume paused time entry
- [ ] T100 [US3] Create POST /api/time/stop endpoint in backend/src/routes/time.ts to stop time entry, calculate duration, add notes
- [ ] T101 [US3] Create GET /api/time/active endpoint in backend/src/routes/time.ts to get all running/paused timers for user
- [ ] T102 [US3] Create GET /api/time/history endpoint in backend/src/routes/time.ts to get completed time entries with pagination
- [ ] T103 [US3] Create time entry service in backend/src/services/timeService.ts with startTimer(), pauseTimer(), resumeTimer(), stopTimer()
- [ ] T103a [US3] Implement inactivity threshold detection in backend/src/services/timeService.ts (default 8 hours, configurable per user)
- [ ] T104 [US3] Implement duration calculation in backend/src/services/timeService.ts as (endtime - starttime - totalpausedduration)
- [ ] T105 [US3] Add manual time entry endpoint POST /api/time/manual in backend/src/routes/time.ts accepting start/end times

### Frontend - Timer UI

- [ ] T106 [US3] Create time tracking page in frontend/src/routes/time/TimeTracker.tsx showing active timers and history
- [ ] T107 [US3] Create timer component in frontend/src/components/timer/Timer.tsx displaying task name, elapsed time, and controls
- [ ] T108 [P] [US3] Create timer controls component in frontend/src/components/timer/TimerControls.tsx with start, pause, resume, stop buttons
- [ ] T109 [P] [US3] Create multi-task timer display in frontend/src/components/timer/MultiTaskTimer.tsx showing all active timers
- [ ] T110 [US3] Create stop timer dialog in frontend/src/components/timer/StopTimerDialog.tsx with notes input and billable toggle
- [ ] T111 [US3] Implement timer hooks in frontend/src/lib/hooks/useTimer.ts (useStartTimer, usePauseTimer, useStopTimer, useActiveTimers)
- [ ] T112 [US3] Add client-side timer tick using setInterval in timer component updating displayed duration every second

### Frontend - Time History

- [ ] T113 [US3] Create time history component in frontend/src/routes/time/TimeHistory.tsx listing completed time entries
- [ ] T114 [US3] Create time entry card in frontend/src/components/timer/TimeEntryCard.tsx showing task, duration, notes, billable status
- [ ] T115 [US3] Add manual time entry dialog in frontend/src/routes/time/TimeTracker.tsx with date/time pickers

### Frontend - Dashboard Integration

- [ ] T116 [US3] Add "Start Timer" button to task cards in frontend/src/components/task/TaskCard.tsx
- [ ] T117 [US3] Show active timer badge on task cards in dashboard when timer is running

### Testing & Validation

- [ ] T118 [US3] Verify starting timer on task creates running time entry with duration incrementing
- [ ] T119 [US3] Verify starting timers on two tasks simultaneously shows both timers running independently
- [ ] T120 [US3] Verify pausing timer freezes duration counter and resume restarts it
- [ ] T121 [US3] Verify stopping timer opens dialog to add notes and billable toggle
- [ ] T122 [US3] Verify completed time entry appears in history with correct duration and notes
- [ ] T123 [US3] Verify manual time entry accepts past dates and calculates correct duration

---

## Phase 6: User Story 4 - Client & Project Management (P1)

**Story Goal**: Users can create and manage clients and projects with billing rates

**Acceptance Criteria**:

- ✅ User can create new client with company name, billing email, default hourly rate
- ✅ User can view list of all clients
- ✅ User can edit client information
- ✅ User can create project associated with client
- ✅ User can set project-specific hourly rate (overrides client default)
- ✅ User can view project details with associated client

**Test Validation**: Quickstart Phase 4.1, 4.2

**Duration**: ~6-8 hours

### Backend - Clients

- [ ] T124 [US4] Create POST /api/clients endpoint in backend/src/routes/clients.ts to create new client with validation
- [ ] T125 [US4] Create GET /api/clients endpoint in backend/src/routes/clients.ts to list user's clients
- [ ] T126 [US4] Create GET /api/clients/:id endpoint in backend/src/routes/clients.ts to get client details
- [ ] T127 [US4] Create PUT /api/clients/:id endpoint in backend/src/routes/clients.ts to update client information
- [ ] T128 [US4] Create client service in backend/src/services/clientService.ts with createClient(), getClients(), updateClient()
- [ ] T129 [US4] Add Zod validation for client creation in backend/src/routes/clients.ts (companyname, billingemail format, positive hourly rate)
- [ ] T129a [US4] Add validation to ensure all tasks have required projectid and clientid associations (enforces no orphaned tasks per clarification)

### Backend - Projects

- [ ] T130 [US4] Create POST /api/projects endpoint in backend/src/routes/projects.ts to create new project with clientid
- [ ] T131 [US4] Create GET /api/projects endpoint in backend/src/routes/projects.ts to list user's projects with client info
- [ ] T132 [US4] Create GET /api/projects/:id endpoint in backend/src/routes/projects.ts to get project details with client
- [ ] T133 [US4] Create PUT /api/projects/:id endpoint in backend/src/routes/projects.ts to update project details
- [ ] T134 [US4] Create project service in backend/src/services/projectService.ts with createProject(), getProjects(), updateProject()
- [ ] T135 [US4] Add Zod validation for project creation in backend/src/routes/projects.ts (name required, positive hourly rate)
- [ ] T135a [US4] Add project initialization logic to auto-create all 6 phases in backend/src/services/projectService.ts createProject() (FR-057)

### Frontend - Clients

- [ ] T136 [US4] Create clients list page in frontend/src/routes/clients/ClientsList.tsx displaying all clients in table
- [ ] T137 [US4] Create client detail page in frontend/src/routes/clients/ClientDetail.tsx showing full client information
- [ ] T138 [US4] Create add client dialog in frontend/src/routes/clients/ClientsList.tsx with form fields
- [ ] T139 [US4] Create edit client dialog in frontend/src/routes/clients/ClientDetail.tsx to update client details
- [ ] T140 [US4] Create client API hooks in frontend/src/lib/hooks/useClients.ts (useClients, useCreateClient, useUpdateClient)

### Frontend - Projects

- [ ] T141 [US4] Create projects list page in frontend/src/routes/projects/ProjectsList.tsx displaying projects with client names
- [ ] T142 [US4] Create project detail page in frontend/src/routes/projects/ProjectDetail.tsx showing project info and associated client
- [ ] T143 [US4] Create add project dialog in frontend/src/routes/projects/ProjectsList.tsx with client dropdown and hourly rate
- [ ] T144 [US4] Create edit project dialog in frontend/src/routes/projects/ProjectDetail.tsx to update project details
- [ ] T145 [US4] Create project API hooks in frontend/src/lib/hooks/useProjects.ts (useProjects, useCreateProject, useUpdateProject)

### Frontend - Integration

- [ ] T146 [US4] Add project dropdown to task creation/editing to associate tasks with projects
- [ ] T147 [US4] Display project name on task cards in dashboard if task has associated project

### Testing & Validation

- [ ] T148 [US4] Verify creating new client "ACME Corporation" with billing email and $150 rate saves correctly
- [ ] T149 [US4] Verify clients list displays ACME Corporation with all details
- [ ] T150 [US4] Verify creating project "Website Redesign" for ACME with $160 rate (overriding client default) saves correctly
- [ ] T151 [US4] Verify project detail page shows $160 rate, not client's $150 default rate

---

## Phase 7: User Story 5 - Timesheet Generation (P1)

> **Tier requirement (FR-083)**: All tasks in this phase MUST be gated behind
> the `CONSULTANT` billing plan on both the UI (via `UpgradeLock`) and the
> server routes (reject non-CONSULTANT users with 403).

**Story Goal**: Users can generate timesheets showing billable hours per client/project within a date range

**Acceptance Criteria**:

- ✅ User can select client and date range for timesheet
- ✅ Timesheet shows all time entries with task names, dates, durations
- ✅ Timesheet separates billable and non-billable hours
- ✅ Timesheet calculates total hours and total amount based on project/client rates
- ✅ User can download timesheet as PDF

**Test Validation**: Quickstart Phase 3 (time tracking) + validation

**Duration**: ~6-8 hours

### Backend - Timesheet Generation

- [ ] T152 [US5] Create GET /api/timesheets endpoint in backend/src/routes/invoices.ts accepting clientid, projectid, startdate, enddate params
- [ ] T153 [US5] Implement timesheet data aggregation in backend/src/services/invoiceService.ts grouping time entries by task
- [ ] T154 [US5] Calculate billable vs non-billable hours in backend/src/services/invoiceService.ts with separate totals
- [ ] T155 [US5] Fetch appropriate billing rates (project-specific or client default) in backend/src/services/invoiceService.ts
- [ ] T156 [US5] Calculate total amount as (billable hours × hourly rate) in backend/src/services/invoiceService.ts
- [ ] T157 [US5] Create PDF generation utility in backend/src/lib/pdf/timesheetGenerator.ts using PDFKit
- [ ] T157a [US5] Create CSV export utility in backend/src/lib/csv/exportGenerator.ts for tasks, time entries, invoices, clients
- [ ] T158 [US5] Create GET /api/timesheets/:id/download endpoint in backend/src/routes/invoices.ts to generate and stream PDF
- [ ] T158a [US5] Create GET /api/export/:entity/csv endpoint in backend/src/routes/export.ts for CSV exports (FR-039a)

### Frontend - Timesheet UI

- [ ] T159 [US5] Create timesheets page in frontend/src/routes/invoices/TimesheetsList.tsx with generation form
- [ ] T160 [US5] Create timesheet generation dialog in frontend/src/routes/invoices/GenerateTimesheet.tsx with client, date range, project filters
- [ ] T161 [US5] Create timesheet preview component in frontend/src/components/invoice/TimesheetPreview.tsx showing itemized time entries
- [ ] T162 [US5] Create timesheet table in frontend/src/components/invoice/TimesheetTable.tsx with columns: date, task, hours, rate, amount
- [ ] T163 [US5] Add download button to trigger PDF download in frontend/src/routes/invoices/TimesheetsList.tsx
- [ ] T164 [US5] Create timesheet API hooks in frontend/src/lib/hooks/useTimesheets.ts (useGenerateTimesheet, useDownloadTimesheet)

### Testing & Validation

- [ ] T165 [US5] Verify generating timesheet for ACME Corporation for last 7 days shows all time entries
- [ ] T166 [US5] Verify timesheet separates billable hours (2.5h) from non-billable hours (0h)
- [ ] T167 [US5] Verify timesheet calculates correct total: 2.5h × $160/h = $400
- [ ] T168 [US5] Verify download button generates PDF with correct data and formatting

---

## Phase 8: User Story 6 - Invoice Generation (P1)

> **Tier requirement (FR-083)**: All tasks in this phase MUST be gated behind
> the `CONSULTANT` billing plan on both the UI (via `UpgradeLock`) and the
> server routes (reject non-CONSULTANT users with 403).

**Story Goal**: Users can generate invoices based on billable hours with duplicate billing prevention

**Acceptance Criteria**:

- ✅ User can generate invoice for client with date range
- ✅ Invoice only includes unbilled time entries (invoicedat IS NULL)
- ✅ Invoice calculates subtotal and total amount
- ✅ Invoice shows unique invoice number
- ✅ Upon generation, time entries are marked with invoiceid and invoicedat timestamp
- ✅ User can download invoice as PDF
- ✅ Invoice shows itemized time entries with task names, hours, rates

**Test Validation**: Quickstart Phase 6.1, 6.2 (partial - email in US9)

**Duration**: ~8-10 hours

### Backend - Invoice Generation

- [ ] T169 [US6] Create POST /api/invoices endpoint in backend/src/routes/invoices.ts accepting clientid, startdate, enddate params
- [ ] T170 [US6] Implement invoice generation logic in backend/src/services/invoiceService.ts querying unbilled time entries (invoicedat IS NULL)
- [ ] T171 [US6] Generate unique invoice number in backend/src/services/invoiceService.ts using format INV-YYYY-NNN (sequential)
- [ ] T172 [US6] Calculate invoice subtotal and total in backend/src/services/invoiceService.ts summing (hours × rate) for each entry
- [ ] T173 [US6] Create invoice record in database and update time entries with invoiceid and invoicedat in backend/src/services/invoiceService.ts
- [ ] T174 [US6] Implement transaction to ensure atomic update of invoice + time entries in backend/src/services/invoiceService.ts
- [ ] T175 [US6] Create GET /api/invoices endpoint in backend/src/routes/invoices.ts to list user's invoices
- [ ] T176 [US6] Create GET /api/invoices/:id endpoint in backend/src/routes/invoices.ts to get invoice details with time entries
- [ ] T177 [US6] Create PDF invoice generator in backend/src/lib/pdf/invoiceGenerator.ts using PDFKit with professional layout
- [ ] T178 [US6] Create GET /api/invoices/:id/download endpoint in backend/src/routes/invoices.ts to generate and stream PDF

### Frontend - Invoice UI

- [ ] T179 [US6] Create invoices list page in frontend/src/routes/invoices/InvoicesList.tsx displaying all invoices with status
- [ ] T180 [US6] Create invoice generation dialog in frontend/src/routes/invoices/GenerateInvoice.tsx with client, date range, unbilled hours preview
- [ ] T181 [US6] Create invoice preview component in frontend/src/components/invoice/InvoicePreview.tsx showing invoice details before generation
- [ ] T182 [US6] Display unbilled hours count and amount in generation dialog to confirm selection
- [ ] T183 [US6] Create invoice detail page in frontend/src/routes/invoices/InvoiceDetail.tsx showing full invoice with itemized entries
- [ ] T184 [US6] Add download button to invoice detail page triggering PDF download
- [ ] T185 [US6] Create invoice API hooks in frontend/src/lib/hooks/useInvoices.ts (useInvoices, useGenerateInvoice, useDownloadInvoice)
- [ ] T186 [US6] Show invoice number, generation date, client, status, and total amount in invoices list

### Frontend - Billing Status

- [ ] T187 [US6] Display "Invoiced" badge on time entries in time history that have invoicedat timestamp
- [ ] T188 [US6] Add filter to time history to show "Unbilled hours only" for easy invoice preparation
- [ ] T188a [US6] Add "Export CSV" button to time history, invoices list, and clients list for data portability (FR-039a)

### Testing & Validation

- [ ] T189 [US6] Verify generating invoice for ACME Corporation includes only unbilled time entries
- [ ] T190 [US6] Verify invoice number is unique and follows INV-2026-001 format
- [ ] T191 [US6] Verify invoice calculates correct total: 2.5h × $160/h = $400
- [ ] T192 [US6] Verify after generation, time entries show "Invoiced" badge and are excluded from next invoice
- [ ] T193 [US6] Verify invoice PDF downloads with correct layout, client info, and itemized entries
- [ ] T194 [US6] Verify generating second invoice for same period shows "No unbilled hours" message

---

## Phase 9: User Story 7 - Bidirectional Task Sync (P2)

**Story Goal**: Task updates made in wxKanban sync back to source PM systems

**Acceptance Criteria**:

- ✅ User can update task status in wxKanban
- ✅ Status change syncs to source PM system (Jira/Monday) within 5 minutes
- ✅ User can add notes to tasks in wxKanban
- ✅ Notes sync to PM system as comments
- ✅ Sync status shows "Last synced: Just now" after successful sync
- ✅ Sync errors display with retry option

**Test Validation**: Quickstart Phase 7.1, 7.2

**Duration**: ~6-8 hours

### Backend - Bidirectional Sync

- [ ] T195 [US7] Implement task update sync in backend/src/lib/pm-adapters/jira.ts updateTask() method using PUT /rest/api/3/issue/{id}
- [ ] T196 [US7] Implement task update sync in backend/src/lib/pm-adapters/monday.ts updateTask() method using GraphQL mutations
- [ ] T197 [US7] Create PUT /api/tasks/:id endpoint in backend/src/routes/tasks.ts to update task status and notes
- [ ] T198 [US7] Trigger sync to PM system after task update in backend/src/services/taskService.ts calling adapter updateTask()
- [ ] T199 [US7] Update task lastsyncat timestamp after successful sync in backend/src/services/taskService.ts
- [ ] T200 [US7] Handle sync errors and update task syncstatus in backend/src/services/taskService.ts with retry logic
- [ ] T201 [US7] Create background sync job in backend/src/lib/sync/scheduler.ts to push pending local changes to PM systems

### Frontend - Task Updates

- [ ] T202 [US7] Create edit task dialog in frontend/src/components/task/EditTaskDialog.tsx with status dropdown and notes field
- [ ] T203 [US7] Add "Edit" button to task detail view in frontend/src/routes/tasks/TaskDetail.tsx
- [ ] T204 [US7] Implement optimistic update for task edits in frontend/src/lib/hooks/useTasks.ts rolling back on error
- [ ] T205 [US7] Display last sync timestamp on task cards in frontend/src/components/task/TaskCard.tsx
- [ ] T206 [US7] Show sync status indicator (synced/syncing/error) on task cards with appropriate colors

### Testing & Validation

- [ ] T207 [US7] Verify updating task PROJ-123 status to "Completed" in wxKanban shows optimistic update immediately
- [ ] T208 [US7] Verify checking Jira after 30 seconds shows task PROJ-123 status is "Done"
- [ ] T209 [US7] Verify adding notes "Feature complete, ready for review" syncs as comment in Jira
- [ ] T210 [US7] Verify last sync timestamp updates to "Just now" after successful sync
- [ ] T211 [US7] Verify sync error displays error message and retry button if PM API fails

---

## Phase 10: User Story 8 - Internal Task Management (P2)

**Story Goal**: Users can create and manage tasks directly in wxKanban without PM system connection

**Acceptance Criteria**:

- ✅ User can create internal task board with custom name
- ✅ User can add tasks directly to internal board
- ✅ Internal tasks support all fields: title, description, priority, due date, status
- ✅ Internal tasks clearly distinguished from external tasks (different badge/icon)
- ✅ Internal tasks support time tracking same as external tasks
- ✅ Internal tasks included in timesheets and invoices

**Test Validation**: Quickstart Phase 2.3, integration with Phase 3

**Duration**: ~8-10 hours

### Backend - Internal Task Boards

- [ ] T212 [US8] Create POST /api/boards endpoint in backend/src/routes/tasks.ts to create new internal task board
- [ ] T213 [US8] Create GET /api/boards endpoint in backend/src/routes/tasks.ts to list user's internal task boards
- [ ] T214 [US8] Create PUT /api/boards/:id endpoint in backend/src/routes/tasks.ts to update board configuration (columns, statuses)
- [ ] T215 [US8] Create DELETE /api/boards/:id endpoint in backend/src/routes/tasks.ts to delete internal board
- [ ] T216 [US8] Create board service in backend/src/services/boardService.ts with createBoard(), getBoards(), updateBoard()

### Backend - Internal Tasks

- [ ] T217 [US8] Create POST /api/tasks/internal endpoint in backend/src/routes/tasks.ts to create internal task with source='internal'
- [ ] T218 [US8] Validate internal task creation in backend/src/services/taskService.ts ensuring boardid is set and connectionid is null
- [ ] T219 [US8] Update GET /api/tasks endpoint to include internal tasks with source badge in response
- [ ] T220 [US8] Create PUT /api/tasks/internal/:id endpoint in backend/src/routes/tasks.ts to update internal task (no PM sync)

### Frontend - Internal Task Boards

- [ ] T221 [US8] Create internal tasks page in frontend/src/routes/tasks/internal/InternalTasksList.tsx showing list of boards
- [ ] T222 [US8] Create board detail view in frontend/src/routes/tasks/internal/InternalTaskBoard.tsx displaying tasks in board columns
- [ ] T223 [US8] Create add board dialog in frontend/src/routes/tasks/internal/InternalTasksList.tsx with board name input
- [ ] T224 [US8] Create add internal task dialog in frontend/src/components/task/CreateInternalTaskDialog.tsx with all task fields
- [ ] T225 [US8] Create board API hooks in frontend/src/lib/hooks/useBoards.ts (useBoards, useCreateBoard, useUpdateBoard)
- [ ] T226 [US8] Create internal task API hooks in frontend/src/lib/hooks/useInternalTasks.ts (useCreateInternalTask, useUpdateInternalTask)

### Frontend - Task Distinction

- [ ] T227 [US8] Update task card component to display "Internal" badge with different color for source='internal' tasks
- [ ] T228 [US8] Add filter option "Internal tasks only" to dashboard task filters
- [ ] T229 [US8] Show internal tasks in unified dashboard alongside external PM tasks with clear visual distinction

### Integration with Existing Features

- [ ] T230 [US8] Verify time tracking works on internal tasks same as external tasks
- [ ] T231 [US8] Verify internal tasks included in timesheet generation when filtered by project
- [ ] T232 [US8] Verify internal task time entries included in invoice generation

---

## Phase 8a: Project Lifecycle Management UI (P2)

**Goal**: Implement 6-phase project lifecycle UI components (FR-057 to FR-082)

**Duration**: ~6-8 hours

### Backend - Phase Management

- [ ] T232a [P] Create project phase service in backend/src/services/phaseService.ts with createPhasesForProject(), advancePhase(), reopenPhase()
- [ ] T232b [P] Create POST /api/projects/:id/phases/:phaseid/complete endpoint for phase completion (FR-059, FR-064, FR-069)
- [ ] T232c [P] Create POST /api/projects/:id/phases/:phaseid/reopen endpoint for reopening phases (FR-080) with validation: Release phase cannot be reopened, multiple phases can be active if no conflict, reopening resets completion timestamp
- [ ] T232d [P] Create GET /api/projects/:id/phases endpoint to list all phases with status (FR-058)
- [ ] T232e [P] Create POST /api/projects/:id/phases/transition endpoint with validation for phase skipping (FR-060)
- [ ] T232f [P] Create specification service in backend/src/services/specificationService.ts with auto-numbering (FR-062) and approval workflow (FR-064: user or PM can approve, no auto-approve)
- [ ] T232g [P] Create POST /api/projects/:id/specifications endpoint for creating specs in Phase 1 (FR-061, FR-063)
- [ ] T232h [P] Create feedback service in backend/src/services/feedbackService.ts with categorization (FR-070, FR-071: Bug, Enhancement, Question, Documentation)
- [ ] T232i [P] Create POST /api/projects/:id/feedback endpoint for capturing feedback (FR-070, FR-074)
- [ ] T232j [P] Create POST /api/projects/:id/feedback/:id/convert-to-spec endpoint (FR-072)

### Frontend - Phase Management

- [ ] T232k [P] Create project phase indicator component in frontend/src/components/project/PhaseIndicator.tsx showing 6 phases with current highlighted (FR-058)
- [ ] T232l [P] Create phase advancement dialog in frontend/src/components/project/PhaseAdvanceDialog.tsx with completion criteria check (FR-059)
- [ ] T232m [P] Create specification list component in frontend/src/components/project/SpecificationList.tsx for Phase 1 (FR-061)
- [ ] T232n [P] Create specification editor in frontend/src/components/project/SpecificationEditor.tsx with status workflow (FR-063, FR-064)
- [ ] T232o [P] Create feedback capture form in frontend/src/components/project/FeedbackForm.tsx with category selection (FR-070, FR-071)
- [ ] T232p [P] Create project health dashboard component in frontend/src/components/project/ProjectHealthDashboard.tsx (FR-082) including AI proposal acceptance rate (30-day rolling average per user)
- [ ] T232q [P] Create phase transition history view in frontend/src/components/project/PhaseHistory.tsx (FR-081)

### Testing & Validation

- [ ] T232r Verify creating project initializes all 6 phases with correct sequence (FR-057)
- [ ] T232s Verify phase advancement blocked when specs not approved (FR-064)
- [ ] T232t Verify feedback submission creates spec in Phase 1 (FR-072)
- [ ] T232u Verify project health dashboard shows all phase statuses (FR-082)

---

## Phase 9: User Story 7 - Bidirectional Task Sync (P2)

**Story Goal**: Task updates made in wxKanban sync back to source PM systems

**Acceptance Criteria**:

- ✅ User can update task status in wxKanban
- ✅ Status change syncs to source PM system (Jira/Monday) within 5 minutes
- ✅ User can add notes to tasks in wxKanban
- ✅ Notes sync to PM system as comments
- ✅ Sync status shows "Last synced: Just now" after successful sync
- ✅ Sync errors display with retry option

**Test Validation**: Quickstart Phase 7.1, 7.2

**Duration**: ~6-8 hours

### Backend - Bidirectional Sync

- [ ] T195 [US7] Implement task update sync in backend/src/lib/pm-adapters/jira.ts updateTask() method using PUT /rest/api/3/issue/{id}
- [ ] T196 [US7] Implement task update sync in backend/src/lib/pm-adapters/monday.ts updateTask() method using GraphQL mutations
- [ ] T197 [US7] Create PUT /api/tasks/:id endpoint in backend/src/routes/tasks.ts to update task status and notes
- [ ] T198 [US7] Trigger sync to PM system after task update in backend/src/services/taskService.ts calling adapter updateTask()
- [ ] T199 [US7] Update task lastsyncat timestamp after successful sync in backend/src/services/taskService.ts
- [ ] T200 [US7] Handle sync errors and update task syncstatus in backend/src/services/taskService.ts with retry logic
- [ ] T201 [US7] Create background sync job in backend/src/lib/sync/scheduler.ts to push pending local changes to PM systems

### Frontend - Task Updates

- [ ] T202 [US7] Create edit task dialog in frontend/src/components/task/EditTaskDialog.tsx with status dropdown and notes field
- [ ] T203 [US7] Add "Edit" button to task detail view in frontend/src/routes/tasks/TaskDetail.tsx
- [ ] T204 [US7] Implement optimistic update for task edits in frontend/src/lib/hooks/useTasks.ts rolling back on error
- [ ] T205 [US7] Display last sync timestamp on task cards in frontend/src/components/task/TaskCard.tsx
- [ ] T206 [US7] Show sync status indicator (synced/syncing/error) on task cards with appropriate colors

### Testing & Validation

- [ ] T207 [US7] Verify updating task PROJ-123 status to "Completed" in wxKanban shows optimistic update immediately
- [ ] T208 [US7] Verify checking Jira after 30 seconds shows task PROJ-123 status is "Done"
- [ ] T209 [US7] Verify adding notes "Feature complete, ready for review" syncs as comment in Jira
- [ ] T210 [US7] Verify last sync timestamp updates to "Just now" after successful sync
- [ ] T211 [US7] Verify sync error displays error message and retry button if PM API fails

---

## Phase 10: User Story 8 - Internal Task Management (P2)

**Story Goal**: Users can create and manage tasks directly in wxKanban without PM system connection

**Acceptance Criteria**:

- ✅ User can create internal task board with custom name
- ✅ User can add tasks directly to internal board
- ✅ Internal tasks support all fields: title, description, priority, due date, status
- ✅ Internal tasks clearly distinguished from external tasks (different badge/icon)
- ✅ Internal tasks support time tracking same as external tasks
- ✅ Internal tasks included in timesheets and invoices

**Test Validation**: Quickstart Phase 2.3, integration with Phase 3

**Duration**: ~8-10 hours

### Backend - Internal Task Boards

- [ ] T212 [US8] Create POST /api/boards endpoint in backend/src/routes/tasks.ts to create new internal task board
- [ ] T213 [US8] Create GET /api/boards endpoint in backend/src/routes/tasks.ts to list user's internal task boards
- [ ] T214 [US8] Create PUT /api/boards/:id endpoint in backend/src/routes/tasks.ts to update board configuration (columns, statuses)
- [ ] T215 [US8] Create DELETE /api/boards/:id endpoint in backend/src/routes/tasks.ts to delete internal board
- [ ] T216 [US8] Create board service in backend/src/services/boardService.ts with createBoard(), getBoards(), updateBoard()

### Backend - Internal Tasks

- [ ] T217 [US8] Create POST /api/tasks/internal endpoint in backend/src/routes/tasks.ts to create internal task with source='internal'
- [ ] T218 [US8] Validate internal task creation in backend/src/services/taskService.ts ensuring boardid is set and connectionid is null
- [ ] T219 [US8] Update GET /api/tasks endpoint to include internal tasks with source badge in response
- [ ] T220 [US8] Create PUT /api/tasks/internal/:id endpoint in backend/src/routes/tasks.ts to update internal task (no PM sync)

### Frontend - Internal Task Boards

- [ ] T221 [US8] Create internal tasks page in frontend/src/routes/tasks/internal/InternalTasksList.tsx showing list of boards
- [ ] T222 [US8] Create board detail view in frontend/src/routes/tasks/internal/InternalTaskBoard.tsx displaying tasks in board columns
- [ ] T223 [US8] Create add board dialog in frontend/src/routes/tasks/internal/InternalTasksList.tsx with board name input
- [ ] T224 [US8] Create add internal task dialog in frontend/src/components/task/CreateInternalTaskDialog.tsx with all task fields
- [ ] T225 [US8] Create board API hooks in frontend/src/lib/hooks/useBoards.ts (useBoards, useCreateBoard, useUpdateBoard)
- [ ] T226 [US8] Create internal task API hooks in frontend/src/lib/hooks/useInternalTasks.ts (useCreateInternalTask, useUpdateInternalTask)

### Frontend - Task Distinction

- [ ] T227 [US8] Update task card component to display "Internal" badge with different color for source='internal' tasks
- [ ] T228 [US8] Add filter option "Internal tasks only" to dashboard task filters
- [ ] T229 [US8] Show internal tasks in unified dashboard alongside external PM tasks with clear visual distinction

### Integration with Existing Features

- [ ] T230 [US8] Verify time tracking works on internal tasks same as external tasks
- [ ] T231 [US8] Verify internal tasks included in timesheet generation when filtered by project
- [ ] T232 [US8] Verify internal task time entries included in invoice generation

### Testing & Validation

- [ ] T233 [US8] Verify creating internal task board "Personal Tasks" succeeds
- [ ] T234 [US8] Verify adding task "Prepare invoice templates" to internal board with Medium priority saves correctly
- [ ] T235 [US8] Verify internal tasks show "Internal" badge distinct from "Jira" or "Monday" badges
- [ ] T236 [US8] Verify starting timer on internal task works identically to external tasks
- [ ] T237 [US8] Verify timesheet for project includes both external and internal task time entries

---

## Phase 11: User Story 9 - Invoice Email Delivery (P2)

**Story Goal**: Users can send invoices and timesheets directly via email to client billing addresses

**Acceptance Criteria**:

- ✅ User can send invoice via email from invoice detail page
- ✅ Email recipient pre-filled with client's billing email
- ✅ User can add custom message to email
- ✅ Invoice PDF attached to email
- ✅ Invoice status updates to "Sent" after successful email
- ✅ Invoice shows sent timestamp

**Test Validation**: Quickstart Phase 6.2

**Duration**: ~4-6 hours

### Backend - Email Service

- [ ] T238 [US9] Configure Resend email service in backend/src/lib/email/resend.ts with API key and sender domain
- [ ] T239 [US9] Create email template for invoice delivery in backend/src/lib/email/templates/invoice-email.html with professional layout
- [ ] T240 [US9] Create sendInvoiceEmail() function in backend/src/lib/email/resend.ts accepting recipient, subject, message, PDF attachment
- [ ] T241 [US9] Create POST /api/invoices/:id/send endpoint in backend/src/routes/invoices.ts to send invoice via email
- [ ] T242 [US9] Update invoice status to 'sent' and set sentat timestamp in backend/src/services/invoiceService.ts after successful email
- [ ] T243 [US9] Handle email delivery errors in backend/src/services/invoiceService.ts with appropriate error messages

### Frontend - Email UI

- [ ] T244 [US9] Create send invoice dialog in frontend/src/components/invoice/SendInvoiceDialog.tsx with recipient, message fields
- [ ] T245 [US9] Pre-fill recipient email with client billing email from invoice in dialog
- [ ] T246 [US9] Add "Send Invoice" button to invoice detail page in frontend/src/routes/invoices/InvoiceDetail.tsx
- [ ] T247 [US9] Show success toast after email sent in frontend/src/routes/invoices/InvoiceDetail.tsx
- [ ] T248 [US9] Update invoice status badge to "Sent" and display sent timestamp after successful send
- [ ] T249 [US9] Create invoice email hooks in frontend/src/lib/hooks/useInvoices.ts (useSendInvoice)

### Testing & Validation

- [ ] T250 [US9] Verify clicking "Send Invoice" opens dialog with billing email pre-filled to billing@acme.example.com
- [ ] T251 [US9] Verify adding custom message and clicking Send delivers email with PDF attachment
- [ ] T252 [US9] Verify invoice status updates to "Sent" with timestamp after successful delivery
- [ ] T253 [US9] Verify email received at test inbox contains invoice PDF and custom message

---

## Phase 12: User Story 10 - AI Task Proposals (P3)

**Story Goal**: System suggests additional tasks based on project context using AI

**Acceptance Criteria**:

- ✅ AI analyzes project tasks and proposes 3-5 additional related tasks
- ✅ Proposals automatically trigger when user starts work on project (if enabled in settings)
- ✅ User can manually trigger AI proposals from project page
- ✅ Each proposal shows: title, description, priority, effort estimate, rationale
- ✅ User can accept or reject each proposal individually
- ✅ Accepted proposals create new tasks with source='ai_proposed'
- ✅ User can disable automatic AI proposals in account settings

**Test Validation**: Quickstart Phase 5.1, 5.2

**Duration**: ~8-10 hours

### Backend - AI Integration

- [ ] T254 [US10] Configure OpenAI API client in backend/src/lib/ai/openai.ts with API key and GPT-4 model
- [ ] T255 [US10] Configure Google Gemini API client in backend/src/lib/ai/gemini.ts as fallback option
- [ ] T256 [US10] Create AI prompt template in backend/src/lib/ai/promptTemplates.ts for task proposal generation with project context
- [ ] T257 [US10] Implement generateTaskProposals() in backend/src/lib/ai/openai.ts accepting project context and returning 3-5 proposals
- [ ] T258 [US10] Add fallback to Gemini if OpenAI fails in backend/src/lib/ai/openai.ts with error handling
- [ ] T259 [US10] Create POST /api/ai/propose endpoint in backend/src/routes/ai.ts accepting projectid and triggering AI analysis
- [ ] T260 [US10] Store AI proposals in database via backend/src/services/aiProposalService.ts with status='pending'
- [ ] T261 [US10] Create POST /api/ai/proposals/:id/accept endpoint in backend/src/routes/ai.ts to accept proposal and create task
- [ ] T262 [US10] Create POST /api/ai/proposals/:id/reject endpoint in backend/src/routes/ai.ts to reject proposal

### Backend - Automatic Triggering

- [ ] T263 [US10] Add automatic AI trigger logic in backend/src/services/timeService.ts when user starts timer on project (if aienabled=true)
- [ ] T264 [US10] Check if proposals already exist for project in last 24 hours before triggering in backend/src/services/aiProposalService.ts
- [ ] T265 [US10] Create background job for AI proposals in backend/src/lib/ai/scheduler.ts to avoid blocking timer start

### Frontend - AI Proposals UI

- [ ] T266 [US10] Create AI proposals page in frontend/src/routes/projects/ProjectDetail.tsx showing pending proposals for project
- [ ] T267 [US10] Create AI proposal card in frontend/src/components/ai/ProposalCard.tsx displaying title, description, rationale, priority
- [ ] T268 [US10] Add "Get AI Suggestions" button to project detail page triggering manual AI analysis
- [ ] T269 [US10] Create proposal review dialog in frontend/src/components/ai/ReviewProposalDialog.tsx with accept/reject buttons
- [ ] T270 [US10] Show loading state during AI analysis (typically 5-10 seconds)
- [ ] T271 [US10] Create AI proposal hooks in frontend/src/lib/hooks/useAIProposals.ts (useProposals, useRequestProposals, useAcceptProposal, useRejectProposal)
- [ ] T272 [US10] Display accepted proposals in task list with "AI" badge distinct from other sources

### Frontend - Settings Integration

- [ ] T273 [US10] Create user settings page in frontend/src/routes/settings/Settings.tsx with AI preferences
- [ ] T274 [US10] Add toggle "Enable automatic AI task proposals" in settings page
- [ ] T275 [US10] Create PUT /api/users/settings endpoint in backend/src/routes/auth.ts to update aienabled preference
- [ ] T276 [US10] Update user settings hooks in frontend/src/lib/hooks/useAuth.ts (useUpdateSettings)

### Backend - Timezone Handling

- [ ] T276c [US3] Add UTC timezone handling in backend/src/services/timeService.ts - store all timestamps in UTC, convert to user timezone for display
- [ ] T276d [US3] Add timezone conversion for due dates from external PM systems in backend/src/lib/pm-adapters/ (convert to UTC on import)

### Backend - AI Acceptance Rate Tracking

- [ ] T276e [US10] Add acceptance rate tracking fields to aiproposal table: status enum ('pending', 'accepted', 'rejected', 'expired'), decidedat timestamp
- [ ] T276f [US10] Create GET /api/ai/metrics endpoint in backend/src/routes/ai.ts returning 30-day rolling acceptance rate for dashboard

### Backend - Project Manager Role & Beta Approval

- [ ] T276g [P] Add projectmanagerid field to project table schema (FK to user table)
- [ ] T276h [P] Create POST /api/projects/:id/beta/approve endpoint requiring Project Manager approval for Beta modifications (FR-075)
- [ ] T276i [P] Create ProjectManagerGuard middleware in backend/src/middleware/roles.ts for Beta approval endpoints

### Frontend - Auto-Generated Notes

- [ ] T276a [US10] Add auto-note generation in frontend/src/lib/hooks/useTimer.ts when timer started/stopped (FR-048)
- [ ] T276b [US10] Create note organization tabs in frontend/src/components/notes/NoteTabs.tsx by project and client (FR-049)

### Testing & Validation

- [ ] T277 [US10] Verify clicking "Get AI Suggestions" for Website Redesign project triggers AI analysis
- [ ] T278 [US10] Verify AI returns 3-5 proposals with titles like "Write E2E tests for authentication flow"
- [ ] T279 [US10] Verify each proposal shows priority, effort estimate, and rationale
- [ ] T280 [US10] Verify accepting proposal creates new task with source='ai_proposed' and "AI" badge
- [ ] T281 [US10] Verify rejecting proposal removes it from pending list
- [ ] T282 [US10] Verify automatic proposals trigger when starting timer on project (if aienabled=true)
- [ ] T283 [US10] Verify disabling AI in settings prevents automatic proposals

---

## Phase 13: Polish & Cross-Cutting Concerns

**Goal**: Final refinements, comprehensive testing, error handling, and production readiness

**Duration**: ~8-10 hours

### Error Handling & Validation

- [ ] T284 [P] Add comprehensive error boundaries in frontend/src/components/ErrorBoundary.tsx for React error catching
- [ ] T285 [P] Implement global API error handling in frontend/src/lib/api/client.ts with user-friendly messages
- [ ] T286 [P] Add input validation error messages to all forms using Zod schemas
- [ ] T287 [P] Implement rate limit error handling in backend middleware with 429 responses
- [ ] T288 [P] Add database connection error handling with retry logic in backend/src/lib/db/client.ts

### Security

- [ ] T289 Audit all API endpoints for authentication middleware coverage in backend/src/routes/
- [ ] T290 [P] Implement SQL injection prevention via Drizzle ORM parameterized queries (verify all queries)
- [ ] T291 [P] Add CSRF protection for state-changing requests in backend middleware
- [ ] T292 [P] Implement secure credential storage with encryption for PM system tokens in backend/src/lib/pm-adapters/
- [ ] T293 Verify environment variables never exposed to frontend (check Vite config)

### Performance Optimization

- [ ] T294 [P] Implement query result caching in backend/src/services/ for frequently accessed data
- [ ] T295 [P] Add database indexes per data-model.md specifications (verify all composite indexes created)
- [ ] T296 [P] Optimize dashboard query with single JOIN to fetch tasks, projects, clients in backend/src/services/taskService.ts
- [ ] T297 [P] Implement lazy loading for invoice PDFs to avoid memory issues with large documents
- [ ] T298 Add API response time monitoring to ensure <200ms p95 per performance goals

### Testing

- [ ] T299 [P] Create E2E test for complete user journey: signup → connect PM → view tasks → track time → generate invoice in tests/e2e/complete-workflow.spec.ts
- [ ] T300 [P] Create API integration tests for critical endpoints: auth, tasks, time tracking in tests/integration/api.test.ts
- [ ] T301 [P] Add unit tests for PM adapters with mocked API responses in tests/unit/pm-adapters.test.ts
- [ ] T302 [P] Test timezone handling for due dates and time tracking across different user timezones
- [ ] T303 Verify all quickstart.md scenarios pass end-to-end

### Documentation

- [ ] T304 [P] Document API endpoints in docs/api.md with request/response examples
- [ ] T305 [P] Create deployment guide in docs/deployment.md with environment variable setup
- [ ] T306 [P] Document PM system OAuth setup in docs/pm-integration.md for Jira, Monday, Asana, Trello
- [ ] T307 [P] Update README.md with feature overview, tech stack, and getting started instructions

### Deployment Preparation

- [ ] T308 Create production environment configuration files (.env.production) for frontend and backend
- [ ] T309 [P] Set up database migration scripts for production deployment in backend/package.json
- [ ] T310 [P] Configure production build scripts with optimization flags in vite.config.ts and tsconfig.json
- [ ] T311 [P] Add health check endpoints GET /api/health and GET /api/ready in backend/src/routes/
- [ ] T312 Verify all PM system OAuth redirect URLs configured for production domain

### Final Validation

- [ ] T313 Run complete quickstart.md test scenario from Phase 1 through Phase 7 (15-20 minute test)
- [ ] T314 Verify all success criteria from spec.md met (task aggregation <10s, billing <2min, etc.)
- [ ] T315 Test with multiple PM systems connected simultaneously (Jira + Monday)
- [ ] T316 Verify no duplicate billing possible by attempting to invoice same time entries twice
- [ ] T317 Test sync error recovery by intentionally breaking PM API connection and verifying graceful handling

---

## Dependencies Graph

### Phase Dependencies

```
Phase 1 (Setup) → Phase 2 (Foundational) → All User Stories

Phase 2 →
  ├─ Phase 3 (US1: Auth & PM Connection)
  ├─ Phase 4 (US4: Client & Project Management)

Phase 3 →
  ├─ Phase 4 (US2: Task Aggregation)

Phase 4 (US2) →
  ├─ Phase 5 (US3: Time Tracking)
  ├─ Phase 9 (US7: Bidirectional Sync)
  ├─ Phase 10 (US8: Internal Tasks)

Phase 5 (US3) + Phase 6 (US4) →
  ├─ Phase 7 (US5: Timesheet Generation)
  ├─ Phase 8 (US6: Invoice Generation)

Phase 8 (US6) →
  ├─ Phase 11 (US9: Invoice Email)

Phase 4 (US2) + Phase 6 (US4) →
  ├─ Phase 12 (US10: AI Proposals)

All Phases → Phase 13 (Polish)
```

### User Story Completion Order

1. **Tier 1** (Can start after Phase 2): US1, US4
2. **Tier 2** (Depends on US1): US2
3. **Tier 3** (Depends on US2): US3, US7, US8
4. **Tier 4** (Depends on US3 + US4): US5, US6
5. **Tier 5** (Depends on US6): US9
6. **Tier 6** (Depends on US2 + US4): US10

---

## Parallel Execution Opportunities

### Phase 1 (Setup) - High Parallelism

Tasks T002, T003, T004, T005 can run simultaneously (different directories)
Tasks T006, T007, T008, T009 can run simultaneously (different config files)
Tasks T013, T014, T015, T016 can run simultaneously (different package.json files)

**Example**: Launch 4 agents for T002, T003, T004, T005 simultaneously

### Phase 2 (Foundational) - High Parallelism

Tasks T017-T026 (database schema) can run in parallel (different tables in same file, merged after)
Tasks T030, T031, T032, T033 (middleware) can run in parallel (different files)
Tasks T035, T036, T037, T038 (frontend infrastructure) can run in parallel (different files)
Tasks T039-T045 (shared types) can run in parallel (different files)
Tasks T046, T047, T048, T049, T050 (UI foundation) can run in parallel (different files)

**Example**: Launch 10 agents for T017-T026 simultaneously

### Phase 3 (US1) - Medium Parallelism

Tasks T054, T055, T056 (PM adapters) can run in parallel (different files)
Tasks T062, T063 (auth pages) can run in parallel (different files)

### Phase 4 (US2) - High Parallelism

Tasks T084, T085, T086 (task UI components) can run in parallel (different files)

### Phase 5 (US3) - Medium Parallelism

Tasks T108, T109 (timer components) can run in parallel (different files)

### User Story Parallelism

After Phase 2 completes, **US1 and US4 can be implemented in parallel** (no dependencies)
After US2 completes, **US7 and US8 can be implemented in parallel** (independent features)
After US3+US4 complete, **US5 and US6 can be implemented in parallel** (both use time entries but different endpoints)

---

## MVP Recommendation

**Suggested MVP**: User Stories 1-6 (Phases 1-8)

**Rationale**:

- Delivers complete core workflow: authentication → task viewing → time tracking → billing
- Users can immediately get value: unified task view + accurate billing
- Meets primary success criteria: task aggregation, time tracking accuracy, billing productivity
- Total implementation time: ~60-80 hours
- Can launch and gather user feedback before implementing P2/P3 features

**Post-MVP Roadmap**:

- **Phase 2**: US7 (bidirectional sync), US8 (internal tasks), US9 (email delivery)
- **Phase 3**: US10 (AI proposals) - validates AI acceptance rate before heavy investment

---

## Format Validation

✅ **All tasks follow checklist format**: `- [ ] [ID] [P?] [Story?] Description`
✅ **Task IDs**: Sequential T001-T317
✅ **[P] markers**: Present on parallelizable tasks (different files, no dependencies)
✅ **[Story] labels**: Present on all user story phase tasks (US1-US10)
✅ **File paths**: Included in every task description
✅ **Dependencies**: Clearly documented in graph
✅ **User story organization**: Tasks grouped by story with clear goals and acceptance criteria

---

## Task Execution Summary

**Total Tasks**: 347 (was 317, added 30 tasks: 20 Phase Lifecycle Management + 10 clarification tasks)
**Parallelizable Tasks**: ~140 (marked with [P])
**User Story Tasks**: 287 (T051-T337)
**Estimated Total Time**: 95-115 hours (added ~15 hours for Phase Lifecycle UI + clarifications)

**Task Distribution by User Story**:

- US1 (Auth & PM Connection): 22 tasks
- US2 (Task Aggregation): 24 tasks
- US3 (Time Tracking): 27 tasks
- US4 (Client & Project): 27 tasks
- US5 (Timesheet Generation): 17 tasks
- US6 (Invoice Generation): 26 tasks
- US7 (Bidirectional Sync): 17 tasks
- US8 (Internal Tasks): 26 tasks
- US9 (Invoice Email): 17 tasks
- US10 (AI Proposals): 30 tasks
- Polish: 34 tasks

**Independent Test Criteria per Story**: Each story includes validation tasks against quickstart scenarios

---

**Status**: ✅ Tasks Ready for Implementation
**Next Step**: Begin Phase 1 (Setup) or launch MVP implementation (Phases 1-8)
