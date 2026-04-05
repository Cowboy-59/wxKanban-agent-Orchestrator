---
description: Run Phase 6 (Release) — validate all phases complete, select deployment method, generate release notes
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

This command executes Phase 6 (Release) of the 6-phase project lifecycle. It validates that ALL prior phases are complete, presents deployment method options, generates release notes, and records the release in lifecycle.json. The phase BLOCKS if any prior phase has unresolved items.

1. **Prerequisites**: Run `.specify/scripts/powershell/check-prerequisites.ps1 -Json -RequireBeta -IncludeLifecycle` from repo root and parse FEATURE_DIR and AVAILABLE_DOCS list. All paths must be absolute.

2. **Validate ALL prior phases complete** (FR-079): Read `FEATURE_DIR/lifecycle.json`:
   - Check each phase status:
     - `design.status` must be `complete`
     - `implementation.status` must be `complete`
     - `qa.status` must be `complete`
     - `humantest.status` must be `complete`
     - `beta.status` must be `complete`
   - If ANY phase is not complete:

     ```
     ERROR: Cannot enter Release phase. The following phases are incomplete:
       - [phase name]: [current status]

     Resolve all prior phases before releasing.
     ```

     Halt execution.

3. **Validate no unresolved items**: Read feedback.md and beta-report.md:
   - Check feedback.md: All items must have resolution (accepted/rejected/deferred)
   - Check beta-report.md: All items must have resolution, all modifications approved/rejected
   - If unresolved items exist: List them and halt

4. **Initialize lifecycle tracking**: Update `FEATURE_DIR/lifecycle.json`:
   - Set `release.status` to `in_progress` and `release.entered` to current ISO timestamp
   - Log transition: `{ "from": "beta", "to": "release", "timestamp": "...", "reason": "Release phase initiated — all prior phases complete" }`
   - Write lifecycle.json immediately

5. **Load context**:
   - **REQUIRED**: Read spec.md — feature overview and requirements summary
   - **REQUIRED**: Read tasks.md — completed tasks list
   - **REQUIRED**: Read qa-report.md — test results summary
   - **REQUIRED**: Read feedback.md — human testing feedback summary
   - **REQUIRED**: Read beta-report.md — beta feedback summary
   - **IF EXISTS**: Read plan.md — deployment context

7. **Determine version number**:
   - Check for existing version in lifecycle.json or package.json
   - If user provided version in {{args}}, use that
   - Otherwise, suggest next version based on changes:
     - MAJOR: Breaking changes identified in spec
     - MINOR: New feature (most common for new specs)
     - PATCH: Bug fixes only
   - Present suggestion and let user confirm or override

8. **Present deployment methods** (FR-077): Detect available options from project context:

   Scan for:
   - `package.json` scripts (build, deploy, publish)
   - `Dockerfile` or `docker-compose.yml`
   - `.github/workflows/` (CI/CD pipelines)
   - `deploy/` or `deployment/` directory
   - `vercel.json`, `netlify.toml`, `fly.toml`
   - `terraform/` or `*.tf` files

   Present detected options to user:

   ```
   Available deployment methods detected:

   | # | Method | Source | Details |
   |---|--------|--------|---------|
   | 1 | npm publish | package.json | Publish to npm registry |
   | 2 | Docker | Dockerfile | Build and push container |
   | 3 | GitHub Actions | .github/workflows/ | CI/CD pipeline |
   | 4 | Manual | — | Manual deployment steps |
   | 5 | Custom | — | Specify your own method |

   Select deployment method (number or description):
   ```

   Wait for user selection.

9. **Generate release-notes.md** in FEATURE_DIR:

   ```markdown
   # Release Notes: [FEATURE NAME]

   **Version**: [version]
   **Release Date**: [DATE]
   **Feature Branch**: `[###-feature-name]`
   **Deployment Method**: [selected method]

   ## Summary

   [Feature overview extracted from spec.md — 2-3 sentences]

   ## Changes

   ### New Features

   [List of completed functional requirements from spec.md, grouped by category]

   ### Implementation Details

   [Summary of completed tasks from tasks.md — key modules, components, APIs built]

   ## Testing Summary

   - **Automated Tests**: [passed]/[total] from qa-report.md
   - **Human Test Scenarios**: [passed]/[total] from feedback.md
   - **Beta Feedback Items**: [N] resolved from beta-report.md

   ## Known Issues

   [List any deferred feedback items from Phase 4 and Phase 5]

   ## Deferred Items

   [List any features or feedback marked as "deferred" during testing phases]

   ## Release Metadata

   - **Version**: [version]
   - **Release Date**: [DATE]
   - **Deployment Method**: [method]
   - **Released By**: [user or system]
   - **Lifecycle Phases Completed**: 6/6
   ```

10. **Record release metadata** (FR-078): Update lifecycle.json:
    - Set `release.status` to `complete`, `release.completed` to current timestamp
    - Add release metadata:
      ```json
      "release": {
        "status": "complete",
        "entered": "...",
        "completed": "...",
        "version": "...",
        "method": "...",
        "date": "..."
      }
      ```
    - Write lifecycle.json

12. **Report completion**:

    ```
    ===================================================
    PHASE 6 COMPLETE: RELEASE
    ===================================================

    Version:          [version]
    Release Date:     [DATE]
    Deployment:       [method]
    Release Notes:    [absolute path to release-notes.md]
    Lifecycle:        [absolute path to lifecycle.json]

    Phase Summary:
      1. Design:         ✓ Complete
      2. Implementation:  ✓ Complete
      3. QA Testing:      ✓ Complete
      4. Human Testing:   ✓ Complete
      5. Beta Release:    ✓ Complete
      6. Release:         ✓ Complete

    All 6 phases complete. Feature is released!
    ===================================================
    ```

## Release Blockers

The following conditions will BLOCK the release:

- Any prior phase not in `complete` status
- Unresolved feedback items in feedback.md
- Unresolved beta feedback in beta-report.md
- Unapproved modifications from beta phase
## Lifecycle Auto-Update Rules

- lifecycle.json is written after EVERY status change
- The release phase is the ONLY phase that writes the final "all phases complete" state
- lifecycle.json serves as the permanent record of the feature's journey through all 6 phases
