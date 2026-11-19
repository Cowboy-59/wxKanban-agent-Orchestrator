# Spec 011: New Project — AI-Ready Project Provisioning

**Spec Number**: 011  
**Status**: `clarified`  
**Created**: 2026-02-22  
**Depends On**: Spec 007 (Project Layout), Spec 009 (Task & Lifecycle)  
**Source**: `specs/Project-Scope/011-Scope-NewProject.md`

---

## Overview ##

When a PM or Admin creates a new project in wxKanban, the system must provision a complete, AI-ready development environment — including all commands, MCP server configuration, settings, and directory structure — so that any AI tool (Claude Code, BLACKBOXAI, Cursor, Copilot, etc.) can immediately begin working on the project with full access to the wxKanban task management system.

---

## Core Problem ##

Today, setting up AI tooling for a project is a manual process:
- Commands must be copied or symlinked manually
- MCP server must be registered in each AI's settings file by hand
- Project context (CLAUDE.md, rules, specs directory) must be created manually
- The process is Claude Code-specific and not portable to other AIs

**Goal**: When a new project is created in wxKanban, the system generates and delivers a **Project Kit** — a complete, AI-agnostic package that any developer can drop into their local environment and immediately have full AI + wxKanban integration working.

---

## Data Hierarchy ##

```text
Company
  └── Project (created by ADMIN/MANAGER)
        └── Project Kit (generated on create)
              ├── AI Commands (_wxAI-commands/)
              ├── MCP Server (tools/wxkanban-mcp.mjs)
              ├── AI Settings (ai-settings.json)
              ├── Project Context (AI.md / CLAUDE.md)
              ├── Directory Structure (specs/, src/, docs/)
              └── Project Config (.wxkanban-project.json)
```

---

## Project Kit — What Gets Provisioned ##

When a new project is created, the system generates a **Project Kit** containing:

### 1. AI Commands Directory (`_wxAI-commands/`) ###

All standardized, AI-agnostic command files (see TODO-B standardization):

| File | Purpose |
|------|---------|
| `task-push.md` | Push spec tasks to tasks.md + wxKanban DB |
| `task-done.md` | Mark tasks complete in tasks.md + DB |
| `wxAI-pipeline.md` | Full spec pipeline: specify → clarify → plan → tasks |
| `autofix-tests.md` | Autonomous test-fix pipeline |
| `autofix-translation.md` | MSSQL → PostgreSQL translation pipeline |
| `sync-cpl.md` | Sync CPL launcher |
| `sync-starter-kit.md` | Sync project with starter kit |

Commands use `{{args}}` placeholder (AI-agnostic) and `{{ai_config_dir}}` for AI-specific config paths.

### 2. MCP Server (`mcp-server/`) ###

The 017 MCP Project Hub server, pre-configured with:
- Project ID embedded in config
- Database connection via Drizzle ORM
- All MCP tools: `project.capture_event`, `project.upsert_document`, `project.create_task`, `project.update_task_status`, `project.link_doc_to_task`, `project.list_open_items`
- Event-sourced architecture with full audit trail
- Role-based access control (read_only, editor, admin)
- Zod validation on all inputs

**Server Structure:**
```
mcp-server/
├── src/
│   ├── server.ts          # MCP server with 6 core tools
│   ├── index.ts           # Entry point (stdio transport)
│   ├── config.ts          # Environment configuration
│   ├── db/
│   │   ├── connection.ts  # PostgreSQL connection pool
│   │   └── schema.ts      # Drizzle ORM schema
│   ├── auth/
│   │   ├── auth-context.ts # Auth types
│   │   └── role-checker.ts # Permission checking
│   └── utils/
│       ├── logger.ts      # Audit logging
│       └── schemas.ts     # Zod validation schemas
├── package.json
├── tsconfig.json
└── README.md
```


### 3. AI Settings File (`ai-settings.json`) ###

A universal settings file with MCP server registration. Includes per-AI adapter notes:

```json
{
  "_comment": "wxKanban AI Settings — works with Claude Code, BLACKBOXAI, Cursor, Copilot",
  "project": {
    "id": "{{project_uuid}}",
    "name": "{{project_name}}",
    "wxkanban_url": "{{wxkanban_api_url}}"
  },
  "mcpServers": {
    "wxkanban": {
      "command": "node",
      "args": ["mcp-server/dist/index-http.js"],
      "env": {
        "MCP_HTTP_PORT": "3002",
        "API_KEY": "{{api_key}}",
        "PROJECT_ID": "{{project_uuid}}",
        "WXKANBAN_MCP_DATABASE_URL": "{{database_url}}"
      }
    }
  },
  "aiAdapters": {
    "claude-code": {
      "settingsFile": ".claude/settings.json",
      "commandsDir": ".claude/commands/",
      "note": "Copy mcpServers block into .claude/settings.json. Symlink _wxAI-commands/ to .claude/commands/"
    },
    "blackboxai": {
      "settingsFile": "_wxAI-global/settings.json",
      "commandsDir": "_wxAI-global/commands/",
      "note": "Copy mcpServers block into _wxAI-global/settings.json"
    },
    "cursor": {
      "settingsFile": ".cursor/mcp.json",
      "commandsDir": ".cursor/rules/",
      "note": "Copy mcpServers block into .cursor/mcp.json. Copy _wxAI-commands/ to .cursor/rules/"
    },
    "copilot": {
      "settingsFile": ".github/copilot-instructions.md",
      "commandsDir": ".github/",
      "note": "Add MCP server config to workspace settings. Copy commands as GitHub Copilot instructions."
    }
  }
}
```

### 4. Project Context File (`AI.md`) ###

AI-readable project context file (equivalent to CLAUDE.md but AI-agnostic):

```markdown
# {{project_name}} — AI Project Context

**Project ID**: {{project_uuid}}
**wxKanban URL**: {{wxkanban_api_url}}
**Current Phase**: {{current_phase}}
**Created**: {{created_date}}

## Team
{{phase_assignments_table}}

## Tech Stack
{{tech_stack_from_overview}}

## Active Specs
{{spec_stubs_list}}
<!-- 2026-09-22: renders empty for a new project — auto-generated scope stubs were
     withdrawn (SPEC-008 FR-008, Clarification Q6). Scopes appear here once created by
     buildscope, the web "new scope" action, or an accepted feedback seed. -->

## AI Commands Available
- `/task-push <spec_number>` — push tasks to DB
- `/task-done <spec_number> <task_id>` — mark task complete
- `/createSpecs <description>` — full spec pipeline (was /wxAI-pipeline)

## MCP Tools Available (via MCP Project Hub)
- `project.capture_event` — capture any AI interaction with full audit trail
- `project.upsert_document` — create/update specs, docs, and ADRs
- `project.create_task` — create a new task with event linking
- `project.update_task_status` — update task status (todo → in_progress → done)
- `project.link_doc_to_task` — bidirectional linking between docs and tasks
- `project.list_open_items` — query open tasks and documents for work queue


## Rules
- Always use MCP tools for database operations — never raw SQL
- Capture events for all significant AI interactions
- Always update tasks.md before marking complete in DB
- DB is source of truth for task status
- Spec numbers are zero-padded (001, 002, ...)

```

### 5. Directory Structure ###

```text
{project-slug}/
  ├── AI.md                          # AI project context (AI-agnostic)
  ├── CLAUDE.md                      # Claude Code alias → AI.md
  ├── ai-settings.json               # Universal AI settings + MCP config
  ├── .wxkanban-project.json         # Project config (ID, API URL, phase)
  ├── _wxAI-commands/                # AI-agnostic command files
  │   ├── task-push.md
  │   ├── task-done.md
  │   ├── createSpecs.md             # Renamed from wxAI-pipeline.md
  │   ├── autofix-tests.md
  │   ├── autofix-translation.md
  │   ├── sync-cpl.md
  │   └── sync-starter-kit.md
  ├── _wxAI-global/                  # BLACKBOXAI global settings storage
  │   └── settings.json              # BLACKBOXAI MCP server configuration
  ├── mcp-server/                    # 017 MCP Project Hub server
  │   ├── src/
  │   ├── package.json
  │   ├── tsconfig.json
  │   └── README.md
  ├── specs/
  │   ├── Project-Scope/             # High-level scope docs
  │   └── {NNN}-{spec-name}/        # Per-spec directories (auto-generated)
  │       ├── spec.md
  │       └── tasks.md
  ├── docs/                          # Project documentation
  ├── src/                           # Source code
  └── TODO.md                        # Current task tracking
```

### 6. Project Config (`.wxkanban-project.json`) ###

Machine-readable config file used by commands and MCP:

```json
{
  "projectId": "{{project_uuid}}",
  "projectName": "{{project_name}}",
  "apiUrl": "{{wxkanban_api_url}}",
  "currentPhase": "{{current_phase}}",
  "specDir": "specs/",
  "commandsDir": "_wxAI-commands/",
  "mcpServer": "tools/wxkanban-mcp.mjs"
}
```

### 7. Project Overview (`ProjectOverview.md`) — NEW PROJECTS ONLY ###

A human-fillable template created **only for new projects** (not for existing project imports). The PM or lead developer fills this out with a short synopsis of the project design before AI scaffolding begins.

```markdown
# {{project_name}} — Project Overview

**Project ID**: {{project_uuid}}
**Created**: {{created_date}}
**Owner**: {{created_by}}

---

## What We Are Building

<!-- Short synopsis: 2-5 sentences describing the project purpose and goals -->

## Target Users

<!-- Who will use this? (e.g. internal staff, customers, admins) -->

## Core Modules / Features

<!-- List the main areas of functionality (bullet points) -->
-
-
-

## Tech Stack (if known)

<!-- Languages, frameworks, databases, hosting -->

## Key Constraints or Requirements

<!-- Deadlines, compliance, integrations, performance requirements -->

## Out of Scope

<!-- What this project explicitly does NOT cover -->

---

_Fill out this file before running `/wxAI-pipeline` or `/task-push`.
The AI will use this as the primary input for spec generation and task planning._
```

**Rules:**
- Created automatically when a new project is created (kit generation Step 3)
- Stored locally in the project root — NOT synced to DB (it is a working document)
- The AI reads `ProjectOverview.md` as the first input when running `/wxAI-pipeline`
- If `ProjectOverview.md` is empty or only has placeholder text, `/wxAI-pipeline` will prompt the user to fill it out first
- **NOT created for existing project imports** — those projects already have their own documentation structure

---

## New Project Flow ##

### Step 1 — UI: Create Project Modal ###

Existing `CreateProjectModal.tsx` extended with:

- **AI Tooling** section (new):
  - Toggle: "Generate AI Project Kit" (default: ON)
  - Dropdown: "Primary AI Tool" — Claude Code / BLACKBOXAI / Cursor / Copilot / Generic
  - Field: "Local Project Directory" (optional — for kit download path hint)

### Step 2 — API: Create Project ###

`POST /api/projects` — existing endpoint extended:

**Request additions:**
```json
{
  "generateKit": true,
  "primaryAI": "blackboxai"
}
```

**Response additions:**
```json
{
  "project": { ... },
  "scaffolding": "pending",
  "kit": {
    "downloadUrl": "/api/projects/:id/kit/download",
    "initCommand": "node tools/wxkanban-mcp.mjs --init",
    "primaryAI": "blackboxai",
    "setupInstructions": "..."
  }
}
```

### Step 3 — Async: Kit Generation ###

After project creation, async job generates the Project Kit:

1. **Generate AI.md** — from project overview (AI scaffolding Step 1 from spec 007)
2. ~~**Generate spec stubs** — from AI scaffolding Step 2 (spec 007)~~ — **WITHDRAWN 2026-09-22** (SPEC-008 FR-008, Clarification Q6). Scaffolding Step 2 no longer exists; the kit is assembled with whatever scopes the project actually has, which for a new project is none.
3. **Assemble kit files** — commands, MCP server, settings, directory structure
4. **Store kit** — in `projectkits` table (see schema below)
5. **Notify** — send `project_kit_ready` notification to project creator

### Step 4 — Download / Deploy ###

Two delivery methods:

**A) Download ZIP** — `GET /api/projects/:id/kit/download`
- Returns a `.zip` file containing the full Project Kit
- User extracts to their local development directory

**B) CLI Init** — `node tools/wxkanban-mcp.mjs --init <project_id>`
- Pulls kit from API and scaffolds local directory
- Equivalent to the existing `/project.init` command concept from spec 007

### Step 5 — AI Setup ###

After extracting the kit, the developer runs the AI-specific setup:

**Claude Code:**
```bash
# Copy MCP config to Claude settings
cat ai-settings.json | jq '.mcpServers' >> ~/.claude/settings.json
# Symlink commands
ln -s _wxAI-commands/ .claude/commands
```

**BLACKBOXAI:**
```bash
# Copy MCP config to BLACKBOXAI settings
cat ai-settings.json | jq '.mcpServers' >> _wxAI-global/settings.json
```

**Cursor:**
```bash
# Copy MCP config to Cursor settings
cat ai-settings.json | jq '.mcpServers' >> .cursor/mcp.json
```

The `ai-settings.json` `aiAdapters` section provides exact instructions per AI tool.

---

## Schema ##

### `apitokens` (new table — created in spec 011) ###

```text
id              UUID PK
userid          UUID FK → userprofiles.id  ON DELETE CASCADE
companyid       UUID FK → companies.id     ON DELETE CASCADE
tokenprefix     VARCHAR(20)    -- first 8 chars of token for display (e.g. 'wxk_live')
tokenhash       VARCHAR(255)   -- SHA-256 hash of full token (for lookup/validation)
tokenencrypted  TEXT           -- AES-256-GCM encrypted full token (server-side key)
                               -- Required so server can decrypt token to use as kit encryption key
name            VARCHAR(100)   -- user-assigned label (e.g. 'My Laptop')
lastusedat      TIMESTAMP NULLABLE
revokedat       TIMESTAMP NULLABLE
createdat       TIMESTAMP
updatedat       TIMESTAMP
```

**Note:** Both `tokenhash` (for fast lookup/validation) and `tokenencrypted` (for server-side decryption) are stored. The server-side encryption key for `tokenencrypted` is a secret stored in environment variables (`API_TOKEN_ENCRYPTION_KEY`), separate from the user's token itself.

### `projectkits` (new table) ###

```text
id              UUID PK
projectid       UUID FK → projects.id  ON DELETE CASCADE
status          VARCHAR(50)   -- 'generating', 'ready', 'failed'
primaryai       VARCHAR(50)   -- 'claude-code', 'blackboxai', 'cursor', 'copilot', 'generic'
kitversion      VARCHAR(20)   -- semantic version of the kit template used
kitcontent      JSONB         -- full kit manifest (file list + metadata)
downloadcount   INTEGER       -- how many times kit was downloaded
generatedat     TIMESTAMP NULLABLE
createdat       TIMESTAMP
updatedat       TIMESTAMP
```

### `projectkitfiles` (new table) ###

```text
id          UUID PK
kitid       UUID FK → projectkits.id  ON DELETE CASCADE
filepath    VARCHAR(500)   -- relative path within kit (e.g. '_wxAI-commands/task-push.md')
filetype    VARCHAR(50)    -- 'command', 'mcp', 'settings', 'context', 'config', 'spec'
content     TEXT           -- file content (rendered with project variables)
createdat   TIMESTAMP
```

---

## API Routes ##

| Method | Route | Description | Access |
| ------ | ----- | ----------- | ------ |
| POST | `/api/projects` | Create project (extended with `generateKit`, `primaryAI`) | ADMIN |
| GET | `/api/projects/:id/kit` | Get kit status + manifest | Assigned user |
| GET | `/api/projects/:id/kit/preflight` | Validate server-side prerequisites for download | Assigned user |
| GET | `/api/projects/:id/kit/download` | Download kit archive | Assigned user |
| POST | `/api/projects/:id/kit/generate` | Generate/regenerate kit | Assigned user |
| GET | `/api/projects/:id/scaffold` | Existing scaffold endpoint (extended) | Assigned user |

"Assigned user" = ADMIN of the project's company, OR any user with a row in `projectusers` for the target project, OR the user assigned as lead of any of the project's phases. See "Access Control" below.

---

## Access Control ##

Kit generate / preflight / download endpoints were originally ADMIN-only. They are now widened so that any user **assigned to the project** can build and download their own kit.

**Rationale**: Team members doing active development on a project need the kit (AI commands, MCP server, encrypted DB URL) to work. Forcing admins to generate and hand-distribute kits is a bottleneck and does not match the per-developer-encrypted-credentials design (each developer already gets their own `WXKANBAN_API_TOKEN` at download time).

**Rules**:

1. **ADMIN** of the project's company: full kit access (generate, preflight, download) for every project in that company. No project-assignment check required.
2. **TEAM_MANAGER** or **TEAM_MEMBER**: full kit access (generate, preflight, download), but ONLY for projects where the user is assigned — meaning at least one of:
   - A row exists in `projectusers` with `userid = <requesting user>` and `projectid = <target project>` (active; `removedat IS NULL`), OR
   - The user is assigned as the lead of at least one **in-progress** phase of the target project (`projectphases.assigneduserid = <requesting user> AND projectphases.status = 'in_progress'`). The `in_progress` qualifier matches `ProjectService.getUserProjects` — so "I can see this project on my dashboard" ⇔ "I can build/download its kit".
3. Non-admin users with no assignment to the target project MUST receive HTTP 403 on generate / preflight / download, with a message explaining the assignment requirement.
4. The UI MUST hide kit action buttons (Generate / Check Prerequisites / Download) for users who are not assigned to the project. The KitManager status panel (read-only info about kit state) remains visible to any authenticated user who can view the project.
5. Generation is still per-request: each successful generate/download creates a fresh `WXKANBAN_API_TOKEN` for the downloading user. Multiple team members may each have their own live kit for the same project — this is by design.
6. The server-side enforcement in rules 1–3 is authoritative. The UI visibility in rule 4 is a convenience; a hand-crafted request from a non-assigned user MUST still be rejected server-side.

**Out of scope**: Revoking an existing kit when a user is removed from a project assignment. The user's `WXKANBAN_API_TOKEN` remains valid until manually revoked via the `/api/user/tokens/:id` DELETE endpoint.

---

## Success Criteria ##

1. **Kit Generation**: When a new project is created with `generateKit: true`, the system generates a complete Project Kit within 30 seconds
2. **Kit Status**: `GET /api/projects/:id/kit` returns accurate kit status (`generating`, `ready`, `failed`)
3. **Kit Download**: `GET /api/projects/:id/kit/download` returns a valid kit package with all 7 standard files when kit status is `ready`
4. **Encrypted Credentials**: `DATABASE_URL_ENCRYPTED` in the kit is encrypted with the requesting user's API token and can only be decrypted with that token
5. **Idempotent Generation**: Regenerating a kit updates existing kit files without creating duplicates
6. **Multi-AI Support**: Kit includes AI-agnostic commands that work with Claude Code, BLACKBOXAI, Cursor, and Copilot
7. **Notification**: Project creator receives `project_kit_ready` notification when kit generation completes
8. **API Token Security**: API tokens are stored encrypted (not hashed) so server can decrypt for kit encryption; tokens are shown only once on creation

---

## Key Entities ##

| Entity | Table/Service | Description |
|--------|---------------|-------------|
| `apitokens` | `apitokens` | Stores user API tokens with encrypted full token for kit encryption |
| `projectkits` | `projectkits` | Tracks kit generation status, version, and metadata per project |
| `projectkitfiles` | `projectkitfiles` | Stores individual kit file contents (commands, settings, configs) |
| `KitGenerationService` | Service | Async service that generates kit files and stores in database |
| `KitEncryptionService` | Service | AES-256-GCM encryption for DATABASE_URL using API token as key |
| `ApiTokenService` | Service | Manages API token creation, validation, and revocation |
| Project Kit | Package | Complete AI-ready package with commands, MCP server, and settings |
| `DATABASE_URL_ENCRYPTED` | Field | Per-developer encrypted database credentials |


---

## Implementation Status ##

| Component | Status | Notes |
|-----------|--------|-------|
| Database Schema (apitokens, projectkits, projectkitfiles) | ✅ Complete | Migration 0013 applied successfully |
| KitEncryptionService | ✅ Complete | AES-256-GCM roundtrip verified |
| ApiTokenService | ✅ Complete | CRUD operations working |
| KitGenerationService | 🔄 In Progress | Updating to include 017 mcp-server/ |
| API Routes (/api/projects/:id/kit/*) | ✅ Complete | All endpoints implemented |
| AI Command Templates | 🔄 In Progress | Updating to use project.* tools |
| MCP Server (017 mcp-server/) | ✅ Complete | Phase 1 complete, 6 tools implemented |
| Legacy MCP Server (tools/wxkanban-mcp.mjs) | ⏳ Deprecated | Replaced by 017 mcp-server/ |
| Frontend KitManager | 🔄 In Progress | Component structure complete |
| Frontend ProjectSetupWizard | 🔄 In Progress | Browse button path handling improved |
| Kit Download with Encryption | ✅ Complete | Per-developer encryption at download |
| Notification Service | ✅ Complete | `project_kit_ready` notifications |
| 017 MCP Integration | 🔄 In Progress | Spec 011 kit now uses 017 MCP server |


---

## Constraints ##

The following constraints apply to the implementation of Spec 011:


1. **Security**: Plain text `DATABASE_URL` must never be stored in the kit or transmitted to the client. Only `DATABASE_URL_ENCRYPTED` is included in the downloaded kit.

2. **Per-Developer Encryption**: Each developer who downloads the kit must receive a version encrypted with their own API token. Cached kit files must not include the encrypted URL.

3. **Idempotency**: Kit generation should be idempotent — running generation multiple times with the same parameters should produce the same result.

4. **Async Generation**: Kit generation must be asynchronous to avoid blocking the project creation API response. The UI should poll for status.

5. **Token One-Time Display**: Full API tokens must only be shown once at creation time. Subsequent retrievals should only show the prefix.

6. **FK Constraints**: The `projectkits.projectid` FK must reference `companyprojects.id` with `ON DELETE CASCADE`. Same for `projectkitfiles.kitid` referencing `projectkits.id`.

7. **Non-Blocking Import**: Existing project files must never be overwritten during import. The kit must be merge-safe.

---

## Clarifications ##

Key design decisions from implementation:

| # | Question | Decision |
|---|----------|---------|
| C1 | API Token storage format | Store both `tokenhash` (for lookup) and `tokenencrypted` (server-side decryptable with `API_TOKEN_ENCRYPTION_KEY`) |
| C2 | Kit caching strategy | Static files cached in `projectkitfiles`; `DATABASE_URL_ENCRYPTED` computed fresh at download time using requesting user's decrypted API token |
| C3 | Multi-AI command syntax | Use `{{args}}` placeholder (AI-agnostic) instead of Claude-specific `$ARGUMENTS` |
| C4 | Import vs New project split | Spec 011 = New projects with full kit; Spec 012 = Existing project import with non-destructive merge |
| C5 | Kit file overwrite policy | Never overwrite existing files during import; merge `ai-settings.json` only; flag legacy files for human review |

---

## Notes ##

- Kit generation is **asynchronous** — UI polls `GET /api/projects/:id/kit` for status
- API tokens are **shown only once** at creation time; subsequent views show only prefix
- `DATABASE_URL_ENCRYPTED` is **computed at download time**, never stored in kit cache
- The Project Kit is **read-only** from DB perspective — local changes don't sync back
- `CLAUDE.md` in the kit is a thin alias/redirect to `AI.md` for Claude Code compatibility
- Future enhancement: npm package delivery (`npx wxkanban-init <project_id>`)
