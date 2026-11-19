# UI Patterns

## Page Header (Sticky Banner)

All pages that include the site header must use these exact values.

### Structure

```tsx
<header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur-sm">
  <div className="max-w-7xl mx-auto px-4 py-0 flex items-center justify-between">
    {/* Logo */}
    <div className="flex items-center gap-2">
      <img
        src={theme === "dark" ? "/wxKanbanDark.png" : "/wxKanbanLight.png"}
        alt="wxKanban"
        className="h-16 w-auto object-contain"
      />
    </div>
    {/* nav + auth buttons */}
  </div>
</header>
```

### Rules

| Property        | Value                          | Notes                              |
| --------------- | ------------------------------ | ---------------------------------- |
| Position        | `sticky top-0 z-50`            | Always visible on scroll           |
| Background      | `bg-background/95 backdrop-blur-sm` | Semi-transparent blur          |
| Border          | `border-b border-border`       |                                    |
| Inner padding   | `py-0 px-4`                    | No vertical padding — logo sets height |
| Max width       | `max-w-7xl mx-auto`            |                                    |
| Logo height     | `h-16` (64px)                  | Width auto-scales to aspect ratio  |
| Logo light mode | `/wxKanbanLight.png`           | Served from `public/`              |
| Logo dark mode  | `/wxKanbanDark.png`            | Served from `public/`              |

### Theme detection

Use `useTheme()` from `../components/ThemeProvider` to switch the logo src.

```tsx
const { theme } = useTheme();
src={theme === "dark" ? "/wxKanbanDark.png" : "/wxKanbanLight.png"}
```

---

## Mermaid Chart Rendering in Document Viewers

Any component that renders markdown content from the `projectdocuments` table **MUST** support Mermaid fenced code blocks. The `content` field may contain ` ```mermaid ` blocks (e.g. pie charts, xychart-beta bar charts) that must be rendered as live SVG diagrams — not displayed as raw text.

### Required dependency

```bash
npm install mermaid
```

### Pattern

Use a `MermaidBlock` component that initialises Mermaid on mount and renders the diagram into a `<div>` ref:

```tsx
import { useEffect, useRef } from "react";
import mermaid from "mermaid";

mermaid.initialize({ startOnLoad: false, theme: "default" });

export function MermaidBlock({ chart }: { chart: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const id = `mermaid-${Math.random().toString(36).slice(2)}`;
    mermaid.render(id, chart).then(({ svg }) => {
      if (ref.current) ref.current.innerHTML = svg;
    });
  }, [chart]);

  return <div ref={ref} className="my-4 flex justify-center" />;
}
```

### Integration in markdown renderers

When parsing markdown content line-by-line, detect ` ```mermaid ` fences and collect the block, then pass it to `<MermaidBlock chart={...} />` instead of rendering as a `<pre>` block:

```tsx
// Pseudo-code for markdown renderer
if (inMermaidBlock) {
  // accumulate lines until closing ```
  return <MermaidBlock chart={accumulatedLines.join("\n")} />;
}
```

### Applies to

- `ProjectOverviewTab` (`OverviewContent` renderer) — extend to handle mermaid blocks
- Any future document viewer that renders `projectdocuments.content`
- The `lifecycle` doctype document (`specs/projectlifecycle.md`) which contains pie and xychart-beta blocks

### Print behaviour

Mermaid renders to inline SVG, which prints correctly in all modern browsers. No additional print CSS is required.
