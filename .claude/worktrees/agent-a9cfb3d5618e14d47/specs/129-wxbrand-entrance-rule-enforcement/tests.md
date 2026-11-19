# Tests: wxBrand Entrance and Rule Enforcement

**Spec**: 129 · **Parent Scope**: SCOPE-129

## Test Strategy

Unit tests for pure logic, contract tests for any route, and a regression fixture wherever a
measured real-world value exists. Where a defect has already been observed on this codebase in the
same shape, the test asserts the defect cannot recur rather than asserting the happy path only.

## Acceptance Checks

- SC-1: 100% of rule-consuming runs in a schema-bearing project state that a schema is active and name it
- SC-2: 100% of declared-but-missing schemas produce an explicit statement rather than proceeding as though unbranded
- SC-3: 0 style literals in the generated component layer outside token blocks, and 0 structural properties set by a mode selector
- SC-4: 4 wxBrand modes are reachable — capture, ingest, interview and execute — with capture as the documented primary path
- SC-5: 0 divergence between skill mirrors after a rule-delivery change, verified by comparison
- SC-6: 100% of UI-bearing tasks in a schema-bearing project receive the applicable rules as build context

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
- T011: verified by exercising the behaviour described, not by reading the implementation.
