# Phase 1: Data Model — Team Assignments & Duties Management

**Feature**: 004-team-assignments | **Date**: 2026-02-15 | **Status**: Complete

---

## Entity Relationship Diagram

```
┌──────────────────┐        ┌─────────────────────┐
│  subscription    │        │    project          │
│  (existing)      │────┬──→│  (existing)         │
└──────────────────┘    │   └─────────────────────┘
                        │            │
                        │            │
        ┌───────────────┼────────────┴────────────┐
        │               │                         │
        ▼               ▼                         ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ subscriptionduty │  │ teamprojectduty  │  │  user (existing) │
│ (new)            │  │ (new)            │  │                  │
└──────────────────┘  └──────────────────┘  └──────────────────┘
                               │                     │
                               │                     │
                               ▼                     ▼
                       ┌──────────────────┐  ┌──────────────────┐
                       │ dutyassignment   │  │                  │
                       │ (new)            │─→│  (same user)     │
                       └──────────────────┘  └──────────────────┘
                               │
                               │
                               ▼
                       ┌──────────────────┐
                       │complianceoverride│
                       │ (new)            │
                       └──────────────────┘
```

---

## Entity Definitions

### 1. SubscriptionDutyType (NEW TABLE)

**Purpose**: Stores custom duty types per subscription at admin level.

**Table**: `subscriptiondutytype`

| Field | Type | Constraints | Notes |
|-------|------|-----------|-------|
| `subscriptiondutytypeid` | UUID v7 | PK, auto | Unique identifier for duty type definition |
| `subscriptionid` | UUID v7 | FK → subscription, NOT NULL | Links to subscription |
| `dutyname` | text | NOT NULL, UNIQUE per subscription | Name of duty (e.g., 'Developer', 'QA') |
| `allowedfor` | text | NOT NULL | Security standards: 'SOC2', 'HITRUST', or 'BOTH' |
| `isdefault` | boolean | DEFAULT false | True if provided by wxKanban defaults |
| `createdat` | timestamp | DEFAULT now() | Creation timestamp |
| `updatedat` | timestamp | DEFAULT now() | Last update timestamp |

**Indexes**:
- `(subscriptionid, dutyname)` - UNIQUE, for lookup by name per subscription
- `(subscriptionid)` - for listing duties by subscription
- `(isdefault)` - for filtering defaults

**Validation Rules**:
- `dutyname` must be 2-50 characters, alphanumeric + spaces
- `allowedfor` must be one of: 'SOC2', 'HITRUST', 'BOTH'
- Cannot delete default duty types (can only be added/removed via policy)

---

### 2. TeamProjectDuty (NEW TABLE)

**Purpose**: Maps duty types available to a specific project; copies from subscription defaults at project creation.

**Table**: `teamprojectduty`

| Field | Type | Constraints | Notes |
|-------|------|-----------|-------|
| `teamprojectdutyid` | UUID v7 | PK, auto | Unique duty assignment on project |
| `projectid` | UUID v7 | FK → project, NOT NULL | Links to project |
| `dutyname` | text | NOT NULL | Duty name (e.g., 'Developer') |
| `sequence` | integer | NOT NULL | Order in workflow (0=first, 6=last) |
| `isavailable` | boolean | DEFAULT true | Can this duty be assigned? (disabled by admin) |
| `issystemdefault` | boolean | DEFAULT true | Is this a wxKanban default duty? |
| `createdat` | timestamp | DEFAULT now() | When added to project |
| `updatedat` | timestamp | DEFAULT now() | When last modified |

**Indexes**:
- `(projectid, sequence)` - for retrieving duty workflow sequence
- `(projectid, dutyname)` - UNIQUE, for lookup by name on project
- `(projectid)` - for listing all duties on project

**Validation Rules**:
- `sequence` must be 0-6 for standard duties (7+ for custom)
- Sequence must be unique per project
- Cannot delete all duties from project (minimum 1 required)
- Subscription duty changes apply to all existing projects (propagation logic)

**State Transitions**:
- Created when project is created (copies from subscription defaults)
- Modified when admin changes subscription duty types
- Disabled (isavailable=false) when admin removes duty, but record kept for history

---

### 3. DutyAssignment (NEW TABLE)

**Purpose**: Links team members to specific duties they can perform on a project.

**Table**: `dutyassignment`

| Field | Type | Constraints | Notes |
|-------|------|-----------|-------|
| `dutyassignmentid` | UUID v7 | PK, auto | Unique assignment record |
| `projectid` | UUID v7 | FK → project, NOT NULL | Project context |
| `userid` | UUID v7 | FK → user, NOT NULL | Team member being assigned |
| `teamprojectdutyid` | UUID v7 | FK → teamprojectduty, NOT NULL | Specific duty on this project |
| `assignedby` | UUID v7 | FK → user, NOT NULL | User who made assignment (Team Manager) |
| `createdat` | timestamp | DEFAULT now() | Assignment creation time |

**Indexes**:
- `(projectid, userid)` - for listing all duties assigned to a user
- `(projectid, teamprojectdutyid)` - for listing team members with a duty
- `(userid, projectid)` - for user's project duties
- `(assignedby)` - for audit trail (who assigned)

**Validation Rules**:
- A user can have multiple duties on same project (e.g., Dev + Team Manager)
- Cannot assign same duty twice to same user on same project (UNIQUE constraint)
- User must have an account and project membership
- Assignment must pass compliance validation (no silent violations)
- If validation fails, ComplianceOverride must exist

**Cascade Behavior**:
- Delete on project deletion
- Soft-delete on user removal from project (keep for audit)

---

### 4. ComplianceOverride (NEW TABLE)

**Purpose**: Audit trail for compliance rule violations that were explicitly overridden with justification.

**Table**: `complianceoverride`

| Field | Type | Constraints | Notes |
|-------|------|-----------|-------|
| `complianceoverrideid` | UUID v7 | PK, auto | Unique override record |
| `projectid` | UUID v7 | FK → project, NOT NULL | Project context |
| `userid` | UUID v7 | FK → user, NOT NULL | Team member whose assignment violated rules |
| `teamprojectdutyid` | UUID v7 | FK → teamprojectduty, NOT NULL | Duty being assigned despite violation |
| `securitystandard` | text | NOT NULL | 'SOC2' or 'HITRUST' |
| `violatedrules` | text | NOT NULL | Comma-separated rule identifiers |
| `overriddenby` | UUID v7 | FK → user, NOT NULL | Team Manager who approved override |
| `reason` | text | NOT NULL | Documented business justification (min 50 chars) |
| `createdat` | timestamp | DEFAULT now() | Override approval time |

**Indexes**:
- `(projectid)` - for compliance audits per project
- `(userid)` - for per-user compliance history
- `(overriddenby)` - for per-approver audit trail
- `(securitystandard)` - for compliance reporting
- `(createdat)` - for date range queries

**Validation Rules**:
- `reason` must be >= 50 characters (business-meaningful justification)
- `violatedrules` must reference actual compliance rule IDs
- Only Team Managers can create overrides (permission checked at API layer)
- Records are immutable (never updated or deleted — audit only)

**Notes**:
- Every DutyAssignment that violates compliance rules MUST have corresponding ComplianceOverride
- Can be queried to generate compliance reports
- Retention: Keep permanently (no deletion for compliance records)

---

### 5. Updated/Extended Tables

#### Project (EXISTING, ADD FIELD)
```typescript
// Add field to existing project table:
securityclassification: 'SOC2' | 'HITRUST' | null
```
**Purpose**: Determines which compliance rules apply to this project.
**Impact**: Set at project creation; determines which duties are available.

#### Task (EXISTING, ADD FIELD)
```typescript
// Add field to existing task table (if not exists):
assignedduty: text | null  // Current duty executing this task
nextduty: text | null      // Suggested next duty in sequence
```
**Purpose**: Tracks which duty is currently assigned to execute task; enables workflow routing.

#### User (EXISTING, NO CHANGE)
```typescript
// Existing user table — no changes needed
// Clerk provides role information (TeamManager, ProjectOwner, etc.)
```

---

## Validation Rules Summary

### At DutyAssignment Creation

1. **User must be project member**: `user.id` must have active project membership
2. **Duty must exist on project**: `teamprojectdutyid` must reference valid project duty
3. **Duty must be available**: `isavailable = true` on the teamprojectduty
4. **Compliance validation**:
   - Check all existing duties for this user on this project
   - Validate proposed new duty against SOC 2/HiTrust rules
   - If violation: Require ComplianceOverride with reason
   - If compliant: Allow creation without override
5. **Permission check**: Only Team Managers/Admins can create (not individual users)

### At Subscription Duty Type Change (Add/Remove)

1. **Propagation to projects**:
   - New duty added → Add to all projects with matching security standard
   - Duty removed → Mark `isavailable = false` on all projects (keep for history)
2. **Impact on existing assignments**:
   - Removed duty → All assignments with that duty become invalid
   - Notification to project admins required (out of scope for Phase 1)

### At Task Completion (Routing)

1. **Get current duty**: Look up `task.assignedduty`
2. **Find next in sequence**: Use DUTY_SEQUENCE_ORDER enum
3. **Query team members**: Get users with that duty on the project
4. **Routing decision**:
   - 0 members: Error — must assign first
   - 1 member: Auto-assign
   - 2+ members: Return prompt options to UI

---

## Relationships & Referential Integrity

```
SubscriptionDutyType ──┐
                       ├─→ TeamProjectDuty (created from subscription defaults)
                       │
Project ────────────→ TeamProjectDuty ──→ DutyAssignment ──→ ComplianceOverride
                                              ↓
                                            User (team member)
```

**Cascade Rules**:
- Delete Project → Delete all TeamProjectDuty, DutyAssignment, ComplianceOverride
- Delete User → Soft-delete DutyAssignment (keep for audit), clear assignments
- Delete SubscriptionDutyType → No cascade; only affects new projects

**Constraints**:
- Foreign key integrity enforced at database level
- Application code validates additional business rules

---

## Migration Strategy

**Phases**:
1. Create 4 new tables (subscriptiondutytype, teamprojectduty, dutyassignment, complianceoverride)
2. Add fields to project table (securityclassification)
3. Add fields to task table (assignedduty, nextduty)
4. Create indexes for performance
5. Seed default duties into subscriptiondutytype for existing subscriptions

**Database Generation Command**:
```bash
npm run db:generate  # Creates migration files
npm run db:migrate   # Applies to dev database
```

---

## Key Design Decisions

| Decision | Rationale | Impact |
|----------|-----------|--------|
| **Separate subscription + project duty tables** | Subscription defaults can change; projects need independent snapshot | Slight data redundancy but clean separation |
| **Immutable ComplianceOverride** | Audit trail cannot be modified or deleted; compliance requirement | Cannot fix mistakes retroactively; must document carefully |
| **Sequence as integer field** | Simplifies ordering; supports gaps for future duties | Limited to ~100 duties per project (plenty) |
| **isavailable flag instead of delete** | Maintains historical records; cleaner than cascade deletes | Adds filtering complexity but better for audit |
| **Multiple indexes on projectid** | Frequent queries by project (listing, filtering, routing) | Slight write overhead but critical for read performance |

---

## Next Steps

1. ✅ Data model designed and documented
2. Generate API contracts (OpenAPI) specifying endpoints and schemas
3. Generate quickstart.md with integration test scenarios
4. Update CLAUDE.md with implementation context
5. Ready for Phase 2 task generation

---

*Based on wxKanban database conventions (Constitution v1.2.0)*
