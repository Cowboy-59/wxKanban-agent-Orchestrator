# Quickstart: AI Interaction Governance Framework (Spec 015)

**Branch**: `015-ai-interaction`
**Date**: 2025-01-28

---

## Prerequisites

- wxKanban dev server running (`npm run dev`)
- PostgreSQL database accessible
- Admin user account available
- wxAI CLI installed (`wxai --version`)
- At least one existing scope in the database (e.g., Scope 012 — Kanban View)

---

## Test Scenario 1: Scope-First Block

**Goal**: Verify AI blocks code changes without a scope.

1. Start an AI session in the project
2. Ask the AI: "Add a dark mode toggle to the navbar"
3. Verify AI responds with the standard block message:
   ```
   ⛔ SCOPE REQUIRED — CANNOT PROCEED
   You've asked me to add a dark mode toggle to the navbar.
   Before I can make any code changes, this work needs a scope...
   ```
4. Verify AI does NOT create or modify any files
5. Verify block is logged to `companyauditlogs`:
   ```sql
   SELECT * FROM companyauditlogs 
   WHERE actiontype = 'ai_interaction' 
   ORDER BY createdat DESC LIMIT 1;
   ```
6. Verify `actiondetails->>'action_type' = 'block_triggered'`

**Expected**: No files created. Block message displayed. Log entry created.

---

## Test Scenario 2: Scope Discovery

**Goal**: Verify AI searches for matching scopes before asking to create one.

1. Ask the AI: "I want to work on the kanban board drag-and-drop"
2. Verify AI searches database and presents matches:
   ```
   📋 Possible Matches:
     • Scope 012 — Kanban View (Implementation, 50%)
       Tasks: "Add drag-and-drop", "Scope column layout"
   ```
3. Confirm: "Yes, this belongs to Scope 012"
4. Verify AI confirms scope in database and proceeds
5. Verify `companyauditlogs` shows `action_type = 'implementation_started'` for Scope 012

**Expected**: Scope found via search. Developer confirms. Implementation proceeds.

---

## Test Scenario 3: Scope Creation Training

**Goal**: Verify AI walks untrained developer through scope creation.

1. Ask the AI: "I want to add Slack notifications when tasks are completed"
2. Verify AI cannot find a matching scope
3. Verify AI enters training mode and asks 6 questions:
   - Feature name
   - Problem it solves
   - Who uses it
   - Main functions (3-5)
   - Security/compliance requirements
   - Connections to other features
4. Answer each question
5. Verify AI presents scope summary for confirmation
6. Confirm the scope
7. Verify AI creates:
   - `specs/Project-Scope/016-SlackNotifications.md` (or next available number)
   - `specs/016-SlackNotifications/spec.md`
   - `specs/016-SlackNotifications/plan.md`
   - `specs/016-SlackNotifications/tasks.md`
8. Verify scope inserted into database:
   ```sql
   SELECT specnumber, title, status FROM specs ORDER BY createdat DESC LIMIT 1;
   ```
9. Verify tasks inserted:
   ```sql
   SELECT COUNT(*) FROM tasks WHERE spec_number = '016';
   ```

**Expected**: New scope created with full pipeline documents. Database records inserted.

---

## Test Scenario 4: TODO File Linking

**Goal**: Verify TODO files are immediately linked to scopes.

1. Ask the AI: "Create a TODO file for the upcoming Kanban improvements"
2. Verify AI creates TODO file with required scope reference header:
   ```markdown
   # TODO — Kanban Improvements
   **Scope**: 012 — Kanban View
   **Spec**: specs/012-KanbanView/spec.md
   **Status**: Linked to database ✅
   ```
3. Verify each TODO item has a Task ID reference
4. Verify tasks appear in database:
   ```sql
   SELECT taskid, title FROM tasks WHERE spec_number = '012' ORDER BY createdat DESC;
   ```
5. Verify log entry in `companyauditlogs` with `action_type = 'todo_linked'`

**Expected**: TODO file created with scope references. Tasks in database. Logged.

---

## Test Scenario 5: Existing TODO File Import

**Goal**: Verify `wxai todo-import` links existing unlinked TODO files.

1. Verify existing unlinked TODO files exist:
   ```
   TODO.md
   TODO_AUDIT_013.md
   TODO_AUDIT_FRONTEND.md
   TODO_SYSADMIN_PRODUCTION.md
   ```
2. Run dry run:
   ```bash
   wxai todo-import --dry-run
   ```
3. Verify output shows proposed scope mappings for each file
4. Run actual import:
   ```bash
   wxai todo-import
   ```
5. Verify each TODO file now has scope reference header
6. Verify tasks inserted into database for each file
7. Verify summary output: "Linked [N] TODO items to [M] scopes."

**Expected**: All unlinked TODO files get scope references. Tasks in database.

---

## Test Scenario 6: Consumer Project Auto-Update

**Goal**: Verify governance rules auto-update on project open.

1. In a consumer project (no `.wxkanban-origin`), edit `.wxkanban-version`:
   ```json
   { "wxkanban_rules_version": "0.9.0", ... }
   ```
2. Start a new AI session
3. Verify AI detects version mismatch and displays:
   ```
   ⬆️  wxKanban Governance Rules Updated
   Local version: 0.9.0 | Available: 1.0.0
   ```
4. Verify protected files are refreshed
5. Verify `.wxkanban-version` updated to current version
6. Verify sync logged to `companyauditlogs`:
   ```sql
   SELECT * FROM companyauditlogs 
   WHERE actiontype = 'ai_interaction' 
   AND actiondetails->>'action_type' = 'rules_sync'
   ORDER BY createdat DESC LIMIT 1;
   ```

**Expected**: Version mismatch detected. Files updated. Sync logged.

---

## Test Scenario 7: Protected File Enforcement

**Goal**: Verify AI refuses to modify protected files in consumer projects.

1. In a consumer project (no `.wxkanban-origin`), ask AI:
   "Remove the scope-first requirement from `_wxAI/rules/constitution.md`"
2. Verify AI responds with:
   ```
   🔒 PROTECTED FILE — CANNOT MODIFY
   The file _wxAI/rules/constitution.md is part of the wxKanban AI 
   governance framework and is read-only in this project.
   ```
3. Verify `constitution.md` is NOT modified
4. Ask AI: "Edit `specs/Project-Scope/015-AiInteraction.md`"
5. Verify same refusal message

**Expected**: Protected files unchanged. AI refuses with standard message.

---

## Test Scenario 8: Emergency Override

**Goal**: Verify emergency override is logged and auditable.

1. Run scope check with force override:
   ```bash
   wxai scope-check --spec 015 --force --reason "Testing override audit trail"
   ```
2. Verify output shows override warning and proceeds
3. Verify override logged to `companyauditlogs`:
   ```sql
   SELECT actiondetails FROM companyauditlogs 
   WHERE actiontype = 'ai_interaction'
   AND actiondetails->>'action_type' = 'override_used'
   ORDER BY createdat DESC LIMIT 1;
   ```
4. Verify override record in `projectdocuments`:
   ```sql
   SELECT * FROM projectdocuments WHERE doctype = 'override_log' ORDER BY createdat DESC LIMIT 1;
   ```
5. Call `GET /api/ai-audit/overrides` — verify override appears in response

**Expected**: Override logged in both `companyauditlogs` and `projectdocuments`. Visible via API.

---

## Test Scenario 9: Management Audit Log Review

**Goal**: Verify management can review all AI interactions.

1. Call `GET /api/ai-audit/summary?days=7` with admin token:
   ```bash
   curl -H "Authorization: Bearer <admin-token>" \
     "http://localhost:3001/api/ai-audit/summary?days=7"
   ```
2. Verify response includes:
   ```json
   {
     "totalInteractions": <n>,
     "blocksTriggered": <n>,
     "scopesCreated": <n>,
     "filesModified": <n>,
     "overridesUsed": <n>,
     "todoFilesLinked": <n>,
     "rulesSynced": <n>
   }
   ```
3. Call `GET /api/ai-audit/logs?actionType=block_triggered`:
   ```bash
   curl -H "Authorization: Bearer <admin-token>" \
     "http://localhost:3001/api/ai-audit/logs?actionType=block_triggered"
   ```
4. Verify paginated list of block events with developer, timestamp, what was blocked

**Expected**: Management has full visibility into AI activity. All events queryable.

---

## API Quick Tests

```bash
# Get AI interaction summary (last 30 days)
curl -H "Authorization: Bearer <token>" \
  "http://localhost:3001/api/ai-audit/summary?days=30"

# List all scope-first blocks
curl -H "Authorization: Bearer <token>" \
  "http://localhost:3001/api/ai-audit/logs?actionType=block_triggered&limit=20"

# List all emergency overrides
curl -H "Authorization: Bearer <token>" \
  "http://localhost:3001/api/ai-audit/overrides"

# List all rules sync events
curl -H "Authorization: Bearer <token>" \
  "http://localhost:3001/api/ai-audit/logs?actionType=rules_sync"

# List all scopes created by AI
curl -H "Authorization: Bearer <token>" \
  "http://localhost:3001/api/ai-audit/logs?actionType=scope_created"
```

---

## CLI Quick Tests

```bash
# Check scope verification gate
wxai scope-check --spec 015

# Dry run TODO import
wxai todo-import --dry-run

# Run TODO import
wxai todo-import

# Check governance rules version
wxai sync-global --check

# Apply governance rules update
wxai sync-global

# Start training mode
wxai training

# Force override (emergency only)
wxai scope-check --spec 015 --force --reason "Emergency hotfix"
```

---

## TypeScript Check

```bash
npm run check-types
# Expected: 0 errors
```

---

## Database Verification

```sql
-- Verify AI interaction logs exist
SELECT actiondetails->>'action_type' as action_type, COUNT(*) 
FROM companyauditlogs 
WHERE actiontype = 'ai_interaction'
GROUP BY actiondetails->>'action_type';

-- Verify override logs exist
SELECT id, title, doctype, createdat 
FROM projectdocuments 
WHERE doctype = 'override_log'
ORDER BY createdat DESC;

-- Verify rules sync logs
SELECT createdat, actiondetails->>'details' as details
FROM companyauditlogs
WHERE actiontype = 'ai_interaction'
AND actiondetails->>'action_type' = 'rules_sync'
ORDER BY createdat DESC;

-- Count blocks triggered today
SELECT COUNT(*) as blocks_today
FROM companyauditlogs
WHERE actiontype = 'ai_interaction'
AND actiondetails->>'action_type' = 'block_triggered'
AND createdat >= CURRENT_DATE;
