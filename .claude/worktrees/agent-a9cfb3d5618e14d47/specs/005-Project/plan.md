# Implementation Plan: Project Lifecycle Management

**Branch**: `005-project-lifecycle` | **Date**: 2026-02-15 | **Spec**: [spec.md](spec.md)
**Status**: Phase 1 Planning | **Next**: Task generation via `/speckit.tasks`

---

## Summary

Implement a complete 6-phase project lifecycle management system enabling Project Managers to organize work through Design → Coding → QA → Human Testing → Beta → Release phases. Support both internal (company-managed) and external (client-managed) projects with automatic phase progression when tasks complete. Uses last-write-wins concurrency control and soft-delete with 30-day recovery for data protection.

---

## Technical Context

**Project Type**: Feature within existing web application (wxKanban)
**Language/Version**: TypeScript (strict mode), Node.js 20 LTS
**Primary Dependencies**:
- Backend: Express.js, Drizzle ORM 0.28.6, Pino logging
- Frontend: React 18+, TanStack Query, Tailwind CSS, shadcn/ui
- Database: PostgreSQL 15+

**Storage**: PostgreSQL - New tables: Project, LifecyclePhase, ProjectTask
**Testing**: Vitest (unit), Playwright (E2E)
**Target Platform**: Web browser (responsive, mobile-ready)
**Project Type**: Web (backend API + React frontend)
**Performance Goals**:
- Project creation: < 30 seconds
- Default task creation: < 2 seconds for 10+ specs
- Phase navigation: < 500ms load time
- Task movement: No data loss during concurrent operations

**Constraints**:
- Company data isolation (mandatory for all queries)
- Role-based access control (Project Managers & Admins only)
- Backward compatibility (retain BaseRate field, just hidden)

**Scale/Scope**:
- Target: 100+ projects per company
- ~10 tasks per project per phase (60 total)
- Concurrent users: 10-50 per company
- Lifecycle phases: Fixed 6 phases (not dynamic)

---

## Constitution Check

**Passed**: All requirements align with wxKanban principles

- ✅ **TypeScript Strict Mode**: All new code will use TypeScript strict mode (no `any`, no `@ts-ignore`)
- ✅ **Database**: PostgreSQL + Drizzle ORM (parameterized queries prevent SQL injection)
- ✅ **Authentication**: JWT-based with company isolation enforced at query layer
- ✅ **Logging**: Pino structured logging only (no console.log)
- ✅ **Security**: Company data isolation, role-based access control, soft-delete prevents data loss
- ✅ **Data Patterns**: UUID v7 primary keys, snake_case database, camelCase TypeScript

**Post-Design Re-check**: Will validate after data model finalized

---

## Phase 0: Research & Technical Decisions

### Research Tasks (No unknowns identified)

The specification is complete with all critical decisions made:

1. ✅ **Phase Status Automation**: Automatic progression when tasks complete (clarified in spec)
2. ✅ **Concurrent Edit Resolution**: Last-write-wins strategy (clarified in spec)
3. ✅ **Soft-Delete Strategy**: 30-day recovery window (clarified in spec)
4. ✅ **Tech Stack**: TypeScript + PostgreSQL confirmed per CLAUDE.md
5. ✅ **Authentication**: Company isolation via JWT claims (established pattern)

### Research Output: `research.md`

Will document:
- **Decision**: Automatic phase completion trigger based on task count
  - Rationale: Reduces user friction, aligns with kanban methodology
  - Alternatives: Manual phase completion (rejected - too much overhead), task progress percentage (rejected - complex logic)

- **Decision**: Last-write-wins for concurrent edits
  - Rationale: Simplest implementation, standard in task tools, acceptable for most scenarios
  - Alternatives: Optimistic locking (complex UX), pessimistic locking (performance impact)

- **Decision**: Soft-delete with 30-day recovery window
  - Rationale: Protects against accidents, allows recovery, ensures eventual data cleanup
  - Alternatives: Hard-delete (risky), permanent soft-delete (database bloat)

- **Decision**: Database table design for soft-delete
  - Store `isdeleted` boolean and `deletedat` timestamp
  - All queries filter WHERE isdeleted = false
  - Background job purges deleted rows after 30 days

---

## Phase 1: Design & Contracts

### 1. Data Model (`data-model.md`)

**New Entities** (4 total):

1. **Project** (NEW)
   - Fields: projectid (UUID PK), companyid (UUID FK), name, description, projecttype (enum: internal|external)
   - Lifecycle: status (enum), isdeleted (boolean), deletedat (timestamp, nullable)
   - Relationships: 1:N with LifecyclePhase, 1:N with ProjectTask
   - Constraints: companyid required, projecttype required, (isdeleted=false) index for queries
   - Audit: createdat, updatedat, createdby (UUID FK to user)

2. **LifecyclePhase** (NEW)
   - Fields: phaseid (UUID PK), projectid (UUID FK), phasenumber (int: 1-6)
   - phasename (enum: Design|Coding|QA|HumanTesting|Beta|Release)
   - Status: enum (not_started|in_progress|blocked|completed)
   - Relationships: N:1 with Project, 1:N with ProjectTask
   - Constraints: (projectid, phasenumber) unique, auto-init on project creation
   - Audit: createdat, updatedat

3. **ProjectTask** (NEW - replaces generic Task for this feature)
   - Fields: taskid (UUID PK), projectid (UUID FK), phaseid (UUID FK)
   - specificationid (UUID FK, nullable) - links to Spec
   - title, description, status (enum)
   - Relationships: N:1 with Project, N:1 with LifecyclePhase, FK to Specification (if exists)
   - Constraints: (projectid, title) unique per phase, auto-create for each spec
   - Audit: createdat, updatedat, createdby

4. **Company** (MODIFIED - already exists, no new fields)
   - Used for internal project company info auto-population
   - Fields name, address, contactemail must be populated for internal projects

**Indexes**:
- Project: (companyid, isdeleted) - frequent filtering
- LifecyclePhase: (projectid, phasenumber) - unique constraint
- ProjectTask: (projectid, phaseid) - phase queries
- All tables: (createdby, createdat) - audit trail

**State Transitions**:
- Phase status auto-updates: not_started → in_progress (manual) → completed (auto when all tasks done)
- Task status: pending → in_progress → completed → (triggers phase status calc)
- Project status: Reflects current highest numbered non-completed phase

### 2. API Contracts (`contracts/openapi.json`)

**Endpoints** (10 total, RESTful):

1. **Project CRUD**
   - POST /api/projects - Create project (body: name, description, projecttype, companyinfo?)
   - GET /api/projects - List projects (query: companyid, skip, limit)
   - GET /api/projects/{projectid} - Get single project
   - PATCH /api/projects/{projectid} - Update metadata (name, description, status)
   - DELETE /api/projects/{projectid} - Soft-delete (marks isdeleted=true, deletedat=now)

2. **Lifecycle Phases**
   - GET /api/projects/{projectid}/phases - List all 6 phases with task counts
   - PATCH /api/projects/{projectid}/phases/{phaseid} - Update phase status (manual trigger only)

3. **Project Tasks**
   - POST /api/projects/{projectid}/tasks - Create custom task
   - PATCH /api/projects/{projectid}/tasks/{taskid} - Update task (title, description, status, phaseid)
   - DELETE /api/projects/{projectid}/tasks/{taskid} - Delete task (hard-delete OK for tasks, not project)

**Response Formats**:
- Success: 200 with data envelope: `{ data: {...}, message: "..." }`
- Error: 400/403/404/500 with error envelope: `{ code: "...", message: "..." }`
- Pagination: 200 with `{ data: [...], total: N, skip: M, limit: K }`

**Authorization**:
- All endpoints: Admin role OR ProjectManager + companyid from JWT matches
- Check role middleware on all routes (use existing pattern from 002-admin)

### 3. Integration Test Scenarios (`quickstart.md`)

**5 end-to-end flows**:

1. **Create Internal Project**
   - Admin creates project with type=internal
   - Company info auto-populates
   - 6 phases auto-created with 0 tasks
   - Verify: phases[0].status = "not_started", phases[1-5].status = "blocked"

2. **Create Project with Existing Specs**
   - Project Manager creates project with type=external
   - System finds 5 existing specs
   - Creates 5 default tasks in Design phase + 1 Documentation task
   - Verify: Design phase has 6 tasks, all status="pending"

3. **Automatic Phase Completion**
   - Project Manager marks all 3 tasks in Design phase as "completed"
   - System auto-updates Design phase status to "completed"
   - Coding phase status auto-changes from "blocked" to "not_started"
   - Verify: Phase transitions happened without manual intervention

4. **Concurrent Task Updates**
   - User A moves Task 1 from Design to Coding
   - User B simultaneously moves Task 2 from Design to Coding
   - Both operations succeed (last-write-wins on overlapping fields)
   - Verify: Both tasks in Coding phase, no data loss

5. **Project Recovery After Deletion**
   - Project Manager deletes Project A (isdeleted=true, deletedat=now)
   - Project not visible in normal queries
   - Recovery script (admin function) marks isdeleted=false
   - Verify: Project recoverable within 30 days

### 4. Agent Context Update

Update `CLAUDE.md` with:
- New Project tables and relationships
- API endpoint patterns (POST /api/projects, etc.)
- Company isolation requirement for all Project queries
- Soft-delete filtering pattern (WHERE isdeleted = false)
- Frontend routes: /projects, /projects/{id}, /projects/{id}/phases/{phaseNum}

---

## Phase 2: Task Generation Approach

**Scope**: 60-80 tasks across 5 user story phases

**Task Categories**:

1. **Database Layer** (15 tasks)
   - Create Drizzle schema files (Project, LifecyclePhase, ProjectTask)
   - Generate migrations via db:generate
   - Create database indexes
   - Add company isolation constraints

2. **API Layer** (20 tasks)
   - Implement project CRUD endpoints (5 endpoints)
   - Implement lifecycle phase endpoints (2 endpoints)
   - Implement project task endpoints (3 endpoints)
   - Add authorization middleware
   - Add error handling and validation
   - Write service layer (projectService, phaseService, taskService)

3. **Business Logic** (12 tasks)
   - Phase auto-completion trigger logic
   - Default task creation on project init
   - Soft-delete filtering (all queries)
   - Concurrent edit handling (last-write-wins)
   - 30-day purge job setup

4. **Frontend Components** (15 tasks)
   - Project list page with filters
   - Project detail page
   - Phase view with task grid
   - Task card component and task modal
   - Create project form (internal/external toggle)
   - Task status update UI
   - Delete confirmation modal with recovery option

5. **Testing** (10 tasks)
   - Unit tests for service logic (phase auto-completion, soft-delete)
   - Integration tests for 5 quickstart scenarios
   - API contract tests (all 10 endpoints)
   - Frontend component tests

6. **Documentation & Polish** (8 tasks)
   - API documentation
   - User guide for Project Managers
   - Database schema documentation
   - Cleanup unused BaseRate references
   - Code review and type checking

**Execution Strategy**:
- **MVP Scope**: Core CRUD + 6 phases + auto-completion (40 tasks, 5-6 days)
- **Full Scope**: Add soft-delete recovery UI, concurrent handling, full test coverage (80 tasks, 10-12 days)
- **Parallel Tracks**: Database + Backend API (can run in parallel), Frontend (depends on API completion)

**Dependencies**:
- Database schema must be final before API implementation
- API must be complete before frontend tests can run
- Service layer tests can run after business logic complete

---

## Constitution Re-check (Post-Design)

**Will verify after Phase 1**:
- [ ] No TypeScript errors in data-model.md schema files
- [ ] All queries use Drizzle ORM (parameterized, no SQL injection risk)
- [ ] Company isolation enforced via eq(companyid) in all queries
- [ ] JWT claims verified in authorization middleware
- [ ] Soft-delete filtering (isdeleted = false) in all SELECT queries
- [ ] Pino logging for all operations (no console.log)

---

## Progress Tracking

**Phase 0 (Research)**: ✅ COMPLETE
- All unknowns identified and clarified
- research.md ready for generation

**Phase 1 (Design)**: 🟡 IN PROGRESS
- Technical context: ✅ Complete
- Constitution check: ✅ Initial pass
- Data model: Ready for generation
- API contracts: Ready for generation
- Integration tests: Ready for generation

**Phase 2 (Tasks)**: ⏳ PENDING
- Next step: Run `/speckit.tasks` to generate tasks.md

**Phase 3-4 (Implementation)**: ⏳ PENDING
- Will execute tasks generated in Phase 2

---

## Artifacts Generated

✅ **Complete** (created by `/speckit.specify` + `/speckit.clarify`):
- spec.md - 17 FRs, 12 success criteria
- checklists/requirements.md - Quality checklist

🟡 **Ready to Generate** (Phase 0-1 outputs):
- research.md - Design decisions and rationale
- data-model.md - Entity definitions and relationships
- contracts/openapi.json - REST API specification
- quickstart.md - 5 integration test scenarios

⏳ **Next** (Phase 2):
- tasks.md - Generated by `/speckit.tasks`

---

## Success Criteria (Phase 1)

- [x] All technical context filled (no NEEDS CLARIFICATION)
- [x] Constitution requirements satisfied
- [x] Data model designed for company isolation & soft-delete
- [x] API contracts defined (REST, 10 endpoints)
- [x] Integration scenarios documented (5 flows)
- [x] Task generation strategy outlined
- [ ] research.md generated
- [ ] data-model.md generated
- [ ] contracts/ files generated

---

## Next Steps

**Immediate**: Generate Phase 0-1 artifacts via `/speckit.tasks` or continue with manual artifact generation

**Then**: Run `/speckit.tasks` to generate tasks.md with 60-80 granular tasks

**Finally**: Execute tasks via `/speckit.implement` or manual task-by-task implementation

---

**Plan Ready for Review** ✅

This implementation plan is complete and ready to proceed to task generation phase.

