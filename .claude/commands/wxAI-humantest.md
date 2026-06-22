---
description: Run Phase 4 (Human Testing) — generate test scenarios, collect feedback, and track resolution
args: "{{args}}"
ai-compat: universal
claude-code: true
cursor: true
blackboxai: true
---

## User Input

```
text
{{args}}
```

You **MUST** consider the user input before proceeding (if not empty).

## Outline

This command executes Phase 4 (Human Testing) of the 6-phase project lifecycle. It generates test scenarios from spec acceptance criteria, collects structured feedback from human testers, and allows feedback to loop back as new Phase 1 specifications. The phase gate requires all feedback items to be resolved.

1. **Prerequisites**: Run `.specify/scripts/powershell/check-prerequisites.ps1 -Json -RequireQA` from repo root and parse FEATURE_DIR and AVAILABLE_DOCS list. All paths must be absolute.

2. **Validate QA phase completion**: Read `FEATURE_DIR/qa-report.md`:
   - Check the Phase 3 Gate section — must show PASS
   - If QA gate is FAIL: halt with error "Phase 3 (QA Testing) must pass before entering Phase 4. Run `/wxAI-qa` to resolve blocking issues."

3. **Initialize lifecycle tracking**: Read `FEATURE_DIR/lifecycle.json`:
   - Set `humantest.status` to `in_progress` and `humantest.entered` to current ISO timestamp
   - Log transition: `{ "from": "qa", "to": "humantest", "timestamp": "...", "reason": "Human testing phase initiated" }`
   - Write lifecycle.json immediately

4. **Load context**:
   - **REQUIRED**: Read spec.md — extract acceptance scenarios (Given/When/Then) and functional requirements
   - **REQUIRED**: Read qa-report.md — understand what automated tests already cover
   - **IF EXISTS**: Read plan.md — for technical context
   - **IF EXISTS**: Read quickstart.md — for integration test scenarios

5. **Generate test scenarios** from spec acceptance criteria. For each acceptance scenario in spec.md:
   - Create a structured test case with:
     - **Scenario ID**: TS-001, TS-002, etc. (linked to spec FR number)
     - **Linked Requirement**: FR-XXX
     - **Description**: Natural language description from spec
     - **Steps to Reproduce**: Numbered steps a human tester should follow
     - **Expected Result**: What should happen
     - **Actual Result**: (blank — to be filled during testing)
     - **Status**: pending
     - **Notes**: (blank — for tester comments)

6. **Check for existing feedback.md**: If `FEATURE_DIR/feedback.md` already exists:
   - Load it and preserve existing feedback entries
   - Only generate new test scenarios for requirements not yet covered
   - Present: "Found existing feedback with [N] entries. Continue testing from where you left off?"

7. **Write initial feedback.md** in FEATURE_DIR with this structure:

   
```
markdown
   # Human Testing Feedback: [FEATURE NAME]

   **Feature Branch**: `[###-feature-name]`
   **Date**: [DATE]
   **Status**: In Progress
   **Phase**: 4 — Human Testing

   ## Test Scenarios

   ### TS-001 [FR-XXX]: [Scenario Title]

   **Steps**:

   1. [Step 1]
   2. [Step 2]
   3. [Step 3]

   **Expected**: [Expected result from spec]
   **Actual**: _[To be filled during testing]_
   **Status**: pending
   **Notes**: —

   ---

   [Repeat for each acceptance scenario]

   ## Feedback Entries

   [Feedback items will be added here as testing progresses]

   ## Summary

   - **Total Scenarios**: [N]
   - **Passed**: 0
   - **Failed**: 0
   - **Pending**: [N]
   - **Feedback Items**: 0
   - **New Specs Generated**: 0

   ## Phase 4 Gate

   - [ ] All test scenarios have been executed (no pending)
   - [ ] All feedback items are resolved (accepted, rejected, or deferred)
   - [ ] No critical bugs remain unresolved

   **Gate Status**: IN PROGRESS
   
```

8. **Interactive feedback collection loop**: Present test scenarios one at a time to the user:

   For each pending scenario:
   a. Display the scenario with steps, expected result
   b. Ask user for result:
   - **PASS**: Mark scenario as passed
   - **FAIL**: Collect details:
     - **Category**: bug | enhancement | usability
     - **Severity**: critical | high | medium | low
     - **Description**: What went wrong / what's needed
     - **Needs New Spec?**: yes | no — If yes, create a feedback entry that references a new Phase 1 spec

   c. For each FAIL, create a feedback entry:

   
```
markdown
   ### FB-001: [Brief Title]

   - **Category**: [bug | enhancement | usability]
   - **Severity**: [critical | high | medium | low]
   - **Linked Scenario**: TS-XXX
   - **Linked Requirement**: FR-XXX
   - **Description**: [User's description]
   - **Resolution**: open
   - **New Spec Required**: [yes — creates placeholder | no]
   - **Created**: [timestamp]
   
```

   d. After each feedback entry, update feedback.md and lifecycle.json immediately
   e. After all scenarios are tested OR user signals "stop"/"done":
   - Update feedback.md summary counts
   - If user stopped early, mark remaining scenarios as pending

9. **Handle feedback-to-spec loop** (FR-072): For feedback items marked "New Spec Required: yes":
    - Create a placeholder entry in the feedback summary noting which new spec is needed
    - Inform user: "Feedback FB-XXX requires a new specification. After this phase, reopen Phase 1 (Design) and run `/wxAI-specify` to create the new spec."
    - Log in lifecycle.json: phase reopening recommendation

10. **Resolve feedback items**: After all scenarios are tested, present unresolved feedback:
    - For each open feedback item, ask user:
      - **Accept**: Acknowledge and plan fix (creates a task)
      - **Reject**: Mark as won't fix with reason
      - **Defer**: Mark for post-release with reason
    - Update each item's Resolution field and timestamp

11. **Create tasks for accepted feedback**:
    - For each accepted feedback item, create a task entry
    - Link task ID back to feedback entry in feedback.md

12. **Update lifecycle.json**:
    - If all scenarios tested AND all feedback resolved: Set `humantest.status` to `complete`, `humantest.completed` to timestamp
    - If incomplete: Keep as `in_progress`
    - Write lifecycle.json

13. **Report completion**:

    
```
    ---------------------------------------------------
    PHASE 4 COMPLETE: Human Testing
    ---------------------------------------------------
    Feedback File:      [absolute path to feedback.md]
    Scenarios Tested:   [N]/[total]
    Passed:             [N]
    Failed:             [N]
    Feedback Items:     [N] ([N] resolved, [N] open)
    New Specs Needed:   [N]
    Gate Status:        [PASS | FAIL | IN PROGRESS]
    Lifecycle:          [absolute path to lifecycle.json]
    ---------------------------------------------------
    
```

    - If PASS: "Phase 4 complete. Run `/wxAI-beta` to proceed to Phase 5 (Beta Release)."
    - If FAIL/IN PROGRESS: List unresolved items and guidance.

## Lifecycle Auto-Update Rules

- lifecycle.json is written after EVERY feedback entry and resolution change
- If command is interrupted, feedback.md preserves all entries collected so far
- Resumable: Running `/wxAI-humantest` again picks up where it left off
