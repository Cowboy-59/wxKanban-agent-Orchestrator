---
id: process-overview
part: the-process
audience: customer
sources: mcp-server/src/prompts/wxgod/references/new-project.md, specs/123-per-scope-stage-progression/spec.md, specs/Project-Scope/123-per-scope-stage-progression.md, CONTEXT.md, .claude/commands/wxAI-training.md, _wxAI/commands/wxBrainstorm.md, _wxAI/commands/wxG-O-D.md
---
# The road at a glance

This part of the manual follows one piece of work from an idea to a released feature. Read it once from start to finish. After that, use it as a reference when a scope seems stuck.

## The six stages

Every scope passes through six stages, in this order:

| Stage | In one line |
| --- | --- |
| Design | You and the AI decide what to build and write it down as a scope, then as specs and tasks. |
| Implementation | The AI writes the code for each task, reviews it, and files a test plan. |
| QA | Machine tests check that the scope works. |
| Human Testing | People run the human tests in the web app and sign off each one. |
| Beta | Real users try the work, and their feedback comes back to the project. |
| Release | The scope is finished. You deploy it. |

Each stage has its own section: [Design](process-design.md), [Implementation](process-implementation.md), [QA](process-qa.md), [Human Testing](process-human-testing.md), [Beta](process-beta.md), and [Release](process-release.md).

## Each scope moves on its own

A stage belongs to a scope, not to the whole project. Two scopes in the same project can sit in different stages at the same time. Each one accepts the commands of its own stage.

A scope moves to its next stage as soon as the stage it is in is clear. It keeps moving while each next stage is also clear, and it stops at the first stage that still has open work. Nobody presses an Advance button, and no command moves a stage.

Clearing a stage can still need you. In QA, you run the scope's test plan with [`/wxCreateTestPlan`](cmd-wxcreatetestplan.md) `SCOPE-NNN --Execute` and sign off its final gate yourself. In Human Testing, your testers sign off each human test in the web app. See [QA](process-qa.md) and [Human Testing](process-human-testing.md).

What "clear" means depends on the stage. A scope leaves Design as soon as it has tasks. It leaves Implementation when every one of its tasks is done. Later stages also wait for their tests. Each stage section gives the exact rule in its "Leaves when" column.

Nothing moves backward. If new work is added to a scope, the scope stays in its current stage until that work is done.

The project also shows a stage. It is the lowest stage among its scopes, so a project shows Release only when every scope is there. The project stage is for display. It never blocks a scope.

## The main command chain

Almost every piece of work starts the same way:

1. [`/buildscope`](cmd-buildscope.md) writes a scope with you, one section at a time.
2. [`/validateScope`](cmd-validatescope.md) checks the scope's quality.
3. [`/createSpecs`](cmd-createspecs.md) turns the scope into one or more specs with tasks. The scope then leaves Design on its own.
4. [`/implement`](cmd-implement.md) builds a spec's tasks. At the end it reviews the code and files the scope's test plan through `/wxCreateTestPlan`.

From there, the stages advance on their own as each one clears. You run the test plan and sign off its final gate in QA, and your testers sign off in Human Testing.

```
/buildscope -> /validateScope -> /createSpecs -> /implement -> test plan and reviews
                                       |
                                       v
        automatic stage advance, one scope at a time, as each stage clears:
        Design -> Implementation -> QA -> Human Testing -> Beta -> Release
```

## Two ways to start

- **A new feature in your project.** Start with `/buildscope`. If you want to talk an idea through first, use [`/wxBrainstorm`](cmd-wxbrainstorm.md). It hands the agreed idea to `/buildscope` when you say so.
- **A whole new project.** Give [`/wxG-O-D`](cmd-wxgod.md) your project overview. It reviews it with you, writes a development plan, and then drives the same chain for every scope.

If you are rebuilding an existing application, read [Converting an existing app](process-conversions.md).

## Three things only people do

- **Signing off human tests.** A sign-off is a person's statement that they checked the work. The AI never signs one.
- **Approving.** The AI stops and asks at each approval point. It does not approve for you unless you told it to work from an approved plan.
- **Deploying.** You deploy. wxKanban never deploys your application.

See [Who does what](process-who-does-what.md) for the full split, stage by stage.

## Where to see a scope's stage

Ask the AI for a scope's stage. It reports the stage, what would advance it, and anything blocking it. [When something goes wrong](process-when-things-go-wrong.md) explains how to read that answer.

The Dev Cockpit does not show stages. It lists scopes that still have incomplete tasks, with each scope's status. A scope that has no open tasks and is only waiting on tests or sign-offs drops out of that list. See [Scopes](cockpit-scopes.md).
