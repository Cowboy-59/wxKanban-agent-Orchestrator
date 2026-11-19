# Plan: Brand Schema Model and Storage

**Spec**: 126 · **Parent Scope**: SCOPE-129 · **Created**: 2026-09-18

## Approach

The data half of SCOPE-129. Introduces the BrandSchema object — a base theme, an extension token map, a typeface set, N named modes under a declared token contract, and the brand's rules as data — and gives it somewhere to live across all three theme resolution tiers. It also widens the accessibility report so that it looks where real brand failures occur. No ingest, no generation and no enforcement: this spec produces the model, the storage and the validator the other three specs depend on.

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

- T001 — BrandSchema model in src/shared/brand-schema.ts — Define BrandSchema, ModeTokenSet, FaceSet and BrandRule. Import ThemeTokenSet unchanged from theme-tokens.ts; do not modify it. Export type guards.
- T002 — Contract validator — Every mode declares every contract token; exactly one resting mode; closed-set enforcement. Errors name the mode and every missing token. No inheritance, no defaults.
- T003 — Widened contrast report — Extend the report to semantic and accent colors against both paper and their own chips. Reuse contrastRatio and meetsAA. Compare on the unrounded ratio.
- T004 — CIE76 distinguishability check — Implement perceptual distance with the threshold as a named exported constant. Must fail the zero-distance identity/accent pairs in the reference corpus.
- T005 — Axis and typeface validation — Every mode declares light, dark or preference-following. Every typeface role declares a fallback stack. Both are validation errors when absent.
- T006 — Migration adding brandschema to three tables — Nullable jsonb on themetemplates, projectthemes and companythemeprofiles. Reviewed SQL, applied by hand, recorded in the schema change log. Never use automatic schema push.
- T007 — Drizzle schema definitions for the three tables — Add the typed column to each schema file. Verify with the drift check that every declared table still exists.
- T008 — Carry-across in every write path — Insert values, conflict-update set clause, and the template update route. This is the path that previously degraded silently; all three are required.
- T009 — Company-tier resolution — Extend resolveTheme so the company tier returns a schema instead of a color-only bundle, preserving existing tier precedence.
- T010 — Tests including the reference contrast fixture — Assert the widened report FAILS the reference brand's three semantics and two accents. Those failures are the fixture; a report that passes them is broken. Also assert both apply paths carry the schema.

## Risks

- A requirement that is satisfied in code but never reached in practice. Every spec in this
  fan-out is checked for reachability, not only for correctness.
- Silent degradation across a write path that was not exercised. Where a value travels through
  more than one persistence path, every path is tested.

## Open Questions

1. Confirm the CIE76 distance threshold of 20. The reference document's self-declared tightest case measures 21.1 and 24.2, so 20 admits what it intends while still failing the two modes that set identity and accent to the same value.
2. Confirm that the three light/dark declarations offered — light, dark and preference-following — are the right three.
3. Should a schema carry a version field so that a re-captured brand can be diffed against its predecessor, or is replacement sufficient for a first release?
