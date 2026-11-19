# Quickstart: Scope Kanban Board — Integration Test Scenarios

**Feature**: Spec 012 — Scope Kanban Board
**Date**: 2026-02-22
**Prerequisites**: Project with at least 3 scopes in different statuses; dev server running (`npm run dev`); logged in as ADMIN

---

## Scenario 1: Kanban Tab Appears and Board Loads

**Goal**: Verify the Kanban tab is present and the board renders correctly.

```
# Step 1: Navigate to any project workspace
/projects/:id

# Step 2: Verify tab bar contains "Kanban" tab
# Expected: Tab bar shows: Overview | Design | Implementation | QA | Human Testing | Beta | Release | Matrix | Kanban

# Step 3: Click the Kanban tab
# Expected: URL changes to /projects/:id/phase/kanban

# Step 4: Verify board renders
# Expected:
# - 6 phase columns visible (Phase 1 through Phase 6)
# - Deferred column visible (visually separated)
# - Each column has a header with phase name, subtitle, scope count
# - Scope cards appear in the correct column based on their status
# - Filter bar visible above the board
```

**Pass criteria**: Board loads without errors. All scopes appear in correct columns.

---

## Scenario 2: Scope Card Content

**Goal**: Verify each card displays the correct information.

```
# Step 1: Find a scope card on the board

# Step 2: Verify card content:
# Expected:
# - Spec number (e.g. "001") in bold mono font
# - Title (truncated to 1 line)
# - Content preview (first ~60 chars, muted text)
# - Status badge (color-coded pill matching SpecList.tsx colors)
# - Task progress bar (fills proportionally: completed/total)
# - Open task count (orange)
# - Completed task count (green)
# - "Optional" badge if scope is optional

# Step 3: Verify progress bar colors:
# - 0 tasks: gray bar, "No tasks" label
# - 1-49% complete: indigo bar
# - 50-99% complete: indigo-to-green gradient
# - 100% complete: solid green + checkmark
```

**Pass criteria**: All card fields display correctly. Progress bar color matches completion %.

---

## Scenario 3: Forward Drag — Phase 1 to Phase 2

**Goal**: Verify dragging a scope card forward advances its status.

```
# Precondition: Scope with status 'draft' or 'in_review' (in Phase 1 column)

# Step 1: Drag the scope card from Phase 1 column to Phase 2 column
# Expected: Confirmation dialog appears

# Step 2: Verify dialog content:
# Expected:
# - Dialog title: "Move Scope to Phase 2 — Implementation"
# - Reason field pre-filled with generic editable default
#   e.g. "Moving scope to Phase 2 — Implementation"
# - Confirm and Cancel buttons

# Step 3: Edit the reason text (optional)
# Step 4: Click Confirm

# Expected:
# - Card moves to Phase 2 column immediately (optimistic UI)
# - Status badge updates to "Planned"
# - API call: PATCH /api/projects/:id/scopes/:scopeid/status
#   body: { status: "planned", reason: "<edited reason>" }

# Step 5: Refresh the page
# Expected: Scope still appears in Phase 2 column (persisted)
```

**Pass criteria**: Scope status updated to `planned`. Card in Phase 2 column after refresh.

---

## Scenario 4: Backward Drag — Requires Reason

**Goal**: Verify backward drag requires a non-empty reason.

```
# Precondition: Scope with status 'implemented' (in Phase 3 column)

# Step 1: Drag the scope card from Phase 3 back to Phase 2
# Expected: Confirmation dialog appears

# Step 2: Verify dialog:
# Expected:
# - Dialog indicates backward transition
# - Reason field pre-filled with generic editable default
# - Reason field is required (cannot submit empty)

# Step 3: Clear the reason field and try to confirm
# Expected: Submit button disabled or validation error shown

# Step 4: Type a reason and confirm
# Expected: Card moves to Phase 2, status reverted

# Step 5: Verify audit log (ADMIN only)
# Expected: Entry in companyauditlogs for the backward transition
```

**Pass criteria**: Cannot submit backward drag without reason. Status reverted after confirmation.

---

## Scenario 5: TEAM_MEMBER Read-Only Board

**Goal**: Verify TEAM_MEMBER cannot drag cards.

```
# Step 1: Log in as TEAM_MEMBER
# Step 2: Navigate to Kanban tab

# Expected:
# - Board loads and all cards are visible
# - Drag handles are NOT visible on cards
# - Cards cannot be dragged (no drag interaction)
# - Cards can still be clicked to open Scope Chat

# Step 3: Click a card
# Expected: Scope Chat view opens
```

**Pass criteria**: No drag handles visible. Cards are clickable but not draggable.

---

## Scenario 6: Filter Bar — Search

**Goal**: Verify search filter narrows visible cards.

```
# Step 1: Type "auth" in the search box
# Expected:
# - Only cards with "auth" in spec number or title remain visible
# - Column scope counts update to reflect filtered count
# - Non-matching cards are hidden (not removed from DOM)

# Step 2: Clear the search box
# Expected: All cards reappear

# Step 3: Type a string that matches no scopes
# Expected: All columns show 0 cards (or empty state message)
```

**Pass criteria**: Search filters cards in real-time. Column counts update correctly.

---

## Scenario 7: Filter Bar — Toggles

**Goal**: Verify Show Optional, Show Deferred, Hide Empty Columns toggles work.

```
# Step 1: Toggle "Show Optional" OFF
# Expected: Optional scopes (isoptional=true) hidden from all columns

# Step 2: Toggle "Show Deferred" OFF
# Expected: Deferred column hidden entirely

# Step 3: Toggle "Hide Empty Columns" ON
# Expected: Phase columns with 0 cards collapse/hide

# Step 4: Toggle all back to defaults
# Expected: Board returns to full view
```

**Pass criteria**: Each toggle correctly shows/hides the appropriate cards/columns.

---

## Scenario 8: Defer a Scope

**Goal**: Verify dragging to Deferred column sets status to `deferred`.

```
# Precondition: Scope in any active phase column

# Step 1: Drag scope card to the Deferred column
# Expected: Confirmation dialog with generic editable default:
#   "Deferring scope from active pipeline"

# Step 2: Confirm
# Expected:
# - Card moves to Deferred column (muted gray styling)
# - Status badge shows "Deferred"

# Step 3: Drag scope back from Deferred to Phase 1
# Expected: Confirmation dialog; status set to 'draft'
```

**Pass criteria**: Scope deferred and un-deferred correctly.

---

## Scenario 9: Invalid Phase Skip Blocked

**Goal**: Verify Phase 1 → Phase 3 drag is blocked.

```
# Precondition: Scope in Phase 1 column

# Step 1: Attempt to drag scope card from Phase 1 to Phase 3
# Expected:
# - Phase 3 column dims (invalid drop target)
# - Cursor shows not-allowed
# - Drop is rejected (card snaps back to Phase 1)
# - No confirmation dialog appears
# - No API call made
```

**Pass criteria**: Invalid phase skip is blocked. Card returns to original column.

---

## Scenario 10: API Error — Card Snaps Back

**Goal**: Verify optimistic UI reverts on API failure.

```
# Step 1: Simulate API failure (e.g. disconnect network or use browser devtools to block the PATCH request)

# Step 2: Drag a card forward and confirm

# Expected:
# - Card moves immediately (optimistic)
# - API call fails
# - Card snaps back to original column
# - Error message shown (inline or toast)
```

**Pass criteria**: Card reverts to original position on API error.
