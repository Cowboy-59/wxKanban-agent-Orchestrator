---
description: Convert a legacy Visual Basic 6 (Classic VB) desktop app into a modern React + Tailwind + shadcn/ui rebuild scaffold by parsing its text source (.vbp/.frm/.bas/.cls/.ctl) — per-element Markdown, regenerated forms (bound fields + events wired), a reconstructed data model, queries scope, business-logic scope, reports stub.
args: "{{args}}"
ai-compat: universal
claude-code: true
cursor: true
blackboxai: true
---

# vbConversion — Visual Basic 6 source → modern rebuild scaffold

## Purpose

Convert a legacy **VB6 / Classic VB** desktop application (1998–2008, COM) into a modern React +
Tailwind + shadcn/ui rebuild scaffold, driven by its **text source**: the project (`.vbp`), forms
(`.frm`/`.frx`), standard modules (`.bas`), class modules (`.cls`), and user controls (`.ctl`). The
work runs in deterministic bundled Python scripts. This is the VB6 counterpart to `/wxConversion`
(WinDev, from a PDF) and `/cwConversion` (Clarion, from TXA/TXD/.clw).

**Scope: VB6 only** — not VB.NET (.vb/.vbproj), VBScript/ASP, or VBA-in-Office directly (export
Access/Excel macros with `Application.SaveAsText` first).

## Usage

```bash
/vbConversion --vbp conversion/src/<App>.vbp        # follows the .vbp's form/module list
/vbConversion --src "conversion/src/*"              # no .vbp — glob the source files
```

Pass **Windows-style** paths (`E:/App/src/*.frm`) — Git-Bash `/e/...` paths silently fail Python glob.

## Behavior

1. **Preflight:** confirm the skill is installed and Python 3 + Node/puppeteer are available
   (`PYTHONUTF8=1` on Windows if console-encoding errors appear).
2. **Load the skill** (`project.get_command_prompt { command: "vbconversion" }`) and follow its six
   Workflow stages, pausing to review between stages:
   - **Stage 1** — split `.vbp`/`.frm`/`.bas`/`.cls`/`.ctl` into `pre-convert/` Markdown (control tree
     with OCX-gap flags, menus, events). Review `pre-convert/_discarded.md`.
   - **Stage 2** — regenerate each form as a React/shadcn `.tsx` (bound textboxes → a typed `record`,
     event subs → handler stubs, third-party OCX flagged as gaps; see `references/vb6-gaps.md`).
   - **Stage 3** — **ask the developer** the target DB and reconstruct the data model from the
     Data-control `RecordSource` + bound `DataField`s + code SQL. **VB6 carries no types/PK** — tell
     them to confirm against the `.mdb`, and that Jet data must be exported (JSON/CSV) then loaded.
   - **Stage 4** — queries scope (SQL from `RecordSource`/`Recordset.Open`/inline, cited to its proc).
   - **Stage 5** — business-logic scope (modules/classes); **Win32 `Declare` flagged non-portable**.
   - **Stage 6** — reports stub (Data Report `.dsr` / Crystal `.rpt`, or none).
3. **Surface, don't decide.** Flag OCX controls, inferred types, the synthesized key, Win32 calls,
   string-concatenated SQL, and `_discarded.md` for human review. Modernize, don't replicate twips.

## Re-sync

`wxkanban-agent vbconversion --review` compares `pre-convert/` against `rebuild/` and lists what is
missing, stale, or orphaned — choose what to regenerate / keep / delete. It changes nothing.

## Exit conditions

`pre-convert/` Markdown, `rebuild/pages/*.tsx`, `rebuild/db/` schema + ER (chosen dialect),
`rebuild/scopes/` queries + business-logic scopes + reports stub. Ready for `/vbConversionScope`.

## Context

{{args}}
