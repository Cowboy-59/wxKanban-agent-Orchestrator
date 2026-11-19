# Spec 012: Scope Kanban Board

**Branch**: `012-kanban-view`
**Type**: frontend feature / backend extension
**Status**: clarified
**Created**: 2026-02-22
**Depends On**: Spec 007 (Project Layout), Spec 009 (Task & Lifecycle)
**Source**: `specs/Project-Scope/012-scope-KanbanView.md`

---

## Overview

The Kanban View is a **cross-phase scope tracker** for a project. It gives PMs and ADMINs a single-screen view of every scope in the project, organized by which lifecycle phase it is currently in, with the scope's precise status and task progress visible on each card.

The board renders 6 phase columns (Phase 1–6) plus a Deferred side column. Each card represents one `specifications` record. Dragging a card between columns advances or reverts the scope's lifecycle status, with a confirmation dialog (generic editable default for forward drags, custom required reason for backward drags).

---

## User Scenarios & Testing

### US1 — PM Views All Scopes Across Phases

**Actor**: TEAM_MANAGER (PM) on a project with 12 scopes spread across phases.

**Scenario**:
1. PM navigates to `/projects/:id/phase/kanban`
2. Board loads with 6 phase columns + Deferred column
3. Each scope card shows: spec number, title, status badge, task progress bar, open/completed counts
4. PM can see at a glance which scopes are in Design, Implementation, QA, etc.

**Expected outcome**: All 12 scopes appear in the correct phase column based on their current status. Phase column headers show scope counts.

---

### US2 — ADMIN Advances Scope via Drag

**Actor**: ADMIN dragging scope "001 — Authentication" from Phase 1 to Phase 2.

**Scenario**:
1. ADMIN drags card from Phase 1 (Design) column to Phase 2 (Implementation) column
2. Confirmation dialog appears with generic editable default: "Moving scope to Phase 2 — Implementation"
3. ADMIN confirms (or edits the reason)
4. Card moves to Phase 2 column, status badge updates to `planned`
5. API call fires: `PATCH /api/projects/:id/scopes/:scopeid/status`

**Expected outcome**: Scope status updated to `planned`. Card appears in Phase 2 column.

---

### US3 — PM Reverts Scope (Backward Drag)

**Actor**: TEAM_MANAGER dragging scope from Phase 3 back to Phase 2.

**Scenario**:
1. PM drags card from Phase 3 (QA) back to Phase 2 (Implementation)
2. Confirmation dialog appears with generic editable default reason (required, cannot be empty)
3. PM edits reason: "QA found critical bugs — returning to implementation"
4. PM confirms
5. Card moves back to Phase 2, status reverted, action logged to `companyauditlogs`

**Expected outcome**: Scope status reverted. Audit log entry created.

---

### US4 — TEAM_MEMBER Sees Read-Only Board

**Actor**: TEAM_MEMBER viewing the Kanban board.

**Scenario**:
1. TEAM_MEMBER navigates to Kanban tab
2. Board loads with all scope cards visible
3. Drag handles are hidden — cards are not draggable
4. TEAM_MEMBER can still click cards to open Scope Chat

**Expected outcome**: Board is fully visible but read-only. No drag handles shown.

---

### US5 — Filter by Search

**Actor**: PM searching for a specific scope on a large project.

**Scenario**:
1. PM types "auth" in the search box
2. Board filters to show only scopes matching "auth" in spec number or title
3. Non-matching cards are hidden; column counts update
4. PM clears search — all cards reappear

**Expected outcome**: Search filters cards in real-time (debounced 200ms).

---

### US6 — Defer a Scope

**Actor**: ADMIN deferring a scope that won't be in the current release.

**Scenario**:
1. ADMIN drags scope card to the Deferred column
2. Confirmation dialog appears with generic editable default: "Deferring scope from active pipeline"
3. ADMIN confirms
4. Card moves to Deferred column (visually separated, muted gray)

**Expected outcome**: Scope status set to `deferred`. Card appears in Deferred column.

---

## Functional Requirements

### FR-001 — Phase Column Mapping
The board MUST display 7 columns: Phase 1 (Design), Phase 2 (Implementation), Phase 3 (QA Testing), Phase 4 (Human Testing), Phase 5 (Beta), Phase 6 (Release), and Deferred. Each scope's `specifications.status` determines its column per the mapping table in the scope spec.

### FR-002 — Scope Card Content
Each card MUST display: spec number, title (truncated 1 line), content preview (60 chars), status badge (color-coded), task progress bar, open count (orange), completed count (green), optional badge if `isoptional=true`.

### FR-003 — Full Task Count API
`GET /api/projects/:id/scopes` MUST always return full task breakdown: `total`, `open`, `in_progress`, `completed`, `orphaned` counts per scope. No query param required — always included.

### FR-004 — Drag and Drop
Drag-and-drop MUST use `@dnd-kit/core` + `@dnd-kit/sortable`. Phase skip rules: Phases 1–3 mandatory (no skipping), Phases 4–5 optional (may be skipped). Invalid drops dim the target column and show `cursor: not-allowed`.

### FR-005 — Confirmation Dialogs
All drag transitions MUST show a confirmation dialog. Forward drags: generic editable default reason. Backward drags: generic editable default reason (required, cannot be empty). Deferred: generic editable default.

### FR-006 — Permission Guard
ADMIN and TEAM_MANAGER: full drag access (forward + backward). TEAM_MEMBER: read-only board, drag handles hidden.

### FR-007 — Optimistic UI
On drop confirmation, card moves immediately (optimistic). API call fires. On error: card snaps back, error toast shown.

### FR-008 — Filter Bar
Filter bar MUST include: search text input (debounced 200ms), Show Optional toggle (default ON), Show Deferred toggle (default ON), Hide Empty Columns toggle (default OFF). Active filters shown as dismissible chips with "Clear all".

### FR-009 — Keyboard Accessibility
Drag-and-drop MUST have keyboard equivalents: Tab to focus card → Space to pick up → Arrow Left/Right to move → Space/Enter to drop → Escape to cancel. Drop events announced via `aria-live="polite"`.

### FR-010 — Horizontal Scroll
All 6 phase columns + Deferred render in a single horizontally scrollable row. Each column has minimum width 260px. Board uses `overflow-x: auto`.

---

## Success Criteria

1. Kanban tab appears in project workspace tab bar and navigates to `/projects/:id/phase/kanban`
2. All scopes appear in the correct phase column based on their current status
3. Dragging a card forward shows confirmation dialog with editable default reason and updates scope status
4. Dragging a card backward shows confirmation dialog with editable default reason (required) and logs to audit
5. TEAM_MEMBER sees read-only board with no drag handles
6. Search filter narrows visible cards in real-time
7. Task progress bar reflects correct completion percentage
8. Clicking a card opens Scope Chat view
9. Clicking task count area opens OpenTasksPopup
10. TypeScript compiles cleanly with no errors

---

## Key Entities

| Entity | Description |
|--------|-------------|
| `specifications` | Scope cards — status, title, specnumber, content, isoptional |
| `tasks` | Task counts aggregated per scope (total, open, in_progress, completed, orphaned) |
| `projectphases` | Column headers — phase name, assignee, status |
| `companyauditlogs` | Backward drag audit trail |

---

## Constraints

- No new database tables or columns required
- `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities` must be installed
- Existing `ScopeChatView`, `OpenTasksPopup`, `TaskDrawer` reused unchanged
- Existing `PATCH /api/projects/:id/scopes/:scopeid/status` route reused (reason made optional)
- Status badge colors reuse `STATUS_BADGE` pattern from `SpecList.tsx`
