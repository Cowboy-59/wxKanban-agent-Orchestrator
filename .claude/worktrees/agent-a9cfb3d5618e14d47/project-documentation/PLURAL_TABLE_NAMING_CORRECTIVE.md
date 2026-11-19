# Database Naming Correction: Singular → Plural Tables

**Date**: 2026-02-17
**Status**: 🔄 In Progress (Documentation Updated, Schema Updates Pending)
**Impact**: All database tables must be renamed to use plural form per constitution requirement

---

## Executive Summary

The wxKanban database schema was previously created with **singular** table names (e.g., `user`, `project`, `task`). However, the project constitution mandates **plural** table names (e.g., `users`, `projects`, `tasks`). This document outlines the corrective changes and provides the complete table mapping for implementation.

---

## Why This Change

### Constitution Requirement

The project constitution (`.claude/rules/constitution.md`) Section V explicitly states:

```
| Tables       | Plural (`users` not `user`, `projects` not `project`) |
```

This requirement ensures consistency with:
- Industry best practices for database naming
- Readability (tables represent collections of entities)
- All other wxKanban tables (users, companies, projects, tasks, etc.)

### Previous Error

Initial implementation misinterpreted the constitution due to confusing wording. The constitution example "`Singular ('users' not 'user')`" was meant to indicate use the plural form `users` (which is the singular noun in plural form), not the singular form `user`.

---

## Complete Table Mapping

All 18 tables must be renamed from singular to plural form:

| Current Name (Singular)   | New Name (Plural)           | Entity Count |
|---------------------------|-----------------------------|--------------|
| `user`                    | `users`                     | 1            |
| `session`                 | `sessions`                  | 2            |
| `company`                 | `companies`                 | 3            |
| `project`                 | `projects`                  | 4            |
| `projectuser`             | `projectusers`              | 5            |
| `pmsystemconnection`      | `pmsystemconnections`       | 6            |
| `task`                    | `tasks`                     | 7            |
| `timeentry`               | `timeentries`               | 8            |
| `invoice`                 | `invoices`                  | 9            |
| `specification`           | `specifications`            | 10           |
| `projectphase`            | `projectphases`             | 11           |
| `testplan`                | `testplans`                 | 12           |
| `feedback`                | `feedbacks`                 | 13           |
| `note`                    | `notes`                     | 14           |
| `companyauditlog`         | `companyauditlogs`          | 15           |
| `userinvitation`          | `userinvitations`           | 16           |
| `invitationbatch`         | `invitationbatches`         | 17           |
| `invitationdlq`           | `invitationdlqs`            | 18           |

---

## Database Migration SQL

Run the following SQL commands in your PostgreSQL database to rename all tables:

```sql
-- Rename all tables from singular to plural
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

## Code Changes Required (Pending)

The following code changes are required to align with plural table names:

### 1. Schema File Exports (`src/db/schema/index.ts`)
**Status**: 🔄 Pending
- Update all imports to use plural constant names
- Update all exports to reference plural table names
- Example: `export const users = pgTable("users", { ... })`

### 2. Drizzle ORM Schema Definitions (`src/db/schema/*.ts`)
**Status**: 🔄 Pending
- Update all `pgTable()` calls to use plural table names
- Update all type exports (e.g., `typeof users.$inferSelect`)
- Example:
  ```typescript
  export const users = pgTable("users", {
    id: uuid("id").primaryKey().defaultRandom(),
    // ...
  });
  export type User = typeof users.$inferSelect;
  ```

### 3. TypeScript Imports (40+ files)
**Status**: 🔄 Pending
- Update all imports in service files to reference plural constants
- Files affected:
  - `src/server/services/*.ts` - All service files
  - `src/server/routes/*.ts` - All route handlers
  - `src/server/middleware/*.ts` - Middleware
  - Any other files importing schema constants

### 4. Drizzle Queries
**Status**: 🔄 Pending
- Update all `db.select().from(user)` to `db.select().from(users)`
- Update all `db.insert(user)` to `db.insert(users)`
- All Drizzle query builders must reference plural table constants

### 5. Schema Testing (`tests/schema/naming-conventions.test.ts`)
**Status**: 🔄 Pending
- Update test suite to validate plural table naming
- Change expected table names array to plural form
- Verify all tests pass after schema changes

---

## Documentation Updates Completed

✅ **`.claude/rules/constitution.md`** - Clarified plural naming requirement
✅ **`CLAUDE.md`** - Updated all table naming examples to plural form
✅ **`CONTRIBUTING.md`** - Updated database coding standards to specify plural tables

---

## Implementation Strategy

### Phase 1: Database Migration
**Responsibility**: Manual execution by developer
```bash
# Connect to PostgreSQL database
psql $DATABASE_URL

# Run the SQL rename commands above
```

### Phase 2: Schema Files (Pending)
**Responsibility**: Automated code updates
- Update `src/db/schema/*.ts` files to use plural table names
- Update TypeScript type exports
- Update `src/db/schema/index.ts` exports

### Phase 3: Service & Route Updates (Pending)
**Responsibility**: Automated code updates
- Search and replace all service file imports
- Update all Drizzle ORM query references
- Verify no remaining singular table references

### Phase 4: Testing (Pending)
**Responsibility**: Automated test updates
- Update schema naming convention tests
- Run test suite: `npm run test -- tests/schema/naming-conventions.test.ts`
- Verify all tests pass

### Phase 5: Verification (Pending)
**Responsibility**: Development server testing
- Start dev servers: `npm run dev:server` and `npm run dev:client`
- Verify no TypeScript compilation errors
- Test basic API functionality

---

## Rollback Instructions

If needed, the change can be reversed by renaming tables back to singular form. However, this is NOT recommended as it violates the project constitution.

---

## Related Documentation

- **Constitution**: `.claude/rules/constitution.md` - Section V. Database & Naming
- **CLAUDE.md**: Database Conventions section (updated)
- **CONTRIBUTING.md**: Database section (updated)
- **DATABASE_SCHEMA.md**: Complete table reference (requires update with plural names)

---

## Next Steps

1. **Execute Database Migration** (Manual SQL execution by developer)
   - Connect to PostgreSQL
   - Run the 18 ALTER TABLE commands above
   - Verify all tables renamed successfully

2. **Update Schema Files** (Automated code changes)
   - Update `src/db/schema/*.ts` to use plural table names
   - Update exports in `src/db/schema/index.ts`
   - Run TypeScript type checking

3. **Update Service & Route Files** (Automated code changes)
   - Replace all singular table constants with plural references
   - Update all Drizzle query references
   - Run full TypeScript type checking

4. **Update Test Suite** (Automated code changes)
   - Update naming convention tests
   - Run test suite
   - Verify all tests pass

5. **Final Verification** (Development testing)
   - Start development servers
   - Test basic functionality
   - Verify no compilation or runtime errors

---

## Questions?

Refer to:
- `.claude/rules/constitution.md` for naming requirements
- `CLAUDE.md` for database conventions
- `CONTRIBUTING.md` for coding standards
- This document for the complete table mapping and SQL migration commands
