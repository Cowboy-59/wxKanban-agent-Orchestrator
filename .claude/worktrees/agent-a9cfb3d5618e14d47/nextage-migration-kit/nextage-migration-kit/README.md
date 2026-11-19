# NextAge Styling Migration Kit

Hand this entire folder to your AI assistant. Everything needed is self-contained here.

## What's In This Kit

```
nextage-migration-kit/
├── README.md                          ← YOU ARE HERE (start here)
├── skills/
│   ├── shadcn/                        ← New shadcn skill (replaces old MCP server + rule)
│   │   ├── SKILL.md                   ← Main skill (auto-triggers on shadcn work)
│   │   ├── cli.md                     ← Full CLI reference
│   │   ├── customization.md           ← Theming and CSS variables
│   │   └── rules/
│   │       ├── styling.md             ← Tailwind + styling rules
│   │       ├── forms.md               ← Form layout and validation
│   │       ├── composition.md         ← Component structure rules
│   │       ├── icons.md               ← Icon usage rules
│   │       └── base-vs-radix.md       ← asChild vs render patterns
│   └── nextage-ui-patterns/           ← Updated NextAge design system skill
│       ├── SKILL.md                   ← Glass morphism, buttons, modals, status tokens
│       └── README.md                  ← Quick reference
└── css-tokens/                        ← (see Part 3 below — add to your index.css)
```

---

## Part 1: Replace Old shadcn MCP Server + Rule

### Step 1: Remove the Old Stuff

1. **Delete the shadcn MCP server** from your Claude Code settings. Look in `.claude/settings.json` or MCP config for entries like:
   ```json
   "shadcn-ui": {
     "command": "npx",
     "args": ["-y", "@anthropic-ai/shadcn-mcp-server"]
   }
   ```
   Remove the entire entry.

2. **Delete the old shadcn rule file** — typically `.claude/rules/shadcn.md`. This flat markdown file is replaced by the skill.

### Step 2: Install the New shadcn Skill

Copy the `skills/shadcn/` folder from this kit into your project:

```bash
cp -r skills/shadcn/ YOUR_PROJECT/.claude/skills/shadcn/
```

### Step 3: Verify

Your AI should now be able to run:
```bash
npx shadcn@latest info --json    # Project config + installed components
npx shadcn@latest docs button    # Doc URLs for any component
npx shadcn@latest search -q "sidebar"  # Search registries
```

### What Changed: MCP Server vs Skill

| Old (MCP Server) | New (Skill) |
|---|---|
| Ran as separate process | Built into Claude Code skill system |
| Used MCP tool calls | Uses `npx shadcn@latest` CLI directly |
| Limited context | Full project context via `npx shadcn@latest info --json` |
| No docs lookup | `npx shadcn@latest docs <component>` for live docs |
| No search | `npx shadcn@latest search` across registries |
| No diff/update workflow | `--dry-run` and `--diff` for smart component updates |

---

## Part 2: Install Updated NextAge UI Patterns Skill

### Step 1: Delete the Old Skill

```bash
rm -rf YOUR_PROJECT/.claude/skills/nextage-ui-patterns/
```

The old version had large, outdated reference files. All gone.

### Step 2: Install the New Skill

```bash
cp -r skills/nextage-ui-patterns/ YOUR_PROJECT/.claude/skills/nextage-ui-patterns/
```

That's it. The new skill is ~180 lines covering everything the AI needs.

---

## Part 3: Add the Design Token System to Your CSS

Add the following to your project's main CSS file (index.css or globals.css). If you already have some of these, replace them. The complete system consists of:
1. Foundation tokens (spacing, radius)
2. Status color tokens (11 colors × 4 variants each, light + dark)
3. Glass morphism tokens
4. Tailwind `@theme inline` mapping

### 3A: Foundation Tokens (add to `:root`)

```css
:root {
  /* Spacing Scale */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 32px;
  --space-2xl: 48px;
  --space-3xl: 64px;
  --space-4xl: 96px;

  /* Border Radius Scale */
  --radius-xs: 2px;
  --radius-sm: 6px;   /* Buttons, inputs */
  --radius-md: 10px;  /* Cards, panels */
  --radius-lg: 14px;  /* Modals, containers */
  --radius-xl: 18px;  /* Hero sections */
  --radius-full: 9999px;

  /* Component-Specific Tokens */
  --btn-radius: var(--radius-sm);
  --card-radius: var(--radius-md);
  --input-radius: var(--radius-sm);
  --modal-radius: var(--radius-lg);
  --card-padding: var(--space-lg);
  --form-field-gap: var(--space-lg);

  /* Touch Targets (WCAG) */
  --touch-target-min: 48px;
  --touch-target-large: 56px;
  --touch-target-spacing: 8px;
}
```

### 3B: Status Color Tokens — Light Mode (add to `:root`)

```css
:root {
  /* Blue — links, actions, info */
  --status-blue: var(--color-blue-700);
  --status-blue-hover: var(--color-blue-800);
  --status-blue-bg: var(--color-blue-50);
  --status-blue-border: oklch(88.2% 0.059 254.128 / 60%);

  /* Green — success, active, online */
  --status-green: var(--color-green-700);
  --status-green-hover: var(--color-green-800);
  --status-green-bg: var(--color-green-50);
  --status-green-border: oklch(92.5% 0.084 155.995 / 60%);

  /* Red — error, delete, danger */
  --status-red: var(--color-red-700);
  --status-red-hover: var(--color-red-800);
  --status-red-bg: var(--color-red-50);
  --status-red-border: oklch(88.5% 0.062 18.334 / 60%);

  /* Amber — warning, pending */
  --status-amber: var(--color-amber-700);
  --status-amber-hover: var(--color-amber-800);
  --status-amber-bg: var(--color-amber-50);
  --status-amber-border: oklch(92.4% 0.12 95.746 / 60%);

  /* Emerald — verified, success variant */
  --status-emerald: var(--color-emerald-700);
  --status-emerald-bg: var(--color-emerald-50);
  --status-emerald-border: oklch(90.5% 0.093 164.15 / 60%);

  /* Purple — special, premium */
  --status-purple: var(--color-purple-700);
  --status-purple-bg: var(--color-purple-50);
  --status-purple-border: oklch(90.2% 0.063 306.703 / 60%);

  /* Violet */
  --status-violet: var(--color-violet-700);
  --status-violet-bg: var(--color-violet-50);
  --status-violet-border: oklch(89.4% 0.057 293.283 / 60%);

  /* Indigo */
  --status-indigo: var(--color-indigo-700);
  --status-indigo-bg: var(--color-indigo-50);
  --status-indigo-border: oklch(87% 0.065 274.039 / 60%);

  /* Orange */
  --status-orange: var(--color-orange-700);
  --status-orange-bg: var(--color-orange-50);
  --status-orange-border: oklch(90.1% 0.076 70.697 / 60%);

  /* Pink */
  --status-pink: var(--color-pink-700);
  --status-pink-bg: var(--color-pink-50);
  --status-pink-border: oklch(90.5% 0.057 0.153 / 60%);

  /* Cyan */
  --status-cyan: var(--color-cyan-700);
  --status-cyan-bg: var(--color-cyan-50);
  --status-cyan-border: oklch(90.5% 0.058 194.769 / 60%);

  /* Glass morphism — Light Mode */
  --glass-border: oklch(92.9% 0.013 255.508 / 60%);
  --glass-border-hover: oklch(86.9% 0.022 252.894 / 80%);
  --glass-bg: oklch(100% 0 0 / 80%);
  --glass-bg-hover: oklch(100% 0 0 / 90%);
  --glass-row-hover: oklch(96.8% 0.007 247.896 / 50%);
  --glass-row-border: oklch(92.9% 0.013 255.508 / 60%);
}
```

### 3C: Status Color Tokens — Dark Mode (add to `.dark`)

```css
.dark {
  --status-blue: var(--color-blue-300);
  --status-blue-hover: var(--color-blue-200);
  --status-blue-bg: oklch(37.9% 0.146 265.522 / 30%);
  --status-blue-border: oklch(48.8% 0.243 264.376 / 40%);

  --status-green: var(--color-green-300);
  --status-green-hover: var(--color-green-200);
  --status-green-bg: oklch(39.3% 0.095 152.535 / 30%);
  --status-green-border: oklch(52.7% 0.154 150.069 / 40%);

  /* IMPORTANT: red uses 400, NOT 300. red-300 looks pink in dark mode. */
  --status-red: var(--color-red-400);
  --status-red-hover: var(--color-red-200);
  --status-red-bg: oklch(39.6% 0.141 25.723 / 30%);
  --status-red-border: oklch(50.5% 0.213 27.518 / 40%);

  --status-amber: var(--color-amber-300);
  --status-amber-hover: var(--color-amber-200);
  --status-amber-bg: oklch(41.4% 0.112 45.904 / 30%);
  --status-amber-border: oklch(55.5% 0.163 48.998 / 40%);

  --status-emerald: var(--color-emerald-300);
  --status-emerald-bg: oklch(37.8% 0.077 168.94 / 30%);
  --status-emerald-border: oklch(50.8% 0.118 165.612 / 40%);

  --status-purple: var(--color-purple-300);
  --status-purple-bg: oklch(38.1% 0.176 304.987 / 30%);
  --status-purple-border: oklch(49.6% 0.265 301.924 / 40%);

  --status-violet: var(--color-violet-300);
  --status-violet-bg: oklch(38% 0.189 293.745 / 30%);
  --status-violet-border: oklch(49.1% 0.27 292.581 / 40%);

  --status-indigo: var(--color-indigo-300);
  --status-indigo-bg: oklch(35.9% 0.144 278.697 / 30%);
  --status-indigo-border: oklch(45.7% 0.24 277.023 / 40%);

  --status-orange: var(--color-orange-300);
  --status-orange-bg: oklch(40.8% 0.123 38.172 / 30%);
  --status-orange-border: oklch(55.3% 0.195 38.402 / 40%);

  --status-pink: var(--color-pink-300);
  --status-pink-bg: oklch(40.6% 0.143 0.334 / 30%);
  --status-pink-border: oklch(55.7% 0.215 359.112 / 40%);

  --status-cyan: var(--color-cyan-300);
  --status-cyan-bg: oklch(38.5% 0.063 188.416 / 30%);
  --status-cyan-border: oklch(52% 0.105 192.776 / 40%);

  /* Glass morphism — Dark Mode */
  --glass-border: oklch(37.2% 0.044 257.287 / 60%);
  --glass-border-hover: oklch(37.2% 0.044 257.287 / 80%);
  --glass-bg: oklch(27.9% 0.041 260.031 / 80%);
  --glass-bg-hover: oklch(27.9% 0.041 260.031 / 90%);
  --glass-row-hover: oklch(37.2% 0.044 257.287 / 30%);
  --glass-row-border: oklch(37.2% 0.044 257.287 / 40%);
}
```

### 3D: Tailwind `@theme inline` Mapping

This maps CSS variables to Tailwind so classes like `text-status-blue`, `bg-status-red-bg`, `border-glass-border` work:

```css
@theme inline {
  --color-status-blue: var(--status-blue);
  --color-status-blue-hover: var(--status-blue-hover);
  --color-status-blue-bg: var(--status-blue-bg);
  --color-status-blue-border: var(--status-blue-border);

  --color-status-green: var(--status-green);
  --color-status-green-hover: var(--status-green-hover);
  --color-status-green-bg: var(--status-green-bg);
  --color-status-green-border: var(--status-green-border);

  --color-status-red: var(--status-red);
  --color-status-red-hover: var(--status-red-hover);
  --color-status-red-bg: var(--status-red-bg);
  --color-status-red-border: var(--status-red-border);

  --color-status-amber: var(--status-amber);
  --color-status-amber-hover: var(--status-amber-hover);
  --color-status-amber-bg: var(--status-amber-bg);
  --color-status-amber-border: var(--status-amber-border);

  --color-status-emerald: var(--status-emerald);
  --color-status-emerald-bg: var(--status-emerald-bg);
  --color-status-emerald-border: var(--status-emerald-border);

  --color-status-purple: var(--status-purple);
  --color-status-purple-bg: var(--status-purple-bg);
  --color-status-purple-border: var(--status-purple-border);

  --color-status-violet: var(--status-violet);
  --color-status-violet-bg: var(--status-violet-bg);
  --color-status-violet-border: var(--status-violet-border);

  --color-status-indigo: var(--status-indigo);
  --color-status-indigo-bg: var(--status-indigo-bg);
  --color-status-indigo-border: var(--status-indigo-border);

  --color-status-orange: var(--status-orange);
  --color-status-orange-bg: var(--status-orange-bg);
  --color-status-orange-border: var(--status-orange-border);

  --color-status-pink: var(--status-pink);
  --color-status-pink-bg: var(--status-pink-bg);
  --color-status-pink-border: var(--status-pink-border);

  --color-status-cyan: var(--status-cyan);
  --color-status-cyan-bg: var(--status-cyan-bg);
  --color-status-cyan-border: var(--status-cyan-border);

  --color-glass-border: var(--glass-border);
  --color-glass-border-hover: var(--glass-border-hover);
  --color-glass-bg: var(--glass-bg);
  --color-glass-bg-hover: var(--glass-bg-hover);
  --color-glass-row-hover: var(--glass-row-hover);
  --color-glass-row-border: var(--glass-row-border);
}
```

### 3E: Glass Utility Classes

Add these to your CSS file inside `@layer base` or as plain CSS (after the `@theme inline` block). These are the composite glass morphism classes that the skill references:

**Note**: These are extensive (~300 lines). Your AI should read the glass classes from the reference project's `index.css` if you have access to it, or you can copy them from the NextAge Designs project. The key classes are:

- `.glass-card` — Opaque frosted card with gradient, border, shadow
- `.glass-section` — Lighter frosted container
- `.glass-inset` — Medium frosted area
- `.glass-dropdown` — Overlay frosted surface (highest opacity)
- `.glass-input` — Frosted form input with hover/focus states
- `.glass-action` + `.glass-action-{color}` — 9 color action button variants
- `.glass-tabs` / `.glass-tab` — Tab container and trigger styling
- `.nextage-card-gradient` — Semi-transparent gradient for modal headers/footers
- `.nextage-hero-gradient` — Main page background gradient

Each class has both light and dark mode definitions (`.dark .glass-card { ... }`).

Ask Pete for the full `index.css` if you need the exact glass class implementations.

---

## Part 4: Cleanup Checklist

### Phase 1: Audit

Run these searches:

```bash
# Raw Tailwind colors (should be status tokens)
rg "text-red-|text-blue-|text-green-|text-amber-|bg-red-|bg-blue-|bg-green-" --glob "*.tsx" -l

# Manual dark mode overrides
rg "dark:text-|dark:bg-|dark:border-" --glob "*.tsx" -l

# Old button classes
rg "nextage-btn-primary|nextage-btn-secondary" --glob "*.tsx" -l

# text-destructive in application code
rg "text-destructive" --glob "*.tsx" -l

# Old semantic tokens
rg "text-error-|text-success-|text-warning-|text-info-" --glob "*.tsx" -l

# space-y / space-x (should be flex + gap)
rg "space-y-|space-x-" --glob "*.tsx" -l
```

### Phase 2: Categorize `text-destructive`

| Category | Action |
|----------|--------|
| **UI primitives** (button.tsx, badge.tsx, alert.tsx, input.tsx, form.tsx, dropdown-menu.tsx, radio-group.tsx) | **LEAVE ALONE** — shadcn built-in |
| **Badge/Alert `variant="destructive"`** | **LEAVE ALONE** — shadcn variant prop |
| **Required field asterisks** (`text-destructive">*`) | → `text-status-red` |
| **Error messages** (on `<p>`, `<div>`, `<span>`) | → `text-status-red` |
| **Error backgrounds** (`bg-destructive/10`) | → `bg-status-red-bg` |
| **Error borders** (`border-destructive/20`) | → `border-status-red-border` |
| **Hover states** (`hover:bg-destructive/10`) | → `hover:bg-status-red-bg` |
| **Focus rings** (`focus:ring-destructive/20`) | → `focus:ring-red-500/20` |

### Phase 3: Button Migration

| Old | New |
|-----|-----|
| `variant="destructive"` on standalone Button | `className="glass-action glass-action-red"` (drop variant) |
| `variant="outline"` on action buttons | `className="glass-action glass-action-slate"` |
| `variant="default"` on primary actions | `className="glass-action glass-action-blue"` |
| `nextage-btn-primary` | `className="glass-action glass-action-blue"` |
| `nextage-btn-secondary` | `className="glass-action glass-action-slate"` |

**Keep**: `variant="ghost"` for table icon buttons, `variant="link"` for text links.

### Phase 4: Modal Migration

Every Dialog should follow the standard pattern (see `skills/nextage-ui-patterns/SKILL.md` for the template).

### Phase 5: Dead CSS Cleanup

After migrating, verify no code references old classes, then delete them from CSS.

---

## Part 5: Gotchas (Hard-Won Lessons)

### 1. Dark Mode `status-red` — Use red-400, NOT red-300
Tailwind `red-300` looks PINK in dark mode. All other status colors use `{color}-300`. Red is the exception: it uses `red-400`.

### 2. Never Mix `variant` Prop with `glass-action` Classes
Variant styles override glass-action styles. Drop the variant prop entirely.

### 3. Don't Touch shadcn UI Primitives
`button.tsx`, `badge.tsx`, `alert.tsx`, etc. use `destructive` as part of shadcn's variant system. Leave those alone. Only migrate `text-destructive` in application code.

### 4. `asChild` + `Link` Inside Tooltip Triggers Breaks Silently
Use `onClick` + `navigate()` instead. No error, tooltip just stops working.

### 5. Always Verify in Dark Mode
Light mode usually looks fine. Dark mode is where pink-instead-of-red, contrast issues, and invisible borders hide.

### 6. Modal Headers/Footers = `nextage-card-gradient`, NOT Glass Classes
`nextage-card-gradient` is semi-transparent — it lets the dialog's frosted glass show through.

### 7. `bg-destructive/10` → `bg-status-red-bg` (Not a Ratio)
Status `-bg` and `-border` tokens are pre-computed with correct opacity for each mode. Don't try to replicate `/10` or `/20` patterns.

### 8. Don't Create New `dark:` Overrides
If you're writing `dark:text-red-400`, use `text-status-red` instead. The only place `dark:` belongs is in CSS token definitions and shadcn UI primitives.

---

## Quick Reference

```
BUTTONS:
  Primary action    → glass-action glass-action-blue
  Secondary/Cancel  → glass-action glass-action-slate
  Destructive       → glass-action glass-action-red
  Table icon button → variant="ghost" + status hover colors + tooltip
  Text link button  → variant="link" (shadcn built-in)

COLORS:
  Error text/icon   → text-status-red
  Error background  → bg-status-red-bg
  Error border      → border-status-red-border
  Success           → text-status-green / bg-status-green-bg
  Warning           → text-status-amber / bg-status-amber-bg
  Info              → text-status-blue / bg-status-blue-bg
  (11 colors: blue green red amber emerald purple violet indigo orange pink cyan)

GLASS HIERARCHY (lightest → darkest):
  glass-section → glass-inset → glass-card → glass-dropdown

MODAL PATTERN:
  DialogContent   → glass-dropdown gap-0 rounded-[12px] p-0
  Header/Footer   → nextage-card-gradient + border-glass-border border-b/t
  Body            → px-6 py-5
  Cancel button   → glass-action glass-action-slate
  Primary button  → glass-action glass-action-blue

FORMS:
  Input           → variant="nextage"
  SelectTrigger   → className={NEXTAGE_INPUT_CLASS}
  SelectContent   → glass-dropdown rounded-[10px] p-2
  Textarea        → className={NEXTAGE_TEXTAREA_CLASS}
  Error text      → text-status-red text-sm
  Required *      → text-status-red
```
