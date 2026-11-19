---
description: Run Phase 5 (Beta Release) — manage beta deployment, collect feedback with approval gates
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

This command executes Phase 5 (Beta Release) of the 6-phase project lifecycle. It verifies Phase 4 completion, collects beta-specific feedback (tracked separately for audit), and enforces an approval gate for any modifications. The phase gate requires all beta feedback to be resolved and all modifications approved.

1. **Prerequisites**: Run `.specify/scripts/powershell/check-prerequisites.ps1 -Json -RequireHumanTest` from repo root and parse FEATURE_DIR and AVAILABLE_DOCS list. All paths must be absolute.

2. **Validate Human Testing phase completion**: Read `FEATURE_DIR/feedback.md`:
   - Check the Phase 4 Gate section — must show PASS
   - Verify all feedback items have resolution status (accepted/rejected/deferred)
   - If gate is not PASS: halt with error "Phase 4 (Human Testing) must pass before entering Phase 5. Run `/wxAI-humantest` to resolve remaining feedback."

3. **Initialize lifecycle tracking**: Read `FEATURE_DIR/lifecycle.json`:
   - Set `beta.status` to `in_progress` and `beta.entered` to current ISO timestamp
   - Log transition: `{ "from": "humantest", "to": "beta", "timestamp": "...", "reason": "Beta release phase initiated" }`
   - Write lifecycle.json immediately

4. **Load context**:
   - **REQUIRED**: Read spec.md — for feature overview and requirements
   - **REQUIRED**: Read feedback.md — Phase 4 feedback status
   - **REQUIRED**: Read qa-report.md — QA test results
   - **IF EXISTS**: Read tasks.md — implementation status
   - **IF EXISTS**: Read plan.md — deployment and architecture context

5. **Generate beta readiness checklist**: Automatically verify:

   
```
markdown
   ## Beta Readiness

   - [x/] All Phase 4 feedback items resolved
   - [x/] All QA tests passing (from qa-report.md)
   - [x/] Feature implementation complete (from tasks.md)
   - [x/] No critical bugs outstanding
   
```

   If any item fails, present to user and ask whether to proceed anyway (with acknowledgment).

6. **Check for existing beta-report.md**: If `FEATURE_DIR/beta-report.md` already exists:
   - Load and preserve existing entries
   - Present: "Found existing beta report with [N] feedback entries. Continue beta testing?"

7. **Write initial beta-report.md** in FEATURE_DIR with this structure:

   
```
markdown
   # Beta Report: [FEATURE NAME]

   **Feature Branch**: `[###-feature-name]`
   **Date**: [DATE]
   **Status**: In Progress
   **Phase**: 5 — Beta Release

   ## Beta Readiness Checklist

   [Auto-generated from step 6]

   ## Beta Feedback

   [Beta feedback entries will be added here — tracked separately from Phase 4 for audit purposes (FR-076)]

   ## Modification Approval Log

   [All approved modifications during beta are logged here with timestamps]

   ## Summary

   - **Beta Feedback Items**: 0
   - **Modifications Proposed**: 0
   - **Modifications Approved**: 0
   - **Modifications Rejected**: 0

   ## Phase 5 Gate

   - [ ] All beta feedback items are resolved
   - [ ] All proposed modifications have been approved or rejected
   - [ ] No critical issues remain unaddressed

   **Gate Status**: IN PROGRESS
   
```

8. **Interactive beta feedback collection**: Collect feedback from beta testers:

   Present prompt: "Enter beta feedback (or 'done' to finish feedback collection):"

   For each feedback item:
   a. Collect:
   - **Title**: Brief description
   - **Category**: bug | enhancement | usability | performance
   - **Severity**: critical | high | medium | low
   - **Description**: Detailed feedback
   - **Requires Modification?**: yes | no

   b. Create feedback entry with beta-specific IDs:

   
```
markdown
   ### BF-001: [Title]

   - **Category**: [category]
   - **Severity**: [severity]
   - **Description**: [description]
   - **Requires Modification**: [yes | no]
   - **Approval Status**: [pending | approved | rejected] (if modification required)
   - **Approved By**: — (if approved)
   - **Approval Date**: — (if approved)
   - **Resolution**: open
   - **Created**: [timestamp]
   
```

   c. **CRITICAL — Approval Gate (FR-075)**: If feedback requires modification:
   - Present the proposed modification to the user
   - Ask explicitly: "This modification requires your explicit approval. Approve this change? (yes/no/defer)"
   - If approved: Log approval with timestamp in Modification Approval Log
   - If rejected: Mark as rejected with reason
   - If deferred: Mark as deferred for post-release
   - **NO modifications may proceed without explicit approval**

   d. After each entry, update beta-report.md and lifecycle.json immediately

9. **Create tasks for approved modifications**:
    - For each approved modification, create a task entry
    - Link task ID to beta-report.md entry

10. **Resolve remaining beta feedback**: After all feedback collected:
    - Present unresolved items
    - For each: Accept (with approval) | Reject (with reason) | Defer (with reason)
    - Update each item's Resolution field

11. **Update lifecycle.json**:
    - If all beta feedback resolved AND all modifications approved/rejected: Set `beta.status` to `complete`, `beta.completed` to timestamp
    - If incomplete: Keep as `in_progress`
    - Write lifecycle.json

12. **Report completion**:

    
```
    ---------------------------------------------------
    PHASE 5 COMPLETE: Beta Release
    ---------------------------------------------------
    Beta Report:          [absolute path to beta-report.md]
    Beta Feedback Items:  [N]
    Modifications:        [N] proposed, [N] approved, [N] rejected
    Gate Status:          [PASS | FAIL | IN PROGRESS]
    Lifecycle:            [absolute path to lifecycle.json]
    ---------------------------------------------------
    
```

    - If PASS: "Phase 5 complete. Run `/wxAI-release` to proceed to Phase 6 (Release)."
    - If FAIL/IN PROGRESS: List unresolved items.

## Key Difference from Phase 4

- Beta feedback uses **BF-** prefix (not FB-) for audit separation (FR-076)
- **ALL modifications require explicit approval** before proceeding (FR-075)
- Approval is logged with timestamp and approver for audit trail
- Beta feedback is stored in beta-report.md (NOT in feedback.md)

## Lifecycle Auto-Update Rules

- lifecycle.json is written after EVERY feedback entry and approval decision
- Resumable: Running `/wxAI-beta` again picks up where it left off
