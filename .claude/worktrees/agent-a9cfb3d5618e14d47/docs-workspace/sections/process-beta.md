---
id: process-beta
part: the-process
audience: customer
sources: mcp-server/src/prompts/wxgod/references/new-project.md, specs/Project-Scope/123-per-scope-stage-progression.md, specs/123-per-scope-stage-progression/spec.md, .claude/commands/wxAI-training.md
---
# Beta

Beta is where real users try the work and tell you what they find, before the scope is released.

| What it is for | What you do | What the AI does | Commands | Leaves when | Common blockers |
| --- | --- | --- | --- | --- | --- |
| Collecting feedback from real users before release. | Put the work in front of beta users, read their feedback, and decide which items need a fix. Start each fix as a new scope. | Writes each fix you approve as a new scope with [`/buildscope`](cmd-buildscope.md). | No command moves a scope through Beta. Fixes start with `/buildscope`. | No task is open, and every test the scope owns is clear. | An open task left from an earlier stage; a test that is not clear. |

## Getting the work to beta users

Beta is a limited release to real users. Any deployment it needs is yours: wxKanban does not deploy your application. See [Release](process-release.md).

## Feedback

Beta feedback reaches the project through its feedback channel. Read it and decide what needs a fix.

A scope leaves Beta when no task is open and every test the scope owns is clear. Then it moves to Release on its own.

## Fixes in Beta

[`/implement`](cmd-implement.md) runs only while a scope is in Implementation, QA, or Human Testing. It refuses a scope in Beta or Release, and the refusal names the stage. So a fix found in Beta is made as a **new scope**:

1. Run `/buildscope` and describe the fix. Say which scope it corrects.
2. The new scope travels the normal road: Design, Implementation, QA, Human Testing, Beta, and Release.

The scope in Beta does not wait for the fix. It moves to Release on its own rule: no open task, and every test it owns clear.

Plan for this: the cheapest time to fix problems is in QA and Human Testing, while `/implement` still runs on the scope itself.

## A change of scope

If feedback shows the scope itself should change, write the change as a new scope with `/buildscope` as well. Amending a scope in Beta with `/buildscope --edit` and re-running [`/createSpecs`](cmd-createspecs.md) gives it new open tasks, and `/implement` cannot build them while the scope is in Beta, so the scope would stay there. See [When something goes wrong](process-when-things-go-wrong.md).
