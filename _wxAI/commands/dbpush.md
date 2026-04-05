# dbpush — Validate and Push All Data to Database

## Purpose
Validate all local spec files, tasks, and lifecycle data, then push everything to the MCP Project Hub database. This ensures the database is in sync with all local changes.

## Usage
```bash
{{ai_config_dir}}/dbpush [options]
```

## Arguments
- `--dry-run` (optional): Validate without pushing to database
- `--spec` (optional): Push only specific spec (e.g., `--spec 017`)
- `--force` (optional): Force push even if validation warnings exist
- `--skip-lifecycle` (optional): Skip lifecycle file generation

## MCP Tools Used
- `project.create_specs` — Create/update specs with lifecycle
- `project.upsert_document` — Push document updates
- `project.create_task` — Push new tasks
- `project.update_task_status` — Update task statuses
- `project.capture_event` — Log push events

## Push Phases

### Phase 1: Validate Local Files
- [ ] Scan `specs/` directory for all spec folders
- [ ] Validate `spec.md`, `plan.md`, `tasks.md` exist
- [ ] Check `lifecycle.json` is valid JSON
- [ ] Verify task files are parseable
- [ ] Report any validation errors

### Phase 2: Compare with Database
- [ ] Call `project.list_open_items` to get current DB state
- [ ] Compare local specs with `projectspecifications` table
- [ ] Compare local documents with `projectdocuments` table
- [ ] Compare local tasks with `projecttasks` table
- [ ] Identify new, modified, and deleted items

### Phase 3: Generate Lifecycle (if not skipped)
- [ ] For each spec, generate `lifecycle.json` if missing
- [ ] Update `specs/projectlifecycle.md` with aggregated view
- [ ] Validate Mermaid charts in lifecycle files

### Phase 4: Push to Database
- [ ] Push specs to `projectspecifications` table
- [ ] Push documents to `projectdocuments` table
- [ ] Push tasks to `projecttasks` table
- [ ] Link tasks to specs and documents
- [ ] Push lifecycle to `projectdocuments` (doctype: 'lifecycle')

### Phase 5: Capture Push Event
- [ ] Call `project.capture_event` with:
  - `type`: "data_sync_complete"
  - `source`: "cli"
  - `rawContent`: "Push complete: {{spec_count}} specs, {{doc_count}} documents, {{task_count}} tasks"

## Output Format
```
dbpush Report (MCP Project Hub)
=============================
Validation:
  ✅ Specs:      {{spec_count}} valid
  ✅ Documents:  {{doc_count}} valid
  ✅ Tasks:      {{task_count}} valid
  ✅ Lifecycle:  {{lifecycle_count}} valid

Database Sync:
  🆕 New specs:      {{new_specs}}
  📝 Updated specs:  {{updated_specs}}
  📄 New docs:       {{new_docs}}
  📝 Updated docs:   {{updated_docs}}
  ✅ New tasks:      {{new_tasks}}
  🔄 Updated tasks:  {{updated_tasks}}

Lifecycle Files:
  ✅ Generated lifecycle.json for {{spec_count}} specs
  ✅ Updated specs/projectlifecycle.md
  ✅ Pushed to projectdocuments table

MCP Tools Used:
  - project.create_specs: {{spec_ops}}
  - project.upsert_document: {{doc_ops}}
  - project.create_task: {{task_ops}}
  - project.update_task_status: {{status_ops}}
  - project.capture_event: 1

Next Steps:
  1. Verify data in wxKanban UI
  2. Run `help` for other available commands
```

## Error Handling
- Validation errors block push (use `--force` to override)
- Database connection failures exit with code 1
- Partial push failures logged with details
- Rollback capability for failed transactions

## Related Commands
- `createspecs` — Create new spec with lifecycle
- `implement` — Execute spec implementation tasks
- `help` — Show all available commands
