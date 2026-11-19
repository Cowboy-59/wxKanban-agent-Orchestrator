# Spec 128: Brand Execution and Artifact Generation

**Spec Number**: 128
**Parent Scope**: SCOPE-129 — Executable Brand Schema (Multi-Mode)
**Status**: `draft`
**Created**: 2026-09-18
**Source**: `specs/Project-Scope/129-executable-brand-schema.md`

---

## Overview

The output half of SCOPE-129. Turns a stored brand schema into real files for the customer's generated product: per-mode stylesheets scoped so they cannot leak, one font request covering every face in every mode, a resting mode written into the base stylesheet so a failed mode layer never yields an unstyled application, and server-side emission so the chosen mode is present before first paint. It extends the existing theme bundle rather than adding a parallel one.

## Business Problem

The shipped bundle endpoint emits a stylesheet, Tailwind configuration, a component theme, control files and a design document — all from a single light and dark token set. It has no concept of a named mode, so a schema carrying several of them has no route to the customer's product.

Three failure modes must be designed out rather than discovered. Mode tokens emitted to the document root would leak beyond the shell and take the base brand down with them if the mode layer failed. A mode layer that initialises in the browser produces a visible reskin on every page load, which reads as a defect. And a font request built per mode multiplies requests across a set that shares most of its faces.

The application this serves also runs on a workshop wall and on a phone in a yard, so an unstyled fallback or a flash of the wrong palette is not a cosmetic concern.

## Actors

- Primary: the consuming customer receiving generated stylesheets and components for their own product
- Secondary: the developer integrating those artifacts, and the operator executing a stored schema

## Success Metrics

- SC-1: 0 mode tokens emitted to the document root, verified by inspecting generated output rather than by reading the renderer
- SC-2: 1 font request covers every declared face across every mode, rather than one request per mode
- SC-3: 100% of pages render fully styled in the resting mode with the mode layer disabled and with scripting disabled
- SC-4: 0 reskin repaints after first paint, with the resolved mode present in the initial response on 100% of loads
- SC-5: 100% of declared modes appear in the generated stylesheet, with 0 dropped between storage and output
- SC-6: 4 acceptance checks that require a browser are emitted as a human-test checklist rather than counted as automated

## Scope Boundary

In scope:

- Per-mode stylesheet emission scoped to the shell root
- A single combined font request spanning every face in every mode
- The resting mode written into the base stylesheet as the guaranteed fallback
- The shell contract and server-side emission of the resolved mode into the initial response
- Extension of the existing theme bundle endpoint and its artifact set
- A human-test checklist covering every acceptance check a machine cannot decide

## Out of Scope

- The schema model, validator and storage, which belong to spec 126
- Capture, the document format and ingest, which belong to spec 127
- Lints, rule delivery and the wxBrand entrance, which belong to spec 129
- Re-skinning wxKanban's own interface; execution targets the customer's generated product
- Runtime mode-switching animation or transition
- Bundling or redistributing any font binary

## Open Questions

1. The generated product should not inherit wxKanban's own ambiguity, where a data-theme attribute is written but never read while a class does the real work. Confirm that the mode attribute is the single consumed selector and that no second decorative attribute ships beside it.
2. Should the generated artifacts include a worked integration example showing the shell contract in place, or is the contract description sufficient?
3. For a schema with one mode, should the per-mode block be emitted at all, or collapse into the base stylesheet alone?

## Functional Requirements

### FR-001 — Mode tokens never reach the document root

Emitted mode tokens are scoped to the shell root, so a mode cannot leak beyond the shell and the base brand survives intact if the mode layer fails. Implements SCOPE-129 FR-020.

### FR-002 — One font request covers every face

Emission produces a single request spanning all declared faces across all modes. Faces are hosted only from the declared host and no font binary is bundled or redistributed. Implements SCOPE-129 FR-021.

### FR-003 — The resting mode is in the base stylesheet

The resting mode's values appear in the base stylesheet so the shell renders correctly when the mode layer does not initialise. A failed mode load never produces an unstyled application. Implements SCOPE-129 FR-022.

### FR-004 — The mode is emitted server-side

The resolved mode is present in the shell's first response rather than applied by a client after paint, because a reskin flash on every load reads as a defect. Implements SCOPE-129 FR-023.

### FR-005 — The existing bundle is extended, not duplicated

Mode emission extends the shipped bundle endpoint and its renderers. No parallel generation path is introduced.

### FR-006 — Every declared mode survives to output

A schema carrying several modes emits all of them. A mode dropped between storage and output is a defect, and is measured by counting modes in the generated stylesheet rather than trusting the renderer.

### FR-007 — Non-mechanical checks become a checklist

Acceptance checks requiring a browser or a rendered comparison — that every declared face loads and falls back to its named stack, that switching mode changes no content, that the shell renders without scripting, and that the tightest mode is legible on the physical screen it was built for — are emitted as an explicit checklist rather than claimed as automated. Implements SCOPE-129 FR-029.

## Data Requirements

No schema change. This spec reads a stored schema and writes generated artifacts, which are returned to the customer as files rather than persisted as new records.

## API Routes

Extends the existing theme execute endpoint. No new route: mode blocks, the combined font request and the shell contract are added to the artifact set the endpoint already returns.

## Frontend Components

None in wxKanban's own interface. The generated components are output for the customer's product, which is a deliberate boundary: execution targets the customer's generated product and never re-skins this application.

## Integration Context

Extends the shipped bundle renderers rather than duplicating them. Must respect the established position that generated artifacts belong to the customer's product, and must not introduce the ambiguity this application carries internally, where an attribute is written on the document root but never read while a class does the real work.
