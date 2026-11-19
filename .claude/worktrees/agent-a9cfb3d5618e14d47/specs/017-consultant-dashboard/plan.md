# Implementation Plan: Consultant Dashboard (Spec 017)

## Gates — read before running `implement` (added 2026-07-31)

**Gate 1 — the Work Hub already exists.** SCOPE-020 shipped `/dashboard/work-hub` to production
after this plan was written. It implements FR-002 (timer), FR-003 (task queue) and FR-009 (time
drill-down). This spec must **not** rebuild them. The dashboard orients; the Work Hub executes.
`tasks.md` T019/020/021/050/057/059/094/123 are retired for this reason.

**Gate 2 — schema application is manual and the target is production.** Per SCOPE-117 there is no
migration ledger, nothing auto-applies DDL, and the local `.env` `DATABASE_URL` points at
**production**. `drizzle-kit push` is PROHIBITED — it would propose dropping the ~19
undeclared-but-live tables, including `marketingcontacts`. Phase 1 (T001…009a) produces
*reviewed SQL for a human to apply*, then `npm run db:drift`, then a line in
`specs/117-production-schema-integrity/schema-change-log.md`. No task in this spec may run DDL.

**Gate 3 — the UI is designed; build from the design.** [`page.md`](page.md) is the approved
design for the dashboard screen and carries the implementation TSX. It supersedes the "Frontend
Components" tree in `spec.md` for this screen. The customer, connection, sync and audit screens
are **not** designed yet — design them before implementing Phases 3 and 4.

**Gate 5 — `customers` does not exist. This blocks Phase 1.** The DDL in `data-model.md` declares
`customerid UUID NOT NULL REFERENCES customers(id)`, and FR-006 specifies a whole customer
management panel — but there is **no `customers` table** anywhere in `src/db/schema/` (144 files,
zero matches). Running the Phase 1 DDL as written fails immediately on the foreign key. Before
T001 can proceed, someone must decide:

- **(a)** design and create a fifth table, `customers`, owned by this spec (name, company, email,
  phone, billingaddress, taxid, consultantid) — the spec's evident intent; or
- **(b)** reuse the existing `companies` table with a consultant-scoped relationship; or
- **(c)** defer the customer/connection layer entirely and ship only the dashboard's
  time/earnings/projects half, which needs **no new tables at all**.

**RESOLVED 2026-07-31 — (c) then (a).** The dashboard shipped as path (c) the same day: three
tiles, exceptions band and a full-width projects panel, using existing tables only, with the
Customers rail and Connections tile deferred. The customer layer became its own scope,
**SCOPE-119 — Consultant Customer Records**
(`specs/Project-Scope/119-consultant-customer-records.md`), which supplies the `customers` table
this spec's four connection tables reference.

**Phase 1 of this spec stays blocked until SCOPE-119 is built.** Its DDL cannot run before
`customers` exists. Note also that this spec's DDL references `users(id)`, which does not exist —
the real table is `userprofiles`; correct that before applying.

**Gate 4 — the design's status tokens are now in the theme.** `--success`, `--warning` and
`--danger` were promoted to `src/client/styles/index.css` (`:root`, `.dark`, `@theme inline`) on
2026-07-31 with measured AA contrast. Note that the pre-existing `--destructive` measures 3.76:1
in light and **2.00:1 in dark** and remains unfixed — do not use it for status text.

## Technical Context

### Tech Stack
- **Frontend:** React + TypeScript + Vite + Tailwind CSS
- **Backend:** Express + TypeScript + Drizzle ORM
- **Database:** PostgreSQL with JSONB support
- **State Management:** React Query for server state
- **UI Components:** Existing component library
- **Encryption:** AES-256-GCM for credential encryption

### Existing Infrastructure

- Time tracking system from 005-scope-timeandBilling — **verified present** (`/api/time-tracking/*`)
- Project management from 002-Scope (Admin) — **verified present**
- User authentication and role-based access control — **verified present**
- Database schema for users, projects — **verified present**
- ~~customers~~ — **FALSE, corrected 2026-07-31. There is no `customers` table.** A search of all
  144 files in `src/db/schema/` returns zero matches; the only "customers" references in the
  codebase are Stripe customer IDs in `src/server/lib/stripe.ts` and `src/server/routes/payment.ts`,
  which are unrelated. See Gate 5.

## Constitution Check

### Project Rules Compliance

- ❌ **CORRECTED 2026-07-31.** This line previously read "follows naming conventions (lowercase,
  snake_case)" and was **wrong** — CLAUDE.md forbids underscores for word separation. That false
  assertion is why `spec.md` shipped `external_connections`, `credential_audit_log`,
  `sync_history` and `connection_health`. The correct rule is: tables plural and lowercase,
  fields lowercase, compound names **concatenated** — `externalconnections`,
  `credentialauditlogs`, `synchistory`, `connectionhealth`, `customerid`, `credentialscope`.
  `spec.md` and `tasks.md` have been corrected; no DDL was ever applied.
- ✅ TypeScript strict mode enabled
- ✅ Drizzle ORM for database operations
- ✅ React functional components with hooks
- ✅ Error handling with proper HTTP status codes
- ✅ Role-based access control (TEAM role)

### Compliance Requirements
- ✅ GDPR: User data tracked with consent
- ✅ SOC2: Audit logging for credential access
- ✅ HIPAA: Not applicable (no health data)
- ✅ Security: AES-256-GCM encryption for credentials

## Phase 0: Research

### Encryption Options
1. **AES-256-GCM** (Chosen) - Industry standard, authenticated encryption
2. **RSA + AES** - Overkill for this use case
3. **HashiCorp Vault** - External dependency, adds complexity

### External System Integration Options
1. **REST API polling** (Chosen) - Universal, works with all PM systems
2. **Webhooks** - Future enhancement, requires infrastructure
3. **GraphQL** - Not all systems support it

### Sync Strategy Options
1. **Manual sync only** (Chosen) - Per scope boundary definition
2. **Scheduled sync** - Out of scope
3. **Real-time sync** - Requires webhooks, out of scope

## Phase 1: Design Artifacts

### Data Model

**Entity: ExternalConnection**
```typescript
interface ExternalConnection {
  id: string;                    // UUID
  customerId: string;            // FK to customers
  consultantId: string;          // FK to users
  name: string;                  // Display name
  systemType: SystemType;        // 'jira', 'monday', 'trello', 'asana', 'azure_devops', 'custom'
  apiEndpoint: string;           // API URL
  credentialsEncrypted: string;  // AES-256-GCM encrypted JSON
  credentialScope: CredentialScope; // 'PERSONAL' | 'TEAM'
  status: ConnectionStatus;      // 'connected' | 'disconnected' | 'error'
  lastSyncAt?: Date;             // Last successful sync
  lastSyncResult?: SyncResult;   // JSONB result data
  healthStatus: HealthStatus;    // 'healthy' | 'warning' | 'error' | 'unknown'
  healthCheckedAt?: Date;        // Last health check
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;            // Soft delete
}
```

**Entity: CredentialAuditLog**
```typescript
interface CredentialAuditLog {
  id: string;                    // UUID
  connectionId: string;          // FK to externalconnections
  userId: string;                // FK to users
  action: AuditAction;           // 'view' | 'edit' | 'test' | 'delete' | 'sync_trigger' | 'sync_complete'
  actionResult: ActionResult;    // 'success' | 'failure'
  ipAddress?: string;            // INET
  userAgent?: string;            // TEXT
  details?: Record<string, any>; // JSONB context
  createdAt: Date;
}
```

**Entity: SyncHistory**
```typescript
interface SyncHistory {
  id: string;                    // UUID
  connectionId: string;          // FK to externalconnections
  triggeredBy: string;           // FK to users
  syncType: SyncType;            // 'incremental' | 'full' | 'automatic'
  status: SyncStatus;            // 'pending' | 'running' | 'completed' | 'failed'
  startedAt: Date;
  completedAt?: Date;
  itemsProcessed: number;
  itemsAdded: number;
  itemsUpdated: number;
  itemsFailed: number;
  errorMessage?: string;
  syncResult?: Record<string, any>; // JSONB detailed result
}
```

**Entity: ConnectionHealth**
```typescript
interface ConnectionHealth {
  id: string;                    // UUID
  connectionId: string;          // FK to externalconnections
  status: HealthStatus;          // 'healthy' | 'warning' | 'error'
  checkType: CheckType;          // 'automatic' | 'manual'
  responseTimeMs?: number;         // Response time in milliseconds
  errorCode?: string;            // Error code if failed
  errorMessage?: string;         // Error details
  checkedAt: Date;
}
```

### API Contracts

**Dashboard Endpoints:**

```
GET /api/consultant/dashboard
Response: {
  projects: ProjectSummary[],
  todayTime: TimeSummary,
  weeklyTime: TimeSummary,
  earnings: EarningsSummary,
  upcomingDeadlines: Task[],
  connectionHealth: HealthSummary
}

GET /api/consultant/projects
Response: {
  projects: Project[],
  total: number
}

GET /api/consultant/projects/:id/tasks
Response: Task[]

POST /api/consultant/time-entries
Body: {
  projectId: string,
  startTime?: Date,
  endTime?: Date,
  duration?: number, // minutes
  description?: string,
  isTimer: boolean
}
Response: TimeEntry

PATCH /api/consultant/time-entries/:id
Body: Partial<TimeEntryInput>
Response: TimeEntry

GET /api/consultant/time-entries/today
Response: TimeEntry[]

GET /api/consultant/earnings
Response: {
  currentPeriod: EarningsPeriod,
  hourlyRate: number,
  unbilledHours: number,
  historical: EarningsPeriod[]
}
```

**Customer Endpoints:**

```
GET /api/consultant/customers
Response: Customer[]

POST /api/consultant/customers
Body: {
  name: string,
  company?: string,
  email: string,
  phone?: string,
  billingAddress?: string,
  taxId?: string
}
Response: Customer

GET /api/consultant/customers/:id
Response: Customer

PATCH /api/consultant/customers/:id
Body: Partial<CustomerInput>
Response: Customer
```

**Connection Endpoints:**

```
GET /api/consultant/customers/:id/connections
Response: ExternalConnection[]

POST /api/consultant/customers/:id/connections
Body: {
  name: string,
  systemType: SystemType,
  apiEndpoint: string,
  credentials: Record<string, string>,
  credentialScope: CredentialScope
}
Response: ExternalConnection

POST /api/consultant/customers/:id/connections/test
Body: ConnectionTestInput
Response: {
  success: boolean,
  message: string,
  responseTime?: number
}

GET /api/consultant/connections/:id
Response: ExternalConnection (credentials only if authorized)

PATCH /api/consultant/connections/:id
Body: Partial<ConnectionInput>
Response: ExternalConnection

DELETE /api/consultant/connections/:id
Response: { success: boolean }

POST /api/consultant/connections/:id/sync
Body: {
  syncType: 'incremental' | 'full'
}
Response: {
  syncId: string,
  status: SyncStatus
}

GET /api/consultant/connections/:id/sync-history
Response: SyncHistory[]

GET /api/consultant/connections/:id/audit-log
Response: CredentialAuditLog[]

POST /api/consultant/connections/:id/test
Response: TestResult

GET /api/consultant/connections/:id/health
Response: {
  current: ConnectionHealth,
  history: ConnectionHealth[]
}

GET /api/consultant/dashboard/connection-health
Response: {
  total: number,
  healthy: number,
  warning: number,
  error: number,
  connections: HealthSummary[]
}
```

### Component Architecture

```
Consultant Dashboard Module
├── Dashboard Components
│   ├── ConsultantDashboard (main layout)
│   ├── DashboardHeader (stats summary)
│   ├── ProjectCard (project overview)
│   ├── TimeTracker (timer + manual entry)
│   ├── EarningsWidget (earnings display)
│   ├── TaskSummary (tasks + deadlines)
│   ├── EmptyState (no data state)
│   ├── HealthStatusWidget (connection health)
│   └── ProjectLinkButton (navigation)
│
├── Customer Components
│   ├── CustomerPanel (customer list)
│   ├── CustomerForm (add/edit form)
│   ├── CustomerCard (customer summary)
│   └── CustomerActions (quick actions)
│
├── Connection Components
│   ├── ConnectionManager (main view)
│   ├── ConnectionForm (add/edit with scope)
│   ├── ConnectionList (all connections)
│   ├── ConnectionCard (single connection)
│   ├── SyncDialog (sync options)
│   ├── SyncProgress (progress indicator)
│   ├── AuditLogViewer (audit trail)
│   ├── HealthIndicator (status badge)
│   └── CredentialScopeBadge (PERSONAL/TEAM)
│
├── Time & Billing Components
│   ├── TimeDetailModal (drill-down)
│   ├── BillingReport (earnings report)
│   └── ExportDialog (PDF/CSV export)
│
├── Hooks
│   ├── useDashboard (dashboard data)
│   ├── useProjects (project list)
│   ├── useTimeEntries (time tracking)
│   ├── useEarnings (earnings data)
│   ├── useCustomers (customer CRUD)
│   ├── useConnections (connection CRUD)
│   ├── useSync (sync operations)
│   ├── useAuditLog (audit viewing)
│   └── useHealth (health monitoring)
│
└── Utils
    ├── encryption.ts (AES-256-GCM)
    ├── validators.ts (input validation)
    ├── formatters.ts (date/time formatting)
    └── calculations.ts (earnings calculations)
```

## Quickstart

### For Consultants
1. Log in to wxKanban with TEAM role
2. Navigate to Consultant Dashboard
3. View active projects and time summary
4. Click "Start Timer" on any project to track time
5. Add customers via Customer Panel
6. Set up external connections for each customer
7. Monitor connection health in dashboard widget

### For Team Managers
1. Access team member dashboards (view-only)
2. View TEAM-scoped connections
3. Monitor connection health across team
4. Access audit logs for TEAM credentials

### For Developers
```bash
# Test connection to external system
npx tsx cli/test-connection.ts --connection <id>

# Trigger manual sync
npx tsx cli/sync-connection.ts --connection <id> --type incremental

# View audit log
npx tsx cli/audit-log.ts --connection <id> --last 24h
```

## Implementation Phases

### Phase 1: Database & API Foundation (Day 1)
- [ ] Create migration for 4 new tables
- [ ] Set up encryption service (AES-256-GCM)
- [ ] Create dashboard API endpoints
- [ ] Create customer management API
- [ ] Write API tests

### Phase 2: Dashboard UI (Day 2)
- [ ] Create ConsultantDashboard layout
- [ ] Build ProjectCard and TaskSummary
- [ ] Implement TimeTracker component
- [ ] Create EarningsWidget
- [ ] Add dashboard navigation

### Phase 3: Customer & Connection UI (Day 3)
- [ ] Build CustomerPanel and CustomerForm
- [ ] Create ConnectionManager
- [ ] Implement ConnectionForm with scope selector
- [ ] Build ConnectionList and ConnectionCard
- [ ] Add health indicators

### Phase 4: Sync & Audit Features (Day 4)
- [ ] Create SyncDialog and SyncProgress
- [ ] Implement AuditLogViewer
- [ ] Build HealthStatusWidget
- [ ] Add export functionality
- [ ] Create wxAI command handlers

### Phase 5: Security & Polish (Day 5)
- [ ] Implement credential encryption/decryption
- [ ] Add audit logging throughout
- [ ] Set up health monitoring job
- [ ] Add rate limiting
- [ ] E2E tests

### Phase 6: Testing & Documentation (Day 6)
- [ ] Write comprehensive tests
- [ ] Create user documentation
- [ ] Performance optimization
- [ ] Security audit
- [ ] Final review

## Testing Strategy

### Unit Tests
- Encryption/decryption roundtrip
- Earnings calculations
- Time entry validation
- Credential scope permissions

### Integration Tests
- API endpoints (all 24 routes)
- Database queries
- External system connection tests
- Sync operations

### E2E Tests
- Dashboard load and navigation
- Time tracking workflow
- Customer CRUD operations
- Connection setup and sync
- Audit log viewing

### Security Tests
- Credential encryption verification
- Unauthorized access attempts
- SQL injection prevention
- XSS protection

## Performance Targets

- Dashboard load: < 3 seconds
- API response: < 500ms average
- Sync operation: < 30 seconds (incremental)
- Connection test: < 5 seconds
- Audit log query: < 1 second

## Security Considerations

- AES-256-GCM encryption for all credentials
- Encryption keys in environment variables only
- TLS 1.3 for all credential transmission
- Rate limiting: 10 sync/hour per connection, 50/hour per user
- IP logging for all credential access
- Immutable audit logs
- Scope-based access control (PERSONAL/TEAM)

## Deployment Notes

- Database migration required before deployment
- Encryption keys must be configured in environment
- Health monitoring job needs scheduling setup
- No breaking changes to existing APIs
- Can be deployed incrementally (API first, then UI)

## Dependencies

### External Dependencies
- Existing time tracking system (005)
- Project management system (002)
- User authentication system
- Notification system (for alerts)

### New Dependencies
- Encryption library (crypto)
- External API clients (Jira, Monday, Trello SDKs optional)

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Credential breach | AES-256-GCM encryption, key rotation support |
| External API changes | API versioning in connection config |
| Sync failures | Comprehensive error handling, retry logic |
| Performance issues | Caching, pagination, rate limiting |
| Data conflicts | External system as source of truth |

## Success Criteria

- [ ] All 13 functional requirements implemented
- [ ] All 15 success criteria met
- [ ] 90%+ test coverage
- [ ] Security audit passed
- [ ] Performance targets achieved
- [ ] Documentation complete
