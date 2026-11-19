# Tests: Brand Document Capture and Ingest

**Spec**: 130 · **Parent Scope**: SCOPE-129

## Test Strategy

Unit tests for pure logic, contract tests for any route, and a regression fixture wherever a
measured real-world value exists. Where a defect has already been observed on this codebase in the
same shape, the test asserts the defect cannot recur rather than asserting the happy path only.

## Acceptance Checks

- SC-1: 100% of captured documents parse cleanly on their first pass through the ingest they were generated for, because both sides are ours
- SC-2: 0 rule sections fabricated by capture — every section not measurable from a rendered product is emitted as an unanswered prompt
- SC-3: the reference corpus parses to exactly 6 modes of 41 contract tokens each, with 0 missing and 0 extra
- SC-4: 100% of parser rejections name both the offending content and its location, with 0 partial imports
- SC-5: 100% of imports present the validation report before the schema is committed
- SC-6: 1 mode is produced by capture, never more, because a built product has one look

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
