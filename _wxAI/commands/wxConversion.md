---
description: Convert a legacy PCSoft WinDev / WebDev app into a modern React + Tailwind + shadcn/ui rebuild scaffold by working FROM its generated technical-documentation PDF — per-element Markdown, regenerated stack-native pages (behavior wired), DB schema/ER, queries scope, reports stub.
args: "{{args}}"
ai-compat: universal
claude-code: true
cursor: true
blackboxai: true
---

# wxConversion — PCSoft doc PDF → modern rebuild scaffold

## Purpose

Run the **from-PDF** conversion of a PCSoft **WinDev / WebDev / WLanguage** application — driven by
the project's generated **Technical Documentation PDF** instead of the `.wdw/.wdg/.wdc` source. A
single PDF (often 1000+ pages) contains the pages, their controls, the WLanguage event code, the
HFSQL data model, and the SQL queries. The work is done by deterministic bundled scripts, so token
cost stays low even on huge documents.

This command **loads and runs the `wxConversion` skill**
(`.claude/skills/wxConversion/SKILL.md`). It drives the PDF-based conversion flow.

## Usage

```bash
/wxConversion <path-to-doc.pdf>     # e.g. conversion/docs/WW_Newsletter_Documentation.pdf
```

If no path is given, look for a single PDF under `conversion/docs/` and confirm it with the
developer before starting.

## Behavior

1. **Preflight:** confirm the skill exists at `.claude/skills/wxConversion/SKILL.md` and that
   PyMuPDF (`pip install pymupdf`) and Node/puppeteer are available. On Windows, prefix Python with
   `PYTHONUTF8=1` if console-encoding errors appear.
2. **Load the skill** and follow its **Workflow** stages in order, pausing for review between stages:
   - **Stage 1** — split the PDF into per-element Markdown under `pre-convert/`.
   - **Stage 2** — regenerate each page as a modern React + Tailwind + shadcn/ui `.tsx` under
     `rebuild/pages/`, with WLanguage behavior wired as handler stubs and non-shadcn controls
     flagged (see the skill's `references/library-gaps.md`).
   - **Stage 3** — **ask the developer** the target database (PostgreSQL / MSSQL / MySQL / Firebird /
     None) and whether to keep field names faithful or modify; then generate DDL + ER diagram under
     `rebuild/db/`. Tell them HFSQL data must first be exported to JSON via a WLanguage global
     procedure.
   - **Stage 4** — document every query as one scope under `rebuild/scopes/` (with the SQL-truncation
     caveat).
   - **Stage 5** — write the reports stub (or scope real reports if any exist).
3. **Surface, don't decide.** Flag `GB` captions, component gaps, truncated SQL, and composite keys
   for human review. Modernize the UI rather than replicating the legacy layout 1:1.

## Exit conditions

`pre-convert/` Markdown produced, `rebuild/pages/*.tsx` regenerated in the project stack,
`rebuild/db/` schema + ER diagram in the chosen dialect, `rebuild/scopes/` queries scope and reports
stub. Ready for the rebuild team.

## Context

{{args}}
