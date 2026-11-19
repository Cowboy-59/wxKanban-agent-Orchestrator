# Spec 118: Fence Audit Gate Restoration

**Spec Number**: 118
**Status**: `draft`
**Created**: 2026-07-31
**Depends On**: None (sibling of SCOPE-117; shares the "a detector nobody trusts is worse than none" premise)
**Source**: `specs/Project-Scope/118-fence-audit-gate-restoration.md`

## Overview

The `auditfences` CI gate has failed on every run since at least 2026-07-29. A gate that is
permanently red enforces nothing: merges proceed past it, and a genuine new violation is
indistinguishable from the standing 1,893 errors. The check still runs, still costs CI minutes,
and still reports — but nobody can act on it, so un-fenced code enters the repository unchallenged
despite spec 026 declaring it a defect.

This scope restores the gate to a state where **red means "you broke something."**

## Business Problem

Measured 2026-07-31 against `main`: **1,893 errors across 4,074 files scanned, 839 fences found.**

That single number is two unrelated problems wearing one error count:

| Cause | Errors | Share | Nature |
| --- | --- | --- | --- |
| Auditor scans code that isn't ours — `.agents/` (installed Claude skills), `.claude/`, `.history/` (VS Code local history) | **885** | 46.8% | Mis-scoped tool |
| Genuine un-fenced declarations in project code (`UNFENCED_DECL`) | ~795 | 42.0% | Real backlog |
| Fences citing task IDs that do not resolve (`UNKNOWN_TASK`) | 213 | 11.2% | Broken references |

Nearly half the failures come from directories **git has already been told to ignore**.
`.history/`, `.agents/` and `.claude/skills/` are all in `.gitignore` (lines 78, 141, 142), and
zero `.history` files are tracked. The scanner walks the filesystem rather than consulting git, so
it audits installed Claude skills against wxKanban's internal fencing convention — files that were
never going to comply and never should.

`DEFAULT_IGNORE` already carries `.claude/skills` (added under SCOPE 081 / T004); the pattern was
simply never extended. This is the **second filesystem-vs-git defect** in this codebase — kit sync
had the same class, where untracked files under ignored paths shipped to a public release.

The consequence compounds: because the fence job shares a workflow with the `schema-drift` gate
delivered under SCOPE-117, the workflow reports red overall even when the schema gate passes. A
genuinely important new signal is masked by long-standing noise.

## Actors

- Primary: Developer merging a change — the person the gate is supposed to stop.
- Secondary: Platform maintainer responsible for the spec-026 fencing convention.
- Secondary: CI pipeline reporting merge status.
- Secondary: Anyone auditing whether spec 026 is actually enforced rather than merely declared.

## Success Metrics

1. Errors originating in gitignored paths drop from **885 to 0**.
2. `auditfences --strict` exits **0** against `main`, and an intentionally un-fenced declaration
   makes it exit non-zero and name that declaration.
3. The legacy baseline answers "what un-fenced code remains?" with a count and date —
   approximately **795 declarations recorded**, and **0** silently erased.
4. The `auditfences` workflow reports green overall, so the `schema-drift` job is no longer masked
   by a red sibling.
5. `UNKNOWN_TASK` findings are reported under a distinct code — **213 classified**, **0** conflated
   with missing fences.
6. Consumer safety: **0** files that were audited before this change stop being audited after it,
   verified against at least **1** consumer project.
7. The advisory period produces evidence: every run records would-block / would-pass, and the
   decision to flip the gate to blocking is made within **1** release cycle.

## Scope Boundary

Correct the auditor's scanning boundary so it stops reporting vendored and non-project
directories, preferring to honour `.gitignore` so the defect class is fixed rather than the single
instance. Baseline the genuine project-code backlog as dated, queryable debt rather than fencing
approximately 795 declarations across roughly 200 files. Report `UNKNOWN_TASK` findings under a
distinct code and demote them to warnings pending triage, because the remedy for a broken
reference differs from the remedy for a missing fence. Run the fence gate non-blocking for one
release cycle, recording whether it would have blocked, then flip it to blocking on a defined
trigger. Keep the change safe for consumer projects, since the scanner ships to every one of them.

## Out of Scope

Changing the fencing convention itself — spec 026 stands unaltered. Retro-fencing historical code
for tidiness beyond what is needed to bring the gate green; the backlog is deliberately deferred
as recorded debt. The `schema-drift` job, which is already green and was delivered under
SCOPE-117. Node 20 deprecation warnings in the workflow. Any change to what constitutes a valid
fence, or to how the orchestrator authors them.

## Open Questions

1. What is the correct disposition of the 213 `UNKNOWN_TASK` findings — do they cite tasks that
   were renumbered, tasks in specs that were archived, or fences authored against task IDs that
   never existed? Triage is deferred; the count is recorded so it cannot be lost.
2. When exactly does the gate flip from advisory to blocking? The trigger is "one release cycle
   with zero false positives", but the release boundary must be named so C-3 does not become
   permanent drift.
3. Does any consumer project rely on the scanner auditing paths their `.gitignore` excludes? FR-005
   requires verification against at least one consumer before the kit release.

## Functional Requirements

FR-001 — The auditor scans only project code. Files git is told to ignore produce zero findings, verified by the measured drop from 1,893 to approximately 1,008 errors from this change alone. Implemented by respecting `.gitignore` rather than a hardcoded directory list, so the class of defect is fixed rather than the instance, with `DEFAULT_IGNORE` retained as the floor for projects that have no `.gitignore`. No currently-audited project file may silently drop out of scope: the change in scanned-file count is reported and reviewed.

FR-002 — The legacy backlog is baselined, dated and queryable. Remaining project-code violations are captured into the legacy baseline with a date and a count, recording what was deferred rather than only a file hash, so the question "what un-fenced code remains?" is answerable. Anything introduced after the baseline date is reported as an error rather than absorbed. The existing 2026-05-13 baseline of 2,759 entries is extended, not replaced.

FR-003 — Broken fence references are distinguished from missing fences. The 213 `UNKNOWN_TASK` findings are reported under a distinct code from `UNFENCED_DECL`, and the output states that the remedy differs — correct the label or restore the spec, rather than add a fence. These are demoted to warnings pending triage so they do not hold the gate red.

FR-004 — Green is the resting state, and red is provably meaningful. `auditfences --strict` exits 0 against `main` once FR-001 through FR-003 are complete, and an intentionally un-fenced declaration makes it exit non-zero naming that declaration — the same fail-first proof SCOPE-117 required of its drift detector. The gate runs non-blocking for one release cycle, recording whether it would have blocked so the advisory period produces evidence, and flips to blocking on a defined trigger recorded with a review date.

FR-005 — The change is safe for consumer projects. `auditfences-scanner.ts` ships to every consumer, so honouring `.gitignore` must not cause a consumer's own source to stop being audited. Behaviour is unchanged for a consumer with no `.gitignore`. The change ships through the normal kit release rather than silently altering consumers mid-version.

## Data Requirements

No database tables are added, modified or removed. The only persisted artifact is the legacy
baseline file `.wxai/auditfences-legacy.json`, which is extended with a dated block recording the
deferred declarations alongside the existing 2,759 hash entries.

## API Routes

None. This scope changes a CLI scanner and a CI workflow; no HTTP surface is added or modified.

## Frontend Components

None. No UI surface is involved.

## Key Entities

| Entity | Description |
| --- | --- |
| **Fence** | The `[SCOPE nnn / Tnnn]` BEGIN/END comment pair that attributes a top-level declaration to the spec and task that authored it (spec 026). |
| **Un-fenced declaration** | A top-level declaration with no fence. A defect under spec 026 unless covered by the legacy baseline. |
| **Legacy baseline** | The dated record of pre-existing violations that are suppressed from the gate but retained as debt. |
| **Broken fence reference** | A fence citing a task ID that does not resolve against `specs/`. Distinct from a missing fence, with a different remedy. |
| **Gate credibility** | The property that a red result denotes a real, actionable violation introduced by the change under review. |

## Constraints

- **C-1** — `auditfences-scanner.ts` is kit code shipped to every consumer project. A change that
  makes the gate quieter propagates silently to all of them. FR-005 exists specifically for this.
- **C-2** — Baselining suppresses approximately 795 real violations. That is a deliberate debt, not
  a fix. Without FR-002's dated, queryable record it becomes invisible and is never repaid.
- **C-3** — The non-blocking period is temporary **by decision**. Without FR-004's flip trigger it
  reproduces the exact pathology this scope exists to correct: a check nobody must act on.
- **C-4** — This is the second filesystem-vs-git defect in this codebase; kit sync was the first,
  where untracked files under gitignored paths shipped to a public release. Respecting `.gitignore`
  fixes the class; a directory list fixes only this instance.
- **C-5** — Fences are authored by the orchestrator only. This scope hand-writes none.
- **C-6** — Kit changes ship via the normal kit release process, never silently mid-version.
- **C-7** — Measured baseline for verification, captured 2026-07-31 on `main`: 1,893 errors,
  4,074 files scanned, 839 fences, 885 errors in gitignored paths, 213 `UNKNOWN_TASK`.

## Compliance Requirements

SOC2 is active on this project.

| Control | Requirement | How this scope satisfies it |
| --- | --- | --- |
| **CC8.1** | Formal change management; review approval before merge | A merge gate that is permanently red enforces no approval condition. Restoring it makes the control real rather than declared. |
| **CC7.1** | Vulnerability and defect findings tracked to resolution; silent ageing is the failure mode | FR-002 converts an ignored error count into dated, queryable debt with a count. |

## Notes

**Relationship to SCOPE-117.** Same premise, one layer up. SCOPE-117 insisted its drift detector be
observed *failing* before being trusted; this scope is the converse — a check observed only failing
is equally useless. Both scopes exist because an unreliable signal is worse than no signal: it
manufactures the appearance of enforcement.

**Why the error count misleads.** "1,893 errors" reads as an overwhelming backlog. In fact 885 of
them are the tool auditing installed Claude skills against a convention those files were never
subject to. Counting them has masked the ~795 real ones for weeks, which is why the true backlog
was never addressed.

**Measured evidence** (2026-07-31, `main`): errors by area — `src/server/` 384, `src/client/` 201,
`mcp-server/` 123, `wxkanban-agent/` 88, `scripts/` 78, `src/` other 58, `vscode-extension` 25,
`_wxAI` 21, `tests/` 15, `docs-workspace` 12, remainder 7; plus 885 in `.agents/`, `.claude/` and
`.history/`.

## Clarifications

### Session 2026-07-31

| # | Question | Decision |
|---|----------|----------|
| 1 | Frame as gate credibility, or straight backlog cleanup? | Gate credibility. The error count is misleading; the goal is that red means something. |
| 2 | Fence the ~795 genuine violations, or baseline them as legacy? | Baseline as legacy. Fencing ~200 files is enormous churn for no behavioural gain. |
| 3 | Add `.history/` to `.gitignore`? | Not needed — already ignored (line 78), 0 files tracked. The premise of the question was wrong; the real defect is that the scanner ignores git. |
| 4 | Is FR-005 (consumer safety) proportionate? | Yes, keep it. The scanner ships to every consumer. |
| 5 | Should the restored gate block immediately? | No — non-blocking / warning for one release cycle, then flip to blocking on a defined trigger. |
