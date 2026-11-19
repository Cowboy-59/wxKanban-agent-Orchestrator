---
id: cockpit-at-a-glance
part: dev-cockpit
audience: customer
sources: vscode-extension/src/providers/cockpitTreeProvider.ts, vscode-extension/src/extension.ts, vscode-extension/package.json, vscode-extension/README.md, CONTEXT.md
---

# The Cockpit at a glance

The Dev Cockpit shows your linked project's remaining work, grouped by scope, without leaving the editor. Rows appear only when they have something to say. A healthy, quiet project shows only a few of them.

## The title bar

The **Dev Cockpit** title bar has three buttons:

- **Community Help** opens the live chat. See [Help inside the Cockpit](cockpit-help.md).
- **Report a Bug / Suggest a Feature** opens the feedback form. See [Feedback](cockpit-feedback.md).
- **Refresh** reloads everything.

## The tree, top to bottom

1. **System Health**: OK, degraded, or offline. Expand it for the Orchestrator, MCP connection, and Database lines. See [System Health](cockpit-system-health.md).
2. **Nightly run**: the morning summary of the last nightly test run. It appears only after a nightly run has written one in this project. See [System Health](cockpit-system-health.md).
3. **Kit row**: one of **Kit update available — Install**, **Kit update waiting — Install**, **Kit update check failed**, or **No kit installed — Install**. Absent when the kit is current. See [Kit updates](cockpit-kit-updates.md).
4. **Git — N commits to push**: local commits that are not pushed yet. Absent when there are none. See [Git](cockpit-git.md).
5. **Install** or **Update wxKanban slash commands**: shown only when commands are missing or out of date. See [Installing and linking the Cockpit](cockpit-install.md).
6. **N Scopes unfinished**: every scope with remaining work. The active scope is listed first. See [Scopes](cockpit-scopes.md).
7. **My Feedback**: your open bug reports and suggestions. See [Feedback](cockpit-feedback.md).
8. **Incoming from customers**: reports your own customers filed. Most projects never show this row.
9. **Community Help — live chat**: always shown.
10. **Help — Commands**: the kit's slash commands, in Standard and Extended groups.
11. **Help — Videos**: how-to videos, including the Onboarding group.
12. **Help — Conversion Guides**: downloadable migration guides, by language.
13. **Development Plan (done/total)**: the build roadmap, one row per scope. See [Development Plan](cockpit-dev-plan.md).
14. **FAQ**: frequently asked questions.

Rows 10 to 14 are covered in [Help inside the Cockpit](cockpit-help.md), except the Development Plan.

## When the tree shows a single message instead

In place of row 6, the Cockpit can show one message. Click it to act:

| Message | What it means | What clicking does |
| --- | --- | --- |
| **No wxKanban project linked** | The open folder has no valid `.wxkanban-project.json` | Starts **wxKanban: Sign In / Relink Project** |
| **Sign in to wxKanban** | No API token was found for this project | Asks for the token. The token comes from the project's **Kit** tab in the web app; see [Getting Started](getting-started.md), section 5 |
| **Cannot reach wxKanban — click to retry** | The project could not be read. The tooltip names the address it tried and the error | Refreshes |
| **All caught up — no remaining work** | No scope has an incomplete task. A scope can still be waiting on tests or sign-offs | Nothing. Ask your AI for a scope's stage to see what it waits on |

With **No wxKanban project linked**, **Sign in to wxKanban**, or **Cannot reach wxKanban**, the feedback rows are hidden too.

## How it stays current

- After [`/dbpush`](cmd-dbpush.md) or [`/implement`](cmd-implement.md) finishes, the kit tells the Cockpit to reload right away.
- While the view is visible, the Cockpit checks again every 30 seconds. It redraws only when something changed, so work done outside this editor still shows up.
- **wxKanban: Refresh Cockpit**, or the refresh button, forces a reload at any time.
