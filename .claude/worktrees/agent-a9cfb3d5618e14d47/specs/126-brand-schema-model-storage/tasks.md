# Tasks: Brand Schema Model and Storage

**Spec**: 126
**Spec ID**: `c6678562-79f7-41c1-98d1-46de51ba5654`
**Parent Scope**: SCOPE-129
**Total**: 10 tasks
**Created**: 2026-09-18

Fence label for all code produced here: `[SCOPE 126 / Tnnn]`. Labels **must** be
`Tnnn` — an `FR-nnn` label silently fails the `T\d+` regex and registers as unfenced.

---

## Task Table

This table is the machine-readable source the orchestrator parses. Its shape is required:
a row number, then `Tnnn: Title`, then priority, then status. The checkbox detail below is
for humans and is not parsed.

| #  | Task | Priority | Status |
|----|------|----------|--------|
| 1 | T001: BrandSchema model in src/shared/brand-schema.ts | high | done |
| 2 | T002: Contract validator | high | done |
| 3 | T003: Widened contrast report | high | done |
| 4 | T004: CIE76 distinguishability check | high | done |
| 5 | T005: Axis and typeface validation | medium | done |
| 6 | T006: Migration adding brandschema to three tables | high | done |
| 7 | T007: Drizzle schema definitions for the three tables | high | done |
| 8 | T008: Carry-across in every write path | high | done |
| 9 | T009: Company-tier resolution | high | done |
| 10 | T010: Tests including the reference contrast fixture | high | done |

## Phase A — Model and validation

- [ ] **T001** — BrandSchema model in src/shared/brand-schema.ts · `high`
     Define BrandSchema, ModeTokenSet, FaceSet and BrandRule. Import ThemeTokenSet unchanged from
     theme-tokens.ts; do not modify it. Export type guards.
- [ ] **T002** — Contract validator · `high`
     Every mode declares every contract token; exactly one resting mode; closed-set enforcement.
     Errors name the mode and every missing token. No inheritance, no defaults.
- [ ] **T003** — Widened contrast report · `high`
     Extend the report to semantic and accent colors against both paper and their own chips. Reuse
     contrastRatio and meetsAA. Compare on the unrounded ratio.
- [ ] **T004** — CIE76 distinguishability check · `high`
     Implement perceptual distance with the threshold as a named exported constant. Must fail the
     zero-distance identity/accent pairs in the reference corpus.
- [ ] **T005** — Axis and typeface validation · `medium`
     Every mode declares light, dark or preference-following. Every typeface role declares a
     fallback stack. Both are validation errors when absent.
## Phase B — Storage and resolution

- [ ] **T006** — Migration adding brandschema to three tables · `high`
     Nullable jsonb on themetemplates, projectthemes and companythemeprofiles. Reviewed SQL,
     applied by hand, recorded in the schema change log. Never use automatic schema push.
- [ ] **T007** — Drizzle schema definitions for the three tables · `high`
     Add the typed column to each schema file. Verify with the drift check that every declared
     table still exists.
- [ ] **T008** — Carry-across in every write path · `high`
     Insert values, conflict-update set clause, and the template update route. This is the path
     that previously degraded silently; all three are required.
- [ ] **T009** — Company-tier resolution · `high`
     Extend resolveTheme so the company tier returns a schema instead of a color-only bundle,
     preserving existing tier precedence.
## Phase C — Verification

- [ ] **T010** — Tests including the reference contrast fixture · `high`
     Assert the widened report FAILS the reference brand's three semantics and two accents. Those
     failures are the fixture; a report that passes them is broken. Also assert both apply paths
     carry the schema.
