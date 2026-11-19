# Spec 122: Spec Status Vocabulary — Scopes Invisible on the Kanban Board

**Spec Number**: 122
**Feature**: Spec Status Vocabulary
**Status**: `draft`
**Phase**: design
**Priority**: high
**Created**: 2026-08-03
**Scope**: `specs/Project-Scope/122-spec-status-vocabulary.md`
**Source**: Customer field report (Linnell Technology, project "Just Invoicing"), 2026-08-03

---

## Overview

The MCP server and the web app hold two different spec-status vocabularies, and neither validates
against the other. `project.update_spec_status` accepts eight values; the Kanban board's
`STATUS_TO_COLUMN` map recognises only four of them. A scope moved to any of the other four is
written successfully, reported successfully, and then renders in no column at all — it disappears
from the board rather than landing in the wrong place.

This spec unifies the two vocabularies, makes an unrecognised status impossible to write, and makes
it structurally impossible for any scope to be silently unrenderable again.

## Business Problem

A customer reported 8 of 9 scopes missing from the Kanban board, every phase column empty except
Phase 1. The data was correct throughout: all 8 scopes held status `beta` with 0 remaining tasks,
confirmed by `project_cockpit_summary`.

The failure is silent by construction. Placement is a bare lookup,
`STATUS_TO_COLUMN[s.status] === columnId`, and an unknown status yields `undefined`, which equals no
column, so the card is filtered out of every column simultaneously. Nothing errors and nothing warns.

The customer could not self-diagnose it. Their theory of an unsynced phase field was wrong —
`specificationphases` is dead code with zero readers and zero writers — and their workaround of
re-asserting `beta` could never have worked, because the write was already succeeding. The MCP source
comment compounds this by describing `SpecStatusSchema` as the vocabulary the app understands, which
is false for four of its eight values. There is also an app-internal instance: `archived` is a legal
member of the app's own `ScopeStatus` union yet absent from `STATUS_TO_COLUMN`.

## Actors

- Primary: Developer using the kit, who advances a scope's status through `project.update_spec_status` from Claude, the Cockpit or the orchestrator, and expects the Kanban board to reflect it.
- Secondary: wxKanban web app renders the board from `spec.status`; the MCP server validates and writes the status; wxperts support fields the resulting "my scopes vanished" reports.

## Success Metrics

1. 8 of 8 statuses accepted by `SpecStatusSchema` map to exactly one board outcome, up from 4 of 8.
2. Zero rows in production hold a status the board cannot account for, verified by a read-only audit
   across all customer projects.
3. Invalid statuses are rejected at write time in 100% of cases, with an error naming the value and
   listing the valid set.
4. The reporting customer's project shows 9 of 9 scopes, with 8 `beta` scopes in Phase 5, and 0
   writes to their data.
5. A guard test fails the build on any divergence between the two vocabularies — 0 tolerated drift.
6. No scope is filtered from every column simultaneously: an unmapped status renders in a visible
   fallback within 1 render.
7. An archived scope is retrievable through the UI in 1 interaction.

## Scope Boundary

The shared status vocabulary between MCP and the web app, its validation at write time, the Kanban
board's column mapping and fallback behaviour, a read-only audit of production rows, and a filter
control to reveal hidden scopes. The canonical vocabulary is the MCP's shorter set — `draft`,
`planned`, `implementing`, `qa`, `human_testing`, `beta`, `released`, `archived` — chosen because
customer data already holds these values, so adopting it requires no production data migration. The
rendering fix ships with the hosted web app, so it reaches every customer on deploy.

## Out of Scope

- Drag-and-drop transition legality and the forward/backward confirmation flow.
- The phase-advance workflow and `PhaseService`.
- Reviving `specificationphases`; it has zero readers and zero writers, and its removal is a separate
  cleanup deliberately excluded to keep this fix small.
- Renaming statuses in the app's `ScopeStatus` union, which would be a breaking data migration and is
  exactly what adopting the shorter set avoids.
- Any write to customer data as part of the fix.

## Open Questions

1. Resolved 2026-08-03 — the MCP's shorter set is canonical, because customer data already contains
   those values and migrating everyone to `beta_cleared` is riskier in practice.
2. Resolved 2026-08-03 — `archived` is hidden rather than shown in Deferred, with FR-008 ensuring it
   stays retrievable.
3. Resolved 2026-08-03 — no backfill of customer data. The Kanban board is the hosted web app, so the
   rendering fix reaches customers on deploy and FR-004 is an audit rather than a migration.
4. Resolved 2026-08-03 (Andy) — **yes, the MCP can defer.** `deferred` is added to
   `SpecStatusSchema` (FR-010). Safe because the board already maps `deferred` to its own column, so
   this widens what can be written to something already renderable — the exact inverse of the defect
   that opened this spec.

## Functional Requirements

**FR-001 — Every writable status maps to a column.** All eight `SpecStatusSchema` values resolve:
`qa` to Phase 3, `human_testing` to Phase 4, `beta` to Phase 5, `archived` to hidden per FR-007. The
existing app-side values keep their current mappings, so both vocabularies render and nothing that
works today breaks.

**FR-002 — Nothing may vanish, ever.** Column assignment stops being a bare lookup. A status with no
explicit mapping renders in a visible fallback (Deferred) rather than being filtered from all columns
at once. This is the structural guarantee: FR-001 alone fixes today's four values and leaves the next
divergence just as silent.

**FR-003 — Invalid statuses are rejected at write time.** `project.update_spec_status` refuses a
value outside the shared vocabulary, with an error naming the value and listing the valid set. This
is hardening against future bad writes; it does not unbreak anyone already affected.

**FR-004 — Read-only audit of production.** Group `status` by project across all customers and
confirm no value falls outside the union of both vocabularies. No writes. Escalate to a correction
only if the audit finds a value in neither vocabulary, and only after review.

**FR-005 — Drift guard.** A test fails the build if the MCP vocabulary and the app's column map
diverge, modelled on the feedback-status vocabulary guard shipped under SCOPE-043 Amendment C.

**FR-006 — Correct the false comment** above `SpecStatusSchema` claiming it is the vocabulary the app
understands. It describes a guarantee the code does not provide.

**FR-007 — `archived` is hidden by intent, not by accident.** It gains an explicit, documented rule
excluding it from the board. This is distinct from FR-002: hidden by intent is deliberate,
discoverable and reversible; vanished by accident is an unrecognised value filtered everywhere with
no rule and no trace, and remains forbidden.

**FR-008 — Hidden must stay retrievable.** The Kanban filter bar gains a control to reveal archived
scopes. Without it a user archives a scope and has no path back to it through the UI, so hidden
quietly becomes lost — reintroducing the failure this spec exists to remove.

**FR-009 (Amendment A) — The stack dimension picker may not be clipped by an ancestor.** The
`DimensionPicker` dropdown panel in `StackEditor.tsx` renders in a portal to `document.body` with
fixed positioning anchored to its trigger, flipping above the trigger when it would otherwise pass
the viewport bottom. Today the panel is absolutely positioned with its containing block inside the
New Project modal body's `max-h-[70vh] overflow-y-auto` box, so it is clipped by that scroller's
padding box — `z-20` does not help, because z-index does not escape overflow clipping. Portalling
makes the panel independent of any ancestor's overflow, so the fix survives future changes to the
modal's height or nesting rather than only unbreaking the row that reported it. See Amendment A
below for why this ships here.

## Data Requirements

`projectspecifications.status` is the single source of truth for board placement. No schema change is
required: no new tables, columns, indexes or migrations. FR-004 adds a read-only audit query grouping
`status` by project. `specificationphases` is left untouched and documented as dead rather than
modified.

## API Routes

No new routes. The MCP tool `project.update_spec_status` gains input validation only; its signature
and response shape are unchanged. The Express routes serving the Kanban board are unchanged, because
the defect is in client-side column resolution rather than in the data the server returns.

## Frontend Components

`ScopeKanbanBoard.tsx` — `STATUS_TO_COLUMN` extended with the MCP vocabulary, and the bare-lookup
filter replaced by a resolver carrying the FR-002 fallback. `ScopeKanbanFilterBar.tsx` — the FR-008
control revealing archived scopes. `ScopeKanbanColumn.tsx` and `ScopeKanbanCard.tsx` are unchanged.
All components remain React + Tailwind + shadcn/ui per `stack.md`, tested with Vitest.

## Integration Context

This must align with the vocabulary-parity work already shipped for feedback statuses under
SCOPE-043 Amendment C (FR-020), which pinned two independently-maintained lists with a build-failing
guard. FR-005 reuses that pattern deliberately rather than inventing a second approach to the same
class of problem. It also aligns with `project.update_spec_status` as delivered by SCOPE-101, whose
input schema is the write-side surface hardened here.

## Amendment A — Stack picker dropdown clipped by its scroll container

**Added**: 2026-08-03
**Source**: Field feedback `826dd172-596e-445e-b3b6-a889796477c1` (bug, severity low, triaged)
**Decision**: Andy, 2026-08-03 — fold into SCOPE-122.
**Requirement**: FR-009. **Task**: T008.

FR-009 is **not** a spec-status defect and shares no code with FR-001–FR-008. It is folded into this
spec as a **delivery vehicle**: a small, self-contained client-side fix that arrived through the same
SCOPE-043 feedback channel and rides the same hosted-web-app deploy, so it reaches every customer on
the same push rather than waiting for a scope of its own. The Scope Boundary above is unchanged; this
amendment is additive and independently revertible.

**Reported symptom.** In the New Project modal, opening the `Choose` dropdown on the Hosting / Deploy
row shows a panel sliced off at the bottom; the reporter could not reach the hosting options.
Hosting / Deploy is the reliable repro because it is the last of the six stack dimensions, so its
trigger sits nearest the container's bottom edge and essentially the whole 240px panel falls outside.
The defect is general rather than specific to that row: the clip height is `70vh`, so shorter
viewports degrade the rows above it too — the "responsive" character of the report. The same
component renders on the project Stack tab, which has no clipping ancestor and is unaffected, which
is why the report names project creation specifically.

**Deliberately excluded.** Adding Radix / shadcn `Popover` or `DropdownMenu`, which would give
portalling and collision-flip for free but requires a new `@radix-ui/*` dependency — there is none in
the project today, as `src/client/components/ui/` is hand-rolled Tailwind, and taking one on for a
low-severity layout defect is a larger change than this warrants. Also excluded: any change to the
stack vocabulary or `stack-defaults.ts`, and the modal's `max-h-[70vh]` scroll behaviour, which is
correct and stays.

**Additional success metrics.** SC-8 — the Hosting / Deploy dropdown is fully visible when opened
from the New Project modal at a viewport height of 768px, with 0 options unreachable. SC-9 — all 6
stack dimensions open an unclipped panel on both surfaces, not just the reported row.

**Additional frontend components.** `StackEditor.tsx` — the `DimensionPicker` panel is portalled and
positioned; the trigger button, option list and multi-select toggle semantics are unchanged.
`CreateProjectModal.tsx` and `StackTabView.tsx` are unchanged, as the fix is contained in the picker.

---

## Amendment B — Vocabulary symmetry and an enforceable gate (2026-08-03)

Two follow-ups recorded during implementation, both ruled by Andy on the same day. Neither is a new
defect; each closes a gap this work exposed.

**FR-010 — The MCP can defer a scope.** `deferred` joins `SpecStatusSchema`. The asymmetry was real:
the app has a Deferred column and `deferred` in its `ScopeStatus` union, but the MCP could not write
it, so neither Claude nor the orchestrator could park a scope — only the web UI could. Adding it is
safe precisely because the board already maps `deferred` to its own column, so this widens what can
be written to something already renderable. That is the inverse of the defect that opened this spec,
and the drift guard (FR-005) confirms it rather than assuming it: the guard passes because the
mapping already exists, and would have failed had it not.

**FR-011 — mcp-server tests actually gate a merge.** A new `mcp-server-tests` job runs typecheck plus
287 tests on every PR and push to main. Until now **no CI job ran any mcp-server test**: the root
`vitest.config.ts` includes only repo-root `tests/`, and the auditfences job referenced mcp-server
solely as a schema path. Every guard in that tree — including SCOPE-043's feedback-status drift guard
and this spec's status-vocabulary guard — ran only when a developer remembered to. SCOPE-043 FR-020
originally claimed its guard "fails the build"; that claim was false when written and was corrected
rather than quietly fixed. This makes it true.

Three suites are excluded **by name, in the workflow**, because they need infrastructure CI does not
have: `integration.test.ts` and `server.test.ts` (a live database) and `project-kit-scope-flow.test.ts`
(on-disk fixtures). They fail locally too and predate the job. Excluding them is what makes the other
287 tests enforceable today instead of leaving the whole tree ungated waiting for a database — and
naming them in the workflow keeps the exclusion visible, because a silently-skipped suite is the same
disease as a status that renders nowhere.

**Additional success metrics.** SC-10 — every status the MCP can write, including `deferred`,
resolves to a board outcome (10 of 10). SC-11 — mcp-server tests run on 100% of pushes to main,
up from 0%, with 287 tests gating and 3 suites excluded by name rather than silently.
