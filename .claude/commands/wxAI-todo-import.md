---
description: Scan project for TODO files, link each item to a wxKanban scope and task, and insert into the database
args: "{{args}}"
ai-compat: universal
claude-code: true
cursor: true
blackboxai: true
---

# wxAI-todo-import

**TODO File Scope Linker** — Scans the project for existing TODO files that are not linked to scopes, analyzes their content, proposes scope mappings, and inserts tasks into the wxKanban database after developer confirmation.

## User Input

```text
{{args}}
```

---

## Purpose

When developers create TODO files during a session, those items represent real work that must be tracked in the wxKanban database. Unlinked TODO files are a governance gap — work is being planned outside the system.

This command:
1. Finds all TODO files in the project
2. Identifies which ones are NOT linked to scopes
3. Analyzes each item and proposes a scope mapping
4. Inserts confirmed items as tasks in the database
5. Updates the TODO file with scope references and task IDs

---

## Execution Steps

### Step 1 — Scan for TODO Files

Search the project for all TODO files:

```bash
find . -name "TODO*.md" -o -name "TODO*.txt" -o -name "todo*.md" \
  ! -path "*/node_modules/*" ! -path "*/.git/*" ! -path "*/dist/*"
```

Also check for inline TODO comments in recently modified files:
```bash
grep -r "TODO:" --include="*.ts" --include="*.tsx" --include="*.js" \
  -l . 2>/dev/null | head -20
```

---

### Step 2 — Identify Unlinked TODO Files

A TODO file is **linked** if it contains a scope reference header:

```markdown
<!-- wxKanban Scope: 012 — Kanban View | DB: verified -->
```

A TODO file is **unlinked** if it has no such header.

Display the scan results:

```
📋 TODO FILE SCAN RESULTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Found 4 TODO files:

  ✅ LINKED   TODO.md                    → Scope 012 (verified)
  ⚠️  UNLINKED TODO_AUDIT_013.md         → No scope reference
  ⚠️  UNLINKED TODO_AUDIT_FRONTEND.md   → No scope reference
  ⚠️  UNLINKED TODO_SYSADMIN_PRODUCTION.md → No scope reference

3 files need scope linking.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

### Step 3 — Analyze Each Unlinked TODO File

For each unlinked file, read its contents and analyze each item:

```
📄 Analyzing: TODO_AUDIT_013.md
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Found 8 TODO items:

  [1] "Complete route registration for audit endpoints"
      → Suggested scope: 013 — Audit Management (Implementation)
      → Suggested task type: implementation
      → Confidence: HIGH (keyword: "audit", "route")

  [2] "Add frontend audit dashboard component"
      → Suggested scope: 013 — Audit Management (Implementation)
      → Suggested task type: frontend
      → Confidence: HIGH (keyword: "audit", "frontend", "dashboard")

  [3] "Write integration tests for audit API"
      → Suggested scope: 013 — Audit Management (Implementation)
      → Suggested task type: testing
      → Confidence: HIGH (keyword: "audit", "tests")

  [4] "Update navigation to include audit link"
      → Suggested scope: 006 — Settings (Implementation)
      → Suggested task type: frontend
      → Confidence: MEDIUM (keyword: "navigation")

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

### Step 4 — Confirm Scope Mappings with Developer

Present the proposed mappings and ask for confirmation:

```
🔗 PROPOSED SCOPE MAPPINGS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
File: TODO_AUDIT_013.md

  Items 1-3 → Scope 013 — Audit Management  [CONFIRM? y/n/edit]
  Item 4    → Scope 006 — Settings          [CONFIRM? y/n/edit]

Options:
  y = accept all proposed mappings
  n = reject and re-map manually
  edit = change scope for specific items
  skip = skip this file
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

### Step 5 — Insert Tasks into Database

After confirmation, insert each TODO item as a task via the wxKanban MCP:

```text
wxk_scope_import({
  action: "add_task",
  spec_number: "013",
  task: {
    title: "Complete route registration for audit endpoints",
    tasktype: "implementation",
    priority: "P1",
    status: "pending",
    source: "todo_import",
    sourcefile: "TODO_AUDIT_013.md"
  }
})
```

Display progress:
```
📥 INSERTING TASKS INTO DATABASE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ✅ T029: "Complete route registration for audit endpoints" → Scope 013
  ✅ T030: "Add frontend audit dashboard component" → Scope 013
  ✅ T031: "Write integration tests for audit API" → Scope 013
  ✅ T032: "Update navigation to include audit link" → Scope 006

4 tasks inserted successfully.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

### Step 6 — Update TODO Files with Scope References

Add scope reference headers and task IDs to each TODO file:

**Before:**
```markdown
# TODO — Audit Management

- [ ] Complete route registration for audit endpoints
- [ ] Add frontend audit dashboard component
```

**After:**
```markdown
# TODO — Audit Management

<!-- wxKanban Scope: 013 — Audit Management | DB: verified | Imported: 2025-01-28 -->

- [ ] Complete route registration for audit endpoints <!-- T029 -->
- [ ] Add frontend audit dashboard component <!-- T030 -->
```

---

### Step 7 — Log to Audit Trail

Log the import to `companyauditlogs`:

```json
{
  "action": "ai_interaction",
  "description": "TODO import: 4 items linked to scopes 013, 006",
  "newvalue": {
    "actiontype": "todo_import",
    "filesProcessed": ["TODO_AUDIT_013.md", "TODO_AUDIT_FRONTEND.md"],
    "tasksInserted": 4,
    "scopesAffected": ["013", "006"],
    "provider": "<current AI provider>",
    "sessionid": "<session id>"
  }
}
```

---

### Step 8 — New TODO File Creation Rules

When the AI creates a NEW TODO file during a session, it MUST:

1. Add the scope reference header immediately:
```markdown
<!-- wxKanban Scope: <NNN> — <Title> | DB: <verified|pending> | Created: <date> -->
```

2. Map each item to an existing task or create a new task
3. Add task IDs as inline comments: `<!-- T<NNN> -->`
4. Notify the developer: "I've linked X TODO items to Scope <NNN>. They're now tracked in the database."

**Template for new TODO files:**
```markdown
# TODO — <Feature Name>

<!-- wxKanban Scope: <NNN> — <Scope Title> | DB: verified | Created: <ISO date> -->
<!-- Reference: specs/<NNN>-<name>/tasks.md -->

## Pending

- [ ] <task description> <!-- T<NNN> -->

## In Progress

- [ ] <task description> <!-- T<NNN> -->

## Completed

- [x] <task description> <!-- T<NNN> -->
```

---

## CLI Usage

```bash
# Scan and import all unlinked TODO files (interactive)
wxai todo-import

# Import specific file
wxai todo-import --file TODO_AUDIT_013.md

# Dry run (show what would be imported, no DB changes)
wxai todo-import --dry-run

# Auto-confirm all high-confidence mappings
wxai todo-import --auto-confirm

# Import and link to specific scope
wxai todo-import --file TODO_AUDIT_013.md --scope 013
```

---

## Integration Points

- Called automatically when AI creates a new TODO file
- Called by `wxAI-session-start` to check for unlinked TODOs at session start
- Results visible in management AI Audit dashboard via `/api/ai-audit/logs`
