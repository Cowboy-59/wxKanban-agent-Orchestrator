# AI Project Context

## Project Information
- **Project ID**: 73d25de9-aeca-4736-86ae-4df306f07a19
- **Mode**: New Project
- **Platform**: wxKanban
- **MCP Server**: 017 MCP Project Hub

## wxKanban Integration
This project is connected to wxKanban via the MCP Project Hub for AI-powered task management with full audit trail.

### Available Commands
All commands are in `_wxAI/commands/` directory:
- `task-push` — Push spec tasks to wxKanban (uses project.create_task)
- `task-done` — Mark tasks complete (uses project.update_task_status)
- `createSpecs` — Full spec pipeline (uses project.capture_event, project.upsert_document, project.create_task)
- `autofix-tests` — Autonomous test-fix pipeline (uses project.capture_event)
- `autofix-translation` — MSSQL → PostgreSQL translation (uses project.capture_event)
- `sync-cpl` — Sync CPL with database (uses project.* tools)
- `sync-starter-kit` — Sync with starter kit (uses project.capture_event)

### MCP Tools Available (via MCP Project Hub)
- `project.capture_event` — Capture any AI interaction with full audit trail
- `project.upsert_document` — Create/update specs, docs, and ADRs
- `project.create_task` — Create a new task with event linking
- `project.update_task_status` — Update task status (todo → in_progress → done)
- `project.link_doc_to_task` — Bidirectional linking between docs and tasks
- `project.list_open_items` — Query open tasks and documents for work queue

### MCP Server
The MCP server is located in `mcp-server/` directory:
- Preferred entry point: `mcp-server/dist/index-http.js`
- Transport: HTTP/SSE via `node scripts/setup-mcp.mjs`
- Health check: `GET http://localhost:3002/health`
- Auth: API key + role-based access control

## Getting Started
1. Ensure `ai-settings.json` has correct MCP server configuration
2. Run `npm install` in `mcp-server/` directory
3. Start MCP runtime: `node scripts/setup-mcp.mjs`
4. Validate runtime: `node scripts/mcp-health-check.mjs`
5. Use `createSpecs` to create your first spec

## Project Structure
- `specs/` — Specification documents
- `_wxAI/commands/` — AI command templates (using project.* tools)
- `_wxAI/` — Shared AI workspace assets (rules, commands, scripts, settings)
- `.vscode/` — VSCode settings including MCP configuration
- `mcp-server/` — 017 MCP Project Hub server

- `AI.md` — This file (project context)
- `.wxkanban-project.json` — Project configuration

## Rules
- Always use MCP tools for database operations — never raw SQL
- Capture events for all significant AI interactions
- DB is source of truth for task status
- Spec numbers are zero-padded (001, 002, ...)
