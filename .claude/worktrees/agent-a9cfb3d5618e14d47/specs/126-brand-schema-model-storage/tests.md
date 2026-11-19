# Tests: Brand Schema Model and Storage

**Spec**: 126 · **Parent Scope**: SCOPE-129

## Test Strategy

Unit tests for pure logic, contract tests for any route, and a regression fixture wherever a
measured real-world value exists. Where a defect has already been observed on this codebase in the
same shape, the test asserts the defect cannot recur rather than asserting the happy path only.

## Acceptance Checks

- SC-1: 100% of modes in a stored schema declare 100% of contract tokens; 0 schemas persist with a missing token
- SC-2: the widened contrast report names 12 contrast failures and 4 distinguishability failures in the reference corpus, against 0 found by the pre-existing two-pair report. Measured, not estimated
- SC-3: 100% of schema applications carry the schema into the resolved theme across both the insert path and the update path — 2 of 2 paths, because testing only the first application previously reported a false pass
- SC-4: 3 tables carry the brandschema column, so that 100% of company-wide selections resolve with modes intact and 0 resolve to a color-only bundle
- SC-5: 0 brand values altered by validation without an explicit recorded repair action
- SC-6: contrast verdicts are computed on the unrounded ratio, so 0 verdicts change when display rounding changes

## Per-Task Verification

- T001: verified by exercising the behaviour described, not by reading the implementation.
- T002: verified by exercising the behaviour described, not by reading the implementation.
- T003: verified by exercising the behaviour described, not by reading the implementation.
- T004: verified by exercising the behaviour described, not by reading the implementation.
- T005: verified by exercising the behaviour described, not by reading the implementation.
- T006: verified by exercising the behaviour described, not by reading the implementation.
- T007: verified by exercising the behaviour described, not by reading the implementation.
- T008: verified by exercising the behaviour described, not by reading the implementation.
- T009: verified by exercising the behaviour described, not by reading the implementation.
- T010: verified by exercising the behaviour described, not by reading the implementation.
