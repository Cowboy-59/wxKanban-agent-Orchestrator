# Tests: Brand Execution and Artifact Generation

**Spec**: 128 · **Parent Scope**: SCOPE-129

## Test Strategy

Unit tests for pure logic, contract tests for any route, and a regression fixture wherever a
measured real-world value exists. Where a defect has already been observed on this codebase in the
same shape, the test asserts the defect cannot recur rather than asserting the happy path only.

## Acceptance Checks

- SC-1: 0 mode tokens emitted to the document root, verified by inspecting generated output rather than by reading the renderer
- SC-2: 1 font request covers every declared face across every mode, rather than one request per mode
- SC-3: 100% of pages render fully styled in the resting mode with the mode layer disabled and with scripting disabled
- SC-4: 0 reskin repaints after first paint, with the resolved mode present in the initial response on 100% of loads
- SC-5: 100% of declared modes appear in the generated stylesheet, with 0 dropped between storage and output
- SC-6: 4 acceptance checks that require a browser are emitted as a human-test checklist rather than counted as automated

## Per-Task Verification

- T001: verified by exercising the behaviour described, not by reading the implementation.
- T002: verified by exercising the behaviour described, not by reading the implementation.
- T003: verified by exercising the behaviour described, not by reading the implementation.
- T004: verified by exercising the behaviour described, not by reading the implementation.
- T005: verified by exercising the behaviour described, not by reading the implementation.
- T006: verified by exercising the behaviour described, not by reading the implementation.
- T007: verified by exercising the behaviour described, not by reading the implementation.
- T008: verified by exercising the behaviour described, not by reading the implementation.
