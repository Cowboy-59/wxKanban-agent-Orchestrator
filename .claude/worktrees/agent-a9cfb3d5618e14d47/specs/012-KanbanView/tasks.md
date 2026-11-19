# Tasks: Scope Kanban Board (Spec 012)

**Branch**: `012-kanban-view`
**Input**: `specs/012-KanbanView/spec.md`, `specs/012-KanbanView/plan.md`, `specs/Project-Scope/012-scope-KanbanView.md`
**Generated**: 2026-02-22
**Total Tasks**: 13
**User Stories**: US1 (Board View), US2 (Forward Drag), US3 (Backward Drag), US4 (Read-Only), US5 (Filter), US6 (Defer)

---

## Phase A: Install & Types

_Install @dnd-kit packages and extend shared types. T001 and T002 can run in parallel._

- [ ] T001 [P] Install `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` via npm — run `npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities` and verify entries appear in `package.json` dependencies
- [ ] T002 [P] Update `src/shared/types/projects.ts` — add `opencount: number`, `inprogresscount: number`, `orphanedcount: number` to `ProjectScope` interface (extends `ProjectSpec`)

---

## Phase B: Backend

_Extend ScopeService and update route permissions. T003 and T004 can run in parallel._

- [ ] T003 [P] Update `src/server/services/ScopeService.ts` — extend `getScopes()` SQL query to always return full task breakdown: add `COUNT(*) FILTER (WHERE status = 'open')` as `task_open`, `COUNT(*) FILTER (WHERE status = 'in_progress')` as `task_in_progress`, `COUNT(*) FILTER (WHERE status = 'orphaned')` as `task_orphaned` to the existing task count aggregation; map `opencount`, `inprogresscount`, `orphanedcount` in the return object; update `getScope()` similarly
- [ ] T004 [P] Update `src/server/routes/projects.ts` — in `overrideStatusSchema` change `reason: z.string().min(1)` to `reason: z.string().optional()`; in `PATCH /:id/scopes/:scopeid/status` handler update permission check to allow `TEAM_MANAGER` (not just ADMIN) for all status transitions; use `reason ?? 'Kanban board transition'` as fallback when reason is absent

---

## Phase C: Frontend Components

_Build the 4 new components. T005 and T006 can run in parallel. T007 depends on T006. T008 depends on T005, T006, T007._

- [ ] T005 [P] Create `src/client/components/Projects/ScopeKanbanFilterBar.tsx` — props: `search`, `onSearchChange`, `showOptional`, `onShowOptionalChange`, `showDeferred`, `onShowDeferredChange`, `hideEmpty`, `onHideEmptyChange`; render: debounced search text input (200ms), three toggle buttons (Show Optional default ON, Show Deferred default ON, Hide Empty Columns default OFF), active filter chips with dismiss, "Clear all" button when any filter active
- [ ] T006 [P] Create `src/client/components/Projects/ScopeKanbanCard.tsx` — props: `scope: ProjectScope`, `isDragging: boolean`, `canDrag: boolean`, `onOpenChat: () => void`, `onOpenTasks: () => void`; render: spec number (bold mono) + title (truncated 1 line) + content preview (60 chars muted), status badge reusing `STATUS_BADGE`/`STATUS_LABEL` color map from `SpecList.tsx` pattern, task progress bar (gray=0%, indigo=1-49%, indigo-to-green=50-99%, solid green=100%), open count (orange) + completed count (green) as clickable area → `onOpenTasks`, optional badge if `isoptional`, drag handle icon (hidden when `!canDrag`); `role="button"` with `aria-label` including spec number + title + status; click → `onOpenChat`
- [ ] T007 Create `src/client/components/Projects/ScopeKanbanColumn.tsx` — props: `phaseNumber: number`, `label: string`, `subtitle: string`, `scopes: ProjectScope[]`, `assignee: PhaseAssignedUser | null`, `phaseStatus: ProjectPhaseStatus`, `accentColor: string`, `isOver: boolean`, `canDrop: boolean`, `isDeferred?: boolean`; render: 4px top border in `accentColor`, column header (phase number + name, subtitle, scope count badge, assignee avatar initials, phase status dot), `role="region"` with `aria-label` including phase name + scope count, droppable zone (highlights border on `isOver && canDrop`, dims on `isOver && !canDrop`), renders `ScopeKanbanCard` list; Deferred column uses double-line left border + muted gray scheme
- [ ] T008 Create `src/client/components/Projects/ScopeKanbanBoard.tsx` — main board component; props: `projectid: string`, `onOpenChat: (scopeid: string) => void`; data loading: `GET /api/projects/:id/scopes` + `GET /api/projects/:id/phases` on mount; status→phase column mapping per spec table; `DndContext` + `DragOverlay` from `@dnd-kit/core`; drag start: card lifts with `shadow-xl scale-105`, ghost placeholder stays in source column; drag over valid column: border highlights; drag over invalid column (phase skip violation or no permission): dims + `cursor-not-allowed`; on drop: show `TransitionConfirmDialog` (generic editable default for forward, generic editable required for backward, generic editable for deferred); optimistic UI update on confirm → `PATCH /api/projects/:id/scopes/:scopeid/status` → snap-back + error message on failure; permission guard: `canDrag = isAdmin || isTeamManager`; filter bar integration; horizontal scroll `overflow-x: auto` min column width 260px; keyboard DnD: Tab→Space(pick up)→Arrow Left/Right→Space/Enter(drop)→Escape(cancel); `aria-live="polite"` announcements; `OpenTasksPopup` overlay on task count click; refresh button

---

## Phase D: Workspace Integration

- [ ] T009 Update `src/client/pages/ProjectWorkspacePage.tsx` — add `kanban` handling: update `activeTab` derivation so `phaseSlug === 'kanban'` sets `activeTab = 'kanban'`; add "Kanban" tab button (with `Columns` or `LayoutDashboard` icon from lucide-react) after the Matrix tab button, using same active/inactive styling pattern; add `{activeTab === 'kanban' && <ScopeKanbanBoard projectid={project.id} onOpenChat={(id) => setOpenChatScopeId(id)} />}` in the content area; import `ScopeKanbanBoard`

---

## Phase E: Validation (HUMAN)

_Run after Phase D is complete. Sequential._

- [ ] T010 **HUMAN TASK**: Run `npm install` and verify `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` appear in `package.json` and `node_modules`
- [ ] T011 **HUMAN TASK**: Run `npm run check-types` — verify TypeScript compiles cleanly with zero errors across all modified and new files
- [ ] T012 **HUMAN TASK**: Start dev server (`npm run dev`), navigate to a project, verify Kanban tab appears in tab bar, board loads with scope cards in correct phase columns, filter bar is functional
- [ ] T013 **HUMAN TASK**: Test drag-and-drop: drag a scope card forward (verify confirmation dialog with editable default reason, verify status updates); drag backward (verify reason required); verify TEAM_MEMBER sees read-only board with no drag handles

---

## Dependencies

```
T001, T002 (parallel) → T003, T004
T001 → T008 (dnd-kit must be installed before board component)
T002 → T003 (type must be updated before service)
T002 → T006 (ProjectScope type used in card)
T002 → T008 (ProjectScope type used in board)
T003, T004 → T008 (backend complete before board integration)
T005, T006 → T007 (filter bar and card before column)
T005, T006, T007 → T008 (all sub-components before board)
T008 → T009 (board component before workspace integration)
T009 → T010, T011, T012, T013 (implementation complete before validation)
T010 → T011 (packages installed before type check)
T011 → T012 (type check passes before browser test)
T012 → T013 (board loads before drag test)
```

---

## Parallel Execution Examples

```
# Phase A — parallel:
T001, T002 — install packages and update types simultaneously

# Phase B — parallel:
T003, T004 — ScopeService and routes are independent files

# Phase C — partial parallel:
T005, T006 — FilterBar and Card are independent
T007 — after T006 (uses ScopeKanbanCard)
T008 — after T005, T006, T007

# Phase E — sequential:
T010 → T011 → T012 → T013
```

---

## MVP Scope

**P0 (must complete before any testing)**: T001–T009 (full implementation)

**P1 (core validation)**: T010, T011, T012 (install + type check + board loads)

**P2 (full validation)**: T013 (drag-and-drop end-to-end)
