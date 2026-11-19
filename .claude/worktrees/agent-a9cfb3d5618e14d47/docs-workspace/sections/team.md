---
id: team
part: web-app
audience: customer
sources: 
---
# Team Members

Team Members is where administrators manage who's in the company and what they can do — inviting people, setting roles and languages, activating or deactivating accounts — plus managing outside **consulting firms** engaged on your projects.

## What you're looking at

The header shows the member count and an **Invite Member** button. A search box and **All / Active / Inactive** filters sit above a table of members. Below the table is the **Consultants** section for external firms.

## The members table

One row per person, with these columns:

- **Email** — the member's sign-in address.
- **Name** — their display name.
- **Role** — **Admin** (full company control), **Manager** (manages projects/work but not company settings), or **Member**. An admin can change a member's role from the dropdown here.
- **Language** — the member's interface language (English, Français, Español, Italiano, Deutsch, Português), changeable from the dropdown.
- **Status** — **Active** or **Inactive**. Inactive members can't sign in but their history is kept.
- **Joined** — the date they were added.
- **Actions** — per-row icons to **edit** the member, **resend the invitation** email, **reset/manage their access**, and **remove** them. Removing is destructive, so it asks for confirmation.

Use the **Invite Member** button to add someone: enter their email and role, and wxKanban emails them an invitation to set their own password. Each seat counts against your plan's user limit (shown on the [Dashboard](dashboard.md) and in [Settings](settings.md)).

**Testers** are invited the same way. A person who runs and signs off human tests needs a wxKanban account in your company; see [Human Testing](process-human-testing.md).

## Consultants

The **Consultants** section manages engagements between your company and outside **consulting firms**. Consultants **don't count against your seat cap** and only see the projects you assign to them. Use **Invite Consulting Company** to start an engagement.

Each engaged firm appears as a card showing its name, engagement date, **Projects Assigned**, and rolled-up **Members / Hours / Billed** totals. The card's actions let you **Open** the engagement, **Pause** it (temporarily suspend access), **Disable** it, or **End** it. Pause, Disable, and End change the firm's access, so use them deliberately.

## Common tasks

1. **Add a teammate:** click **Invite Member**, enter email and role, send. They get an email to join.
2. **Change someone's role:** pick **Admin** or **Manager** in their **Role** dropdown.
3. **Deactivate someone:** use the row actions to set them inactive or remove them (confirm when asked).
4. **Find a member:** type a name or email in the search box, or filter by **Active** / **Inactive**.
5. **Bring in a consulting firm:** click **Invite Consulting Company** and assign it to specific projects.

## Fields and what they show

- **Member count** — how many people are in your company.
- **Email** — the member's sign-in identity.
- **Role** — Admin, Manager, or Member, controlling what they can do.
- **Language** — the member's UI language.
- **Status** — Active (can sign in) or Inactive (retained but blocked).
- **Joined** — when the member was added.
- **Consultant card — Members / Hours / Billed** — rolled-up totals for that firm's engagement.
- **Consultant status (active / paused / …)** — the current state of the engagement.
