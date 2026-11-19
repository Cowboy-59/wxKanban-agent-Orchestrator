# Project Kanban View — Spec 012 #

**Spec Number**: 012  
**Status**: `draft`  
**Created**: 2026-02-22  
**Depends On**: Spec 007 (Project Layout), Spec 009 (Task & Lifecycle)  
**Source**: `specs/Project-Scope/012-scope-KanbanView.md`

---

## Overview ##

The Kanban View is a **cross-phase scope tracker** for a project. It gives PMs and ADMINs a single-screen view of every scope in the project, organized by which lifecycle phase it is currently in, with the scope's precise status and task progress visible on each card.

### Core Design ###

| Element | Value |
|---------|-------|
| **Columns** | The 6 lifecycle phases — Phase 1 through Phase 6 |
| **Cards** | Scopes (`specifications` records) |
| **Card placement** | Determined by the scope's current status → mapped to its active phase |
| **Card content** | Scope number, title, **current status value**, task count breakdown |
| **Interaction** | Drag card to advance scope to next phase (ADMIN / Phase 1 assignee) |

---

## The 6 Lifecycle Phase Columns ##

```
┌──────────────┬──────────────┬──────────────┬──────────────┬──────────────┬──────────────┐
│  Phase 1     │  Phase 2     │  Phase 3     │  Phase 4     │  Phase 5     │  Phase 6     │
│  Design      │  Implement   │  QA Testing  │  Human Test  │  Beta        │  Release     │
│  & Tasks     │              │              │  & Feedback  │  & Feedback  │              │
├──────────────┼──────────────┼──────────────┼──────────────┼──────────────┼──────────────┤
│  [scope]     │  [scope]     │  [scope]     │  [scope]     │  [scope]     │  [scope]     │
│  [scope]     │  [scope]     │              │              │              │              │
│  [scope]     │              │              │              │              │              │
└──────────────┴──────────────┴──────────────┴──────────────┴──────────────┴──────────────┘
                                                                    + [ Deferred ] side column
```

---

## Scope Status → Phase Column Mapping ##

Each scope's `specifications.status` value determines which column its card appears in:

| Phase Column | Phase Label | Scope Status Values in This Column |
|-------------|-------------|-----------------------------------|
| **Phase 1** | Design & Tasks | `draft` · `in_review` · `pending_clarification` · `clarified` |
| **Phase 2** | Implementation | `planned` · `tasks_generated` · `implementing` |
| **Phase 3** | QA Testing | `implemented` · `qa_passed` |
| **Phase 4** | Human Testing | `human_tested` |
| **Phase 5** | Beta Release | `beta_cleared` |
| **Phase 6** | Release | `released` |
| **Deferred** | *(side column)* | `deferred` |

> **Rationale**: A scope enters Phase 3 (QA) when implementation is complete (`implemented`). It enters Phase 4 when QA is passed (`qa_passed`). Each "completion" status signals readiness for the next phase — the card moves forward visually as the scope progresses.

---

## Scope Card Design ##

Each card represents one `specifications` record. The scope's **current status** is the primary badge on the card.

```
┌──────────────────────────────────────┐
│ 001 — Authentication                 │
│ User login, registration, OAuth...   │
├──────────────────────────────────────┤
│ ● in_review                          │
├──────────────────────────────────────┤
│  Tasks                               │
│  ████████░░  8 / 12                  │
│  ● 4 open    ✓ 8 done               │
├──────────────────────────────────────┤
│ 👤 J. Smith   [Optional]             │
└──────────────────────────────────────┘
```

### Card Fields ###

| Field | Source | Notes |
|-------|--------|-------|
| **Spec number** | `specifications.specnumber` | Bold prefix (e.g. `001`) |
| **Title** | `specifications.title` | Truncated at 1 line |
| **Content preview** | `specifications.content` | First 60 chars, muted text |
| **Status badge** | `specifications.status` | Color-coded pill — the scope's precise status within its phase |
| **Task progress bar** | `tasks WHERE specid = spec.id` | Mini bar: completed / total |
| **Open count** | `tasks WHERE specid = spec.id AND status IN ('open','in_progress')` | Orange |
| **Completed count** | `tasks WHERE specid = spec.id AND status = 'completed'` | Green |
| **Total count** | `tasks WHERE specid = spec.id` | Gray |
| **Phase assignee** | `projectphases WHERE phasename = current phase` → assignee | Avatar + name |
| **Optional flag** | `specifications.isoptional = true` | Small "Optional" badge |

### Status Badge Colors ###

The status badge on each card uses the same color system as the existing `SpecList.tsx`:

| Status Value | Badge Color |
|-------------|------------|
| `draft` | Blue |
| `in_review` | Amber |
| `pending_clarification` | Orange |
| `clarified` | Teal |
| `planned` | Cyan |
| `tasks_generated` | Indigo |
| `implementing` | Indigo-dark |
| `implemented` | Purple |
| `qa_passed` | Green-light |
| `human_tested` | Green |
| `beta_cleared` | Emerald |
| `released` | Green-dark |
| `deferred` | Gray/Muted |

### Task Progress Bar ###

The mini progress bar fills proportionally: `completed / total`.

| Completion | Bar Color |
|-----------|----------|
| 0% (no tasks) | Gray — shows "No tasks" label |
| 1–49% | Indigo |
| 50–99% | Indigo-to-green gradient |
| 100% | Solid green + ✓ checkmark |

### Card Interactions ###

| Action | Result |
|--------|--------|
| **Click card** | Opens Scope Chat view for this scope |
| **Click task count area** | Opens `OpenTasksPopup` — lists open tasks for this scope |
| **Drag card** | Moves scope to target phase column (advances/reverts status) |
| **Right-click / long-press** | Context menu: Open Scope Chat · View Tasks · Move to... · Mark Deferred |

---

## Phase Column Headers ##

Each column header shows:

```
┌─────────────────────────────────────┐
│ ▌ Phase 2 — Implementation          │
│   Coding & Functionality            │
│   (5 scopes)                        │
└─────────────────────────────────────┘
```

| Element | Content |
|---------|---------|
| Phase number + name | "Phase 1 — Design & Tasks" |
| Phase subtitle | Short description of the phase |
| Scope count | Count of scope cards in this column |
| Phase assignee | Avatar of the team member assigned to this phase on the project |
| Phase status indicator | `pending` / `in_progress` / `complete` / `reopened` dot |
| Accent color stripe | 4px top border in phase color |

### Phase Colors ###

| Phase | Accent Color |
|-------|-------------|
| Phase 1 — Design | Blue (`border-blue-500`) |
| Phase 2 — Implementation | Indigo (`border-indigo-500`) |
| Phase 3 — QA Testing | Yellow (`border-yellow-500`) |
| Phase 4 — Human Testing | Orange (`border-orange-500`) |
| Phase 5 — Beta | Purple (`border-purple-500`) |
| Phase 6 — Release | Green (`border-green-500`) |
| Deferred | Gray (`border-gray-400`) |

---

## Drag and Drop ##

### Library ###

`@dnd-kit/core` + `@dnd-kit/sortable` — accessible, touch-friendly, no legacy dependencies. *(Decision C1)*

### Phase Skip Rules ###

Phases 1, 2, and 3 are **mandatory** — a scope must pass through each in order. Phases 4 (Human Testing) and 5 (Beta) are **optional** and may be skipped. *(Decision C2)*

| Forward Drag | Allowed? | Rule |
|-------------|---------|------|
| Phase 1 → Phase 2 | ✅ Yes | Sequential — required |
| Phase 2 → Phase 3 | ✅ Yes | Sequential — required |
| Phase 3 → Phase 4 | ✅ Yes | Sequential |
| Phase 3 → Phase 5 | ✅ Yes | Skip Phase 4 (Human Testing optional) |
| Phase 3 → Phase 6 | ✅ Yes | Skip Phases 4 and 5 (both optional) |
| Phase 4 → Phase 5 | ✅ Yes | Sequential |
| Phase 4 → Phase 6 | ✅ Yes | Skip Phase 5 (Beta optional) |
| Phase 5 → Phase 6 | ✅ Yes | Sequential |
| Phase 1 → Phase 3+ | ❌ No | Cannot skip Phase 2 |
| Phase 2 → Phase 4+ | ❌ No | Cannot skip Phase 3 |
| Any → Deferred | ✅ Yes | Always allowed with confirmation |

### What Dragging Does ###

Dragging a scope card from one phase column to another **advances or reverts the scope's lifecycle status** to the appropriate value for the target phase:

| Drag From | Drag To | Status Set To | Notes |
|-----------|---------|--------------|-------|
| Phase 1 | Phase 2 | `planned` | Scope approved and ready for implementation |
| Phase 2 | Phase 3 | `implemented` | Implementation marked complete |
| Phase 3 | Phase 4 | `qa_passed` | QA marked complete |
| Phase 3 | Phase 5 | `qa_passed` | Skip Human Testing — QA passed, going to Beta |
| Phase 3 | Phase 6 | `qa_passed` | Skip Human Testing + Beta — going straight to Release |
| Phase 4 | Phase 5 | `human_tested` | Human testing marked complete |
| Phase 4 | Phase 6 | `human_tested` | Skip Beta — going straight to Release |
| Phase 5 | Phase 6 | `beta_cleared` | Beta marked complete |
| Any | Deferred | `deferred` | Requires confirmation dialog |
| Deferred | Phase 1 | `draft` | Un-defer — returns to draft |
| Backward drag | Earlier phase | Reverted status | PM or ADMIN only; reason required; logged to audit |

### Confirmation Dialogs ###

All forward phase transitions and backward drags require a confirmation dialog:

| Transition | Dialog Message |
|-----------|---------------|
| Phase 1 → Phase 2 | "Mark scope [title] as approved and ready for implementation?" |
| Phase 2 → Phase 3 | "Mark implementation complete for [title]? This will move it to QA." |
| Phase 3 → Phase 4 | "Mark QA passed for [title]? This will move it to Human Testing." |
| Phase 3 → Phase 5 | "Mark QA passed for [title] and skip Human Testing? This will move it to Beta." |
| Phase 3 → Phase 6 | "Mark QA passed for [title] and skip Human Testing + Beta? This will move it to Release." |
| Phase 4 → Phase 5 | "Mark human testing complete for [title]? This will move it to Beta." |
| Phase 4 → Phase 6 | "Mark human testing complete for [title] and skip Beta? This will move it to Release." |
| Phase 5 → Phase 6 | "Mark beta cleared for [title]? This will move it to Release." |
| Any → Deferred | "Defer [title]? It will be excluded from the current release cycle." |
| Backward drag | "Move [title] back to Phase [N]? This will revert its status. Reason (required):" |

### Permission Guard ###

*(Decision C3)*

| Role | Forward Drag | Backward Drag |
|------|-------------|--------------|
| ADMIN | ✅ All transitions | ✅ Allowed — reason required; logged to `companyauditlogs` |
| TEAM_MANAGER (PM) | ✅ All transitions | ✅ Allowed — reason required; logged to `companyauditlogs` |
| TEAM_MEMBER | ❌ Read-only — drag handles hidden | ❌ Not allowed |

### Drag Behavior ###

1. **Drag start**: Card lifts with `shadow-xl` and `scale-105`. Ghost placeholder stays in source column.
2. **Drag over valid column**: Column border highlights with phase accent color.
3. **Drag over invalid column** (skip or no-permission): Column dims, cursor shows `not-allowed`.
4. **Drop**: Optimistic UI — card moves immediately. API call fires: `PATCH /api/projects/:id/scopes/:scopeid/status`.
5. **API error**: Card snaps back. Error toast shown.

---

## Placement in the UI ##

### New Tab: "Kanban" ###

A **"Kanban"** tab is added to the project workspace tab bar:

```
Overview | Design | Implementation | QA | Human Testing | Beta | Release | Kanban | Matrix
```

The Kanban tab renders the `ScopeKanbanBoard` component. The existing Matrix tab remains unchanged.

### Route ###

| Route | Component |
|-------|-----------|
| `/projects/:id/phase/kanban` | `ProjectWorkspacePage` → `ScopeKanbanBoard` |

---

## Filtering and Search ##

A filter bar sits above the board:

| Filter | Type | Options |
|--------|------|---------|
| **Search** | Text input | Matches spec number or title (debounced 200ms) |
| **Assignee** | Multi-select | Phase assignees on this project |
| **Show Optional** | Toggle | Show/hide optional scopes (default: ON) |
| **Show Deferred** | Toggle | Show/hide the Deferred column (default: ON) |
| **Hide empty columns** | Toggle | Collapse phase columns with 0 cards (default: OFF) |

Active filters shown as dismissible chips. "Clear all" resets all filters.

---

## Data Loading ##

### API Calls on Mount ###

```
GET /api/projects/:id/scopes?includeCounts=true
  → All specifications with embedded task counts (see response shape below)

GET /api/projects/:id/phases
  → Phase list with assignees and status (for column headers)
```

### Extended `/scopes` Response (with task counts) ###

Task counts are included directly in the existing `GET /api/projects/:id/scopes` response via an `?includeCounts=true` query parameter. No new endpoint is needed. *(Decision C4)*

**Response shape (extended):**
```json
{
  "specs": [
    {
      "id": "uuid",
      "specnumber": "001",
      "title": "Authentication",
      "content": "User login, registration...",
      "status": "in_review",
      "isoptional": false,
      "taskCounts": {
        "total": 15,
        "open": 3,
        "in_progress": 2,
        "completed": 10,
        "orphaned": 0
      }
    }
  ]
}
```

**Backend implementation** — when `?includeCounts=true` is present, the existing `/scopes` query is extended with a LEFT JOIN aggregation:

```sql
SELECT
  s.*,
  COUNT(t.id)                                          AS task_total,
  COUNT(t.id) FILTER (WHERE t.status = 'open')         AS task_open,
  COUNT(t.id) FILTER (WHERE t.status = 'in_progress')  AS task_in_progress,
  COUNT(t.id) FILTER (WHERE t.status = 'completed')    AS task_completed,
  COUNT(t.id) FILTER (WHERE t.status = 'orphaned')     AS task_orphaned
FROM specifications s
LEFT JOIN tasks t ON t.specid = s.id
WHERE s.projectid = $1
GROUP BY s.id
ORDER BY s.specorder, s.specnumber;
```

---

## Schema Changes ##

**No new tables or columns required.** The Kanban view reads from existing tables:

| Table | Used For |
|-------|---------|
| `specifications` | Scope cards (status, title, specnumber, content, isoptional) |
| `tasks` | Task counts aggregated via JOIN in `/scopes?includeCounts=true` |
| `projectphases` | Column headers (phase name, assignee, status) |

No schema migration needed.

---

## API Routes ##

### Modified ###

| Method | Route | Change |
|--------|-------|--------|
| GET | `/api/projects/:id/scopes?includeCounts=true` | Extended response — adds `taskCounts` object per scope when query param present |

### Existing (reused, unchanged) ###

| Method | Route | Used For |
|--------|-------|---------|
| GET | `/api/projects/:id/phases` | Load phase column headers |
| PATCH | `/api/projects/:id/scopes/:scopeid/status` | Drag-to-update scope status |
| POST | `/api/projects/:id/scopes/:scopeid/submit` | Drag Phase 1 → Phase 2 (submit for review) |
| POST | `/api/projects/:id/scopes/:scopeid/approve` | Drag Phase 1 → Phase 2 (approve) |

---

## Frontend Components ##

### New Components ###

| Component | Path | Description |
|-----------|------|-------------|
| `ScopeKanbanBoard` | `components/Projects/ScopeKanbanBoard.tsx` | Main board — DnD context, 6 phase columns + Deferred, filter bar |
| `ScopeKanbanColumn` | `components/Projects/ScopeKanbanColumn.tsx` | Single phase column — header with phase info, card list, drop zone |
| `ScopeKanbanCard` | `components/Projects/ScopeKanbanCard.tsx` | Single scope card — status badge, task progress bar, drag handle |
| `ScopeKanbanFilterBar` | `components/Projects/ScopeKanbanFilterBar.tsx` | Search + filter chips above the board |

### Modified Components ###

| Component | Change |
|-----------|--------|
| `ProjectWorkspacePage.tsx` | Add `kanban` to `SLUG_TO_PHASE` map; add "Kanban" tab button; render `ScopeKanbanBoard` when `activeTab === 'kanban'` |

### Reused Components (unchanged) ###

| Component | Reused For |
|-----------|-----------|
| `ScopeChatView.tsx` | Opened on card click |
| `OpenTasksPopup` (from `ProjectDetailPanel.tsx`) | Opened on task count click |
| `TaskDrawer.tsx` | Opened from within `OpenTasksPopup` |

---

## Board Layout ##

### Horizontal Scroll ###

All 6 phase columns + Deferred render in a single horizontally scrollable row. Each column has a minimum width of **260px**. The board uses `overflow-x: auto` with sticky column headers.

### Column Structure ###

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ [Filter Bar: Search | Assignee | Show Optional | Show Deferred | Hide Empty]        │
├──────────┬──────────┬──────────┬──────────┬──────────┬──────────╥──────────────────┤
│ Phase 1  │ Phase 2  │ Phase 3  │ Phase 4  │ Phase 5  │ Phase 6  ║ Deferred         │
│ Design   │ Implement│ QA Test  │ Human    │ Beta     │ Release  ║                  │
│ (4)      │ (3)      │ (2)      │ (1)      │ (0)      │ (0)      ║ (1)              │
├──────────┼──────────┼──────────┼──────────┼──────────┼──────────╫──────────────────┤
│ [card]   │ [card]   │ [card]   │ [card]   │          │          ║ [card]           │
│ [card]   │ [card]   │ [card]   │          │          │          ║                  │
│ [card]   │ [card]   │          │          │          │          ║                  │
│ [card]   │          │          │          │          │          ║                  │
└──────────┴──────────┴──────────┴──────────┴──────────┴──────────╨──────────────────┘
```

The Deferred column is visually separated by a double-line divider and uses a muted gray color scheme.

---

## Responsive Behavior ##

| Breakpoint | Behavior |
|------------|---------|
| Desktop (≥1280px) | All 6 columns visible; horizontal scroll for overflow |
| Tablet (768–1279px) | 3 columns visible; horizontal scroll for remaining |
| Mobile (<768px) | Single column view; phase selector dropdown at top; swipe left/right to navigate; drag replaced by "Move to..." tap action |

---

## Accessibility ##

- Drag-and-drop MUST have keyboard equivalents: `Tab` to focus card → `Space` to pick up → `Arrow Left/Right` to move between columns → `Space/Enter` to drop → `Escape` to cancel.
- Column headers: `role="heading" aria-level="3"` with scope count in `aria-label` (e.g. `"Phase 2 Implementation, 3 scopes"`).
- Drop events announced via `aria-live="polite"`: `"Scope 001 Authentication moved to Phase 2 Implementation"`.
- Color is never the sole status indicator — all status badges have text labels.
- Cards have `role="button"` with `aria-label` including spec number, title, and current status.

---

## Clarification Decisions ##

All design questions have been resolved:

| # | Question | Decision |
|---|----------|---------|
| C1 | **DnD library** | **`@dnd-kit/core`** — accessible, touch-friendly, actively maintained |
| C2 | **Phase skip rules** | **Phases 1–3 mandatory (no skipping); Phases 4 and 5 optional (may be skipped)** |
| C3 | **Backward drag** | **PM (TEAM_MANAGER) or ADMIN** may drag backward; reason required; logged to `companyauditlogs` |
| C4 | **Task counts** | **Include in existing `/scopes` response** via `?includeCounts=true` query param — no new endpoint |
| C5 | **Card click** | **Open Scope Chat** (existing `ScopeChatView` behavior) |
| C6 | **`clarified` column** | **Phase 1** — `clarified` stays in the Design column (scope is approved but still in the design phase) |

---

## Scope Boundary ##

**Spec 012 (this document)** covers the **Scope Kanban Board** — scope cards organized by lifecycle phase columns, within the project workspace.

**Out of scope for spec 012:**
- Task-level Kanban (individual tasks as cards) — deferred to a future spec
- Portfolio Kanban (projects as cards, phases as columns) — deferred to spec 013
- WIP limits per column — deferred to settings spec
- Swimlane grouping within columns — post-MVP

---

## Notes ##

- The Scope Kanban Board is the **primary new view** introduced by this spec. It gives a complete cross-phase picture of every scope in the project on one screen.
- The existing `ScopeMatrixView` (Matrix tab) is **not removed** — it remains for users who prefer the grid format.
- The only backend change is extending `GET /api/projects/:id/scopes` to support `?includeCounts=true` — a LEFT JOIN aggregation added to the existing query. No new tables, no new endpoints, no schema migration.
- All status transition logic (approval flows, audit logging) already exists in `DesignPhaseView` and related routes — the Kanban drag reuses these flows without introducing new validation logic.
- `@dnd-kit/core` is the chosen DnD library — actively maintained, fully accessible (keyboard + screen reader), touch-compatible, no peer dependency conflicts with the existing React + Vite stack.
- The Deferred column is always rendered last, visually separated, so deferred scopes are visible but clearly out of the active pipeline.
- Phases 4 (Human Testing) and 5 (Beta) are optional — a scope can be dragged from Phase 3 directly to Phase 6 (Release) if those phases are not needed for a given project.
