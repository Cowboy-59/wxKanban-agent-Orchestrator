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
> `pcsoft-queries-to-scope.py`, `render.mjs`) and reference **`references/library-gaps.md`**.
>
> This requires an active wxKanban subscription. If the fetch returns a subscription error,
> renew at https://wxperts.com/account/billing and retry.

## What this skill produces (summary)

From one PCSoft Technical-Documentation PDF: per-element Markdown under `pre-convert/`, regenerated
React/Tailwind/shadcn pages under `rebuild/pages/` (WLanguage behavior wired as handler stubs), a
target-DB schema + Mermaid ER diagram under `rebuild/db/`, a queries scope and reports stub under
`rebuild/scopes/`. When conversion is done, hand off to **`/wxConversionScope`** to generate
Scope-of-Project documents from the result.
