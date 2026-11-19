# Quickstart: Brand Execution and Artifact Generation

**Spec**: 128 · **Parent Scope**: SCOPE-129

## What this spec delivers

The output half of SCOPE-129. Turns a stored brand schema into real files for the customer's generated product: per-mode stylesheets scoped so they cannot leak, one font request covering every face in every mode, a resting mode written into the base stylesheet so a failed mode layer never yields an unstyled application, and server-side emission so the chosen mode is present before first paint. It extends the existing theme bundle rather than adding a parallel one.

## Where it sits in the fan-out

| Spec | Delivers |
|------|----------|
| 126 | The brand schema model, its validator, and storage across three tiers |
| 130 | Capture from a built product, the document format, and deterministic ingest |
| 128 | Execution into stylesheets and components for the customer's product |
| 129 | The wxBrand entrance, rule delivery, and the two mechanical lints |

## Getting started

1. Read the parent scope at `specs/Project-Scope/129-executable-brand-schema.md`.
2. Read this spec's `spec.md`, then `plan.md`.
3. Work tasks in the order given in `tasks.md`.

## Unresolved before implementation

1. The generated product should not inherit wxKanban's own ambiguity, where a data-theme attribute is written but never read while a class does the real work. Confirm that the mode attribute is the single consumed selector and that no second decorative attribute ships beside it.
2. Should the generated artifacts include a worked integration example showing the shell contract in place, or is the contract description sufficient?
3. For a schema with one mode, should the per-mode block be emitted at all, or collapse into the base stylesheet alone?
