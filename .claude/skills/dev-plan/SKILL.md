---
name: dev-plan
description: Generate a foundation-up development plan for the whole project — a single editable specs/DEVELOPMENT-PLAN.md with a "START HERE" re-entry block, a per-spec status table, a color-coded Mermaid dependency map, and phased build order with exit gates — then render it to PDF. Use when asked for a development plan, a build roadmap, a "where am I / what do I build next" overview, a phase plan, or a printable/PDF plan of the project's specs.
---

# Dev Plan

## Overview

Produces the artifact a developer reads *first* when returning to a project they've been away
from: one page that answers "where am I, what's built, what do I build next, and what's in the
way." It groups the project's specs into foundation-up phases, draws the dependency graph as a
color-coded Mermaid diagram, and renders the whole thing to a print-ready PDF.

Two halves, like `scope-flow-map`: **judgment** (read the specs, assess build state, derive the
phasing and dependency edges) and a **deterministic script** (render the Markdown + diagram to PDF).
The Markdown is the editable source of truth — re-running the script after any edit refreshes the PDF.

This is a planning/orientation cartographer. It does **not** edit specs, change code, run the
orchestrator, or assign audit severities.

## Workflow

### 1. Gather build state (judgment)

Determine, per spec, its **state** and **what remains**:
- Read each `specs/###-*/spec.md` for what the feature is and its **explicit** dependencies
  ("depends on", "requires", references to other spec numbers).
- Read each `specs/###-*/tasks.md` if present; count checked vs unchecked tasks for a rough %.
- Consult the project's status dashboard / memory and recent git history for what's actually
  built vs deferred (specs often run ahead of or behind their task files).
- Classify each spec: 🟢 built · 🟡 partial · 🔴 not started (scoped) · ⚪ not yet scoped.

Prefer launching parallel read-only explorers for large spec sets; you only need the conclusions.

### 2. Derive the dependency graph and phases (judgment)

- Build the edge list from explicit dependencies, plus implicit ones the prose implies (a shared
  table, a service one spec produces and another consumes, a UI surface that mounts another's
  feature). Every edge must trace to evidence — do not invent dependencies.
- Group specs into **foundation-up phases** using the heuristic in `references/plan-template.md`
  (foundation → shippable slice → differentiator cluster → security → packaging → ops). Derive the
  grouping from this project's actual edges; do not hard-code another project's phases.
- Identify the **critical path**: the few specs that unblock the most, and any spec referenced as a
  dependency that has **no spec doc yet** (mark `unscoped`; flag it as a blocker if it's on the
  launch path).

### 3. Write `specs/DEVELOPMENT-PLAN.md`

Follow the skeleton and the status/Mermaid conventions in **`references/plan-template.md`** exactly
(section order is load-bearing). The file must contain, front-loaded: the `▶ START HERE` block, the
status-at-a-glance table, the `mermaid` dependency map (phase subgraphs, status-colored nodes), the
per-phase sections with editable `[ ]/[~]/[x]` step lists and an **Exit gate** each, and a
"How to regenerate the PDF" footer. Heed the diagram syntax cautions in the reference (avoid `·`,
`&`, parentheses, `/` inside labels/subgraph titles — they break the parser).

### 4. Render the PDF (deterministic)

From the project root:

```bash
node .claude/skills/dev-plan/scripts/build-devplan-pdf.mjs
```

Writes `specs/DEVELOPMENT-PLAN.pdf` with the diagram as a real graphic. The script is offline
(mermaid injected from `node_modules`) and resolves `marked` / `puppeteer` / `mermaid` from the
project. If any is missing it prints the `npm install` line — add the three deps and re-run. An
optional first arg overrides the input path, a second the output path.

For projects that want a one-liner, suggest a `package.json` script:
`"devplan:pdf": "node .claude/skills/dev-plan/scripts/build-devplan-pdf.mjs"`.

### 5. Deliver

Give a short read in chat — current phase, the single next action, the nearest blocker — and link
to `specs/DEVELOPMENT-PLAN.md` and the generated PDF. Tell the user the edit→`devplan:pdf` loop:
change steps in the Markdown, re-run the script, the PDF follows.

## Conventions to respect

- The Markdown is the source of truth; the PDF is a render of it. Never hand-edit the PDF.
- The status table is a **point-in-time snapshot** — say so in the doc and point at the project's
  live status source (dashboard/memory).
- Read-only over specs. This skill does not edit spec docs, mutate the DB, or run the orchestrator.
- It is not `/analyzescope` (audit) or `scope-flow-map` (whole-build scope cartography over
  `specs/Project-Scope`). This skill plans the **implementation-spec** build order and ships a PDF.

## Resources

- `scripts/build-devplan-pdf.mjs` — portable Markdown+Mermaid → PDF renderer (step 4).
- `references/plan-template.md` — the document skeleton, status/Mermaid conventions, diagram-syntax
  cautions, and the foundation-up phasing heuristic. Load it before steps 2–3.

## Dependencies

Needs `marked`, `puppeteer`, and `mermaid` in the project (the renderer resolves them from the
project's `node_modules`). If absent, the script names the exact `npm install` to run.
