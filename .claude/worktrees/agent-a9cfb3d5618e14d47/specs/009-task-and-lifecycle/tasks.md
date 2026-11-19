# Tasks: Task and Lifecycle Management (Feature 009)

**Branch**: `009-task-and-lifecycle`
**Input**: plan.md, spec.md, data-model.md, contracts/api-contracts.md, quickstart.md
**Generated**: 2026-02-21
**Total Tasks**: 41
**User Stories**: US1 (Scope Approval), US2 (Phase Validation), US3 (Task Drawer), US4 (QA Fail/Escalate), US5 (Scope Matrix), US6 (AI Task Gen), US7 (Scope Chat), US8 (Notifications)

**Key Finding**: `specifications`, `tasks`, `projectphases`, `projects` tables exist. `ProjectWorkspacePage` with 6 phase views exists. `SpecList.tsx` and `TaskList.tsx` exist. `ScopeService`, `TaskService`, `ScopeChatService`, `NotificationService` do NOT exist — create new. New tables: `taskdependencies`, `scopeconversations`, `notifications`.

---

## Phase 1: Setup

- [X] T001 Confirm on branch `009-task-and-lifecycle`; read `src/db/schema/specification.ts`, `src/db/schema/task.ts`, `src/server/routes/projects.ts` to confirm current state before modifications

---

## Phase 2: Foundation — DB Schema + Shared Types

_All T002–T007 can run in parallel (different files). T008 is HUMAN. T009 can run parallel with T002–T007._

- [X] T002 [P] Create `src/db/schema/taskdependency.ts` — `taskdependencies` table: `id` UUID PK, `taskid` UUID FK→tasks.id CASCADE NOT NULL, `blockedbyid` UUID FK→tasks.id CASCADE NOT NULL, `createdat` TIMESTAMP DEFAULT NOW; add unique constraint on `(taskid, blockedbyid)`; export `TaskDependency` and `NewTaskDependency` inferred types
- [X] T003 [P] Create `src/db/schema/scopeconversation.ts` — `scopeconversations` table: `id` UUID PK, `scopeid` UUID FK→specifications.id CASCADE NOT NULL, `role` VARCHAR(10) NOT NULL (`'user'`, `'assistant'`, `'system'`), `content` TEXT NOT NULL, `createdat` TIMESTAMP DEFAULT NOW; export inferred types
- [X] T004 [P] Create `src/db/schema/notification.ts` — `notifications` table: `id` UUID PK, `userid` UUID FK→users.id CASCADE NOT NULL, `type` VARCHAR(50) NOT NULL, `entityid` UUID NULLABLE, `entitytype` VARCHAR(50) NULLABLE, `message` TEXT NOT NULL, `read` BOOLEAN DEFAULT false NOT NULL, `createdat` TIMESTAMP DEFAULT NOW; export inferred types
- [X] T005 [P] Update `src/db/schema/specification.ts` — add fields: `specorder: integer("specorder").default(0).notNull()`, `isoptional: boolean("isoptional").default(false).notNull()`, `createdbyid: uuid("createdbyid").references(() => users.id, { onDelete: "set null" })`; update `status` field comment to list full lifecycle values: `draft, in_review, pending_clarification, clarified, planned, tasks_generated, implemented, qa_passed, human_tested, beta_cleared, released, deferred`; add import for `users` and `boolean`, `integer`
- [X] T006 [P] Update `src/db/schema/task.ts` — add field: `specid: uuid("specid").references(() => specifications.id, { onDelete: "set null" })`; add import for `specifications`
- [X] T007 Update `src/db/schema/index.ts` — export `taskdependencies` from `./taskdependency.js`, `scopeconversations` from `./scopeconversation.js`, `notifications` from `./notification.js`
- [ ] T008 **HUMAN TASK**: Run `npm run db:generate && npm run db:migrate` to apply schema changes (adds `specorder`, `isoptional`, `createdbyid` to specifications; adds `specid` to tasks; creates `taskdependencies`, `scopeconversations`, `notifications` tables)
- [X] T009 [P] Update `src/shared/types/projects.ts` — add: `ScopeStatus` union type (all 12 lifecycle values); `ProjectScope` interface (id, projectid, specnumber, title, content, status: ScopeStatus, specorder, isoptional, createdbyid, createdbyname, createdat, updatedat, taskcount, completedtaskcount); `TaskDependency` interface; `ScopeConversation` interface; `Notification` interface with all notification types; update `ProjectSpec.status` to `ScopeStatus | 'review' | 'approved'` for backward compat; add `ScopeMatrixCell` type (`'pending' | 'active' | 'complete' | 'blocked' | 'deferred'`); add `ScopeMatrixRow` interface

---

## Phase 3: US1 — Scope Lifecycle Backend

- [X] T010 Create `src/server/services/ScopeService.ts` — implement: `createScope(projectid, title, content, userid)`: auto-assign next available `specnumber` (query MAX + 1, zero-pad to 3 digits), set `createdbyid`, `specorder` = current count; `getScopes(projectid)`: return all scopes sorted by `specorder` with task counts; `updateScope(scopeid, data, userid)`: if `content` changes and status is `in_review` or `clarified`, auto-revert status to `draft`, write `companyauditlogs` entry; `submitForReview(scopeid, override)`: call AI conflict check against other scopes (Gemini API), return conflicts list; if no conflicts or `override=true`, transition `draft → in_review`, send `scope_submitted` notification to ADMIN + Phase 1 assignee, write audit log; `approveScope(scopeid, action, note, clarificationtype, reviewerid)`: enforce Phase 1 assignee or ADMIN only; implement three actions per FR-021; write audit log; send notifications; `adminStatusOverride(scopeid, status, reason, adminid)`: any→any, write audit log; `getScopeMatrix(projectid)`: derive cell statuses per Decision 6 in plan.md
- [X] T011 Update `src/server/routes/projects.ts` — add scope lifecycle routes using `ScopeService`: `GET /projects/:id/scopes`, `POST /projects/:id/scopes`, `PATCH /projects/:id/scopes/:scopeid`, `POST /projects/:id/scopes/:scopeid/submit` (with optional `{ override: true }` body), `POST /projects/:id/scopes/:scopeid/approve`, `PATCH /projects/:id/scopes/:scopeid/status`, `GET /projects/:id/scopes/matrix`; add Zod validation schemas for each; restrict approve and status-override to Phase 1 assignee / ADMIN via role check
- [X] T012 [P] Create `src/server/services/NotificationService.ts` — `createNotification(userid, type, entityid, entitytype, message)`: insert to `notifications`; `getNotifications(userid, opts: { unreadonly?, limit?, offset? })`: query with filter; `markRead(id, userid)`: verify owner; `markAllRead(userid)`: bulk update; export all
- [X] T013 Update `src/server/routes/projects.ts` (or new `src/server/routes/notifications.ts` mounted in `src/server/index.ts`) — add notification routes: `GET /notifications`, `PATCH /notifications/:id/read`, `POST /notifications/read-all`

---

## Phase 4: US2 — Phase Advancement Validation

- [X] T014 Update `src/server/services/PhaseService.ts` — enhance `validatePhaseCompletion(projectid, phaseid)` to return `{ canadvance, criteria, blockingtasks }`: Phase 1 criteria: at least one scope at `clarified`+, no `draft` scope with null `createdbyid`, no scope stuck in `in_review` without assignee; Phase 2 criteria: all tasks in `completed`; Phase 3 criteria: all tasks `result = 'pass'` (no `fail`); Phase 4/5 criteria: no tasks in `open`; Phase 6: Release record exists; add `completePhase(projectid, phaseid)` that runs validation, transitions `status → complete` on current phase, `status → in_progress` on next phase, updates `enteredat`/`completedat`, writes `companyauditlogs`, calls `NotificationService.createNotification()` for next phase assignee
- [X] T015 Update `src/server/routes/projects.ts` — add/update routes: `GET /projects/:id/phases/:phaseid/validate` returning `PhaseCompletion` shape from contracts; `POST /projects/:id/phases/:phaseid/complete` calling `PhaseService.completePhase()`, returning 422 with criteria if validation fails

---

## Phase 5: US3 — Task Detail Service + Drawer UI

- [X] T016 [P] Create `src/server/services/TaskService.ts` — `getTaskDetail(taskid, projectid)`: fetch task with `blockedby` (incomplete blocking tasks), `blocking` (tasks this blocks), `timeentriescount`, `notescount`, `scopetitle`; `updateTask(taskid, data, userid)`: call `handleQAFail()` if `result=fail` on Phase 3 task (see T026), call `handleEscalate()` if `status=escalated` on Phase 4/5 task (see T027); write activity log entry for every field change; `getTaskActivity(taskid)`: return chronological activity log; `addDependency(taskid, blockedbyid)`: check for circular dependency chain before insert; `removeDependency(depid, taskid)`: verify ownership
- [X] T017 Update `src/server/routes/projects.ts` — add task detail routes: `GET /projects/:id/tasks/:taskid` calling `TaskService.getTaskDetail()`; `GET /projects/:id/tasks/:taskid/activity` calling `TaskService.getTaskActivity()`; update `PATCH /projects/:id/tasks/:taskid` to call `TaskService.updateTask()` instead of direct DB update
- [X] T018 Update `src/server/routes/projects.ts` — add dependency routes: `POST /projects/:id/tasks/:taskid/dependencies` (body: `{ blockedbyid }`), `DELETE /projects/:id/tasks/:taskid/dependencies/:depid`; use `TaskService.addDependency()` / `removeDependency()`
- [X] T019 [P] Create `src/client/components/Projects/TaskDrawer.tsx` — right-side drawer that opens when `?task=:taskid` URL param is present; fetches `GET /projects/:id/tasks/:taskid`; header: task title (inline editable), status badge (phase-appropriate dropdown), priority badge; meta section: linked scope (clickable), phase, assignee select, effort select, due date picker, external ref (read-only if PM-synced); 4 sub-panel tabs: Activity, Time, Dependencies, Notes; close button removes `?task` param from URL; dark/light mode (bg-white dark:bg-gray-800, text-gray-900 dark:text-white, borders dark:border-gray-700)
- [X] T020 [P] Create `src/client/components/Projects/TaskDrawerActivity.tsx` — fetches `GET /tasks/:id/activity`; renders chronological list with actor name, timestamp, change description; empty state "No activity yet"
- [X] T021 [P] Create `src/client/components/Projects/TaskDrawerTime.tsx` — fetches time entries from existing time entries API filtered by task; shows list (date, duration, billable badge, note); running total at top; "Start timer on this task" button that dispatches to sidebar timer context; dark/light mode
- [X] T022 [P] Create `src/client/components/Projects/TaskDrawerDeps.tsx` — two sections: "Blocked by" and "Blocks"; each shows task name + status + link to open that task's drawer; "Add dependency" input (task search by name within project); "Remove" button per dep; inline error if circular dependency detected; dark/light mode
- [X] T023 [P] Create `src/client/components/Projects/TaskDrawerNotes.tsx` — free-form markdown textarea; POST/PATCH to notes API (`/api/notes`) scoped with `taskid`; save button; read-only markdown preview when not editing; dark/light mode
- [X] T024 [P] Create `src/client/components/Projects/PhaseTaskGroup.tsx` — collapsible group per scope: header row shows scope number (e.g., `[001]`), scope title (color-coded by `ScopeStatus`), task count + completion count, chevron toggle; body lists task rows: checkbox/status badge, task name (clickable → sets `?task=` param), priority dot, assignee avatar, due date, "Blocked" badge if `isblocked`; empty scoped group still shows header (collapsed by default if all complete); dark/light mode
- [X] T025 Update `src/client/pages/ProjectWorkspacePage.tsx` — (a) read `?task=:taskid` URL param; render `<TaskDrawer>` as right-side overlay when param present; pass `projectid`, `phaseid`, `taskid`; (b) update `ImplementationPhaseView`, `QAPhaseView`, `HumanTestingPhaseView`, `BetaPhaseView` to accept grouped task data and render `<PhaseTaskGroup>` per scope group instead of flat `<TaskList>`; (c) pass `onTaskClick` callback that sets `?task=` URL param

---

## Phase 6: US4 — QA Fail → Bug + Escalate → Scope

- [X] T026 Update `src/server/services/TaskService.ts` — complete `handleQAFail(task, userid)`: when `result = 'fail'` is set on a Phase 3 task: insert new task with `issuetype = 'bug'`, `name = '[QA Fail] ' + task.name`, `description = task.description`, `specid = task.specid`, `projectid = task.projectid`, `phaseid` = Phase 2 phase id (query `projectphases` for Implementation phase), `status = 'open'`, `assignedtoid = null`, `sourceoforigin = 'internal'`; call `NotificationService.createNotification()` for Phase 2 `assigneduserid` with type `qa_fail_bug_created`
- [X] T027 Update `src/server/services/TaskService.ts` — complete `handleEscalate(task, project, userid)`: when `status = 'escalated'` on Phase 4/5 task: insert new `specifications` record with `title = task.name`, `content = 'Escalated from Phase 4 of ' + project.name + ' on ' + date + '\n\n' + (task.description ?? '')`, `status = 'draft'`, `projectid = task.projectid`, `createdbyid = null`, `specorder` = max + 1, `specnumber` = next available; call `NotificationService.createNotification()` for ADMIN with type `task_approval_required`

---

## Phase 7: US5 — Scope Matrix View

- [X] T028 [P] Create `src/client/components/Projects/ScopeMatrixView.tsx` — grid layout: scopes as rows (sorted by `specorder`), 6 phase columns (Design, Implementation, QA, HumanTesting, Beta, Release); cell = status pill: `pending`=gray, `active`=blue-500, `complete`=green-500, `blocked`=red-500, `deferred`=muted/italic; scope title column shows lifecycle color per FR-003 (blue=draft/in_review, amber=in_review, green=implemented+, gray=released/deferred); sticky header row; `isoptional` scopes show "(optional)" suffix; fetches `GET /projects/:id/scopes/matrix`; dark/light mode on all cells and header
- [X] T029 Update `src/client/pages/ProjectWorkspacePage.tsx` — add "Scope Matrix" tab to `<PhaseTabBar>` between Overview and Design; render `<ScopeMatrixView projectid={id} />` when active; ensure tab is visible to ADMIN and TEAM_MANAGER

---

## Phase 8: US6 — AI Task Generation

- [X] T030 [P] Create `src/server/services/ScopeChatService.ts` — task generation section: `generateTaskProposals(scopeid, projectid)`: fetch scope content + phase IDs; call Gemini API (`gemini-1.5-pro` or env-configured model) with prompt asking for structured JSON array of tasks (name, description, issuetype, priority, phase); parse response; for each proposal call `deduplicateTasks(name, projectid, phaseid)` which checks Levenshtein distance ≤ 0.2 against existing `tasks.name` in same project; mark `isDuplicate: true` on matches; return proposals array
- [X] T031 Update `src/server/routes/projects.ts` — add `POST /projects/:id/scopes/:scopeid/generate-tasks` calling `ScopeChatService.generateTaskProposals()`; add `POST /projects/:id/scopes/:scopeid/approve-tasks` (body: `{ approvedtasks[] }`): bulk-insert approved tasks using Drizzle, set `specid`, `projectid`, `phaseid`, `sourceoforigin = 'ai_proposed'`; return `{ created: [...] }`

---

## Phase 9: US7 — Scope Chat

- [X] T032 Update `src/server/services/ScopeChatService.ts` — add: `assembleChatContext(scopeid, projectid)`: fetch project overview doc, all sibling scopes (number+title+content), current scope, phase assignments with assignee names; declined splits list from `scopeconversations` where `role='system'` and content contains `"split_declined"`; `streamChatResponse(scopeid, message, context, res)`: SSE handler — write user message to `scopeconversations`, call Gemini streaming API, emit `token`, `section_lock`, `section_unlock`, `scope_update`, `split_proposal`, `done` SSE events; detect split signals mid-stream; write assistant response to `scopeconversations` on completion; `handleSplit(scopeid, action, topic, suggestedname, projectid)`: on accept — extract content (AI call), create new scope record (draft), update current scope content, write system event to `scopeconversations`; on decline — write `{ type: "split_declined", topic }` system event
- [X] T033 Update `src/server/routes/projects.ts` — add scope chat routes: `GET /projects/:id/scopes/:scopeid/chat` (returns conversation history + current scope content); `POST /projects/:id/scopes/:scopeid/chat` (SSE — set headers `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`; call `ScopeChatService.streamChatResponse()`); `POST /projects/:id/scopes/:scopeid/chat/split` (body: `{ action, topic, suggestedname }`); `GET /projects/:id/scopes/:scopeid/chat/export` (query: `?format=markdown|text`; set `Content-Disposition: attachment`); restrict all chat routes to Phase 1 assignee and ADMIN only
- [X] T034 [P] Create `src/client/components/Projects/ScopeChatView.tsx` — split-panel: left = chat panel (message list + text input + send button + "Finalize Scope" button + "Export conversation" button); right = Markdown editor (contenteditable div or textarea with monospace font and line wrap); desktop: draggable divider (default 50/50, min 320px each, position saved to `localStorage`); mobile: single column, chat above, editor below; SSE client: `EventSource` for POST to chat endpoint (use fetch + ReadableStream for POST SSE); on `token` event — append to last assistant message in state; on `section_lock` — add `[LOCKED]` visual overlay to that section in editor; on `section_unlock` — remove overlay; on `scope_update` — replace editor content; on `split_proposal` — show inline card with accept/decline buttons; "Finalize Scope" = POST to `/scopes/:id/submit`; all elements dark/light mode
- [X] T035 Update `src/client/components/Projects/SpecList.tsx` — transform to full scope list with lifecycle features: status color-coded title per FR-003 (blue border-left for draft/in_review, amber for in_review, green for implemented+, muted for deferred); "Discuss this scope" button → navigate to `/projects/:id/scopes/:scopeid/chat`; "Submit for Review" button visible on `draft` scopes; approve/reject/request-clarification action buttons visible to Phase 1 assignee/ADMIN on `in_review` scopes (inline confirmation for request_changes); `isoptional` toggle checkbox (ADMIN only); drag handles for `specorder` reorder (ADMIN only, PATCH `specorder` on drop); "Deferred" badge on `deferred` scopes; dark/light mode for all new elements

---

## Phase 10: Notifications Bell UI

- [X] T036 Update `src/server/index.ts` — ensure notification router is mounted at `/api/notifications` (if extracted to separate file in T013; otherwise routes already in projects.ts)
- [X] T037 [P] Add notification bell to `src/client/components/Dashboard/Header.tsx` (or AppShell header component) — bell icon (`lucide-react` `Bell`); unread count badge (red circle, hidden when 0); `useQuery` polling every 30s to `GET /notifications?unreadonly=true&limit=50`; dropdown panel on click: list last 10 notifications (message, timestamp, read/unread state); click notification → mark read + navigate to `entitytype`/`entityid` URL; "Mark all read" button at bottom; dark/light mode (bg-white dark:bg-gray-800, border dark:border-gray-700)

---

## Phase 11: Polish + Type Check

- [X] T038 [P] Run `npm run check-types` — fix all TypeScript errors in modified/new files: `specification.ts`, `task.ts`, `taskdependency.ts`, `scopeconversation.ts`, `notification.ts`, `index.ts`, `ScopeService.ts`, `TaskService.ts`, `ScopeChatService.ts`, `NotificationService.ts`, `projects.ts`, `projects.ts` (types), `TaskDrawer.tsx`, `ScopeChatView.tsx`, `ScopeMatrixView.tsx`, `PhaseTaskGroup.tsx`, `SpecList.tsx`, `ProjectWorkspacePage.tsx`
- [X] T039 [P] Dark mode audit — open each new/modified UI component and verify every color class has a paired `dark:` variant per constitution §XII; fix any missing pairs in: `TaskDrawer.tsx`, `TaskDrawerActivity.tsx`, `TaskDrawerTime.tsx`, `TaskDrawerDeps.tsx`, `TaskDrawerNotes.tsx`, `PhaseTaskGroup.tsx`, `ScopeMatrixView.tsx`, `ScopeChatView.tsx`, `SpecList.tsx` (updated sections), notification bell dropdown
- [ ] T040 **HUMAN TASK**: Run all 5 quickstart scenarios from `specs/009-task-and-lifecycle/quickstart.md` against dev server; confirm expected outputs match; report any deviations
- [X] T041 Update `specs/009-task-and-lifecycle/checklists/requirements.md` — mark Phase 3 (Plan) and Phase 4 (Tasks) as complete; update iteration count

---

## Dependencies

```
T001 → T002–T009 (must confirm state before schema changes)
T002–T006 → T007 (all schemas before index export)
T007 → T008 HUMAN (index must be complete before migration)
T008 → T010, T014, T016 (migration must run before services use new columns)
T009 → T019–T028 (shared types before UI components)
T010 → T011 (ScopeService before routes)
T012 → T011, T013 (NotificationService before routes that call it)
T014 → T015 (PhaseService before phase routes)
T016 → T017, T018, T026, T027 (TaskService before routes and QA/escalate logic)
T019–T023 → T025 (drawer sub-panels before workspace integration)
T024 → T025 (PhaseTaskGroup before workspace integration)
T026, T027 → T038 (QA/escalate logic complete before type check)
T030 → T031 (ScopeChatService task gen before routes)
T032 → T033 (ScopeChatService chat section before chat routes)
T034 → T035 (ScopeChatView uses routes from T033)
T036, T037 → T038 (all services + UI complete before type check)
T038 → T039 (type check passes before dark mode audit)
T039 → T040 HUMAN (dark mode audit passes before human testing)
```

---

## Parallel Execution Examples

```
# Foundation schema (all independent files):
T002, T003, T004, T005, T006, T009 — launch all in parallel

# After T008 (migration), these service files are independent:
T010, T012 — parallel
T014, T016 — parallel (different service files)
T030, T032 — can be split: T030 (task gen section) then T032 (chat section) OR parallel

# UI components (all different files):
T019, T020, T021, T022, T023, T024, T028 — all parallel after T009
T034, T035 — parallel (different component/route files)
```

---

## MVP Scope Recommendation

**P0 (blocks everything else)**: T001–T009 (schema + types)

**P1 (core workflow, visible value)**: T010–T015 (scope approval + phase validation), T016–T018 (task service), T024–T029 (drawer UI + matrix)

**P2 (high value, somewhat independent)**: T026–T027 (QA fail/escalate), T030–T031 (AI task gen), T036–T037 (notifications)

**P3 (advanced features)**: T032–T035 (Scope Chat with streaming)

**Ship without**: Scope Chat can be deferred to a follow-on feature if needed; all other phases deliver independently useful functionality.
