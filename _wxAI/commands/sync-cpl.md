# sync-cpl — Sync CPL Launcher

## Purpose
Synchronize the Current Project Lineage (CPL) with the wxKanban database using MCP Project Hub tools, ensuring all specs, tasks, and dependencies are properly tracked with full audit trail.

## Usage
```bash
{{ai_config_dir}}/sync-cpl {{args}}
```

## Arguments
- `--project-id` (optional): Target project ID (defaults to current project)
- `--full-sync` (optional): Complete rebuild of CPL from specs directory
- `--dry-run` (optional): Preview changes without writing to database

## MCP Tools Used
- `project.capture_event` — Log sync operations
- `project.upsert_document` — Create/update spec documents
- `project.create_task` — Create tasks from specs
- `project.link_doc_to_task` — Link tasks to documents
- `project.list_open_items` — Query existing items for comparison

## Sync Steps

### 1. Capture Start Event
- [ ] Call `project.capture_event` with:
  - `type`: "cpl_sync_started"
  - `source`: "cli"
  - `rawContent`: "Starting CPL sync — Mode: {{full-sync ? 'Full' : 'Incremental'}}"
  - Store returned `eventId` as `syncEventId`

### 2. Discover Specs
- [ ] Scan `specs/` directory for all `NNN-*` directories
- [ ] Parse each spec's `lifecycle.json` for phase status
- [ ] Extract spec metadata (number, name, status, created date)
- [ ] Call `project.capture_event` with:
  - `type`: "cpl_discovery"
  - `source`: "cli"
  - `rawContent`: "Discovered {{spec_count}} specs in specs/ directory"

### 3. Sync Specifications
- [ ] For each discovered spec:
  - Read `spec.md` content
  - Call `project.upsert_document` with:
    - `title`: "Spec {{spec-number}}: {{feature-name}}"
    - `bodyMarkdown`: Content of spec.md
    - `sourceEventId`: syncEventId
    - `tags`: ["spec", "{{spec-number}}", "{{phase}}"]
    - Store returned `documentId` as `specDocumentId`

### 4. Sync Tasks
- [ ] Read each spec's `tasks.md`
- [ ] Parse task lines: `- [ ] TXXX [P] Description` or `- [x] TXXX [H] Description`
- [ ] For each task:
  - Call `project.create_task` with:
    - `title`: Task description
    - `descriptionMarkdown`: Full task details from tasks.md
    - `status`: "todo" for `[ ]`, "done" for `[x]`
    - `priority`: "high" for [P0], "medium" for [P1], "low" for [P2]
    - `sourceEventId`: syncEventId
    - `documentIds`: [specDocumentId]
    - Store returned `taskId`
  - Call `project.link_doc_to_task` with:
    - `documentId`: specDocumentId
    - `taskId`: taskId from above

### 5. Sync Dependencies
- [ ] Parse `### Dependencies` sections in tasks.md
- [ ] Call `project.capture_event` for each dependency:
  - `type`: "task_dependency"
  - `source`: "cli"
  - `rawContent`: "Task {{task-id}} depends on {{dependency-id}}"
- [ ] Note: Full dependency linking requires task IDs from step 4

### 6. Sync Checklists
- [ ] Read `checklists/requirements.md` if exists
- [ ] Call `project.upsert_document` with:
  - `title`: "Requirements Checklist — Spec {{spec-number}}"
  - `bodyMarkdown`: Content of requirements.md
  - `sourceEventId`: syncEventId
  - `tags`: ["checklist", "requirements", "{{spec-number}}"]

### 7. Verify Sync
- [ ] Call `project.list_open_items` to verify:
  - All specs appear as documents
  - All tasks are linked to specs
  - Statuses match local files

### 8. Create Report Document
- [ ] Call `project.upsert_document` with:
  - `title`: "CPL Sync Report — {{timestamp}}"
  - `bodyMarkdown`: Full sync report (see Output Format)
  - `sourceEventId`: syncEventId
  - `tags`: ["cpl", "sync", "report"]

## Output Format
```
sync-cpl Report (MCP Project Hub)
=================================
Event captured:      ✅ cpl_sync_started (event-id: xxx)

Project:             {{project-id}}
Mode:                {{full-sync ? 'Full' : 'Incremental'}}

Specs Discovered:    16
  ✅ Documents:      16 (via project.upsert_document)

Tasks Processed:     317
  ✅ Created:        12 (new)
  🔄 Updated:        305 (existing)
  ✅ Linked:         317 (to spec documents)

Dependencies:        48
  ✅ Captured:       48 (via project.capture_event)

Checklists:          16
  ✅ Synced:         16 (via project.upsert_document)

MCP Tools Used:
  - project.capture_event: 3
  - project.upsert_document: 33
  - project.create_task: 317
  - project.link_doc_to_task: 317
  - project.list_open_items: 1

Report document:     ✅ Created in projectdocuments

Warnings:
  ⚠️  Spec 005-Time-and-Billing: No tasks.md found
  ⚠️  Spec 016-help: lifecycle.json missing phase data

Status: ✅ Sync complete
```

## Error Handling
- Missing `lifecycle.json` files are logged as warnings and captured via `project.capture_event`
- Database connection failures exit with code 1
- Parse errors in tasks.md are logged with line numbers
- Circular dependencies are detected and skipped
- All errors are captured as events for audit trail

## Related Commands
- `sync-starter-kit` — Sync project with starter kit
- `task-push` — Push individual spec tasks
- `createSpecs` — Full spec pipeline

## MCP Integration Notes
- All sync operations are captured as events for complete audit trail
- Every spec becomes a document in projectdocuments
- Every task is linked to its parent spec document
- Sync reports are stored as documents for future reference
- Use `project.list_open_items` to verify sync results
- Never use raw SQL — all data access through MCP tools
