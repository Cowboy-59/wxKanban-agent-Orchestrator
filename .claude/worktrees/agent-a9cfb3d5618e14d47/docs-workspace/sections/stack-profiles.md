---
id: stack-profiles
part: web-app
audience: customer
sources: 
---
# Stack Profiles

Stack Profiles let an administrator set a **company-wide default technology stack and style** for each type of application. New projects of that type automatically inherit the default, so you don't re-specify your standard tools on every project. It's a set-once convenience that keeps projects consistent.

## What you're looking at

A short explanation is followed by a **"Promote a project's stack to company-wide"** control and a **Profiles** list. There is one profile slot per application type — **Web**, **Desktop**, and **Mobile**.

## How defaults and overrides work

The rule is simple: **a project that has its own captured stack always wins.** A company default only applies to projects of that type that haven't captured their own. So you can set a sensible company standard and still let individual projects diverge when they need to.

## Setting a company default by promoting a project

The easiest way to create a default is to **promote** an existing project's stack:

1. In the **Project** dropdown, pick a project that already has a captured Stack & Style (the list shows each project with its type, e.g. "wxKanban Development — Web").
2. Click **Promote**.
3. That project's stack becomes the company-wide default for its application type (Web / Desktop / Mobile).

A project's own stack is captured in its **Stack** view — see [Inside a project](project-detail.md).

## Common tasks

1. **Set a company standard for web apps:** promote a representative Web project's stack.
2. **See current defaults:** read the **Profiles** list (one per type).
3. **Let a project differ:** capture that project's own stack — it overrides the default automatically.

## Fields and what they show

- **Project dropdown** — projects eligible to promote (those with a captured Stack & Style), each tagged with its type.
- **Promote** — makes the selected project's stack the company default for its type.
- **Profiles (Web / Desktop / Mobile)** — the current company-wide default stack for each application type, or "not set."
