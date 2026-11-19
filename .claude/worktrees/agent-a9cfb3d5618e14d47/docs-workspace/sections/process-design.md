---
id: process-design
part: the-process
audience: customer
sources: mcp-server/src/prompts/buildscope.md, mcp-server/src/prompts/validatescope.md, mcp-server/src/prompts/createspecs.md, _wxAI/commands/buildscope.md, _wxAI/commands/validateScope.md, _wxAI/commands/createSpecs.md, _wxAI/commands/wxBrainstorm.md, _wxAI/commands/wxG-O-D.md, _wxAI/commands/wxDesigner.md, _wxAI/commands/buildstack.md, mcp-server/src/prompts/wxgod/references/new-project.md, specs/Project-Scope/123-per-scope-stage-progression.md
---
# Design

Design is where you decide what to build and write it down, before any code exists.

| What it is for | What you do | What the AI does | Commands | Leaves when | Common blockers |
| --- | --- | --- | --- | --- | --- |
| Turning an idea into a scope, then into specs and tasks. | Describe the feature, answer the AI's questions, choose whether to reuse an existing scope, and approve each section of the scope. | Checks for an existing scope that already covers the idea, interviews you, drafts and grades the scope, then writes the specs and tasks. | [`/buildscope`](cmd-buildscope.md), [`/validateScope`](cmd-validatescope.md), [`/createSpecs`](cmd-createspecs.md). Helpers: [`/wxBrainstorm`](cmd-wxbrainstorm.md), [`/wxG-O-D`](cmd-wxgod.md), [`/buildstack`](cmd-buildstack.md), [`/wxDesigner`](cmd-wxdesigner.md). | The scope has at least one task. `/createSpecs` finishing is the last step of Design. | The scope grades below A or has blocking issues; the requirements are generic placeholders; `/createSpecs` has not run yet, so the scope has no tasks. |

## Before you write a scope

- **Check your stack.** Your project's Stack & Style document records the target stack and look and feel. It is first set up in the web app when you create the project. Use `/buildstack` to change it later. `/createSpecs` and [`/implement`](cmd-implement.md) read it before they write anything.
- **Talk an idea through.** `/wxBrainstorm` seats a panel of AI roles, asks what you want to brainstorm, then checks what already exists. It writes a record only after you approve its summary, and hands the agreed items to `/buildscope` when you say so. It never writes scopes or code itself.
- **Plan a whole project.** `/wxG-O-D` reads your project overview, reviews it with you, and writes a development plan. It then runs this same chain for every scope.

## Writing the scope

`/buildscope` starts with a **reuse check**. If an existing scope already covers what you described, it stops and asks you to choose: reuse it, extend it, view it first, or proceed with a new scope. The choice is always yours.

Then the AI acts as a senior business analyst. It asks hard questions, tests edge cases, and turns vague statements into requirements that can be tested. It shows you the scope one section at a time and waits for you to approve or change each one. Files are written only after every section is approved.

To turn an existing document, such as meeting notes or a product brief, into a scope, use `/buildscope --from-md` with the file. The file becomes the source material.

## Checking the scope

`/validateScope` sends the scope to wxKanban, which scores it and returns a grade and any blocking issues. Aim for grade A or A+ with no blocking issues.

The check looks for a business problem, a primary and a secondary actor, at least three measurable success metrics, what is in scope, what is out of scope, and no "TODO" or "TBD" markers. `/createSpecs` runs the same check and refuses a scope that fails it. `/validateScope --fix` repairs small formatting problems. Missing content you must add yourself.

Also read the scope's Functional Requirements section yourself. If it holds generic placeholder lines instead of the requirements you approved, put the approved requirements in and validate again. `/createSpecs` builds the specs from that section.

## Creating the specs

`/createSpecs` turns the scope into one or more specs. It writes the spec, the technical plan, the tasks, and the test scenarios, stores them in wxKanban, and writes them into your project folder. Each task traces back to one of the scope's requirements.

As soon as the scope has tasks, it leaves Design and enters Implementation on its own. You can run `/implement` right away.

## Designing a screen first (optional)

Once a scope's specs exist, `/wxDesigner` can design a screen before it is built. It uses your project's existing theme, shows a preview in your browser, and changes it as you ask. When you SAVE, it writes the design next to the spec, and `/implement` builds from it. It never writes application code itself.
