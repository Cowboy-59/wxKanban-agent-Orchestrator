---
description: wxDesigner — read a scope/spec, design the screen it calls for using the project's existing theme tokens, preview it in the browser, iterate, then SAVE to a page.md carrying the design spec plus ready-to-use TSX. Designs; never writes app code itself.
args: "{{args}}"
ai-compat: universal
claude-code: true
cursor: true
blackboxai: true
---

# wxDesigner — Screen Designer

Turns a **scope or spec** into a **designed screen** you can look at and adjust before a single line of
app code is written. It reads the requirement, composes a layout from the project's **existing theme
tokens** (never invented colors), renders a self-contained HTML preview in your browser, and iterates
with you until you **SAVE** or **DISCARD**.

On **SAVE** it writes `specs/<NNN-name>/page.md` containing the design specification *and* the
ready-to-use TSX for the page. It does **not** write into `src/` — implementation goes through the
orchestrator so code fences are authored correctly.

This command runs the **`wxDesigner` skill**. Invoke the skill, then follow its workflow:

1. **Target** — take the **scope** number, read `specs/Project-Scope/NNN-*.md`, then follow its
   `Implemented By:` line to **every implementing spec** and read each `spec.md` / `plan.md` /
   `tasks.md`. Scope gives intent and boundaries; specs give the requirements. Identify the one screen
   being designed.
2. **Tokens** — read the live theme from `src/client/styles/index.css` (and the project's theme
   profile when the app is reachable). Design *within* that palette.
3. **Compose** — propose the screen: layout, hierarchy, shadcn components, states, breakpoints, each
   choice carrying one line of rationale.
4. **Preview** — write a self-contained preview `.html` to the scratchpad and open it. Light and dark.
5. **Iterate** — you adjust; the preview re-renders. Repeat until it's right.
6. **SAVE / DISCARD** — SAVE writes `specs/<NNN-name>/page.md`; DISCARD deletes the preview and leaves
   the repo untouched.

## Usage

```bash
/wxDesigner 106                       # SCOPE-106 + every spec that implements it
/wxDesigner 084 "plan comparison"     # a named screen within SCOPE-084
/wxDesigner specs/072-user-home       # start at a spec; walks back to its scope
```

A bare number is a **SCOPE** number (`SCOPE-NNN`), not a spec number — the two counters overlap.
With no argument, wxDesigner asks which scope; it will not guess.

## Boundaries

- **Designs, does not implement.** The TSX in `page.md` is a starting artifact for
  `wxkanban-agent implement <scope>/<task>`, which owns fencing. wxDesigner never edits `src/`.
- **Uses existing tokens.** New palette values are a *proposal* for Theme Studio, never a silent
  invention inside a page.
- **Bounded to the stated surface.** If the scope implies screens beyond the one asked for, name them
  and stop — do not design them unilaterally.

## Where it shows up

- **Dev Cockpit** — listed under **Standard** commands.
- Output lands in `specs/<NNN-name>/page.md`, alongside `spec.md` / `plan.md` / `tasks.md`.

## See also

- `/wxUIUXCodeReview` — the *post-build* advisory review. wxDesigner is prescriptive and runs first.
- Theme Studio (`/themes` in the app) — where theme tokens are authored; wxDesigner consumes them.

Full reference: `.claude/skills/wxDesigner/SKILL.md`.
