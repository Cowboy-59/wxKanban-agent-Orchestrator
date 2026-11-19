# Tasks: AI Interaction Governance Framework (Spec 015)

**Branch**: `015-ai-interaction`
**Input**: `specs/015-AIInteraction/spec.md`, `specs/015-AIInteraction/plan.md`, `specs/Project-Scope/015-AiInteraction.md`
**Generated**: 2025-01-28
**Total Tasks**: 28
**User Stories**: US1 (Scope-First Block), US2 (Scope Creation Training), US3 (TODO Linking), US4 (Auto-Update), US5 (Protected Files), US6 (Audit Log), US7 (Emergency Override)

---

## Phase A: wxAI Command Files

_T001–T003 can run in parallel (independent command files)._

- [ ] T001 [P] Create `_wxAI/commands/wxAI-scope-check.md` — pre-implementation scope verification gate command; frontmatter: `description: "Verify scope exists in database before implementation"`, `ai-compat: universal`; content: (1) read spec number from context or args; (2) run 4 SQL checks: spec exists in `specs` table, `COUNT(*) FROM tasks WHERE spec_number = '<NNN>'` > 0, `COUNT(*) FROM projectdocuments WHERE specnumber = '<NNN>'` >= 4, `status IN ('tasks_generated','in_progress','ready_for_implementation')`; (3) if all pass: output `✅ SCOPE VERIFIED — Proceeding with implementation` and log to `companyauditlogs` with `actiontype='ai_interaction'`, `action_type='implementation_started'`; (4) if any fail: output `⛔ IMPLEMENTATION BLOCKED — DATABASE VERIFICATION FAILED` with specific failed checks and remediation steps; reference `_wxAI/commands/wxAI-pipeline-mandatory-database.md`

- [ ] T002 [P] Create `_wxAI/commands/wxAI-todo-import.md` — TODO file scanner and scope linker command; frontmatter: `description: "Scan and link TODO files to scopes and database tasks"`, `ai-compat: universal`; content: (1) scan project root and all subdirectories for files matching `TODO*.md`; (2) for each file: check if scope reference header exists (look for `**Scope**:` line); (3) for unlinked files: read content, extract task items (`- [ ]` lines), search `specs` and `tasks` tables for keyword matches; (4) present proposed scope mappings to developer with confirmation prompt; (5) on confirmation: run `wxk_scope_import --spec <NNN>` for new tasks, update TODO file header with scope number, title, spec path, and task IDs; (6) log each linked TODO to `companyauditlogs` with `actiontype='ai_interaction'`, `action_type='todo_linked'`; (7) output summary: "Linked [N] TODO items to [M] scopes. [K] new tasks created in database."

- [ ] T003 [P] Create `_wxAI/commands/wxAI-training.md` — guided onboarding for untrained developers; frontmatter: `description: "Guided training mode for developers new to wxKanban scope-first workflow"`, `ai-compat: universal`; content: (1) opening explanation of wxKanban's 6-phase lifecycle (Design → Implementation → QA → Human Testing → Beta → Release); (2) explanation of scope-first rule with analogy ("a scope is a chapter in your project's story"); (3) interactive scope creation: ask 6 questions (name, problem solved, users, main functions, security requirements, connections to other features); (4) present scope summary for confirmation; (5) on confirmation: execute wxAI pipeline (wxAI-specify → wxAI-plan → wxAI-tasks → task push); (6) show developer how to find existing scopes using `wxAI-scope-check`; (7) show developer how to link TODO files using `wxAI-todo-import`

---

## Phase B: CLI Implementation

_T004–T006 can run in parallel (independent CLI command files)._

- [ ] T004 [P] Create `cli/commands/scope-check.ts` — TypeScript CLI implementation of scope verification gate; export async function `scopeCheck(specNumber: string, options: { force?: boolean; reason?: string }): Promise<ScopeCheckResult>`; define `ScopeCheckResult` type: `{ passed: boolean; specExists: boolean; taskCount: number; docCount: number; specStatus: string; failedChecks: string[]; }` ; implementation: (1) query database for spec, task count, doc count, status; (2) evaluate all 4 checks; (3) if `options.force && options.reason`: log override to `companyauditlogs` with `actiontype='ai_interaction'`, `action_type='override_used'`, insert override record to `projectdocuments` with `doctype='override_log'`, return `{ passed: true, ... }`; (4) if checks fail and no force: return `{ passed: false, failedChecks: [...] }`; (5) if checks pass: log to `companyauditlogs` with `action_type='implementation_started'`; register command as `wxai scope-check --spec <NNN>` in `cli/router.ts`

- [ ] T005 [P] Create `cli/commands/todo-import.ts` — TypeScript CLI implementation of TODO file scanner; export async function `todoImport(options: { path?: string; dryRun?: boolean; spec?: string }): Promise<TodoImportResult>`; define `TodoImportResult` type: `{ filesScanned: number; filesLinked: number; tasksCreated: number; tasksLinked: number; unlinkedFiles: string[]; }` ; implementation: (1) scan `options.path` (default: project root) for `TODO*.md` files using `glob`; (2) for each file: parse content, check for `**Scope**:` header; (3) for unlinked files: extract `- [ ]` items, search database for matching scopes; (4) if `options.dryRun`: output proposed mappings without writing; (5) if not dry run: call `wxk_scope_import` for new tasks, update TODO file headers with scope references and task IDs; (6) log each import to `companyauditlogs`; register as `wxai todo-import` in `cli/router.ts`

- [ ] T006 [P] Create `cli/commands/training.ts` — TypeScript CLI implementation of training mode; export async function `training(options: { interactive?: boolean }): Promise<void>`; implementation: (1) print lifecycle overview with phase descriptions; (2) print scope-first rule explanation; (3) if `options.interactive`: prompt for 6 scope creation questions using readline; (4) display scope summary; (5) on confirmation: call `wxAI-specify` pipeline with gathered information; (6) print next steps: how to find scopes, how to link TODOs; register as `wxai training` in `cli/router.ts`

---

## Phase C: Backend Service & Routes

_T007 must complete before T008._

- [ ] T007 Create `src/server/services/AiInteractionLogService.ts` — AI interaction audit logging service; export functions: `logAiInteraction(data: AiInteractionLogInput): Promise<void>`, `listAiInteractions(filters: AiInteractionFilters): Promise<AiInteractionLog[]>`, `getAiInteractionSummary(projectId: string, days: number): Promise<AiInteractionSummary>`, `listOverrides(projectId: string): Promise<OverrideLog[]>`; define types: `AiInteractionLogInput { aiProvider: string; sessionId: string; actionType: AiActionType; scopeNumber?: string; taskId?: string; details: string; filesAffected?: string[]; forceOverride?: boolean; overrideReason?: string; }`, `AiActionType = 'scope_created' | 'implementation_started' | 'file_created' | 'file_modified' | 'override_used' | 'block_triggered' | 'todo_linked' | 'rules_sync'`; `logAiInteraction` inserts to `companyauditlogs` with `actiontype = 'ai_interaction'` and full JSON in `actiondetails`; `listAiInteractions` queries `companyauditlogs WHERE actiontype = 'ai_interaction'` with filters for date range, developer, action type, scope number; `getAiInteractionSummary` returns counts by action type for the given period; `listOverrides` queries `projectdocuments WHERE doctype = 'override_log'`

- [ ] T008 Create `src/server/routes/ai-audit.ts` — AI audit log management routes; import `AiInteractionLogService`; implement routes:
  - `GET /logs` → `AiInteractionLogService.listAiInteractions` (query params: `startDate`, `endDate`, `developerId`, `actionType`, `scopeNumber`, `page`, `limit`); requires ADMIN auth
  - `GET /logs/:id` → query `companyauditlogs` by id; requires ADMIN auth
  - `GET /summary` → `AiInteractionLogService.getAiInteractionSummary` (query params: `days` default 30); requires ADMIN auth; returns: `{ totalInteractions, blocksTriggered, scopesCreated, filesModified, overridesUsed, todoFilesLinked, rulesSynced }`
  - `GET /overrides` → `AiInteractionLogService.listOverrides`; requires ADMIN auth; returns list of override log entries with reason, timestamp, developer, what was bypassed
  - All routes use `authenticateToken` middleware and check `req.user.role === 'ADMIN'`

---

## Phase D: Route Registration

- [ ] T009 Update `src/server/routes/index.ts` — import `aiAuditRouter` from `./ai-audit`; register with `app.use('/api/ai-audit', aiAuditRouter)` alongside existing route registrations

---

## Phase E: wxAI Command Updates

_T010–T012 can run in parallel (independent file modifications)._

- [ ] T010 [P] Update `_wxAI/commands/wxAI-implement.md` — add scope-first gate at the very top of the command, before any implementation steps; insert section: `## Pre-Implementation Gate (MANDATORY)` with instruction: "Before ANY implementation work, run `wxAI-scope-check` for the target spec number. If gate returns GATE_FAIL, STOP immediately and display the block message. Do NOT proceed until gate passes or emergency override is documented."; reference `_wxAI/commands/wxAI-scope-check.md`

- [ ] T011 [P] Update `_wxAI/rules/projectrules.md` — add Section VIII: `## VIII. Scope-First Enforcement` with the following rules: (1) AI MUST run `wxAI-scope-check` before any implementation; (2) AI MUST block code changes when scope is unknown; (3) AI MUST link TODO files to scopes immediately on creation; (4) AI MUST check `.wxkanban-origin` at session start to determine project type; (5) AI MUST check `.wxkanban-version` in consumer projects and trigger sync if behind; reference `specs/Project-Scope/015-AiInteraction.md` as authoritative source

- [ ] T012 [P] Update `cli/commands/implement.ts` — add scope verification gate at the start of the implement command execution; before any file operations: call `scopeCheck(specNumber, options)`; if `result.passed === false` and no `--force`: print block message with failed checks and exit with code 1; if `--force` without `--reason`: print error "Force override requires --reason parameter" and exit with code 1; if `--force` with `--reason`: log override and proceed; add `--force` and `--reason` flags to command options

---

## Phase F: Sync Infrastructure

- [ ] T013 Create `_wxAI/commands/wxAI-sync-global.md` — governance rules sync command; frontmatter: `description: "Sync wxKanban governance rules to/from source project"`, `ai-compat: universal`; content: (1) check if `.wxkanban-origin` exists — if yes, this IS the source, skip sync; (2) read local `.wxkanban-version`; (3) fetch wxKanban source `.wxkanban-version` (via git remote or wxKanban API); (4) compare `wxkanban_rules_version` and file hashes for each file in `files_managed`; (5) if `--check`: report what would change without applying; (6) if updates needed: download each changed file, overwrite local copy, preserve consumer's `projectrules.md` append section; (7) update local `.wxkanban-version` with new version, timestamp, and updated hashes; (8) log sync to `companyauditlogs` with `actiontype='ai_interaction'`, `action_type='rules_sync'`; (9) output update notification with list of refreshed files

- [ ] T014 Update `_wxAI/scripts/sync-global.sh` — update existing sync script to: (1) read `.wxkanban-version` for list of managed files; (2) compare file hashes using `sha256sum`; (3) pull updated files from wxKanban source git remote; (4) preserve consumer project's `projectrules.md` append section (lines after `## Consumer Project Rules` marker); (5) update `.wxkanban-version` with new version and timestamp; (6) output summary of changes

---

## Phase G: IDE Extension Integration

- [ ] T015 Create `_wxAI/commands/wxAI-session-start.md` — session startup check command; frontmatter: `description: "Run at the start of every AI session to check project state"`, `ai-compat: universal`; content: (1) check for `.wxkanban-origin` — if present, skip consumer checks; (2) if consumer project: read `.wxkanban-version`, compare against wxKanban source version; (3) if behind and `auto_update: true`: run `wxAI-sync-global` automatically; (4) if behind and `auto_update: false`: display warning with version numbers; (5) if more than 2 major versions behind: display block message and halt session; (6) scan for unlinked TODO files and notify developer; (7) check for open files in IDE context and ask developer which scope the session is focused on

---

## Phase H: Validation (HUMAN)

_Run after Phase G is complete. Sequential._

- [ ] T016 **HUMAN TASK**: Verify `wxai scope-check --spec 015` command runs and outputs correct gate check results; confirm database queries execute without error
- [ ] T017 **HUMAN TASK**: Run `npm run check-types` — verify TypeScript compiles cleanly with zero errors across all new and modified files
- [ ] T018 **HUMAN TASK**: Test scope-first block — ask AI to create a file without specifying a scope; verify AI displays the standard block message and does not create the file
- [ ] T019 **HUMAN TASK**: Test scope discovery — ask AI to work on "navbar changes"; verify AI searches database and presents matching scopes
- [ ] T020 **HUMAN TASK**: Test TODO import — create a TODO.md file without scope references; run `wxai todo-import --dry-run`; verify proposed scope mappings are shown; run without `--dry-run`; verify TODO file is updated with scope references and tasks appear in database
- [ ] T021 **HUMAN TASK**: Test training mode — run `wxai training`; verify 6-question scope creation flow works end-to-end; verify new scope appears in database after completion
- [ ] T022 **HUMAN TASK**: Test auto-update check — temporarily set `.wxkanban-version` to an older version; start AI session; verify update notification appears and files are refreshed
- [ ] T023 **HUMAN TASK**: Test protected file enforcement — in a consumer project (no `.wxkanban-origin`), ask AI to modify `constitution.md`; verify AI refuses with the standard protected file message
- [ ] T024 **HUMAN TASK**: Test emergency override — run `wxai scope-check --spec 015 --force --reason "Test override"`; verify override is logged to `companyauditlogs` and appears in `GET /api/ai-audit/overrides`
- [ ] T025 **HUMAN TASK**: Test AI audit log API — call `GET /api/ai-audit/summary`; verify counts for blocks triggered, scopes created, and overrides used are accurate
- [ ] T026 **HUMAN TASK**: Verify `GET /api/ai-audit/logs` returns paginated AI interaction logs with correct filters (date range, action type, scope number)
- [ ] T027 **HUMAN TASK**: Test multi-provider compatibility — verify `wxAI-scope-check.md` frontmatter includes `claude-code: true`, `cursor: true`, `blackboxai: true`; verify all new command files use `wx` prefix naming
- [ ] T028 **HUMAN TASK**: End-to-end test — start fresh session, ask AI to build a new feature without any scope context; verify full flow: block → search → training → scope creation → database insertion → implementation proceeds

---

## Dependencies

```
T001–T003 (parallel) → T010, T011 (commands reference scope-check)
T004–T006 (parallel) → T009 (CLI commands before route registration)
T007 → T008 (service before routes)
T008 → T009 (routes before registration)
T009 → T016 (registration before validation)
T010, T011, T012 → T016 (command updates before testing)
T013, T014 → T015 (sync commands before session-start)
T015 → T022 (session-start before auto-update test)
T016 → T017 → T018 → T019 → T020 → T021 → T022 → T023 → T024 → T025 → T026 → T027 → T028
```

---

## Parallel Execution Examples

```
# Phase A — all parallel:
T001, T002, T003 — independent command files

# Phase B — all parallel:
T004, T005, T006 — independent CLI files

# Phase E — all parallel:
T010, T011, T012 — independent file modifications

# Phase H — sequential:
T016 → T017 → T018 → ... → T028
```

---

## MVP Scope

**P0 (must complete before any testing)**: T001, T004, T007, T008, T009, T010, T012 (scope-first gate + audit logging)

**P1 (core tooling)**: T002, T003, T005, T006, T011, T013, T014, T015 (TODO import + training + sync)

**P2 (validation)**: T016–T020 (gate + TODO + training tests)

**P3 (full validation)**: T021–T028 (auto-update + protected files + audit log + end-to-end)
