# Plan: Brand Execution and Artifact Generation

**Spec**: 128 · **Parent Scope**: SCOPE-129 · **Created**: 2026-09-18

## Approach

The output half of SCOPE-129. Turns a stored brand schema into real files for the customer's generated product: per-mode stylesheets scoped so they cannot leak, one font request covering every face in every mode, a resting mode written into the base stylesheet so a failed mode layer never yields an unstyled application, and server-side emission so the chosen mode is present before first paint. It extends the existing theme bundle rather than adding a parallel one.

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

- T001 — Per-mode stylesheet emission scoped to the shell root — Emit one block per declared mode, scoped to the shell root. Assert no mode token reaches the document root.
- T002 — Combined font request across all modes — Build one request spanning every declared face in every mode. No per-mode requests, no bundled binaries.
- T003 — Resting mode in the base stylesheet — Write the resting mode's values into the base stylesheet as the guaranteed fallback for a failed mode layer.
- T004 — Shell contract and server-side mode emission — Resolve the mode server-side and emit it into the initial response. No client-side application after paint.
- T005 — Extend the theme bundle endpoint — Add mode blocks, the combined font request and the shell contract to the existing bundle. Do not add a parallel generation path.
- T006 — Extend Tailwind and component theme artifacts for modes — Carry mode awareness into the generated configuration and component theme so the artifacts agree with the stylesheet.
- T007 — Generation tests — Assert 0 mode tokens at the document root, 1 font request, every declared mode present in output, and the resting mode rendering with the mode layer disabled.
- T008 — Human-test checklist artifact — Emit the four browser-dependent acceptance checks as an explicit checklist shipped with the bundle. Do not count them as automated.

## Risks

- A requirement that is satisfied in code but never reached in practice. Every spec in this
  fan-out is checked for reachability, not only for correctness.
- Silent degradation across a write path that was not exercised. Where a value travels through
  more than one persistence path, every path is tested.

## Open Questions

1. The generated product should not inherit wxKanban's own ambiguity, where a data-theme attribute is written but never read while a class does the real work. Confirm that the mode attribute is the single consumed selector and that no second decorative attribute ships beside it.
2. Should the generated artifacts include a worked integration example showing the shell contract in place, or is the contract description sufficient?
3. For a schema with one mode, should the per-mode block be emitted at all, or collapse into the base stylesheet alone?
