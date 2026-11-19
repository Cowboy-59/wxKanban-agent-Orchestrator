---
id: dashboard
part: web-app
audience: customer
sources: 
---
# The Dashboard

The Dashboard is your home base as an administrator. It answers "how are all my projects doing?" at a glance — every project's lifecycle progress, quick links to each project's generated documents, plus proposals, pending work, team engagements, and system health. Team members without admin rights land on [My Tasks](tasks.md) instead.

## What you're looking at

1. **The sidebar** (left, on every screen) is your main navigation. The top shows your app version, your plan (for example **Small Business**), and your active company ("tenant"). Below are links to every area: Dashboard, [Team Members](team.md), [Projects](projects.md), [PM Integrations](integrations.md), [My Tasks](tasks.md), [Work Hub](work-hub.md), Time & Billing, [Invoices](invoices.md), [Reports](reports.md), [Stack Profiles](stack-profiles.md), [Theme Profiles](theme-profiles.md), [FAQ](faq.md), [Help](help.md), and [Settings](settings.md). At the bottom sits your account with a notification bell and **Sign Out**. Items with a small padlock aren't part of your current plan (see [Help](help.md)).
2. **New** — opens a dialog to create a project inline without leaving the Dashboard. Give it a name and description and it appears in the grid below. (Admins only.)
3. **All projects** — jumps to the full [Projects](projects.md) list with search, filters, and sorting.

## Summary cards

Across the top, four cards give the headline numbers: your **Current Plan** (with seats used, e.g. 2 / 5), **Team Members**, **Active Projects**, and **Hours This Week**. They're read-only status — click into the matching sidebar area to act on any of them.

## Project overview grid

The bulk of the Dashboard is one card per active project. Each card shows the project's name, its current **lifecycle phase** (Design, Implementation, QA Testing, Human Testing, Beta, Release) with per-phase progress, and its outstanding-task count. Below that are quick links to the project's generated documents — **Project Overview**, **Project Lifecycle**, **Development Plan**, **Audit Report**, **Compound Learnings**, **Project Scope Analysis**, and **Entity Diagram**. A document link shows **"not created"** in indigo when that document doesn't exist yet, or a "Last updated" date when it does. Clicking the project name opens it in full — see [Inside a project](project-detail.md). The small **Edit audit type** control on a card sets which compliance framework (if any) that project is audited against.

## Proposals, pending work, and engagements

Lower on the page:

- **Project Proposals** — ideas captured for future projects, each with a status (Submitted, Accepted, etc.) and a **Create Project** action to turn an accepted proposal into a real project.
- **Pending Tasks** — a compact table of unfinished tasks per project, split into NEW / IN-PROG / TOTAL columns, so you can see where work is stacking up.
- **Engagements** — consulting relationships involving your company (see the Consultants area of [Team Members](team.md)).
- **Daily Digest** and **Activity Feed** — a summary of today's team activity and a recent-events stream. They fill in as your team works.

## Time & Billing, System Health, and Reports panels

At the very bottom:

- **Time & Billing** and **Reports & Analytics** panels preview features that require the Consultant plan on Small Business; each shows an **Upgrade Plan** button.
- **System Health** reports live status of the application and database (uptime, latency, connections). It's an at-a-glance "is everything OK" indicator; **Refresh** re-checks it.

## Common tasks

1. **Create a project:** click **New**, enter a name and description, save. It appears in the grid.
2. **Open a project:** click its name in the grid (or use [Projects](projects.md)).
3. **Open a project's document:** click the document link on its card (e.g. **Development Plan**); "not created" means it hasn't been generated yet.
4. **Check overall status:** read the four summary cards and the System Health panel.

## Fields and what they show

- **Current Plan card** — your subscription tier and seats used vs. your seat limit.
- **Team Members card** — number of users in your company.
- **Active Projects card** — count of projects not archived.
- **Hours This Week card** — total tracked hours this week (0h when no time is logged).
- **Lifecycle phase (on each project card)** — which of the six phases the project is in, with progress toward the next.
- **Outstanding tasks** — unfinished tasks on that project.
- **Document link state** — "not created" (indigo) means the document hasn't been generated; a date means it exists and when it was last refreshed.
- **Proposal status** — where a proposed project stands (Submitted / Accepted / …).
- **Pending Tasks NEW / IN-PROG / TOTAL** — new, in-progress, and total unfinished tasks per project.
- **System Health** — application/database status, uptime, latency, and connection counts.
