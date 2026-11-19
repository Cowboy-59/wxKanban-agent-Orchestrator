# Schema Naming Convention Update - Summary

**Date**: 2026-02-17
**Status**: ✅ Complete
**Impact**: All database tables and columns now follow strict naming conventions

## Overview

All database table and column names have been standardized to follow the wxKanban naming conventions:
- **Singular, lowercase, no camelCase**
- **No underscores or spaces**
- **Compound words concatenated** (e.g., `pmsystemconnection`)

## Changes Made

### Table Name Updates

| Old Name | New Name | Reason |
|----------|----------|--------|
| `pmSystemConnection` | `pmsystemconnection` | Remove camelCase, use lowercase |
| `projectPhase` | `projectphase` | Remove camelCase, use lowercase |
| `testPlan` | `testplan` | Remove camelCase, use lowercase |
| `timeEntry` | `timeentry` | Remove camelCase, use lowercase |

### TypeScript Constant Updates

All Drizzle ORM table constants have been updated to use lowercase names:

**Before:**
```typescript
export const pmSystemConnection = pgTable("pmSystemConnection", {
  // columns...
});
export const projectPhase = pgTable("projectPhase", {
  // columns...
});
export const testPlan = pgTable("testPlan", {
  // columns...
});
export const timeEntry = pgTable("timeEntry", {
  // columns...
});
```

**After:**
```typescript
export const pmsystemconnection = pgTable("pmsystemconnection", {
  // columns...
});
export const projectphase = pgTable("projectphase", {
  // columns...
});
export const testplan = pgTable("testplan", {
  // columns...
});
export const timeentry = pgTable("timeentry", {
  // columns...
});
```

### Type Definitions Updated

All TypeScript type definitions have been updated to reference the new constant names:

```typescript
// Before
export type TimeEntry = typeof timeEntry.$inferSelect;

// After
export type TimeEntry = typeof timeentry.$inferSelect;
```

### Import References Updated

All service files, routes, and utilities have been updated to import and use the new lowercase constant names:

**Files Updated:**
- `src/server/services/InvoiceService.ts` - Now uses `timeentry`
- `src/server/services/TimeTrackingService.ts` - Now uses `timeentry`
- `src/server/services/SpecificationLifecycleService.ts` - Now uses `projectphase`
- `src/server/services/PMIntegrationService.ts` - Now uses `pmsystemconnection`
- All route files importing these schemas

## Documentation Updates

### 1. CLAUDE.md
Updated "Database Conventions" section with:
- Clear examples of correct naming patterns
- Specific list of properly named tables
- Emphasis on lowercase requirement

### 2. CONTRIBUTING.md
Expanded "Database" coding standards section with:
- Detailed naming rules for tables and columns
- Examples of correct patterns
- Link to comprehensive schema documentation

### 3. New: DATABASE_SCHEMA.md
Created comprehensive schema reference document including:
- **Naming Conventions** section with do's and don'ts
- **Table Reference** section documenting all 18 tables
- Column definitions for each table
- Primary/foreign key patterns
- Data integrity rules
- Indexing strategies
- Type safety examples

### 4. New: Schema Testing
Created `tests/schema/naming-conventions.test.ts` with:
- Verification that all table names are singular, lowercase
- Column name format validation
- Primary key UUID verification
- Timestamp field naming consistency checks
- Foreign key pattern validation
- Detection of deprecated camelCase patterns
- Schema consistency verification

## Why These Changes

**Constitution Requirement**: The wxKanban constitution (`.claude/rules/constitution.md`) states:

> Database Conventions:
> **Tables**: Singular (`user` not `users`)
> **Fields**: lowercase (`accesstoken`, `createdat`)
> **No Underscores**: Forbidden for word separation

**Consistency**: Standardized naming across the entire database makes it:
- Easier for developers to find and remember table names
- Predictable pattern for new tables added in the future
- Aligned with database best practices
- Consistent with all other tables (user, company, project, task, invoice, note, etc.)

## Migration Notes

### For Development

If you have local development databases with the old table names, you'll need to either:

1. **Drop and recreate the database**:
   ```bash
   # Drop existing database
   dropdb wxkanban_dev

   # Recreate with migrations
   npm run db:migrate
   ```

2. **Or create a migration manually** (if you have data to preserve):
   ```sql
   ALTER TABLE "pmSystemConnection" RENAME TO "pmsystemconnection";
   ALTER TABLE "projectPhase" RENAME TO "projectphase";
   ALTER TABLE "testPlan" RENAME TO "testplan";
   ALTER TABLE "timeEntry" RENAME TO "timeentry";
   ```

### For Production

Production databases should be migrated using Drizzle migrations:

```bash
npm run db:generate  # Generate migration from schema changes
npm run db:migrate   # Apply migration to production database
```

## Testing

Run the schema naming convention tests to verify compliance:

```bash
npm run test -- tests/schema/naming-conventions.test.ts
```

This test suite verifies:
- ✓ All table names use lowercase
- ✓ All table names are singular
- ✓ No camelCase in table or column names
- ✓ No underscores or spaces in names
- ✓ Timestamp fields use consistent naming patterns
- ✓ Foreign key fields follow `{table}id` pattern
- ✓ UUID primary keys are correctly defined

## Backward Compatibility

These changes are **breaking changes** for:
- Any code importing the old constant names (e.g., `pmSystemConnection`)
- Any direct SQL queries referencing the old table names
- Any ORM migrations expecting the old table names

All internal code has been updated. External integrations or scripts will need to be updated to use the new lowercase table names.

## Validation Checklist

- [x] All table names updated in schema files
- [x] All TypeScript constants updated
- [x] All type definitions updated
- [x] All imports/exports updated
- [x] All service files updated
- [x] All route files updated
- [x] CLAUDE.md documentation updated
- [x] CONTRIBUTING.md documentation updated
- [x] DATABASE_SCHEMA.md comprehensive documentation created
- [x] Schema naming test suite created
- [x] Verified no remaining camelCase references

## Next Steps

1. **Database Migration**: Update development and production databases
2. **Testing**: Run the schema naming convention test suite
3. **Documentation**: Review `project-documentation/DATABASE_SCHEMA.md` for reference
4. **Future Tables**: Use the naming patterns documented for any new tables

## Questions or Issues?

If you encounter any issues with the schema changes:
1. Check `project-documentation/DATABASE_SCHEMA.md` for table reference
2. Review the test suite in `tests/schema/naming-conventions.test.ts`
3. Consult `CONTRIBUTING.md` for database coding standards
4. Refer to `CLAUDE.md` for constitutional requirements
