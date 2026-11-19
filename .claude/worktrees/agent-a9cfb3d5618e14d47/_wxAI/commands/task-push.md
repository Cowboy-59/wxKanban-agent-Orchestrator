# task-push — Push Spec Tasks to wxKanban

## Purpose
Synchronize tasks from a spec's `tasks.md` into the wxKanban database using MCP Project Hub tools, creating tasks with proper event capture and document linking.

## Usage
```bash
{{ai_config_dir}}/task-push {{args}}
```

## Arguments
- `spec-number` (required): The numeric spec identifier (e.g., "009")
- `--dry-run` (optional): Preview changes without writing to database

## MCP Tools Used
- `project.capture_event` — Log the task-push operation
- `project.create_task` — Create each task in the database
- `project.link_doc_to_task` — Link tasks to spec document

## Steps

### 1. Validate Environment
- [ ] Verify MCP server is configured in `ai-settings.json`
- [ ] Verify `project.create_task` tool is available
- [ ] Load spec directory `specs/{{spec-number}}-*`

### 2. Capture Event
- [ ] Call `project.capture_event` with:
  - `type`: "task_push"
  - `source`: "cli"
  - `rawContent`: "Pushing tasks for spec {{spec-number}}"
  - Store returned `eventId` for linking

### 3. Parse tasks.md
- [ ] Read `specs/{{spec-number}}-*/tasks.md`
- [ ] Extract all task lines matching pattern `- [ ] TXXX [P] Description`
- [ ] Build dependency graph from `### Dependencies` section

### 4. Create Spec Document (if not exists)
- [ ] Call `project.upsert_document` for `spec.md`:
  - `title`: "Spec {{spec-number}}: {{feature-name}}"
  - `bodyMarkdown`: Content of spec.md
  - `sourceEventId`: eventId from step 2
  - Store returned `documentId`

### 5. Create Tasks
- [ ] Call `project.create_task` for each task:
  - `title`: Task description
  - `descriptionMarkdown`: Full task details
  - `status`: "todo" for `[ ]`, "done" for `[x]`
  - `priority`: "high" for [P0], "medium" for [P1], "low" for [P2]
  - `sourceEventId`: eventId from step 2
  - `documentIds`: [documentId from step 4]
  - Store returned `taskId`

### 6. Link Tasks to Document
- [ ] Call `project.link_doc_to_task` for each task:
  - `documentId`: from step 4
  - `taskId`: from step 5

### 7. Report Results
- [ ] Output summary: tasks created, events captured, documents linked
- [ ] List any errors encountered

## Output Format
```
task-push Report — Spec {{spec-number}}
=====================================
Event captured:   ✅ task_push (event-id: xxx)

Tasks parsed:     42
Tasks created:    38
Tasks skipped:    4 (already exist)
Document linked:  ✅ spec.md → 38 tasks

MCP Tools Used:
  - project.capture_event: 1
  - project.upsert_document: 1
  - project.create_task: 38
  - project.link_doc_to_task: 38

Status:           ✅ Complete
```

## Error Handling
- Duplicate tasks (by `[NNN-TXXX]` prefix) are skipped, not duplicated
- Missing `tasks.md` produces clear error message
- MCP tool failures are logged with full error details
- All operations are idempotent — safe to re-run

## Related Commands
- `task-done` — Mark tasks complete
- `createSpecs` — Full spec pipeline (was wxAI-pipeline)

## MCP Integration Notes
- All database operations go through MCP tools — never raw SQL
- Every task creation is linked to the source event for audit trail
- Spec document is created/updated and linked to all tasks
- Use `project.list_open_items` to verify tasks were created
