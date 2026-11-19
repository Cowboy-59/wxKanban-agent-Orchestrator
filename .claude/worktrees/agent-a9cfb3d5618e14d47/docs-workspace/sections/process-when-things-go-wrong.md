---
id: process-when-things-go-wrong
part: the-process
audience: customer
sources: mcp-server/src/prompts/wxgod/references/new-project.md, specs/Project-Scope/123-per-scope-stage-progression.md, specs/123-per-scope-stage-progression/spec.md, mcp-server/src/prompts/buildscope.md, mcp-server/src/prompts/createspecs.md, _wxAI/commands/implement.md, _wxAI/commands/autofix-tests.md, _wxAI/skills/wxCreateTestPlan/SKILL.md
---
# When something goes wrong

Most problems show up the same way: a scope stops moving, or a command refuses to run. This section shows how to read the reason and what to do about it.

## Read the scope's blockers

Ask the AI for the scope's stage. It reports the stage, what would advance the scope, and what is blocking it. The Dev Cockpit does not show stages. It lists scopes that still have incomplete tasks, with each scope's status, so a scope that is only waiting on tests may not appear there at all. See [Scopes](cockpit-scopes.md).

| Blocker | What it means | What to do |
| --- | --- | --- |
| The scope has no tasks yet | The scope is still in Design. | Run [`/createSpecs`](cmd-createspecs.md) for the scope. |
| Some tasks are still open | It shows how many, such as "3 of 12 tasks still open". A blocked task counts as open. | Finish them with [`/implement`](cmd-implement.md), or deal with what blocks them. |
| A test gate has tests outstanding | QA, Human Testing, or the final check is waiting on tests. It names them. | In QA, run or fix the machine tests. In Human Testing, testers sign their tests. See [QA](process-qa.md) and [Human Testing](process-human-testing.md). |
| No machine tests | The scope has no machine tests, so it stays in QA. | Check the test plan was filed. If not, run [`/wxCreateTestPlan`](cmd-wxcreatetestplan.md) for the scope. |
| The scope is inactive | The scope is archived or deferred. Inactive scopes do not advance, and scoped commands refuse them. | Decide whether the work should continue. Until the scope is active again, it stays where it is. |
| Work on entering a stage failed | The scope moved, but the work that goes with entering the stage, such as releasing human tests, failed. | Nothing. It is retried on every advance attempt. If it keeps failing, see [Where to get help](get-help.md). |

## A command refused to run

A stage refusal names the scope, its stage, the stage the command needs, and how many tasks are still open. For example, `/implement` runs only in Implementation, QA, and Human Testing.

An unknown command gets a different message: it says the command is not recognized and lists the available ones. If you see that, check the spelling, or see the [Command Reference](part-command-reference.md).

If a refusal names the **project's** stage instead of a scope's, or refuses `/implement` because more than one spec is active, your kit is older than the current rules. A kit update fixes both. Do not change spec statuses to get around a refusal.

## A fix becomes a task

When a review, a test, or a tester finds a problem, do not fix it by editing code outside the process. Instead:

1. Decide whether to fix it. The choice is yours.
2. Add the fix as a task on the spec it belongs to. The next part shows how.
3. Run `/implement` on that spec.

This works while the scope is in Implementation, QA, or Human Testing. The scope stays in its stage until the new task is done and its tests pass. Nothing moves backward. In Beta and Release, `/implement` does not run; see "Fixes in Beta and Release" below.

For failing tests, [`/autofix-tests`](cmd-autofixtests.md) can find the cause and propose a fix. It confirms each fix with you unless you pass `--auto-apply`.

### How to add a task to a spec

Ask your AI in plain words, naming the spec and the fix. For example:

> Add a task to SPEC-012: the invoice total ignores the discount line. Expected: the total subtracts the discount.

The AI creates the task in wxKanban and attaches it to that spec, so it counts against the spec's scope and `/implement` picks it up. Give the spec number, not the scope number; a scope can have several specs. If you are not sure which spec, ask the AI which spec covers the behavior first.

Some fixes arrive as tasks already: the nightly test run opens one task for each real failure, and the AI turns each failure you approve into a task when it proposes fixes.

The web app can also make tasks, for example with **Create task from this report** on a bug report in the project's **Bug Reports** view. A task made in the web app is not attached to a spec, so it does not hold a scope in its stage. To have a fix built with `/implement`, add it to the spec through your AI as shown above.

## Fixes in Beta and Release

`/implement` refuses a scope in Beta or Release. A fix found in Beta is therefore made as a **new scope**:

1. Run [`/buildscope`](cmd-buildscope.md) and describe the fix. Say which scope it corrects.
2. The new scope travels the normal road: Design, Implementation, QA, Human Testing, Beta, and Release.

The original scope does not wait for the new one. It leaves Beta when it has no open task and every test it owns is clear.

## A change of scope

If the problem is the scope itself, such as a missing requirement or a changed rule, change the scope rather than adding a task:

1. Run [`/buildscope --edit NNN`](cmd-buildscope.md) with the scope number. It merges your change into the scope and leaves the sections you did not touch as they were.
2. Before anything is written, it shows what the change could affect: the specs that implement the scope, the code built for it, and the scopes that depend on it. It asks whether to write the change. If you say no, the scope stays unchanged.
3. Run `/createSpecs` for the scope. It runs on a scope in any stage and updates the specs and tasks in place.

New open tasks hold the scope in its current stage until they are done. For a scope in Beta or Release, start a new scope instead, as described under "Fixes in Beta and Release": `/implement` cannot build new tasks there.

## Test failures that are not code

Not every failure means the code is wrong. A test run sorts each failure: the test was wrong, the code is wrong, the feature is not built yet, or no spec covers the behavior. A behavior no spec covers needs a decision in the scope, not a guess in a test.

If the data tests are reported as blocked, no database has been proven to be non-production. The test plan never writes to production. Accept the disposable test database the AI offers, or point it at a database that is not production.

## When the kit itself misbehaves

If a wxKanban command errors or a gate passes or blocks wrongly during `/implement`, it reports the defect to wxperts on its own. For other problems, see [Troubleshooting](troubleshooting.md) and [Where to get help](get-help.md).
