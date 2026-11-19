# Quickstart: Brand Schema Model and Storage

**Spec**: 126 · **Parent Scope**: SCOPE-129

## What this spec delivers

The data half of SCOPE-129. Introduces the BrandSchema object — a base theme, an extension token map, a typeface set, N named modes under a declared token contract, and the brand's rules as data — and gives it somewhere to live across all three theme resolution tiers. It also widens the accessibility report so that it looks where real brand failures occur. No ingest, no generation and no enforcement: this spec produces the model, the storage and the validator the other three specs depend on.

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

1. Confirm the CIE76 distance threshold of 20. The reference document's self-declared tightest case measures 21.1 and 24.2, so 20 admits what it intends while still failing the two modes that set identity and accent to the same value.
2. Confirm that the three light/dark declarations offered — light, dark and preference-following — are the right three.
3. Should a schema carry a version field so that a re-captured brand can be diffed against its predecessor, or is replacement sufficient for a first release?
