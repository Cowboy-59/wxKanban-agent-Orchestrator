# Database Naming Correction Status Report

**Date**: 2026-02-17
**Prepared For**: Manual database migration + pending code updates
**Status**: Documentation Complete ✅ | Database Updates Pending 🔄 | Code Updates Pending 🔄

---

## Summary

The wxKanban database schema requires a naming convention correction from **singular** to **plural** table names to comply with the project constitution. All documentation and rules have been updated. The database and code changes are pending implementation.

---

## What's Been Completed ✅

### 1. Documentation Updates
- ✅ `.claude/rules/constitution.md` - Clarified plural naming requirement (Section V)
- ✅ `CLAUDE.md` - Updated Database Conventions section with plural examples
- ✅ `CONTRIBUTING.md` - Updated database standards to require plural tables
- ✅ `project-documentation/PLURAL_TABLE_NAMING_CORRECTIVE.md` - Comprehensive migration guide with SQL commands

### 2. Complete Table Mapping
All 18 tables with current → target names (provided at conversation start)

### 3. SQL Migration Commands
Ready-to-execute ALTER TABLE commands for all 18 table renames (in PLURAL_TABLE_NAMING_CORRECTIVE.md)

---

## What's Pending 🔄

### Phase 1: Database Migration (Your Responsibility)
**Status**: Ready to execute
**Action**: Connect to PostgreSQL and run the 18 ALTER TABLE commands from:
- `project-documentation/PLURAL_TABLE_NAMING_CORRECTIVE.md`

**Command**:
```bash
psql $DATABASE_URL

-- Then run all 18 ALTER TABLE commands
ALTER TABLE "user" RENAME TO "userprofiles";
ALTER TABLE "session" RENAME TO "sessions";
-- ... etc (see complete list in corrective document)
```

### Phase 2: Update Schema Files (Automated Code Changes)
**Files to Update**: 18 files in `src/db/schema/`
**Changes Required**:
- Update `pgTable()` calls from singular to plural
- Update TypeScript type exports
- Update `src/db/schema/index.ts` exports

**Example**:
```typescript

```

### Phase 3: Update Service & Route Files (Automated Code Changes)
**Files Affected**: 40+ files
**Pattern**: Replace all imports and references
```typescript
// BEFORE
import { user, task, project } from "~/db/schema";
db.select().from(user)

// AFTER
import { users, tasks, projects } from "~/db/schema";
db.select().from(users)
```

### Phase 4: Update Test Suite (Automated Code Changes)
**File**: `tests/schema/naming-conventions.test.ts`
**Changes**: Update expected table names array to plural form

### Phase 5: Verification
**Steps**:
1. Type checking: `npm run check-types`
2. Start dev servers: `npm run dev:server` & `npm run dev:client`
3. Basic functionality testing

---

## Key References

| Document | Purpose | Status |
|----------|---------|--------|
| `.claude/rules/constitution.md` | Authoritative naming rules | ✅ Updated |
| `CLAUDE.md` | Implementation guide | ✅ Updated |
| `CONTRIBUTING.md` | Developer standards | ✅ Updated |
| `PLURAL_TABLE_NAMING_CORRECTIVE.md` | Migration guide | ✅ Created |
| `project-documentation/DATABASE_SCHEMA.md` | Table reference | 🔄 Needs plural update |

---

## Database Migration SQL

**Location**: `project-documentation/PLURAL_TABLE_NAMING_CORRECTIVE.md`

**Quick Reference** (all 18 commands):
```sql
ALTER TABLE "user" RENAME TO "users";
ALTER TABLE "session" RENAME TO "sessions";
ALTER TABLE "company" RENAME TO "companies";
ALTER TABLE "project" RENAME TO "projects";
ALTER TABLE "projectuser" RENAME TO "projectusers";
ALTER TABLE "pmsystemconnection" RENAME TO "pmsystemconnections";
ALTER TABLE "task" RENAME TO "tasks";
ALTER TABLE "timeentry" RENAME TO "timeentries";
ALTER TABLE "invoice" RENAME TO "invoices";
ALTER TABLE "specification" RENAME TO "specifications";
ALTER TABLE "projectphase" RENAME TO "projectphases";
ALTER TABLE "testplan" RENAME TO "testplans";
ALTER TABLE "feedback" RENAME TO "feedbacks";
ALTER TABLE "note" RENAME TO "notes";
ALTER TABLE "companyauditlog" RENAME TO "companyauditlogs";
ALTER TABLE "userinvitation" RENAME TO "userinvitations";
ALTER TABLE "invitationbatch" RENAME TO "invitationbatches";
ALTER TABLE "invitationdlq" RENAME TO "invitationdlqs";
```

---

## Next Immediate Step

**For You**: Execute the database migration by connecting to PostgreSQL and running the 18 ALTER TABLE commands above. Once the database tables are renamed, I can proceed with the remaining code updates (Phases 2-5).

**For Me** (After Database Changes):
1. Update all 18 schema files in `src/db/schema/`
2. Update all service and route file imports
3. Update test suite
4. Verify through TypeScript compilation and dev server tests

---

## Questions?

- **SQL Migration Help**: See `project-documentation/PLURAL_TABLE_NAMING_CORRECTIVE.md` for detailed instructions
- **Database Naming Rationale**: See `.claude/rules/constitution.md` Section V
- **Implementation Guidelines**: See `CLAUDE.md` or `CONTRIBUTING.md`
