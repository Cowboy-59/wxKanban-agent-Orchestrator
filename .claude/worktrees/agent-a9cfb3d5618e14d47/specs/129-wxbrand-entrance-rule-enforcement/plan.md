# Plan: wxBrand Entrance and Rule Enforcement

**Spec**: 129 · **Parent Scope**: SCOPE-129 · **Created**: 2026-09-18

## Approach

The entrance and the teeth of SCOPE-129. Supplies the wxBrand command and skill through which every other part of this fan-out is reached, carries the brand's rules into design, implementation and review, and adds the two mechanical lints that make a brand hold across a large surface. It also makes an active brand announce itself, so that a working rules pipeline can be told apart from a dead one.

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

- T001 — Delivery channel decision — Decide and record whether wxBrand needs a hosted prompt twin. This gates T002 and T003 because it changes release mechanics.
- T002 — wxBrand command in every mirror — Author the command following the established naming and structure. Apply to every mirror and compare afterward.
- T003 — wxBrand skill in every mirror — Four modes: capture (primary), ingest, interview, execute. Document the boundary against the design skill and the theme surfaces.
- T004 — Rules as data with a mechanical flag — Structure rules as identifier, text, kind and mechanical flag. The flag drives the split between gate and checklist.
- T005 — Rule delivery to implement — Supply applicable rules as build context for UI-bearing tasks in a schema-bearing project.
- T006 — Rule delivery to the design skill — Cross the design skill's current unawareness of the schema layer so designs compose against real brand tokens and rules.
- T007 — Rule delivery to the code review skill — Supply rules as review criteria so drift is caught on the diff.
- T008 — Structural-property lint — Fail any mode selector setting display, grid template, order, position or content. Name the selector and the property.
- T009 — Style-literal lint — Fail any component carrying a colour literal, pixel radius, row height or font stack, exempting token blocks. Name the file and the literal.
- T010 — Schema announcement — State on every rule-consuming run whether a schema is active and name it, and state plainly when one is declared but unresolved. Do not trim this as noise.
- T011 — Mirror parity verification — Compare every skill and command copy after the change and assert zero divergence.

## Risks

- A requirement that is satisfied in code but never reached in practice. Every spec in this
  fan-out is checked for reachability, not only for correctness.
- Silent degradation across a write path that was not exercised. Where a value travels through
  more than one persistence path, every path is tested.

## Open Questions

1. Does wxBrand require a hosted prompt twin, or is kit-side markdown sufficient? The two answers have different release mechanics, and the registry currently has no twin for the design skill, which is why this is written down rather than assumed.
2. Should the style-literal lint run as a blocking gate or as an advisory report in its first release? Blocking is the eventual intent; starting advisory would surface the true violation count on real code first.
3. Should rule delivery be scoped to rules flagged as mechanically checkable, or should the full rule set including narrative invariants reach the implementation agent?
