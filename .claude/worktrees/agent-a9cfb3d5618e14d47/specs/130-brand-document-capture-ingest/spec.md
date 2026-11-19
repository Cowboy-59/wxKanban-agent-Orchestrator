# Spec 130: Brand Document Capture and Ingest

**Spec Number**: 130
**Parent Scope**: SCOPE-129 — Executable Brand Schema (Multi-Mode)
**Status**: `draft`
**Created**: 2026-09-18
**Source**: `specs/Project-Scope/129-executable-brand-schema.md`

---

## Overview

The input half of SCOPE-129. Most customers have no written brand specification; they have a working application whose brand is implicit in its rendered styling. This spec captures that product into a brand instruction document, publishes the format so the document is never guessed at, parses a completed document deterministically, and presents a validation report before anything is stored. It produces documents and parsed schemas; it does not generate artifacts or enforce rules.

## Business Problem

There is no way to get a brand into the system. The existing derive routes produce a color-only theme from a gallery reference, a prompt, a logo or a live site — useful, but a long way short of a brand: no modes, no typeface roles, no rules, and nothing a customer can read or revise.

Asking customers to author a specification from nothing does not work either. The reference document received from one customer is unusually complete, and treating it as the expected input would be a mistake — it is the exception. A customer with a running product has the raw material already, but no path from it to a structured brand.

The format itself is the third gap. A customer who must infer a format from one example will produce something a deterministic parser cannot read, and a parser written against a reference nobody re-checks inherits the drift that has already occurred once on this codebase with a design format that no real file matched.

## Actors

- Primary: the consuming customer whose built product is the source of their brand
- Secondary: the operator running capture on the customer's behalf, and the developer maintaining the parser against a published format

## Success Metrics

- SC-1: 100% of captured documents parse cleanly on their first pass through the ingest they were generated for, because both sides are ours
- SC-2: 0 rule sections fabricated by capture — every section not measurable from a rendered product is emitted as an unanswered prompt
- SC-3: the reference corpus parses to exactly 6 modes of 41 contract tokens each, with 0 missing and 0 extra
- SC-4: 100% of parser rejections name both the offending content and its location, with 0 partial imports
- SC-5: 100% of imports present the validation report before the schema is committed
- SC-6: 1 mode is produced by capture, never more, because a built product has one look

## Scope Boundary

In scope:

- A brand instruction format reference written from the real document
- A fillable template shipped as a real artifact for customers to complete
- A deterministic parser for tokens, modes, typefaces and rules, with no language model anywhere in the path
- Loud rejection of unrecognized structure, naming the content and its location
- Capture: extending the shipped rendered-styling extraction to emit a complete document
- Explicit separation of what was measured from what was inferred, with unanswered prompts for the rest
- An import route that reports before it stores
- The reference document committed as a regression corpus

## Out of Scope

- The schema model, validator and storage, which belong to spec 126
- Generating CSS or any artifact from a stored schema, which belongs to spec 128
- The wxBrand command and skill surface, which belong to spec 129
- Credentialed capture, and any handling of customer authentication material — permanently excluded, not deferred
- Fabricating alternative modes; capture yields the one look a built product has
- Following any reference site or code kit named inside a brand document

## Open Questions

1. Resolved: capture never handles customer credentials. It accepts a reachable page or a rendered page the customer supplies, and how the customer produces either is theirs to decide. Recorded here because the question was asked and the answer changes what T005 builds.
2. What should capture do when the captured product's own palette fails the accessibility checks? The recommendation is to report and proceed, since refusing to capture a product the customer already ships would be unhelpful.
3. Should capture attempt a dark counterpart when a product declares only one, or leave the axis declaration to the reviewer?

## Functional Requirements

### FR-001 — The format reference precedes the parser

The brand instruction format is written down, derived from the real document, before any parser is authored against it. A format reference that had already drifted from every real file on disk has occurred once on this codebase. Implements SCOPE-129 FR-015.

### FR-002 — The template is a shipped artifact

A fillable template carries the token contract, the mode table, the typeface roles and the rule sections. The quality of one received document is not evidence that the next will match it. Implements SCOPE-129 FR-034.

### FR-003 — Ingest is deterministic

The parser uses no language model. The document structure is regular and machine-verifiable, and a deterministic parser is immune to the provider fragility that has affected an earlier scope here. Implements SCOPE-129 FR-016.

### FR-004 — Unrecognized structure is rejected and named

An unknown section, an unparseable mode block or an unexpected token is an error naming the content and its location. Nothing is skipped, coerced or partially imported. Satisfies SOC 2 CC6.1 fail-safe defaults. Implements SCOPE-129 FR-017.

### FR-005 — Capture reuses the shipped extraction path

Capture extends the existing rendered-styling extraction rather than introducing a second engine. What is new is the output: a complete document rather than a color-only theme. Implements SCOPE-129 FR-033a.

### FR-005a — Capture never handles customer credentials

Capture accepts exactly two inputs: a page it can reach, or a rendered page the customer supplies. It never accepts, stores, forwards or replays a customer credential, and never authenticates against a customer system. How a customer makes a representative page available is their decision and outside this system. This is a permanent boundary rather than a deferred feature: accepting credentials would place customer authentication material inside a capture path whose entire value is that it only reads public rendering. Satisfies SOC 2 CC6.1.

### FR-006 — A captured brand starts with one mode

A built product has one look, so capture yields a base brand and a single resting mode and never fabricates alternatives. Implements SCOPE-129 FR-036a.

### FR-007 — Capture states what it inferred

A generated document distinguishes what was measured from what was defaulted, and emits every underivable rule section as an explicit unanswered prompt rather than plausible filler. A document that silently invented rules would read as authoritative, which makes it the most dangerous artifact this work could produce. Implements SCOPE-129 FR-036b.

### FR-008 — Every path produces a document

Capture, interview and template all emit a document the customer owns and can revise, which then enters through the same ingest. No path writes a schema directly. Implements SCOPE-129 FR-036.

### FR-009 — Ingest reports before it stores

The validation report — contract coverage, contrast with measured ratios, distinguishability, fallback stacks and axis declarations — is presented before the schema is committed. Implements SCOPE-129 FR-035.

### FR-010 — Parsing is offline and nothing is sent outward

Ingest, parsing and validation are entirely offline and no reference site named inside a document is ever followed. Capture is the one network action, is operator-initiated against a site the customer owns, and only reads. No document, token set or source file is transmitted to any external service. Implements SCOPE-129 FR-019.

### FR-011 — The reference document is the regression corpus

The document is committed as the parser's fixture, asserting its measured shape of six modes and 41 contract tokens with complete coverage. Implements SCOPE-129 FR-018.

## Data Requirements

No schema change; this spec writes through the model defined in spec 126. The brand instruction document and the generated template are files, and the reference document is committed as a test fixture. A captured document is returned to the operator rather than persisted server-side until it is accepted.

## API Routes

An import route accepting a brand instruction document and returning the parsed schema with its validation report, tenant-scoped through the existing project-in-company check. Capture extends the shipped rendered-styling extraction route rather than adding a parallel one.

## Frontend Components

A review surface for the validation report shown before a schema is committed. The capture and ingest flow is otherwise operator-driven through the command surface in spec 129.

## Integration Context

Capture extends the existing look-borrowing extraction, which already drives a headless browser over a live site. The document-ingest pattern follows the established convention for treating a supplied markdown file as authoritative source material. Parsing follows the deterministic pack-parser precedent, which keeps a language model out of the path entirely.
