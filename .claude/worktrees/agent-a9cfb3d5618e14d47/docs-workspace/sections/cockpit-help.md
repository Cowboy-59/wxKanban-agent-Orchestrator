---
id: cockpit-help
part: dev-cockpit
audience: customer
sources: vscode-extension/src/providers/cockpitTreeProvider.ts, vscode-extension/src/services/helpCatalog.ts, vscode-extension/src/services/videosCatalog.ts, vscode-extension/src/services/guidesCatalog.ts, vscode-extension/src/services/faqCatalog.ts, vscode-extension/src/providers/chatPanel.ts, vscode-extension/src/services/chatSocket.ts, vscode-extension/src/extension.ts, vscode-extension/package.json
---

# Help inside the Cockpit

The lower part of the Cockpit holds help you can reach without leaving VS Code. The full list of commands is in [the Command Reference](part-command-reference.md).

## Help — Commands

**Help — Commands** lists the slash commands in the kit installed in your project. It reads them from your project's files, so it works offline and without signing in.

It opens with a tip: **Tip: batch commands to ride the cache**. Each cold command run pays again for the fixed context Claude Code loads first. That context stays cached for about 5 minutes, so running several commands in one sitting, such as [`/buildscope`](cmd-buildscope.md), [`/createSpecs`](cmd-createspecs.md), and [`/implement`](cmd-implement.md), costs less than spreading them out.

Below the tip are two groups, each with a count:

- **Standard**: the core lifecycle commands.
- **Extended**: every other kit command.

Each command shows its name and a one-line description. Click it to open the command's full text. A command with optional flags expands into a list of them, each with a short description.

## Help — Videos

**Help — Videos** lists how-to videos from the wxKanban docs, with a count. The **Onboarding** group comes first and holds wxKanban's process videos. Other how-to videos follow, then the **Open** and **Training** groups. Click a video to watch it in your browser.

## Help — Conversion Guides

**Help — Conversion Guides** lists downloadable guides for moving WinDev and WebDev apps to a modern stack. Each guide shows the languages it is published in. Expand a guide and click a language to download its PDF in your browser.

## FAQ

**FAQ** lists frequently asked questions, in your editor's language where available. Click a question to read the answer. If the answer has a video, choose **Watch video**.

Videos, guides, and the FAQ come from the wxKanban website. When you are offline, or none are published, those rows do not appear. **wxKanban: Refresh Cockpit** loads them again.

## Community Help — live chat

**Community Help — live chat** is always in the tree. It opens a live chat with the wxKanban Community for support. You can also click the chat button in the Cockpit title bar, or run **wxKanban: Community Help (live chat)**.

1. The first time, the Cockpit asks for your email, which identifies you in the chat, and the name your messages show. It remembers both.
2. A panel named **wxKanban: Community Help** opens with recent messages.
3. Type a message to post it.

You need a linked project folder open to use the chat.

## Other places to get help

- [Troubleshooting](troubleshooting.md): problems listed by symptom.
- [Where to get help](get-help.md): every way to reach the wxKanban team.
- [Feedback](cockpit-feedback.md): report a bug or suggest a feature from the Cockpit.
