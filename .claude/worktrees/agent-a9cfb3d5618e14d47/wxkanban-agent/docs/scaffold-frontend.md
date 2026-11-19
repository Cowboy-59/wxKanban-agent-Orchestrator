# `scaffold:frontend` — Tailwind v4 + shadcn/ui consumer scaffold

**Spec**: [036-KitFrontendScaffolding](../../specs/036-KitFrontendScaffolding/spec.md)
**Available in**: every lifecycle stage (cross-cutting capability)

## What it does

Copies a working Tailwind v4 + shadcn/ui foundation into the consumer
project's standard `src/` layout so you can start building UI without
running `npx shadcn@latest init` and hand-authoring configs.

A single run on a fresh consumer project produces:

| Path | Purpose |
|---|---|
| `tailwind.config.ts` | Tailwind v4 config, dark mode via class. |
| `postcss.config.js` | v4 single-plugin PostCSS pipeline. |
| `components.json` | shadcn registry, TS, RSC off, slate base color. |
| `src/styles/globals.css` | `@import "tailwindcss"` + `@theme` tokens + CSS variables for light/dark. |
| `src/lib/utils.ts` | `cn()` helper on `clsx` + `tailwind-merge`. |
| `src/components/ui/button.tsx` | shadcn Button (default/destructive/outline/secondary/ghost/link, 4 sizes). |
| `src/components/ui/card.tsx` | shadcn Card family. |
| `src/components/ui/input.tsx` | shadcn Input. |
| `src/components/ui/label.tsx` | Radix Label wrapped. |
| `src/components/ui/dialog.tsx` | Radix Dialog wrapped. |
| `src/components/ui/dropdown-menu.tsx` | Radix DropdownMenu wrapped. |
| `src/components/ui/table.tsx` | shadcn Table family. |
| `src/components/ui/form.tsx` | react-hook-form + Radix integration. |
| `src/components/ui/select.tsx` | Radix Select wrapped. |
| `src/components/ui/toast.tsx` | Radix Toast + Toaster pattern. |
| `src/components/ui/calendar.tsx` | react-day-picker single-date picker. |
| `src/components/ui/resource-calendar.tsx` | Tailwind-styled `react-big-calendar` wrapper (no library CSS import). |
| `src/components/theme-provider.tsx` | React context for light/dark/system. |
| `src/components/mode-toggle.tsx` | Three-state dropdown using `<Sun/>`/`<Moon/>` icons. |

It also adds the required runtime + dev dependencies to your
`package.json` and prints `Run: npm install` — the command does **not**
run npm itself so your lockfile workflow stays in your control.

A note is appended to your `CLAUDE.md` describing where primitives live
and how to wire `<ThemeProvider>` + `<ModeToggle />` into your app root.

## Usage

```bash
wxkanban-agent scaffold:frontend [--dry-run] [--force] [--yes]
```

| Flag | Effect |
|---|---|
| (none) | Write missing files; skip existing; mutate `package.json` if deps missing. |
| `--dry-run` | Print preview table; no writes; no `package.json` mutation. Mutually exclusive with `--force`. |
| `--force` | Prompt to overwrite existing files; on confirmation, overwrite. Still updates deps. |
| `--yes` | Auto-answer `y` to the `--force` prompt. No effect without `--force`. |

### Exit codes

| Code | Meaning |
|---|---|
| `0` | Success or all-skipped. |
| `1` | Partial failure (some writes failed; already-written files are kept). |
| `2` | Consumer project root not detected. |
| `3` | Invalid flag combination (e.g., `--dry-run --force`). |

## Wiring dark mode in your app

```tsx
// src/main.tsx
import { ThemeProvider } from "@/components/theme-provider";
import "./styles/globals.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <ThemeProvider defaultTheme="system" storageKey="wxkanban-ui-theme">
    <App />
  </ThemeProvider>,
);
```

Drop `<ModeToggle />` into any header. The provider applies a `dark`
class on `<html>` and persists the choice in localStorage. `system` mode
tracks `prefers-color-scheme` reactively.

## Adding more shadcn primitives

The scaffold ships an opinionated starter set. To add anything not
listed above, use the official shadcn CLI:

```bash
npx shadcn@latest add accordion
```

shadcn will read `components.json` (created by this scaffold) and write
the new component in a style consistent with the kit's defaults.

## Re-running and idempotency

A second run on a fully scaffolded project is a no-op:

- Every template reports `skipped`.
- `package.json` is **not** mutated when all deps are already present.
- `CLAUDE.md` is **not** appended again (the marker comment prevents duplication).

The kit will not overwrite consumer-edited files unless you pass `--force`.

## Known limitations

- **Standard layout only.** This release assumes `src/components/`,
  `src/lib/`, `src/styles/`. Non-standard layouts (e.g., `src/client/`,
  monorepo workspaces) require post-edit. A `--src-root` flag is on the
  roadmap.
- **Hydration flash.** Without an inline no-flash script in `index.html`,
  dark-mode users see a brief light flash on first paint. A future spec
  will ship the inline script.
- **`--dry-run` cannot simulate npm.** The reported `package.json` delta
  reflects what the command would write — not what npm's lockfile
  resolution will ultimately install.
- **No `upgrade` subcommand yet.** Re-pulling templates after a kit
  version bump without losing consumer edits is future work.

## Spec cross-reference

- FR-001 through FR-015 — see [spec.md](../../specs/036-KitFrontendScaffolding/spec.md).
- Code fencing per [spec 026](../../specs/026-CodeFencing/spec.md).
- Consumer-root detection reuses [spec 027](../../specs/027-KitRuntimeHygiene/spec.md) patterns.
