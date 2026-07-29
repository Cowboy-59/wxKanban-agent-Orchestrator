# Preview harness

The preview is what the user actually judges. It is a **single self-contained HTML file** in the
scratchpad — never in the repo.

## Location

```
<scratchpad>/wxdesigner/SCOPE-<NNN>-<screen-slug>.html
```

One file per screen. Overwrite it in place on each iteration so the user can keep the tab open and
hit refresh.

## Hard constraints

- **One file.** Inlined CSS, inlined JS. No CDN, no external stylesheet, no remote font, no image
  URL. It must render with the network off.
- **Real tokens.** The theme tokens from `theme-tokens.md` go in as CSS variables, `:root` and
  `.dark`. Style everything through them — no literal hex anywhere in the file.
- **Both themes.** A visible toggle, defaulting to the user's OS preference via
  `prefers-color-scheme`. The user checks dark before approving.
- **Realistic content.** Plausible names, dates, currency, and long strings — never `lorem ipsum`,
  never `foo`. Include at least one deliberately long value, because layout breaks on real data.
- **Responsive.** Fluid, so dragging the window shows the breakpoint behavior. Don't hardcode widths.
- **Fonts.** System stack only: `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`.
  If the design depends on a specific typeface, say so in `page.md` — don't fake it.

## Fidelity

This is a **design preview**, not a React port. Plain HTML and CSS that faithfully reproduces the
shadcn component's *appearance* is correct. Do not import React, do not pull in Tailwind, do not try
to run the real components. The TSX comes later, in `page.md`.

Interactivity: enough vanilla JS to demonstrate the design's behavior — the theme toggle, a state
switcher, an open/close on a dialog. Nothing more.

## State switcher

Real screens have four states and only one gets designed by default. Put a small control in the
harness bar that swaps between them so the user sees all four:

`loaded` · `loading` (skeletons) · `empty` (designed, with its call to action) · `error` (recoverable)

## Provenance label

The harness bar always says where the preview came from. On a reshow this matters more than anything
else in the bar: the user is looking at a **reconstruction**, and if they mistake it for the running
app they will report bugs against a file. Use exactly one of:

| Label | When |
|---|---|
| `new design` | greenfield — nothing existed before |
| `from page.md` | rebuilt from the saved design; the screen is not built yet |
| `from page.md · not the live app` | rebuilt from the saved design of a screen that **is** built |
| `reconstructed from src/` | derived from shipped code because no `page.md` existed |

On the drift path, add a second chip naming the count — `3 drifts` — linked to nothing, just a
reminder that the preview resolves disagreements the code hasn't yet.

## Verb hint — required

The harness bar must state the three words that drive the session:

```html
<span class="wxd-exit">SAVE / DISCARD / REFS → type in chat</span>
```

| Verb | Does |
|---|---|
| `SAVE` | write `page.md` and promote any proposed tokens (step 6) |
| `DISCARD` | delete the preview, leave the repo untouched (step 6) |
| `REFS` | search mobbin for prior art on this screen (step 3b) |

It is **text, not a button**, and deliberately so. The preview is a `file://` document with no server
behind it, so a button could not write `page.md` even if one existed — and `page.md` is composed
(design spec, TSX, token table), which only the skill can do. Styling it as a control would promise
an action the page cannot perform.

Without this line the only way to know these verbs exist is to have read the skill, which the user has
not. A preview that doesn't say how to steer it is unfinished.

## Starting template

```html
<!doctype html>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>SCOPE-NNN — Screen name</title>
<style>
  :root {
    --background: 0 0% 100%;      --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;            --card-foreground: 222.2 84% 4.9%;
    --primary: 222.2 47.4% 11.2%; --primary-foreground: 210 40% 98%;
    --muted: 210 40% 96.1%;       --muted-foreground: 215.4 16.3% 46.9%;
    --border: 214.3 31.8% 91.4%;  --ring: 222.2 84% 4.9%;
    --radius: 0.5rem;
    /* …the full set from theme-tokens.md… */
  }
  .dark {
    --background: 222.2 84% 4.9%; --foreground: 210 40% 98%;
    /* …the full dark set… */
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    background: hsl(var(--background));
    color: hsl(var(--foreground));
  }
  /* Harness chrome — visually distinct from the design, so it is never mistaken for it. */
  .wxd-bar {
    position: sticky; top: 0; z-index: 50;
    display: flex; gap: .75rem; align-items: center;
    padding: .5rem .75rem; font-size: .8125rem;
    background: hsl(var(--muted)); color: hsl(var(--muted-foreground));
    border-bottom: 1px solid hsl(var(--border));
  }
  .wxd-bar button {
    font: inherit; cursor: pointer;
    padding: .25rem .625rem; border-radius: calc(var(--radius) - 2px);
    border: 1px solid hsl(var(--border));
    background: hsl(var(--background)); color: hsl(var(--foreground));
  }
  .wxd-bar button[aria-pressed="true"] {
    background: hsl(var(--primary)); color: hsl(var(--primary-foreground));
    border-color: hsl(var(--primary));
  }
  /* Text, never a button — this page cannot perform the action it names. */
  .wxd-exit { margin-inline-start: auto; font-size: .6875rem; opacity: .85; }
  :focus-visible { outline: 2px solid hsl(var(--ring)); outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation: none !important; transition: none !important; }
  }
</style>

<div class="wxd-bar">
  <strong>SCOPE-NNN · Screen name</strong>
  <button id="theme" aria-pressed="false">Dark</button>
  <span>State:</span>
  <button data-state="loaded" aria-pressed="true">Loaded</button>
  <button data-state="loading" aria-pressed="false">Loading</button>
  <button data-state="empty" aria-pressed="false">Empty</button>
  <button data-state="error" aria-pressed="false">Error</button>
  <span class="wxd-exit">SAVE / DISCARD / REFS → type in chat</span>
</div>

<main id="screen"><!-- the design --></main>

<script>
  const root = document.documentElement;
  if (matchMedia('(prefers-color-scheme: dark)').matches) root.classList.add('dark');
  const t = document.getElementById('theme');
  t.setAttribute('aria-pressed', String(root.classList.contains('dark')));
  t.textContent = root.classList.contains('dark') ? 'Light' : 'Dark';
  t.onclick = () => {
    const dark = root.classList.toggle('dark');
    t.setAttribute('aria-pressed', String(dark));
    t.textContent = dark ? 'Light' : 'Dark';
  };
  document.querySelectorAll('[data-state]').forEach((b) => {
    b.onclick = () => {
      document.querySelectorAll('[data-state]').forEach((o) =>
        o.setAttribute('aria-pressed', String(o === b)));
      document.getElementById('screen').dataset.state = b.dataset.state;
    };
  });
</script>
```

## Opening it

Open the file in the user's browser. On Windows, `start "" "<path>"` from the Bash tool works; the
`run` skill's browser tooling is the alternative when the app itself needs to be running.

If it can't be opened automatically, print the absolute path and say so plainly — don't pretend it
was shown.

## After opening

Don't just say "here it is." Name the **two or three decisions** you most want a verdict on — the
ones where you made a judgment call the spec didn't settle. That is what turns a preview into a
review.
