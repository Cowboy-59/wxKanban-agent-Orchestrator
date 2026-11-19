---
id: cockpit-feedback
part: dev-cockpit
audience: customer
sources: vscode-extension/src/commands/feedback.ts, vscode-extension/src/providers/feedbackPanel.ts, vscode-extension/src/providers/feedbackDetailPanel.ts, vscode-extension/src/services/attachmentText.ts, vscode-extension/src/providers/cockpitTreeProvider.ts, vscode-extension/src/types.ts, vscode-extension/src/extension.ts, vscode-extension/package.json, gettingStartedInstructions.md
---

# Feedback

Send bug reports and suggestions to the wxKanban team without leaving VS Code, and follow their status in the Cockpit. You need a linked project and a signed-in token.

## Report a Bug / Suggest a Feature

Click the feedback button in the Cockpit title bar, or run **wxKanban: Report a Bug / Suggest a Feature**. A form opens.

1. Choose **Bug** or **Suggestion**.
2. Choose a mode:
   - **Quick**: paste what you have, such as an error, a log, or a chat excerpt. Say where it came from, and add a note if you like.
   - **Guided**: answer one question at a time. A bug report asks what you were doing, what you expected, what happened, how to reproduce it, how often it happens, and how it affects your work. A suggestion asks about the problem, who feels it, your workaround, the ideal outcome, and why it matters.
3. Enter a short **Title**. It is required.
4. Optionally attach up to 3 text or log files. Large files keep their last 128 KB. Passwords, tokens, and connection strings are masked before anything is sent.
5. Choose how to hear about status changes: **In-app (Dev Cockpit)** or **In-app + Email**.
6. Click **Submit**. The form shows a short reference number.

The report also carries your Cockpit version, active scope, lifecycle stage, VS Code version, and operating system. In Quick mode, if the team needs more detail, they ask you a follow-up in **My Feedback**.

## My Feedback

The **My Feedback** row lists your open reports. Finished reports, resolved or declined, are not listed. The row appears only when you have at least one open report. Its description is the count.

When the team needs more information from you, the row opens by itself and reads "N need info". Each report row shows its status. Hover a row to see its type, status, severity, reference, and the team's question or decline reason.

- **Click a report that needs info** to type your answer and send it.
- **Click any other report** to push it to Claude Code (see below).
- **Right-click a report** and choose **wxKanban: View Feedback Detail** to read the full report in a read-only panel.

You can also run **wxKanban: My Feedback** from the Command Palette. It lists your open reports to pick from, and lets you answer one that needs info.

## Push Feedback to Claude Chat

Click a report, click the inline button on its row, or run **wxKanban: Push Feedback to Claude Chat**. The Cockpit opens a Claude Code chat filled in with the report: its type, status, reference, what you reported, the captured context, and any question or answer. Use it to work on the problem with Claude.

Pushing does not change the report's status. Only the wxKanban team changes status. If the chat cannot be opened, the text is copied to your clipboard so you can paste it into Claude Code.

## Incoming from customers

Most projects never show this row. It appears only for a company that receives feedback from its own customers through wxKanban, and only when there are open reports. Its description shows how many are new, for example "3 new of 10". The reports in it work the same way as those in **My Feedback**.
