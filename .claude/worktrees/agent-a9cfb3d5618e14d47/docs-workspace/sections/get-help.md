---
id: get-help
part: appendix
audience: customer
sources: gettingStartedInstructions.md, vscode-extension/package.json, vscode-extension/src/providers/cockpitTreeProvider.ts, vscode-extension/src/providers/chatPanel.ts, vscode-extension/src/providers/feedbackPanel.ts, vscode-extension/src/commands/feedback.ts, src/client/pages/DocsIndexPage.tsx, src/client/i18n/locales/en-US.ts, docs-workspace/commands.json
---

# Where to get help

There are several places to get help, depending on what you need. Use this page to pick the right one.

| You want to | Go to |
| --- | --- |
| Ask a person a question right now | Community Help, the live chat in the Cockpit |
| Report something broken, or ask for a new feature | **wxKanban: Report a Bug / Suggest a Feature** |
| Check on a report you already sent | **My Feedback** in the Cockpit |
| Read a quick answer, watch a video, or join a training session | The **Help & Tutorials** page in the web app |
| Look up what a command does | This Manual's Command Reference |

## Community Help (live chat)

Community Help opens a live chat with the wxKanban Community, right inside VS Code. Use it for quick questions and support.

To open it, click the **Community Help — live chat** row in the Cockpit. Or open the Command Palette (`Ctrl+Shift+P`, Mac: `Cmd+Shift+P`) and run [**wxKanban: Community Help (live chat)**](cmd-cockpit-wxkanbancockpitopenchat.md).

- You must have your project folder open, the one with `.wxkanban-project.json`.
- The first time, it asks for your email address. That is all you need to join.

## Report a bug or suggest a feature

Open the Command Palette and run [**wxKanban: Report a Bug / Suggest a Feature**](cmd-cockpit-wxkanbancockpitsubmitfeedback.md). Your report goes straight into the wxKanban team's queue.

The form asks you to:

1. Choose **Bug** or **Suggestion**.
2. Choose how to describe it:
   - **Quick**: paste what you have, such as an error, a chat excerpt, or a log, and say where it came from.
   - **Guided**: answer a short interview, one question at a time. You can go back without losing your answers.
3. Give it a short **Title**.
4. Attach a log or text file, if you have one. This is optional.
5. Choose how to hear about status changes: **In-app (Dev Cockpit)**, or **In-app + Email**.

Then click **Submit**.

## My Feedback

**My Feedback** follows the reports you have sent. It appears in the Cockpit once you have sent at least one report.

- When the team needs more information from you, the group opens by itself and shows how many reports "need info".
- To answer, run [**wxKanban: My Feedback**](cmd-cockpit-wxkanbancockpitmyfeedback.md) from the Command Palette, pick the report, and type your answer.
- To read a report in full, use **wxKanban: View Feedback Detail**.
- To work on a report with your AI assistant, use **wxKanban: Push Feedback to Claude Chat**. It sends the report into your Claude Code chat. It does not change the report's status.

For more, see [Feedback](cockpit-feedback.md).

## Help inside the Cockpit

The Cockpit has its own help sections, so you can look things up without leaving VS Code:

- **Help — Commands**: what each kit command does.
- **Help — Videos**: how-to videos. Click one to watch it in your browser.
- **FAQ**: frequently asked questions. Click one to read the answer.
- **Help — Conversion Guides**: downloadable guides for converting a WinDev or WebDev app, in several languages.

For more, see [Help inside the Cockpit](cockpit-help.md).

## Help & Tutorials in the web app

The **Help & Tutorials** page (/docs) is open to everyone, even when you are not signed in. Reach it from the **Docs** menu on the wxKanban home page. Its sections are:

- **FAQ**: answers to common questions about wxKanban.
- **Videos**: step-by-step training videos.
- **Training Sessions**: upcoming live online sessions led by an instructor. Register for one, or register your interest if none is scheduled.
- **Guides**: downloadable how-to guides to keep beside your project.

Inside the app, you also have:

- The [FAQ](faq.md) page, where you can ask a question that is not listed yet. Once it is answered, it is added to the FAQ.
- The [Help & plan features](help.md) page, which explains what each feature does and which plan includes it.

## This Manual's Command Reference

Every command the kit ships is described in the Command Reference, with its purpose, its stage, and what it runs. Start with one of the indexes:

- [Commands by stage](commands-by-stage.md): what you can run at each stage.
- [Commands by where you run them](commands-by-where.md): Claude Code, the Cockpit, or the terminal.
- [Commands A to Z](commands-a-z.md): every command in alphabetical order.

If something is not working, see [Troubleshooting](troubleshooting.md) first. For words you do not know, see the [Glossary](glossary.md).

## Claude Code help

For help with Claude Code itself, see the Claude Code docs at https://code.claude.com/docs.
