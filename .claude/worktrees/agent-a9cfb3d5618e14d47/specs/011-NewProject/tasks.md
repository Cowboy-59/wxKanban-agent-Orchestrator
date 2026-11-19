# Tasks: New Project — AI-Ready Project Provisioning (Spec 011)

**Branch**: `project-scope`
**Input**: plan.md, spec.md, quickstart.md
**Generated**: 2026-02-22
**Total Tasks**: 38
**User Stories**: US1 (New Project Kit), US2 (Kit Status), US3 (CLI Init), US4 (Import Existing), US5 (Encrypted DB URL), US6 (Regeneration), US7 (ProjectOverview.md)

**Key Finding**: Existing `src/server/lib/crypto.ts` has AES-256-GCM already implemented. Existing `AIScaffoldingService.ts` has the async `setImmediate` pattern. `tools/wxkanban-mcp.mjs` reads `DATABASE_URL` from `.env` via `getDbUrl()`. All three are reusable/extendable. New tables needed: `projectkits`, `projectkitfiles`, `apitokens`.

---

## Phase 1: DB Schema

_T001–T003 can run in parallel._

- [ ] T001 [P] Create `src/db/schema/projectkit.ts` — Drizzle schema for `projectkits` table: `id` UUID PK, `projectid` UUID FK → projects ON DELETE CASCADE, `status` VARCHAR(50) (`generating`/`ready`/`failed`), `primaryai` VARCHAR(50), `kitversion` VARCHAR(20) default `'1.0.0'`, `kitcontent` JSONB, `downloadcount` INTEGER default 0, `generatedat` TIMESTAMP nullable, `createdat` TIMESTAMP, `updatedat` TIMESTAMP; export `ProjectKit` and `NewProjectKit` types

- [ ] T002 [P] Create `src/db/schema/projectkitfile.ts` — Drizzle schema for `projectkitfiles` table: `id` UUID PK, `kitid` UUID FK → projectkits ON DELETE CASCADE, `filepath` VARCHAR(500), `filetype` VARCHAR(50) (`command`/`mcp`/`settings`/`context`/`config`/`spec`), `content` TEXT, `createdat` TIMESTAMP; export `ProjectKitFile` and `NewProjectKitFile` types

- [ ] T003 [P] Create `src/db/schema/apitoken.ts` — Drizzle schema for `apitokens` table: `id` UUID PK, `userid` UUID FK → users ON DELETE CASCADE, `companyid` UUID FK → companies ON DELETE CASCADE, `tokenprefix` VARCHAR(20) (first 16 chars of token, plain), `tokenhash` VARCHAR(64) (SHA-256 hex of full token), `label` VARCHAR(100) nullable, `revokedat` TIMESTAMP nullable, `createdat` TIMESTAMP; export `ApiToken` and `NewApiToken` types; update `src/db/schema/index.ts` to export all three new schemas

---

## Phase 2: Database Migration

- [ ] T004 Create migration `src/db/migrations/0008_project_kit_provisioning.sql` — SQL to CREATE TABLE `projectkits`, `projectkitfiles`, `apitokens` with all columns, constraints, and indexes; include: `CREATE INDEX idx_projectkits_projectid ON projectkits(projectid)`, `CREATE INDEX idx_projectkitfiles_kitid ON projectkitfiles(kitid)`, `CREATE INDEX idx_apitokens_userid ON apitokens(userid)`, `CREATE UNIQUE INDEX idx_apitokens_tokenhash ON apitokens(tokenhash)`

---

## Phase 3: Kit Template Files

_T005–T011 can all run in parallel._

- [ ] T005 [P] Create `_wxAI-commands/task-push.md` — AI-agnostic command: reads `specs/{{args}}/tasks.md`, generates tasks.md if missing, calls `wxk_scope_import` MCP tool to push tasks to DB; uses `{{args}}` placeholder (not `$ARGUMENTS`); includes pre-flight check for `.wxkanban-project.json`

- [ ] T006 [P] Create `_wxAI-commands/task-done.md` — AI-agnostic command: takes `{{args}}` as `<spec_number> <task_id>`; updates tasks.md checkbox `[ ]` → `[x]`; calls `wxk_task_close` MCP tool; idempotent (no-op if already complete)

- [ ] T007 [P] Create `_wxAI-commands/wxAI-pipeline.md` — AI-agnostic full spec pipeline command: reads `ProjectOverview.md` as primary input; runs specify → clarify → plan → tasks pipeline; creates `specs/NNN-{name}/` directory with `spec.md`, `plan.md`, `quickstart.md`, `tasks.md`; prompts user to fill out `ProjectOverview.md` if empty/placeholder-only

- [ ] T008 [P] Create `_wxAI-commands/autofix-tests.md` — AI-agnostic command: runs test suite, reads failures, autonomously fixes TypeScript/test errors, re-runs until green or max 3 iterations; uses `{{args}}` for optional test file filter

- [ ] T009 [P] Create `_wxAI-commands/autofix-translation.md` — AI-agnostic command: MSSQL → PostgreSQL translation pipeline; reads SQL files from `{{args}}` path, translates syntax, validates output

- [ ] T010 [P] Create `_wxAI-commands/sync-cpl.md` — AI-agnostic command: syncs CPL launcher; reads `_cpl/VERSION`, runs `_cpl/sync-cpl.sh`

- [ ] T011 [P] Create `_wxAI-commands/sync-starter-kit.md` — AI-agnostic command: syncs project with starter kit; pulls latest `_wxAI-commands/` templates from wxKanban repo; non-destructive (skips files modified locally)

---

## Phase 4: Backend Services

_T012–T013 can run in parallel. T014–T016 depend on T012._

- [ ] T012 [P] Create `src/server/services/KitEncryptionService.ts` — static class with:
  - `generateApiToken(): string` — returns `wxk_live_<32 random hex chars>`
  - `hashToken(token: string): string` — SHA-256 hex of token
  - `encryptDatabaseUrl(databaseUrl: string, apiToken: string): string` — AES-256-GCM; key = SHA-256(apiToken) as 32-byte Buffer; IV = 12 random bytes; format = `<iv_b64>.<ciphertext_b64>.<tag_b64>` (base64url); returns encrypted string
  - `decryptDatabaseUrl(encrypted: string, apiToken: string): string` — inverse of encrypt; throws on auth tag mismatch
  - `getTokenPrefix(token: string): string` — returns first 16 chars

- [ ] T013 [P] Create `src/server/services/ApiTokenService.ts` — static class with:
  - `createToken(userid: string, companyid: string, label?: string): Promise<{ token: string; record: ApiToken }>` — generates token, hashes it, inserts into `apitokens` table, returns plain token (shown once) + DB record
  - `listTokens(userid: string): Promise<ApiToken[]>` — returns all non-revoked tokens for user (no plain token)
  - `revokeToken(tokenid: string, userid: string): Promise<boolean>` — sets `revokedat = now()`
  - `validateToken(token: string): Promise<ApiToken | null>` — looks up by hash, returns null if revoked

- [ ] T014 Create `src/server/services/KitGenerationService.ts` — static class with:
  - `generate(projectid: string, projectname: string, primaryai: string, importMode: boolean, createdbyid: string): Promise<void>` — async, never throws; creates `projectkits` record with `status='generating'`; assembles all kit files via `assembleFiles()`; inserts into `projectkitfiles`; updates `projectkits` status to `ready`; sends `project_kit_ready` notification; on error sets status to `failed` and sends `project_kit_failed` notification
  - `assembleFiles(projectid: string, projectname: string, primaryai: string, importMode: boolean, createdbyid: string): Promise<KitFile[]>` — reads command templates from `_wxAI-commands/`, reads `tools/wxkanban-mcp.mjs`, generates inline templates (AI.md, ai-settings.json, .wxkanban-project.json, .env placeholder, .gitignore, CLAUDE.md); substitutes all `{{variables}}`; skips `ProjectOverview.md` if `importMode=true`
  - `substituteVars(content: string, vars: Record<string, string>): string` — replaces all `{{key}}` occurrences
  - `getProjectSlug(name: string): string` — URL-safe slug (lowercase, hyphens)
  - `regenerate(kitid: string, projectid: string): Promise<void>` — deletes existing `projectkitfiles`, increments `kitversion`, re-runs `generate()`

- [ ] T015 Add `KitGenerationService.generate()` call to `src/server/services/ProjectService.ts` `createProject()` method — after project + phases created, if `generateKit !== false`, call `setImmediate(() => KitGenerationService.generate(...))` (same pattern as AIScaffoldingService)

- [ ] T016 Add API token routes to `src/server/routes/settings.ts` — `POST /api/settings/api-tokens` (create token, return plain token once), `GET /api/settings/api-tokens` (list tokens, no plain token), `DELETE /api/settings/api-tokens/:tokenid` (revoke)

---

## Phase 5: API Routes

_T017–T021 can run in parallel after T014 complete._

- [ ] T017 [P] Add `GET /api/projects/:id/kit` route to `src/server/routes/projects.ts` — queries `projectkits` by `projectid`; returns `{ status, primaryAI, kitVersion, downloadUrl, generatedAt, downloadCount }` or `{ status: 'not_generated' }` if no kit; requires auth

- [ ] T018 [P] Add `GET /api/projects/:id/kit/download` route — requires auth; fetches `projectkitfiles` for kit; gets requesting user's API token from `apitokens` table (most recent non-revoked); encrypts DATABASE_URL with user's token; substitutes `{{DATABASE_URL_ENCRYPTED}}` in `.env` file content; streams ZIP using `archiver`; sets `Content-Disposition: attachment; filename="{slug}-kit.zip"`; increments `downloadcount`; returns 404 if kit not ready

- [ ] T019 [P] Add `POST /api/projects/:id/kit/regenerate` route — ADMIN only; sets kit `status='generating'`; calls `KitGenerationService.regenerate()`; returns `{ status: 'generating', message: 'Kit regeneration started' }`

- [ ] T020 [P] Add `POST /api/projects/import` route — registered BEFORE `/:id` routes to avoid collision; accepts same body as `POST /api/projects` plus `importMode: true`; calls `ProjectService.createProject()` with `importMode` flag; triggers `KitGenerationService.generate(..., importMode: true)`; returns same response shape as `POST /api/projects`

- [ ] T021 [P] Extend `POST /api/projects` validation schema — add `generateKit: z.boolean().optional()` and `primaryAI: z.enum(['claude-code','blackboxai','cursor','copilot','generic']).optional()` to `createProjectSchema`; extend response to include `kit` object when `generateKit !== false`

- [ ] T022 [P] Add `archiver` npm package — run `npm install archiver @types/archiver`; verify it appears in `package.json` dependencies

---

## Phase 6: Frontend

_T023–T027 can run in parallel._

- [ ] T023 [P] Extend `src/client/components/Projects/CreateProjectModal.tsx` — add "AI Tooling" collapsible section between Compliance and Phase Assignments sections; section contains: (1) toggle "Generate AI Project Kit" (default ON, state: `generateKit: boolean`); (2) dropdown "Primary AI Tool" with options `generic`/`claude-code`/`blackboxai`/`cursor`/`copilot` (shown only when toggle ON); (3) text input "Local Project Directory" (optional, placeholder: `e.g. E:\AI_Development\MyProject`); add `generateKit`, `primaryAI`, `localDir` to `FormState`; include in POST body when submitting

- [ ] T024 [P] Create `src/client/components/Projects/ImportProjectModal.tsx` — new modal component mirroring `CreateProjectModal` structure; title "Import Existing Project"; fields: Name (required), Description (optional), Primary AI Tool (dropdown, required), Local Directory Path (optional), Phase Assignments (same as CreateProjectModal); submits to `POST /api/projects/import`; on success calls `onCreated` callback; includes `importMode: true` in request body

- [ ] T025 [P] Update `src/client/pages/ProjectListPage.tsx` — add "Import Existing Project" button alongside "New Project" button (ADMIN/MANAGER only); button opens `ImportProjectModal`; add `importModalOpen` state; wire `onCreated` to refresh project list

- [ ] T026 [P] Add kit status badge to project creation success flow — after `CreateProjectModal` submits successfully, show a small status indicator "AI Kit: Generating…" that polls `GET /api/projects/:id/kit` every 3 seconds until `status === 'ready'`; on ready, show "AI Kit: Ready — Download" link; on failed, show "AI Kit: Failed — Retry" button; implement as `KitStatusBadge.tsx` component

- [ ] T027 [P] Create `src/client/components/Projects/KitStatusBadge.tsx` — small inline component; props: `projectId: string`; polls `GET /api/projects/:id/kit` every 3 seconds (max 10 polls); renders: spinner + "Generating…" | green check + "Download Kit" link | red X + "Retry" button; stops polling when status is `ready` or `failed`; uses `useEffect` cleanup to cancel polling on unmount

---

## Phase 7: MCP Server Extension

_T028–T030 can run in parallel._

- [ ] T028 [P] Extend `tools/wxkanban-mcp.mjs` `getDbUrl()` function — check for `DATABASE_URL_ENCRYPTED` in `.env` first; if present, also read `WXKANBAN_API_TOKEN`; decrypt using AES-256-GCM (SHA-256 of token as key); return decrypted URL; if `DATABASE_URL_ENCRYPTED` absent, fall back to existing `DATABASE_URL` behavior (backward compatible); if `DATABASE_URL_ENCRYPTED` present but `WXKANBAN_API_TOKEN` missing, exit with error message

- [ ] T029 [P] Add `--init <project_id>` flag handling to `tools/wxkanban-mcp.mjs` — detect `process.argv` for `--init` flag; if present: (1) read `WXKANBAN_API_URL` and `WXKANBAN_API_TOKEN` from `.env`; (2) call `GET {apiUrl}/api/projects/{projectId}/kit` to fetch kit manifest; (3) for each file in manifest, write to current directory if not already present (non-destructive); (4) detect existing AI tooling (`.claude/commands/`, `CLAUDE.md`, `AGENTS.md`, `AIRules/`, `.kiro/`, etc.); (5) output detection report; (6) exit (do NOT start MCP server in `--init` mode)

- [ ] T030 [P] Create `_wxAI-commands/project-init.md` — AI-agnostic command that wraps `node tools/wxkanban-mcp.mjs --init {{args}}`; reads `.wxkanban-project.json` if present to get project ID; verifies MCP server is reachable after init; reports setup status per AI tool detected in environment

---

## Phase 8: Notifications

_T031–T032 can run in parallel._

- [ ] T031 [P] Add `project_kit_ready` notification type to `src/server/services/NotificationService.ts` — `notifyKitReady(projectid: string, createdbyid: string): Promise<void>` — inserts notification with `type='project_kit_ready'`, `entityid=projectid`, `entitytype='project'`, `userid=createdbyid`, `message='Your AI Project Kit is ready for download'`

- [ ] T032 [P] Add `project_kit_failed` notification type — `notifyKitFailed(projectid: string, createdbyid: string, companyid: string): Promise<void>` — inserts notification for project creator AND all ADMIN users in company; `type='project_kit_failed'`, `message='AI Project Kit generation failed — please retry'`

---

## Phase 9: Human Testing

_T033–T038 are sequential (each depends on prior)._

- [ ] T033 **HUMAN TASK**: Run `npm install archiver @types/archiver` and `npm run db:generate && npm run db:migrate` — verify migration creates `projectkits`, `projectkitfiles`, `apitokens` tables; verify no TypeScript errors (`npm run typecheck`)

- [ ] T034 **HUMAN TASK**: Create new project via UI with "Generate AI Project Kit" ON, Primary AI = "BLACKBOXAI" — verify kit status transitions `generating` → `ready` within 30 seconds; verify `GET /api/projects/:id/kit` returns correct shape; verify `KitStatusBadge` shows "Download Kit" link

- [ ] T035 **HUMAN TASK**: Download kit ZIP — verify all 15+ files present; verify no plain `DATABASE_URL` in `.env`; verify `DATABASE_URL_ENCRYPTED` is valid base64 format; verify all `{{placeholders}}` substituted in `AI.md`, `ai-settings.json`, `.wxkanban-project.json`; verify `ProjectOverview.md` present

- [ ] T036 **HUMAN TASK**: Test MCP server with encrypted DB URL — add `WXKANBAN_API_TOKEN` to `.env`; run `node tools/wxkanban-mcp.mjs`; verify server starts and connects to DB; run `wxk_stats` via MCP — verify returns project stats; verify plain `DATABASE_URL` never written to disk

- [ ] T037 **HUMAN TASK**: Test `--init` flag — create empty directory; run `node tools/wxkanban-mcp.mjs --init <project_id>`; verify all kit files created; re-run — verify 0 files overwritten; test import scenario: create directory with existing `CLAUDE.md` and `.claude/commands/`; run `--init`; verify existing files untouched, kit files added, detection report accurate

- [ ] T038 **HUMAN TASK**: Test kit regeneration — call `POST /api/projects/:id/kit/regenerate`; verify `kitVersion` incremented; verify `downloadCount` reset to 0; verify new `DATABASE_URL_ENCRYPTED` differs from previous; verify `project_kit_ready` notification delivered

- [ ] T039 Update `Project-Init-kit/scripts/setup-mcp.mjs` runtime env precedence — enforce deterministic merge order (`process env > root .env > mcp-server/.env`), normalize `MCP_HTTP_PORT`/`HTTP_PORT`, require MCP DB config (`WXKANBAN_MCP_DATABASE_URL` OR encrypted OR plain), and ensure startup errors are actionable

- [ ] T040 Update `Project-Init-kit/mcp-server/src/config.ts` DB resolution and transport defaults — treat placeholder embedded credentials as non-fatal, prioritize explicit `WXKANBAN_MCP_DATABASE_URL`, normalize HTTP port (`MCP_HTTP_PORT` fallback), and keep MCP DB scope explicit (wxKanban lifecycle/spec/reference only)

- [ ] T041 Update `Project-Init-kit/cli/commands/mcp-bridge.ts` buildscope parser — guided mode must run without forced feature description, and filename-style args (`001-websocket.md`) must map to spec context rather than literal description

- [ ] T042 **HUMAN TASK**: Fresh kit install regression gate — from clean workspace run setup, verify MCP HTTP on `3002`, verify `POST /call` with `project.help`, verify guided `buildscope` writes scope file without manual decrypt/export steps

---

## Dependencies

```
T001, T002, T003 → T004 (schemas before migration)
T001, T002, T003 → T012, T013 (schemas before services)
T004 → T033 HUMAN (migration before testing)
T005–T011 → T014 (templates before KitGenerationService reads them)
T012, T013 → T014 (encryption + token services before kit generation)
T014 → T015 (KitGenerationService before ProjectService integration)
T014 → T017, T018, T019 (service before routes)
T015 → T021 (ProjectService extended before route schema extended)
T016 → T034 HUMAN (API token routes before download test)
T017, T018, T019, T020, T021 → T023, T024, T025 (routes before frontend)
T022 → T018 (archiver installed before ZIP route)
T023, T024, T025, T026, T027 → T034 HUMAN (frontend before UI testing)
T028, T029 → T036, T037 HUMAN (MCP server extended before CLI testing)
T031, T032 → T038 HUMAN (notifications before notification testing)
T033 HUMAN → T034 HUMAN (migration verified before UI testing)
T034 HUMAN → T035 HUMAN (kit created before download test)
T035 HUMAN → T036 HUMAN (kit downloaded before MCP test)
T036 HUMAN → T037 HUMAN (MCP verified before --init test)
T037 HUMAN → T038 HUMAN (--init verified before regeneration test)
```

---

## Parallel Execution Examples

```
# Phase 1 + Phase 3 — fully independent:
T001, T002, T003, T005, T006, T007, T008, T009, T010, T011 — launch all in parallel

# Phase 4 — T012 and T013 independent, T014 waits for both:
T012, T013 in parallel → T014

# Phase 5 — all independent after T014:
T017, T018, T019, T020, T021, T022 in parallel

# Phase 6 — all independent after routes:
T023, T024, T025, T026, T027 in parallel

# Phase 7 + Phase 8 — independent of each other:
T028, T029, T030, T031, T032 in parallel

# Phase 9 — strictly sequential:
T033 → T034 → T035 → T036 → T037 → T038
```

---

## MVP Scope

**P0 (core kit generation)**: T001–T004, T012, T014, T015, T017, T018, T021 (DB + service + download route)

**P1 (security)**: T003, T013, T016 (API tokens + encryption)

**P2 (frontend)**: T023, T024, T025, T026, T027 (UI components)

**P3 (MCP extension)**: T028, T029, T030 (--init flag + encrypted DB URL)

**P4 (templates)**: T005–T011 (command template files)

**P5 (polish)**: T019, T020, T031, T032 (regenerate + import + notifications)

**P6 (human tests)**: T033–T038
