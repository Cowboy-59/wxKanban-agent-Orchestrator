---
id: integrations
part: web-app
audience: customer
sources: 
---
# PM Integrations

PM Integrations is where you connect wxKanban to your existing project-management tools. Once connected, wxKanban pulls your assigned tasks from those tools into [My Tasks](tasks.md) and keeps them in sync, so you work from one list instead of jumping between apps.

## What you're looking at

A short intro and a **View My Tasks →** shortcut sit at the top. Below are connection cards for each supported system — **Jira**, **Monday.com**, **Asana**, and **Trello** — each showing its current state (**Not connected**) and a **Connect** button. A help note at the bottom reminds you that each system needs OAuth credentials to connect.

## Connecting a system

Click **Connect** on a card to begin. wxKanban uses **OAuth2**: you're sent to that tool's site to sign in and authorize access, then returned here with the connection established. wxKanban stores the access securely (encrypted) and never sees your password for the external tool. After connecting, the card switches to a connected state and you can pull tasks with **Sync now** on [My Tasks](tasks.md).

Because syncing runs on a schedule in the background, your tasks stay current automatically once a system is linked. If a sync fails, wxKanban doesn't block you — it simply retries on the next cycle.

## Common tasks

1. **Connect a tool:** click **Connect** on its card and complete the sign-in/authorization on that tool's site.
2. **Start using synced tasks:** after connecting, go to [My Tasks](tasks.md) and click **Sync now**.
3. **Jump to your task list:** click **View My Tasks →**.

## Fields and what they show

- **System card state** — **Not connected** or connected, per tool.
- **Connect** — starts the OAuth2 authorization for that tool.
- **View My Tasks →** — opens your synced task list.
