---
description: Convert a legacy SoftVelocity / PCSoft Clarion desktop app into a modern React + Tailwind + shadcn/ui rebuild scaffold by parsing its raw source (TXA/TXD/.clw) — per-element Markdown, regenerated stack-native windows (embeds wired), DB schema/ER with real FKs, queries scope, procedures scope, reports stub.
args: "{{args}}"
ai-compat: universal
claude-code: true
cursor: true
blackboxai: true
---

# cwConversion — Clarion source (TXA/TXD/.clw) → modern rebuild scaffold

## Purpose

Run the conversion of a legacy SoftVelocity / PCSoft **Clarion** desktop application (Clarion 6–11)
into a modern React + Tailwind + shadcn/ui rebuild scaffold, driven by the app's **raw text source**:
the dictionary export (`.txd`), the application export (`.txa`), and any hand-coded or generated
`.clw` modules. Binary `.app`/`.dct` are not text-parseable, so a handover is usually `.txd`+`.txa`,
or — when only the generated source survives — the `.clw` set alone (`--clw "<dir>/*.clw"`). The work
is done by deterministic bundled Python scripts, so token cost stays low even on large apps.

This command **loads and runs the `cwConversion` skill**. It is the Clarion counterpart to
`/wxConversion` (which works from a PCSoft WinDev/WebDev technical-doc PDF).

## Usage

```bash
/cwConversion --txa conversion/src/<App>.txa --txd conversion/src/<App>.txd --clw "conversion/src/*.clw"
/cwConversion --clw "conversion/src/*.clw"     # generated-source-only handover
```

Pass **Windows-style** paths (`E:/App/src/*.clw`) — Git-Bash `/e/...` paths silently fail Python glob.

## Behavior

1. **Preflight:** confirm the skill is installed and Python 3 + Node/puppeteer are available. On
   Windows, prefix Python with `PYTHONUTF8=1` if console-encoding errors appear.
2. **Load the skill** (`project.get_command_prompt { command: "cwconversion" }`) and follow its
   **Workflow** stages in order, pausing for review between stages:
   - **Stage 1** — split the source into per-element Markdown under `pre-convert/`. Pass the whole
     `.clw` set (incl. `*_BC*.clw`) so the foreign-key graph is recovered. Then review
     `pre-convert/_discarded.md` and keep anything real that was not captured.
   - **Stage 2** — regenerate each WINDOW as a modern React/Tailwind/shadcn `.tsx` under
     `rebuild/pages/`, embeds wired as handler stubs, non-shadcn controls flagged (see the skill's
     `references/clarion-gaps.md`).
   - **Stage 3** — **ask the developer** the target database (PostgreSQL / MSSQL / MySQL / Firebird /
     None) and whether to keep field names faithful or modify; then generate DDL (with **real FK
     constraints** when relations were recovered) + ER diagram under `rebuild/db/`. Tell them TopSpeed
     / ISAM data must first be exported to JSON via a small Clarion export procedure.
   - **Stage 4** — document every VIEW/browse as one queries scope under `rebuild/scopes/`.
   - **Stage 5** — server/business-logic scope (procedures + embeds + dictionary referential-integrity
     — the Clarion equivalent of triggers, ported to the server layer, not scaffolded as pages).
   - **Stage 6** — reports stub (or scope real reports if any exist).
3. **Surface, don't decide.** Flag picture-token formats, component gaps, reconstructed joins,
   dictionary prefixes, and `_discarded.md` for human review. Modernize the UI rather than replicating
   the Clarion `AT()` layout 1:1.

## Re-sync

`wxkanban-agent cwconversion --review` compares `pre-convert/` (source) against `rebuild/` (generated)
and lists what is **missing**, **stale**, or **orphaned** — so you can choose what to regenerate /
keep / delete. It changes nothing.

## Exit conditions

`pre-convert/` Markdown produced, `rebuild/pages/*.tsx` regenerated in the project stack,
`rebuild/db/` schema + ER diagram in the chosen dialect, `rebuild/scopes/` queries + procedures scopes
and reports stub. Ready for `/cwConversionScope`.

## Context

{{args}}
