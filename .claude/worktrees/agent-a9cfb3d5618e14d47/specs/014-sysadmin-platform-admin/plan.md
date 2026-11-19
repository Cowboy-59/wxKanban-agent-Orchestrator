# Implementation Plan: SysAdmin Platform Administration System

**Spec:** 014 - SysAdmin Platform Administration  
**Branch:** 014-sysadmin-platform-admin  
**Date:** 2025-01-20  
**Status:** Planning Phase

---

## Technical Context

### Current Stack
- **Backend**: Node.js + Express + TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Frontend**: React + TypeScript + Tailwind CSS
- **Authentication**: JWT tokens with company context
- **Existing User Types**: TEAM_MEMBER, TEAM_MANAGER, ADMIN

### New Components Required
- **User Type**: SYSADMIN (platform-level administrator)
- **Middleware**: requireSysAdmin, requireAdminOrSysAdmin
- **Database Tables**: systemSettings, companyStatusHistory, companyAnalytics
- **API Routes**: /api/sysadmin/* (new route namespace)
- **Frontend**: SysAdmin dashboard (distinct from company admin)

---

## Constitution Check

### Project Standards Compliance
- ✅ **TypeScript**: All new code in TypeScript with strict mode
- ✅ **Drizzle ORM**: Database schemas using Drizzle pg-core
- ✅ **REST API**: Standard REST conventions for endpoints
- ✅ **Middleware Pattern**: Authentication/authorization middleware
- ✅ **Audit Logging**: All privileged actions audited
- ✅ **Error Handling**: Consistent error response format

### Security Requirements
- ✅ **Role-based Access Control**: SysAdmin role distinct from company ADMIN
- ✅ **Audit Trail**: All SysAdmin actions logged
- ✅ **Input Validation**: Zod schemas for all inputs
- ✅ **SQL Injection Prevention**: Parameterized queries via Drizzle

---

## Implementation Phases

### Phase 1: Foundation (Week 1)
**Goal**: Core infrastructure and access control

**Deliverables**:
1. Database schema updates
   - Add SYSADMIN to UserType enum
   - Create systemSettings table
   - Create companyStatusHistory table
   - Create companyAnalytics table

2. Middleware implementation
   - requireSysAdmin() middleware
   - requireAdminOrSysAdmin() middleware
   - Integration with existing auth system

3. Initial SysAdmin user
   - CLI script to create first SysAdmin
   - Seed data for development

**Dependencies**: None (can start immediately)

---

### Phase 2: Company Management (Week 2)
**Goal**: Company lifecycle management APIs and UI

**Deliverables**:
1. Backend APIs
   - GET /api/sysadmin/companies (list with filters)
   - POST /api/sysadmin/companies (create)
   - PUT /api/sysadmin/companies/:id/status (update status)
   - DELETE /api/sysadmin/companies/:id (soft delete)
   - GET /api/sysadmin/companies/:id/analytics

2. Frontend components
   - Company list view with filters
   - Company detail view
   - Company creation modal
   - Status management controls

3. Database operations
   - Company status transitions
   - Audit logging for changes

**Dependencies**: Phase 1 complete

---

### Phase 3: User Management (Week 3)
**Goal**: Global user directory and management

**Deliverables**:
1. Backend APIs
   - GET /api/sysadmin/users (global search)
   - GET /api/sysadmin/users/:id/activity
   - POST /api/sysadmin/users/:id/reset-password
   - PUT /api/sysadmin/users/:id/status
   - POST /api/sysadmin/users/transfer

2. Frontend components
   - Global user search interface
   - User detail view (cross-company)
   - User transfer workflow
   - Bulk actions interface

**Dependencies**: Phase 2 complete

---

### Phase 4: System Monitoring (Week 4)
**Goal**: Platform health dashboard

**Deliverables**:
1. Backend APIs
   - GET /api/sysadmin/metrics/platform
   - GET /api/sysadmin/metrics/database
   - GET /api/sysadmin/metrics/jobs
   - GET /api/sysadmin/metrics/integrations

2. Frontend components
   - System health dashboard
   - Real-time metrics widgets
   - Alert notifications panel
   - Database performance charts

3. Data aggregation
   - Metrics collection service
   - Scheduled aggregation jobs

**Dependencies**: Phase 3 complete

---

### Phase 5: Settings Management (Week 5)
**Goal**: Global configuration management

**Deliverables**:
1. Backend APIs
   - GET /api/sysadmin/settings
   - PUT /api/sysadmin/settings/:key
   - GET /api/sysadmin/settings/:key/history

2. Frontend components
   - Settings management interface
   - Setting change history view
   - Category-based organization

3. Setting types
   - Feature flags
   - Billing configuration
   - Security policies
   - Integration settings

**Dependencies**: Phase 4 complete

---

## File Structure

```
src/
├── db/
│   ├── schema/
│   │   ├── user.ts                    # Add SYSADMIN to UserType
│   │   ├── systemSettings.ts          # New: Global settings
│   │   ├── companyStatus.ts           # New: Company status history
│   │   └── index.ts                   # Export new schemas
│   └── migrations/
│       └── 014_sysadmin_tables.sql    # Migration script
├── server/
│   ├── middleware/
│   │   └── requireSysAdmin.ts         # New: SysAdmin middleware
│   ├── routes/
│   │   └── sysadmin.ts                # New: SysAdmin API routes
│   └── services/
│       ├── SysAdminCompanyService.ts  # New: Company management
│       ├── SysAdminUserService.ts     # New: User management
│       └── SysAdminMetricsService.ts  # New: Metrics aggregation
├── client/
│   └── pages/
│       └── SysAdmin/
│           ├── Dashboard.tsx          # SysAdmin dashboard shell
│           ├── Companies/
│           │   ├── CompanyList.tsx
│           │   └── CompanyDetail.tsx
│           ├── Users/
│           │   ├── UserSearch.tsx
│           │   └── UserDetail.tsx
│           └── Settings/
│               └── SettingsManager.tsx
└── shared/
    └── types/
        └── sysadmin.ts                # Shared SysAdmin types
```

---

## Libraries & Dependencies

### Existing (No New Dependencies)
- **Drizzle ORM**: Database schema and queries
- **Express**: API routing
- **Zod**: Input validation
- **JWT**: Authentication
- **React**: Frontend components
- **Tailwind CSS**: Styling

### Optional Additions
- **Recharts**: Metrics visualization (if not already present)
- **date-fns**: Date formatting (if not already present)

---

## Testing Strategy

### Unit Tests
- Middleware authorization logic
- Service layer business logic
- Database query builders

### Integration Tests
- API endpoint authorization
- Database transaction safety
- Cross-tenant data isolation

### E2E Tests
- Company management workflows
- User transfer workflows
- Settings change propagation

---

## Risk Mitigation

| Risk | Mitigation Strategy |
|------|---------------------|
| Cross-tenant data leaks | Comprehensive authorization tests, row-level security |
| Performance on large datasets | Pagination, indexing, query optimization |
| Privilege escalation | Strict middleware, audit logging, code review |
| Breaking existing auth | Backward compatibility, feature flags |

---

## Success Criteria

- [ ] All 6 user stories implemented with acceptance criteria met
- [ ] 100% of new code covered by tests
- [ ] Zero security vulnerabilities in audit
- [ ] Performance benchmarks met (<200ms for list queries)
- [ ] Documentation complete (API docs, user guide)

---

## Next Steps

1. Create data-model.md with detailed schema definitions
2. Create API contracts in contracts/ directory
3. Create quickstart.md for development setup
4. Generate tasks.md with actionable task list
5. Push tasks to wxKanban database

---

*This plan was generated as part of the wxAI pipeline Phase 3: Plan*
