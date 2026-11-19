# SCOPE-108: Theme Header & Footer Designer

**Scope Number**: SCOPE-108
**Status**: `draft`
**Created**: 2026-07-21
**Last Reviewed**: 2026-07-21 (retargeted via interactive buildscope — section-by-section, approved through all sections; supersedes the canvas-improvement premise)
**Depends On**: SCOPE-107 and the editor mechanics built under the prior SCOPE-108 draft (the Block-Node model, Node-Type Registry, theme-styled `BlockRenderer`, the pure `moveNodeTo`/`clampDim`/resize/reorder ops, the structured dropdown, and the `renderBlockCode` emitter — all reused and repointed); SCOPE-106 (`BusinessChrome` — the header/footer home this extends, and its flow through Theme Studio → preview → templates); SCOPE-062 (project-theme tokens + the Execute/download codegen); the marketing-assets S3 presign infrastructure (SCOPE-045 era, reused for header logo/image uploads).
**Related Scopes**: Retargets SCOPE-108 itself. Extends SCOPE-107 by reusing its editor mechanics on a new surface. SCOPE-106 owns `BusinessChrome`, which this scope grows from three flat fields into two Block-Node trees.
**Source**: `specs/Project-Scope/108-block-composer-full-editor.md`

---

## Overview

SCOPE-107/108 built a Block Composer whose editing happened on a flat, chrome-covered canvas — a palette beside a wireframe, with hover toolbars, resize grips, and dashed drop zones drawn over the content. That surface never looked or felt like the real page, so it read as a mock-up, not a builder.

SCOPE-108 is retargeted: **remove the flat canvas and make the live themed preview the one editing surface**, driven by a structural **tree**. Its first — and, this pass, only — job is to let a user **design a theme's header and footer** by dragging elements into them and laying them out, seeing the real themed result immediately.

The header and footer are not preview decoration. They become **first-class, persisted parts of the theme**: each is a Block-Node tree stored on the theme's business chrome, and when the theme is **executed/downloaded** the emitter produces real `Header.tsx` and `Footer.tsx` alongside it — making them **referenceable downstream**, so a later app build can "use the header and footer from this theme."

The editor mechanics already built — the Block-Node model, the theme-styled renderer, drag-to-reorder, drag-resize, the structured dropdown, the emitter — are **retained and repointed** at the header/footer regions; only the standalone flat-canvas shell and the Theme Studio "Header & Footer" *form* tab are removed. **Body-content building is parked**; the preview's middle keeps its canned sample.

It stays additive and **zero-migration**: `BusinessChrome` gains two optional Block-Node arrays, and existing `logoRef`/`appName`/`footerLine` seed a default header/footer tree on load, so nothing shipping today breaks.

## Business Problem

Two problems, one root. First, the composer's editing surface is a flat, chrome-draped canvas that never resembles the real page — so it reads as a wireframe and doesn't earn the author's trust; it "doesn't look or feel right to anyone." Second, and more costly: the header and footer — the two regions every application shares — can only be set through a thin form (logo URL, app name, a single footer line). They can't actually be *designed*: no nav, no CTA button, no logo-plus-links layout, no multi-element footer. And because they live only as preview chrome, they're **not exportable and not referenceable** — when the author later builds a real application from the theme, there's no "header and footer" artifact to pull in.

The result is that a theme carries a look but not its two most reused, most brand-defining components. Authors either rebuild a header and footer by hand in every app, or settle for the one-line placeholder. The theme underdelivers on the one thing that should travel with it everywhere.

## Actors

- **Primary:** Theme author — a Company member designing a theme's header and footer in the Theme Studio's tree + live-preview surface. Any member may design and save them onto a theme.
- **Secondary:** ADMIN — governs saved themes/company templates that carry these header/footer designs. The downstream **app-build consumer** — the person (or Claude, during a build) who later executes/downloads the theme and references its emitted `Header.tsx` / `Footer.tsx`. The **code emitter / Execute path** — extended to produce those two components. The AI Provider is **not** an actor this pass (no URL-rebuild in scope here).

## Scope Boundary

IN: Remove the flat Block Composer canvas shell (the palette-beside-a-wireframe surface and its hover-toolbar/drop-zone chrome as the editing surface) and the Theme Studio "Header & Footer" **form** tab (FR-001). Extend `BusinessChrome` so header and footer are each a Block-Node tree, snapped one-each (header pinned top, footer pinned bottom) (FR-002). A **tree + live-preview** editing surface where the author designs header and footer by dragging elements in, selecting, editing properties, reordering, and resizing — reusing the existing node model, theme-styled renderer, and `moveNodeTo`/`clampDim`/resize ops (FR-003). The **live preview becomes the editing surface**: header region on top, canned sample body in the middle (untouched), footer region on the bottom — all in-theme, header/footer as drop targets (FR-004). Persist the two trees on the theme (FR-005). On **Execute/download**, emit real `Header.tsx` + `Footer.tsx` from those trees so they're referenceable downstream (FR-006). Zero-migration seeding of a default header/footer from existing `logoRef`/`appName`/`footerLine` (FR-007). This surface lives in the Theme Studio **Layout tab**, full-width.

OUT: Body-content building (parked for a later pass — the preview's middle stays a canned sample). Free placement or multiple headers/footers (snap: exactly one each). Interactive nav behavior beyond a static, linked layout (no routing/menu state assembly). Live data binding. The shadcn `Select` component variant (native `<select>` stays). Pixel-faithful cloning. Schema/DDL migrations. Reworking theme-token derivation or the SCOPE-106 look sources. Undo/redo. Reworking the saved Block Library (it keeps working; not touched this pass).

---

## User Scenarios

### US1 — Design a header and footer (happy path)

A theme author opens Theme Studio → Layout. Instead of a flat canvas they see the **live themed preview** with a **tree** beside it showing two branches: **Header** and **Footer**. They drag a logo image and a heading into the Header branch, add a row of nav links and a CTA button, and drag to reorder them — the header updates live, in the real theme, at the top of the preview. They fill the Footer branch with a columns layout, some links, and a copyright line. They select any element to edit its properties and resize it. They save the theme.

**Expected:** header and footer are built by direct manipulation on a surface that looks like the real page; the tree and preview stay in sync; exactly one header (top) and one footer (bottom); everything is theme-styled, not wireframe chrome.

### US2 — Reference the header/footer downstream (the payoff)

Later the author builds an actual application and wants their branding. They execute/download the theme; the package now includes `Header.tsx` and `Footer.tsx` generated from the trees they designed. They tell Claude "use the header and footer from this theme," and those components drop into the new app — real React+Tailwind+shadcn, on-brand, no hand-rebuild.

**Expected:** Execute emits two labelled, self-contained components matching what the author designed in the preview; they're importable/referenceable in a downstream build with zero rework.

### US3 — An existing theme, untouched (zero-migration back-compat)

An author opens a theme created before this change — it only ever had a logo, an app name, and a footer line. The Layout surface opens with a **default header** (logo + name) and **default footer** (the footer line) already seeded into the trees, editable from the first click.

**Expected:** no migration, no breakage; the old flat chrome fields are represented as a starting header/footer tree the author can immediately extend; a theme that had nothing shows empty, droppable header/footer regions.

---

## Functional Requirements

### FR-001 — Remove the flat canvas and the Header & Footer form tab

The standalone Block Composer canvas shell and the Theme Studio "Header & Footer" *form* tab MUST be removed as editing surfaces.

**Acceptance Criteria**:

- [ ] The palette-beside-a-wireframe canvas and its hover-toolbar/dashed-drop-zone chrome are no longer the editing surface; the Layout tab renders the tree + live-preview surface instead
- [ ] The "Header & Footer" menu tab (logo/name/footer-line form) is gone; no dead route/state left behind
- [ ] Removal is clean — no orphaned imports, no console errors, existing saved themes still load

### FR-002 — Header and footer as Block-Node trees on the theme (snap, one each)

`BusinessChrome` MUST carry a header Block-Node tree and a footer Block-Node tree; each is a single pinned region.

**Acceptance Criteria**:

- [ ] `BusinessChrome` gains `headerNodes: BlockNode[]` and `footerNodes: BlockNode[]` (optional), typed and shared client/server
- [ ] Exactly one header (pinned top) and one footer (pinned bottom); the model can't produce a second of either or a free-floating one
- [ ] Header and footer are container regions that accept the existing node types as children

### FR-003 — Design header/footer in the tree + preview (reuse existing ops)

The author MUST be able to add, nest, reorder, select, edit, and resize elements inside the header and footer using the existing editor mechanics.

**Acceptance Criteria**:

- [ ] Dragging an element into a header/footer region (on the preview) inserts it; the tree reflects it; select-in-tree highlights-in-preview and vice versa
- [ ] Reorder (`moveNodeTo`), resize (`clampDim`/grips), property editing, and the structured dropdown all work inside header/footer — no new tree-op code, the pure ops are reused
- [ ] An element can't be dropped outside a valid region; no droppable-outside-provider regression (the dnd-kit rule from 107 holds)

### FR-004 — The live preview is the editing surface

The themed live preview MUST be the surface the author manipulates — header top, footer bottom, canned body between.

**Acceptance Criteria**:

- [ ] The preview renders header region + canned sample body (untouched) + footer region, all in the active theme (light/dark toggle still works)
- [ ] Header and footer regions are drop targets and show selection state; the canned body is inert (not editable, not a drop target)
- [ ] The surface reads as the real page — no wireframe chrome drawn over content in the normal (unselected) state

### FR-005 — Persist header/footer on the theme

The designed header and footer MUST persist as part of the theme (save/load round-trip).

**Acceptance Criteria**:

- [ ] Saving the theme stores `headerNodes`/`footerNodes`; reloading restores them exactly
- [ ] They travel with company-template save/apply (the chrome already flows through `TemplateGallery`)
- [ ] Persistence is JSONB-shape-only — no DDL

### FR-006 — Emit Header.tsx and Footer.tsx on Execute/download

Executing/downloading the theme MUST produce real `Header.tsx` and `Footer.tsx` from the two trees, referenceable downstream.

**Acceptance Criteria**:

- [ ] The emitter produces two self-contained components from `headerNodes`/`footerNodes` via the existing `emitNode`, styled with theme semantic classes
- [ ] Emitted output is labelled/keyboard-operable where it carries controls; canvas↔code parity (what's previewed matches what's emitted)
- [ ] An empty header or footer emits nothing (or a documented no-op stub), not broken code

### FR-007 — Zero-migration seeding from existing chrome fields

Existing themes MUST open with a header/footer tree seeded from their current flat chrome fields, with no migration.

**Acceptance Criteria**:

- [ ] A theme with `logoRef`/`appName` seeds a default header tree (logo + name); `footerLine` seeds a default footer tree
- [ ] Seeding is derived on load when `headerNodes`/`footerNodes` are absent — no DDL, no data backfill
- [ ] A theme with none of those fields opens with empty, droppable header/footer regions

---

## Technical Sections

### Shared model

- **`src/shared/theme-template.ts` (extend):** `BusinessChrome` gains optional `headerNodes: BlockNode[]` and `footerNodes: BlockNode[]`. Add a pure, unit-tested `seedChromeTrees(chrome)` that derives a default header (logo + app name) and footer (footer line) from the legacy flat fields when the node arrays are absent (FR-007) — the single source for back-compat seeding on both client and server.
- **`src/shared/block-model.ts` (reuse, minimal add):** header/footer are ordinary `BlockNode[]`; no new node *types* required. The emitter reuses `renderBlockCode` with component names `Header`/`Footer` to produce the two files (FR-006). If a distinct region wrapper is wanted (e.g. `<header>`/`<footer>` landmarks), add a thin emit wrapper rather than new node types. Snap/one-each is enforced at the region container level, not in the tree ops.

### Data / Schema

- **No migration.** `BusinessChrome` persists inside the existing theme/template JSONB wherever it lives today — the shape only grows two arrays. Seeding is derived on load, not backfilled. No DDL. *(exact persistence column confirmed at spec time against `projectTheme.ts` / theme storage.)*

### Server (`src/server`)

- Theme save/load (`routes/projectTheme.ts`, `routes/themeBlocks.ts`) — carry `headerNodes`/`footerNodes` through the same path `BusinessChrome` already flows (FR-005). No new route.
- Execute/download — the path that currently emits Composer block code grows two outputs, `Header.tsx` + `Footer.tsx`, from the trees (FR-006). *(exact emit site — `marketing-assets-s3.ts` vs the theme execute route — confirmed at spec time.)*

### Client (`src/client/components/Projects/`)

- **`ThemeStudio.tsx`** — drop the `"chrome"` (Header & Footer form) tab from the `SourceTab` union and the menu; the **Layout tab** hosts the new designer full-width. Remove the form block (lines ~304–341) and its `updateChrome`-via-form usage (WYSIWYG editing moves into the preview).
- **New: a Header/Footer Designer** — a two-pane surface: a **structural tree** (outline: Header branch, Footer branch, select/reorder/delete) beside the **live preview**. Reuses `BlockRenderer` in `editable` mode pointed at `headerNodes` / `footerNodes`, inside a `DndContext`. The tree is the one genuinely new component.
- **`ThemePreview.tsx`** — becomes (or is wrapped to become) the editing surface: header region = editable `BlockRenderer(headerNodes)`, canned sample body (inert, unchanged), footer region = editable `BlockRenderer(footerNodes)`; light/dark toggle retained.
- **`BlockComposer.tsx`** — the reusable bits (palette, property panel, dnd wiring) are lifted into the designer **first**, then the standalone flat-canvas component is **deleted outright** — no transition flag, no dead-code path left behind (FR-001).

### Reuse map

- The entire SCOPE-107/108 editor mechanics: `BlockNode` model + `NODE_REGISTRY`, `BlockRenderer` (editable render, resize grips, drag handle), `moveNodeTo` / `clampDim` / structured-dropdown ops, `renderBlockCode` emitter, and the `DndContext`/`pointerWithin` setup. `BusinessChrome` + its flow through `ThemeStudio` → `ThemePreview` → `TemplateGallery`. Theme tokens + semantic classes (SCOPE-062). Only new work: the **tree/outline** component, the **region snap wrapper**, the **seed helper**, and the **two-file emit**.

---

## Success Criteria

1. **One editing surface, no wireframe.** The Layout tab renders the tree + live-preview designer; the flat Block Composer canvas and the "Header & Footer" form tab are gone (0 references to the removed surfaces in the built bundle). Build a header and footer using only the new surface with 0 console errors. *(FR-001/004)*
2. **Header/footer designed by direct manipulation.** An author composes a header (logo + nav links + CTA) and a footer (columns + links + copyright), reordering and resizing by drag; the tree and preview stay in sync on 100% of selections/edits, snapped to exactly one header (top) and one footer (bottom). *(FR-002/003)*
3. **Export parity + referenceable.** Execute emits `Header.tsx` and `Footer.tsx` whose rendered output matches the live preview with 0 drift; both files import into a fresh React component and render with 0 errors. *(FR-006)*
4. **Zero-migration back-compat.** 100% of existing themes open with a header/footer seeded from their legacy `logoRef`/`appName`/`footerLine`, no breakage and 0 DDL applied. *(FR-007)*
5. **Persistence round-trip.** Saving a theme then reloading restores `headerNodes`/`footerNodes` identically (node trees byte-equal), including through company-template save/apply. *(FR-005)*

---

## Clarifications

- **Retargeting:** SCOPE-108 rewritten from "Block Composer — Full Editor" (a canvas-improvement scope) to **"Theme Header & Footer Designer."** It supersedes the canvas premise; the editor *mechanics* built under 107/108 (node model, renderer, reorder/resize/dropdown ops, emitter) are **retained and repointed**, not discarded. (Andy, 2026-07-21.)
- **Approach A chosen** over alternatives: header/footer as Block-Node trees on `BusinessChrome`, emitted as `Header.tsx`/`Footer.tsx` on Execute. Rejected B (new `header`/`footer` node types in one page tree — premature, entangles the parked body work) and C (header/footer as saved library blocks referenced by id — indirection + shared-ownership surprises). Rationale: A reuses the most machinery and keeps the theme the single owner. (Andy, 2026-07-21.)
- **Snap, not free placement:** exactly one header (pinned top) and one footer (pinned bottom).
- **Old canvas is deleted outright** — not kept behind a transition flag. Reusable pieces are lifted into the designer first, then the flat-canvas component is removed. (Andy, 2026-07-21.)
- **The live preview is the single editing surface.** The flat canvas and the "Header & Footer" *form* tab are both removed; WYSIWYG chrome editing moves into the preview.
- **Body content is parked** for a later pass; the preview's middle stays a canned, inert sample.
- **Placement:** the designer lives in the Theme Studio **Layout tab**, full-width (tree + preview).
- **The payoff is downstream reference:** the emitted components let a later app build "use the header and footer from this theme."
- **Zero-migration:** header/footer trees are seeded on load from the legacy flat fields; the JSONB shape only grows.
- **Emit:** reuse `renderBlockCode` with `Header`/`Footer` component names; native controls (the shadcn `Select` variant stays deferred).
- **Deferred to spec/plan time:** exact persistence column for the chrome trees; exact Execute emit site (`marketing-assets-s3.ts` vs the theme execute route); whether `ThemePreview` is extended in place or wrapped by the designer; and whether emitted regions get `<header>`/`<footer>` landmark wrappers.

---

## Out of Scope

- Body-content building (parked, later pass — the preview's middle stays a canned sample).
- Free placement or multiple headers/footers (snap: exactly one each).
- URL/page structural rebuild as a header/footer source (the prior 108 draft's feature-5).
- Live data binding; interactive nav/menu/routing state.
- The shadcn `Select` component variant (native `<select>` stays).
- Pixel-faithful cloning; schema/DDL migrations; undo/redo; reworking the saved Block Library or theme-token derivation; choosing the styling framework.

## Open Questions

- Which theme/template column persists `BusinessChrome` (and therefore `headerNodes`/`footerNodes`)? Confirm against `projectTheme.ts` storage before wiring save/load. *(no DDL either way — JSONB shape only grows.)*
- Which Execute/download site emits the two components — `marketing-assets-s3.ts` or the theme execute route?
- Is `ThemePreview` extended in place, or wrapped by the designer?
- Do emitted regions get semantic `<header>`/`<footer>` landmark wrappers, or plain `<div>`s?

---

## Constraints & Notes

### Constraints

- **Node-Type Registry invariant (hard rule).** Every `emitNode` case has a matching `BlockRenderer` arm; all styling classes are literal strings in lookup maps (Tailwind can't see `text-${x}`). The `Header`/`Footer` emit must render identically to the preview; verify any new classes land in built `dist/client/assets/*.css`.
- **dnd-kit rule from 107 carries forward.** Droppables are child components inside `<DndContext>`; `collisionDetection={pointerWithin}`. The region drop targets must not reintroduce the "droppable outside its own provider" bug.
- **Snap invariant.** Exactly one header (top) and one footer (bottom), enforced at the region-container level — the model cannot yield a second or a free-floating one.
- **Back-compat / zero-migration.** Existing `logoRef`/`appName`/`footerLine` themes seed a default tree and keep working; existing base64 image `src`s still render; JSONB shape only grows. No DDL.
- **Wire the entrance.** The Layout tab must actually surface the designer end-to-end (menu → designer → save → Execute emits the files); confirm against the built bundle, not just source — a surface with no working path in isn't done.
- **Accessibility.** Emitted header/footer controls (links, buttons, any dropdown) are labelled and keyboard-operable; resized elements keep a visible focus affordance; drag keeps a non-drag fallback.
- **Correct plumbing.** Routes via `index.ts → app.ts`; DB via `src/db/client.ts`; 100% TypeScript (no `any`), Pino-only logging. No new runtime deps in the kit.
- **Orchestrator-first.** Implement via `createSpecs` → `implement`; `[SCOPE 108 / T00x]` fences written by the orchestrator only; `auditfences` before any push. No push until the operator says push.

### Dependencies

- SCOPE-107/108 (the editor mechanics this reuses); SCOPE-106 (`BusinessChrome`, the header/footer home); SCOPE-062 (theme tokens); the marketing-assets S3 presign infra (reused for header logo/image uploads). **No new LLM or `cheerio` dependency this pass** — those belonged to the URL-rebuild feature, which is out of this retargeted scope.

### Notes

- **Prior-draft features:** the previously-built dropdown / drag-resize / drag-reorder / S3-image / rename mechanics remain and are **reused** by the designer; only the standalone flat-canvas shell and the H&F form tab are removed. The URL-rebuild / `cheerio` / LLM code, if already present, is left in place but is **not a deliverable of this scope** (and may be revisited when body-building returns).
- **Fan-out decision (Andy, 2026-07-21):** a **single implementation spec, SPEC-108** (kept 1:1 with SCOPE-108, regenerating the stale untracked `specs/108-block-composer-full-editor/`), covering **both** work-streams in one task list — (A) model + designer UI (remove canvas/form tab, tree + live-preview surface, snap, persist, seed) and (B) the two-file emit + downstream reference.
- **Deferred to spec/plan time:** persistence column for the chrome trees; the Execute emit site; extend-vs-wrap `ThemePreview`; `<header>`/`<footer>` landmark wrappers; and the concrete happy-path test themes for the canvas↔code parity check.
- **Process note:** authored in-conversation via interactive buildscope (section-by-section — the standing workaround while the `buildscope` CLI persists nothing); implementation routes through `createSpecs` → `implement`, with fences and `auditfences` before any push.
