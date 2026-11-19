# Requirements Checklist: Scope Kanban Board (Spec 012)

**Feature**: Spec 012 — Scope Kanban Board
**Date**: 2026-02-22
**Reviewer**: wxAI pipeline

---

## Phase 1: Specify ✅

- [x] Scope document exists: `specs/Project-Scope/012-scope-KanbanView.md`
- [x] All functional requirements numbered (FR-001 through FR-010)
- [x] All user stories have expected outcomes (US1–US6)
- [x] Success criteria are measurable (10 criteria)
- [x] Key entities identified (specifications, tasks, projectphases, companyauditlogs)
- [x] Constraints documented (no new tables, @dnd-kit required)
- [x] Dependencies on Spec 007 and Spec 009 noted

## Phase 2: Clarify ✅

- [x] DnD library decision resolved: `@dnd-kit/core` (Decision C1)
- [x] Phase skip rules resolved: Phases 1–3 mandatory, 4–5 optional (Decision C2)
- [x] Backward drag permissions resolved: PM + ADMIN, reason required (Decision C3)
- [x] Task counts API decision resolved: always return full breakdown (user decision)
- [x] Confirmation dialog style resolved: generic editable defaults (user decision)
- [x] Card click behavior resolved: opens Scope Chat (Decision C5)
- [x] `clarified` status column resolved: Phase 1 (Decision C6)

## Phase 3: Plan ✅

- [x] `specs/012-KanbanView/plan.md` created
- [x] Technical context documented (TypeScript, React 18, @dnd-kit)
- [x] Constitution check passed
- [x] Project structure documented (4 new files, 4 modified files)
- [x] All key decisions documented with rationale (7 decisions)
- [x] Phase mapping table complete
- [x] Drag → status mapping table complete
- [x] Progress tracking section present

## Phase 4: Tasks ✅

- [x] `specs/012-KanbanView/tasks.md` created
- [x] 13 tasks generated covering all implementation work
- [x] Tasks grouped into logical phases (A: Install, B: Backend, C: Frontend, D: Integration, E: Validation)
- [x] Parallel tasks marked with `[P]`
- [x] Human tasks marked with `**HUMAN TASK**`
- [x] Dependency graph complete
- [x] Each task specifies exact file path
- [x] No `[P]` task modifies the same file as another `[P]` task
- [x] MVP scope defined (P0/P1/P2)

## Phase 5: Implementation (pending)

- [ ] T001: @dnd-kit packages installed
- [ ] T002: `src/shared/types/projects.ts` updated
- [ ] T003: `src/server/services/ScopeService.ts` updated
- [ ] T004: `src/server/routes/projects.ts` updated
- [ ] T005: `ScopeKanbanFilterBar.tsx` created
- [ ] T006: `ScopeKanbanCard.tsx` created
- [ ] T007: `ScopeKanbanColumn.tsx` created
- [ ] T008: `ScopeKanbanBoard.tsx` created
- [ ] T009: `ProjectWorkspacePage.tsx` updated

## Phase 6: Validation (pending)

- [ ] T010: npm install verified
- [ ] T011: TypeScript compiles cleanly
- [ ] T012: Board loads in browser with correct scope placement
- [ ] T013: Drag-and-drop works end-to-end

---

## API Contract Checks

- [x] `GET /api/projects/:id/scopes` — extended to always return full task breakdown
- [x] `GET /api/projects/:id/phases` — reused unchanged
- [x] `PATCH /api/projects/:id/scopes/:scopeid/status` — reason made optional; TEAM_MANAGER allowed
- [x] No new API endpoints required

## Security Checks

- [x] TEAM_MEMBER cannot drag (permission guard in frontend + backend)
- [x] Backward drag logged to `companyauditlogs`
- [x] All API calls use existing `authenticateToken` middleware
- [x] No new auth bypass paths introduced

## Accessibility Checks

- [x] Keyboard DnD specified (Tab → Space → Arrow → Space/Enter → Escape)
- [x] `aria-live="polite"` announcements on drop
- [x] Column headers: `role="region"` with `aria-label`
- [x] Cards: `role="button"` with `aria-label` including spec number + title + status
- [x] Color is never sole status indicator (all badges have text labels)
