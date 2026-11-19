# Data Model: Admin & Company Management System

**Feature**: 002-admin-management
**Created**: 2026-02-14
**Version**: 1.1
**Updated**: 2026-02-19 — post-clarify: plural table names, `pg_uuidv7()` PKs, three-tier `usertype` (ADMIN/TEAM_MANAGER/TEAM_MEMBER), `phone`/`digestconfig`/`maxusers` on companies, `dashboardconfig` on users, `entryrate` on timeentries, TimeEntry entity added

---

## Entity Relationship Diagram

```
┌─────────────────┐
│   companies     │ (Organization/Account)
│  (NEW Entity)   │
└────────┬────────┘
         │ 1:N
         ├──→ users (MODIFIED - add companyid FK, usertype, billing)
         │     └─ 1:N → projectusers (NEW)
         │           └─ N:1 → projects (MODIFIED - add companyid)
         │                    └─ 1:N → timeentries (MODIFIED - add entryrate)
         │                    └─ 1:N → tasks (existing)
         │
         ├──→ projects (MODIFIED - add companyid FK)
         │     └─ 1:N → projectusers (NEW)
         │     └─ 1:N → timeentries (existing)
         │
         ├──→ invoices (MODIFIED - add companyid FK)
         │
         ├──→ companyauditlogs (NEW - audit trail)
         │
         └──→ userinvitations (NEW - onboarding)

Legend:
  1:N = One-to-Many relationship
  N:1 = Many-to-One relationship
  NEW = New table for this feature
  MODIFIED = Existing table enhanced with new fields
```

---

## Entity Definitions

### 1. companies (NEW ENTITY)

**Purpose**: Represents an organization/company managing users, projects, and billing. Primary unit of data isolation.

**Table Name**: `companies`

#### Fields

| Field              | Type          | Constraints                        | Description                                                             |
| ------------------ | ------------- | ---------------------------------- | ----------------------------------------------------------------------- |
| id                 | UUID          | PRIMARY KEY, DEFAULT pg_uuidv7()   | Unique identifier for company                                           |
| name               | VARCHAR(255)  | NOT NULL                           | Company legal name or trading name                                      |
| address            | TEXT          | NULLABLE                           | Billing/legal address                                                   |
| contactemail       | VARCHAR(255)  | NOT NULL, UNIQUE                   | Primary contact email for notices/invoices                              |
| phone              | VARCHAR(20)   | NULLABLE                           | Company phone number (collected at registration, FR-001)                |
| billingplan        | VARCHAR(50)   | NOT NULL, DEFAULT 'FREE'           | Subscription tier: 'FREE', 'SMALL_BUSINESS', 'CONSULTANT', 'ENTERPRISE' |
| subscriptionstatus | VARCHAR(20)   | NOT NULL, DEFAULT 'ACTIVE'         | 'ACTIVE', 'PENDING' (awaiting payment), 'SUSPENDED'                     |
| maxusers           | INTEGER       | NOT NULL, DEFAULT 5                | Seat limit derived from billingplan at registration                     |
| hourlyrate         | NUMERIC(10,2) | NULLABLE                           | Default hourly billing rate (overridable per project/user)              |
| digestconfig       | JSONB         | NULLABLE                           | Email digest settings: send time, frequency, recipients list (FR-086)   |
| logourl            | VARCHAR(1024) | NULLABLE                           | URL to company logo for invoice branding                                |
| activeflag         | BOOLEAN       | NOT NULL, DEFAULT true             | true = company can operate, false = deactivated                         |
| verifiedat         | TIMESTAMP     | NULLABLE                           | When email verification completed (null until verified)                 |
| vatnumber          | VARCHAR(50)   | NULLABLE                           | VAT registration number, as entered (Amendment A, FR-012a)              |
| createdat          | TIMESTAMP     | NOT NULL, DEFAULT NOW()            | Creation timestamp                                                      |
| updatedat          | TIMESTAMP     | NOT NULL, DEFAULT NOW()            | Last modification timestamp                                             |

#### Validation Rules

- `name`: Required, 1–255 characters
- `contactemail`: Valid email format, unique across system
- `phone`: Optional; if provided, E.164 format preferred
- `billingplan`: One of ['FREE', 'SMALL_BUSINESS', 'CONSULTANT', 'ENTERPRISE']
- `subscriptionstatus`: One of ['ACTIVE', 'PENDING', 'SUSPENDED']. FREE/SMALL_BUSINESS default to ACTIVE. CONSULTANT/ENTERPRISE default to PENDING until Stripe payment confirmed.
- `maxusers`: Set at registration based on billingplan: FREE=5, SMALL_BUSINESS=5, CONSULTANT=9999 (unlimited), ENTERPRISE=25 (base; overage billed at $5/user/month)
- `hourlyrate`: If provided, must be >= 0, max 2 decimal places
- `digestconfig`: Valid JSON when provided. Schema: `{ "sendtime": "06:00", "timezone": "UTC", "frequency": "daily", "recipients": ["email@..."] }`
- `logourl`: Valid HTTP/HTTPS URL if provided
- `activeflag`: Boolean (true/false only)
- `vatnumber`: Optional. Trimmed; empty → NULL; max 50 characters. No format validation (formats vary by country).

#### Relationships

- **1:N with users**: One company has many users. Company deactivated (activeflag=false) rather than deleted.
- **1:N with projects**: One company has many projects. Company isolation enforced.
- **1:N with invoices**: One company has many invoices. All invoices belong to single company.
- **1:N with companyauditlogs**: One company has many audit entries tracking changes.

#### Key Business Rules

- Company must be verified (`verifiedat` not null) OR admin bypass used before users can access any features
- `maxusers` enforces seat limits; admins cannot invite past the limit without upgrading
- ENTERPRISE overage: users beyond `maxusers=25` billed at $5/user/month additional
- Deactivation (`activeflag = false`) prevents all user logins; data preserved
- All time entries and invoices preserved even when company deactivated

---

### 2. users (MODIFIED — ENHANCED)

**Purpose**: Company team member with usertype, billing configuration, activation status. Enhanced from original single-user design.

**Table Name**: `users`

#### New/Modified Fields

| Field          | Type          | Constraints                          | New/Modified           | Description                                                      |
| -------------- | ------------- | ------------------------------------ | ---------------------- | ---------------------------------------------------------------- |
| id             | UUID          | PRIMARY KEY, DEFAULT pg_uuidv7()     | Original               | User identifier                                                  |
| email          | VARCHAR(255)  | NOT NULL, UNIQUE                     | Original               | Email address (unique globally)                                  |
| passwordhash   | VARCHAR(255)  | NOT NULL                             | Original               | bcrypt hashed password                                           |
| companyid      | UUID          | NOT NULL, FK→companies.id            | **NEW**                | Company this user belongs to (data isolation)                    |
| usertype       | VARCHAR(20)   | NOT NULL, DEFAULT 'TEAM_MEMBER'      | **NEW** (replaces role) | ADMIN, TEAM_MANAGER, or TEAM_MEMBER. Single classification field. |
| activeflag     | BOOLEAN       | NOT NULL, DEFAULT true               | **NEW**                | true = can login, false = deactivated. From legacy userprofile   |
| payrate        | NUMERIC(10,2) | NULLABLE                             | **NEW**                | User-specific billing rate override. From legacy userprofile     |
| tracktimeflag  | BOOLEAN       | NOT NULL, DEFAULT true               | **NEW**                | true = can track time, false = disabled. From legacy userprofile |
| timezone       | VARCHAR(50)   | NOT NULL, DEFAULT 'UTC'              | **NEW**                | User timezone for reporting (America/New_York, etc.)             |
| dashboardconfig | JSONB        | NULLABLE                             | **NEW**                | Widget order and visibility preferences (FR-033)                 |
| joinedat       | TIMESTAMP     | NULLABLE                             | **NEW**                | When user accepted company invitation                            |
| lastloginedat  | TIMESTAMP     | NULLABLE                             | **NEW**                | Most recent successful login timestamp                           |
| createdat      | TIMESTAMP     | NOT NULL, DEFAULT NOW()              | Original               | Account creation timestamp                                       |
| updatedat      | TIMESTAMP     | NOT NULL, DEFAULT NOW()              | Original               | Last profile update timestamp                                    |

#### Validation Rules

- `companyid`: Must exist in companies table (foreign key constraint)
- `usertype`: One of ['ADMIN', 'TEAM_MANAGER', 'TEAM_MEMBER']
  - `ADMIN`: Full access to all billing, team management, and company settings
  - `TEAM_MANAGER`: Admin shell nav with Time & Billing / Invoices / Reports role-locked; can manage projects and team members within assigned projects (CONSULTANT+ only)
  - `TEAM_MEMBER`: Basic 4-item nav; can track time and view assigned projects
- `activeflag`: Boolean (true = active, false = deactivated)
- `payrate`: If provided, must be >= 0, max 2 decimal places
- `tracktimeflag`: Boolean (true = enabled, false = disabled)
- `timezone`: Valid IANA timezone identifier (America/New_York, Europe/London, Asia/Tokyo, etc.)
- `dashboardconfig`: Valid JSON when provided. Schema: `{ "widgets": [{ "id": "subscription", "visible": true, "order": 1 }, ...] }`

#### Relationships

- **N:1 with companies**: Many users belong to one company. Enforce company isolation in queries.
- **1:N with projectusers**: One user can be assigned to many projects with different project-level roles.
- **1:N with companyauditlogs**: User referenced as `changedby` when user makes admin changes.

#### Key Business Rules

- All users isolated by company (cannot access data from other companies)
- `usertype` determines nav shell and API access: ADMIN > TEAM_MANAGER > TEAM_MEMBER
- TEAM_MANAGER assignment is CONSULTANT+ only; `usertype` column exists for all users
- `activeflag = false` prevents login but preserves all historical data
- `tracktimeflag = false` allows login but prevents time entry creation
- `payrate` overrides project rate, which overrides company rate (for `entryrate` resolution)
- `lastloginedat` updated automatically on each successful authentication
- ADMIN can bypass email verification for any company user via "Verify Now" action (FR-007)

#### Legacy Migration

- Maps legacy `userprofile.id` to new `users.id` (UUID v7)
- Maps legacy `userprofile.activeflag` → `users.activeflag`
- Maps legacy `userprofile.payrate` → `users.payrate`
- Maps legacy `userprofile.tracktime` → `users.tracktimeflag`
- Sets `usertype = 'ADMIN'` for original account owner (no separate `role` field)

---

### 3. projects (MODIFIED — ENHANCED)

**Purpose**: Work project with team assignments and billing configuration. Enhanced to support company isolation and per-project billing rates.

**Table Name**: `projects`

#### New/Modified Fields

| Field          | Type          | Constraints                        | New/Modified | Description                                                        |
| -------------- | ------------- | ---------------------------------- | ------------ | ------------------------------------------------------------------ |
| id             | UUID          | PRIMARY KEY, DEFAULT pg_uuidv7()   | Original     | Project identifier                                                 |
| userid         | UUID          | NOT NULL, FK→users.id              | Original     | Owner/creator user (still required for backward compatibility)     |
| companyid      | UUID          | NOT NULL, FK→companies.id          | **NEW**      | Company this project belongs to (isolation + billing aggregation)  |
| name           | VARCHAR(255)  | NOT NULL                           | Original     | Project name/title                                                 |
| description    | TEXT          | NULLABLE                           | Original     | Project description                                                |
| pmsystems      | VARCHAR(255)  | NULLABLE                           | Original     | Comma-separated PM systems (jira,monday,asana)                     |
| hourlyrate     | NUMERIC(10,2) | NULLABLE                           | **NEW**      | Project-specific billing rate override (overrides company default) |
| allocatedhours | NUMERIC(10,2) | NULLABLE                           | Original     | Budgeted hours for project                                         |
| currentphase   | VARCHAR(50)   | NOT NULL, DEFAULT 'Design'         | Original     | Current 6-phase lifecycle stage                                    |
| createdat      | TIMESTAMP     | NOT NULL, DEFAULT NOW()            | Original     | Creation timestamp                                                 |
| updatedat      | TIMESTAMP     | NOT NULL, DEFAULT NOW()            | Original     | Last update timestamp                                              |

#### Validation Rules

- `companyid`: Must exist in companies table (enforces company isolation)
- `hourlyrate`: If provided, must be >= 0, max 2 decimal places
- `currentphase`: One of ['Design', 'Implementation', 'QA', 'HumanTesting', 'Beta', 'Release']

#### Relationships

- **N:1 with companies**: Many projects belong to one company. All queries must filter by companyid.
- **1:N with projectusers**: One project has many user assignments with different roles.
- **1:N with timeentries**: Existing relationship (one project has many time entries).
- **1:N with tasks**: Existing relationship (one project has many tasks).

#### Key Business Rules

- `companyid` enforces company isolation; users cannot access projects from other companies
- `hourlyrate` overrides company default rate for this project only
- Billing rate hierarchy: user `payrate` > project `hourlyrate` > company `hourlyrate`
- Project remains accessible even when individual user is removed (assigned to other users)
- All time entries preserved when project is deactivated/deleted

---

### 4. invoices (MODIFIED — ENHANCED)

**Purpose**: Company billing document aggregating time entries and revenue. Enhanced to support company-level billing and invoice tracking.

**Table Name**: `invoices`

#### New/Modified Fields

| Field         | Type          | Constraints                        | New/Modified | Description                                                                  |
| ------------- | ------------- | ---------------------------------- | ------------ | ---------------------------------------------------------------------------- |
| id            | UUID          | PRIMARY KEY, DEFAULT pg_uuidv7()   | Original     | Invoice identifier                                                           |
| projectid     | UUID          | NULLABLE, FK→projects.id           | Original     | Project (if project-level invoice), nullable for company-wide                |
| companyid     | UUID          | NOT NULL, FK→companies.id          | **NEW**      | Company this invoice belongs to (required for all invoices)                  |
| clientemail   | VARCHAR(255)  | NULLABLE                           | Original     | Email address to send invoice to                                             |
| invoicenumber | VARCHAR(50)   | NOT NULL                           | **NEW**      | Unique invoice number per company (format: INV-YYYY-NNN, e.g., INV-2026-001) |
| billedto      | VARCHAR(255)  | NULLABLE                           | **NEW**      | Company name to display on invoice (for white-label support)                 |
| totalamount   | NUMERIC(12,2) | NOT NULL                           | Original     | Total invoice amount calculated at generation                                |
| hoursworked   | NUMERIC(10,2) | NOT NULL                           | Original     | Total billable hours on invoice                                              |
| description   | TEXT          | NULLABLE                           | **NEW**      | Invoice line items description or memo                                       |
| downloadurl   | VARCHAR(1024) | NULLABLE                           | Original     | S3 or cloud storage URL for PDF download                                     |
| emailsent     | BOOLEAN       | NOT NULL, DEFAULT false            | Original     | true = invoice was emailed to client                                         |
| sentat        | TIMESTAMP     | NULLABLE                           | Original     | When invoice was emailed                                                     |
| generatedat   | TIMESTAMP     | NOT NULL, DEFAULT NOW()            | Original     | When invoice was generated                                                   |
| createdat     | TIMESTAMP     | NOT NULL, DEFAULT NOW()            | Original     | Record creation timestamp (same as generatedat)                              |

#### Validation Rules

- `companyid`: Must exist in companies table (required, never null)
- `projectid`: Must exist in projects table if provided (optional, can be null for company-wide invoices)
- `invoicenumber`: Unique per company (constraint: UNIQUE(companyid, invoicenumber))
- `totalamount`: Must be >= 0, max 2 decimal places
- `hoursworked`: Must be >= 0, max 2 decimal places
- `downloadurl`: Valid HTTP/HTTPS URL if provided

#### Relationships

- **N:1 with companies**: Many invoices belong to one company. Required foreign key.
- **N:1 with projects**: Optional relationship (invoice can aggregate company-wide or project-specific).

#### Key Business Rules

- `invoicenumber` unique per company (different companies can reuse number sequences)
- `companyid` enforces company isolation; users cannot access other companies' invoices
- Time entries included in invoice must have `invoiced=true` to prevent duplicate billing
- Invoice PDF generated with `billedto` (company name) for white-label support
- Downloads available for 30 days; older downloads return 404

---

### 5. projectusers (NEW ENTITY)

**Purpose**: Junction table tracking user-project assignments with project-level role. Enables many-to-many user-project relationships.

**Table Name**: `projectusers`

#### Fields

| Field      | Type        | Constraints                        | Description                                         |
| ---------- | ----------- | ---------------------------------- | --------------------------------------------------- |
| id         | UUID        | PRIMARY KEY, DEFAULT pg_uuidv7()   | Unique identifier for this assignment               |
| projectid  | UUID        | NOT NULL, FK→projects.id           | Project being assigned (cascade on project delete)  |
| userid     | UUID        | NOT NULL, FK→users.id              | User being assigned (cascade on user delete)        |
| role       | VARCHAR(50) | NOT NULL, DEFAULT 'TeamMember'     | Project-level role: 'Lead', 'TeamMember', 'Observer' |
| assignedat | TIMESTAMP   | NOT NULL, DEFAULT NOW()            | When user was added to project                      |
| removedat  | TIMESTAMP   | NULLABLE                           | When user was removed (null = still active)         |

> **Note**: `projectusers.role` is a project-level assignment role (Lead/TeamMember/Observer) and is distinct from `users.usertype` (ADMIN/TEAM_MANAGER/TEAM_MEMBER), which governs system-wide nav and access.

#### Validation Rules

- `projectid`: Must exist in projects table (foreign key)
- `userid`: Must exist in users table (foreign key)
- `role`: One of ['Lead', 'TeamMember', 'Observer']
- Unique constraint: (projectid, userid) — user has only one project-level role per project
- Business rule: `userid` must belong to same company as `projectid` (enforced in application layer)

#### Relationships

- **N:1 with projects**: Many user assignments per project
- **N:1 with users**: Many project assignments per user

#### Key Business Rules

- One user can have only one project-level role per project (UNIQUE constraint on projectid, userid)
- Lead: Can modify project settings, assign/remove users
- TeamMember: Can track time, view tasks
- Observer: Can view only, no editing or time tracking
- `removedat` tracks when user was removed but preserves history (soft delete)
- Removed users cannot access project, but time entries preserved for billing

#### Data Integrity

- When project deleted, all projectusers records cascade deleted
- When user deleted, all projectusers records cascade deleted
- Historical assignments preserved via `removedat` for audit trail

---

### 6. companyauditlogs (NEW ENTITY)

**Purpose**: Audit trail tracking all company-level changes for compliance, debugging, and dispute resolution.

**Table Name**: `companyauditlogs`

#### Fields

| Field         | Type         | Constraints                        | Description                                                                           |
| ------------- | ------------ | ---------------------------------- | ------------------------------------------------------------------------------------- |
| id            | UUID         | PRIMARY KEY, DEFAULT pg_uuidv7()   | Unique audit log entry identifier                                                     |
| companyid     | UUID         | NOT NULL, FK→companies.id          | Company being audited (cascade on delete)                                             |
| action        | VARCHAR(100) | NOT NULL                           | Action taken: 'company_created', 'user_invited', 'role_changed', 'rate_updated', etc. |
| changedby     | UUID         | NULLABLE, FK→users.id              | Admin user who made the change (nullable for system actions)                          |
| previousvalue | JSONB        | NULLABLE                           | Previous state (before change) in JSON format                                         |
| newvalue      | JSONB        | NULLABLE                           | New state (after change) in JSON format                                               |
| description   | TEXT         | NULLABLE                           | Human-readable description of change                                                  |
| timestamp     | TIMESTAMP    | NOT NULL, DEFAULT NOW()            | When change occurred                                                                  |

#### Validation Rules

- `companyid`: Must exist in companies table
- `changedby`: Must exist in users table if provided
- `action`: Predefined set of action types (enforced by application)
- `previousvalue` and `newvalue`: Valid JSON when populated
- `timestamp`: Automatically set to NOW() at record creation

#### Relationships

- **N:1 with companies**: Many audit entries per company
- **N:1 with users**: Changed-by user relationship (optional, nullable for system actions)

#### Key Business Rules

- All company-level changes must be logged (automatic via application middleware)
- `changedby` is nullable for system-initiated changes (billing processor, scheduled tasks)
- `previousvalue` and `newvalue` capture full state change for dispute resolution
- Audit log is immutable (never updated, only inserted)
- Retained indefinitely for compliance (minimum 7 years for tax purposes)

#### Example Entries

| Action              | previousvalue           | newvalue                                                    | Description                  |
| ------------------- | ----------------------- | ----------------------------------------------------------- | ---------------------------- |
| company_created     | null                    | {"name":"Acme Corp","plan":"FREE"}                          | New company registration     |
| user_invited        | null                    | {"email":"john@example.com","usertype":"TEAM_MEMBER"}       | User invitation sent         |
| usertype_changed    | {"usertype":"TEAM_MEMBER"} | {"usertype":"TEAM_MANAGER"}                              | User promoted to Team Manager |
| rate_updated        | {"hourlyrate":"150.00"} | {"hourlyrate":"200.00"}                                     | Company rate updated         |
| company_deactivated | {"activeflag":true}     | {"activeflag":false}                                        | Company deactivated          |
| email_verified      | {"verifiedat":null}     | {"verifiedat":"2026-02-19T10:00:00Z"}                       | Email verification completed |
| admin_bypass_verify | {"verifiedat":null}     | {"verifiedat":"2026-02-19T10:05:00Z","bypassedby":"uuid"}}  | Admin used Verify Now action |

---

### 7. userinvitations (NEW ENTITY)

**Purpose**: Manage user invitation lifecycle and onboarding workflow. Tracks invitation status and expiration.

**Table Name**: `userinvitations`

#### Fields

| Field       | Type         | Constraints                        | Description                                          |
| ----------- | ------------ | ---------------------------------- | ---------------------------------------------------- |
| id          | UUID         | PRIMARY KEY, DEFAULT pg_uuidv7()   | Unique invitation identifier                         |
| companyid   | UUID         | NOT NULL, FK→companies.id          | Company inviting user (cascade on delete)            |
| email       | VARCHAR(255) | NOT NULL                           | Email address being invited                          |
| usertype    | VARCHAR(20)  | NOT NULL, DEFAULT 'TEAM_MEMBER'    | Pre-assigned usertype: ADMIN, TEAM_MANAGER, TEAM_MEMBER |
| token       | VARCHAR(255) | NOT NULL, UNIQUE                   | 7-day-valid join token (cryptographically random)    |
| status      | VARCHAR(50)  | NOT NULL, DEFAULT 'pending'        | Invitation status: 'pending', 'accepted', 'expired'  |
| expiresat   | TIMESTAMP    | NOT NULL                           | When invitation expires (7 days from creation)       |
| invitedat   | TIMESTAMP    | NOT NULL, DEFAULT NOW()            | When invitation was sent                             |
| acceptedat  | TIMESTAMP    | NULLABLE                           | When user claimed invitation and created account     |

#### Validation Rules

- `companyid`: Must exist in companies table
- `email`: Valid email format, not already a user in this company
- `usertype`: One of ['ADMIN', 'TEAM_MANAGER', 'TEAM_MEMBER'] — pre-assigned at invitation
- `token`: Unique globally, cryptographically random (256-bit entropy minimum)
- `status`: One of ['pending', 'accepted', 'expired']
- `expiresat`: Must be 7 days from `invitedat`
- Unique constraint: (companyid, email) — prevent duplicate invitations to same email

#### Relationships

- **N:1 with companies**: Many invitations per company
- **No direct users relationship**: Invite can exist before user account created

#### Key Business Rules

- Invitation valid for exactly 7 calendar days from creation
- Status transitions: pending → accepted (when claimed) OR pending → expired (after 7 days)
- `acceptedat` populated when user claims invitation and creates account
- Resending invitation generates new token and resets `expiresat` to +7 days
- Expired invitations can be resent or deleted
- Email must not already be registered user in company (validation in create)

#### Cleanup Workflow

- Expired invitations > 30 days old can be deleted (retention for audit)
- Accepted invitations preserved indefinitely for onboarding history

---

### 8. timeentries (MODIFIED — KEY FIELDS DEFINED)

**Purpose**: Time tracking records for billable and non-billable work against projects. Critical for invoice generation.

**Table Name**: `timeentries`

#### Fields

| Field     | Type          | Constraints                        | Description                                                                        |
| --------- | ------------- | ---------------------------------- | ---------------------------------------------------------------------------------- |
| id        | UUID          | PRIMARY KEY, DEFAULT pg_uuidv7()   | Time entry identifier                                                              |
| projectid | UUID          | NOT NULL, FK→projects.id           | Project being tracked                                                              |
| userid    | UUID          | NOT NULL, FK→users.id              | User who logged the time                                                           |
| companyid | UUID          | NOT NULL, FK→companies.id          | Company isolation (denormalized for query efficiency)                              |
| starttime | TIMESTAMP     | NOT NULL                           | When timer was started                                                             |
| endtime   | TIMESTAMP     | NULLABLE                           | When timer was stopped (null = timer still running)                                |
| duration  | INTEGER       | NULLABLE                           | Duration in minutes (calculated on stop; null while running)                       |
| billable  | BOOLEAN       | NOT NULL, DEFAULT true             | Whether this entry is billable to client                                           |
| invoiced  | BOOLEAN       | NOT NULL, DEFAULT false            | true = included in an invoice; prevents duplicate billing                          |
| entryrate | NUMERIC(10,2) | NULLABLE                           | Resolved billing rate at creation time: user payrate > project hourlyrate > company hourlyrate. FR-082. |
| createdat | TIMESTAMP     | NOT NULL, DEFAULT NOW()            | Record creation timestamp                                                          |

#### Validation Rules

- `projectid`: Must exist in projects table (foreign key)
- `userid`: Must exist in users table (foreign key)
- `companyid`: Must match `projects.companyid` (denormalized; enforced in application)
- `endtime`: Must be >= `starttime` if provided
- `duration`: Auto-calculated as `(endtime - starttime)` in minutes when endtime set
- `entryrate`: Resolved at creation time — takes first non-null value from: `users.payrate` → `projects.hourlyrate` → `companies.hourlyrate`. Rate changes after creation do NOT retroactively affect existing entries.
- `billable`: false entries excluded from invoice generation and `entryrate` calculations
- `invoiced`: Once true, entry excluded from future invoice queries

#### Relationships

- **N:1 with projects**: Many time entries per project
- **N:1 with users**: Many time entries per user
- **N:1 with companies**: Company isolation FK (denormalized)

#### Key Business Rules

- `entryrate` snapshot: rate is captured at creation for historical accuracy. Invoice generation reads `entryrate` directly — no rate history table needed (FR-082).
- Timer inactivity: prompt user if timer runs > 8 hours (configurable per company)
- `invoiced = true` is permanent once set; entries cannot be uninvoiced
- Non-billable entries (`billable = false`) preserved for capacity/utilization reporting but excluded from invoice totals
- `companyid` denormalization allows efficient company-scoped queries without joins

---

## Database Constraints Summary

### Primary Keys

All entities use `id` (UUID v7) as primary key with `DEFAULT pg_uuidv7()`:

- `companies.id` — company identifier
- `users.id` — user identifier
- `projects.id` — project identifier
- `invoices.id` — invoice identifier
- `projectusers.id` — assignment identifier
- `companyauditlogs.id` — audit log entry identifier
- `userinvitations.id` — invitation identifier
- `timeentries.id` — time entry identifier

### Foreign Keys

All foreign keys use `ON DELETE CASCADE` to maintain referential integrity:

- `users.companyid` → `companies.id` (CASCADE)
- `projects.userid` → `users.id` (CASCADE)
- `projects.companyid` → `companies.id` (CASCADE)
- `invoices.companyid` → `companies.id` (CASCADE)
- `invoices.projectid` → `projects.id` (CASCADE, nullable)
- `projectusers.projectid` → `projects.id` (CASCADE)
- `projectusers.userid` → `users.id` (CASCADE)
- `timeentries.projectid` → `projects.id` (CASCADE)
- `timeentries.userid` → `users.id` (CASCADE)
- `timeentries.companyid` → `companies.id` (CASCADE)
- `companyauditlogs.companyid` → `companies.id` (CASCADE)
- `companyauditlogs.changedby` → `users.id` (CASCADE, nullable)
- `userinvitations.companyid` → `companies.id` (CASCADE)

### Unique Constraints

- `users.email` — globally unique email
- `companies.contactemail` — globally unique contact email
- `projectusers (projectid, userid)` — one project-level role per user per project
- `invoices (companyid, invoicenumber)` — unique invoice numbers per company
- `userinvitations (companyid, email)` — prevent duplicate invites to same email
- `userinvitations.token` — cryptographically unique join tokens

### Indexes (Recommended for Performance)

- `users.companyid` — filter users by company
- `projects.companyid` — filter projects by company
- `projectusers.projectid` — filter assignments by project
- `projectusers.userid` — filter assignments by user
- `invoices.companyid` — filter invoices by company
- `timeentries.projectid` — filter entries by project
- `timeentries.userid` — filter entries by user
- `timeentries.companyid` — filter entries by company
- `companyauditlogs.companyid` — query audit history by company
- `userinvitations.token` — lookup invitation by token
- All timestamp fields for date range queries

---

## Data Integrity Validation

### On Creation

- companies: Email verified within 24 hours (or admin bypass used)
- users: Email unique, companyid valid, usertype valid
- projects: companyid valid, userid belongs to company
- projectusers: projectid and userid valid, (projectid, userid) unique, userid same company as projectid
- invoices: companyid valid, invoicenumber unique per company
- timeentries: projectid/userid/companyid valid; entryrate resolved from billing hierarchy
- userinvitations: Email valid, (companyid, email) unique, token unique

### On Modification

- users: Company isolation (user can only be modified by own company ADMIN)
- projects: Company isolation (project can only be modified by company members)
- projectusers: Company isolation (assignment only for users/projects in same company)
- invoices: Immutable once generated (`invoiced=true` on time entries prevents change)
- companyauditlogs: Immutable (append-only)
- timeentries: `entryrate` immutable after creation (rate snapshots must not drift)

### On Deletion

- companies: Soft delete via `activeflag` (no actual deletion)
- users: Cascade deletes projectusers, companyauditlogs entries
- projects: Cascade deletes projectusers (time entries preserved via explicit FK)
- invoices: Soft preserve (marked cancelled rather than deleted)
- userinvitations: Can be deleted; audit log entry preserved separately

---

## Legacy Data Mapping

### userprofile → users + companies

**Mapping Strategy**:

```
Legacy Table: userprofile
├─ id → users.id (generate UUID v7)
├─ emailaddr → users.email
├─ password → users.passwordhash
├─ payrate → users.payrate
├─ tracktime → users.tracktimeflag
├─ activeflag → users.activeflag
└─ profileid (company reference) → create companies record with legacy mapping

Set at migration:
  users.usertype = 'ADMIN' (original account owner)
  users.dashboardconfig = NULL (default widget layout)
  companies.digestconfig = NULL (default digest settings)
  companies.maxusers = 5 (default FREE tier)
```

### projects → projects

**Mapping Strategy**:

```
Legacy: projects.id → projects.id (UUID v7)
Legacy: projects.userprofileid → projects.userid
Legacy: projects.companyprofileid → projects.companyid
Legacy: projects.projecttitle → projects.name
Legacy: projects.generaldescription → projects.description
Legacy: projects.status → projects.currentphase (map values)
```

### Audit Trail Mapping

Create `legacymappings` table:

```
id (UUID v7, PK)
legacyid (original system ID)
newtypeid (new system UUID)
entitytype ('user', 'company', 'project')
mappedat (TIMESTAMP)
```

This enables:

- Support queries: "What's the new ID for old user 12345?"
- Validation: "Were all records migrated?"
- Audit: "When was legacy data imported?"

---

## Schema Generation Notes

- Use `npm run db:generate` to auto-generate migrations from TypeScript schema definitions
- Apply migrations with `npm run db:migrate` (dev only — **human must run, AI must not**)
- Production deployments handled by deployment pipeline
- Schema versioning tracked via Drizzle migration files
- All schema changes committed to git for audit trail
- All UUID primary keys must use `pg_uuidv7()` extension function (`DEFAULT pg_uuidv7()`)
