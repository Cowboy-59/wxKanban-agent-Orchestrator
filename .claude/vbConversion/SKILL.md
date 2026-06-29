---
name: vbConversion
description: >-
  Convert a legacy **Visual Basic 6** (Classic VB / VB6) desktop application into a modern React +
  Tailwind + shadcn/ui rebuild scaffold by parsing its text source — the project (.vbp), forms
  (.frm/.frx), standard modules (.bas), class modules (.cls), and user controls (.ctl). Use this when
  a developer has a VB6 app and wants per-element Markdown, regenerated stack-native page components
  (VB6 form controls → shadcn, with event code wired as handler stubs), a reconstructed data-access
  scope (VB6 has no declarative dictionary — the model is recovered from Data-control RecordSource,
  bound DataFields, and code SQL), a business-logic scope from modules/classes, and a reports stub.
  Deterministic and token-efficient: the mechanical work runs in bundled Python scripts.
---

# vbConversion — Visual Basic 6 source → modern rebuild scaffold

> **The full step-by-step methodology for this skill is delivered by wxKanban at runtime.**
>
> To run the conversion, call the MCP tool **`project.get_command_prompt`** with
> `{ "command": "vbconversion" }`, then follow the returned instructions exactly. They drive the six
> deterministic conversion scripts bundled locally in this skill's **`scripts/`** directory
> (`vb6-project-split.py`, `vb6-form-to-react.py`, `vb6-data-to-sql.py`, `vb6-queries-to-scope.py`,
> `vb6-procs-to-scope.py`, `vb6-reports-to-stub.py`) and reference **`references/vb6-gaps.md`**.
>
> **Scope: VB6 / Classic VB only** — not VB.NET, VBScript/ASP, or VBA-in-Office directly (export
> Access/Excel macros with `Application.SaveAsText` first, then they parse like `.bas`/`.frm`).
>
> **Inputs.** The `.vbp` lists the forms/modules/classes/references and the third-party `Object=` OCX
> controls; pass the project and let the splitter follow its relative paths, or use `--src "<dir>/*"`.
>
> **VB6 has no data dictionary** — the data model (Stage 3) is inferred from the Data-control
> `RecordSource`, the bound `DataField`s, and code SQL; column **types and the primary key must be
> confirmed against the `.mdb`** (the form binding carries names only). Jet data is exported (JSON/CSV)
> and loaded with the generated DDL.
>
> **Windows path gotcha.** Pass **Windows-style** paths (`E:/App/src/*.frm`). Git-Bash/MSYS `/e/...`
> paths silently fail Python's `glob`/`os.path` — empty file set, **no error**.
>
> **Review what was _not_ captured** in `pre-convert/_discarded.md`. **Re-sync check:**
> `wxkanban-agent vbconversion --review` compares `pre-convert/` against `rebuild/` and lists what is
> missing, stale, or orphaned.
>
> If `project.get_command_prompt` is **not available as a tool**, the wxKanban MCP isn't connected to
> your AI client — a setup issue, not billing. Run `/wxAI-project-init` (writes `.mcp.json`) or
> `node scripts/init.mjs`, restart your AI client, approve the `wxkanban` server (Claude Code:
> `/mcp`). Only an explicit **401 / subscription error** is a token problem — re-run `kit-configure`
> or renew at https://wxperts.com/account/billing.

## What this skill produces (summary)

Per-element Markdown under `pre-convert/` (forms → `*.page.md` + `*.controls.md`, modules/classes →
`*.proc.md`, `_project.md`, `_discarded.md`), regenerated React/Tailwind/shadcn pages under
`rebuild/pages/` (bound fields → a typed `record`, event code → handler stubs, OCX flagged as gaps),
a reconstructed schema + ER diagram under `rebuild/db/`, and under `rebuild/scopes/` a queries scope,
a business-logic scope (Win32 `Declare` flagged non-portable), and a reports stub. When done, hand off
to **`/vbConversionScope`** to generate Scope-of-Project documents.

> **Sibling skills:** `wxConversion` (PCSoft WinDev/WebDev, from a PDF) and `cwConversion` (Clarion,
> from TXA/TXD/.clw). Same `pre-convert/` → `rebuild/` shape — only the parsers differ.
