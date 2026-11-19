# Quickstart: Brand Document Capture and Ingest

**Spec**: 130 · **Parent Scope**: SCOPE-129

## What this spec delivers

The input half of SCOPE-129. Most customers have no written brand specification; they have a working application whose brand is implicit in its rendered styling. This spec captures that product into a brand instruction document, publishes the format so the document is never guessed at, parses a completed document deterministically, and presents a validation report before anything is stored. It produces documents and parsed schemas; it does not generate artifacts or enforce rules.

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

1. Resolved: capture never handles customer credentials. It accepts a reachable page or a rendered page the customer supplies, and how the customer produces either is theirs to decide. Recorded here because the question was asked and the answer changes what T005 builds.
2. What should capture do when the captured product's own palette fails the accessibility checks? The recommendation is to report and proceed, since refusing to capture a product the customer already ships would be unhelpful.
3. Should capture attempt a dark counterpart when a product declares only one, or leave the axis declaration to the reviewer?
