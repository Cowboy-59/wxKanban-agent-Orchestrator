# Spec 118: Fence Audit Gate Restoration

## Overview

The `auditfences` CI gate has failed on every run since at least 2026-07-29. A gate that is permanently red enforces nothing: merges proceed past it, and a genuine new violation is indistinguishable from the standing 1,893 errors. The check still runs, still costs CI minutes, and still reports — but nobody can act on it, so un-fenced code enters the repository unchallenged despite spec 026 declaring it a defect. This spec restores the gate to a state where red means "you broke something."

## Business Problem

Measured 2026-07-31 against main: 1,893 errors across 4,074 files scanned, with 839 fences found. That single number is two unrelated problems wearing one error count.

885 errors (46.8 percent) come from `.agents/` (installed Claude skills), `.claude/` and `.history/` (VS Code local history) — directories git has already been told to ignore. All three are listed in `.gitignore`, and zero `.history` files are tracked. The scanner walks the filesystem rather than consulting git, so it audits installed Claude skills against wxKanban's internal fencing convention: files that were never going to comply and never should. `DEFAULT_IGNORE` already carries `.claude/skills` from SCOPE 081 / T004; the pattern was simply never extended. This is the second filesystem-versus-git defect in this codebase — kit sync had the same class, where untracked files under ignored paths shipped to a public release.

Approximately 795 errors (42.0 percent) are genuine un-fenced declarations in project code: the real backlog, masked for weeks by the noise above.

213 errors (11.2 percent) are fences citing task IDs that do not resolve against `specs/`. These are broken references, not missing fences, and the remedy differs.

The consequence compounds: the fence job shares a workflow with the `schema-drift` gate delivered under SCOPE-117, so the workflow reports red overall even when the schema gate passes, masking a genuinely important new signal behind long-standing noise.

## Actors

- Primary: Developer merging a change — the person the gate is supposed to stop.
- Secondary: Platform maintainer responsible for the spec-026 fencing convention.
- Secondary: CI pipeline reporting merge status to reviewers.
- Secondary: Anyone auditing whether spec 026 is actually enforced rather than merely declared.

## Success Metrics

1. Errors originating in gitignored paths drop from 885 to 0.
2. `auditfences --strict` exits 0 against main, and 1 intentionally un-fenced declaration makes it exit non-zero and name that declaration.
3. The legacy baseline answers "what un-fenced code remains?" with a count and a date — approximately 795 declarations recorded, and 0 silently erased.
4. The auditfences workflow reports green overall, so the schema-drift job is no longer masked by a red sibling.
5. `UNKNOWN_TASK` findings are reported under a distinct code — 213 classified, 0 conflated with missing fences.
6. Consumer safety: 0 files that were audited before this change stop being audited after it, verified against at least 1 consumer project.
7. The advisory period produces evidence: every run records would-block or would-pass, and the decision to flip the gate to blocking is made within 1 release cycle.

## Scope Boundary

Correct the auditor's scanning boundary so it stops reporting vendored and non-project directories, honouring `.gitignore` so the defect class is fixed rather than the single instance, with `DEFAULT_IGNORE` retained as the floor for projects that have no `.gitignore`. Baseline the genuine project-code backlog as dated, queryable debt rather than fencing approximately 795 declarations across roughly 200 files. Report `UNKNOWN_TASK` findings under a distinct code and demote them to warnings pending triage. Run the fence gate non-blocking for one release cycle, recording whether it would have blocked, then flip it to blocking on a defined trigger with a review date. Keep the change safe for consumer projects, since `auditfences-scanner.ts` ships to every one of them.

## Out of Scope

Changing the fencing convention itself — spec 026 stands unaltered. Retro-fencing historical code for tidiness beyond what is needed to bring the gate green; the backlog is deliberately deferred as recorded debt. The `schema-drift` job, which is already green and was delivered under SCOPE-117. Node 20 deprecation warnings in the workflow. Any change to what constitutes a valid fence, or to how the orchestrator authors them. Triage of the 213 broken fence references themselves, which is recorded as an open question rather than performed here.

## Open Questions

1. What is the correct disposition of the 213 `UNKNOWN_TASK` findings — do they cite tasks that were renumbered, tasks in specs since archived, or fences authored against task IDs that never existed? Triage is deferred; the count is recorded so it cannot be lost.
2. When exactly does the gate flip from advisory to blocking? The trigger is 1 release cycle with zero false positives, but the release boundary must be named so the advisory state does not become permanent.
3. Does any consumer project rely on the scanner auditing paths their `.gitignore` excludes? This must be verified against at least 1 consumer before the kit release.

## Functional Requirements

FR-001 — The auditor scans only project code. Files git is told to ignore produce zero findings, verified by the measured drop from 1,893 to approximately 1,008 errors from this change alone. Implemented by respecting `.gitignore` rather than a hardcoded directory list, with `DEFAULT_IGNORE` retained as the floor for projects without one. No currently-audited project file may silently drop out of scope: the change in scanned-file count is reported and reviewed.

FR-002 — The legacy backlog is baselined, dated and queryable. Remaining project-code violations are captured into the legacy baseline with a date and a count, recording what was deferred rather than only a file hash, so "what un-fenced code remains?" is answerable. Anything introduced after the baseline date is reported as an error rather than absorbed. The existing 2026-05-13 baseline of 2,759 entries is extended, not replaced.

FR-003 — Broken fence references are distinguished from missing fences. The 213 `UNKNOWN_TASK` findings are reported under a distinct code from `UNFENCED_DECL`, and the output states that the remedy differs: correct the label or restore the spec, rather than add a fence. These are demoted to warnings pending triage so they do not hold the gate red.

FR-004 — Green is the resting state, and red is provably meaningful. `auditfences --strict` exits 0 against main once FR-001 through FR-003 are complete, and an intentionally un-fenced declaration makes it exit non-zero naming that declaration — the same fail-first proof SCOPE-117 required of its drift detector. The gate runs non-blocking for 1 release cycle, recording whether it would have blocked so the advisory period produces evidence, and flips to blocking on a defined trigger recorded with a review date.

FR-005 — The change is safe for consumer projects. `auditfences-scanner.ts` ships to every consumer, so honouring `.gitignore` must not cause a consumer's own source to stop being audited. Behaviour is unchanged for a consumer with no `.gitignore`. The change ships through the normal kit release rather than silently altering consumers mid-version.
