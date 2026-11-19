# Data Model: SysAdmin Platform Administration

**Spec:** 014 - SysAdmin Platform Administration  
**Date:** 2025-01-20

---

## Entity Relationship Diagram

```
┌─────────────────┐     ┌─────────────────────┐     ┌─────────────────┐
│   userprofiles  │     │  companyStatusHistory│     │    companies    │
├─────────────────┤     ├─────────────────────┤     ├─────────────────┤
│ id (PK)         │────<│ companyid (FK)      │>────│ id (PK)         │
│ emailaddr       │     │ status              │     │ companyname     │
│ usertype        │     │ changedby (FK)      │>────│ status          │
│ companyid (FK)  │>────│ reason              │     │ subscriptiontier│
│ securitylevel   │     │ createdat           │     │ ...             │
│ ...             │     └─────────────────────┘     └─────────────────┘
└─────────────────┘              │
         │                       │
         │              ┌────────┴────────┐
         │              │  users (self)   │
         │              │  for changedby   │
         │              └─────────────────┘
         │
         │         ┌─────────────────────┐
         └────────<│  systemSettings     │
                   ├─────────────────────┤
                   │ id (PK)             │
                   │ settingkey          │
                   │ settingvalue (JSON) │
                   │ category            │
                   │ description         │
                   │ updatedby (FK)      │>────┐
                   │ updatedat           │     │
                   └─────────────────────┘     │
                                                 │
                          ┌─────────────────────┐
                          │  companyAnalytics   │
                          ├─────────────────────┤
                          │ id (PK)             │
                          │ companyid (FK)      │>────┐
                          │ totalusers          │     │
                          │ activeusers         │     │
                          │ totalprojects       │     │
                          │ totaltasks          │     │
                          │ lastactivityat      │     │
                          │ healthscore         │     │
                          │ calculatedat        │     │
                          └─────────────────────┘     │
                                                        │
                          ┌─────────────────────────────┘
                          │
                   ┌──────┴────────┐
                   │  userprofiles  │
                   │  (for updatedby) │
                   └─────────────────┘
```

---

## Schema Definitions

### 1. UserProfiles (Modified)

**File**: `src/db/schema/user.ts`

**Changes**:
- Add `SYSADMIN` to UserType union type
- Add documentation for user type values

```typescript
// UserType enum - extends existing usertype column
export type UserType = "TEAM_MEMBER" | "TEAM_MANAGER" | "ADMIN" | "SYSADMIN";

// Existing table (no structural changes needed)
export const users = pgTable("userprofiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  // ... existing columns ...
  usertype: varchar("usertype", { length: 50 })
    .notNull()
    .default("TEAM_MEMBER"),
  // ... existing columns ...
});
```

**Notes**:
- SysAdmin users should have `securitylevel: 10` (highest)
- SysAdmin users may have a special `companyid` (system company UUID) or null
- Existing users are unaffected by this change

---

### 2. SystemSettings (New)

**File**: `src/db/schema/systemSettings.ts`

**Purpose**: Store global platform configuration as key-value pairs with JSON values.

```typescript
import { pgTable, uuid, varchar, jsonb, timestamp, integer } from "drizzle-orm/pg-core";
import { users } from "./user";

export const SettingCategory = {
  BILLING: 'billing',
  FEATURES: 'features',
  SECURITY: 'security',
  INTEGRATIONS: 'integrations',
  PLATFORM: 'platform',
} as const;

export type SettingCategory = typeof SettingCategory[keyof typeof SettingCategory];

export const systemSettings = pgTable("system_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  settingkey: varchar("settingkey", { length: 100 }).notNull().unique(),
  settingvalue: jsonb("settingvalue").notNull(),
  category: varchar("category", { length: 50 }).notNull().$type<SettingCategory>(),
  description: varchar("description", { length: 500 }),
  updatedby: uuid("updatedby").references(() => users.id, { onDelete: "set null" }),
  updatedat: timestamp("updatedat").defaultNow().notNull(),
  version: integer("version").notNull().default(1), // For optimistic locking
});

export type SystemSetting = typeof systemSettings.$inferSelect;
export type NewSystemSetting = typeof systemSettings.$inferInsert;
```

**Key Settings** (examples):

| Setting Key | Category | Value Type | Description |
|-------------|----------|------------|-------------|
| `billing.free_tier_enabled` | billing | boolean | Whether free tier is available |
| `billing.free_user_limit` | billing | number | Max users in free tier |
| `features.beta_enabled` | features | boolean | Enable beta features globally |
| `security.mfa_required_sysadmin` | security | boolean | Require MFA for SysAdmin |
| `platform.maintenance_mode` | platform | boolean | Platform-wide maintenance |

---

### 3. CompanyStatusHistory (New)

**File**: `src/db/schema/companyStatus.ts`

**Purpose**: Audit trail for all company lifecycle state changes.

```typescript
import { pgTable, uuid, varchar, timestamp } from "drizzle-orm/pg-core";
import { companies } from "./company";
import { users } from "./user";

export const CompanyStatus = {
  PENDING: 'pending',
  TRIAL: 'trial',
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  CANCELLED: 'cancelled',
  DELETED: 'deleted',
} as const;

export type CompanyStatus = typeof CompanyStatus[keyof typeof CompanyStatus];

export const companyStatusHistory = pgTable("company_status_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyid: uuid("companyid")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 50 }).notNull().$type<CompanyStatus>(),
  previousstatus: varchar("previousstatus", { length: 50 }).$type<CompanyStatus>(),
  changedby: uuid("changedby")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  reason: varchar("reason", { length: 500 }),
  metadata: jsonb("metadata"), // Additional context (e.g., subscription tier change)
  createdat: timestamp("createdat").defaultNow().notNull(),
});

export type CompanyStatusHistory = typeof companyStatusHistory.$inferSelect;
export type NewCompanyStatusHistory = typeof companyStatusHistory.$inferInsert;
```

**Indexes**:
- `companyid + createdat` (DESC) - For retrieving recent history
- `changedby` - For finding all changes by a SysAdmin

---

### 4. CompanyAnalytics (New)

**File**: `src/db/schema/companyStatus.ts` (same file as above)

**Purpose**: Materialized metrics for company health and usage tracking.

```typescript
import { pgTable, uuid, integer, timestamp, numeric } from "drizzle-orm/pg-core";
import { companies } from "./company";

export const companyAnalytics = pgTable("company_analytics", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyid: uuid("companyid")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" })
    .unique(), // One record per company
  // User metrics
  totalusers: integer("totalusers").notNull().default(0),
  activeusers: integer("activeusers").notNull().default(0), // Logged in within 30 days
  // Project metrics
  totalprojects: integer("totalprojects").notNull().default(0),
  activeprojects: integer("activeprojects").notNull().default(0),
  // Task metrics
  totaltasks: integer("totaltasks").notNull().default(0),
  completedtasks: integer("completedtasks").notNull().default(0),
  // Time tracking
  totalhourslogged: numeric("totalhourslogged", { precision: 10, scale: 2 }).default("0"),
  // Engagement
  lastactivityat: timestamp("lastactivityat"),
  // Health score (0-100, calculated)
  healthscore: integer("healthscore").default(50),
  // Revenue
  mrr: numeric("mrr", { precision: 10, scale: 2 }).default("0"), // Monthly recurring revenue
  // Metadata
  calculatedat: timestamp("calculatedat").defaultNow().notNull(),
  calculationjobid: uuid("calculationjobid"), // Reference to background job
});

export type CompanyAnalytics = typeof companyAnalytics.$inferSelect;
export type NewCompanyAnalytics = typeof companyAnalytics.$inferInsert;
```

**Update Strategy**:
- **Real-time**: Update on significant events (user login, project creation)
- **Nightly**: Full recalculation via background job
- **On-demand**: Recalculate when SysAdmin views company detail

---

## Indexes and Performance

### Critical Indexes

```sql
-- For system settings lookups
CREATE INDEX idx_system_settings_key ON system_settings(settingkey);
CREATE INDEX idx_system_settings_category ON system_settings(category);

-- For company status history queries
CREATE INDEX idx_company_status_history_company ON company_status_history(companyid, createdat DESC);
CREATE INDEX idx_company_status_history_changedby ON company_status_history(changedby);

-- For company analytics (already has unique on companyid)
CREATE INDEX idx_company_analytics_health ON company_analytics(healthscore DESC) 
  WHERE healthscore < 30; -- For finding at-risk companies

-- For cross-tenant user searches (existing table, new index)
CREATE INDEX idx_userprofiles_usertype ON userprofiles(usertype) 
  WHERE usertype = 'SYSADMIN';
```

---

## Data Integrity

### Constraints
- **Foreign Keys**: All relationships use proper ON DELETE actions
- **Check Constraints**: Health score 0-100, positive counts
- **Not Null**: Required fields enforced at database level

### Validation Rules
- **System Settings**: JSON schema validation in application layer
- **Status Transitions**: Valid transitions enforced in service layer
  - `pending` → `trial`, `active`, `suspended`
  - `trial` → `active`, `cancelled`, `suspended`
  - `active` → `suspended`, `cancelled`
  - `suspended` → `active`, `cancelled`
  - `cancelled` → `active` (reactivation)
  - `deleted` is terminal state

---

## Migration Script

**File**: `database/migrations/014_sysadmin_tables.sql`

```sql
-- Migration 014: SysAdmin Platform Administration Tables

-- System Settings
CREATE TABLE IF NOT EXISTS system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settingkey VARCHAR(100) NOT NULL UNIQUE,
  settingvalue JSONB NOT NULL,
  category VARCHAR(50) NOT NULL,
  description VARCHAR(500),
  updatedby UUID REFERENCES userprofiles(id) ON DELETE SET NULL,
  updatedat TIMESTAMP NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_system_settings_key ON system_settings(settingkey);
CREATE INDEX idx_system_settings_category ON system_settings(category);

-- Company Status History
CREATE TABLE IF NOT EXISTS company_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  companyid UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL,
  previousstatus VARCHAR(50),
  changedby UUID NOT NULL REFERENCES userprofiles(id) ON DELETE RESTRICT,
  reason VARCHAR(500),
  metadata JSONB,
  createdat TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_company_status_history_company ON company_status_history(companyid, createdat DESC);
CREATE INDEX idx_company_status_history_changedby ON company_status_history(changedby);

-- Company Analytics
CREATE TABLE IF NOT EXISTS company_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  companyid UUID NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  totalusers INTEGER NOT NULL DEFAULT 0,
  activeusers INTEGER NOT NULL DEFAULT 0,
  totalprojects INTEGER NOT NULL DEFAULT 0,
  activeprojects INTEGER NOT NULL DEFAULT 0,
  totaltasks INTEGER NOT NULL DEFAULT 0,
  completedtasks INTEGER NOT NULL DEFAULT 0,
  totalhourslogged NUMERIC(10,2) DEFAULT 0,
  lastactivityat TIMESTAMP,
  healthscore INTEGER DEFAULT 50,
  mrr NUMERIC(10,2) DEFAULT 0,
  calculatedat TIMESTAMP NOT NULL DEFAULT NOW(),
  calculationjobid UUID
);

CREATE INDEX idx_company_analytics_health ON company_analytics(healthscore DESC) 
  WHERE healthscore < 30;

-- Add comment to document usertype enum values
COMMENT ON COLUMN userprofiles.usertype IS 'User role: TEAM_MEMBER, TEAM_MANAGER, ADMIN, or SYSADMIN';

-- Insert default system settings
INSERT INTO system_settings (settingkey, settingvalue, category, description) VALUES
('billing.free_tier_enabled', 'true', 'billing', 'Whether free tier subscriptions are available'),
('billing.free_user_limit', '5', 'billing', 'Maximum users allowed in free tier'),
('features.beta_enabled', 'false', 'features', 'Enable beta features for all companies'),
('security.mfa_required_sysadmin', 'true', 'security', 'Require MFA for SysAdmin users'),
('platform.maintenance_mode', 'false', 'platform', 'Platform-wide maintenance mode');

-- Migration complete
```

---

## Query Patterns

### 1. Get All Companies with Status (for SysAdmin list)
```typescript
const companies = await db
  .select({
    company: companies,
    status: companyStatusHistory.status,
    analytics: {
      totalusers: companyAnalytics.totalusers,
      healthscore: companyAnalytics.healthscore,
    },
  })
  .from(companies)
  .leftJoin(
    companyStatusHistory,
    eq(companyStatusHistory.companyid, companies.id)
  )
  .leftJoin(
    companyAnalytics,
    eq(companyAnalytics.companyid, companies.id)
  )
  .where(eq(companyStatusHistory.status, 'ACTIVE'))
  .orderBy(desc(companies.createdat))
  .limit(50);
```

### 2. Get Global User Search
```typescript
const users = await db
  .select({
    user: userprofiles,
    company: companies.companyname,
  })
  .from(userprofiles)
  .innerJoin(companies, eq(userprofiles.companyid, companies.id))
  .where(
    or(
      ilike(userprofiles.emailaddr, `%${search}%`),
      ilike(userprofiles.fullname, `%${search}%`)
    )
  )
  .limit(20);
```

### 3. Update Company Status with Audit
```typescript
// Transaction: update company + create history record
await db.transaction(async (tx) => {
  // Update company status
  await tx
    .update(companies)
    .set({ status: newStatus })
    .where(eq(companies.id, companyId));
  
  // Create audit record
  await tx.insert(companyStatusHistory).values({
    companyid: companyId,
    status: newStatus,
    previousstatus: currentStatus,
    changedby: sysAdminId,
    reason: reason,
  });
});
```

---

*This data model was generated as part of the wxAI pipeline Phase 3: Plan*
