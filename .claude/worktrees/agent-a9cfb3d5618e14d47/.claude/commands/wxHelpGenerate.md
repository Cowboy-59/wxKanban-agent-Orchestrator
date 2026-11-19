---
description: wxHelpGenerate — turn a live web app into end-user help by walking it screen by screen, then publish a linked HTML help site + a PDF manual; with --teach, also one AI-agnostic lesson per process for users to learn the app in their own AI (--teach --stale regenerates only the lessons a change reached); with --video, one short narrated onboarding video per lesson, recorded in UAT only (--video --stale re-records only the changed ones).
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

## --teach — Teaching Skills

`/wxHelpGenerate --teach` makes the same walk also write **one lesson per process**
(`docs/teaching-skills/<process>.md`, plus `start-here.md` and a zip bundle). A new user loads a
lesson into any AI chat and is taught the task step by step. The AI acts as a tutor, or as a coach
when it can see their browser.

- **The save rule.** The first run asks for the app's UAT and Production addresses. In UAT a learner
  completes every step; in Production, or when unsure, the lesson asks **"Do you wish to save your
  changes?"** before every step that saves, submits, sends or deletes.
- **No real data.** Lessons hold behavior only, with made-up examples. A lesson containing an email,
  key, token or similar is refused before anything is written, and no option turns that check off.
- **Desktop and mobile apps** get lessons from their screen definitions, labeled "from definitions,
  not tested by clicking".

`/wxHelpGenerate --teach --stale` regenerates only the lessons whose screens a change reached (found
by the kit's Change Impact engine). Each opens with "What changed since version X"; the other
lessons are untouched. Each run is recorded in wxKanban.

## --video — Onboarding Videos

`/wxHelpGenerate --video` turns each lesson into a short branded video of its process: the lesson's
steps are replayed in **UAT** at human speed and recorded, then composed with an oversized cursor,
highlights, captions and narration taken from the lesson text, a chapter per step and an end card
naming the lesson. Videos go to `docs/onboarding-videos/` for you to host.

- **UAT only.** Recording is refused on a Production address and on any address on neither list.
- **Demo data only.** Before the first recording on a UAT address it asks **"Does this UAT hold demo
  data only?"**; without a yes nothing is recorded, and a new UAT address is asked again. No option
  skips either check.
- **No cost, nothing sent.** HyperFrames (Apache 2.0) installs on first use at a pinned version and
  renders locally with a local voice. It needs Node.js 22+ and FFmpeg; the preflight names anything
  missing. No footage is sent to wxKanban.
- **Presenter.** Narration only by default; an optional brand mascot; your own presenter clip only
  with a recorded consent attestation. wxKanban never generates a person's likeness.
- **Web apps only.** Desktop and mobile video is reserved for a future release.

| Flag | What it does |
| --- | --- |
| `--video` | Record and compose one onboarding video per lesson, in UAT |
| `--video --stale` | Re-record only the videos whose lesson changed or whose screens a change reached |

## Prerequisites

- **Claude-in-Chrome browser tools** to drive and screenshot the live app (log in first in the connected browser — never share raw passwords/MFA).
- **Python 3 + Pillow** for screenshot crop/annotate, and **weasyprint** or **wkhtmltopdf** (or headless-Chrome print) for the PDF.

## Where it shows up

- **Dev Cockpit** — listed under **Standard** commands.
- Output lands in `docs-workspace/` — the self-contained HTML help `site/` and the `<Product>-User-Guide.pdf`.

## See also

- `/help-catalog` — the subscription-aware in-app Help catalog (features by plan), a different surface from these per-screen manuals.

Full reference: `.claude/skills/wxHelpGenerate/SKILL.md`.
