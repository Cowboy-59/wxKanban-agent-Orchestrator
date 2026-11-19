# Spec 108: Theme Header & Footer Designer

**Spec Number**: 108
**Status**: planned
**Phase**: design → implementation
**Priority**: high
**Source Scope**: `specs/Project-Scope/108-block-composer-full-editor.md`
**Depends On**: SCOPE-107 and the editor mechanics built under the prior SCOPE-108 draft (Block-Node model, Node-Type Registry, theme-styled `BlockRenderer`, the pure `moveNodeTo`/`clampDim`/resize/reorder ops, the structured dropdown, and the `renderBlockCode` emitter — all reused and repointed); SCOPE-106 (`BusinessChrome`); SCOPE-062 (theme tokens + Execute/download codegen); the marketing-assets S3 presign infrastructure.

> **Retargeted 2026-07-21.** This spec supersedes the prior "Block Composer — Full Editor" (canvas-improvement) direction. The editor *mechanics* built under 107/108 are retained and repointed at the header/footer regions; the standalone flat-canvas shell and the Theme Studio "Header & Footer" form tab are removed.

## Overview

SCOPE-107/108 built a Block Composer whose editing happened on a flat, chrome-covered canvas — a palette beside a wireframe, with hover toolbars, resize grips, and dashed drop zones over the content. That surface never looked or felt like the real page, so it read as a mock-up, not a builder.

This spec retargets 108: remove the flat canvas and make the live themed preview the one editing surface, driven by a structural tree. Its first and only job this pass is to let a user **design a theme's header and footer** by dragging elements into them and laying them out, seeing the real themed result immediately. The header and footer become first-class, persisted parts of the theme — each a Block-Node tree on the theme's business chrome — and when the theme is executed/downloaded the emitter produces real `Header.tsx` and `Footer.tsx`, so a later app build can "use the header and footer from this theme." Body-content building is parked. Additive and zero-migration: `BusinessChrome` grows two optional Block-Node arrays; existing `logoRef`/`appName`/`footerLine` seed a default header/footer tree on load.

## Business Problem

Two problems, one root. The composer's editing surface is a flat, chrome-draped canvas that never resembles the real page — it reads as a wireframe and doesn't earn the author's trust. And the header and footer, the two regions every application shares, can only be set through a thin form (logo URL, app name, one footer line) — they can't be *designed* (no nav, no CTA, no multi-element layout) and, living only as preview chrome, they're not exportable or referenceable. A theme carries a look but not its two most reused, most brand-defining components.

## Actors

- Primary: Theme author — a Company member designing a theme's header and footer in the Theme Studio's tree + live-preview surface.
- Secondary: ADMIN — governs saved themes/company templates. The downstream app-build consumer — later executes/downloads the theme and references its emitted `Header.tsx`/`Footer.tsx`. The code emitter / Execute path — extended to produce those two components. The AI Provider is not an actor this pass.

## Success Metrics

1. One editing surface, no wireframe: the Layout tab renders the tree + live-preview designer; the flat canvas and form tab are gone (0 references in the built bundle). Build a header and footer using only the new surface with 0 console errors. (FR-001/004)
2. Direct-manipulation design: an author composes a header (logo + nav links + CTA) and a footer (columns + links + copyright), reordering/resizing by drag; tree and preview stay in sync on 100% of edits, snapped to exactly one header (top) and one footer (bottom). (FR-002/003)
3. Export parity + referenceable: Execute emits `Header.tsx` and `Footer.tsx` whose rendered output matches the live preview with 0 drift; both import into a fresh React component and render with 0 errors. (FR-006)
4. Zero-migration back-compat: 100% of existing themes open with a header/footer seeded from their legacy fields, no breakage and 0 DDL applied. (FR-007)
5. Persistence round-trip: saving a theme then reloading restores `headerNodes`/`footerNodes` identically, including through company-template save/apply. (FR-005)

## Scope Boundary

IN: Remove the flat canvas shell and the "Header & Footer" form tab (FR-001). Extend `BusinessChrome` with a header and a footer Block-Node tree, snapped one-each (FR-002). A tree + live-preview editing surface reusing the existing node model, renderer, and `moveNodeTo`/`clampDim`/resize ops (FR-003). The live preview becomes the editing surface — header top, canned body middle (untouched), footer bottom — header/footer as drop targets (FR-004). Persist the two trees on the theme (FR-005). On Execute/download emit real `Header.tsx`/`Footer.tsx` (FR-006). Zero-migration seeding from existing flat chrome fields (FR-007). The designer lives in the Theme Studio Layout tab, full-width.

## Out of Scope

- Body-content building (parked, later pass — the preview's middle stays a canned sample).
- Free placement or multiple headers/footers (snap: exactly one each).
- URL/page structural rebuild as a header/footer source (the prior 108 draft's feature-5).
- Live data binding; interactive nav/menu/routing state.
- The shadcn `Select` component variant (native `<select>` stays).
- Pixel-faithful cloning; schema/DDL migrations; undo/redo; reworking the saved Block Library or theme-token derivation; choosing the styling framework.

## Open Questions

- Which theme/template column persists `BusinessChrome` (and therefore `headerNodes`/`footerNodes`)? Confirm against `projectTheme.ts` storage before wiring save/load — no DDL either way.
- Which Execute/download site emits the two components — `marketing-assets-s3.ts` or the theme execute route?
- Is `ThemePreview` extended in place, or wrapped by the designer?
- Do emitted regions get semantic `<header>`/`<footer>` landmark wrappers, or plain `<div>`s?

## Functional Requirements

### FR-001 — Remove the flat canvas and the Header & Footer form tab

The standalone Block Composer canvas shell and the Theme Studio "Header & Footer" form tab MUST be removed as editing surfaces.

- The wireframe canvas + hover-toolbar/drop-zone chrome are no longer the editing surface; the Layout tab renders the tree + live-preview surface.
- The "Header & Footer" menu tab (logo/name/footer-line form) is gone; no dead route/state left behind.
- Removal is clean — no orphaned imports, no console errors, existing saved themes still load.

### FR-002 — Header and footer as Block-Node trees on the theme (snap, one each)

`BusinessChrome` MUST carry a header Block-Node tree and a footer Block-Node tree; each a single pinned region.

- `BusinessChrome` gains `headerNodes: BlockNode[]` and `footerNodes: BlockNode[]` (optional), typed and shared client/server.
- Exactly one header (pinned top) and one footer (pinned bottom); the model can't produce a second or a free-floating one.
- Header and footer are container regions that accept the existing node types as children.

### FR-003 — Design header/footer in the tree + preview (reuse existing ops)

The author MUST be able to add, nest, reorder, select, edit, and resize elements inside header/footer using the existing editor mechanics.

- Dragging an element into a header/footer region (on the preview) inserts it; the tree reflects it; select-in-tree highlights-in-preview and vice versa.
- Reorder (`moveNodeTo`), resize (`clampDim`/grips), property editing, and the structured dropdown all work inside header/footer — no new tree-op code.
- An element can't be dropped outside a valid region; no droppable-outside-provider regression.

### FR-004 — The live preview is the editing surface

The themed live preview MUST be the surface the author manipulates — header top, footer bottom, canned body between.

- The preview renders header region + canned sample body (untouched) + footer region, all in the active theme (light/dark toggle still works).
- Header and footer regions are drop targets and show selection state; the canned body is inert.
- The surface reads as the real page — no wireframe chrome drawn over content in the normal (unselected) state.

### FR-005 — Persist header/footer on the theme

The designed header and footer MUST persist as part of the theme (save/load round-trip).

- Saving stores `headerNodes`/`footerNodes`; reloading restores them exactly.
- They travel with company-template save/apply (chrome already flows through `TemplateGallery`).
- JSONB-shape-only — no DDL.

### FR-006 — Emit Header.tsx and Footer.tsx on Execute/download

Executing/downloading the theme MUST produce real `Header.tsx` and `Footer.tsx` from the two trees, referenceable downstream.

- The emitter produces two self-contained components from `headerNodes`/`footerNodes` via the existing `emitNode`, theme-styled.
- Emitted output is labelled/keyboard-operable where it carries controls; canvas↔code parity.
- An empty header or footer emits nothing (or a documented no-op stub), not broken code.

### FR-007 — Zero-migration seeding from existing chrome fields

Existing themes MUST open with a header/footer tree seeded from their current flat chrome fields, with no migration.

- A theme with `logoRef`/`appName` seeds a default header tree; `footerLine` seeds a default footer tree.
- Seeding derived on load when `headerNodes`/`footerNodes` absent — no DDL, no backfill.
- A theme with none of those fields opens with empty, droppable header/footer regions.

## Technical Notes

- **Shared model** — `src/shared/theme-template.ts`: `BusinessChrome` gains `headerNodes`/`footerNodes`; add a pure, unit-tested `seedChromeTrees(chrome)`. `src/shared/block-model.ts`: header/footer are ordinary `BlockNode[]`; the emitter reuses `renderBlockCode` with `Header`/`Footer` names. Snap enforced at the region-container level.
- **Server** — theme save/load (`routes/projectTheme.ts`, `routes/themeBlocks.ts`) carries the two arrays through the existing `BusinessChrome` path; the Execute/download codegen grows two outputs.
- **Client** — `ThemeStudio.tsx` drops the "chrome" tab and hosts the designer in the Layout tab; a new tree/outline component beside the live preview; `ThemePreview.tsx` becomes (or is wrapped to become) the editing surface with editable `BlockRenderer` header/footer regions; `BlockComposer.tsx`'s reusable bits are lifted into the designer, then the flat-canvas component is deleted outright.
- **Reuse** — the whole 107/108 editor mechanics; `BusinessChrome` flow through Studio → Preview → TemplateGallery; theme tokens. New work only: the tree/outline component, the region snap wrapper, the seed helper, the two-file emit.

## Constraints

- Node-Type Registry invariant: every `emitNode` case has a matching `BlockRenderer` arm; styling classes are literal strings in lookup maps; new classes verified in built `dist/client/assets/*.css`.
- dnd-kit rule from 107: droppables are child components inside `<DndContext>`; `collisionDetection={pointerWithin}`.
- Back-compat / zero-migration: legacy flat-field themes and base64 images keep working; JSONB shape only grows; no DDL.
- Wire the entrance: Layout tab surfaces the designer end-to-end (menu → designer → save → Execute emits the files), confirmed against the built bundle.
- Accessibility: emitted controls labelled/keyboard-operable; drag keeps a non-drag fallback.
- Correct plumbing: routes via `index.ts → app.ts`; DB via `src/db/client.ts`; 100% TypeScript (no `any`), Pino-only. No new runtime deps in the kit.
- Orchestrator-first: `[SCOPE 108 / T00x]` fences written by the orchestrator only; `auditfences` before any push. No push until the operator says push.
