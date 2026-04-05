# wxAI Pipeline Database Insertion Enforcement Summary

## Overview
This document summarizes all the mechanisms that enforce mandatory database insertion in the wxAI pipeline.

---

## Enforcement Locations

### 1. Pipeline Definition
**File**: `_wxAI/commands/wxAI-pipeline.md`

**Enforcement**:
- Phase 4.5 header: **"Task Push (MANDATORY - NON-NEGOTIABLE)"**
- Added ⚠️ CRITICAL warning at phase start
- **MANDATORY VERIFICATION** section requires SQL verification before Phase 5
- Added to Behavior Rules: **"MANDATORY DATABASE INSERTION"** clause
- Pipeline HALTS if verification fails

**Key Text**:
```
⚠️ CRITICAL: This phase is MANDATORY and NON-NEGOTIABLE. 
All specifications, tasks, and documents MUST be inserted into 
the wxKanban PostgreSQL database via MCP tools. 
The pipeline is NOT COMPLETE without database insertion.
```

---

### 2. Mandatory Database Reference
**File**: `_wxAI/commands/wxAI-pipeline-mandatory-database.md`

**Contents**:
- CRITICAL RULE - NON-NEGOTIABLE header
- Why database insertion is mandatory (5 reasons)
- Required database operations for Phase 4.5
- Verification steps with SQL queries
- Pipeline completion checklist
- Consequences of skipping database insertion
- Emergency procedures and fallback options
- AI assistant instructions with mandatory verification

**Usage**: All AI assistants MUST read this before executing any pipeline command.

---

### 3. Implementation Gate
**File**: `_wxAI/commands/wxAI-implement-gate.md`

**Enforcement**:
- **IMPLEMENTATION BLOCKED WITHOUT DATABASE INSERTION**
- Pre-implementation verification with 4 mandatory checks:
  1. Spec exists in database
  2. Tasks exist (> 0)
  3. Documents exist (>= 4)
  4. Spec status is valid
- Error messages that block implementation
- Force override requires `--reason` parameter (emergency only)
- Audit logging for all bypasses

**Key Text**:
```
⛔ IMPLEMENTATION BLOCKED - DATABASE VERIFICATION FAILED

DO NOT proceed with implementation until database verification passes.
The pipeline is INCOMPLETE without database insertion.
```

---

### 4. CLI Implementation Command
**File**: `cli/commands/implement.ts`

**Enforcement**:
- Command: `wxai implement --spec <NNN>`
- **MANDATORY GATE 1**: Check for force override without reason → EXIT 1
- **MANDATORY GATE 2**: Database verification (unless forced) → EXIT 1 if fails
- **MANDATORY GATE 3**: Dry run check
- Logs implementation start in database
- Updates spec status to "in_progress"

**Verification Functions**:
```typescript
verifySpecInDatabase(specNumber)     // Check 1
verifyTasksInDatabase(specNumber)    // Check 2  
verifyDocumentsInDatabase(specNumber) // Check 3
updateSpecStatus(specNumber, status)  // Update status
logImplementationStart(data)         // Audit log
```

---

## Verification SQL Queries

### Check Spec Exists
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

### Check Tasks
```sql
SELECT taskid, title, status, priority
FROM tasks 
WHERE spec_number = '<NNN>'
ORDER BY priority, taskid;
```

### Check Documents
```sql
SELECT title, documenttype, contenthash
FROM projectdocuments
WHERE specnumber = '<NNN>'
ORDER BY documenttype;
```

---

## Error Messages (Standardized)

### Database Verification Failed
```
===================================================
⛔ IMPLEMENTATION BLOCKED - DATABASE VERIFICATION FAILED
===================================================

Spec Number: <NNN>

FAILED CHECK: <error message>

REQUIRED ACTIONS:
  1. Complete the wxAI pipeline through Phase 4.5 (Task Push)
  2. Verify database insertion with:
     wxk_scope_import --spec <NNN> --dry-run false
     wxk_doc_import --spec <NNN> --dry-run false
  3. Re-run verification query
  4. Once verified, retry implementation

DO NOT proceed with implementation until database verification passes.
The pipeline is INCOMPLETE without database insertion.

Reference: _wxAI/commands/wxAI-pipeline-mandatory-database.md
===================================================
```

### Force Override Activated
```
⚠️  FORCE OVERRIDE ACTIVATED ⚠️

This bypasses mandatory database verification.
Reason: <provided reason>
Audit Log: <timestamp> - Force override by <user>

Continuing with implementation...
```

---

## Command Reference

### Pipeline Commands
| Command | Database Check | Enforced |
|---------|---------------|----------|
| `/wxAI-pipeline` | Phase 4.5 mandatory | ✅ Yes |
| `/wxAI-specify` | Creates spec file | N/A |
| `/wxAI-clarify` | Updates spec file | N/A |
| `/wxAI-plan` | Creates plan docs | N/A |
| `/wxAI-tasks` | Creates tasks.md | N/A |
| `/task-push` | **Inserts to DB** | ✅ Yes |
| `/wxAI-lifecycle` | Reads from DB | ✅ Yes |

### Implementation Commands
| Command | Database Check | Enforced |
|---------|---------------|----------|
| `/wxAI-implement` | **Blocks if no DB** | ✅ Yes |
| `/wxAI-qa` | Verifies DB first | ✅ Yes |
| `/wxAI-audit-run` | Checks DB as compliance | ✅ Yes |

---

## MCP Tools for Database Operations

### Required Tools
```bash
# Import tasks from tasks.md
wxk_scope_import --spec <NNN> --dry-run false

# Import documents (spec, plan, tasks, quickstart)
wxk_doc_import --spec <NNN> --dry-run false

# Update spec status
wxk_spec_update --spec <NNN> --status "tasks_generated"

# List tasks for verification
wxk_task_list --spec <NNN>

# List specs for verification
wxk_spec_list --spec <NNN>
```

---

## Compliance Checklist

Before marking any work complete, verify:

- [ ] Spec exists in `specs` table
- [ ] Tasks exist in `tasks` table (> 0)
- [ ] Documents exist in `projectdocuments` table (>= 4)
- [ ] Spec status is 'tasks_generated', 'in_progress', or 'ready_for_implementation'
- [ ] At least one P1 task exists
- [ ] No duplicate task IDs
- [ ] All documents have valid content hashes

---

## Emergency Procedures

If database insertion fails:

1. **Retry with dry-run**:
   ```bash
   wxk_scope_import --spec <NNN> --dry-run true
   ```

2. **Check MCP connection**:
   ```bash
   wxk_health_check
   ```

3. **Manual SQL fallback** (last resort):
   - Use `database/seeds/manual-task-insert.sql` template
   - Log manual insertion in `project-documentation/pipeline-failures.md`

4. **Force override** (emergency only):
   ```bash
   wxai implement --spec <NNN> --force --reason "Emergency hotfix"
   ```

---

## Summary

**NO IMPLEMENTATION WITHOUT DATABASE INSERTION.**

This is enforced at:
1. ✅ Pipeline Phase 4.5 (mandatory, non-skippable)
2. ✅ Implementation command gate (blocks execution)
3. ✅ QA and audit commands (verify first)
4. ✅ Documentation (clear requirements)
5. ✅ CLI code (enforcement logic)

The pipeline is **INCOMPLETE** until data is in the database.
