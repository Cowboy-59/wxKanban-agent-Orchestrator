# Tests: buildscope Carries the Author's Real Requirements

| Test | Covers | Where |
|---|---|---|
| Supplied FRs and scenarios render verbatim; no boilerplate title appears in any mode | FR-001, FR-002, FR-004, SM 2 | `mcp-server/tests/project-kit-scope-flow.test.ts` |
| `None` and `None — reason` pass with no marker; an omitted section still blocks | FR-003 | same |
| Quick mode without FRs returns `canProceedToCreateSpecs: false` and names every omitted input | FR-004, FR-005, SM 3 | same |
| Guided mode without FRs returns `draft_interview` with a `functionalRequirements` question | FR-006 | same |
| 523f65ed reproduction with all inputs scores 100 with 0 blockers | SM 1 | same |
| Boilerplate-FR, no-FR, no-criteria and <3-scenario warnings; score and isValid unchanged | FR-007, FR-014 | `shared/preflight` tests |
| `validateScopeContent` ≡ `createSpecsPreflight` across the fixture set | FR-008, SM 4 | parity test |
| 56b8f6d2 reproduction: edit with `currentScopeContent` keeps every section, criterion and scenario | FR-011, SM 9 | scope-flow test |
| c4e40bb5 reproduction assigns 021; 4-digit projects stay 4-digit | FR-012, SM 10 | scope-flow test |
| Slug fixture across FR/ES/IT/PT/DE folds accents; ASCII slugs unchanged | FR-013, SM 11 | scope-flow test |
| 7874b04b reproduction: advisories listed, no unticked Gate item while valid | FR-014, SM 12 | scope-flow test |
| templateOnly without a template returns `drafted` with the ignored note | FR-015, SM 13 | scope-flow test |
| Kit worker edits the located local file in place; create sends local numbers; JSON flags parse | FR-016 | `wxkanban-agent` worker test |
| Corpus dry run: score/isValid unchanged on every `specs/Project-Scope/*.md` | SM 6 | T014 script |
| Live hosted probe after deploy | SM 8–13 | T015 |
