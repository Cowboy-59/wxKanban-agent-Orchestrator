---
id: process-conversions
part: the-process
audience: customer
sources: _wxAI/commands/wxConversion.md, _wxAI/commands/wxConversionScope.md, _wxAI/commands/wxConversionParity.md, _wxAI/commands/implement.md, _wxAI/commands/wxG-O-D.md, mcp-server/src/prompts/buildscope.md, mcp-server/src/prompts/wxgod/references/new-project.md, specs/Project-Scope/123-per-scope-stage-progression.md, docs-workspace/commands.json
---
# Converting an existing app

You can rebuild an existing desktop or web application as a modern one. A conversion adds two steps before the usual road and one check after the build. Everything in between is the same: scopes, specs, [`/implement`](cmd-implement.md), and the same six stages.

## The path

1. **Convert.** A conversion command reads the old application and produces per-element notes, a rebuilt page or window for each screen, and a database design.
2. **Scope.** A scope command turns that output into scopes, one per screen and report, plus overall scopes for the program, the database, and the backend.
3. **Build as usual.** Validate each scope with [`/validateScope`](cmd-validatescope.md), create its specs with [`/createSpecs`](cmd-createspecs.md), and build them with [`/implement`](cmd-implement.md).
4. **Check parity.** Compare what you built with the original to find what the rebuild lost.

To plan the whole conversion first, [`/wxG-O-D`](cmd-wxgod.md) reads the conversion output as evidence and writes a development plan.

## Which commands to use

| Original application | Convert with | Then scope with |
| --- | --- | --- |
| PCSoft WinDev or WebDev | [`/wxConversion`](cmd-wxconversion.md) | [`/wxConversionScope`](cmd-wxconversionscope.md) |
| Clarion | [`/cwConversion`](cmd-cwconversion.md) | [`/cwConversionScope`](cmd-cwconversionscope.md) |
| Visual Basic 6 | [`/vbConversion`](cmd-vbconversion.md) | [`/vbConversionScope`](cmd-vbconversionscope.md) |

These commands always run, whatever stage your scopes are in, because what they create starts in Design.

## Converting a WinDev or WebDev application

`/wxConversion` works from the application's **Technical Documentation PDF**, which you export from the PCSoft IDE. It refuses the window and project source files: generate the PDF and run it again. It needs Python with PyMuPDF, and Node.

It works in stages and pauses for your review between them:

1. It splits the PDF into one note per element.
2. It rebuilds each page in your stack, with the old event code wired in as handler stubs.
3. It asks which database you want and whether to keep the field names, then writes the database design and a diagram. Your HFSQL data must first be exported to JSON with a WLanguage global procedure.
4. It documents every query in one scope.
5. It writes a starting point for reports.

It flags what needs a person's decision, such as untranslated captions, controls with no modern match, and cut-off SQL. It modernizes the screens rather than copying the old layout.

The Clarion and Visual Basic 6 commands produce the same kind of output, but they read the application's source files instead of a PDF: the TXA, TXD, and CLW files for Clarion, and the project, form, and module files for Visual Basic 6.

## Scoping the conversion

The scope command works like [`/buildscope`](cmd-buildscope.md): it shows each section and waits for you to approve it. For each item it also runs a gap check and asks you, one question at a time, whether to keep, fix, defer, or drop each issue it finds.

It is resumable. After each scope it asks **[Yes]** to continue or **[Save]** to stop and pick up later.

## Checking parity

A rebuild can look correct and still lose things the old application did. The parity check looks for them at three levels: whole functions missing, behaviors and rules changed, and default values dropped. A dropped default is easy to miss: nothing fails, but the program no longer opens ready to work.

It sorts every difference into one of three kinds:

- **Regression**: the original did it, the rebuild does not, and no decision you recorded allows the loss.
- **Deliberate**: it matches a keep, modernize, or drop decision recorded in the scopes.
- **Improvement**: the rebuild is better. It is recorded so nobody "fixes" it back.

`/implement` runs this check for you once every spec of a scope is done, for that scope's element only, before it files the test plan. For a full sweep of the whole application, run [`/wxConversionParity`](cmd-wxconversionparity.md). It is resumable in the same Yes or Save way.

The check is advisory. It never edits code. Where no recorded decision covers a difference, it asks you. Each fix you approve becomes a task and goes through `/implement`.

## After the build

From here, a converted scope follows the same stages as any other. See [QA](process-qa.md), [Human Testing](process-human-testing.md), [Beta](process-beta.md), and [Release](process-release.md).
