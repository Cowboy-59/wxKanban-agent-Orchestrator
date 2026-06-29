---
name: cwConversion
description: >-
  Convert a legacy SoftVelocity / PCSoft **Clarion** desktop application into a modern React +
  Tailwind + shadcn/ui rebuild scaffold by parsing its raw source — the dictionary text export
  (.txd), the application text export (.txa), and any hand-coded or generated Clarion modules
  (.clw/.inc/.equ). Use this when a developer has a Clarion app (Clarion 6 through 11) and wants
  per-element Markdown, regenerated stack-native page components (Clarion WINDOW controls → shadcn,
  with embed code wired as handler stubs), a target-DB schema + ER diagram from the dictionary, a
  queries scope from the VIEW/browse definitions, a server/business-logic scope from procedures and
  embeds, and a reports stub from REPORT structures. It is deterministic and token-efficient: the
  heavy mechanical work runs in bundled Python scripts, the model orchestrates and reviews.
---

# cwConversion — Clarion source (TXA/TXD/.clw) → modern rebuild scaffold

> **The full step-by-step methodology for this skill is delivered by wxKanban at runtime.**
>
> To run the conversion, call the MCP tool **`project.get_command_prompt`** with
> `{ "command": "cwconversion" }`, then follow the returned instructions exactly. They drive the
> deterministic conversion scripts bundled locally in this skill's **`scripts/`** directory
> (`clarion-app-split.py`, `clarion-window-to-react.py`, `clarion-dict-to-sql.py`,
> `clarion-views-to-scope.py`, `clarion-procs-to-scope.py`, `clarion-reports-to-stub.py`,
> `render.mjs`) and reference **`references/clarion-gaps.md`**.
>
> **Input precedence.** Pass `--txd` (dictionary) + `--txa` (application) when you have the clean
> exports; if either is absent the splitter falls back to the generated `.clw` set, so a binary
> `.app`/`.dct` handover converts with `--clw "<dir>/*.clw"` alone. Pass the **whole** `.clw` set —
> including the generated `*_BC*.clw` business-class modules, which carry the dictionary's foreign-key
> graph as `AddRelationLink` calls (recovered into real FK constraints when there is no `.txd`).
>
> **`--txd` means the *text* TXD export, NOT an XML `.dctx`.** A modern Clarion dictionary export
> (`*.dctx`, header `<?xml ...><Dictionary ... DctxFormat="N">`) is **XML** and is not understood by the
> `--txd` parser — passing it yields **zero tables** *and* suppresses the `--clw` table/FK fallback, so
> you silently get a windows-only conversion. When the only dictionary you have is XML `.dctx`, **omit
> `--txd`** and let the dictionary + FK graph be recovered from the generated `*_BC*.clw` modules via
> `--clw`. Symptom of getting this wrong: `pre-convert/` has no `*.table.md` and no `_schema.md`.
>
> **Windows path gotcha.** Pass **Windows-style** paths to the scripts (`E:/App/src/*.clw`, forward
> slashes fine). Git-Bash/MSYS `/e/...` paths silently fail Python's `glob`/`os.path` — the script
> runs with an empty file set and **no error**.
>
> **Review what was _not_ captured.** Unclassified blocks land in **`pre-convert/_discarded.md`**;
> open it, surface anything real to the developer, and decide before continuing — never silently
> discard. **Re-sync check:** `wxkanban-agent cwconversion --review` compares `pre-convert/` (source)
> against `rebuild/` (generated) and lists what is missing, stale, or orphaned.
>
> If `project.get_command_prompt` is **not available as a tool**, the wxKanban MCP isn't connected to
> your AI client — a setup issue, not billing. Register it and restart: run `/wxAI-project-init`
> (writes `.mcp.json`) or `node scripts/init.mjs`, then restart your AI client and approve the
> `wxkanban` server (Claude Code: `/mcp`). Only an explicit **401 / subscription error** from the
> fetch is a token/subscription problem — re-run `kit-configure` or renew at
> https://wxperts.com/account/billing.

## What this skill produces (summary)

From a Clarion app's text exports plus its hand-coded/generated modules: per-element Markdown under
`pre-convert/` (`*.table.md`, `*.page.md` + `*.controls.md`, `*.report.md`, `*.view.md`, `*.proc.md`,
`_schema.md`, `_project.md`, `index.md`, and `_discarded.md` for review), regenerated
React/Tailwind/shadcn pages under `rebuild/pages/` (embed code wired as handler stubs), a target-DB
schema + Mermaid ER diagram under `rebuild/db/` (with **real FK constraints** when the relation graph
is recovered), and under `rebuild/scopes/` a queries scope (VIEW/browse), a server/business-logic
scope (procedures + embeds + dictionary referential-integrity), and a reports stub. When conversion
is done, hand off to **`/cwConversionScope`** to generate Scope-of-Project documents from the result.

> **Sibling skill:** `wxConversion` does the same job for PCSoft **WinDev/WebDev** apps starting from
> a generated technical-documentation **PDF**. `cwConversion` is the **Clarion** counterpart and
> starts from **raw text source** instead — same `pre-convert/` → `rebuild/` shape, only the parsers
> differ.
