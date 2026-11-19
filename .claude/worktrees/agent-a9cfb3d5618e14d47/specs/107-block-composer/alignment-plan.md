# SCOPE-107 Alignment & Centering — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add hybrid alignment to the Block Composer — per-element horizontal align (Left/Center/Right), Section "align items", and Row horizontal (incl. Spread) + vertical (Top/Middle/Bottom) — emitting real Tailwind and staying identical between canvas and generated code.

**Architecture:** Two pure helpers in `block-model.ts` (`stackClasses`, `selfClasses`) are the single source of truth; the React renderer and the code emitter both call them. Stack containers move from block-flow `space-y-4` to `flex flex-col gap-4` so `items-*`/`self-*`/`justify-*` apply. Alignment is stored as optional `align`/`valign` props — unset ⇒ today's output.

**Tech Stack:** TypeScript, React 18, TailwindCSS + shadcn semantic classes, dnd-kit, Vitest.

## Global Constraints

- TypeScript 100%, no `any`, no `@ts-ignore`. (CLAUDE.md)
- Styling uses shadcn semantic classes only — never hard-coded colors. Alignment uses Tailwind layout utilities (`items-*`/`self-*`/`justify-*`/`text-*`). (SCOPE-107 scope)
- Code fences: new top-level functions get a hand-authored `// [SCOPE 107 / T00x] BEGIN … END` fence matching the existing 107 style; modified fenced blocks get a `// MODIFIED-BY [SCOPE 107 / Txxx]` line. Orchestrator CLI is broken, so fences are hand-authored here (consistent with how shipped 107 was built); `auditfences` may flag — format matches convention. (CLAUDE.md fencing, memory: orchestrator-cli-broken)
- Backward compatibility: a node with no `align`/`valign` prop must emit byte-identical output for leaves; stack containers may switch `space-y-4 → flex flex-col gap-4` (visually equivalent). Saved library blocks carry no alignment props.
- Tests live in `tests/unit/*.test.ts`, run with `npm run test` (`vitest run`), import via the `~` → `src` alias.

---

### Task 1: Data model — field type + option sets + registry fields

**Files:**
- Modify: `src/shared/block-model.ts` (`FieldType`, `NodeField`, add `SegmentOption`, extend `NODE_REGISTRY` fields for heading/subheading/paragraph/button/image/panel/row)
- Test: `tests/unit/blockModelAlign.test.ts` (created here, extended in later tasks)

**Interfaces:**
- Consumes: existing `BlockNodeType`, `NODE_REGISTRY`, `createNode`.
- Produces: `FieldType` now includes `"segment"`; `NodeField.options?: SegmentOption[]`; `export interface SegmentOption { value: string; label: string }`. Registry: `heading|subheading|paragraph|button|image` each have a field `{ key:"align", type:"segment" }`; `panel` has `{ key:"align" }`; `row` has `{ key:"align" }` (with a Spread option) and `{ key:"valign" }`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/blockModelAlign.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { NODE_REGISTRY } from "~/shared/block-model";

describe("SCOPE-107 alignment registry", () => {
  it("exposes an align segment field on heading", () => {
    const f = NODE_REGISTRY.heading.fields.find((x) => x.key === "align");
    expect(f?.type).toBe("segment");
    expect(f?.options?.map((o) => o.value)).toEqual(["left", "center", "right"]);
  });

  it("gives row a Spread horizontal option and a vertical field", () => {
    const align = NODE_REGISTRY.row.fields.find((x) => x.key === "align");
    expect(align?.options?.map((o) => o.value)).toEqual(["left", "center", "right", "spread"]);
    const v = NODE_REGISTRY.row.fields.find((x) => x.key === "valign");
    expect(v?.options?.map((o) => o.value)).toEqual(["top", "middle", "bottom"]);
  });

  it("gives panel an align-items field but no valign", () => {
    expect(NODE_REGISTRY.panel.fields.some((x) => x.key === "align")).toBe(true);
    expect(NODE_REGISTRY.panel.fields.some((x) => x.key === "valign")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/unit/blockModelAlign.test.ts`
Expected: FAIL — `align` field not found on `NODE_REGISTRY.heading`.

- [ ] **Step 3: Implement the model changes**

In `src/shared/block-model.ts`, extend the field type and add the option interface (near the existing `FieldType`/`NodeField` declarations, ~line 51):

```ts
export type FieldType = "text" | "textarea" | "number" | "image" | "segment";

export interface SegmentOption {
  value: string;
  label: string;
}

export interface NodeField {
  key: string;
  label: string;
  type: FieldType;
  /** Choices for a "segment" (segmented-control) field. */
  options?: SegmentOption[];
}
```

Directly above `NODE_REGISTRY` (~line 70), add the shared option sets:

```ts
// SCOPE-107 alignment option sets (shared by the property-panel fields).
const ALIGN_LCR: SegmentOption[] = [
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
  { value: "right", label: "Right" },
];
const ALIGN_LCR_SPREAD: SegmentOption[] = [...ALIGN_LCR, { value: "spread", label: "Spread" }];
const VALIGN_TMB: SegmentOption[] = [
  { value: "top", label: "Top" },
  { value: "middle", label: "Middle" },
  { value: "bottom", label: "Bottom" },
];
```

Add an align field to the five leaf types. For `heading` change its `fields` to:

```ts
    fields: [
      { key: "text", label: "Text", type: "text" },
      { key: "align", label: "Align", type: "segment", options: ALIGN_LCR },
    ],
```

Apply the same `{ key: "align", label: "Align", type: "segment", options: ALIGN_LCR }` addition to `subheading`, `paragraph`, `button`, and `image` (append to their existing `fields` arrays).

For `panel`, set:

```ts
    fields: [{ key: "align", label: "Align items", type: "segment", options: ALIGN_LCR }],
```

For `row`, set:

```ts
    fields: [
      { key: "align", label: "Horizontal", type: "segment", options: ALIGN_LCR_SPREAD },
      { key: "valign", label: "Vertical", type: "segment", options: VALIGN_TMB },
    ],
```

Leave `defaultProps` untouched everywhere — alignment is unset by default.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/unit/blockModelAlign.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/shared/block-model.ts tests/unit/blockModelAlign.test.ts
git commit -m "feat(SCOPE-107): alignment field type + registry fields"
```

---

### Task 2: Pure class helpers — `stackClasses` / `selfClasses`

**Files:**
- Modify: `src/shared/block-model.ts` (add helpers, fenced)
- Test: `tests/unit/blockModelAlign.test.ts` (extend)

**Interfaces:**
- Consumes: `BlockNode`, `BlockNodeType`.
- Produces:
  - `export function stackClasses(node: BlockNode): string` — a container's own layout+alignment classes. `row` ⇒ `flex flex-wrap gap-4 {justify-*} {items-*}` (defaults `justify-start items-center`); `panel`/root ⇒ `flex flex-col gap-4` + optional `items-*`.
  - `export function selfClasses(node: BlockNode): string` — a node's classes as a flex child: `self-*` (+ `text-*` for `heading`/`subheading`/`paragraph`) when `align` is set, else `""`.

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/blockModelAlign.test.ts`:

```ts
import { createNode, stackClasses, selfClasses } from "~/shared/block-model";

describe("SCOPE-107 alignment helpers", () => {
  it("panel stack defaults to flex-col with no items class", () => {
    expect(stackClasses(createNode("panel"))).toBe("flex flex-col gap-4");
  });

  it("panel align center adds items-center", () => {
    const n = createNode("panel");
    n.props.align = "center";
    expect(stackClasses(n)).toBe("flex flex-col gap-4 items-center");
  });

  it("row defaults to justify-start items-center (matches today)", () => {
    expect(stackClasses(createNode("row"))).toBe("flex flex-wrap gap-4 justify-start items-center");
  });

  it("row spread + bottom maps to justify-between items-end", () => {
    const n = createNode("row");
    n.props.align = "spread";
    n.props.valign = "bottom";
    expect(stackClasses(n)).toBe("flex flex-wrap gap-4 justify-between items-end");
  });

  it("selfClasses centers a text node with self + text-align", () => {
    const n = createNode("heading");
    n.props.align = "center";
    expect(selfClasses(n)).toBe("self-center text-center");
  });

  it("selfClasses on a button is self-only (no text-align)", () => {
    const n = createNode("button");
    n.props.align = "right";
    expect(selfClasses(n)).toBe("self-end");
  });

  it("selfClasses is empty when align is unset", () => {
    expect(selfClasses(createNode("heading"))).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/unit/blockModelAlign.test.ts`
Expected: FAIL — `stackClasses`/`selfClasses` not exported.

- [ ] **Step 3: Implement the helpers**

In `src/shared/block-model.ts`, after the `moveNode` fence (~line 318, before the code-emitter section), add:

```ts
// [SCOPE 107 / T004] BEGIN — alignment class helpers (single source of truth for
// the renderer AND the code emitter, so canvas and generated code cannot drift)
const H_ITEMS: Record<string, string> = { left: "items-start", center: "items-center", right: "items-end" };
const H_JUSTIFY: Record<string, string> = { left: "justify-start", center: "justify-center", right: "justify-end", spread: "justify-between" };
const H_SELF: Record<string, string> = { left: "self-start", center: "self-center", right: "self-end" };
const H_TEXT: Record<string, string> = { left: "text-left", center: "text-center", right: "text-right" };
const V_ITEMS: Record<string, string> = { top: "items-start", middle: "items-center", bottom: "items-end" };
const TEXT_NODES = new Set<BlockNodeType>(["heading", "subheading", "paragraph"]);

/** A container's own flex layout + alignment classes. */
export function stackClasses(node: BlockNode): string {
  const p = node.props;
  if (node.type === "row") {
    const j = H_JUSTIFY[String(p.align ?? "")] ?? "justify-start";
    const v = V_ITEMS[String(p.valign ?? "")] ?? "items-center";
    return `flex flex-wrap gap-4 ${j} ${v}`;
  }
  const items = H_ITEMS[String(p.align ?? "")];
  return items ? `flex flex-col gap-4 ${items}` : "flex flex-col gap-4";
}

/** A node's alignment classes as a flex child. Empty when align is unset. */
export function selfClasses(node: BlockNode): string {
  const a = String(node.props.align ?? "");
  const self = H_SELF[a];
  if (!self) return "";
  return TEXT_NODES.has(node.type) ? `${self} ${H_TEXT[a]}` : self;
}
// [SCOPE 107 / T004] END
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/unit/blockModelAlign.test.ts`
Expected: PASS (all Task 1 + Task 2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/shared/block-model.ts tests/unit/blockModelAlign.test.ts
git commit -m "feat(SCOPE-107): stackClasses/selfClasses alignment helpers"
```

---

### Task 3: Wire alignment into the code emitter

**Files:**
- Modify: `src/shared/block-model.ts` (`emitNode`, `renderBlockCode` — inside the existing `[SCOPE 107 / T001]` fence; add a `MODIFIED-BY` line)
- Test: `tests/unit/blockModelAlign.test.ts` (extend)

**Interfaces:**
- Consumes: `stackClasses`, `selfClasses` from Task 2.
- Produces: generated TSX where root/`panel`/`row` use `stackClasses(node)` and each aligned element appends `selfClasses(node)`; unset leaves emit byte-identical output.

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/blockModelAlign.test.ts`:

```ts
import { renderBlockCode } from "~/shared/block-model";

describe("SCOPE-107 alignment in generated code", () => {
  it("default heading emission is byte-unchanged", () => {
    const code = renderBlockCode({ id: "b", name: "T", nodes: [createNode("heading")] });
    expect(code).toContain('<h2 className="text-3xl font-bold tracking-tight text-foreground">');
  });

  it("centered heading appends self-center text-center", () => {
    const h = createNode("heading");
    h.props.align = "center";
    const code = renderBlockCode({ id: "b", name: "T", nodes: [h] });
    expect(code).toContain('text-foreground self-center text-center');
  });

  it("panel emits flex-col with items-center when aligned", () => {
    const panel = createNode("panel");
    panel.props.align = "center";
    const code = renderBlockCode({ id: "b", name: "T", nodes: [panel] });
    expect(code).toContain("flex flex-col gap-4 items-center");
  });

  it("root wrapper uses flex-col", () => {
    const code = renderBlockCode({ id: "b", name: "T", nodes: [] });
    expect(code).toContain('<div className="flex flex-col gap-4">');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/unit/blockModelAlign.test.ts`
Expected: FAIL — centered heading has no `self-center`; root uses `space-y-4`.

- [ ] **Step 3: Implement the emitter changes**

In `src/shared/block-model.ts`, add a `MODIFIED-BY` line under the emitter's BEGIN fence (~line 326):

```ts
// [SCOPE 107 / T001] BEGIN — renderBlockCode (block tree → React+Tailwind+shadcn TSX)
// MODIFIED-BY [SCOPE 107 / T004] — alignment classes via stackClasses/selfClasses
```

At the top of `emitNode`, after `const p = node.props;`, add a helper for the optional suffix:

```ts
  const self = selfClasses(node);
  const sc = self ? ` ${self}` : "";
```

Update these `case` returns (leave all other cases untouched so their output is byte-identical):

```ts
    case "panel":
      return `${indent}<section className="rounded-lg border border-border bg-card p-6 text-card-foreground ${stackClasses(node)}">\n${kids}\n${indent}</section>`;
    case "row":
      return `${indent}<div className="${stackClasses(node)}">\n${kids}\n${indent}</div>`;
    case "heading":
      return `${indent}<h2 className="text-3xl font-bold tracking-tight text-foreground${sc}">{${JSON.stringify(str(p.text))}}</h2>`;
    case "subheading":
      return `${indent}<h3 className="text-xl font-semibold text-foreground${sc}">{${JSON.stringify(str(p.text))}}</h3>`;
    case "paragraph":
      return `${indent}<p className="text-sm text-muted-foreground${sc}">{${JSON.stringify(str(p.text))}}</p>`;
    case "button":
      return `${indent}<a href={${JSON.stringify(str(p.href, "#"))}} className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground${sc}">{${JSON.stringify(str(p.label, "Button"))}}</a>`;
    case "image": {
      const iw = Number(p.width ?? 0);
      const st = iw > 0 ? ` style={{ width: ${iw} }}` : "";
      return `${indent}<img src={${JSON.stringify(str(p.src))}} alt={${JSON.stringify(str(p.alt))}}${st} className="max-w-full rounded-md${sc}" />`;
    }
```

In `renderBlockCode`, change the root wrapper line from `<div className="space-y-4">` to:

```ts
    `    <div className="flex flex-col gap-4">`,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/unit/blockModelAlign.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite to confirm no regressions**

Run: `npm run test`
Expected: PASS (no other suite depends on the old `space-y-4` root string).

- [ ] **Step 6: Commit**

```bash
git add src/shared/block-model.ts tests/unit/blockModelAlign.test.ts
git commit -m "feat(SCOPE-107): emit alignment classes in generated code"
```

---

### Task 4: Apply alignment in the live canvas (BlockRenderer)

**Files:**
- Modify: `src/client/components/Projects/BlockRenderer.tsx` (`ContainerDrop` inner class + node wrapper class; import the helpers)

**Interfaces:**
- Consumes: `stackClasses`, `selfClasses`.
- Produces: canvas preview whose containers use `stackClasses(node)` and whose node wrappers carry `selfClasses(node)` — matching the generated code visually.

- [ ] **Step 1: Import the helpers**

In `src/client/components/Projects/BlockRenderer.tsx`, extend the import from the block model (currently `import type { BlockNode, PropValue } ...`):

```ts
import type { BlockNode, PropValue } from "../../../shared/block-model";
import { stackClasses, selfClasses } from "../../../shared/block-model";
```

- [ ] **Step 2: Route container layout through `stackClasses`**

In `ContainerDrop`, replace the `cn(...)` layout ternary (the block that currently reads `node.type === "columns" ? "grid gap-4 sm:grid-cols-2" : node.type === "cardgrid" ? "grid gap-4" : node.type === "row" ? "flex flex-wrap items-center gap-4" : "space-y-4",`) with:

```ts
      className={cn(
        node.type === "columns"
          ? "grid gap-4 sm:grid-cols-2"
          : node.type === "cardgrid"
            ? "grid gap-4"
            : stackClasses(node), // handles row + panel/stack alignment
        cb.editable && isOver && "outline outline-2 outline-ring",
        cb.editable && empty && "min-h-[48px] rounded-md border border-dashed border-border p-2",
      )}
```

- [ ] **Step 3: Add `selfClasses` to each node wrapper**

In `BlockRenderer`, add `selfClasses(node)` to the wrapper `cn(...)`:

```tsx
          <div
            key={node.id}
            className={cn(
              "group relative",
              cb.editable && "cursor-pointer rounded-md",
              selected && "outline outline-2 outline-primary",
              selfClasses(node),
            )}
            onClick={cb.editable ? (e) => { e.stopPropagation(); cb.onSelect?.(node.id); } : undefined}
          >
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/client/components/Projects/BlockRenderer.tsx
git commit -m "feat(SCOPE-107): apply alignment classes in the canvas renderer"
```

---

### Task 5: Segmented control in the property panel (BlockComposer)

**Files:**
- Modify: `src/client/components/Projects/BlockComposer.tsx` (add a `"segment"` field branch; switch the root canvas div to flex-col)

**Interfaces:**
- Consumes: `NodeField.options`, `updateNodeProps`, `cn`.
- Produces: selecting a node shows a labelled Left/Center/Right (and Row's Spread / vertical) segmented control writing `align`/`valign` via `updateNodeProps`.

- [ ] **Step 1: Make top-level elements self-alignable**

In `BlockComposer.tsx`, change the canvas inner wrapper (currently `<div className="space-y-4 bg-background text-foreground">`, ~line 280) to:

```tsx
            <div className="flex flex-col gap-4 bg-background text-foreground">
```

- [ ] **Step 2: Add the `"segment"` field branch**

In the property-panel field map, add a `segment` branch as the FIRST condition of the field-type chain (before `f.type === "image" ? (...)`):

```tsx
                    {f.type === "segment" ? (
                      <div className="mt-1 flex gap-1">
                        {(f.options ?? []).map((opt) => {
                          const active = String(selected.props[f.key] ?? "") === opt.value;
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() =>
                                setNodes((p) => updateNodeProps(p, selected.id, { [f.key]: opt.value }))
                              }
                              className={cn(
                                "flex-1 rounded-md border px-2 py-1 text-xs font-normal",
                                active
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-input hover:bg-accent",
                              )}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    ) : f.type === "image" ? (
```

(The existing `f.type === "image"`, `f.type === "textarea"`, and `else` branches stay as-is, now chained after the new `segment` branch.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/client/components/Projects/BlockComposer.tsx
git commit -m "feat(SCOPE-107): segmented alignment control in property panel"
```

---

### Task 6: Manual browser verification + backward-compat parity

**Files:** none (verification only).

- [ ] **Step 1: Build and run the app**

Use the project's `run` skill / dev server. Open a project → Theme tab → Blocks (Block Composer).

- [ ] **Step 2: Verify each alignment path**

- Drop a Section panel; drop a heading, a paragraph, a button, an image inside.
- Select the heading → Align → Center: heading centers in canvas.
- Select the button → Align → Right: button moves right.
- Select the Section → Align items → Center: all children center together; confirm a per-element override (e.g. heading Left) wins over the container default.
- Add a Row; drop two items; set Horizontal → Spread and Vertical → Bottom: items push apart and sit at the bottom.
- Click **Show code** and confirm the generated TSX classes match what the canvas shows (`self-center text-center`, `items-center`, `justify-between items-end`, etc.).

- [ ] **Step 3: Verify backward compatibility**

- Load an existing **Saved block** from before this change: it must render exactly as before (no alignment props ⇒ default look).
- Confirm a fresh block with no alignment set still copies code with a left-aligned, `flex flex-col gap-4` root (visually identical to the previous `space-y-4`).

- [ ] **Step 4: Full test suite**

Run: `npm run test`
Expected: PASS.

- [ ] **Step 5: Update the SCOPE-107 memory note**

Update `project_107_block_composer` memory: mark alignment/centering done, remove it from the REMAINING WORK list (leaving droplist, resize, drag-to-reorder, UI rename, S3 upload).

---

## Self-Review

**Spec coverage:**
- Per-element align (L/C/R) → Task 1 (fields) + Task 2 (`selfClasses`) + Task 3 (emit) + Task 4 (canvas) + Task 5 (control). ✓
- Section "align items" → `stackClasses` panel branch (Task 2/3/4) + panel field (Task 1). ✓
- Row horizontal incl. Spread + vertical T/M/B → `stackClasses` row branch (Task 2/3/4) + row fields (Task 1). ✓
- Single source of truth / no drift → helpers shared by emitter (Task 3) and renderer (Task 4). ✓
- Backward compatibility → byte-parity tests (Task 3) + manual parity (Task 6). ✓
- Testing → Vitest unit tests (Tasks 1–3) + manual browser pass (Task 6). ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code. `T00x` appears only in the fencing-convention constraint, not as a task gap.

**Type consistency:** `stackClasses(node: BlockNode): string` and `selfClasses(node: BlockNode): string` are named identically across Tasks 2–5; `SegmentOption`/`NodeField.options`/`"segment"` are consistent between Task 1 (definition) and Task 5 (consumption); `align`/`valign` prop keys match between registry fields (Task 1) and helpers (Task 2).

**Out of scope (unchanged this pass):** `columns`/`cardgrid` element alignment, form-control/`stat`/`embed` align, full Section vertical alignment, and the other SCOPE-107 remaining items (droplist, resize, drag-reorder, UI rename, S3 upload).
