# Test Plan: Spec 118 — Fence Audit Gate Restoration

## Unit (Vitest — `wxkanban-agent/tests/unit/auditfences.test.ts` and siblings)

| Test | Covers | Assertion |
| --- | --- | --- |
| `shouldIgnore` with a gitignored path | FR-001 | Path under `.agents/` is skipped |
| `shouldIgnore` with a project path | FR-001 | `src/server/**` is still scanned |
| No `.gitignore` present | FR-005 | Falls back to `DEFAULT_IGNORE`; behaviour unchanged |
| `.gitignore` with negation (`!keep.ts`) | FR-001 | Re-included path is scanned |
| Consumer builds into a gitignored dir | FR-005 | Consumer's own source still audited |
| `UNKNOWN_TASK` classification | FR-003 | Distinct code from `UNFENCED_DECL` |
| `UNKNOWN_TASK` severity | FR-003 | Warning, not error |
| Baseline entry shape | FR-002 | Carries date and declaration identity, not only a hash |
| Post-baseline violation | FR-002 | New un-fenced declaration reported as error, not absorbed |

## Integration — measured against this repository

These are the primary evidence for the scope. Baseline captured 2026-07-31 on `main`.

| Check | Before | Expected after |
| --- | --- | --- |
| Total errors | 1,893 | ~1,008 after T001; 0 after T004 |
| Errors in gitignored paths | 885 | **0** |
| `UNFENCED_DECL` (project code) | ~795 | 0 blocking; ~795 recorded as dated debt |
| `UNKNOWN_TASK` | 213 errors | 213 **warnings**, distinct code |
| Files scanned | 4,074 | reduced — every dropped file justified (T002) |
| `auditfences --strict` exit code | 1 | **0** |

## Fail-first proof (T005)

| Step | Assertion |
| --- | --- |
| Run against clean `main` | exit 0 |
| Add an intentionally un-fenced top-level declaration | exit non-zero **and names that declaration** |
| Remove it | exit 0 again |

A gate observed only passing is as unproven as one observed only failing. This must be recorded as
evidence, not asserted.

## CI behaviour

| Test | Covers | Assertion |
| --- | --- | --- |
| Fence job during advisory period | FR-004 | Reports findings; does **not** fail the build |
| Would-block recording | FR-004 | Each run records whether it would have blocked |
| `schema-drift` job | SCOPE-117 | Still blocking; no longer masked by a red sibling |
| Workflow overall status | SM-4 | Green |

## Consumer safety (T008)

| Check | Assertion |
| --- | --- |
| Consumer with `.gitignore` | 0 previously-audited files leave scope |
| Consumer without `.gitignore` | Identical output before and after |
| Kit version carrying the change | Identifiable, shipped via normal release |

## Explicitly not tested here

Triage of the 213 broken fence references — deferred as Open Question 1. This plan verifies they
are *classified* correctly, not that they are *resolved*.
