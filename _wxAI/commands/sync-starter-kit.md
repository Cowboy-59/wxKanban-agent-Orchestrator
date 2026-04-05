# sync-starter-kit — Sync Project with Starter Kit

## Purpose
Synchronize the current project with the wxKanban starter kit using MCP Project Hub tools, updating templates, commands, and configuration files while preserving project-specific customizations and capturing all operations for audit trail.

## Usage
```bash
{{ai_config_dir}}/sync-starter-kit {{args}}
```

## Arguments
- `--kit-version` (optional): Specific starter kit version (default: latest)
- `--dry-run` (optional): Preview changes without applying
- `--force` (optional): Overwrite local modifications (use with caution)

## MCP Tools Used
- `project.capture_event` — Log sync operations
- `project.upsert_document` — Create sync report

## Sync Steps

### 1. Capture Start Event
- [ ] Call `project.capture_event` with:
  - `type`: "starter_kit_sync_started"
  - `source`: "cli"
  - `rawContent`: "Starting starter kit sync — Version: {{kit-version}}, Dry-run: {{dry-run}}"
  - Store returned `eventId` as `syncEventId`

### 2. Fetch Starter Kit
- [ ] Download latest starter kit manifest from wxKanban
- [ ] Compare local version with remote version
- [ ] List files that will be updated
- [ ] Call `project.capture_event` with:
  - `type`: "starter_kit_fetched"
  - `source`: "cli"
  - `rawContent`: "Fetched starter kit v{{version}}, {{file_count}} files to update"

### 3. Backup Current State
- [ ] Create `.wxkanban/backup/` directory with timestamp
- [ ] Copy all files that will be modified
- [ ] Generate rollback script
- [ ] Call `project.capture_event` with:
  - `type`: "starter_kit_backup"
  - `source`: "cli"
  - `rawContent`: "Backup created at .wxkanban/backup/{{timestamp}}/"

### 4. Update Core Files
- [ ] Update `_wxAI/commands/*.md` — All AI command templates (now using MCP tools)
- [ ] Update `mcp-server/` — Full 017 MCP Project Hub server
- [ ] Update `ai-settings.json` — AI configuration with MCP server settings
- [ ] Update `CLAUDE.md` / `AI.md` — Project context templates with MCP tool references

### 5. Update Configuration
- [ ] Merge new settings into existing `ai-settings.json`
- [ ] Preserve project-specific variables
- [ ] Add new AI adapters if available
- [ ] Update MCP server configuration:
  - `command`: "node"
  - `args`: ["mcp-server/dist/index.js"]
  - `env`: DATABASE_URL, API_KEY, PROJECT_ID

### 6. Update Directory Structure
- [ ] Ensure `specs/` directory structure matches standard
- [ ] Ensure `checklists/` subdirectories exist
- [ ] Create missing `contracts/` directories

### 7. Verify and Report
- [ ] Validate all updated files
- [ ] Check for merge conflicts
- [ ] Call `project.capture_event` with:
  - `type`: "starter_kit_complete"
  - `source`: "cli"
  - `rawContent`: "Starter kit sync complete — {{updated_count}} files updated"

### 8. Create Report Document
- [ ] Call `project.upsert_document` with:
  - `title`: "Starter Kit Sync Report — {{timestamp}}"
  - `bodyMarkdown`: Full sync report (see Output Format)
  - `sourceEventId`: syncEventId
  - `tags`: ["starter-kit", "sync", "report"]

## Output Format
```
sync-starter-kit Report (MCP Project Hub)
=========================================
Event captured:      ✅ starter_kit_sync_started (event-id: xxx)

Current Version:     1.2.0
Target Version:      1.3.2

Files to Update:
  ✅ _wxAI/commands/task-push.md        (MCP tools update)
  ✅ _wxAI/commands/createSpecs.md     (renamed from wxAI-pipeline)
  ✅ mcp-server/                        (017 MCP Project Hub)
  🔄 ai-settings.json                   (MCP server config update)
  ⏭️  CLAUDE.md                          (unchanged)

Backup Created:      .wxkanban/backup/2026-02-22-143022/

MCP Server Update:
  ✅ tools/wxkanban-mcp.mjs → mcp-server/ (full 017 server)
  ✅ 6 core tools available:
     - project.capture_event
     - project.upsert_document
     - project.create_task
     - project.update_task_status
     - project.link_doc_to_task
     - project.list_open_items

Merge Conflicts:
  ⚠️  ai-settings.json — local modifications detected
      Use --force to overwrite, or resolve manually

MCP Tools Used:
  - project.capture_event: 4
  - project.upsert_document: 1

Report document:     ✅ Created in projectdocuments

Next Steps:
  1. Review changes in backup directory
  2. Resolve ai-settings.json conflicts
  3. Run `npm install` in mcp-server/ directory
  4. Test MCP server with `npm test`
  5. Commit changes to version control
```

## Safety Features
- Always creates backup before modifying files
- Dry-run mode shows changes without applying
- Force flag required to overwrite local modifications
- Rollback script generated for easy reversal
- All operations captured as events for audit trail

## Error Handling
- Network failures are retried 3 times
- File permission errors are logged with suggestions
- Merge conflicts pause for manual resolution (unless --force)
- Incomplete sync can be resumed
- All errors are captured as events for audit trail

## Related Commands
- `sync-cpl` — Sync CPL with database
- `createSpecs` — Generate new spec from scope (was wxAI-pipeline)

## MCP Integration Notes
- All sync operations are captured as events for complete audit trail
- Sync reports are stored as documents for future reference
- MCP server upgrade from legacy `tools/wxkanban-mcp.mjs` to full `mcp-server/`
- All AI commands now use `project.*` tools instead of `wxk_*` tools
- Use `project.list_open_items` to verify project state after sync
- Never use raw SQL — all data access through MCP tools
