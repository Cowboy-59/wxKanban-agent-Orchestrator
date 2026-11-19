# Tasks: SysAdmin Platform Administration System

**Spec:** 014 - SysAdmin Platform Administration  
**Branch:** 014-sysadmin-platform-admin  
**Date:** 2025-01-20

---

## Phase 1: Foundation (Database & Middleware)

### Setup Tasks
- [ ] T001 [P1] Run database migration to create system_settings, company_status_history, company_analytics tables
  - **File**: `database/migrations/014_sysadmin_tables.sql`
  - **Test**: Verify tables exist with correct columns and indexes

- [ ] T002 [P1] Update user.ts schema to export UserType type with SYSADMIN value
  - **File**: `src/db/schema/user.ts`
  - **Test**: TypeScript compilation passes, UserType includes all 4 values

- [ ] T003 [P1] Create systemSettings.ts schema with SettingCategory enum
  - **File**: `src/db/schema/systemSettings.ts`
  - **Test**: Schema exports correctly, types are valid

- [ ] T004 [P1] Create companyStatus.ts schema with CompanyStatus enum and tables
  - **File**: `src/db/schema/companyStatus.ts`
  - **Test**: Both companyStatusHistory and companyAnalytics tables defined

- [ ] T005 [P1] Update schema index.ts to export new schemas
  - **File**: `src/db/schema/index.ts`
  - **Test**: All new schemas accessible via central export

### Middleware
- [ ] T006 [P1] Implement requireSysAdmin middleware with role checking
  - **File**: `src/server/middleware/requireSysAdmin.ts`
  - **Test**: Returns 403 for non-SysAdmin, calls next() for SysAdmin

- [ ] T007 [P1] Implement requireAdminOrSysAdmin middleware
  - **File**: `src/server/middleware/requireSysAdmin.ts`
  - **Test**: Allows both ADMIN and SYSADMIN roles

- [ ] T008 [P1] Add middleware unit tests
  - **File**: `tests/backend/middleware/requireSysAdmin.test.ts`
  - **Test**: All role combinations tested, 403 responses verified

### Initial User
- [ ] T009 [P1] Create CLI script to generate first SysAdmin user
  - **File**: `scripts/create-sysadmin.ts`
  - **Test**: Script creates user with usertype='SYSADMIN', securitylevel=10

- [ ] T010 [P1] Create seed data for development
  - **File**: `database/seeds/sysadmin_seed.ts`
  - **Test**: Seed creates test companies, users, and system settings

---

## Phase 2: Company Management API

### Backend - List Companies
- [ ] T011 [P1] Implement GET /api/sysadmin/companies endpoint
  - **File**: `src/server/routes/sysadmin.ts`
  - **Test**: Returns paginated list with filters

- [ ] T012 [P1] Create SysAdminCompanyService.listCompanies method
  - **File**: `src/server/services/SysAdminCompanyService.ts`
  - **Test**: Service handles pagination, sorting, filtering

- [ ] T013 [P1] Add pagination and filtering logic
  - **File**: `src/server/services/SysAdminCompanyService.ts`
  - **Test**: Correct limit/offset, status filter works, search by name

### Backend - Company Detail
- [ ] T014 [P1] Implement GET /api/sysadmin/companies/:id endpoint
  - **File**: `src/server/routes/sysadmin.ts`
  - **Test**: Returns full company details with analytics

- [ ] T015 [P1] Create getCompanyDetail service method
  - **File**: `src/server/services/SysAdminCompanyService.ts`
  - **Test**: Includes status history, users, recent activity

### Backend - Create Company
- [ ] T016 [P1] Implement POST /api/sysadmin/companies endpoint
  - **File**: `src/server/routes/sysadmin.ts`
  - **Test**: Creates company and admin user in transaction

- [ ] T017 [P1] Create createCompany service method with validation
  - **File**: `src/server/services/SysAdminCompanyService.ts`
  - **Test**: Zod validation, email uniqueness check, transaction safety

### Backend - Update Status
- [ ] T018 [P1] Implement PUT /api/sysadmin/companies/:id/status endpoint
  - **File**: `src/server/routes/sysadmin.ts`
  - **Test**: Status transition validation, audit record created

- [ ] T019 [P1] Create updateCompanyStatus service with transition rules
  - **File**: `src/server/services/SysAdminCompanyService.ts`
  - **Test**: Invalid transitions rejected, valid transitions succeed

### Backend - Delete Company
- [ ] T020 [P2] Implement DELETE /api/sysadmin/companies/:id endpoint
  - **File**: `src/server/routes/sysadmin.ts`
  - **Test**: Soft delete with retention period, notifications sent

### Backend - Analytics
- [ ] T021 [P2] Implement GET /api/sysadmin/companies/:id/analytics endpoint
  - **File**: `src/server/routes/sysadmin.ts`
  - **Test**: Returns metrics with period comparison

- [ ] T022 [P2] Create calculateCompanyAnalytics service method
  - **File**: `src/server/services/SysAdminCompanyService.ts`
  - **Test**: Aggregates users, projects, tasks, time correctly

### Frontend - Company List
<<<<<<< HEAD
- [x] T023 [P1] Create Companies main page component
  - **File**: `src/client/pages/SysAdmin/Companies.tsx`
  - **Test**: Renders companies list with data, handles routing

- [x] T024 [P1] Add filters and search UI
  - **File**: `src/client/pages/SysAdmin/Companies.tsx`
  - **Test**: Status filter, search input, sort controls functional

- [x] T025 [P1] Update App.tsx routing for Companies page
  - **File**: `src/client/App.tsx`
  - **Test**: Route /sysadmin/companies renders Companies component



### Frontend - Company Detail
- [x] T026 [P1] Create CompanyDetail view component
  - **File**: `src/client/pages/SysAdmin/Companies.tsx`
  - **Test**: Displays company info, analytics, status history

- [x] T027 [P1] Add status management controls
  - **File**: `src/client/pages/SysAdmin/Companies.tsx`
  - **Test**: Status dropdown, reason input, confirmation modal

### Frontend - Create Company
- [x] T028 [P1] Create CompanyCreate modal component
  - **File**: `src/client/pages/SysAdmin/Companies.tsx`
  - **Test**: Form validation, submit creates company, success message

### Frontend - User Management within Companies
- [x] T029 [P1] Add company users list view
  - **File**: `src/client/pages/SysAdmin/Companies.tsx`
  - **Test**: Shows users for selected company with roles

- [x] T030 [P1] Add user password reset functionality
  - **File**: `src/client/pages/SysAdmin/Companies.tsx`
  - **Test**: Reset password button, confirmation, success message

- [x] T031 [P1] Add user enable/disable controls
  - **File**: `src/client/pages/SysAdmin/Companies.tsx`
  - **Test**: Toggle user active status with confirmation



=======
- [ ] T023 [P1] Create CompanyList page component
  - **File**: `src/client/pages/SysAdmin/Companies/CompanyList.tsx`
  - **Test**: Renders table with company data, pagination works

- [ ] T024 [P1] Add filters and search UI
  - **File**: `src/client/pages/SysAdmin/Companies/CompanyList.tsx`
  - **Test**: Status filter, search input, sort controls functional

### Frontend - Company Detail
- [ ] T025 [P1] Create CompanyDetail page component
  - **File**: `src/client/pages/SysAdmin/Companies/CompanyDetail.tsx`
  - **Test**: Displays company info, analytics, status history

- [ ] T026 [P1] Add status management controls
  - **File**: `src/client/pages/SysAdmin/Companies/CompanyDetail.tsx`
  - **Test**: Status dropdown, reason input, confirmation modal

### Frontend - Create Company
- [ ] T027 [P1] Create CompanyCreate modal component
  - **File**: `src/client/pages/SysAdmin/Companies/CompanyCreate.tsx`
  - **Test**: Form validation, submit creates company, success message

>>>>>>> origin/014-sysadmin-platform-admin
---

## Phase 3: User Management API

### Backend - Search Users
- [ ] T028 [P1] Implement GET /api/sysadmin/users endpoint
  - **File**: `src/server/routes/sysadmin.ts`
  - **Test**: Global search across all companies, pagination

- [ ] T029 [P1] Create SysAdminUserService.searchUsers method
  - **File**: `src/server/services/SysAdminUserService.ts`
  - **Test**: Search by email/name, filter by company/role/status

### Backend - User Detail
- [ ] T030 [P1] Implement GET /api/sysadmin/users/:id endpoint
  - **File**: `src/server/routes/sysadmin.ts`
  - **Test**: Returns user with cross-company activity

- [ ] T031 [P1] Create getUserDetail service method
  - **File**: `src/server/services/SysAdminUserService.ts`
  - **Test**: Includes login history, project access, audit trail

### Backend - Password Reset
- [ ] T032 [P1] Implement POST /api/sysadmin/users/:id/reset-password endpoint
  - **File**: `src/server/routes/sysadmin.ts`
  - **Test**: Generates temp password, sends email, audit logged

- [ ] T033 [P1] Create resetPassword service method
  - **File**: `src/server/services/SysAdminUserService.ts`
  - **Test**: Password hashed correctly, notification sent

### Backend - Update Status
- [ ] T034 [P1] Implement PUT /api/sysadmin/users/:id/status endpoint
  - **File**: `src/server/routes/sysadmin.ts`
  - **Test**: Enable/disable account, terminate sessions

- [ ] T035 [P1] Create updateUserStatus service method
  - **File**: `src/server/services/SysAdminUserService.ts`
  - **Test**: Session invalidation, notification sent

### Backend - Transfer User
- [ ] T036 [P2] Implement POST /api/sysadmin/users/transfer endpoint
  - **File**: `src/server/routes/sysadmin.ts`
  - **Test**: Transfer with data preservation, role change

- [ ] T037 [P2] Create transferUser service method
  - **File**: `src/server/services/SysAdminUserService.ts`
  - **Test**: Transaction safety, data integrity maintained

### Backend - Activity
- [ ] T038 [P2] Implement GET /api/sysadmin/users/:id/activity endpoint
  - **File**: `src/server/routes/sysadmin.ts`
  - **Test**: Returns activity timeline with period filter

### Frontend - User Search
<<<<<<< HEAD
- [ ] T042 [P1] Create UserSearch page component
  - **File**: `src/client/pages/SysAdmin/Users/UserSearch.tsx`
  - **Test**: Search input, results table, filters functional


### Frontend - User Detail
- [ ] T043 [P1] Create UserDetail page component
  - **File**: `src/client/pages/SysAdmin/Users/UserDetail.tsx`
  - **Test**: Displays user info, activity, project access

- [ ] T044 [P1] Add password reset and status controls
=======
- [ ] T039 [P1] Create UserSearch page component
  - **File**: `src/client/pages/SysAdmin/Users/UserSearch.tsx`
  - **Test**: Search input, results table, filters functional

### Frontend - User Detail
- [ ] T040 [P1] Create UserDetail page component
  - **File**: `src/client/pages/SysAdmin/Users/UserDetail.tsx`
  - **Test**: Displays user info, activity, project access

- [ ] T041 [P1] Add password reset and status controls
>>>>>>> origin/014-sysadmin-platform-admin
  - **File**: `src/client/pages/SysAdmin/Users/UserDetail.tsx`
  - **Test**: Reset password button, enable/disable toggle

### Frontend - Transfer User
<<<<<<< HEAD
- [ ] T045 [P2] Create UserTransfer modal component
  - **File**: `src/client/pages/SysAdmin/Users/UserTransfer.tsx`
  - **Test**: Company selection, role selection, confirmation


=======
- [ ] T042 [P2] Create UserTransfer modal component
  - **File**: `src/client/pages/SysAdmin/Users/UserTransfer.tsx`
  - **Test**: Company selection, role selection, confirmation

>>>>>>> origin/014-sysadmin-platform-admin
---

## Phase 4: System Monitoring

### Backend - Platform Metrics
- [ ] T043 [P2] Implement GET /api/sysadmin/metrics/platform endpoint
  - **File**: `src/server/routes/sysadmin.ts`
  - **Test**: Returns companies, users, revenue, engagement metrics

- [ ] T044 [P2] Create SysAdminMetricsService.getPlatformMetrics method
  - **File**: `src/server/services/SysAdminMetricsService.ts`
  - **Test**: Aggregates data across all companies

### Backend - Database Health
- [ ] T045 [P2] Implement GET /api/sysadmin/metrics/database endpoint
  - **File**: `src/server/routes/sysadmin.ts`
  - **Test**: Returns connection pool, query performance, table sizes

### Backend - Job Queue
- [ ] T046 [P2] Implement GET /api/sysadmin/metrics/jobs endpoint
  - **File**: `src/server/routes/sysadmin.ts`
  - **Test**: Returns queue statuses, worker utilization

### Backend - Integration Health
- [ ] T047 [P2] Implement GET /api/sysadmin/metrics/integrations endpoint
  - **File**: `src/server/routes/sysadmin.ts`
  - **Test**: Returns Stripe, Mailgun, AWS health status

### Backend - API Statistics
- [ ] T048 [P2] Implement GET /api/sysadmin/metrics/api endpoint
  - **File**: `src/server/routes/sysadmin.ts`
  - **Test**: Returns request counts, response times, errors

### Backend - Alerts
- [ ] T049 [P2] Implement GET /api/sysadmin/metrics/alerts endpoint
  - **File**: `src/server/routes/sysadmin.ts`
  - **Test**: Returns current system alerts

- [ ] T050 [P2] Implement POST /api/sysadmin/metrics/alerts/:id/acknowledge
  - **File**: `src/server/routes/sysadmin.ts`
  - **Test**: Acknowledges alert with note

### Frontend - Dashboard
<<<<<<< HEAD
- [ ] T054 [P2] Create SysAdminDashboard overview component
=======
- [ ] T051 [P2] Create SysAdminDashboard overview component
>>>>>>> origin/014-sysadmin-platform-admin
  - **File**: `src/client/pages/SysAdmin/Dashboard.tsx`
  - **Test**: Displays KPI cards, recent alerts, quick actions

### Frontend - Metrics Views
<<<<<<< HEAD
- [ ] T055 [P2] Create PlatformMetrics component with charts
  - **File**: `src/client/pages/SysAdmin/Metrics/PlatformMetrics.tsx`
  - **Test**: Renders charts for users, companies, revenue

- [ ] T056 [P2] Create SystemHealth component
  - **File**: `src/client/pages/SysAdmin/Metrics/SystemHealth.tsx`
  - **Test**: Database health, job queues, integrations status

- [ ] T057 [P2] Create AlertsPanel component
  - **File**: `src/client/pages/SysAdmin/Metrics/AlertsPanel.tsx`
  - **Test**: Lists alerts, acknowledge functionality


=======
- [ ] T052 [P2] Create PlatformMetrics component with charts
  - **File**: `src/client/pages/SysAdmin/Metrics/PlatformMetrics.tsx`
  - **Test**: Renders charts for users, companies, revenue

- [ ] T053 [P2] Create SystemHealth component
  - **File**: `src/client/pages/SysAdmin/Metrics/SystemHealth.tsx`
  - **Test**: Database health, job queues, integrations status

- [ ] T054 [P2] Create AlertsPanel component
  - **File**: `src/client/pages/SysAdmin/Metrics/AlertsPanel.tsx`
  - **Test**: Lists alerts, acknowledge functionality

>>>>>>> origin/014-sysadmin-platform-admin
---

## Phase 5: Settings Management

### Backend - Settings API
- [ ] T055 [P2] Implement GET /api/sysadmin/settings endpoint
  - **File**: `src/server/routes/sysadmin.ts`
  - **Test**: Returns all system settings by category

- [ ] T056 [P2] Implement PUT /api/sysadmin/settings/:key endpoint
  - **File**: `src/server/routes/sysadmin.ts`
  - **Test**: Updates setting with validation, audit log

- [ ] T057 [P2] Implement GET /api/sysadmin/settings/:key/history endpoint
  - **File**: `src/server/routes/sysadmin.ts`
  - **Test**: Returns setting change history

### Frontend - Settings UI
<<<<<<< HEAD
- [ ] T061 [P2] Create SettingsManager component
  - **File**: `src/client/pages/SysAdmin/Settings/SettingsManager.tsx`
  - **Test**: Category tabs, setting forms, save functionality

- [ ] T062 [P2] Create SettingHistory component
  - **File**: `src/client/pages/SysAdmin/Settings/SettingHistory.tsx`
  - **Test**: Displays change history with user and timestamp


=======
- [ ] T058 [P2] Create SettingsManager component
  - **File**: `src/client/pages/SysAdmin/Settings/SettingsManager.tsx`
  - **Test**: Category tabs, setting forms, save functionality

- [ ] T059 [P2] Create SettingHistory component
  - **File**: `src/client/pages/SysAdmin/Settings/SettingHistory.tsx`
  - **Test**: Displays change history with user and timestamp

>>>>>>> origin/014-sysadmin-platform-admin
---

## Phase 6: Testing & Polish

### Integration Tests
<<<<<<< HEAD
- [ ] T063 [P1] Create API integration tests for all endpoints
=======
- [ ] T060 [P1] Create API integration tests for all endpoints
>>>>>>> origin/014-sysadmin-platform-admin
  - **File**: `tests/integration/sysadmin-api.test.ts`
  - **Test**: All CRUD operations, authorization, validation

### E2E Tests
<<<<<<< HEAD
- [ ] T064 [P2] Create E2E tests for company management workflow
  - **File**: `tests/e2e/sysadmin-companies.spec.ts`
  - **Test**: Full create-update-delete flow

- [ ] T065 [P2] Create E2E tests for user management workflow
=======
- [ ] T061 [P2] Create E2E tests for company management workflow
  - **File**: `tests/e2e/sysadmin-companies.spec.ts`
  - **Test**: Full create-update-delete flow

- [ ] T062 [P2] Create E2E tests for user management workflow
>>>>>>> origin/014-sysadmin-platform-admin
  - **File**: `tests/e2e/sysadmin-users.spec.ts`
  - **Test**: Search, reset password, transfer user

### Documentation
<<<<<<< HEAD
- [ ] T066 [P2] Update API.md with SysAdmin endpoints
  - **File**: `docs/API.md`
  - **Test**: All endpoints documented with examples

- [ ] T067 [P2] Create SysAdmin user guide
=======
- [ ] T063 [P2] Update API.md with SysAdmin endpoints
  - **File**: `docs/API.md`
  - **Test**: All endpoints documented with examples

- [ ] T064 [P2] Create SysAdmin user guide
>>>>>>> origin/014-sysadmin-platform-admin
  - **File**: `docs/SYSADMIN_GUIDE.md`
  - **Test**: Covers all features with screenshots

### Performance Optimization
<<<<<<< HEAD
- [ ] T068 [P3] Add caching for metrics endpoints
  - **File**: `src/server/services/SysAdminMetricsService.ts`
  - **Test**: Redis caching, cache invalidation

- [ ] T069 [P3] Optimize cross-tenant queries
=======
- [ ] T065 [P3] Add caching for metrics endpoints
  - **File**: `src/server/services/SysAdminMetricsService.ts`
  - **Test**: Redis caching, cache invalidation

- [ ] T066 [P3] Optimize cross-tenant queries
>>>>>>> origin/014-sysadmin-platform-admin
  - **File**: `src/server/services/SysAdminCompanyService.ts`
  - **Test**: Query execution time <200ms

### Security Hardening
<<<<<<< HEAD
- [ ] T070 [P1] Add rate limiting for SysAdmin endpoints
  - **File**: `src/server/routes/sysadmin.ts`
  - **Test**: Limits enforced, 429 responses

- [ ] T071 [P1] Add comprehensive audit logging
  - **File**: `src/server/services/SysAdminAuditService.ts`
  - **Test**: All actions logged with context


=======
- [ ] T067 [P1] Add rate limiting for SysAdmin endpoints
  - **File**: `src/server/routes/sysadmin.ts`
  - **Test**: Limits enforced, 429 responses

- [ ] T068 [P1] Add comprehensive audit logging
  - **File**: `src/server/services/SysAdminAuditService.ts`
  - **Test**: All actions logged with context

>>>>>>> origin/014-sysadmin-platform-admin
---

## Dependencies Graph

```
Phase 1 (Foundation)
├── T001 → T002 → T003 → T004 → T005 (Sequential)
├── T006 → T007 → T008 (Sequential)
└── T009 → T010 (Sequential)

Phase 2 (Companies)
├── T011 → T012 → T013 (Sequential)
├── T014 → T015 (Sequential)
├── T016 → T017 (Sequential)
├── T018 → T019 (Sequential)
├── T020 (Independent)
├── T021 → T022 (Sequential)
└── T023 → T024 → T025 → T026 → T027 (UI, can parallel with backend)

Phase 3 (Users)
├── T028 → T029 (Sequential)
├── T030 → T031 (Sequential)
├── T032 → T033 (Sequential)
├── T034 → T035 (Sequential)
├── T036 → T037 (Sequential)
├── T038 (Independent)
└── T039 → T040 → T041 → T042 (UI, can parallel with backend)

Phase 4 (Metrics)
├── T043 → T044 (Sequential)
├── T045 (Independent)
├── T046 (Independent)
├── T047 (Independent)
├── T048 (Independent)
├── T049 → T050 (Sequential)
└── T051 → T052 → T053 → T054 (UI, can parallel with backend)

Phase 5 (Settings)
├── T055 → T056 → T057 (Sequential)
└── T058 → T059 (UI, can parallel with backend)

Phase 6 (Testing)
├── T060 (Depends on all API endpoints)
├── T061 (Depends on T023-T027)
├── T062 (Depends on T039-T042)
├── T063 → T064 (Sequential)
├── T065 → T066 (Sequential)
└── T067 → T068 (Sequential)
```

---

## Parallel Execution Opportunities

**Maximum Parallelism**: 8 concurrent tasks

**Parallel Groups**:
1. Database setup (T001-T005) + Middleware (T006-T008) + Seed (T009-T010)
2. Backend Companies (T011-T022) + Frontend Companies (T023-T027)
3. Backend Users (T028-T038) + Frontend Users (T039-T042)
4. Backend Metrics (T043-T050) + Frontend Metrics (T051-T054)
5. Backend Settings (T055-T057) + Frontend Settings (T058-T059)
6. Testing & Documentation (T060-T068)

---

## Implementation Strategy

**Week 1**: Complete Phase 1 (Foundation)
- Focus: Database schemas, middleware, initial user setup
- Deliverable: SysAdmin can authenticate, foundation in place

**Week 2**: Complete Phase 2 (Company Management)
- Focus: Company CRUD, status management, analytics
- Deliverable: Full company management functional

**Week 3**: Complete Phase 3 (User Management)
- Focus: Global user search, password reset, transfers
- Deliverable: User management functional

**Week 4**: Complete Phase 4-5 (Monitoring & Settings)
- Focus: Metrics dashboard, system health, settings
- Deliverable: Monitoring and configuration functional

**Week 5**: Complete Phase 6 (Testing & Polish)
- Focus: Integration tests, E2E tests, documentation, performance
- Deliverable: Production-ready system

---

## Success Criteria

<<<<<<< HEAD
- [ ] All 71 tasks completed
- [ ] 100% of P1 tasks completed

=======
- [ ] All 68 tasks completed
- [ ] 100% of P1 tasks completed
>>>>>>> origin/014-sysadmin-platform-admin
- [ ] API test coverage >90%
- [ ] E2E tests passing
- [ ] Performance benchmarks met
- [ ] Security audit passed
- [ ] Documentation complete

---

*This task list was generated as part of the wxAI pipeline Phase 4: Tasks*
