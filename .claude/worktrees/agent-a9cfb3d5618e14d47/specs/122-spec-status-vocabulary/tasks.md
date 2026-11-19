# Tasks: Spec Status Vocabulary (Spec 122)

Ordered so the customer-visible fix lands first and independently, then hardening.

| Task | Title | FR | Priority | Status |
|---|---|---|---|---|
| T001 | Extend `STATUS_TO_COLUMN` with the MCP vocabulary | FR-001 | critical | done |
| T002 | Replace the bare lookup with a fallback resolver | FR-002 | critical | done |
| T003 | Hide `archived` by an explicit documented rule | FR-007 | high | done |
| T004 | Filter-bar control to reveal archived scopes | FR-008 | high | done |
| T005 | Reject invalid statuses at write time; fix the false comment | FR-003, FR-006 | high | done |
| T006 | Drift guard pinning both vocabularies | FR-005 | high | done |
| T007 | Read-only production audit of `status` values | FR-004 | medium | done — 1 finding |
| T008 | Portal the stack dimension picker out of its clipper (Amendment A) | FR-009 | low | built — awaiting UI check |
| T009 | Add `deferred` to the MCP vocabulary (Amendment B) | FR-010 | medium | done |
| T010 | Wire mcp-server tests into CI (Amendment B) | FR-011 | high | done |

---

## T001 — Extend `STATUS_TO_COLUMN` with the MCP vocabulary

- [ ] Add `qa` → `phase3`, `human_testing` → `phase4`, `beta` → `phase5` in
      `src/client/components/Projects/ScopeKanbanBoard.tsx`.
- [ ] Leave every existing app-side mapping untouched — this is purely additive, so both
      vocabularies render and nothing working today breaks.
- [ ] Unit test: a scope with status `beta` appears in Phase 5.

**Done when** the four previously-unrenderable MCP values resolve to a column.

## T002 — Replace the bare lookup with a fallback resolver

- [ ] Replace `STATUS_TO_COLUMN[s.status] === columnId` with a resolver, e.g.
      `resolveColumn(status)` returning the mapped column or the Deferred fallback.
- [ ] Any status not explicitly mapped renders in Deferred rather than being filtered from every
      column at once.
- [ ] Unit test: an invented status (`'not_a_real_status'`) renders in exactly one column, and the
      count of columns containing it is exactly 1 — never 0.

**Done when** no input to the board can produce a card that appears nowhere. This is the requirement
that removes the failure mode; T001 alone only fixes today's four values.

## T003 — Hide `archived` by an explicit documented rule

- [ ] `archived` is excluded from the board by a named rule, not by falling through the resolver.
- [ ] Comment states why it is hidden and points at T004 for retrieval.
- [ ] Unit test: `archived` appears in 0 columns while an unknown status still appears in 1 — proving
      hidden-by-intent and vanished-by-accident are distinct code paths.

## T004 — Filter-bar control to reveal archived scopes

- [ ] Add a toggle to `ScopeKanbanFilterBar.tsx` that includes archived scopes on the board.
- [ ] Default off; when on, archived scopes appear in the Deferred column, visually marked.
- [ ] Unit test: with the toggle on, an archived scope is rendered and reachable.

**Done when** an archived scope is retrievable through the UI in one interaction.

## T005 — Reject invalid statuses at write time; fix the false comment

- [ ] `project.update_spec_status` rejects any value outside the shared vocabulary with an error
      naming the offending value and listing the valid set.
- [ ] Correct the comment above `SpecStatusSchema` in `mcp-server/src/utils/schemas.ts` — it
      currently claims to be the vocabulary the app understands, which was false for half its values.
- [ ] Unit test: a bogus status is rejected and the error text contains the valid list.

## T006 — Drift guard pinning both vocabularies

- [ ] Test asserting every `SpecStatusSchema` value resolves to a board outcome, failing the build on
      divergence.
- [ ] Model on the SCOPE-043 Amendment C feedback-status guard; reuse the pattern rather than
      inventing a second one.
- [ ] Prove the guard bites: add a value to one side, observe failure, revert.

## T007 — Read-only production audit of `status` values

- [x] Query grouping `projectspecifications.status` by project across all customers.
- [x] Confirm zero values fall outside the union of both vocabularies. **Not zero — one.**

**Result, run live 2026-08-05.** 1,697 specs across all customers, 16 distinct statuses. Fifteen are
recognised by one vocabulary or the other. One is not:

| status | rows | projects |
|---|---|---|
| `release` | 1 | 1 |

Singular `release`, almost certainly a typo for `released`. It is **0.06%** of production, and it is
the only value outside the union — so the vocabularies as shipped cover 1,696 of 1,697 specs.

**This is the fallback design working, with a live instance to prove it.** Under the bare lookup this
scope rendered in no column and was invisible. Under `resolveColumnId` it lands in `deferred` —
visible, in the wrong place, obviously wrong, reportable. That is precisely the behaviour FR-002 was
written to produce, and it took a production audit to find a real one.

T005 rejects invalid statuses at write time, so this row predates that gate and cannot recur through
the tool. **Open**: whether to correct the row to `released` (it is one UPDATE, on one customer's
scope) or leave it as a standing witness that the fallback works. Correcting it is not required for
this scope to close.
- [ ] **No writes.** If a value in neither vocabulary is found, report it for review rather than
      correcting it.

## T008 — Portal the stack dimension picker out of its clipper (Amendment A)

Independent of T001–T007: different surface, no shared code. Riding this spec as a delivery vehicle
only — see Amendment A in `spec.md`. Safe to land or revert on its own.

- [x] In `src/client/components/Projects/StackEditor.tsx`, render the `DimensionPicker` panel through
      `createPortal` to `document.body` with `position: fixed`, anchored to the trigger's
      `getBoundingClientRect()`.
- [x] Flip the panel above the trigger when its height would pass the viewport bottom.
- [x] Keep the existing outside-click close behaviour working across the portal boundary — the
      current `ref.current.contains(e.target)` check no longer sees the panel once it is portalled,
      so the handler must test the trigger **and** the panel.
- [x] Reposition on ancestor scroll and viewport resize — `scroll` is registered in the **capture**
      phase, because a scroll event on the modal body does not bubble to `window`.
- [x] Preserve the `[SCOPE 055 / T008]` fence and add a `MODIFIED-BY` line; do not renumber or
      rewrite the existing fence. Verified: `auditfences` reports 0 findings for `StackEditor.tsx`.
- [x] Trigger button, option list and multi-select toggle semantics unchanged.
- [x] Unit test — **amended from the original plan.** The intended assertion (panel is not a
      descendant of the `overflow-y-auto` ancestor) needs a DOM runner, and this repo has none:
      `vitest.config.ts` sets `environment: "node"`, with no jsdom and no
      `@testing-library/react`. Same constraint recorded in `scope098-delete-scope-i18n.test.ts`.
      Adding a DOM runner was judged out of proportion for a low-severity fix. Instead the
      flip/clamp geometry was extracted into a pure exported `computePanelPosition()` and guarded
      in `tests/unit/scope122-stack-picker-position.test.ts` (8 tests, green), including a sweep
      asserting the panel stays on-screen for every trigger position across six viewport heights.
      **The containment change itself — the part that actually removes the clip — is therefore
      covered only by the manual check below.**
- [ ] **Open — UI check:** open the New Project modal at 768px viewport height and confirm the
      Hosting / Deploy dropdown is fully visible and every option is clickable. Also confirm on the
      project Stack tab (no clipping ancestor there — it should be unchanged).

**Done when** all 6 dimensions open an unclipped panel on both project creation and the Stack tab.
