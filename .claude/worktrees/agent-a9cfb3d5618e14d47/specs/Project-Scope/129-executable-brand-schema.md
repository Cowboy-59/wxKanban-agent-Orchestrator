# SCOPE-129: Executable Brand Schema (Multi-Mode)

**Scope Number**: 129
**Status**: `draft`
**Created**: 2026-09-17
**Depends On**: SCOPE-062 (Project Theme — the 19-token `ProjectTheme` this extends and does not widen); SCOPE-114 (Design System Catalog — the rich token layer, the carrier chain, and the contrast-repair function); SCOPE-106 (`themetemplates`, the company-scoped gallery that hosts a tenant's own brand); the `wxDesigner` skill and `wxUIUXCodeReview` skill as rule consumers
**Source**: `docs/ProActive_Brand_Schema_Instruction.md` v1.0 (2026-09-15), supplied by NOW Group for Darling Downs Earthmoving Solutions and addressed "For: WxKanban"

---

## Overview

A customer sent us a brand specification precise enough to execute — 31 base tokens, a three-face type system, six named visual modes of 41 tokens each, and four sets of rules governing what no mode may do. wxKanban can hold the first nineteen of those numbers and nothing else.

This scope closes that gap generally. It introduces the **brand schema**: a named, tenant-owned object that carries a base theme, an extension token set, a typeface set, N named modes under a declared token contract, and the brand's own rules as data. It ingests one deterministically from a brand instruction document, executes it into the customer's generated product, and carries its rules into the three places where UI actually gets made — design, implementation and review.

**The flow this exists to serve (Amendment A):** take a product the customer has **already built**, capture it into a brand instruction document, let them review and revise that document, upload it to the project, and select it **company-wide**. Most customers do not have a written brand; they have a working application whose brand is implicit in its rendered CSS. Asking them to author a specification from nothing is asking for the artifact they were never going to produce. The reference document from NOW Group is the exception that proves the model, not the expected input.

ProActive by DDES is the worked example, not the purpose. It is a real consuming customer in this system (project `da4eebf4-eb6d-4a8d-9694-2b2e6292702b`, already the origin of SCOPE-101 and a subject of SPEC-112) running an application of 5 modules, 73 routes, roughly 190 surfaces and 741 cataloged fields. That scale is what makes the rules worth mechanizing: a convention that holds across twelve hand-checked screens does not hold across 190.

### Core Design

| Element | Value |
|---------|-------|
| **Primary Actor** | A consuming customer whose brand is specified as a document and must survive into generated code |
| **Secondary Actors** | The AI implementation agent, which receives the brand's rules as build context; the reviewer running `wxUIUXCodeReview` against a diff; the tenant administrator choosing a mode |
| **Key Value** | A brand specification stops being prose a developer is trusted to remember, and becomes an object that is validated, executed and enforced |
| **New object** | `BrandSchema` — `base` + `extensions` + `typefaces` + `modes` + `contract` + `closed` + `rules` |
| **Relationship to `ProjectTheme`** | Extends beside it. `ThemeTokenSet` is **not** widened — 50 seeded catalog rows and every preset derive from its current shape |
| **Mode contract** | **Declared per schema, not hardcoded.** "41 tokens, six modes, the set is closed" is a property of ProActive's instance, not of wxKanban |
| **Completeness posture** | A mode omitting a contract token is a **validation error**, never a fallback |
| **Storage** | Nullable `brandschema` jsonb on **both** `themetemplates` and `projectthemes`, riding the carrier chain SCOPE-114 already built |
| **Ingest** | **Deterministic parser, no AI.** The source document's structure is machine-verifiable and was verified before this scope was written |
| **Failure posture** | The parser rejects unrecognized structure and names it. Nothing is coerced, defaulted or silently degraded |
| **Scoping rule** | Mode tokens are emitted to the shell root only, never `:root`, so a failed mode layer cannot leave an unstyled application |
| **Enforcement split** | Mechanical checks become a gate; checks needing a browser become a human-test checklist. The split is stated, not blurred |
| **Announcement** | A schema that is active **says so** on every affected run, and a schema that is declared-but-absent says that too |
| **Entrance** | **`wxBrand`** — template, ingest, interview, execute. Amendment A. An engine with no entrance is the failure this project has recorded three times |
| **Source relationship** | A brand document is the **sixth theme source**, beside preset, gallery, logo, prompt, manual and url — not a parallel system |
| **Customer artifact** | A shipped, fillable **brand instruction template**, so the format is published rather than inferred from one lucky example |
| **Scope Boundary** | The model, storage, ingest, execution, the three rule paths, and the `wxBrand` entrance. Excludes re-skinning wxKanban itself, building ProActive, a visual mode editor, and any network fetch |

## Business Problem

Four concrete failures, each verified against the repository and the source document rather than assumed.

**The token vocabulary is too narrow to hold a real brand.** `ThemeTokenSet` in `src/shared/theme-tokens.ts` carries exactly 19 shadcn tokens plus a radius and a single `fontFamily` string. The incoming brand needs 31 base tokens — the 19 plus `--brand`, `--brand-foreground`, three rail tokens, and `success`/`warning`/`info` with their foregrounds — and three distinct typefaces with separate roles. There is nowhere authoritative to put any of them. SCOPE-114's rich `tokens` column holds type scale, spacing and control geometry, but its staleness rule makes the 19-token `theme` authoritative for **all** color, so a brand color placed there would be documentation, not a value anything renders from.

**There is no concept of a mode.** A project holds one theme per application type, light and dark. The brand layer asks for six named characters — a workshop cockpit, a glare-and-gloves field mode, a serif ledger, two PsikiQ brand modes and the resting standard — each a complete 41-token set, selected per tenant and emitted before paint. Nothing in the model, the storage, the renderers or the bundle has a place for a second named token set, let alone six under a shared contract.

**The accessibility guard does not look where the problem is.** `tokenSetContrast` checks exactly two pairs: `foreground/background` and `primary-foreground/primary`. Run against this brand, both pass comfortably and the theme is pronounced AA-clean. Meanwhile the brand's three semantic colors fail AA badly in the mode that ships by default — `ok` 2.82, `warn` 2.58, `crit` 3.89 against their own background chips, two of them failing even the lenient 3.0 large-text threshold. A guard that reports success on a palette with three failing status colors is worse than no guard, because it ends the conversation.

**The rules have no home at all.** The document's ten non-negotiables, its mode invariants, its implementation requirements and its prohibitions are constraints on generated code, not CSS values: gold never becomes a primary action, a tab never becomes a filled pill, a mode never reassigns what `crit` means, no component holds a color literal. Today the only mechanism carrying any of this is a human reading a document and remembering. Across 190 surfaces that mechanism has a known failure rate, and the failure is silent.

The cost of all four is the same: a brand that was specified exactly arrives approximately, and nobody finds out until a customer looks at a screen.

## Actors

Primary: a consuming customer whose brand is specified as a document and must survive unaltered into their generated product

Secondary: the AI implementation agent consuming brand rules as build context, the reviewer running `wxUIUXCodeReview` against a diff, and the tenant administrator selecting which mode their company renders in

## Scope Boundary

In scope:

- A `BrandSchema` model extending the shipped theme model without widening `ThemeTokenSet`
- Extension tokens, a four-role typeface set, and N named modes under a per-schema declared token contract
- Storage on both carrier tables, with the carry-across written in every path that writes them
- A deterministic parser for brand instruction documents, and the format reference it is written against
- A widened contrast report covering semantic and accent colors, compared on the unrounded ratio
- A numeric distinguishability check replacing an untestable adjective
- Per-mode CSS emission scoped to the shell root, one combined font request, and a resting mode in the base stylesheet
- Two mechanical lints: no structural property varying by mode, and no style literal in a component
- Brand rules stored as data and delivered to `implement`, `wxDesigner` and `wxUIUXCodeReview`
- A human-test checklist for every acceptance check a machine cannot decide
- **Amendment A:** the `wxBrand` command and skill, with capture-from-a-built-product as its primary mode
- **Amendment A:** a shipped, fillable brand instruction template, and a generated document that separates what was measured from what was inferred
- **Amendment A:** company-wide selection, which adds the carrier column to the company tier
- An announcement on every run where a schema is active or declared-but-missing

## Out of Scope

- Re-skinning wxKanban's own interface. SCOPE-062 locked execution onto the **customer's** generated product, and `src/client/styles/index.css` remains a separate system
- Building the ProActive application, or any part of its five modules
- A **visual** mode editor in Theme Studio — picking colors and type for a mode on a canvas. **Amendment A** brings capture, interview and template authoring in scope, because all three produce a document; direct manipulation of a stored mode remains its own surface
- Fetching the `NEXUS-MKII/proactive-brand-reference` repository or any code kit. **Amendment A reconciliation:** capture necessarily retrieves a live site the customer owns and asks us to look at, which is exactly what the shipped look-borrowing route already does under operator initiation. The rule this scope holds is narrower and unchanged — **parsing and validation are offline**, and no brand document, token set or source file is ever sent outward. A retrieved page is read; nothing about it is transmitted anywhere
- Widening `ThemeTokenSet`, re-deriving the 50 seeded catalog rows, or changing the design-system catalog's global read-only character
- Deciding the two brand questions that belong to the brand owner — the failing semantic contrast and the invisible rail bar. This scope surfaces and records them; it does not resolve them
- Runtime mode switching animation, transition or persistence beyond the tenant setting

## User Scenarios & Testing

### US1 — A brand document is imported and every mode survives

**Given** a brand instruction document declaring a token contract and several modes
**When** it is imported
**Then** the parser reports the mode count and the per-mode token count, and stores a schema whose every mode declares every contract token
**And** a mode missing even one contract token fails the import and names the mode and the token

This is the scope's central assertion. The source document was measured before this scope was written: six modes, 41 contract tokens, all six declaring all 41, none missing and none extra. That measurement is the fixture.

### US2 — A brand's own accessibility failures are reported, not repaired away

**Given** a brand whose semantic colors fail AA against their own backgrounds
**When** the schema is validated
**Then** every failing pair is named with its measured ratio and the threshold it missed
**And** the stored values remain exactly what the brand specified

A brand hue is the customer's property. The existing `repairContrast` repairs a foreground and never a hue, and even that is a change to a document the customer called canonical. Reporting is always correct; repairing is a decision someone must make in the open.

### US3 — The old guard would have passed this brand

**Given** the brand's base tokens
**When** the pre-existing two-pair contrast report runs
**Then** it passes
**And** the widened report fails, naming three semantic colors and two modes' accent color

This scenario exists to make the regression permanent. The failure mode being fixed is not a missing check but a check narrow enough to be reassuring.

### US4 — A mode is selected and the shell renders in it before paint

**Given** a tenant with a mode set against their company
**When** any page of their generated product loads
**Then** the mode is already present in the initial HTML
**And** no reskin occurs after first paint

### US5 — The mode layer fails to initialize and the application still renders

**Given** a product whose mode layer fails to load, or a viewer with JavaScript disabled
**When** a page renders
**Then** it renders in the resting mode, fully styled, from the base stylesheet
**And** no surface falls back to unstyled browser defaults

### US6 — A mode tries to change structure and is stopped

**Given** a stylesheet in which a mode selector sets `display`, `grid-template`, `order`, `position` or `content`
**When** the lint runs
**Then** it fails and names the selector and the property

Structure is not a theme. This is the one rule whose violation would let two modes disagree about what a screen contains, which is the difference between theming and an undeclared redesign.

### US7 — A component carries a color literal and is caught

**Given** a component in the generated layer containing a hex color, a pixel radius or a font stack
**When** the lint runs
**Then** it fails and names the file and the literal
**And** the six token blocks are exempt, being where literals belong

### US8 — An implementation task inherits the brand's rules

**Given** a UI-bearing task in a project with a brand schema
**When** `implement` runs it
**Then** the applicable rules are present in the build context
**And** the run states that a brand schema is active and names it

### US9 — A declared schema is missing and the run says so

**Given** a project that declares a brand schema which cannot be resolved
**When** any rule-consuming run occurs
**Then** it states plainly that the schema is declared but absent, and does not proceed as though unbranded

This scope's counterweight scenario. A rules pipeline that is silent when working is indistinguishable from one that is dead, and this project has shipped a gate switched off, a welcome message inert, and a compliance context that loaded for nobody.

### US10 — A schema is applied twice and the modes survive both paths

**Given** a project that already has a brand schema applied
**When** a schema is applied again
**Then** the modes and contract are present in the executed bundle after both the first and the second application

The second application takes the update path, not the insert path. SCOPE-114 found exactly this silently broken, where the interface looked complete while the bundle degraded to color only.

### US11 — A customer with no brand document gets one from what they built

**Given** a customer running a product they built, with no written brand specification
**When** `wxBrand` captures it
**Then** a brand instruction document is produced carrying the base tokens, typefaces and a single resting mode measured from the product
**And** everything it could not measure — the rules, the invariants, the product constraints — appears as an explicit unanswered prompt, never as plausible filler
**And** the customer reviews and revises that document before any of it becomes binding

This is the scope's primary flow. Most customers have a working application, not a specification, and the document they were never going to write by hand is exactly what capture produces a first draft of.

### US12 — An uploaded brand is selected company-wide

**Given** a reviewed brand document uploaded to a project
**When** it is selected company-wide
**Then** every project in that company resolves the schema, with its modes and rules intact
**And** no project falls back to a color-only bundle merely because it did not import the brand itself

The company tier resolves color-only today by construction. Without the carrier column added by FR-007a this scenario silently half-works, which is the shape of defect this codebase has recorded on the other two carrier tables.

## Functional Requirements

### FR-001 — The brand schema is a first-class object

A brand schema carries a base theme, an extension token map, a typeface set, a map of named modes, the token contract those modes must satisfy, whether the mode set is closed, and the brand's rules. It is named and versioned, and it belongs to a company.

### FR-002 — `ThemeTokenSet` is not widened

Extension tokens live beside the shipped 19-token set, never inside it. Widening the set would force re-derivation of all 50 seeded catalog rows and every preset, and would change the shape SCOPE-114 froze deliberately. There is precedent for extending rather than widening: wxKanban's own stylesheet already carries success, warning and danger tokens outside the shadcn set, added under SCOPE-017 for exactly the reason this brand needs them — the base set carries no green and no amber, so health signalling had nowhere to go but hardcoded utility classes.

### FR-003 — The token contract is declared per schema

The contract is a list of token names carried by the schema, not a constant in wxKanban. A document declaring 41 tokens produces a 41-name contract; a different brand produces a different one. Nothing in the implementation hardcodes the number six or the number 41.

### FR-004 — A mode that omits a contract token is rejected

Validation fails, naming the mode and every missing token. A missing token is never treated as inheritable from another mode, from the base theme, or from a default. Satisfies SOC 2 CC6.1 input validation.

### FR-005 — Exactly one mode is the resting mode

A schema declares one mode as resting. Zero or more than one is a validation error. The resting mode is what the product renders in when nothing selects otherwise, and it is the mode written into the base stylesheet.

### FR-006 — A closed mode set is enforced when declared

A schema may declare its mode set closed. Adding a mode to a closed schema fails and says so. An open schema accepts additions. The flag is the brand's statement about itself, recorded rather than assumed.

### FR-007 — Storage rides the existing carrier chain, in every write path

A nullable `brandschema` jsonb column is added to both `themetemplates` and `projectthemes`. The carry-across is written in the insert values, in the `onConflictDoUpdate` set clause, and in the template update route. Missing any one of the three produces an interface that looks correct while the executed bundle silently loses the schema — the precise defect SCOPE-114 recorded.

### FR-007a — The company tier carries the schema

Theme resolution has three tiers — project, company, default — and by construction only the project tier carries rich data today: the company-profile table has no carrier columns, so it resolves to a color-only bundle. The source document specifies the mode as a **tenant-level setting stored against the company**, which that tier cannot currently hold.

**Amendment A (2026-09-17) — resolved.** The company tier gains the carrier column. Company-wide selection is the destination of the capture flow rather than an optional extra (FR-036c), so a project-only schema would fail this scope's primary purpose. The migration therefore touches **three** tables, not two. Without it the flow ends in a brand that resolves to bare colors for every project that did not import it individually — the same class of silent degradation FR-007 guards against on the other two tables.

### FR-008 — Every mode declares its relationship to the light/dark axis

A mode declares itself light, dark, or preference-following. Without this a light-surfaced mode inherits dark base tokens from an operating-system preference and renders mixed. The source document does not settle this, and the parser must require an explicit answer rather than infer one from the palette.

### FR-009 — Every typeface carries a fallback stack

Each of the four type roles declares a real fallback stack. A face that fails to load falls back to its named stack, never to a browser default serif. A schema declaring a face with no fallback fails validation.

### FR-010 — The contrast report covers semantic and accent colors

The report is widened beyond the two pairs it checks today to include each semantic color against both the surface it sits on and its own background chip, and the accent color against its surface. Accent is the link and primary-action color; omitting it was the gap that let two modes' action color go unchecked.

### FR-011 — Comparison is on the unrounded ratio

A ratio is compared against its threshold before any rounding for display. One measured value in the source corpus lands on 4.50, inside the rounding noise of a two-decimal display, and a gate whose verdict depends on presentation rounding is not deterministic.

### FR-012 — Brand values are stored exactly as specified

Validation reports failures; it never silently alters a stored value. Any repair is an explicit, recorded action that names what changed and why, and repairs a foreground rather than a brand hue.

### FR-013 — Distinguishability is a number

The requirement that identity, accent and warning colors be distinguishable is expressed as a minimum perceptual distance with a stated numeric threshold, not as an adjective. In the source corpus two modes set identity and accent to the same value, a distance of zero, which no adjective-based check can fail.

### FR-014 — Non-text elements are checked at the non-text threshold

A color used as a bar, rule or indicator rather than as text is checked against the threshold for graphical objects, not the body-text threshold. Applying the text threshold to a 3-pixel bar produces false failures; applying no threshold at all lets an identity mark reach 1.5 against its own background.

### FR-015 — A format reference is written before the parser

The brand instruction document format is written down, derived from the real document, before any parser is authored against it. The project has one recorded instance of a format reference that had already drifted from every real file on disk, and a parser written against a reference nobody checked inherits that drift.

### FR-016 — Ingest is deterministic

The parser uses no language model. The source structure — token contract block, per-mode CSS blocks, rule lists and specification tables — is regular and machine-verifiable. A deterministic parser is also immune to the provider fragility that has bitten an earlier scope on this codebase.

### FR-017 — The parser rejects unrecognized structure and names it

An unknown section, an unparseable mode block or an unexpected token is an error that names the offending content and its location. Nothing is skipped, coerced or partially imported. Satisfies SOC 2 CC6.1 fail-safe defaults.

### FR-018 — The source document is the regression corpus

`docs/ProActive_Brand_Schema_Instruction.md` is checked in as the parser's fixture, asserting its measured shape: six modes, 41 contract tokens, complete coverage. The contrast fixture asserts the measured failures, not their absence — a report that passes this corpus is broken.

### FR-019 — Parsing is offline, and nothing is sent outward

**Amendment A (2026-09-17) — narrowed.** Ingest, parsing and validation are entirely offline: the document in hand is the only input, and no reference site or code kit named inside a document is ever followed. Capture is the one network action in this scope, it is operator-initiated against a site the customer owns, and it only ever **reads**. No brand document, token set, rule text or source file is transmitted to any external service at any point, which keeps this scope inside the verified code-egress boundary.

### FR-020 — Mode tokens never reach `:root`

Emitted mode tokens are scoped to the shell root. A mode cannot leak beyond the shell, and the base brand survives intact if the mode layer fails.

### FR-021 — One font request covers every face in every mode

Emission produces a single font request spanning all declared faces across all modes, rather than one per mode. Faces are hosted only from the declared font host, and no font binary is bundled or redistributed.

### FR-022 — The resting mode is written into the base stylesheet

The resting mode's values appear in the base stylesheet so the shell renders correctly when the mode layer does not initialize. A failed mode load never produces an unstyled application.

### FR-023 — The mode is emitted server-side into initial HTML

The tenant's mode is resolved server-side and present in the shell's first response. It is not applied by a client after paint, because a reskin flash on every load reads as a defect.

### FR-024 — No structural property varies by mode

A lint fails any mode selector setting `display`, `grid-template`, `order`, `position` or `content`. Reaching for one of these is redesigning rather than theming, and it is the only violation that would let two modes disagree about what a screen contains.

### FR-025 — No style literal in a component

A lint fails any component carrying a color literal, a pixel radius, a row height or a font stack, exempting the token blocks themselves. This is the check that makes modes hold across every surface rather than the handful that were looked at.

### FR-026 — Rules are stored as data, with a mechanical flag

Each rule carries an identifier, its text, its kind, and whether it is mechanically checkable. The flag is what allows an honest split between what a gate decides and what a person must look at, instead of a single list that overstates what is enforced.

### FR-027 — Rules reach `implement` and `wxDesigner`

For a UI-bearing task in a project with a brand schema, the applicable rules are supplied as build context, and the resolved tokens are available to the design step. This requires crossing a known gap: `wxDesigner` today reads a stylesheet or the live theme API and has no awareness of the schema layer.

### FR-028 — Rules reach `wxUIUXCodeReview`

The same rules are supplied to the review skill as review criteria, so drift is caught against the diff as well as at authoring time.

### FR-029 — Checks a machine cannot decide become a human-test checklist

Acceptance checks requiring a browser or a rendered comparison — that every declared face actually loads and falls back to its named stack, that switching mode changes no text, field, row or control, that the shell renders with JavaScript disabled, and that the tightest mode is legible on the physical screen it was built for — are emitted as an explicit checklist rather than being claimed as automated.

### FR-030 — An active or missing schema announces itself

Every run that consumes brand rules states whether a schema is active and names it, and states plainly when a schema is declared but could not be resolved. A silent rules pipeline cannot be distinguished from a dead one, and this project has shipped three features that were inert without anyone noticing.

### FR-031 — Skill changes land in every mirror

Changes to `wxDesigner` or `wxUIUXCodeReview` are applied to every on-disk copy, and the copies are compared afterward. Three mirrors of another skill on this codebase drifted apart silently and were diagnosed only after the divergence was measured.

### FR-032 — A brand document is a theme source, not a parallel system

**Amendment A (2026-09-17).** The existing theme-source enum gains a document value alongside preset, gallery, logo, prompt, manual and url. Ingesting a brand document is the sixth way of starting a theme, resolved and stored through the same path as the other five, not a second mechanism running beside them. A schema-bearing source carries its modes and rules; the five existing sources continue to produce color-only themes exactly as they do today.

### FR-033 — `wxBrand` is the entrance, and deriving from a built product is its primary mode

**Amendment A (2026-09-17).** A `wxBrand` command and skill provide the operator-facing entrance. Its **primary** mode captures a product the customer has already built and produces a brand instruction document from it; the customer reviews and revises that document, uploads it to the project, and selects it company-wide. The secondary modes ingest a hand-authored document, emit a blank template for a customer who has nothing to capture, and execute a stored schema into artifacts. Without an entrance this scope builds a model, a parser and two lints that nothing ever calls — the failure this project has recorded three times.

### FR-033a — Capture reuses the shipped extraction path

**Amendment A (2026-09-17).** Deriving from a built product extends the existing look-borrowing extraction, which already drives a headless browser over a live site and maps real rendered styling onto the token model, and the structural rebuild that already reconstructs a live page's sections. Capture is an extension of those, not a second extraction engine. What is new is the **output**: a complete brand instruction document rather than a color-only theme.

### FR-034 — The template is a shipped artifact

**Amendment A (2026-09-17).** The blank brand instruction template is a real file the customer receives, carrying the declared token contract, the mode table, the typeface roles and the rule sections, with the format reference of FR-015 describing it. A customer who must infer the format from an example will produce something a deterministic parser cannot read, and the quality of the one document we have is not evidence that the next will match it.

### FR-035 — Ingest reports before it stores

**Amendment A (2026-09-17).** Ingest emits the validation report — contract coverage, contrast failures with measured ratios, distinguishability, missing fallback stacks and light/dark declarations — and presents it before the schema is committed. The report names the brand's own defects plainly rather than absorbing them, and is the same report FR-010 through FR-014 define. This is the mode's primary value: four defects in the reference document were found this way in minutes.

### FR-036 — Every mode produces a document, never a schema directly

**Amendment A (2026-09-17).** Capture, interview and template all emit a brand instruction document the customer owns and can revise, which then enters through the same ingest path. No mode writes a schema directly. One artifact, one parser, one validation report, regardless of how the document came to exist — and the customer always gets an editable document between the machine's reading of their product and what becomes binding.

### FR-036a — A captured brand starts with one mode

**Amendment A (2026-09-17).** A product that has already been built has one look, so capture yields a base brand and a single resting mode. It never fabricates alternative modes. Additional modes are added deliberately afterward, by hand or by a later capture. The six-mode reference document is a mature end state, not what capture produces on day one, and FR-003's per-schema contract already admits a one-mode schema as valid.

### FR-036b — Capture states what it inferred

**Amendment A (2026-09-17).** A generated document distinguishes what was measured from the product from what was defaulted or guessed, and every rule section it could not derive is emitted as an explicit unanswered prompt rather than plausible filler. Rules, invariants and product constraints are not visible in rendered CSS: a captured document that silently invents them would be the most dangerous artifact this scope could produce, because it would read as authoritative.

### FR-036c — Company-wide selection is the destination

**Amendment A (2026-09-17).** An uploaded brand is selectable company-wide, which is the stated purpose of the capture flow rather than an optional convenience. This resolves FR-007a: the company tier gains the carrier column, because a brand that cannot be set company-wide does not satisfy the flow this scope exists to serve.

### FR-037 — The delivery channel is decided before the command is written

**Amendment A (2026-09-17).** Whether `wxBrand` requires an MCP prompt twin is settled explicitly, because the two answers have different release mechanics: kit-side markdown ships with no redeploy, while a hosted prompt requires regenerating the prompt registry and redeploying. The registry currently has no `wxDesigner` twin, which is a known defect and the reason this requirement is written down rather than assumed.

## Success Metrics

- SC-1: 100% of modes in an imported schema declare 100% of contract tokens; 0 imports succeed with a missing token. Measured against the source corpus, where the passing value is 6 modes × 41 tokens
- SC-2: 100% of contrast failures in the source corpus are reported by the widened report — the passing value is 5 named failures, since the pre-existing two-pair report finds 0 of them
- SC-3: 0 mode tokens emitted to `:root`, verified by inspecting generated output rather than by reading the renderer
- SC-4: 0 style literals in the generated component layer outside token blocks, and 0 structural properties set by a mode selector
- SC-5: 100% of schema applications carry the schema into the executed bundle, measured across both the insert path and the update path — 2 of 2, because testing only the first application is what previously reported a false pass
- SC-6: 0 reskin repaints after first paint, with the mode present in the initial HTML on 100% of loads
- SC-7: 100% of rule-consuming runs in a schema-bearing project state that a schema is active, and 100% of declared-but-missing schemas produce an explicit statement. A run that says nothing is a defect, not a quiet success
- SC-8: 100% of parser rejections name both the offending content and its location; 0 partial imports
- SC-9: 0 brand values altered without an explicit recorded repair action
- SC-10: 100% of non-mechanical acceptance checks appear on the human-test checklist rather than being counted as automated — 4 of the 9 source checks, a split stated openly
- SC-11: 0 divergence between skill mirrors after a rule-delivery change, verified by comparison
- SC-12: 100% of captured documents parse cleanly on their first pass through the ingest they were generated for. A generator and a parser that disagree about their shared format is the defect this measures, and the passing value is total because both sides are ours
- SC-13: 0 rule sections fabricated by capture — every section not measurable from a rendered product is emitted as an unanswered prompt. Measured by inspecting generated documents, since a plausible invented rule is indistinguishable from a real one by any automated check
- SC-14: 100% of company-wide selections resolve with modes and rules intact across every project in the company, and 0 resolve to a color-only bundle
- SC-15: 0 outbound transmissions of a brand document, token set or source file during capture, ingest or execution, verified against the code-egress boundary

Two things are deliberately not measured. There is no target for how many brands are imported: this scope proves a capability against one real corpus, and an adoption number would create pressure to import brands nobody has asked for. And there is no quality score for a brand: a schema that reports five accessibility failures and stores the values faithfully has done its job, and scoring it would invite improving a customer's brand without being asked.

## Data Requirements

One additive migration: a nullable `brandschema` jsonb column on `themetemplates` and on `projectthemes`. Both tables already carry the precedent for this shape from SCOPE-114's `tokens` and `designsystemslug` columns, and both are already company- and project-scoped respectively, so the schema inherits existing tenant isolation rather than introducing a new boundary.

No new table. A brand schema belongs to a company, and `themetemplates` is the company-scoped gallery that already holds named looks. The `designsystems` catalog is deliberately global and read-only, which makes it the wrong home for a single tenant's own brand.

Schema changes on this project are applied manually and recorded in the schema change log. `drizzle-kit push` is prohibited against this database.

## API Routes

An import route accepting a brand instruction document and returning the parsed schema with its validation report, and a route resolving the schema for a project. Both are tenant-scoped through the existing project-in-company check. Execution extends the existing theme bundle endpoint rather than adding a parallel one.

## Frontend Components

A read-only view of an imported schema within the existing Theme Studio — its modes, its contract coverage and its validation report, including failures. No authoring surface: version one imports, views and executes. The tenant's mode selection is a company-level setting.

## Integration Context

| Integration | Nature |
|---|---|
| `ProjectTheme` / `theme-tokens.ts` | Extended beside, never widened. Only the contrast report changes; `ThemeTokenSet` is untouched |
| SCOPE-114 carrier chain | Reused wholesale — the same two tables, the same three write paths, the same documented trap |
| Theme bundle endpoint | Extended to emit mode blocks, the combined font request and the shell contract |
| `wxDesigner` | Currently unaware of the schema layer entirely; the gap is crossed deliberately by FR-027 |
| `wxUIUXCodeReview` | Gains brand rules as review criteria |
| `implement` | Gains rules as build context for UI-bearing tasks, and the announcement of FR-030 |
| Skill mirrors | Every skill edit is a multi-copy edit; unmirrored changes ship and then vanish |

This scope must align with SCOPE-062's position that execution targets the customer's generated product and never wxKanban's own interface, and with SCOPE-114's staleness rule, extending rather than contradicting the layer that makes color authoritative.

## Technical Notes, Constraints and Risks

### Constraints

- `ThemeTokenSet` cannot change shape. Fifty seeded catalog rows and every preset derive from it.
- Mode tokens carry a prefix and are scoped to the shell root. An unprefixed color in a component is a review failure by construction.
- A gradient is a valid value for the critical-edge treatment and must be consumed as a background, never as a border color, where it silently resolves to transparent.
- Ingest is offline and deterministic. No model, no network.
- The database has no migration ledger; DDL is applied by hand and recorded.
- `implement`'s modify path corrupts UTF-8 in the files it touches, so modify-heavy edits are made directly; the fencer rejects router-only and test files having no top-level declaration.

### Risks

- **The brand's own accessibility failures become ours by adoption.** Storing a palette whose status colors fail AA means shipping it. The mitigation is that the report is loud, the failures are recorded, and the decision is escalated rather than absorbed. See Open Questions 1 and 2.
- **The two rule paths that run inside skills are the easiest to ship inert.** They have no test that fails when they stop working, which is exactly the shape of three previously inert features here. FR-030's announcement is the counterweight and must not be trimmed as noise.
- **Reference drift.** A format reference written once and never re-checked against real documents has already happened on this codebase. FR-018's corpus fixture is the guard.
- **Carry-across omission.** The update path is the one that gets missed, and the resulting defect is invisible from the interface. SC-5 measures both paths for this reason.
- **Mode count assumptions.** Any code that assumes six modes or 41 tokens will be wrong for the next brand. FR-003 makes the contract data; tests should import a second, differently-shaped fixture to prove it.

## Compliance

SOC 2 is the active framework for this project. Input validation at the ingest boundary and fail-safe rejection of unrecognized structure satisfy CC6.1 (FR-004, FR-017). The manual, recorded schema change satisfies CC8.1 change management. Tenant isolation is inherited from the existing project-in-company checks on both carrier tables rather than newly introduced, and no brand document is fetched from or sent to an external service, keeping this scope inside the verified code-egress boundary.

Accessibility is not a SOC 2 control, and this scope does not claim it as one. The contrast requirements here exist because SCOPE-062 made them a first-class acceptance criterion for themes, and because a status color nobody can read is a safety matter in an application that tracks machine-down state on plant.

## Amendments

### Amendment B — the fan-out is 126, 128, 129 and 130 (2026-09-20)

The capture spec was numbered 127 and has been renumbered **130**. In this project's database
`127` already belonged to **SCOPE-127 — Test Pipeline Stack Adapters**, pushed on 2026-08-22 with
19 tasks. `project.create_specs` matched that row on `(projectId, specNumber)`, overwrote its title
and content, appended the brand tasks to it, and reported success.

The number was chosen from `ls specs/`, which shows the filesystem only — and SCOPE-127's spec has
no folder on disk. **A spec number must be taken from the database, scoped to the project.** The
repair is recorded in `docs/spec-127-collision-repair-plan.md`; the original spec is restored with
its 19 tasks intact and nothing was deleted.

126, 128 and 129 were never affected: the `WIN_*` specs sharing those numbers belong to a different
project, and spec numbers are per-project.

### Amendment A — `wxBrand`, capture-from-a-built-product, and company-wide selection (2026-09-17)

The original scope specified a model, an ingest, an execution path and three enforcement paths, and assumed the input would be a hand-authored brand document like the reference one. Two things changed in review.

**The scope had no entrance.** Everything it built would have been called by nothing. `wxBrand` — a command and skill following the established naming pattern — is that entrance (FR-033), with four modes: capture, ingest, interview and execute.

**The primary input is a product, not a document.** Most customers have a working application whose brand is implicit in its rendered CSS, and no written specification at all. So the flow this scope serves is: capture what they built into a document, let them revise it, upload it, select it company-wide (FR-033, FR-033a, FR-036a–c). The reference document is the exception that proves the model, not the expected input.

Consequences recorded here because they changed decisions made earlier in the document:

- **A brand document is the sixth theme source**, not a parallel system (FR-032). This is a much smaller change than the original draft implied — the source enum and the derive routes already exist.
- **Capture reuses the shipped extraction path** (FR-033a) rather than introducing a second engine.
- **A captured brand has one mode** (FR-036a). An existing product has one look; alternative modes are never fabricated.
- **Capture must separate measured from inferred** (FR-036b). Rules and invariants are not visible in CSS, and a document that silently invented them would read as authoritative — the most dangerous artifact this scope could produce.
- **FR-007a is resolved, not open**: the company tier gains the carrier column, taking the migration from two tables to three. Open Question 7 is closed by this amendment.
- **FR-019 is narrowed, not contradicted.** The original "no network" rule was written for document ingest and would have forbidden capture outright. Parsing and validation stay offline and nothing is ever transmitted outward; capture reads a site the customer owns, under operator initiation, exactly as the shipped look-borrowing route already does.
- **The out-of-scope line on authoring was too broad.** A visual mode editor stays out; capture, interview and template authoring come in, because all three produce a document rather than manipulating a stored mode.

## Open Questions

1. **The resting mode fails AA on all three of its semantic colors** — measured at 2.82, 2.58 and 3.89 against their own background chips, two of them below even the large-text threshold. The source document exempts that mode from its own accessibility check and separately forbids changing it. Three resolutions: repair the foreground only and record the change; admit the values as a recorded, visible exception; or return the finding to the brand owner as a defect in version 1.0. Recommendation: store faithfully, report loudly, escalate — never silently alter.
2. **The identity bar is invisible in two of the six modes**, at 1.56 and 1.52 against their own rails, because those modes use a white or off-white rail while the identity color is fixed by invariant. The invariant and the acceptance check contradict each other. This belongs to the brand owner: either the invariant gains a light-rail exception, or the two modes accept an identity mark nobody can see.
3. **What perceptual distance counts as distinguishable?** A threshold of 20 in CIE76 admits the document's self-declared tightest case, which measures 21.1 and 24.2, while still failing the two modes that set identity and accent to the same value. Confirm the threshold and the color space before it is written into a gate.
4. **How should a mode relate to the light/dark axis?** The document says modes carry light values and the dark theme comes from the base tokens, but two modes are inherently dark and one is pure white. FR-008 requires an explicit declaration; the question is whether the three choices offered — light, dark, preference-following — are the right three.
5. ~~**Does version one need mode authoring in Theme Studio?**~~ **Closed by Amendment A.** Capture, interview and template authoring are in scope because they produce a document; a visual mode editor stays out.
6. ~~**Per project or per company?**~~ **Closed by Amendment A** — company-wide selection is the destination of the capture flow. Per-project application remains available through the existing path.
7. ~~**Which resolution tiers carry a schema?**~~ **Closed by Amendment A** — the company tier gains the carrier column (FR-007a). The migration touches three tables.
8. **`data-mode` versus the existing dead `data-theme`.** wxKanban already writes a `data-theme` attribute that nothing reads, alongside the `.dark` class that does the real work. The generated product should not inherit that ambiguity: confirm that the mode attribute is the single consumed selector and that no second, decorative attribute ships beside it.
9. ~~**How far should capture go on a product behind authentication?**~~ **Closed 2026-09-18 — capture never handles customer credentials.** It accepts a page it can reach or a rendered page the customer supplies, and how a customer makes a representative page available is their decision, outside this system. Credentialed capture is permanently excluded rather than deferred: accepting credentials would put customer authentication material inside a path whose entire value is that it only reads public rendering. Recorded rather than deleted because it changes what capture builds.
10. **What does capture do when a product's own palette fails AA?** The validation report will fire on the customer's existing product, not on an aspirational specification. Confirm that this reports and proceeds rather than blocking, since refusing to capture a product the customer is already shipping would be unhelpful.
