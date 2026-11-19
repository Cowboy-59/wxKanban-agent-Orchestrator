# Quickstart: wxBrand Entrance and Rule Enforcement

**Spec**: 129 · **Parent Scope**: SCOPE-129

## What this spec delivers

The entrance and the teeth of SCOPE-129. Supplies the wxBrand command and skill through which every other part of this fan-out is reached, carries the brand's rules into design, implementation and review, and adds the two mechanical lints that make a brand hold across a large surface. It also makes an active brand announce itself, so that a working rules pipeline can be told apart from a dead one.

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

1. Does wxBrand require a hosted prompt twin, or is kit-side markdown sufficient? The two answers have different release mechanics, and the registry currently has no twin for the design skill, which is why this is written down rather than assumed.
2. Should the style-literal lint run as a blocking gate or as an advisory report in its first release? Blocking is the eventual intent; starting advisory would surface the true violation count on real code first.
3. Should rule delivery be scoped to rules flagged as mechanically checkable, or should the full rule set including narrative invariants reach the implementation agent?
