---
name: nextage-ui-patterns
description: NextAge Design System quick reference. Glass morphism utility classes, semantic status tokens, modal patterns, button systems, and table action patterns. Use when creating UI components, styling pages, implementing forms, or any frontend work.
---

# NextAge UI Patterns

All styling uses composite CSS utility classes defined in your project's main CSS file (typically `index.css` or `globals.css`). No inline `dark:` overrides in application code. No raw color values. Everything auto-switches between light and dark mode.

## Glass Hierarchy (Nesting Levels)

Use progressively darker backgrounds when nesting:

| Class | Level | Use For |
|-------|-------|---------|
| `glass-section` | Lightest | Outer container cards, accordion items |
| `glass-inset` | Medium | Grouping areas, empty states, inner containers |
| `glass-card` | Darkest | Focus elements: data tables, dropzones, key content, top-level page cards |
| `glass-dropdown` | Overlay | Select content, popover, dropdown, modal DialogContent |

**Rule**: Top-level cards on pages with `nextage-hero-gradient` background use `glass-card` (opaque, blocks hero gradient bleed-through). `nextage-card-gradient` is semi-transparent and lets the orange hero gradient show through.

### Nesting Tree (Real Page Example)

```
Page Background (nextage-hero-gradient)
  └─ glass-card ─── Top-level content card (Website Project)
       └─ glass-section ─── Accordion items (Library, Assets, Workflow, Copy, Forms)
            ├─ glass-section ─── Sub-container cards (Upload Assets, Uploaded Assets)
            │    └─ glass-card ─── Focus elements (data tables, dropzones)
            ├─ glass-card ─── Direct focus elements (DocumentCard, table wrappers)
            ├─ glass-inset ─── Empty states, not-yet-generated cards
            └─ glass-action ─── Action buttons (blue, green, slate, violet, etc.)

Modals (overlay):
  └─ glass-dropdown ─── Dialog/modal content
       ├─ nextage-card-gradient ─── Header/footer with border-glass-border
       ├─ glass-input ─── Form inputs, select triggers
       ├─ glass-dropdown ─── Select content (nested dropdown)
       └─ glass-action ─── Buttons
```

## Button System

### Action Buttons (glass-action)

No `variant` prop. No `asChild`. Just `className`.

```tsx
<Button className="glass-action glass-action-blue">Primary Action</Button>
<Button className="glass-action glass-action-slate">Cancel</Button>
<Button className="glass-action glass-action-red">Delete</Button>
```

Available colors: `blue`, `green`, `red`, `slate`, `violet`, `indigo`, `orange`, `emerald`, `cyan`

**Never combine `variant` prop with `glass-action` classes** — variant styles override glass styles.

For navigation links, skip Button entirely:
```tsx
<Link to="/foo" className="glass-action glass-action-slate inline-flex h-10 items-center gap-2 px-5 text-sm">
  <Icon className="h-4 w-4" /> Label
</Link>
```

### Table Action Icon Buttons

Small icon buttons in table rows. Use `variant="ghost"` with status hover colors:

```tsx
<Tooltip>
  <TooltipTrigger asChild>
    <Button
      variant="ghost"
      size="sm"
      onClick={() => handleAction(item)}
      className="h-8 w-8 p-0 hover:bg-status-blue-bg hover:text-status-blue"
    >
      <Eye className="h-3.5 w-3.5" />
      <span className="sr-only">View details</span>
    </Button>
  </TooltipTrigger>
  <TooltipContent><p>View details</p></TooltipContent>
</Tooltip>
```

**For navigation**: Use `onClick` + `navigate()`. Never `asChild` + `Link` inside tooltip triggers (breaks tooltip silently).

**Icon-only buttons MUST have tooltips** — mandatory accessibility requirement.

## Standard Modal Pattern

```tsx
<Dialog open={open} onOpenChange={onOpenChange}>
  <DialogContent className="glass-dropdown gap-0 rounded-[12px] p-0 sm:max-w-[500px]">
    {/* Header */}
    <DialogHeader className="nextage-card-gradient rounded-t-[12px] border-glass-border border-b px-6 py-5">
      <DialogTitle className="font-semibold text-foreground text-xl">Title</DialogTitle>
      <DialogDescription className="text-muted-foreground">Description</DialogDescription>
    </DialogHeader>

    {/* Body */}
    <div className="px-6 py-5">...</div>

    {/* Footer */}
    <div className="nextage-card-gradient flex justify-end gap-3 rounded-b-[12px] border-glass-border border-t px-6 py-5">
      <Button className="glass-action glass-action-slate">Cancel</Button>
      <Button className="glass-action glass-action-blue">Confirm</Button>
    </div>
  </DialogContent>
</Dialog>
```

- No custom X close buttons — use shadcn's built-in dialog close
- Cancel = `glass-action-slate`, Primary = `glass-action-blue`, Destructive = `glass-action-red`
- Use `ConfirmationDialog` (`components/ui/ConfirmationDialog.tsx`) for all destructive action confirmations

## Status Tokens

11 colors, each with text/bg/border variants that auto-switch light/dark:

```tsx
<span className="text-status-blue">Blue text</span>
<div className="bg-status-blue-bg">Blue background</div>
<div className="border border-status-blue-border">Blue border</div>
```

Colors: `blue`, `green`, `red`, `amber`, `emerald`, `purple`, `violet`, `indigo`, `orange`, `pink`, `cyan`

**Never use raw colors** like `text-red-600 dark:text-red-400`. Always use `text-status-red`.

## Form Inputs

```tsx
// Text inputs — use nextage variant
<Input variant="nextage" id="name" placeholder="Name" />

// Select triggers
<SelectTrigger className={NEXTAGE_INPUT_CLASS}>
  <SelectValue placeholder="Choose..." />
</SelectTrigger>

// Select dropdown
<SelectContent className="glass-dropdown rounded-[10px] p-2">
  <SelectItem value="a">Option A</SelectItem>
</SelectContent>

// Textarea
<Textarea className={NEXTAGE_TEXTAREA_CLASS} />
```

Form validation: `react-hook-form` + `zod`. Error text uses `text-status-red text-sm`.

## Key CSS Classes

| Class | Purpose |
|-------|---------|
| `nextage-hero-gradient` | Main page gradient background (apply once at `<main>` level) |
| `nextage-card-gradient` | Semi-transparent card bg (modal headers/footers, NOT top-level page cards) |
| `nextage-nav` | Fixed header with backdrop blur |
| `glass-card` | Opaque frosted card (tables, top-level cards, focus areas) |
| `glass-section` | Light frosted container (accordion items, outer wrappers) |
| `glass-inset` | Medium frosted area (groupings, inner containers) |
| `glass-dropdown` | Overlay frosted surface (modals, selects, popovers) |
| `glass-input` | Frosted form input with hover/focus states |
| `glass-action` | Base action button (always pair with `glass-action-{color}`) |
| `glass-tabs` | Tab list container |
| `glass-tab` | Individual tab trigger |
| `border-glass-border` | Adaptive border (slate-200/60 light, slate-700/60 dark) |
| `hover:bg-glass-row-hover` | Table/list row hover |
| `NEXTAGE_TABLE_CLASS` | Standard table container (import from shared constants) |

## Critical Rules

1. **No `dark:` overrides in application code** — all handled by composite CSS classes
2. **No raw Tailwind colors** — use semantic tokens (`text-foreground`, `text-status-blue`, etc.)
3. **Icon-only buttons MUST have tooltips**
4. **Use `ConfirmationDialog` for destructive actions** — never custom confirmation dialogs
5. **Never combine Button `variant` prop with `glass-action` classes**
6. **Never use `asChild` + `Link` inside tooltip triggers** — use `onClick` + `navigate()`
7. **Remove decorative gradient overlays** on glass containers — glass classes include their own effects
