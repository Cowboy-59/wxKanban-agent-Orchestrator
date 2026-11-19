# wxKanban Database Schema

Complete reference for all database tables and their structure in wxKanban.

## Naming Conventions

All database tables follow strict naming conventions to ensure consistency and clarity:

- **Singular Names**: Use singular form (`user` not `users`, `project` not `projects`)
- **Lowercase**: All table and column names are lowercase
- **No CamelCase**: Compound words are concatenated without camelCase (e.g., `pmsystemconnection`, `companyauditlog`)
- **No Underscores**: Word separation via concatenation, not underscores
- **No Spaces**: All names are concatenated strings

**Examples:**
- ✅ `pmsystemconnection`, `invitationbatch`, `companyauditlog`
- ❌ `pm_system_connection`, `pmSystemConnection`, `invitationBatch`

## Table Reference

### Authentication & Users

#### `user`
Stores user account information and authentication credentials.

**Columns:**
- `id` (UUID v7): Primary key
- `email` (varchar): User email address
- `password` (varchar): Bcrypt-hashed password
- `firstname` (varchar): User's first name
- `lastname` (varchar): User's last name
- `active` (boolean): Account active status
- `createdat` (timestamp): Account creation date
- `updatedat` (timestamp): Last update timestamp

#### `session`
Stores JWT refresh token sessions with family rotation for security.

**Columns:**
- `id` (UUID v7): Primary key
- `userid` (UUID): Foreign key to `user`
- `tokenfamily` (UUID): Token family identifier for breach detection
- `currenttoken` (varchar): Current JWT token hash
- `refreshtoken` (varchar): Refresh token
- `expiresat` (timestamp): Token expiration date
- `revokedat` (timestamp): Token revocation date (if breached)
- `isactive` (boolean): Session active status
- `createdat` (timestamp): Session creation date

### Organization & Projects

#### `company`
Stores company/organization information.

**Columns:**
- `id` (UUID v7): Primary key
- `name` (varchar): Company name
- `billingemail` (varchar): Billing contact email
- `billingaddress` (varchar): Billing address
- `billingcountry` (varchar): Billing country
- `billingphone` (varchar): Billing phone number
- `subscriptiontier` (varchar): Subscription level (FREE, CONSULTANT, ENTERPRISE)
- `createdat` (timestamp): Company creation date

#### `project`
Stores project information tied to companies.

**Columns:**
- `id` (UUID v7): Primary key
- `userid` (UUID): Foreign key to `user` — project owner
- `companyid` (UUID, nullable): Foreign key to `company`
- `name` (varchar 255): Project name
- `description` (text, nullable): Project description
- `pmsystems` (varchar 255, nullable): Comma-separated PM system integrations (e.g. `'jira,monday'`)
- `hourlyrate` (numeric 10,2, nullable): Hourly billing rate
- `allocatedhours` (numeric 10,2, nullable): Total allocated hours for project
- `status` (varchar 20): Project status — `ACTIVE` | `ARCHIVE` | `BRANCHED` (default: `ACTIVE`)
- `currentphase` (varchar 50): Current lifecycle phase — `Design` | `Implementation` | `QA` | `HumanTesting` | `Beta` | `Release` (default: `Design`)
- `securityclassification` (varchar 50, nullable): Security classification label (e.g. `'CONFIDENTIAL'`)
- `audittype` (varchar 50, nullable): Compliance framework selected for this project — `GDPR` | `HIPAA` | `HITRUST` | `SOC2` | `null` (null = no audit selected). Set via Admin Dashboard Edit button on the project card.
- `createdat` (timestamp): Project creation date
- `updatedat` (timestamp): Last update timestamp

#### `projectuser`
Tracks user assignments to projects (team members).

**Columns:**
- `projectid` (UUID): Foreign key to `project`
- `userid` (UUID): Foreign key to `user`
- `role` (varchar): User's role on the project
- `assignedat` (timestamp): Assignment date
- `removedat` (timestamp): Removal date (if no longer on project)

### PM System Integration

#### `pmsystemconnection`
Stores OAuth2 connections to external PM systems (Jira, Monday.com, Asana, Trello).

**Columns:**
- `id` (UUID v7): Primary key
- `userid` (UUID): Foreign key to `user`
- `pmsystem` (varchar): PM system type (jira, monday, asana, trello)
- `accesstoken` (varchar): OAuth2 access token (encrypted)
- `refreshtoken` (varchar): OAuth2 refresh token (encrypted)
- `expiresat` (timestamp): Token expiration date
- `lastsyncsat` (timestamp): Last successful sync timestamp
- `syncstatus` (varchar): Sync status (active, expired, failed)
- `createdat` (timestamp): Connection creation date
- `updatedat` (timestamp): Last update timestamp

### Tasks & Time Tracking

#### `task`
Stores tasks/work items, including PM system synced tasks.

**Columns:**
- `id` (UUID v7): Primary key
- `projectid` (UUID): Foreign key to `project`
- `title` (varchar): Task title
- `description` (text): Task description
- `priority` (varchar): Priority level (low, medium, high, critical)
- `duedate` (timestamp): Task due date
- `sourcepmssystem` (varchar): Source PM system (if synced)
- `externalid` (varchar): External PM system task ID
- `sourceoforigin` (varchar): Task source (external, internal, ai_proposed)
- `createdbyid` (UUID): Foreign key to `user` who created task
- `assignedtoid` (UUID): Foreign key to `user` task is assigned to
- `createdat` (timestamp): Task creation date
- `updatedat` (timestamp): Last update timestamp

#### `timeentry`
Stores time tracking entries for billing and reporting.

**Columns:**
- `id` (UUID v7): Primary key
- `taskid` (UUID): Foreign key to `task`
- `projectid` (UUID): Foreign key to `project`
- `starttime` (timestamp): Entry start time
- `endtime` (timestamp): Entry end time
- `duration` (integer): Duration in minutes
- `billable` (boolean): Whether entry is billable
- `notes` (text): Entry notes/description
- `invoiced` (boolean): Whether entry has been invoiced
- `invoicedat` (timestamp): Invoice date (if invoiced)
- `createdat` (timestamp): Entry creation date
- `updatedat` (timestamp): Last update timestamp

### Invoicing

#### `invoice`
Stores generated invoices for billing.

**Columns:**
- `id` (UUID v7): Primary key
- `projectid` (UUID): Foreign key to `project`
- `invoicenumber` (varchar): Invoice number (format: INV-YYYY-XXXXXXXX)
- `status` (varchar): Invoice status (DRAFT, SENT, PAID, OVERDUE)
- `subtotal` (numeric): Invoice subtotal (before tax)
- `tax` (numeric): Tax amount
- `total` (numeric): Invoice total (subtotal + tax)
- `duedate` (timestamp): Payment due date
- `notes` (text): Invoice notes
- `createdat` (timestamp): Invoice creation date
- `updatedat` (timestamp): Last update timestamp

### Specifications & Lifecycle

#### `specification`
Stores feature specifications for the 6-phase workflow.

**Columns:**
- `id` (UUID v7): Primary key
- `projectid` (UUID): Foreign key to `project`
- `title` (varchar): Specification title
- `description` (text): Full specification description
- `currentphase` (varchar): Current phase (DESIGN, IMPLEMENTATION, QA, HUMAN_TESTING, BETA, RELEASE)
- `version` (integer): Specification version (increments on each phase transition)
- `createdat` (timestamp): Specification creation date
- `updatedat` (timestamp): Last update timestamp

#### `projectphase`
Tracks phase transitions and status for specifications.

**Columns:**
- `id` (UUID v7): Primary key
- `projectid` (UUID): Foreign key to `project`
- `phasename` (varchar): Phase name (Design, Implementation, QA, HumanTesting, Beta, Release)
- `status` (varchar): Phase status (pending, in_progress, complete, reopened)
- `enteredat` (timestamp): When phase was entered
- `completedat` (timestamp): When phase was completed
- `reason` (text): Reason for status (blockers, notes, etc.)
- `createdat` (timestamp): Record creation date

#### `testplan`
Stores test plans and results for specifications.

**Columns:**
- `id` (UUID v7): Primary key
- `specid` (UUID): Foreign key to `specification`
- `testcases` (jsonb): Array of test case objects
- `results` (jsonb): Test execution results (status, notes, timestamps)
- `createdat` (timestamp): Test plan creation date
- `updatedat` (timestamp): Last update timestamp

### Documentation & Communication

#### `note`
Stores project notes (both user-created and system-generated).

**Columns:**
- `id` (UUID v7): Primary key
- `projectid` (UUID): Foreign key to `project`
- `userid` (UUID): Foreign key to `user` (who created the note)
- `content` (text): Note content
- `type` (varchar): Note type (user, system)
- `createdat` (timestamp): Note creation date
- `updatedat` (timestamp): Last update timestamp

#### `projectdocuments`
Stores markdown documents associated with a project or a specific specification scope. Supports both AI-generated and manually authored documents. The `content` field holds the full markdown text (including Mermaid code blocks). Documents with `specid = NULL` are project-level; documents with a `specid` are scoped to a specific specification.

**Columns:**
- `id` (UUID v7): Primary key
- `projectid` (UUID): Foreign key to `project` — always required
- `specid` (UUID, nullable): Foreign key to `specification` — null = project-level doc; set = spec-scoped doc
- `doctype` (varchar 50): Document type classifier:
  - Project-level: `'overview'`, `'readme'`, `'architecture'`, `'lifecycle'`
  - Spec-level: `'spec'`, `'plan'`, `'tasks'`, `'contracts'`, `'datamodel'`, `'quickstart'`, `'checklist'`
- `title` (varchar 255): Document title
- `content` (text): Full markdown content (may include Mermaid code blocks — rendered client-side)
- `filepath` (varchar 500, nullable): Relative path from project root if backed by a file on disk (e.g. `specs/projectlifecycle.md`)
- `isgenerated` (boolean): `true` = AI-generated; `false` = manually authored
- `createdat` (timestamp): Creation date
- `updatedat` (timestamp): Last update timestamp
- `createdbyid` (UUID, nullable): Foreign key to `user` — set null on user delete

**Key behaviours:**
- `ProjectDocumentService.upsertDocument()` performs insert-or-update keyed on `(projectid, doctype)` where `specid IS NULL`
- When `specs/projectlifecycle.md` is written or updated, the corresponding `projectdocuments` record (`doctype = 'lifecycle'`) for the active project must be upserted with the new content
- The `content` field may contain Mermaid fenced code blocks (` ```mermaid `) — the document viewer renders these as live charts using the Mermaid library

### Feedback & Auditing

#### `feedback`
Stores user feedback from testing phases.

**Columns:**
- `id` (UUID v7): Primary key
- `projectid` (UUID): Foreign key to `project`
- `userid` (UUID): Foreign key to `user` (feedback provider)
- `feedbacktext` (text): Feedback content
- `severity` (varchar): Severity level (low, medium, high, critical)
- `category` (varchar): Feedback category
- `createdat` (timestamp): Feedback date
- `resolvedat` (timestamp): Resolution date (if resolved)

#### `companyauditlog`
Tracks audit events for compliance and security.

**Columns:**
- `id` (UUID v7): Primary key
- `companyid` (UUID): Foreign key to `company`
- `eventtype` (varchar): Event type (COMPANY_CREATED, SUBSCRIPTION_CREATED, etc.)
- `userid` (UUID): Foreign key to `user` (who triggered event)
- `details` (jsonb): Event details (JSON)
- `severity` (varchar): Event severity (info, warning, error, critical)
- `createdat` (timestamp): Event timestamp

### User Invitations

#### `userinvitation`
Stores pending user invitations to projects.

**Columns:**
- `id` (UUID v7): Primary key
- `projectid` (UUID): Foreign key to `project`
- `email` (varchar): Invited email address
- `invitetoken` (varchar): Unique invitation token
- `expiresat` (timestamp): Invitation expiration date
- `status` (varchar): Invitation status (pending, accepted, expired, declined)
- `acceptedat` (timestamp): Acceptance date (if accepted)
- `createdat` (timestamp): Invitation creation date

#### `invitationbatch`
Groups multiple invitations together for batch operations.

**Columns:**
- `id` (UUID v7): Primary key
- `projectid` (UUID): Foreign key to `project`
- `userid` (UUID): Foreign key to `user` (who created batch)
- `batchname` (varchar): Batch name
- `status` (varchar): Batch status (pending, sent, failed, complete)
- `invitationcount` (integer): Number of invitations in batch
- `sentcount` (integer): Number successfully sent
- `failedcount` (integer): Number failed to send
- `createdat` (timestamp): Batch creation date
- `completedat` (timestamp): Batch completion date

#### `invitationdlq`
Dead Letter Queue for failed invitation sends.

**Columns:**
- `id` (UUID v7): Primary key
- `batchid` (UUID): Foreign key to `invitationbatch`
- `email` (varchar): Email that failed
- `invitetoken` (varchar): Associated invitation token
- `error` (text): Error message
- `retrycount` (integer): Number of retry attempts
- `nextretry` (timestamp): Next retry timestamp
- `createdat` (timestamp): Record creation date
- `updatedat` (timestamp): Last update timestamp

## Primary Key Convention

All tables use UUID v7 for primary keys with the pattern `{table}id`:

- `user` table → primary key is `id`
- `project` table → primary key is `id`
- Foreign keys reference the parent primary key name directly:
  - `userid` → references `user.id`
  - `projectid` → references `project.id`

## Migration Management

Migrations are auto-generated from schema changes:

```bash
# Generate migration files from schema changes
npm run db:generate

# Apply migrations to database
npm run db:migrate

# Push schema to database (for Drizzle Studio)
npm run db:push
```

## Indexing Strategy

The following indexes are recommended for performance:

```sql
-- User queries
CREATE INDEX idx_user_email ON "user"(email);

-- Project queries
CREATE INDEX idx_project_company ON project(companyid);
CREATE INDEX idx_project_status ON project(status);

-- Time entry queries (for invoicing)
CREATE INDEX idx_timeentry_project ON timeentry(projectid);
CREATE INDEX idx_timeentry_billable ON timeentry(billable);
CREATE INDEX idx_timeentry_createdat ON timeentry(createdat);

-- PM System queries
CREATE INDEX idx_pmsystemconnection_user ON pmsystemconnection(userid);
CREATE INDEX idx_pmsystemconnection_system ON pmsystemconnection(pmsystem);

-- Task queries
CREATE INDEX idx_task_project ON task(projectid);
CREATE INDEX idx_task_assigned ON task(assignedtoid);
CREATE INDEX idx_task_created ON task(createdbyid);
```

## Data Integrity Rules

- **Cascade Delete**: When a parent record is deleted:
  - `company` deletes → cascades to `project`, `feedback`, `companyauditlog`
  - `project` deletes → cascades to `task`, `timeentry`, `invoice`, `note`, etc.
  - `user` deletes → cascades to `session` and foreign key references

- **Required Fields**: All primary keys and foreign keys are NOT NULL
- **Default Values**: Timestamps default to current time (`defaultNow()`)
- **UUID Generation**: All IDs use UUID v7 with `defaultRandom()`

## Type Safety

Schema types are generated from Drizzle ORM definitions:

```typescript
// Inferred select type for database queries
type User = typeof user.$inferSelect;

// Inferred insert type for database inserts
type NewUser = typeof user.$inferInsert;
```

These types are automatically generated and kept in sync with the schema definition.
