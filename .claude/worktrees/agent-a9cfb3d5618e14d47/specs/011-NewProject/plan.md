# Implementation Plan: New Project — AI-Ready Project Provisioning

**Branch**: `project-scope` | **Date**: 2026-02-22 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/Project-Scope/011-Scope-NewProject.md`

---

## Summary

When a new project is created in wxKanban, the system generates a **Project Kit** — a complete, AI-agnostic package containing AI commands, MCP server config, settings, project context, directory structure, and project config. The kit is delivered as a downloadable ZIP or via `node tools/wxkanban-mcp.mjs --init <project_id>`. DATABASE_URL is encrypted per-developer using AES-256-GCM so credentials never appear in plain text.

The implementation spans: DB schema (2 new tables), backend services (KitGenerationService, KitEncryptionService), API routes (kit status, download, regenerate, import), frontend (CreateProjectModal extension, ImportProjectModal), and MCP server extension (`--init` flag + encrypted DB URL decrypt).

---

## Technical Context

**Type**: Full-stack feature — DB + backend services + API routes + frontend components + MCP server
**Language/Version**: TypeScript (backend/frontend), JavaScript ESM (MCP server)
**Primary Dependencies**: `archiver` (ZIP generation), `crypto` (Node.js built-in, AES-256-GCM), existing `wxkanban-mcp.mjs`
**Storage**: PostgreSQL via Drizzle ORM — new `projectkits`, `projectkitfiles`, `apitokens` tables
**Testing**: Manual verification via kit download, `--init` CLI, MCP server startup
**Target Platform**: wxKanban server + developer workstations
**Performance Goals**: Kit generation completes within 30 seconds; ZIP download streams (no full in-memory buffer)
**Constraints**: Kit generation async (non-blocking); plain text DATABASE_URL never in kit; `--init` non-destructive

---

## Constitution Check

| Gate | Status | Notes |
|------|--------|-------|
| TypeScript only | ✅ Pass | All new server/client code in TypeScript; MCP server is existing JS ESM |
| No console.log | ✅ Pass | Use `createLogger` from `~/server/lib/logger.js` |
| No `any` types | ✅ Pass | All types explicitly defined |
| Security: no secrets | ✅ Pass | DATABASE_URL encrypted; API tokens hashed in DB; plain text never in kit |
| Dark/light mode | ✅ Pass | New modal components use existing Tailwind dark: classes |
| No toast messages | ✅ Pass | Kit status shown via polling badge, not toasts |
| Database naming conventions | ✅ Pass | All new tables use lowercase, no underscores in column names |

**Gate Result**: PASS

---

## Known Issues & Build Gates

### Issue 1: MCP Server Build — EmbeddedCredentials Type Validation (RECURRING)

**Status**: ⚠️ KNOWN ISSUE — Occurs in every kit generated
**Symptom**: `npm run build` fails in mcp-server with:
```
error TS2741: Property 'version' is missing in type 'undefined'
  at src/config.ts:34
  const EMBEDDED_DATABASE_URL: EmbeddedCredentials | undefined = undefined;
                                                                  ^
```

**Root Cause**: 
- `EmbeddedCredentials` interface requires `version: string` field (defined in `src/utils/embedded-crypto.ts`)
- `config.ts` initializes `EMBEDDED_DATABASE_URL = undefined` at build time (replaced by kit generation at runtime)
- TypeScript strict mode validates the type even though it's `undefined`

**Fix Applied**:
- Change line 35 in `config.ts`:
  ```typescript
  // OLD:
  const EMBEDDED_DATABASE_URL: EmbeddedCredentials | undefined = undefined;
  
  // NEW:
  const EMBEDDED_DATABASE_URL: EmbeddedCredentials | undefined = {
    encrypted: '',
    iv: '',
    authTag: '',
    version: '1.0.0',
  };
  ```
  Or more elegantly, use type assertion:
  ```typescript
  const EMBEDDED_DATABASE_URL: EmbeddedCredentials | undefined = undefined as undefined;
  ```

**Prevention**:
- Kit generation MUST ensure this field is always present when embedding credentials at build time
- `KitGenerationService` must inject a valid `version` field matching `kitversion` from `projectkits` table
- Add TypeScript build gate before each kit download: `npm run build && npm run typecheck`

**Reference**: `mcp-server/src/config.ts:35`, `mcp-server/src/utils/embedded-crypto.ts:22`

### Issue 2: Kit Runtime Drift — HTTP startup and env contract mismatch

**Status**: ⚠️ KNOWN ISSUE — recurring in fresh kit installs
**Symptoms**:
- buildscope CLI fails intermittently because MCP HTTP server is not listening on expected port,
- startup path depends on conflicting env defaults between root `.env` and `mcp-server/.env`,
- operators manually decrypt and export DB env vars to recover.

**Root Cause**:
- startup scripts and templates used mixed transport/port keys (`MCP_HTTP_PORT`, `HTTP_PORT`, `TRANSPORT`),
- env source precedence was ambiguous,
- placeholder embedded credentials were attempted before deterministic env-based source selection.

**Permanent Fix**:
- enforce runtime contract: process env > root `.env` > `mcp-server/.env`,
- use HTTP mode default on port `3002`,
- normalize DB source priority with explicit `WXKANBAN_MCP_DATABASE_URL` override,
- keep MCP DB boundary explicit: central wxKanban DB != application DB.

**Prevention Gates**:
- fresh kit setup must pass: `setup-mcp` -> `/health` -> `/call project.help` without manual env hacks,
- guided `buildscope` invocation must work with partial input (including filename shorthand),
- `npm run build` in `mcp-server` must pass before shipping kit changes.

---

## Project Structure

### New Files (this feature)

```
specs/011-NewProject/
├── spec.md                          # This spec (clarified)
├── plan.md                          # This file
├── quickstart.md                    # Test scenarios
├── tasks.md                         # Task list (T001–T038)
├── lifecycle.json                   # Pipeline phase tracking
└── checklists/
    └── requirements.md              # Quality checklist

src/db/schema/
├── projectkit.ts                    # NEW: projectkits table schema
├── projectkitfile.ts                # NEW: projectkitfiles table schema
└── apitoken.ts                      # NEW: apitokens table schema

src/server/services/
├── KitGenerationService.ts          # NEW: assembles kit files
└── KitEncryptionService.ts          # NEW: per-developer DB URL encryption

src/server/routes/
└── projects.ts                      # EXTENDED: kit + import routes added

src/client/components/Projects/
├── CreateProjectModal.tsx           # EXTENDED: AI Tooling section
└── ImportProjectModal.tsx           # NEW: import existing project modal

src/client/pages/
└── ProjectListPage.tsx              # EXTENDED: Import button added

tools/
└── wxkanban-mcp.mjs                 # EXTENDED: --init flag + encrypted DB URL

_wxAI-commands/                      # NEW: kit template source files
├── task-push.md
├── task-done.md
├── wxAI-pipeline.md
├── autofix-tests.md
├── autofix-translation.md
├── sync-cpl.md
├── sync-starter-kit.md
└── project-init.md
```

### Database Migrations

```
src/db/migrations/
└── 0008_project_kit_provisioning.sql   # NEW: projectkits, projectkitfiles, apitokens
```

---

## Key Decisions

### Decision 1: Kit generation is async via setImmediate (same pattern as AIScaffoldingService)

**Chosen**: Use `setImmediate` after project creation response is sent, same pattern as existing `AIScaffoldingService.scaffold()`.
**Rationale**: Existing pattern is proven, non-blocking, and already handles errors gracefully (never throws). Kit generation (file assembly + DB writes) takes 1–5 seconds — acceptable async delay.
**Alternative**: Job queue (BullMQ) — rejected for this phase; overkill for a single async operation. Can be migrated later.

### Decision 2: Per-developer kit encryption at download time (not at generation time)

**Chosen**: Kit files are stored in `projectkitfiles` with `{{DATABASE_URL_ENCRYPTED}}` placeholder. At download time (`GET /kit/download`), the placeholder is replaced with the requesting user's encrypted DATABASE_URL.
**Rationale**: Kit files can be generated once and reused. Only the `.env` file needs per-developer substitution. This avoids storing N encrypted copies (one per developer).
**Alternative**: Generate full kit per developer at download time — rejected (too slow; regenerates all files on every download).

### Decision 3: `archiver` npm package for ZIP generation

**Chosen**: Use `archiver` (already a common Node.js dependency) for streaming ZIP generation.
**Rationale**: Streaming avoids loading entire ZIP into memory. `archiver` supports pipe-to-response directly.
**Alternative**: `jszip` — rejected (loads entire ZIP into memory; not suitable for streaming).
**Note**: `archiver` must be added to `package.json` if not already present.

### Decision 4: `apitokens` table for API token management

**Chosen**: New `apitokens` table with `tokenprefix` (first 8 chars, plain), `tokenhash` (SHA-256 of full token), `userid`, `companyid`, `revokedat`.
**Rationale**: Tokens must be stored hashed (never plain text). Prefix allows UI to show "wxk_live_xxxxxxxx..." without storing full token. Revocation sets `revokedat`.
**Alternative**: Store tokens in `userprofiles` — rejected (one user may have multiple tokens; separate table is cleaner).

### Decision 5: `_wxAI-commands/` as source-of-truth for kit command templates

**Chosen**: The `_wxAI-commands/` directory in the repo root serves as the source templates for kit command files. `KitGenerationService` reads these files and performs variable substitution.
**Rationale**: Commands are already maintained in `_wxAI-commands/` (per existing project structure). Single source of truth — updating a command file automatically updates all future kits.
**Alternative**: Hardcode command content in `KitGenerationService` — rejected (maintenance nightmare; commands would diverge from repo).

### Decision 6: `POST /api/projects/import` registered before `/:id` routes

**Chosen**: The import route `POST /api/projects/import` MUST be registered before any `POST /api/projects/:id` routes in `projects.ts` to avoid Express treating `import` as a project ID.
**Rationale**: Express route matching is order-dependent. `import` is a literal string, not a UUID, so it won't match UUID validation — but registering it first is cleaner and avoids ambiguity.

### Decision 7: `ProjectOverview.md` excluded from import kits

**Chosen**: `KitGenerationService` checks `importMode` flag. If `true`, `ProjectOverview.md` is not included in the kit.
**Rationale**: Import projects already have their own documentation structure. Adding a blank `ProjectOverview.md` would be confusing and potentially conflict with existing docs.

### Decision 8: MCP server backward compatibility

**Chosen**: The `--init` flag is additive. When `--init` is NOT passed, the MCP server starts normally (existing behavior). The encrypted DB URL decrypt is only triggered when `DATABASE_URL_ENCRYPTED` is present in `.env` (falls back to `DATABASE_URL` if not present).
**Rationale**: Existing MCP server users (who use plain `DATABASE_URL`) must not be broken. Backward compatibility is required.

---

## Phase 0: Research Findings

### Existing Infrastructure

| Item | Finding | Impact |
|------|---------|--------|
| `src/server/lib/crypto.ts` | AES-256-GCM already implemented (`encryptToken`/`decryptToken`) | Reuse for DATABASE_URL encryption; adapt key derivation to use SHA-256(apiToken) |
| `AIScaffoldingService.ts` | `setImmediate` async pattern proven | Use same pattern for kit generation |
| `tools/wxkanban-mcp.mjs` | Reads `DATABASE_URL` from `.env` via `getDbUrl()` | Extend `getDbUrl()` to support `DATABASE_URL_ENCRYPTED` fallback |
| `CreateProjectModal.tsx` | Full form with phase assignments, PM systems, compliance | Add AI Tooling section at bottom before Phase Assignments |
| `POST /api/projects` | Returns `{ project, scaffolding: 'pending' }` | Extend response with `kit` object |
| `notifications` table | `type VARCHAR(50)`, `entityid`, `entitytype` | Add `project_kit_ready` and `project_kit_failed` types |
| `_wxAI-commands/` | Directory exists in repo root | Use as template source for kit command files |

### Dependencies to Add

| Package | Purpose | Already in package.json? |
|---------|---------|--------------------------|
| `archiver` | Streaming ZIP generation | Check — likely not present |
| `@types/archiver` | TypeScript types for archiver | Check |

### DB Schema Gaps

| Gap | Solution |
|-----|---------|
| No `projectkits` table | Create new table + Drizzle schema |
| No `projectkitfiles` table | Create new table + Drizzle schema |
| No `apitokens` table | Create new table + Drizzle schema |

---

## Phase 1: Design

### Kit File Manifest (what gets generated)

| File | Type | Template Source | Variables |
|------|------|----------------|-----------|
| `_wxAI-commands/task-push.md` | command | `_wxAI-commands/task-push.md` | `{{project_uuid}}` |
| `_wxAI-commands/task-done.md` | command | `_wxAI-commands/task-done.md` | `{{project_uuid}}` |
| `_wxAI-commands/wxAI-pipeline.md` | command | `_wxAI-commands/wxAI-pipeline.md` | `{{project_uuid}}` |
| `_wxAI-commands/autofix-tests.md` | command | `_wxAI-commands/autofix-tests.md` | none |
| `_wxAI-commands/autofix-translation.md` | command | `_wxAI-commands/autofix-translation.md` | none |
| `_wxAI-commands/sync-cpl.md` | command | `_wxAI-commands/sync-cpl.md` | none |
| `_wxAI-commands/sync-starter-kit.md` | command | `_wxAI-commands/sync-starter-kit.md` | none |
| `tools/wxkanban-mcp.mjs` | mcp | `tools/wxkanban-mcp.mjs` (repo) | none (pre-configured) |
| `ai-settings.json` | settings | inline template | all vars |
| `AI.md` | context | inline template | all vars |
| `CLAUDE.md` | context | inline template (alias) | `{{project_name}}` |
| `.wxkanban-project.json` | config | inline template | all vars |
| `.env` | config | inline template | `{{DATABASE_URL_ENCRYPTED}}`, `{{project_uuid}}`, `{{wxkanban_api_url}}` |
| `.gitignore` | config | inline template | none |
| `ProjectOverview.md` | spec | inline template | `{{project_name}}`, `{{project_uuid}}`, `{{created_date}}`, `{{created_by}}` |

### API Contract

```
POST /api/projects
  Body: { name, description, generateKit?, primaryAI?, ...existing fields }
  Response: { project, scaffolding: 'pending', kit?: { downloadUrl, primaryAI, status } }

GET /api/projects/:id/kit
  Response: { status, primaryAI, kitVersion, downloadUrl, generatedAt, downloadCount }

GET /api/projects/:id/kit/download
  Response: ZIP file stream (Content-Disposition: attachment)

POST /api/projects/:id/kit/regenerate
  Auth: ADMIN only
  Response: { status: 'generating', message: 'Kit regeneration started' }

POST /api/projects/import
  Body: { name, description, primaryAI?, importMode: true, ...existing fields }
  Response: same as POST /api/projects
```

---

## Phase 2: Task Planning Approach

Tasks are organized into 8 phases. See `tasks.md` for full task list.

**Estimated tasks**: 38 (T001–T038)
**Parallel opportunities**:
- T004–T010 (kit templates) can run in parallel with T001–T003 (DB schema)
- T023–T028 (frontend) can run in parallel with T011–T022 (backend)
- T032–T033 (notifications) can run in parallel with T029–T031 (MCP server)

**Critical path**: T001–T003 → T011–T016 → T017–T022 → T034–T038

---

## Progress Tracking

- [x] Phase 0: Research complete
- [x] Phase 1: Design complete
- [x] Phase 2: Task planning approach described
- [ ] Phase 3: Tasks generated (tasks.md)
- [ ] Phase 4: Implementation complete
- [ ] Phase 5: Validation passed

**Gate Status**:
- [x] Initial Constitution Check: PASS
- [x] Post-Design Constitution Check: PASS
- [x] All NEEDS CLARIFICATION resolved
- [x] Complexity deviations documented (none required)
