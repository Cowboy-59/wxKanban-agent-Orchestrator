---
id: process-scopes-specs
part: the-process
audience: customer
sources: .claude/commands/wxAI-training.md, mcp-server/src/prompts/createspecs.md, mcp-server/src/prompts/buildscope.md, mcp-server/src/prompts/validatescope.md, mcp-server/src/prompts/wxgod/references/new-project.md, _wxAI/commands/implement.md, _wxAI/skills/wxCreateTestPlan/SKILL.md, .claude/commands/preTest.md, _wxAI/commands/wxDesigner.md, CONTEXT.md
---
# Scopes and specs

wxKanban organizes work in two layers. A **scope** says what to build and why. A **spec** says how to build part of it, as a list of tasks.

## The scope-first rule

No code is written without a scope. Before the AI writes, changes, or deletes code, the work must be linked to a scope in wxKanban.

This rule exists so that:

- you can see what the AI is building, and why;
- every change has a documented reason you can audit later;
- work on one feature does not quietly conflict with work on another;
- the AI does not build things nobody asked for.

If no scope covers what you ask for, find one that does or create a new one with [`/buildscope`](cmd-buildscope.md).

## What a scope is

A scope describes one feature or set of requirements. It covers:

- the business problem it solves;
- who uses it (a primary actor and at least one secondary actor);
- what it must do, as numbered functional requirements (FR-001, FR-002, and so on);
- how you will measure success;
- what is in scope and what is out of scope.

You write it with the AI through `/buildscope`, which interviews you and asks you to approve each section. [`/validateScope`](cmd-validatescope.md) then grades it.

## What a spec is

A spec is the build contract for a scope, or for part of one. [`/createSpecs`](cmd-createspecs.md) writes it from the scope. Each spec has:

- the spec itself, with the requirements it implements;
- a technical plan;
- a task list, where each task traces back to a requirement;
- tests and quickstart test scenarios.

Specs and tasks are stored in wxKanban and also written into your project folder. [`/implement`](cmd-implement.md) works through a spec's tasks.

## One scope can fan out into several specs

A small scope usually becomes one spec. A large scope can become several, each covering one part.

The two are linked in both directions. Each spec names the scope it implements with an "Implements SCOPE-NNN" line, and the scope lists its specs under "Implemented By". `/implement` and the test plan follow these links to find the scope a spec belongs to. If a link is missing, the AI shows you and adds it only with your OK.

## Why the numbers differ

Scopes and specs are numbered in two separate sequences, so the same number can mean two different things.

At first the numbers often match, one scope to one spec. They drift apart as soon as a scope fans out. A new spec always takes the next free spec number, never its scope's number. For example, SCOPE-004 might be implemented by SPEC-006 and SPEC-007, while SPEC-004 belongs to a different scope. A spec number is never reused.

So always write the prefix: **SCOPE-NNN** for a scope and **SPEC-NNN** for a spec. A bare "004" is ambiguous.

## Which number each command takes

| Command | Takes |
| --- | --- |
| `/buildscope --edit NNN` | a scope number |
| `/validateScope NNN` | a scope number |
| `/implement NNN` | a spec number |
| [`/wxCreateTestPlan`](cmd-wxcreatetestplan.md) | `SCOPE-NNN` or `SPEC-NNN`, written with the prefix |
| [`/preTest`](cmd-pretest.md) | `SCOPE-NNN` |
| [`/wxDesigner`](cmd-wxdesigner.md) | a bare number, which it reads as a scope number |

## Stages belong to scopes

Each scope has its own stage, from Design to Release, and moves on its own. See [The road at a glance](process-overview.md).
