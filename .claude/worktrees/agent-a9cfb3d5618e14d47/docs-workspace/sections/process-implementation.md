---
id: process-implementation
part: the-process
audience: customer
sources: _wxAI/commands/implement.md, _wxAI/skills/wxCreateTestPlan/SKILL.md, mcp-server/src/prompts/wxgod/references/new-project.md, specs/123-per-scope-stage-progression/spec.md, specs/Project-Scope/123-per-scope-stage-progression.md, _wxAI/commands/wxConversionParity.md
---
# Implementation

Implementation is where the AI writes the code for a spec's tasks, reviews it, and files the scope's test plan.

| What it is for | What you do | What the AI does | Commands | Leaves when | Common blockers |
| --- | --- | --- | --- | --- | --- |
| Turning a spec's tasks into working code, with a review and a test plan. | Run [`/implement`](cmd-implement.md) with the spec number, read the review findings, decide which to fix, and approve the test plan when it stops to ask. | Reads your stack first, writes the code for each task, marks each task in progress, done, or blocked, reviews the changes, files the test plan, and writes the test data the scope needs. | `/implement`. Reviews: [`/wxUIUXCodeReview`](cmd-wxuiuxcodereview.md), [`/wxDBAnalyze`](cmd-wxdbanalyze.md), [`/compliance-scan`](cmd-compliancescan.md). Sync: [`/dbpush`](cmd-dbpush.md). | The scope has tasks and none of them is open. | Open or blocked tasks; the scope is still in Design because it has no tasks; an older kit that refuses the command. |

## What `/implement` does

Run `/implement` with a **spec** number, such as `/implement 017`. If a scope has several specs, run it once for each spec. It works in this order:

1. **Checks the spec.** It confirms the spec exists, that its scope is in a stage where `/implement` may run, and that nothing blocks it.
2. **Builds the tasks.** The AI reads your project's Stack & Style document first, so the code targets your stack, not a default one. For each task it marks the task in progress, writes the code, and marks it done. A task it cannot finish is marked blocked.
3. **Reports progress.** You get a summary of completed, in-progress, pending, and blocked tasks.
4. **Reviews the code.** It runs an advisory code and UI review over the changes it just made. Findings are listed as must-fix, should-fix, or nit. Nothing is fixed automatically. You decide what to fix.
5. **Checks conversion parity.** This runs only in a conversion project, and only when every spec of the scope is done. See [Converting an existing app](process-conversions.md).
6. **Files the test plan.** It runs [`/wxCreateTestPlan`](cmd-wxcreatetestplan.md) for the scope, in plan mode. Plan mode writes and files the plan but runs no tests.
7. **Writes the seed.** It writes the smallest set of test data that makes the scope's screens usable, and checks it against a disposable test database. It never writes test data to a shared or production database.
8. **Reports kit defects.** If the wxKanban kit itself misbehaved, it files one report back to wxperts. Your own failing tests or code errors are not reported.

The AI writes the code. The kit tracks the work and the tasks; it does not generate code on its own.

## The test plan stops to ask you

`/wxCreateTestPlan` pauses at three points, and `/implement` does not approve them for you:

- **Coverage summary.** How many test items, of which kinds, for which requirements. Nothing detailed is written until you approve it.
- **Database review.** A database engineer review lists rules that the database does not enforce. You approve it before data tests are written.
- **Filing.** You confirm before the items are filed into wxKanban.

A filed test plan matters later. A scope with no machine tests stays in QA. See [QA](process-qa.md).

## Other reviews

- `/wxUIUXCodeReview` can also be run on its own, over a wider range of code than one run's changes.
- `/wxDBAnalyze` reviews a PostgreSQL database. It is read-only unless you ask it to apply a change.
- `/compliance-scan` checks your scopes and specs when your project has compliance frameworks turned on.

Each fix you approve from a review becomes a task on the spec it belongs to. Then run `/implement` on that spec. See [When something goes wrong](process-when-things-go-wrong.md).

## After `/implement`

Follow the next steps it prints, such as syncing your specs and tasks to wxKanban with `/dbpush`.

When the scope's last task is done, the scope leaves Implementation and enters QA on its own. It keeps going if QA is already clear.

## When `/implement` may run

`/implement` runs while the scope is in Implementation, QA, or Human Testing, so you can fix problems that testing finds. It refuses a scope in Design, Beta, or Release. The refusal names the scope, its stage, the stage the command needs, and how many tasks are still open.

## If an older kit refuses

- If the refusal names the **project's** stage instead of the scope's, your kit predates per-scope stages. A kit update fixes it.
- If it refuses because more than one spec is active, your kit predates the per-spec check. A kit update fixes this too.

Do not change spec statuses to get around either refusal, and do not edit code outside `/implement`.
