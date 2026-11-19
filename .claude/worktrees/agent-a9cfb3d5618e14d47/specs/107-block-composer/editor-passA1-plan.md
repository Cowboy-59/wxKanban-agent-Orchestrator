# SCOPE-107 Editor — Pass A1 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add a floating on-element toolbar to the Block Composer giving theme-palette text/background color, preset font size, bold, and (relocated) align — turning the far-right, panel-only editing into hands-on canvas editing.

**Architecture:** Extend the pure helper family in `block-model.ts` with `styleClasses(node)` (color/size/weight → Tailwind classes), used by both renderer and emitter (single source of truth). `tailwind-merge` resolves overrides vs baked defaults. A new `BlockToolbar.tsx` renders over the selected node; the far-right panel keeps structural fields and stops rendering the `segment` (align) fields, which move to the toolbar.

**Tech Stack:** TypeScript, React 18, TailwindCSS + shadcn semantic classes, tailwind-merge, Vitest.

## Global Constraints

- TypeScript 100%, no `any`, no `@ts-ignore`.
- Colors are theme roles → semantic Tailwind classes only; never hard-coded hex.
- New top-level functions get hand-authored `// [SCOPE 107 / T00x]` fences (orchestrator CLI down); `auditfences` may flag — format matches convention.
- Backward compatibility: unset props ⇒ merged className equals today's output (no conflicts in the base classes).
- Tests: `tests/unit/*.test.ts`, run `npm run test`, import via `~` → `src`.
- Reuse `cn` from `src/client/lib/utils.ts` (already `twMerge(clsx(...))`).

---

### Task 1: Model — style props + class maps + `styleClasses`

**Files:**
- Modify: `src/shared/block-model.ts`
- Test: `tests/unit/blockModelAlign.test.ts` (extend — same suite file)

**Interfaces:**
- Consumes: `BlockNode`, existing `selfClasses`.
- Produces: `export function styleClasses(node: BlockNode): string` — space-joined color/size/weight classes; `""` when none set.

- [ ] **Step 1: Write the failing test** — append to `tests/unit/blockModelAlign.test.ts`:

```ts
import { styleClasses } from "~/shared/block-model";

describe("SCOPE-107 styleClasses", () => {
  it("is empty when nothing set", () => {
    expect(styleClasses(createNode("heading"))).toBe("");
  });
  it("maps text + background colors to semantic classes", () => {
    const n = createNode("paragraph");
    n.props.textColor = "primary";
    n.props.bgColor = "accent";
    expect(styleClasses(n)).toBe("text-primary bg-accent");
  });
  it("maps muted text color to text-muted-foreground", () => {
    const n = createNode("paragraph");
    n.props.textColor = "muted";
    expect(styleClasses(n)).toBe("text-muted-foreground");
  });
  it("emits font size and bold", () => {
    const n = createNode("heading");
    n.props.fontSize = "xl";
    n.props.bold = true;
    expect(styleClasses(n)).toBe("text-xl font-bold");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- tests/unit/blockModelAlign.test.ts`
Expected: FAIL — `styleClasses` is not exported.

- [ ] **Step 3: Implement** — in `src/shared/block-model.ts`, immediately after the `[SCOPE 107 / T004]` alignment-helpers END fence, add:

```ts
// [SCOPE 107 / T005] BEGIN — visual style helpers (color/size/weight → classes)
const TEXT_COLOR: Record<string, string> = {
  primary: "text-primary",
  secondary: "text-secondary",
  accent: "text-accent",
  muted: "text-muted-foreground",
  destructive: "text-destructive",
};
const BG_COLOR: Record<string, string> = {
  card: "bg-card",
  primary: "bg-primary",
  secondary: "bg-secondary",
  accent: "bg-accent",
  muted: "bg-muted",
  destructive: "bg-destructive",
};

/** Per-node color/size/weight classes. Empty when nothing is set. */
export function styleClasses(node: BlockNode): string {
  const p = node.props;
  const out: string[] = [];
  const tc = TEXT_COLOR[String(p.textColor ?? "")];
  if (tc) out.push(tc);
  const bc = BG_COLOR[String(p.bgColor ?? "")];
  if (bc) out.push(bc);
  const fs = String(p.fontSize ?? "");
  if (fs) out.push(`text-${fs}`);
  if (p.bold === true) out.push("font-bold");
  return out.join(" ");
}

/** Swatch role → the CSS variable used to preview it (for the toolbar). */
export const TEXT_COLOR_ROLES = ["default", "primary", "secondary", "accent", "muted", "destructive"] as const;
export const BG_COLOR_ROLES = ["default", "card", "primary", "secondary", "accent", "muted", "destructive"] as const;
export const FONT_SIZES = ["xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl", "5xl", "6xl"] as const;
// [SCOPE 107 / T005] END
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test -- tests/unit/blockModelAlign.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/block-model.ts tests/unit/blockModelAlign.test.ts
git commit -m "feat(SCOPE-107): styleClasses helper (theme color/size/bold)"
```

---

### Task 2: Emitter — merge style/align classes via tailwind-merge

**Files:**
- Modify: `src/shared/block-model.ts` (`emitNode` — inside the `[SCOPE 107 / T001]` fence; extend the existing `MODIFIED-BY` note)
- Test: `tests/unit/blockModelAlign.test.ts` (extend)

**Interfaces:**
- Consumes: `styleClasses`, `selfClasses`, `twMerge`.
- Produces: generated TSX where each element's className is `twMerge(base + selfClasses + styleClasses)`; unset ⇒ base unchanged.

- [ ] **Step 1: Write the failing test** — append:

```ts
describe("SCOPE-107 style in generated code", () => {
  it("font size override beats the baked heading size", () => {
    const h = createNode("heading");
    h.props.fontSize = "xl";
    const code = renderBlockCode({ id: "b", name: "T", nodes: [h] });
    expect(code).toContain("text-xl");
    expect(code).not.toContain("text-3xl");
  });
  it("panel background override beats bg-card", () => {
    const panel = createNode("panel");
    panel.props.bgColor = "accent";
    const code = renderBlockCode({ id: "b", name: "T", nodes: [panel] });
    expect(code).toContain("bg-accent");
    expect(code).not.toContain("bg-card");
  });
  it("default heading emission has no style leakage", () => {
    const code = renderBlockCode({ id: "b", name: "T", nodes: [createNode("heading")] });
    expect(code).toContain("text-3xl font-bold tracking-tight text-foreground");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- tests/unit/blockModelAlign.test.ts`
Expected: FAIL — override cases still contain `text-3xl` / `bg-card`.

- [ ] **Step 3: Implement** — in `src/shared/block-model.ts`:

Add the import at the top of the file (with the other imports; block-model currently has none, so add the first import line at the very top):

```ts
import { twMerge } from "tailwind-merge";
```

Extend the emitter's `MODIFIED-BY` note:

```ts
// MODIFIED-BY [SCOPE 107 / T004] — alignment classes via stackClasses/selfClasses
// MODIFIED-BY [SCOPE 107 / T005] — color/size/weight via styleClasses + tailwind-merge
```

Replace the `self`/`sc` locals at the top of `emitNode` with a merge helper:

```ts
  const extra = [selfClasses(node), styleClasses(node)].filter(Boolean).join(" ");
  const cls = (base: string): string => (extra ? twMerge(`${base} ${extra}`) : base);
```

Update the element cases to run their base className through `cls(...)` (replacing the previous `${sc}` suffix). The container and leaf cases become:

```ts
    case "panel":
      return `${indent}<section className="${cls(`rounded-lg border border-border bg-card p-6 text-card-foreground ${stackClasses(node)}`)}">\n${kids}\n${indent}</section>`;
    case "columns":
      return `${indent}<div className="${cls("grid gap-4 sm:grid-cols-2")}">\n${kids}\n${indent}</div>`;
    case "row":
      return `${indent}<div className="${cls(stackClasses(node))}">\n${kids}\n${indent}</div>`;
    case "heading":
      return `${indent}<h2 className="${cls("text-3xl font-bold tracking-tight text-foreground")}">{${JSON.stringify(str(p.text))}}</h2>`;
    case "subheading":
      return `${indent}<h3 className="${cls("text-xl font-semibold text-foreground")}">{${JSON.stringify(str(p.text))}}</h3>`;
    case "paragraph":
      return `${indent}<p className="${cls("text-sm text-muted-foreground")}">{${JSON.stringify(str(p.text))}}</p>`;
    case "button":
      return `${indent}<a href={${JSON.stringify(str(p.href, "#"))}} className="${cls("inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground")}">{${JSON.stringify(str(p.label, "Button"))}}</a>`;
    case "image": {
      const iw = Number(p.width ?? 0);
      const st = iw > 0 ? ` style={{ width: ${iw} }}` : "";
      return `${indent}<img src={${JSON.stringify(str(p.src))}} alt={${JSON.stringify(str(p.alt))}}${st} className="${cls("max-w-full rounded-md")}" />`;
    }
    case "cardgrid":
      return `${indent}<div className="${cls(`grid gap-4 sm:grid-cols-${Number(p.columns ?? 3)}`)}">\n${kids}\n${indent}</div>`;
    case "stat":
      return `${indent}<div className="${cls("rounded-lg border border-border bg-card p-4 text-card-foreground")}"><div className="text-2xl font-bold text-foreground">{${JSON.stringify(str(p.value))}}</div><div className="text-xs text-muted-foreground">{${JSON.stringify(str(p.label))}}</div></div>`;
```

(Leave `spacer`, `divider`, `input`, `textarea`, `select`, `checkbox`, `submit`, `embed` as-is — they carry no style props. Remove the now-unused standalone `self`/`sc` declarations.)

- [ ] **Step 4: Run to verify it passes, then the whole align suite**

Run: `npm run test -- tests/unit/blockModelAlign.test.ts`
Expected: PASS (all alignment + style tests; the earlier `self-center text-center` substring assertion still holds — non-conflicting classes are preserved by twMerge).

- [ ] **Step 5: Commit**

```bash
git add src/shared/block-model.ts tests/unit/blockModelAlign.test.ts
git commit -m "feat(SCOPE-107): merge color/size/bold into generated code"
```

---

### Task 3: Renderer — apply `styleClasses` in the canvas

**Files:**
- Modify: `src/client/components/Projects/BlockRenderer.tsx`

**Interfaces:**
- Consumes: `styleClasses`.
- Produces: canvas leaves + containers show the same color/size/bold as the generated code.

- [ ] **Step 1: Import** — extend the block-model import:

```ts
import { stackClasses, selfClasses, styleClasses } from "../../../shared/block-model";
```

- [ ] **Step 2: Wrap leaf classNames with `cn(base, styleClasses(node))`** — in `leaf(node)`, change the color/size-relevant cases to run through `cn`. Example for the text + button + stat cases:

```tsx
    case "heading":
      return <h2 className={cn("text-3xl font-bold tracking-tight text-foreground", styleClasses(node))}>{s(p.text, "Heading")}</h2>;
    case "subheading":
      return <h3 className={cn("text-xl font-semibold text-foreground", styleClasses(node))}>{s(p.text, "Subheading")}</h3>;
    case "paragraph":
      return <p className={cn("text-sm text-muted-foreground", styleClasses(node))}>{s(p.text, "Paragraph")}</p>;
    case "button":
      return <span className={cn("inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground", styleClasses(node))}>{s(p.label, "Button")}</span>;
```

For `stat`, wrap its outer div: `className={cn("rounded-lg border border-border bg-card p-4 text-card-foreground", styleClasses(node))}`.

- [ ] **Step 3: Apply `styleClasses` to containers** — in `ContainerDrop`, add `styleClasses(node)` to the inner `cn(...)` (so `bgColor` works on panel/row/cardgrid):

```ts
      className={cn(
        node.type === "columns"
          ? "grid gap-4 sm:grid-cols-2"
          : node.type === "cardgrid"
            ? "grid gap-4"
            : stackClasses(node),
        styleClasses(node),
        cb.editable && isOver && "outline outline-2 outline-ring",
        cb.editable && empty && "min-h-[48px] rounded-md border border-dashed border-border p-2",
      )}
```

And for the `panel` wrapper `<section>`, add it there too: `<section className={cn("rounded-lg border border-border bg-card p-6 text-card-foreground", styleClasses(node))}>`.

- [ ] **Step 4: Verify with the real client build**

Run: `npm run build:client`
Expected: `✓ built`.

- [ ] **Step 5: Commit**

```bash
git add src/client/components/Projects/BlockRenderer.tsx
git commit -m "feat(SCOPE-107): render color/size/bold in the canvas"
```

---

### Task 4: Floating toolbar + relocate align out of the side panel

**Files:**
- Create: `src/client/components/Projects/BlockToolbar.tsx`
- Modify: `src/client/components/Projects/BlockRenderer.tsx` (render the toolbar over the selected node)
- Modify: `src/client/components/Projects/BlockComposer.tsx` (pass the update callback down; skip `segment` fields in the side panel)

**Interfaces:**
- Consumes: `NODE_REGISTRY`, `styleClasses` roles (`TEXT_COLOR_ROLES`, `BG_COLOR_ROLES`, `FONT_SIZES`), `updateNodeProps` (via callback).
- Produces: `BlockToolbar` — an absolutely-positioned control strip; writes props through an `onProp(key, value)` callback.

- [ ] **Step 1: Create `BlockToolbar.tsx`**

```tsx
// SCOPE-107 / Pass A1 — floating on-element toolbar (theme colors, size, bold, align).
import { NODE_REGISTRY, TEXT_COLOR_ROLES, BG_COLOR_ROLES, FONT_SIZES, type BlockNode, type PropValue } from "../../../shared/block-model";
import { cn } from "../../lib/utils";

const TEXT_NODES = new Set(["heading", "subheading", "paragraph"]);
const TEXT_COLORABLE = new Set(["heading", "subheading", "paragraph", "button", "stat"]);
const BG_COLORABLE = new Set(["heading", "subheading", "paragraph", "button", "stat", "panel", "row", "cardgrid"]);

// [SCOPE 107 / T006] BEGIN — BlockToolbar
export default function BlockToolbar({
  node,
  onProp,
}: {
  node: BlockNode;
  onProp: (key: string, value: PropValue) => void;
}) {
  const p = node.props;
  const segFields = NODE_REGISTRY[node.type].fields.filter((f) => f.type === "segment");
  const swatch = (role: string, kind: "text" | "bg") => {
    const key = kind === "text" ? "textColor" : "bgColor";
    const active = String(p[key] ?? "default") === role;
    const bgClass = role === "default" ? "bg-background" : `bg-${role === "muted" && kind === "text" ? "muted-foreground" : role}`;
    return (
      <button
        key={`${kind}-${role}`}
        type="button"
        title={`${kind === "text" ? "Text" : "Background"}: ${role}`}
        onClick={(e) => { e.stopPropagation(); onProp(key, role); }}
        className={cn("h-4 w-4 rounded-sm border", bgClass, active ? "ring-2 ring-ring" : "border-border")}
      />
    );
  };
  return (
    <div
      className="absolute -top-9 left-0 z-30 flex items-center gap-2 rounded-md border border-border bg-popover px-2 py-1 text-popover-foreground shadow-md"
      onClick={(e) => e.stopPropagation()}
    >
      {TEXT_NODES.has(node.type) && (
        <>
          <select
            value={String(p.fontSize ?? "")}
            onChange={(e) => onProp("fontSize", e.target.value)}
            className="rounded border border-input bg-background px-1 py-0.5 text-xs"
            title="Font size"
          >
            <option value="">Size</option>
            {FONT_SIZES.map((s) => <option key={s} value={s}>{s.toUpperCase()}</option>)}
          </select>
          <button
            type="button"
            title="Bold"
            onClick={(e) => { e.stopPropagation(); onProp("bold", p.bold !== true); }}
            className={cn("rounded border px-1.5 py-0.5 text-xs font-bold", p.bold === true ? "border-primary bg-primary text-primary-foreground" : "border-input")}
          >
            B
          </button>
        </>
      )}
      {TEXT_COLORABLE.has(node.type) && (
        <div className="flex items-center gap-0.5" title="Text color">{TEXT_COLOR_ROLES.map((r) => swatch(r, "text"))}</div>
      )}
      {BG_COLORABLE.has(node.type) && (
        <div className="flex items-center gap-0.5" title="Background">{BG_COLOR_ROLES.map((r) => swatch(r, "bg"))}</div>
      )}
      {segFields.map((f) => (
        <div key={f.key} className="flex items-center gap-0.5" title={f.label}>
          {(f.options ?? []).map((opt) => {
            const active = String(p[f.key] ?? "") === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={(e) => { e.stopPropagation(); onProp(f.key, opt.value); }}
                className={cn("rounded border px-1 py-0.5 text-[10px]", active ? "border-primary bg-primary text-primary-foreground" : "border-input")}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
// [SCOPE 107 / T006] END
```

- [ ] **Step 2: Render the toolbar over the selected node** — in `BlockRenderer.tsx`, extend `BlockRenderCallbacks` with `onProp?: (id: string, key: string, value: PropValue) => void`, import `BlockToolbar`, and inside the node wrapper (when `selected`) render it:

```tsx
            {cb.editable && selected && cb.onProp ? (
              <BlockToolbar node={node} onProp={(k, v) => cb.onProp?.(node.id, k, v)} />
            ) : null}
```

(Place it as the first child of the wrapper `<div className={cn("group relative", ...)}>`, before the `Toolbar`.)

- [ ] **Step 3: Wire the callback + trim the side panel** — in `BlockComposer.tsx`:

Pass `onProp` into `<BlockRenderer>`:

```tsx
                  onProp={(id, key, value) => setNodes((p) => updateNodeProps(p, id, { [key]: value }))}
```

In the property-panel field map, skip `segment` fields (they now live in the toolbar) by filtering:

```tsx
                NODE_REGISTRY[selected.type].fields.filter((f) => f.type !== "segment").map((f: NodeField) => (
```

And update the "No editable properties" guard to use the same filtered length.

- [ ] **Step 4: Verify with the real client build**

Run: `npm run build:client`
Expected: `✓ built`.

- [ ] **Step 5: Commit**

```bash
git add src/client/components/Projects/BlockToolbar.tsx src/client/components/Projects/BlockRenderer.tsx src/client/components/Projects/BlockComposer.tsx
git commit -m "feat(SCOPE-107): floating on-element editor toolbar"
```

---

### Task 5: Manual verification + memory

- [ ] **Step 1:** With the dev servers running, open a project → Theme → Blocks.
- [ ] **Step 2:** Select a heading → toolbar appears above it: set **Size** to XL, toggle **B**, pick a **text** swatch and a **background** swatch → canvas updates; **Show code** matches (`text-xl`, `font-bold`, `text-…`, `bg-…`, no leftover `text-3xl`).
- [ ] **Step 3:** Select the Section panel → set a **background** swatch (e.g. accent) → panel recolors; align still works from the toolbar.
- [ ] **Step 4:** Confirm the side panel now shows only structural fields (text/href/image), not the align segments.
- [ ] **Step 5:** Load an existing saved block → unchanged.
- [ ] **Step 6:** `npm run test` → the align/style suite passes.
- [ ] **Step 7:** Update `project_107_block_composer` memory: Pass A1 done; note A2 (fonts) / B (resize) / C (inline edit) remain.

## Self-Review

- Colors from theme palette → `styleClasses` maps to semantic classes (Task 1) applied in emitter (Task 2), renderer (Task 3), and chosen via swatches (Task 4). ✓
- Font size preset steps → `FONT_SIZES` + `text-{size}` + size dropdown. ✓
- Bold → `font-bold` + toggle. ✓
- Align relocated → toolbar renders `segment` fields; panel filters them out (Task 4). ✓
- Override safety → `twMerge` in emitter (Task 2), `cn` in renderer (Tasks 3-4). ✓
- Backward compat → unset ⇒ base className unchanged (Task 2 default test) + manual (Task 5). ✓
- **Placeholder scan:** none. **Type consistency:** `styleClasses`, `onProp(id,key,value)`, `TEXT_COLOR_ROLES`/`BG_COLOR_ROLES`/`FONT_SIZES` names consistent across tasks.

## Out of scope (Pass A1)

Font family (A2), drag-to-resize (B), inline text editing (C), free hex, spacing/margins, layers.
