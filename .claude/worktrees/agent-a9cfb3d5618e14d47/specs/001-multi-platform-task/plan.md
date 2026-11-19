# Implementation Plan: Multi-Platform Task Management System

**Branch**: `001-multi-platform-task` | **Date**: 2026-01-22 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-multi-platform-task/spec.md`

## Execution Flow (/plan command scope)

```
1. Load feature spec from Input path
   → Loaded: 82 functional requirements across 13 categories (79 active, 3 deferred)
2. Fill Technical Context (scan for NEEDS CLARIFICATION)
   → Detected: Web application (React + Express/Fastify separate architecture)
   → Set Structure Decision: React frontend + Express/Fastify backend (frontend/ and backend/ directories)
3. Fill the Constitution Check section based on constitution
   → Constitution v1.2.0 requirements validated
4. Evaluate Constitution Check section
   → Status: PASS - All requirements align with constitution (after amendment)
   → Update Progress Tracking: Initial Constitution Check ✓
5. Execute Phase 0 → research.md
   → Research PM system APIs, sync strategies, AI integration patterns
6. Execute Phase 1 → contracts, data-model.md, quickstart.md, CLAUDE.md
   → Generate API contracts, data models, agent context
7. Re-evaluate Constitution Check section
   → Post-Design validation
8. Plan Phase 2 → Describe task generation approach
9. STOP - Ready for /tasks command
```

**IMPORTANT**: The /plan command STOPS at step 7. Phases 2-4 are executed by other commands:

- Phase 2: /tasks command creates tasks.md
- Phase 3-4: Implementation execution (manual or via tools)

## Summary

wxKanban is a unified task management and time tracking system for independent developers. It aggregates tasks from multiple project management platforms (Jira, Monday.com, Asana, Trello), provides an optional internal task management system, tracks time with billable/non-billable categorization, generates invoices and timesheets, and uses AI to suggest additional tasks. The system synchronizes bidirectionally with external PM systems while maintaining a single source of truth for time tracking and billing.

**Technical Approach**:

- React 18+ frontend with TypeScript for modern, type-safe UI development
- Express/Fastify backend for RESTful API with high performance
- PostgreSQL with Drizzle ORM for relational data with complex relationships
- Clerk authentication with RBAC for secure multi-tenant user management
- TanStack Query (React Query) for optimistic updates and SWR-style caching
- Background job system for PM system synchronization and API rate limiting
- AI integration via OpenAI/Gemini APIs for task proposals

## Technical Context

**Language/Version**: TypeScript 5.x with strict mode
**Frontend Framework**: React 18+ with TypeScript
**Backend Framework**: Express or Fastify (Node.js)
**Primary Dependencies**:

- Frontend: React 18+, TanStack Query (React Query), React Router, Axios
- Backend: Express/Fastify, Drizzle ORM, Zod validation
- Shared: Clerk for authentication, TypeScript type sharing
- PM system SDKs: Jira API client, Monday.com SDK, Asana API, Trello API
- AI SDKs: OpenAI SDK, Google Generative AI SDK
- Email service: Resend or similar for invoice delivery
- Build tools: Vite (frontend), tsx/ts-node (backend)

**Storage**: PostgreSQL 15+ with UUID v7 primary keys
**Testing**: Vitest for unit tests, Supertest for API tests, Playwright for E2E tests
**Target Platform**: Web application (modern browsers: Chrome, Firefox, Safari, Edge)
**Project Type**: web - Separate frontend (React SPA) and backend (Express/Fastify REST API)
**Performance Goals**:

- API response time <200ms (p95)
- Dashboard load time <2 seconds
- Support 10,000 concurrent users
- Handle 100+ tasks per user without performance degradation
- PM system sync every 5-15 minutes (configurable)

**Constraints**:

- Must respect external PM system API rate limits (Jira: 150 req/min, Monday: 100 req/min)
- Must handle authentication expiration gracefully for all PM systems
- Must maintain data consistency across bidirectional sync
- Must prevent duplicate time entry billing
- Must clearly distinguish internal vs external task sources

**Scale/Scope**:

- Single-user accounts (no team collaboration in v1)
- 4 PM system integrations (Jira, Monday.com, Asana, Trello)
- Unlimited tasks, projects, and time entries per user
- 82 functional requirements across authentication, PM integration, task management, time tracking, billing, AI features, and 6-phase project lifecycle (79 active, FR-051-053 deferred)

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

### ✅ I. Full-Stack Architecture

- **Frontend Framework**: React 18+ with TypeScript ✓
- **Backend Framework**: Express/Fastify (Node.js) ✓
- **Database**: PostgreSQL with Drizzle ORM ✓
- **Authentication**: Custom JWT with bcrypt password hashing, httpOnly refresh tokens, token family reuse detection ✓
- **State Management**: TanStack Query (React Query) with SWR-style caching ✓
- **API Communication**: RESTful APIs with type-safe contracts ✓

**Status**: PASS - All core architectural requirements met (Constitution v1.2.0)

### ✅ III. Database & Naming Conventions

- **Table Naming**: Singular (e.g., `user`, `task`, `timeentry`) ✓
- **Primary Keys**: UUID v7 format via `pg_uuidv7()` ✓
- **Foreign Keys**: Consistent naming (e.g., `task.userid`, `timeentry.taskid`) ✓
- **Field Naming**: `lowercase` for PostgreSQL, `camelCase` for TypeScript ✓
- **No Underscores**: Enforced across all names ✓
- **Schema Changes**: `db:generate` → `db:migrate` workflow enforced ✓

**Status**: PASS - All naming conventions aligned with constitution

### ✅ IV. Code Quality & Styling

- **TypeScript**: All code in TypeScript with strict mode ✓
- **Testing**: Integration tests with real PM API interactions (using test accounts) ✓
- **Architecture**: Feature-based organization with clear separation ✓
- **Components**: Focused, reusable React components with shadcn/ui ✓

**Status**: PASS - Quality standards met

### ✅ V. Security & Data Protection

- **Environment Variables**: All API keys, secrets in .env (PM credentials, AI keys, Clerk keys) ✓
- **Error Handling**: Comprehensive error boundaries with safe user-facing messages ✓
- **Never Hardcode**: No sensitive data in source code ✓

**Status**: PASS - Security requirements satisfied

### ✅ VI. Early Development Philosophy

- **Breaking Changes**: Acceptable during pre-1.0 development ✓
- **Clean Cutover**: Complete replacement over gradual migration ✓
- **No Legacy Support**: Focus on best long-term architecture ✓

**Status**: PASS - Development philosophy embraced

### ✅ Forbidden Actions

- **No `db:push`**: Using proper migration workflow ✓
- **No Underscores**: Enforced in naming conventions ✓
- **No Stack Substitution**: Using prescribed React + Express/Fastify + PostgreSQL + Clerk ✓

**Status**: PASS - No forbidden actions planned

**Overall Gate Status**: ✅ PASS - Ready for Phase 0 (Constitution v1.2.0 approved)

## Project Structure

### Documentation (this feature)

```
specs/001-multi-platform-task/
├── spec.md              # Feature specification (completed)
├── plan.md              # This file (/plan command output)
├── research.md          # Phase 0 output (/plan command)
├── data-model.md        # Phase 1 output (/plan command)
├── quickstart.md        # Phase 1 output (/plan command)
├── contracts/           # Phase 1 output (/plan command)
│   ├── auth.openapi.yaml
│   ├── pm-integrations.openapi.yaml
│   ├── tasks.openapi.yaml
│   ├── time-tracking.openapi.yaml
│   ├── invoicing.openapi.yaml
│   └── ai-proposals.openapi.yaml
├── checklists/
│   └── requirements.md  # Spec validation checklist (completed)
└── tasks.md             # Phase 2 output (/tasks command - NOT created by /plan)
```

### Source Code (repository root)

```
# React + Express/Fastify Separate Frontend/Backend Structure

frontend/
├── src/
│   ├── App.tsx          # Main app component with routing
│   ├── main.tsx         # Entry point
│   ├── routes/          # React Router routes
│   │   ├── Dashboard.tsx        # Task aggregation view
│   │   ├── auth/
│   │   │   ├── SignIn.tsx
│   │   │   └── SignUp.tsx
│   │   ├── integrations/
│   │   │   ├── IntegrationsList.tsx
│   │   │   ├── ConnectIntegration.tsx
│   │   │   └── IntegrationDetail.tsx
│   │   ├── tasks/
│   │   │   ├── TasksList.tsx
│   │   │   ├── TaskDetail.tsx
│   │   │   └── internal/
│   │   │       ├── InternalTasksList.tsx
│   │   │       └── InternalTaskBoard.tsx
│   │   ├── time/
│   │   │   ├── TimeTracker.tsx
│   │   │   ├── ActiveTimers.tsx
│   │   │   └── TimeHistory.tsx
│   │   ├── projects/
│   │   │   ├── ProjectsList.tsx
│   │   │   └── ProjectDetail.tsx
│   │   ├── clients/
│   │   │   ├── ClientsList.tsx
│   │   │   └── ClientDetail.tsx
│   │   └── invoices/
│   │       ├── InvoicesList.tsx
│   │       ├── GenerateInvoice.tsx
│   │       └── InvoiceDetail.tsx
│   ├── components/      # Reusable UI components
│   │   ├── ui/         # shadcn/ui components
│   │   ├── task/
│   │   │   ├── TaskCard.tsx
│   │   │   ├── TaskList.tsx
│   │   │   └── TaskFilters.tsx
│   │   ├── timer/
│   │   │   ├── Timer.tsx
│   │   │   ├── TimerControls.tsx
│   │   │   └── MultiTaskTimer.tsx
│   │   ├── invoice/
│   │   │   ├── InvoicePreview.tsx
│   │   │   └── TimesheetTable.tsx
│   │   └── layout/
│   │       ├── Sidebar.tsx
│   │       └── Header.tsx
│   ├── lib/            # Client utilities
│   │   ├── api/        # API client with Axios
│   │   │   ├── client.ts
│   │   │   ├── tasks.ts
│   │   │   ├── time.ts
│   │   │   └── invoices.ts
│   │   ├── hooks/      # Custom React hooks
│   │   │   ├── useAuth.ts
│   │   │   ├── useTasks.ts
│   │   │   └── useTimer.ts
│   │   └── utils/
│   │       ├── formatting.ts
│   │       └── date-helpers.ts
│   └── styles/
│       └── globals.css  # Tailwind + theme variables
├── public/
├── index.html
├── package.json
├── vite.config.ts
└── tsconfig.json

backend/
├── src/
│   ├── server.ts        # Express/Fastify app entry
│   ├── routes/          # API route handlers
│   │   ├── auth.ts
│   │   ├── pm/
│   │   │   ├── sync.ts
│   │   │   ├── jira.ts
│   │   │   ├── monday.ts
│   │   │   ├── asana.ts
│   │   │   └── trello.ts
│   │   ├── tasks.ts
│   │   ├── time.ts
│   │   ├── projects.ts
│   │   ├── clients.ts
│   │   ├── invoices.ts
│   │   └── ai.ts
│   ├── middleware/      # Express/Fastify middleware
│   │   ├── auth.ts     # Clerk auth middleware
│   │   ├── cors.ts
│   │   └── errorHandler.ts
│   ├── services/        # Business logic
│   │   ├── taskService.ts
│   │   ├── timeService.ts
│   │   ├── invoiceService.ts
│   │   └── pmSyncService.ts
│   ├── lib/
│   │   ├── db/
│   │   │   ├── schema.ts    # Drizzle schema definitions
│   │   │   ├── client.ts    # Database client
│   │   │   └── migrations/  # Migration files
│   │   ├── pm-adapters/     # PM system integrations
│   │   │   ├── base.ts      # Base adapter interface
│   │   │   ├── jira.ts
│   │   │   ├── monday.ts
│   │   │   ├── asana.ts
│   │   │   └── trello.ts
│   │   ├── ai/
│   │   │   ├── openai.ts
│   │   │   └── gemini.ts
│   │   ├── email/
│   │   │   └── resend.ts
│   │   ├── sync/            # Background sync jobs
│   │   │   ├── scheduler.ts
│   │   │   └── task-sync.ts
│   │   └── utils/
│   │       ├── validation.ts
│   │       └── date-helpers.ts
│   └── types/           # Shared type definitions
│       ├── api.ts       # API request/response types
│       └── models.ts    # Database model types
├── package.json
├── tsconfig.json
└── drizzle.config.ts

shared/                  # Shared types between frontend/backend
├── types/
│   ├── task.ts
│   ├── timeEntry.ts
│   └── invoice.ts
└── package.json

db/
├── migrations/          # Generated migration files
└── seed.ts             # Development seed data

tests/
├── unit/
│   ├── pm-adapters/
│   ├── sync/
│   └── utils/
├── integration/
│   ├── api/
│   ├── auth/
│   └── task-sync/
└── e2e/
    ├── task-management.spec.ts
    ├── time-tracking.spec.ts
    └── invoicing.spec.ts
```

**Structure Decision**: React + Express/Fastify separate architecture (frontend/ and backend/ directories with shared types)

## Phase 0: Outline & Research

### Research Areas

1. **PM System API Integration Patterns**
   - Jira REST API v3 authentication and task retrieval
   - Monday.com GraphQL API patterns
   - Asana REST API conventions
   - Trello REST API and webhooks
   - Rate limiting strategies for each system
   - Error handling and retry patterns

2. **Bidirectional Sync Architecture**
   - Conflict resolution strategies
   - Optimistic vs pessimistic locking
   - Change detection and delta sync
   - Background job scheduling patterns
   - API rate limit management

3. **AI Task Proposal Patterns**
   - OpenAI vs Gemini for structured output
   - Prompt engineering for task suggestions
   - Context window management
   - Cost optimization strategies

4. **Time Tracking & Billing**
   - Multi-timer concurrent tracking patterns
   - Preventing duplicate billing
   - Timestamp precision and timezone handling
   - Invoice generation libraries

5. **React + Express/Fastify Best Practices**
   - RESTful API design patterns
   - Optimistic updates with TanStack Query (React Query)
   - React Router patterns
   - CORS and authentication flow between frontend/backend
   - Type sharing strategies

**Output**: Create `research.md` with findings and decisions

## Phase 1: Design & Contracts

### 1. Data Model Design (`data-model.md`)

Extract entities from spec and define:

**Core Entities**:

- `user` (userid UUID v7, email, clerk integration)
- `pmsystemconnection` (connectionid, userid, systemtype, credentials, syncstatus)
- `project` (projectid, userid, name, clientid, hourlybillrate, currentphase, status)
- `client` (clientid, userid, companyname, billingemail, defaulthourlyrate)
- `task` (taskid, userid, projectid, source, externaltaskid, priority, duedate, status)
- `internaltaskboard` (boardid, userid, name, configuration)
- `timeentry` (timeentryid, userid, taskid, starttime, endtime, duration, isbillable, invoiced)
- `invoice` (invoiceid, userid, clientid, generateddate, totalamount, sent)
- `aiproposal` (proposalid, userid, projectid, description, rationale, status)
- `note` (noteid, userid, projectid, content, timestamp, author)
- `projectphase` (phaseid, projectid, phasenumber, phasename, status, entryat, completedat)
- `specification` (specid, projectid, phaseid, specnumber, title, content, status)
- `testplan` (testplanid, specid, testcases, results, status)
- `feedbackentry` (feedbackid, projectid, phaseid, category, content, resolutionstatus, generatedspecid)
- `phasetransitionlog` (logid, projectid, sourcephase, targetphase, transitionedat, reason, userid)

**Relationships**:

- user ← pmsystemconnection (1:N)
- user ← project (1:N)
- user ← client (1:N)
- client ← project (N:1)
- project ← task (1:N)
- task ← timeentry (1:N)
- user ← timeentry (1:N)
- client ← invoice (N:1)
- project ← aiproposal (1:N)
- project ← note (1:N)
- project ← projectphase (1:6 - one record per phase)
- projectphase ← specification (1:N during Design phase)
- specification ← testplan (1:1)
- projectphase ← feedbackentry (1:N during Human Testing and Beta phases)
- project ← phasetransitionlog (1:N audit trail)

### 2. API Contracts (`contracts/*.openapi.yaml`)

Generate OpenAPI 3.0 specs for:

**Authentication** (`auth.openapi.yaml`):

- POST /api/auth/sign-up
- POST /api/auth/sign-in
- POST /api/auth/sign-out
- POST /api/auth/reset-password

**PM Integrations** (`pm-integrations.openapi.yaml`):

- GET /api/pm/connections
- POST /api/pm/connections
- DELETE /api/pm/connections/:id
- POST /api/pm/sync
- GET /api/pm/:system/tasks

**Tasks** (`tasks.openapi.yaml`):

- GET /api/tasks (unified view)
- POST /api/tasks (internal tasks)
- PATCH /api/tasks/:id
- DELETE /api/tasks/:id
- GET /api/tasks/:id

**Time Tracking** (`time-tracking.openapi.yaml`):

- POST /api/time/start
- POST /api/time/pause
- POST /api/time/resume
- POST /api/time/stop
- GET /api/time/entries
- POST /api/time/entries (manual)
- PATCH /api/time/entries/:id

**Invoicing** (`invoicing.openapi.yaml`):

- POST /api/invoices/generate
- GET /api/invoices
- GET /api/invoices/:id
- POST /api/invoices/:id/send
- GET /api/timesheets/generate

**AI Proposals** (`ai-proposals.openapi.yaml`):

- POST /api/ai/propose-tasks
- GET /api/ai/proposals
- POST /api/ai/proposals/:id/accept
- POST /api/ai/proposals/:id/reject

### 3. Quickstart Test (`quickstart.md`)

End-to-end user journey test:

1. User signs up
2. Connects Jira account
3. Views aggregated tasks
4. Creates internal task
5. Starts timer on task
6. Pauses and resumes timer
7. Completes task
8. Generates invoice for client
9. Sends invoice via email

### 4. Agent Context Update

Run: `.specify/scripts/powershell/update-agent-context.ps1 -AgentType claude`

Add to CLAUDE.md:

- TanStack Start routing patterns
- Drizzle schema conventions
- PM adapter interface
- Sync job patterns
- Recent changes log

**Output**: data-model.md, contracts/\*.openapi.yaml, quickstart.md, CLAUDE.md updated

## Phase 2: Task Planning Approach

_This section describes what the /tasks command will do - DO NOT execute during /plan_

**Task Generation Strategy**:

1. Load `.specify/templates/tasks-template.md` as base structure
2. Generate tasks from Phase 1 artifacts:
   - Each OpenAPI endpoint → contract test task [P]
   - Each entity in data-model.md → schema definition task [P]
   - Each PM adapter → integration task
   - Each user story → E2E test task
   - Implementation tasks following TDD order

**Ordering Strategy**:

1. **Setup Tasks** (serial):
   - Database schema setup
   - Environment configuration
   - PM SDK installation

2. **Foundation Tasks** [P]:
   - Authentication with Clerk
   - Database client configuration
   - Base PM adapter interface

3. **Data Layer** [P]:
   - Entity models (parallel for independent entities)
   - Repository patterns

4. **PM Integration Layer** (semi-parallel, grouped by system):
   - Jira adapter [P]
   - Monday adapter [P]
   - Asana adapter [P]
   - Trello adapter [P]
   - Sync scheduler (depends on adapters)

5. **Business Logic Layer**:
   - Task aggregation service
   - Time tracking service
   - Invoice generation service
   - AI proposal service

6. **API Layer** [P]:
   - Authentication routes
   - PM integration routes
   - Task routes
   - Time tracking routes
   - Invoicing routes
   - AI routes

7. **UI Layer** [P]:
   - Shared components
   - Dashboard pages
   - Integration pages
   - Time tracking pages
   - Invoice pages

8. **Testing & Validation**:
   - Contract tests
   - Integration tests
   - E2E tests
   - Quickstart validation

**Estimated Output**: 45-55 numbered, dependency-ordered tasks in tasks.md

**IMPORTANT**: This phase is executed by the /tasks command, NOT by /plan

## Phase 3+: Future Implementation

_These phases are beyond the scope of the /plan command_

**Phase 3**: Task execution (/tasks command creates tasks.md)
**Phase 4**: Implementation (execute tasks.md following TDD and constitutional principles)
**Phase 5**: Validation (run contract tests, integration tests, E2E tests, execute quickstart.md, performance validation)

## Complexity Tracking

_Fill ONLY if Constitution Check has violations that must be justified_

No violations detected. All design decisions align with constitutional requirements.

## Progress Tracking

_This checklist is updated during execution flow_

**Phase Status**:

- [x] Phase 0: Research complete (/plan command) ✅
- [x] Phase 1: Design complete (/plan command) ✅
- [x] Phase 2: Task planning complete (/plan command - describe approach only) ✅
- [ ] Phase 3: Tasks generated (/tasks command)
- [ ] Phase 4: Implementation complete
- [ ] Phase 5: Validation passed

**Gate Status**:

- [x] Initial Constitution Check: PASS ✅
- [x] Post-Design Constitution Check: PASS ✅
- [x] All NEEDS CLARIFICATION resolved ✅
- [x] Complexity deviations documented (N/A - no deviations) ✅

**Artifacts Generated**:

- ✅ research.md (Phase 0)
- ✅ data-model.md (Phase 1)
- ✅ contracts/api-contracts.md (Phase 1)
- ✅ quickstart.md (Phase 1)
- ✅ CLAUDE.md updated (Phase 1)

---

_Based on Constitution v1.1.0 - See `.specify/memory/constitution.md`_
