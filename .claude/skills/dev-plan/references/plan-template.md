# Dev-plan output template & conventions

The skill writes `specs/DEVELOPMENT-PLAN.md` to this skeleton. Keep the section order — the
PDF renderer and the "read me first on re-entry" purpose both depend on it being front-loaded.

## Status vocabulary (use everywhere)

| Marker | Emoji | Mermaid classDef | Meaning |
|--------|-------|------------------|---------|
| `[x]`  | 🟢 | `done`     | built & verified |
| `[~]`  | 🟡 | `partial`  | in progress / partially built |
| `[ ]`  | 🔴 | `todo`     | not started (scoped) |
| `[ ]`  | ⚪ | `unscoped` | not yet scoped — needs buildscope/createspecs first |

## Mermaid classDef block (paste verbatim, then style each node)

```
flowchart TD
  classDef done fill:#2ecc71,stroke:#1e8449,color:#0b3d20
  classDef partial fill:#f1c40f,stroke:#b7950b,color:#3a2f00
  classDef todo fill:#e74c3c,stroke:#922b21,color:#fff
  classDef unscoped fill:#95a5a6,stroke:#5d6d7e,color:#fff,stroke-dasharray:4 3
```

Diagram rules that keep it renderable:
- One `subgraph P0[Phase 0 - Foundation] ... end` per phase. **Avoid `·`, `&`, parentheses, and
  `/` inside `subgraph` titles and node labels** — use ` - ` and " and " instead (they break the
  mermaid parser in some versions). Node labels: short id + short title, e.g. `S011[011 Auth and AuthZ]`.
- Apply a class to every node: `S005[005 AI Chat Panel]:::todo`.
- An arrow `A --> B` means **B depends on A** (build A first). Fan-out with `&`:
  `S003 --> S001 & S011 & S017`.

## Document skeleton

```markdown
# <Project> — Development Plan

**Last Updated:** <date> · **Phase:** <lifecycle phase> · **Snapshot date:** <source date>

> **This file is the editable source of truth.** Change any step, then run
> `<skill path>/scripts/build-devplan-pdf.mjs` to regenerate the PDF. Flip a step's
> status by changing its marker: `[ ]` not started · `[~]` in progress · `[x]` done.
> The always-current truth lives in the project's status dashboard / memory — this is a snapshot.

---

## ▶ START HERE
- **Where I am:** <current phase, one line>
- **What's deployed:** <what is live vs not>
- **Single next action:** <the one next thing>
- **Nearest blocker:** <the closest thing in the way, e.g. an unscoped spec on the path>

---

## Status at a glance
<table: Spec | Title | State (emoji + %) | Remaining (high-level)>

Legend: 🟢 built · 🟡 partial · 🔴 not started · ⚪ not scoped.

---

## Dependency map
<one-line how-to-read, then the ```mermaid flowchart grouped into phase subgraphs>

**Critical path — the specs that unblock the most:** <2–4 bullets>

---

## Phase 0 … N
Per phase: a one-line intent, a checkbox list of its specs/steps (status marker + short remaining),
and an **Exit gate:** line (what "done enough to move on" means).

---

## How to regenerate the PDF
`node <skill path>/scripts/build-devplan-pdf.mjs`  → writes `specs/DEVELOPMENT-PLAN.pdf`.
```

## Phasing heuristic (foundation-up)

Order phases so each only depends on earlier ones. A reliable default:
1. **Foundation** — identity/auth, transport (realtime), core data/message bus.
2. **The shippable slice** — whatever set of mostly-built features can go live first (mark it LAUNCH).
3. **Differentiator layer** — the interdependent feature cluster that defines the product.
4. **Security/compliance**, then **packaging/delivery** (mobile, notifications), then **ops/extras**.

Derive the actual grouping from the project's specs and their dependency edges — do not hard-code.
Surface (don't silently drop) any spec referenced as a dependency that has no spec doc yet: mark it
`unscoped` (grey, dashed) and call it out as a blocker if it sits on the launch path.
