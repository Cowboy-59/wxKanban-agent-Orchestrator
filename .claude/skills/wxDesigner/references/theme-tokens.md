# Theme token extraction

Design against the project's real palette. Never invent a hex.

## Two theme systems — know which one you are in

They are not interchangeable, and reaching for the wrong one produces a token that themes nothing.

| System | File | Governs | Fenced |
|---|---|---|---|
| **wxKanban's own UI** | `src/client/styles/index.css` | the app you are looking at — dashboards, admin, chrome | no |
| **Customer generated product** | `src/shared/theme-tokens.ts` | SCOPE-062 output, rendered to `theme.css` for the customer's app | yes, `[SCOPE 062 / T002]` |

The generated-product theme **never re-skins wxKanban**. If the screen you are designing is a
wxKanban screen, `index.css` is the only theme that matters; `ThemeTokenSet` is irrelevant to it.

## Source of truth, in priority order

1. **Live project theme** — when the app is running and the user names a profile.
   Routes: `src/server/routes/projectTheme.ts` (per-project), `src/server/routes/companyThemeProfiles.ts`
   (switchable company profiles), `src/server/routes/themeTemplates.ts` (named templates),
   `src/server/routes/themeBlocks.ts` (branded blocks).
2. **`src/client/styles/index.css`** — the committed shadcn token set. Always readable, always the
   fallback. Read `:root` for light and `.dark` for dark.

State which source you used. If you fell back, say the app wasn't reachable.

## The token set

Values are **HSL triples without the `hsl()` wrapper** — `222.2 47.4% 11.2%` — consumed as
`hsl(var(--primary))`. The `@theme` block at the top of `index.css` maps each to a Tailwind color.

| Token | Pairs with | Used for |
|---|---|---|
| `--background` | `--foreground` | page canvas |
| `--card` | `--card-foreground` | raised surfaces, panels, list rows |
| `--popover` | `--popover-foreground` | menus, dropdowns, tooltips |
| `--primary` | `--primary-foreground` | the one primary action per view |
| `--secondary` | `--secondary-foreground` | secondary actions, quiet chips |
| `--muted` | `--muted-foreground` | de-emphasized text, subdued fills |
| `--accent` | `--accent-foreground` | hover/selected states |
| `--destructive` | `--destructive-foreground` | delete, irreversible actions |
| `--border` | — | hairlines, dividers |
| `--input` | — | field borders |
| `--ring` | — | focus ring |
| `--radius` | — | corner radius (`0.5rem` baseline) |

## Committed fallback set

If both sources fail, use these — the values currently in `index.css`.

**Light (`:root`)**

```css
--background: 0 0% 100%;          --foreground: 222.2 84% 4.9%;
--card: 0 0% 100%;                --card-foreground: 222.2 84% 4.9%;
--popover: 0 0% 100%;             --popover-foreground: 222.2 84% 4.9%;
--primary: 222.2 47.4% 11.2%;     --primary-foreground: 210 40% 98%;
--secondary: 210 40% 96.1%;       --secondary-foreground: 222.2 47.4% 11.2%;
--muted: 210 40% 96.1%;           --muted-foreground: 215.4 16.3% 46.9%;
--accent: 210 40% 96.1%;          --accent-foreground: 222.2 47.4% 11.2%;
--destructive: 0 84.2% 60.2%;     --destructive-foreground: 210 40% 98%;
--border: 214.3 31.8% 91.4%;      --input: 214.3 31.8% 91.4%;
--ring: 222.2 84% 4.9%;           --radius: 0.5rem;
```

**Dark (`.dark`)**

```css
--background: 222.2 84% 4.9%;     --foreground: 210 40% 98%;
--card: 222.2 84% 4.9%;           --card-foreground: 210 40% 98%;
--popover: 222.2 84% 4.9%;        --popover-foreground: 210 40% 98%;
--primary: 210 40% 98%;           --primary-foreground: 222.2 47.4% 11.2%;
--secondary: 217.2 32.6% 17.5%;   --secondary-foreground: 210 40% 98%;
--muted: 217.2 32.6% 17.5%;       --muted-foreground: 215 20.2% 65.1%;
--accent: 217.2 32.6% 17.5%;      --accent-foreground: 210 40% 98%;
--destructive: 0 62.8% 30.6%;     --destructive-foreground: 210 40% 98%;
--border: 217.2 32.6% 17.5%;      --input: 217.2 32.6% 17.5%;
--ring: 212.7 26.8% 83.9%;
```

Read the file rather than trusting this table — it is a snapshot, and Theme Studio can change it.

## Rules

- **Always use the pair.** `bg-card` without `text-card-foreground` is how text goes invisible in one
  theme. Every surface declaration names both.
- **Both themes, every time.** Dark is not an afterthought; the preview ships a toggle so the user
  checks it.
- **`--destructive` is reserved** for irreversible actions. Not for warnings, not for red accents.
- **`--primary` is scarce.** One primary action per view; everything else is secondary or ghost.
- **Contrast is a constraint, not a preference.** Body text ≥ 4.5:1, UI/large text ≥ 3:1. When a token
  pair fails at a given size, say so and choose a different pair rather than shipping it.
- **A missing token is a proposal, and a saved proposal becomes real.** Name it, give it light and
  dark values, measure it — then promote it on SAVE. Never hardcode it into a page.

## Promoting a proposed token on SAVE

DISCARD drops proposals. SAVE promotes them, because a saved design whose palette lives only in a
deleted preview cannot be built as drawn.

### Path A — wxKanban's own theme (`src/client/styles/index.css`)

wxDesigner may write this on SAVE, after showing the diff and getting an explicit yes. CSS custom
properties are declarations, not fenced code units, so this does not bypass the orchestrator.

Three edits, all required:

```css
/* 1. :root — the light value */
--success: 142 71% 29%;
--success-foreground: 0 0% 100%;

/* 2. .dark — a chosen step for the dark surface, never an automatic flip */
--success: 142 60% 62%;
--success-foreground: 222.2 47.4% 11.2%;

/* 3. @theme inline — without this, Tailwind v4 emits ZERO CSS for bg-success et al. */
--color-success: hsl(var(--success));
--color-success-foreground: hsl(var(--success-foreground));
```

The third is the one that gets forgotten. A token in `:root` with no `@theme inline` mapping produces
a class that silently does nothing — no error, no style.

### Path B — the customer's generated-product theme (`src/shared/theme-tokens.ts`)

**Never edit this directly.** Adding one key touches four fenced sites that must move together:

1. the `ThemeTokenSet` interface — `success: HslTriplet;`
2. `TOKEN_CSS_VARS` — `success: "--success",`
3. `WXKANBAN_DEFAULT_THEME` — **both** the light and dark blocks
4. every entry in `THEME_PRESETS`

`renderThemeCss` iterates `THEME_TOKEN_KEYS`, which is derived from `TOKEN_CSS_VARS` — so a key added
to the interface but missing from a preset yields a partial theme at render time. Write it into
`page.md` as an orchestrator task listing all four sites, and let `implement` make the change.

### Changing an existing token

Not the same thing as adding one, and never automatic. State what it fixes, the measured before and
after, and everything else it touches — then stop. A contrast fix to `--destructive` is correct and
also reaches every delete button in the product; that tradeoff is the user's to accept.
