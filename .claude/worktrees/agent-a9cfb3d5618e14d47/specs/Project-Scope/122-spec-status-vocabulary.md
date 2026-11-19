# Spec 122: Spec Status Vocabulary — Scopes Invisible on the Kanban Board

**Spec Number**: 122
**Status**: `draft`
**Created**: 2026-08-03
**Source**: Customer field report (Linnell Technology, project "Just Invoicing"), relayed 2026-08-03
**Related**: SCOPE-101 (`update_spec_status` tool), SCOPE-043 (feedback channel that carried the report)

---

## Overview

The MCP server and the web app hold two different spec-status vocabularies, and neither validates
against the other. `project.update_spec_status` accepts eight values; the Kanban board's
`STATUS_TO_COLUMN` map recognises only four of them. A scope moved to any of the other four is
written successfully, reported successfully, and then **renders in no column at all** — it disappears
from the board rather than landing in the wrong place.

This scope unifies the two vocabularies, makes an unrecognised status impossible to write, and — more
importantly — makes it structurally impossible for any scope to be silently unrenderable again.

## Business Problem

A customer reported 8 of 9 scopes missing from the Kanban board: every phase column empty except
Phase 1. The data was correct throughout. All 8 scopes held status `beta` with 0 remaining tasks,
confirmed by `project_cockpit_summary`.

The failure is silent by construction. Placement is a bare lookup —
`STATUS_TO_COLUMN[s.status] === columnId` (`ScopeKanbanBoard.tsx`) — and an unknown status yields
`undefined`, which equals no column, so the card is filtered out of **every** column simultaneously.
Nothing errors, nothing warns, and the row looks healthy in every other surface.

Three things make this worse than a display bug:

- **The customer cannot self-diagnose.** Their reasonable theory — an unsynced phase field — is
  wrong: `specificationphases` is dead code with zero readers and zero writers. Their workaround,
  re-asserting `beta` through the MCP, could never have worked, because the write was already
  succeeding. They were debugging a correct write.
- **The MCP comment asserts the opposite.** `SpecStatusSchema` is documented as *"the vocabulary the
  app's PhaseService and cockpit understand."* That is false for four of its eight values.
- **It is not a one-off.** `qa`, `human_testing`, `beta` and `archived` are all unrenderable, so any
  customer advancing scopes through the MCP hits this at the QA stage and never recovers visibility.

There is also an **app-internal instance of the same bug**: `archived` is a legal member of the app's
own `ScopeStatus` union but is absent from `STATUS_TO_COLUMN`, so the app can make a scope invisible
without the MCP's involvement at all.

This is the third instance in one week of one surface accepting a value another silently fails to
recognise — the others being fence labels that could not match the parser regex, and a schema mirror
missing a column. The pattern, not just the instance, is what FR-002 closes.

## Core Design

| Element | Value |
|---|---|
| **Primary Actor** | Developer using the kit — advances a scope's status via `project.update_spec_status` (from Claude, the Cockpit, or the orchestrator) and expects the Kanban board to reflect it |
| **Secondary Actors** | wxKanban web app (renders the board from `spec.status`); MCP server (validates and writes); wxperts support (fields the "my scopes vanished" report) |
| **Key Value** | A status that can be written is a status that can be seen. Advancing a scope never removes it from the board, and an unrenderable status becomes impossible to create rather than merely unlikely |
| **Canonical vocabulary** | The **MCP's shorter set** — `draft`, `planned`, `implementing`, `qa`, `human_testing`, `beta`, `released`, `archived`. Chosen because customer data already holds these values, so adopting them needs **no production data migration** |
| **Transport** | MCP `project.update_spec_status` writes; the hosted web app reads. Both hit `projectspecifications.status` — there is no intermediate phase table |
| **Source of truth** | `projectspecifications.status`. `specificationphases` is dead code and is explicitly **not** revived here |
| **Scope Boundary** | The shared status vocabulary, its validation at write time, the board's column mapping, a read-only audit of production rows, and a filter to reveal hidden scopes. Excludes drag-and-drop transition rules, the phase-advance workflow, and any rename of the app's `ScopeStatus` union |
| **Failure mode removed** | Silent unrenderability — a legal write the board filters out of every column at once, with no error on either side |
| **Delivery** | The rendering fix ships with the **hosted web app**, so every customer is fixed on deploy with no kit update and no data write. Only FR-003 rides a kit/MCP release |

## Success Metrics

1. **8 of 8** statuses accepted by `SpecStatusSchema` map to exactly one board outcome — up from
   **4 of 8** today.
2. **Zero** rows in production hold a status the board cannot account for, verified by a read-only
   audit query across all customer projects.
3. An invalid status is rejected at write time in **100%** of cases, with an error naming the value
   and listing the valid set — replacing today's silent success.
4. The reporting customer's project shows **9 of 9** scopes, with the 8 `beta` scopes in Phase 5,
   **without any write to their data**.
5. A guard test fails the build if the MCP vocabulary and the app's column map diverge again —
   **0** tolerated drift, matching the feedback-status guard.
6. **No** scope is ever filtered from every column simultaneously: an unmapped status renders in a
   visible fallback within **1** render, rather than disappearing.
7. An archived scope is retrievable through the UI in **1** interaction (a filter toggle), so
   "hidden" never degrades into "lost".

## In Scope

- [ ] **FR-001 — Every writable status maps to a column.** All eight `SpecStatusSchema` values
      resolve: `qa`→Phase 3, `human_testing`→Phase 4, `beta`→Phase 5, `archived`→hidden (FR-007).
      The existing app-side values (`beta_cleared`, `qa_passed`, `human_tested`, `in_review`,
      `tasks_generated`, `implemented`, `clarified`, `pending_clarification`, `deferred`) keep their
      current mappings — both vocabularies render, so nothing already working breaks.
- [ ] **FR-002 — Nothing may vanish, ever.** Column assignment stops being a bare lookup. A status
      with no explicit mapping renders in a visible fallback (Deferred) rather than being filtered
      from all columns at once. This is the structural guarantee; FR-001 alone only fixes today's
      four values and leaves the next divergence just as silent.
- [ ] **FR-003 — Invalid statuses are rejected at write time.** `project.update_spec_status` refuses
      a value outside the shared vocabulary with an error naming the value and listing the valid set.
      Hardening against future bad writes; it does not unbreak anyone already affected.
- [ ] **FR-004 — Read-only audit of production.** Group `status` by project across all customers and
      confirm zero values fall outside the union of both vocabularies. **No writes.** Escalate to a
      correction only if the audit finds a value in neither vocabulary (a typo or legacy artifact),
      and only after review.
- [ ] **FR-005 — Drift guard.** A test fails the build if the MCP vocabulary and the app's column map
      diverge, modelled on the feedback-status vocabulary guard.
- [ ] **FR-006 — Correct the false comment** above `SpecStatusSchema` claiming it is the vocabulary
      the app understands. It describes a guarantee the code does not provide.
- [ ] **FR-007 — `archived` is hidden by intent, not by accident.** It gains an explicit, documented
      rule excluding it from the board. This is distinct from FR-002's prohibition: *hidden by intent*
      is a deliberate, discoverable, reversible rule; *vanished by accident* is an unrecognised value
      filtered everywhere with no rule and no trace. The second remains forbidden.
- [ ] **FR-008 — Hidden must stay retrievable.** The Kanban filter bar gains a way to reveal archived
      scopes. Without it, a user archives a scope and has no path back to it through the UI, and
      "hidden" quietly becomes "lost" — reintroducing the very failure this scope exists to remove.

## Out of Scope

- Drag-and-drop transition legality and the forward/backward confirmation flow.
- The phase-advance workflow and `PhaseService`.
- Reviving `specificationphases`. Zero readers, zero writers; this scope neither uses nor deletes it.
  Its removal is a separate cleanup, deliberately **excluded** here to keep the fix small.
- Renaming statuses in the app's `ScopeStatus` union, which would be a breaking data migration and is
  precisely what adopting the shorter set avoids.
- Any write to customer data as part of the fix.

## Data Requirements

- `projectspecifications.status` — the single source of truth for board placement. **No schema
  change**: no new tables, columns, indexes or migrations.
- A read-only audit query grouping `status` by project, to size and then confirm FR-004.
- `specificationphases` — untouched; documented as dead rather than modified.

## API Routes

- No new routes. `project.update_spec_status` (MCP) gains input validation only; its signature and
  response shape are unchanged.

## Frontend Components

- `ScopeKanbanBoard.tsx` — `STATUS_TO_COLUMN` extended; the bare-lookup filter replaced by a resolver
  carrying the FR-002 fallback.
- `ScopeKanbanFilterBar.tsx` — the FR-008 reveal-archived control.
- `ScopeKanbanColumn.tsx` / `ScopeKanbanCard.tsx` — unchanged.

## Integration Context

This aligns with the vocabulary-parity work already shipped for feedback statuses (SCOPE-043
Amendment C, FR-020), which pinned two independently-maintained lists with a build-failing guard.
FR-005 reuses that pattern deliberately rather than inventing a second approach to the same problem.

## Open Questions

1. **Which vocabulary is canonical?** **Resolved (Andy, 2026-08-03): the MCP's shorter set.** Customer
   data already contains `beta`/`qa`/`human_testing`, so adopting it needs no migration; the
   alternative — migrating everyone to `beta_cleared` — is cleaner in principle and riskier in
   practice.
2. **Should `archived` land in Deferred or be hidden?** **Resolved (Andy, 2026-08-03): hidden**, with
   FR-008 ensuring it stays retrievable.
3. **Does the backfill touch customer data?** **Resolved (Andy, 2026-08-03): no.** The premise was
   mistaken — the Kanban board is the *hosted* web app, so the rendering fix reaches every customer on
   deploy. FR-004 is therefore an audit, not a migration, and the change that fixes customers touches
   none of their data.
4. **Open —** should `deferred` (app-side) be added to the MCP vocabulary so the MCP can defer a
   scope? Out of scope here, but the asymmetry is now visible and worth a decision.

---

## Amendment A — Stack picker dropdown clipped by its scroll container

**Added**: 2026-08-03
**Source**: Field feedback `826dd172-596e-445e-b3b6-a889796477c1` (bug, severity low, triaged)
**Decision**: Andy, 2026-08-03 — fold into SCOPE-122.

### Why this is here

This is **not** a spec-status defect and shares no code with FR-001–FR-008. It is folded into
SCOPE-122 as a **delivery vehicle**: it is a small, self-contained client-side fix arriving through
the same SCOPE-043 feedback channel, and it rides the same hosted-web-app deploy, so it reaches
every customer on the same push rather than waiting for a scope of its own. The scope boundary above
is unchanged; this amendment is additive and independently revertible.

### Problem

In the **New Project** modal, opening the `Choose` dropdown on the **Hosting / Deploy** row shows a
panel sliced off at the bottom. The reporter could not reach the hosting options.

The dropdown panel in `StackEditor.tsx` is absolutely positioned, and its containing block sits
inside the modal body's `max-h-[70vh] overflow-y-auto` box in `CreateProjectModal.tsx`. An
absolutely-positioned box whose containing block is inside a scroller is clipped by that scroller's
padding box — `z-20` does not help, because z-index does not escape overflow clipping.

Hosting / Deploy is the reliable repro because it is the **last** of the six stack dimensions, so its
button sits nearest the container's bottom edge and essentially the whole 240px panel falls outside.
The defect is general, not specific to that row: the clip height is `70vh`, so on shorter viewports
the rows above it degrade too. That is the "responsive" character of the report.

The same component renders on the project **Stack** tab, which has no clipping ancestor and is
therefore unaffected — which is why the report names project creation specifically.

### Amendment A — In Scope

- [ ] **FR-009 — The dimension picker may not be clipped by an ancestor.** The dropdown panel renders
      in a portal to `document.body` with fixed positioning anchored to its trigger, and flips above
      the trigger when it would otherwise pass the viewport bottom. This makes the panel independent
      of any ancestor's overflow, so it survives future changes to the modal's height or nesting —
      rather than only unbreaking the one row that reported it.

### Amendment A — Out of Scope

- Adding Radix / shadcn `Popover` or `DropdownMenu`. There is no `@radix-ui/*` dependency in the
  project today — `src/client/components/ui/` is hand-rolled Tailwind — and introducing one for a
  low-severity layout defect is a larger change than this warrants. Revisit if a second surface needs
  collision-aware positioning.
- Any change to the stack vocabulary, the six dimensions, or `stack-defaults.ts`.
- The modal's own `max-h-[70vh]` scroll behaviour, which is correct and stays.

### Amendment A — Success Metrics

- **SC-8** — The Hosting / Deploy dropdown is **fully visible** when opened from the New Project
  modal at a viewport height of **768px**, with **0** options unreachable.
- **SC-9** — **All 6** stack dimensions open an unclipped panel on both surfaces — project creation
  and the Stack tab — not just the reported row.

### Amendment A — Frontend Components

- `StackEditor.tsx` — `DimensionPicker` panel portalled and positioned; the trigger button, the
  option list and the multi-select toggle semantics are unchanged.
- `CreateProjectModal.tsx` / `StackTabView.tsx` — unchanged; the fix is contained in the picker.
