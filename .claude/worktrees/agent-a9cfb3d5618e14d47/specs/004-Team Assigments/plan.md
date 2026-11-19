# Implementation Plan: Team Assignments & Duties Management

**Feature**: `004-team-assignments` | **Date**: 2026-02-15 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/004-Team Assigments/spec.md`

---

## Execution Flow (/plan command scope)

```
1. Load feature spec from Input path ✅
   → Located at specs/004-Team Assigments/spec.md
2. Fill Technical Context
   → Detect Project Type from context (web=frontend+backend) ✅
   → Set Structure Decision based on project type ✅
3. Fill the Constitution Check section ✅
4. Evaluate Constitution Check
   → No violations detected ✅
5. Execute Phase 0 → research.md
   → Identify unknowns and research tasks
6. Execute Phase 1 → contracts, data-model.md, quickstart.md, agent-specific file
7. Re-evaluate Constitution Check
8. Plan Phase 2 → Describe task generation approach
9. STOP - Ready for /tasks command
```

---

## Summary

**Objective**: Implement a team assignment system that manages role-based task routing with compliance validation for SOC 2 and HiTrust security standards.

**Core Features**:
1. Duty/role assignment to team members with compliance validation
2. Automated task workflow routing based on fixed duty sequence (Dev → Design → Review → QA → Final Review → Publish)
3. Compliance rule enforcement with override capability and audit logging
4. Admin customization of duty types at subscription level (applies to all projects)
5. SOC 2 and HiTrust separation-of-duties validation with specific rule enforcement

**Technical Approach**:
- Backend: Express API routes for duty assignment, task routing, and compliance validation
- Database: New schema entities for TeamProjectDuty, DutyAssignment, ComplianceOverride relationships
- Frontend: React UI for duty assignment interface with compliance warnings
- Validation: TypeScript-based compliance rule engine with configurable rules per security classification

---

## Technical Context

| Aspect | Value |
|--------|-------|
| **Language/Version** | TypeScript (Node.js 20 LTS, React 18+) |
| **Primary Dependencies** | Express, React, Drizzle ORM, TanStack Query |
| **Storage** | PostgreSQL 15+ with Drizzle ORM |
| **Testing** | Vitest (unit/integration) + Playwright (E2E) |
| **Target Platform** | Web (browser) + REST API |
| **Project Type** | Web (frontend + backend) - existing wxKanban app |
| **Performance Goals** | Sub-second duty validation, <2s UI response for assignment |
| **Constraints** | SOC 2/HiTrust compliance enforcement, audit logging required |
| **Scale/Scope** | 5 key entities, ~20 API endpoints, team-scoped operations |

---

## Constitution Check

**Gate: INITIAL PASS** ✅

| Constitutional Principle | Requirement | Status | Notes |
|-------------------------|------------|--------|-------|
| **I. Full-Stack Architecture** | Must use PostgreSQL + Drizzle ORM, Express backend, React frontend | ✅ PASS | Aligns with wxKanban stack |
| **III. Database & Naming** | Singular tables, UUID v7 PKs, camelCase TS vars, no underscores | ✅ PASS | Will apply conventions: `teamprojectduty`, `dutyassignment`, `complianceoverride` |
| **IV. Code Quality** | TypeScript required, functional components, real API tests | ✅ PASS | All code will be typed, no mocks |
| **V. Security & Data** | Env vars for secrets, no hardcoding, secure error handling | ✅ PASS | Compliance override logging provides audit trail |
| **VI. Early Development** | Breaking changes acceptable, no legacy support | ✅ PASS | First implementation, no migration concerns |
| **VII. Lifecycle Management** | 6-phase workflow required (Design → Impl → QA → HT → Beta → Release) | ✅ PASS | Will follow through /tasks → /implement → /qa → /humantest → /beta → /release |

**Post-Design Re-check**: Will verify again after Phase 1 design artifacts are complete.

---

## Project Structure

### Documentation (this feature)

```
specs/004-Team Assigments/
├── spec.md                  # ✅ Specification (complete, clarified)
├── plan.md                  # This file (being created)
├── research.md              # Phase 0 output (to create)
├── data-model.md            # Phase 1 output (to create)
├── contracts/               # Phase 1 output (to create)
│   ├── duties-assignment.openapi.json
│   ├── compliance-validation.openapi.json
│   └── task-routing.openapi.json
├── quickstart.md            # Phase 1 output (to create)
├── checklists/
│   └── requirements.md       # ✅ Quality validation checklist
└── tasks.md                 # Phase 2 output (/tasks command)
```

### Source Code (repository root)

```
# Web application structure (Option 2: Frontend + Backend)

backend/
├── src/
│   ├── db/schema/
│   │   ├── teamprojectduty.ts       # Duty type definitions per project
│   │   ├── dutyassignment.ts        # Team member → duty mapping
│   │   └── complianceoverride.ts    # Override audit trail
│   ├── server/
│   │   ├── routes/
│   │   │   └── duties.ts            # API endpoints for duty mgmt
│   │   ├── services/
│   │   │   ├── duty-assignment.ts   # Business logic
│   │   │   ├── compliance-engine.ts # Rule validation
│   │   │   └── task-routing.ts      # Workflow automation
│   │   └── middleware/
│   │       └── compliance-check.ts  # Validation middleware
│   └── lib/
│       └── compliance-rules.ts      # SOC 2 / HiTrust rule definitions
└── tests/
    ├── unit/
    │   └── compliance-engine.test.ts
    ├── integration/
    │   ├── duty-assignment.test.ts
    │   └── task-routing.test.ts
    └── contract/
        └── duties-api.contract.test.ts

frontend/
├── src/
│   ├── components/
│   │   ├── duty-assignment/
│   │   │   ├── AssignmentForm.tsx
│   │   │   ├── ComplianceWarning.tsx
│   │   │   └── OverrideReason.tsx
│   │   └── team/
│   │       └── TeamDutyList.tsx
│   ├── pages/
│   │   └── project/
│   │       └── team/
│   │           └── assignments.tsx
│   └── hooks/
│       └── useDutyAssignment.ts
└── tests/
    ├── unit/
    │   └── AssignmentForm.test.tsx
    └── e2e/
        └── duty-assignment.e2e.ts
```

**Structure Decision**: **Web application** (Option 2) - existing wxKanban frontend + backend architecture

---

## Phase 0: Outline & Research

### Research Objectives

The specification is well-defined with clarified compliance rules. Research phase will focus on:

1. **Compliance Rule Encoding**: How to encode SOC 2 vs HiTrust rules in code
2. **Duty Sequence Algorithm**: Optimal data structure for duty workflow sequencing
3. **Audit Logging**: Best practices for compliance override documentation
4. **Task Routing Integration**: How to integrate with existing task system
5. **Performance**: Validation performance for large team assignments

### Research Tasks

| Task | Description | Output |
|------|-------------|--------|
| **RT-001** | Research compliance rule engine patterns (matrix-based vs graph-based) | Decision on rule encoding approach |
| **RT-002** | Research audit logging best practices for compliance overrides | Logging structure and retention policy |
| **RT-003** | Research task routing patterns in workflow systems | Integration approach with existing task system |
| **RT-004** | Research duty sequence storage (enum vs table vs computed) | Database design decision |
| **RT-005** | Research permission/authorization checks for duty assignment | RBAC/capability matrix design |

### Research Consolidation Format

`research.md` will include for each decision:
- **Decision**: [what was chosen]
- **Rationale**: [why chosen]
- **Alternatives considered**: [what else was evaluated]
- **Implementation notes**: [how to realize in code]

**Expected Output**:
- `research.md` (2-3 KB) with all research consolidated
- All NEEDS CLARIFICATION items resolved
- Ready for Phase 1 design

---

## Phase 1: Design & Contracts

### 1. Data Model Generation

**Input**: Feature spec entities and requirements
**Output**: `data-model.md`

**Entities to Design**:
1. **TeamProjectDuty** - Maps available duties to a project
   - `teamprojectdutyid` (UUID v7, PK)
   - `projectid` (FK → project)
   - `dutyname` (e.g., "Developer", "QA")
   - `sequence` (order in workflow)
   - `issysemdefault` (boolean - can be removed by admin?)
   - `createdat`, `updatedat`

2. **DutyAssignment** - Links team member to duties on a project
   - `dutyassignmentid` (UUID v7, PK)
   - `projectid` (FK → project)
   - `userid` (FK → user/team member)
   - `dutyid` (FK → teamprojectduty)
   - `assignedby` (FK → user who made assignment)
   - `createdat`

3. **ComplianceOverride** - Audit trail for rule violations
   - `complianceoverrideid` (UUID v7, PK)
   - `projectid` (FK → project)
   - `userid` (FK → team member being assigned)
   - `dutyid` (FK → duty being assigned)
   - `violatedrule` (text - which rule was broken)
   - `overriddenby` (FK → user who approved override)
   - `reason` (text - documented justification)
   - `createdat`

4. **TaskAssignment** - (May extend existing) Link task to duty-assigned team member
   - `taskid` (FK → task)
   - `dutyid` (FK → duty being executed)
   - `userid` (FK → team member with that duty)

5. **SubscriptionDutyType** - Subscription-level duty customization
   - `subscriptiondutyid` (UUID v7, PK)
   - `subscriptionid` (FK → subscription)
   - `dutyname` (custom duty type)
   - `allowedfor` (HiTrust/SOC 2 or both)

**Validation Rules**:
- All duty assignments must pass compliance validation before creation
- ComplianceOverride entries required for any violation
- Duty sequence immutable once project created
- Subscription duty changes apply to all project duty assignments

**State Transitions**: Task moves through duties based on sequence; user can reassign only if compliance permits

### 2. API Contracts Generation

**Output**: `contracts/` directory with OpenAPI schemas

**Contract Files**:

1. **duties-assignment.openapi.json**
   - `POST /api/projects/{projectId}/duties/assign` - Assign duty to team member
   - `GET /api/projects/{projectId}/duties/assignments` - List all assignments
   - `DELETE /api/projects/{projectId}/duties/assignments/{assignmentId}` - Remove assignment
   - `GET /api/projects/{projectId}/duties/available` - List available duties

2. **compliance-validation.openapi.json**
   - `POST /api/compliance/validate` - Validate proposed assignment (returns warnings)
   - `GET /api/compliance/overrides` - List override history

3. **task-routing.openapi.json**
   - `POST /api/tasks/{taskId}/complete` - Mark task complete, auto-assign next duty
   - `POST /api/tasks/{taskId}/reassign-duty` - Manual duty reassignment

### 3. Contract Tests

**Output**: `tests/contract/*.test.ts` (failing tests - no implementation yet)
- One test file per endpoint
- Assert request/response schemas match OpenAPI
- Tests will fail until implementation complete

### 4. Integration Test Scenarios

**Output**: `quickstart.md`

**Scenarios**:
1. **Basic Assignment**: Assign Developer duty to team member on SOC 2 project
2. **Compliance Violation**: Attempt to assign Developer + QA (violates SOC 2) → see warning → override with reason
3. **Task Workflow**: Complete task as Developer → system auto-assigns to Design Coordinator
4. **Subscription Customization**: Admin adds custom duty type → appears in all projects
5. **HiTrust Enforcement**: Stricter rules prevent certain combinations even with override

### 5. Agent Context Update

**Output**: Agent-specific context file with new technology stack additions
- Execute: `.specify/scripts/powershell/update-agent-context.ps1 -AgentType claude`
- Will update CLAUDE.md with incremental Phase 1 context
- Keep under 150 lines, preserve existing manual additions

**Output**: CLAUDE.md updated with:
- Team assignment database schema reference
- Compliance rule engine patterns
- API route structure
- Testing approach (contract + integration)

---

## Phase 2: Task Planning Approach

### Task Generation Strategy

**Input**: Phase 1 design artifacts (data-model.md, contracts, quickstart.md)
**Approach**: TDD (test-first) + dependency ordering

**Task Categories**:

1. **Database Tasks** (Foundation layer)
   - Create schema migrations for TeamProjectDuty, DutyAssignment, ComplianceOverride
   - Create schema migrations for SubscriptionDutyType
   - Create Drizzle ORM model definitions

2. **Backend Service Tasks** (Business logic)
   - Implement compliance rule engine (SOC 2 + HiTrust rules)
   - Implement duty assignment service (validation + persistence)
   - Implement task routing service (workflow automation)
   - Implement audit logging for overrides

3. **Backend API Tasks** (Route handlers)
   - Implement duty assignment endpoints (POST, GET, DELETE, validation)
   - Implement compliance override endpoints
   - Implement task routing endpoints
   - Add middleware for permission checks (Team Manager only)

4. **Frontend Component Tasks**
   - Create DutyAssignmentForm component
   - Create ComplianceWarning component (shows violated rules)
   - Create OverrideReason component (documented justification input)
   - Create TeamDutyList component (display assignments)
   - Integrate with existing team management pages

5. **Testing Tasks** (TDD order)
   - Contract tests for all API endpoints
   - Unit tests for compliance rule engine
   - Integration tests for duty assignment workflow
   - E2E tests for full user scenarios (quickstart.md)

### Ordering Strategy

**Phase 2 will generate tasks in this order**:

1. Database schema + Drizzle models (TT-001 to TT-004)
2. Compliance rule engine (BT-001 to BT-003)
3. Duty assignment service (BT-004 to BT-006)
4. API contract tests (API-001 to API-006) [parallel with services]
5. API routes implementation (API-007 to API-012)
6. Frontend components (FE-001 to FE-005) [parallel with backend]
7. Integration tests (IT-001 to IT-003)
8. E2E tests (E2E-001 to E2E-005)
9. Cleanup + documentation

### Estimated Task Count

- Database: 4 tasks
- Backend services: 6 tasks
- Backend API: 6 tasks
- Frontend components: 5 tasks
- Testing: 10 tasks
- Documentation: 2 tasks
- **Total: ~33 tasks**

**IMPORTANT**: This phase is PLANNED ONLY. Tasks will be generated by the `/tasks` command.

---

## Phase 3+: Future Implementation

These phases are beyond the scope of the `/plan` command:

- **Phase 3 (QA Testing)**: `/tasks` command creates tasks.md with ordered, sequenced tasks
- **Phase 4 (Human Testing)**: Execute tasks.md following TDD approach
- **Phase 5 (Beta Release)**: Run full test suite, validate quickstart scenarios
- **Phase 6 (Release)**: Production deployment with method selection

---

## Complexity Tracking

| Item | Assessment | Notes |
|------|-----------|-------|
| **Compliance Rules** | Standard complexity | Fixed set of rules (SOC 2 + HiTrust), not extensible per spec |
| **Duty Sequence** | Low complexity | Fixed global sequence, no branching logic |
| **Audit Logging** | Standard complexity | Override audit trail straightforward, follows conventions |
| **Task Integration** | Medium complexity | Depends on existing task system design (RT-003 to clarify) |
| **Permission Model** | Low complexity | Only Team Managers can assign, no complex RBAC |

**No Constitution violations requiring complexity justification.**

---

## Progress Tracking

**Phase Status**:
- [x] Phase 0: Research complete (/plan command) ✅ research.md generated
- [x] Phase 1: Design complete (/plan command) ✅ data-model.md, contracts/, quickstart.md generated
- [x] Phase 2: Task planning complete (/plan command - describe approach only) ✅ Above
- [ ] Phase 3: Tasks generated (/tasks command)
- [ ] Phase 4: Implementation complete
- [ ] Phase 5: Validation passed

**Gate Status**:
- [x] Initial Constitution Check: PASS
- [x] Post-Design Constitution Check: PASS ✅ No violations detected
- [x] All NEEDS CLARIFICATION resolved ✅ Phase 0 research complete
- [x] Complexity deviations documented ✅ None required

---

## Phase 1 Completion Summary

✅ **All Phase 1 Deliverables Complete**

### Design Artifacts Generated

| Artifact | Location | Status | Size |
|----------|----------|--------|------|
| **Research.md** | `research.md` | ✅ Complete | 7.5 KB |
| **Data Model** | `data-model.md` | ✅ Complete | 12 KB |
| **API Contracts** | `contracts/` | ✅ Complete | 3 files |
| **Quickstart Tests** | `quickstart.md` | ✅ Complete | 15 KB |
| **Plan** | `plan.md` | ✅ Complete | This file |

### Key Decisions Made

| Category | Decision |
|----------|----------|
| **Rule Engine** | TypeScript validation matrix + procedural checks |
| **Audit Logging** | PostgreSQL table + Pino structured logging |
| **Task Integration** | Extend existing task completion endpoint |
| **Duty Sequence** | Fixed TypeScript enum (immutable) |
| **Authorization** | Clerk RBAC (Team Manager role required) |
| **Database Schema** | 5 new tables + 2 extended existing tables |
| **API Contracts** | 3 OpenAPI schemas (11 endpoints total) |

### Architecture Overview

```
Frontend (React)
  └─→ Duty Assignment Form
      ├─→ Compliance Validation
      └─→ Override Approval

Backend (Express)
  ├─→ Routes
  │   ├─→ /duties/assign (POST)
  │   ├─→ /duties/assignments (GET, DELETE)
  │   ├─→ /compliance/validate (POST)
  │   └─→ /tasks/{id}/route-next-duty (POST)
  │
  ├─→ Services
  │   ├─→ DutyAssignmentService
  │   ├─→ ComplianceEngine
  │   └─→ TaskRoutingService
  │
  └─→ Database
      ├─→ subscriptiondutytype (new)
      ├─→ teamprojectduty (new)
      ├─→ dutyassignment (new)
      └─→ complianceoverride (new)
```

### Constitution Compliance

✅ **Post-Design Constitutional Check: PASS**

- Full-stack architecture: ✅ Express + React + PostgreSQL + Drizzle ORM
- Database naming conventions: ✅ Singular tables, UUID v7 PKs, camelCase TS
- Code quality standards: ✅ TypeScript required, functional components, real API tests
- Security & data protection: ✅ Env vars, secure error handling, audit logging
- Early development philosophy: ✅ No legacy support needed, clean cutover

**No violations detected. No complexity deviations.**

### Test Coverage

**Integration Test Scenarios**: 10 detailed scenarios in `quickstart.md`
- Basic assignment workflow
- Compliance violation handling (SOC 2 vs HiTrust)
- Automatic task routing (single/multiple team members)
- Special case: ALL duty (single-source projects)
- Admin customization of duty types
- Error handling and validation
- Compliance audit trail

**Contract Tests**: Detailed OpenAPI schemas for 11 API endpoints
- Full request/response schemas
- Error cases with status codes
- Security requirements (Bearer token authentication)

---

## Next Steps

To proceed to task generation and implementation:

1. ✅ Phase 0 research complete - `research.md` generated
2. ✅ Phase 1 design complete - all artifacts generated
3. ✅ Constitution check passed - post-design validation successful
4. ⏭️ Run `/tasks` command to generate `tasks.md` with ordered, sequenced tasks
5. ⏭️ Run `/implement` command to execute implementation following TDD approach
6. ⏭️ Run `/qa` command for Phase 3 QA testing and validation

---

## Artifact Locations

**Complete Feature Package**:
- 📄 Specification: `specs/004-Team Assigments/spec.md`
- 📄 Research: `specs/004-Team Assigments/research.md`
- 📄 Plan: `specs/004-Team Assigments/plan.md`
- 📊 Data Model: `specs/004-Team Assigments/data-model.md`
- 🔌 API Contracts: `specs/004-Team Assigments/contracts/*.openapi.json`
- 🧪 Integration Tests: `specs/004-Team Assigments/quickstart.md`
- ✓ Quality Checklist: `specs/004-Team Assigments/checklists/requirements.md`

---

*Based on Constitution v1.2.0 — See `/.specify/memory/constitution.md`*
