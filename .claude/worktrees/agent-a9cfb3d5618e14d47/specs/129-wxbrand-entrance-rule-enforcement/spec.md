# Spec 129: wxBrand Entrance and Rule Enforcement

**Spec Number**: 129
**Parent Scope**: SCOPE-129 — Executable Brand Schema (Multi-Mode)
**Status**: `draft`
**Created**: 2026-09-18
**Source**: `specs/Project-Scope/129-executable-brand-schema.md`

---

## Overview

The entrance and the teeth of SCOPE-129. Supplies the wxBrand command and skill through which every other part of this fan-out is reached, carries the brand's rules into design, implementation and review, and adds the two mechanical lints that make a brand hold across a large surface. It also makes an active brand announce itself, so that a working rules pipeline can be told apart from a dead one.

## Business Problem

Without this spec the other three build a model, a parser, a validator and a generator that nothing ever calls. That is not a hypothetical risk on this codebase: it has shipped a gate switched off, a welcome message that was inert, and a compliance context that loaded for nobody. In each case the code was correct and unreachable, and in each case nothing said so.

The brand's rules are the second gap. Its non-negotiables, invariants and prohibitions are constraints on generated code rather than colour values — identity colour never becomes a primary action, a mode never reassigns what a critical state means, no component holds a style literal. The only mechanism carrying any of this today is a person reading a document and remembering. Across roughly a hundred and ninety screens that mechanism has a known failure rate, and the failure is silent.

The design step is disconnected as well: the design skill reads a stylesheet or the live theme API and has no awareness of the schema layer at all.

## Actors

- Primary: the operator running wxBrand to capture, ingest, review or execute a brand
- Secondary: the AI implementation agent receiving rules as build context, the reviewer running the code review skill against a diff, and the developer whose component is rejected for holding a style literal

## Success Metrics

- SC-1: 100% of rule-consuming runs in a schema-bearing project state that a schema is active and name it
- SC-2: 100% of declared-but-missing schemas produce an explicit statement rather than proceeding as though unbranded
- SC-3: 0 style literals in the generated component layer outside token blocks, and 0 structural properties set by a mode selector
- SC-4: 4 wxBrand modes are reachable — capture, ingest, interview and execute — with capture as the documented primary path
- SC-5: 0 divergence between skill mirrors after a rule-delivery change, verified by comparison
- SC-6: 100% of UI-bearing tasks in a schema-bearing project receive the applicable rules as build context

## Scope Boundary

In scope:

- The wxBrand command and skill, in every mirror, with capture as the primary mode
- An explicit decision on whether a hosted prompt twin is required, before the command is written
- Rules stored as data with a mechanical flag, delivered to implement as build context
- Rule delivery to the design skill, crossing its current unawareness of the schema layer
- Rule delivery to the code review skill as review criteria
- A lint rejecting any structural property set by a mode selector
- A lint rejecting any style literal in a component outside the token blocks
- An announcement on every run where a schema is active or declared but missing

## Out of Scope

- The schema model, validator and storage, which belong to spec 126
- Capture, the document format and ingest mechanics, which belong to spec 127
- Artifact generation, which belongs to spec 128
- A visual mode editor; wxBrand produces and ingests documents rather than manipulating stored modes directly
- Repairing the existing absence of a hosted prompt twin for the design skill, which is its own defect
- Enforcing brand rules on wxKanban's own interface

## Open Questions

1. Does wxBrand require a hosted prompt twin, or is kit-side markdown sufficient? The two answers have different release mechanics, and the registry currently has no twin for the design skill, which is why this is written down rather than assumed.
2. Should the style-literal lint run as a blocking gate or as an advisory report in its first release? Blocking is the eventual intent; starting advisory would surface the true violation count on real code first.
3. Should rule delivery be scoped to rules flagged as mechanically checkable, or should the full rule set including narrative invariants reach the implementation agent?

## Functional Requirements

### FR-001 — wxBrand is the entrance

A command and skill provide the operator-facing entrance in four modes: capture a built product, ingest a completed document, interview to produce one, and execute a stored schema. Capture is the primary mode. Implements SCOPE-129 FR-033.

### FR-002 — The delivery channel is decided before the command is written

Whether a hosted prompt twin is required is settled explicitly, because kit-side markdown ships with no redeploy while a hosted prompt requires regenerating the registry and redeploying. Implements SCOPE-129 FR-037.

### FR-003 — Rules are data with a mechanical flag

Each rule carries an identifier, its text, its kind and whether it is mechanically checkable. The flag is what allows an honest split between what a gate decides and what a person must look at. Implements SCOPE-129 FR-026.

### FR-004 — Rules reach implementation and design

For a UI-bearing task in a schema-bearing project the applicable rules are supplied as build context and the resolved tokens are available to the design step. This crosses the design skill's current unawareness of the schema layer. Implements SCOPE-129 FR-027.

### FR-005 — Rules reach review

The same rules are supplied to the review skill as review criteria, so drift is caught against the diff as well as at authoring time. Implements SCOPE-129 FR-028.

### FR-006 — No structural property varies by mode

A lint fails any mode selector setting display, grid template, order, position or content. This is the only violation that would let two modes disagree about what a screen contains. Implements SCOPE-129 FR-024.

### FR-007 — No style literal in a component

A lint fails any component carrying a colour literal, a pixel radius, a row height or a font stack, exempting the token blocks. This is the check that makes a brand hold across every surface rather than the handful that were looked at. Implements SCOPE-129 FR-025.

### FR-008 — An active or missing schema announces itself

Every run that consumes brand rules states whether a schema is active and names it, and states plainly when one is declared but could not be resolved. A silent rules pipeline cannot be distinguished from a dead one. This requirement is the counterweight to a recorded pattern of shipping inert features and must not be trimmed as noise. Implements SCOPE-129 FR-030.

### FR-009 — Skill changes land in every mirror

Changes are applied to every on-disk copy and the copies are compared afterward. Mirrors of another skill here drifted apart silently and were diagnosed only after the divergence was measured. Implements SCOPE-129 FR-031.

## Data Requirements

No schema change. Rules are carried within the schema defined in spec 126. The per-developer state this spec introduces, if any, is local and excluded from version control.

## API Routes

No new routes. This spec changes developer tooling and generated-code checks rather than server behaviour.

## Frontend Components

None in the product. This spec changes the command surface, the skills and the lints. This is worth stating plainly because the spec concerns how screens get built, and a reader will reasonably expect application interface here.

## Integration Context

Touches the implementation command, the design skill and the code review skill, each of which exists in more than one on-disk copy. The design skill currently has no awareness of the schema layer at all, so that gap is crossed deliberately rather than assumed. Whether a hosted prompt twin is required changes the release mechanics and is decided before the command is written, because the registry already has a missing twin for the design skill.
