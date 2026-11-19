// One-off generator for the SCOPE-129 fan-out (SPEC-126..129).
// Writes the canonical kit file set per spec: spec.md, plan.md, tasks.md, tests.md,
// quickstart.md, lifecycle.json, checklists/requirements.md
// Idempotent — safe to re-run.  Usage: npx tsx scripts/gen-scope129-specs.mts
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

interface Task { title: string; description: string; priority: string; status: string; phase: string }
interface SpecDef {
  number: string;
  slug: string;
  specId: string;
  feature: string;
  overview: string;
  problem: string;
  primary: string;
  secondary: string;
  metrics: string[];
  inScope: string[];
  outScope: string[];
  openQuestions: string[];
  frs: { id: string; title: string; body: string }[];
  tasks: Task[];
  dataRequirements: string;
  apiRoutes: string;
  frontendComponents: string;
  integrationContext: string;
}

// WARNING: every task is emitted with status "todo". Re-running this AFTER
// implementation would revert the completion status recorded in tasks.md.
const SCOPE = "SCOPE-129";
const TODAY = "2026-09-18";

const specs: SpecDef[] = [
  {
    number: "126",
    specId: "c6678562-79f7-41c1-98d1-46de51ba5654",
    slug: "brand-schema-model-storage",
    feature: "Brand Schema Model and Storage",
    overview:
      "The data half of " + SCOPE + ". Introduces the BrandSchema object — a base theme, an extension token map, a typeface set, N named modes under a declared token contract, and the brand's rules as data — and gives it somewhere to live across all three theme resolution tiers. It also widens the accessibility report so that it looks where real brand failures occur. No ingest, no generation and no enforcement: this spec produces the model, the storage and the validator the other three specs depend on.",
    problem:
      "ThemeTokenSet carries exactly 19 shadcn tokens plus a radius and a single font family string. A real brand needs more: identity and rail colors, semantic status colors, several typefaces with distinct roles, and named alternative presentations. There is nowhere authoritative to put any of it.\n\nThe accessibility guard compounds this. tokenSetContrast checks exactly two pairs — foreground against background, and primary-foreground against primary. Measured against the reference brand both pass comfortably while three semantic colors fail badly, one of them at 2.58 against its own chip. A guard that reports success on a palette with three unreadable status colors is worse than no guard, because it ends the conversation.\n\nStorage is the third gap. Theme resolution has three tiers and only the project tier carries rich data; the company and default tiers resolve to a color-only bundle by construction. A brand meant to be selected company-wide therefore has nowhere to live.",
    primary: "the developer building the brand schema layer that every other spec in this fan-out consumes",
    secondary: "the consuming customer whose brand values must be stored exactly as specified, and the reviewer reading a validation report that must name real failures rather than reassure",
    metrics: [
      "SC-1: 100% of modes in a stored schema declare 100% of contract tokens; 0 schemas persist with a missing token",
      "SC-2: the widened contrast report names 12 contrast failures and 4 distinguishability failures in the reference corpus, against 0 found by the pre-existing two-pair report. Measured, not estimated",
      "SC-3: 100% of schema applications carry the schema into the resolved theme across both the insert path and the update path — 2 of 2 paths, because testing only the first application previously reported a false pass",
      "SC-4: 3 tables carry the brandschema column, so that 100% of company-wide selections resolve with modes intact and 0 resolve to a color-only bundle",
      "SC-5: 0 brand values altered by validation without an explicit recorded repair action",
      "SC-6: contrast verdicts are computed on the unrounded ratio, so 0 verdicts change when display rounding changes",
    ],
    inScope: [
      "The BrandSchema, ModeTokenSet, FaceSet and BrandRule types in a new shared module",
      "A contract validator: every mode declares every contract token, exactly one resting mode, closed-set enforcement",
      "A widened contrast report covering semantic and accent colors against both paper and their own chips",
      "A numeric distinguishability check using CIE76 colour distance with a stated threshold",
      "Validation of the light/dark axis declaration and of typeface fallback stacks",
      "A migration adding a nullable brandschema jsonb column to three tables",
      "Carry-across in the insert values, the conflict-update clause and the template update route",
      "Extension of theme resolution so the company tier returns a schema",
    ],
    outScope: [
      "Parsing a brand document, which belongs to spec 127",
      "Emitting CSS or any generated artifact, which belongs to spec 128",
      "Rule delivery, lints and the wxBrand entrance, which belong to spec 129",
      "Widening ThemeTokenSet, which would force re-derivation of 50 seeded catalog rows and every preset",
      "Repairing the reference brand's failing values — validation reports, it never silently alters",
      "Any user interface; this spec is model, storage and validator only",
    ],
    openQuestions: [
      "Confirm the CIE76 distance threshold of 20. The reference document's self-declared tightest case measures 21.1 and 24.2, so 20 admits what it intends while still failing the two modes that set identity and accent to the same value.",
      "Confirm that the three light/dark declarations offered — light, dark and preference-following — are the right three.",
      "Should a schema carry a version field so that a re-captured brand can be diffed against its predecessor, or is replacement sufficient for a first release?",
    ],
    frs: [
      { id: "FR-001", title: "The BrandSchema model", body: "A shared module defines BrandSchema carrying base, extensions, typefaces, modes, contract, closed and rules. ThemeTokenSet is imported unchanged and never modified. Implements " + SCOPE + " FR-001 and FR-002." },
      { id: "FR-002", title: "The token contract is data", body: "The contract is a list of token names carried by the schema, not a constant. Nothing in the implementation hardcodes a mode count or a token count. Implements " + SCOPE + " FR-003." },
      { id: "FR-003", title: "Incomplete modes are rejected", body: "Validation fails naming the mode and every missing token. A missing token is never inherited from another mode, from the base theme, or from a default. Satisfies SOC 2 CC6.1 input validation. Implements " + SCOPE + " FR-004." },
      { id: "FR-004", title: "Exactly one resting mode", body: "A schema declares one resting mode. Zero or more than one fails validation. Implements " + SCOPE + " FR-005." },
      { id: "FR-005", title: "Closed sets are enforced", body: "Adding a mode to a schema marked closed fails and says so. An open schema accepts additions. Implements " + SCOPE + " FR-006." },
      { id: "FR-006", title: "The contrast report is widened", body: "The report covers each semantic color against both its surface and its own background chip, and the accent color against its surface. Accent is the link and primary-action color and its omission is what allowed two modes to go unchecked. Implements " + SCOPE + " FR-010." },
      { id: "FR-007", title: "Comparison is on the unrounded ratio", body: "A ratio is compared to its threshold before any rounding for display. One measured value in the reference corpus lands on 4.50, inside the noise of two-decimal rounding, and a verdict that depends on presentation rounding is not deterministic. Implements " + SCOPE + " FR-011." },
      { id: "FR-008", title: "Distinguishability is numeric", body: "A CIE76 distance check with a stated threshold replaces the untestable phrase it implements. Two modes in the reference corpus set identity and accent to the same value, a distance of zero. Implements " + SCOPE + " FR-013 and FR-014." },
      { id: "FR-009", title: "Values are stored exactly as specified", body: "Validation reports failures and never alters a stored value. Any repair is explicit, recorded, and repairs a foreground rather than a brand hue. Implements " + SCOPE + " FR-012." },
      { id: "FR-010", title: "Three tables carry the schema", body: "A nullable brandschema jsonb column is added to themetemplates, projectthemes and companythemeprofiles. The company tier is included because company-wide selection is the destination of the capture flow. Implements " + SCOPE + " FR-007 and FR-007a." },
      { id: "FR-011", title: "Carry-across is written in every path", body: "The schema is carried in the insert values, in the conflict-update set clause, and in the template update route. Missing any one produces an interface that looks correct while the resolved theme silently loses the schema. Implements " + SCOPE + " FR-007." },
      { id: "FR-012", title: "Schema changes are applied by hand and recorded", body: "The migration is reviewed, applied manually and recorded in the schema change log. Automatic schema reconciliation is prohibited against this database. Satisfies SOC 2 CC8.1 change management." },
    ],
    tasks: [
      { title: "T001 — BrandSchema model in src/shared/brand-schema.ts", description: "Define BrandSchema, ModeTokenSet, FaceSet and BrandRule. Import ThemeTokenSet unchanged from theme-tokens.ts; do not modify it. Export type guards.", priority: "high", status: "todo", phase: "Phase A — Model and validation" },
      { title: "T002 — Contract validator", description: "Every mode declares every contract token; exactly one resting mode; closed-set enforcement. Errors name the mode and every missing token. No inheritance, no defaults.", priority: "high", status: "todo", phase: "Phase A — Model and validation" },
      { title: "T003 — Widened contrast report", description: "Extend the report to semantic and accent colors against both paper and their own chips. Reuse contrastRatio and meetsAA. Compare on the unrounded ratio.", priority: "high", status: "todo", phase: "Phase A — Model and validation" },
      { title: "T004 — CIE76 distinguishability check", description: "Implement perceptual distance with the threshold as a named exported constant. Must fail the zero-distance identity/accent pairs in the reference corpus.", priority: "high", status: "todo", phase: "Phase A — Model and validation" },
      { title: "T005 — Axis and typeface validation", description: "Every mode declares light, dark or preference-following. Every typeface role declares a fallback stack. Both are validation errors when absent.", priority: "medium", status: "todo", phase: "Phase A — Model and validation" },
      { title: "T006 — Migration adding brandschema to three tables", description: "Nullable jsonb on themetemplates, projectthemes and companythemeprofiles. Reviewed SQL, applied by hand, recorded in the schema change log. Never use automatic schema push.", priority: "high", status: "todo", phase: "Phase B — Storage and resolution" },
      { title: "T007 — Drizzle schema definitions for the three tables", description: "Add the typed column to each schema file. Verify with the drift check that every declared table still exists.", priority: "high", status: "todo", phase: "Phase B — Storage and resolution" },
      { title: "T008 — Carry-across in every write path", description: "Insert values, conflict-update set clause, and the template update route. This is the path that previously degraded silently; all three are required.", priority: "high", status: "todo", phase: "Phase B — Storage and resolution" },
      { title: "T009 — Company-tier resolution", description: "Extend resolveTheme so the company tier returns a schema instead of a color-only bundle, preserving existing tier precedence.", priority: "high", status: "todo", phase: "Phase B — Storage and resolution" },
      { title: "T010 — Tests including the reference contrast fixture", description: "Assert the widened report FAILS the reference brand's three semantics and two accents. Those failures are the fixture; a report that passes them is broken. Also assert both apply paths carry the schema.", priority: "high", status: "todo", phase: "Phase C — Verification" },
    ],
    dataRequirements:
      "One additive migration: a nullable `brandschema` jsonb column on `themetemplates`, `projectthemes` and `companythemeprofiles`. Both of the first two already carry the precedent for this shape from the design-system carrier columns, and each inherits existing tenant isolation rather than introducing a new boundary. No new table: a brand belongs to a company, and the company-scoped gallery already holds named looks. The global curated catalog is deliberately read-only and is the wrong home for a single tenant's brand. Schema changes are applied by hand and recorded in the schema change log.",
    apiRoutes:
      "No new routes. This spec changes what theme resolution returns, so the existing resolution and apply endpoints gain the schema in their payloads. The import route belongs to spec 127.",
    frontendComponents:
      "None. This spec is model, storage and validator only; the read-only schema view belongs with the surface work.",
    integrationContext:
      "Extends the shipped theme model beside `ThemeTokenSet` without widening it, and reuses the existing contrast and repair helpers rather than reimplementing them. Must align with the carrier-chain discipline established by the design-system catalog, where a value that is not written in every persistence path degrades silently while the interface still looks correct.",
  },
  {
    // Renumbered 127 -> 130 on 2026-09-20. `127` in this project's DATABASE already belonged to
    // SCOPE-127 (test pipeline stack adapters), pushed 2026-08-22 with 19 tasks. Choosing a spec
    // number from `ls specs/` cannot see that: it has no folder on disk. Always check the DB.
    number: "130",
    specId: "PENDING-130",
    slug: "brand-document-capture-ingest",
    feature: "Brand Document Capture and Ingest",
    overview:
      "The input half of " + SCOPE + ". Most customers have no written brand specification; they have a working application whose brand is implicit in its rendered styling. This spec captures that product into a brand instruction document, publishes the format so the document is never guessed at, parses a completed document deterministically, and presents a validation report before anything is stored. It produces documents and parsed schemas; it does not generate artifacts or enforce rules.",
    problem:
      "There is no way to get a brand into the system. The existing derive routes produce a color-only theme from a gallery reference, a prompt, a logo or a live site — useful, but a long way short of a brand: no modes, no typeface roles, no rules, and nothing a customer can read or revise.\n\nAsking customers to author a specification from nothing does not work either. The reference document received from one customer is unusually complete, and treating it as the expected input would be a mistake — it is the exception. A customer with a running product has the raw material already, but no path from it to a structured brand.\n\nThe format itself is the third gap. A customer who must infer a format from one example will produce something a deterministic parser cannot read, and a parser written against a reference nobody re-checks inherits the drift that has already occurred once on this codebase with a design format that no real file matched.",
    primary: "the consuming customer whose built product is the source of their brand",
    secondary: "the operator running capture on the customer's behalf, and the developer maintaining the parser against a published format",
    metrics: [
      "SC-1: 100% of captured documents parse cleanly on their first pass through the ingest they were generated for, because both sides are ours",
      "SC-2: 0 rule sections fabricated by capture — every section not measurable from a rendered product is emitted as an unanswered prompt",
      "SC-3: the reference corpus parses to exactly 6 modes of 41 contract tokens each, with 0 missing and 0 extra",
      "SC-4: 100% of parser rejections name both the offending content and its location, with 0 partial imports",
      "SC-5: 100% of imports present the validation report before the schema is committed",
      "SC-6: 1 mode is produced by capture, never more, because a built product has one look",
    ],
    inScope: [
      "A brand instruction format reference written from the real document",
      "A fillable template shipped as a real artifact for customers to complete",
      "A deterministic parser for tokens, modes, typefaces and rules, with no language model anywhere in the path",
      "Loud rejection of unrecognized structure, naming the content and its location",
      "Capture: extending the shipped rendered-styling extraction to emit a complete document",
      "Explicit separation of what was measured from what was inferred, with unanswered prompts for the rest",
      "An import route that reports before it stores",
      "The reference document committed as a regression corpus",
    ],
    outScope: [
      "The schema model, validator and storage, which belong to spec 126",
      "Generating CSS or any artifact from a stored schema, which belongs to spec 128",
      "The wxBrand command and skill surface, which belong to spec 129",
      "Credentialed capture, and any handling of customer authentication material — permanently excluded, not deferred",
      "Fabricating alternative modes; capture yields the one look a built product has",
      "Following any reference site or code kit named inside a brand document",
    ],
    openQuestions: [
      "Resolved: capture never handles customer credentials. It accepts a reachable page or a rendered page the customer supplies, and how the customer produces either is theirs to decide. Recorded here because the question was asked and the answer changes what T005 builds.",
      "What should capture do when the captured product's own palette fails the accessibility checks? The recommendation is to report and proceed, since refusing to capture a product the customer already ships would be unhelpful.",
      "Should capture attempt a dark counterpart when a product declares only one, or leave the axis declaration to the reviewer?",
    ],
    frs: [
      { id: "FR-001", title: "The format reference precedes the parser", body: "The brand instruction format is written down, derived from the real document, before any parser is authored against it. A format reference that had already drifted from every real file on disk has occurred once on this codebase. Implements " + SCOPE + " FR-015." },
      { id: "FR-002", title: "The template is a shipped artifact", body: "A fillable template carries the token contract, the mode table, the typeface roles and the rule sections. The quality of one received document is not evidence that the next will match it. Implements " + SCOPE + " FR-034." },
      { id: "FR-003", title: "Ingest is deterministic", body: "The parser uses no language model. The document structure is regular and machine-verifiable, and a deterministic parser is immune to the provider fragility that has affected an earlier scope here. Implements " + SCOPE + " FR-016." },
      { id: "FR-004", title: "Unrecognized structure is rejected and named", body: "An unknown section, an unparseable mode block or an unexpected token is an error naming the content and its location. Nothing is skipped, coerced or partially imported. Satisfies SOC 2 CC6.1 fail-safe defaults. Implements " + SCOPE + " FR-017." },
      { id: "FR-005", title: "Capture reuses the shipped extraction path", body: "Capture extends the existing rendered-styling extraction rather than introducing a second engine. What is new is the output: a complete document rather than a color-only theme. Implements " + SCOPE + " FR-033a." },
      { id: "FR-005a", title: "Capture never handles customer credentials", body: "Capture accepts exactly two inputs: a page it can reach, or a rendered page the customer supplies. It never accepts, stores, forwards or replays a customer credential, and never authenticates against a customer system. How a customer makes a representative page available is their decision and outside this system. This is a permanent boundary rather than a deferred feature: accepting credentials would place customer authentication material inside a capture path whose entire value is that it only reads public rendering. Satisfies SOC 2 CC6.1." },
      { id: "FR-006", title: "A captured brand starts with one mode", body: "A built product has one look, so capture yields a base brand and a single resting mode and never fabricates alternatives. Implements " + SCOPE + " FR-036a." },
      { id: "FR-007", title: "Capture states what it inferred", body: "A generated document distinguishes what was measured from what was defaulted, and emits every underivable rule section as an explicit unanswered prompt rather than plausible filler. A document that silently invented rules would read as authoritative, which makes it the most dangerous artifact this work could produce. Implements " + SCOPE + " FR-036b." },
      { id: "FR-008", title: "Every path produces a document", body: "Capture, interview and template all emit a document the customer owns and can revise, which then enters through the same ingest. No path writes a schema directly. Implements " + SCOPE + " FR-036." },
      { id: "FR-009", title: "Ingest reports before it stores", body: "The validation report — contract coverage, contrast with measured ratios, distinguishability, fallback stacks and axis declarations — is presented before the schema is committed. Implements " + SCOPE + " FR-035." },
      { id: "FR-010", title: "Parsing is offline and nothing is sent outward", body: "Ingest, parsing and validation are entirely offline and no reference site named inside a document is ever followed. Capture is the one network action, is operator-initiated against a site the customer owns, and only reads. No document, token set or source file is transmitted to any external service. Implements " + SCOPE + " FR-019." },
      { id: "FR-011", title: "The reference document is the regression corpus", body: "The document is committed as the parser's fixture, asserting its measured shape of six modes and 41 contract tokens with complete coverage. Implements " + SCOPE + " FR-018." },
    ],
    tasks: [
      { title: "T001 — Brand instruction format reference", description: "Write the format down from the real document before any parser exists. Cover the token contract block, per-mode blocks, typeface roles and rule sections.", priority: "high", status: "todo", phase: "Phase A — Format and parser" },
      { title: "T002 — Fillable brand instruction template", description: "Ship a real template artifact a customer can complete, matching the format reference exactly.", priority: "high", status: "todo", phase: "Phase A — Format and parser" },
      { title: "T003 — Deterministic parser: tokens, modes, typefaces", description: "Parse the contract block and per-mode blocks. No language model. Assert mode/token counts against the declared contract.", priority: "high", status: "todo", phase: "Phase A — Format and parser" },
      { title: "T004 — Parser: rules extraction and loud rejection", description: "Extract rule sections into structured BrandRule data. Reject unknown structure naming content and location. No partial imports.", priority: "high", status: "todo", phase: "Phase A — Format and parser" },
      { title: "T005 — Capture: extend rendered-styling extraction to emit a document", description: "Reuse the shipped headless extraction. Accept a reachable page OR a customer-supplied rendered page — never a credential. Emit a complete brand instruction document rather than a color-only theme.", priority: "high", status: "todo", phase: "Phase B — Capture" },
      { title: "T006 — Capture: measured versus inferred separation", description: "Mark every value as measured or defaulted. Emit every underivable rule section as an explicit unanswered prompt. Never fabricate a rule.", priority: "high", status: "todo", phase: "Phase B — Capture" },
      { title: "T007 — Capture: single resting mode", description: "Produce exactly one mode. Assert that no alternative modes are ever synthesized from a single captured look.", priority: "medium", status: "todo", phase: "Phase B — Capture" },
      { title: "T008 — Import route reporting before store", description: "Accept a document, parse, validate, return the report, and commit only on acceptance. Tenant-scoped through the existing project-in-company check.", priority: "high", status: "todo", phase: "Phase C — Ingest and verification" },
      { title: "T009 — Reference corpus regression test", description: "Commit the reference document as a fixture. Assert exactly 6 modes of 41 contract tokens, 0 missing and 0 extra.", priority: "high", status: "todo", phase: "Phase C — Ingest and verification" },
      { title: "T010 — Capture-to-parse round trip test", description: "Assert a captured document parses cleanly through the ingest it was generated for. A generator and parser that disagree about their shared format is the defect this catches.", priority: "high", status: "todo", phase: "Phase C — Ingest and verification" },
    ],
    dataRequirements:
      "No schema change; this spec writes through the model defined in spec 126. The brand instruction document and the generated template are files, and the reference document is committed as a test fixture. A captured document is returned to the operator rather than persisted server-side until it is accepted.",
    apiRoutes:
      "An import route accepting a brand instruction document and returning the parsed schema with its validation report, tenant-scoped through the existing project-in-company check. Capture extends the shipped rendered-styling extraction route rather than adding a parallel one.",
    frontendComponents:
      "A review surface for the validation report shown before a schema is committed. The capture and ingest flow is otherwise operator-driven through the command surface in spec 129.",
    integrationContext:
      "Capture extends the existing look-borrowing extraction, which already drives a headless browser over a live site. The document-ingest pattern follows the established convention for treating a supplied markdown file as authoritative source material. Parsing follows the deterministic pack-parser precedent, which keeps a language model out of the path entirely.",
  },
  {
    number: "128",
    specId: "8f5f4a0e-e5b0-4962-956e-eaab39aa2395",
    slug: "brand-execution-artifact-generation",
    feature: "Brand Execution and Artifact Generation",
    overview:
      "The output half of " + SCOPE + ". Turns a stored brand schema into real files for the customer's generated product: per-mode stylesheets scoped so they cannot leak, one font request covering every face in every mode, a resting mode written into the base stylesheet so a failed mode layer never yields an unstyled application, and server-side emission so the chosen mode is present before first paint. It extends the existing theme bundle rather than adding a parallel one.",
    problem:
      "The shipped bundle endpoint emits a stylesheet, Tailwind configuration, a component theme, control files and a design document — all from a single light and dark token set. It has no concept of a named mode, so a schema carrying several of them has no route to the customer's product.\n\nThree failure modes must be designed out rather than discovered. Mode tokens emitted to the document root would leak beyond the shell and take the base brand down with them if the mode layer failed. A mode layer that initialises in the browser produces a visible reskin on every page load, which reads as a defect. And a font request built per mode multiplies requests across a set that shares most of its faces.\n\nThe application this serves also runs on a workshop wall and on a phone in a yard, so an unstyled fallback or a flash of the wrong palette is not a cosmetic concern.",
    primary: "the consuming customer receiving generated stylesheets and components for their own product",
    secondary: "the developer integrating those artifacts, and the operator executing a stored schema",
    metrics: [
      "SC-1: 0 mode tokens emitted to the document root, verified by inspecting generated output rather than by reading the renderer",
      "SC-2: 1 font request covers every declared face across every mode, rather than one request per mode",
      "SC-3: 100% of pages render fully styled in the resting mode with the mode layer disabled and with scripting disabled",
      "SC-4: 0 reskin repaints after first paint, with the resolved mode present in the initial response on 100% of loads",
      "SC-5: 100% of declared modes appear in the generated stylesheet, with 0 dropped between storage and output",
      "SC-6: 4 acceptance checks that require a browser are emitted as a human-test checklist rather than counted as automated",
    ],
    inScope: [
      "Per-mode stylesheet emission scoped to the shell root",
      "A single combined font request spanning every face in every mode",
      "The resting mode written into the base stylesheet as the guaranteed fallback",
      "The shell contract and server-side emission of the resolved mode into the initial response",
      "Extension of the existing theme bundle endpoint and its artifact set",
      "A human-test checklist covering every acceptance check a machine cannot decide",
    ],
    outScope: [
      "The schema model, validator and storage, which belong to spec 126",
      "Capture, the document format and ingest, which belong to spec 127",
      "Lints, rule delivery and the wxBrand entrance, which belong to spec 129",
      "Re-skinning wxKanban's own interface; execution targets the customer's generated product",
      "Runtime mode-switching animation or transition",
      "Bundling or redistributing any font binary",
    ],
    openQuestions: [
      "The generated product should not inherit wxKanban's own ambiguity, where a data-theme attribute is written but never read while a class does the real work. Confirm that the mode attribute is the single consumed selector and that no second decorative attribute ships beside it.",
      "Should the generated artifacts include a worked integration example showing the shell contract in place, or is the contract description sufficient?",
      "For a schema with one mode, should the per-mode block be emitted at all, or collapse into the base stylesheet alone?",
    ],
    frs: [
      { id: "FR-001", title: "Mode tokens never reach the document root", body: "Emitted mode tokens are scoped to the shell root, so a mode cannot leak beyond the shell and the base brand survives intact if the mode layer fails. Implements " + SCOPE + " FR-020." },
      { id: "FR-002", title: "One font request covers every face", body: "Emission produces a single request spanning all declared faces across all modes. Faces are hosted only from the declared host and no font binary is bundled or redistributed. Implements " + SCOPE + " FR-021." },
      { id: "FR-003", title: "The resting mode is in the base stylesheet", body: "The resting mode's values appear in the base stylesheet so the shell renders correctly when the mode layer does not initialise. A failed mode load never produces an unstyled application. Implements " + SCOPE + " FR-022." },
      { id: "FR-004", title: "The mode is emitted server-side", body: "The resolved mode is present in the shell's first response rather than applied by a client after paint, because a reskin flash on every load reads as a defect. Implements " + SCOPE + " FR-023." },
      { id: "FR-005", title: "The existing bundle is extended, not duplicated", body: "Mode emission extends the shipped bundle endpoint and its renderers. No parallel generation path is introduced." },
      { id: "FR-006", title: "Every declared mode survives to output", body: "A schema carrying several modes emits all of them. A mode dropped between storage and output is a defect, and is measured by counting modes in the generated stylesheet rather than trusting the renderer." },
      { id: "FR-007", title: "Non-mechanical checks become a checklist", body: "Acceptance checks requiring a browser or a rendered comparison — that every declared face loads and falls back to its named stack, that switching mode changes no content, that the shell renders without scripting, and that the tightest mode is legible on the physical screen it was built for — are emitted as an explicit checklist rather than claimed as automated. Implements " + SCOPE + " FR-029." },
    ],
    tasks: [
      { title: "T001 — Per-mode stylesheet emission scoped to the shell root", description: "Emit one block per declared mode, scoped to the shell root. Assert no mode token reaches the document root.", priority: "high", status: "todo", phase: "Phase A — Emission" },
      { title: "T002 — Combined font request across all modes", description: "Build one request spanning every declared face in every mode. No per-mode requests, no bundled binaries.", priority: "high", status: "todo", phase: "Phase A — Emission" },
      { title: "T003 — Resting mode in the base stylesheet", description: "Write the resting mode's values into the base stylesheet as the guaranteed fallback for a failed mode layer.", priority: "high", status: "todo", phase: "Phase A — Emission" },
      { title: "T004 — Shell contract and server-side mode emission", description: "Resolve the mode server-side and emit it into the initial response. No client-side application after paint.", priority: "high", status: "todo", phase: "Phase A — Emission" },
      { title: "T005 — Extend the theme bundle endpoint", description: "Add mode blocks, the combined font request and the shell contract to the existing bundle. Do not add a parallel generation path.", priority: "high", status: "todo", phase: "Phase B — Bundle integration" },
      { title: "T006 — Extend Tailwind and component theme artifacts for modes", description: "Carry mode awareness into the generated configuration and component theme so the artifacts agree with the stylesheet.", priority: "medium", status: "todo", phase: "Phase B — Bundle integration" },
      { title: "T007 — Generation tests", description: "Assert 0 mode tokens at the document root, 1 font request, every declared mode present in output, and the resting mode rendering with the mode layer disabled.", priority: "high", status: "todo", phase: "Phase C — Verification" },
      { title: "T008 — Human-test checklist artifact", description: "Emit the four browser-dependent acceptance checks as an explicit checklist shipped with the bundle. Do not count them as automated.", priority: "medium", status: "todo", phase: "Phase C — Verification" },
    ],
    dataRequirements:
      "No schema change. This spec reads a stored schema and writes generated artifacts, which are returned to the customer as files rather than persisted as new records.",
    apiRoutes:
      "Extends the existing theme execute endpoint. No new route: mode blocks, the combined font request and the shell contract are added to the artifact set the endpoint already returns.",
    frontendComponents:
      "None in wxKanban's own interface. The generated components are output for the customer's product, which is a deliberate boundary: execution targets the customer's generated product and never re-skins this application.",
    integrationContext:
      "Extends the shipped bundle renderers rather than duplicating them. Must respect the established position that generated artifacts belong to the customer's product, and must not introduce the ambiguity this application carries internally, where an attribute is written on the document root but never read while a class does the real work.",
  },
  {
    number: "129",
    specId: "359531c4-4968-497d-be83-96015db818fa",
    slug: "wxbrand-entrance-rule-enforcement",
    feature: "wxBrand Entrance and Rule Enforcement",
    overview:
      "The entrance and the teeth of " + SCOPE + ". Supplies the wxBrand command and skill through which every other part of this fan-out is reached, carries the brand's rules into design, implementation and review, and adds the two mechanical lints that make a brand hold across a large surface. It also makes an active brand announce itself, so that a working rules pipeline can be told apart from a dead one.",
    problem:
      "Without this spec the other three build a model, a parser, a validator and a generator that nothing ever calls. That is not a hypothetical risk on this codebase: it has shipped a gate switched off, a welcome message that was inert, and a compliance context that loaded for nobody. In each case the code was correct and unreachable, and in each case nothing said so.\n\nThe brand's rules are the second gap. Its non-negotiables, invariants and prohibitions are constraints on generated code rather than colour values — identity colour never becomes a primary action, a mode never reassigns what a critical state means, no component holds a style literal. The only mechanism carrying any of this today is a person reading a document and remembering. Across roughly a hundred and ninety screens that mechanism has a known failure rate, and the failure is silent.\n\nThe design step is disconnected as well: the design skill reads a stylesheet or the live theme API and has no awareness of the schema layer at all.",
    primary: "the operator running wxBrand to capture, ingest, review or execute a brand",
    secondary: "the AI implementation agent receiving rules as build context, the reviewer running the code review skill against a diff, and the developer whose component is rejected for holding a style literal",
    metrics: [
      "SC-1: 100% of rule-consuming runs in a schema-bearing project state that a schema is active and name it",
      "SC-2: 100% of declared-but-missing schemas produce an explicit statement rather than proceeding as though unbranded",
      "SC-3: 0 style literals in the generated component layer outside token blocks, and 0 structural properties set by a mode selector",
      "SC-4: 4 wxBrand modes are reachable — capture, ingest, interview and execute — with capture as the documented primary path",
      "SC-5: 0 divergence between skill mirrors after a rule-delivery change, verified by comparison",
      "SC-6: 100% of UI-bearing tasks in a schema-bearing project receive the applicable rules as build context",
    ],
    inScope: [
      "The wxBrand command and skill, in every mirror, with capture as the primary mode",
      "An explicit decision on whether a hosted prompt twin is required, before the command is written",
      "Rules stored as data with a mechanical flag, delivered to implement as build context",
      "Rule delivery to the design skill, crossing its current unawareness of the schema layer",
      "Rule delivery to the code review skill as review criteria",
      "A lint rejecting any structural property set by a mode selector",
      "A lint rejecting any style literal in a component outside the token blocks",
      "An announcement on every run where a schema is active or declared but missing",
    ],
    outScope: [
      "The schema model, validator and storage, which belong to spec 126",
      "Capture, the document format and ingest mechanics, which belong to spec 127",
      "Artifact generation, which belongs to spec 128",
      "A visual mode editor; wxBrand produces and ingests documents rather than manipulating stored modes directly",
      "Repairing the existing absence of a hosted prompt twin for the design skill, which is its own defect",
      "Enforcing brand rules on wxKanban's own interface",
    ],
    openQuestions: [
      "Does wxBrand require a hosted prompt twin, or is kit-side markdown sufficient? The two answers have different release mechanics, and the registry currently has no twin for the design skill, which is why this is written down rather than assumed.",
      "Should the style-literal lint run as a blocking gate or as an advisory report in its first release? Blocking is the eventual intent; starting advisory would surface the true violation count on real code first.",
      "Should rule delivery be scoped to rules flagged as mechanically checkable, or should the full rule set including narrative invariants reach the implementation agent?",
    ],
    frs: [
      { id: "FR-001", title: "wxBrand is the entrance", body: "A command and skill provide the operator-facing entrance in four modes: capture a built product, ingest a completed document, interview to produce one, and execute a stored schema. Capture is the primary mode. Implements " + SCOPE + " FR-033." },
      { id: "FR-002", title: "The delivery channel is decided before the command is written", body: "Whether a hosted prompt twin is required is settled explicitly, because kit-side markdown ships with no redeploy while a hosted prompt requires regenerating the registry and redeploying. Implements " + SCOPE + " FR-037." },
      { id: "FR-003", title: "Rules are data with a mechanical flag", body: "Each rule carries an identifier, its text, its kind and whether it is mechanically checkable. The flag is what allows an honest split between what a gate decides and what a person must look at. Implements " + SCOPE + " FR-026." },
      { id: "FR-004", title: "Rules reach implementation and design", body: "For a UI-bearing task in a schema-bearing project the applicable rules are supplied as build context and the resolved tokens are available to the design step. This crosses the design skill's current unawareness of the schema layer. Implements " + SCOPE + " FR-027." },
      { id: "FR-005", title: "Rules reach review", body: "The same rules are supplied to the review skill as review criteria, so drift is caught against the diff as well as at authoring time. Implements " + SCOPE + " FR-028." },
      { id: "FR-006", title: "No structural property varies by mode", body: "A lint fails any mode selector setting display, grid template, order, position or content. This is the only violation that would let two modes disagree about what a screen contains. Implements " + SCOPE + " FR-024." },
      { id: "FR-007", title: "No style literal in a component", body: "A lint fails any component carrying a colour literal, a pixel radius, a row height or a font stack, exempting the token blocks. This is the check that makes a brand hold across every surface rather than the handful that were looked at. Implements " + SCOPE + " FR-025." },
      { id: "FR-008", title: "An active or missing schema announces itself", body: "Every run that consumes brand rules states whether a schema is active and names it, and states plainly when one is declared but could not be resolved. A silent rules pipeline cannot be distinguished from a dead one. This requirement is the counterweight to a recorded pattern of shipping inert features and must not be trimmed as noise. Implements " + SCOPE + " FR-030." },
      { id: "FR-009", title: "Skill changes land in every mirror", body: "Changes are applied to every on-disk copy and the copies are compared afterward. Mirrors of another skill here drifted apart silently and were diagnosed only after the divergence was measured. Implements " + SCOPE + " FR-031." },
    ],
    tasks: [
      { title: "T001 — Delivery channel decision", description: "Decide and record whether wxBrand needs a hosted prompt twin. This gates T002 and T003 because it changes release mechanics.", priority: "high", status: "todo", phase: "Phase A — Entrance" },
      { title: "T002 — wxBrand command in every mirror", description: "Author the command following the established naming and structure. Apply to every mirror and compare afterward.", priority: "high", status: "todo", phase: "Phase A — Entrance" },
      { title: "T003 — wxBrand skill in every mirror", description: "Four modes: capture (primary), ingest, interview, execute. Document the boundary against the design skill and the theme surfaces.", priority: "high", status: "todo", phase: "Phase A — Entrance" },
      { title: "T004 — Rules as data with a mechanical flag", description: "Structure rules as identifier, text, kind and mechanical flag. The flag drives the split between gate and checklist.", priority: "high", status: "todo", phase: "Phase B — Rule delivery" },
      { title: "T005 — Rule delivery to implement", description: "Supply applicable rules as build context for UI-bearing tasks in a schema-bearing project.", priority: "high", status: "todo", phase: "Phase B — Rule delivery" },
      { title: "T006 — Rule delivery to the design skill", description: "Cross the design skill's current unawareness of the schema layer so designs compose against real brand tokens and rules.", priority: "high", status: "todo", phase: "Phase B — Rule delivery" },
      { title: "T007 — Rule delivery to the code review skill", description: "Supply rules as review criteria so drift is caught on the diff.", priority: "medium", status: "todo", phase: "Phase B — Rule delivery" },
      { title: "T008 — Structural-property lint", description: "Fail any mode selector setting display, grid template, order, position or content. Name the selector and the property.", priority: "high", status: "todo", phase: "Phase C — Lints and announcement" },
      { title: "T009 — Style-literal lint", description: "Fail any component carrying a colour literal, pixel radius, row height or font stack, exempting token blocks. Name the file and the literal.", priority: "high", status: "todo", phase: "Phase C — Lints and announcement" },
      { title: "T010 — Schema announcement", description: "State on every rule-consuming run whether a schema is active and name it, and state plainly when one is declared but unresolved. Do not trim this as noise.", priority: "high", status: "todo", phase: "Phase C — Lints and announcement" },
      { title: "T011 — Mirror parity verification", description: "Compare every skill and command copy after the change and assert zero divergence.", priority: "medium", status: "todo", phase: "Phase C — Lints and announcement" },
    ],
    dataRequirements:
      "No schema change. Rules are carried within the schema defined in spec 126. The per-developer state this spec introduces, if any, is local and excluded from version control.",
    apiRoutes:
      "No new routes. This spec changes developer tooling and generated-code checks rather than server behaviour.",
    frontendComponents:
      "None in the product. This spec changes the command surface, the skills and the lints. This is worth stating plainly because the spec concerns how screens get built, and a reader will reasonably expect application interface here.",
    integrationContext:
      "Touches the implementation command, the design skill and the code review skill, each of which exists in more than one on-disk copy. The design skill currently has no awareness of the schema layer at all, so that gap is crossed deliberately rather than assumed. Whether a hosted prompt twin is required changes the release mechanics and is decided before the command is written, because the registry already has a missing twin for the design skill.",
  },
];

function specMd(s: SpecDef): string {
  const L: string[] = [];
  L.push("# Spec " + s.number + ": " + s.feature, "");
  L.push("**Spec Number**: " + s.number);
  L.push("**Parent Scope**: " + SCOPE + " — Executable Brand Schema (Multi-Mode)");
  L.push("**Status**: `draft`");
  L.push("**Created**: " + TODAY);
  L.push("**Source**: `specs/Project-Scope/129-executable-brand-schema.md`", "");
  L.push("---", "");
  L.push("## Overview", "", s.overview, "");
  L.push("## Business Problem", "", s.problem, "");
  L.push("## Actors", "");
  L.push("- Primary: " + s.primary);
  L.push("- Secondary: " + s.secondary, "");
  L.push("## Success Metrics", "");
  for (const m of s.metrics) L.push("- " + m);
  L.push("");
  L.push("## Scope Boundary", "", "In scope:", "");
  for (const i of s.inScope) L.push("- " + i);
  L.push("");
  L.push("## Out of Scope", "");
  for (const o of s.outScope) L.push("- " + o);
  L.push("");
  L.push("## Open Questions", "");
  s.openQuestions.forEach((q, i) => L.push(String(i + 1) + ". " + q));
  L.push("");
  L.push("## Functional Requirements", "");
  for (const f of s.frs) {
    L.push("### " + f.id + " — " + f.title, "", f.body, "");
  }
  L.push("## Data Requirements", "", s.dataRequirements, "");
  L.push("## API Routes", "", s.apiRoutes, "");
  L.push("## Frontend Components", "", s.frontendComponents, "");
  L.push("## Integration Context", "", s.integrationContext, "");
  return L.join("\n");
}

function planMd(s: SpecDef): string {
  return [
    "# Plan: " + s.feature,
    "",
    "**Spec**: " + s.number + " · **Parent Scope**: " + SCOPE + " · **Created**: " + TODAY,
    "",
    "## Approach",
    "",
    s.overview,
    "",
    "## Technical Context",
    "",
    "Stack is unchanged from the project's declared stack: Express on Node, React with Vite, PostgreSQL",
    "with Drizzle, Tailwind with a component library, and structured logging. This spec introduces no new",
    "runtime dependency.",
    "",
    "## Constraints",
    "",
    "- TypeScript throughout, with no escape hatches and no suppressed type errors.",
    "- Schema changes are applied by hand and recorded; automatic schema reconciliation is prohibited.",
    "- Every top-level declaration is fenced by the orchestrator; fences are never hand-authored.",
    "- Modify-heavy edits are made directly rather than through the generator path, which corrupts",
    "  non-ASCII characters in the files it rewrites.",
    "- Router-only and test files with no top-level declaration are rejected by the fencer and are",
    "  written directly.",
    "",
    "## Task Sequence",
    "",
    ...s.tasks.map((t) => "- " + t.title + " — " + t.description),
    "",
    "## Risks",
    "",
    "- A requirement that is satisfied in code but never reached in practice. Every spec in this",
    "  fan-out is checked for reachability, not only for correctness.",
    "- Silent degradation across a write path that was not exercised. Where a value travels through",
    "  more than one persistence path, every path is tested.",
    "",
    "## Open Questions",
    "",
    ...s.openQuestions.map((q, i) => String(i + 1) + ". " + q),
    "",
  ].join("\n");
}

// Matches the canonical kit shape that `implement <spec>/<Tnnn>` parses:
//   - [ ] **T001** — Title · `priority`
//         indented description
function tasksMd(s: SpecDef): string {
  const L = [
    "# Tasks: " + s.feature,
    "",
    "**Spec**: " + s.number,
    "**Spec ID**: `" + s.specId + "`",
    "**Parent Scope**: " + SCOPE,
    "**Total**: " + s.tasks.length + " tasks",
    "**Created**: " + TODAY,
    "",
    "Fence label for all code produced here: `[SCOPE " + s.number + " / Tnnn]`. Labels **must** be",
    "`Tnnn` — an `FR-nnn` label silently fails the `T\\d+` regex and registers as unfenced.",
    "",
    "---",
    "",
    "## Task Table",
    "",
    "This table is the machine-readable source the orchestrator parses. Its shape is required:",
    "a row number, then `Tnnn: Title`, then priority, then status. The checkbox detail below is",
    "for humans and is not parsed.",
    "",
    "| #  | Task | Priority | Status |",
    "|----|------|----------|--------|",
  ];
  s.tasks.forEach((t, i) => {
    const id = t.title.split(" — ")[0].trim();
    const title = t.title.split(" — ").slice(1).join(" — ").trim();
    L.push("| " + (i + 1) + " | " + id + ": " + title + " | " + t.priority + " | " + t.status + " |");
  });
  L.push("");
  let currentPhase = "";
  s.tasks.forEach((t) => {
    if (t.phase !== currentPhase) {
      currentPhase = t.phase;
      L.push("## " + currentPhase, "");
    }
    const id = t.title.split(" — ")[0].trim();
    const title = t.title.split(" — ").slice(1).join(" — ").trim();
    L.push("- [ ] **" + id + "** — " + title + " · `" + t.priority + "`");
    // wrap the description as an indented continuation
    const words = t.description.split(/\s+/);
    let line = "     ";
    for (const w of words) {
      if ((line + " " + w).length > 98) { L.push(line); line = "     " + w; }
      else { line = line === "     " ? "     " + w : line + " " + w; }
    }
    if (line.trim()) L.push(line);
  });
  L.push("");
  return L.join("\n");
}

function testsMd(s: SpecDef): string {
  return [
    "# Tests: " + s.feature,
    "",
    "**Spec**: " + s.number + " · **Parent Scope**: " + SCOPE,
    "",
    "## Test Strategy",
    "",
    "Unit tests for pure logic, contract tests for any route, and a regression fixture wherever a",
    "measured real-world value exists. Where a defect has already been observed on this codebase in the",
    "same shape, the test asserts the defect cannot recur rather than asserting the happy path only.",
    "",
    "## Acceptance Checks",
    "",
    ...s.metrics.map((m) => "- " + m),
    "",
    "## Per-Task Verification",
    "",
    ...s.tasks.map((t) => "- " + t.title.split(" — ")[0] + ": verified by exercising the behaviour described, not by reading the implementation."),
    "",
  ].join("\n");
}

function quickstartMd(s: SpecDef): string {
  return [
    "# Quickstart: " + s.feature,
    "",
    "**Spec**: " + s.number + " · **Parent Scope**: " + SCOPE,
    "",
    "## What this spec delivers",
    "",
    s.overview,
    "",
    "## Where it sits in the fan-out",
    "",
    "| Spec | Delivers |",
    "|------|----------|",
    "| 126 | The brand schema model, its validator, and storage across three tiers |",
    "| 130 | Capture from a built product, the document format, and deterministic ingest |",
    "| 128 | Execution into stylesheets and components for the customer's product |",
    "| 129 | The wxBrand entrance, rule delivery, and the two mechanical lints |",
    "",
    "## Getting started",
    "",
    "1. Read the parent scope at `specs/Project-Scope/129-executable-brand-schema.md`.",
    "2. Read this spec's `spec.md`, then `plan.md`.",
    "3. Work tasks in the order given in `tasks.md`.",
    "",
    "## Unresolved before implementation",
    "",
    ...s.openQuestions.map((q, i) => String(i + 1) + ". " + q),
    "",
  ].join("\n");
}

function checklistMd(s: SpecDef): string {
  return [
    "# Requirements Checklist: " + s.feature,
    "",
    "**Spec**: " + s.number + " · **Parent Scope**: " + SCOPE,
    "",
    "| Requirement | Title | Covered by |",
    "|-------------|-------|------------|",
    ...s.frs.map((f) => {
      return "| " + f.id + " | " + f.title + " | |";
    }),
    "",
    "## Metrics",
    "",
    ...s.metrics.map((m) => "- [ ] " + m),
    "",
  ].join("\n");
}

function lifecycleJson(s: SpecDef): string {
  return JSON.stringify(
    {
      specNumber: s.number,
      featureName: s.feature,
      parentScope: SCOPE,
      phase: "design",
      status: "draft",
      createdAt: TODAY,
      tasksTotal: s.tasks.length,
      tasksCompleted: 0,
      percentage: 0,
      phases: {
        scoping: { status: "complete", completedAt: TODAY },
        design: { status: "in_progress", startedAt: TODAY },
        implementation: { status: "pending" },
        qa: { status: "pending" },
        human_testing: { status: "pending" },
        beta: { status: "pending" },
        released: { status: "pending" },
      },
    },
    null,
    2,
  );
}

let written = 0;
for (const s of specs) {
  const dir = join(process.cwd(), "specs", s.number + "-" + s.slug);
  mkdirSync(join(dir, "checklists"), { recursive: true });
  const files: [string, string][] = [
    ["spec.md", specMd(s)],
    ["plan.md", planMd(s)],
    ["tasks.md", tasksMd(s)],
    ["tests.md", testsMd(s)],
    ["quickstart.md", quickstartMd(s)],
    ["lifecycle.json", lifecycleJson(s)],
    [join("checklists", "requirements.md"), checklistMd(s)],
  ];
  for (const [name, body] of files) {
    writeFileSync(join(dir, name), body, "utf-8");
    written++;
  }
  console.log("wrote " + s.number + "-" + s.slug + "  (" + s.tasks.length + " tasks, " + s.frs.length + " FRs)");
}
console.log("total files: " + written);

// Emit the scopeContent bodies for the DB push, so both halves use the SAME text.
writeFileSync(
  join(process.cwd(), "scripts", "scope129-specs.payload.json"),
  JSON.stringify(
    specs.map((s) => ({
      specNumber: s.number,
      featureName: s.feature,
      slug: s.slug,
      scopeContent: specMd(s),
      tasks: s.tasks,
    })),
    null,
    2,
  ),
  "utf-8",
);
console.log("wrote scripts/scope129-specs.payload.json");
