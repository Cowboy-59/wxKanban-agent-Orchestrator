# Requirements Checklist: Brand Schema Model and Storage

**Spec**: 126 · **Parent Scope**: SCOPE-129

| Requirement | Title | Covered by |
|-------------|-------|------------|
| FR-001 | The BrandSchema model | |
| FR-002 | The token contract is data | |
| FR-003 | Incomplete modes are rejected | |
| FR-004 | Exactly one resting mode | |
| FR-005 | Closed sets are enforced | |
| FR-006 | The contrast report is widened | |
| FR-007 | Comparison is on the unrounded ratio | |
| FR-008 | Distinguishability is numeric | |
| FR-009 | Values are stored exactly as specified | |
| FR-010 | Three tables carry the schema | |
| FR-011 | Carry-across is written in every path | |
| FR-012 | Schema changes are applied by hand and recorded | |

## Metrics

- [ ] SC-1: 100% of modes in a stored schema declare 100% of contract tokens; 0 schemas persist with a missing token
- [ ] SC-2: the widened contrast report names 12 contrast failures and 4 distinguishability failures in the reference corpus, against 0 found by the pre-existing two-pair report. Measured, not estimated
- [ ] SC-3: 100% of schema applications carry the schema into the resolved theme across both the insert path and the update path — 2 of 2 paths, because testing only the first application previously reported a false pass
- [ ] SC-4: 3 tables carry the brandschema column, so that 100% of company-wide selections resolve with modes intact and 0 resolve to a color-only bundle
- [ ] SC-5: 0 brand values altered by validation without an explicit recorded repair action
- [ ] SC-6: contrast verdicts are computed on the unrounded ratio, so 0 verdicts change when display rounding changes
