---
id: process-release
part: the-process
audience: customer
sources: mcp-server/src/prompts/wxgod/references/new-project.md, specs/Project-Scope/123-per-scope-stage-progression.md, specs/123-per-scope-stage-progression/spec.md, _wxAI/commands/wxG-O-D.md, _wxAI/skills/wxCreateTestPlan/SKILL.md, .claude/commands/wxAI-training.md
---
# Release

Release is the final stage. The scope's work is done, tested, and signed off, and it is ready for you to ship.

| What it is for | What you do | What the AI does | Commands | Leaves when | Common blockers |
| --- | --- | --- | --- | --- | --- |
| Marking a scope as finished and ready to go live. | Ask your AI to run the release check, finish the release work, then deploy. | Runs the release check when you ask. Lists the release steps from your plan, if you have one. It never deploys and never pushes. | None. No command moves a scope into Release, and no command deploys it. | Never. Release is the final stage. | Before the release check: an earlier stage that is not complete, or a forced test that is not clear anywhere in the project. |

## You deploy

**You deploy your application. wxKanban never deploys it.**

wxKanban tracks the work and checks the gates. Getting the application onto your servers, and pushing your code, stays with you. When [`/wxG-O-D`](cmd-wxgod.md) builds a whole project, it ends by telling you the run is ready for you to push and deploy. It does not do either.

## How a scope gets here

A scope enters Release on its own when it leaves Beta: no task is open and every test the scope owns is clear. Nobody moves it by hand.

The project's stage is the lowest stage among its scopes. So the project shows Release only when every scope has reached it.

## The release check

The release check is a project-wide check, separate from each scope's own stages. It needs two things:

- every earlier stage of the project complete;
- every forced test, machine or human, clear across the whole project. A forced test is one whose force-test setting is on. An administrator sets it for a scope, and can change it for a single test.

The check covers the whole project on purpose. It catches a forced test that was added to a scope after that scope had already moved on.

**How to run it:** ask your AI whether the project is clear to release. It reads the same verdict the web app's phase views use, so the two cannot disagree, and it names each forced test that is not clear.

When the project's own phase is advanced from Beta to Release in the web app, wxKanban records the current test version as promoted to production. This is a record of what was tested and released. It does not deploy anything.

## Release work

Before you deploy, make sure the release work is done. If you planned the project with `/wxG-O-D`, its management plan lists the release steps, including:

- a license check of your dependencies, for a commercial application;
- monitoring for the service level you agreed;
- a rollback plan, in case the release has to be undone.

## After release

The scope stays in Release; nothing moves backward. New work starts as a new scope from [`/buildscope`](cmd-buildscope.md), and a new scope begins in Design.
