---
name: wxConversion
description: >-
  Convert a legacy PCSoft WinDev / WebDev application into a modern React + Tailwind + shadcn/ui
  rebuild scaffold by working FROM the project's generated technical-documentation PDF (not the
  .wdw/.wdg/.wdc source). This skill should be used when a developer has a PCSoft "Technical
  Documentation" PDF export and wants per-element Markdown, regenerated stack-native page
  components (with WLanguage behavior wired as handler stubs), a database schema/ER diagram in a
  chosen dialect, a queries scope, and a reports stub. It is deterministic and token-efficient
  (the heavy mechanical work runs in bundled Python scripts, not the model).
---

# wxConversion — PCSoft doc PDF → modern rebuild scaffold

> **The full step-by-step methodology for this skill is delivered by wxKanban at runtime.**
>
> To run the conversion, call the MCP tool **`project.get_command_prompt`** with
> `{ "command": "wxconversion" }`, then follow the returned instructions exactly. They drive the
> deterministic conversion scripts bundled locally in this skill's **`scripts/`** directory
> (`pcsoft-doc-split.py`, `pcsoft-page-to-react.py`, `pcsoft-schema-to-sql.py`,
> `pcsoft-queries-to-scope.py`, `pcsoft-procs-to-scope.py`, `pcsoft-reports-to-stub.py`,
> `render.mjs`) and reference **`references/library-gaps.md`**.
>
> **`pcsoft-doc-split.py` classifies elements by the breadcrumb _Type_ segment, not the Part
> number** — PCSoft part numbering is not stable across exports (queries can be Part 4 or Part 6,
> procedure sets Part 5 or Part 7). Keying on the number silently dropped whole sections (the
> real `QRY_*` queries and the entire server/global procedure layer, including HFSQL trigger
> procedures). After splitting, you MUST run, in addition to the page/schema/queries steps:
> `pcsoft-procs-to-scope.py` (server/global procedures, incl. triggers) and
> `pcsoft-reports-to-stub.py` (reports).
>
> **Review what was _not_ captured.** When any page fails to group into an element, the splitter
> writes **`pre-convert/_discarded.md`** (grouped by breadcrumb Type, with page ranges) and warns
> on the console. Most entries are the cover, table of contents, and section dividers — but if any
> Type there names a real element kind, that element was not converted. Open `_discarded.md`,
> surface it to the developer, and ask whether they want to keep any of it before moving on — do
> not silently discard.
>
> **Re-sync review.** After a conversion (or whenever the source PDF changes), run
> **`wxkanban-agent wxconversion --review`** to compare `pre-convert/` (source) against `rebuild/`
> (generated) and list what is **missing**, **stale** (a source changed since it was generated),
> **orphaned** (generated with no source), or flagged for review (`_discarded.md`). It changes
> nothing — present the findings to the developer as choices (regenerate / keep / delete) and act on
> their selection.
>
> If `project.get_command_prompt` is **not available as a tool**, the wxKanban MCP isn't
> connected to your AI client — a setup issue, not billing. Register it and restart: run
> `/wxAI-project-init` (writes `.mcp.json`) or `node scripts/init.mjs`, then restart your AI
> client and approve the `wxkanban` server (Claude Code: `/mcp`). Only an explicit **401 /
> subscription error** from the fetch is a token/subscription problem — re-run `kit-configure`
> or renew at https://wxperts.com/account/billing.

## What this skill produces (summary)

From one PCSoft Technical-Documentation PDF: per-element Markdown under `pre-convert/` (plus
`_discarded.md` listing anything not captured, for review), regenerated React/Tailwind/shadcn pages
under `rebuild/pages/` (WLanguage behavior wired as handler stubs), a target-DB schema + Mermaid ER
diagram under `rebuild/db/`, and under `rebuild/scopes/` a queries scope, a **server/global
procedures scope** (the backend WLanguage business-logic layer, including HFSQL trigger procedures —
these have no UI and are NOT scaffolded as pages), and a reports stub. When conversion is done, hand
off to **`/wxConversionScope`** to generate Scope-of-Project documents from the result.
