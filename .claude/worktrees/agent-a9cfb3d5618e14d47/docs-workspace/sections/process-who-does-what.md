---
id: process-who-does-what
part: the-process
audience: customer
sources: mcp-server/src/prompts/wxgod/references/new-project.md, specs/Project-Scope/123-per-scope-stage-progression.md, mcp-server/src/prompts/buildscope.md, _wxAI/commands/implement.md, _wxAI/skills/wxCreateTestPlan/SKILL.md, _wxAI/commands/autofix-tests.md, .claude/commands/wxAI-training.md, docs-workspace/sections/testing-user.md
---
# Who does what

Four kinds of people take part in moving a scope from idea to release. You may play more than one part yourself.

- **You**: the developer or project owner who runs the commands.
- **The AI**: the assistant in your editor that runs the commands' steps.
- **Testers**: the people who run the human tests in the web app.
- **Approver**: whoever makes the decisions the process stops for. Often this is you.

| Stage | You | The AI | Testers | Approver |
| --- | --- | --- | --- | --- |
| Design | Describe the feature and answer the AI's questions. Run [`/buildscope`](cmd-buildscope.md), [`/validateScope`](cmd-validatescope.md), and [`/createSpecs`](cmd-createspecs.md). | Checks for an existing scope, interviews you, drafts the scope, grades it, and writes the specs and tasks. | Nothing yet. | Chooses reuse or a new scope, and approves each section of the scope. |
| Implementation | Run [`/implement`](cmd-implement.md) for each spec. Read the review findings. | Writes the code for each task, updates task status, reviews the changes, files the test plan, and writes the test data. | Nothing yet. | Decides which review findings to fix, and approves the test plan's coverage summary and filing. |
| QA | Check the test plan was filed. Run the plan with [`/wxCreateTestPlan`](cmd-wxcreatetestplan.md) `--Execute` and set up the nightly run with [`/preTest`](cmd-pretest.md). | Runs the machine tests, records results, signs off only the items a run proved, and proposes fixes. | Nothing yet. | Confirms each proposed fix, and gives the final sign-off of a test run. |
| Human Testing | Decide who tests what. Follow up on failures. | Suggests who should test what, builds the help, and adds approved fixes as tasks. It never signs a test. | Run each human test in the web app, then pass it, fail it, or add a test. | Each tester signs their own tests. Only a person can sign. |
| Beta | Put the work in front of beta users. Read the feedback. Start each fix as a new scope. | Writes each approved fix as a new scope with `/buildscope`; `/implement` does not run in Beta. | Real users try the work and send feedback. | Decides which feedback becomes a fix. |
| Release | Ask the AI to run the release check. Finish the release work, then deploy. | Runs the release check when you ask. Lists the release steps, if you planned with [`/wxG-O-D`](cmd-wxgod.md). It never deploys or pushes. | Nothing. | Decides when to deploy. |

## What nobody does

Nobody moves a stage by hand. A scope moves on its own when the stage it is in is clear. See [The road at a glance](process-overview.md).

## What the AI never does

- **It never signs a human test.** A sign-off is a person's attestation that they checked the work.
- **It never deploys or pushes.** Deploying is yours. wxKanban never deploys your application.
- **It never answers a gate for you**, unless you ran `/wxG-O-D` with `--create`. In that mode, it answers from the design you approved and logs each answer. It still asks you anything the design does not cover, and testers still sign the human tests.

## Where each person works

- **You and the AI** work in your editor, with the Dev Cockpit alongside. See [Dev Cockpit](part-dev-cockpit.md).
- **Testers** work in the wxKanban web app. See [User tests](testing-user.md).
- **Everyone** can follow a project's progress in the web app. See [Project detail](project-detail.md).
