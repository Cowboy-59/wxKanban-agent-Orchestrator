# Spec 017: Consultant Dashboard

**Depends On**: SCOPE-119 (Consultant Customer Records) — **blocking for Phase 1**. The four
connection tables below all declare `customerid UUID NOT NULL REFERENCES customers(id)`, and there
is no `customers` table. SCOPE-119 supplies it. Until that scope is built, no DDL in this spec can
be applied. See Gate 5 in [`plan.md`](plan.md).

> Note: this spec's DDL also references `users(id)`, which does not exist — the real table is
> `userprofiles`. Correct that before applying.

## Overview

The Consultant Dashboard provides a centralized workspace for consultants to manage their projects, track time, view billing information, and monitor their assigned work. This scope defines the core dashboard functionality for consultant users with appropriate role-based access and integration with time tracking and billing systems.

### Core Design

| Element | Value |
|---------|-------|
| **Primary Actor** | Consultant (TEAM role with consultant billing plan) |
| **Secondary Actors** | Team Manager, Admin (view-only reports) |
| **Key Value** | Single-pane view of all consultant work, time tracking, earnings, and external system integrations |
| **Scope Boundary** | IN: Dashboard UI, time entry, project view, earnings summary, external PM system connections (Jira, Monday, Trello), credential management per user/team. OUT: Admin billing management, invoice generation, team management, data sync automation (manual trigger only) |

---

## Scope decision — 2026-07-31: this dashboard orients, the Work Hub executes

SCOPE-020's Consultant Work Hub (`/dashboard/work-hub`,
`src/client/pages/ConsultantWorkHubPage.tsx`) shipped to production **after** this spec was
written, and it already implements:

| This spec's requirement | Where it actually lives now |
| ----------------------- | --------------------------- |
| FR-002 — time tracking, start/stop, persistent timer | Work Hub timer + `POST /api/time-tracking/{start,stop/:id}`, `GET /api/time-tracking/active` |
| FR-003 — project/task status view | Work Hub task queue with `TaskStatusControl` |
| FR-009 — time & billing drill-down | Work Hub `TimeLogDrawer` + billable preview |

**Therefore this spec no longer builds those.** The Consultant Dashboard is the consultant's
*home*: it presents the ledger (time, earnings), escalates exceptions (overdue work, failing
connections), lists projects and customers, and hands off to the Work Hub for all execution.
FR-002, FR-003 and FR-009 below are retained for the record but are **satisfied by SCOPE-020** —
they are not work items. `tasks.md` has been reconciled accordingly.

The approved screen design, including the component breakdown and the TSX, is
[`page.md`](page.md); it is the authority for the dashboard's UI, superseding the
"Frontend Components" tree further down this document.

---

## User Stories

### US-017-01: Daily Dashboard Overview
**As a** consultant  
**I want to** view a personalized dashboard with all my work information  
**So that** I can quickly understand my current workload and priorities

**Acceptance Criteria:**
- Dashboard loads within 3 seconds of login
- All active projects assigned to consultant are visible
- Today's time summary (hours logged) is displayed
- Current billing period earnings are shown
- Upcoming deadlines (next 7 days) are highlighted

### US-017-02: Time Entry and Tracking
**As a** consultant  
**I want to** track time directly from the dashboard  
**So that** I can accurately log my work hours

**Acceptance Criteria:**
- Consultant can start/stop timer for any assigned project
- Manual time entry allows input of hours and minutes
- Running timer persists across page refreshes
- Time entries are automatically associated with selected project
- Daily and weekly time totals update in real-time

### US-017-03: Customer Management
**As a** consultant  
**I want to** add and manage my customers  
**So that** I can organize my work by client

**Acceptance Criteria:**
- "Add Customer" button visible on dashboard
- Customer form captures: name, company, email, phone, billing address, tax ID
- Customer list displays all consultant's customers with quick action buttons
- Customers are associated with the creating consultant only
- Customer data is validated before save

### US-017-04: External System Integration
**As a** consultant  
**I want to** connect to customer PM systems (Jira, Monday, Trello)  
**So that** I can sync project data across platforms

**Acceptance Criteria:**
- "Add Connection" option available per customer
- Connection form supports: system type, API endpoint, credentials
- Credential scope selection: PERSONAL or TEAM
- Connection test validates credentials before saving
- Multiple connections allowed per customer
- Credentials encrypted with AES-256-GCM

### US-017-05: Connection and Credential Management
**As a** consultant or team manager  
**I want to** manage connections and view audit logs  
**So that** I can ensure secure and reliable data sync

**Acceptance Criteria:**
- Connection list shows status, scope, last sync time
- Manual sync with incremental or full options
- Credential edits respect scope permissions
- Audit log captures all credential access events
- Real-time alerts on credential access by others

### US-017-06: Time and Billing Drill-Down
**As a** consultant  
**I want to** view detailed time entries and billing calculations  
**So that** I can verify my earnings and export reports

**Acceptance Criteria:**
- Clicking time total opens detailed time entry list
- Drill-down shows: date, duration, description, billing rate, calculated amount
- Date range filter available (today, week, month, custom)
- Export to PDF/CSV functionality
- Billing calculations use company-configured rates

---

## Database Schema

> **Names corrected 2026-07-31.** The original draft used `snake_case` throughout, which violates
> the database convention in CLAUDE.md: tables plural and lowercase, fields lowercase, **no
> underscores for word separation**, compound names concatenated. Every table and column below has
> been renamed to comply. Nothing was applied — see the application note.
>
> **Application is MANUAL (SCOPE-117).** There is no migration ledger, nothing auto-applies DDL,
> and the local `.env` `DATABASE_URL` points at **production**. `drizzle-kit push` is PROHIBITED
> against this database — it would propose dropping the ~19 undeclared-but-live tables. The
> workflow is: edit `src/db/schema/` → produce reviewed SQL → apply by hand → verify with
> `npm run db:drift` → record in `specs/117-production-schema-integrity/schema-change-log.md`.

### Table: `externalconnections`

**Location:** `src/db/schema/externalconnections.ts`

```typescript
// Core fields
id: UUID (primary key, UUID v7)
customerid: UUID (foreign key to customers)
consultantid: UUID (foreign key to users)
name: VARCHAR(255) - Connection display name
systemtype: VARCHAR(50) - 'jira', 'monday', 'trello', 'asana', 'azuredevops', 'custom'
apiendpoint: VARCHAR(500) - External system API URL
credentialsencrypted: TEXT - AES-256-GCM encrypted credentials JSON
credentialscope: VARCHAR(20) - 'PERSONAL' or 'TEAM'
status: VARCHAR(20) - 'connected', 'disconnected', 'error'
lastsyncat: TIMESTAMP
lastsyncresult: JSONB
healthstatus: VARCHAR(20) - 'healthy', 'warning', 'error', 'unknown'
healthcheckedat: TIMESTAMP
createdat: TIMESTAMP
updatedat: TIMESTAMP
deletedat: TIMESTAMP (soft delete)
```

### Table: `credentialauditlogs`

**Location:** `src/db/schema/credentialauditlogs.ts`

```typescript
// Core fields
id: UUID (primary key, UUID v7)
connectionid: UUID (foreign key to externalconnections)
userid: UUID (foreign key to users)
action: VARCHAR(50) - 'view', 'edit', 'test', 'delete', 'synctrigger', 'synccomplete'
actionresult: VARCHAR(20) - 'success', 'failure'
ipaddress: INET
useragent: TEXT
details: JSONB - Additional context
createdat: TIMESTAMP
```

### Table: `synchistory`

**Location:** `src/db/schema/synchistory.ts`

```typescript
// Core fields
id: UUID (primary key, UUID v7)
connectionid: UUID (foreign key to externalconnections)
triggeredby: UUID (foreign key to users)
synctype: VARCHAR(20) - 'incremental', 'full', 'automatic'
status: VARCHAR(20) - 'pending', 'running', 'completed', 'failed'
startedat: TIMESTAMP
completedat: TIMESTAMP
itemsprocessed: INTEGER
itemsadded: INTEGER
itemsupdated: INTEGER
itemsfailed: INTEGER
errormessage: TEXT
syncresult: JSONB
```

### Table: `connectionhealth`

**Location:** `src/db/schema/connectionhealth.ts`

```typescript
// Core fields
id: UUID (primary key, UUID v7)
connectionid: UUID (foreign key to externalconnections)
status: VARCHAR(20) - 'healthy', 'warning', 'error'
checktype: VARCHAR(20) - 'automatic', 'manual'
responsetimems: INTEGER
errorcode: VARCHAR(100)
errormessage: TEXT
checkedat: TIMESTAMP
```

---

## API Endpoints

### Consultant Dashboard Endpoints

```
GET /api/consultant/dashboard
- Fetch dashboard summary data (projects, time, earnings)
- Response: DashboardSummary

GET /api/consultant/projects
- List all projects assigned to consultant
- Response: Project[]

GET /api/consultant/projects/:id/tasks
- Get tasks for a specific project
- Response: Task[]

# RETIRED 2026-07-31 — the three time-entry endpoints below are NOT built.
# Timer start/stop already ship as POST /api/time-tracking/start and
# POST /api/time-tracking/stop/:id (SCOPE-020); today's totals are folded into
# GET /api/consultant/dashboard above, so the screen makes one call, not four.
#
#   POST  /api/consultant/time-entries
#   PATCH /api/consultant/time-entries/:id
#   GET   /api/consultant/time-entries/today

GET /api/consultant/earnings
- Get earnings summary for current period
- Response: EarningsSummary
```

### Customer Management Endpoints

```
GET /api/consultant/customers
- List all customers for consultant
- Response: Customer[]

POST /api/consultant/customers
- Create new customer
- Body: CustomerInput
- Response: Customer

GET /api/consultant/customers/:id
- Get customer details
- Response: Customer

PATCH /api/consultant/customers/:id
- Update customer information
- Body: Partial<CustomerInput>
- Response: Customer
```

### Connection Management Endpoints

```
GET /api/consultant/customers/:id/connections
- List system connections for customer
- Response: ExternalConnection[]

POST /api/consultant/customers/:id/connections
- Create new system connection
- Body: ConnectionInput
- Response: ExternalConnection

POST /api/consultant/customers/:id/connections/test
- Test connection credentials
- Body: ConnectionTestInput
- Response: TestResult

GET /api/consultant/connections/:id
- Get connection details (respects credential scope)
- Response: ExternalConnection

PATCH /api/consultant/connections/:id
- Update connection (edit credentials, respecting scope)
- Body: Partial<ConnectionInput>
- Response: ExternalConnection

DELETE /api/consultant/connections/:id
- Delete connection (owner or Team Manager only)
- Response: SuccessResponse

POST /api/consultant/connections/:id/sync
- Trigger manual data sync (incremental or full)
- Body: SyncOptions
- Response: SyncJob

GET /api/consultant/connections/:id/sync-history
- Get sync history for connection (last 10 syncs)
- Response: SyncHistory[]

GET /api/consultant/connections/:id/audit-log
- Get credential audit log (owner or Team Manager)
- Response: AuditLogEntry[]

POST /api/consultant/connections/:id/test
- Test connection without syncing
- Response: TestResult

GET /api/consultant/connections/:id/health
- Get connection health status and history
- Response: HealthStatus

GET /api/consultant/dashboard/connection-health
- Get connection health summary for dashboard widget
- Response: HealthSummary
```

### Reporting Endpoints

```
GET /api/consultant/projects/:id/time-entries
- Get detailed time entries for project
- Response: TimeEntry[]

GET /api/consultant/projects/:id/billing
- Get billing details for project
- Response: BillingDetails

POST /api/consultant/reports/export
- Export time/billing report (PDF/CSV)
- Body: ExportOptions
- Response: ExportResult
```

---

## Frontend Components

> **Superseded for the dashboard screen by [`page.md`](page.md) (approved 2026-07-31).** The
> approved design composes the dashboard as one page with three local sub-components
> (`StatTile`, `ProjectRow`, `DashboardSkeleton`) instead of the eight separate widgets listed
> below, and drops `TimeTracker` entirely (SCOPE-020 ships it). The tree below remains accurate
> for the customer, connection, sync and audit screens, which have not been designed yet.

### Dashboard Components

```
src/client/components/consultant/
├── ConsultantDashboard.tsx    # Main dashboard page
├── DashboardHeader.tsx        # User info, date, quick stats
├── ProjectCard.tsx            # Individual project summary
├── TimeTracker.tsx            # Timer controls and manual entry
├── EarningsWidget.tsx         # Earnings summary display
├── TaskSummary.tsx            # Task counts and deadlines
├── EmptyState.tsx             # No projects assigned state
├── CustomerPanel.tsx          # Customer list and management
├── CustomerForm.tsx           # Add/edit customer form
├── ConnectionManager.tsx      # Connection configuration
├── ConnectionForm.tsx         # Add/edit connection with scope
├── ConnectionList.tsx         # All connections for customer
├── ConnectionCard.tsx         # Individual connection card
├── SyncDialog.tsx             # Sync type selection modal
├── SyncProgress.tsx           # Real-time sync progress
├── AuditLogViewer.tsx         # Credential audit log
├── HealthStatusWidget.tsx     # Connection health summary
├── HealthIndicator.tsx        # Visual health indicator
├── CredentialScopeBadge.tsx   # PERSONAL/TEAM badge
├── TimeDetailModal.tsx        # Drill-down time details
├── BillingReport.tsx          # Detailed billing report
└── ProjectLinkButton.tsx      # Link to wxKanban projects
```

### Pages

```
src/client/pages/
├── ConsultantDashboardPage.tsx    # Main dashboard route
├── CustomerManagementPage.tsx     # Customer list page
├── ConnectionDetailPage.tsx       # Connection details
└── BillingReportPage.tsx          # Billing reports
```

---

## wxAI Commands

### `/consultant-status`

**Purpose**: Check consultant dashboard status and provide quick actions

**Usage**:
```
/consultant-status
/consultant-status --projects
/consultant-status --time
/consultant-status --connections
```

**Behavior**:
1. Fetches current consultant's dashboard data
2. Displays active projects, today's time, and earnings
3. Shows connection health summary when using `--connections` flag
4. Offers quick actions (start timer, view project details, test connections)
5. Shows alerts for overdue tasks, unbilled time, or connection errors

### `/connection-status`

**Purpose**: Check status of external system connections

**Usage**:
```
/connection-status
/connection-status --customer <customer_id>
/connection-status --connection <connection_id>
/connection-status --health
```

**Behavior**:
1. Lists all connections for the consultant with status indicators
2. Shows detailed health information for specific connection
3. Displays credential scope for each connection (PERSONAL/TEAM)
4. Offers quick actions: test connection, trigger sync, view audit log
5. Alerts on connections with errors or expired credentials

### `/sync-now`

**Purpose**: Manually trigger data synchronization

**Usage**:
```
/sync-now --connection <connection_id>
/sync-now --connection <connection_id> --full
/sync-now --customer <customer_id> --all
```

**Behavior**:
1. Triggers manual sync for specified connection
2. Default: incremental sync (changes since last sync)
3. `--full` flag performs complete data refresh
4. Shows real-time sync progress and results
5. Logs sync attempt to `synchistory` table

### `/connection-audit`

**Purpose**: View audit log for connection credentials

**Usage**:
```
/connection-audit --connection <connection_id>
/connection-audit --connection <connection_id> --last 24h
/connection-audit --my-connections
```

**Behavior**:
1. Displays credential access audit log for specified connection
2. Shows: timestamp, user, action type, result, IP address
3. Filters by time range when specified
4. Respects credential scope permissions
5. Export option to CSV for compliance reporting

---

## Success Metrics

- **Dashboard Load**: < 3 seconds for complete dashboard
- **Project Visibility**: 100% of assigned projects visible within 2 seconds
- **Time Tracking**: Actions complete within 1 second
- **Connection Setup**: 90% pass credential test on first attempt
- **Sync Performance**: Incremental < 30 seconds, Full < 2 minutes
- **Audit Completeness**: 100% of credential access events logged
- **Security**: Zero unauthorized credential access events

---

## Related Files

- Scope: `specs/Project-Scope/017-consultant-dashboard.md`
- Plan: `specs/017-consultant-dashboard/plan.md`
- Tasks: `specs/017-consultant-dashboard/tasks.md`
- Data Model: `specs/017-consultant-dashboard/data-model.md`

---

**Status**: Ready for Implementation  
**Priority**: High  
**Estimated Effort**: 5-6 days  
**Depends On**: 002-Scope (Admin), 005-scope-timeandBilling
