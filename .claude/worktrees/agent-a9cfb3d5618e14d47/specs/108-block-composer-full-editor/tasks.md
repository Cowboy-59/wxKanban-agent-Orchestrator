# Tasks: Theme Header & Footer Designer (Spec 108)

**Spec**: 108 · 12 tasks · all `todo`. Fences: `[SCOPE 108 / T00x]`. DB is the source of truth for status.

> Retargeted 2026-07-21. Supersedes the prior 16-task canvas-improvement list. The old task rows in the DB are superseded by this set; the fence namespace `[SCOPE 108 / T00x]` is reused.

## Phase A — Model + Designer UI (FR-001…005, 007)

- [ ] **T001 — BusinessChrome header/footer trees + seedChromeTrees** (FR-002/007)
  In `src/shared/theme-template.ts` add optional `headerNodes`/`footerNodes: BlockNode[]`; add a pure, unit-tested `seedChromeTrees(chrome)` deriving a default header (logo+appName) and footer (footerLine) from legacy flat fields when the arrays are absent. Shared client/server.
- [ ] **T002 — Region snap wrapper (one header top, one footer bottom)** (FR-002)
  Container semantics enforcing exactly one header pinned top and one footer pinned bottom; model can't yield a second or a free-floating region; regions accept existing node types as children.
- [ ] **T003 — Structural tree/outline component** (FR-003)
  New two-branch outline (Header, Footer): select, reorder, delete; select-in-tree highlights-in-preview and vice versa. The one genuinely new component.
- [ ] **T004 — Live preview as editing surface (ThemePreview regions)** (FR-004)
  `ThemePreview` renders editable `BlockRenderer(headerNodes)` on top, inert canned body, editable `BlockRenderer(footerNodes)` on bottom; regions are drop targets showing selection; light/dark toggle retained; no wireframe chrome in the unselected state.
- [ ] **T005 — Lift palette/property-panel/dnd into the designer** (FR-003)
  Move the reusable palette, property panel, and `DndContext` wiring out of `BlockComposer` into the designer; wire drag-in insertion into regions and tree↔preview selection sync; preserve the dnd-kit droppable-inside-provider rule + `pointerWithin`.
- [ ] **T006 — Remove the Header & Footer form tab; mount designer in Layout** (FR-001)
  Drop the `"chrome"` `SourceTab` from `ThemeStudio.tsx` union + menu; remove the form block and `updateChrome`-via-form usage; the Layout tab hosts the designer full-width.
- [ ] **T007 — Delete the flat-canvas BlockComposer shell** (FR-001)
  After the reusable bits are lifted (T005), delete the flat-canvas component outright — no transition flag, no dead-code path, no orphaned imports/console errors; existing saved themes still load.
- [ ] **T008 — Persist header/footer through save/load + template apply** (FR-005)
  Carry `headerNodes`/`footerNodes` through the existing `BusinessChrome` save/load path (`projectTheme.ts`/`themeBlocks.ts`) and `TemplateGallery` apply; JSONB-shape-only, no DDL; round-trip restores identically.

## Phase B — Emit + downstream reference (FR-006)

- [ ] **T009 — Emit Header.tsx + Footer.tsx on Execute/download** (FR-006)
  Extend the Execute/download codegen to produce two self-contained components from the trees via `renderBlockCode` with `Header`/`Footer` names and theme semantic classes; labelled/keyboard-operable controls; canvas↔code parity.
- [ ] **T010 — Empty-region no-op emit + parity verification** (FR-006)
  An empty header or footer emits nothing or a documented no-op stub, never broken code; verify emitted output matches the live preview with 0 drift.

## Phase C — Verification (cross-cutting)

- [ ] **T011 — Unit tests: seedChromeTrees, snap invariant, emit parity** (FR-002/006/007)
  Cover back-compat seeding, the one-each snap invariant, and `Header`/`Footer` emit against fixtures; zero-migration back-compat for legacy themes.
- [ ] **T012 — Wire-the-entrance + auditfences verification** (Constraints)
  Confirm the Layout tab surfaces the designer end-to-end (menu → designer → save → Execute emits files) against the BUILT bundle; new Tailwind classes present in `dist/client/assets/*.css`; `auditfences` clean on all `[SCOPE 108 / T00x]`.
