---
description: Run Phase 3 (QA Testing) — execute tests mapped to Phase 1 specs and generate coverage report
args: "{{args}}"
ai-compat: universal
claude-code: true
cursor: true
blackboxai: true
---

## User Input

```text
{{args}}
```

You **MUST** consider the user input before proceeding (if not empty).

## Outline

This command executes Phase 3 (QA Testing) of the 6-phase project lifecycle. It maps automated tests to Phase 1 specifications, runs them, and generates a coverage report. The phase gate requires all specs to have test coverage and all tests to pass.

1. **Prerequisites**: Run `.specify/scripts/powershell/check-prerequisites.ps1 -Json -RequireTasks -IncludeTasks` from repo root and parse FEATURE_DIR and AVAILABLE_DOCS list. All paths must be absolute.

2. **Initialize lifecycle tracking**: Read or create `FEATURE_DIR/lifecycle.json`:
   - If lifecycle.json does not exist, create it with all phases set to `pending`
   - Set `qa.status` to `in_progress` and `qa.entered` to current ISO timestamp
   - Log transition: `{ "from": "implementation", "to": "qa", "timestamp": "...", "reason": "QA phase initiated" }`
   - Write lifecycle.json after every status change (automatic updates)

3. **Load context**:
   - **REQUIRED**: Read spec.md — extract all functional requirements (FR-001, FR-002, etc.)
   - **REQUIRED**: Read tasks.md — identify test-related tasks and their completion status
   - **REQUIRED**: Read plan.md — extract tech stack and test framework info
   - **IF EXISTS**: Read data-model.md — for entity coverage validation
   - **IF EXISTS**: Read contracts/ — for API endpoint test coverage

5. **Detect test framework** from plan.md tech stack:
   - Identify test runner: vitest, jest, pytest, mocha, etc.
   - Identify test command: `npm test`, `npm run test`, `vitest`, etc.
   - Identify coverage tool: c8, istanbul, coverage.py, etc.

6. **Build spec-to-test mapping**: For each functional requirement in spec.md:
   - Identify which test files should cover this requirement
   - Check if corresponding test tasks in tasks.md are marked complete
   - Map requirement IDs (FR-001, FR-002) to test file paths
   - Flag any requirements with NO test coverage

7. **Execute test suite**:
   - Run the detected test command
   - Capture stdout/stderr output
   - Parse test results: total, passed, failed, skipped
   - If coverage tool available, capture coverage metrics

8. **Generate qa-report.md** in FEATURE_DIR with this structure:

   ```markdown
   # QA Report: [FEATURE NAME]

   **Feature Branch**: `[###-feature-name]`
   **Date**: [DATE]
   **Test Framework**: [detected framework]
   **Status**: [PASS | FAIL]

   ## Spec Coverage Matrix

   | Spec/Requirement | Test File(s) | Tests | Passed | Failed | Coverage  |
   | ---------------- | ------------ | ----- | ------ | ------ | --------- |
   | FR-001           | [file]       | 5     | 5      | 0      | ✓         |
   | FR-002           | [file]       | 3     | 2      | 1      | ✗         |
   | FR-003           | —            | 0     | 0      | 0      | ✗ MISSING |

   ## Test Results Summary

   - **Total Tests**: [N]
   - **Passed**: [N]
   - **Failed**: [N]
   - **Skipped**: [N]
   - **Coverage**: [%] (if available)

   ## Blocking Issues

   [List any failed tests or missing coverage that blocks Phase 3 completion]

   ## Phase 3 Gate

   - [ ] All functional requirements have test coverage
   - [ ] All tests pass
   - [ ] Coverage meets minimum threshold (if configured)

   **Gate Status**: [PASS | FAIL — reason]
   ```

9. **Update lifecycle.json**:
   - If all gates pass: Set `qa.status` to `complete`, `qa.completed` to current timestamp
   - If gates fail: Keep `qa.status` as `in_progress`, document blocking issues
   - Write lifecycle.json

10. **Report completion**:

    ```
    ---------------------------------------------------
    PHASE 3 COMPLETE: QA Testing
    ---------------------------------------------------
    QA Report:    [absolute path to qa-report.md]
    Tests:        [passed]/[total] passed
    Coverage:     [coverage %]
    Gate Status:  [PASS | FAIL]
    Lifecycle:    [absolute path to lifecycle.json]
    ---------------------------------------------------
    ```

    - If PASS: "Phase 3 complete. Run `/wxAI-humantest` to proceed to Phase 4 (Human Testing)."
    - If FAIL: List blocking issues and suggest fixes. Do NOT advance to next phase.

## Lifecycle Auto-Update Rules

- lifecycle.json is written after EVERY status change (not just at end)
- If the command is interrupted or fails, lifecycle.json reflects the last known state
- Phase transitions are always logged in the `transitions` array
