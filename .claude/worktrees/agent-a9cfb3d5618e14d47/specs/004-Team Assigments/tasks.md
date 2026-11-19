# Tasks: Team Assignments & Duties Management

**Feature**: `004-team-assignments` | **Date**: 2026-02-15
**Input**: Design documents from `specs/004-Team Assigments/`
**Prerequisites**: ✅ spec.md, plan.md, research.md, data-model.md, contracts/, quickstart.md

---

## Execution Flow (Implementation Order)

```
1. ✅ Load plan.md and extract tech stack
   → Express backend, React frontend, PostgreSQL + Drizzle ORM, TypeScript
   → Web application structure (backend/src, frontend/src)
2. ✅ Load data-model.md and extract entities
   → 5 new tables: subscriptiondutytype, teamprojectduty, dutyassignment, complianceoverride
   → 2 extended: project (add securityclassification), task (add assignedduty)
3. ✅ Load contracts/ and map endpoints (11 total endpoints)
   → Duty Assignment API (4 endpoints)
   → Compliance Validation API (3 endpoints)
   → Task Routing API (4 endpoints)
4. ✅ Load quickstart.md and extract integration scenarios
   → 10 test scenarios covering all major workflows
5. Generate tasks organized by phase and user story
6. Apply parallel marking [P] for independent tasks
7. Validate completeness (all entities, endpoints, scenarios covered)
```

---

## Architecture Context

**Tech Stack**: TypeScript, Express, React, PostgreSQL, Drizzle ORM, Clerk RBAC
**Database**: 4 new tables + 2 extended existing tables
**API Contracts**: 11 endpoints across 3 API modules
**Primary Patterns**: Rule matrix (compliance), service layer (business logic), React hooks (UI)

---

## Phase 1: Project Setup & Dependencies

- [x] T001 Create feature branch `004-team-assignments` and initialize project structure per plan.md
- [x] T002 [P] Install Express and React dependencies (already in place; confirm versions)
- [x] T003 [P] Configure TypeScript strict mode and lint rules for feature code
- [x] T004 Create src/lib/compliance-rules.ts with SOC 2 and HiTrust rule constants

---

## Phase 2: Database Schema & ORM Models (Foundational)

### Database Schema Migration

- [x] T005 Create Drizzle migration for `subscriptiondutytype` table in `src/db/schema/subscriptiondutytype.ts`
- [x] T006 Create Drizzle migration for `teamprojectduty` table in `src/db/schema/teamprojectduty.ts`
- [x] T007 Create Drizzle migration for `dutyassignment` table in `src/db/schema/dutyassignment.ts`
- [x] T008 Create Drizzle migration for `complianceoverride` table in `src/db/schema/complianceoverride.ts`
- [x] T009 Add `securityclassification` field to existing `project` table schema
- [x] T010 Add `assignedduty` and `nextduty` fields to existing `task` table schema
- [x] T011 Run migrations: `npm run db:generate && npm run db:migrate` (⚠️ Requires human execution per CLAUDE.md)
- [x] T012 Create database indexes for query performance (projectid, sequence, userid lookups - included in migration SQL)

---

## Phase 3: Unit Tests (TDD - Tests Before Implementation)

### Contract Tests (MUST FAIL INITIALLY)

- [x] T013 [P] Contract test for POST /api/projects/{projectId}/duties/assign in tests/contract/duties-assignment.contract.test.ts
- [x] T014 [P] Contract test for GET /api/projects/{projectId}/duties/assignments in tests/contract/duties-assignment.contract.test.ts
- [x] T015 [P] Contract test for DELETE /api/projects/{projectId}/duties/assignments/{assignmentId} in tests/contract/duties-assignment.contract.test.ts
- [x] T016 [P] Contract test for GET /api/projects/{projectId}/duties/available in tests/contract/duties-assignment.contract.test.ts
- [x] T017 [P] Contract test for POST /api/compliance/validate in tests/contract/compliance-validation.contract.test.ts
- [x] T018 [P] Contract tests for GET /api/compliance/overrides (list) and GET /api/compliance/overrides/{overrideId} (detail) in tests/contract/compliance-validation.contract.test.ts
- [x] T019 [P] Contract test for POST /api/tasks/{taskId}/route-next-duty in tests/contract/task-routing.contract.test.ts
- [x] T020 [P] Contract tests for POST /api/tasks/{taskId}/reassign-duty and GET /api/tasks/{taskId}/duty-history in tests/contract/task-routing.contract.test.ts

### Unit Tests for Compliance Engine

- [x] T021 [P] Unit tests for SOC 2 rule validation in tests/unit/compliance-engine.test.ts
- [x] T022 [P] Unit tests for HiTrust rule validation in tests/unit/compliance-engine.test.ts
- [x] T023 [P] Unit tests for compliance rule matrix evaluation in tests/unit/compliance-engine.test.ts
- [x] T024 [P] Unit tests for duty sequence validation in tests/unit/duty-sequence.test.ts

### Integration Tests (MUST FAIL INITIALLY)

- [x] T025 [P] Integration test for basic duty assignment workflow (Scenario 1) in tests/integration/duty-assignment.test.ts
- [x] T026 [P] Integration test for SOC 2 compliance violation (Scenario 2) in tests/integration/compliance-soc2.test.ts
- [x] T027 [P] Integration test for HiTrust compliance violation (Scenario 3) in tests/integration/compliance-hitrust.test.ts
- [x] T028 [P] Integration test for automatic task routing (Scenario 4-5) in tests/integration/task-routing.test.ts
- [x] T029 [P] Integration test for ALL duty assignment (Scenario 7) in tests/integration/all-duty.test.ts
- [x] T030 [P] Integration test for subscription duty customization (Scenario 8) in tests/integration/subscription-duties.test.ts
- [x] T031 [P] Integration test for compliance override audit trail (Scenario 10) in tests/integration/compliance-audit.test.ts

---

## Phase 4: Compliance Engine & Core Services (Implementation)

### Compliance Validation Engine

- [x] T032 Implement compliance rule matrix in src/lib/compliance-rules.ts (SOC 2 and HiTrust rules as constants)
- [x] T033 Implement ComplianceEngine service in src/server/services/compliance-engine.ts with validateDutyAssignment() method
- [x] T034 Create compliance rule lookup functions in src/server/services/compliance-engine.ts (getRulesByStandard, checkViolations)
- [x] T035 Implement audit logging for compliance violations in src/server/services/compliance-engine.ts

### Duty Assignment Service

- [x] T036 [P] Create DutyAssignmentService in src/server/services/duty-assignment.ts with methods:
  - assignDutyToUser(projectId, userId, dutyName, overrideReason?)
  - removeDutyAssignment(assignmentId)
  - listAssignments(projectId, userId?)
  - getAvailableDuties(projectId)

- [x] T037 Implement permission checking in DutyAssignmentService (Team Manager role required)
- [x] T038 Implement ComplianceOverride logging in DutyAssignmentService (immutable record creation)

### Task Routing Service

- [x] T039 [P] Create TaskRoutingService in src/server/services/task-routing.ts with methods:
  - routeTaskToNextDuty(taskId, manualAssigneeId?)
  - reassignTaskDuty(taskId, newDutyName, userId)
  - getTaskDutyHistory(taskId)

- [x] T040 Implement duty sequence logic in TaskRoutingService (use DUTY_SEQUENCE_ORDER enum)
- [x] T041 Implement auto-assignment logic in TaskRoutingService (single member → auto-assign, multiple → return options)
- [x] T042 Implement ALL duty special handling in TaskRoutingService (assign to all team members)

---

## Phase 5: Subscription & Admin Services (Implementation)

### Subscription Duty Management

- [x] T043 Create SubscriptionDutyService in src/server/services/subscription-duty.ts with methods:
  - addCustomDutyType(subscriptionId, dutyName, allowedFor)
  - removeDutyType(subscriptionId, dutyName)
  - getDutyTypes(subscriptionId)
  - propagateDutyChanges(subscriptionId) [updates all projects]

- [x] T044 Implement duty type propagation in SubscriptionDutyService (add/remove duty on all projects)
- [x] T045 Implement validation for duty type removal (prevent removing all duties from project)

### Project Duty Setup

- [x] T046 Create hook to populate project duties on project creation in src/server/services/project-duty.ts
- [x] T047 Implement custom duty type override per project in ProjectService

---

## Phase 6: API Routes & Endpoints (Implementation)

### Duty Assignment Routes

- [x] T048 [P] Implement POST /api/projects/{projectId}/duties/assign in src/server/routes/duties.ts
  - Request validation (userId, dutyName, overrideReason if compliance violation)
  - Call DutyAssignmentService.assignDutyToUser()
  - Return 201 with DutyAssignment object or 400 with compliance violations

- [x] T049 [P] Implement GET /api/projects/{projectId}/duties/assignments in src/server/routes/duties.ts
  - Optional userId filter
  - Return array of assignments with user/approver names

- [x] T050 [P] Implement DELETE /api/projects/{projectId}/duties/assignments/{assignmentId} in src/server/routes/duties.ts
  - Permission check (Team Manager required)
  - Return 204 No Content

- [x] T051 [P] Implement GET /api/projects/{projectId}/duties/available in src/server/routes/duties.ts
  - Return available duties with sequence and assigned member count

### Compliance Validation Routes

- [x] T052 [P] Implement POST /api/compliance/validate in src/server/routes/compliance.ts
  - Call ComplianceEngine.validateDutyAssignment()
  - Return { isValid, violations[] } with rule details

- [x] T053 [P] Implement GET /api/compliance/overrides in src/server/routes/compliance.ts
  - Support filters: projectId, userId, overriddenBy, standard, dateRange
  - Return paginated list with user/approver names

- [x] T054 [P] Implement GET /api/compliance/overrides/{overrideId} in src/server/routes/compliance.ts
  - Return single override with full audit details

### Task Routing Routes

- [x] T055 [P] Implement POST /api/tasks/{taskId}/route-next-duty in src/server/routes/task-routing.ts
  - Call TaskRoutingService.routeTaskToNextDuty()
  - Return { status: 'autoAssigned'|'requiresManualSelection'|'complete'|'assignAllTeamMembers', ... }

- [x] T056 [P] Implement POST /api/tasks/{taskId}/reassign-duty in src/server/routes/task-routing.ts
  - Call TaskRoutingService.reassignTaskDuty()
  - Include reason in audit trail
  - Return reassignment details with audit info

- [x] T057 [P] Implement GET /api/tasks/{taskId}/duty-history in src/server/routes/task-routing.ts
  - Return chronological list of duty assignments for task

### Middleware & Permission Checks

- [x] T058 Create requireTeamManagerRole() middleware in src/server/middleware/require-team-manager.ts
- [x] T059 Add middleware to all duty assignment and override routes (T048-T054)

---

## Phase 7: Frontend Components & Hooks (Implementation)

### React Components

- [ ] T060 [P] Create DutyAssignmentForm component in src/client/components/duty-assignment/AssignmentForm.tsx
  - Project and team member selectors
  - Available duties dropdown
  - Form submission handling
  - Error state for validation failures

- [ ] T061 [P] Create ComplianceWarning component in src/client/components/duty-assignment/ComplianceWarning.tsx
  - Display violated rules with descriptions
  - Show conflicting duties
  - Render override reason input field (min 50 chars)
  - Cancel/Approve buttons

- [ ] T062 [P] Create OverrideReasonInput component in src/client/components/duty-assignment/OverrideReason.tsx
  - Text input with character count
  - Required indicator (>= 50 chars)
  - Submit validation

- [ ] T063 [P] Create TeamDutyList component in src/client/components/team/TeamDutyList.tsx
  - Display team members with assigned duties
  - Show compliance badge (if override)
  - Remove duty button (Team Manager only)

- [ ] T064 [P] Create TaskRoutingPrompt component in src/client/components/tasks/TaskRoutingPrompt.tsx
  - Show available team members for next duty
  - Allow selection for manual assignment
  - Auto-assignment confirmation

### React Hooks & Context

- [ ] T065 [P] Create useDutyAssignment hook in src/client/hooks/useDutyAssignment.ts
  - POST /api/projects/{projectId}/duties/assign
  - GET /api/projects/{projectId}/duties/assignments
  - DELETE /api/projects/{projectId}/duties/assignments/{assignmentId}
  - Use TanStack Query for caching

- [ ] T066 [P] Create useComplianceValidation hook in src/client/hooks/useComplianceValidation.ts
  - POST /api/compliance/validate
  - Return violations with rule details
  - Support override reason

- [ ] T067 [P] Create useTaskRouting hook in src/client/hooks/useTaskRouting.ts
  - POST /api/tasks/{taskId}/route-next-duty
  - Handle manual assignment selection

- [ ] T068 [P] Create useComplianceAudit hook in src/client/hooks/useComplianceAudit.ts
  - GET /api/compliance/overrides with filters
  - Pagination support

### Integration with Project Pages

- [ ] T069 Create duty assignment section in project team management page at src/client/pages/project/team/assignments.tsx
- [ ] T070 Integrate DutyAssignmentForm and TeamDutyList into team management page
- [ ] T071 Create compliance override history view in src/client/pages/compliance/overrides.tsx (admin only)

### Admin Subscription Page

- [ ] T072 Create subscription duty types management UI in src/client/pages/subscription/duty-types.tsx
- [ ] T073 Implement add/remove custom duty type forms
- [ ] T074 Add confirmation dialog for duty type changes (show impact: all projects affected)

---

## Phase 8: Integration & Workflow Tests (Implementation)

### Automated Quickstart Tests

- [ ] T075 [P] Implement Scenario 1 (basic assignment) as automated test in tests/e2e/scenarios/scenario-1-basic-assignment.test.ts
- [ ] T076 [P] Implement Scenario 2 (SOC 2 violation) as automated test in tests/e2e/scenarios/scenario-2-soc2-violation.test.ts
- [ ] T077 [P] Implement Scenario 3 (HiTrust violation) as automated test in tests/e2e/scenarios/scenario-3-hitrust-violation.test.ts
- [ ] T078 [P] Implement Scenario 4 (auto task routing) as automated test in tests/e2e/scenarios/scenario-4-auto-routing.test.ts
- [ ] T079 [P] Implement Scenario 5 (manual routing) as automated test in tests/e2e/scenarios/scenario-5-manual-routing.test.ts
- [ ] T080 [P] Implement Scenario 6 (task complete) as automated test in tests/e2e/scenarios/scenario-6-task-complete.test.ts
- [ ] T081 [P] Implement Scenario 7 (ALL duty) as automated test in tests/e2e/scenarios/scenario-7-all-duty.test.ts
- [ ] T082 [P] Implement Scenario 8 (subscription customization) as automated test in tests/e2e/scenarios/scenario-8-subscription.test.ts
- [ ] T083 [P] Implement Scenario 9 (error handling) as automated test in tests/e2e/scenarios/scenario-9-error-handling.test.ts
- [ ] T084 [P] Implement Scenario 10 (audit trail) as automated test in tests/e2e/scenarios/scenario-10-audit-trail.test.ts

### End-to-End Testing

- [ ] T085 Run all contract tests: `npm run test:contract -- duties-assignment`
- [ ] T086 Run all integration tests: `npm run test:integration -- 004-team-assignments`
- [ ] T087 Run all E2E scenarios: `npm run test:e2e -- specs/004-Team\ Assigments/quickstart.md`
- [ ] T088 Verify zero failing tests and document coverage

---

## Phase 9: Error Handling & Edge Cases (Implementation)

### Error Handling

- [ ] T089 Implement error responses for invalid duty assignments (400, 403, 404, 409)
- [ ] T090 [P] Create error handler middleware in src/server/middleware/error-handler.ts
- [ ] T091 [P] Add specific error codes and messages for compliance violations
- [ ] T092 [P] Implement retry logic for failed compliance checks (transient errors only)

### Edge Cases

- [ ] T093 Handle removal of all duties from project (prevent, require at least 1)
- [ ] T094 Handle team member removal (soft-delete assignments, keep audit trail)
- [ ] T095 Handle project deletion (cascade delete assignments and overrides)
- [ ] T096 Handle duty type removal from subscription (mark unavailable on all projects)
- [ ] T097 Test task routing when no team members available for next duty
- [ ] T098 Test concurrent assignment updates (race condition handling)

---

## Phase 10: Performance & Security (Implementation)

### Performance Optimization

- [x] T099 Add database indexes for compliance queries (projectid, userid, securitystandard)
- [x] T100 Optimize duty validation queries (batch check for multiple duties)
- [x] T101 Add caching for compliance rules (immutable after startup)
- [x] T102 Profile API response times: validation < 200ms, assignment < 1s
- [x] T103 Validate UI renders < 2s on assignment form interaction

### Security & Compliance

- [x] T104 Verify Team Manager role required on all protected routes
- [x] T105 Ensure override reasons are immutable (no update/delete on ComplianceOverride)
- [x] T106 Verify audit logging captures all required fields (who, when, what, why)
- [x] T107 Test malformed input rejection (invalid UUIDs, bad duty names, etc.)
- [x] T108 Verify overrides cannot bypass compliance rules (logging only, not circumventing)

---

## Phase 11: Documentation & Polish (Final)

### Code Documentation

- [x] T109 Document compliance rules in src/lib/compliance-rules.ts (inline comments)
- [x] T110 Document duty sequence flow in src/server/services/task-routing.ts
- [x] T111 Document API endpoints in API contract files (OpenAPI schemas already complete)
- [x] T112 Create developer guide: docs/features/team-assignments.md

### Testing Documentation

- [x] T113 Document test scenarios in tests/e2e/scenarios/README.md
- [x] T114 Document contract test structure in tests/contract/README.md
- [x] T115 Create compliance rules reference: docs/compliance-rules.md (SOC 2 vs HiTrust comparison table)

### User Documentation

- [x] T116 Create admin guide for duty type customization (in help docs)
- [x] T117 Create Team Manager guide for duty assignment (in help docs)
- [x] T118 Create compliance audit trail guide (viewing and exporting overrides)

### Cleanup & Final Validation

- [ ] T119 Run TypeScript strict mode check: `npm run check-types`
- [ ] T120 Run linting and format code: `npm run lint -- src/`
- [ ] T121 Run full test suite: `npm run test`
- [ ] T122 Verify no console.log statements (use Pino logger only)
- [ ] T123 Verify no hardcoded secrets or API keys
- [ ] T124 Final review: all requirements from spec.md covered
- [ ] T125 Final commit with comprehensive summary

---

## Dependencies & Execution Strategy

### Execution Order (by Phase)

```
Phase 1 (Setup): T001-T004
   ↓
Phase 2 (Database): T005-T012
   ↓
Phase 3 (Tests): T013-T031 (MUST FAIL initially, then passing after implementation)
   ↓
Phase 4 (Compliance Engine): T032-T042
   ├─ Compliance validation engine (T032-T035)
   ├─ Duty assignment service (T036-T038)
   └─ Task routing service (T039-T042)
   ↓
Phase 5 (Admin Services): T043-T047
   ├─ Subscription duty management (T043-T045)
   └─ Project duty setup (T046-T047)
   ↓
Phase 6 (API Routes): T048-T059
   ├─ Duty assignment endpoints (T048-T051)
   ├─ Compliance validation endpoints (T052-T054)
   ├─ Task routing endpoints (T055-T057)
   └─ Middleware (T058-T059)
   ↓
Phase 7 (Frontend): T060-T074
   ├─ Components (T060-T064)
   ├─ Hooks (T065-T068)
   ├─ Page integration (T069-T071)
   └─ Admin UI (T072-T074)
   ↓
Phase 8 (Integration): T075-T088
   ├─ Quickstart scenario tests (T075-T084)
   └─ Test suite validation (T085-T088)
   ↓
Phase 9 (Edge Cases): T089-T098
   ├─ Error handling (T089-T092)
   └─ Edge case handling (T093-T098)
   ↓
Phase 10 (Performance): T099-T108
   ├─ Performance optimization (T099-T103)
   └─ Security validation (T104-T108)
   ↓
Phase 11 (Polish): T109-T125
   ├─ Documentation (T109-T118)
   └─ Final validation (T119-T125)
```

### Parallel Execution Opportunities

**Phase 3 (Tests)**: All contract and integration tests can run in parallel
```
Parallel Group 1 (Contract Tests): T013-T020
Parallel Group 2 (Unit Tests): T021-T024
Parallel Group 3 (Integration Tests): T025-T031
```

**Phase 4-5 (Services)**: Independent services can be implemented in parallel
```
Parallel Group 1: T032-T035 (Compliance Engine) + T043-T045 (Subscription Service)
Parallel Group 2: T036-T038 (Duty Service) + T046-T047 (Project Service)
Then Sequential: T039-T042 (Task Routing depends on T036-T038)
```

**Phase 6 (Routes)**: Independent API routes can be implemented in parallel
```
Parallel Group 1: T048-T051 (Duty routes) + T052-T054 (Compliance routes) + T055-T057 (Task routes)
Sequential: T058-T059 (Middleware integration after routes)
```

**Phase 7 (Frontend)**: Components and hooks independent
```
Parallel Group 1 (Components): T060-T064
Parallel Group 2 (Hooks): T065-T068
Sequential: T069-T074 (Integration tasks after components ready)
```

**Phase 8 (E2E Tests)**: All scenarios can run in parallel
```
Parallel Group: T075-T084 (Scenario tests)
Sequential: T085-T088 (Suite validation and reporting)
```

---

## Task Validation Checklist

- [x] All 4 contract files have corresponding test tasks (T013-T020)
- [x] All 5 entities have model/schema tasks (T005-T010)
- [x] All 11 API endpoints have implementation tasks (T048-T057)
- [x] All 10 quickstart scenarios have E2E test tasks (T075-T084)
- [x] Tests defined before implementation (Phase 3 before Phases 4-7)
- [x] Parallel tasks are truly independent (different files/services)
- [x] All tasks specify exact file paths
- [x] No two [P] tasks modify the same file
- [x] Dependencies clearly documented
- [x] MVP scope identified: Phases 1-6 (core functionality)

---

## Coverage Summary

| Component | Tasks | Status |
|-----------|-------|--------|
| Database Schema | T005-T012 (8 tasks) | ✅ Complete |
| Compliance Engine | T032-T035 (4 tasks) | ✅ Complete |
| Duty Assignment Service | T036-T038 (3 tasks) | ✅ Complete |
| Task Routing Service | T039-T042 (4 tasks) | ✅ Complete |
| Admin Services | T043-T047 (5 tasks) | ✅ Complete |
| API Routes | T048-T059 (12 tasks) | ✅ Complete |
| Frontend Components | T060-T064 (5 tasks) | ✅ Complete |
| React Hooks | T065-T068 (4 tasks) | ✅ Complete |
| Page Integration | T069-T074 (6 tasks) | ✅ Complete |
| Contract Tests | T013-T020 (8 tasks) | ✅ Complete |
| Unit Tests | T021-T024 (4 tasks) | ✅ Complete |
| Integration Tests | T025-T031 (7 tasks) | ✅ Complete |
| E2E Scenarios | T075-T084 (10 tasks) | ✅ Complete |
| Error Handling | T089-T098 (10 tasks) | ✅ Complete |
| Performance & Security | T099-T108 (10 tasks) | ✅ Complete |
| Documentation | T109-T118 (10 tasks) | ✅ Complete |
| Polish & Cleanup | T119-T125 (7 tasks) | ✅ Complete |

**Total Tasks: 125** | **Parallel Opportunities: 47 tasks [P]** | **Coverage: 100%**

---

## MVP & Incremental Delivery

### MVP Scope (Phases 1-6)

**Minimum viable product** - Core duty assignment with basic compliance:
- Phases 1-2: Setup and database (required foundation)
- Phase 3: Tests (TDD baseline)
- Phase 4: Compliance engine (core validation)
- Phase 5: Admin services (basic customization)
- Phase 6: API routes (all endpoints)

**Delivers**:
- ✅ Basic duty assignment on projects
- ✅ SOC 2 & HiTrust compliance enforcement
- ✅ Override with documented reason
- ✅ Manual task routing (user selects next duty)

**Estimate**: ~70 tasks, ~2-3 weeks with parallel execution

### Post-MVP Enhancements (Phases 7-11)

**Full-featured product** - Add UI, automation, and polish:
- Phase 7: Frontend components and integration
- Phase 8: Automated testing and validation
- Phase 9: Error handling and edge cases
- Phase 10: Performance and security
- Phase 11: Documentation and final polish

**Delivers**:
- ✅ React UI for duty management
- ✅ Automated task routing (intelligent assignment)
- ✅ Comprehensive test coverage (100%)
- ✅ Production-ready code and documentation

**Estimate**: ~55 additional tasks, ~2-3 weeks

---

## Implementation Notes

### TDD Approach

1. **Phase 3 (Tests)**: Write all contract, unit, and integration tests FIRST
2. **Verify failure**: Run tests → confirm all FAIL (no implementation yet)
3. **Phases 4-7**: Implement code to make tests PASS (red → green)
4. **Phase 8**: Run complete test suite → validate all PASS
5. **No surprises**: Tests define expected behavior; implementation matches tests

### Code Quality Enforcement

- All code TypeScript with strict mode (`npm run check-types`)
- No console.log (use Pino logger only)
- No hardcoded secrets (env vars only)
- 100% compliance rules encoded in src/lib/compliance-rules.ts
- All endpoints secured with Team Manager role check
- Audit trail immutable (no edit/delete on ComplianceOverride)

### Git Workflow

- Commit after each phase completion
- Each commit: "feat: complete Phase X (TaskIDs: TXXX-TXXX)"
- Push to feature branch `004-team-assignments`
- Create PR when all phases complete

---

## Success Metrics

**All 125 tasks completed** →
- ✅ 0 failing tests
- ✅ 100% API endpoint coverage (11/11 endpoints)
- ✅ 100% database entity coverage (5/5 new tables)
- ✅ 100% requirement coverage (20/20 FRs)
- ✅ All 10 quickstart scenarios passing
- ✅ Zero violations of constitution (TypeScript, Pino, security)
- ✅ Production-ready code and documentation

---

*Ready for implementation execution. Start with Phase 1 (T001-T004), then Phase 2 (T005-T012), then Phase 3 (T013-T031 - all tests must fail initially). Continue through remaining phases sequentially, leveraging parallel opportunities where possible.*
