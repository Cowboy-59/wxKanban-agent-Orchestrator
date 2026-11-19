---
id: process-qa
part: the-process
audience: customer
sources: mcp-server/src/prompts/wxgod/references/new-project.md, specs/Project-Scope/123-per-scope-stage-progression.md, _wxAI/skills/wxCreateTestPlan/SKILL.md, .claude/commands/preTest.md, _wxAI/commands/autofix-tests.md, _wxAI/commands/implement.md
---
# QA

QA is where machine tests prove the scope works, before people spend time testing it.

| What it is for | What you do | What the AI does | Commands | Leaves when | Common blockers |
| --- | --- | --- | --- | --- | --- |
| Proving with machine tests that the scope works. | Check that the scope's test plan was filed, set up a test environment, run the plan and verify its final gate, and confirm each proposed fix. Optionally, set up the nightly run. | Runs the machine test items, records each result, signs off each item a run proved, and sorts every failure. | [`/wxCreateTestPlan`](cmd-wxcreatetestplan.md), [`/preTest`](cmd-pretest.md), [`/autofix-tests`](cmd-autofixtests.md), and [`/implement`](cmd-implement.md) for fixes. | No task is open, the scope has at least one machine test, and every machine test it owns is signed off with none failing. | No machine tests; failing or unsigned tests; no proven non-production database for the data tests; the nightly check refuses. |

## A scope with no machine tests stays in QA

This is the most common reason a scope stops here. Leaving QA needs at least one machine test, so a scope without a test plan never moves on.

`/implement` files the test plan at the end of its run. If it was skipped or not approved, the plan is missing. Check that the scope's test plan was filed. If not, run `/wxCreateTestPlan SCOPE-NNN` and approve it at each stop.

## Set up your test environment

Machine tests that write data never run against production. Here is what the commands set up for you, and what you must provide.

### What is set up for you

- **`/preTest SCOPE-NNN` builds its own test database for each run.** Depending on your stack, it is a copy of your database structure in the same database server, a database file made for the run, or a database container started for the run. Before it writes anything, it proves the copy is separate from production and keeps every constraint production enforces; if either check fails, it refuses. It then loads the scope's test data and starts your real application against the copy. You do not need a running app or a test database of your own for it. When it ends green, it leaves that environment running so you can look at real screens with known data.
- **`/wxCreateTestPlan SCOPE-NNN --Execute` writes only to a database proven not to be production.** If none is set up, it offers a disposable one first. If you decline, the create, read, update, and delete gate does not run and is reported as blocked.
- **Both learn your stack from a stack adapter in the kit.** If no adapter fits your stack, the AI writes one from your project, tells you it is provisional, and continues.

### What you provide for the nightly run

The nightly run is different: it tests your application where it is deployed for testing, overnight. You provide:

- **A test server** to run it on. A developer machine also works; the run then stops at 06:00 by default.
- **Your application, running there against its own non-production database.** Or, instead, the commands that let the run start the application itself against its own database.
- **The addresses of your test and production apps and databases.** The run refuses any address on the production list, or not on the test list. There is no override.
- **How a user signs in**: the sign-in page, and your portal if users reach the app through one.
- **Test accounts**: normal user accounts the run signs in with. Their user names, passwords, and authenticator secrets live in the test server's secret store, never in the settings file.
- **The admin pages a normal user must be refused.** The run checks that each one is.
- **A schedule**, the time of night the run starts.

These settings live in the `config.json` file in your project's `docs-workspace` folder, in its `environments`, `entryPath`, and `nightly` blocks. If your project has no `docs-workspace` folder yet, create it and an empty `config.json` file in it. Run [`/preTest`](cmd-pretest.md) `--nightly` to check them. It names anything missing and writes nothing.

This Manual does not yet cover building the test server, deploying your application to it, or creating its database and test accounts. Those are yours to set up.

## Running the plan

Run `/wxCreateTestPlan SCOPE-NNN --Execute` when you want the tests to run. It runs the machine items only, through three gates, and stops after each one:

1. **Smoke.** Every part responds without crashing. Nothing is written.
2. **Create, read, update, delete.** Real round-trips against a database proven not to be production. If no such database is proven, this gate does not run and is reported as blocked. It never writes to production.
3. **Final sign-off.** The AI shows you the evidence and stops. You verify and sign off. You can add new test cases at this point; they are filed and run before you sign.

Before a run starts, the AI lists the items it will run. The same list appears in the web app's QA view; see [Automated tests (QA)](testing-qa.md).

A run signs off only the items it actually passed. Every failure goes into one bucket: the test was wrong, the code is wrong, the feature is not built yet, or no spec covers the behavior. The AI does not change a test just to make it pass.

## Checking one scope end to end

`/preTest SCOPE-NNN` stands up a disposable copy of your database structure, loads the scope's test data, starts the real application, and drives every route and screen the scope touched. It repairs what it can in up to three rounds, and it never weakens a test to make it pass. It ends in one of three results:

- **green**: the first two gates passed and are recorded; the final sign-off is waiting for you.
- **red**: it lists what failed and every repair it tried.
- **refused**: a safety check did not hold, and nothing was written.

### What clears QA

QA clears when no task is open, the scope has at least one machine test, and every machine test it owns has passed in a run and been signed off. You do not sign machine tests one by one: when a run proves a test, that run records its sign-off. `/wxCreateTestPlan SCOPE-NNN --Execute` does this for each test it proves, and so does the nightly run. **Either one is enough; the nightly run is optional.** Its value is that it keeps testing as your code changes, without you starting it.

## The nightly run

`/preTest --nightly` checks your setup and shows the plan for the night. It writes nothing. When the check passes, `/preTest --nightly --install` schedules the run on your test server.

Each night it tests what the day's changes reached, plus a rotation of other items. Failures arrive as tasks, and you get a summary each morning. The nightly run signs off each item it proves, the same way `--Execute` does, so a scope's machine test gate can clear overnight without you running anything.

It refuses a production target or any target that is not listed. It also refuses when no test server or test accounts are set up. It never commits, pushes, deploys, or edits a test.

## Fixing failures

- `/autofix-tests` finds failing tests, works out the cause, and proposes a fix. It confirms each fix with you unless you pass `--auto-apply`.
- A failure in the code becomes a task on its spec. The nightly run opens these tasks for you. For a failure you found yourself, ask your AI to add one in plain words: "add a task to SPEC-NNN: what fails and what should happen". Then run `/implement` on that spec. `/implement` runs while the scope is in QA, and the scope stays in QA until its tests pass. See [When something goes wrong](process-when-things-go-wrong.md).

## Moving on

When QA is clear, the scope enters Human Testing on its own. Entering Human Testing releases the scope's human tests to your testers.

If your project has testing switched off, the test conditions count as met, and scopes move on their tasks alone.
