---
id: process-human-testing
part: the-process
audience: customer
sources: mcp-server/src/prompts/wxgod/references/new-project.md, specs/Project-Scope/123-per-scope-stage-progression.md, _wxAI/skills/wxCreateTestPlan/SKILL.md, docs-workspace/sections/testing-user.md, docs-workspace/commands.json
---
# Human Testing

Human Testing is user acceptance. People check what a machine cannot judge, and sign off each human test.

| What it is for | What you do | What the AI does | Commands | Leaves when | Common blockers |
| --- | --- | --- | --- | --- | --- |
| Having people confirm the scope works the way its users need. | Decide who tests what. Your testers run each released human test in the web app and pass or fail it. You follow up on failures. | Suggests who should test what, builds the help site and PDF manual, and turns each failure you approve into a task. It never signs a test. | [`/wxHelpGenerate`](cmd-wxhelpgenerate.md), and [`/implement`](cmd-implement.md) for fixes. | No task is open, and every human test the scope owns has a tester's sign-off. | Tests nobody has signed yet; a failed test whose fix is still open; a test marked "Please test this again". |

## A sign-off is a person's attestation

When a tester signs off a test, they are stating that they checked it themselves. That is why **the AI never signs a human test**. Not during a normal run, not when [`/wxG-O-D`](cmd-wxgod.md) builds a project from an approved plan, and not in any other mode.

The same rule holds for the final gate of a machine test run. The AI presents the evidence and files the sign-off as pending. Only your explicit confirmation marks it signed.

So Human Testing is where an automated run always pauses. The scope waits until people have signed.

## Where testers work

Testers run the human tests in the wxKanban web app, in the project's **Human Testing** phase. [User tests](testing-user.md) walks through the screen. In short:

- Each test has **Before you start**, **Steps**, and **Check afterwards**.
- **Pass** records the sign-off against the current version, in the tester's name.
- **Fail** asks what happened and files a bug report with the steps attached.
- **Add a test** lets a tester write a test nobody thought to specify.
- A test marked **"Please test this again"** came back because something changed after it was signed. Test it again and sign off as normal.

If a tester sees **"Not ready for you yet"**, the automated tests for that version have not passed. There is nothing for them to do until they do.

## When the human tests appear

The human tests are released to testers when the scope enters Human Testing, which happens on its own once QA is clear. Until then, they wait.

## Who should test what

Ask the AI to name who should test what. If you planned the project with `/wxG-O-D`, it uses the personas from the plan and their most important tasks. Then make sure each tester can sign in to the project in the web app.

Each tester needs a wxKanban account in your company. An administrator adds them from **Team Members** with **Invite Member**; the tester gets an email to set their own password. See [Team Members](team.md).

## Fixing what testers find

A failed test files a bug report. For each fix you approve, ask your AI to add a task to the spec it belongs to, in plain words: "add a task to SPEC-NNN: what is wrong and what should happen". Then run `/implement` on that spec. `/implement` runs while the scope is in Human Testing. The scope stays here until the fix is done and the test is signed. For more on adding a task, see [When something goes wrong](process-when-things-go-wrong.md).

## Building the help

This is a good time to build end-user help. `/wxHelpGenerate` walks the running application screen by screen and produces a linked help site and a PDF manual. It needs Claude in Chrome and Python. If either is missing, skip it and come back later.

## Moving on

When no task is open and every human test is signed, the scope enters Beta on its own.
