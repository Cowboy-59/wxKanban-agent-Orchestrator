# Spec 017: Consultant Dashboard

**Spec Number**: 017  
**Status**: `ready`  
**Created**: 2026-03-18  
**Updated**: 2026-03-18  
**Depends On**: 002-Scope (Admin), 005-scope-timeandBilling  
**Source**: `specs/Project-Scope/017-consultant-dashboard.md`

---

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

## User Scenarios & Testing

### US1 — Daily Dashboard Overview

**Actor**: Consultant

**Scenario**:
1. Consultant logs into the system
2. System displays personalized dashboard with today's tasks, time summary, and earnings
3. Consultant views active projects and their status
4. Consultant sees upcoming deadlines and priority tasks

**Expected outcome**: Consultant can view all relevant work information within 3 seconds of login, with 100% of assigned projects visible

---

### US2 — Time Entry and Tracking

**Actor**: Consultant

**Scenario**:
1. Consultant selects a project from dashboard
2. Consultant clicks "Start Timer" or enters manual time
3. System records time entry with project association
4. Dashboard updates with running timer and daily total

**Expected outcome**: Time entry is recorded within 1 second, dashboard reflects updated totals immediately, timer persists across page refreshes

---

### US3 — Customer Management Workflow

**Actor**: Consultant

**Scenario**:
1. Consultant clicks "Add Customer" from dashboard
2. System displays customer information form (name, contact, billing details)
3. Consultant enters customer data and saves
4. New customer appears in consultant's customer list with quick actions

**Expected outcome**: Customer is created and associated with consultant, visible in customer panel within 1 second of save

---

### US4 — System Integration Setup

**Actor**: Consultant

**Scenario**:
1. Consultant selects a customer from their dashboard
2. Consultant clicks "Add Connection" to customer's PM system
3. System displays connection configuration form with credential scope selection (TEAM or PERSONAL)
4. Consultant selects credential scope:
   - **PERSONAL**: Only this consultant can view/use these credentials
   - **TEAM**: Team Manager or Team Leader can also view/edit these credentials
5. Consultant enters system type (Jira, Monday, Trello, etc.), API endpoint, and credentials
6. Consultant tests connection and system validates credentials
7. System encrypts and stores connection info with scope metadata

**Expected outcome**: Connection is established with proper scope (personal or team), data sync can begin, connection appears in customer's connection list with status indicator

---

### US6 — Connection and Credential Management

**Actor**: Consultant or Team Manager

**Scenario**:
1. Consultant views customer's connection list showing:
   - Connection name, type (Jira/Monday/Trello), status (connected/error/disconnected)
   - Credential scope indicator (personal icon vs team icon)
   - Last sync time and health status
2. Consultant clicks "Sync" button on a connection
3. System displays sync options: Incremental (default) or Full sync
4. Consultant selects option and triggers manual sync
5. System performs sync and updates connection status
6. Consultant can click "Edit" to update credentials (personal connections editable by owner; team connections editable by owner, Team Manager, or Team Leader)
7. Consultant views audit log showing who accessed credentials and when

**Expected outcome**: Connection list displays all connections per customer with real-time status, manual sync completes within 30 seconds, credential edits respect scope permissions, audit log captures all credential access events

**Edge Cases**:
- Multiple consultants can have separate PERSONAL credentials to the same external system
- One customer can have multiple connections (e.g., both Jira and Monday for different projects)
- Failed connections show error status with retry option
- Expired credentials trigger notification to credential owner

---

### US5 — Time and Billing Drill-Down

**Actor**: Consultant

**Scenario**:
1. Consultant views project time summary on dashboard
2. Consultant clicks on time total for a specific project
3. System displays detailed time entries with billing rates
4. Consultant can filter by date range and export report

**Expected outcome**: Drill-down loads within 2 seconds, shows all time entries with calculated billing amounts, export completes successfully

---

## Functional Requirements

### FR-001 — Dashboard Overview Display

The system MUST display a personalized dashboard for consultants showing their active projects, tasks, time summary, and earnings in a single view.

**Acceptance Criteria**:
- [ ] Dashboard loads within 3 seconds of login
- [ ] All active projects assigned to consultant are visible
- [ ] Today's time summary (hours logged) is displayed
- [ ] Current billing period earnings are shown
- [ ] Upcoming deadlines (next 7 days) are highlighted

---

### FR-002 — Time Tracking Integration

The system MUST allow consultants to track time directly from the dashboard with both manual entry and timer functionality.

**Acceptance Criteria**:
- [ ] Consultant can start/stop timer for any assigned project
- [ ] Manual time entry allows input of hours and minutes
- [ ] Running timer persists across page refreshes
- [ ] Time entries are automatically associated with selected project
- [ ] Daily and weekly time totals update in real-time

---

### FR-003 — Project Status View

The system MUST display project status and task breakdown for each assigned project.

**Acceptance Criteria**:
- [ ] Each project shows completion percentage
- [ ] Task counts by status (todo, in-progress, done) are visible
- [ ] Project priority is indicated (high/medium/low)
- [ ] Clicking a project navigates to detailed project view
- [ ] Overdue tasks are visually highlighted

---

### FR-004 — Earnings Summary

The system MUST provide a summary of consultant earnings based on logged time and billing rates.

**Acceptance Criteria**:
- [ ] Current billing period earnings calculated from approved time entries
- [ ] Hourly rate is displayed (from company settings)
- [ ] Earnings update when time entries are approved
- [ ] Historical earnings viewable by week/month
- [ ] Unbilled hours are clearly indicated

---

### FR-005 — Responsive Dashboard Layout

The system MUST provide a responsive dashboard that works on desktop and tablet devices.

**Acceptance Criteria**:
- [ ] Dashboard is fully functional on screens 1024px and wider
- [ ] Key information is visible without horizontal scrolling
- [ ] Time tracking controls are accessible on touch devices
- [ ] Layout adapts to show/hide sections based on screen size

---

### FR-006 — Customer Management Panel

The system MUST provide a customer management panel where consultants can add and manage their customers with full contact and billing information.

**Acceptance Criteria**:
- [ ] "Add Customer" button visible on dashboard
- [ ] Customer form captures: name, company, email, phone, billing address, tax ID
- [ ] Customer list displays all consultant's customers with quick action buttons
- [ ] Customers are associated with the creating consultant only
- [ ] Customer data is validated before save (required fields, email format)

---

### FR-007 — System Connection Management with Credential Scope

The system MUST allow consultants to configure connections to customer project management systems with support for credential scope (PERSONAL or TEAM) and proper permission controls.

**Acceptance Criteria**:
- [ ] "Add Connection" option available per customer
- [ ] Connection form supports: system type (Jira, Monday, Trello, Asana, etc.), API endpoint, credentials
- [ ] Credential scope selection required: PERSONAL (consultant-only) or TEAM (shared with Team Manager/Leader)
- [ ] Connection test validates credentials before saving
- [ ] Connection status displayed (connected, error, disconnected)
- [ ] Encrypted storage for all API keys and credentials
- [ ] Multiple connections allowed per customer (e.g., Jira + Monday for same customer)
- [ ] PERSONAL credentials: Only the creating consultant can view/decrypt credentials
- [ ] TEAM credentials: Team Manager and Team Leader can view/decrypt in addition to creator
- [ ] Consultants can only view their own PERSONAL credentials, not other consultants' personal credentials
- [ ] Connection metadata (name, type, status) visible to all consultants with customer access

---

### FR-008 — Project Management Integration Links

The system MUST provide direct links from the dashboard to wxKanban project management pages.

**Acceptance Criteria**:
- [ ] Each project card has "Open in Projects" link
- [ ] Clicking link navigates to `/projects/:id` with pre-filtered consultant view
- [ ] Quick-create task button on dashboard links to new task page
- [ ] Breadcrumb navigation maintains context between dashboard and projects

---

### FR-009 — Time and Billing Drill-Down Reports

The system MUST provide detailed drill-down views for time entries and billing calculations per project.

**Acceptance Criteria**:
- [ ] Clicking time total opens detailed time entry list
- [ ] Drill-down shows: date, duration, description, billing rate, calculated amount
- [ ] Date range filter available (today, week, month, custom)
- [ ] Export to PDF/CSV functionality
- [ ] Billing calculations use company-configured rates and minimum time rules

---

### FR-010 — Connection List and Status Management

The system MUST provide a connection list view showing all external system connections per customer with real-time status and management actions.

**Acceptance Criteria**:
- [ ] Connection list displays: connection name, system type (Jira/Monday/Trello), status indicator
- [ ] Credential scope indicator visible (personal icon vs team icon)
- [ ] Last successful sync time displayed per connection
- [ ] Connection health status shown (healthy, warning, error)
- [ ] "Sync" button available for manual data synchronization
- [ ] "Edit" button available for credential updates (respecting scope permissions)
- [ ] "Delete" option available for connection removal (owner or Team Manager only)
- [ ] Failed connections display error message with retry option
- [ ] Expired/invalid credentials trigger notification to credential owner
- [ ] Connection list loads within 2 seconds for customers with up to 10 connections

---

### FR-011 — Manual Data Synchronization

The system MUST allow consultants to manually trigger data synchronization from external PM systems with options for incremental or full sync.

**Acceptance Criteria**:
- [ ] "Sync" button on each connection opens sync options dialog
- [ ] Default sync mode: Incremental (syncs only changes since last sync)
- [ ] Full sync option available (syncs all data, slower but complete)
- [ ] Sync progress indicator displayed during operation
- [ ] Manual sync completes within 30 seconds for incremental, 2 minutes for full
- [ ] Sync results summary shown: items added, updated, errors
- [ ] Failed syncs provide detailed error log with troubleshooting guidance
- [ ] Concurrent sync requests from same user are queued, not parallel
- [ ] Sync history log maintained per connection (last 10 syncs)

---

### FR-012 — Credential Audit Logging

The system MUST maintain an audit log of all credential access events for security and compliance tracking.

**Acceptance Criteria**:
- [ ] Audit log captures: timestamp, user ID, action type, connection ID, result (success/failure)
- [ ] Logged actions: credential view, credential edit, credential test, credential delete
- [ ] Consultants can view audit log for their PERSONAL credentials
- [ ] Team Managers can view audit log for TEAM credentials in their team
- [ ] Audit log entries immutable and retained for 90 days minimum
- [ ] Audit log exportable to CSV for compliance reporting
- [ ] Real-time alert to credential owner on any credential access by another user
- [ ] Failed credential access attempts logged with IP address and user agent

---

### FR-013 — Connection Health Monitoring

The system MUST monitor connection health and provide visibility into connection status and issues.

**Acceptance Criteria**:
- [ ] Connection health checked automatically every 15 minutes
- [ ] Health status: connected (green), warning (yellow - sync delayed >1 hour), error (red - connection failed)
- [ ] Dashboard shows connection health summary widget
- [ ] Email notification sent to credential owner on health status change to error
- [ ] Connection details page shows: health history, last 5 sync results, error details
- [ ] Automatic retry on transient failures (max 3 attempts with exponential backoff)
- [ ] Manual "Test Connection" button available to verify credentials without syncing
- [ ] Health monitoring respects credential scope (only owners/managers see health details for their credentials)

---

## Data Requirements

### Schema Changes

| Table | Purpose |
|-------|---------|
| `external_connections` | Stores external PM system connections with encrypted credentials and scope metadata |
| `credential_audit_log` | Tracks all credential access events for security compliance |
| `sync_history` | Records manual and automatic sync attempts with results |
| `connection_health` | Stores connection health check results and status history |

**Schema Definition**:

```sql
-- External system connections with credential scope
CREATE TABLE external_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  consultant_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  system_type VARCHAR(50) NOT NULL CHECK (system_type IN ('jira', 'monday', 'trello', 'asana', 'azure_devops', 'custom')),
  api_endpoint VARCHAR(500) NOT NULL,
  credentials_encrypted TEXT NOT NULL, -- AES-256 encrypted credentials JSON
  credential_scope VARCHAR(20) NOT NULL DEFAULT 'PERSONAL' CHECK (credential_scope IN ('PERSONAL', 'TEAM')),
  status VARCHAR(20) NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected', 'error')),
  last_sync_at TIMESTAMP,
  last_sync_result JSONB,
  health_status VARCHAR(20) DEFAULT 'unknown' CHECK (health_status IN ('healthy', 'warning', 'error', 'unknown')),
  health_checked_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP -- Soft delete support
);

-- Credential audit log for security tracking
CREATE TABLE credential_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES external_connections(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  action VARCHAR(50) NOT NULL CHECK (action IN ('view', 'edit', 'test', 'delete', 'sync_trigger', 'sync_complete')),
  action_result VARCHAR(20) NOT NULL CHECK (action_result IN ('success', 'failure')),
  ip_address INET,
  user_agent TEXT,
  details JSONB, -- Additional context (e.g., sync type, error message)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sync history for tracking data synchronization
CREATE TABLE sync_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES external_connections(id) ON DELETE CASCADE,
  triggered_by UUID NOT NULL REFERENCES users(id),
  sync_type VARCHAR(20) NOT NULL CHECK (sync_type IN ('incremental', 'full', 'automatic')),
  status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  started_at TIMESTAMP NOT NULL,
  completed_at TIMESTAMP,
  items_processed INTEGER DEFAULT 0,
  items_added INTEGER DEFAULT 0,
  items_updated INTEGER DEFAULT 0,
  items_failed INTEGER DEFAULT 0,
  error_message TEXT,
  sync_result JSONB -- Detailed result data
);

-- Connection health monitoring
CREATE TABLE connection_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES external_connections(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL CHECK (status IN ('healthy', 'warning', 'error')),
  check_type VARCHAR(20) NOT NULL CHECK (check_type IN ('automatic', 'manual')),
  response_time_ms INTEGER,
  error_code VARCHAR(100),
  error_message TEXT,
  checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Indexes

```sql
-- External connections indexes
CREATE INDEX idx_external_connections_customer_id ON external_connections(customer_id);
CREATE INDEX idx_external_connections_consultant_id ON external_connections(consultant_id);
CREATE INDEX idx_external_connections_status ON external_connections(status);
CREATE INDEX idx_external_connections_scope ON external_connections(credential_scope);
CREATE INDEX idx_external_connections_system_type ON external_connections(system_type);
CREATE INDEX idx_external_connections_health ON external_connections(health_status);

-- Audit log indexes
CREATE INDEX idx_audit_log_connection_id ON credential_audit_log(connection_id);
CREATE INDEX idx_audit_log_user_id ON credential_audit_log(user_id);
CREATE INDEX idx_audit_log_created_at ON credential_audit_log(created_at);
CREATE INDEX idx_audit_log_action ON credential_audit_log(action);

-- Sync history indexes
CREATE INDEX idx_sync_history_connection_id ON sync_history(connection_id);
CREATE INDEX idx_sync_history_status ON sync_history(status);
CREATE INDEX idx_sync_history_started_at ON sync_history(started_at);

-- Connection health indexes
CREATE INDEX idx_connection_health_connection_id ON connection_health(connection_id);
CREATE INDEX idx_connection_health_checked_at ON connection_health(checked_at);
```

---

## API Routes

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/consultant/dashboard` | Fetch dashboard summary data (projects, time, earnings) |
| GET | `/api/consultant/projects` | List all projects assigned to consultant |
| GET | `/api/consultant/projects/:id/tasks` | Get tasks for a specific project |
| POST | `/api/consultant/time-entries` | Create new time entry (manual or timer start) |
| PATCH | `/api/consultant/time-entries/:id` | Update time entry (stop timer or edit) |
| GET | `/api/consultant/time-entries/today` | Get today's time entries for consultant |
| GET | `/api/consultant/earnings` | Get earnings summary for current period |
| GET | `/api/consultant/customers` | List all customers for consultant |
| POST | `/api/consultant/customers` | Create new customer |
| GET | `/api/consultant/customers/:id` | Get customer details |
| PATCH | `/api/consultant/customers/:id` | Update customer information |
| GET | `/api/consultant/customers/:id/connections` | List system connections for customer |
| POST | `/api/consultant/customers/:id/connections` | Create new system connection |
| POST | `/api/consultant/customers/:id/connections/test` | Test connection credentials |
| GET | `/api/consultant/connections/:id` | Get connection details (respects credential scope) |
| PATCH | `/api/consultant/connections/:id` | Update connection (edit credentials, respecting scope) |
| DELETE | `/api/consultant/connections/:id` | Delete connection (owner or Team Manager only) |
| POST | `/api/consultant/connections/:id/sync` | Trigger manual data sync (incremental or full) |
| GET | `/api/consultant/connections/:id/sync-history` | Get sync history for connection (last 10 syncs) |
| GET | `/api/consultant/connections/:id/audit-log` | Get credential audit log (owner or Team Manager) |
| POST | `/api/consultant/connections/:id/test` | Test connection without syncing |
| GET | `/api/consultant/connections/:id/health` | Get connection health status and history |
| GET | `/api/consultant/dashboard/connection-health` | Get connection health summary for dashboard widget |
| GET | `/api/consultant/projects/:id/time-entries` | Get detailed time entries for project |
| GET | `/api/consultant/projects/:id/billing` | Get billing details for project |
| POST | `/api/consultant/reports/export` | Export time/billing report (PDF/CSV) |

---

## Frontend Components

### New Components

| Component | Path | Description |
|-----------|------|-------------|
| `ConsultantDashboard` | `app/routes/consultant/dashboard.tsx` | Main dashboard page component |
| `DashboardHeader` | `components/consultant/dashboard-header.tsx` | Shows user info, date, quick stats |
| `ProjectCard` | `components/consultant/project-card.tsx` | Individual project summary card with PM link |
| `TimeTracker` | `components/consultant/time-tracker.tsx` | Timer controls and manual entry |
| `EarningsWidget` | `components/consultant/earnings-widget.tsx` | Earnings summary display |
| `TaskSummary` | `components/consultant/task-summary.tsx` | Task counts and upcoming deadlines |
| `EmptyState` | `components/consultant/empty-state.tsx` | Display when no projects assigned |
| `CustomerPanel` | `components/consultant/customer-panel.tsx` | Customer list and management panel |
| `CustomerForm` | `components/consultant/customer-form.tsx` | Add/edit customer information form |
| `ConnectionManager` | `components/consultant/connection-manager.tsx` | System connection configuration |
| `ConnectionForm` | `components/consultant/connection-form.tsx` | Add/edit connection settings with credential scope selector |
| `ConnectionList` | `components/consultant/connection-list.tsx` | Display all connections for a customer with status and actions |
| `ConnectionCard` | `components/consultant/connection-card.tsx` | Individual connection card with health status and sync button |
| `SyncDialog` | `components/consultant/sync-dialog.tsx` | Modal for selecting sync type (incremental/full) and showing progress |
| `SyncProgress` | `components/consultant/sync-progress.tsx` | Real-time sync progress indicator with results |
| `AuditLogViewer` | `components/consultant/audit-log-viewer.tsx` | Display credential access audit log with filtering |
| `HealthStatusWidget` | `components/consultant/health-status-widget.tsx` | Dashboard widget showing connection health summary |
| `HealthIndicator` | `components/consultant/health-indicator.tsx` | Visual indicator for connection health (green/yellow/red) |
| `CredentialScopeBadge` | `components/consultant/credential-scope-badge.tsx` | Badge showing PERSONAL or TEAM scope with icon |
| `TimeDetailModal` | `components/consultant/time-detail-modal.tsx` | Drill-down time entry details |
| `BillingReport` | `components/consultant/billing-report.tsx` | Detailed billing report with export |
| `ProjectLinkButton` | `components/consultant/project-link-button.tsx` | Direct link to wxKanban project page |

### Modified Components

| Component | Change |
|-----------|--------|
| `AppShell` | Add consultant-specific navigation items |
| `LoginRedirect` | Route consultants to `/consultant/dashboard` after login |
| `ProjectList` | Add "Open in Projects" action to each project |

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

---

### `/connection-status`

**Purpose**: Check status of external system connections and perform quick actions

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

---

### `/sync-now`

**Purpose**: Manually trigger data synchronization for a connection

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
5. Logs sync attempt to sync_history table
6. Updates connection health status based on result

---

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
4. Respects credential scope permissions (PERSONAL: owner only, TEAM: owner + managers)
5. Export option to CSV for compliance reporting
6. Alerts on suspicious access patterns (multiple failed attempts)

---

## Success Criteria

### Performance & Usability

1. **Dashboard Load Performance**: Consultants can view their complete dashboard within 3 seconds of login, with all widgets rendering progressively

2. **Project Visibility**: 100% of assigned active projects are visible on the dashboard within 2 seconds of initial load

3. **Time Tracking Responsiveness**: Time tracking actions (start/stop/manual entry) complete within 1 second and reflect immediately in dashboard totals

4. **Earnings Accuracy**: Dashboard earnings calculations match approved time entries with 100% accuracy; discrepancies trigger automatic alerts

5. **User Adoption**: 95% of consultants can complete time entry without assistance after first use; 90% can set up their first external connection without assistance

6. **Responsive Design**: Dashboard is fully functional on tablet devices (1024px+) with touch-optimized controls; no horizontal scrolling required

### External System Integration

7. **Connection Setup Success**: 90% of new external connections pass credential test on first attempt; failed tests provide actionable error messages within 3 seconds

8. **Manual Sync Performance**: Incremental sync completes within 30 seconds for 95% of connections; full sync completes within 2 minutes; progress indicators update every 2 seconds

9. **Connection Health Visibility**: 100% of active connections display real-time health status (healthy/warning/error) within 5 minutes of status change; health widget loads within 1 second

10. **Audit Log Completeness**: 100% of credential access events (view, edit, test, delete, sync) are logged within 1 second of the action with full attribution (user, timestamp, IP, result)

11. **Credential Security**: Zero unauthorized credential access events; all credential access strictly respects PERSONAL/TEAM scope permissions; encryption at rest and in transit for all credentials

12. **Connection Management Efficiency**: Consultants can locate a specific connection and trigger sync within 10 seconds of opening the customer panel; connection list supports filtering by system type and status

### Reliability & Monitoring

13. **Connection Uptime**: External connections maintain 99.5% uptime for health checks; automatic retry recovers 80% of transient failures within 15 minutes

14. **Sync Reliability**: 95% of manual syncs complete successfully; failed syncs provide detailed error logs and retry guidance within 5 seconds

15. **Notification Delivery**: 100% of credential expiration warnings and connection error alerts are delivered to owners within 1 minute of detection

---

## Implementation Status

| Component | Status | Notes |
|-----------|--------|-------|
| Database Schema | 🔄 Planned | 4 new tables: external_connections, credential_audit_log, sync_history, connection_health |
| Encryption Service | 🔄 Planned | AES-256-GCM for credential encryption |
| Dashboard API | 🔄 Planned | 24 endpoints under /api/consultant/* |
| Frontend Components | 🔄 Planned | 20+ new components in components/consultant/ |
| Time Tracking Integration | 🔄 Planned | Integration with 005-scope-timeandBilling |
| Connection Manager | 🔄 Planned | Full CRUD with credential scope support |
| Sync Engine | 🔄 Planned | Manual sync with incremental/full options |
| Audit Logging | 🔄 Planned | Immutable audit trail for credential access |
| Health Monitoring | 🔄 Planned | 15-minute automated health checks |
| wxAI Commands | 🔄 Planned | 4 commands: /consultant-status, /connection-status, /sync-now, /connection-audit |

---

## Key Entities

| Entity | Table | Description |
|--------|-------|-------------|
| `ConsultantDashboard` | View | Main dashboard view combining projects, time, and earnings data |
| `ProjectAssignment` | `project_assignments` | Link between consultant user and project with role/permissions |
| `TimeEntry` | `time_entries` | Record of time logged by consultant (start/end times, project association) |
| `EarningsSummary` | View | Calculated earnings for a billing period based on approved time |
| `DashboardWidget` | UI Component | UI component displaying specific data (projects, time, earnings) |
| `Customer` | `customers` | Client managed by consultant with full contact and billing information |
| `ExternalConnection` | `external_connections` | Integration configuration linking customer to external PM system with encrypted credentials |
| `CredentialAuditLog` | `credential_audit_log` | Security audit trail for all credential access events |
| `SyncHistory` | `sync_history` | Record of all manual sync attempts with results |
| `ConnectionHealth` | `connection_health` | Health check results and status history |
| `BillingDetail` | View | Detailed time entry with calculated billing amounts for drill-down |
| `CustomerPanel` | UI Component | UI panel for customer management on dashboard |

---

## Constraints

- MUST integrate with existing time tracking system from 005-scope-timeandBilling
- MUST respect role-based access (TEAM role only, not ADMIN features)
- MUST NOT allow consultants to view other consultants' data
- MUST use existing project and task data structures
- MUST support minimum billing time rules if configured in company settings

### External System Integration Constraints

- MUST encrypt all credentials using AES-256-GCM at rest; encryption keys managed via environment variables or KMS, never stored in database
- MUST transmit all credentials over TLS 1.3 or higher; no credential data in URL parameters or unencrypted headers
- MUST retain audit logs for minimum 90 days; logs must be immutable and tamper-evident
- MUST implement rate limiting: maximum 10 sync requests per hour per connection, 50 per hour per user
- MUST NOT implement automatic/scheduled sync (manual trigger only per scope boundary OUT definition)
- MUST validate all API endpoints against allowlist before connection attempts (prevent SSRF attacks)
- MUST scope all credential access to PERSONAL (owner only) or TEAM (owner + Team Manager/Leader); no global admin access to consultant credentials
- MUST implement connection timeouts: 30 seconds for test connections, 60 seconds for sync operations
- MUST NOT store external PM system data locally beyond sync session; process and discard temporary data after sync completion

---

## Notes

- Dashboard data should be cached for 30 seconds to reduce API load
- Real-time updates for timer synchronization across multiple browser tabs
- Earnings calculations performed server-side to ensure accuracy
- Mobile-responsive design deferred to future scope (tablet minimum for v1)
- Integration with reporting features planned for future enhancement

### External System Integration Notes

- **Credential Rotation**: Recommend credential rotation every 90 days; system should support seamless rotation without connection deletion (edit credentials in place)
- **Health Check Interval**: Automatic health checks run every 15 minutes; manual health checks available on demand via "Test Connection" button
- **Sync Queue Processing**: Sync requests processed FIFO per user; concurrent syncs from same user are queued, not parallelized
- **Browser Extension (Future)**: Consider browser extension for Jira/Monday/Trello to enable one-click time tracking from external PM systems directly
- **Webhook Support (Future)**: Future scope may include webhook receivers for real-time updates from external systems (requires infrastructure review)
- **Credential Recovery**: Lost credentials cannot be recovered (encryption is one-way with server-side keys); users must re-enter credentials if encryption keys are rotated
- **Sync Conflict Resolution**: If external system data conflicts with wxKanban data, external system is treated as source of truth; conflicts logged for review
- **API Versioning**: External system integrations should specify API version in connection config to handle breaking changes (e.g., Jira API v2 vs v3)
- **Offline Handling**: Sync operations require online connectivity; no offline queue for failed syncs (manual retry required)
- **Performance Monitoring**: Connection response times and sync durations should be monitored; alerts if p95 response time exceeds 5 seconds

---

## Clarifications

### Session 2026-03-18

| # | Question | Decision |
|---|----------|----------|
| 1 | Should consultants see other team members' progress? | No - consultant dashboard is personal view only |
| 2 | Can consultants edit past time entries? | Yes, within current billing period; historical locked |
| 3 | What happens when billing period ends? | Earnings summary resets, historical viewable in reports |

