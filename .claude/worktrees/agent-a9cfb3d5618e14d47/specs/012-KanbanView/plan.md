# Implementation Plan: Scope Kanban Board (Spec 012)

**Branch**: `012-kanban-view` | **Date**: 2026-02-22 | **Spec**: `specs/012-KanbanView/spec.md`
**Input**: `specs/Project-Scope/012-scope-KanbanView.md`, `specs/012-KanbanView/spec.md`

---

## Summary

Add a **Scope Kanban Board** tab to the project workspace. The board shows all scopes as cards organized into 6 lifecycle phase columns + a Deferred column. ADMIN and TEAM_MANAGER users can drag cards between columns to advance or revert scope status, with confirmation dialogs (generic editable defaults for forward drags, required editable reason for backward drags). TEAM_MEMBER users see a read-only board.

Backend change: extend `GET /api/projects/:id/scopes` to always return full task count breakdown (total, open, in_progress, completed, orphaned). No new tables, no schema migration.

Frontend: 4 new components + 1 modified page. DnD via `@dnd-kit/core`.

---

## Technical Context

**Type**: Frontend feature + backend extension
**Language/Version**: TypeScript 5.3, React 18, Express 4
**Primary Dependencies**: `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` (new); existing React + Vite + Tailwind stack
**Storage**: PostgreSQL — reads `specifications`, `tasks`, `projectphases`; writes `specifications.status` + `companyauditlogs`
**Testing**: Manual verification via browser
**Target Platform**: Web (desktop primary, tablet/mobile responsive)
**Performance Goals**: No specific concerns — simple data load on mount
**Constraints**: No new DB tables; reuse existing API routes where possible; `@dnd-kit` chosen for accessibility + touch support

---

## Constitution Check

| Gate | Status | Notes |
|------|--------|-------|
| TypeScript only | ✅ Pass | All new files are `.tsx` / `.ts` |
| No `console.log` | ✅ Pass | Uses logger pattern from existing components |
| No `any` types | ✅ Pass | All types from `~/shared/types/projects` |
| Security: no secrets | ✅ Pass | Auth via existing `authenticateToken` middleware |
| Dark/light mode | ✅ Pass | All Tailwind classes include `dark:` variants |
| No toast messages | ✅ Pass | Error feedback via inline error state |
| Database naming conventions | ✅ Pass | No new tables |

**Gate Result**: PASS

---

## Project Structure

### New Files

```
src/client/components/Projects/
├── ScopeKanbanFilterBar.tsx   # Search + filter toggles
├── ScopeKanbanCard.tsx        # Scope card with status badge + task bar
├── ScopeKanbanColumn.tsx      # Phase column with droppable zone
└── ScopeKanbanBoard.tsx       # Main board — DnD context + all state

specs/012-KanbanView/
├── spec.md                    # Feature specification
├── plan.md                    # This file
├── quickstart.md              # Test scenarios
├── tasks.md                   # Implementation task list
├── lifecycle.json             # Pipeline lifecycle tracking
└── checklists/
    └── requirements.md        # Quality checklist
```

### Modified Files

```
src/shared/types/projects.ts              # Add opencount, inprogresscount, orphanedcount to ProjectScope
src/server/services/ScopeService.ts       # Extend getScopes() + getScope() with full task breakdown
src/server/routes/projects.ts             # Make reason optional; allow TEAM_MANAGER for all status transitions
src/client/pages/ProjectWorkspacePage.tsx # Add Kanban tab button + render ScopeKanbanBoard
```

---

## Key Decisions

### Decision 1: API always returns full task breakdown

**Chosen**: `GET /api/projects/:id/scopes` always returns `opencount`, `inprogresscount`, `orphanedcount` — no query param.
**Rationale**: User decision. Simpler API contract; no conditional logic needed in frontend.
**Alternative**: `?includeCounts=true` query param — rejected by user.

### Decision 2: Generic editable default reasons in confirmation dialogs

**Chosen**: Forward drags pre-fill a generic editable default (e.g. "Moving scope to Phase 2 — Implementation"). Backward drags pre-fill a generic editable default (required, cannot submit empty).
**Rationale**: User decision. Reduces friction for common transitions while still capturing intent.
**Alternative**: Scope-specific messages — rejected by user (generic defaults preferred).

### Decision 3: `@dnd-kit/core` for drag-and-drop

**Chosen**: `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities`.
**Rationale**: Spec decision C1. Accessible (keyboard + screen reader), touch-compatible, actively maintained, no peer dependency conflicts with React 18 + Vite.
**Alternative**: `react-beautiful-dnd` — deprecated; `react-dnd` — heavier, less accessible.

### Decision 4: Phases 1–3 mandatory, 4–5 optional

**Chosen**: Cannot skip Phase 2 from Phase 1, or Phase 3 from Phase 2. Can skip Phase 4 and/or Phase 5.
**Rationale**: Spec decision C2. Design and Implementation and QA are always required; Human Testing and Beta are optional.

### Decision 5: TEAM_MANAGER allowed all status transitions

**Chosen**: Update `PATCH /api/projects/:id/scopes/:scopeid/status` to allow TEAM_MANAGER (not just ADMIN) for all status values.
**Rationale**: Spec decision C3. PM needs full drag access on the Kanban board.
**Current state**: Route only allows ADMIN for non-workflow statuses — must be updated.

### Decision 6: Reason field made optional in backend

**Chosen**: `reason` field in `overrideStatusSchema` changed from `z.string().min(1)` to `z.string().optional()`. Backend uses `reason ?? 'Kanban board transition'` as fallback.
**Rationale**: Forward drags don't require a reason from the user; the frontend sends the editable default text.

### Decision 7: Status badge colors reuse SpecList.tsx pattern

**Chosen**: Import and reuse `STATUS_BADGE` + `STATUS_LABEL` constants from `SpecList.tsx` (or duplicate the pattern).
**Rationale**: Consistency with existing UI. Single source of truth for status colors.

---

## Phase Mapping

| Phase Column | Scope Status Values |
|-------------|---------------------|
| Phase 1 — Design | `draft`, `in_review`, `pending_clarification`, `clarified` |
| Phase 2 — Implementation | `planned`, `tasks_generated`, `implementing` |
| Phase 3 — QA Testing | `implemented`, `qa_passed` |
| Phase 4 — Human Testing | `human_tested` |
| Phase 5 — Beta | `beta_cleared` |
| Phase 6 — Release | `released` |
| Deferred | `deferred` |

## Drag → Status Mapping

| From | To | Status Set |
|------|----|-----------|
| Phase 1 | Phase 2 | `planned` |
| Phase 2 | Phase 3 | `implemented` |
| Phase 3 | Phase 4 | `qa_passed` |
| Phase 3 | Phase 5 | `qa_passed` |
| Phase 3 | Phase 6 | `qa_passed` |
| Phase 4 | Phase 5 | `human_tested` |
| Phase 4 | Phase 6 | `human_tested` |
| Phase 5 | Phase 6 | `beta_cleared` |
| Any | Deferred | `deferred` |
| Deferred | Phase 1 | `draft` |
| Backward | Earlier phase | Reverted status |

---

## Progress Tracking

- [x] Phase 0: Scope document reviewed
- [x] Phase 1: Design complete (spec.md, plan.md)
- [ ] Phase 2: Tasks generated (tasks.md)
- [ ] Phase 3: Implementation complete
- [ ] Phase 4: Validation passed

**Gate Status**:
- [x] Initial Constitution Check: PASS
- [x] All NEEDS CLARIFICATION resolved
- [x] Complexity deviations documented (none required)
