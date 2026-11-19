---
id: theme-profiles
part: web-app
audience: customer
sources: 
---
# Theme Profiles

Theme Profiles are the visual counterpart to [Stack Profiles](stack-profiles.md): an administrator sets a **company-wide default look-and-feel (theme)** for each application type, and new projects of that type inherit it. Set your brand's default once and every new project starts on-brand.

## What you're looking at

An explanation followed by a **Profiles** list with one slot per application type — **Web**, **Desktop**, and **Mobile**. Each slot shows the current default theme or **"Not set (projects fall back to the wxKanban default)."**

## How defaults and overrides work

As with stacks, **a project that has set its own theme always wins.** The company default only applies to projects of that type that haven't chosen their own theme. Types with no company theme fall back to the built-in wxKanban default.

## Setting a company default theme

You create a company theme **from a project**, not on this screen directly:

1. Open a project and go to its **Theme** view (see [Inside a project](project-detail.md)).
2. Choose **Save as company theme**.
3. That theme becomes the company-wide default for the project's application type, and appears in the matching slot here.

Each slot here also offers a **"Save a … theme from a project"** shortcut to guide you to that flow.

## Common tasks

1. **Make all new web projects match your brand:** set a web project's theme, then **Save as company theme**.
2. **Check current defaults:** read the **Profiles** list.
3. **Override for one project:** set that project's own theme — it wins over the company default.

## Fields and what they show

- **Profiles (Web / Desktop / Mobile)** — the current company default theme per type, or "Not set" (falls back to the wxKanban default).
- **Save a … theme from a project** — shortcut into the per-project flow that creates the default.
