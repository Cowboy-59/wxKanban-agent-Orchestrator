# SCOPE-107 — Alignment & Centering (design)

**Date**: 2026-07-21
**Feature**: Block Composer — element + container alignment controls
**Status**: designed (pre-implementation)
**Builds on**: shipped SCOPE-107 (`62432acc`) — see `specs/Project-Scope/107-block-composer.md`

## Problem

The Block Composer can drop, nest, style, and export blocks, but every element is
left-aligned and there is no way to center a heading, position a button, or arrange
side-by-side items in a Row. This is the top "make it usable" gap for building real
landing sections.

## Scope (this pass)

Hybrid alignment — per-element **and** per-container:

- **Horizontal `align` (Left / Center / Right)** on: `heading`, `subheading`,
  `paragraph`, `button`, `image` (as elements); `panel` ("Align items"); `row`
  (which also gets a **Spread** option → `justify-between`).
- **Vertical `valign` (Top / Middle / Bottom)** on `row` only — where side-by-side
  items of differing heights actually need it.

**Out of scope this pass** (noted for later, all cheap follow-ups): alignment inside
grids (`columns`, `cardgrid`), alignment on form controls, `stat`/`embed` element
align, and full vertical alignment of Section stacks.

## Approach

Flexbox model. Stack containers (root canvas + `panel`) move from block-flow
`space-y-4` to `flex flex-col gap-4`, so alignment maps to real Tailwind utilities
(`items-*`, `self-*`, `justify-*`, `text-*`) that read cleanly in the exported code.
Rejected alternatives: `text-align` + `mx-auto` (inconsistent for block images and not
true item alignment) and CSS-variable styling (not the project idiom).

## Data model (`src/shared/block-model.ts`)

Two new **optional** props (unset ⇒ current behavior):

- `align`: `"left" | "center" | "right"` — and additionally `"spread"` for `row`.
- `valign`: `"top" | "middle" | "bottom"` — `row` only.

Mapping (single map, reused everywhere):

```
left → start,  center → center,  right → end        (align → items-/justify-/self-/text-)
top → start,   middle → center,  bottom → end        (valign → items-)
spread → between                                     (row horizontal only → justify-between)
```

`NodeField` gains an optional `options?: { value: string; label: string }[]` and the
`FieldType` union gains `"segment"`. The registry adds the align/valign fields to the
node types listed in Scope.

## Single source of truth — two pure helpers

Added to `block-model.ts` and imported by BOTH the renderer and the emitter, so the
canvas preview and the generated TSX cannot drift:

- `stackClasses(node): string` — a container's own layout classes.
  - `panel` / root: `flex flex-col gap-4` + `items-{align}` (omit when unset ⇒
    `items-stretch`, today's look).
  - `row`: `flex flex-wrap gap-4` + `justify-{align}` (default `justify-start`) +
    `items-{valign}` (default `items-center`, matching today).
  - `columns` / `cardgrid`: unchanged grid classes.
- `selfClasses(node): string` — a node's classes as a flex child. When `align` is set:
  `self-{align}`, plus `text-{align}` for text nodes (`heading`/`subheading`/
  `paragraph`). Empty string otherwise.

## Touchpoints

1. **`src/shared/block-model.ts`**
   - Extend `BlockNodeType` props usage (no new node types), `NodeField`, `FieldType`,
     `NODE_REGISTRY` fields.
   - Add `stackClasses` / `selfClasses` (fenced `[SCOPE 107 / T00x]`).
   - `emitNode`: root `<div>` and `<section>` use `stackClasses`; each emitted element
     appends `selfClasses(node)` to its `className`.

2. **`src/client/components/Projects/BlockRenderer.tsx`**
   - `ContainerDrop` panel/stack inner: `space-y-4 → stackClasses(node)`; `row` classes
     come from `stackClasses` too.
   - Each node wrapper `<div className="group relative">` gets `selfClasses(node)`
     merged via `cn(...)`.

3. **`src/client/components/Projects/BlockComposer.tsx`**
   - Property panel: add `case "segment"` — labelled segmented buttons that call the
     existing `updateNodeProps` flow. Also update the root canvas inner div
     `space-y-4 → flex flex-col gap-4` so top-level (non-panel) elements can self-align.

## Backward compatibility

- No `align`/`valign` props ⇒ identical output. `items-stretch` and Row `items-center`
  are the unset defaults; `space-y-4 → flex flex-col gap-4` is visually equivalent
  (equal inter-item spacing).
- Every block already saved in the library lacks these props, so nothing re-renders
  differently. Parity verified manually in the browser.

## Testing

- **Unit (Vitest, pure core):** `stackClasses` / `selfClasses` per relevant node type
  (including unset defaults) and `emitNode` output asserting alignment classes land and
  that default emission is unchanged.
- **Manual browser pass:** center a heading/button/image, set Row horizontal + vertical
  and Spread, confirm the canvas matches the copied code, and confirm an existing saved
  block renders unchanged.

## Non-goals / follow-ups

Drag-to-reorder, resize handles, proper droplist, UI block-rename, and S3 image upload
remain separate SCOPE-107 remaining items — untouched here.
