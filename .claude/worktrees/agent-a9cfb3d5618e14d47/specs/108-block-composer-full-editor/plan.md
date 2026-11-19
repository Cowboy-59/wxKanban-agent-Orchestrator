# Plan: Theme Header & Footer Designer (Spec 108)

**Spec**: 108 · **Status**: planned · **Phase**: design → implementation

## Approach

Retarget the shipped 107/108 Block Composer: keep all the editor *mechanics* (Block-Node model, theme-styled `BlockRenderer`, `moveNodeTo`/`clampDim`/resize/reorder, structured dropdown, `renderBlockCode` emitter) and **repoint them at the header/footer regions** on a new surface — a structural tree beside the live themed preview. Remove the standalone flat-canvas shell and the Theme Studio "Header & Footer" form tab. Header and footer become two Block-Node trees on `BusinessChrome`, persisted with the theme and emitted as real `Header.tsx`/`Footer.tsx` on Execute. Body-content building is parked. Additive and zero-migration — `BusinessChrome` grows two optional arrays, seeded on load from the legacy flat fields.

The single hard invariant carries forward: the **Node-Type Registry** stays the source of truth — every `emitNode` case has a matching `BlockRenderer` arm, and every styling class is a **literal string** in a lookup map (Tailwind can't see `text-${x}`). The one new pure helper (`seedChromeTrees`) is unit-tested; the two-file emit reuses `renderBlockCode` so preview and code can't drift.

Sequencing: build the model + region snap + designer surface first (A), lift-then-delete the old canvas, wire persistence, then add the two-file emit (B), then verify (C).

## Phases

### Phase A — Model + Designer UI (FR-001…005, 007)

1. **Model + seed** (T001): `BusinessChrome.headerNodes/footerNodes` + pure `seedChromeTrees` (back-compat seeding).
2. **Region snap** (T002): one header (top) / one footer (bottom) container semantics; can't yield a second or free-floating region.
3. **Tree/outline** (T003): the one new component — Header/Footer branches, select/reorder/delete, two-way selection sync with the preview.
4. **Preview-as-surface** (T004): `ThemePreview` renders editable header/footer regions (`BlockRenderer`) around the inert canned body.
5. **Lift the reusable bits** (T005): move palette, property panel, dnd wiring out of `BlockComposer` into the designer; wire drag-in + selection sync.
6. **Remove the form tab** (T006): drop the `"chrome"` `SourceTab`; mount the designer in the Layout tab.
7. **Delete the canvas** (T007): delete the flat-canvas `BlockComposer` shell outright — no flag, no dead code.
8. **Persist** (T008): carry `headerNodes`/`footerNodes` through save/load + `TemplateGallery` apply; JSONB-only.

### Phase B — Emit + downstream reference (FR-006)

1. **Two-file emit** (T009): `renderBlockCode` → `Header.tsx` + `Footer.tsx` on Execute/download, theme-styled, referenceable.
2. **Empty/parity** (T010): empty region → no-op stub (not broken code); preview↔emit parity.

### Phase C — Verification (cross-cutting)

1. **Unit tests** (T011): `seedChromeTrees`, the snap invariant, emit parity fixtures; zero-migration back-compat.
2. **Entrance + fences** (T012): Layout tab wired end-to-end confirmed in the built bundle; new Tailwind classes in `dist/client/assets/*.css`; `auditfences` clean.

## Key files / seams

- `src/shared/theme-template.ts` — `BusinessChrome` fields + `seedChromeTrees`.
- `src/shared/block-model.ts` — `Header`/`Footer` emit via `renderBlockCode` (+ optional landmark wrapper).
- `src/client/components/Projects/ThemeStudio.tsx` — drop the chrome tab; host the designer in Layout.
- `src/client/components/Projects/ThemePreview.tsx` — editable header/footer regions around the canned body.
- New: a Header/Footer Designer component (tree + preview, inside `DndContext`).
- `src/client/components/Projects/BlockComposer.tsx` — lift reusable bits, then delete the flat-canvas shell.
- `src/server/routes/projectTheme.ts` / `routes/themeBlocks.ts` — carry the two arrays; the Execute emit site.

## Risks & mitigations

- **DB↔disk drift** (the DB already had a stale spec 108) → the DB row is renamed + status-set; disk artifacts regenerated to the new direction.
- **Lift-then-delete breaks the editor** → lift reusable pieces into the designer and verify before deleting the old shell (T005 precedes T007).
- **Tailwind dynamic-class miss** → literal maps + built-CSS verification (T012).
- **dnd-kit droppable-outside-provider** → region drop targets are child components inside `<DndContext>`; `pointerWithin`.
- **Fence corruption / authorship drift** → preserve `[SCOPE 108 / T00x]` fences; `auditfences` before push.

## Constraints

100% TypeScript (no `any`), Pino-only; routes via `index.ts → app.ts`, DB via `src/db/client.ts`; no new runtime deps in the kit; zero DDL. No push until the operator says push.
