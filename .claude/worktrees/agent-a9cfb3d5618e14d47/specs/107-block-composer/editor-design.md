# SCOPE-107 — Direct-Manipulation Editor (design)

**Date**: 2026-07-21
**Feature**: Turn the Block Composer from a panel-driven builder into a hands-on WYSIWYG editor
**Status**: designed (pre-implementation); Pass A1 detailed, A2/B/C sequenced
**Builds on**: shipped SCOPE-107 + the alignment pass (`specs/107-block-composer/alignment-design.md`)

## Problem

After the alignment pass, the composer works but feels clunky: all editing happens in a
far-right property panel, elements can't be resized by hand, and there's no control over
typography or per-element color. Andy: "this needs to be a full on editor… easy."

## Vision & decomposition

A direct-manipulation canvas — click to select, edit on the element, drag to resize —
built on the existing `BlockNode` model. Delivered in shippable passes so each lands
usable rather than one big rewrite:

- **Pass A1 — Floating toolbar + theme colors + size + bold + align.** Select an element
  → a small toolbar floats on it with text color, background color (theme swatches),
  font size, bold, and align (moved off the far-right panel). Zero new infrastructure —
  everything maps to Tailwind classes. *(This document details A1.)*
- **Pass A2 — Font family (curated safe list + curated Google fonts).** Adds font-loading
  plumbing: load chosen fonts in the canvas (`<link>` injection) and inject the required
  font import into generated code.
- **Pass B — Drag-to-resize.** Edge/corner handles on the selected element → width (+
  height for image/panel), written as `width`/`height` props.
- **Pass C — Inline text editing.** Double-click a text element to edit in place.

## Design decisions (Andy, 2026-07-21)

- **Colors drawn from the theme palette**, never free hex — keeps blocks on-brand (the
  whole point of the borrowed look). Swatches map to semantic Tailwind classes.
- **Font size**: preset steps (Tailwind `text-xs`…`text-6xl`) — clean classes.
- **Font family** (Pass A2): curated safe families **plus** curated Google fonts, with
  the import injected into generated code.
- **Override safety via `tailwind-merge`**: `cn` already merges (last class wins), and the
  emitter runs classNames through `twMerge` — so an override like `text-xl` cleanly beats
  a baked `text-3xl` with no default-restructuring. `tailwind-merge` v3.5.0 is installed.

---

## Pass A1 — detailed design

### Data model (`src/shared/block-model.ts`)

New **optional** props (unset ⇒ current output). Added to the text/content leaves
(`heading`, `subheading`, `paragraph`, `button`, `stat`) and, for colors, containers
(`panel`, `row`, `cardgrid`):

- `textColor`: theme role → `default | primary | secondary | accent | muted | destructive`
- `bgColor`: theme role → `default | card | primary | secondary | accent | muted | destructive`
- `fontSize`: `xs | sm | base | lg | xl | 2xl | 3xl | 4xl | 5xl | 6xl` (text nodes)
- `bold`: boolean (text nodes)

Class maps (in `block-model.ts`, alongside the alignment maps):

```
TEXT_COLOR:  primary→text-primary, secondary→text-secondary, accent→text-accent,
             muted→text-muted-foreground, destructive→text-destructive   (default→"")
BG_COLOR:    card→bg-card, primary→bg-primary, secondary→bg-secondary, accent→bg-accent,
             muted→bg-muted, destructive→bg-destructive                  (default→"")
fontSize:    → text-{size}     bold: true → font-bold
```

### Single source of truth — extend the helper family

Add `styleClasses(node: BlockNode): string` next to `stackClasses`/`selfClasses`. Returns
the space-joined color/size/weight classes (empty when nothing set). Both the renderer and
the emitter compose `cn(base, selfClasses(node), styleClasses(node))` (renderer) or
`twMerge([...].join(" "))` (emitter), so canvas and generated code stay identical and
overrides resolve deterministically.

### Emitter conflict handling

`emitNode` composes each element's className via `twMerge(base + selfClasses + styleClasses)`
so a chosen `fontSize`/`bold`/color overrides the baked defaults (`text-3xl`, `font-bold`,
`text-foreground`) with a single winning class. Non-conflicting classes (e.g. `text-center`
align vs `text-xl` size — different property groups) are all preserved. Unset ⇒ merged
output equals today's classes.

### UI — floating toolbar (`BlockComposer.tsx` / `BlockRenderer.tsx`)

- On selecting a node, render a small toolbar anchored to the element (absolute-positioned
  over the canvas), containing, per node type:
  - **Text color** + **Background color**: a row of theme swatches (each swatch shows the
    live theme color via the same CSS vars the canvas already uses); clicking sets the role.
  - **Font size**: a compact dropdown (XS…6XL) — text nodes only.
  - **Bold**: a toggle — text nodes only.
  - **Align**: the existing segmented control, relocated here from the far-right panel.
- The far-right property panel stays for structural fields (text content, href, image,
  columns, etc.) and as a fallback; the toolbar is the fast path.
- All controls call the existing `updateNodeProps` flow — no new state machinery.

### Backward compatibility

Every new prop is optional and unset on existing blocks. `twMerge` of the base classes
alone yields the same visual result as today (it only removes conflicts, of which there are
none in the defaults). Saved library blocks render unchanged. Verified manually.

### Testing

- **Unit (Vitest):** `styleClasses` per prop (color/size/bold, and empty when unset); and
  `emitNode`/`renderBlockCode` asserting overrides win (e.g. a `paragraph` with
  `fontSize:"xl"` emits `text-xl` and not `text-sm`; a `heading` with `bgColor:"accent"`
  emits `bg-accent`). Confirm default emission is visually unchanged.
- **Manual browser pass:** select elements, set colors from swatches, change size, toggle
  bold; confirm canvas matches copied code; confirm an existing saved block is unchanged.

## Non-goals (Pass A1)

Font family (A2), drag-to-resize (B), inline text editing (C), free hex colors, per-element
spacing/margins, z-order/layers. These are sequenced follow-ups, not this pass.
