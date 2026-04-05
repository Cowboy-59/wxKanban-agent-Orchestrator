---
description: Implementation command with mandatory database verification gate
args: "{{args}}"
ai-compat: universal
claude-code: true
cursor: true
blackboxai: true
---

# wxAI-implement with Database Verification Gate

## ⚠️ IMPLEMENTATION BLOCKED WITHOUT DATABASE INSERTION

**This command CANNOT and WILL NOT proceed with implementation until database verification passes.**

---

## Pre-Implementation Verification (MANDATORY)

Before ANY implementation work begins, the following MUST be verified:

### 1. Database Presence Check

Query the database to confirm spec exists:

```sql
SELECT 
    s.specnumber,
    s.title,
    s.status,
    COUNT(t.id) as task_count,
    COUNT(pd.id) as doc_count
FROM specs s
LEFT JOIN tasks t ON t.spec_number = s.specnumber
LEFT JOIN projectdocuments pd ON pd.specnumber = s.specnumber
WHERE s.specnumber = '<NNN>'
GROUP BY s.specnumber, s.title, s.status;
```

**Required Results:**
- `specnumber`: Must exist (not null)
- `status`: Must be 'tasks_generated', 'in_progress', or 'ready_for_implementation'
- `task_count`: Must be > 0 (tasks imported)
- `doc_count`: Must be >= 4 (spec, plan, tasks, quickstart minimum)

### 2. Task Verification Check

```sql
SELECT 
    taskid,
    title,
    status,
    priority
FROM tasks 
WHERE spec_number = '<NNN>'
ORDER BY priority, taskid;
```

**Required Results:**
- At least one P1 (Priority 1) task exists
- No duplicate task IDs
- All tasks have valid status ('pending', 'in_progress', 'completed')

### 3. Document Verification Check

```sql
SELECT 
    title,
    documenttype,
    contenthash
FROM projectdocuments
WHERE specnumber = '<NNN>'
ORDER BY documenttype;
```

**Required Documents:**
- `spec.md` or `specification` type
- `plan.md` or `plan` type  
- `tasks.md` or `tasks` type
- `quickstart.md` or `quickstart` type

---

## Implementation Gate Logic

```typescript
// Pseudo-code for implementation gate
function canImplement(specNumber: string): boolean {
    // 1. Check spec exists in database
    const spec = db.query(`SELECT * FROM specs WHERE specnumber = '${specNumber}'`);
    if (!spec) {
        throw new Error(`IMPLEMENTATION BLOCKED: Spec ${specNumber} not found in database. Run Phase 4.5 (Task Push) first.`);
    }
    
    // 2. Check tasks exist
    const taskCount = db.query(`SELECT COUNT(*) FROM tasks WHERE spec_number = '${specNumber}'`);
    if (taskCount === 0) {
        throw new Error(`IMPLEMENTATION BLOCKED: No tasks found for spec ${specNumber}. Run Phase 4.5 (Task Push) first.`);
    }
    
    // 3. Check documents exist
    const docCount = db.query(`SELECT COUNT(*) FROM projectdocuments WHERE specnumber = '${specNumber}'`);
    if (docCount < 4) {
        throw new Error(`IMPLEMENTATION BLOCKED: Only ${docCount} documents found. Minimum 4 required (spec, plan, tasks, quickstart). Run Phase 4.5 (Task Push) first.`);
    }
    
    // 4. Check spec status
    if (!['tasks_generated', 'in_progress', 'ready_for_implementation'].includes(spec.status)) {
        throw new Error(`IMPLEMENTATION BLOCKED: Spec status is '${spec.status}'. Must be 'tasks_generated', 'in_progress', or 'ready_for_implementation'.`);
    }
    
    return true;
}
```

---

## Error Messages (Non-Negotiable)

If database verification fails, output EXACTLY:

```
===================================================
⛔ IMPLEMENTATION BLOCKED - DATABASE VERIFICATION FAILED
===================================================

Spec Number: <NNN>

FAILED CHECKS:
  ❌ <Check 1 description>
  ❌ <Check 2 description>
  ...

REQUIRED ACTIONS:
  1. Complete the wxAI pipeline through Phase 4.5 (Task Push)
  2. Verify database insertion with:
     wxk_scope_import --spec <NNN> --dry-run false
     wxk_doc_import --spec <NNN> --dry-run false
  3. Re-run verification query:
     SELECT * FROM specs WHERE specnumber = '<NNN>';
  4. Once verified, retry implementation

DO NOT proceed with implementation until database verification passes.
The pipeline is INCOMPLETE without database insertion.

Reference: _wxAI/commands/wxAI-pipeline-mandatory-database.md
===================================================
```

---

## Implementation Command Structure

```
/wxAI-implement <spec-number> [options]

Options:
  --force                    Bypass verification (requires --reason)
  --reason "<explanation>"   Required with --force, documented in audit log
  --skip-tests               Skip test execution after implementation
  --dry-run                  Show what would be implemented without executing

Examples:
  /wxAI-implement 014
  /wxAI-implement 014 --dry-run
  /wxAI-implement 014 --force --reason "Emergency hotfix, pipeline docs already exist"
```

---

## Force Override (Emergency Only)

The `--force` flag can bypass verification in emergencies, but requires:

1. **Explicit user request** with `--force` flag
2. **Documented reason** with `--reason` parameter
3. **Audit log entry** recording:
   - Timestamp
   - User who requested force
   - Reason provided
   - Spec number
   - Missing database records

**Force override warning message:**

```
⚠️  FORCE OVERRIDE ACTIVATED ⚠️

This bypasses mandatory database verification.
Reason: <provided reason>
Audit Log: <timestamp> - Force override by <user>

Continuing with implementation in 5 seconds...
```

---

## Post-Implementation Database Update

After successful implementation, MUST update database:

```sql
-- Update spec status
UPDATE specs 
SET status = 'in_progress', 
    updatedat = NOW() 
WHERE specnumber = '<NNN>';

-- Update task statuses based on completion
UPDATE tasks 
SET status = 'completed', 
    completedat = NOW() 
WHERE spec_number = '<NNN>' 
AND taskid IN (<completed-task-ids>);

-- Insert implementation record
INSERT INTO implementation_log (
    specnumber,
    implemented_at,
    implemented_by,
    tasks_completed,
    force_override
) VALUES (
    '<NNN>',
    NOW(),
    '<user>',
    <count>,
    <true/false>
);
```

---

## Verification Commands for Users

Users can verify database status before requesting implementation:

```bash
# Check if spec is ready for implementation
wxai verify --spec <NNN>

# Output:
# Spec 014: SysAdmin Platform Administration
# Status: tasks_generated ✅
# Tasks: 47 in database ✅
# Documents: 8 in database ✅
# Ready for implementation: YES
```

---

## Integration with Other Commands

### /wxAI-qa (Quality Assurance)
- MUST verify database records exist before testing
- Cannot QA a spec that isn't in the database

### /wxAI-audit-run (Compliance Audit)
- Checks for database insertion as compliance requirement
- Missing database records = compliance violation

### /wxAI-lifecycle (Lifecycle Update)
- Reads from database to generate accurate completion percentages
- Cannot update lifecycle without database connection

---

## Summary

**NO IMPLEMENTATION WITHOUT DATABASE INSERTION.**

This is enforced at:
1. **Command entry** - Gate check before any work begins
2. **Verification queries** - SQL validation of database state
3. **Error messages** - Clear blocking with remediation steps
4. **Audit logging** - All bypasses recorded
5. **Post-implementation** - Database updated with progress

The pipeline is **INCOMPLETE** until data is in the database.
