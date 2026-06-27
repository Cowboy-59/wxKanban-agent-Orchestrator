# Scope corpus reference

Everything needed to read, resolve, and diagram the wxKanban scope corpus. Load this
when building or explaining the cross-scope flow map.

## Where scopes live

- Umbrella scope docs: `specs/Project-Scope/NNN-*.md` (one file per `SCOPE-NNN`).
- Generated analysis reports: `specs/Project-Scope/_analysis/` — **skip these** when mapping.
- Implementation specs (a separate namespace) live in `specs/NNN-name/spec.md` and usually
  do **not** have a `Project-Scope` file. They are the most common source of "unresolved"
  references.

## The SCOPE-NNN vs SPEC-NNN trap (mandatory)

Two independent counters share the same integers, so a bare number is ambiguous:

- `SCOPE-NNN` → an umbrella scope in `specs/Project-Scope/NNN-*.md` (the nodes of this map).
- `SPEC-NNN` → an implementation spec folder `specs/NNN-name/`.

They detached once an umbrella scope began fanning out into several impl specs (e.g.
`SCOPE-045` → `SPEC-046`–`SPEC-050`). So `SCOPE-047` (stack-style) and `SPEC-047`
(windev-site-integration) are **different things that collide only as integers.**

Consequence for the map: a `Depends On: SPEC-019` resolves to scope file `019-*` only because
019 happens to exist in both namespaces. A `Depends On: spec 028` does **not** resolve — there
is no `Project-Scope/028-*.md`. The extractor reports these as *unresolved references*; they
are real dependencies on impl specs, not parser errors. Note them in the map as external nodes
or a footnote — never silently drop them, and never invent a `SCOPE-028` node for them.

Full convention authority: `CLAUDE.md` ("Scope vs Spec Numbering — TWO Namespaces").

## Scope-doc metadata (what the extractor parses)

Each scope doc opens with a metadata block. The relevant fields:

```
# SCOPE-060: Scope Analysis (`/analyzescope`)
**Status**: `draft`
**Depends On**: SPEC-019 (...), SCOPE-013 (...), SCOPE-016 (...). Conventions authority: CLAUDE.md.
**Related Scopes**: complements SPEC-059 (...); complements /wxAI-analyze (...).
```

- **Depends On** → a *hard* edge (solid arrow `-->`). The depended-on scope must exist first.
- **Related Scopes** → a *soft* edge (dotted arrow `-.->`). Sibling / complements / overlaps.
- **Status** → drives node colour (draft / approved / done).

### Why a script is needed, and where it stops

Dependency lines are wildly inconsistent across the corpus — every one of these is real:

- `**Depends On**: None`
- `**Depends On**: Spec 007 (Project Layout), Spec 009 (Task & Lifecycle)`
- `**Depends On**: SPEC-019 (...), SCOPE-013 (...)`
- `**Depends On**: 037 (Consultants Management — Engagement Core)`
- `**Depends On**: 002-Scope (Admin), 005-scope-timeandBilling`
- `**Depends On**: PM Integration spec, Compliance Rules Engine spec` (named, **no number**)
- `**Depends On**: AWS observability provisioned 2026-06-23 — ... SCOPE-014 (...)` (prose +
  embedded date that must NOT become an edge)

`extract_scope_edges.py` handles the mechanical part. It strips dates/versions/FR-task ids and
**honours the citation namespace** so the SCOPE/SPEC collision above cannot mint phantom edges:

- `SCOPE-NNN` → always a scope node (`edges`); flagged in `unresolved` if no scope file exists.
- `SPEC-NNN` → always an impl-spec **external node** (`externals` + `extEdges`), *even when a
  same-numbered scope file exists* — this is what stops `SPEC-048` resolving to `SCOPE-048`.
- `spec NNN` / `Spec NNN` (legacy spaced prose) → a scope node if one exists, else external.
- bare `NNN` / `(NNN)` → a scope node only if one exists; otherwise dropped (too noisy to trust).
- slash lists (`SPEC-046/048`) inherit the first number's prefix.

External nodes are labelled from their `specs/NNN-*` impl-spec folder. What the script still
**cannot** do — and what needs judgment — is the implicit, cross-process connection: two scopes
that reuse the same table, the same sink project, the same service, or sit on opposite ends of
one user journey, while citing each other only in prose (or not at all). Those are the
connections the map exists to surface. Read the prose (the `**Related Scopes**` sentence and the
Overview/Dependencies sections) to find them; the script gives the skeleton, not the story.

## Mermaid conventions in this repo

- The auto-updated `lifecycle` doctype uses Mermaid `pie` + `xychart-beta` (never ASCII bars).
- Per-scope process flow (SPEC-059, and `/analyzescope --flow`) uses `flowchart TD`.
- This skill's **whole-build** map uses `graph LR` (or `flowchart LR`) so the dependency web
  reads left-to-right from foundations to leaves.

Node + edge styling the extractor emits (keep `STATUS_CLASS` in the script in sync):

| Element | Style |
|---|---|
| Hard dependency | solid arrow `A --> B` (A depends on B) |
| Soft / related | dotted arrow `A -.-> B` |
| `draft` status | `classDef draft fill:#fff3cd,stroke:#b8860b` |
| `approved` status | `classDef approved fill:#cfe2ff,stroke:#1c5fb8` |
| done/shipped/deployed/implemented | `classDef done fill:#d1e7dd,stroke:#0f5132` |
| anything else | `classDef other fill:#eee,stroke:#888` |

### Grouping into process clusters

The baseline graph is flat. To make "what we're building and how it connects" legible, group
nodes into `subgraph` clusters by process/flow (judgment — not from a metadata field). Observed
clusters in the current corpus, as a starting point (re-derive from the actual data, do not
hard-code):

- **Consulting / engagement**: 017, 020, 037, 038, 039, 040, 041, 022
- **Feedback & bug pipeline**: 043, 061, 063 (shared `feedbacksubmissions` table + sink project)
- **Marketing**: 044, 045, 064, 065, 070 (+ 046 language)
- **Kit / dev tooling**: 018, 019, 042, 058, 060, 068
- **Core app & lifecycle**: 002–016, 024, 025, 048
- **Stack / theme**: 047, 062
- **Billing / subscription**: 023, 067, 005

Put each scope in one subgraph; let cross-subgraph arrows be the headline — they are the
"connections you don't see in any single doc."
