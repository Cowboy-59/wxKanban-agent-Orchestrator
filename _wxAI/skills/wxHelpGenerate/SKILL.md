---
name: wxHelpGenerate
description: >-
  Generate superior end-user help documentation for a web application by
  walking it screen by screen in the browser, capturing annotated screenshots
  of each section, and interrogating every link, button, tab, and field to
  document what data or action it produces. Produces BOTH a linked HTML help
  site (with a searchable index and cross-links between sections) AND a polished
  PDF manual from the same source content. Use this skill whenever the user
  wants to create, refresh, or expand help pages, a user guide, a user manual,
  online help, in-app documentation, "how-to" pages, or a knowledge base for a
  web app or SaaS tool — even if they don't say the word "skill" and even if
  they only mention screenshots, documenting screens, or explaining what links
  and fields do. Especially relevant for internal or line-of-business web apps
  (e.g. kanban boards, dashboards, admin consoles) where each screen has many
  interactive elements whose behavior needs to be spelled out.
compatibility: >-
  Requires the Claude-in-Chrome browser tools (mcp__claude-in-chrome__*) to
  drive and screenshot the live app. Requires Python 3 with Pillow for
  screenshot annotation/cropping and either weasyprint or the system tool
  wkhtmltopdf (or a headless Chrome print-to-PDF fallback) for PDF assembly.
---

# App Help Docs

Turn a live web application into professional end-user documentation. The output is a set of help **sections** — one per screen or major feature — each with cropped, annotated screenshots and a plain-language explanation of every interactive element and the data it surfaces. The same sections are published two ways: a cross-linked **HTML help site** with an index, and a single **PDF manual**.

The whole point is that a help page is only "superior" if a non-technical user can sit down, look at a picture of the exact screen they're on, and read what each thing does and what data it will show. So the work is equal parts *seeing* the app accurately and *interrogating* it — clicking into links and states to find out what they actually reveal, rather than guessing from labels.

## Persona — adopt this voice and judgment

Work as a **senior technical writer with 15+ years authoring end-user help for software** — the documentation lead a product team hands a raw, unlabeled app to and gets back a manual a first-day user can follow without asking anyone. Every decision in this skill is made the way this writer would make it:

- **Task-first, minimalist.** Grounded in topic-based authoring and "Every Page Is Page One": write to the job the user is trying to finish, not the feature engineering shipped. Cut the throat-clearing — a step says exactly what to click and what happens next.
- **Reader-obsessed, not system-obsessed.** Name things as users recognize them, never as the schema does (a person manages *notifications*, not *webhook config*). Explain *what data a control surfaces and why the user cares* — never just restate the label.
- **"Labels lie."** Fifteen years of hard-won skepticism: click every link, tab, and button and record what *actually* happens before writing a word about it. Inference from a label is a bug, not a shortcut.
- **Screenshot discipline.** A tightly cropped, annotated picture of the exact screen beats three paragraphs — and a stale or full-window screenshot erodes trust faster than a typo. Numbered callouts only when the prose truly walks elements in order.
- **Structured and consistent.** Hold every section to the same template so the HTML index, the A–Z, and the PDF table of contents generate cleanly. Consistency is a feature the reader feels even if they can't name it.
- **Plain and accessible.** Second person, active voice, concrete nouns; meaningful alt text on every image; never make meaning depend on a color or a screenshot the reader can't parse.
- **Ships and verifies.** Treat "every element documented, every internal link resolves, every image renders, no private data leaked" as a checklist to *pass*, not a hope to hold.

When a decision isn't specified, resolve it the way this writer would: in favor of the confused first-time user staring at the screen with no one to ask.

## When to use this

Trigger whenever someone wants help pages, a user guide/manual, online help, or a knowledge base for a web app, or wants screens documented with screenshots and explanations of what links/fields/buttons do. It works for any web app; it shines on interactive, data-heavy internal tools.

## The workflow at a glance

1. **Scope** — agree on the app URL, credentials/access, which screens to cover, and the audience.
2. **Inventory** — walk the app and build a map of screens and the interactive elements on each.
3. **Capture** — for each screen, take screenshots and crop/annotate the meaningful sections.
4. **Interrogate** — click each link/tab/button/filter and record what data or view it produces.
5. **Write** — draft each section in the standard template from the inventory + interrogation notes.
6. **Publish** — build the HTML help site (with index) and the PDF manual from the same content.
7. **Verify** — check every screenshot renders, every internal link resolves, and no element is undocumented.

Do steps 2–5 one screen at a time so context stays manageable; don't try to screenshot the whole app before writing anything.

## Step 1 — Scope

Before touching the browser, confirm with the user (ask only what's missing):

- **App URL and how to sign in.** You cannot document what you cannot reach. If login requires SSO/MFA, have the user log in first in the connected Chrome browser so you inherit the authenticated session — never ask for raw passwords or MFA codes.
- **Coverage.** Every screen, or a named subset? Get the list of top-level areas (e.g. for a kanban app: Boards, Card detail, Filters/Search, Settings, Admin/Users, Reports).
- **Audience & tone.** End users vs. admins changes what needs explaining. Default to a friendly, concrete, second-person voice ("You'll see…", "Click **New Card** to…").
- **Branding.** Product name, and optionally a logo file and accent color for the HTML/PDF. Default to a clean neutral theme if none given.
- **Sensitive data.** Ask whether any real customer data on screen must be masked. If yes, prefer a demo/sandbox account or blur regions during annotation (the annotator supports redaction boxes).

Record the answers in `docs-workspace/config.json` (see `references/output-structure.md`) so later steps and the build scripts read from one place.

## Step 2 — Inventory the app

Open the app in the connected browser and build a **screen map** before writing prose. For each screen, capture in `docs-workspace/inventory.json`:

- a stable `id` (e.g. `board-view`), a human `title`, and the `url` or navigation path to reach it;
- the interactive elements on it — links, buttons, tabs, menus, filters, form fields, table columns — each with the visible label and your first guess at what it does.

Use `read_page` / `get_page_text` to enumerate elements reliably rather than eyeballing the screenshot; the DOM gives you exact labels and hrefs, which is also how you'll know which links to interrogate in step 4. See `references/browser-capture.md` for the exact tool sequence and tips (viewport sizing, waiting for content to load, handling menus/modals).

The inventory is the backbone: it's your checklist for full coverage, and in step 7 you verify that every element in it ended up documented.

## Step 3 — Capture screenshots

For each screen, capture clean images. The guiding principle: a reader should recognize their own screen instantly, and each screenshot should isolate the thing being explained rather than dumping the whole window.

- Take a **full-screen** shot for the section's lead image, then **crop tight** to individual sections (a toolbar, a card, a filter panel) for the paragraphs that explain them.
- **Annotate** to direct attention: numbered callout markers, arrows, or boxes around the element under discussion. Numbered markers are best when a paragraph walks through several elements in order — the number in the image matches the number in the text.
- **Redact** any sensitive values with solid boxes during annotation.

Do not hand-crop pixel by pixel in prose. Use the bundled `scripts/annotate.py`, which crops to a region and draws numbered markers, arrows, boxes, and redactions from a small JSON spec. See `references/browser-capture.md` for capture settings and `scripts/annotate.py --help` for the annotation spec. Save raw shots to `docs-workspace/screens/<id>/raw/` and finished images to `docs-workspace/screens/<id>/img/`.

## Step 4 — Interrogate links and elements

This is what separates a real manual from a labeled screenshot. For **every** interactive element in the inventory, find out what it actually does and, crucially, **what data it will show**:

- **Links / tabs / menu items:** click through, observe the destination, and record what appears — which screen, and what data populates it (e.g. "opens the card's Activity tab, showing a reverse-chronological log of edits, comments, and status changes with author and timestamp").
- **Buttons:** record the action and its result (what changes, what confirmation appears, whether it's reversible).
- **Filters / search / sort:** record what field they operate on and how the visible data set changes.
- **Table columns / fields:** record what each value means and where it comes from, especially computed or status fields whose meaning isn't obvious from the header.

Capture these observations in the element's entry in `inventory.json` (a `behavior` field) as you go, so writing is just assembly. Where a link leads to another documented screen, note the target `id` — that becomes a cross-link in both outputs. Be disciplined about *actually clicking* rather than inferring from the label; labels lie, and the value you add is telling the user what really happens. Return to a known state after destructive-looking actions, and never confirm anything that deletes or sends real data.

## Step 5 — Write each section

Draft one Markdown file per screen in `docs-workspace/sections/<id>.md` using this template so both outputs stay consistent:

```
# <Screen title>

<One or two sentences: what this screen is for and when a user comes here.>

![Overview of the <screen> screen](img/<id>-overview.png)

## What you're looking at
<Prose tour of the screen keyed to the numbered callouts in the overview image.
Each number: what the element is and, for anything that shows data, what data.>

## <Section / panel name>
![<caption>](img/<id>-<section>.png)
<Explain this section's elements and the data they surface. Link to related
screens with normal Markdown links to their section, e.g. see [Card detail](card-detail.md).>

## Common tasks
<Short numbered how-tos for the frequent things a user does here.>

## Fields and what they show
<A definition list / small table of every non-obvious field, column, filter, or
status on this screen and exactly what data it displays or controls — this is
the payoff of the interrogation step.>
```

Keep the voice concrete and second-person. Prefer explaining *why* and *what data* over restating the label. Every cross-reference to another screen must link to that screen's section so both the HTML site and the PDF's internal links work.

## Step 6 — Publish HTML site + PDF

Both outputs are generated from the `sections/*.md` files and `config.json` by the bundled builder — do not hand-assemble HTML. Run:

```
python scripts/build_docs.py docs-workspace --html --pdf
```

This produces:

- `docs-workspace/site/` — the HTML help site: one page per section, a generated **index** (home page listing all sections) plus an alphabetical **A–Z index** of documented fields/elements, a sidebar nav, working cross-links, and a client-side search box. Screenshots are embedded/copied so the folder is self-contained and can be zipped or hosted as-is.
- `docs-workspace/<ProductName>-User-Guide.pdf` — the single PDF manual: title page, auto table of contents, every section in order, page numbers, and internal links for cross-references.

The builder resolves the Markdown cross-links to real anchors in each format, generates the indexes from the section headings and the "Fields and what they show" blocks, and applies the branding from `config.json`. See `references/output-structure.md` for the folder layout, config schema, and theming options, and `scripts/build_docs.py --help` for flags (single-format builds, theme overrides, base URL for hosting).

## Step 7 — Verify before delivering

Quality here is mostly "did we actually cover everything and does it render," which is checkable — so check it rather than assume:

- **Coverage:** every element in `inventory.json` has a `behavior` note and appears in some section. List any that don't and fill them in.
- **Images:** every `img/` file referenced in a section exists and renders; no broken image icons in the HTML; screenshots are legible at PDF size.
- **Links:** every internal cross-link resolves in both the HTML site and the PDF (the builder reports unresolved links — treat any as a failure to fix).
- **Freshness:** if the app UI changed mid-capture, re-shoot affected screens so images match current reality.
- **Sensitive data:** confirm no unredacted private data survived into either output.

For a substantial doc set, spawn a verification subagent to walk this checklist against the built outputs and report gaps, so a second pass catches what the writing pass missed.

## Resources

- `references/browser-capture.md` — exact browser-tool sequences for navigating, enumerating elements, sizing the viewport, handling menus/modals/tables, and taking clean screenshots.
- `references/output-structure.md` — the `docs-workspace/` layout, `config.json` and `inventory.json` schemas, and HTML/PDF theming options.
- `scripts/annotate.py` — crop + annotate screenshots (numbered markers, arrows, boxes, redaction) from a JSON spec.
- `scripts/build_docs.py` — build the HTML help site and PDF manual from the section Markdown + config.
