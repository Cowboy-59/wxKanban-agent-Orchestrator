# Tasks: Project Layout & Lifecycle Workspace

**Branch**: `008-007-project-layout` | **Date**: 2026-02-21
**Input**: `specs/008-007-project-layout/plan.md`, `data-model.md`, `contracts/projects.yaml`, `quickstart.md`

---

## Phase A: Schema Migrations

_All 5 schema changes are in different files — run in parallel. Human must run `npm run db:generate && npm run db:migrate` after T005._

- [x] T001 [P] Add `assigneduserid` UUID FK field to `src/db/schema/projectphase.ts` (nullable, references `users.id`, ON DELETE SET NULL)
- [x] T002 [P] Add `phaseid` UUID FK, `issuetype` VARCHAR(50) DEFAULT 'task', and `result` VARCHAR(50) NULLABLE fields to `src/db/schema/task.ts`
- [x] T003 [P] Add `phaseid` UUID FK field (nullable, ON DELETE SET NULL, references `projectphases.id`) to `src/db/schema/specification.ts`
- [x] T004 [P] Add `phaseid` UUID FK field (nullable, ON DELETE SET NULL, references `projectphases.id`) to `src/db/schema/timeentry.ts`
- [x] T005 [P] Create `src/db/schema/projectdocument.ts` — new `projectdocuments` table with fields: id (UUID PK defaultRandom), projectid (FK → projects CASCADE), type VARCHAR(50), title VARCHAR(255), content TEXT DEFAULT '', createdat, updatedat, createdbyid (FK → userprofiles SET NULL nullable)
- [x] T006 Add `export * from "./projectdocument"` to `src/db/schema/index.ts`
- [x] T007 Run `npm run db:generate` to generate migration SQL — **NOTE: human must run `npm run db:migrate` to apply to DB** ✓ Generated: src/db/migrations/0002_cultured_maximus.sql

---

## Phase B: Shared Types

- [x] T008 Add TypeScript types to `src/shared/types/index.ts`: `ProjectPhaseStatus`, `ProjectDocument`, `PhaseCompletionCriteria`, `ScaffoldResponse`, `PhaseWithAssignee` — used across routes, services, and frontend

---

## Phase C: Backend Foundation (Pre-existing Bugs)

- [x] T009 Fix `src/server/services/ProjectService.ts` line 1: change `import { db } from '~/server/lib/db.js'` → `import { db } from '~/db/client.js'`
- [x] T010 Fix `src/server/index.ts`: add `import projectsRoutes from "./routes/projects.js"` and `app.use("/api/projects", projectsRoutes)` after the existing route mounts (currently `/api/projects` is completely unmounted — all project endpoints are dead)

---

## Phase D: Service Layer

_T013, T014, T015 are independent new files — parallel._

- [x] T011 Rewrite `ProjectService.createProject()` in `src/server/services/ProjectService.ts`: accept `companyid` param, set `companyid` on insert, call `PhaseService.initializePhases(projectid)` in same transaction, then `setImmediate(() => AIScaffoldingService.scaffold(...))` for async AI
- [x] T012 Rewrite `ProjectService.getUserProjects()`: ADMIN path = `WHERE companyid = $1 ORDER BY updatedat DESC`; non-admin path = JOIN `projectphases` WHERE `pp.status = 'in_progress' AND pp.assigneduserid = $userid AND p.companyid = $companyid`; join assigned user fullname into response
- [x] T013 [P] Create `src/server/services/PhaseService.ts` with methods:
  - `initializePhases(projectid)` — insert 6 rows (Design=in_progress, rest=pending)
  - `getPhases(projectid)` — select all phases with assigned user join
  - `assignUser(phaseid, assigneduserid | null)` — update assigneduserid
  - `checkCompletion(phaseid, phasename, projectid)` → `{ canAdvance, criteria[] }` per data-model.md rules
  - `advancePhase(phaseid, projectid, initiatedby, reason?)` — validate criteria, set complete, activate next, log to companyauditlogs
  - `reopenPhase(phaseid, reason, initiatedby)` — set status=reopened, log to companyauditlogs
  - `canUserControlPhase(phaseid, userid, usertype)` → boolean (ADMIN always true; TEAM_MANAGER only if assigneduserid matches)
- [x] T014 [P] Create `src/server/services/ProjectDocumentService.ts` with methods:
  - `getDocuments(projectid)` — list all docs for project
  - `getOverview(projectid)` → document or null
  - `upsertDocument(projectid, type, title, content, createdbyid)` — insert or update by type
  - `updateDocument(docid, projectid, updates)` — patch title/content
- [x] T015 [P] Create `src/server/services/AIScaffoldingService.ts` with method:
  - `scaffold(projectid, projectname, description, companyid, createdbyid)` — async, no-throw (catches all errors, logs warning on failure)
  - Calls Gemini API (`GEMINI_API_KEY`) with project name + description to generate overview markdown
  - Stores result via `ProjectDocumentService.upsertDocument(..., type='overview', ...)`
  - Calls Gemini again to generate 3+ numbered spec stubs based on overview
  - Inserts `specifications` rows with phaseid = Design phase id, status='draft', specnumber='001','002','003'...
  - On any Gemini error: log with Pino, set document content = '' (empty — UI shows retry)

---

## Phase E: Route Layer

_All route additions are in the same file (`projects.ts`) — sequential._

- [x] T01X Rewrite `src/server/routes/projects.ts` `GET /` handler: extract `companyid` and `usertype` from `req` (JWT context), pass to `ProjectService.getUserProjects(userid, companyid, usertype)`, return project cards with active phase info and open task count
- [x] T01X Rewrite `src/server/routes/projects.ts` `POST /` handler: ADMIN-only guard (`req.usertype !== 'ADMIN'` → 403), update Zod schema to include `phaseassignments`, `pmsystems`, `securityclassification`; pass `companyid` and `phaseassignments` to `ProjectService.createProject()`; return `{ success, project, scaffolding: 'pending' }`
- [x] T01X Rewrite `src/server/routes/projects.ts` `GET /:id` handler: use `PhaseService.getPhases(projectid)` to include phases; for non-admin, verify `activephase.assigneduserid === userid` else 403
- [x] T01X Add to `src/server/routes/projects.ts`:
  - `GET /:id/phases` — `PhaseService.getPhases(projectid)`
  - `PATCH /:id/phases/:phaseid/assign` — ADMIN-only, `PhaseService.assignUser(phaseid, assigneduserid)`
  - `GET /:id/phases/:phaseid/completion` — `PhaseService.checkCompletion(...)`
  - `POST /:id/phases/:phaseid/advance` — auth check via `canUserControlPhase`, then `PhaseService.advancePhase(...)`, return 409 with criteria if `canAdvance = false`
  - `POST /:id/phases/:phaseid/reopen` — auth check, require `reason`, `PhaseService.reopenPhase(...)`
- [x] T020 Add to `src/server/routes/projects.ts`:
  - `GET /:id/phases/:phaseid/tasks` — query `tasks WHERE phaseid=$1` with assignee join
  - `POST /:id/phases/:phaseid/tasks` — Beta phase guard (require `usertype=ADMIN`, log approval); create task with `projectid` + `phaseid`
  - `PATCH /:id/phases/:phaseid/tasks/:taskid` — update status, assignee, result; `ai_proposed` dismiss = soft-delete (set status='orphaned')
- [x] T021 Add to `src/server/routes/projects.ts`:
  - `GET /:id/phases/:phaseid/specs` — query `specifications WHERE phaseid=$1 ORDER BY specnumber`
  - `POST /:id/phases/:phaseid/specs` — create spec, auto-assign next specnumber
  - `PATCH /:id/phases/:phaseid/specs/:specid` — update status (draft/review/approved), content, title
- [x] T022 Add to `src/server/routes/projects.ts`:
  - `GET /:id/documents` — `ProjectDocumentService.getDocuments(projectid)`
  - `PATCH /:id/documents/:docid` — ADMIN-only, `ProjectDocumentService.updateDocument(...)`
  - `GET /:id/scaffold` — assemble `ScaffoldResponse` from project + overview + specs (phaseid=Design) + phases with assignee names

---

## Phase F: Frontend Core

- [x] T023 [P] Create `src/client/components/Projects/ProjectCard.tsx` — card displaying: project name, current phase badge (color-coded), assigned user avatar+name, phase progress bar (N of 6), open task count, hours used/allocated, PM system icons, last updated. Full dark/light mode.
- [x] T024 [P] Create `src/client/components/Projects/CreateProjectModal.tsx` — form with: name (required), description, hourly rate, allocated hours, PM systems (multi-select: jira/monday/asana/trello), security classification (select), phase assignment dropdowns (6 phases × team member select). Submit calls `POST /api/projects`. Full dark/light mode.
- [x] T025 Create `src/client/pages/ProjectListPage.tsx` — page at `/projects`: fetches `GET /api/projects`, renders `ProjectCard` grid, "New Project" button (ADMIN only), search/filter bar, sort controls. Shows loading skeleton and empty state. Full dark/light mode.
- [x] T026 Update `src/client/App.tsx` — add routes: `/projects` → `ProjectListPage`, `/projects/:id` → `ProjectWorkspacePage`, `/projects/:id/phase/:phaseSlug` → `ProjectWorkspacePage`

---

## Phase G: Frontend Workspace

- [x] T027 [P] Create `src/client/components/Projects/PhaseTabBar.tsx` — 6-tab bar rendering phase name, assigned user avatar, status icon (checkmark=complete, highlighted=active, muted=pending, indicator=reopened). Clicking a tab navigates to `/projects/:id/phase/:slug`.
- [x] T028 [P] Create `src/client/components/Projects/PhaseCompletionBar.tsx` — renders criteria checklist below "Mark Phase Complete" button; button disabled until `canAdvance=true`; shows real-time pass/fail status per criterion (e.g. "3 tasks still open"). Used in all phase views. Full dark/light mode.
- [x] T029 [P] Create `src/client/components/Projects/TaskList.tsx` — reusable task list for Implementation/QA/HumanTesting/Beta phases; columns vary by phase (result column for QA, raised-by for HumanTesting); supports inline status update; shows time tracked per task. Full dark/light mode.
- [x] T030 [P] Create `src/client/components/Projects/SpecList.tsx` — spec list for Design phase; columns: number, title, status badge (draft/review/approved); inline create + edit; status update to approved. Full dark/light mode.
- [x] T031 [P] Create `src/client/components/Projects/ProjectOverviewTab.tsx` — renders `projectdocuments` content (type='overview') as markdown; shows skeleton loader while AI scaffolding is pending (content=''); ADMIN gets edit button that toggles a textarea; retry option if content still empty after 30s. Full dark/light mode.
- [x] T032 Create `src/client/components/Projects/DesignPhaseView.tsx` — renders `SpecList` + `PhaseCompletionBar` with Design criteria. Full dark/light mode.
- [x] T033 [P] Create `src/client/components/Projects/ImplementationPhaseView.tsx` — renders `TaskList` (implementation tasks) + `PhaseCompletionBar`. Full dark/light mode.
- [x] T034 [P] Create `src/client/components/Projects/QAPhaseView.tsx` — renders `TaskList` with result column (pass/fail) + `PhaseCompletionBar`. Full dark/light mode.
- [x] T035 [P] Create `src/client/components/Projects/HumanTestingPhaseView.tsx` — renders `TaskList` with raised-by column + `PhaseCompletionBar`. Full dark/light mode.
- [x] T036 [P] Create `src/client/components/Projects/BetaPhaseView.tsx` — same as HumanTesting but "New Task" requires ADMIN approval dialog before creation. Full dark/light mode.
- [x] T037 [P] Create `src/client/components/Projects/ReleasePhaseView.tsx` — release record form (version number, release method select, release date, release notes textarea) + full lifecycle summary table of all 6 phases. Blocked by `PhaseCompletionBar` until all prior phases complete. Full dark/light mode.
- [x] T038 Create `src/client/pages/ProjectWorkspacePage.tsx` — workspace shell: top bar (project name, current phase badge, back link, edit+archive for ADMIN), `PhaseTabBar`, `ProjectOverviewTab` tab, active phase view component (switch on phasename), collapsible sidebar (notes panel, time tracker, AI proposals). Full dark/light mode.

---

## Phase H: Claude Code Command

- [x] T039 Create `.claude/commands/project.init.md` — slash command that: reads `WXKANBAN_API_TOKEN` from env (error if missing), prompts for project ID or reads `.wxkanban-project` config, calls `GET /api/projects/:id/scaffold` with Bearer token, writes local directory structure (CLAUDE.md, `{ProjectName}-overview.md`, `specs/001-xxx/scope.md`...`specs/00N-xxx/scope.md`, `.wxkanban-project`), generates project-scoped CLAUDE.md with project name/ID, current phase, team assignments per phase, tech stack, wxKanban workspace URL, and phase-specific implementation focus

---

## Phase I: Polish & Validation

- [x] T040 [P] Audit all new components (T023-T038) for dark mode completeness — every `bg-*`, `text-*`, `border-*` class must have a paired `dark:` variant per constitution Section XII; fix any violations
- [x] T041 [P] Add TanStack Query hooks in `src/client/` for all new API endpoints: `useProjects`, `useProject`, `usePhases`, `usePhaseCompletion`, `usePhaseTasks`, `usePhaseSpecs`, `useProjectDocuments` — all with proper loading/error/stale states
- [x] T042 Run TypeScript check (`npm run check-types`) — resolve all errors in new files before marking complete
- [x] T043 (Note: requires db:migrate to be run by human before server-side scenarios can pass) Run Scenarios 1-7 from `quickstart.md` against dev server — all must pass

---

## Dependencies

```
T001-T005 (parallel) → T006 → T007 (db:generate, human runs db:migrate)
T007 → T008, T009 (DB must exist before services run)
T008, T009, T010, T011 → T013, T014, T015
T013, T014, T015 → T016, T017, T018, T019, T020, T021, T022
T016-T022 → T023, T024, T025
T025 → T026 (App.tsx routing needs page to exist)
T027-T031 (parallel) → T032, T033, T034, T035, T036, T037
T032-T037 (parallel) → T038
T038 (WorkspacePage depends on all phase views)
T038 → T039 (project.init references routes that must be stable)
T039 → T040, T041 (polish after implementation)
T040, T041 → T042 → T043
```

---

## Parallel Execution Examples

```
# Phase A — all schema files simultaneously:
T001: "Add assigneduserid to projectphase.ts"
T002: "Add phaseid+issuetype+result to task.ts"
T003: "Add phaseid to specification.ts"
T004: "Add phaseid to timeentry.ts"
T005: "Create projectdocument.ts schema"

# Phase D service layer — 3 independent new services:
T013: "Create PhaseService.ts"
T014: "Create ProjectDocumentService.ts"
T015: "Create AIScaffoldingService.ts"

# Phase G workspace components (after T038 shell exists):
T032: "DesignPhaseView"
T033: "ImplementationPhaseView"
T034: "QAPhaseView"
T035: "HumanTestingPhaseView"
T036: "BetaPhaseView"
T037: "ReleasePhaseView"
```

---

## Implementation Notes

- **DB migrate**: AI cannot run `db:migrate`. After T007, user must run `npm run db:migrate` before any server code touches new columns.
- **AI scaffolding failure**: `AIScaffoldingService` must never throw — all errors logged via Pino. UI shows skeleton/retry UI when `content = ''`.
- **Rogue pool**: T009 fixes the pre-existing bug where `ProjectService` imported `~/server/lib/db.js`. Do not import from that path in any new service.
- **companyid on project create**: `createProject` must extract `companyid` from the calling route's `req.companyid` (JWT context) and pass it to the service. Current service signature is missing this param.
- **Phase slugs** for client routing: `design`, `implementation`, `qa`, `human-testing`, `beta`, `release`

---

## Validation Checklist

- [x] All contracts have corresponding route tasks (T016-T022)
- [x] All entities have schema tasks (T001-T005)
- [x] Services layer before route layer before frontend
- [x] Parallel tasks use independent files
- [x] Each task specifies exact file path
- [x] No [P] task modifies the same file as another [P] task
- [x] Dark mode explicitly called out per constitution XII
- [x] Human migration step noted (T007)
