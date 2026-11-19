# Plan: Brand Document Capture and Ingest

**Spec**: 130 · **Parent Scope**: SCOPE-129 · **Created**: 2026-09-18

## Approach

The input half of SCOPE-129. Most customers have no written brand specification; they have a working application whose brand is implicit in its rendered styling. This spec captures that product into a brand instruction document, publishes the format so the document is never guessed at, parses a completed document deterministically, and presents a validation report before anything is stored. It produces documents and parsed schemas; it does not generate artifacts or enforce rules.

## Technical Context

Stack is unchanged from the project's declared stack: Express on Node, React with Vite, PostgreSQL
with Drizzle, Tailwind with a component library, and structured logging. This spec introduces no new
runtime dependency.

## Constraints

- TypeScript throughout, with no escape hatches and no suppressed type errors.
- Schema changes are applied by hand and recorded; automatic schema reconciliation is prohibited.
- Every top-level declaration is fenced by the orchestrator; fences are never hand-authored.
- Modify-heavy edits are made directly rather than through the generator path, which corrupts
  non-ASCII characters in the files it rewrites.
- Router-only and test files with no top-level declaration are rejected by the fencer and are
  written directly.

## Task Sequence

- T001 — Brand instruction format reference — Write the format down from the real document before any parser exists. Cover the token contract block, per-mode blocks, typeface roles and rule sections.
- T002 — Fillable brand instruction template — Ship a real template artifact a customer can complete, matching the format reference exactly.
- T003 — Deterministic parser: tokens, modes, typefaces — Parse the contract block and per-mode blocks. No language model. Assert mode/token counts against the declared contract.
- T004 — Parser: rules extraction and loud rejection — Extract rule sections into structured BrandRule data. Reject unknown structure naming content and location. No partial imports.
- T005 — Capture: extend rendered-styling extraction to emit a document — Reuse the shipped headless extraction. Accept a reachable page OR a customer-supplied rendered page — never a credential. Emit a complete brand instruction document rather than a color-only theme.
- T006 — Capture: measured versus inferred separation — Mark every value as measured or defaulted. Emit every underivable rule section as an explicit unanswered prompt. Never fabricate a rule.
- T007 — Capture: single resting mode — Produce exactly one mode. Assert that no alternative modes are ever synthesized from a single captured look.
- T008 — Import route reporting before store — Accept a document, parse, validate, return the report, and commit only on acceptance. Tenant-scoped through the existing project-in-company check.
- T009 — Reference corpus regression test — Commit the reference document as a fixture. Assert exactly 6 modes of 41 contract tokens, 0 missing and 0 extra.
- T010 — Capture-to-parse round trip test — Assert a captured document parses cleanly through the ingest it was generated for. A generator and parser that disagree about their shared format is the defect this catches.

## Risks

- A requirement that is satisfied in code but never reached in practice. Every spec in this
  fan-out is checked for reachability, not only for correctness.
- Silent degradation across a write path that was not exercised. Where a value travels through
  more than one persistence path, every path is tested.

## Open Questions

1. Resolved: capture never handles customer credentials. It accepts a reachable page or a rendered page the customer supplies, and how the customer produces either is theirs to decide. Recorded here because the question was asked and the answer changes what T005 builds.
2. What should capture do when the captured product's own palette fails the accessibility checks? The recommendation is to report and proceed, since refusing to capture a product the customer already ships would be unhelpful.
3. Should capture attempt a dark counterpart when a product declares only one, or leave the axis declaration to the reviewer?
