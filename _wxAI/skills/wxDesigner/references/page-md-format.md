# `page.md` — the SAVE artifact

Written **only** on SAVE, to `specs/<NNN-name>/page.md`, alongside `spec.md` / `plan.md` / `tasks.md`.

If the scope fans out to several specs, write into the spec folder that owns this screen. If the
scope has no implementing spec yet, write to `specs/Project-Scope/NNN-<name>.page.md` and say so —
the design still needs somewhere to live.

## Rules

- **Never write into `src/`.** The TSX below is an artifact for the orchestrator, not a component
  drop. `wxkanban-agent implement <scope>/<task>` puts it in `src/` with the authorship fence.
- **No fence comments.** Do not hand-author `// [SCOPE NNN / TNNN] BEGIN` lines. Fences are written
  by the orchestrator only; hand-written ones corrupt authorship tracking.
- **One file per screen.** A second screen is a second design pass and a second `page.md`.
- **Overwrite deliberately.** If `page.md` exists, this is an **edit of an approved design**. Show the
  user a section-by-section diff and get an explicit yes before writing. Append to **Revision
  history** rather than replacing it, and keep superseded rationale wherever it still explains
  something — delete only what is now wrong.

## Required sections

````markdown
# <Screen name> — design

**Scope**: SCOPE-NNN — <one line of intent>
**Specs**: SPEC-NNN (<what it contributes>), SPEC-NNN (…)
**Route**: `/path` · **Audience**: <who> · **Status**: <one of the values below>
**Theme source**: <live profile "name" | src/client/styles/index.css>

`Status` is the honest state of the design against the code, and it is the first thing a reader needs:

| Status | Means |
|---|---|
| `designed — not implemented` | the design exists, no code yet |
| `implemented — matches code` | built, and the drift check found no meaningful divergence |
| `redesigned — code not yet updated` | the design is **ahead** of the code; a change is outstanding |
| `corrected to match code` | the code was right, the design was stale, and this file was fixed to match |
| `reconstructed from code` | the screen was built with no saved design; this file was derived from the shipped component |

## Purpose

Two or three sentences: what the user comes here to do, and what "done" looks like for them.

## Layout

The grid and its regions, and one line on why that division serves the purpose.

## Hierarchy

What the eye hits first, second, third. Which element carries the single primary action.

## Components

| Region | shadcn component | Variant | Why |
|---|---|---|---|
| … | `Card` | — | … |

## Tokens

Which theme tokens each surface uses, as pairs (`bg-card` / `text-card-foreground`).

### Tokens added to the theme

Every token this design introduced, with its measured contrast and where it was promoted. Empty when
the design used only existing tokens.

| Token | Light | Dark | Contrast | Promoted to |
|---|---|---|---|---|
| `--success` | `142 71% 29%` | `142 60% 62%` | 5.11:1 / 10.01:1 | `index.css` — `:root`, `.dark`, `@theme inline` |

For a generated-product token, write **orchestrator task** instead of a file, and list all four sites
it must touch (`ThemeTokenSet`, `TOKEN_CSS_VARS`, `WXKANBAN_DEFAULT_THEME` light + dark,
`THEME_PRESETS`).

### Existing tokens this design would change

Separate from additions, because changing a token reaches the whole app. Give the before, the after,
the measurement that justifies it, and the blast radius. Leave it as a recommendation — never applied
without the user saying so.

## States

- **Loading** — …
- **Empty** — the designed empty state and its call to action, not a blank panel.
- **Error** — what the user sees and how they recover.
- **Success** — the confirmation, and where focus lands.

## Responsive

Behavior per breakpoint: what reflows, wraps, truncates, or collapses, and what must never wrap.

## Accessibility

Heading order, focus order, labeled inputs, `aria-live` for async, contrast pairs and the ratios they
clear, keyboard path through every action. Note anything that needs a live audit to confirm.

## Motion

Only where it clarifies. Duration, easing, and the `prefers-reduced-motion` fallback. "None" is a
valid and often correct answer.

## Data contract

What the screen needs from the API — the shape, not the implementation. Flag anything the spec does
not yet provide; that's a gap for the implementing task, and naming it here is the point.

## Implementation notes

Anything the implementer needs that the code doesn't say: ordering assumptions, i18n keys required,
permission boundaries, why a component was chosen over the obvious one.

## References

External prior art that informed the design, and the principle taken from each — not the look copied.
Omit the section entirely when the design borrowed nothing.

| Source | Principle borrowed | How it was translated here |
|---|---|---|
| [Linear — project settings](https://mobbin.com/...) | progressive disclosure: advanced options behind one toggle | `Collapsible` under the primary form, closed by default |

## Drift from implementation

Present only when the screen is already built. What the shipped component does differently from this
design, and which side was judged right. This is the record of a decision, so it survives the SAVE
that resolves it.

| Aspect | This design says | `src/` has | Resolution |
|---|---|---|---|
| Filter row | inline segmented control | `Select` dropdown | code wins — scales past four filters; design updated |

## Component

```tsx
// Design artifact for SCOPE-NNN — implement via `wxkanban-agent implement <scope>/<task>`.
// Not fenced: the orchestrator writes the authorship fence when this lands in src/.

export function ScreenName() {
  return (
    // …
  );
}
```

## Open questions

Anything the design assumes because the scope or specs didn't settle it. Empty is fine; inventing an
answer silently is not.

## Revision history

Newest first. One line per design pass — never rewritten, only appended. On a first write this holds
a single row.

| Date | Change | Why |
|---|---|---|
| 2026-07-29 | filter row → `Select`; empty state CTA restored | drift check: code won on filters, design won on the empty state |
| 2026-07-12 | initial design | SCOPE-NNN |
````

## TSX quality bar

The code is a real starting point, not pseudocode:

- **TypeScript, no `any`, no `@ts-ignore`** — repo rule, and it applies to the artifact.
- **Real shadcn imports** — `@/components/ui/...`, matching how the repo imports them.
- **Tokens via Tailwind classes** — `bg-card text-card-foreground`, never `style={{ color: '#fff' }}`.
- **Strings through i18n** where the repo localizes; otherwise leave a marked TODO naming the catalog.
- **All four states rendered**, not just the happy path.
- **Props typed**, data-fetching left as a clearly marked seam — wxDesigner designs the screen, not
  the query layer.
- **No `console.log`** — repo uses Pino.

## After writing

Report:

1. The exact absolute path written.
2. The next command: `wxkanban-agent implement <scope>/<task>`.
3. Anything left open, from the Open questions section.

Do **not** run git. Committing is the user's call.
