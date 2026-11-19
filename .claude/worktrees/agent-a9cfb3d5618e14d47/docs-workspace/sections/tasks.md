---
id: tasks
part: web-app
audience: customer
sources: 
---
# My Tasks

My Tasks is your personal work list — the tasks assigned to you, pulled together from your connected project-management tools and from wxKanban itself. This is the home screen for team members, and a quick "what's on my plate" view for admins.

## What you're looking at

The header shows **My Tasks** with a count, a **← Back to dashboard** link, the **Last sync** time, and a **Sync now** button. Below are filters and a sort control, then the task list. When nothing has been pulled in yet you'll see **"No tasks yet"** with a prompt to connect a PM system.

## Filters and sorting

- **All sources** — limit tasks to one origin: **Jira**, **Monday**, **Asana**, **Trello**, or **Internal** (created inside wxKanban).
- **All priorities** — show only **Critical**, **High**, **Medium**, or **Low** tasks.
- **All statuses** — show only **Open**, **In progress**, **Completed**, or **Orphaned** tasks. ("Orphaned" means the task's source item can no longer be matched — usually because it was deleted in the external tool.)
- **Sort** — order by **Recently updated** (default), **Due date**, **Priority**, or **Title**, with an arrow toggle to reverse the direction.

## Getting your tasks to appear

Tasks come from the project-management tools you connect. Connect one on [PM Integrations](integrations.md), then click **Sync now** here to pull in your assigned items. wxKanban also syncs automatically in the background on a schedule, so the list stays current without you clicking. **Last sync: never** means no sync has run yet.

## Common tasks

1. **Pull in your latest tasks:** click **Sync now**.
2. **Focus on urgent work:** set the priority filter to **Critical** or **High**.
3. **See only one tool's tasks:** pick it in the **All sources** filter.
4. **Sort by deadline:** choose **Due date** in the sort control.

## Fields and what they show

- **Count badge** — how many tasks match your current filters.
- **Last sync** — when tasks were last pulled from your connected tools.
- **Source** — which system a task came from (Jira / Monday / Asana / Trello / Internal).
- **Priority** — Critical / High / Medium / Low, as set in the source tool.
- **Status** — Open / In progress / Completed / Orphaned.
- **Sync now** — triggers an immediate pull from all connected PM systems.
