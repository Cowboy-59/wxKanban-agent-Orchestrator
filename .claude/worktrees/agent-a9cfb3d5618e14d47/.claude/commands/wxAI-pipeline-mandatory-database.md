---
description: MANDATORY - Database insertion requirements for wxAI pipeline
args: "{{args}}"
ai-compat: universal
claude-code: true
cursor: true
blackboxai: true
---

# MANDATORY: Database Insertion Requirements

## ⚠️ CRITICAL RULE - NON-NEGOTIABLE

**ALL specifications, tasks, and documents generated through the wxAI pipeline MUST be inserted into the wxKanban PostgreSQL database via MCP tools.**

This is NOT optional. This is a **mandatory** step of the pipeline process.

---

## Why This Is Mandatory

1. **Project Tracking**: The database is the single source of truth for all project work
2. **Task Management**: Tasks must be in the database to be assigned, tracked, and completed
3. **Document Centralization**: All specs, plans, and documentation must be searchable and versioned
4. **Compliance**: Audit trails require database records
5. **Team Coordination**: Multiple developers need visibility into specifications

---

## Required Database Operations

### Phase 4.5: Task Push (MANDATORY)

After generating `tasks.md`, you **MUST** execute:

```bash
# 1. Import tasks into database
wxk_scope_import --spec <NNN> --dry-run false

# 2. Import all documents
wxk_doc_import --spec <NNN> --dry-run false

# 3. Update spec status
wxk_spec_update --spec <NNN> --status "tasks_generated"
```

### Verification Steps

Before marking Phase 4.5 complete, verify:

1. **Tasks exist in database**:
   ```sql
   SELECT COUNT(*) FROM tasks WHERE spec_number = '<NNN>';
   -- Should match task count in tasks.md
   ```

2. **Documents exist in database**:
   ```sql
   SELECT title, documenttype FROM projectdocuments 
   WHERE specnumber = '<NNN>';
   -- Should show: spec.md, plan.md, tasks.md, etc.
   ```

3. **Spec status updated**:
   ```sql
   SELECT status FROM specs WHERE specnumber = '<NNN>';
   -- Should be: 'tasks_generated' or 'in_progress'
   ```

---

## Pipeline Completion Checklist

Before declaring the pipeline complete, confirm:

- [ ] `spec.md` created and written to disk
- [ ] `spec.md` imported to database via `wxk_doc_import`
- [ ] `checklists/requirements.md` created
- [ ] `plan.md` created and imported to database
- [ ] `data-model.md` created and imported to database
- [ ] `contracts/*.md` created and imported to database
- [ ] `quickstart.md` created and imported to database
- [ ] `tasks.md` created and imported to database
- [ ] Tasks imported via `wxk_scope_import`
- [ ] Spec status updated in database
- [ ] `Lifecycle.md` updated with database task counts

---

## Failure to Insert Consequences

If database insertion is skipped:

1. **Pipeline is INCOMPLETE** - Do not report success
2. **Tasks are invisible** - Cannot be assigned or tracked
3. **Documents are orphaned** - Not searchable or versioned
4. **Compliance violation** - Missing audit trail
5. **Team blocked** - Other developers cannot see the work

---

## Emergency Procedures

If MCP tools fail:

1. **Retry with dry-run first**:
   ```bash
   wxk_scope_import --spec <NNN> --dry-run true
   ```

2. **Check MCP connection**:
   ```bash
   wxk_health_check
   ```

3. **Manual SQL fallback** (last resort):
   - Use `database/seeds/manual-task-insert.sql` template
   - Log the manual insertion for audit

4. **Document the failure** in `project-documentation/pipeline-failures.md`

---

## Verification Query

Run this query to verify complete pipeline insertion:

```sql
SELECT 
    s.specnumber,
    s.title,
    s.status as spec_status,
    COUNT(t.id) as task_count,
    COUNT(pd.id) as document_count
FROM specs s
LEFT JOIN tasks t ON t.spec_number = s.specnumber
LEFT JOIN projectdocuments pd ON pd.specnumber = s.specnumber
WHERE s.specnumber = '<NNN>'
GROUP BY s.specnumber, s.title, s.status;
```

Expected result:
- `spec_status`: 'tasks_generated' or 'in_progress'
- `task_count`: > 0 (matches tasks.md)
- `document_count`: >= 4 (spec, plan, tasks, quickstart)

---

## AI Assistant Instructions

When executing `/wxAI-pipeline` or any phase command:

1. **Always include Phase 4.5 (Task Push)**
2. **Never skip database insertion** unless explicitly authorized by user with documented reason
3. **Verify insertion** before reporting phase complete
4. **Report database status** in all completion reports
5. **Block pipeline completion** if database insertion fails

---

## User Confirmation Required

Before final pipeline report, ask user:

```
Database Insertion Verification:
- Tasks in database: <count>
- Documents in database: <count>
- Spec status: <status>

Confirm all data is properly inserted? (yes/no/verify)
```

Only proceed to "Pipeline Complete" on confirmation.

---

## Documentation References

- MCP Tools: `cli/wxkanban-mcp.md`
- Database Schema: `project-documentation/DATABASE_SCHEMA.md`
- Pipeline Process: `_wxAI/commands/wxAI-pipeline.md`
<<<<<<< HEAD
- Task Import: `_wxAI-global/commands/task-push.md`
=======
- Task Import: `_wxAI/commands/task-push.md`
>>>>>>> origin/014-sysadmin-platform-admin
