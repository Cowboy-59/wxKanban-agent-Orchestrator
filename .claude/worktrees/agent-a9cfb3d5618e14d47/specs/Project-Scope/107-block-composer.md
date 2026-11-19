# SCOPE-107: Block Composer (Drag-Drop Reusable Blocks)

**Scope Number**: SCOPE-107
**Status**: `draft`
**Created**: 2026-07-20
**Last Reviewed**: 2026-07-20 (interactive buildscope — section-by-section, approved through all sections)
**Depends On**: SCOPE-062 (project-theme — theme tokens + execute/materialize); SCOPE-106 (borrow-a-look business template — template model, tenant-isolated gallery + member/admin governance, execute-to-artifacts, the chrome-renderer pattern); the DnD library used by the SCOPE-012 Kanban board (fallback: dnd-kit). No LLM dependency — the composer is deterministic.
**Related Scopes**: SCOPE-106 (chrome) sits directly below this — blocks are the branded *body sections* between the header and footer. SCOPE-062 owns the theme tokens every block inherits.
**Source**: `specs/Project-Scope/107-block-composer.md`

---

## Overview

After SCOPE-106, a customer can borrow a look and brand their header and footer — but everything *between* the header and footer is still hand-coded. There is no way to visually compose the reusable, branded sections a real product needs: a hero band, a CTA, a feature row, a signup form, a card grid. Today those only exist as downloaded code files the customer edits by hand. There is no WYSIWYG composition, and nothing reusable across projects.

SCOPE-107 adds a **drag-drop Block Composer** on top of the shipped theme/template machinery. A user drags elements from a palette (content, form controls, data blocks) onto a canvas where they **stack and grid with auto-reflow** — no pixel positioning; **background panels expand** to fit; everything is styled **live by the active theme's tokens**. A finished **block** is saved to a company-scoped **Block Library**, dropped into Theme Templates, and **executed to real React+Tailwind+shadcn component code** for the generation pipeline — the section-level analog of SCOPE-106's header/footer renderers. It is **additive**: the Block Library is net-new; SCOPE-106 chrome and the SCOPE-062 theme model are untouched.

### Core Design

| Element | Value |
| --- | --- |
| **Primary Actor** | The **project creator** composing reusable branded sections for their product. |
| **Secondary Actors** | The **company admin** (curates the shared Block Library); the **generation pipeline** (consumes executed block code); the **theme system** (blocks inherit the active theme tokens). |
| **Key Value** | Turn "I need a branded hero / CTA / form / card section" into a **visually-composed, reusable, theme-styled block that generates real code** — no hand-editing files, reusable across every project. |
| **Output** | Reusable branded **blocks** (template parts) — not full pages. |
| **Layout** | Structured **stack + grid, auto-reflow**, drag-to-reorder (no pixel positioning); background panels that expand → clean responsive Tailwind. |
| **Palette** | Content (heading, subheading, paragraph, image/logo, button/CTA, columns, spacer) + form controls (input, textarea, select, checkbox, submit) + data blocks (card grid, list/repeater, stat tiles, embed) — all shadcn + theme-token styled. |
| **Data** | Static placeholder content (editable sample data; no live source). |
| **Relationship** | **Additive** — new company Block Library; Theme Templates gain an optional ordered block list; SCOPE-106 chrome unchanged. |
| **Scope Boundary** | **IN**: drag-drop composer (palette + canvas + property panel); structured stack/grid auto-reflow with expandable panels; the bounded node palette; static placeholder content; block model + company Block Library; drop blocks into Theme Templates; execute-to-real-component-code; member-save / admin-curate / tenant-isolated. **OUT**: absolute/pixel positioning; live data binding (static placeholder only); full pages + routing/nav (blocks are sections); reworking SCOPE-106 chrome; choosing the framework. |

### Key Entities

| Entity | Kind | Description |
| --- | --- | --- |
| **Block** | New | A reusable branded section — `{ id, name, root: BlockNode }`, a structured layout tree styled by the active theme. Saved in the company Block Library, dropped into templates, executed to a real component. |
| **Block Node** | New | A single node in a block's tree — `{ id, type, props, children? }`. `type` is one of the bounded palette; `props` hold static content; containers hold `children`. |
| **Block Library** | New | A company-scoped collection (`themeblocks`) of named blocks. Many per company; member-save, admin-curate, tenant-isolated (mirrors the SCOPE-106 template gallery). |
| **Node-Type Registry** | New | The single source of truth mapping each node type to its default props, editable-prop descriptors, React render, and code emit — so canvas, preview, and generated code never drift. |
| **`themeblocks`** | New (table) | Persistence for a Block — `companyid`-scoped jsonb tree, `UNIQUE (companyid, name)`. |
| **`ProjectTheme` / Theme Template** | Reused (062/106) | Blocks inherit theme tokens and drop into a Theme Template's optional ordered `blocks` list. |

---

## User Scenarios

### US1 — Compose a hero block (happy path)

A creator opens the Block Composer, drags a background panel onto the canvas, then drops a heading, a subtext, and a CTA button into it. The elements stack and reflow; the panel expands to fit; everything is styled live by the project's current theme. They name it "Acme Hero" and save it to the Block Library.

**Expected:** dragging elements builds a block that renders live in the active theme; save writes one named company block as a structured tree (not raw markup); the panel auto-expands and the layout reflows without pixel positioning.

### US2 — Reuse a block across projects

On a different project, a teammate opens the Block Library, picks "Acme Hero," and drops it into their Theme Template, then edits the placeholder heading text.

**Expected:** the library lists the company's blocks; dropping one loads its tree into the composer; the block is restyled by the new project's theme tokens; edits don't alter the saved original unless re-saved.

### US3 — Build a form block, then execute

A creator composes a signup block — heading + email input + name input + submit button — inside a panel, and clicks Execute.

**Expected:** the form controls render as real shadcn components in the canvas; Execute emits a valid React+Tailwind+shadcn TSX component (with placeholder submit handler) materialized beside the theme/chrome artifacts; the generated block matches the canvas 1:1.

### US4 — Data block with static content; admin curates

A creator adds a 3-card grid and types each card's title/text, plus a stat-tiles row with hand-entered numbers. Later an admin renames and deletes library blocks; a non-admin can save a block but cannot rename/delete.

**Expected:** data blocks render from the hand-entered static content (no data source); a member can save, only an admin can rename/delete; blocks are visible only within the owning company (tenant-isolated).

---

## Functional Requirements

### FR-001 — Drag-drop composer surface

A Block Composer surface MUST provide an element palette (drag source), a canvas (drop target), and a property panel for the selected element. Elements are added by dragging from the palette to the canvas.

**Acceptance Criteria**:

- [ ] Dragging a palette element onto the canvas inserts that node
- [ ] Selecting a node shows its editable properties in the property panel
- [ ] The canvas renders the working block live in the active theme

### FR-002 — Structured stack/grid layout with expandable panels

Nodes MUST lay out by auto-reflow — vertical stack and row/grid containers — with background panels that expand to fit their contents. No absolute/pixel positioning. Reordering is by drag, not by coordinate.

**Acceptance Criteria**:

- [ ] Dropped nodes stack/grid and the panel grows to contain them
- [ ] Dragging a node to a new position reorders it (no x/y coordinates stored)
- [ ] The generated layout reflows responsively (flex/grid), not absolute

### FR-003 — Bounded node palette (content + forms + data)

The palette MUST offer, all theme-styled: content (heading, subheading, paragraph, image/logo, button/CTA, columns row, spacer), form controls (input, textarea, select, checkbox, submit), and data blocks (card grid, list/repeater, stat tiles, embed).

**Acceptance Criteria**:

- [ ] Each listed node type can be placed and renders as its real shadcn/theme-styled element
- [ ] Form controls render as real shadcn components; data blocks render their layout
- [ ] Every node's colors/radius/typography come from the active theme tokens

### FR-004 — Live theme styling & restyle

A block MUST render in the active theme and restyle automatically when applied under a different theme (no baked-in colors).

**Acceptance Criteria**:

- [ ] Changing the theme updates the block's appearance immediately
- [ ] A block dropped into another project renders in that project's theme
- [ ] No node emits hard-coded colors — only semantic theme classes

### FR-005 — Static placeholder content editing

Every node's content MUST be editable as static placeholder data (text, image URL, per-card title/text, stat numbers/labels, link href) via the property panel or inline. No live data source.

**Acceptance Criteria**:

- [ ] Text/image/CTA nodes have editable content that renders live
- [ ] Card grid / repeater / stat tiles render from hand-entered items (add/remove items)
- [ ] No node binds to an API/DB in v1

### FR-006 — Canvas element operations

The composer MUST support select, delete, duplicate, and reorder of nodes on the canvas.

**Acceptance Criteria**:

- [ ] A selected node can be deleted and duplicated
- [ ] Nodes can be reordered by drag within/between containers
- [ ] Deleting a container removes its children

### FR-007 — Block model + Company Block Library

A block MUST be stored as a structured tree in a company-scoped Block Library (many named blocks per company).

**Acceptance Criteria**:

- [ ] Saving writes one named company block capturing the full node tree
- [ ] The library lists the company's blocks; loading one restores the exact tree
- [ ] Storage is structured JSON (no markup round-trip)

### FR-008 — Library governance & tenant isolation

Any project member MAY save a block; an admin MAY rename and delete; all access is tenant-isolated.

**Acceptance Criteria**:

- [ ] A member can save; only an admin can rename/delete
- [ ] Blocks are visible only within the owning company
- [ ] Duplicate names within a company are rejected

### FR-009 — Drop block into a Theme Template

A Theme Template MUST be able to include an ordered list of blocks; the block restyles to the template's theme. (Additive — SCOPE-106 chrome unchanged.)

**Acceptance Criteria**:

- [ ] A template can hold an ordered set of blocks that reload with it
- [ ] Blocks in a template render in that template's theme + alongside its chrome
- [ ] Existing chrome-only templates are unaffected

### FR-010 — Execute blocks to real component code

Execute MUST emit each block as a real React+Tailwind+shadcn TSX component, materialized beside the theme/chrome artifacts, matching the canvas.

**Acceptance Criteria**:

- [ ] Execute yields a valid TSX component per block (placeholder handlers for forms)
- [ ] Pasted into a shadcn project, the component renders as previewed
- [ ] Artifacts land beside the SCOPE-106 theme/chrome artifacts for the pipeline

---

## Technical Sections

### Shared model (`src/shared/block-model.ts`, new)

- `BlockNode = { id: string; type: BlockNodeType; props: Record<string, unknown>; children?: BlockNode[] }` — a recursive tree. `props` hold static content (text, src, href, items[], columns, etc.). `Block = { id, name, root: BlockNode }`.
- `BlockNodeType` union covering the FR-003 palette (`panel, heading, subheading, paragraph, image, button, columns, spacer, input, textarea, select, checkbox, submit, cardgrid, repeater, stat, embed`).
- A **node-type registry** — per type: default props, editable-prop descriptors, whether it's a container. Drives both the canvas UI and the code emitter (single source of truth, no drift).
- `renderBlockCode(block)` → TSX source (React+Tailwind+shadcn, semantic theme classes) — the block analog of SCOPE-106's `renderHeaderComponent`.

### Data / Schema

- `src/db/schema/themeblock.ts` — `themeblocks` (id uuid v7 PK, companyid FK → companies cascade, name varchar(120), `block` jsonb tree, createdbyid FK → userprofiles set null, timestamps), **UNIQUE (companyid, name)** — mirrors `themetemplates`.
- One migration: create `themeblocks` + add a nullable `blocks` jsonb column (ordered inline block trees) to `themetemplates` for FR-009. Applied via the established pg.Client transaction pattern (app-side UUID v7), not drizzle-kit push.

### Server (`src/server/routes`)

- `themeBlocks.ts` — CRUD (`GET` list, `POST` save [member], `PATCH` rename [admin], `DELETE` [admin]), tenant-isolated by `req.companyid` — a copy-in-shape of `themeTemplates.ts`.
- **Execute** — extend the SCOPE-106 execute path to also render each block via `renderBlockCode` and materialize `Block-<name>.tsx` beside the theme/chrome artifacts. Template save (`POST /api/themes/templates`) extended to accept an optional `blocks` array.
- Routes mounted via `index.ts → app.ts`; DB via `src/db/client.ts`.

### Client (`src/client/components/Projects/`)

- `BlockComposer.tsx` — the surface: `BlockPalette` (drag sources) · `BlockCanvas` (drop target + sortable tree) · `BlockPropertyPanel` (selected-node props).
- `BlockRenderer.tsx` — JSON tree → React, used by both the canvas and the live preview (the runtime twin of `renderBlockCode`; both driven by the node registry).
- `BlockLibrary.tsx` — the gallery (list/save/apply/curate), mirroring `TemplateGallery.tsx`.
- Surfaced as a "Blocks" area in the Theme tab; blocks are droppable into the template.

### Drag-drop tech

Reuse the DnD library the Kanban board already uses (SCOPE-012) for consistency — confirmed at implementation; if it's not suited to a nested sortable tree, fall back to dnd-kit (`@dnd-kit/core` + `/sortable`), the accessible React standard. DnD is confined to the composer components.

### Generation hand-off

On execute, write `Block-<name>.tsx` for each block into the project's artifacts beside the theme/chrome artifacts, so the SPEC-056 generation-injection path consumes them the way it reads the theme/chrome. The structured `themeblocks` rows (and inline template `blocks`) are the source of truth; the files are derived output. The node-type registry guarantees the emitted code matches the live canvas/preview.

---

## Success Criteria

1. **Compose with zero code.** A user drags at least 5 different node types onto the canvas; they render live in the active theme, stack/reflow, and the panel expands to fit — with 0 lines of hand-written code. *(FR-001/002/003)*
2. **Theme-driven, not baked.** The same block rendered under 2 different themes produces 2 visibly different results, and the generated code contains 0 hard-coded colors (semantic classes only). *(FR-004/010)*
3. **Static content, fully editable.** Every node type's placeholder content is editable and renders live; card grid / repeater / stat tiles support add and remove of items; 0 nodes bind to an external data source. *(FR-005)*
4. **Edit operations work.** Select, delete, duplicate, and reorder each succeed on 100% of node types; deleting a container removes its children. *(FR-006)*
5. **Reusable library, isolated.** A saved block appears in the company gallery (which holds many); loading it restores the exact tree; a member can save, only an admin can rename/delete; a second company sees 0 of the first's blocks. *(FR-007/008)*
6. **Drops into templates, no regressions.** A template holds an ordered set of blocks that reload with it; existing chrome-only templates behave identically to before (0 regressions). *(FR-009)*
7. **Real code out.** Execute emits a valid TSX component per block that, pasted into a shadcn project, renders as previewed; block artifacts land beside the SCOPE-106 theme/chrome artifacts. *(FR-010)*

---

## Constraints & Notes

### Constraints

- **Reuse, don't reinvent.** Built on SCOPE-062 (theme tokens, execute/materialize) and SCOPE-106 (template model, tenant-isolated gallery + member/admin governance, execute-to-artifacts, chrome-renderer pattern). Net-new is only: the block model + node-type registry + code emitter, the `themeblocks` store, the composer UI (DnD), and the block gallery.
- **Sections, not pages.** Blocks are reusable branded sections; no routing, nav, or page assembly.
- **Structured reflow only.** No absolute/pixel positioning; output is responsive flex/grid.
- **Static placeholder data.** No live data binding in v1.
- **Theme-driven.** No hard-coded colors — semantic classes only; a block restyles under any theme.
- **Additive.** SCOPE-106 chrome and the SCOPE-062 theme model are unchanged.
- **Registry is the source of truth.** Each node type defines its props, its React render, and its code emit in one place, so canvas, preview, and generated code never drift.
- **Correct plumbing.** Routes via `index.ts → app.ts`; DB via `src/db/client.ts`; 100% TypeScript (no `any`), Pino-only.
- **Orchestrator-first.** Implement via `createSpecs` → `implement`; fences written by the orchestrator only.

### Out of Scope (v1 / later)

- Absolute/pixel positioning.
- Live data binding (API/DB) — a later scope on top of the builder.
- Full pages + routing/nav/page assembly — a later scope.
- Undo/redo — deferred (v1 has delete/duplicate/reorder).
- Reworking SCOPE-106 chrome into block types (the "unify" path) — later.
- Choosing the styling framework (a Stack decision).

### Dependencies

- SCOPE-062 (theme tokens, execute/materialize); SCOPE-106 (template model, gallery/governance, execute-to-artifacts, chrome-renderer pattern); the DnD library used by the SCOPE-012 Kanban board (fallback dnd-kit). No LLM dependency — the composer is deterministic.

### Notes

- **Palette sequenced in implementation:** content kit first, end-to-end (compose → save → drop → execute), then form controls, then data blocks — a usable slice ships before the whole palette.
- **Blocks inline on templates** in v1 (self-contained); block-by-reference is a later optimization.
- **Likely fan-out (at `createSpecs`):** ~3–4 specs — (A) block model + registry + renderers/code-emit + `themeblocks` storage; (B) the drag-drop composer UI (palette/canvas/property panel + DnD); (C) block library gallery + template integration + execute; optionally (D) the data-block node types split out. Folder numbers take the next global SPEC numbers, not 107.
- **New domain terms** (added to `CONTEXT.md`): **Block**, **Block Node**, **Block Library**, **Node-Type Registry**.
- **Process note:** authored in-conversation via interactive buildscope (section-by-section, the standing workaround while the `buildscope` CLI persists nothing); implementation routes through `createSpecs` → `implement` per orchestrator-first.
