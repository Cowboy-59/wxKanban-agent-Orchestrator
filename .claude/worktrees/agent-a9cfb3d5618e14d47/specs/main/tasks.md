# Task Breakdown: wxKanban Multi-Platform Task Management

**Feature**: Multi-Platform Task Management & Time Tracking System
**Branch**: `001-multi-platform-task`
**Date Generated**: 2026-02-12
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Data Model**: [data-model.md](data-model.md)

---

## Executive Summary

This task breakdown converts Phase 1 design artifacts (data-model.md, contracts/openapi.json, quickstart.md) into 67 actionable, dependency-ordered implementation tasks grouped by user story and technical domain.

**Implementation Strategy**:

- **MVP Scope** (Phase 3-5): User Registration, PM Integration, Task Aggregation, Time Tracking, Invoice Generation
- **Post-MVP** (Phase 6-10): 6-Phase Lifecycle, AI Proposals, Advanced Features
- **Parallelization**: Setup tasks run once, then 5 parallel tracks (Auth, PM APIs, Frontend, Services, Testing)

**Estimated Effort**: 45-55 developer-days for MVP (8-12 weeks, 1 dev)

---

## Task Dependencies & Execution Order

```
Phase 1: Setup (7 tasks)
  ├─ Dependencies: None
  └─ Blocks: All other phases

Phase 2: Foundational (14 tasks)
  ├─ Dependencies: Phase 1 complete
  └─ Blocks: All user story phases (3-10)

Phases 3-10: User Stories (Parallel execution possible)
  ├─ Phase 3 (US1 Auth): P1 - CRITICAL PATH
  ├─ Phase 4 (US2 Tasks): Depends on Phase 3
  ├─ Phase 5 (US3 Timer): Parallel with Phase 4
  ├─ Phase 6 (US4 Invoices): Depends on Phase 5
  ├─ Phase 7 (US5 Phases): Parallel with Phase 6
  ├─ Phase 8 (US6 AI): Parallel with Phase 7
  ├─ Phase 9 (US7 Projects): Parallel with Phase 7
  └─ Phase 10 (US8 Notes): Parallel with Phase 9

Phase 11: Polish & Integration (4 tasks)
  ├─ Dependencies: All user story phases complete
  └─ Final: E2E tests, performance tuning, bug fixes
```

### Parallel Execution Examples

**Week 1 (Setup + Foundational)**:

- Setup tasks (T001-T007) run sequentially
- Foundational tasks (T008-T021) run sequentially (depend on database setup)

**Week 2-4 (User Stories)**:
Once Phase 2 complete, execute in this order:

- **Track A (Auth - P1)**: T022-T048 (Phase 3) - Can start immediately after Phase 2
- **Track B (PM APIs - P1)**: T049-T066 (Phase 4) - Depends on Phase 3 complete, can run parallel with Track C
- **Track C (Timer - P1)**: T067-T085 (Phase 5) - Depends on Phase 3 complete, can run parallel with Track B
- **Track D (Invoices - P1)**: T086-T107 (Phase 6) - Depends on Phase 5 complete
- **Track E (6-Phase - P1)**: T108-T135 (Phase 7) - Can run parallel with Track D

**Critical Path**: T001→T007→T008→T021→T022→T048→T049→T066→T086→T107

---

## Phase 1: Project Setup

**Goal**: Initialize Express backend and React frontend projects, setup tooling and infrastructure

### Setup Tasks

- [ ] T001 Initialize Node.js project: Create `package.json` with Express, Vite, React, Drizzle, and dev dependencies
- [ ] T002 Create root `tsconfig.json` with strict mode enabled and paths configured for `src/*` and `@shared/*` aliases
- [ ] T003 Setup Express app in `src/server/index.ts` with middleware (CORS, JSON, error handling)
- [ ] T004 Create React + Vite app in `src/client/` with TypeScript configuration and `vite.config.ts`
- [ ] T005 Create project directory structure per plan.md (src/server/routes/, src/server/services/, src/db/schema/, etc.)
- [ ] T006 Configure PostgreSQL connection in `.env` (DATABASE_URL) and test connection via `psql`
- [ ] T007 Create `.env.example` with all required environment variables documented

**Validation**:

- Node project initializes without errors
- PostgreSQL connection test passes
- Express app starts on port 3001
- Vite dev server starts on port 3000
- Directory structure matches plan.md
- TypeScript compiler runs without errors

---

## Phase 2: Foundation & Infrastructure

**Goal**: Create database schema, authentication foundation, shared utilities

### Database Schema & Migrations

> **Note (2026-04-18):** Schemas were implemented with evolved naming conventions (e.g. `userprofiles`, `companyproject`, `projecttask`). The `src/db/schema/<name>.ts` paths below reflect the file that actually implements each entity. DB migration management uses `drizzle-kit push` against the live DB rather than a full sequential `.sql` history; only targeted migrations live under `src/db/migrations/`.

- [x] T008 [P] Create Drizzle schema file for User entity → `src/db/schema/userprofiles.ts` (`userprofiles` table)
- [x] T009 [P] Create Drizzle schema file for Session in `src/db/schema/session.ts` (for JWT tracking)
- [x] T010 [P] Create Drizzle schema file for PMSystemConnection in `src/db/schema/pmSystemConnection.ts`
- [x] T011 [P] Create Drizzle schema file for Project → `src/db/schema/companyproject.ts`
- [x] T012 [P] Create Drizzle schema file for Task → `src/db/schema/projecttask.ts`
- [x] T013 [P] Create Drizzle schema file for TimeEntry → `src/db/schema/projecttimeentry.ts`
- [x] T014 [P] Create Drizzle schema file for Invoice → `src/db/schema/projectinvoice.ts`
- [x] T015 [P] Create Drizzle schema file for ProjectPhase in `src/db/schema/projectphase.ts`
- [x] T016 [P] Create Drizzle schema file for Specification → `src/db/schema/projectspecification.ts`
- [x] T017 [P] Create Drizzle schema file for TestPlan in `src/db/schema/testPlan.ts`
- [x] T018 [P] Create Drizzle schema file for Feedback in `src/db/schema/feedback.ts`
- [x] T019 Create Drizzle schema file for Note in `src/db/schema/note.ts`
- [x] T020 Generate Drizzle migrations — snapshot in `src/db/migrations/meta/0000_snapshot.json`; targeted migrations under `src/db/migrations/*.sql` (workflow now uses `drizzle-kit push`)
- [x] T021 Execute migrations — live DB has all tables; downstream specs (auth, invoices, audit, etc.) are operational

### Logging & Utilities

- [x] T022 Setup Pino logger instance in `src/server/lib/logger.ts` with JSON output format and namespace support
- [x] T023 Create encryption utilities in `src/server/lib/crypto.ts` (AES-256-GCM for token encryption/decryption)
- [x] T024 Create JWT utilities in `src/server/lib/jwt.ts` (sign, verify, decode with 24-hour expiry)
- [x] T025 API client utilities — retry/error-handling implemented in `src/server/lib/retry-handler.ts`; per-PM clients live alongside their integration modules (no single `api-client.ts`)
- [x] T026 Create database client in `src/server/lib/db.ts` (Drizzle ORM instance with connection pooling)

**Validation**:

- All 11 schema files created with correct field types and relationships
- Database migrations execute successfully
- Logger outputs JSON with namespaces
- Encryption/decryption roundtrip works for token data
- JWT sign/verify works with 24-hour expiry

---

## Phase 3: User Story 1 - User Registration & PM System Connection [US1]

**Goal**: Enable users to register, authenticate, and connect external PM systems (P1 - Critical Path)

**Dependencies**: Phase 2 complete

**Independent Test Criteria**:

- [ ] New user can register with email/password and receive JWT token
- [ ] User JWT token is valid for 24 hours
- [ ] User can sign in with existing credentials
- [ ] User can add Jira and Monday.com connections via OAuth2
- [ ] Multiple PM connections per user supported
- [ ] Connected PM systems appear in user settings with sync status
- [ ] Token encryption/decryption works for stored credentials

### Contract Tests

- [x] T027 [P] Create contract test for `POST /auth/register` in `tests/contract/auth.test.ts`
- [x] T028 [P] Create contract test for `POST /auth/signin` in `tests/contract/auth.test.ts`
- [x] T029 [P] Create contract test for `POST /auth/signout` in `tests/contract/auth.test.ts`
- [x] T030 [P] Create contract test for `POST /auth/forgot-password` in `tests/contract/auth.test.ts`
- [x] T031 [P] Create contract test for `GET /auth/me` in `tests/contract/auth.test.ts`
- [x] T032 [P] Create contract test for `POST /api/pm-systems/connect` in `tests/contract/pm-systems.test.ts`
- [x] T033 [P] Create contract test for `GET /api/pm-systems` in `tests/contract/pm-systems.test.ts`
- [x] T034 [P] Create contract test for `DELETE /api/pm-systems/{id}` in `tests/contract/pm-systems.test.ts`

### Backend Implementation

- [x] T035 Create authentication service in `src/server/services/auth.ts` with register, signin, token generation, password reset logic
- [x] T036 Create `POST /auth/register` endpoint in `src/server/routes/auth.ts` with email validation and password strength check
- [x] T037 Create `POST /auth/signin` endpoint in `src/server/routes/auth.ts` with rate limiting (max 5 attempts/min)
- [x] T038 Create `POST /auth/signout` endpoint in `src/server/routes/auth.ts` with session cleanup
- [x] T039 Create `POST /auth/forgot-password` endpoint in `src/server/routes/auth.ts` with email-based reset
- [x] T040 Create `GET /auth/me` endpoint in `src/server/routes/auth.ts` for retrieving current user
- [x] T041 Create JWT authentication middleware in `src/server/middleware/auth.ts` for validating all authenticated endpoints
- [x] T042 [P] Create PM API client adapters in `src/server/lib/pm-api-clients/jira.ts` (OAuth2 + API calls)
- [x] T043 [P] Create PM API client adapter in `src/server/lib/pm-api-clients/monday.ts`
- [x] T044 [P] Create PM API client adapter in `src/server/lib/pm-api-clients/asana.ts`
- [x] T045 [P] Create PM API client adapter in `src/server/lib/pm-api-clients/trello.ts`
- [x] T046 Create OAuth2 manager in `src/server/lib/oauth2-manager.ts` for handling OAuth flows across PM systems
- [x] T047 Create `POST /api/pm-systems/connect` endpoint in `src/server/routes/pm-systems.ts` with OAuth callback handling
- [x] T048 Create `GET /api/pm-systems` endpoint in `src/server/routes/pm-systems.ts` for listing connected systems
- [x] T049 Create `DELETE /api/pm-systems/{id}` endpoint in `src/server/routes/pm-systems.ts` for disconnecting

### Frontend Implementation

- [x] T050 [P] Create login page component in `src/client/pages/login.tsx` with email/password form
- [x] T051 [P] Create registration page component in `src/client/pages/register.tsx` with email/password + validation feedback
- [x] T052 Create password reset request page in `src/client/pages/forgot-password.tsx`
- [x] T053 Create password reset confirmation page in `src/client/pages/reset-password.tsx`
- [x] T054 [P] Create PM connection settings component in `src/client/components/PMConnections.tsx` with add/disconnect flows
- [x] T055 Create OAuth redirect handler component in `src/client/pages/oauth-callback.tsx`
- [x] T056 Create auth API client in `src/client/lib/api/auth.ts` with register, signin, signout, fetchMe calls

### Integration Tests

- [x] T057 Create integration test for full registration + PM connection workflow in `tests/integration/auth-pm-connection.test.ts`

> **Audit 2026-04-18** — Phase 3 is 31/31 complete.
>
> Forgot-password flow closed this session: `createApp()` factory in [src/server/app.ts](../../src/server/app.ts), new `passwordresettokens` table (migration `0002_add_passwordresettokens.sql`), `POST /api/auth/forgot-password` + `POST /api/auth/reset-password` in [src/server/routes/auth.ts](../../src/server/routes/auth.ts), and client pages [ForgotPassword.tsx](../../src/client/pages/auth/ForgotPassword.tsx) + [ResetPassword.tsx](../../src/client/pages/auth/ResetPassword.tsx). Note T052/T053 use PascalCase filenames under `pages/auth/` to match the existing `Login.tsx` / `Register.tsx` convention.

**Validation**:

- All contract tests pass
- Integration test passes
- User registration creates database record with bcrypt password
- JWT token issued on signin works for all authenticated endpoints
- PM OAuth flows complete successfully
- Encrypted tokens stored and retrieved correctly

---

## Phase 4: User Story 2 - Task Aggregation & Management [US2]

**Goal**: Aggregate tasks from multiple PM systems and provide unified view (P1)

**Dependencies**: Phase 3 complete (users + PM connections)

**Independent Test Criteria**:

- [ ] Dashboard displays tasks from 2+ PM systems in < 10 seconds
- [ ] Tasks filtered by priority, due date, status
- [ ] Tasks marked as "orphaned" when PM system deletes them
- [ ] Internal tasks created and displayed alongside PM tasks
- [ ] Task status updates sync back to PM system within 5 minutes
- [ ] Task distinction (internal vs external) visible in UI

### Contract Tests

- [ ] T058 [P] Create contract test for `GET /api/tasks` (list, filter, sort) in `tests/contract/tasks.test.ts`
- [ ] T059 [P] Create contract test for `POST /api/tasks` (create internal task) in `tests/contract/tasks.test.ts`
- [ ] T060 [P] Create contract test for `PATCH /api/tasks/{id}` (update task) in `tests/contract/tasks.test.ts`
- [ ] T061 [P] Create contract test for `GET /api/tasks/{id}` (get task details) in `tests/contract/tasks.test.ts`

### Backend Implementation

- [ ] T062 Create PM sync service in `src/server/services/pm-sync.ts` with polling logic (5-15 min intervals)
- [ ] T063 Create background job setup with Bull queue in `src/server/services/pm-sync-worker.ts`
- [ ] T064 Create task query service in `src/server/services/task-query.ts` for filtering, sorting, aggregation
- [ ] T065 Create `GET /api/tasks` endpoint in `src/server/routes/tasks.ts` with filter/sort parameters
- [ ] T066 Create `POST /api/tasks` endpoint in `src/server/routes/tasks.ts` for creating internal tasks
- [ ] T067 Create `PATCH /api/tasks/{id}` endpoint in `src/server/routes/tasks.ts` for updating tasks (syncs to PM system)
- [ ] T068 Create `GET /api/tasks/{id}` endpoint in `src/server/routes/tasks.ts` for task details

### Frontend Implementation

- [ ] T069 [P] Create TaskDashboard component in `src/client/components/TaskDashboard.tsx` with task list, filtering, sorting
- [ ] T070 [P] Create TaskCard component in `src/client/components/TaskCard.tsx` for individual task display
- [ ] T071 Create task filter component in `src/client/components/TaskFilters.tsx` (priority, status, due date, PM source)
- [ ] T072 Create internal task creation modal in `src/client/components/CreateTaskModal.tsx`
- [ ] T073 Create task detail view in `src/client/components/TaskDetail.tsx`
- [ ] T074 Create tasks API client in `src/client/lib/api/tasks.ts`

### Integration Tests

- [ ] T075 Create integration test for task aggregation from 2+ PM systems in `tests/integration/task-aggregation.test.ts`
- [ ] T076 Create integration test for orphaned task handling in `tests/integration/orphaned-tasks.test.ts`

**Validation**:

- Contract tests pass
- Dashboard loads within 10 seconds with 50+ tasks
- Filter/sort operations work across PM systems
- Orphaned tasks hidden from active view but preserved in database

---

## Phase 5: User Story 3 - Time Tracking [US3]

**Goal**: Enable users to track time on tasks with pause/resume and billing integration (P1)

**Dependencies**: Phase 3 complete (users), Phase 4 complete (tasks)

**Independent Test Criteria**:

- [ ] User can start timer on single task
- [ ] User can pause and resume timer
- [ ] Timer accuracy is ±60 seconds
- [ ] Timer exceeding 8 hours prompts for confirmation
- [ ] Billable flag set per time entry
- [ ] Multiple concurrent timers on different tasks supported
- [ ] Time entry history accessible and editable

### Contract Tests

- [ ] T077 [P] Create contract test for `POST /api/tasks/{id}/start-timer` in `tests/contract/time-tracking.test.ts`
- [ ] T078 [P] Create contract test for `POST /api/tasks/{id}/stop-timer` in `tests/contract/time-tracking.test.ts`
- [ ] T079 [P] Create contract test for `PATCH /api/tasks/{id}/timer/pause` in `tests/contract/time-tracking.test.ts`
- [ ] T080 [P] Create contract test for `PATCH /api/tasks/{id}/timer/resume` in `tests/contract/time-tracking.test.ts`
- [ ] T081 [P] Create contract test for `GET /api/time-entries` (list) in `tests/contract/time-tracking.test.ts`
- [ ] T082 [P] Create contract test for `PATCH /api/time-entries/{id}` (edit entry) in `tests/contract/time-tracking.test.ts`

### Backend Implementation

- [ ] T083 Create time tracking service in `src/server/services/time-tracking.ts` with start/stop/pause/resume logic
- [ ] T084 Create `POST /api/tasks/{id}/start-timer` endpoint in `src/server/routes/time-entries.ts`
- [ ] T085 Create `POST /api/tasks/{id}/stop-timer` endpoint in `src/server/routes/time-entries.ts` with duration calculation and inactivity check (8-hour threshold)
- [ ] T086 Create `PATCH /api/tasks/{id}/timer/pause` endpoint in `src/server/routes/time-entries.ts`
- [ ] T087 Create `PATCH /api/tasks/{id}/timer/resume` endpoint in `src/server/routes/time-entries.ts`
- [ ] T088 Create `GET /api/time-entries` endpoint in `src/server/routes/time-entries.ts` with filtering
- [ ] T089 Create `PATCH /api/time-entries/{id}` endpoint in `src/server/routes/time-entries.ts` for manual entry editing

### Frontend Implementation

- [ ] T090 [P] Create TimeTracker component in `src/client/components/TimeTracker.tsx` with start/stop/pause buttons and elapsed display
- [ ] T091 [P] Create InactivityWarning component in `src/client/components/InactivityWarning.tsx` for 8-hour threshold
- [ ] T092 Create TimeEntryHistory component in `src/client/components/TimeEntryHistory.tsx` for listing past entries
- [ ] T093 Create TimeEntryEditor component in `src/client/components/TimeEntryEditor.tsx` for manual editing
- [ ] T094 Create time tracking hooks in `src/client/lib/hooks/useTimer.ts` (client-side timer logic)
- [ ] T095 Create time-entries API client in `src/client/lib/api/time-entries.ts`

### Integration Tests

- [ ] T096 Create integration test for complete time tracking workflow in `tests/integration/time-tracking.test.ts`
- [ ] T097 Create integration test for inactivity detection in `tests/integration/inactivity-detection.test.ts`

**Validation**:

- Contract tests pass
- Integration tests pass
- Timer accuracy validated against server time
- Pause/resume state persistence works correctly

---

## Phase 6: User Story 4 - Invoicing & Billing [US4]

**Goal**: Generate invoices and timesheets from tracked time (P1)

**Dependencies**: Phase 5 complete (time entries)

**Independent Test Criteria**:

- [ ] Invoice generation completes in < 2 minutes
- [ ] Billable hours correctly aggregated by project and date range
- [ ] Invoice calculations accurate (hours × hourly rate)
- [ ] PDF download works with correct filename
- [ ] Invoice email delivery tracked
- [ ] Time entries marked as invoiced to prevent duplicates
- [ ] CSV export available for accounting software

### Contract Tests

- [ ] T098 [P] Create contract test for `POST /api/invoices/generate` in `tests/contract/invoicing.test.ts`
- [ ] T099 [P] Create contract test for `POST /api/invoices/{id}/send` in `tests/contract/invoicing.test.ts`
- [ ] T100 [P] Create contract test for `GET /api/invoices` in `tests/contract/invoicing.test.ts`
- [ ] T101 [P] Create contract test for `GET /api/invoices/{id}/download` in `tests/contract/invoicing.test.ts`

### Backend Implementation

- [ ] T102 Create billing service in `src/server/services/billing.ts` with invoice calculation and CSV export
- [ ] T103 Create PDF generation service in `src/server/services/pdf-generator.ts` using Puppeteer for invoice rendering
- [ ] T104 Create email service in `src/server/services/email.ts` for Sendgrid integration
- [ ] T105 Create `POST /api/invoices/generate` endpoint in `src/server/routes/invoices.ts` with billable aggregation and PDF generation
- [ ] T106 Create `POST /api/invoices/{id}/send` endpoint in `src/server/routes/invoices.ts` with email delivery tracking
- [ ] T107 Create `GET /api/invoices` endpoint in `src/server/routes/invoices.ts` for listing invoices
- [ ] T108 Create `GET /api/invoices/{id}/download` endpoint in `src/server/routes/invoices.ts` for PDF download

### Frontend Implementation

- [ ] T109 [P] Create InvoiceGenerator component in `src/client/components/InvoiceGenerator.tsx` with date range, project selection, preview
- [ ] T110 [P] Create InvoicePreview component in `src/client/components/InvoicePreview.tsx` showing itemized breakdown
- [ ] T111 Create InvoiceHistory component in `src/client/components/InvoiceHistory.tsx` for past invoices
- [ ] T112 Create invoices API client in `src/client/lib/api/invoices.ts`

### Integration Tests

- [ ] T113 Create integration test for invoice generation workflow in `tests/integration/invoice-generation.test.ts`
- [ ] T114 Create integration test for duplicate billing prevention in `tests/integration/duplicate-prevention.test.ts`

**Validation**:

- Invoice generation completes < 2 minutes
- Calculations accurate (test with known data)
- PDF renders correctly
- Email delivery tracked
- CSV exports properly formatted

---

## Phase 7: User Story 5 - 6-Phase Project Lifecycle [US5]

**Goal**: Enforce 6-phase quality workflow with specifications and feedback (P1)

**Dependencies**: Phase 3 complete (users), Phase 4 complete (tasks)

**Independent Test Criteria**:

- [ ] New project initializes with 6 phases in pending state
- [ ] Phase transitions blocked until criteria met
- [ ] All specifications must be approved before Phase 1 complete
- [ ] All tasks must be complete before Phase 2 complete
- [ ] All tests must pass before Phase 3 complete
- [ ] Phase reopening logs reason and timestamp
- [ ] Concurrent phase work allowed (reopened phase doesn't block others)

### Contract Tests

- [ ] T115 [P] Create contract test for `POST /api/projects` in `tests/contract/projects.test.ts`
- [ ] T116 [P] Create contract test for `GET /api/projects` in `tests/contract/projects.test.ts`
- [ ] T117 [P] Create contract test for `GET /api/projects/{id}/phases` in `tests/contract/phases.test.ts`
- [ ] T118 [P] Create contract test for `POST /api/projects/{id}/phases/{phaseName}/complete` in `tests/contract/phases.test.ts`
- [ ] T119 [P] Create contract test for `POST /api/projects/{id}/phases/{phaseName}/reopen` in `tests/contract/phases.test.ts`
- [ ] T120 [P] Create contract test for `POST /api/specifications` in `tests/contract/specifications.test.ts`
- [ ] T121 [P] Create contract test for `PATCH /api/specifications/{id}` in `tests/contract/specifications.test.ts`
- [ ] T122 [P] Create contract test for `GET /api/projects/{id}/specifications` in `tests/contract/specifications.test.ts`

### Backend Implementation

- [ ] T123 Create phase manager service in `src/server/services/phase-manager.ts` with transition validation
- [ ] T124 Create specifications service in `src/server/services/specifications.ts` for CRUD operations
- [ ] T125 Create test plans service in `src/server/services/test-plans.ts` for test execution tracking
- [ ] T126 Create `POST /api/projects` endpoint in `src/server/routes/projects.ts` with initial 6-phase structure
- [ ] T127 Create `GET /api/projects` endpoint in `src/server/routes/projects.ts` with filtering
- [ ] T128 Create `GET /api/projects/{id}/phases` endpoint in `src/server/routes/phases.ts` for phase status
- [ ] T129 Create `POST /api/projects/{id}/phases/{phaseName}/complete` endpoint in `src/server/routes/phases.ts` with validation
- [ ] T130 Create `POST /api/projects/{id}/phases/{phaseName}/reopen` endpoint in `src/server/routes/phases.ts` with logging
- [ ] T131 Create `POST /api/specifications` endpoint in `src/server/routes/specifications.ts` for creating specs
- [ ] T132 Create `PATCH /api/specifications/{id}` endpoint in `src/server/routes/specifications.ts` for status updates
- [ ] T133 Create `GET /api/projects/{id}/specifications` endpoint in `src/server/routes/specifications.ts` for listing specs

### Frontend Implementation

- [ ] T134 [P] Create PhaseBoard component in `src/client/components/PhaseBoard.tsx` showing all 6 phases with progress
- [ ] T135 [P] Create SpecificationEditor component in `src/client/components/SpecificationEditor.tsx` for creating/editing specs
- [ ] T136 Create SpecificationApproval component in `src/client/components/SpecificationApproval.tsx`
- [ ] T137 Create PhaseCompletionDialog component in `src/client/components/PhaseCompletionDialog.tsx`
- [ ] T138 Create projects API client in `src/client/lib/api/projects.ts`
- [ ] T139 Create phases API client in `src/client/lib/api/phases.ts`
- [ ] T140 Create specifications API client in `src/client/lib/api/specifications.ts`

### Integration Tests

- [ ] T141 Create integration test for 6-phase lifecycle workflow in `tests/integration/phase-lifecycle.test.ts`
- [ ] T142 Create integration test for phase reopening in `tests/integration/phase-reopening.test.ts`

**Validation**:

- Phase transition logic enforced correctly
- Specs must be approved before Phase 1 complete
- All phase transitions logged
- Reopened phases tracked properly

---

## Phase 8: User Story 6 - AI-Assisted Task Management [US6]

**Goal**: AI analyzes project and proposes additional tasks (P2)

**Dependencies**: Phase 3 complete (users), Phase 4 complete (tasks)

**Independent Test Criteria**:

- [ ] AI triggered when user starts timer or work on project
- [ ] Gemini API called with project context (fallback to OpenAI)
- [ ] Proposals cached for 1 hour to avoid duplicate API calls
- [ ] Accepted proposals create internal tasks with source='ai_proposed'
- [ ] User can accept/reject individual proposals
- [ ] User preference toggle respected (disable AI proposals)

### Contract Tests

- [ ] T143 [P] Create contract test for `POST /api/ai-proposals` in `tests/contract/ai-proposals.test.ts`
- [ ] T144 [P] Create contract test for `PATCH /api/ai-proposals/{id}` (accept/reject) in `tests/contract/ai-proposals.test.ts`
- [ ] T145 [P] Create contract test for `GET /api/ai-proposals` (list pending) in `tests/contract/ai-proposals.test.ts`

### Backend Implementation

- [ ] T146 Create AI proposals service in `src/server/services/ai-proposals.ts` with Gemini API integration
- [ ] T147 Create `POST /api/ai-proposals` endpoint in `src/server/routes/ai-proposals.ts` (trigger analysis)
- [ ] T148 Create `PATCH /api/ai-proposals/{id}` endpoint in `src/server/routes/ai-proposals.ts` (accept/reject)
- [ ] T149 Create `GET /api/ai-proposals` endpoint in `src/server/routes/ai-proposals.ts` (list pending)
- [ ] T150 Create proposal caching layer in `src/server/services/proposal-cache.ts` (1-hour TTL)

### Frontend Implementation

- [ ] T151 [P] Create AIProposals component in `src/client/components/AIProposals.tsx` showing proposals with accept/reject buttons
- [ ] T152 Create AIPreferences component in `src/client/components/AIPreferences.tsx` for enabling/disabling proposals
- [ ] T153 Create ai-proposals API client in `src/client/lib/api/ai-proposals.ts`

### Integration Tests

- [ ] T154 Create integration test for AI proposal workflow in `tests/integration/ai-proposals.test.ts`

**Validation**:

- Gemini API calls receive context correctly
- Proposals cached and not repeated
- Accepted proposals create tasks with correct source
- User preference toggle works

---

## Phase 9: User Story 7 - Project & Client Management [US7]

**Goal**: Manage projects, clients, rates, and budgets (P2)

**Dependencies**: Phase 3 complete (users)

**Independent Test Criteria**:

- [ ] Projects created and associated with users
- [ ] Multiple PM systems can be linked to single project
- [ ] Hourly rates and allocated hours configured per project
- [ ] Project total hours tracked and compared against budget
- [ ] Billable vs non-billable hours distinguished

### Contract Tests

- [ ] T155 [P] Create contract test for `PATCH /api/projects/{id}` (update project) in `tests/contract/projects.test.ts`
- [ ] T156 [P] Create contract test for `GET /api/projects/{id}` (project details) in `tests/contract/projects.test.ts`
- [ ] T157 [P] Create contract test for `GET /api/projects/{id}/hours` (hours summary) in `tests/contract/projects.test.ts`

### Backend Implementation

- [ ] T158 Create project service in `src/server/services/projects.ts` with client management
- [ ] T159 Create `PATCH /api/projects/{id}` endpoint in `src/server/routes/projects.ts` (update hourly rate, allocate hours)
- [ ] T160 Create `GET /api/projects/{id}` endpoint in `src/server/routes/projects.ts` (project details with rates)
- [ ] T161 Create `GET /api/projects/{id}/hours` endpoint in `src/server/routes/projects.ts` (billable/non-billable summary)

### Frontend Implementation

- [ ] T162 [P] Create ProjectSettings component in `src/client/components/ProjectSettings.tsx` for configuring rates and allocations
- [ ] T163 [P] Create ProjectHoursSummary component in `src/client/components/ProjectHoursSummary.tsx` showing hours vs budget
- [ ] T164 Create projects API client extensions in `src/client/lib/api/projects.ts`

### Integration Tests

- [ ] T165 Create integration test for project management workflow in `tests/integration/project-management.test.ts`

**Validation**:

- Projects created and hourly rates configured
- Hours summaries calculated correctly
- Budget tracking functional

---

## Phase 10: User Story 8 - Notes & Documentation [US8]

**Goal**: Capture project notes and auto-generated documentation (P3)

**Dependencies**: Phase 3 complete (users), Phase 4 complete (tasks)

**Independent Test Criteria**:

- [ ] User can enter notes per project
- [ ] Notes timestamped and author tracked
- [ ] System generates automatic notes on key actions
- [ ] Notes searchable and filterable by date

### Contract Tests

- [ ] T166 [P] Create contract test for `POST /api/notes` in `tests/contract/notes.test.ts`
- [ ] T167 [P] Create contract test for `GET /api/projects/{id}/notes` in `tests/contract/notes.test.ts`
- [ ] T168 [P] Create contract test for `PATCH /api/notes/{id}` in `tests/contract/notes.test.ts`

### Backend Implementation

- [ ] T169 Create notes service in `src/server/services/notes.ts` with auto-generation for key actions
- [ ] T170 Create `POST /api/notes` endpoint in `src/server/routes/notes.ts` for user notes
- [ ] T171 Create `GET /api/projects/{id}/notes` endpoint in `src/server/routes/notes.ts` for listing project notes
- [ ] T172 Create `PATCH /api/notes/{id}` endpoint in `src/server/routes/notes.ts` for editing notes

### Frontend Implementation

- [ ] T173 [P] Create NotesPanel component in `src/client/components/NotesPanel.tsx` for note entry and viewing
- [ ] T174 Create notes API client in `src/client/lib/api/notes.ts`

### Integration Tests

- [ ] T175 Create integration test for notes workflow in `tests/integration/notes.test.ts`

**Validation**:

- Notes created and retrieved correctly
- Timestamps accurate
- System auto-notes working

---

## Phase 11: Polish & Integration

**Goal**: Cross-cutting concerns, E2E tests, performance optimization

**Dependencies**: All user story phases complete

### E2E Testing & Validation

- [ ] T176 [P] Create comprehensive E2E test for user registration → PM connection → task aggregation → timer → invoice flow in `tests/e2e/complete-workflow.spec.ts`
- [ ] T177 [P] Create E2E test for 6-phase lifecycle workflow in `tests/e2e/phase-lifecycle.spec.ts`
- [ ] T178 [P] Create E2E test for invoicing workflow in `tests/e2e/invoicing.spec.ts`
- [ ] T179 [P] Create E2E test for AI proposals workflow in `tests/e2e/ai-proposals.spec.ts`

### Error Handling & Edge Cases

- [ ] T180 Create comprehensive error handling for PM API failures (timeouts, auth failures, rate limits) in `src/server/middleware/error-handler.ts`
- [ ] T181 Create error boundary component in `src/client/components/ErrorBoundary.tsx` for React error handling
- [ ] T182 Create network error recovery in `src/client/lib/hooks/useApi.ts` with exponential backoff
- [ ] T183 Implement concurrent timer conflict resolution (only one active timer per task allowed)

### Performance Optimization

- [ ] T184 Add database query indexes on frequently-filtered columns (userid, projectid, status, createdAt)
- [ ] T185 Implement TanStack Query caching strategies in `src/client/lib/query-client.ts`
- [ ] T186 Add request deduplication for duplicate API calls within 1-second window
- [ ] T187 Optimize PM sync background job to prevent API rate limit hits

### Documentation & Deployment

- [ ] T188 Create CONTRIBUTING.md with development setup instructions
- [ ] T189 Create API documentation in `docs/API.md` with examples for each endpoint
- [ ] T190 Create troubleshooting guide in `docs/TROUBLESHOOTING.md`
- [ ] T191 Create deployment guide in `docs/DEPLOYMENT.md`

**Validation**:

- All E2E tests pass
- Error scenarios handled gracefully
- Performance targets met (dashboard < 10s, sync < 5min, invoice < 2min)
- Documentation complete

---

## Task Summary

| Phase        | Goal                                    | Task Count    | Parallelizable    |
| ------------ | --------------------------------------- | ------------- | ----------------- |
| **Phase 1**  | Setup & Initialization                  | 7             | Sequential        |
| **Phase 2**  | Foundational Infrastructure             | 14            | 9/14 (64%)        |
| **Phase 3**  | US1 - User Registration & PM Connection | 31            | 18/31 (58%)       |
| **Phase 4**  | US2 - Task Aggregation                  | 18            | 10/18 (56%)       |
| **Phase 5**  | US3 - Time Tracking                     | 22            | 12/22 (55%)       |
| **Phase 6**  | US4 - Invoicing & Billing               | 17            | 10/17 (59%)       |
| **Phase 7**  | US5 - 6-Phase Lifecycle                 | 27            | 14/27 (52%)       |
| **Phase 8**  | US6 - AI Proposals                      | 12            | 7/12 (58%)        |
| **Phase 9**  | US7 - Project Management                | 11            | 6/11 (55%)        |
| **Phase 10** | US8 - Notes & Documentation             | 10            | 5/10 (50%)        |
| **Phase 11** | Polish & Integration                    | 16            | 8/16 (50%)        |
| **TOTAL**    | Complete Feature                        | **185 tasks** | **109/185 (59%)** |

---

## Recommended MVP Scope

**MVP (Weeks 1-8)**: Phases 1-6 only (87 tasks)

- User Registration & Authentication ✅
- PM System Integration & OAuth ✅
- Task Aggregation from 2+ PM systems ✅
- Time Tracking with Pause/Resume ✅
- Invoice Generation & Email ✅

**Post-MVP (Weeks 9-12)**: Phases 7-11

- 6-Phase Lifecycle Management
- AI-Assisted Proposals
- Advanced Features
- E2E Testing & Polish

**Critical Path Tasks** (must complete in order):
T001 → T007 → T008 → T021 → T027 → T048 → T057 → T058 → T075 → T077 → T096 → T098 → T113

---

## Success Metrics

Upon completion, the following should be true:

✅ All 185 tasks marked complete
✅ All contract tests passing (48 tests across all domains)
✅ All integration tests passing (14 tests covering workflows)
✅ All E2E tests passing (4 complete user journeys)
✅ Dashboard loads within 10 seconds
✅ PM sync works with 99% reliability
✅ Invoices generate within 2 minutes
✅ 100% TypeScript compilation success
✅ Zero console.log statements (Pino only)
✅ All secrets in environment variables
✅ Database schema correct with proper relationships
✅ Authentication working with 24-hour JWT expiry
✅ All 11 entities created with full CRUD operations

---

**Status**: ✅ Ready for implementation
**Generated**: 2026-02-12
**Command**: `/speckit.tasks`
