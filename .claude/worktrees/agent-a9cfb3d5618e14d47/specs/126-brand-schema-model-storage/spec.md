# Spec 126: Brand Schema Model and Storage

**Spec Number**: 126
**Parent Scope**: SCOPE-129 — Executable Brand Schema (Multi-Mode)
**Status**: `draft`
**Created**: 2026-09-18
**Source**: `specs/Project-Scope/129-executable-brand-schema.md`

---

## Overview

The data half of SCOPE-129. Introduces the BrandSchema object — a base theme, an extension token map, a typeface set, N named modes under a declared token contract, and the brand's rules as data — and gives it somewhere to live across all three theme resolution tiers. It also widens the accessibility report so that it looks where real brand failures occur. No ingest, no generation and no enforcement: this spec produces the model, the storage and the validator the other three specs depend on.

## Business Problem

ThemeTokenSet carries exactly 19 shadcn tokens plus a radius and a single font family string. A real brand needs more: identity and rail colors, semantic status colors, several typefaces with distinct roles, and named alternative presentations. There is nowhere authoritative to put any of it.

The accessibility guard compounds this. tokenSetContrast checks exactly two pairs — foreground against background, and primary-foreground against primary. Measured against the reference brand both pass comfortably while three semantic colors fail badly, one of them at 2.58 against its own chip. A guard that reports success on a palette with three unreadable status colors is worse than no guard, because it ends the conversation.

Storage is the third gap. Theme resolution has three tiers and only the project tier carries rich data; the company and default tiers resolve to a color-only bundle by construction. A brand meant to be selected company-wide therefore has nowhere to live.

## Actors

- Primary: the developer building the brand schema layer that every other spec in this fan-out consumes
- Secondary: the consuming customer whose brand values must be stored exactly as specified, and the reviewer reading a validation report that must name real failures rather than reassure

## Success Metrics

- SC-1: 100% of modes in a stored schema declare 100% of contract tokens; 0 schemas persist with a missing token
- SC-2: the widened contrast report names 12 contrast failures and 4 distinguishability failures in the reference corpus, against 0 found by the pre-existing two-pair report. Measured, not estimated
- SC-3: 100% of schema applications carry the schema into the resolved theme across both the insert path and the update path — 2 of 2 paths, because testing only the first application previously reported a false pass
- SC-4: 3 tables carry the brandschema column, so that 100% of company-wide selections resolve with modes intact and 0 resolve to a color-only bundle
- SC-5: 0 brand values altered by validation without an explicit recorded repair action
- SC-6: contrast verdicts are computed on the unrounded ratio, so 0 verdicts change when display rounding changes

## Scope Boundary

In scope:

- The BrandSchema, ModeTokenSet, FaceSet and BrandRule types in a new shared module
- A contract validator: every mode declares every contract token, exactly one resting mode, closed-set enforcement
- A widened contrast report covering semantic and accent colors against both paper and their own chips
- A numeric distinguishability check using CIE76 colour distance with a stated threshold
- Validation of the light/dark axis declaration and of typeface fallback stacks
- A migration adding a nullable brandschema jsonb column to three tables
- Carry-across in the insert values, the conflict-update clause and the template update route
- Extension of theme resolution so the company tier returns a schema

## Out of Scope

- Parsing a brand document, which belongs to spec 127
- Emitting CSS or any generated artifact, which belongs to spec 128
- Rule delivery, lints and the wxBrand entrance, which belong to spec 129
- Widening ThemeTokenSet, which would force re-derivation of 50 seeded catalog rows and every preset
- Repairing the reference brand's failing values — validation reports, it never silently alters
- Any user interface; this spec is model, storage and validator only

## Open Questions

1. Confirm the CIE76 distance threshold of 20. The reference document's self-declared tightest case measures 21.1 and 24.2, so 20 admits what it intends while still failing the two modes that set identity and accent to the same value.
2. Confirm that the three light/dark declarations offered — light, dark and preference-following — are the right three.
3. Should a schema carry a version field so that a re-captured brand can be diffed against its predecessor, or is replacement sufficient for a first release?

## Functional Requirements

### FR-001 — The BrandSchema model

A shared module defines BrandSchema carrying base, extensions, typefaces, modes, contract, closed and rules. ThemeTokenSet is imported unchanged and never modified. Implements SCOPE-129 FR-001 and FR-002.

### FR-002 — The token contract is data

The contract is a list of token names carried by the schema, not a constant. Nothing in the implementation hardcodes a mode count or a token count. Implements SCOPE-129 FR-003.

### FR-003 — Incomplete modes are rejected

Validation fails naming the mode and every missing token. A missing token is never inherited from another mode, from the base theme, or from a default. Satisfies SOC 2 CC6.1 input validation. Implements SCOPE-129 FR-004.

### FR-004 — Exactly one resting mode

A schema declares one resting mode. Zero or more than one fails validation. Implements SCOPE-129 FR-005.

### FR-005 — Closed sets are enforced

Adding a mode to a schema marked closed fails and says so. An open schema accepts additions. Implements SCOPE-129 FR-006.

### FR-006 — The contrast report is widened

The report covers each semantic color against both its surface and its own background chip, and the accent color against its surface. Accent is the link and primary-action color and its omission is what allowed two modes to go unchecked. Implements SCOPE-129 FR-010.

### FR-007 — Comparison is on the unrounded ratio

A ratio is compared to its threshold before any rounding for display. One measured value in the reference corpus lands on 4.50, inside the noise of two-decimal rounding, and a verdict that depends on presentation rounding is not deterministic. Implements SCOPE-129 FR-011.

### FR-008 — Distinguishability is numeric

A CIE76 distance check with a stated threshold replaces the untestable phrase it implements. Two modes in the reference corpus set identity and accent to the same value, a distance of zero. Implements SCOPE-129 FR-013 and FR-014.

### FR-009 — Values are stored exactly as specified

Validation reports failures and never alters a stored value. Any repair is explicit, recorded, and repairs a foreground rather than a brand hue. Implements SCOPE-129 FR-012.

### FR-010 — Three tables carry the schema

A nullable brandschema jsonb column is added to themetemplates, projectthemes and companythemeprofiles. The company tier is included because company-wide selection is the destination of the capture flow. Implements SCOPE-129 FR-007 and FR-007a.

### FR-011 — Carry-across is written in every path

The schema is carried in the insert values, in the conflict-update set clause, and in the template update route. Missing any one produces an interface that looks correct while the resolved theme silently loses the schema. Implements SCOPE-129 FR-007.

### FR-012 — Schema changes are applied by hand and recorded

The migration is reviewed, applied manually and recorded in the schema change log. Automatic schema reconciliation is prohibited against this database. Satisfies SOC 2 CC8.1 change management.

## Data Requirements

One additive migration: a nullable `brandschema` jsonb column on `themetemplates`, `projectthemes` and `companythemeprofiles`. Both of the first two already carry the precedent for this shape from the design-system carrier columns, and each inherits existing tenant isolation rather than introducing a new boundary. No new table: a brand belongs to a company, and the company-scoped gallery already holds named looks. The global curated catalog is deliberately read-only and is the wrong home for a single tenant's brand. Schema changes are applied by hand and recorded in the schema change log.

## API Routes

No new routes. This spec changes what theme resolution returns, so the existing resolution and apply endpoints gain the schema in their payloads. The import route belongs to spec 127.

## Frontend Components

None. This spec is model, storage and validator only; the read-only schema view belongs with the surface work.

## Integration Context

Extends the shipped theme model beside `ThemeTokenSet` without widening it, and reuses the existing contrast and repair helpers rather than reimplementing them. Must align with the carrier-chain discipline established by the design-system catalog, where a value that is not written in every persistence path degrades silently while the interface still looks correct.
