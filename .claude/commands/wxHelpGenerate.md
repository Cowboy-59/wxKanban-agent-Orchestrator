---
description: wxHelpGenerate — turn a live web app into end-user help by walking it screen by screen, then publish a linked HTML help site + a PDF manual.
args: "{{args}}"
ai-compat: universal
claude-code: true
cursor: true
blackboxai: true
---

# wxHelpGenerate — End-User Help Generator

Produces professional end-user documentation for a web application by **seeing** the app accurately
and **interrogating** it — one help **section** per screen, each with cropped, annotated screenshots
and a plain-language explanation of every link, button, tab, filter, and field and the data it
surfaces. The same content is published two ways: a cross-linked **HTML help site** with a searchable
index, and a single **PDF manual**.

This command runs the **`wxHelpGenerate` skill**. Invoke the skill, then follow its workflow:

1. **Scope** — confirm the app URL, how to sign in, which screens to cover, and the audience.
2. **Inventory** — walk the app and map every screen and its interactive elements (`inventory.json`).
3. **Capture** — screenshot each screen and crop/annotate the meaningful sections.
4. **Interrogate** — click each link/tab/button/filter and record what data or view it actually produces.
5. **Write** — draft one section per screen from the inventory + interrogation notes (standard template).
6. **Publish** — `python scripts/build_docs.py docs-workspace --html --pdf` builds the site + PDF from the same source.
7. **Verify** — every element documented, every internal link resolves, every screenshot renders, no private data leaked.

Do steps 2–5 one screen at a time so context stays manageable.

## Prerequisites

- **Claude-in-Chrome browser tools** to drive and screenshot the live app (log in first in the connected browser — never share raw passwords/MFA).
- **Python 3 + Pillow** for screenshot crop/annotate, and **weasyprint** or **wkhtmltopdf** (or headless-Chrome print) for the PDF.

## Where it shows up

- **Dev Cockpit** — listed under **Standard** commands.
- Output lands in `docs-workspace/` — the self-contained HTML help `site/` and the `<Product>-User-Guide.pdf`.

## See also

- `/help-catalog` — the subscription-aware in-app Help catalog (features by plan), a different surface from these per-screen manuals.

Full reference: `.claude/skills/wxHelpGenerate/SKILL.md`.
