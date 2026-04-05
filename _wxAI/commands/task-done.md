# task-done — Mark Tasks Complete in wxKanban

## Purpose
Mark one or more tasks as completed in both the local `tasks.md` and the wxKanban database using MCP Project Hub tools.

## Usage
```bash
{{ai_config_dir}}/task-done {{args}}
```

## Arguments
- `spec-number` (required): The numeric spec identifier (e.g., "009")
- `task-ids` (required): Comma-separated task IDs (e.g., "T001,T002,T003")
- `--db-only` (optional): Only update database, skip local file

## MCP Tools Used
- `project.capture_event` — Log the task completion operation
- `project.update_task_status` — Update task status to "done"
- `project.list_open_items` — Verify task status after update

## Steps

### 1. Validate Inputs
- [ ] Parse `spec-number` and `task-ids`
- [ ] Verify spec directory exists
- [ ] Verify tasks.md exists
- [ ] Verify MCP server is accessible

### 2. Capture Event
- [ ] Call `project.capture_event` with:
  - `type`: "task_completed"
  - `source`: "cli"
  - `rawContent`: "Marking tasks complete: {{task-ids}} for spec {{spec-number}}"
  - Store returned `eventId`

### 3. Update Local tasks.md
- [ ] Find each task line by `[NNN-TXXX]` pattern
- [ ] Change `- [ ]` to `- [x]` for completed tasks
- [ ] Preserve original formatting

### 4. Update wxKanban Database
- [ ] For each task ID:
  - Call `project.update_task_status` with:
    - `taskId`: task identifier
    - `status`: "done"
    - `sourceEventId`: eventId from step 2

### 5. Verify Updates
- [ ] Call `project.list_open_items` to verify tasks are no longer in open list
- [ ] Confirm each task shows `status: "done"`

### 6. Report Results
- [ ] List tasks marked complete
- [ ] Report any tasks not found or failed to update

## Output Format
```
task-done Report — Spec {{spec-number}}
=====================================
Event captured:   ✅ task_completed (event-id: xxx)

Tasks marked complete: 3
  ✓ T001 — Create database schema
    Status: done (updated via project.update_task_status)
  ✓ T002 — Add migration
    Status: done (updated via project.update_task_status)
  ✓ T003 — Create service layer
    Status: done (updated via project.update_task_status)

Database synced:       ✅ Yes (via MCP tools)
Local file updated:    ✅ Yes
MCP Tools Used:
  - project.capture_event: 1
  - project.update_task_status: 3
  - project.list_open_items: 1

Status:                ✅ Complete
```

## Error Handling
- Tasks not found in tasks.md are reported but don't fail
- MCP tool failures are logged with full error details
- File write errors exit with code 1
- Partial failures are reported — successful updates are committed

## Related Commands
- `task-push` — Push tasks to wxKanban
- `createSpecs` — Full spec pipeline (was wxAI-pipeline)

## MCP Integration Notes
- All database operations go through MCP tools — never raw SQL
- Task completion is captured as an event for audit trail
- Use `project.list_open_items` to verify task status
- Status transitions: todo → in_progress → done (validated by MCP server)
