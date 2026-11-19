# Spec 011: New Project — AI-Ready Project Provisioning

**Branch**: `project-scope`
**Type**: feature / developer tooling / backend + frontend
**Status**: clarified
**Created**: 2026-02-22

---

## Overview

When a PM or Admin creates a new project in wxKanban, the system provisions a complete, AI-ready development environment — a **Project Kit** — containing all commands, MCP server configuration, settings, and directory structure needed for any AI tool (Claude Code, BLACKBOXAI, Cursor, Copilot, etc.) to immediately begin working on the project with full wxKanban task management integration.

The kit is delivered as a downloadable ZIP or via a CLI init command. It is AI-agnostic: all adapters (Claude Code, BLACKBOXAI, Cursor, Copilot) are included in a single `ai-settings.json` file. The DATABASE_URL is encrypted per-developer using AES-256-GCM so credentials never appear in plain text in the kit.

---

## User Scenarios & Testing

### US1 — New Project: Generate and Download Kit

**Actor**: Admin creates a new project and wants immediate AI tooling.

**Scenario**:
1. Admin opens "New Project" modal
2. Fills in project name, description, phase assignments
3. In the new "AI Tooling" section: toggle "Generate AI Project Kit" is ON (default), selects "BLACKBOXAI" as primary AI
4. Submits form → project created, kit generation starts async
5. Admin sees kit status badge: "Generating…"
6. Kit generation completes → notification `project_kit_ready` sent
7. Admin clicks "Download Kit" → receives `{project-slug}-kit.zip`
8. Admin extracts ZIP to local project directory
9. Adds `WXKANBAN_API_TOKEN` to `.env`
10. AI tool immediately has MCP access to wxKanban tasks

**Expected outcome**: ZIP contains all 7 kit components. MCP server connects to DB after adding API token.

---

### US2 — Kit Status Polling

**Actor**: Admin who just created a project wants to know when the kit is ready.

**Scenario**:
1. `GET /api/projects/:id/kit` returns `{ status: 'generating' }` immediately after creation
2. After async job completes, returns `{ status: 'ready', downloadUrl: '...', primaryAI: 'blackboxai' }`
3. Frontend polls every 3 seconds until status is `ready` or `failed`

**Expected outcome**: Status transitions from `generating` → `ready` within 5 seconds. Download URL is valid.

---

### US3 — CLI Init: Deploy Kit Locally

**Actor**: Developer wants to scaffold their local directory from the kit without downloading a ZIP.

**Scenario**:
1. Developer runs: `node tools/wxkanban-mcp.mjs --init <project_id>`
2. MCP server calls `GET /api/projects/:id/kit` to fetch kit manifest
3. Writes all kit files to current directory (non-destructively)
4. Outputs detection report showing files added/skipped
5. Prompts developer to add `WXKANBAN_API_TOKEN` to `.env`

**Expected outcome**: All kit files present in local directory. Existing files not overwritten.

---

### US4 — Import Existing Project

**Actor**: Developer has an existing project directory (e.g. `wxClaims/`) and wants to connect it to wxKanban.

**Scenario**:
1. Admin clicks "Import Existing Project" on Projects page
2. Fills in `ImportProjectModal`: project name, primary AI = "Claude Code"
3. Submits → project created in DB with `importMode: true`, kit generated as merge-safe
4. Downloads kit ZIP
5. Runs `node tools/wxkanban-mcp.mjs --init <project_id>` in existing directory
6. Detection report shows: existing `.claude/commands/` kept, `AI.md` added, `ai-settings.json` added, `AGENTS.md` flagged for migration
7. `tools/wxkanban-mcp.mjs` added (was not present)

**Expected outcome**: Existing files untouched. wxKanban kit files injected non-destructively. Detection report accurate.

---

### US5 — Encrypted DATABASE_URL

**Actor**: Developer downloads kit and checks that credentials are not exposed.

**Scenario**:
1. Developer downloads kit ZIP
2. Opens `.env` file — sees `DATABASE_URL_ENCRYPTED=<base64 string>`, NOT plain `DATABASE_URL`
3. Opens `tools/wxkanban-mcp.mjs` — sees decrypt-at-startup code
4. Adds `WXKANBAN_API_TOKEN=wxk_live_xxx` to `.env`
5. Runs `node tools/wxkanban-mcp.mjs` — MCP server starts, decrypts DB URL in memory
6. Checks git log — `.env` is in `.gitignore`, never committed

**Expected outcome**: Plain text `DATABASE_URL` never appears in any kit file. Decryption succeeds with correct API token.

---

### US6 — Kit Regeneration

**Actor**: Admin wants to update the kit after rotating DB credentials or updating command templates.

**Scenario**:
1. Admin calls `POST /api/projects/:id/kit/regenerate`
2. Old kit record updated to `status='generating'`
3. New kit assembled with latest template version and fresh encrypted DATABASE_URL
4. Status returns to `ready`
5. `kitversion` incremented

**Expected outcome**: New kit available for download. Old encrypted URL invalidated. `downloadcount` reset to 0.

---

### US7 — ProjectOverview.md Template (New Projects Only)

**Actor**: Developer opens the downloaded kit for a brand-new project.

**Scenario**:
1. Developer extracts kit ZIP
2. Finds `ProjectOverview.md` in project root
3. File contains placeholder sections: "What We Are Building", "Target Users", "Core Modules", etc.
4. Developer fills it out
5. Runs `/wxAI-pipeline` — AI reads `ProjectOverview.md` as primary input for spec generation

**Expected outcome**: `ProjectOverview.md` present in new project kits. NOT present in import kits.

---

## Functional Requirements

### FR-001 — AI Tooling Section in CreateProjectModal
The `CreateProjectModal` MUST include a new "AI Tooling" collapsible section with:
- Toggle: "Generate AI Project Kit" (default: ON)
- Dropdown: "Primary AI Tool" — options: `claude-code`, `blackboxai`, `cursor`, `copilot`, `generic` (default: `generic`)
- Field: "Local Project Directory" (optional, informational only — shown in kit download instructions)

### FR-002 — Extended Create Project API
`POST /api/projects` MUST accept two new optional fields:
- `generateKit: boolean` (default: `true`)
- `primaryAI: string` (one of: `claude-code`, `blackboxai`, `cursor`, `copilot`, `generic`)

Response MUST include:
```json
{
  "project": { ... },
  "scaffolding": "pending",
  "kit": {
    "downloadUrl": "/api/projects/:id/kit/download",
    "primaryAI": "blackboxai",
    "status": "generating"
  }
}
```

### FR-003 — Async Kit Generation
After project creation, the system MUST asynchronously generate the Project Kit via `KitGenerationService`. Kit generation MUST NOT block the project creation response. Kit generation MUST complete within 30 seconds for a standard project.

### FR-004 — Kit Contents
The generated kit MUST contain all of the following components:

| Component | File(s) |
|-----------|---------|
| AI Commands | `_wxAI-commands/task-push.md`, `task-done.md`, `wxAI-pipeline.md`, `autofix-tests.md`, `autofix-translation.md`, `sync-cpl.md`, `sync-starter-kit.md` |
| MCP Server | `tools/wxkanban-mcp.mjs` (pre-configured with project ID) |
| AI Settings | `ai-settings.json` (all 4 AI adapters included) |
| Project Context | `AI.md` (AI-agnostic), `CLAUDE.md` (thin alias to AI.md) |
| Project Config | `.wxkanban-project.json` |
| Environment | `.env` (with `DATABASE_URL_ENCRYPTED`), `.gitignore` |
| Overview Template | `ProjectOverview.md` (new projects only — NOT for imports) |

### FR-005 — Kit Database Schema
The system MUST create and maintain two new tables:

**`projectkits`**:
- `id` UUID PK
- `projectid` UUID FK → `projects.id` ON DELETE CASCADE
- `status` VARCHAR(50) — `'generating'`, `'ready'`, `'failed'`
- `primaryai` VARCHAR(50)
- `kitversion` VARCHAR(20)
- `kitcontent` JSONB — kit manifest (file list + metadata)
- `downloadcount` INTEGER DEFAULT 0
- `generatedat` TIMESTAMP NULLABLE
- `createdat` TIMESTAMP
- `updatedat` TIMESTAMP

**`projectkitfiles`**:
- `id` UUID PK
- `kitid` UUID FK → `projectkits.id` ON DELETE CASCADE
- `filepath` VARCHAR(500) — relative path within kit
- `filetype` VARCHAR(50) — `'command'`, `'mcp'`, `'settings'`, `'context'`, `'config'`, `'spec'`
- `content` TEXT — rendered file content with project variables substituted
- `createdat` TIMESTAMP

### FR-006 — Kit Status API
`GET /api/projects/:id/kit` MUST return:
```json
{
  "status": "ready",
  "primaryAI": "blackboxai",
  "kitVersion": "1.0.0",
  "downloadUrl": "/api/projects/:id/kit/download",
  "generatedAt": "2026-02-22T...",
  "downloadCount": 0
}
```
Returns `{ "status": "not_generated" }` if no kit exists for the project.

### FR-007 — Kit Download as ZIP
`GET /api/projects/:id/kit/download` MUST:
- Require authentication
- Generate a per-developer encrypted kit on-the-fly (DATABASE_URL encrypted with requesting user's API token)
- Return a `.zip` file with `Content-Disposition: attachment; filename="{project-slug}-kit.zip"`
- Increment `downloadcount` on the `projectkits` record
- Return 404 if kit status is not `ready`

### FR-008 — Per-Developer Encrypted DATABASE_URL
The kit's `.env` file MUST contain `DATABASE_URL_ENCRYPTED` (not plain `DATABASE_URL`). The encryption MUST use:
- Algorithm: AES-256-GCM
- Key: SHA-256 hash of the requesting user's `WXKANBAN_API_TOKEN` (32 bytes)
- IV: Random 12-byte nonce
- Format: `<iv_b64>.<ciphertext_b64>.<tag_b64>` (Base64 URL-safe)
- Plain text `DATABASE_URL` MUST NOT appear anywhere in the kit

### FR-009 — API Token Management
The system MUST support personal API tokens:
- Format: `wxk_live_<32 random hex chars>`
- Stored in `apitokens` table (hashed, not plain text)
- Scoped per-user, per-company
- Shown once on creation in Settings → API Tokens
- Revocable by user; revocation invalidates all kits encrypted with that token

### FR-010 — MCP Server Decrypt at Startup
`tools/wxkanban-mcp.mjs` MUST be updated to:
- Read `DATABASE_URL_ENCRYPTED` and `WXKANBAN_API_TOKEN` from `.env` at startup
- Decrypt `DATABASE_URL_ENCRYPTED` using AES-256-GCM with SHA-256(token) as key
- Hold decrypted URL in memory only — never write to disk
- Exit with error if either env var is missing

### FR-011 — CLI Init Command
`node tools/wxkanban-mcp.mjs --init <project_id>` MUST:
- Call `GET /api/projects/:id/kit` to fetch kit manifest
- Write all kit files to current directory non-destructively (skip existing files)
- Output a detection report (files added, files skipped, migration suggestions)
- Prompt user to add `WXKANBAN_API_TOKEN` to `.env`

### FR-012 — Import Existing Project
`POST /api/projects/import` MUST:
- Accept same fields as `POST /api/projects` plus `importMode: true`
- Create project record in DB
- Generate a merge-safe kit (all files marked add-if-missing or merge-only)
- NOT include `ProjectOverview.md` in the kit (import projects have existing docs)
- Return same response shape as `POST /api/projects`

### FR-013 — ImportProjectModal
A new `ImportProjectModal.tsx` component MUST be added to the Projects page with fields:
- Project Name (required)
- Description (optional)
- Primary AI Tool (dropdown)
- Local Directory Path (optional, informational)
- Tags / Labels (optional)
- Phase Assignments (same as CreateProjectModal)

### FR-014 — Non-Destructive Kit Injection
When `--init` runs on an existing directory, the system MUST follow these rules:
- **NEVER overwrite**: existing `.claude/commands/*.md`, existing `CLAUDE.md`, existing `ai-settings.json`, existing `tools/` files, any source code
- **ADD if missing**: `_wxAI-commands/` directory, `tools/wxkanban-mcp.mjs`, `AI.md`, `.wxkanban-project.json`, `.env.example`
- **MERGE (append only)**: `ai-settings.json` — add `mcpServers.wxkanban` block if not present; `CLAUDE.md` — append wxKanban section at bottom if not present
- **FLAG for human review**: `AGENTS.md`, `AIRules/`, `.claude/commands/` with dot-notation files

### FR-015 — Detection Report
After `--init` on an existing directory, the command MUST output a structured detection report showing: detected items (with classification), files added, files skipped, merge actions taken, migration suggestions, and next steps.

### FR-016 — Kit Regeneration
`POST /api/projects/:id/kit/regenerate` (ADMIN only) MUST:
- Set kit status to `generating`
- Re-run `KitGenerationService` with latest template version
- Increment `kitversion`
- Reset `downloadcount` to 0
- Send `project_kit_ready` notification on completion

### FR-017 — Notifications
The system MUST send notifications for kit lifecycle events:
- `project_kit_ready` — sent to project creator when kit generation completes
- `project_kit_failed` — sent to project creator + all ADMIN users when kit generation fails

### FR-018 — Kit Template Versioning
Kit templates MUST be versioned. `kitversion` stored in `projectkits` table. Current version: `1.0.0`. Version incremented on regeneration.

### FR-019 — Variable Substitution
All kit files MUST have project-specific variables substituted at generation time:
- `{{project_uuid}}` → actual project UUID
- `{{project_name}}` → project name
- `{{project_slug}}` → URL-safe slug of project name
- `{{wxkanban_api_url}}` → API base URL from server config
- `{{current_phase}}` → project's current phase
- `{{created_date}}` → ISO date string
- `{{created_by}}` → creator's full name

### FR-020 — AI.md Content
The generated `AI.md` MUST include: project ID, wxKanban URL, current phase, team assignments table, tech stack (from AI scaffolding overview), active specs list, available AI commands, available MCP tools, and project rules.

### FR-021 — ai-settings.json Multi-AI Adapters
The generated `ai-settings.json` MUST include adapter instructions for all 4 AI tools (Claude Code, BLACKBOXAI, Cursor, Copilot) regardless of which `primaryAI` was selected. The `primaryAI` only affects which adapter's instructions are shown first.

### FR-022 — ProjectOverview.md (New Projects Only)
`ProjectOverview.md` MUST be included in kits for new projects (not imports). It MUST be a human-fillable template with sections: "What We Are Building", "Target Users", "Core Modules / Features", "Tech Stack", "Key Constraints or Requirements", "Out of Scope". The `/wxAI-pipeline` command MUST read this file as primary input.

### FR-023 — MCP Server Build Configuration & Type Validation
The MCP server's `config.ts` file MUST properly initialize `EMBEDDED_DATABASE_URL` to satisfy TypeScript's `EmbeddedCredentials` interface. Because the value is replaced at build time by kit generation, the build-time placeholder MUST include all required interface fields:
```typescript
const EMBEDDED_DATABASE_URL: EmbeddedCredentials | undefined = {
  encrypted: '',
  iv: '',
  authTag: '',
  version: '1.0.0', // REQUIRED by interface
};
```
Kit generation (`KitGenerationService`) MUST inject the actual encrypted credentials matching this structure. TypeScript build MUST pass without errors before any kit is delivered.

### FR-024 — Init MUST Bootstrap Repository Memory Rule
When running `node tools/wxkanban-mcp.mjs --init <project_id>`, the installer MUST create `memories/repo/spec-first-rule.md` if it does not already exist. The file MUST document the mandatory spec-first workflow:
- read spec first,
- check plan and gates,
- stop and ask user if requirement is missing,
- update spec before implementation.

This bootstrap MUST be non-destructive and MUST NOT overwrite an existing `memories/repo/spec-first-rule.md`.

### FR-025 — MCP Runtime Contract for Kit Installs
Project kit startup MUST enforce a deterministic MCP runtime contract:
- startup target is HTTP mode on port `3002` by default,
- env precedence is `process env > root .env > mcp-server/.env`,
- central MCP DB config is independent from app DB config,
- DB source priority is `WXKANBAN_MCP_DATABASE_URL` → embedded credentials (if populated) → `DATABASE_URL_ENCRYPTED` + `WXKANBAN_API_TOKEN` → `DATABASE_URL`.

The MCP database is for wxKanban specs/lifecycle/reference data only. The application itself may use a different database or no database.

### FR-026 — Buildscope Guided Input Handling
`buildscope` in kit CLI bridge MUST support guided mode without requiring `--feature-description` up front. If positional input looks like a scope filename (for example `001-websocket.md`), CLI MUST interpret it as spec context (`editSpecNumber=001`) rather than literal feature description text.

---

## Success Criteria

1. After creating a new project with `generateKit: true`, `GET /api/projects/:id/kit` returns `status: 'ready'` within 30 seconds
2. Downloaded ZIP contains all 7 kit components (commands, MCP, settings, context, config, env, overview)
3. Plain text `DATABASE_URL` does NOT appear anywhere in the kit ZIP
4. `node tools/wxkanban-mcp.mjs --init <project_id>` scaffolds local directory non-destructively
5. Import existing project: existing files untouched, kit files injected, detection report accurate
6. `POST /api/projects/import` creates project + kit with `importMode: true` (no `ProjectOverview.md`)
7. Kit regeneration produces new `kitversion`, new encrypted URL, `downloadcount` reset to 0
8. `project_kit_ready` notification delivered to project creator on kit completion
9. `--init` bootstraps `memories/repo/spec-first-rule.md` when missing, and preserves existing file content when present
10. Fresh kit install starts MCP HTTP successfully on default `3002` without manual env-export/decrypt workarounds
11. `project.buildscope` can be invoked in guided mode from kit CLI bridge when only partial input is provided
12. MCP startup uses central wxKanban DB configuration independently from app DB configuration

---

## Key Entities

| Entity | Description |
|--------|-------------|
| Project Kit | Complete AI-ready package generated per project |
| `projectkits` | DB record tracking kit status, version, manifest |
| `projectkitfiles` | Individual rendered files within a kit |
| `apitokens` | Personal API tokens used as encryption keys |
| `DATABASE_URL_ENCRYPTED` | AES-256-GCM encrypted DB connection string |
| `WXKANBAN_API_TOKEN` | Per-developer token; decryption key for DB URL |
| `AI.md` | AI-agnostic project context file |
| `ai-settings.json` | Universal settings with all AI adapter configs |
| `_wxAI-commands/` | AI-agnostic command files directory |
| `ProjectOverview.md` | Human-fillable project synopsis (new projects only) |
| `--init` flag | MCP server CLI mode for local directory scaffolding |

---

## Constraints

- Kit generation MUST be async — MUST NOT block project creation response
- Plain text `DATABASE_URL` MUST NOT appear in any kit file
- `--init` MUST be non-destructive — MUST NOT overwrite existing files
- `ProjectOverview.md` MUST NOT be included in import kits
- Kit download MUST require authentication (per-developer encryption)
- `POST /api/projects/import` route MUST be registered BEFORE `POST /api/projects/:id` to avoid route collision
- Kit ZIP generation MUST use streaming to avoid memory issues for large kits
- All kit template files MUST use `{{args}}` placeholder syntax (AI-agnostic, not Claude-specific `$ARGUMENTS`)
